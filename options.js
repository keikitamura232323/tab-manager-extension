"use strict";

// 設定を読み込む
async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    displayMode: "sidePanel",
    autoShowPanel: true,
    compactMode: false,
    darkMode: false,
  });

  // 旧設定のマイグレーション: floatingRight / floatingLeft → floating
  if (settings.displayMode === "floatingRight" || settings.displayMode === "floatingLeft") {
    settings.displayMode = "floating";
    await chrome.storage.sync.set({ displayMode: "floating" });
  }

  // ラジオボタン
  const radio = document.querySelector(
    `input[name="displayMode"][value="${settings.displayMode}"]`
  );
  if (radio) radio.checked = true;

  // チェックボックス
  document.getElementById("autoShowPanel").checked = settings.autoShowPanel;
  document.getElementById("compactMode").checked = settings.compactMode;
  document.getElementById("darkMode").checked = settings.darkMode;

  // ダークモード適用
  if (settings.darkMode) {
    document.body.classList.add("dark-mode");
  }
}

// 設定を保存
async function saveSettings() {
  const displayMode = document.querySelector(
    'input[name="displayMode"]:checked'
  ).value;
  const autoShowPanel = document.getElementById("autoShowPanel").checked;
  const compactMode = document.getElementById("compactMode").checked;
  const darkMode = document.getElementById("darkMode").checked;

  // ダークモード即時反映
  document.body.classList.toggle("dark-mode", darkMode);

  const settings = { displayMode, autoShowPanel, compactMode, darkMode };
  await chrome.storage.sync.set(settings);

  showSaveMessage();
  // background.js は chrome.storage.onChanged で自動検知するため sendMessage 不要
}

// 保存メッセージを表示
function showSaveMessage() {
  const message = document.getElementById("save-message");
  message.style.display = "block";
  setTimeout(() => {
    message.style.display = "none";
  }, 3000);
}

// イベントリスナー
document.querySelectorAll('input[type="radio"]').forEach((radio) => {
  radio.addEventListener("change", saveSettings);
});

document.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
  checkbox.addEventListener("change", saveSettings);
});

// 初期化
loadSettings();
