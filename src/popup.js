// Popup script

let currentSettings = null;
let breakTimerInterval = null;

// ─── Setup ──────────────────────────────────────────────────────────────────
function setup() {
  document.getElementById("onboardingCloseBtn").addEventListener("click", () => {
    chrome.storage.sync.set({ hasSeenOnboarding: true }, () => {
      document.getElementById("onboardingCard").classList.remove("visible");
    });
  });

  // Manual Break Setup
  document.getElementById("manualBreakBtn").addEventListener("click", () => {
    if (confirm("Would you like to take a wellness break right now?")) {
      chrome.runtime.sendMessage({ type: "TRIGGER_MANUAL_BREAK" });
    }
  });

  // Interactive Header Cat Setup
  const headerCat = document.querySelector(".header-cat");
  if (headerCat) {
    headerCat.style.cursor = "pointer";
    headerCat.addEventListener("click", () => {
      playMeowSound();
      headerCat.style.animation = "none";
      headerCat.offsetHeight; // trigger reflow
      headerCat.style.animation = "petCat 0.5s ease-in-out";
    });
  }
}

// ─── Init ───────────────────────────────────────────────────────────────────
function init() {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (res) => {
    if (chrome.runtime.lastError || !res) {
      const usageText = document.getElementById("usageText");
      if (usageText) {
        usageText.textContent = "Loading...";
      }
      setTimeout(init, 500); // retry once
      return;
    }
    currentSettings = res.settings;
    renderSettings(res.settings);
    renderUsage(res.usageMs, res.settings.usageLimitMs);
    if (res.isOnBreak && res.breakEndTime) {
      showBreakBanner(res.breakEndTime);
    }
  });

  // Onboarding Setup
  chrome.storage.sync.get(["hasSeenOnboarding"], (syncData) => {
    if (!syncData.hasSeenOnboarding) {
      document.getElementById("onboardingCard").classList.add("visible");
    }
  });
}

// ─── Render ──────────────────────────────────────────────────────────────────
function renderSettings(settings) {
  document.getElementById("usageLimit").value = Math.round(settings.usageLimitMs / 60000);
  document.getElementById("breakDuration").value = Math.round(settings.breakDurationMs / 60000);
  renderSiteTags(settings.targetSites);
}

function renderUsage(usageMs, limitMs) {
  const mins = Math.floor(usageMs / 60000);
  const limitMins = Math.floor(limitMs / 60000);
  const pct = Math.min(100, (usageMs / limitMs) * 100);
  document.getElementById("usageText").textContent = `${mins} / ${limitMins} min`;
  document.getElementById("usageBar").style.width = `${pct}%`;
}

function renderSiteTags(sites) {
  const container = document.getElementById("siteTags");
  container.innerHTML = "";
  sites.forEach(site => {
    const tag = document.createElement("div");
    tag.className = "tag";

    const siteText = document.createTextNode(site + " ");
    const removeBtn = document.createElement("span");
    removeBtn.className = "tag-remove";
    removeBtn.dataset.site = site;
    removeBtn.textContent = "×";

    removeBtn.addEventListener("click", () => {
      currentSettings.targetSites = currentSettings.targetSites.filter(s => s !== site);
      renderSiteTags(currentSettings.targetSites);
    });

    tag.appendChild(siteText);
    tag.appendChild(removeBtn);
    container.appendChild(tag);
  });
}

function showBreakBanner(breakEndTime) {
  document.getElementById("breakBanner").classList.add("visible");
  updateBreakTimer(breakEndTime);
  breakTimerInterval = setInterval(() => updateBreakTimer(breakEndTime), 500);
}

