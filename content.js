// let audioContext = null;
// let preGain = null;
// let waveshaper = null;
// let compressor = null;
// let postGain = null;
// let biquad = null;
// let currentVolume = 100;
// let isMuted = false;
// let isNormalized = false;
// const processed = new WeakSet();

// function createDistortionCurve(amount = 0) {
//   const k = typeof amount === 'number' ? amount : 0;
//   const n_samples = 16384;
//   const curve = new Float32Array(n_samples);
//   const deg = Math.PI / 180;
//   if(k <= 0){
//     for (let i = 0; i < n_samples; ++i) curve[i] = i / (n_samples - 1) * 2 - 1;
//     return curve;
//   }
//   for (let i = 0; i < n_samples; ++i) {
//     const x = (i * 2) / n_samples - 1;
//     curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
//   }
//   return curve;
// }

// function ensureProcessing(media){
//   if(processed.has(media)) return;
//   try{
//     media.crossOrigin = media.crossOrigin || 'anonymous';
//     media.volume = 1;
//     // Try direct MediaElementSource first
//     let source = null;
//     try{
//       source = audioContext.createMediaElementSource(media);
//     }catch(e){
//       // Fallback: use captureStream() if available
//       try{
//         const stream = (media.captureStream && media.captureStream()) || (media.mozCaptureStream && media.mozCaptureStream());
//         if(stream){
//           source = audioContext.createMediaStreamSource(stream);
//         }
//       }catch(e2){
//         console.warn('captureStream fallback failed', e2);
//       }
//     }
//     if(source){
//       source.connect(preGain);
//       processed.add(media);
//     } else {
//       console.warn('No audio source for media element', media);
//     }
//   }catch(e){
//     console.error('ensureProcessing failed', e, media);
//   }
// }

// function init(){
//   if(audioContext) return;
//   audioContext = new (window.AudioContext || window.webkitAudioContext)();

//   preGain = audioContext.createGain();
//   waveshaper = audioContext.createWaveShaper();
//   waveshaper.curve = createDistortionCurve(0);
//   waveshaper.oversample = '2x';
//   compressor = audioContext.createDynamicsCompressor();
//   // default compressor settings
//   try{
//     compressor.threshold.setValueAtTime(-6, audioContext.currentTime);
//     compressor.knee.setValueAtTime(3, audioContext.currentTime);
//     compressor.ratio.setValueAtTime(6, audioContext.currentTime);
//     compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
//     compressor.release.setValueAtTime(0.25, audioContext.currentTime);
//   }catch(e){}

//   postGain = audioContext.createGain();
//   postGain.gain.value = 1;

//   preGain.connect(waveshaper);
//   waveshaper.connect(compressor);
//   // insert biquad filter between waveshaper and compressor when present
//   // we'll create biquad and reconnect in handler
//   // for now chain is waveshaper -> compressor
//   compressor.connect(postGain);
//   postGain.connect(audioContext.destination);

//   document.querySelectorAll('audio,video').forEach(ensureProcessing);

//   const mo = new MutationObserver(muts=>{
//     muts.forEach(m=>{
//       m.addedNodes && m.addedNodes.forEach(node=>{
//         if(node.nodeType===1){
//           if(node.tagName==='AUDIO' || node.tagName==='VIDEO') ensureProcessing(node);
//           node.querySelectorAll && node.querySelectorAll('audio,video').forEach(ensureProcessing);
//         }
//       });
//     });
//   });
//   mo.observe(document.documentElement || document.body, {childList:true,subtree:true});
// }

// function setVolume(percent){
//   init();
//   currentVolume = percent;
//   const overall = percent/100;
//   if(preGain) preGain.gain.value = overall;
//   if(postGain) postGain.gain.value = 1;
//   try{
//     const amount = Math.max(0, (overall - 1) * 8);
//     waveshaper.curve = createDistortionCurve(amount);
//   }catch(e){}
//   try{
//     if(compressor){
//       if(overall > 1.0){
//         compressor.threshold.setValueAtTime(-12, audioContext.currentTime);
//         compressor.ratio.setValueAtTime(2, audioContext.currentTime);
//         compressor.attack.setValueAtTime(0.005, audioContext.currentTime);
//         compressor.release.setValueAtTime(0.2, audioContext.currentTime);
//       } else {
//         compressor.threshold.setValueAtTime(-6, audioContext.currentTime);
//         compressor.ratio.setValueAtTime(6, audioContext.currentTime);
//         compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
//         compressor.release.setValueAtTime(0.25, audioContext.currentTime);
//       }
//     }
//   }catch(e){}
//   if(audioContext && audioContext.state === 'suspended'){
//     audioContext.resume().catch(()=>{});
//   }
// }

// chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
//   if(msg.type === 'SET_VOLUME'){
//     setVolume(msg.volume);
//   }
//   if(msg.type === 'GET_VOLUME'){
//     sendResponse({volume: currentVolume, muted: isMuted || (!!postGain && postGain.gain && postGain.gain.value === 0), normalized: isNormalized});
//   }
// });

// // Handle mute, normalize, and preview commands
// chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
//   // ensure audio graph exists and is running so commands take effect
//   init();
//   try{ if(audioContext && audioContext.state === 'suspended') audioContext.resume().catch(()=>{}); }catch(e){}

//   if(msg.type === 'SET_MUTE'){
//     const mute = !!msg.mute;
//     isMuted = mute;
//     if(postGain){
//       if(mute){
//         postGain._saved = postGain.gain.value || 1;
//         postGain.gain.value = 0;
//       } else {
//         postGain.gain.value = postGain._saved || 1;
//       }
//     }
//     document.querySelectorAll('audio,video').forEach(m=>{ try{ m.muted = mute;}catch(e){} });
//     sendResponse({ok:true});
//     return;
//   }
//   if(msg.type === 'SET_NORMALIZE'){
//     const normalize = !!msg.normalize;
//     isNormalized = normalize;
//     if(compressor){
//       if(normalize){
//         compressor.threshold.setValueAtTime(-20, audioContext.currentTime);
//         compressor.ratio.setValueAtTime(4, audioContext.currentTime);
//         compressor.attack.setValueAtTime(0.005, audioContext.currentTime);
//         compressor.release.setValueAtTime(0.2, audioContext.currentTime);
//       } else {
//         compressor.threshold.setValueAtTime(-6, audioContext.currentTime);
//         compressor.ratio.setValueAtTime(6, audioContext.currentTime);
//         compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
//         compressor.release.setValueAtTime(0.25, audioContext.currentTime);
//       }
//     }
//     sendResponse({ok:true});
//     return;
//   }
//   if(msg.type === 'PREVIEW_TONE'){
//     // init already called above
//     try{
//       const osc = audioContext.createOscillator();
//       const oscGain = audioContext.createGain();
//       osc.type = 'sine';
//       osc.frequency.value = 880;
//       oscGain.gain.value = 0.2;
//       osc.connect(oscGain);
//       oscGain.connect(preGain);
//       osc.start();
//       setTimeout(()=>{ try{osc.stop(); osc.disconnect(); oscGain.disconnect();}catch(e){} }, 600);
//       sendResponse({ok:true});
//     }catch(e){ sendResponse({ok:false,error:e.message}); }
//     return;
//   }
//   if(msg.type === 'SET_BIQUAD_FILTER'){
//     // init already called above
//     try{
//       // create biquad if not exists
//       if(!biquad){
//         biquad = audioContext.createBiquadFilter();
//         // reconnect chain: waveshaper -> biquad -> compressor
//         try{ waveshaper.disconnect(); }catch(e){}
//         waveshaper.connect(biquad);
//         biquad.connect(compressor);
//       }
//       biquad.type = msg.algorithm || 'peaking';
//       if(typeof msg.frequency === 'number') biquad.frequency.value = msg.frequency;
//       if(typeof msg.Q === 'number') biquad.Q.value = msg.Q;
//       if(typeof msg.gain === 'number') biquad.gain.value = msg.gain;
//       try{ if(audioContext && audioContext.state === 'suspended') audioContext.resume().catch(()=>{}); }catch(e){}
//       // save per-tab state not handled here (popup persists it)
//       sendResponse({ok:true});
//     }catch(e){ sendResponse({ok:false,error:e.message}); }
//     return;
//   }
// });

// content.js — injected into every tab
// Strategy:
//   1. Try createMediaElementSource (works on most sites)
//   2. If that fails (CORS / already captured), fall back to captureStream()
//   3. Never set crossOrigin on elements we don't own — that breaks authenticated media
//   4. If the background sends us a tabCapture streamId, use that instead (YouTube, Spotify, etc.)

// content.js — injected into every tab

