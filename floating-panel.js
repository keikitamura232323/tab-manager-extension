"use strict";

// =============================================
// DOM参照
// =============================================
const tabListEl = document.getElementById("tabList");
const tabCountEl = document.getElementById("tabCount");
const groupCountEl = document.getElementById("groupCount");
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearch");
const emptyStateEl = document.getElementById("emptyState");
const toastContainer = document.getElementById("toastContainer");
const closePanelBtn = document.getElementById("closePanel");
const dragHandle = document.getElementById("dragHandle");

// =============================================
// 定数
// =============================================
const INACTIVE_THRESHOLD_MS = 60 * 60 * 1000;

const FAVICON_COLORS = [
  "#2563EB", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#0891B2", "#D97706",
];

const GROUP_COLOR_MAP = {
  grey:   "#9CA3AF",
  blue:   "#2563EB",
  red:    "#EF4444",
  yellow: "#F59E0B",
  green:  "#10B981",
  pink:   "#EC4899",
  purple: "#8B5CF6",
  cyan:   "#06B6D4",
};

const UNGROUPED_KEY = "ungrouped";

let searchQuery = "";

// =============================================
// ファビコンユーティリティ
// =============================================

function getInitials(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname.split(".")[0].substring(0, 2).toUpperCase();
  } catch {
    return "??";
  }
}

function getColorFromDomain(domain) {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FAVICON_COLORS[Math.abs(hash) % FAVICON_COLORS.length];
}

function showFaviconFallback(container, url) {
  container.innerHTML = "";
  const initials = getInitials(url);
  let domain = "";
  try { domain = new URL(url).hostname; } catch { /* ignore */ }

  const div = document.createElement("div");
  div.className = "favicon-initials";
  div.textContent = initials;
  div.style.backgroundColor = getColorFromDomain(domain);
  container.appendChild(div);
}

function createFaviconElement(tab) {
  const container = document.createElement("div");
  container.className = "favicon-container";

  if (tab.favIconUrl) {
    const img = document.createElement("img");
    img.className = "favicon";
    img.alt = "";
    img.src = tab.favIconUrl;
    img.addEventListener("error", () => showFaviconFallback(container, tab.url));
    container.appendChild(img);
  } else {
    showFaviconFallback(container, tab.url);
  }
  return container;
}

// =============================================
// トースト通知
// =============================================

function showToast(message, type = "success") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// =============================================
// タブ操作
// =============================================

async function addToReadingList(tab) {
  try {
    await chrome.readingList.addEntry({
      url: tab.url,
      title: tab.title || "(無題)",
      hasBeenRead: false,
    });
    showToast("リーディングリストに追加しました");
  } catch (err) {
    const msg = err.message.includes("duplicate")
      ? "既にリーディングリストに登録済みです"
      : "リーディングリストへの追加に失敗しました";
    showToast(msg, "error");
  }
}

async function addToBookmarks(tab) {
  try {
    await chrome.bookmarks.create({
      title: tab.title || "(無題)",
      url: tab.url,
    });
    showToast("ブックマークに追加しました");
  } catch {
    showToast("ブックマークへの追加に失敗しました", "error");
  }
}

async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
    showToast("タブを閉じました");
  } catch {
    showToast("タブを閉じられませんでした", "error");
  }
}

// =============================================
// 折りたたみ状態
// =============================================

async function getCollapsedGroups() {
  const result = await chrome.storage.local.get(["collapsedGroups"]);
  return result.collapsedGroups || [];
}

async function toggleGroup(groupKey) {
  const collapsed = await getCollapsedGroups();
  const key = String(groupKey);
  const idx = collapsed.indexOf(key);

  if (idx > -1) {
    collapsed.splice(idx, 1);
  } else {
    collapsed.push(key);
  }

  await chrome.storage.local.set({ collapsedGroups: collapsed });
  renderTabs();
}

// =============================================
// 検索フィルター
// =============================================

