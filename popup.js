// const slider = document.getElementById("slider");
// const value = document.getElementById("value");
// const raw = document.getElementById("raw");
// const inc = document.getElementById("inc");
// const dec = document.getElementById("dec");
// const reset = document.getElementById("reset");
// const muteBtn = document.getElementById('mute');
// const normalizeBtn = document.getElementById('normalize');
// const previewBtn = document.getElementById('preview');
// const autosave = document.getElementById('autosave');
// const settingsBtn = document.getElementById('settingsBtn');
// const settingsPane = document.getElementById('settingsPane');
// const darkModeToggle = document.getElementById('darkModeToggle');
// const eqAlgo = document.getElementById('eqAlgo');
// const eqFreq = document.getElementById('eqFreq');
// const eqQ = document.getElementById('eqQ');
// const eqGain = document.getElementById('eqGain');
// const eqFreqVal = document.getElementById('eqFreqVal');
// const eqQVal = document.getElementById('eqQVal');
// const eqGainVal = document.getElementById('eqGainVal');

// let currentTabId = null;
// let isMuted = false;
// let isNormalized = false;
// let currentDomain = null;

// function updateUI(vol){
//   value.textContent = vol + "%";
//   raw.textContent = (vol/100).toFixed(2) + "×";
// }

// // Helper to send messages to a tab safely (handles missing receiver)
// function safeSendMessage(tabId, message, cb){
//   try{
//     chrome.tabs.sendMessage(tabId, message, res => {
//       if(chrome.runtime.lastError){
//         const errMsg = chrome.runtime.lastError.message || '';
//         // If no receiver exists, try injecting the content script (for pages where it wasn't present)
//         if(errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')){
//           // ensure we only inject into http(s) pages
//           chrome.tabs.get(tabId, tab => {
//             const url = tab && tab.url ? tab.url : '';
//             if(!/^(https?:)/.test(url)){
//               if(cb) cb(null, chrome.runtime.lastError);
//               return;
//             }
//             // attempt to (re)inject content script
//             try{
//               chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).then(()=>{
//                 // retry sending message once
//                 chrome.tabs.sendMessage(tabId, message, res2 => {
//                   if(chrome.runtime.lastError){ if(cb) cb(null, chrome.runtime.lastError); return; }
//                   if(cb) cb(res2);
//                 });
//               }).catch(injectErr => { if(cb) cb(null, injectErr); });
//             }catch(injectSyncErr){ if(cb) cb(null, injectSyncErr); }
//           });
//           return;
//         }
//         if(cb) cb(null, chrome.runtime.lastError);
//         return;
//       }
//       if(cb) cb(res);
//     });
//   } catch(e){
//     if(cb) cb(null, e);
//   }
// }

// function sendVolume(vol, tabId){
//   const sendTo = tabId || currentTabId;
//   if(!sendTo) return;
//   safeSendMessage(sendTo,{
//     type: "SET_VOLUME",
//     volume: Number(vol)
//   });
//   if(autosave.checked){
//     // prefer saving by domain so settings persist across tab ids
//     chrome.tabs.get(sendTo, tab => {
//       try{
//         const hostname = tab && tab.url ? new URL(tab.url).hostname : null;
//         const key = hostname ? `vol_domain_${hostname}` : `vol_tab_${sendTo}`;
//         const payload = {};
//         payload[key] = Number(vol);
//         chrome.storage.local.set(payload);
//       } catch(e){
//         const key = `vol_tab_${sendTo}`;
//         const payload = {};
//         payload[key] = Number(vol);
//         chrome.storage.local.set(payload);
//       }
//     });
//   }
//   else {
//     // remove domain key if possible, fall back to tab key
//     chrome.tabs.get(sendTo, tab => {
//       try{
//         const hostname = tab && tab.url ? new URL(tab.url).hostname : null;
//         const key = hostname ? `vol_domain_${hostname}` : `vol_tab_${sendTo}`;
//         chrome.storage.local.remove(key);
//       } catch(e){
//         const key = `vol_tab_${sendTo}`;
//         chrome.storage.local.remove(key);
//       }
//     });
//   }
// }

// // Load and apply settings for a specific tab id
// function loadTabSettings(tabId){
//   if(!tabId) return;
//   currentTabId = tabId;
//   // get tab URL to derive domain key, but fall back to existing tab-based keys
//   chrome.tabs.get(tabId, tab => {
//     let hostname = null;
//     try{ hostname = tab && tab.url ? new URL(tab.url).hostname : null; } catch(e){ hostname = null; }
//     currentDomain = hostname;
//     const domainVolKey = hostname ? `vol_domain_${hostname}` : null;
//     const domainMuteKey = hostname ? `mute_domain_${hostname}` : null;
//     const domainNormalizeKey = hostname ? `normalize_domain_${hostname}` : null;
//     const tabVolKey = `vol_tab_${tabId}`;
//     const tabMuteKey = `mute_tab_${tabId}`;
//     const tabNormalizeKey = `normalize_tab_${tabId}`;