function updateBreakTimer(breakEndTime) {
  const remaining = Math.max(0, breakEndTime - Date.now());
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  document.getElementById("breakTimer").textContent =
    `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  if (remaining <= 0) {
    clearInterval(breakTimerInterval);
    document.getElementById("breakBanner").classList.remove("visible");
  }
}

// ─── Nudge Buttons ───────────────────────────────────────────────────────────
function nudge(inputId, delta, min, max) {
  const el = document.getElementById(inputId);
  const val = Math.min(max, Math.max(min, parseInt(el.value || 0) + delta));
  el.value = val;
}

document.getElementById("usageMinus").addEventListener("click", () => nudge("usageLimit", -1, 1, 480));
document.getElementById("usagePlus").addEventListener("click",  () => nudge("usageLimit", +1, 1, 480));
document.getElementById("breakMinus").addEventListener("click", () => nudge("breakDuration", -1, 1, 60));
document.getElementById("breakPlus").addEventListener("click",  () => nudge("breakDuration", +1, 1, 60));

// ─── Add Site ────────────────────────────────────────────────────────────────
document.getElementById("addSiteBtn").addEventListener("click", addSite);
document.getElementById("siteInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addSite();
});

function addSite() {
  if (!currentSettings) return;
  const input = document.getElementById("siteInput");
  let site = input.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (!site) return;

  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
  if (!domainRegex.test(site)) {
    alert("Please enter a valid domain name! (e.g. facebook.com)");
    return;
  }

  if (!currentSettings.targetSites.includes(site)) {
    currentSettings.targetSites.push(site);
    renderSiteTags(currentSettings.targetSites);
  }
  input.value = "";
}

// ─── Save ────────────────────────────────────────────────────────────────────
document.getElementById("saveBtn").addEventListener("click", () => {
  if (!currentSettings) return;
  const usageLimit = parseInt(document.getElementById("usageLimit").value) || 10;
  const breakDuration = parseInt(document.getElementById("breakDuration").value) || 5;

  const newSettings = {
    usageLimitMs: usageLimit * 60 * 1000,
    breakDurationMs: breakDuration * 60 * 1000,
    targetSites: currentSettings.targetSites
  };

  chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: newSettings }, (res) => {
    if (!res || !res.ok) {
      alert("Settings save failed: " + (res?.error || "Unknown error"));
    } else {
      currentSettings = newSettings;
      const toast = document.getElementById("savedToast");
      toast.classList.add("visible");
      setTimeout(() => toast.classList.remove("visible"), 2000);
    }
  });
});

// ─── Reset ───────────────────────────────────────────────────────────────────
document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm("Are you sure you want to reset your usage limits and progress for today?")) {
    chrome.runtime.sendMessage({ type: "RESET_USAGE" }, () => {
      document.getElementById("breakBanner").classList.remove("visible");
      clearInterval(breakTimerInterval);
      renderUsage(0, currentSettings.usageLimitMs);
    });
  }
});

// Sync usage bar and break banner dynamically if storage.local changes in background
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    if (changes.todayUsageMs && currentSettings) {
      renderUsage(changes.todayUsageMs.newValue || 0, currentSettings.usageLimitMs);
    }
    if (changes.isOnBreak) {
      if (changes.isOnBreak.newValue) {
        chrome.storage.local.get(["breakEndTime"], (data) => {
          if (data.breakEndTime) {
            showBreakBanner(data.breakEndTime);
          }
        });
      } else {
        clearInterval(breakTimerInterval);
        document.getElementById("breakBanner").classList.remove("visible");
      }
    }
  }
});

// ─── Web Audio API Sound Synthesizer for Popup ──────────────────────────────
function playMeowSound() {
  chrome.storage.sync.get(["catPrefs"], (syncData) => {
    chrome.storage.local.get(["appState"], (localData) => {
      let soundEnabled = true;
      if (syncData.catPrefs && syncData.catPrefs.soundEnabled === false) {
        soundEnabled = false;
      } else if (localData.appState && localData.appState.soundEnabled === false) {
        soundEnabled = false;
      }
      if (!soundEnabled) return;
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const now = audioCtx.currentTime;

        const osc = audioCtx.createOscillator();
        const filter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();

        const baseFreq = 420;
        const peakFreq = 750;
        const endFreq = 380;

        osc.type = "triangle";
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(peakFreq, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.45);

        filter.type = "bandpass";
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(1800, now + 0.12);
        filter.frequency.exponentialRampToValueAtTime(800, now + 0.45);
        filter.Q.setValueAtTime(3.0, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.5);
      } catch (err) {
        console.warn("Audio Context blocked or error: ", err);
      }
    });
  });
}

// ─── Start ───────────────────────────────────────────────────────────────────
setup();
init();
