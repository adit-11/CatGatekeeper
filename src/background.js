// Background Service Worker
// Manages usage limits, targets, and breaks.
// Uses visibility heartbeats + chrome.idle to track active usage on target sites.

// ─── Constants & Setup ────────────────────────────────────────────────────────

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
      if (tab.id && tab.url && !tab.url.startsWith("chrome")) {
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
      // Set alarm to wake up and end break automatically
      chrome.alarms.create("breakEndAlarm", { when: end });
    });
  });
}

async function endBreak() {
  await new Promise(resolve => {
    chrome.storage.local.set({ isOnBreak: false, breakEndTime: null, todayUsageMs: 0 }, resolve);
  });
  broadcastToAllTabs({ type: "HIDE_CAT" });
}

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
    // Only count if user is not idle
    chrome.idle.queryState(30, (idleState) => {
      if (idleState === "active") {
        chrome.storage.local.get(["todayUsageMs", "isOnBreak"], (localData) => {
          if (localData.isOnBreak) return;

          chrome.storage.sync.get({
            usageLimitMs: 10 * 60 * 1000,
            breakDurationMs: 5 * 60 * 1000
          }, (settings) => {
            const newUsage = (localData.todayUsageMs || 0) + 2000; // heartbeat is every 2 seconds
            chrome.storage.local.set({ todayUsageMs: newUsage });

            if (newUsage >= settings.usageLimitMs) {
              triggerBreak(settings.breakDurationMs);
            }
          });
        });
      }
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
    Promise.all([
      new Promise(resolve => {
        chrome.storage.local.get(["isOnBreak", "breakEndTime", "todayUsageMs"], resolve);
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
        usageMs: localData.todayUsageMs || 0,
        settings: settings
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
    chrome.storage.local.set({ todayUsageMs: 0, isOnBreak: false, breakEndTime: null }, () => {
      chrome.alarms.clear("breakEndAlarm", () => {
        broadcastToAllTabs({ type: "HIDE_CAT" });
        sendResponse({ ok: true });
      });
    });
    return true; // async
  }
});
