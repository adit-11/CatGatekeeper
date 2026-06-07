// Break Screen Game Loop and Interaction Logic
window.addEventListener("error", (e) => {
  const div = document.createElement("div");
  div.style.position = "fixed";
  div.style.top = "10px";
  div.style.left = "10px";
  div.style.right = "10px";
  div.style.background = "#ff3333";
  div.style.color = "white";
  div.style.padding = "14px";
  div.style.zIndex = "999999";
  div.style.fontSize = "14px";
  div.style.fontWeight = "bold";
  div.style.borderRadius = "8px";
  div.style.boxShadow = "0 8px 20px rgba(0,0,0,0.6)";
  div.style.fontFamily = "monospace";
  div.style.whiteSpace = "pre-wrap";
  div.innerHTML = `⚠️ JS Error: ${e.message}\nLine ${e.lineno}:${e.colno} in ${e.filename}`;
  document.body.appendChild(div);
});

window.addEventListener("DOMContentLoaded", () => {
  const missing = [];
  if (!document.getElementById("cat-name-container")) missing.push("cat-name-container");
  if (!document.getElementById("naming-modal")) missing.push("naming-modal");
  if (!document.getElementById("cat-name-input")) missing.push("cat-name-input");
  if (!document.getElementById("naming-close-btn")) missing.push("naming-close-btn");
  if (!document.getElementById("naming-submit-btn")) missing.push("naming-submit-btn");
  
  if (missing.length > 0) {
    const div = document.createElement("div");
    div.style.position = "fixed";
    div.style.bottom = "10px";
    div.style.left = "10px";
    div.style.background = "#ff9900";
    div.style.color = "black";
    div.style.padding = "10px 14px";
    div.style.zIndex = "999999";
    div.style.fontSize = "13px";
    div.style.fontWeight = "bold";
    div.style.borderRadius = "6px";
    div.style.boxShadow = "0 4px 10px rgba(0,0,0,0.4)";
    div.innerHTML = `⚠️ Missing DOM elements: ${missing.join(", ")}`;
    document.body.appendChild(div);
  }
});

// ─── Constants & State ───────────────────────────────────────────────────
const MOCK_TIPS = [
  "🐾 Rest your eyes! Stare at an object 20 feet away for 20 seconds.",
  "💧 Good time to take a sip of water and hydrate yourself.",
  "🧘 Roll your shoulders back and take three deep breaths.",
  "👀 Blink rapidly 10 times to rebuild your tear film.",
  "🚶 Stand up and stretch your legs for a moment.",
  "🌸 Rest your wrists. Make gentle circles with your hands.",
  "🌈 Relax your jaw and loosen your facial muscles."
];

const GREETINGS = [
  "You have been scrolling a lot 🐾",
  "Drink some water human 💧",
  "Let's rest our eyes together 👀",
  "You're doing great ❤️",
  "Take a deep breath and stretch! 🧘"
];

let state = {
  username: "Friend",
  soundEnabled: true,
  streak: 0,
  xp: 0,
  level: 1,
  happiness: 80,
  energy: 70,
  currentTheme: "bedroom",
  activeCatIdx: 1,
  isSleeping: false,
  lastVisitDate: null,
  lastStreakDate: null,     // tracks which day the day-streak was last incremented
  todayBreaks: 0,           // how many breaks completed TODAY
  todayBreaksDate: null,    // date string for todayBreaks reset logic
  catName: "",
  unlockedThemes: ["bedroom"] // persistently unlocked themes
};

const isExtensionMode = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
let audioCtx = null;
let ambientParticlesInterval = null;
let tipsInterval = null;
let meowInterval = null;
let timerInterval = null;
let mouthTalkInterval = null;
let breakEndTime = null;

// Active continuous sounds
let purrNodes = null;

// DOM Elements Cache (resolved in init() after DOMContentLoaded)
let elContainer = null;
let elStreakVal = null;
let elFriendshipLvl = null;
let elXpProgressBar = null;
let elXpText = null;
let elHappinessVal = null;
let elHappinessBar = null;
let elEnergyVal = null;
let elEnergyBar = null;
let elCountdown = null;
let elTipsContainer = null;
let elSpeechBubble = null;
let elThemeBtn = null;
let elThemeMenu = null;
let elSettingsModal = null;
let elSettingsToggleBtn = null;
let elSettingsCloseBtn = null;
let elSettingsSaveBtn = null;
let elUsernameInput = null;
let elSoundToggle = null;
let elUsageLimitInput = null;
let elBreakDurationInput = null;
let elSleepBtn = null;
let elPetHotzone = null;
let elParticleEmitter = null;

// Naming Modal Elements Cache
let elNamingModal = null;
let elNamingSubmitBtn = null;
let elNamingCloseBtn = null;
let elCatNameInput = null;
let elCatNameDisplay = null;
let elCatNameContainer = null;

// Cat SVG wrappers
const catWrappers = {};

// ─── Web Audio API Sound Synthesizer ──────────────────────────────────────
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Synthesize Meow
function playMeowSound(pitchScale = 1.0) {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    // Meow envelope frequencies
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
    console.warn("Audio Context blocked or error playing meow: ", err);
  }
}

// Play Continuous Purring
function startPurrSound() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    if (purrNodes) return; // already playing

    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const lfoGain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(50, now); // low rumble

    lfo.type = "sine";
    lfo.frequency.setValueAtTime(16, now); // 16Hz flutter

    lfoGain.gain.setValueAtTime(0.35, now);
    oscGain.gain.setValueAtTime(0.12, now);

    lfo.connect(lfoGain);
    lfoGain.connect(oscGain.gain);

    osc.connect(oscGain);
    oscGain.connect(ctx.destination);

    lfo.start(now);
    osc.start(now);

    purrNodes = { osc, lfo, oscGain, lfoGain };
  } catch (err) {
    console.warn("Error starting purr sound: ", err);
  }
}

function stopPurrSound() {
  if (purrNodes) {
    try {
      const now = purrNodes.osc.context.currentTime;
      purrNodes.oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      const o = purrNodes.osc;
      const l = purrNodes.lfo;
      setTimeout(() => {
        try { o.stop(); l.stop(); } catch(e){}
      }, 200);
    } catch(e){}
    purrNodes = null;
  }
}

// Play crunch eating sounds
function playCrunchSound() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    
    // Chain 3 short noise bursts
    for (let i = 0; i < 3; i++) {
      const startTime = ctx.currentTime + (i * 0.18);
      
      const bufferSize = ctx.sampleRate * 0.08;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let s = 0; s < bufferSize; s++) {
        data[s] = Math.random() * 2 - 1;
      }
      
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(700, startTime);
      filter.Q.setValueAtTime(4.0, startTime);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      noise.start(startTime);
    }
  } catch (e){}
}

// Play bubble lapping water sounds
function playWaterSound() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    for (let i = 0; i < 4; i++) {
      const startTime = ctx.currentTime + (i * 0.15);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(200, startTime);
      osc.frequency.exponentialRampToValueAtTime(800, startTime + 0.06);
      
      gain.gain.setValueAtTime(0.08, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.07);
    }
  } catch (e){}
}

// Play arpeggio on Level Up
function playLevelUpSound() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const freqs = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      
      const time = ctx.currentTime + (idx * 0.07);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.12, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.3);
    });
  } catch (e){}
}

