// background.js - Service Worker for Volume Master Pro

const capturedTabs = new Set();
const tabVolumes = new Map();
let isOffscreenCreating = false;

async function ensureOffscreen() {
  if (!chrome.offscreen || !chrome.offscreen.createDocument) return;
  
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('offscreen.html')]
    });
    if (contexts.length > 0) return;
  } catch (e) {
    // Fallback for older extension APIs
  }

  if (isOffscreenCreating) return;
  isOffscreenCreating = true;

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Capture tab MediaStream for clean volume processing'
    });
  } catch (e) {
    if (!e.message.includes('Only a single offscreen document may be created')) {
      console.warn('[VMP Background] offscreen.createDocument warning:', e.message);
    }
  } finally {
    isOffscreenCreating = false;
  }
}

// Handle native tab mute updates (from browser tab bar)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.mutedInfo !== undefined) {
    const isMuted = changeInfo.mutedInfo.muted;
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'SET_NATIVE_MUTE',
      tabId,
      mute: isMuted
    }).catch(() => {});
  }
});

// Central Router for Extension Communication
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return;

  if (msg.action === 'set-volume') {
    const { tabId, volume } = msg;
    tabVolumes.set(tabId, volume);

    // If already captured by offscreen, update immediately
    if (capturedTabs.has(tabId)) {
      chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'set-volume',
        tabId,
        volume
      }).catch(() => {});
      sendResponse({ ok: true });
      return false;
    }

    // Initialize capture on offscreen document
    ensureOffscreen().then(() => {
      if (!chrome.tabCapture || !chrome.tabCapture.getMediaStreamId) {
        console.warn('[VMP Background] tabCapture API unavailable');
        sendResponse({ ok: false, error: 'tabCapture API unavailable' });
        return;
      }

      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
        if (chrome.runtime.lastError || !streamId) {
          console.warn('[VMP Background] getMediaStreamId failed:', chrome.runtime.lastError?.message);
          sendResponse({ ok: false, error: chrome.runtime.lastError?.message });
          return;
        }

        chrome.tabs.get(tabId, (tab) => {
          const nativeMute = tab && tab.mutedInfo ? tab.mutedInfo.muted : false;
          
          chrome.runtime.sendMessage({
            target: 'offscreen',
            action: 'start-capture',
            tabId,
            streamId,
            volume,
            nativeMute
          }).then(() => {
            capturedTabs.add(tabId);
          }).catch((err) => {
            console.warn('[VMP Background] start-capture message failed:', err);
          });
        });
      });
    });

    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'get-volume') {
    const { tabId } = msg;
    const cachedVol = tabVolumes.get(tabId);

    if (cachedVol !== undefined) {
      sendResponse({ volume: cachedVol });
      return false;
    }

    chrome.storage.local.get([`vol_tab_${tabId}`], (items) => {
      const savedVol = items[`vol_tab_${tabId}`] || 100;
      tabVolumes.set(tabId, savedVol);
      sendResponse({ volume: savedVol });
    });
    return true;
  }

  if (msg.action === 'set-eq') {
    const { tabId, algorithm, frequency, q, gain } = msg;
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'set-eq',
      tabId,
      algorithm,
      frequency,
      q,
      gain
    }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'set-noise-suppression') {
    const { tabId, enabled } = msg;
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'set-noise-suppression',
      tabId,
      enabled
    }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'set-mute') {
    const { tabId, mute } = msg;
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'set-mute',
      tabId,
      mute
    }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }
});

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  capturedTabs.delete(tabId);
  tabVolumes.delete(tabId);
  chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'stop-capture',
    tabId
  }).catch(() => {});
});