function filterTabs(tabs) {
  if (!searchQuery) return tabs;
  return tabs.filter((tab) => {
    const t = (tab.title || "").toLowerCase();
    const u = (tab.url || "").toLowerCase();
    return t.includes(searchQuery) || u.includes(searchQuery);
  });
}

// =============================================
// 非アクティブ時間の表示文字列
// =============================================

function formatInactiveTime(lastAccessed, now) {
  if (typeof lastAccessed !== "number") return null;
  const diff = now - lastAccessed;
  if (diff < INACTIVE_THRESHOLD_MS) return null;

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間`;
  return `${Math.floor(hours / 24)}日`;
}

// =============================================
// タブアイテム生成
// =============================================

function createTabItem(tab, now) {
  const inactiveText = formatInactiveTime(tab.lastAccessed, now);

  const li = document.createElement("li");
  li.className = "tab-item";
  if (tab.active) li.classList.add("active");
  if (inactiveText) li.classList.add("inactive");

  li.appendChild(createFaviconElement(tab));

  const info = document.createElement("div");
  info.className = "tab-info";

  const titleRow = document.createElement("div");
  titleRow.className = "tab-title-row";

  const title = document.createElement("div");
  title.className = "tab-title";
  title.textContent = tab.title || "(無題)";
  titleRow.appendChild(title);

  if (inactiveText) {
    const badge = document.createElement("span");
    badge.className = "inactive-badge";
    badge.textContent = inactiveText;
    titleRow.appendChild(badge);
  }

  const url = document.createElement("div");
  url.className = "tab-url";
  url.textContent = tab.url || "";

  info.appendChild(titleRow);
  info.appendChild(url);
  li.appendChild(info);

  const actions = document.createElement("div");
  actions.className = "tab-actions";

  const readingBtn = document.createElement("button");
  readingBtn.className = "action-btn btn-reading";
  readingBtn.textContent = "\uD83D\uDCD6";
  readingBtn.title = "リーディングリストに追加";
  readingBtn.addEventListener("click", (e) => { e.stopPropagation(); addToReadingList(tab); });

  const bookmarkBtn = document.createElement("button");
  bookmarkBtn.className = "action-btn btn-bookmark";
  bookmarkBtn.textContent = "\u2B50";
  bookmarkBtn.title = "ブックマークに追加";
  bookmarkBtn.addEventListener("click", (e) => { e.stopPropagation(); addToBookmarks(tab); });

  const closeBtn = document.createElement("button");
  closeBtn.className = "action-btn btn-close";
  closeBtn.textContent = "\u2715";
  closeBtn.title = "このタブを閉じる";
  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); closeTab(tab.id); });

  actions.appendChild(readingBtn);
  actions.appendChild(bookmarkBtn);
  actions.appendChild(closeBtn);
  li.appendChild(actions);

  li.addEventListener("click", () => {
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  });

  return li;
}

// =============================================
// グループセクション生成
// =============================================

function createGroupSection({ key, title, color, tabs, isCollapsed, now, isUngrouped }) {
  const filtered = filterTabs(tabs);
  if (searchQuery && filtered.length === 0) return null;

  const section = document.createElement("li");
  section.className = "tab-group" + (isUngrouped ? " ungrouped" : "");

  const header = document.createElement("div");
  header.className = "group-header";
  header.addEventListener("click", () => toggleGroup(key));

  const toggle = document.createElement("span");
  toggle.className = "group-toggle";
  toggle.textContent = isCollapsed ? "\u25B6" : "\u25BC";

  const dot = document.createElement("span");
  dot.className = "group-color-dot";
  dot.style.backgroundColor = color;

  const name = document.createElement("span");
  name.className = "group-name";
  name.textContent = title;

  const count = document.createElement("span");
  count.className = "group-count";
  count.textContent = searchQuery
    ? `${filtered.length}/${tabs.length}個`
    : `${tabs.length}個`;

  header.appendChild(toggle);
  header.appendChild(dot);
  header.appendChild(name);
  header.appendChild(count);
  section.appendChild(header);

  if (!isCollapsed) {
    const tabsContainer = document.createElement("ul");
    tabsContainer.className = "group-tabs";
    if (!isUngrouped) {
      tabsContainer.style.borderLeftColor = color;
    }

    for (const tab of filtered) {
      tabsContainer.appendChild(createTabItem(tab, now));
    }
    section.appendChild(tabsContainer);
  }

  return section;
}

// =============================================
// メイン描画
// =============================================

async function renderTabs() {
  const [groups, tabs, collapsed] = await Promise.all([
    chrome.tabGroups.query({}),
    chrome.tabs.query({}),
    getCollapsedGroups(),
  ]);

  tabCountEl.textContent = tabs.length;
  groupCountEl.textContent = groups.length;

  tabListEl.innerHTML = "";
  const now = Date.now();

  const groupedMap = new Map();
  const ungroupedTabs = [];

  for (const tab of tabs) {
    if (tab.groupId !== undefined && tab.groupId !== -1) {
      if (!groupedMap.has(tab.groupId)) groupedMap.set(tab.groupId, []);
      groupedMap.get(tab.groupId).push(tab);
    } else {
      ungroupedTabs.push(tab);
    }
  }

  let visibleSections = 0;

  for (const group of groups) {
    const groupTabs = groupedMap.get(group.id) || [];
    if (groupTabs.length === 0) continue;

    const el = createGroupSection({
      key: String(group.id),
      title: group.title || "無名グループ",
      color: GROUP_COLOR_MAP[group.color] || GROUP_COLOR_MAP.grey,
      tabs: groupTabs,
      isCollapsed: collapsed.includes(String(group.id)),
      now,
      isUngrouped: false,
    });
    if (el) { tabListEl.appendChild(el); visibleSections++; }
  }

  if (ungroupedTabs.length > 0) {
    const el = createGroupSection({
      key: UNGROUPED_KEY,
      title: "グループなし",
      color: GROUP_COLOR_MAP.grey,
      tabs: ungroupedTabs,
      isCollapsed: collapsed.includes(UNGROUPED_KEY),
      now,
      isUngrouped: true,
    });
    if (el) { tabListEl.appendChild(el); visibleSections++; }
  }

  emptyStateEl.style.display = visibleSections === 0 ? "flex" : "none";
}

// =============================================
// 検索イベント
// =============================================

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  clearSearchBtn.style.display = searchQuery ? "flex" : "none";
  renderTabs();
});

clearSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchQuery = "";
  clearSearchBtn.style.display = "none";
  searchInput.focus();
  renderTabs();
});

// =============================================
// パネル閉じるボタン
// =============================================

closePanelBtn.addEventListener("click", () => {
  // 親フレーム（content-script）に閉じるメッセージを送信
  window.parent.postMessage({ type: "tabflow-close-panel" }, "*");
});

// =============================================
// ドラッグハンドル（親フレームへマウスイベントを転送）
// =============================================

dragHandle.addEventListener("mousedown", (e) => {
  // ボタン類のクリックは除外
  if (e.target.closest(".header-actions")) return;
  window.parent.postMessage({
    type: "tabflow-drag-start",
    clientX: e.screenX,
    clientY: e.screenY,
  }, "*");
});

// =============================================
// モード切替ドロップダウン
// =============================================

const settingsBtn = document.getElementById("settingsBtn");
const modeDropdown = document.getElementById("modeDropdown");
let dropdownOverlay = null;

function closeModeDropdown() {
  modeDropdown.style.display = "none";
  if (dropdownOverlay) {
    dropdownOverlay.remove();
    dropdownOverlay = null;
  }
}

async function openModeDropdown() {
  const settings = await chrome.storage.sync.get({ displayMode: "sidePanel" });
  let current = settings.displayMode;

  // 旧設定のマイグレーション
  if (current === "floatingRight" || current === "floatingLeft") {
    current = "floating";
  }

  document.querySelectorAll(".mode-dropdown-item[data-mode]").forEach((item) => {
    const check = item.querySelector(".mode-check");
    if (item.dataset.mode === current) {
      check.textContent = "\u2713";
      item.classList.add("active");
    } else {
      check.textContent = "";
      item.classList.remove("active");
    }
  });

  dropdownOverlay = document.createElement("div");
  dropdownOverlay.className = "mode-dropdown-overlay";
  dropdownOverlay.addEventListener("click", closeModeDropdown);
  document.body.appendChild(dropdownOverlay);

  modeDropdown.style.display = "block";
}

settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (modeDropdown.style.display === "block") {
    closeModeDropdown();
  } else {
    openModeDropdown();
  }
});

document.querySelectorAll(".mode-dropdown-item[data-mode]").forEach((item) => {
  item.addEventListener("click", async () => {
    const mode = item.dataset.mode;
    await chrome.storage.sync.set({ displayMode: mode });
    closeModeDropdown();

    if (mode === "sidePanel") {
      // Floating から Side Panel へ切り替え → パネルを閉じる
      showToast("Side Panel モードに切り替えました");
      setTimeout(() => {
        window.parent.postMessage({ type: "tabflow-close-panel" }, "*");
      }, 800);
    } else {
      showToast("表示モードを変更しました");
    }
  });
});

document.getElementById("openOptionsPage").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  closeModeDropdown();
});

// =============================================
// ナビゲーション（ブックマーク・リーディングリスト）
// =============================================

document.getElementById("openBookmarks").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://bookmarks/" });
});

// リーディングリストオーバーレイ
const readingListOverlay = document.getElementById("readingListOverlay");
const readingListItems = document.getElementById("readingListItems");
const readingListEmpty = document.getElementById("readingListEmpty");

async function openReadingList() {
  const entries = await chrome.readingList.query({});
  readingListItems.innerHTML = "";

  if (entries.length === 0) {
    readingListEmpty.style.display = "flex";
  } else {
    readingListEmpty.style.display = "none";
    entries.sort((a, b) => (a.hasBeenRead === b.hasBeenRead ? 0 : a.hasBeenRead ? 1 : -1));

    for (const entry of entries) {
      const li = document.createElement("li");
      li.className = "reading-item";

      const info = document.createElement("div");
      info.className = "reading-info";

      const title = document.createElement("div");
      title.className = "reading-title";
      title.textContent = entry.title || "(無題)";

      const url = document.createElement("div");
      url.className = "reading-url";
      url.textContent = entry.url;

      info.appendChild(title);
      info.appendChild(url);
      li.appendChild(info);

      const status = document.createElement("span");
      status.className = "reading-status" + (entry.hasBeenRead ? "" : " unread");
      status.textContent = entry.hasBeenRead ? "既読" : "未読";
      li.appendChild(status);

      li.addEventListener("click", () => {
        chrome.tabs.create({ url: entry.url });
      });

      readingListItems.appendChild(li);
    }
  }

  readingListOverlay.style.display = "flex";
}

document.getElementById("openReadingList").addEventListener("click", openReadingList);

document.getElementById("readingListBack").addEventListener("click", () => {
  readingListOverlay.style.display = "none";
});

// =============================================
// コンパクトモード
// =============================================

async function applyCompactMode() {
  const { compactMode } = await chrome.storage.sync.get({ compactMode: false });
  document.body.classList.toggle("compact", compactMode);
}

// =============================================
// ダークモード
// =============================================

async function applyDarkMode() {
  const { darkMode } = await chrome.storage.sync.get({ darkMode: false });
  document.body.classList.toggle("dark-mode", darkMode);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.compactMode) {
    document.body.classList.toggle("compact", changes.compactMode.newValue);
  }
  if (area === "sync" && changes.darkMode) {
    document.body.classList.toggle("dark-mode", changes.darkMode.newValue);
  }
});

// =============================================
// 初期化・イベントリスナー
// =============================================

applyCompactMode();
applyDarkMode();
renderTabs();

chrome.tabs.onCreated.addListener(renderTabs);
chrome.tabs.onRemoved.addListener(renderTabs);
chrome.tabs.onUpdated.addListener(renderTabs);
chrome.tabs.onActivated.addListener(renderTabs);