// ─── Particle Effects ─────────────────────────────────────────────────────
function spawnParticles(type, count = 8, customLeft = null, customBottom = null) {
  const parent = elParticleEmitter;
  const rect = elParticleEmitter.getBoundingClientRect();
  const originX = customLeft !== null ? customLeft : rect.width / 2;
  const originY = customBottom !== null ? rect.height - customBottom : rect.height / 2;

  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    
    if (type === "heart") {
      p.textContent = "❤️";
    } else if (type === "sparkle") {
      p.textContent = ["✨", "🌟", "🌸"][Math.floor(Math.random() * 3)];
    } else if (type === "water") {
      p.textContent = "💧";
    } else if (type === "zzz") {
      p.textContent = "💤";
      p.style.fontSize = `${Math.random() * 8 + 10}px`;
    } else if (type === "xp") {
      p.textContent = "+XP";
      p.style.color = "var(--accent-color)";
      p.style.fontWeight = "bold";
      p.style.fontSize = "12px";
    } else {
      p.textContent = "✨";
    }

    p.style.left = `${originX}px`;
    p.style.top = `${originY}px`;

    const tx = (Math.random() - 0.5) * 160;
    const ty = type === "zzz" ? -80 - Math.random() * 80 : -100 - Math.random() * 100;
    const rot = (Math.random() - 0.5) * 180;

    p.style.setProperty("--tx", `${tx}px`);
    p.style.setProperty("--ty", `${ty}px`);
    p.style.setProperty("--rot", `${rot}deg`);

    if (type === "zzz") {
      p.style.animation = "particleFloat 2s forwards linear";
    }

    parent.appendChild(p);
    setTimeout(() => p.remove(), type === "zzz" ? 2000 : 1200);
  }
}

// ─── Theme Management ─────────────────────────────────────────────────────
function setTheme(theme) {
  state.currentTheme = theme;
  
  // Update body classes
  document.body.className = `active-${theme}`;
  elContainer.className = `theme-${theme}`;

  // Update button text
  const capitalized = theme.charAt(0).toUpperCase() + theme.slice(1);
  elThemeBtn.innerHTML = `🎨 ${capitalized}`;

  // Mark dropdown menu as active
  document.querySelectorAll(".theme-option").forEach(opt => {
    opt.classList.remove("active");
    if (opt.dataset.theme === theme) {
      opt.classList.add("active");
    }
  });

  // Save state
  saveState();

  // Trigger custom particle themes
  if (ambientParticlesInterval) clearInterval(ambientParticlesInterval);
  
  if (theme === "cafe") {
    ambientParticlesInterval = setInterval(() => {
      // falling cherry blossoms (pink text petal)
      spawnAmbientParticle("🌸", 0.05);
    }, 1800);
  } else if (theme === "garden") {
    ambientParticlesInterval = setInterval(() => {
      // glowing fireflies
      spawnAmbientParticle("✨", 0.03);
    }, 1200);
  } else if (theme === "space") {
    ambientParticlesInterval = setInterval(() => {
      // drifting stardust
      spawnAmbientParticle("•", 0.02);
    }, 800);
  }
}

function spawnAmbientParticle(char, opacityVal) {
  const p = document.createElement("div");
  p.className = "particle";
  p.textContent = char;
  p.style.opacity = opacityVal;
  p.style.fontSize = `${Math.random() * 12 + 8}px`;
  p.style.left = `${Math.random() * 100}%`;
  p.style.top = `-20px`;

  const tx = (Math.random() - 0.5) * 100;
  const ty = window.innerHeight + 40;
  const rot = Math.random() * 360;

  p.style.setProperty("--tx", `${tx}px`);
  p.style.setProperty("--ty", `${ty}px`);
  p.style.setProperty("--rot", `${rot}deg`);
  p.style.animation = "particleFloat 8s forwards linear";

  elParticleEmitter.appendChild(p);
  setTimeout(() => p.remove(), 8000);
}

// ─── Gamification Engine ──────────────────────────────────────────────────
function earnXp(amount) {
  if (state.isSleeping) {
    showBubble("Zzz... wake me up first! 😴");
    return;
  }
  
  state.xp += amount;
  
  // Calculate origin of cat for particle spawn
  const vRect = document.getElementById("cat-viewport-box").getBoundingClientRect();
  const relativeX = vRect.width / 2;
  const relativeY = vRect.height - 80;

  spawnParticles("xp", 1, relativeX, relativeY);

  if (state.xp >= 100) {
    state.level += 1;
    state.xp = state.xp - 100;
    
    // Level up trigger
    playLevelUpSound();
    spawnParticles("sparkle", 16, relativeX, relativeY);
    showBubble(`Level Up! Level ${state.level}! 🎉`);
  }
  
  updateStatsUI();
  saveState();
}

function updateStatsUI() {
  // XP Progress Bar
  elFriendshipLvl.textContent = state.level;
  elXpProgressBar.style.width = `${state.xp}%`;
  elXpText.textContent = `${state.xp} / 100`;

  // Happiness & Energy
  elHappinessVal.textContent = `${state.happiness}%`;
  elHappinessBar.style.width = `${state.happiness}%`;
  elEnergyVal.textContent = `${state.energy}%`;
  elEnergyBar.style.width = `${state.energy}%`;

  // Today's breaks count
  elStreakVal.textContent = state.todayBreaks;

  // Unlock Themes check based on persistent unlockedThemes or standalone mode
  const optCafe = document.getElementById("theme-opt-cafe");
  const optGarden = document.getElementById("theme-opt-garden");
  const optSpace = document.getElementById("theme-opt-space");

  const unlockAll = !isExtensionMode; // Unlocked by default in standalone HTML preview

  const unlockedList = state.unlockedThemes || ["bedroom"];

  if (unlockedList.includes("cafe") || unlockAll) {
    optCafe.className = "theme-option";
    optCafe.title = "";
  } else {
    optCafe.className = "theme-option locked";
    optCafe.title = `Complete 2 eye saves today to unlock (${state.todayBreaks}/2 done)`;
  }

  if (unlockedList.includes("garden") || unlockAll) {
    optGarden.className = "theme-option";
    optGarden.title = "";
  } else {
    optGarden.className = "theme-option locked";
    optGarden.title = `Complete 4 eye saves today to unlock (${state.todayBreaks}/4 done)`;
  }

  if (unlockedList.includes("space") || unlockAll) {
    optSpace.className = "theme-option";
    optSpace.title = "";
  } else {
    optSpace.className = "theme-option locked";
    optSpace.title = `Complete 7 eye saves today to unlock (${state.todayBreaks}/7 done)`;
  }

  // Update Sound Toggle UI
  const soundBtn = document.getElementById("sound-toggle-btn");
  if (soundBtn) {
    soundBtn.innerHTML = state.soundEnabled ? "🔊" : "🔇";
  }
  if (elSoundToggle) {
    elSoundToggle.checked = state.soundEnabled;
  }
}

// ─── SVG Cat Logic (Mouse Following & Blinking) ─────────────────────────
function initMouseTracking() {
  document.addEventListener("mousemove", (e) => {
    if (state.isSleeping) return;

    // Apply slight 3D Parallax movement to backgrounds
    const dx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
    const dy = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
    
    // Subtle drift on parallax layers
    document.querySelectorAll(".parallax-layer").forEach(layer => {
      const depth = parseFloat(layer.getAttribute("data-depth") || 0.1);
      const tx = dx * depth * 25;
      const ty = dy * depth * 25;
      layer.style.transform = `translate(${tx}px, ${ty}px)`;
    });

    // Track eye centers for cursor tracking
    const viewportBox = document.getElementById("cat-viewport-box");
    const vRect = viewportBox.getBoundingClientRect();
    const catCenterX = vRect.left + vRect.width / 2;
    const catCenterY = vRect.top + vRect.height / 2;

    const angle = Math.atan2(e.clientY - catCenterY, e.clientX - catCenterX);
    const dist = Math.min(4, Math.hypot(e.clientX - catCenterX, e.clientY - catCenterY) / 100);

    const pupils = document.querySelectorAll(".cgPupilLeft, .cgPupilRight");
    pupils.forEach(pup => {
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      pup.style.transform = `translate(${px}px, ${py}px)`;
    });
  });
}