//     const keys = [domainVolKey, tabVolKey, domainMuteKey, tabMuteKey, domainNormalizeKey, tabNormalizeKey].filter(Boolean);
//     chrome.storage.local.get(keys, items => {
//       // prefer domain values over tab-specific values
//       const saved = hostname && items[`vol_domain_${hostname}`] !== undefined ? items[`vol_domain_${hostname}`] : items[tabVolKey];
//       const savedMute = hostname && items[`mute_domain_${hostname}`] !== undefined ? items[`mute_domain_${hostname}`] : items[tabMuteKey];
//       const savedNormalize = hostname && items[`normalize_domain_${hostname}`] !== undefined ? items[`normalize_domain_${hostname}`] : items[tabNormalizeKey];

//       if(typeof saved !== 'undefined'){
//         slider.value = saved;
//         updateUI(saved);
//         sendVolume(saved, tabId);
//       }
//       if(typeof savedMute !== 'undefined'){
//         isMuted = !!savedMute;
//         safeSendMessage(tabId,{type:'SET_MUTE',mute:isMuted});
//       }
//       if(typeof savedNormalize !== 'undefined'){
//         isNormalized = !!savedNormalize;
//         safeSendMessage(tabId,{type:'SET_NORMALIZE',normalize:isNormalized});
//       }

//       // if nothing saved for volume/mute/normalize, ask content script
//       if(typeof saved === 'undefined' || typeof savedMute === 'undefined' || typeof savedNormalize === 'undefined'){
//         safeSendMessage(tabId,{type:"GET_VOLUME"},(res, err)=>{
//           const vol = res && typeof res.volume !== 'undefined' ? res.volume : 100;
//           if(typeof saved === 'undefined'){ slider.value = vol; updateUI(vol); }
//           if(typeof savedMute === 'undefined') isMuted = res && res.muted ? res.muted : false;
//           if(typeof savedNormalize === 'undefined') isNormalized = res && res.normalized ? res.normalized : false;
//           updateButtons();
//         });
//       } else {
//         updateButtons();
//       }

//       // load EQ for this tab (unchanged)
//       chrome.storage.local.get([`eq_tab_${tabId}`], items2=>{
//         const s = items2 && items2[`eq_tab_${tabId}`];
//         if(s){ eqAlgo.value = s.algorithm || eqAlgo.value; eqFreq.value = s.frequency || eqFreq.value; eqQ.value = s.Q || eqQ.value; eqGain.value = s.gain || eqGain.value; eqFreqVal.textContent = eqFreq.value; eqQVal.textContent = eqQ.value; eqGainVal.textContent = eqGain.value; sendEq(); }
//       });
//     });
//   });
// }

// function populateTabList(){
//   const list = document.getElementById('tabList');
//   if(!list) return;
//   list.innerHTML = '';
//   chrome.tabs.query({currentWindow:true}, tabs => {
//     // exclude internal/extension pages (chrome-extension://, chrome://, about:, edge://)
//     const visibleTabs = tabs.filter(tab => {
//       if(!tab.url) return false;
//       return /^(https?:)/.test(tab.url);
//     });
//     visibleTabs.forEach(tab => {
//       const item = document.createElement('div');
//       item.className = 'tab-item';
//       item.dataset.tabId = tab.id;
//       const img = document.createElement('img'); img.className='tab-fav'; img.src = tab.favIconUrl || 'icon48.png'; img.alt = '';
//       const title = document.createElement('div'); title.className='tab-title'; title.textContent = tab.title || tab.url || 'Untitled';
//       const volSpan = document.createElement('div'); volSpan.className='tab-vol'; volSpan.textContent = '—';
//       // fetch saved volume if any (prefer domain-saved value)
//       try{
//         const hostname = tab && tab.url ? new URL(tab.url).hostname : null;
//         const domainKey = hostname ? `vol_domain_${hostname}` : null;
//         const tabKey = `vol_tab_${tab.id}`;
//         const keys = [domainKey, tabKey].filter(Boolean);
//         chrome.storage.local.get(keys, items=>{
//           const v = (hostname && items[domainKey] !== undefined) ? items[domainKey] : items[tabKey];
//           volSpan.textContent = (typeof v !== 'undefined') ? v + '%' : '—';
//         });
//       } catch(e){
//         const key = `vol_tab_${tab.id}`;
//         chrome.storage.local.get([key], items=>{ const v = items && items[key]; volSpan.textContent = (typeof v !== 'undefined') ? v + '%' : '—'; });
//       }
//       item.appendChild(img); item.appendChild(title); item.appendChild(volSpan);
//       item.addEventListener('click', ()=>{
//         const prev = list.querySelector('.tab-item.selected'); if(prev) prev.classList.remove('selected');
//         item.classList.add('selected');
//         loadTabSettings(tab.id);
//       });
//       list.appendChild(item);
//       if(tab.active){ item.classList.add('selected'); loadTabSettings(tab.id); }
//     });
//   });
// }

// // populate tab list on open
// populateTabList();

// slider.addEventListener("input",()=>{
//   const vol = Number(slider.value);
//   updateUI(vol);
//   sendVolume(vol);
// });

