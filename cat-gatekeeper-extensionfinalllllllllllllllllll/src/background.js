// Background Service Worker
// Manages usage limits, targets, and breaks.
// Uses visibility heartbeats + chrome.idle to track active usage on target sites.

// ─── Constants & Setup ────────────────────────────────────────────────────────

let usageQueue = Promise.resolve();

function getTodayUsage(callback) {
  chrome.storage.local.get(["todayUsageMs"], (data) => {
    callback(data.todayUsageMs || 0);
  });
}

function incrementTodayUsage(amountMs, limitMs, onLimitReached) {
  usageQueue = usageQueue.then(() => {
    return new Promise((resolve) => {
      chrome.storage.local.get(["todayUsageMs", "isOnBreak", "snoozeUntil"], (data) => {
        if (data.isOnBreak) {
          console.log("[Cat Gatekeeper] Increment blocked: Already on break");
          resolve();
          return;
        }
        const isSnoozed = data.snoozeUntil && data.snoozeUntil > Date.now();
        if (isSnoozed) {
          console.log("[Cat Gatekeeper] Increment blocked: Break is currently snoozed");
          resolve();
          return;
        }
        const newUsage = (data.todayUsageMs || 0) + amountMs;
        console.log(`[Cat Gatekeeper] Incrementing usage: ${newUsage}ms / ${limitMs}ms`);
        chrome.storage.local.set({ todayUsageMs: newUsage }, () => {
          if (newUsage >= limitMs) {
            onLimitReached();
          }
          resolve();
        });
      });
    });
  });
}

function getTodayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Helper to check if a URL is a standard trackable web page
function isTargetSite(urlStr) {
  try {
    if (!urlStr) return false;
    const url = new URL(urlStr);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (e) {
    return false;
  }
}

// ─── Broadcast to ALL real tabs ───────────────────────────────────────────────

function broadcastToAllTabs(msg) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    });
  });
}

// ─── Daily Reset Helper ────────────────────────────────────────────────────────

function checkDailyReset() {
  const todayStr = getTodayDateString();
  chrome.storage.local.get(["todayDate"], (data) => {
    if (data.todayDate !== todayStr) {
      chrome.storage.local.set({ 
        todayDate: todayStr, 
        todayUsageMs: 0,
        snoozeUntil: null  // clear stale snooze on new day
      });
    }
  });
}

// ─── Break Management ─────────────────────────────────────────────────────────

function triggerBreak(durationMs) {
  chrome.storage.local.get(["isOnBreak"], (localData) => {
    if (localData.isOnBreak) return;

    const end = Date.now() + durationMs;
    chrome.storage.local.set({ isOnBreak: true, breakEndTime: end, snoozeUntil: null }, () => {
      broadcastToAllTabs({
        type: "SHOW_CAT",
        breakDurationMs: durationMs,
        breakEndTime: end
      });
      // Set alarm to wake up and end break automatically
      chrome.alarms.create("breakEndAlarm", { when: end });
    });
  });
}

async function endBreak() {
  await new Promise(resolve => {
    chrome.storage.local.set({ isOnBreak: false, breakEndTime: null, todayUsageMs: 0, snoozeUntil: null }, resolve);
  });
  broadcastToAllTabs({ type: "HIDE_CAT" });
}

async function endBreakNoReset() {
  await new Promise(resolve => {
    chrome.storage.local.set({ isOnBreak: false, breakEndTime: null }, resolve);
  });
  broadcastToAllTabs({ type: "HIDE_CAT" });
}

// ─── Service Worker Startup State Restoration ──────────────────────────────────
function initServiceWorkerState() {
  // Setup alarm to perform daily check every 15 minutes
  chrome.alarms.create("dailyResetAlarm", { periodInMinutes: 15 });

  chrome.storage.local.get(["isOnBreak", "breakEndTime"], (data) => {
    if (data.isOnBreak && data.breakEndTime) {
      const remaining = data.breakEndTime - Date.now();
      if (remaining <= 0) {
        endBreak();
      } else {
        chrome.alarms.create("breakEndAlarm", { when: data.breakEndTime });
      }
    }
  });
}

// Restore state/alarms immediately when worker starts up
initServiceWorkerState();

