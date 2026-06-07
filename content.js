let audioContext = null;
let preGain = null;
let waveshaper = null;
let compressor = null;
let postGain = null;
let biquad = null;
let currentVolume = 100;
let isMuted = false;
let isNormalized = false;
const processed = new WeakSet();

function createDistortionCurve(amount = 0) {
  const k = typeof amount === 'number' ? amount : 0;
  const n_samples = 16384;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  if(k <= 0){
    for (let i = 0; i < n_samples; ++i) curve[i] = i / (n_samples - 1) * 2 - 1;
    return curve;
  }
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function ensureProcessing(media){
  if(processed.has(media)) return;
  try{
    media.crossOrigin = media.crossOrigin || 'anonymous';
    media.volume = 1;
    // Try direct MediaElementSource first
    let source = null;
    try{
      source = audioContext.createMediaElementSource(media);
    }catch(e){
      // Fallback: use captureStream() if available
      try{
        const stream = (media.captureStream && media.captureStream()) || (media.mozCaptureStream && media.mozCaptureStream());
        if(stream){
          source = audioContext.createMediaStreamSource(stream);
        }
      }catch(e2){
        console.warn('captureStream fallback failed', e2);
      }
    }
    if(source){
      source.connect(preGain);
      processed.add(media);
    } else {
      console.warn('No audio source for media element', media);
    }
  }catch(e){
    console.error('ensureProcessing failed', e, media);
  }
}

function init(){
  if(audioContext) return;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();

  preGain = audioContext.createGain();
  waveshaper = audioContext.createWaveShaper();
  waveshaper.curve = createDistortionCurve(0);
  waveshaper.oversample = '2x';
  compressor = audioContext.createDynamicsCompressor();
  // default compressor settings
  try{
    compressor.threshold.setValueAtTime(-6, audioContext.currentTime);
    compressor.knee.setValueAtTime(3, audioContext.currentTime);
    compressor.ratio.setValueAtTime(6, audioContext.currentTime);
    compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
    compressor.release.setValueAtTime(0.25, audioContext.currentTime);
  }catch(e){}

  postGain = audioContext.createGain();
  postGain.gain.value = 1;

  preGain.connect(waveshaper);
  waveshaper.connect(compressor);
  // insert biquad filter between waveshaper and compressor when present
  // we'll create biquad and reconnect in handler
  // for now chain is waveshaper -> compressor
  compressor.connect(postGain);
  postGain.connect(audioContext.destination);

  document.querySelectorAll('audio,video').forEach(ensureProcessing);

  const mo = new MutationObserver(muts=>{
    muts.forEach(m=>{
      m.addedNodes && m.addedNodes.forEach(node=>{
        if(node.nodeType===1){
          if(node.tagName==='AUDIO' || node.tagName==='VIDEO') ensureProcessing(node);
          node.querySelectorAll && node.querySelectorAll('audio,video').forEach(ensureProcessing);
        }
      });
    });
  });
  mo.observe(document.documentElement || document.body, {childList:true,subtree:true});
}

function setVolume(percent){
  init();
  currentVolume = percent;
  const overall = percent/100;
  if(preGain) preGain.gain.value = overall;
  if(postGain) postGain.gain.value = 1;
  try{
    const amount = Math.max(0, (overall - 1) * 8);
    waveshaper.curve = createDistortionCurve(amount);
  }catch(e){}
  try{
    if(compressor){
      if(overall > 1.0){
        compressor.threshold.setValueAtTime(-12, audioContext.currentTime);
        compressor.ratio.setValueAtTime(2, audioContext.currentTime);
        compressor.attack.setValueAtTime(0.005, audioContext.currentTime);
        compressor.release.setValueAtTime(0.2, audioContext.currentTime);
      } else {
        compressor.threshold.setValueAtTime(-6, audioContext.currentTime);
        compressor.ratio.setValueAtTime(6, audioContext.currentTime);
        compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
        compressor.release.setValueAtTime(0.25, audioContext.currentTime);
      }
    }
  }catch(e){}
  if(audioContext && audioContext.state === 'suspended'){
    audioContext.resume().catch(()=>{});
  }
}

chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg.type === 'SET_VOLUME'){
    setVolume(msg.volume);
  }
  if(msg.type === 'GET_VOLUME'){
    sendResponse({volume: currentVolume, muted: isMuted || (!!postGain && postGain.gain && postGain.gain.value === 0), normalized: isNormalized});
  }
});

// Handle mute, normalize, and preview commands
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg.type === 'SET_MUTE'){
    const mute = !!msg.mute;
    isMuted = mute;
    if(postGain){
      if(mute){
        postGain._saved = postGain.gain.value || 1;
        postGain.gain.value = 0;
      } else {
        postGain.gain.value = postGain._saved || 1;
      }
    }
    document.querySelectorAll('audio,video').forEach(m=>{ try{ m.muted = mute;}catch(e){} });
    sendResponse({ok:true});
    return;
  }
  if(msg.type === 'SET_NORMALIZE'){
    const normalize = !!msg.normalize;
    isNormalized = normalize;
    if(compressor){
      if(normalize){
        compressor.threshold.setValueAtTime(-20, audioContext.currentTime);
        compressor.ratio.setValueAtTime(4, audioContext.currentTime);
        compressor.attack.setValueAtTime(0.005, audioContext.currentTime);
        compressor.release.setValueAtTime(0.2, audioContext.currentTime);
      } else {
        compressor.threshold.setValueAtTime(-6, audioContext.currentTime);
        compressor.ratio.setValueAtTime(6, audioContext.currentTime);
        compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
        compressor.release.setValueAtTime(0.25, audioContext.currentTime);
      }
    }
    sendResponse({ok:true});
    return;
  }
  if(msg.type === 'PREVIEW_TONE'){
    init();
    try{
      const osc = audioContext.createOscillator();
      const oscGain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      oscGain.gain.value = 0.2;
      osc.connect(oscGain);
      oscGain.connect(preGain);
      osc.start();
      setTimeout(()=>{ try{osc.stop(); osc.disconnect(); oscGain.disconnect();}catch(e){} }, 600);
      sendResponse({ok:true});
    }catch(e){ sendResponse({ok:false,error:e.message}); }
    return;
  }
  if(msg.type === 'SET_BIQUAD_FILTER'){
    init();
    try{
      // create biquad if not exists
      if(!biquad){
        biquad = audioContext.createBiquadFilter();
        // reconnect chain: waveshaper -> biquad -> compressor
        try{ waveshaper.disconnect(); }catch(e){}
        waveshaper.connect(biquad);
        biquad.connect(compressor);
      }
      biquad.type = msg.algorithm || 'peaking';
      if(typeof msg.frequency === 'number') biquad.frequency.value = msg.frequency;
      if(typeof msg.Q === 'number') biquad.Q.value = msg.Q;
      if(typeof msg.gain === 'number') biquad.gain.value = msg.gain;
      // save per-tab state not handled here (popup persists it)
      sendResponse({ok:true});
    }catch(e){ sendResponse({ok:false,error:e.message}); }
    return;
  }
});