// ─── Environment Canvas Twinkle ──────────────────────────────────────────
function initCanvasStars() {
  const canvas = document.getElementById("stars-canvas");
  const ctx = canvas.getContext("2d");
  let stars = [];
  let starRafId = null;

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
    
    // Draw starry space layer
    ctx.fillStyle = "white";
    stars.forEach(s => {
      ctx.globalAlpha = s.alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();

      // Twinkle adjustment
      if (s.growing) {
        s.alpha += s.twinkleSpeed;
        if (s.alpha >= 1) s.growing = false;
      } else {
        s.alpha -= s.twinkleSpeed;
        if (s.alpha <= 0.2) s.growing = true;
      }
    });
    
    ctx.globalAlpha = 1;
    starRafId = requestAnimationFrame(draw);
  }
  draw();

  window.addEventListener("unload", () => {
    if (starRafId) {
      cancelAnimationFrame(starRafId);
    }
  });
}

// ─── Speech Bubbles and Tips Carousels ────────────────────────────────────
function showBubble(text, duration = 3500, animateMouth = true) {
  elSpeechBubble.textContent = text;
  elSpeechBubble.classList.add("visible");
  
  const activeWrapper = catWrappers[state.activeCatIdx];
  if (activeWrapper) {
    // Random tail wagging and reactions
    activeWrapper.classList.add("wag-fast");
    
    const isPurr = text.toLowerCase().includes("purrr");
    if (!state.isSleeping && animateMouth && !isPurr) {
      if (mouthTalkInterval) clearInterval(mouthTalkInterval);
      activeWrapper.classList.remove("open-mouth");
      
      let talkCount = 0;
      const maxToggles = Math.min(18, Math.floor(duration / 150) - 2);
      mouthTalkInterval = setInterval(() => {
        activeWrapper.classList.toggle("open-mouth");
        talkCount++;
        if (talkCount >= maxToggles) {
          clearInterval(mouthTalkInterval);
          activeWrapper.classList.remove("open-mouth");
          mouthTalkInterval = null;
        }
      }, 150);
    }
    
    setTimeout(() => activeWrapper.classList.remove("wag-fast"), 1000);
  }

  setTimeout(() => {
    // Check if the current bubble text matches (prevent overlap wipe)
    if (elSpeechBubble.textContent === text) {
      elSpeechBubble.classList.remove("visible");
    }
  }, duration);
}

