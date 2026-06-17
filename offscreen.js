const audioContexts = {}; // Store audio graphs by tabId
const nativeMutedTabs = new Set(); // Track tabId states that are natively muted

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;

  if (msg.action === 'start-capture') {
    // If the background script tells us it is already pre-muted, track it
    if (msg.nativeMute) {
      nativeMutedTabs.add(msg.tabId);
    } else {
      nativeMutedTabs.delete(msg.tabId);
    }
    
    startCapture(msg.tabId, msg.streamId, msg.volume);
    sendResponse({ok: true});
    return true;
  }

  if (msg.action === 'set-volume') {
    if (audioContexts[msg.tabId]) {
      // Direct raw multiplier (e.g., 300 / 100 = 3x louder)
      audioContexts[msg.tabId].gainNode.gain.value = msg.volume / 100;
    }
    sendResponse({ok: true});
  }

  if (msg.action === 'stop-capture') {
    stopCapture(msg.tabId);
    sendResponse({ok: true});
  }

  // 🚨 NATIVE MUTE OVERRIDE LOGIC
  if (msg.type === 'SET_NATIVE_MUTE') {
    const { tabId, mute } = msg;
    const graph = audioContexts[tabId];

    if (mute) {
      nativeMutedTabs.add(tabId);
      if (graph && graph.isConnected) {
        try {
          graph.gainNode.disconnect(graph.audioCtx.destination);
          graph.isConnected = false;
        } catch (e) {
          console.warn("Error disconnecting offscreen node:", e);
        }
      }
    } else {
      nativeMutedTabs.delete(tabId);
      if (graph && !graph.isConnected) {
        try {
          graph.gainNode.connect(graph.audioCtx.destination);
          graph.isConnected = true;
        } catch (e) {
          console.warn("Error reconnecting offscreen node:", e);
        }
      }
    }
    sendResponse({ok: true});
  }
});

async function startCapture(tabId, streamId, initialVolume) {
  if (audioContexts[tabId]) return;

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

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    
    // Pure Gain multiplier for raw volume boosting
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = initialVolume / 100;

    // Connect graph: Source -> Gain
    source.connect(gainNode);
    
    // Connect to destination ONLY if this specific tab isn't currently muted by the browser
    let isConnected = false;
    if (!nativeMutedTabs.has(tabId)) {
      gainNode.connect(audioCtx.destination);
      isConnected = true;
    }

    // If tab closes, clean up
    stream.getTracks()[0].onended = () => stopCapture(tabId);

    // CRITICAL FIX: Ensure the audio context isn't asleep
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    // Keep track of audioCtx, stream, gainNode, and destination state
    audioContexts[tabId] = { audioCtx, stream, gainNode, isConnected };
  } catch (e) {
    console.error("Failed to capture tab audio:", e);
  }
}

function stopCapture(tabId) {
  if (audioContexts[tabId]) {
    try { audioContexts[tabId].audioCtx.close(); } catch(e) {}
    audioContexts[tabId].stream.getTracks().forEach(t => { try { t.stop(); } catch(e) {} });
    delete audioContexts[tabId];
  }
  nativeMutedTabs.delete(tabId);
}