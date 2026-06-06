// Content Script — injected into every page
// Shows/hides the full-screen cat break iframe on SHOW_CAT / HIDE_CAT messages.

(function () {
  if (window.__catGatekeeperInjected) return;
  window.__catGatekeeperInjected = true;

  let iframeEl = null;

  function showOverlay(breakEndTime) {
    if (iframeEl) return;

    iframeEl = document.createElement("iframe");
    iframeEl.id = "cat-gatekeeper-iframe";
    iframeEl.src = chrome.runtime.getURL(`break.html?endTime=${breakEndTime}`);
    iframeEl.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      border: none !important;
      z-index: 2147483647 !important;
      background: #090615 !important;
      color-scheme: dark !important;
    `;
    document.body.appendChild(iframeEl);
  }

  function removeOverlay() {
    if (iframeEl) {
      iframeEl.remove();
      iframeEl = null;
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

})();
