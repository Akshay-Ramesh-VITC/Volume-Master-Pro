// // Background service worker for VolumeMasterPro
// // Minimal: supports creating an offscreen document and forwarding popup requests
// const TARGET_SERVICE_WORKER = 'service-worker';
// const TARGET_OFFSCREEN = 'offscreen-document';
// const ACTION_INIT_OFFSCREEN_DOCUMENT = 'init-offscreen-document';
// const ACTION_POPUP_GAIN_CHANGE = 'popup-gain-change';
// const ACTION_POPUP_BIQUAD_FILTER_CHANGE = 'popup-biquad-filter-change';
// const ACTION_TAB_CLOSED = 'tab-closed';

// async function hasOffscreenDoc() {
// 	// modern Chrome exposes chrome.runtime.getContexts
// 	if ('getContexts' in chrome.runtime) {
// 		try {
// 			const url = chrome.runtime.getURL('offscreen.html');
// 			const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
// 			return Array.isArray(contexts) && contexts.length > 0;
// 		} catch (e) {
// 			return false;
// 		}
// 	}
// 	// fallback: check clients (service worker environment)
// 	try {
// 		const all = await clients.matchAll();
// 		return all.some(c => c.url && c.url.includes('offscreen.html'));
// 	} catch (e) {
// 		return false;
// 	}
// }

// async function ensureOffscreen() {
// 	if (!chrome.offscreen || !chrome.offscreen.createDocument) return;
// 	const exists = await hasOffscreenDoc();
// 	if (exists) return;
// 	try {
// 		await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Capture MediaStream (audio only) for processing' });
// 	} catch (e) {
// 		// Not fatal — some platforms or Chrome versions may not support offscreen.
// 		console.warn('offscreen.createDocument failed:', e && e.message ? e.message : e);
// 	}
// }

// // Listen for messages from popup/content to handle offscreen and forwarding
// chrome.runtime.onMessage.addListener(async (msg, sender) => {
// 	try {
// 		if (!msg || msg.target !== TARGET_SERVICE_WORKER) return;

// 		if (msg.action === ACTION_INIT_OFFSCREEN_DOCUMENT) {
// 			await ensureOffscreen();
// 			return;
// 		}

// 		if (msg.action === ACTION_POPUP_GAIN_CHANGE || msg.action === ACTION_POPUP_BIQUAD_FILTER_CHANGE) {
// 			// Try to obtain a mediaStreamId for the tab (best-effort)
// 			let mediaStreamId = null;
// 			try {
// 				if (chrome.tabCapture && chrome.tabCapture.getMediaStreamId) {
// 					const res = await chrome.tabCapture.getMediaStreamId({ targetTabId: msg.tabId });
// 					mediaStreamId = res && res.streamId ? res.streamId : res;
// 				}
// 			} catch (e) {
// 				// ignore
// 			}

// 			await ensureOffscreen();
// 			// Forward the request to the offscreen document/service (if present)
// 			const forward = {
// 				action: msg.action,
// 				target: TARGET_OFFSCREEN,
// 				tabId: msg.tabId,
// 				mediaStreamId
// 			};
// 			if (msg.volumeValue !== undefined) forward.volumeValue = msg.volumeValue;
// 			if (msg.algorithm !== undefined) forward.algorithm = msg.algorithm;
// 			if (msg.frequency !== undefined) forward.frequency = msg.frequency;
// 			if (msg.q !== undefined) forward.q = msg.q;
// 			if (msg.gain !== undefined) forward.gain = msg.gain;

// 			// sendMessage may return a Promise that rejects if no receiver exists
// 			// handle both promise and callback styles to avoid unhandled rejections
// 			try {
// 				const maybePromise = chrome.runtime.sendMessage(forward, (resp) => {
// 					if (chrome.runtime.lastError) {
// 						console.warn('Forward to offscreen no receiver (callback):', chrome.runtime.lastError.message);
// 					}
// 				});
// 				if (maybePromise && typeof maybePromise.then === 'function') {
// 					maybePromise.catch(e => {
// 						console.warn('Forward to offscreen failed (promise):', e && e.message ? e.message : e);
// 					});
// 				}
// 			} catch (e) {
// 				console.warn('Forward to offscreen failed (sync):', e && e.message ? e.message : e);
// 			}
// 		}
// 	} catch (outer) {
// 		console.error('background message handler error', outer);
// 	}
// });

// // Notify offscreen when a tab closes
// chrome.tabs.onRemoved.addListener(async (tabId) => {
// 	try {
// 		await ensureOffscreen();
// 		// runtime.sendMessage can reject if no receiver exists; handle gracefully
// 		try {
// 			const maybePromise = chrome.runtime.sendMessage({ action: ACTION_TAB_CLOSED, target: TARGET_OFFSCREEN, tabId }, (resp) => {
// 				if (chrome.runtime.lastError) {
// 					// nothing to do if offscreen isn't present
// 				}
// 			});
// 			if (maybePromise && typeof maybePromise.then === 'function') {
// 				maybePromise.catch(()=>{});
// 			}
// 		} catch (e) {
// 			// ignore failures
// 		}
// 	} catch (e) {
// 		// ignore
// 	}
// });
const slider = document.getElementById("slider");
const valueDisplay = document.getElementById("value");
const incBtn = document.getElementById("inc");
const decBtn = document.getElementById("dec");
const resetBtn = document.getElementById("reset");
const autosave = document.getElementById("autosave");
const tabList = document.getElementById("tabList");
const disabledMsg = document.getElementById("disabled-msg");

