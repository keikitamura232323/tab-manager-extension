"use strict";

// --- DOM参照 ---
const tabListEl = document.getElementById("tabList");
const tabBadgeEl = document.getElementById("tabBadge");
const toastContainer = document.getElementById("toastContainer");

// --- 定数 ---

// 非アクティブ判定の閾値（ミリ秒）。1時間 = 3,600,000ms
const INACTIVE_THRESHOLD_MS = 60 * 60 * 1000;

// ファビコンフォールバック用カラーパレット
const FAVICON_COLORS = [
  "#2563EB", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#0891B2", "#D97706",
];

// Chrome タブグループカラー → HEX マッピング
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

// グループなしタブの内部キー
const UNGROUPED_KEY = "ungrouped";

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
// タブ操作（リーディングリスト / ブックマーク / 閉じる）
// =============================================

async function addToReadingList(tab) {
  try {
    await chrome.readingList.addEntry({
      url: tab.url,
      title: tab.title || "(無題)",
      hasBeenRead: false,
    });
    showToast("✓ リーディングリストに追加しました");
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
    showToast("✓ ブックマークに追加しました");
  } catch {
    showToast("ブックマークへの追加に失敗しました", "error");
  }
}

async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
    showToast("✓ タブを閉じました");
  } catch {
    showToast("タブを閉じられませんでした", "error");
  }
}

// =============================================
// 折りたたみ状態の管理
// =============================================

/**
 * 折りたたみ済みグループIDの配列を取得する
 * @returns {Promise<string[]>}
 */
async function getCollapsedGroups() {
  const result = await chrome.storage.local.get(["collapsedGroups"]);
  return result.collapsedGroups || [];
}

/**
 * グループの折りたたみ状態をトグルし、再描画する
 * @param {string} groupKey - グループID または UNGROUPED_KEY
 */
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
// タブアイテム（1行）の生成
// =============================================

/**
 * 個別タブの li 要素を生成する
 * @param {chrome.tabs.Tab} tab
 * @param {number} now - Date.now()
 * @returns {HTMLLIElement}
 */
function createTabItem(tab, now) {
  const isInactive =
    typeof tab.lastAccessed === "number" &&
    now - tab.lastAccessed >= INACTIVE_THRESHOLD_MS;

  const li = document.createElement("li");
  li.className = "tab-item";
  if (tab.active) li.classList.add("active");
  if (isInactive) li.classList.add("inactive");

  // ファビコン
  li.appendChild(createFaviconElement(tab));

  // タブ情報
  const info = document.createElement("div");
  info.className = "tab-info";

  const titleRow = document.createElement("div");
  titleRow.className = "tab-title-row";

  const title = document.createElement("div");
  title.className = "tab-title";
  title.textContent = tab.title || "(無題)";
  titleRow.appendChild(title);

  if (isInactive) {
    const badge = document.createElement("span");
    badge.className = "inactive-badge";
    badge.textContent = "💤 非アクティブ";
    titleRow.appendChild(badge);
  }

  const url = document.createElement("div");
  url.className = "tab-url";
  url.textContent = tab.url || "";

  info.appendChild(titleRow);
  info.appendChild(url);
  li.appendChild(info);

  // アクションボタン
  const actions = document.createElement("div");
  actions.className = "tab-actions";

  const readingBtn = document.createElement("button");
  readingBtn.className = "action-btn btn-reading";
  readingBtn.textContent = "📖";
  readingBtn.title = "リーディングリストに追加";
  readingBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    addToReadingList(tab);
  });

  const bookmarkBtn = document.createElement("button");
  bookmarkBtn.className = "action-btn btn-bookmark";
  bookmarkBtn.textContent = "⭐";
  bookmarkBtn.title = "ブックマークに追加";
  bookmarkBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    addToBookmarks(tab);
  });

  const closeBtn = document.createElement("button");
  closeBtn.className = "action-btn btn-close";
  closeBtn.textContent = "✕";
  closeBtn.title = "このタブを閉じる";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeTab(tab.id);
  });

  actions.appendChild(readingBtn);
  actions.appendChild(bookmarkBtn);
  actions.appendChild(closeBtn);
  li.appendChild(actions);

  // 行クリック → タブ切替
  li.addEventListener("click", () => {
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  });

  return li;
}

