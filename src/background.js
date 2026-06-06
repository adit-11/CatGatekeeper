// Background Service Worker
// Every 30 minutes → show 5-min break on ALL open tabs → auto-hide → repeat.

const BREAK_DURATION_MS = 5 * 60 * 1000;   // 5 minutes
const BREAK_INTERVAL_MIN = 30;              // 30 minutes between breaks

// ─── State helpers ────────────────────────────────────────────────────────────

async function getBreakState() {
  return new Promise(resolve => {
    chrome.storage.local.get(["isOnBreak", "breakEndTime"], (data) => {
      let isOnBreak    = data.isOnBreak    || false;
      let breakEndTime = data.breakEndTime || null;

      // Self-heal: clear stale break state
      if (isOnBreak && breakEndTime && breakEndTime <= Date.now()) {
        isOnBreak    = false;
        breakEndTime = null;
        chrome.storage.local.set({ isOnBreak: false, breakEndTime: null });
      }
      resolve({ isOnBreak, breakEndTime });
    });
  });
}

// ─── Broadcast to ALL real tabs ───────────────────────────────────────────────

function broadcastToAllTabs(msg) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id && tab.url && !tab.url.startsWith("chrome")) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    });
  });
}

// ─── Break Management ─────────────────────────────────────────────────────────

async function triggerBreak() {
  const { isOnBreak } = await getBreakState();
  if (isOnBreak) return;

  const end = Date.now() + BREAK_DURATION_MS;
  await chrome.storage.local.set({ isOnBreak: true, breakEndTime: end });

  broadcastToAllTabs({
    type: "SHOW_CAT",
    breakDurationMs: BREAK_DURATION_MS,
    breakEndTime: end
  });

  // Auto-end the break after 5 minutes
  chrome.alarms.create("breakEnd", { when: end });
}

async function endBreak() {
  await chrome.storage.local.set({ isOnBreak: false, breakEndTime: null });
  broadcastToAllTabs({ type: "HIDE_CAT" });

  // Schedule next break in 30 minutes
  chrome.alarms.create("breakTrigger", { delayInMinutes: BREAK_INTERVAL_MIN });
}

// ─── Chrome Alarm Listeners ───────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "breakTrigger") triggerBreak();
  if (alarm.name === "breakEnd")     endBreak();
});

// ─── On Install: start the first 30-min countdown ────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.clearAll(() => {
    chrome.alarms.create("breakTrigger", { delayInMinutes: BREAK_INTERVAL_MIN });
  });
});

// ─── On Browser Startup: resume if alarm was lost ────────────────────────────

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.get("breakTrigger", (alarm) => {
    if (!alarm) {
      chrome.alarms.create("breakTrigger", { delayInMinutes: BREAK_INTERVAL_MIN });
    }
  });
});

// ─── Tab sync: re-show overlay on newly opened/navigated tabs ────────────────

chrome.tabs.onActivated.addListener((info) => {
  chrome.tabs.get(info.tabId, async (tab) => {
    if (!tab || !tab.url || tab.url.startsWith("chrome")) return;
    const { isOnBreak, breakEndTime } = await getBreakState();
    if (isOnBreak && breakEndTime) {
      chrome.tabs.sendMessage(tab.id, {
        type: "SHOW_CAT",
        breakDurationMs: BREAK_DURATION_MS,
        breakEndTime
      }).catch(() => {});
    }
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.url || tab.url.startsWith("chrome")) return;
  const { isOnBreak, breakEndTime } = await getBreakState();
  if (isOnBreak && breakEndTime) {
    chrome.tabs.sendMessage(tabId, {
      type: "SHOW_CAT",
      breakDurationMs: BREAK_DURATION_MS,
      breakEndTime
    }).catch(() => {});
  }
});

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "BREAK_COMPLETE") {
    // User clicked "Done" — end break now and restart 30-min cycle
    endBreak().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "GET_STATE") {
    getBreakState().then((state) => sendResponse(state));
    return true;
  }
});
