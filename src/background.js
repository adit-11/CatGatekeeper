// Background Service Worker
// Manages usage limits, targets, and breaks.
// Uses visibility heartbeats + chrome.idle to track active usage on target sites.

// ─── Constants & Setup ────────────────────────────────────────────────────────

let cachedUsageMs = 0;
let isUsageLoaded = false;

function getTodayUsage(callback) {
  if (isUsageLoaded) {
    callback(cachedUsageMs);
  } else {
    chrome.storage.local.get(["todayUsageMs"], (data) => {
      cachedUsageMs = data.todayUsageMs || 0;
      isUsageLoaded = true;
      callback(cachedUsageMs);
    });
  }
}

function getTodayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// Helper to check if a URL is on a target site list
function isTargetSite(urlStr, targetSites) {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return targetSites.some(site => {
      const cleanSite = site.toLowerCase().replace(/^www\./, "");
      return host === cleanSite || host.endsWith("." + cleanSite);
    });
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
      cachedUsageMs = 0;
      isUsageLoaded = true;
      chrome.storage.local.set({ todayDate: todayStr, todayUsageMs: 0 });
    }
  });
}

// ─── Break Management ─────────────────────────────────────────────────────────

function triggerBreak(durationMs) {
  chrome.storage.local.get(["isOnBreak"], (localData) => {
    if (localData.isOnBreak) return;

    const end = Date.now() + durationMs;
    chrome.storage.local.set({ isOnBreak: true, breakEndTime: end }, () => {
      broadcastToAllTabs({
        type: "SHOW_CAT",
        breakDurationMs: durationMs,
        breakEndTime: end
      });
      // Explicitly notify the current active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: "SHOW_CAT",
            breakDurationMs: durationMs,
            breakEndTime: end
          }).catch(() => {});
        }
      });
      // Set alarm to wake up and end break automatically
      chrome.alarms.create("breakEndAlarm", { when: end });
    });
  });
}

async function endBreak() {
  cachedUsageMs = 0;
  isUsageLoaded = true;
  await new Promise(resolve => {
    chrome.storage.local.set({ isOnBreak: false, breakEndTime: null, todayUsageMs: 0 }, resolve);
  });
  broadcastToAllTabs({ type: "HIDE_CAT" });
}

// ─── Service Worker Startup State Restoration ──────────────────────────────────
function initServiceWorkerState() {
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
  }
});

// ─── On Install/Startup: Initialize states ───────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // Use storage.sync for settings
  chrome.storage.sync.get(["usageLimitMs"], (data) => {
    if (!data.usageLimitMs) {
      chrome.storage.sync.set({
        usageLimitMs: 10 * 60 * 1000, // default 10 minutes
        breakDurationMs: 5 * 60 * 1000, // default 5 minutes
        targetSites: ["youtube.com", "facebook.com", "instagram.com", "twitter.com", "linkedin.com", "reddit.com"]
      });
    }
  });

  // Use storage.local for daily tracking stats
  cachedUsageMs = 0;
  isUsageLoaded = true;
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
    if (!tab || !tab.url || tab.url.startsWith("chrome")) return;
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
  if (changeInfo.status !== "complete") return;
  if (!tab.url || tab.url.startsWith("chrome")) return;
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
    chrome.storage.sync.get({
      targetSites: ["youtube.com", "facebook.com", "instagram.com", "twitter.com", "linkedin.com", "reddit.com"]
    }, (settings) => {
      const isTarget = isTargetSite(senderUrl, settings.targetSites);
      sendResponse(isTarget);
    });
    return true; // async
  }

  if (msg.type === "HEARTBEAT") {
    const senderTabId = sender.tab ? sender.tab.id : null;
    if (!senderTabId) return true;

    chrome.tabs.get(senderTabId, (tab) => {
      if (chrome.runtime.lastError || !tab || !tab.active || !tab.url) {
        return;
      }

      chrome.storage.sync.get({
        targetSites: ["youtube.com", "facebook.com", "instagram.com", "twitter.com", "linkedin.com", "reddit.com"],
        usageLimitMs: 10 * 60 * 1000,
        breakDurationMs: 5 * 60 * 1000
      }, (settings) => {
        if (!isTargetSite(tab.url, settings.targetSites)) {
          return;
        }

        chrome.windows.get(tab.windowId, (win) => {
          if (chrome.runtime.lastError || !win || !win.focused) {
            return;
          }

          chrome.idle.queryState(30, (idleState) => {
            if (idleState === "active") {
              getTodayUsage((currentUsage) => {
                chrome.storage.local.get(["isOnBreak"], (localData) => {
                  if (localData.isOnBreak) return;

                  cachedUsageMs += 2000;
                  chrome.storage.local.set({ todayUsageMs: cachedUsageMs });

                  if (cachedUsageMs >= settings.usageLimitMs) {
                    triggerBreak(settings.breakDurationMs);
                  }
                });
              });
            }
          });
        });
      });
    });
    return true;
  }

  if (msg.type === "BREAK_COMPLETE") {
    chrome.alarms.clear("breakEndAlarm", () => {
      endBreak().then(() => sendResponse({ ok: true }));
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
            targetSites: ["youtube.com", "facebook.com", "instagram.com", "twitter.com", "linkedin.com", "reddit.com"]
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
    chrome.storage.sync.set(msg.settings, () => {
      sendResponse({ ok: true });
    });
    return true; // async
  }

  if (msg.type === "RESET_USAGE") {
    cachedUsageMs = 0;
    isUsageLoaded = true;
    chrome.storage.local.set({ todayUsageMs: 0, isOnBreak: false, breakEndTime: null }, () => {
      chrome.alarms.clear("breakEndAlarm", () => {
        broadcastToAllTabs({ type: "HIDE_CAT" });
        sendResponse({ ok: true });
      });
    });
    return true; // async
  }
});
