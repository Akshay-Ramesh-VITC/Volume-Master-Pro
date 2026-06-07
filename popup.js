const slider = document.getElementById("slider");
const value = document.getElementById("value");
const raw = document.getElementById("raw");
const inc = document.getElementById("inc");
const dec = document.getElementById("dec");
const reset = document.getElementById("reset");
const muteBtn = document.getElementById('mute');
const normalizeBtn = document.getElementById('normalize');
const previewBtn = document.getElementById('preview');
const autosave = document.getElementById('autosave');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPane = document.getElementById('settingsPane');
const darkModeToggle = document.getElementById('darkModeToggle');
const eqAlgo = document.getElementById('eqAlgo');
const eqFreq = document.getElementById('eqFreq');
const eqQ = document.getElementById('eqQ');
const eqGain = document.getElementById('eqGain');
const eqFreqVal = document.getElementById('eqFreqVal');
const eqQVal = document.getElementById('eqQVal');
const eqGainVal = document.getElementById('eqGainVal');

let currentTabId = null;
let isMuted = false;
let isNormalized = false;

function updateUI(vol){
  value.textContent = vol + "%";
  raw.textContent = (vol/100).toFixed(2) + "×";
}

function sendVolume(vol, tabId){
  const sendTo = tabId || currentTabId;
  if(!sendTo) return;
  chrome.tabs.sendMessage(sendTo,{
    type: "SET_VOLUME",
    volume: Number(vol)
  });
  if(autosave.checked){
    const key = `vol_tab_${sendTo}`;
    const payload = {};
    payload[key] = Number(vol);
    chrome.storage.local.set(payload);
  }
  else {
    const key = `vol_tab_${sendTo}`;
    chrome.storage.local.remove(key);
  }
}

// Load and apply settings for a specific tab id
function loadTabSettings(tabId){
  if(!tabId) return;
  currentTabId = tabId;
  chrome.storage.local.get([
    `vol_tab_${tabId}`,
    `mute_tab_${tabId}`,
    `normalize_tab_${tabId}`
  ], items => {
    const saved = items && items[`vol_tab_${tabId}`];
    const savedMute = items && items[`mute_tab_${tabId}`];
    const savedNormalize = items && items[`normalize_tab_${tabId}`];
    if(typeof saved !== 'undefined'){
      slider.value = saved;
      updateUI(saved);
      sendVolume(saved, tabId);
    }
    if(typeof savedMute !== 'undefined'){
      isMuted = !!savedMute;
      chrome.tabs.sendMessage(tabId,{type:'SET_MUTE',mute:isMuted});
    }
    if(typeof savedNormalize !== 'undefined'){
      isNormalized = !!savedNormalize;
      chrome.tabs.sendMessage(tabId,{type:'SET_NORMALIZE',normalize:isNormalized});
    }
    // if nothing saved for volume/mute/normalize, ask content script
    if(typeof saved === 'undefined' || typeof savedMute === 'undefined' || typeof savedNormalize === 'undefined'){
      chrome.tabs.sendMessage(tabId,{type:"GET_VOLUME"},res=>{
        const vol = res && typeof res.volume !== 'undefined' ? res.volume : 100;
        if(typeof saved === 'undefined'){ slider.value = vol; updateUI(vol); }
        if(typeof savedMute === 'undefined') isMuted = res && res.muted ? res.muted : false;
        if(typeof savedNormalize === 'undefined') isNormalized = res && res.normalized ? res.normalized : false;
        updateButtons();
      });
    } else {
      updateButtons();
    }

    // load EQ for this tab
    chrome.storage.local.get([`eq_tab_${tabId}`], items=>{
      const s = items && items[`eq_tab_${tabId}`];
      if(s){ eqAlgo.value = s.algorithm || eqAlgo.value; eqFreq.value = s.frequency || eqFreq.value; eqQ.value = s.Q || eqQ.value; eqGain.value = s.gain || eqGain.value; eqFreqVal.textContent = eqFreq.value; eqQVal.textContent = eqQ.value; eqGainVal.textContent = eqGain.value; sendEq(); }
    });
  });
}

function populateTabList(){
  const list = document.getElementById('tabList');
  if(!list) return;
  list.innerHTML = '';
  chrome.tabs.query({currentWindow:true}, tabs => {
    // exclude internal/extension pages (chrome-extension://, chrome://, about:, edge://)
    const visibleTabs = tabs.filter(tab => {
      if(!tab.url) return false;
      return /^(https?:)/.test(tab.url);
    });
    visibleTabs.forEach(tab => {
      const item = document.createElement('div');
      item.className = 'tab-item';
      item.dataset.tabId = tab.id;
      const img = document.createElement('img'); img.className='tab-fav'; img.src = tab.favIconUrl || 'icon-48.png'; img.alt = '';
      const title = document.createElement('div'); title.className='tab-title'; title.textContent = tab.title || tab.url || 'Untitled';
      const volSpan = document.createElement('div'); volSpan.className='tab-vol'; volSpan.textContent = '—';
      // fetch saved volume if any
      const key = `vol_tab_${tab.id}`;
      chrome.storage.local.get([key], items=>{ const v = items && items[key]; volSpan.textContent = (typeof v !== 'undefined') ? v + '%' : '—'; });
      item.appendChild(img); item.appendChild(title); item.appendChild(volSpan);
      item.addEventListener('click', ()=>{
        const prev = list.querySelector('.tab-item.selected'); if(prev) prev.classList.remove('selected');
        item.classList.add('selected');
        loadTabSettings(tab.id);
      });
      list.appendChild(item);
      if(tab.active){ item.classList.add('selected'); loadTabSettings(tab.id); }
    });
  });
}

