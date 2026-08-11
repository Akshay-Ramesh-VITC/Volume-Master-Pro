// popup.js - Volume Master Pro Interface Controller

const slider = document.getElementById("volumeSlider");
const valueDisplay = document.getElementById("valueDisplay");
const statusBadge = document.getElementById("statusBadge");
const incBtn = document.getElementById("incBtn");
const decBtn = document.getElementById("decBtn");
const muteBtn = document.getElementById("muteBtn");
const resetBtn = document.getElementById("resetBtn");
const autosave = document.getElementById("autosave");
const tabList = document.getElementById("tabList");
const presetBtns = document.querySelectorAll(".preset-btn");

// EQ elements
const eqToggle = document.getElementById("eqToggle");
const eqArrow = document.getElementById("eqArrow");
const eqPanel = document.getElementById("eqPanel");
const eqAlgo = document.getElementById("eqAlgo");
const eqFreq = document.getElementById("eqFreq");
const eqQ = document.getElementById("eqQ");
const eqGain = document.getElementById("eqGain");
const eqFreqVal = document.getElementById("eqFreqVal");
const eqQVal = document.getElementById("eqQVal");
const eqGainVal = document.getElementById("eqGainVal");

const noiseBtn = document.getElementById("noiseBtn");

let currentTabId = null;
let isMuted = false;
let isNoiseSuppressed = true;

function sendNoiseSuppression(enabled) {
  if (!currentTabId) return;
  chrome.runtime.sendMessage({
    action: "set-noise-suppression",
    tabId: currentTabId,
    enabled: enabled
  });
}

function updateUI(vol) {
  valueDisplay.textContent = vol + "%";
  slider.value = vol;

  // Update preset button active states
  presetBtns.forEach(btn => {
    const btnVol = Number(btn.getAttribute("data-vol"));
    btn.classList.toggle("active", btnVol === vol);
  });

  if (isMuted) {
    statusBadge.textContent = "🔇 Muted";
    statusBadge.style.color = "#f87171";
  } else if (vol > 100) {
    statusBadge.textContent = `✦ Boosted (${(vol / 100).toFixed(1)}x) • Peak Limiter ${isNoiseSuppressed ? '+ Noise Gate ' : ''}Active`;
    statusBadge.style.color = "#60a5fa";
  } else {
    statusBadge.textContent = `✦ Studio Limiter ${isNoiseSuppressed ? '+ Noise Gate ' : ''}Active`;
    statusBadge.style.color = "#94a3b8";
  }
}

function sendVolume(vol, tabId) {
  const targetTab = tabId || currentTabId;
  if (!targetTab) return;

  chrome.runtime.sendMessage({
    action: "set-volume",
    tabId: targetTab,
    volume: Number(vol)
  });

  if (autosave.checked) {
    chrome.storage.local.set({ [`vol_tab_${targetTab}`]: Number(vol) });
  }

  // Update visual text indicator in tab list
  const tabRow = document.querySelector(`.tab-item[data-tab-id="${targetTab}"] .tab-vol`);
  if (tabRow) {
    tabRow.textContent = vol + "%";
    tabRow.classList.toggle("boosted", vol > 100);
  }
}

function sendEq() {
  if (!currentTabId) return;
  chrome.runtime.sendMessage({
    action: "set-eq",
    tabId: currentTabId,
    algorithm: eqAlgo.value,
    frequency: Number(eqFreq.value),
    q: Number(eqQ.value),
    gain: Number(eqGain.value)
  });
}

function loadTabSettings(tabId) {
  if (!tabId) return;
  currentTabId = tabId;

  chrome.runtime.sendMessage({ action: "get-volume", tabId }, (res) => {
    const vol = res && typeof res.volume === "number" ? res.volume : 100;
    updateUI(vol);
    if (vol !== 100) {
      sendVolume(vol, tabId);
    }
    sendNoiseSuppression(isNoiseSuppressed);
  });
}