function startMeowLoop() {
  if (meowInterval) clearInterval(meowInterval);
  
  // Meow randomly every 12 to 20 seconds
  const nextTime = Math.floor(Math.random() * 8000) + 12000;
  meowInterval = setInterval(() => {
    if (!state.isSleeping) {
      playMeowSound(state.activeCatIdx === 1 ? 1.3 : state.activeCatIdx === 3 ? 0.8 : 1.0);
      showBubble(GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
    }
  }, nextTime);
}

function initTipsCarousel() {
  const container = elTipsContainer;
  container.innerHTML = "";
  
  MOCK_TIPS.forEach((tip, idx) => {
    const div = document.createElement("div");
    div.className = "wellness-tip";
    if (idx === 0) div.classList.add("active");
    div.textContent = tip;
    container.appendChild(div);
  });

  let currentIdx = 0;
  if (tipsInterval) clearInterval(tipsInterval);

  tipsInterval = setInterval(() => {
    const tips = container.querySelectorAll(".wellness-tip");
    if (tips.length === 0) return;
    
    tips[currentIdx].classList.remove("active");
    currentIdx = (currentIdx + 1) % tips.length;
    tips[currentIdx].classList.add("active");
  }, 20000);
}

// ─── Interaction Animations ───────────────────────────────────────────────
let currentAnimationLock = false;

function resetCatAnimationStates(wrapper) {
  if (mouthTalkInterval) {
    clearInterval(mouthTalkInterval);
    mouthTalkInterval = null;
  }
  wrapper.classList.remove("walking", "jumping", "wag-fast", "tilt-cat", "waving-paw", "open-mouth");
  wrapper.style.transform = "";
}

function performAction(actionName) {
  if (currentAnimationLock) return;
  
  const wrapper = catWrappers[state.activeCatIdx];
  if (!wrapper) return;

  if (state.isSleeping && actionName !== "sleep") {
    showBubble("Zzz... wake me up first! 😴");
    return;
  }

  currentAnimationLock = true;
  resetCatAnimationStates(wrapper);

  const vRect = document.getElementById("cat-viewport-box").getBoundingClientRect();
  const relativeX = vRect.width / 2;
  const relativeY = vRect.height - 80;

  if (actionName === "feed") {
    // Drop Fish
    const fish = document.getElementById("food-fish-svg");
    fish.style.display = "block";
    playCrunchSound();

    // Cat walks to fish
    wrapper.classList.add("walking");
    wrapper.style.setProperty("--walk-x", "calc(-50% + 40px)");
    wrapper.style.transform = "translate(calc(-50% + 40px), 0)";

    setTimeout(() => {
      // Eat
      wrapper.classList.remove("walking");
      wrapper.classList.add("waving-paw");
      fish.style.display = "none";
      showBubble("Nom nom... yummy fish! 🐟", 3500, false);
      
      // Chewing effect (mouth opens and closes)
      let chewCount = 0;
      let chewInterval = setInterval(() => {
        wrapper.classList.toggle("open-mouth");
        chewCount++;
        if (chewCount >= 6) {
          clearInterval(chewInterval);
          wrapper.classList.remove("open-mouth");
        }
      }, 200);

      // Erupt crumbs
      spawnParticles("sparkle", 10, relativeX + 40, relativeY);

      setTimeout(() => {
        // Walk back
        resetCatAnimationStates(wrapper);
        wrapper.classList.add("walking");
        wrapper.style.setProperty("--walk-x", "-50%");
        wrapper.style.transform = "translate(-50%, 0)";

        setTimeout(() => {
          resetCatAnimationStates(wrapper);
          currentAnimationLock = false;
          state.happiness = Math.min(100, state.happiness + 15);
          earnXp(15);
        }, 800);

      }, 1500);

    }, 800);

  } else if (actionName === "water") {
    // Slide Bowl In
    const bowl = document.getElementById("water-bowl-svg");
    bowl.classList.add("slide-in");
    playWaterSound();

    // Walk to bowl
    wrapper.classList.add("walking");
    wrapper.style.setProperty("--walk-x", "calc(-50% + 40px)");
    wrapper.style.transform = "translate(calc(-50% + 40px), 0)";

    setTimeout(() => {
      wrapper.classList.remove("walking");
      wrapper.classList.add("tilt-cat");
      showBubble("Gulp gulp... fresh water! 💧", 3500, false);
      spawnParticles("water", 10, relativeX + 40, relativeY);

      // Lapping effect (mouth opens and closes quickly)
      let lapCount = 0;
      let lapInterval = setInterval(() => {
        wrapper.classList.toggle("open-mouth");
        lapCount++;
        if (lapCount >= 8) {
          clearInterval(lapInterval);
          wrapper.classList.remove("open-mouth");
        }
      }, 150);

      setTimeout(() => {
        resetCatAnimationStates(wrapper);
        wrapper.classList.add("walking");
        wrapper.style.setProperty("--walk-x", "-50%");
        wrapper.style.transform = "translate(-50%, 0)";
        bowl.classList.remove("slide-in");

        setTimeout(() => {
          resetCatAnimationStates(wrapper);
          currentAnimationLock = false;
          state.energy = Math.min(100, state.energy + 20);
          earnXp(10);
        }, 800);

      }, 1500);

    }, 800);

  } else if (actionName === "play") {
    // Yarn Ball rolls across screen
    const ball = document.getElementById("yarn-ball-svg");
    ball.style.display = "block";
    ball.style.top = "200px";
    ball.style.left = "-50px";

    // Ball rolls in
    ball.style.transition = "left 1s cubic-bezier(0.25, 1, 0.5, 1)";
    setTimeout(() => {
      ball.style.left = "90px";
    }, 50);

    // Cat chases it
    setTimeout(() => {
      wrapper.classList.add("walking");
      wrapper.style.setProperty("--walk-x", "calc(-50% - 20px)");
      wrapper.style.transform = "translate(calc(-50% - 20px), 0)";
      
      setTimeout(() => {
        // Bat ball
        wrapper.classList.remove("walking");
        wrapper.classList.add("waving-paw");
        showBubble("Yarn ball! Pounce! 🧶");
        playMeowSound();

        ball.style.transition = "all 0.8s cubic-bezier(0.25, 1, 0.5, 1)";
        ball.style.left = "320px";
        ball.style.top = "160px";

        setTimeout(() => {
          ball.style.display = "none";
          resetCatAnimationStates(wrapper);
          wrapper.classList.add("walking");
          wrapper.style.setProperty("--walk-x", "-50%");
          wrapper.style.transform = "translate(-50%, 0)";

          setTimeout(() => {
            resetCatAnimationStates(wrapper);
            currentAnimationLock = false;
            state.happiness = Math.min(100, state.happiness + 20);
            state.energy = Math.max(10, state.energy - 10);
            earnXp(20);
          }, 800);

        }, 800);

      }, 800);

    }, 600);

  } else if (actionName === "toy") {
    // Feather drops down
    const feather = document.getElementById("feather-svg");
    feather.style.display = "block";
    feather.classList.add("swing");

    setTimeout(() => {
      // Jump repeatedly
      wrapper.classList.add("jumping");
      showBubble("Catch the feather! 🪶");
      playMeowSound(1.2);

      setTimeout(() => {
        resetCatAnimationStates(wrapper);
        feather.classList.remove("swing");
        setTimeout(() => {
          feather.style.display = "none";
          currentAnimationLock = false;
          state.happiness = Math.min(100, state.happiness + 15);
          earnXp(25);
        }, 500);

      }, 2000);

    }, 600);

  } else if (actionName === "pet") {
    // Petting head reaction
    wrapper.classList.add("waving-paw");
    wrapper.classList.add("happy-cat-blush");
    showBubble("Purrr... more pats! 🥰");
    startPurrSound();
    spawnParticles("heart", 12, relativeX, relativeY - 30);

    setTimeout(() => {
      resetCatAnimationStates(wrapper);
      wrapper.classList.remove("happy-cat-blush");
      stopPurrSound();
      currentAnimationLock = false;
      state.happiness = Math.min(100, state.happiness + 10);
      earnXp(10);
    }, 2500);
  }
}

// Toggle Sleep State
function toggleSleep() {
  const wrapper = catWrappers[state.activeCatIdx];
  if (!wrapper) return;

  if (!state.isSleeping) {
    // Go to sleep
    state.isSleeping = true;
    wrapper.classList.add("sleeping-cat");
    elSleepBtn.innerHTML = "☀️";
    elSleepBtn.setAttribute("data-tooltip", "Wake Up (☀️)");
    showBubble("Zzz... resting my eyes... 💤");
    spawnParticles("zzz", 6, 120, 150);
    
    // Loop Zzz particles
    window.sleepParticlesInterval = setInterval(() => {
      const vRect = document.getElementById("cat-viewport-box").getBoundingClientRect();
      spawnParticles("zzz", 1, vRect.width / 2, vRect.height - 110);
    }, 3000);

  } else {
    // Wake Up and Yawn/Stretch
    state.isSleeping = false;
    if (window.sleepParticlesInterval) clearInterval(window.sleepParticlesInterval);
    
    wrapper.classList.remove("sleeping-cat");
    elSleepBtn.innerHTML = "😴";
    elSleepBtn.setAttribute("data-tooltip", "Put to Sleep (😴)");
    
    // Yawn sound / bubble
    playMeowSound(0.9);
    showBubble("Yawn... stretching my paws! 🐾");
    
    wrapper.classList.add("tilt-cat");
    setTimeout(() => {
      wrapper.classList.remove("tilt-cat");
    }, 1500);
  }
  
  saveState();
}

// ─── Settings Modal Logic ────────────────────────────────────────────────
function openSettings() {
  elUsernameInput.value = state.username;
  elSoundToggle.checked = state.soundEnabled;
  if (elUsageLimitInput) {
    elUsageLimitInput.value = Math.round((state.usageLimitMs || 10 * 60 * 1000) / 60000);
  }
  if (elBreakDurationInput) {
    elBreakDurationInput.value = Math.round((state.breakDurationMs || 5 * 60 * 1000) / 60000);
  }
  elSettingsModal.classList.add("visible");

  // Highlight active cat
  document.querySelectorAll("#breakCompanionGrid .companion-card").forEach(c => {
    c.classList.remove("active");
    if (parseInt(c.dataset.idx) === state.activeCatIdx) {
      c.classList.add("active");
    }
  });
}

function closeSettings() {
  elSettingsModal.classList.remove("visible");
}

function saveSettings() {
  state.username = elUsernameInput.value.replace(/[\x00-\x1f\x7f]/g, "").substring(0, 30).trim() || "Friend";
  state.soundEnabled = elSoundToggle.checked;
  if (elUsageLimitInput) {
    const limitMins = parseInt(elUsageLimitInput.value) || 10;
    state.usageLimitMs = Math.max(1, Math.min(480, limitMins)) * 60000;
  }
  if (elBreakDurationInput) {
    const durationMins = parseInt(elBreakDurationInput.value) || 5;
    state.breakDurationMs = Math.max(1, Math.min(60, durationMins)) * 60000;
  }
  closeSettings();
  saveState();
  
  showBubble(`Settings saved, ${state.username}! 🐾`);
  getAudioContext(); // Resume audio context on click
}

// ─── Storage and State Persistence ───────────────────────────────────────
let saveTimer = null;
function saveState() {
  updateStatsUI(); // Update UI immediately so changes feel instant
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const progress = {
      streak: state.streak,
      xp: state.xp,
      level: state.level,
      unlockedThemes: state.unlockedThemes,
      todayBreaks: state.todayBreaks,
      todayBreaksDate: state.todayBreaksDate,
      lastStreakDate: state.lastStreakDate
    };
    const prefs = {
      username: state.username,
      soundEnabled: state.soundEnabled,
      currentTheme: state.currentTheme,
      catName: state.catName,
      lastVisitDate: state.lastVisitDate,
      happiness: state.happiness,
      energy: state.energy,
      isSleeping: state.isSleeping,
      activeCatIdx: state.activeCatIdx
    };
    if (isExtensionMode) {
      chrome.storage.sync.set({
        catProgress: progress,
        catPrefs: prefs,
        usageLimitMs: state.usageLimitMs,
        breakDurationMs: state.breakDurationMs
      });
    } else {
      localStorage.setItem("cat_progress", JSON.stringify(progress));
      localStorage.setItem("cat_prefs", JSON.stringify(prefs));
      localStorage.setItem("usageLimitMs", state.usageLimitMs.toString());
      localStorage.setItem("breakDurationMs", state.breakDurationMs.toString());
    }
  }, 500);
}

