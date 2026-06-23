// Content Script — injected into every page
// Shows/hides the full-screen cat break iframe on SHOW_CAT / HIDE_CAT messages.
// Tracks page visibility to send usage heartbeats when on target sites.

if (typeof __catGatekeeperInjected === 'undefined') {
  var __catGatekeeperInjected = true;

  (function () {

  let iframeEl = null;
  let heartbeatInterval = null;
  let bodyObserver = null;
  let iframeObserver = null;
  let isBreakActive = false;

  function preventInteraction(e) {
    if (iframeEl && (e.target === iframeEl || iframeEl.contains(e.target))) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function blockInputs() {
    const events = [
      "keydown", "keyup", "keypress", 
      "mousedown", "mouseup", "click", "contextmenu",
      "pointerdown", "pointerup"
    ];
    events.forEach(evt => {
      window.addEventListener(evt, preventInteraction, { capture: true, passive: false });
    });
  }

  function unblockInputs() {
    const events = [
      "keydown", "keyup", "keypress", 
      "mousedown", "mouseup", "click", "contextmenu",
      "pointerdown", "pointerup"
    ];
    events.forEach(evt => {
      window.removeEventListener(evt, preventInteraction, { capture: true });
    });
  }

  function enforceStyles() {
    if (!iframeEl) return;
    iframeEl.style.setProperty("position", "fixed", "important");
    iframeEl.style.setProperty("top", "0px", "important");
    iframeEl.style.setProperty("left", "0px", "important");
    iframeEl.style.setProperty("width", "100vw", "important");
    iframeEl.style.setProperty("height", "100vh", "important");
    iframeEl.style.setProperty("border", "none", "important");
    iframeEl.style.setProperty("z-index", "2147483647", "important");
    iframeEl.style.setProperty("background", "#090615", "important");
    iframeEl.style.setProperty("color-scheme", "dark", "important");
    iframeEl.style.setProperty("display", "block", "important");
    iframeEl.style.setProperty("visibility", "visible", "important");
    iframeEl.style.setProperty("opacity", "1", "important");
  }

  function enforceBodyStyles() {
    if (!isBreakActive) return;
    if (document.documentElement && (
      document.documentElement.style.display === "none" ||
      document.documentElement.style.visibility === "hidden" ||
      parseFloat(document.documentElement.style.opacity) === 0
    )) {
      document.documentElement.style.setProperty("display", "block", "important");
      document.documentElement.style.setProperty("visibility", "visible", "important");
      document.documentElement.style.setProperty("opacity", "1", "important");
    }
    if (document.body && (
      document.body.style.display === "none" ||
      document.body.style.visibility === "hidden" ||
      parseFloat(document.body.style.opacity) === 0
    )) {
      document.body.style.setProperty("display", "block", "important");
      document.body.style.setProperty("visibility", "visible", "important");
      document.body.style.setProperty("opacity", "1", "important");
    }
  }

  function startObserving() {
    if (!iframeEl) return;
    if (bodyObserver || iframeObserver) return;

    bodyObserver = new MutationObserver(() => {
      if (!isBreakActive) return;
      bodyObserver.disconnect();
      
      enforceBodyStyles();

      const currentIframe = document.getElementById("cat-gatekeeper-iframe");
      if (!currentIframe) {
        const savedEndTime = iframeEl ? iframeEl.dataset.endTime : "";
        iframeEl = null;
        if (iframeObserver) {
          iframeObserver.disconnect();
          iframeObserver = null;
        }
        showOverlay(savedEndTime);
      } else {
        bodyObserver.observe(document.documentElement, { childList: true, attributes: true, attributeFilter: ["style", "class"] });
        if (document.body) {
          bodyObserver.observe(document.body, { childList: true, attributes: true, attributeFilter: ["style", "class"] });
        }
      }
    });

    bodyObserver.observe(document.documentElement, { childList: true, attributes: true, attributeFilter: ["style", "class"] });
    if (document.body) {
      bodyObserver.observe(document.body, { childList: true, attributes: true, attributeFilter: ["style", "class"] });
    }

    iframeObserver = new MutationObserver(() => {
      if (!isBreakActive) return;
      iframeObserver.disconnect();
      enforceStyles();
      if (iframeEl) {
        iframeObserver.observe(iframeEl, { attributes: true, attributeFilter: ["style", "class"] });
      }
    });
    iframeObserver.observe(iframeEl, { attributes: true, attributeFilter: ["style", "class"] });
  }

  function stopObserving() {
    if (bodyObserver) {
      bodyObserver.disconnect();
      bodyObserver = null;
    }
    if (iframeObserver) {
      iframeObserver.disconnect();
      iframeObserver = null;
    }
  }

  function showOverlay(breakEndTime) {
    isBreakActive = true;
    blockInputs();

    if (document.getElementById("cat-gatekeeper-iframe")) {
      iframeEl = document.getElementById("cat-gatekeeper-iframe");
      enforceStyles();
      startObserving();
      return;
    }

    iframeEl = document.createElement("iframe");
    iframeEl.id = "cat-gatekeeper-iframe";
    iframeEl.dataset.endTime = breakEndTime;
    iframeEl.src = chrome.runtime.getURL(`break.html?endTime=${breakEndTime}`);
    enforceStyles();

    const parent = document.body || document.documentElement;
    if (parent) {
      parent.appendChild(iframeEl);
      startObserving();
    }

    if (!document.body) {
      const bodyObserver = new MutationObserver((mutations, observer) => {
        if (document.body) {
          observer.disconnect();
          if (iframeEl && iframeEl.parentNode) {
            iframeEl.parentNode.removeChild(iframeEl);
          }
          document.body.appendChild(iframeEl);
          startObserving();
        }
      });
      bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function removeOverlay() {
    isBreakActive = false;
    stopObserving();
    unblockInputs();
    if (iframeEl) {
      iframeEl.remove();
      iframeEl = null;
    }
    const existing = document.getElementById("cat-gatekeeper-iframe");
    if (existing) {
      existing.remove();
    }
  }

  // Helper to safely verify context and cleanup if invalidated
  function checkContext() {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) {
      cleanupOrphanedScript();
      return false;
    }
    return true;
  }

  function cleanupOrphanedScript() {
    stopHeartbeat();
    stopObserving();
    unblockInputs();
    removeOverlay();
  }

  // ─── Listen for background messages ────────────────────────────────────────
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      console.log("[Cat Gatekeeper] Content script received message:", msg);
      if (!checkContext()) {
        console.log("[Cat Gatekeeper] Message ignored: Invalid extension context");
        return;
      }
      if (msg.type === "SHOW_CAT") {
        console.log("[Cat Gatekeeper] Showing overlay until:", msg.breakEndTime);
        showOverlay(msg.breakEndTime);
      }
      if (msg.type === "HIDE_CAT") {
        console.log("[Cat Gatekeeper] Hiding overlay!");
        removeOverlay();
      }
    });
  } catch (e) {
    console.error("[Cat Gatekeeper] Error in onMessage listener:", e);
    cleanupOrphanedScript();
  }

  // ─── Listen for storage changes (Fail-proof state syncing) ────────────────
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (!checkContext()) return;
      if (areaName === "local") {
        if (changes.isOnBreak) {
          if (changes.isOnBreak.newValue === false) {
            console.log("[Cat Gatekeeper] Storage updated: Break inactive. Removing overlay.");
            removeOverlay();
          } else if (changes.isOnBreak.newValue === true) {
            chrome.storage.local.get(["breakEndTime"], (data) => {
              if (chrome.runtime.lastError || !checkContext()) return;
              if (data && data.breakEndTime) {
                console.log("[Cat Gatekeeper] Storage updated: Break active. Showing overlay.");
                showOverlay(data.breakEndTime);
              }
            });
          }
        }
      }
    });
  } catch (e) {
    console.error("[Cat Gatekeeper] Error in storage listener:", e);
    cleanupOrphanedScript();
  }

  // ─── On page load: sync if break is already active ─────────────────────────
  try {
    chrome.storage.local.get(["isOnBreak", "breakEndTime"], (data) => {
      if (chrome.runtime.lastError || !checkContext()) return;
      if (data && data.isOnBreak && data.breakEndTime && data.breakEndTime > Date.now()) {
        showOverlay(data.breakEndTime);
      }
    });
  } catch (e) {
    cleanupOrphanedScript();
  }

  // ─── Visibility Tracking & Heartbeat ────────────────────────────────────────
  // Check if this page is a target site. If yes, send a heartbeat every 2 seconds
  // while the page is actively visible to the user.
  try {
    chrome.runtime.sendMessage({ type: "CHECK_TARGET" }, (isTarget) => {
      if (chrome.runtime.lastError || !checkContext()) return;
      if (isTarget) {
        startHeartbeat();
        document.addEventListener("visibilitychange", handleVisibilityChange);
      }
    });
  } catch (e) {
    cleanupOrphanedScript();
  }

  function startHeartbeat() {
    if (heartbeatInterval) return;
    heartbeatInterval = setInterval(() => {
      if (!checkContext()) {
        clearInterval(heartbeatInterval);
        return;
      }
      if (document.visibilityState === "visible") {
        try {
          chrome.runtime.sendMessage({ type: "HEARTBEAT" }, () => {
            if (chrome.runtime.lastError) {
              clearInterval(heartbeatInterval);
            }
          });
        } catch (err) {
          clearInterval(heartbeatInterval);
        }
      }
    }, 2000);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      startHeartbeat();
    } else {
      stopHeartbeat();
    }
  }

  window.addEventListener("pagehide", () => {
    stopHeartbeat();
    stopObserving();
    unblockInputs();
  });

  })();
}
