"use strict";

// 二重注入防止
if (window._tabflowLoaded) {
  // 既に読み込み済みの場合は何もしない
} else {
  window._tabflowLoaded = true;

  // =============================================
  // 状態管理（DOM ベース）
  // =============================================
  const CONTAINER_ID = "tabflow-floating-panel-container";

  function getContainer() {
    return document.getElementById(CONTAINER_ID);
  }

  // =============================================
  // グローバルトグル関数（background.js から executeScript 経由で呼び出される）
  // =============================================
  window.tabflowToggle = function (position) {
    const existing = getContainer();
    if (existing) {
      closeFloatingPanel();
    } else {
      openFloatingPanel(position);
    }
  };

  // =============================================
  // iframe 内からの postMessage 受信
  // =============================================
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "tabflow-close-panel") {
      closeFloatingPanel();
    } else if (e.data && e.data.type === "tabflow-drag-start") {
      startDrag(e.data.clientX, e.data.clientY);
    }
  });

  // =============================================
  // 浮動パネルを開く
  // =============================================
  async function openFloatingPanel(position) {
    if (getContainer()) return;

    // 保存済み状態を取得
    const saved = await getSavedState();

    const container = document.createElement("div");
    container.id = CONTAINER_ID;

    const width = (saved && saved.width) ? saved.width : "380px";
    const height = (saved && saved.height) ? saved.height : "560px";
    const top = (saved && saved.top) ? saved.top : "20px";

    let posStyle;
    if (saved && saved.left) {
      posStyle = `left: ${saved.left};`;
    } else {
      posStyle = position === "right" ? "right: 20px;" : "left: 20px;";
    }

    container.style.cssText = `
      position: fixed;
      ${posStyle}
      top: ${top};
      width: ${width};
      height: ${height};
      z-index: 2147483647;
      background-color: #fff;
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
      overflow: hidden;
      resize: both;
      min-width: 300px;
      min-height: 400px;
    `;

    const iframe = document.createElement("iframe");
    iframe.src = chrome.runtime.getURL("floating-panel.html");
    iframe.style.cssText = "width:100%;height:100%;border:none;display:block;";

    container.appendChild(iframe);
    document.body.appendChild(container);

    // ドラッグ機能
    setupDrag(container);

    // リサイズ時に状態保存
    container._resizeObserver = new ResizeObserver(() => saveState(container, position));
    container._resizeObserver.observe(container);
    container._position = position;
  }

  // =============================================
  // 浮動パネルを閉じる
  // =============================================
  function closeFloatingPanel() {
    const container = getContainer();
    if (!container) return;

    saveState(container, container._position);

    if (container._resizeObserver) {
      container._resizeObserver.disconnect();
    }
    container.remove();
  }

  // =============================================
  // ドラッグ機能
  // =============================================
  function setupDrag(container) {
    container.addEventListener("mousedown", (e) => {
      const rect = container.getBoundingClientRect();
      if (e.clientY - rect.top > 40) return;
      startDrag(e.screenX, e.screenY);
      e.preventDefault();
    });
  }

  function startDrag(startScreenX, startScreenY) {
    const container = getContainer();
    if (!container) return;

    const iframe = container.querySelector("iframe");
    const startLeft = container.offsetLeft;
    const startTop = container.offsetTop;

    // right → left に変換
    if (container.style.right) {
      const rect = container.getBoundingClientRect();
      container.style.left = rect.left + "px";
      container.style.right = "";
    }

    if (iframe) iframe.style.pointerEvents = "none";

    function onMouseMove(e) {
      const dx = e.screenX - startScreenX;
      const dy = e.screenY - startScreenY;
      let newLeft = startLeft + dx;
      let newTop = startTop + dy;

      const w = container.offsetWidth;
      const h = container.offsetHeight;
      if (newLeft < 0) newLeft = 0;
      if (newTop < 0) newTop = 0;
      if (newLeft + w > window.innerWidth) newLeft = window.innerWidth - w;
      if (newTop + h > window.innerHeight) newTop = window.innerHeight - h;

      container.style.left = newLeft + "px";
      container.style.top = newTop + "px";
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (iframe) iframe.style.pointerEvents = "";
      saveState(container, container._position);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  // =============================================
  // 状態の保存・復元
  // =============================================
  async function saveState(container, position) {
    if (!container || !container.isConnected) return;
    const rect = container.getBoundingClientRect();
    await chrome.storage.local.set({
      floatingPanelState: {
        position: position || "right",
        left: rect.left + "px",
        top: rect.top + "px",
        width: rect.width + "px",
        height: rect.height + "px",
      },
    });
  }

  async function getSavedState() {
    const result = await chrome.storage.local.get(["floatingPanelState"]);
    return result.floatingPanelState || null;
  }
}