// populate tab list on open
populateTabList();

slider.addEventListener("input",()=>{
  const vol = Number(slider.value);
  updateUI(vol);
  sendVolume(vol);
});

inc.addEventListener("click",()=>{ slider.value = Math.min(600, Number(slider.value)+10); slider.dispatchEvent(new Event('input')); });
dec.addEventListener("click",()=>{ slider.value = Math.max(0, Number(slider.value)-10); slider.dispatchEvent(new Event('input')); });
reset.addEventListener("click",()=>{ slider.value = 100; slider.dispatchEvent(new Event('input')); });

function updateButtons(){
  muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
  normalizeBtn.textContent = isNormalized ? 'Normalized' : 'Normalize';
}

muteBtn.addEventListener('click',()=>{
  isMuted = !isMuted;
  updateButtons();
  if(!currentTabId) return;
  chrome.tabs.sendMessage(currentTabId,{type:'SET_MUTE',mute:isMuted});
  const key = `mute_tab_${currentTabId}`;
  if(autosave.checked){
    const payload = {};
    payload[key] = isMuted;
    chrome.storage.local.set(payload);
  } else {
    chrome.storage.local.remove(key);
  }
});

normalizeBtn.addEventListener('click',()=>{
  isNormalized = !isNormalized;
  updateButtons();
  if(!currentTabId) return;
  chrome.tabs.sendMessage(currentTabId,{type:'SET_NORMALIZE',normalize:isNormalized});
  const key = `normalize_tab_${currentTabId}`;
  if(autosave.checked){
    const payload = {};
    payload[key] = isNormalized;
    chrome.storage.local.set(payload);
  } else {
    chrome.storage.local.remove(key);
  }
});

previewBtn.addEventListener('click',()=>{
  if(!currentTabId) return;
  chrome.tabs.sendMessage(currentTabId,{type:'PREVIEW_TONE'});
});

// Keyboard shortcuts: number keys 0-6 map to 0%-600%, arrows adjust by 10%
document.addEventListener('keydown', (e) => {
  // don't intercept typing in inputs or editable regions
  const tgt = e.target;
  if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;

  const key = e.key;
  // numeric keys 0-6
  if (!isNaN(+key) && key.length === 1) {
    const n = Number(key);
    if (n >= 0 && n <= 6) {
      const vol = n * 100;
      slider.value = vol;
      slider.dispatchEvent(new Event('input'));
      return;
    }
  }

  // arrow keys
  if (['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(key)){
    e.preventDefault();
    let delta = 0;
    if (key === 'ArrowUp' || key === 'ArrowRight') delta = 10;
    if (key === 'ArrowDown' || key === 'ArrowLeft') delta = -10;
    slider.value = Math.min(600, Math.max(0, Number(slider.value) + delta));
    slider.dispatchEvent(new Event('input'));
  }
});

// Settings button toggle
settingsBtn.addEventListener('click', ()=>{
  settingsPane.style.display = settingsPane.style.display === 'none' ? 'block' : 'none';
});

// Dark mode toggle: persist
chrome.storage.local.get('dark_mode', items => {
  const v = items && items['dark_mode'];
  if(v){ document.body.classList.add('dark-mode'); darkModeToggle.checked = true; }
});
darkModeToggle.addEventListener('change', ()=>{
  if(darkModeToggle.checked){ document.body.classList.add('dark-mode'); chrome.storage.local.set({'dark_mode': true}); }
  else { document.body.classList.remove('dark-mode'); chrome.storage.local.set({'dark_mode': false}); }
});

// Equalizer control handlers
function sendEq(){
  if(!currentTabId) return;
  const msg = { type: 'SET_BIQUAD_FILTER', algorithm: eqAlgo.value, frequency: Number(eqFreq.value), Q: Number(eqQ.value), gain: Number(eqGain.value) };
  chrome.tabs.sendMessage(currentTabId, msg);
}
eqFreq.addEventListener('input', ()=>{ eqFreqVal.textContent = eqFreq.value; sendEq(); });
eqQ.addEventListener('input', ()=>{ eqQVal.textContent = eqQ.value; sendEq(); });
eqGain.addEventListener('input', ()=>{ eqGainVal.textContent = eqGain.value; sendEq(); });
eqAlgo.addEventListener('change', sendEq);

// (EQ loading moved to after tab query)

// Persist EQ on change (debounced simple)
let eqTimer = null;
function persistEq(){
  if(!currentTabId) return;
  clearTimeout(eqTimer);
  eqTimer = setTimeout(()=>{
    const key = `eq_tab_${currentTabId}`;
    const payload = {};
    payload[key] = { algorithm: eqAlgo.value, frequency: Number(eqFreq.value), Q: Number(eqQ.value), gain: Number(eqGain.value) };
    chrome.storage.local.set(payload);
  }, 300);
}
eqFreq.addEventListener('input', persistEq);
eqQ.addEventListener('input', persistEq);
eqGain.addEventListener('input', persistEq);
eqAlgo.addEventListener('change', persistEq);