function sanitizeState() {
  state.happiness = Math.max(0, Math.min(100, Number(state.happiness) || 80));
  state.energy = Math.max(0, Math.min(100, Number(state.energy) || 70));
  state.xp = Math.max(0, Math.min(99, Number(state.xp) || 0));
  state.level = Math.max(1, Number(state.level) || 1);
  state.unlockedThemes = Array.isArray(state.unlockedThemes) ? state.unlockedThemes : ["bedroom"];
}

function loadState(callback) {
  if (isExtensionMode) {
    chrome.storage.sync.get(["catProgress", "catPrefs", "usageLimitMs", "breakDurationMs"], (res) => {
      if (res.catProgress || res.catPrefs) {
        if (res.catProgress) state = { ...state, ...res.catProgress };
        if (res.catPrefs) state = { ...state, ...res.catPrefs };
      }
      state.usageLimitMs = res.usageLimitMs || 10 * 60 * 1000;
      state.breakDurationMs = res.breakDurationMs || 5 * 60 * 1000;
      sanitizeState();
      callback();
    });
  } else {
    const storedProgress = localStorage.getItem("cat_progress");
    const storedPrefs = localStorage.getItem("cat_prefs");
    const storedLimit = localStorage.getItem("usageLimitMs");
    const storedDuration = localStorage.getItem("breakDurationMs");
    if (storedProgress) {
      try {
        state = { ...state, ...JSON.parse(storedProgress) };
      } catch(e){}
    }
    if (storedPrefs) {
      try {
        state = { ...state, ...JSON.parse(storedPrefs) };
      } catch(e){}
    }
    const storedLegacy = localStorage.getItem("cat_break_companion_state");
    if (storedLegacy && !storedProgress && !storedPrefs) {
      try {
        state = { ...state, ...JSON.parse(storedLegacy) };
      } catch(e){}
    }
    state.usageLimitMs = storedLimit ? parseInt(storedLimit) : 10 * 60 * 1000;
    state.breakDurationMs = storedDuration ? parseInt(storedDuration) : 5 * 60 * 1000;
    sanitizeState();
    callback();
  }
}

// ─── Welcome / Memory Logic ──────────────────────────────────────────────
function checkVisitMemory() {
  const todayStr = new Date().toDateString();
  const lastVisit = state.lastVisitDate;

  // Setup initial visit memory
  if (!lastVisit) {
    showBubble(`Nice to meet you, ${state.username}! Let's take a break. 🐾`, 5000);
  } else {
    const lastDate = new Date(lastVisit);
    const diffTime = Math.abs(new Date() - lastDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      showBubble(`Welcome back, ${state.username}! Good to see you again. ❤️`, 4000);
    } else if (diffDays === 1) {
      showBubble(`Welcome back, ${state.username}! I missed you since yesterday! 🐾`, 4500);
    } else if (diffDays >= 3) {
      // Sad cat reaction because ignored for too long
      showBubble(`Where were you? I was waiting for days... 😿`, 5000);
      state.happiness = Math.max(20, state.happiness - 25);
      
      // Apply sad classes/actions temporarily
      const wrapper = catWrappers[state.activeCatIdx];
      if (wrapper) {
        wrapper.classList.add("happy-cat-blush"); // makes cheeks red (sad flush)
        setTimeout(() => wrapper.classList.remove("happy-cat-blush"), 3000);
      }
    } else {
      showBubble(`Hey ${state.username}! Glad you're here. Let's rest our eyes. 👀`, 4000);
    }
  }

  // Update visit date
  state.lastVisitDate = todayStr;
  saveState();
}

// ─── Countdown Timer Engine ──────────────────────────────────────────────
function startTimer(endTime) {
  breakEndTime = endTime;

  if (timerInterval) clearInterval(timerInterval);

  function update() {
    const remaining = Math.max(0, breakEndTime - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);

    elCountdown.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    if (remaining <= 0) {
      clearInterval(timerInterval);
      onBreakComplete();
    }
  }

  timerInterval = setInterval(update, 500);
  update();
}

function onBreakComplete() {
  const todayStr = new Date().toDateString();

  // ── Today's break counter (resets every new day) ──
  if (state.todayBreaksDate === todayStr) {
    state.todayBreaks += 1;  // same day → just add
  } else {
    state.todayBreaks = 1;   // new day → reset to 1
    state.todayBreaksDate = todayStr;
  }

  // Ensure unlockedThemes array exists
  if (!state.unlockedThemes) {
    state.unlockedThemes = ["bedroom"];
  }

  // Unlock themes permanently in state
  if (state.todayBreaks >= 2 && !state.unlockedThemes.includes("cafe")) {
    state.unlockedThemes.push("cafe");
  }
  if (state.todayBreaks >= 4 && !state.unlockedThemes.includes("garden")) {
    state.unlockedThemes.push("garden");
  }
  if (state.todayBreaks >= 7 && !state.unlockedThemes.includes("space")) {
    state.unlockedThemes.push("space");
  }

  // ── Day-Streak (consecutive days) ──
  if (state.lastStreakDate !== todayStr) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    if (state.lastStreakDate === yesterdayStr) {
      state.streak += 1;
    } else {
      state.streak = 1;
    }
    state.lastStreakDate = todayStr;
  }

  saveState();

  const suffix = state.todayBreaks === 1 ? 'st' : state.todayBreaks === 2 ? 'nd' : state.todayBreaks === 3 ? 'rd' : 'th';
  const msgs = [
    `Your eyes thank you! 👁️ Break #${state.todayBreaks} done!`,
    `${state.todayBreaks}${suffix} eye save unlocked! Keep it up! 🐾`,
    `Look away from the screen — check! ✅ #${state.todayBreaks} today!`,
    `${state.todayBreaks}${suffix} break nailed! Your cat is proud 😸`
  ];
  showBubble(msgs[Math.min(state.todayBreaks - 1, msgs.length - 1)], 4000);
  playLevelUpSound();

  if (isExtensionMode) {
    chrome.runtime.sendMessage({ type: "BREAK_COMPLETE" });
  } else {
    setTimeout(() => {
      alert(`Aaj ke breaks: ${state.todayBreaks} 🐾`);
    }, 1000);
  }
}

// ─── Cat Reels (Swap Active Cat) ──────────────────────────────────────────
function loadCat(catIdx) {
  const oldCat = catWrappers[state.activeCatIdx];
  const newCat = catWrappers[catIdx];

  // Only hide the old cat if it's a different cat
  if (oldCat && oldCat !== newCat) {
    oldCat.classList.remove("idle");
    oldCat.classList.add("walking", "off-screen-left");
    setTimeout(() => {
      oldCat.classList.add("hidden");
    }, 500);
  }

  state.activeCatIdx = catIdx;
  saveState();

  // Show new cat
  if (newCat) {
    newCat.classList.remove("hidden", "off-screen-left", "off-screen-right", "idle");
    newCat.classList.add("walking", "off-screen-right");
    
    // Force reflow
    newCat.offsetHeight;
    
    newCat.classList.remove("off-screen-right"); // moves to center
    
    setTimeout(() => {
      newCat.classList.remove("walking");
      newCat.classList.add("idle");
    }, 600);
  }
}