// inc.addEventListener("click",()=>{ slider.value = Math.min(600, Number(slider.value)+10); slider.dispatchEvent(new Event('input')); });
// dec.addEventListener("click",()=>{ slider.value = Math.max(0, Number(slider.value)-10); slider.dispatchEvent(new Event('input')); });
// reset.addEventListener("click",()=>{ slider.value = 100; slider.dispatchEvent(new Event('input')); });

// function updateButtons(){
//   muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
//   normalizeBtn.textContent = isNormalized ? 'Normalized' : 'Normalize';
// }

// muteBtn.addEventListener('click',()=>{
//   isMuted = !isMuted;
//   updateButtons();
//   if(!currentTabId) return;
//   safeSendMessage(currentTabId,{type:'SET_MUTE',mute:isMuted});
//   // save by domain when possible so mute persists across tab ids
//   const saveKey = currentDomain ? `mute_domain_${currentDomain}` : `mute_tab_${currentTabId}`;
//   if(autosave.checked){
//     const payload = {};
//     payload[saveKey] = isMuted;
//     chrome.storage.local.set(payload);
//   } else {
//     chrome.storage.local.remove(saveKey);
//   }
// });

// normalizeBtn.addEventListener('click',()=>{
//   isNormalized = !isNormalized;
//   updateButtons();
//   if(!currentTabId) return;
//   safeSendMessage(currentTabId,{type:'SET_NORMALIZE',normalize:isNormalized});
//   const saveKey = currentDomain ? `normalize_domain_${currentDomain}` : `normalize_tab_${currentTabId}`;
//   if(autosave.checked){
//     const payload = {};
//     payload[saveKey] = isNormalized;
//     chrome.storage.local.set(payload);
//   } else {
//     chrome.storage.local.remove(saveKey);
//   }
// });

// previewBtn.addEventListener('click',()=>{
//   if(!currentTabId) return;
//   safeSendMessage(currentTabId,{type:'PREVIEW_TONE'});
// });

// // Keyboard shortcuts: number keys 0-6 map to 0%-600%, arrows adjust by 10%
// document.addEventListener('keydown', (e) => {
//   // don't intercept typing in inputs or editable regions
//   const tgt = e.target;
//   if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;

//   const key = e.key;
//   // numeric keys 0-6
//   if (!isNaN(+key) && key.length === 1) {
//     const n = Number(key);
//     if (n >= 0 && n <= 6) {
//       const vol = n * 100;
//       slider.value = vol;
//       slider.dispatchEvent(new Event('input'));
//       return;
//     }
//   }

//   // arrow keys
//   if (['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(key)){
//     e.preventDefault();
//     let delta = 0;
//     if (key === 'ArrowUp' || key === 'ArrowRight') delta = 10;
//     if (key === 'ArrowDown' || key === 'ArrowLeft') delta = -10;
//     slider.value = Math.min(600, Math.max(0, Number(slider.value) + delta));
//     slider.dispatchEvent(new Event('input'));
//   }
// });

// // Settings button toggle
// settingsBtn.addEventListener('click', ()=>{
//   settingsPane.style.display = settingsPane.style.display === 'none' ? 'block' : 'none';
// });

// // Dark mode toggle: persist
// chrome.storage.local.get('dark_mode', items => {
//   const v = items && items['dark_mode'];
//   if(v){ document.body.classList.add('dark-mode'); darkModeToggle.checked = true; }
// });
// darkModeToggle.addEventListener('change', ()=>{
//   if(darkModeToggle.checked){ document.body.classList.add('dark-mode'); chrome.storage.local.set({'dark_mode': true}); }
//   else { document.body.classList.remove('dark-mode'); chrome.storage.local.set({'dark_mode': false}); }
// });

// // Equalizer control handlers
// function sendEq(){
//   if(!currentTabId) return;
//   const msg = { type: 'SET_BIQUAD_FILTER', algorithm: eqAlgo.value, frequency: Number(eqFreq.value), Q: Number(eqQ.value), gain: Number(eqGain.value) };
//   safeSendMessage(currentTabId, msg);
// }
// eqFreq.addEventListener('input', ()=>{ eqFreqVal.textContent = eqFreq.value; sendEq(); });
// eqQ.addEventListener('input', ()=>{ eqQVal.textContent = eqQ.value; sendEq(); });
// eqGain.addEventListener('input', ()=>{ eqGainVal.textContent = eqGain.value; sendEq(); });
// eqAlgo.addEventListener('change', sendEq);

// // (EQ loading moved to after tab query)

// // Persist EQ on change (debounced simple)
// let eqTimer = null;
// function persistEq(){
//   if(!currentTabId) return;
//   clearTimeout(eqTimer);
//   eqTimer = setTimeout(()=>{
//     const key = `eq_tab_${currentTabId}`;
//     const payload = {};
//     payload[key] = { algorithm: eqAlgo.value, frequency: Number(eqFreq.value), Q: Number(eqQ.value), gain: Number(eqGain.value) };
//     chrome.storage.local.set(payload);
//   }, 300);
// }
// eqFreq.addEventListener('input', persistEq);
// eqQ.addEventListener('input', persistEq);
// eqGain.addEventListener('input', persistEq);
// eqAlgo.addEventListener('change', persistEq);

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