// Popup script

let currentSettings = null;
let breakTimerInterval = null;

// ─── Init ───────────────────────────────────────────────────────────────────
function init() {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (res) => {
    if (!res) return;
    currentSettings = res.settings;
    renderSettings(res.settings);
    renderUsage(res.usageMs, res.settings.usageLimitMs);
    if (res.isOnBreak && res.breakEndTime) {
      showBreakBanner(res.breakEndTime);
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
  const pct = Math.min(100, (usageMs / limitMs) * 100);
  document.getElementById("usageText").textContent = `${mins} min`;
  document.getElementById("usageBar").style.width = `${pct}%`;
}

function renderSiteTags(sites) {
  const container = document.getElementById("siteTags");
  container.innerHTML = "";
  sites.forEach(site => {
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.innerHTML = `${site} <span class="tag-remove" data-site="${site}">×</span>`;
    container.appendChild(tag);
  });
  container.querySelectorAll(".tag-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      currentSettings.targetSites = currentSettings.targetSites.filter(s => s !== btn.dataset.site);
      renderSiteTags(currentSettings.targetSites);
    });
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
  const usageLimit = parseInt(document.getElementById("usageLimit").value) || 10;
  const breakDuration = parseInt(document.getElementById("breakDuration").value) || 5;

  const newSettings = {
    usageLimitMs: usageLimit * 60 * 1000,
    breakDurationMs: breakDuration * 60 * 1000,
    targetSites: currentSettings.targetSites
  };

  chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: newSettings });
  currentSettings = newSettings;

  const toast = document.getElementById("savedToast");
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2000);
});

// ─── Reset ───────────────────────────────────────────────────────────────────
document.getElementById("resetBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "RESET_USAGE" }, () => {
    document.getElementById("breakBanner").classList.remove("visible");
    clearInterval(breakTimerInterval);
    renderUsage(0, currentSettings.usageLimitMs);
  });
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

// ─── Start ───────────────────────────────────────────────────────────────────
init();