// ─── Initialization ──────────────────────────────────────────────────────
function initDOMCache() {
  elContainer = document.getElementById("break-screen-container");
  elStreakVal = document.getElementById("streak-val");
  elFriendshipLvl = document.getElementById("friendship-level");
  elXpProgressBar = document.getElementById("xp-progress-bar");
  elXpText = document.getElementById("xp-text");
  elHappinessVal = document.getElementById("happiness-val");
  elHappinessBar = document.getElementById("happiness-bar");
  elEnergyVal = document.getElementById("energy-val");
  elEnergyBar = document.getElementById("energy-bar");
  elCountdown = document.getElementById("countdown-display");
  elTipsContainer = document.getElementById("tips-container");
  elSpeechBubble = document.getElementById("cat-speech-bubble");
  elThemeBtn = document.getElementById("theme-btn");
  elThemeMenu = document.getElementById("theme-menu");
  elSettingsModal = document.getElementById("settings-modal");
  elSettingsToggleBtn = document.getElementById("settings-toggle-btn");
  elSettingsCloseBtn = document.getElementById("settings-close-btn");
  elSettingsSaveBtn = document.getElementById("settings-save-btn");
  elUsernameInput = document.getElementById("username-input");
  elSoundToggle = document.getElementById("sound-toggle");
  elUsageLimitInput = document.getElementById("usage-limit-input");
  elBreakDurationInput = document.getElementById("break-duration-input");
  elSleepBtn = document.getElementById("sleep-btn");
  elPetHotzone = document.getElementById("pet-hotzone");
  elParticleEmitter = document.getElementById("particle-emitter");

  elNamingModal = document.getElementById("naming-modal");
  elNamingSubmitBtn = document.getElementById("naming-submit-btn");
  elNamingCloseBtn = document.getElementById("naming-close-btn");
  elCatNameInput = document.getElementById("cat-name-input");
  elCatNameDisplay = document.getElementById("cat-name-display");
  elCatNameContainer = document.getElementById("cat-name-container");

  for (let i = 1; i <= 6; i++) {
    catWrappers[i] = document.getElementById("cat-wrapper-" + i);
  }
}

function initEventListeners() {
  // Bottom dock click delegates
  document.querySelectorAll(".dock-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      getAudioContext();
      if (action === "sleep") {
        toggleSleep();
      } else {
        performAction(action);
      }
    });
  });

  // Pet Hotzone events
  if (elPetHotzone) {
    elPetHotzone.addEventListener("mouseenter", () => {
      if (state.isSleeping || currentAnimationLock) return;
      const activeWrapper = catWrappers[state.activeCatIdx];
      if (activeWrapper) {
        activeWrapper.classList.add("happy-cat-blush", "waving-paw");
        showBubble("Purrr... feels so good! 🥰");
        startPurrSound();
        const vRect = document.getElementById("cat-viewport-box").getBoundingClientRect();
        spawnParticles("heart", 4, vRect.width / 2, vRect.height - 110);
      }
    });

    elPetHotzone.addEventListener("mouseleave", () => {
      const activeWrapper = catWrappers[state.activeCatIdx];
      if (activeWrapper) {
        activeWrapper.classList.remove("happy-cat-blush", "waving-paw");
        stopPurrSound();
      }
    });

    elPetHotzone.addEventListener("click", () => {
      getAudioContext();
      performAction("pet");
    });
  }

  // Theme dropdown trigger
  if (elThemeBtn) {
    elThemeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const currentDisplay = elThemeMenu.style.display;
      elThemeMenu.style.display = currentDisplay === "flex" ? "none" : "flex";
    });
  }

  document.addEventListener("click", () => {
    if (elThemeMenu) elThemeMenu.style.display = "none";
  });

  document.querySelectorAll(".theme-option").forEach(opt => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      if (elThemeMenu) elThemeMenu.style.display = "none";
      if (opt.classList.contains("locked")) {
        const needed = opt.id === "theme-opt-cafe" ? "2" : opt.id === "theme-opt-garden" ? "4" : "7";
        alert(`🔒 Theme locked! Complete ${needed} eye saves today to unlock this theme! 👁️`);
        return;
      }
      setTheme(opt.dataset.theme);
    });
  });

  // Settings Toggle
  if (elSettingsToggleBtn) elSettingsToggleBtn.addEventListener("click", openSettings);
  if (elSettingsCloseBtn) elSettingsCloseBtn.addEventListener("click", closeSettings);
  if (elSettingsSaveBtn) elSettingsSaveBtn.addEventListener("click", saveSettings);

  // Settings Companion Selector
  const breakCompanionGrid = document.getElementById("breakCompanionGrid");
  if (breakCompanionGrid) {
    breakCompanionGrid.addEventListener("click", (e) => {
      const card = e.target.closest(".companion-card");
      if (!card) return;
      const catIdx = parseInt(card.dataset.idx);
      if (catIdx >= 1 && catIdx <= 6) {
        document.querySelectorAll("#breakCompanionGrid .companion-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        loadCat(catIdx);
      }
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === elSettingsModal) closeSettings();
    if (e.target === elNamingModal && state.catName) {
      elNamingModal.classList.remove("visible");
    }
  });

  // Naming modal
  if (elCatNameContainer) {
    elCatNameContainer.addEventListener("click", (e) => {
      e.stopPropagation();
      openNamingModal();
    });
  }

  if (elNamingCloseBtn) {
    elNamingCloseBtn.addEventListener("click", () => {
      elNamingModal.classList.remove("visible");
    });
  }

  if (elNamingSubmitBtn) {
    elNamingSubmitBtn.addEventListener("click", () => {
      // Sanitize: strip control chars, limit length
      const rawName = elCatNameInput.value.trim();
      // eslint-disable-next-line no-control-regex
      const newName = rawName.replace(/[\x00-\x1f\x7f]/g, "").substring(0, 30).trim();
      if (!newName) {
        alert("Please enter a valid name for your companion! 🐾");
        return;
      }
      const isFirstNaming = !state.catName;
      state.catName = newName;
      elCatNameDisplay.textContent = state.catName;
      elNamingModal.classList.remove("visible");
      saveState();
      getAudioContext();
      playMeowSound(1.3);
      showBubble(`Meow! My name is ${state.catName}! ❤️`, 4000);
      if (isFirstNaming) {
        setTimeout(() => {
          checkVisitMemory();
          startMeowLoop();
        }, 4200);
      } else {
        startMeowLoop();
      }
    });
  }

  // Sound Button Direct Toggle
  const elSoundToggleBtn = document.getElementById("sound-toggle-btn");
  if (elSoundToggleBtn) {
    elSoundToggleBtn.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;
      saveState();
      getAudioContext();
      showBubble(state.soundEnabled ? "Sound enabled! 🔊" : "Sound muted! 🔇");
    });
  }

  // Snooze Button click listener (requires 3 clicks)
  let snoozeClicks = 0;
  const elSnoozeBtn = document.getElementById("snooze-btn");
  if (elSnoozeBtn) {
    elSnoozeBtn.addEventListener("click", () => {
      snoozeClicks++;
      getAudioContext();
      playMeowSound(0.9);
      if (snoozeClicks < 3) {
        const remaining = 3 - snoozeClicks;
        elSnoozeBtn.textContent = `Snooze 15 min (${remaining} clicks)`;
        elSnoozeBtn.title = `Postpone break by 15 minutes (clicks left: ${remaining})`;
        showBubble(`Click ${remaining} more times to snooze! ⏰`);
      } else {
        showBubble("Snoozing break for 15 minutes... ⏰");
        setTimeout(() => {
          if (isExtensionMode) {
            chrome.runtime.sendMessage({ type: "SNOOZE_BREAK" });
          } else {
            alert("Snoozing break for 15 minutes (Preview Mode)!");
            startTimer(Date.now() + 15 * 60 * 1000);
            snoozeClicks = 0;
            elSnoozeBtn.textContent = `Snooze 15 min (3 clicks)`;
          }
        }, 1000);
      }
    });
  }

  // Skip Break Button click listener
  const elSkipBtn = document.getElementById("skip-btn");
  if (elSkipBtn) {
    elSkipBtn.addEventListener("click", () => {
      getAudioContext();
      playMeowSound(1.2);
      showBubble("Skipping break... See you later! 🐾");
      setTimeout(() => {
        if (isExtensionMode) {
          chrome.runtime.sendMessage({ type: "SKIP_BREAK" });
        } else {
          alert("Skipped break (Preview Mode)!");
          if (timerInterval) clearInterval(timerInterval);
          elCountdown.textContent = "00:00";
        }
      }, 1000);
    });
  }
}

