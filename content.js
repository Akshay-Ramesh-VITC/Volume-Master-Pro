// content.js - Volume Master Pro Content Helper
// Note: Audio processing is safely offloaded to offscreen.js via tabCapture,
// avoiding CORS restrictions, media element silencing, or video breakage on Brave and Chrome.

// Maintain communication channel for status check
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ active: true });
    return true;
  }
});