let currentTabId = null;

// Add any sites that break here (lowercase)
const EXCLUDED_SITES = ["magoosh.com", "netflix.com"]; 

function isExcluded(url) {
  if (!url) return false;
  return EXCLUDED_SITES.some(site => url.toLowerCase().includes(site));
}

function updateUI(vol) {
  valueDisplay.textContent = vol + "%";
  slider.value = vol;
}

function setControlsDisabled(disabled) {
  slider.disabled = disabled;
  incBtn.disabled = disabled;
  decBtn.disabled = disabled;
  resetBtn.disabled = disabled;
  slider.style.opacity = disabled ? '0.5' : '1';
  disabledMsg.style.display = disabled ? 'block' : 'none';
}

function sendVolume(vol, tabId) {
  const sendTo = tabId || currentTabId;
  if (!sendTo) return;

  chrome.runtime.sendMessage({
    action: 'set-volume',
    tabId: sendTo,
    volume: Number(vol)
  });

  if (autosave.checked) {
    chrome.storage.local.set({ [`vol_tab_${sendTo}`]: Number(vol) });
  }

  // Update the volume text visually in the list right away
  const activeVolText = document.querySelector(`.tab-item[data-tab-id="${sendTo}"] .tab-vol`);
  if (activeVolText) {
    activeVolText.textContent = vol + '%';
    activeVolText.style.color = vol > 100 ? '#60a5fa' : '#94a3b8'; // Highlight if boosted
  }
}

function loadTabSettings(tabId) {
  if (!tabId) return;
  currentTabId = tabId;
  
  chrome.tabs.get(tabId, (tab) => {
    if (tab && isExcluded(tab.url)) {
      setControlsDisabled(true);
      updateUI(100);
      return;
    } else {
      setControlsDisabled(false);
    }

    chrome.storage.local.get([`vol_tab_${tabId}`], (items) => {
      let saved = items[`vol_tab_${tabId}`];
      
      chrome.runtime.sendMessage({ action: 'get-volume', tabId }, (res) => {
        const activeVol = res && res.volume !== 100 ? res.volume : saved;
        const volToApply = activeVol || 100;
        
        updateUI(volToApply);
        if (volToApply !== 100) sendVolume(volToApply, tabId);
      });
    });
  });
}

function populateTabList() {
  tabList.innerHTML = '';
  chrome.tabs.query({ currentWindow: true }, tabs => {
    const visibleTabs = tabs.filter(tab => tab.url && /^(https?:)/.test(tab.url));
    
    visibleTabs.forEach(tab => {
      const item = document.createElement('div');
      item.className = 'tab-item';
      item.dataset.tabId = tab.id;
      
      // 1. Add Website Logo (Favicon)
      const img = document.createElement('img');
      img.className = 'tab-fav';
      img.src = tab.favIconUrl || 'icon16.png'; // Fallback to extension icon if none exists
      
      // 2. Add Website Title
      const title = document.createElement('div');
      title.className = 'tab-title';
      title.textContent = tab.title || tab.url;
      
      // 3. Add Volume Indicator
      const volSpan = document.createElement('div');
      volSpan.className = 'tab-vol';
      volSpan.textContent = '100%'; // Default visual
      
      // Query the background script for this specific tab's current volume
      chrome.runtime.sendMessage({ action: 'get-volume', tabId: tab.id }, (res) => {
        if (res && res.volume) {
          volSpan.textContent = res.volume + '%';
          if (res.volume > 100) volSpan.style.color = '#60a5fa'; // Make text blue if boosted
        }
      });
      
      // Append everything to the row
      item.appendChild(img);
      item.appendChild(title);
      item.appendChild(volSpan);
      
      item.addEventListener('click', () => {
        const prev = tabList.querySelector('.tab-item.selected');
        if (prev) prev.classList.remove('selected');
        item.classList.add('selected');
        loadTabSettings(tab.id);
      });
      
      tabList.appendChild(item);
      if (tab.active) {
        item.classList.add('selected');
        loadTabSettings(tab.id);
      }
    });
  });
}

// Event Listeners
slider.addEventListener("input", () => {
  const vol = Number(slider.value);
  updateUI(vol);
  sendVolume(vol);
});

incBtn.addEventListener("click", () => { 
  const newVol = Math.min(600, Number(slider.value) + 10);
  updateUI(newVol); sendVolume(newVol); 
});

decBtn.addEventListener("click", () => { 
  const newVol = Math.max(0, Number(slider.value) - 10);
  updateUI(newVol); sendVolume(newVol); 
});

resetBtn.addEventListener("click", () => { 
  updateUI(100); sendVolume(100); 
});

populateTabList();