// Background service worker for VolumeMasterPro
// Minimal: supports creating an offscreen document and forwarding popup requests
const TARGET_SERVICE_WORKER = 'service-worker';
const TARGET_OFFSCREEN = 'offscreen-document';
const ACTION_INIT_OFFSCREEN_DOCUMENT = 'init-offscreen-document';
const ACTION_POPUP_GAIN_CHANGE = 'popup-gain-change';
const ACTION_POPUP_BIQUAD_FILTER_CHANGE = 'popup-biquad-filter-change';
const ACTION_TAB_CLOSED = 'tab-closed';

async function hasOffscreenDoc() {
	// modern Chrome exposes chrome.runtime.getContexts
	if ('getContexts' in chrome.runtime) {
		try {
			const url = chrome.runtime.getURL('offscreen.html');
			const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
			return Array.isArray(contexts) && contexts.length > 0;
		} catch (e) {
			return false;
		}
	}
	// fallback: check clients (service worker environment)
	try {
		const all = await clients.matchAll();
		return all.some(c => c.url && c.url.includes('offscreen.html'));
	} catch (e) {
		return false;
	}
}

async function ensureOffscreen() {
	if (!chrome.offscreen || !chrome.offscreen.createDocument) return;
	const exists = await hasOffscreenDoc();
	if (exists) return;
	try {
		await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Capture MediaStream (audio only) for processing' });
	} catch (e) {
		// Not fatal — some platforms or Chrome versions may not support offscreen.
		console.warn('offscreen.createDocument failed:', e && e.message ? e.message : e);
	}
}

// Listen for messages from popup/content to handle offscreen and forwarding
chrome.runtime.onMessage.addListener(async (msg, sender) => {
	try {
		if (!msg || msg.target !== TARGET_SERVICE_WORKER) return;

		if (msg.action === ACTION_INIT_OFFSCREEN_DOCUMENT) {
			await ensureOffscreen();
			return;
		}

		if (msg.action === ACTION_POPUP_GAIN_CHANGE || msg.action === ACTION_POPUP_BIQUAD_FILTER_CHANGE) {
			// Try to obtain a mediaStreamId for the tab (best-effort)
			let mediaStreamId = null;
			try {
				if (chrome.tabCapture && chrome.tabCapture.getMediaStreamId) {
					const res = await chrome.tabCapture.getMediaStreamId({ targetTabId: msg.tabId });
					mediaStreamId = res && res.streamId ? res.streamId : res;
				}
			} catch (e) {
				// ignore
			}

			await ensureOffscreen();
			// Forward the request to the offscreen document/service (if present)
			const forward = {
				action: msg.action,
				target: TARGET_OFFSCREEN,
				tabId: msg.tabId,
				mediaStreamId
			};
			if (msg.volumeValue !== undefined) forward.volumeValue = msg.volumeValue;
			if (msg.algorithm !== undefined) forward.algorithm = msg.algorithm;
			if (msg.frequency !== undefined) forward.frequency = msg.frequency;
			if (msg.q !== undefined) forward.q = msg.q;
			if (msg.gain !== undefined) forward.gain = msg.gain;

			// sendMessage may return a Promise that rejects if no receiver exists
			// handle both promise and callback styles to avoid unhandled rejections
			try {
				const maybePromise = chrome.runtime.sendMessage(forward, (resp) => {
					if (chrome.runtime.lastError) {
						console.warn('Forward to offscreen no receiver (callback):', chrome.runtime.lastError.message);
					}
				});
				if (maybePromise && typeof maybePromise.then === 'function') {
					maybePromise.catch(e => {
						console.warn('Forward to offscreen failed (promise):', e && e.message ? e.message : e);
					});
				}
			} catch (e) {
				console.warn('Forward to offscreen failed (sync):', e && e.message ? e.message : e);
			}
		}
	} catch (outer) {
		console.error('background message handler error', outer);
	}
});

// Notify offscreen when a tab closes
chrome.tabs.onRemoved.addListener(async (tabId) => {
	try {
		await ensureOffscreen();
		// runtime.sendMessage can reject if no receiver exists; handle gracefully
		try {
			const maybePromise = chrome.runtime.sendMessage({ action: ACTION_TAB_CLOSED, target: TARGET_OFFSCREEN, tabId }, (resp) => {
				if (chrome.runtime.lastError) {
					// nothing to do if offscreen isn't present
				}
			});
			if (maybePromise && typeof maybePromise.then === 'function') {
				maybePromise.catch(()=>{});
			}
		} catch (e) {
			// ignore failures
		}
	} catch (e) {
		// ignore
	}
});