// =============================================
// グループセクションの生成
// =============================================

/**
 * グループヘッダー + 配下タブのセクション要素を生成する
 * @param {object} opts
 * @param {string} opts.key          - グループID文字列 または UNGROUPED_KEY
 * @param {string} opts.title        - グループ名
 * @param {string} opts.color        - HEXカラー
 * @param {chrome.tabs.Tab[]} opts.tabs
 * @param {boolean} opts.isCollapsed
 * @param {number} opts.now
 * @param {boolean} opts.isUngrouped
 * @returns {HTMLElement}
 */
function createGroupSection({ key, title, color, tabs, isCollapsed, now, isUngrouped }) {
  const section = document.createElement("li");
  section.className = "tab-group" + (isUngrouped ? " ungrouped" : "");

  // --- ヘッダー ---
  const header = document.createElement("div");
  header.className = "group-header";
  header.addEventListener("click", () => toggleGroup(key));

  // 折りたたみ矢印
  const toggle = document.createElement("span");
  toggle.className = "group-toggle";
  toggle.textContent = isCollapsed ? "▶" : "▼";

  // カラードット
  const dot = document.createElement("span");
  dot.className = "group-color-dot";
  dot.style.backgroundColor = color;

  // グループ名
  const name = document.createElement("span");
  name.className = "group-name";
  name.textContent = title;

  // タブ数
  const count = document.createElement("span");
  count.className = "group-count";
  count.textContent = `${tabs.length}個`;

  header.appendChild(toggle);
  header.appendChild(dot);
  header.appendChild(name);
  header.appendChild(count);
  section.appendChild(header);

  // --- 配下タブ（展開時のみ） ---
  if (!isCollapsed) {
    const tabsContainer = document.createElement("ul");
    tabsContainer.className = "group-tabs";
    // グループカラーの縦線
    if (!isUngrouped) {
      tabsContainer.style.borderLeftColor = color;
    }

    for (const tab of tabs) {
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
  // グループ一覧・全タブ・折りたたみ状態を並列取得
  const [groups, tabs, collapsed] = await Promise.all([
    chrome.tabGroups.query({}),
    chrome.tabs.query({}),
    getCollapsedGroups(),
  ]);

  tabBadgeEl.textContent = tabs.length;
  tabListEl.innerHTML = "";

  const now = Date.now();

  // グループIDでタブを分類
  /** @type {Map<number, chrome.tabs.Tab[]>} */
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

  // グループセクションを描画
  for (const group of groups) {
    const groupTabs = groupedMap.get(group.id) || [];
    if (groupTabs.length === 0) continue;

    tabListEl.appendChild(
      createGroupSection({
        key: String(group.id),
        title: group.title || "無名グループ",
        color: GROUP_COLOR_MAP[group.color] || GROUP_COLOR_MAP.grey,
        tabs: groupTabs,
        isCollapsed: collapsed.includes(String(group.id)),
        now,
        isUngrouped: false,
      })
    );
  }

  // グループなしタブ
  if (ungroupedTabs.length > 0) {
    tabListEl.appendChild(
      createGroupSection({
        key: UNGROUPED_KEY,
        title: "グループなし",
        color: GROUP_COLOR_MAP.grey,
        tabs: ungroupedTabs,
        isCollapsed: collapsed.includes(UNGROUPED_KEY),
        now,
        isUngrouped: true,
      })
    );
  }
}

// =============================================
// 初期化・イベントリスナー
// =============================================

renderTabs();

chrome.tabs.onCreated.addListener(renderTabs);
chrome.tabs.onRemoved.addListener(renderTabs);
chrome.tabs.onUpdated.addListener(renderTabs);
chrome.tabs.onActivated.addListener(renderTabs);
