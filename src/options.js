// Options and Onboarding logic

const isExtensionMode = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

// ─── Browser Fallback Mocking ───────────────────────────────────────────────
if (!isExtensionMode) {
  window.chrome = {
    runtime: {
      sendMessage: function(msg, callback) {
        console.log("Mock sendMessage:", msg);
        if (msg.type === "SAVE_SETTINGS") {
          localStorage.setItem("settings", JSON.stringify(msg.settings));
          setTimeout(() => callback({ ok: true }), 50);
        }
      },
      getURL: (path) => path
    },
    storage: {
      sync: {
        get: function(keys, callback) {
          const res = {};
          keys.forEach(k => {
            if (k === "hasSeenOnboarding") {
              res[k] = localStorage.getItem("hasSeenOnboarding") === "true";
            } else if (k === "catPrefs") {
              res[k] = JSON.parse(localStorage.getItem("cat_prefs")) || null;
            } else if (k === "usageLimitMs") {
              res[k] = parseInt(localStorage.getItem("usageLimitMs")) || 10 * 60 * 1000;
            } else if (k === "breakDurationMs") {
              res[k] = parseInt(localStorage.getItem("breakDurationMs")) || 5 * 60 * 1000;
            }
          });
          setTimeout(() => callback(res), 50);
        },
        set: function(obj, callback) {
          Object.keys(obj).forEach(k => {
            if (k === "hasSeenOnboarding") {
              localStorage.setItem("hasSeenOnboarding", obj[k].toString());
            } else if (k === "catPrefs") {
              localStorage.setItem("cat_prefs", JSON.stringify(obj[k]));
            } else if (k === "usageLimitMs") {
              localStorage.setItem("usageLimitMs", obj[k].toString());
            } else if (k === "breakDurationMs") {
              localStorage.setItem("breakDurationMs", obj[k].toString());
            }
          });
          if (callback) setTimeout(callback, 50);
        }
      }
    }
  };
}

let activeCatIdx = 1;
let audioCtx = null;

// ─── Sound Synthesizer ────────────────────────────────────────────────────────
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playMeowSound(pitchScale = 1.0) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    const baseFreq = 420 * pitchScale;
    const peakFreq = 750 * pitchScale;
    const endFreq = 380 * pitchScale;

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
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  } catch (err) {
    console.warn("Audio Context error: ", err);
  }
}

// ─── Canvas Twinkling Starfield ───────────────────────────────────────────────
function initStarfield(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let stars = [];
  let rafId = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    stars = [];
    const count = Math.floor((canvas.width * canvas.height) / 18000);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random() * 0.8 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        growing: Math.random() > 0.5
      });
    }
  }

  window.addEventListener("resize", resize);
  resize();

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "white";
    stars.forEach(s => {
      ctx.globalAlpha = s.alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();

      if (s.growing) {
        s.alpha += s.twinkleSpeed;
        if (s.alpha >= 1) s.growing = false;
      } else {
        s.alpha -= s.twinkleSpeed;
        if (s.alpha <= 0.2) s.growing = true;
      }
    });
    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(draw);
  }
  draw();

  window.addEventListener("pagehide", () => {
    if (rafId) cancelAnimationFrame(rafId);
  });
}

// ─── Init Form Values ────────────────────────────────────────────────────────
function loadSettings() {
  chrome.storage.sync.get(["catPrefs", "usageLimitMs", "breakDurationMs"], (res) => {
    // Companion Info
    if (res.catPrefs) {
      if (res.catPrefs.username) {
        document.getElementById("username").value = res.catPrefs.username;
      }
      if (res.catPrefs.catName) {
        document.getElementById("cat-name").value = res.catPrefs.catName;
      }
      if (res.catPrefs.activeCatIdx) {
        activeCatIdx = res.catPrefs.activeCatIdx;
        selectCompanionCard(activeCatIdx);
      }
    }

    // Limits
    if (res.usageLimitMs) {
      document.getElementById("usage-limit").value = Math.round(res.usageLimitMs / 60000);
    }
    if (res.breakDurationMs) {
      document.getElementById("break-duration").value = Math.round(res.breakDurationMs / 60000);
    }
  });
}

function selectCompanionCard(idx) {
  document.querySelectorAll(".companion-card").forEach(c => {
    c.classList.remove("active");
    c.setAttribute("aria-pressed", "false");
    if (parseInt(c.dataset.idx) === idx) {
      c.classList.add("active");
      c.setAttribute("aria-pressed", "true");
    }
  });
}