let audioContext = null;
let preGain = null;
let highpass = null;
let presence = null;
let waveshaper = null;
let compressor = null;
let postGain = null;
let tabCaptureSource = null;   // MediaStreamAudioSourceNode from tabCapture (background path)
let currentVolume = 100;
let isMuted = false;
let isNativelyMuted = false;   // 🚨 Tracks the browser's native tab mute button status
let isNormalized = false;
const processed = new WeakSet();

function createDistortionCurve(amount = 0) {
  const n_samples = 16384;
  const curve = new Float32Array(n_samples);
  if (amount <= 0) {
    for (let i = 0; i < n_samples; ++i) curve[i] = i / (n_samples - 1) * 2 - 1;
    return curve;
  }
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}

function buildGraph() {
  if (audioContext) return;
  audioContext = new (window.AudioContext || window.webkitAudioContext)();

  preGain = audioContext.createGain();
  preGain.gain.value = 1;

  highpass = audioContext.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 80;
  highpass.Q.value = 0.7;

  presence = audioContext.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3000;
  presence.Q.value = 1.2;
  presence.gain.value = 4;

  waveshaper = audioContext.createWaveShaper();
  waveshaper.curve = createDistortionCurve(0);
  waveshaper.oversample = '4x';

  compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-18, audioContext.currentTime);
  compressor.knee.setValueAtTime(8, audioContext.currentTime);
  compressor.ratio.setValueAtTime(3, audioContext.currentTime);
  compressor.attack.setValueAtTime(0.010, audioContext.currentTime);
  compressor.release.setValueAtTime(0.15, audioContext.currentTime);

  postGain = audioContext.createGain();
  postGain.gain.value = isNativelyMuted || isMuted ? 0 : 1; // Sync node value on startup

  preGain.connect(highpass);
  highpass.connect(presence);
  presence.connect(waveshaper);
  waveshaper.connect(compressor);
  compressor.connect(postGain);
  
  // Connect cleanly only if the native tab configuration permits it
  if (!isNativelyMuted) {
    postGain.connect(audioContext.destination);
  }
}

function ensureProcessing(media) {
  if (processed.has(media)) return;

  media.volume = 1;

  try {
    const source = audioContext.createMediaElementSource(media);
    source.connect(preGain);
    processed.add(media);
    return;
  } catch (e) {
    // Fall through to captureStream
  }

  try {
    const stream = (media.captureStream && media.captureStream())
                || (media.mozCaptureStream && media.mozCaptureStream());
    if (stream) {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(preGain);
      processed.add(media);
    }
  } catch (e2) {
    console.warn('[VMP] element processing failed, needs tabCapture', e2);
  }
}

function init() {
  buildGraph();
  document.querySelectorAll('audio,video').forEach(ensureProcessing);

  const mo = new MutationObserver(muts => {
    muts.forEach(m => {
      m.addedNodes && m.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO') ensureProcessing(node);
          node.querySelectorAll && node.querySelectorAll('audio,video').forEach(ensureProcessing);
        }
      });
    });
  });
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
}

function setVolume(percent) {
  init();
  currentVolume = percent;
  const overall = percent / 100;
  if (preGain) preGain.gain.value = overall;

  if (presence) {
    const presenceBoost = 4 + Math.max(0, (overall - 1) * 3);
    presence.gain.setTargetAtTime(presenceBoost, audioContext.currentTime, 0.05);
  }
  if (highpass) {
    highpass.frequency.setTargetAtTime(overall > 1.5 ? 100 : 80, audioContext.currentTime, 0.1);
  }
  if (waveshaper) {
    waveshaper.curve = createDistortionCurve(Math.max(0, (overall - 1) * 3));
  }
  if (compressor) {
    if (overall > 1.5) {
      compressor.threshold.setValueAtTime(-24, audioContext.currentTime);
      compressor.ratio.setValueAtTime(4, audioContext.currentTime);
      compressor.attack.setValueAtTime(0.008, audioContext.currentTime);
    } else {
      compressor.threshold.setValueAtTime(-18, audioContext.currentTime);
      compressor.ratio.setValueAtTime(3, audioContext.currentTime);
      compressor.attack.setValueAtTime(0.010, audioContext.currentTime);
    }
  }

  if (audioContext && audioContext.state === 'suspended') audioContext.resume().catch(() => {});
}

