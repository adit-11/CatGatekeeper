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

  function startObserving() {
    if (!iframeEl) return;
    if (bodyObserver || iframeObserver) return;

    // Observe body only for child additions/removals (subtree: false)
    bodyObserver = new MutationObserver(() => {
      if (!isBreakActive) return;
      const currentIframe = document.getElementById("cat-gatekeeper-iframe");
      if (!currentIframe) {
        // Iframe was deleted, re-create it
        const savedEndTime = iframeEl ? iframeEl.dataset.endTime : "";
        iframeEl = null;
        if (iframeObserver) {
          iframeObserver.disconnect();
          iframeObserver = null;
        }
        showOverlay(savedEndTime);
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: false });

    // Observe the iframe itself for style/class changes
    iframeObserver = new MutationObserver(() => {
      if (!isBreakActive) return;
      const currentIframe = document.getElementById("cat-gatekeeper-iframe");
      if (currentIframe) {
        const style = currentIframe.getAttribute("style") || "";
        if (!style.includes("2147483647") || style.includes("display: none") || style.includes("visibility: hidden") || style.includes("opacity: 0")) {
          enforceStyles();
        }
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

    document.body.appendChild(iframeEl);
    startObserving();
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

  // ─── Listen for background messages ────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SHOW_CAT") showOverlay(msg.breakEndTime);
    if (msg.type === "HIDE_CAT") removeOverlay();
  });

  // ─── On page load: sync if break is already active ─────────────────────────
  chrome.storage.local.get(["isOnBreak", "breakEndTime"], (data) => {
    if (data.isOnBreak && data.breakEndTime && data.breakEndTime > Date.now()) {
      showOverlay(data.breakEndTime);
    }
  });

  // ─── Visibility Tracking & Heartbeat ────────────────────────────────────────
  // Check if this page is a target site. If yes, send a heartbeat every 2 seconds
  // while the page is actively visible to the user.
  chrome.runtime.sendMessage({ type: "CHECK_TARGET" }, (isTarget) => {
    if (isTarget) {
      startHeartbeat();
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
  });

  function startHeartbeat() {
    if (heartbeatInterval) return;
    heartbeatInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        chrome.runtime.sendMessage({ type: "HEARTBEAT" }).catch(() => {
          // If extension context invalidated (reloaded), clear interval
          clearInterval(heartbeatInterval);
        });
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

  window.addEventListener("unload", () => {
    stopHeartbeat();
    stopObserving();
    unblockInputs();
  });

  })();
}
