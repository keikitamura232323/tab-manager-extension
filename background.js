"use strict";

// =============================================
// 表示モードの適用
// =============================================
async function applyDisplayMode(mode) {
  // 旧設定の互換: floatingRight / floatingLeft → floating 扱い
  const useSidePanel = mode === "sidePanel";
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: useSidePanel });
}

// 起動時に設定を適用
chrome.storage.sync.get({ displayMode: "sidePanel" }).then((s) => {
  applyDisplayMode(s.displayMode);
});

// storage 変更を監視
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.displayMode) {
    applyDisplayMode(changes.displayMode.newValue);
  }
});

// =============================================
// ツールバーアイコンのクリック処理
// =============================================
// sidePanel モード → openPanelOnActionClick: true → Chrome が自動で開く（このリスナー未発火）
// floating モード  → openPanelOnActionClick: false → このリスナーが発火
// スクリプト注入が禁止されるURL判定
function isRestrictedUrl(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|edge|about|devtools):/.test(url);
}

// 制限付きページ用フォールバック: ポップアップウィンドウで開く
function openFallbackWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL("side-panel.html"),
    type: "popup",
    width: 420,
    height: 600,
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  const settings = await chrome.storage.sync.get({ displayMode: "sidePanel" });
  let mode = settings.displayMode;

  // 旧設定のマイグレーション
  if (mode === "floatingRight" || mode === "floatingLeft") {
    mode = "floating";
    chrome.storage.sync.set({ displayMode: "floating" });
  }

  if (mode !== "floating") return;

  // chrome://newtab 等の制限付きURLではフローティング不可 → ポップアップウィンドウで代替
  if (isRestrictedUrl(tab.url)) {
    openFallbackWindow();
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content-script.js"],
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (typeof window.tabflowToggle === "function") {
          window.tabflowToggle("left");
        }
      },
    });
  } catch (err) {
    // スクリプト注入失敗時はポップアップウィンドウにフォールバック
    console.warn("TabFlow: script injection failed, falling back to popup window:", err.message);
    openFallbackWindow();
  }
});

// =============================================
// インストール/アップデート時
// =============================================
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ displayMode: "sidePanel" }).then((s) => {
    applyDisplayMode(s.displayMode);
  });
});