function init() {
  // Resolve all DOM references first
  initDOMCache();

  // Wire up all event listeners
  initEventListeners();

  // Load state
  loadState(() => {
    // Load correct active companion cat index
    if (!state.activeCatIdx || state.activeCatIdx < 1 || state.activeCatIdx > 6) {
      state.activeCatIdx = 1;
    }

    // Ensure unlockedThemes exists
    if (!state.unlockedThemes) {
      state.unlockedThemes = ["bedroom"];
    }

    saveState();

    // Set Theme
    setTheme(state.currentTheme);

    // Load correct active cat
    loadCat(state.activeCatIdx);

    // Update Gamification UI
    updateStatsUI();

    // Check if cat has a name
    if (!state.catName) {
      elNamingModal.classList.add("visible");
      elNamingCloseBtn.style.display = "none";
      elCatNameDisplay.textContent = "Companion";
    } else {
      elCatNameDisplay.textContent = state.catName;
      
      // Check visitor memory
      checkVisitMemory();

      // Start Random Meows
      startMeowLoop();
    }

    // Initialize Mouse Eye-Tracking
    initMouseTracking();

    // Initialize Star twinkles
    initCanvasStars();

    // Start Tips Carousel
    initTipsCarousel();

    // Check Mode (Extension vs Preview)
    const params = new URLSearchParams(window.location.search);
    const urlEndTime = params.get("endTime");

    if (isExtensionMode) {
      // Trust background state for the timer source of truth
      chrome.runtime.sendMessage({ type: "GET_STATE" }, (res) => {
        if (res && res.isOnBreak && res.breakEndTime && res.breakEndTime > Date.now()) {
          startTimer(res.breakEndTime);
        } else {
          // Stale/inactive break, tell background to finish up
          chrome.runtime.sendMessage({ type: "BREAK_COMPLETE" });
        }
      });
    } else {
      if (urlEndTime) {
        const et = parseInt(urlEndTime);
        if (et > Date.now()) {
          startTimer(et);
        } else {
          startTimer(Date.now() + 5 * 60 * 1000);
        }
      } else {
        startTimer(Date.now() + 5 * 60 * 1000);
      }
    }
  });
}

// Naming modal open helper (used by initEventListeners)
function openNamingModal() {
  elCatNameInput.value = state.catName || "";
  elNamingModal.classList.add("visible");
  elNamingCloseBtn.style.display = "block"; // allow closing when renaming
}

// Run Init
window.addEventListener("DOMContentLoaded", () => {
  console.log("Cat Break Companion JS v2 loaded successfully!");
  init();
});

