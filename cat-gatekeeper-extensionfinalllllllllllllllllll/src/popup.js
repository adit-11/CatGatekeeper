// Popup script

let currentSettings = null;
let breakTimerInterval = null;

// ─── Setup ──────────────────────────────────────────────────────────────────
function setup() {
  document.getElementById("onboardingCloseBtn").addEventListener("click", (e) => {
    if (e && !e.isTrusted) return;
    chrome.storage.sync.set({ hasSeenOnboarding: true }, () => {
      document.getElementById("onboardingCard").classList.remove("visible");
    });
  });

  // Manual Break Setup
  document.getElementById("manualBreakBtn").addEventListener("click", (e) => {
    if (e && !e.isTrusted) return;
    if (confirm("Would you like to take a wellness break right now?")) {
      chrome.runtime.sendMessage({ type: "TRIGGER_MANUAL_BREAK" });
    }
  });

  // Interactive Header Cat Setup
  const headerCat = document.querySelector(".header-cat");
  if (headerCat) {
    headerCat.style.cursor = "pointer";
    headerCat.addEventListener("click", (e) => {
      if (e && !e.isTrusted) return;
      playMeowSound();
      headerCat.style.animation = "none";
      headerCat.offsetHeight; // trigger reflow
      headerCat.style.animation = "petCat 0.5s ease-in-out";
    });
    headerCat.addEventListener("keydown", (e) => {
      if (e && !e.isTrusted) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        playMeowSound();
        headerCat.style.animation = "none";
        headerCat.offsetHeight; // trigger reflow
        headerCat.style.animation = "petCat 0.5s ease-in-out";
      }
    });
  }

  // Companion Selector Setup
  const companionGrid = document.getElementById("companionGrid");
  if (companionGrid) {
    companionGrid.addEventListener("click", (e) => {
      if (e && !e.isTrusted) return;
      const card = e.target.closest(".companion-card");
      if (!card) return;
      document.querySelectorAll(".companion-card").forEach(c => {
        c.classList.remove("active");
        c.setAttribute("aria-pressed", "false");
      });
      card.classList.add("active");
      card.setAttribute("aria-pressed", "true");
    });

    companionGrid.addEventListener("keydown", (e) => {
      if (e && !e.isTrusted) return;
      if (e.key === "Enter" || e.key === " ") {
        const card = e.target.closest(".companion-card");
        if (!card) return;
        e.preventDefault();
        document.querySelectorAll(".companion-card").forEach(c => {
          c.classList.remove("active");
          c.setAttribute("aria-pressed", "false");
        });
        card.classList.add("active");
        card.setAttribute("aria-pressed", "true");
      }
    });
  }

  // Show Cat checkbox row toggle
  const showCatRow = document.getElementById("showCatRow");
  if (showCatRow) {
    showCatRow.addEventListener("click", (e) => {
      if (e && !e.isTrusted) return;
      if (e.target.id !== "showCatCheckbox" && e.target.id !== "showCatLabel") {
        const checkbox = document.getElementById("showCatCheckbox");
        checkbox.checked = !checkbox.checked;
      }
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

  // Onboarding Setup - Redirect to full-screen options tab if not configured
  chrome.storage.sync.get(["hasSeenOnboarding"], (syncData) => {
    if (!syncData.hasSeenOnboarding) {
      chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
      window.close();
    }
  });
}

// ─── Render ──────────────────────────────────────────────────────────────────
function renderSettings(settings) {
  document.getElementById("usageLimit").value = Math.round(settings.usageLimitMs / 60000);
  document.getElementById("breakDuration").value = Math.round(settings.breakDurationMs / 60000);
  document.getElementById("showCatCheckbox").checked = settings.showCat !== false;
  
  const activeCatIdx = settings.activeCatIdx || 1;
  document.querySelectorAll(".companion-card").forEach(c => {
    c.classList.remove("active");
    c.setAttribute("aria-pressed", "false");
    if (parseInt(c.dataset.idx) === activeCatIdx) {
      c.classList.add("active");
      c.setAttribute("aria-pressed", "true");
    }
  });
}

function renderUsage(usageMs, limitMs) {
  const mins = Math.floor(usageMs / 60000);
  const limitMins = Math.floor(limitMs / 60000);
  const pct = Math.min(100, (usageMs / limitMs) * 100);
  document.getElementById("usageText").textContent = `${mins} / ${limitMins} min`;
  document.getElementById("usageBar").style.width = `${pct}%`;
}

function showBreakBanner(breakEndTime) {
  if (breakTimerInterval) clearInterval(breakTimerInterval);
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

// ─── Save ────────────────────────────────────────────────────────────────────
document.getElementById("saveBtn").addEventListener("click", (e) => {
  if (e && !e.isTrusted) return;
  if (!currentSettings) return;
  const usageLimit = parseInt(document.getElementById("usageLimit").value) || 10;
  const breakDuration = parseInt(document.getElementById("breakDuration").value) || 5;
  const showCat = document.getElementById("showCatCheckbox").checked;

  const activeCard = document.querySelector(".companion-card.active");
  const activeCatIdx = activeCard ? parseInt(activeCard.dataset.idx) : 1;

  const newSettings = {
    usageLimitMs: usageLimit * 60 * 1000,
    breakDurationMs: breakDuration * 60 * 1000,
    showCat: showCat,
    activeCatIdx: activeCatIdx
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
document.getElementById("resetBtn").addEventListener("click", (e) => {
  if (e && !e.isTrusted) return;
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