function connectTabCaptureStream(streamId) {
  buildGraph();
  if (tabCaptureSource) {
    try { tabCaptureSource.disconnect(); } catch (e) {}
    tabCaptureSource = null;
  }
  try {
    navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    }).then(stream => {
      tabCaptureSource = audioContext.createMediaStreamSource(stream);
      tabCaptureSource.connect(preGain);
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    }).catch(e => console.warn('[VMP] tabCapture getUserMedia failed', e));
  } catch (e) {
    console.warn('[VMP] connectTabCaptureStream failed', e);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SET_VOLUME') { setVolume(msg.volume); return; }
  if (msg.type === 'GET_VOLUME') {
    sendResponse({
      volume: currentVolume,
      muted: isMuted || isNativelyMuted || (!!postGain && postGain.gain.value === 0),
      normalized: isNormalized
    });
    return;
  }
  if (msg.type === 'TAB_CAPTURE_STREAM') {
    connectTabCaptureStream(msg.streamId);
    sendResponse({ ok: true });
    return;
  }

  // 🚨 NATIVE MUTE CAPTURE CORE: Intercepts the system call to split the connection lines
  if (msg.type === 'SET_NATIVE_MUTE') {
    isNativelyMuted = !!msg.mute;
    if (postGain) {
      if (isNativelyMuted) {
        try { postGain.disconnect(audioContext.destination); } catch(e) {}
        postGain.gain.value = 0;
      } else {
        if (!isMuted) {
          postGain.gain.value = postGain._saved || 1;
          try { postGain.connect(audioContext.destination); } catch(e) {}
        }
      }
    }
    sendResponse({ ok: true });
    return;
  }

  init();
  if (audioContext && audioContext.state === 'suspended') audioContext.resume().catch(() => {});

  if (msg.type === 'SET_MUTE') {
    isMuted = !!msg.mute;
    if (postGain) {
      if (isMuted) { 
        postGain._saved = postGain.gain.value || 1; 
        postGain.gain.value = 0; 
        try { postGain.disconnect(audioContext.destination); } catch(e) {}
      } else { 
        if (!isNativelyMuted) {
          postGain.gain.value = postGain._saved || 1; 
          try { postGain.connect(audioContext.destination); } catch(e) {}
        }
      }
    }
    document.querySelectorAll('audio,video').forEach(m => { try { m.muted = isMuted; } catch (e) {} });
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'SET_NORMALIZE') {
    isNormalized = !!msg.normalize;
    if (compressor) {
      if (isNormalized) {
        compressor.threshold.setValueAtTime(-24, audioContext.currentTime);
        compressor.ratio.setValueAtTime(5, audioContext.currentTime);
        compressor.attack.setValueAtTime(0.008, audioContext.currentTime);
        compressor.release.setValueAtTime(0.15, audioContext.currentTime);
        if (presence) presence.gain.setTargetAtTime(5, audioContext.currentTime, 0.05);
      } else {
        compressor.threshold.setValueAtTime(-18, audioContext.currentTime);
        compressor.ratio.setValueAtTime(3, audioContext.currentTime);
        compressor.attack.setValueAtTime(0.010, audioContext.currentTime);
        compressor.release.setValueAtTime(0.15, audioContext.currentTime);
        if (presence) presence.gain.setTargetAtTime(4, audioContext.currentTime, 0.05);
      }
    }
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'PREVIEW_TONE') {
    try {
      const osc = audioContext.createOscillator();
      const oscGain = audioContext.createGain();
      osc.type = 'sine'; osc.frequency.value = 880; oscGain.gain.value = 0.2;
      osc.connect(oscGain); oscGain.connect(preGain); osc.start();
      setTimeout(() => { try { osc.stop(); osc.disconnect(); oscGain.disconnect(); } catch (e) {} }, 600);
      sendResponse({ ok: true });
    } catch (e) { sendResponse({ ok: false, error: e.message }); }
    return;
  }
  if (msg.type === 'SET_BIQUAD_FILTER') {
    try {
      let userEQ = audioContext._userEQ;
      if (!userEQ) {
        userEQ = audioContext.createBiquadFilter();
        audioContext._userEQ = userEQ;
        try { highpass.disconnect(); } catch (e) {}
        highpass.connect(userEQ);
        userEQ.connect(presence);
      }
      userEQ.type = msg.algorithm || 'peaking';
      if (typeof msg.frequency === 'number') userEQ.frequency.value = msg.frequency;
      if (typeof msg.Q === 'number') userEQ.Q.value = msg.Q;
      if (typeof msg.gain === 'number') userEQ.gain.value = msg.gain;
      sendResponse({ ok: true });
    } catch (e) { sendResponse({ ok: false, error: e.message }); }
    return;
  }
});