// ─── Wandering Kittens Logic (Throttled to 20fps for performance) ─────────
(function spawnKittens() {
  var KITTENS = [
    // [id, bodyLight, bodyMid, bodyDark, bellyLight, earIn, eyeCol, name]
    ["mochi",   "#ffcc88","#f4a261","#c9722a","#fff3dc","#ffb8b8","#3d2b1f","Mochi"],
    ["luna",    "#c8b8d8","#9b8ea8","#7a6b88","#f0e8f8","#ffb8d8","#2d1f3d","Luna"],
    ["biscuit", "#f0d87a","#e8c87a","#c9a030","#fffae0","#ffd0b8","#3d2f0f","Biscuit"],
    ["ash",     "#d8d8d8","#b5b5b5","#888888","#f5f5f5","#ffd0d8","#2d2d2d","Ash"],
    ["sakura",  "#fcd8e8","#f4b8d0","#e8889a","#fff0f8","#ffcce0","#3d1f2b","Sakura"]
  ];

  function mkSVG(id, bL, bM, bD, belly, earIn, eye) {
    var bodyColor = bM;
    var bellyColor = belly;
    var outlineColor = "#4d2c25"; // Cohesive hand-drawn outline
    var earInnerColor = earIn;
    
    // Unique markings for each cat
    var markings = '';
    if (id === 'mochi') {
      // Orange stripes on forehead and cheeks
      markings = '<path d="M37 21 Q42 27 42 22 M42 19 Q42 25 47 21" stroke="'+bD+'" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
               + '<path d="M22 36 Q28 36 26 40" stroke="'+bD+'" stroke-width="2" fill="none" stroke-linecap="round"/>'
               + '<path d="M62 36 Q56 36 58 40" stroke="'+bD+'" stroke-width="2" fill="none" stroke-linecap="round"/>';
    } else if (id === 'biscuit') {
      // Cute brown eye patch around left eye
      markings = '<ellipse cx="33" cy="40" rx="9" ry="9" fill="'+bD+'" opacity="0.95"/>';
    } else if (id === 'luna') {
      // Cute white forehead blaze
      markings = '<polygon points="42,21 40,29 42,32 44,29" fill="'+bellyColor+'"/>';
    } else if (id === 'sakura') {
      // Forehead flower markings
      markings = '<circle cx="42" cy="22" r="3" fill="'+bD+'"/>'
               + '<circle cx="39" cy="22" r="2" fill="'+bD+'"/>'
               + '<circle cx="45" cy="22" r="2" fill="'+bD+'"/>';
    } else if (id === 'ash') {
      // Grey tabby stripes
      markings = '<path d="M38 20 L42 26 L46 20" stroke="'+bD+'" stroke-width="2" fill="none" stroke-linecap="round"/>';
    }

    return '<svg viewBox="0 0 90 100" xmlns="http://www.w3.org/2000/svg">'
    // Shadow
    +'<ellipse cx="45" cy="95" rx="26" ry="4.5" fill="#000" opacity="0.14"/>'
    
    // Tail
    +'<g class="k-tail" style="transform-origin: 58px 75px;">'
      +'<path d="M58 75 C72 65 74 42 62 46 C54 48 54 64 58 75 Z" fill="'+bodyColor+'" stroke="'+outlineColor+'" stroke-width="2.5" stroke-linejoin="round"/>'
      +'<path d="M60 48 C57 50 56 54 58 57 Z" fill="'+bL+'"/>'
    +'</g>'
    
    // Body
    +'<ellipse cx="42" cy="72" rx="25" ry="19" fill="'+bodyColor+'" stroke="'+outlineColor+'" stroke-width="2.5"/>'
    +'<ellipse cx="42" cy="75" rx="14" ry="11" fill="'+bellyColor+'" stroke="'+outlineColor+'" stroke-width="2"/>'
    
    // Left Paw
    +'<g class="k-lpaw-group" style="transform-origin: 24px 88px;">'
      +'<ellipse cx="24" cy="88" rx="8.5" ry="6" fill="'+bodyColor+'" stroke="'+outlineColor+'" stroke-width="2"/>'
      +'<line x1="21" y1="87" x2="21" y2="91" stroke="'+outlineColor+'" stroke-width="1.2"/>'
      +'<line x1="25" y1="86" x2="25" y2="90" stroke="'+outlineColor+'" stroke-width="1.2"/>'
    +'</g>'
    
    // Right Paw
    +'<g class="k-rpaw-group" style="transform-origin: 60px 88px;">'
      +'<ellipse cx="60" cy="88" rx="8.5" ry="6" fill="'+bodyColor+'" stroke="'+outlineColor+'" stroke-width="2"/>'
      +'<line x1="57" y1="86" x2="57" y2="90" stroke="'+outlineColor+'" stroke-width="1.2"/>'
      +'<line x1="61" y1="87" x2="61" y2="91" stroke="'+outlineColor+'" stroke-width="1.2"/>'
    +'</g>'
    
    // Head
    +'<g class="k-head" style="transform-origin: 42px 40px;">'
      // Ears
      +'<polygon points="20,44 13,12 36,31" fill="'+bodyColor+'" stroke="'+outlineColor+'" stroke-width="2.5" stroke-linejoin="round"/>'
      +'<polygon points="22,38 17,20 31,30" fill="'+earInnerColor+'"/>'
      +'<polygon points="64,44 71,12 48,31" fill="'+bodyColor+'" stroke="'+outlineColor+'" stroke-width="2.5" stroke-linejoin="round"/>'
      +'<polygon points="62,38 67,20 53,30" fill="'+earInnerColor+'"/>'
      
      // Face base
      +'<circle cx="42" cy="40" r="22" fill="'+bodyColor+'" stroke="'+outlineColor+'" stroke-width="2.5"/>'
      + markings
      
      // Eyes
      +'<circle cx="33" cy="40" r="4.5" fill="'+eye+'"/>'
      +'<circle cx="34.5" cy="38.5" r="1.5" fill="white"/>'
      +'<circle cx="51" cy="40" r="4.5" fill="'+eye+'"/>'
      +'<circle cx="52.5" cy="38.5" r="1.5" fill="white"/>'
      
      // Blush
      +'<ellipse cx="26" cy="45" rx="4" ry="2.5" fill="#ffb8b8" opacity="0.6"/>'
      +'<ellipse cx="58" cy="45" rx="4" ry="2.5" fill="#ffb8b8" opacity="0.6"/>'
      
      // Nose & Mouth
      +'<polygon points="42,43 40,41 44,41" fill="#ff9cb9"/>'
      +'<path d="M39,45 Q42,47 42,45 Q42,47 45,45" stroke="'+outlineColor+'" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
      
      // Whiskers
      +'<line x1="8" y1="41" x2="20" y2="43" stroke="'+outlineColor+'" stroke-width="1.2" stroke-linecap="round"/>'
      +'<line x1="8" y1="46" x2="20" y2="45" stroke="'+outlineColor+'" stroke-width="1.2" stroke-linecap="round"/>'
      +'<line x1="64" y1="43" x2="76" y2="41" stroke="'+outlineColor+'" stroke-width="1.2" stroke-linecap="round"/>'
      +'<line x1="64" y1="45" x2="76" y2="46" stroke="'+outlineColor+'" stroke-width="1.2" stroke-linecap="round"/>'
    +'</g>'
    +'</svg>';
  }

  window.addEventListener("DOMContentLoaded", function() {
    var stage = document.getElementById("kitten-stage");
    if (!stage) return;
    var ks = [];

    function scareKitten(k) {
      if (k.state === "running" && k.spd > 0.2) return;
      
      // Dash to the opposite side of the screen
      if (k.x < 50) {
        k.tx = 55 + Math.random() * 38;
      } else {
        k.tx = 2 + Math.random() * 38;
      }
      k.ty = 1 + Math.random() * 4;
      k.state = "running";
      k.spd = (0.20 + Math.random() * 0.12) * 3; // fast dash speed!
      k.el.classList.remove("sitting", "walking");
      k.el.classList.add("running");
      
      // Face the target direction
      var faceDir = k.tx > k.x;
      if (faceDir !== k.faceR) {
        k.faceR = faceDir;
      }
      
      // Startle animation: scale up slightly for 300ms
      k.el.style.transform = (k.faceR ? "" : "scaleX(-1)") + " scale(1.15)";
      setTimeout(function() {
        if (k.state === "running") {
          k.el.style.transform = k.faceR ? "" : "scaleX(-1)";
        }
      }, 300);
    }

    KITTENS.forEach(function(d, i) {
      var el = document.createElement("div");
      el.className = "mini-kitten sitting";
      el.title = d[7];
      el.style.width  = "68px";
      el.style.height = "68px";
      el.innerHTML = mkSVG(d[0],d[1],d[2],d[3],d[4],d[5],d[6]);
      var sx = 4 + i * 18, sy = 1 + Math.random() * 4;
      el.style.left   = sx + "%";
      el.style.bottom = sy + "%";
      stage.appendChild(el);
      
      var k = { el:el, x:sx, y:sy, tx:sx, ty:sy, spd:0.21, state: "sitting", faceR:true,
                pauseUntil: Date.now() + i*600 + Math.random()*1200 };
      ks.push(k);

      // Scare kitten if hovered directly!
      el.addEventListener("mouseenter", function() {
        scareKitten(k);
      });
      el.addEventListener("mousemove", function() {
        scareKitten(k);
      });
    });

    // Scare kittens if the cursor moves near them over the bottom dock (buttons)
    var dock = document.querySelector(".bottom-dock");
    if (dock) {
      dock.addEventListener("mousemove", function(e) {
        var mx = e.clientX;
        var my = e.clientY;
        ks.forEach(function(k) {
          var rect = k.el.getBoundingClientRect();
          var kx = rect.left + rect.width / 2;
          var ky = rect.top + rect.height / 2;
          var dx = mx - kx;
          var dy = my - ky;
          var dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 85) { // 85px threshold
            scareKitten(k);
          }
        });
      });
    }

    // Scare kittens if the cursor moves near them over the top bar
    var topbar = document.querySelector(".top-bar");
    if (topbar) {
      topbar.addEventListener("mousemove", function(e) {
        var mx = e.clientX;
        var my = e.clientY;
        ks.forEach(function(k) {
          var rect = k.el.getBoundingClientRect();
          var kx = rect.left + rect.width / 2;
          var ky = rect.top + rect.height / 2;
          var dx = mx - kx;
          var dy = my - ky;
          var dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 85) { // 85px threshold
            scareKitten(k);
          }
        });
      });
    }

    function pick(k) {
      k.tx = 2 + Math.random() * 88;
      // Restrict to bottom ground level (1% to 5% height) to match VS Code pets
      k.ty = 1 + Math.random() * 4;
      
      // 40% chance to run/sprint, 60% chance to walk
      if (Math.random() < 0.40) {
        k.state = "running";
        k.spd = (0.16 + Math.random() * 0.14) * 3;
        k.el.classList.remove("sitting", "walking");
        k.el.classList.add("running");
      } else {
        k.state = "walking";
        k.spd = (0.04 + Math.random() * 0.07) * 3;
        k.el.classList.remove("sitting", "running");
        k.el.classList.add("walking");
      }
    }

    function tick() {
      var now = Date.now();
      ks.forEach(function(k) {
        if (k.state === "sitting") {
          if (now >= k.pauseUntil) {
            pick(k);
          }
        } else {
          var dx = k.tx - k.x, dy = k.ty - k.y;
          var dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 1.8) {
            k.state = "sitting";
            k.el.classList.remove("walking", "running");
            k.el.classList.add("sitting");
            k.pauseUntil = now + 800 + Math.random()*3500;
          } else {
            var step = Math.min(k.spd, dist);
            k.x += (dx/dist)*step;
            k.y += (dy/dist)*step;
            if ((dx > 0) !== k.faceR) {
              k.faceR = dx > 0;
              k.el.style.transform = k.faceR ? "" : "scaleX(-1)";
            }
            k.el.style.left   = k.x + "%";
            k.el.style.bottom = k.y + "%";
          }
        }
      });
    }
    setInterval(tick, 50);
  });
})();