// ─── Save Settings ──────────────────────────────────────────────────────────
function saveSettings(e) {
  if (e && !e.isTrusted) return;
  const username = document.getElementById("username").value.trim() || "Friend";
  const catName = document.getElementById("cat-name").value.trim() || "Mochi";
  const usageLimitMins = parseInt(document.getElementById("usage-limit").value) || 10;
  const breakDurationMins = parseInt(document.getElementById("break-duration").value) || 5;

  // Validation
  if (isNaN(usageLimitMins) || usageLimitMins < 1 || usageLimitMins > 480) {
    alert("Please enter a scroll limit between 1 and 480 minutes.");
    return;
  }
  if (isNaN(breakDurationMins) || breakDurationMins < 1 || breakDurationMins > 60) {
    alert("Please enter a break duration between 1 and 60 minutes.");
    return;
  }

  // Settings Object
  const newSettings = {
    usageLimitMs: usageLimitMins * 60 * 1000,
    breakDurationMs: breakDurationMins * 60 * 1000,
    showCat: true,
    activeCatIdx: activeCatIdx
  };

  // Send message to background service worker (saves & propagates limits)
  if (isExtensionMode) {
    chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: newSettings }, (res) => {
      if (!res || !res.ok) {
        alert("Settings save failed: " + (res?.error || "Unknown error"));
        return;
      }
      persistCompanionPrefs();
    });
  } else {
    // Fallback mode
    localStorage.setItem("settings", JSON.stringify(newSettings));
    persistCompanionPrefs();
  }

  function persistCompanionPrefs() {
    // Load existing prefs and merge
    chrome.storage.sync.get(["catPrefs"], (data) => {
      const prefs = data.catPrefs || {
        currentTheme: "bedroom",
        happiness: 80,
        energy: 70,
        soundEnabled: true,
        isSleeping: false
      };
      prefs.username = username;
      prefs.catName = catName;
      prefs.activeCatIdx = activeCatIdx;

      chrome.storage.sync.set({
        catPrefs: prefs,
        hasSeenOnboarding: true,
        usageLimitMs: newSettings.usageLimitMs,
        breakDurationMs: newSettings.breakDurationMs
      }, () => {
        // Trigger Success screen
        document.getElementById("success-text").textContent = 
          `${catName} is ready to keep you company and help you break your scrolling habit! 🐾`;
        
        playMeowSound(activeCatIdx === 1 ? 1.3 : activeCatIdx === 3 ? 0.8 : 1.0);
        
        document.getElementById("success-screen").classList.add("visible");
        initStarfield("success-stars");
      });
    });
  }
}

// ─── Setup Event Listeners ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initStarfield("stars-canvas");
  loadSettings();

  // Companion selection
  const grid = document.getElementById("companion-grid");
  if (grid) {
    grid.addEventListener("click", (e) => {
      if (e && !e.isTrusted) return;
      const card = e.target.closest(".companion-card");
      if (!card) return;
      activeCatIdx = parseInt(card.dataset.idx);
      selectCompanionCard(activeCatIdx);
      playMeowSound(activeCatIdx === 1 ? 1.3 : activeCatIdx === 3 ? 0.8 : 1.0);
    });

    grid.addEventListener("keydown", (e) => {
      if (e && !e.isTrusted) return;
      if (e.key === "Enter" || e.key === " ") {
        const card = e.target.closest(".companion-card");
        if (!card) return;
        e.preventDefault();
        activeCatIdx = parseInt(card.dataset.idx);
        selectCompanionCard(activeCatIdx);
        playMeowSound(activeCatIdx === 1 ? 1.3 : activeCatIdx === 3 ? 0.8 : 1.0);
      }
    });
  }

  // Meow on clicking cat in success screen
  const catSvg = document.getElementById("interactive-cat-svg");
  if (catSvg) {
    catSvg.addEventListener("click", (e) => {
      if (e && !e.isTrusted) return;
      playMeowSound(activeCatIdx === 1 ? 1.3 : activeCatIdx === 3 ? 0.8 : 1.0);
    });
    catSvg.addEventListener("keydown", (e) => {
      if (e && !e.isTrusted) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        playMeowSound(activeCatIdx === 1 ? 1.3 : activeCatIdx === 3 ? 0.8 : 1.0);
      }
    });
  }

  // Save Settings CTA
  const saveBtn = document.getElementById("save-settings-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveSettings);
  }

  // Close Success Screen / Start Browsing
  const closeSuccessBtn = document.getElementById("close-success-btn");
  if (closeSuccessBtn) {
    closeSuccessBtn.addEventListener("click", (e) => {
      if (e && !e.isTrusted) return;
      if (isExtensionMode) {
        window.close();
        setTimeout(() => {
          window.location.href = "https://www.youtube.com";
        }, 100);
      } else {
        alert("Settings saved successfully! (Preview Mode Complete)");
        window.location.reload();
      }
    });
  }
});
