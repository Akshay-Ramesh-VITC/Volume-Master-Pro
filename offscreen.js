// offscreen.js - High-Fidelity Audio DSP Engine for Volume Master Pro
// Features: Highpass Sub-bass Filter, Downward Expander Noise Gate (Noise Suppression),
//           Vocal Clarity Filter, Pre-Gain Boost, Dynamic Range Compressor,
//           Brickwall Peak Limiter, 4x Oversampled Soft-Clipper WaveShaper, and EQ.

const audioContexts = {}; // Stores audio graph state by tabId
const nativeMutedTabs = new Set();
const userMutedTabs = new Set();
const noiseSuppressedTabs = new Set(); // Track tabs with active noise suppression

// 1. Generate smooth soft-clipper saturation curve (ArcTan smooth saturation normalized to 0.98 peak)
function createSoftClipCurve(samples = 4096) {
  const curve = new Float32Array(samples);
  const norm = 2 / Math.PI;
  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / (samples - 1) - 1; // Range [-1.0, 1.0]
    curve[i] = Math.atan(x * 1.25) * norm * 0.98;
  }
  return curve;
}

// 2. Generate Downward Expander Noise Gate curve (Suppresses quiet background hiss/hum below -40dB)
function createNoiseGateCurve(samples = 8192, thresholdDb = -40, expansionRatio = 2.5) {
  const curve = new Float32Array(samples);
  const threshold = Math.pow(10, thresholdDb / 20); // Linear amplitude ~0.01

  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / (samples - 1) - 1;
    const absX = Math.abs(x);

    if (absX === 0) {
      curve[i] = 0;
    } else if (absX < threshold) {
      // Downward expansion: attenuate signals below threshold
      const factor = Math.pow(absX / threshold, expansionRatio - 1);
      curve[i] = x * factor;
    } else {
      // Pass-through active speech/main audio cleanly
      curve[i] = x;
    }
  }
  return curve;
}

// 3. Passthrough curve when Noise Suppressor is OFF
function createLinearPassCurve(samples = 4096) {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; ++i) {
    curve[i] = (i * 2) / (samples - 1) - 1;
  }
  return curve;
}

const softClipCurve = createSoftClipCurve(4096);
const noiseGateCurve = createNoiseGateCurve(8192, -40, 2.5);
const linearPassCurve = createLinearPassCurve(4096);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;

  if (msg.action === 'start-capture') {
    if (msg.nativeMute) {
      nativeMutedTabs.add(msg.tabId);
    } else {
      nativeMutedTabs.delete(msg.tabId);
    }
    if (msg.noiseSuppression) {
      noiseSuppressedTabs.add(msg.tabId);
    }

    startCapture(msg.tabId, msg.streamId, msg.volume || 100);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'set-volume') {
    setTabVolume(msg.tabId, msg.volume);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'set-noise-suppression') {
    if (msg.enabled) {
      noiseSuppressedTabs.add(msg.tabId);
    } else {
      noiseSuppressedTabs.delete(msg.tabId);
    }
    applyNoiseSuppression(msg.tabId, msg.enabled);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'set-eq') {
    setTabEq(msg.tabId, msg.algorithm, msg.frequency, msg.q, msg.gain);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'set-mute') {
    if (msg.mute) {
      userMutedTabs.add(msg.tabId);
    } else {
      userMutedTabs.delete(msg.tabId);
    }
    updateMuteState(msg.tabId);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'stop-capture') {
    stopCapture(msg.tabId);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'SET_NATIVE_MUTE') {
    if (msg.mute) {
      nativeMutedTabs.add(msg.tabId);
    } else {
      nativeMutedTabs.delete(msg.tabId);
    }
    updateMuteState(msg.tabId);
    sendResponse({ ok: true });
    return true;
  }
});