function populateTabList() {
  tabList.innerHTML = "";
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    const visibleTabs = tabs.filter(t => t.url && /^(https?:)/.test(t.url));

    visibleTabs.forEach(tab => {
      const item = document.createElement("div");
      item.className = "tab-item";
      item.dataset.tabId = tab.id;

      const img = document.createElement("img");
      img.className = "tab-fav";
      img.src = tab.favIconUrl || "icon16.png";
      img.onerror = () => { img.src = "icon16.png"; };

      const title = document.createElement("div");
      title.className = "tab-title";
      title.textContent = tab.title || tab.url;

      const volSpan = document.createElement("div");
      volSpan.className = "tab-vol";
      volSpan.textContent = "100%";

      chrome.runtime.sendMessage({ action: "get-volume", tabId: tab.id }, (res) => {
        if (res && res.volume) {
          volSpan.textContent = res.volume + "%";
          if (res.volume > 100) volSpan.classList.add("boosted");
        }
      });

      item.appendChild(img);
      item.appendChild(title);
      item.appendChild(volSpan);

      item.addEventListener("click", () => {
        const prev = tabList.querySelector(".tab-item.selected");
        if (prev) prev.classList.remove("selected");
        item.classList.add("selected");
        loadTabSettings(tab.id);
      });

      tabList.appendChild(item);

      if (tab.active) {
        item.classList.add("selected");
        loadTabSettings(tab.id);
      }
    });
  });
}

// Slider Input Listener
slider.addEventListener("input", () => {
  const vol = Number(slider.value);
  updateUI(vol);
  sendVolume(vol);
});

// Preset Buttons Listener
presetBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const vol = Number(btn.getAttribute("data-vol"));
    updateUI(vol);
    sendVolume(vol);
  });
});

// Inc & Dec Buttons
incBtn.addEventListener("click", () => {
  const newVol = Math.min(600, Number(slider.value) + 10);
  updateUI(newVol);
  sendVolume(newVol);
});

decBtn.addEventListener("click", () => {
  const newVol = Math.max(0, Number(slider.value) - 10);
  updateUI(newVol);
  sendVolume(newVol);
});

// Noise Suppressor Toggle Listener
noiseBtn.addEventListener("click", () => {
  isNoiseSuppressed = !isNoiseSuppressed;
  noiseBtn.textContent = isNoiseSuppressed ? "⚡ Noise Suppressor: ON" : "⚡ Noise Suppressor: OFF";
  noiseBtn.style.background = isNoiseSuppressed ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.05)";
  noiseBtn.style.color = isNoiseSuppressed ? "#60a5fa" : "#94a3b8";

  sendNoiseSuppression(isNoiseSuppressed);
  updateUI(Number(slider.value));
});

// Mute Button
muteBtn.addEventListener("click", () => {
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? "Unmute" : "Mute";
  muteBtn.classList.toggle("danger", !isMuted);

  if (currentTabId) {
    chrome.runtime.sendMessage({
      action: "set-mute",
      tabId: currentTabId,
      mute: isMuted
    });
  }
  updateUI(Number(slider.value));
});

// Reset Button
resetBtn.addEventListener("click", () => {
  isMuted = false;
  muteBtn.textContent = "Mute";
  muteBtn.classList.add("danger");
  updateUI(100);
  sendVolume(100);
});

// EQ Accordion Toggle
eqToggle.addEventListener("click", () => {
  const isOpen = eqPanel.classList.toggle("open");
  eqArrow.textContent = isOpen ? "▲" : "▼";
});

// EQ Input Listeners
eqFreq.addEventListener("input", () => {
  eqFreqVal.textContent = eqFreq.value + " Hz";
  sendEq();
});
eqQ.addEventListener("input", () => {
  eqQVal.textContent = eqQ.value;
  sendEq();
});
eqGain.addEventListener("input", () => {
  eqGainVal.textContent = eqGain.value + " dB";
  sendEq();
});
eqAlgo.addEventListener("change", sendEq);

// Keyboard Shortcuts (0-6 keys set 0%-600%, Arrow Left/Right adjust volume)
document.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;

  if (e.key >= "0" && e.key <= "6") {
    const vol = Number(e.key) * 100;
    updateUI(vol);
    sendVolume(vol);
  } else if (e.key === "ArrowUp" || e.key === "ArrowRight") {
    const newVol = Math.min(600, Number(slider.value) + 10);
    updateUI(newVol);
    sendVolume(newVol);
  } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
    const newVol = Math.max(0, Number(slider.value) - 10);
    updateUI(newVol);
    sendVolume(newVol);
  }
});

// Initial Setup
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0] && tabs[0].id) {
    currentTabId = tabs[0].id;
    loadTabSettings(tabs[0].id);
  }
  populateTabList();
});