// ─── Chrome Alarm Listeners ───────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "breakEndAlarm") {
    endBreak();
  } else if (alarm.name === "dailyResetAlarm") {
    checkDailyReset();
  }
});

// ─── On Install/Startup: Initialize states ───────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details && details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
  }
  // Use storage.sync for settings
  chrome.storage.sync.get(["usageLimitMs"], (data) => {
    if (!data.usageLimitMs) {
      chrome.storage.sync.set({
        usageLimitMs: 10 * 60 * 1000, // default 10 minutes
        breakDurationMs: 5 * 60 * 1000, // default 5 minutes
        showCat: true,
        activeCatIdx: 1
      });
    }
  });

  // Use storage.local for daily tracking stats
  chrome.storage.local.set({
    isOnBreak: false,
    breakEndTime: null,
    todayUsageMs: 0,
    todayDate: getTodayDateString()
  });
});

chrome.runtime.onStartup.addListener(() => {
  checkDailyReset();
});

// ─── Tab sync: re-show overlay on newly opened/navigated tabs ────────────────

chrome.tabs.onActivated.addListener((info) => {
  chrome.tabs.get(info.tabId, (tab) => {
    if (!tab || !tab.url) return;
    if (tab.url.startsWith("chrome") || tab.url.startsWith("edge") || tab.url.startsWith("about:") || tab.url.startsWith("file:") || tab.url.startsWith("chrome-extension")) return;
    chrome.storage.local.get(["isOnBreak", "breakEndTime"], (data) => {
      if (data.isOnBreak && data.breakEndTime) {
        chrome.tabs.sendMessage(tab.id, {
          type: "SHOW_CAT",
          breakEndTime: data.breakEndTime
        }).catch(() => {});
      }
    });
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab || !tab.url) return;
  if (tab.url.startsWith("chrome") || tab.url.startsWith("edge") || tab.url.startsWith("about:") || tab.url.startsWith("file:") || tab.url.startsWith("chrome-extension")) return;
  chrome.storage.local.get(["isOnBreak", "breakEndTime"], (data) => {
    if (data.isOnBreak && data.breakEndTime) {
      chrome.tabs.sendMessage(tabId, {
        type: "SHOW_CAT",
        breakEndTime: data.breakEndTime
      }).catch(() => {});
    }
  });
});

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  checkDailyReset();

  if (msg.type === "CHECK_TARGET") {
    const senderUrl = sender.tab ? sender.tab.url : "";
    const isTarget = isTargetSite(senderUrl);
    sendResponse(isTarget);
    return false;
  }

  if (msg.type === "HEARTBEAT") {
    const senderTabId = sender.tab ? sender.tab.id : null;
    if (!senderTabId) {
      console.log("[Cat Gatekeeper] Heartbeat blocked: No sender tab ID");
      return true;
    }

    chrome.tabs.get(senderTabId, (tab) => {
      if (chrome.runtime.lastError || !tab || !tab.active || !tab.url) {
        console.log("[Cat Gatekeeper] Heartbeat blocked: Tab not active, no URL, or error", chrome.runtime.lastError);
        return;
      }

      chrome.storage.sync.get({
        usageLimitMs: 10 * 60 * 1000,
        breakDurationMs: 5 * 60 * 1000,
        showCat: true
      }, (settings) => {
        if (!settings.showCat) {
          console.log("[Cat Gatekeeper] Heartbeat blocked: showCat setting is false");
          return;
        }
        if (!isTargetSite(tab.url)) {
          console.log("[Cat Gatekeeper] Heartbeat blocked: Not a target site protocol (HTTP/HTTPS required). URL:", tab.url);
          return;
        }

        // Check if the user is active, idle, or locked
        chrome.idle.queryState(15, (idleState) => {
          if (idleState === "idle" || idleState === "locked") {
            console.log("[Cat Gatekeeper] Heartbeat blocked: User is idle or locked.");
            return;
          }

          // Increment usage directly since the content script already validates page visibility
          incrementTodayUsage(2000, settings.usageLimitMs, () => {
            console.log("[Cat Gatekeeper] LIMIT REACHED! Triggering break screen.");
            triggerBreak(settings.breakDurationMs);
          });
        });
      });
    });
    return true;
  }

  if (msg.type === "BREAK_COMPLETE") {
    console.log("[Cat Gatekeeper] BREAK_COMPLETE message received.");
    chrome.alarms.clear("breakEndAlarm", (wasCleared) => {
      console.log("[Cat Gatekeeper] Cleared alarm breakEndAlarm. Was active:", wasCleared);
      endBreak().then(() => {
        console.log("[Cat Gatekeeper] Break ended via normal completion. Hiding overlay.");
        sendResponse({ ok: true });
      });
    });
    return true; // async
  }

  if (msg.type === "SKIP_BREAK") {
    console.log("[Cat Gatekeeper] SKIP_BREAK message received.");
    chrome.alarms.clear("breakEndAlarm", (wasCleared) => {
      console.log("[Cat Gatekeeper] Cleared alarm breakEndAlarm. Was active:", wasCleared);
      endBreak().then(() => {
        console.log("[Cat Gatekeeper] Break ended via Skip. Hiding overlay.");
        sendResponse({ ok: true });
      });
    });
    return true; // async
  }

  if (msg.type === "GET_STATE") {
    getTodayUsage((currentUsage) => {
      Promise.all([
        new Promise(resolve => {
          chrome.storage.local.get(["isOnBreak", "breakEndTime"], resolve);
        }),
        new Promise(resolve => {
          chrome.storage.sync.get({
            usageLimitMs: 10 * 60 * 1000,
            breakDurationMs: 5 * 60 * 1000,
            showCat: true,
            activeCatIdx: 1
          }, resolve);
        })
      ]).then(([localData, settings]) => {
        sendResponse({
          isOnBreak: localData.isOnBreak || false,
          breakEndTime: localData.breakEndTime || null,
          usageMs: currentUsage,
          settings: settings
        });
      });
    });
    return true; // async
  }

  if (msg.type === "SAVE_SETTINGS") {
    const isExtensionOrigin = sender.url && sender.url.startsWith(chrome.runtime.getURL(""));
    if (sender.tab && !isExtensionOrigin) {
      sendResponse({ ok: false, error: "Unauthorized" });
      return true;
    }
    if (!msg.settings) {
      sendResponse({ ok: false, error: "Missing settings" });
      return true;
    }
    const { usageLimitMs, breakDurationMs, showCat, activeCatIdx } = msg.settings;
    if (typeof usageLimitMs !== "number" || usageLimitMs < 60000 || usageLimitMs > 28800000) {
      sendResponse({ ok: false, error: "Invalid usageLimitMs" });
      return true;
    }
    if (typeof breakDurationMs !== "number" || breakDurationMs < 60000 || breakDurationMs > 3600000) {
      sendResponse({ ok: false, error: "Invalid breakDurationMs" });
      return true;
    }
    if (typeof showCat !== "boolean") {
      sendResponse({ ok: false, error: "Invalid showCat" });
      return true;
    }
    if (typeof activeCatIdx !== "number" || activeCatIdx < 1 || activeCatIdx > 6) {
      sendResponse({ ok: false, error: "Invalid activeCatIdx" });
      return true;
    }

    chrome.storage.sync.set({ usageLimitMs, breakDurationMs, showCat, activeCatIdx }, () => {
      sendResponse({ ok: true });
    });
    return true; // async
  }

  if (msg.type === "TRIGGER_MANUAL_BREAK") {
    chrome.storage.sync.get({
      breakDurationMs: 5 * 60 * 1000
    }, (settings) => {
      triggerBreak(settings.breakDurationMs);
      sendResponse({ ok: true });
    });
    return true; // async
  }

  if (msg.type === "SNOOZE_BREAK") {
    const snoozeDuration = 15 * 60 * 1000; // 15 minutes
    const snoozeUntil = Date.now() + snoozeDuration;
    chrome.storage.local.set({ snoozeUntil: snoozeUntil }, () => {
      chrome.alarms.clear("breakEndAlarm", () => {
        endBreakNoReset().then(() => sendResponse({ ok: true }));
      });
    });
    return true; // async
  }

  if (msg.type === "RESET_USAGE") {
    chrome.storage.local.set({ todayUsageMs: 0, isOnBreak: false, breakEndTime: null, snoozeUntil: null }, () => {
      chrome.alarms.clear("breakEndAlarm", () => {
        broadcastToAllTabs({ type: "HIDE_CAT" });
        sendResponse({ ok: true });
      });
    });
    return true; // async
  }
});