async function startCapture(tabId, streamId, initialVolume) {
  if (audioContexts[tabId]) {
    setTabVolume(tabId, initialVolume);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);

    // Node 1: Sub-bass Highpass Filter (Cuts sub-45Hz rumble & mic pops)
    const highpassNode = audioCtx.createBiquadFilter();
    highpassNode.type = 'highpass';
    highpassNode.frequency.value = 45;
    highpassNode.Q.value = 0.707;

    // Node 2: High-frequency Lowpass Hiss Filter (Cuts ultra-high electronic hiss > 11kHz when active)
    const lowpassNoiseNode = audioCtx.createBiquadFilter();
    lowpassNoiseNode.type = 'lowpass';
    lowpassNoiseNode.frequency.value = noiseSuppressedTabs.has(tabId) ? 11000 : 20000;
    lowpassNoiseNode.Q.value = 0.707;

    // Node 3: Vocal Intelligibility Boost Filter (+2.5dB at 1.8kHz for crisp speech clarity)
    const speechFilterNode = audioCtx.createBiquadFilter();
    speechFilterNode.type = 'peaking';
    speechFilterNode.frequency.value = 1800;
    speechFilterNode.Q.value = 1.0;
    speechFilterNode.gain.value = noiseSuppressedTabs.has(tabId) ? 2.5 : 0;

    // Node 4: Downward Expander Noise Gate (Attenuates quiet background noise)
    const noiseGateNode = audioCtx.createWaveShaper();
    noiseGateNode.curve = noiseSuppressedTabs.has(tabId) ? noiseGateCurve : linearPassCurve;

    // Node 5: Primary Boost Gain Node (Scales volume from 0% to 600%)
    const gainNode = audioCtx.createGain();
    const targetGain = initialVolume / 100;
    gainNode.gain.setValueAtTime(targetGain, audioCtx.currentTime);

    // Node 6: Custom Parametric Equalizer Node (BiquadFilter)
    const eqNode = audioCtx.createBiquadFilter();
    eqNode.type = 'peaking';
    eqNode.frequency.value = 1000;
    eqNode.Q.value = 1.0;
    eqNode.gain.value = 0;

    // Node 7: Gentle Dynamic Range Smoother (Provides subtle smoothing without squashing volume boost)
    const compNode = audioCtx.createDynamicsCompressor();
    applyCompressorSettings(compNode, audioCtx, initialVolume);

    // Node 8: 4x Oversampled Soft-Clipper WaveShaper (Prevents hard DAC clipping while allowing 600% loudness)
    const waveShaperNode = audioCtx.createWaveShaper();
    waveShaperNode.curve = softClipCurve;
    waveShaperNode.oversample = '4x';

    // Node 9: Master Mute Gate Node
    const muteNode = audioCtx.createGain();
    const isMuted = nativeMutedTabs.has(tabId) || userMutedTabs.has(tabId);
    muteNode.gain.setValueAtTime(isMuted ? 0 : 1, audioCtx.currentTime);

    // Audio Graph Pipeline:
    // Source -> Highpass (45Hz) -> LowpassNoise -> SpeechFilter -> NoiseGate -> Gain -> EQ -> Comp -> SoftClipper -> Mute -> Destination
    source.connect(highpassNode);
    highpassNode.connect(lowpassNoiseNode);
    lowpassNoiseNode.connect(speechFilterNode);
    speechFilterNode.connect(noiseGateNode);
    noiseGateNode.connect(gainNode);
    gainNode.connect(eqNode);
    eqNode.connect(compNode);
    compNode.connect(waveShaperNode);
    waveShaperNode.connect(muteNode);
    muteNode.connect(audioCtx.destination);

    // Handle track closure/cleanup when tab closes
    if (stream.getAudioTracks().length > 0) {
      stream.getAudioTracks()[0].onended = () => stopCapture(tabId);
    }

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    audioContexts[tabId] = {
      audioCtx,
      stream,
      highpassNode,
      lowpassNoiseNode,
      speechFilterNode,
      noiseGateNode,
      gainNode,
      eqNode,
      compNode,
      waveShaperNode,
      muteNode
    };
  } catch (e) {
    console.error('[VMP Offscreen] Failed to start tab capture:', e);
  }
}

function applyNoiseSuppression(tabId, enabled) {
  const graph = audioContexts[tabId];
  if (!graph) return;

  const now = graph.audioCtx.currentTime;
  if (enabled) {
    graph.noiseGateNode.curve = noiseGateCurve;
    graph.lowpassNoiseNode.frequency.setTargetAtTime(11000, now, 0.015);
    graph.speechFilterNode.gain.setTargetAtTime(2.5, now, 0.015);
  } else {
    graph.noiseGateNode.curve = linearPassCurve;
    graph.lowpassNoiseNode.frequency.setTargetAtTime(20000, now, 0.015);
    graph.speechFilterNode.gain.setTargetAtTime(0, now, 0.015);
  }
}

function applyCompressorSettings(compNode, audioCtx, volumePercent) {
  // Gentle 1.5:1 ratio and high threshold so volume boost is fully realized without squashing
  compNode.threshold.setTargetAtTime(-3, audioCtx.currentTime, 0.015);
  compNode.knee.setTargetAtTime(6, audioCtx.currentTime, 0.015);
  compNode.ratio.setTargetAtTime(1.5, audioCtx.currentTime, 0.015);
  compNode.attack.setTargetAtTime(0.010, audioCtx.currentTime, 0.015);
  compNode.release.setTargetAtTime(0.20, audioCtx.currentTime, 0.015);
}


function setTabVolume(tabId, volumePercent) {
  const graph = audioContexts[tabId];
  if (!graph) return;

  const targetGain = volumePercent / 100;
  graph.gainNode.gain.setTargetAtTime(targetGain, graph.audioCtx.currentTime, 0.015);
  applyCompressorSettings(graph.compNode, graph.audioCtx, volumePercent);

  if (graph.audioCtx.state === 'suspended') {
    graph.audioCtx.resume().catch(() => {});
  }
}

function setTabEq(tabId, algorithm, frequency, q, gain) {
  const graph = audioContexts[tabId];
  if (!graph) return;

  if (algorithm) graph.eqNode.type = algorithm;
  if (typeof frequency === 'number' && frequency > 0) {
    graph.eqNode.frequency.setTargetAtTime(frequency, graph.audioCtx.currentTime, 0.015);
  }
  if (typeof q === 'number') {
    graph.eqNode.Q.setTargetAtTime(q, graph.audioCtx.currentTime, 0.015);
  }
  if (typeof gain === 'number') {
    graph.eqNode.gain.setTargetAtTime(gain, graph.audioCtx.currentTime, 0.015);
  }
}

function updateMuteState(tabId) {
  const graph = audioContexts[tabId];
  if (!graph) return;

  const shouldBeMuted = nativeMutedTabs.has(tabId) || userMutedTabs.has(tabId);
  graph.muteNode.gain.setTargetAtTime(shouldBeMuted ? 0 : 1, graph.audioCtx.currentTime, 0.015);
}

function stopCapture(tabId) {
  if (audioContexts[tabId]) {
    try {
      audioContexts[tabId].stream.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
      audioContexts[tabId].audioCtx.close();
    } catch (e) {}
    delete audioContexts[tabId];
  }
  nativeMutedTabs.delete(tabId);
  userMutedTabs.delete(tabId);
  noiseSuppressedTabs.delete(tabId);
}