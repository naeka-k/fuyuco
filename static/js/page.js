/**
 * トーストを表示する。
 * @param {*} msg 
 */
function showToast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('toast-show'), 10);
    setTimeout(() => {
        el.classList.remove('toast-show');
        setTimeout(() => el.remove(), TOAST_FADE_DURATION);
    }, TOAST_SHOW_DURATION);
}

/**
 * APIにアクセスする。
 * @param {*} url 
 * @param {*} opts 
 * @returns 
 */
async function apiFetch(url, opts) {
    let res;
    try {
        res = await window.fetch(url, opts);
    } catch (error) {
        errorHandle(error, 'ネットワークエラーが発生しました', 'apiFetch failed.')
    }
    if (!res.ok) {
        errorHandle(new Error(), `エラーが発生しました（${res.status}）`, `apiFetch failed HTTP ${res.status}`);
    }
    return res;
}

// ショートハンド
/**
 * DOMのElement取得
 * 
 * @param {selector} sel 
 * @returns 
 */
function $qs(sel) {
    return document.querySelector(sel);
}

/**
 * DOMのElement取得
 * 
 * @param {selector} sel 
 * @returns Element[]
 */
function $qsa(sel) {
    return document.querySelectorAll(sel);
}

/**
 * DOMのElement取得
 * 
 * @param {id} id 
 * @returns Element
 */
function $ge(id) {
    return document.getElementById(id);
}

/**
 * エラー制御
 * @param {error} error 
 * @param {string} msg0 
 * @param {string} msg1 
 */
function errorHandle(error, msg0, msg1) {
    showToast(msg0 + ' ' + msg1);
    throw error;
}

window.addEventListener('unhandledrejection', e => { e.preventDefault(); });
// ── API エンドポイント ──
const BASE = '/fuyuco';
const TODO_API = BASE + '/api/todos';
const NOTE_API = BASE + '/api/notes';
const TODO_LABELS_API = BASE + '/api/todo-labels';
const NOTE_TAGS_API = BASE + '/api/note-tags';

// ── タイミング定数（ミリ秒） ──
const TOAST_SHOW_DURATION = 3500;
const TOAST_FADE_DURATION = 300;
const NOTE_SAVE_DEBOUNCE = 800;
const AUTO_SAVE_DEBOUNCE = 800;

// ── HTTP リクエスト ──
const HTTP_METHOD_GET = 'GET';
const HTTP_METHOD_POST = 'POST';
const HTTP_METHOD_PUT = 'PUT';
const HTTP_METHOD_PATCH = 'PATCH';
const HTTP_METHOD_DELETE = 'DELETE';
const CONTENT_TYPE_JSON = 'application/json';
const JSON_HEADER = { 'Content-Type': CONTENT_TYPE_JSON };

// ── UI メッセージ ──
const DEFAULT_TITLE = '';
const DELETE_TODO_MSG = (title) => `タスク「${title}」を削除しますか？`;
const DELETE_NOTE_MSG = 'このメモを削除しますか？';

// ── ソート・フォーマット ──
const SORT_DUMMY_DATE = '9999-99-99';
const MEMO_TRUNCATE_LEN = 60;
const TAG_TRUNCATE_LEN = 12;
const MAX_URL_COUNT = 5;
const MAX_TAG_HISTORY_LEN = 140;

// ── カンバン列の順序（左から右） ──
const KANBAN_STATUSES = ['todo', 'doing', 'done', 'waiting'];

// ── カンバンカードの移動ボタン定義（列ごと） ──
const KANBAN_MOVE_BTNS = {
    todo:    [
        { label: '⏸',  targetStatus: 'waiting', title: '待機中にする' },
        { label: '▶',  targetStatus: 'doing',   title: '進める' },
    ],
    doing:   [
        { label: '◀',  targetStatus: 'todo',    title: '戻す' },
        { label: '⏸',  targetStatus: 'waiting', title: '待機中にする' },
        { label: '▶',  targetStatus: 'done',    title: '進める' },
    ],
    done:    [
        { label: '◀',  targetStatus: 'doing',   title: '戻す' },
    ],
    waiting: [
        { label: '◀◀', targetStatus: 'doing',   title: '実施中に戻す' },
    ],
};

// ── カラーセット名 ──
const KANBAN_SORT_KEY = {
    DL_ASC: 'dl-asc',
    DL_DESC: 'dl-desc',
    TITLE_ASC: 'title-asc',
};

let today = nowJST().slice(0, 10);
let now = nowJST().slice(0, 16);

const TEXT_COLORS = [
    '#000000', '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#3b82f6', '#8b5cf6', '#ec4899', '#555555', '#aaaaaa',
];

const TAG_PRESET_COLORS = [
    '#f47272', '#fb9a3a', '#fbd040', '#6ee7b0', '#5eead4',
    '#60a5fa', '#6366f1', '#a78bfa', '#f472b6', '#f87171',
    '#4ade80', '#22d3ee', '#a3e635', '#bb9165', '#8aaec8',
];

const titleMap = {
    todo: 'TODO - fuyuco',
    kanban: 'カンバン - fuyuco',
    label: 'ラベル管理 - fuyuco',
    note: 'メモ - fuyuco'
};
const iconMap = {
    todo: 'todo.png',
    kanban: 'kanban.png',
    label: 'label.png',
    note: 'memo.png'
};

const KANBAN_SORT_OPTS = [
    { value: 'dl-asc', label: '期限が近い順' },
    { value: 'dl-desc', label: '期限が遠い順' },
    { value: 'title-asc', label: 'タイトル順' },
];

// ── 共通状態 ──
let activeSection = 'todo';
let activePopup = null;
let isTagNavCollapsed = false;

// ── TODO 状態 ──
let allTodos = [];
let allTodoLabels = [];
// TODO/カンバンのラベル絞り込み（複数選択可、チェックリスト式）。空の場合はすべて表示する
let selectedTodoTagIds = new Set();
let selectedTodoId = null;
let isNewMode = false;
let sortAsc = true;
let autoSaveTimer = null;
let originalTask = null;
let collapsedTodoGroups = new Set(['__done__']);
let todoSelectedColor = TAG_PRESET_COLORS[5];

// ── Note 状態 ──
let allNotes = [];
let allNoteTags = [];
let activeNoteTagId = null;
let noteSaveTimers = {};
let noteSelectedColor = TAG_PRESET_COLORS[5];

// ── TODOメモ状態 ──
let memoSaveTimers = {};

// ── TODO拡大モーダル状態 ──
let isTodoModalOpen = false;
let todoModalOriginalParent = null;
let todoModalOriginalNext = null;

// ── 通知状態 ──
const notifiedTodos = new Set();
// ── ラベル管理状態 ──
let labelSaveTimers = {};
let activeLabelMgmtId = null;
let labelMemoEditingId = null;
let editingLabelLinkId = null;
let labelSectionCollapsed = { memo: false, links: false, timeline: false };
let labelDetailTab = 'overview';
const LABEL_MGMT_ACTIVE_KEY = 'fuyuco_active_label_id';

/**
 * 選択中のラベルIDをlocalStorageに保存する。
 * ページをリロードしても選択状態を復元できるようにするために使う。
 *
 * @param {number|null} id
 */
function saveActiveLabelMgmtId(id) {
    if (id === null) {
        localStorage.removeItem(LABEL_MGMT_ACTIVE_KEY);
    } else {
        localStorage.setItem(LABEL_MGMT_ACTIVE_KEY, String(id));
    }
}

/**
 * localStorageに保存されている選択中ラベルIDを読み込む。
 *
 * @returns {number|null} 保存されていない場合はnull
 */
function loadActiveLabelMgmtId() {
    const stored = localStorage.getItem(LABEL_MGMT_ACTIVE_KEY);
    return stored === null ? null : Number(stored);
}

// ── セクション切替 ──────────────────────────
function isTodo() {
    return activeSection === 'todo';
}
function isNote() {
    return activeSection === 'note';
}
function isKanban() {
    return activeSection === 'kanban';
}
function isLabelSection() {
    return activeSection === 'label';
}

/**
 * タブ選択時の表示処理。
 *
 * @param {number} section
 * @returns {Promise} 一覧データの取得が完了したら解決されるPromise
 */
function switchSection(section) {
    activeSection = section;
    history.replaceState(null, '', '#' + section);
    $ge('tab-todo').classList.toggle('active', section === 'todo');
    $ge('tab-kanban').classList.toggle('active', section === 'kanban');
    $ge('tab-label').classList.toggle('active', section === 'label');
    $ge('tab-note').classList.toggle('active', section === 'note');
    $ge('todo-section').style.display = section === 'todo' ? '' : 'none';
    $ge('kanban-section').style.display = section === 'kanban' ? '' : 'none';
    $ge('label-section').style.display = section === 'label' ? '' : 'none';
    $ge('note-section').style.display = section === 'note' ? '' : 'none';
    $ge('newTagColorBtn').style.background =
        isNote() ? noteSelectedColor : todoSelectedColor;
    $ge('tagAddRow').style.display = (section === 'todo' || section === 'kanban') ? 'none' : '';
    let loaded;
    if (isNote()) {
        $ge('tag-nav-title').textContent = 'タグ';
        $ge('tagInput').placeholder = '新しいタグ...';
        closeSidebar();
        renderTagNav();
        loaded = fetchNoteTags().then(() => fetchNotes());
    } else if (isLabelSection()) {
        $ge('tag-nav-title').textContent = 'ラベル';
        $ge('tagInput').placeholder = '新しいラベル...';
        closeSidebar();
        renderLabelSection();
        loaded = Promise.resolve();
    } else {
        $ge('tag-nav-title').textContent = 'ラベル';
        $ge('tagInput').placeholder = '新しいラベル...';
        loaded = fetchTodoLabels().then(() => fetchTodos());
        if (isKanban()) {
            closeSidebar();
        }
    }
    // ファビコンとタイトルの更新
    updatePageMeta(section);
    return loaded;
}

// ── ファビコンとタイトルの更新 ──────────────────────────
function updatePageMeta(section) {
    document.title = titleMap[section] || 'fuyuco';
    const faviconEl = $ge('favicon');
    if (faviconEl) {
        faviconEl.href = iconMap[section] || 'todo.png';
    }
}

// ── URL共有（ディープリンク） ──────────────────────────
/**
 * 指定したTODOを直接開くための共有用URLを生成する。
 *
 * @param {number} id 対象のTODO ID
 * @returns {string} 共有用URL
 */
function buildTodoLink(id) {
    return `${location.origin}${BASE}#todo-${id}`;
}

/**
 * 指定したメモを直接開くための共有用URLを生成する。
 *
 * @param {number} id 対象のメモ ID
 * @returns {string} 共有用URL
 */
function buildNoteLink(id) {
    return `${location.origin}${BASE}#note-${id}`;
}

/**
 * テキストをクリップボードにコピーし、結果をトーストで通知する。
 *
 * @param {string} text コピーする文字列
 */
function copyTextToClipboard(text) {
    navigator.clipboard.writeText(text)
        .then(() => showToast('リンクをコピーしました'))
        .catch(() => showToast('リンクのコピーに失敗しました'));
}

/**
 * 現在サイドバーで選択中のTODOの共有用リンクをクリップボードにコピーする。
 *
 * @returns {void}
 */
function copyTodoLink() {
    if (selectedTodoId === null) {
        return;
    }
    copyTextToClipboard(buildTodoLink(selectedTodoId));
}

/**
 * 指定したメモの共有用リンクをクリップボードにコピーする。
 *
 * @param {number} id 対象のメモ ID
 */
function copyNoteLink(id) {
    copyTextToClipboard(buildNoteLink(id));
}

/**
 * 現在のURLハッシュを解析し、開くべきセクションと対象アイテムIDを判定する。
 *
 * @returns {{section: string, todoId: (number|null), noteId: (number|null)}} 解析結果
 */
function parseLocationHash() {
    const hash = location.hash;
    const todoMatch = hash.match(/^#todo-(\d+)$/);
    if (todoMatch) {
        return { section: 'todo', todoId: Number(todoMatch[1]), noteId: null };
    }
    const noteMatch = hash.match(/^#note-(\d+)$/);
    if (noteMatch) {
        return { section: 'note', todoId: null, noteId: Number(noteMatch[1]) };
    }
    if (hash === '#note' || hash === '#kanban' || hash === '#label') {
        return { section: hash.slice(1), todoId: null, noteId: null };
    }
    return { section: 'todo', todoId: null, noteId: null };
}

/**
 * URLハッシュにTODOまたはメモのIDが含まれている場合、
 * 該当セクションを開いた上でそのアイテムを表示する。
 *
 * @returns {Promise<void>}
 */
async function openFromLocationHash() {
    const { section, todoId, noteId } = parseLocationHash();
    // タグ絞り込みで対象アイテムが一覧から除外されないよう、絞り込みを解除しておく
    if (todoId !== null) {
        selectedTodoTagIds.clear();
    } else if (noteId !== null) {
        activeNoteTagId = null;
    }
    await switchSection(section);
    if (todoId !== null) {
        openTodoDeepLink(todoId);
    } else if (noteId !== null) {
        await openNoteDeepLink(noteId);
    }
}

/**
 * URL経由で指定されたTODOをサイドバーに表示し、一覧上でも見える位置までスクロールする。
 *
 * @param {number} id 表示するTODOのID
 */
function openTodoDeepLink(id) {
    const t = allTodos.find(t => t.id === id);
    if (!t) {
        showToast('指定されたTODOが見つかりませんでした');
        return;
    }
    if ((t.status || (t.done ? 'done' : 'todo')) === 'done') {
        collapsedTodoGroups.delete('__done__');
        render(allTodos);
    }
    selectTodo(id);
    $qs(`.todo-card.selected`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * URL経由で指定されたメモを一覧上でハイライト表示する。
 * 通常一覧に無い場合はアーカイブ済み一覧も確認する。
 *
 * @param {number} id 表示するメモのID
 */
async function openNoteDeepLink(id) {
    let note = allNotes.find(n => n.id === id);
    if (!note) {
        activeNoteTagId = 'archived';
        await fetchNotes();
        note = allNotes.find(n => n.id === id);
    }
    if (!note) {
        showToast('指定されたメモが見つかりませんでした');
        return;
    }
    history.replaceState(null, '', '#note-' + id);
    highlightNoteCard(id);
}

/**
 * 指定したIDのメモカードをスクロールして一時的にハイライトする。
 *
 * @param {number} id 対象のメモ ID
 */
function highlightNoteCard(id) {
    const card = $qs(`.note-card[data-id="${id}"]`);
    if (!card) {
        return;
    }
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('note-card-highlight');
    setTimeout(() => card.classList.remove('note-card-highlight'), 2000);
}

/**
 * タグ表示の左サイドバーの表示／非表示切り替え
 * 
 */
function toggleTagNav() {
    isTagNavCollapsed = !isTagNavCollapsed;
    const tagNav = $ge('tagNav');
    const button = $ge('toggleTagNavBtn');
    if (tagNav) {
        tagNav.classList.toggle('collapsed', isTagNavCollapsed);
    }
}

// ── ポップアップ共通 ────────────────────────
function openSwatchPopup(anchorEl, cols, colors, currentColor, onSelect) {
    if (activePopup) {
        activePopup.remove();
        activePopup = null; 
    }
    const popup = document.createElement('div');
    popup.className = 'color-swatch-popup';
    popup.style.gridTemplateColumns = `repeat(${cols}, 22px)`;
    colors.forEach(color => {
        const sw = document.createElement('div');
        sw.className = `color-swatch ${color === currentColor ? 'selected' : ''}`;
        sw.style.background = color;
        sw.style.border = color === '#ffffff' ? '2px solid #ddd' : '2px solid transparent';
        sw.addEventListener('mousedown', e => e.preventDefault());
        sw.addEventListener('click', e => {
            e.stopPropagation();
            onSelect(color);
            popup.remove();
            activePopup = null;
        });
        popup.appendChild(sw);
    });
    document.body.appendChild(popup);
    activePopup = popup;
    const rect = anchorEl.getBoundingClientRect();
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + 4}px`;
    setTimeout(() => {
        document.addEventListener('click', function h() {
            popup.remove();
            activePopup = null;
            document.removeEventListener('click', h);
        }, { once: true });
    }, 0);
}

/**
 * タグ選択用のポップアップ表示。
 * 
 * @param {Element} anchorEl 
 * @param {number} noteId 
 * @param {number} checkedTagIds 
 * @returns 
 */
function openTagPopup(anchorEl, noteId, checkedTagIds) {
    if (activePopup) {
        activePopup.remove();
        activePopup = null;
    }
    const visibleNoteTags = allNoteTags.filter(t => !t.closed);
    if (visibleNoteTags.length === 0){
        return;
    }
    const popup = document.createElement('div');
    popup.className = 'tag-popup';
    visibleNoteTags.forEach(tag => {
        const label = document.createElement('label');
        label.className = 'tag-popup-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = tag.id;
        cb.checked = checkedTagIds.has(tag.id);
        cb.style.accentColor = tag.color;
        cb.addEventListener('change', () => scheduleNoteSave(noteId));
        const dot = document.createElement('span');
        dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${tag.color};flex-shrink:0;display:inline-block`;
        const nameSpan = document.createElement('span');
        nameSpan.className = 'tag-popup-name';
        nameSpan.title = tag.name;
        nameSpan.textContent = truncTag(tag.name);
        label.appendChild(cb);
        label.appendChild(dot);
        label.appendChild(nameSpan);
        popup.appendChild(label);
    });
    document.body.appendChild(popup);
    activePopup = popup;
    const rect = anchorEl.getBoundingClientRect();
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + 4}px`;
    setTimeout(() => {
        document.addEventListener('click', function h(e) {
            if (!popup.contains(e.target)) {
                popup.remove();
                activePopup = null;
                document.removeEventListener('click', h);
            }
        });
    }, 0);
}

// ── タグナビ共通 ────────────────────────────
function renderTagNav() {
    if (isNote()) {
        renderNoteTagNav();
    } else if (isLabelSection()) {
        renderLabelSectionNav();
    } else {
        renderTodoTagNav();
    }
}

/**
 * メモのタグナビ
 * 
 */
function renderNoteTagNav() {
    const tags = allNoteTags.filter(t => !t.closed);
    const activeId = activeNoteTagId;
    const items = allNotes;
    const tagsApi = NOTE_TAGS_API;
    const ul = $ge('tagList');
    ul.innerHTML = '';

    const allItem = document.createElement('li');
    allItem.className = `tag-item ${activeId === null ? 'active' : ''}`;
    allItem.innerHTML = `<span class="tag-dot"></span><span class="tag-item-name">すべて</span>`;
    allItem.addEventListener('click', () => selectTag(null));
    ul.appendChild(allItem);

    // アーカイブ済みの表示欄作成
    const archItem = document.createElement('li');
    archItem.className = `tag-item ${activeId === 'archived' ? 'active' : ''}`;
    archItem.innerHTML = `<span class="tag-dot" style="background:#cce5fd"></span><span class="tag-item-name">アーカイブ済み</span>`;
    archItem.addEventListener('click', () => selectTag('archived'));
    ul.appendChild(archItem);

    // タグリストの画面反映
    renderTagsList(tags, items, activeId, tagsApi, ul, false, null);

}

/**
 * TODOとカンバンのタグナビ。
 * ラベルは複数選択可能なチェックリスト形式で表示する。
 *
 */
function renderTodoTagNav() {
    const tags = allTodoLabels.filter(t => !t.closed);
    const items = isKanban() ? allTodos.filter(t => !t.recurrence) : allTodos;
    const tagsApi = TODO_LABELS_API;
    const ul = $ge('tagList');
    ul.innerHTML = '';

    const allItem = document.createElement('li');
    allItem.className = `tag-item ${selectedTodoTagIds.size === 0 ? 'active' : ''}`;
    allItem.innerHTML = `<span class="tag-dot"></span><span class="tag-item-name">すべて</span>`;
    allItem.addEventListener('click', () => clearTodoTagFilter());
    ul.appendChild(allItem);
    // タグリストの画面反映
    renderTagsList(tags, items, null, tagsApi, ul, true, selectedTodoTagIds);

}

/**
 * ラベル管理画面へ、指定したラベルを選択した状態で切り替える。
 *
 * @param {number} labelId
 * @returns {Promise<void>}
 */
async function goToLabelManagement(labelId) {
    activeLabelMgmtId = labelId;
    saveActiveLabelMgmtId(labelId);
    await switchSection('label');
}

/**
 * TODOラベルの絞り込み選択をチェックリスト形式でトグルする（複数選択可）。
 * 選択されたラベルのいずれかが付いたTODOのみを表示する。選択が空の場合はすべて表示する。
 *
 * @param {number} tagId
 * @returns {Promise<void>}
 */
async function toggleTodoTagFilter(tagId) {
    if (selectedTodoTagIds.has(tagId)) {
        selectedTodoTagIds.delete(tagId);
    } else {
        selectedTodoTagIds.add(tagId);
    }
    await fetchTodos();
    renderTagNav();
}

/**
 * TODOラベルの絞り込みをすべて解除し、すべてのTODOを表示する。
 *
 * @returns {Promise<void>}
 */
async function clearTodoTagFilter() {
    selectedTodoTagIds.clear();
    await fetchTodos();
    renderTagNav();
}

/**
 * タグの内容をリストに反映。
 * isTodoLabelContextがtrueの場合はTODOラベルの複数選択チェックリストとして描画する。
 * 色見本とチェックボックスは1つの要素に統合し（色変更機能は持たない）、
 * 行ごとにラベル管理画面への「＞」リンクを表示する（×削除ボタンは表示しない）。
 * falseの場合（メモタグ）は単一選択のリストとして描画し、行ごとに色変更可能な色見本と×（削除）ボタンを表示する。
 *
 * @param {data[]} tags
 * @param {data[]} items
 * @param {number|string|null} activeId メモタグの選択中ID（isTodoLabelContextがfalseの場合のみ使用）
 * @param {string} tagsApi
 * @param {Element} ul
 * @param {boolean} isTodoLabelContext TODOラベルの複数選択チェックリストとして描画するかどうか
 * @param {Set<number>|null} selectedIds TODOラベルの選択中ID集合（isTodoLabelContextがtrueの場合のみ使用）
 */
function renderTagsList(tags, items, activeId, tagsApi, ul, isTodoLabelContext, selectedIds) {
    tags.forEach(tag => {
        const count = items.filter(item => !item.done).filter(item => item.tags.some(t => t.id === tag.id)).length;
        const isChecked = isTodoLabelContext ? selectedIds.has(tag.id) : activeId === tag.id;
        const li = document.createElement('li');
        li.className = `tag-item ${isChecked ? 'active' : ''}`;

        const dot = document.createElement('span');
        dot.style.background = tag.color;
        if (isTodoLabelContext) {
            // 色見本とチェックボックスを1つの要素に統合し、色変更機能は持たせない
            dot.className = `tag-check${isChecked ? ' checked' : ''}`;
        } else {
            dot.className = 'tag-color-btn';
            dot.title = '色を変更';
            dot.addEventListener('click', e => {
                e.stopPropagation();
                openSwatchPopup(dot, 5, TAG_PRESET_COLORS, tag.color, async (color) => {
                    await apiFetch(`${tagsApi}/${tag.id}/color`, {
                        method: HTTP_METHOD_PATCH, headers: JSON_HEADER,
                        body: JSON.stringify({ color }),
                    });
                    await fetchNoteTags();
                    fetchNotes();
                });
            });
        }
        li.appendChild(dot);

        const delBtnHtml = !isTodoLabelContext
            ? `<button class="tag-del" onclick="event.stopPropagation(); deleteTag(${tag.id})">✕</button>`
            : '';
        const manageLinkHtml = isTodoLabelContext
            ? `<button class="tag-goto-label" title="ラベル管理を開く" onclick="event.stopPropagation(); goToLabelManagement(${tag.id})">&gt;</button>`
            : '';
        li.insertAdjacentHTML('beforeend', `
          <span class="tag-item-name" title="${escHtml(tag.name)}">${escHtml(truncTag(tag.name))}</span>
          <span class="tag-count">${count}</span>
          ${delBtnHtml}
          ${manageLinkHtml}
        `);
        li.addEventListener('click', () => {
            if (isTodoLabelContext) {
                toggleTodoTagFilter(tag.id);
            } else {
                selectTag(tag.id);
            }
        });
        ul.appendChild(li);
    });
}

/**
 * 引数で指定されたメモタグを選択状態にする
 *
 * @param {number|string|null} tagId
 */
async function selectTag(tagId) {
    activeNoteTagId = tagId;
    await fetchNotes();
    renderTagNav();
}

/**
 * タグの追加
 * @returns 
 */
async function addTag() {
    if (isNote()) {
        addNoteTag();
    } else {
        addTodoTag();
    }
}

/**
 * TODO用タグの追加
 * @returns 
 * 
 */
async function addTodoTag() {
    const name = $ge('tagInput').value.trim();
    if (!name) { 
        return;
    } 
    const tagsApi = TODO_LABELS_API;
    const color = todoSelectedColor;
    await apiFetch(tagsApi, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
    });
    $ge('tagInput').value = '';
    await fetchTodoLabels();
}

/**
 * メモ用タグの追加

 * @returns 
 * 
 */
async function addNoteTag() {
    const name = $ge('tagInput').value.trim();
    if (!name) {
        return;
    }
    const tagsApi = NOTE_TAGS_API;
    const color = noteSelectedColor;
    await apiFetch(tagsApi, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
    });
    $ge('tagInput').value = '';
    await fetchNoteTags();
}

/**
 * タグの削除
 * 
 * @param {number} tagId 
 * @returns 
 */
async function deleteTag(tagId) {
    if (isNote()) {
        deleteNoteTag(tagId);
    } else {
        deleteTodoTag(tagId);
    }
}

/**
 * TODO用のタグ削除
 * 
 * @param {number} tagId 
 * @returns 
 */
async function deleteTodoTag(tagId) {
    const tags = allTodoLabels;
    const tagsApi = TODO_LABELS_API;
    const tag = tags.find(t => t.id === tagId);
    if (!confirm(`ラベル「${tag?.name}」を削除しますか？`)){
        return;
    }
    await apiFetch(`${tagsApi}/${tagId}`, { method: 'DELETE' });
    selectedTodoTagIds.delete(tagId);
    await Promise.all([fetchTodoLabels(), fetchTodos()]);
}

/**
 * メモ用のタグ削除
 * 
 * @param {number} tagId 
 * @returns 
 */
async function deleteNoteTag(tagId) {
    const tags = allNoteTags;
    const tagsApi = NOTE_TAGS_API;
    const tag = tags.find(t => t.id === tagId);
    if (!confirm(`タグ「${tag?.name}」を削除しますか？`)){
        return;
    }
    await apiFetch(`${tagsApi}/${tagId}`, { method: 'DELETE' });
    if (activeNoteTagId === tagId){
        activeNoteTagId = null;
    }
    await Promise.all([fetchNoteTags(), fetchNotes()]);
}

// ── TODO ラベル ───────────────────────────────
async function fetchTodoLabels() {
    try {
        const res = await apiFetch(TODO_LABELS_API);
        allTodoLabels = await res.json();
        renderTagNav();
    } catch (error) {
        errorHandle(error, 'TODOラベルの取得に失敗しました', 'fetchTodoLabels failed.')
    }
}

let sidebarTagIds = [];

function renderSidebarSelectedTags() {
    const container = $ge('sb-selected-tags');
    container.innerHTML = '';
    allTodoLabels.filter(t => sidebarTagIds.includes(t.id)).forEach(tag => {
        const pill = document.createElement('span');
        pill.className = 'card-tag-pill';
        pill.style.background = tag.color;
        pill.style.color = '#fff';
        pill.title = tag.name;
        pill.textContent = truncTag(tag.name);
        container.appendChild(pill);
    });
}

function openSidebarTagPopup() {
    const anchorEl = $ge('sb-tag-btn');
    if (activePopup) {
        activePopup.remove();
        activePopup = null;
    }
    const visibleLabels = allTodoLabels.filter(t => !t.closed);
    if (visibleLabels.length === 0) {
        return;
    }
    const popup = document.createElement('div');
    popup.className = 'tag-popup';
    visibleLabels.forEach(tag => {
        const label = document.createElement('label');
        label.className = 'tag-popup-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = tag.id;
        cb.checked = sidebarTagIds.includes(tag.id);
        cb.style.accentColor = tag.color;
        cb.addEventListener('change', () => {
            sidebarTagIds = allTodoLabels.filter(t =>
                $qs(`.tag-popup input[value="${t.id}"]`)?.checked
            ).map(t => t.id);
            renderSidebarSelectedTags();
            scheduleAutoSave();
        });
        const dot = document.createElement('span');
        dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${tag.color};flex-shrink:0;display:inline-block`;
        const nameSpan = document.createElement('span');
        nameSpan.className = 'tag-popup-name';
        nameSpan.title = tag.name;
        nameSpan.textContent = truncTag(tag.name);
        label.appendChild(cb);
        label.appendChild(dot);
        label.appendChild(nameSpan);
        popup.appendChild(label);
    });
    document.body.appendChild(popup);
    activePopup = popup;
    const rect = anchorEl.getBoundingClientRect();
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + 4}px`;
    setTimeout(() => {
        document.addEventListener('click', function h(e) {
            if (!popup.contains(e.target) && e.target !== anchorEl) {
                popup.remove();
                activePopup = null;
                document.removeEventListener('click', h);
            }
        });
    }, 0);
}

/**
 * TODOのメモ／ステータス変更履歴CSVエクスポート用のポップアップを開く。
 * 開始日・終了日を指定してダウンロードボタンを押すと、エクスポートAPIへ
 * 遷移してCSVファイルをダウンロードする
 */
function openExportPopup() {
    const anchorEl = $ge('export-btn');
    if (activePopup) {
        activePopup.remove();
        activePopup = null;
    }
    const today = nowJST().slice(0, 10);
    const popup = document.createElement('div');
    popup.className = 'tag-popup export-popup';

    const fromInput = document.createElement('input');
    fromInput.type = 'date';
    fromInput.value = today;
    const fromLabel = document.createElement('label');
    fromLabel.className = 'export-popup-row';
    fromLabel.textContent = '開始日';
    fromLabel.appendChild(fromInput);

    const toInput = document.createElement('input');
    toInput.type = 'date';
    toInput.value = today;
    const toLabel = document.createElement('label');
    toLabel.className = 'export-popup-row';
    toLabel.textContent = '終了日';
    toLabel.appendChild(toInput);

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'btn-export-download';
    downloadBtn.textContent = 'CSVダウンロード';
    downloadBtn.addEventListener('click', () => {
        const params = new URLSearchParams();
        if (fromInput.value) {
            params.set('date_from', fromInput.value);
        }
        if (toInput.value) {
            params.set('date_to', toInput.value);
        }
        window.location.href = `${TODO_API}/export?${params.toString()}`;
        popup.remove();
        activePopup = null;
    });

    popup.appendChild(fromLabel);
    popup.appendChild(toLabel);
    popup.appendChild(downloadBtn);
    document.body.appendChild(popup);
    activePopup = popup;
    const rect = anchorEl.getBoundingClientRect();
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + 4}px`;
    setTimeout(() => {
        document.addEventListener('click', function h(e) {
            if (!popup.contains(e.target) && e.target !== anchorEl) {
                popup.remove();
                activePopup = null;
                document.removeEventListener('click', h);
            }
        });
    }, 0);
}

function getSidebarCheckedTagIds() {
    return [...sidebarTagIds];
}

// ── サイドバーURL管理 ────────────────────────
function addUrlInput(value = '') {
    const container = $ge('sb-urls');
    if (container.children.length >= 5) {
        return;
    }
    const row = document.createElement('div');
    row.className = 'sb-url-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'https://...';
    input.value = value;
    input.addEventListener('input', scheduleAutoSave);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'sb-url-del';
    del.textContent = '✕';
    del.addEventListener('click', e => {
        e.stopPropagation();
        row.remove();
        updateUrlAddBtn();
        scheduleAutoSave();
    });
    row.appendChild(input);
    row.appendChild(del);
    container.appendChild(row);
    updateUrlAddBtn();
}

function updateUrlAddBtn() {
    const count = $ge('sb-urls').children.length;
    $ge('sb-url-add-btn').style.display = count >= 5 ? 'none' : '';
}

function getSidebarUrls() {
    return [...$qsa('#sb-urls .sb-url-row input')]
        .map(i => i.value.trim()).filter(Boolean);
}

// ── TODO CRUD ───────────────────────────────
async function fetchTodos() {
    try {
        const url = selectedTodoTagIds.size > 0
            ? `${TODO_API}?${[...selectedTodoTagIds].map(id => `tag_id=${id}`).join('&')}`
            : TODO_API;
        const res = await apiFetch(url);
        allTodos = await res.json();
        render(allTodos);
        renderTagNav();
        scheduleNotificationsViaSW();
        if (selectedTodoId !== null) {
            const t = allTodos.find(t => t.id === selectedTodoId);
            if (t) {
                updateSidebar(t, false);
            } else {
                closeSidebar();
            }
        }
    } catch (error) {
        errorHandle(error, 'TODOの取得に失敗しました', 'fetchTodos failed.')
    }
}

/**
 * TODO用ソート順の切り替え
 */
function toggleSort() {
    sortAsc = !sortAsc;
    $ge('sortBtn').textContent = sortAsc ? '期限 ▲ 昇順' : '期限 ▼ 降順';
    render(allTodos);
}

/**
 * 同一日付内での二次ソート優先順位
 * 0: 繰り返し設定あり  1: 時刻が00:00以外  2: ラベルでグループ化
 */
function _todoIntraRank(t) {
    if (t.recurrence) {
        return 0;
    }
    const time = t.deadline ? t.deadline.slice(11, 16) : null;
    if (time && time !== '00:00') {
        return 1;
    }
    return 2;
}

function _todoIntraSort(a, b) {
    const ra = _todoIntraRank(a);
    const rb = _todoIntraRank(b);
    if (ra !== rb) {
        return ra - rb;
    }
    if (ra === 2) {
        const la = (a.tags && a.tags.length > 0) ? a.tags[0].name : '￿';
        const lb = (b.tags && b.tags.length > 0) ? b.tags[0].name : '￿';
        return la.localeCompare(lb, 'ja');
    }
    return 0;
}

/**
 * TODO用ソート順の切り替え
 */
function sortedTodos(todos) {
    return [...todos].sort((a, b) => {
        const da = a.deadline ?? (sortAsc ? SORT_DUMMY_DATE : '');
        const db = b.deadline ?? (sortAsc ? SORT_DUMMY_DATE : '');
        const dateA = da.slice(0, 10);
        const dateB = db.slice(0, 10);
        const dateCmp = sortAsc ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
        if (dateCmp !== 0) {
            return dateCmp;
        }
        return _todoIntraSort(a, b);
    });
}

function deadlineDatePart(dl) {
    return dl ? dl.slice(0, 10) : null;
}
function fmtDate(d) {
    return d ? d.slice(0, 10).replace(/-/g, '/') : '';
}

function groupByDeadline(todos) {
    const map = new Map();
    // 優先タスク（starred）をリスト順で先頭グループに表示
    const starred = todos.filter(t => !t.done && t.starred);
    if (starred.length > 0) {
        map.set('__starred__', starred);
    }
    // 通常タスクを期限でグループ化
    sortedTodos(todos.filter(t => !t.done && !t.starred)).forEach(t => {
        const key = deadlineDatePart(t.deadline) ?? '__none__';
        if (!map.has(key)) {
            map.set(key, []);
        }
        map.get(key).push(t);
    });
    const done = todos.filter(t => t.done);
    if (done.length > 0) {
        map.set('__done__', done);
    }
    return map;
}

/**
 * TODOを期限と現在日付に応じてグルーピングする。
 * @param {String} key 
 * @returns 
 */
function groupLabel(key) {
    if (key === '__starred__') {
        return { text: '⭐ 優先', cls: 'starred' };
    }
    if (key === '__done__') {
        return { text: '完了済み', cls: '' };
    }
    if (key === '__none__') {
        return { text: '期限なし', cls: '' };
    }
    if (key < today) {
        return { text: `${fmtDate(key)}（期限切れ）`, cls: 'overdue' };
    }
    if (key === today) {
        return { text: `${fmtDate(key)}（今日）`, cls: 'today' };
    }
    return { text: fmtDate(key), cls: '' };
}

/**
 * カンバンソート
 * 
 * @param {number} order 
 * @returns 
 */
function kanbanSortFn(order) {
    return (a, b) => {
        if (order === KANBAN_SORT_KEY.DL_ASC) {
            const da = (a.deadline ?? SORT_DUMMY_DATE).slice(0, 10);
            const db = (b.deadline ?? SORT_DUMMY_DATE).slice(0, 10);
            if (da !== db) {
                return da < db ? -1 : 1;
            }
            return _todoIntraSort(a, b);
        }
        if (order === KANBAN_SORT_KEY.DL_DESC) {
            const da = (a.deadline ?? '').slice(0, 10);
            const db = (b.deadline ?? '').slice(0, 10);
            if (da !== db) {
                return da > db ? -1 : 1;
            }
            return _todoIntraSort(a, b);
        }
        return a.title.localeCompare(b.title, 'ja');
    };
}

/**
 * カンバンの画面反映
 * 
 */
function renderKanban() {
    KANBAN_STATUSES.forEach(s => {
        const sel = $ge(`k-sort-${s}`);
        if (!sel.options.length) {
            KANBAN_SORT_OPTS.forEach(o => {
                const opt = document.createElement('option');
                opt.value = o.value; opt.textContent = o.label;
                sel.appendChild(opt);
            });
        }
    });

    const filtered = allTodos.filter(t =>
        !t.recurrence &&
        (selectedTodoTagIds.size === 0 || t.tags.some(tg => selectedTodoTagIds.has(tg.id)))
    );
    const cols = { todo: [], doing: [], done: [], waiting: [] };
    filtered.forEach(t => {
        const s = t.status || (t.done ? 'done' : 'todo');
        (cols[s] || cols.todo).push(t);
    });
    KANBAN_STATUSES.forEach(s => {
        const order = $ge(`k-sort-${s}`).value;
        cols[s].sort(kanbanSortFn(order));
    });

    KANBAN_STATUSES.forEach(status => {
        const container = $ge(`k-${status}`);
        $ge(`k-count-${status}`).textContent = cols[status].length;
        container.innerHTML = '';
        const moveDefs = KANBAN_MOVE_BTNS[status] ?? [];
        cols[status].forEach(t => {
            const memoText = t.latest_memo ?? t.memo ?? '';
            const memo = memoText.length > MEMO_TRUNCATE_LEN ? memoText.slice(0, MEMO_TRUNCATE_LEN) + '…' : memoText;
            const dl = fmtDate(t.deadline);
            const isOverdue = t.deadline && t.deadline < now && status !== 'done';
            const isToday = deadlineDatePart(t.deadline) === today && status !== 'done';
            const dlCls = isOverdue ? 'kanban-dl-overdue' : isToday ? 'kanban-dl-today' : 'kanban-dl-future';
            const tagPills = t.tags.map(tg =>
                `<span class="card-tag-pill" style="background:${escHtml(tg.color)};color:#fff" title="${escHtml(tg.name)}" onclick="event.stopPropagation(); goToLabelManagement(${tg.id})">${escHtml(truncTag(tg.name))}</span>`
            ).join('');
            const urlBtns = (t.urls || []).map(u =>
                `<a class="btn-url" href="${escHtml(u)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="${escHtml(u)}">🔗</a>`
            ).join('');
            const moveBtnsHtml = moveDefs.map(b =>
                `<button class="btn-kmove" title="${b.title}" onclick="event.stopPropagation();setStatusById(${t.id},'${b.targetStatus}')">${b.label}</button>`
            ).join('');

            const card = document.createElement('div');
            const cardCls = ['kanban-card',
                t.id === selectedTodoId ? 'selected' : '',
                isOverdue ? 'overdue' : '',
                isToday ? 'today' : '',
            ].filter(Boolean).join(' ');
            card.className = cardCls;
            card.innerHTML = `
            <div class="kanban-card-title-row">
            <span class="kanban-card-title">${escHtml(t.title)}</span>
            <div class="kanban-card-right">
              ${dl ? `<span class="kanban-card-deadline ${dlCls}">${escHtml(dl)}</span>` : ''}
              <button class="btn-kstar${t.starred ? ' starred' : ''}" onclick="event.stopPropagation();toggleStarById(${t.id})" title="優先度">⭐</button>
            </div>
            </div>
            ${memo ? `<div class="kanban-card-memo">${escHtml(memo)}</div>` : ''}
            ${tagPills ? `<div class="card-tags" style="margin-top:6px">${tagPills}</div>` : ''}
            <div class="kanban-card-footer">
            <div class="kanban-url-btns">${urlBtns}</div>
            <div class="kanban-move-btns">${moveBtnsHtml}</div>
            </div>
          `;
            card.addEventListener('click', () => selectTodo(t.id));
            container.appendChild(card);
        });
    });
}

/**
 * TODOの画面反映
 * @param {data[]} todos 
 * @returns 
 */
function render(todos) {
    const list = $ge('list');
    const empty = $ge('todo-empty');
    list.innerHTML = '';
    if (todos.length === 0) {
        empty.style.display = '';
        return;
    }
    empty.style.display = 'none';

    groupByDeadline(todos).forEach((items, key) => {
        const { text, cls } = groupLabel(key);
        const isCollapsed = collapsedTodoGroups.has(key);
        const label = document.createElement('div');
        label.className = `group-label ${cls} group-label-toggle`;
        label.innerHTML = `<span>${text}（${items.length}件）</span><span class="group-arrow">${isCollapsed ? '▶' : '▼'}</span>`;
        label.addEventListener('click', () => {
            if (isCollapsed) {
                collapsedTodoGroups.delete(key);
            } else {
                collapsedTodoGroups.add(key);
            }
            render(allTodos);
        });
        list.appendChild(label);
        if (isCollapsed) {
            return;
        }

        items.forEach(t => {
            const isOverdue = t.deadline && t.deadline < now && !t.done;
            const isToday = deadlineDatePart(t.deadline) === today && !t.done;
            const status = t.status || (t.done ? 'done' : 'todo');
            const cardCls = ['todo-card',
                status === 'done' ? 'done' : '',
                status === 'doing' ? 'doing' : '',
                status === 'waiting' ? 'waiting' : '',
                isOverdue ? 'overdue' : '',
                isToday ? 'today' : '',
                t.id === selectedTodoId ? 'selected' : '',
            ].filter(Boolean).join(' ');

            const tagPills = t.tags.map(tg =>
                `<span class="card-tag-pill" style="background:${escHtml(tg.color)};color:#fff" title="${escHtml(tg.name)}" onclick="event.stopPropagation(); goToLabelManagement(${tg.id})">${escHtml(truncTag(tg.name))}</span>`
            ).join('');

            const recLabelMap = { daily: '毎日', weekly: '毎週', monthly: '毎月', yearly: '毎年' };
            function recLabel(r) {
                if (!r) {
                    return '';
                }
                try {
                    const p = JSON.parse(r);
                    return recLabelMap[p.type] || p.type;
                } catch {
                    return recLabelMap[r] || r;
                }
            }
            const card = document.createElement('div');
            card.className = cardCls;
            card.innerHTML = `
            <div class="check ${status === 'done' ? 'checked' : status === 'doing' ? 'doing' : status === 'waiting' ? 'waiting' : ''}" onclick="event.stopPropagation(); toggleById(${t.id})"></div>
            <div class="card-info">
            <div class="card-title">${escHtml(t.title)}</div>
            ${(t.latest_memo ?? t.memo) ? `<div class="card-memo">${escHtml(t.latest_memo ?? t.memo)}</div>` : ''}
            ${tagPills ? `<div class="card-tags">${tagPills}</div>` : ''}
            </div>
            ${t.recurrence ? `<span class="card-recurrence">🔁</span>` : ''}
            ${(t.urls || []).map(u => `<a class="btn-url" href="${escHtml(u)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="${escHtml(u)}">🔗</a>`).join('')}
            <button class="btn-star${t.starred ? ' starred' : ''}" onclick="event.stopPropagation(); toggleStarById(${t.id})" title="優先度">⭐</button>
            <button class="btn-del" onclick="event.stopPropagation(); delById(${t.id})">✕</button>
            `;
            card.addEventListener('click', () => selectTodo(t.id));
            card.querySelector('.card-title').addEventListener('click', e => {
                if (t.id !== selectedTodoId) {
                    return;
                }
                e.stopPropagation();
                startInlineEdit(e.currentTarget, t);
            });
            list.appendChild(card);
        });
    });
    if (isKanban()) {
        renderKanban();
    }
}

// ── サイドバー ──────────────────────────────
/**
 * TODOを選択してサイドバーに表示する。
 * URLハッシュも選択中のTODO IDに合わせて更新し、そのURLを開けば
 * 同じTODOを直接表示できるようにする。
 *
 * @param {number} id 選択するTODOのID
 */
function selectTodo(id) {
    selectedTodoId = id;
    isNewMode = false;
    const t = allTodos.find(t => t.id === id);
    updateSidebar(t, false);
    render(allTodos);
    history.replaceState(null, '', '#todo-' + id);
}
/**
 * 画面
 * 
 */
function startInlineEdit(titleEl, t) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = t.title;
    input.className = 'card-title-edit';
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    input.addEventListener('click', e => e.stopPropagation());
    let done = false;
    async function save() {
        if (done) {
            return;
        }
        done = true;
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== t.title) {
            try {
                const res = await apiFetch(`/fuyuco/api/todos/${t.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: newTitle, deadline: t.deadline, memo: t.memo, urls: t.urls || [], tag_ids: t.tags.map(tg => tg.id), recurrence: t.recurrence })
                });
                const updated = await res.json();
                const idx = allTodos.findIndex(x => x.id === t.id);
                if (idx !== -1) {
                    allTodos[idx] = updated;
                }
                if (selectedTodoId === t.id) {
                    updateSidebar(updated, false);
                }
            } catch {
                // ここはうっとうしいのでエラーが出ても画面に出さない。
            }
        }
        render(allTodos);
    }
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        }
        if (e.key === 'Escape') {
            done = true;
            render(allTodos);
        }
    });
}

/**
 * 繰り返し情報の解析
 * 
 * @param {json} rec 
 * @returns 
 */
function parseRecurrence(rec) {
    if (!rec) {
        return { type: '', days: [], dates: [], end: '' };
    }
    try {
        const p = JSON.parse(rec);
        return { type: p.type || '', days: p.days || [], dates: p.dates || [], end: p.end || '' };
    } catch {
        return { type: rec, days: [], dates: [], end: '' };
    }
}

/**
 * サイドバーで入力されたTODO繰り返し情報をJSONにして返す
 * @returns TODO繰り返し情報のJSON
 */
function getRecurrenceValue() {
    const type = $ge('sb-recurrence').value;
    if (!type) {
        return null;
    }
    const days = [...$qsa('.recurrence-day-btn.on')].map(b => +b.dataset.day);
    const dates = [...$qsa('.recurrence-date-btn.on')].map(b => +b.dataset.date);
    return JSON.stringify({ type, days, dates });
}

/**
 * サイドバーに引数の内容の繰り返し情報を反映
 * 
 * @param {number} type 
 * @param {number[]} days 
 * @param {number[]} dates 
 * @param {*} end 
 */
function updateRecurrenceUI(type, days, dates, end) {
    const extra = $ge('sb-recurrence-extra');
    extra.classList.toggle('active', !!type);
    $ge('sb-weekdays-field').style.display = type === 'weekly' ? '' : 'none';
    $ge('sb-monthdates-field').style.display = type === 'monthly' ? '' : 'none';
    $qsa('.recurrence-day-btn').forEach(b =>
        b.classList.toggle('on', (days || []).includes(+b.dataset.day)));
    $qsa('.recurrence-date-btn').forEach(b =>
        b.classList.toggle('on', (dates || []).includes(+b.dataset.date)));
}

/**
 * サイドバーにTODOの情報を反映する。
 * TODOが新規(DB未登録)の場合と既存(DB登録済)の場合がある。
 * 
 * @param {*} t 
 * @param {*} isNew 
 */
function updateSidebar(t, isNew) {
    originalTask = isNew ? null : JSON.parse(JSON.stringify(t));
    $ge('sb-title').value = t.title ?? '';
    const dlVal = t.deadline
        ? (t.deadline.includes('T') ? t.deadline : t.deadline + 'T00:00')
        : '';
    $ge('sb-deadline-date').value = t.deadline ? t.deadline.slice(0, 10) : '';
    $ge('sb-deadline-time').value = (t.deadline && t.deadline.includes('T')) ? t.deadline.slice(11, 13) + ':00' : '00:00';
    const rec = parseRecurrence(t.recurrence);
    $ge('sb-recurrence').value = rec.type;
    updateRecurrenceUI(rec.type, rec.days, rec.dates, rec.end);
    const urlContainer = $ge('sb-urls');
    urlContainer.innerHTML = '';
    (t.urls || []).forEach(u => addUrlInput(u));
    updateUrlAddBtn();
    $ge('sb-memo-list').innerHTML = '';
    loadTodoMemos(t.id);
    $ge('sb-status-field').style.display = '';
    $ge('sb-del-btn').style.display = '';
    $ge('sb-star-btn').classList.toggle('starred', !!t.starred);
    const currentStatus = t.status || (t.done ? 'done' : 'todo');
    $qs(`input[name="sb-status"][value="${currentStatus}"]`).checked = true;
    sidebarTagIds = (t.tags ?? []).map(tg => tg.id);
    renderSidebarSelectedTags();
    $ge('sb-notify').value = t.notify ?? '';
    $ge('sidebar').classList.add('open');
}

/**
 * TODOの入力内容自動反映タイマー起動
 * @returns 
 */
function scheduleAutoSave() {
    if (selectedTodoId === null) {
        return;
    }
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveSelected, AUTO_SAVE_DEBOUNCE);
}

/**
 * 
 * @returns 
 */
function discardSidebar() {
    clearTimeout(autoSaveTimer);
    if (isNewMode) {
        closeSidebar();
        return;
    }
    if (originalTask) {
        updateSidebar(originalTask, false);
    }
    closeSidebar();
}

/**
 * 新規のTODOを作成するときの処理
 */
async function openNewTodo() {
    // const title = $ge('titleInput').value.trim() || DEFAULT_TITLE;
    const title = $ge('titleInput').value.trim();
    // デフォルトで当日の00:00を設定するように修正。
    const deadline = getDefaultDeadline();
    const res = await apiFetch(TODO_API, {
        method: HTTP_METHOD_POST, headers: JSON_HEADER,
        body: JSON.stringify({ title, deadline }),
    });
    const created = await res.json();
    $ge('titleInput').value = '';
    await fetchTodos();
    selectTodo(created.id);
    $ge('sb-title').select();
}

/**
 * TODO作成時のデフォルトの期限日時(現在日時の00:00)を生成して返す。
 * @returns 現在日時の00:00
 */
function getDefaultDeadline() {
    const today = nowJST().slice(0, 10);
    const deadline = `${today}T00:00`;
    return deadline;
}

/**
 * サイドバーのクローズ。
 * URLハッシュがTODO個別のリンクになっている場合は、現在のセクションの
 * ハッシュに戻す。
 * 拡大表示モーダルが開いている場合は、サイドバーを元の位置に戻してから閉じる。
 *
 */
function closeSidebar() {
    const hadSelection = selectedTodoId !== null;
    if (isTodoModalOpen) {
        closeTodoExpandModal();
    }
    selectedTodoId = null;
    isNewMode = false;
    Object.values(memoSaveTimers).forEach(t => clearTimeout(t));
    memoSaveTimers = {};
    $ge('sidebar').classList.remove('open');
    render(allTodos);
    if (hadSelection) {
        history.replaceState(null, '', '#' + activeSection);
    }
}

/**
 * 選択中のTODOの保存処理。
 * 
 * @returns 
 */
async function saveSelected() {
    const title = $ge('sb-title').value.trim() || DEFAULT_TITLE;
    const dlDate = $ge('sb-deadline-date').value;
    const dlTime = $ge('sb-deadline-time').value || '00:00';
    const deadline = dlDate ? dlDate + 'T' + dlTime : null;
    const recurrence = getRecurrenceValue();
    const urls = getSidebarUrls();
    const tag_ids = getSidebarCheckedTagIds();
    const notify = $ge('sb-notify').value || null;

    if (selectedTodoId === null) {
        return;
    }
    await apiFetch(`${TODO_API}/${selectedTodoId}`, {
        method: HTTP_METHOD_PUT, headers: JSON_HEADER,
        body: JSON.stringify({ title, deadline, urls, tag_ids, recurrence, notify }),
    });
    originalTask = {
        ...originalTask, title, deadline, urls,
        tags: allTodoLabels.filter(t => tag_ids.includes(t.id))
    };
    await fetchTodos();
}

/**
 * TODOのメモ一覧を取得してサイドバーに表示する。
 * @param {number} todoId
 */
async function loadTodoMemos(todoId) {
    const res = await apiFetch(`${TODO_API}/${todoId}/memos`);
    if (selectedTodoId !== todoId) {
        return;
    }
    const memos = await res.json();
    renderMemoList(todoId, memos);
}

/**
 * TODOメモ一覧をDOMに描画する。
 * 拡大表示モーダル（isTodoModalOpen）が開いている間は、履歴を一度に見られるよう
 * 全件を展開表示する。通常時は最新の1件のみ展開する
 * @param {number} todoId
 * @param {Array} memos
 */
function renderMemoList(todoId, memos) {
    const container = $ge('sb-memo-list');
    container.innerHTML = '';
    memos.forEach((memo, index) => {
        const entry = document.createElement('div');
        entry.className = 'memo-entry';

        const body = document.createElement('div');
        body.className = 'memo-entry-body';

        const ta = document.createElement('textarea');
        ta.placeholder = 'メモを入力...';
        ta.value = memo.content;
        ta.addEventListener('input', () => {
            scheduleMemoSave(memo.id, todoId, ta.value);
        });

        body.appendChild(ta);

        const footer = document.createElement('div');
        footer.className = 'memo-entry-footer';

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn-memo-del';
        delBtn.title = '削除';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await apiFetch(`${TODO_API}/${todoId}/memos/${memo.id}`, {
                method: HTTP_METHOD_DELETE,
            });
            entry.remove();
        });

        const ts = document.createElement('span');
        ts.className = 'memo-entry-date';
        ts.textContent = memo.created_at ? memo.created_at.slice(0, 10).replace(/-/g, '/') + ' ' + memo.created_at.slice(11, 16) : '';

        footer.appendChild(delBtn);
        footer.appendChild(ts);

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'memo-toggle-btn';

        let expanded = (index === 0) || isTodoModalOpen;

        function applyState() {
            if (expanded) {
                body.style.display = '';
                toggleBtn.textContent = '▲';
                footer.style.cursor = '';
            } else {
                body.style.display = 'none';
                toggleBtn.textContent = '▼';
                footer.style.cursor = 'pointer';
            }
        }

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            expanded = !expanded;
            applyState();
        });

        footer.addEventListener('click', () => {
            if (!expanded) {
                expanded = true;
                applyState();
            }
        });

        applyState();

        entry.appendChild(body);
        entry.appendChild(footer);
        entry.appendChild(toggleBtn);

        container.appendChild(entry);
    });
}

/**
 * TODOメモの自動保存タイマーをセットする。
 * @param {number} memoId
 * @param {number} todoId
 * @param {string} content
 */
function scheduleMemoSave(memoId, todoId, content) {
    if (memoSaveTimers[memoId]) {
        clearTimeout(memoSaveTimers[memoId]);
    }
    memoSaveTimers[memoId] = setTimeout(async () => {
        delete memoSaveTimers[memoId];
        await apiFetch(`${TODO_API}/${todoId}/memos/${memoId}`, {
            method: HTTP_METHOD_PUT,
            headers: JSON_HEADER,
            body: JSON.stringify({ content }),
        });
        const todo = allTodos.find(t => t.id === todoId);
        if (todo) {
            todo.latest_memo = content;
            render(allTodos);
        }
    }, AUTO_SAVE_DEBOUNCE);
}

/**
 * 選択中のTODOの完了／未完の切り替え
 * @returns
 */
async function toggleSelected() {
    if (selectedTodoId === null) {
        return;
    }
    const t = allTodos.find(t => t.id === selectedTodoId);
    const status = t?.status || (t?.done ? 'done' : 'todo');
    await setStatusById(selectedTodoId, status === 'done' ? 'todo' : 'done');
}

/**
 * 選択したTODOのステータス変更。
 * @param {number} status
 * @returns
 */
async function setStatusSelected(status) {
    if (selectedTodoId === null) {
        return;
    }
    await setStatusById(selectedTodoId, status);
}

/**
 * TODOのステータス変更。
 * ステータスが実際に変化した場合、変更内容がステータス変更履歴に記録される
 *
 * @param {number} id
 * @param {number} status
 */
async function setStatusById(id, status) {
    await apiFetch(`${TODO_API}/${id}/status`, {
        method: HTTP_METHOD_PATCH,
        headers: JSON_HEADER,
        body: JSON.stringify({ status }),
    });
    await fetchTodos();
}

/**
 * 選択したTODOの削除処理。
 * 削除確認は delById 内で行うため、ここでは確認しない。
 *
 * @returns {Promise<void>}
 */
async function delSelected() {
    if (selectedTodoId === null) {
        return;
    }
    const deleted = await delById(selectedTodoId);
    if (deleted) {
        closeSidebar();
    }
}

/**
 * TODOの完了/未完切り替え
 * @param {number} id
 */
async function toggleById(id) {
    const t = allTodos.find(t => t.id === id);
    const status = t?.status || (t?.done ? 'done' : 'todo');
    await setStatusById(id, status === 'done' ? 'todo' : 'done');
}

/**
 * TODOのスター（優先度）をON/OFFする。
 * @param {number} id - 対象TODOのID
 */
async function toggleStarById(id) {
    await apiFetch(`${TODO_API}/${id}/star`, { method: HTTP_METHOD_PATCH });
    fetchTodos();
}

/**
 * サイドバーで選択中のTODOのスターをON/OFFする。
 */
async function toggleStarSelected() {
    if (selectedTodoId === null) {
        return;
    }
    await toggleStarById(selectedTodoId);
}

/**
 * TODOの削除処理。確認ダイアログでキャンセルした場合は何もしない。
 *
 * @param {number} id
 * @returns {Promise<boolean>} 削除を実行した場合はtrue、キャンセルした場合はfalse
 */
async function delById(id) {
    const t = allTodos.find(t => t.id === id);
    if (!confirm(DELETE_TODO_MSG(t?.title))) {
        return false;
    }
    if (selectedTodoId === id) {
        selectedTodoId = null;
        $ge('sidebar').classList.remove('open');
    }
    await apiFetch(`${TODO_API}/${id}`, { method: 'DELETE' });
    fetchTodos();
    return true;
}

// ── Note タグ ───────────────────────────────
async function fetchNoteTags() {
    try {
        const res = await apiFetch(NOTE_TAGS_API);
        allNoteTags = await res.json();
        renderTagNav();
    } catch (error) {
        errorHandle(error, 'メモタグの取得に失敗しました', 'fetchNoteTags failed.');
    }
}

// ── Note CRUD ───────────────────────────────
async function fetchNotes() {
    try {
        let url;
        if (activeNoteTagId === 'archived') {
            url = `${NOTE_API}?archived=true`;
        } else if (activeNoteTagId !== null) {
            url = `${NOTE_API}?tag_id=${activeNoteTagId}`;
        } else {
            url = NOTE_API;
        }
        const res = await apiFetch(url);
        allNotes = await res.json();
        renderNotes();
        renderTagNav();
    } catch (error) {
        errorHandle(error, 'メモの取得に失敗しました', 'fetchNotes failed.')
    }
}

/**
 * メモを割り当てる。
 * 
 * @returns 
 */
function renderNotes() {
    $qs('#note-section .btn-new').style.display =
        activeNoteTagId === 'archived' ? 'none' : '';
    const grid = $ge('notesGrid');
    const empty = $ge('note-empty');
    document.querySelectorAll('body > .note-toolbar').forEach(t => t.remove());
    grid.innerHTML = '';
    if (allNotes.length === 0) {
        empty.style.display = '';
        return;
    }
    empty.style.display = 'none';
    allNotes.forEach(note => grid.appendChild(buildCard(note)));
}

/**
 * 色を白と混ぜて薄いパステル調にする。
 * タグ色をそのままメモの背景に使うと文字が読みにくくなるため、
 * 白を混ぜて薄めた色を作る。
 *
 * @param {string} hex - 元の色（#rrggbb形式）
 * @param {number} whiteRatio - 白を混ぜる割合（0〜1）
 * @returns {string} 薄めた色（rgb()形式）
 */
function lightenColor(hex, whiteRatio = 0.85) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const mix = c => Math.round(255 * whiteRatio + c * (1 - whiteRatio));
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/**
 * メモの背景色を決定する。
 * タグが設定されている場合は、その中で最もIDが小さい（＝最初に作られた）タグの色を
 * 白で薄めたパステル調にして使う。タグが1つも設定されていない場合は白を返す。
 *
 * @param {Array} tags - メモに付与されたタグの配列
 * @returns {string} 背景色（CSSカラー文字列）
 */
function getNoteBgColor(tags) {
    return tags.length > 0 ? lightenColor(tags[0].color) : '#ffffff';
}

/**
 * メモを構築する。
 *
 * @param {data} note
 * @returns
 */
function buildCard(note) {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.dataset.id = note.id;
    card.style.background = getNoteBgColor(note.tags);

    // ── ヘッダー（タイトル＋右上アクションボタン）──
    const headerEl = document.createElement('div');
    headerEl.className = 'note-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'note-title';
    titleEl.contentEditable = 'true';
    titleEl.dataset.placeholder = 'タイトル';
    titleEl.innerText = note.title;
    titleEl.addEventListener('input', () => scheduleNoteSave(note.id));

    const actionsEl = document.createElement('div');
    actionsEl.className = 'note-card-actions';

    const expandBtn = document.createElement('button');
    expandBtn.className = 'note-btn note-expand-btn';
    expandBtn.title = '拡大表示';
    expandBtn.textContent = '⤢';
    expandBtn.addEventListener('click', e => {
        e.stopPropagation();
        openNoteExpandModal(note.id);
    });

    const tagBtn = document.createElement('button');
    tagBtn.className = 'note-btn';
    tagBtn.title = 'タグを編集';
    tagBtn.textContent = '🏷';
    tagBtn.addEventListener('click', e => {
        e.stopPropagation();
        openTagPopup(tagBtn, note.id, new Set(note.tags.map(t => t.id)));
    });

    const linkBtn = document.createElement('button');
    linkBtn.className = 'note-btn';
    linkBtn.title = 'リンクをコピー';
    linkBtn.textContent = '🔗';
    linkBtn.addEventListener('click', e => {
        e.stopPropagation();
        copyNoteLink(note.id);
    });

    const archBtn = document.createElement('button');
    archBtn.className = 'note-btn';
    function updateArchBtnState() {
        archBtn.title = note.archived ? 'アーカイブ解除' : 'アーカイブ';
        archBtn.textContent = note.archived ? '↩' : '📦';
    }
    updateArchBtnState();
    archBtn.addEventListener('click', async e => {
        e.stopPropagation();
        clearTimeout(noteSaveTimers[note.id]);
        const res = await apiFetch(`${NOTE_API}/${note.id}/archive`, { method: HTTP_METHOD_PATCH });
        const updated = await res.json();
        note.archived = updated.archived;
        updateArchBtnState();
        fetchNotes();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'note-btn note-del-btn';
    delBtn.title = '削除';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(DELETE_NOTE_MSG)) {
            return;
        }
        clearTimeout(noteSaveTimers[note.id]);
        await apiFetch(`${NOTE_API}/${note.id}`, { method: HTTP_METHOD_DELETE });
        fetchNotes();
    });

    // ── 書式ツールバー（actionsElより先に作成してトグルボタンで参照）──
    const toolbar = document.createElement('div');
    toolbar.className = 'note-toolbar';

    const editToggleBtn = document.createElement('button');
    editToggleBtn.className = 'note-btn note-edit-toggle-btn';
    editToggleBtn.title = '書式';
    editToggleBtn.textContent = '✏️';
    editToggleBtn.addEventListener('mousedown', e => e.preventDefault());
    let closeToolbar = null;

    editToggleBtn.addEventListener('click', () => {
        if (closeToolbar) {
            closeToolbar();
            return;
        }

        toolbar.style.visibility = 'hidden';
        document.body.appendChild(toolbar);
        const tbRect = toolbar.getBoundingClientRect();
        const btnRect = editToggleBtn.getBoundingClientRect();
        toolbar.style.left = `${Math.max(4, btnRect.right - tbRect.width)}px`;
        toolbar.style.top = `${btnRect.top - tbRect.height - 6}px`;
        toolbar.style.visibility = '';
        editToggleBtn.classList.add('active');

        function outsideHandler(ev) {
            if (toolbar.contains(ev.target) || ev.target === editToggleBtn || bodyEl.contains(ev.target)) {
                return;
            }
            closeToolbar();
        }
        closeToolbar = () => {
            toolbar.remove();
            editToggleBtn.classList.remove('active');
            document.removeEventListener('click', outsideHandler);
            closeToolbar = null;
        };
        setTimeout(() => document.addEventListener('click', outsideHandler), 0);
    });

    actionsEl.appendChild(expandBtn);
    actionsEl.appendChild(linkBtn);
    actionsEl.appendChild(editToggleBtn);
    actionsEl.appendChild(archBtn);
    actionsEl.appendChild(delBtn);

    headerEl.appendChild(titleEl);
    headerEl.appendChild(actionsEl);

    // ── 本文 ──
    const bodyEl = document.createElement('div');
    bodyEl.className = 'note-body';
    bodyEl.contentEditable = 'true';
    bodyEl.dataset.placeholder = 'メモを入力...';
    bodyEl.innerHTML = bodyToHtml(note.body);
    bodyEl.addEventListener('input', () => scheduleNoteSave(note.id));
    let bodyWasFocused = false;
    bodyEl.addEventListener('mousedown', () => {
        bodyWasFocused = document.activeElement === bodyEl;
    });
    bodyEl.addEventListener('click', e => {
        if (e.target.tagName === 'A' && !bodyWasFocused) {
            window.open(e.target.href, '_blank', 'noopener noreferrer');
        }
        if (e.target.classList.contains('note-img') && !bodyWasFocused) {
            openImageLightbox(e.target.src);
        }
    });
    bodyEl.addEventListener('paste', e => {
        const items = e.clipboardData?.items;
        if (!items) {
            return;
        }
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const reader = new FileReader();
                reader.onload = ev => {
                    const img = document.createElement('img');
                    img.src = ev.target.result;
                    img.className = 'note-img';
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        range.deleteContents();
                        range.insertNode(img);
                        range.setStartAfter(img);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    } else {
                        bodyEl.appendChild(img);
                    }
                    scheduleNoteSave(note.id);
                };
                reader.readAsDataURL(item.getAsFile());
                return;
            }
        }
        // リッチテキストからフォント指定・背景色を除去してペースト
        const html = e.clipboardData.getData('text/html');
        if (html) {
            e.preventDefault();
            const tmp = new DOMParser().parseFromString(html, 'text/html');
            tmp.querySelectorAll('[style]').forEach(el => {
                el.style.fontFamily = '';
                el.style.fontSize = '';
                el.style.backgroundColor = '';
                if (!el.getAttribute('style').trim()) {
                    el.removeAttribute('style');
                }
            });
            tmp.querySelectorAll('font[face]').forEach(el => el.removeAttribute('face'));
            tmp.querySelectorAll('font[size]').forEach(el => el.removeAttribute('size'));
            document.execCommand('insertHTML', false, DOMPurify.sanitize(tmp.body.innerHTML));
            scheduleNoteSave(note.id);
        }
    });
    bodyEl.addEventListener('blur', () => {
        bodyEl.innerHTML = linkifyText(DOMPurify.sanitize(bodyEl.innerHTML));
    });

    // ── タグ行（タグボタン＋タグピル）──
    const tagsEl = document.createElement('div');
    tagsEl.className = 'note-tags';
    tagsEl.id = `tags-${note.id}`;
    renderNoteTags(tagsEl, note.tags);

    const tagsRowEl = document.createElement('div');
    tagsRowEl.className = 'note-tags-row';
    tagsRowEl.appendChild(tagBtn);
    tagsRowEl.appendChild(tagsEl);

    let savedRange = null;
    const toolDefs = [
        { label: 'B', title: '太字', cmd: 'bold', style: 'font-weight:bold' },
        { label: 'I', title: '斜体', cmd: 'italic', style: 'font-style:italic' },
        { label: 'U', title: '下線', cmd: 'underline', style: 'text-decoration:underline' },
        { label: 'S', title: '打消し線', cmd: 'strikeThrough', style: 'text-decoration:line-through' },
        null,
        { label: '•', title: '箇条書き', cmd: 'insertUnorderedList' },
        { label: '1.', title: '番号リスト', cmd: 'insertOrderedList' },
        null,
        { isColor: true, title: '文字色' },
    ];
    toolDefs.forEach(def => {
        if (def === null) {
            const sep = document.createElement('span');
            sep.className = 'note-tool-sep';
            toolbar.appendChild(sep);
            return;
        }
        const btn = document.createElement('button');
        btn.className = 'note-tool-btn';
        btn.title = def.title;
        btn.addEventListener('mousedown', e => e.preventDefault());
        if (def.isColor) {
            // 文字色変更
            const ind = document.createElement('span');
            ind.style.cssText = 'border-bottom:2.5px solid #ef4444;padding-bottom:1px';
            ind.textContent = 'A';
            btn.appendChild(ind);
            btn.addEventListener('click', () => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    savedRange = sel.getRangeAt(0).cloneRange();
                }
                openSwatchPopup(btn, 5, TEXT_COLORS, null, color => {
                    ind.style.borderBottomColor = color;
                    if (savedRange) {
                        bodyEl.focus();
                        const s = window.getSelection();
                        s.removeAllRanges();
                        s.addRange(savedRange);
                        savedRange = null;
                    }
                    document.execCommand('foreColor', false, color);
                    scheduleNoteSave(note.id);
                });
            });
        } else {
            // 文字色変更以外
            if (def.style) {
                btn.setAttribute('style', def.style);
            }
            btn.textContent = def.label;
            btn.addEventListener('click', () => {
                document.execCommand(def.cmd, false, null);
                scheduleNoteSave(note.id);
            });
        }
        toolbar.appendChild(btn);
    });

    card.appendChild(headerEl);
    card.appendChild(bodyEl);
    card.appendChild(tagsRowEl);

    card.addEventListener('focusout', e => {
        if (!card.contains(e.relatedTarget)) {
            flushNoteSave(note.id);
            if (closeToolbar) {
                closeToolbar();
            }
        }
    });

    // ── ドラッグ並び替え ──
    card.draggable = true;
    [titleEl, bodyEl].forEach(el => {
        el.addEventListener('focus', () => {
            card.draggable = false;
        });
        el.addEventListener('blur', () => {
            card.draggable = true;
        });
    });
    card.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', note.id);
        card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        $qsa('.note-card.drag-over').forEach(c => c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
    });
    card.addEventListener('drop', async e => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const fromId = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toId = note.id;
        if (fromId === toId) {
            return;
        }
        const grid = $ge('notesGrid');
        const cards = [...grid.querySelectorAll('.note-card')];
        const fromEl = grid.querySelector(`.note-card[data-id="${fromId}"]`);
        const toEl = card;
        const fromIdx = cards.indexOf(fromEl);
        const toIdx = cards.indexOf(toEl);
        if (fromIdx < toIdx) {
            toEl.after(fromEl);
        } else {
            toEl.before(fromEl);
        }
        const newOrder = [...grid.querySelectorAll('.note-card')].map(c => parseInt(c.dataset.id, 10));
        await apiFetch(`${NOTE_API}/reorder`, {
            method: HTTP_METHOD_PUT,
            headers: JSON_HEADER,
            body: JSON.stringify({ ids: newOrder }),
        });
        allNotes.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
    });

    return card;
}

/**
 * メモ用タグを連結する。
 * 
 * @param {Node} container 
 * @param {Array} tags 
 */
function renderNoteTags(container, tags) {
    container.innerHTML = '';
    tags.forEach(tag => {
        const pill = document.createElement('span');
        pill.className = 'note-tag-pill';
        pill.style.background = tag.color;
        pill.title = tag.name;
        pill.textContent = truncTag(tag.name);
        container.appendChild(pill);
    });
}

/**
 * メモデータを取得する
 * @param {number} noteId 
 * @returns 
 */
function getNoteCardData(noteId) {
    const card = $qs(`.note-card[data-id="${noteId}"]`);
    if (!card) {
        return null;
    }
    const note = allNotes.find(n => n.id === noteId);
    const tagIds = activePopup
        ? [...activePopup.querySelectorAll('input[type=checkbox]:checked')].map(cb => +cb.value)
        : note?.tags.map(t => t.id) ?? [];
    const selectedTags = allNoteTags
        .filter(t => tagIds.includes(t.id))
        .sort((a, b) => a.id - b.id);
    return {
        title: card.querySelector('.note-title').innerText.trim(),
        body: card.querySelector('.note-body').innerHTML,
        color: getNoteBgColor(selectedTags),
        tag_ids: tagIds,
    };
}

/**
 * メモ入力中の自動保存が頻繁になりすぎないように制御をする。
 * @param {number} noteId 
 */
function scheduleNoteSave(noteId) {
    clearTimeout(noteSaveTimers[noteId]);
    noteSaveTimers[noteId] = setTimeout(() => flushNoteSave(noteId), NOTE_SAVE_DEBOUNCE);
}

/**
 * メモを保存する。
 * @param {number} noteId 
 * @returns 
 */
async function flushNoteSave(noteId) {
    clearTimeout(noteSaveTimers[noteId]);
    const data = getNoteCardData(noteId);
    if (!data) {
        return;
    }
    const res = await apiFetch(`${NOTE_API}/${noteId}`, {
        method: HTTP_METHOD_PUT, headers: JSON_HEADER,
        body: JSON.stringify(data),
    });
    const updated = await res.json();
    const note = allNotes.find(n => n.id === noteId);
    if (note) {
        note.tags = updated.tags;
        const tagsEl = $ge(`tags-${noteId}`);
        if (tagsEl) {
            renderNoteTags(tagsEl, updated.tags);
        }
        const card = $qs(`.note-card[data-id="${noteId}"]`);
        if (card) {
            card.style.background = getNoteBgColor(updated.tags);
        }
    }
    renderTagNav();
}

/**
 * メモを作成する。
 */
async function createNote() {
    const note = await (await apiFetch(NOTE_API, {
        method: HTTP_METHOD_POST, headers: JSON_HEADER,
        body: JSON.stringify({ title: '', body: '', color: '#ffffff' }),
    })).json();
    allNotes.unshift(note);
    $ge('note-empty').style.display = 'none';
    const card = buildCard(note);
    $ge('notesGrid').prepend(card);
    card.querySelector('.note-title').focus();
    renderTagNav();
}

// ── ユーティリティ ──────────────────────────
/**
 * イメージを画面に拡大表示する。
 * 
 * @param {data} src 
 */
function openImageLightbox(src) {
    const overlay = document.createElement('div');
    overlay.className = 'img-lightbox';
    const img = document.createElement('img');
    img.src = src;
    overlay.appendChild(img);
    overlay.addEventListener('click', () => overlay.remove());
    document.addEventListener('keydown', function h(e) {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', h);
        }
    });
    document.body.appendChild(overlay);
}

let noteModalOriginalParent = null;
let noteModalOriginalNext = null;

/**
 * メモをモーダルで拡大表示する。
 * カードのDOM要素をそのままモーダルへ移動するため、既存の編集・自動保存・
 * 書式ツールバーなどの挙動はそのまま引き継がれる。
 *
 * @param {number} noteId
 */
function openNoteExpandModal(noteId) {
    if ($qs('.note-modal-overlay')) {
        return;
    }
    const card = $qs(`.note-card[data-id="${noteId}"]`);
    if (!card) {
        return;
    }
    noteModalOriginalParent = card.parentNode;
    noteModalOriginalNext = card.nextSibling;

    const overlay = document.createElement('div');
    overlay.className = 'note-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'note-modal';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'note-modal-close';
    closeBtn.title = '閉じる';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeNoteExpandModal);

    modal.appendChild(closeBtn);
    modal.appendChild(card);
    overlay.appendChild(modal);

    overlay.addEventListener('click', e => {
        if (e.target === overlay) {
            closeNoteExpandModal();
        }
    });
    document.addEventListener('keydown', handleNoteModalKeydown);
    document.body.appendChild(overlay);
}

/**
 * メモの拡大表示モーダルを閉じ、カードを元の位置に戻す。
 * モーダル内から削除／アーカイブされ、現在の一覧に存在しなくなったメモは戻さない。
 * 元の挿入位置が失われている場合（一覧が再描画された場合など）は末尾に戻す。
 * モーダル表示中に一覧が再描画され、同じメモのカードが既に存在する場合は
 * それを取り除いてから、モーダルで編集していたカードを差し戻す。
 */
function closeNoteExpandModal() {
    const overlay = $qs('.note-modal-overlay');
    if (!overlay) {
        return;
    }
    const card = overlay.querySelector('.note-card');
    if (card && noteModalOriginalParent && allNotes.some(n => n.id === +card.dataset.id)) {
        const duplicate = noteModalOriginalParent.querySelector(`.note-card[data-id="${card.dataset.id}"]`);
        if (duplicate && duplicate !== card) {
            duplicate.remove();
        }
        const nextIsValid = noteModalOriginalNext === null
            || noteModalOriginalParent.contains(noteModalOriginalNext);
        noteModalOriginalParent.insertBefore(card, nextIsValid ? noteModalOriginalNext : null);
    }
    overlay.remove();
    noteModalOriginalParent = null;
    noteModalOriginalNext = null;
    document.removeEventListener('keydown', handleNoteModalKeydown);
}

/**
 * メモ拡大モーダル表示中にEscapeキーで閉じられるようにする。
 * @param {KeyboardEvent} e
 */
function handleNoteModalKeydown(e) {
    if (e.key === 'Escape') {
        closeNoteExpandModal();
    }
}

/**
 * TODOをモーダルで拡大表示する。
 * サイドバーのDOM要素をそのままモーダルへ移動するため、編集内容・自動保存・
 * ステータス変更などの挙動はそのまま引き継がれる。
 * メモ履歴を一度に見られるよう、開いている間はメモ一覧を全件展開表示にする。
 */
function openTodoExpandModal() {
    if (selectedTodoId === null || $qs('.todo-modal-overlay')) {
        return;
    }
    const sidebar = $ge('sidebar');
    todoModalOriginalParent = sidebar.parentNode;
    todoModalOriginalNext = sidebar.nextSibling;

    const overlay = document.createElement('div');
    overlay.className = 'todo-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'todo-modal';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'todo-modal-close';
    closeBtn.title = '閉じる';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeTodoExpandModal);

    modal.appendChild(closeBtn);
    modal.appendChild(sidebar);
    overlay.appendChild(modal);

    overlay.addEventListener('click', e => {
        if (e.target === overlay) {
            closeTodoExpandModal();
        }
    });
    document.addEventListener('keydown', handleTodoModalKeydown);
    document.body.appendChild(overlay);

    isTodoModalOpen = true;
    loadTodoMemos(selectedTodoId);
}

/**
 * TODOの拡大表示モーダルを閉じ、サイドバーを元の位置に戻す。
 * 元の挿入位置が失われている場合（画面切り替えなどでレイアウトが変わった場合）は
 * 末尾に戻す。閉じた後はメモ一覧を通常表示（最新の1件のみ展開）に戻す。
 */
function closeTodoExpandModal() {
    const overlay = $qs('.todo-modal-overlay');
    if (!overlay) {
        return;
    }
    const sidebar = overlay.querySelector('#sidebar');
    if (sidebar && todoModalOriginalParent) {
        const nextIsValid = todoModalOriginalNext === null
            || todoModalOriginalParent.contains(todoModalOriginalNext);
        todoModalOriginalParent.insertBefore(sidebar, nextIsValid ? todoModalOriginalNext : null);
    }
    overlay.remove();
    todoModalOriginalParent = null;
    todoModalOriginalNext = null;
    isTodoModalOpen = false;
    document.removeEventListener('keydown', handleTodoModalKeydown);
    if (selectedTodoId !== null) {
        loadTodoMemos(selectedTodoId);
    }
}

/**
 * TODO拡大モーダル表示中にEscapeキーで閉じられるようにする。
 * @param {KeyboardEvent} e
 */
function handleTodoModalKeydown(e) {
    if (e.key === 'Escape') {
        closeTodoExpandModal();
    }
}

/**
 * HTML文字列をエスケープして返す。
 * @param {String} s 
 * @returns 
 */
function escHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

/**
 * 20文字以上の長さのタグ名の場合は20文字目以降を「…」にして返す。
 * 
 * @param {String} name 
 * @returns 
 */
function truncTag(name) {
    return name.length > 20 ? name.slice(0, 19) + '…' : name;
}

/**
 * HTMLテキストからリンクを抽出してリンク化して返す。
 * 
 * @param {String} html 
 * @returns 
 */
function linkifyText(html) {
    return Autolinker.link(html, {
        urls: true,
        email: false,
        phone: false,
        stripPrefix: false,
        className: 'note-link',
        newWindow: true,
    });
}

/**
 * 文章をHTMLサニタイジングする。
 * 
 * @param {String} body 
 * @returns 
 */
function bodyToHtml(body) {
    if (!body) {
        return '';
    }
    if (/<[a-z][\s\S]*?>/i.test(body)) {
        return DOMPurify.sanitize(body);
    }
    return DOMPurify.sanitize(body).replace(/\n/g, '<br>');
}

/**
 * 今日の日付を返す。
 * 
 * @returns yyyy-MM-ddフォーマットの日本時間の現在時刻 
 */
function nowJST() {
    return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '');
}

// ── イベントリスナー ────────────────────────
/**
 * タグ入力時の Enterキーイベント。
 * タグを追加。
 */
$ge('tagInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        addTag();
    }
});

const newTagColorBtn = $ge('newTagColorBtn');
newTagColorBtn.style.background = todoSelectedColor;
newTagColorBtn.addEventListener('click', () => {
    const current = isNote() ? todoSelectedColor : noteSelectedColor;
    openSwatchPopup(newTagColorBtn, 5, TAG_PRESET_COLORS, current, color => {
        if (!isNote()) {
            todoSelectedColor = color;
        } else {
            noteSelectedColor = color;
        }
        newTagColorBtn.style.background = color;
    });
});

/**
 * 画面のどこかをクリックしたときのイベント。
 * サイドバーを非表示にする。
 *
 */
let mousedownInSidebar = false;
document.addEventListener('mousedown', e => {
    mousedownInSidebar = !!e.target.closest('.sidebar');
});
document.addEventListener('click', e => {
    if (activeSection === 'note') {
        return;
    }
    if (!selectedTodoId && !isNewMode) {
        return;
    }
    if (mousedownInSidebar) {
        return;
    }
    if (
        e.target.closest('.todo-card') ||
        e.target.closest('.kanban-card') ||
        e.target.closest('.sidebar') ||
        e.target.closest('.tag-nav') ||
        e.target.closest('.form-card') ||
        e.target.closest('.color-swatch-popup') ||
        e.target.closest('.tag-popup')
    ) {
        return;
    }
    closeSidebar();
});

/**
 * TODOのタイトル入力欄でのキーイベント処理。
 * 
 */
$ge('titleInput').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') {
        return;
    }
    const title = $ge('titleInput').value.trim();
    if (!title) {
        return;
    }
    // デフォルトで当日の00:00を設定するように修正。
    const deadline = getDefaultDeadline();
    const res = await apiFetch(TODO_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, deadline }),
    });
    $ge('titleInput').value = '';
    const created = await res.json();
    selectedTodoId = created.id;
    isNewMode = false;
    await fetchTodos();
    const t = allTodos.find(t => t.id === created.id);
    if (t) {
        updateSidebar(t, false);
    }
});

// 毎月日付グリッドを生成
(function () {
    const grid = $ge('sb-date-grid');
    for (let d = 1; d <= 31; d++) {
        const btn = document.createElement('button');
        btn.className = 'recurrence-date-btn';
        btn.dataset.date = d;
        btn.type = 'button';
        btn.textContent = d;
        btn.addEventListener('click', () => {
            btn.classList.toggle('on');
            scheduleAutoSave();
        });
        grid.appendChild(btn);
    }
})();

$qsa('.recurrence-day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.classList.toggle('on');
        scheduleAutoSave();
    });
});

$ge('sb-recurrence').addEventListener('change', () => {
    const type = $ge('sb-recurrence').value;
    updateRecurrenceUI(type, [], [], null);
    scheduleAutoSave();
});

['sb-title', 'sb-deadline-date'].forEach(id => {
    $ge(id).addEventListener('input', scheduleAutoSave);
});
$ge('sb-deadline-time').addEventListener('change', scheduleAutoSave);
$ge('sb-notify').addEventListener('change', () => {
    if ($ge('sb-notify').value !== '') {
        requestNotificationPermission();
    }
    scheduleAutoSave();
});
$ge('sb-tag-btn').addEventListener('click', openSidebarTagPopup);
$ge('sb-url-add-btn').addEventListener('click', () => addUrlInput());
$ge('sb-memo-add-btn').addEventListener('click', async () => {
    if (selectedTodoId === null) {
        return;
    }
    await apiFetch(`${TODO_API}/${selectedTodoId}/memos`, {
        method: HTTP_METHOD_POST,
        headers: JSON_HEADER,
        body: JSON.stringify({ content: '' }),
    });
    await loadTodoMemos(selectedTodoId);
    const firstTa = $ge('sb-memo-list').querySelector('textarea');
    if (firstTa) {
        firstTa.focus();
    }
});

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        return;
    }
    try {
        await navigator.serviceWorker.register('/fuyuco/sw.js');
    } catch (e) {
        console.warn('ServiceWorker registration failed:', e);
    }
}

function buildNotifyItems() {
    const now = Date.now();
    return allTodos
        .filter(t => t.status !== 'done' && t.notify !== null && t.notify !== '' && t.deadline)
        .map(t => {
            const notifyMinutes = parseInt(t.notify, 10);
            const notifyAt = new Date(t.deadline).getTime() - notifyMinutes * 60 * 1000;
            return { id: t.id, title: t.title, notifyAt, notifyMinutes };
        })
        .filter(item => item.notifyAt > now);
}

function scheduleNotificationsViaSW() {
    if (!('serviceWorker' in navigator)) {
        return;
    }
    navigator.serviceWorker.ready.then(reg => {
        if (reg.active) {
            reg.active.postMessage({ type: 'SCHEDULE', items: buildNotifyItems() });
        }
    });
}

/**
 * 期限通知を確認し、必要に応じて通知を表示する。
 * Service Workerが有効な場合はSW経由でスケジュールし、フォールバックは使わない。
 * SWが使えない場合のみ、このタブから直接 new Notification() を発火する。
 */
function checkDeadlineNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
    }
    scheduleNotificationsViaSW();
    if (navigator.serviceWorker?.controller) {
        return;
    }
    const now = Date.now();
    for (const todo of allTodos) {
        if (todo.status === 'done' || todo.notify === null || todo.notify === '' || !todo.deadline) {
            continue;
        }
        if (notifiedTodos.has(todo.id)) {
            continue;
        }
        const notifyMinutes = parseInt(todo.notify, 10);
        const notifyAt = new Date(todo.deadline).getTime() - notifyMinutes * 60 * 1000;
        if (now >= notifyAt && now < notifyAt + 90 * 1000) {
            notifiedTodos.add(todo.id);
            const notifTitle = notifyMinutes === 0
                ? '期限になりました'
                : `${notifyMinutes}分後に期限です`;
            new Notification(notifTitle, { body: todo.title, icon: '/fuyuco/todo.png' });
        }
    }
}

// 日付変更検知（日付が変わったらTODOを再取得して繰り返しタスクを生成）
setInterval(() => {
    const newDate = nowJST().slice(0, 10);
    now = nowJST().slice(0, 16);
    if (newDate !== today) {
        today = newDate;
        if (!isNote() && !isLabelSection()) {
            fetchTodos();
        }
    } else if (!isNote() && !isLabelSection()) {
        render(allTodos);
    }
    checkDeadlineNotifications();
}, 60000);

// ── ラベル管理セクション ────────────────────────

/**
 * スプリットボタンを構築する。
 * 主ボタンをクリックすると現在選択中の操作を実行し、
 * ▼ボタンをクリックすると操作の切り替えメニューを開く。
 *
 * @param {{options: {label: string, onSelect: function}[], danger?: boolean}} config
 * @returns {HTMLElement} スプリットボタン要素
 */
function buildSplitButton(config) {
    let selected = 0;
    const wrap = document.createElement('div');
    wrap.className = `split-btn${config.danger ? ' split-btn-danger' : ''}`;

    const mainBtn = document.createElement('button');
    mainBtn.type = 'button';
    mainBtn.className = 'split-btn-main';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'split-btn-toggle';
    toggleBtn.textContent = '▼';

    function refreshLabel() {
        mainBtn.textContent = config.options[selected].label;
    }
    refreshLabel();

    mainBtn.addEventListener('click', () => {
        config.options[selected].onSelect();
    });
    toggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        openSplitMenu(toggleBtn, config.options, selected, index => {
            selected = index;
            refreshLabel();
        });
    });

    wrap.appendChild(mainBtn);
    wrap.appendChild(toggleBtn);
    fixSplitButtonMainWidth(mainBtn, wrap, config.options);
    refreshLabel();
    return wrap;
}

/**
 * 選択中の操作によってボタンの大きさが変わらないよう、
 * 全選択肢のうち最も幅が広いラベルに合わせて主ボタンの幅を固定する。
 *
 * @param {HTMLElement} mainBtn 主ボタン要素
 * @param {HTMLElement} wrap スプリットボタン全体のラッパー要素
 * @param {{label: string}[]} options 選択肢
 */
function fixSplitButtonMainWidth(mainBtn, wrap, options) {
    wrap.style.position = 'fixed';
    wrap.style.visibility = 'hidden';
    document.body.appendChild(wrap);
    let maxWidth = 0;
    options.forEach(opt => {
        mainBtn.textContent = opt.label;
        maxWidth = Math.max(maxWidth, mainBtn.offsetWidth);
    });
    document.body.removeChild(wrap);
    wrap.style.position = '';
    wrap.style.visibility = '';
    mainBtn.style.width = `${maxWidth}px`;
}

let cachedLabelActionButtonWidth = null;

/**
 * クローズ／復活／削除ボタンとして表示されうる全テキストのうち、
 * 最も幅を必要とするものに合わせた共通のボタン幅（矢印部分を含む全体幅）を算出する。
 * ラベルがクローズ済みか否かによらず常に同じ値になるよう、計算結果をキャッシュして使い回す。
 *
 * @returns {number} 共通のボタン幅(px)
 */
function getLabelActionButtonWidth() {
    if (cachedLabelActionButtonWidth !== null) {
        return cachedLabelActionButtonWidth;
    }
    let maxWidth = 0;

    const splitWrap = document.createElement('div');
    splitWrap.className = 'split-btn';
    const splitMain = document.createElement('button');
    splitMain.type = 'button';
    splitMain.className = 'split-btn-main';
    const splitToggle = document.createElement('button');
    splitToggle.type = 'button';
    splitToggle.className = 'split-btn-toggle';
    splitToggle.textContent = '▼';
    splitWrap.appendChild(splitMain);
    splitWrap.appendChild(splitToggle);
    splitWrap.style.position = 'fixed';
    splitWrap.style.visibility = 'hidden';
    document.body.appendChild(splitWrap);
    ['クローズ', 'TODOをすべて完了にしてクローズ', '削除', 'TODOをすべて削除して削除'].forEach(text => {
        splitMain.textContent = text;
        maxWidth = Math.max(maxWidth, splitWrap.offsetWidth);
    });
    document.body.removeChild(splitWrap);

    const single = document.createElement('button');
    single.type = 'button';
    single.className = 'btn-label-close';
    single.textContent = '復活';
    single.style.position = 'fixed';
    single.style.visibility = 'hidden';
    document.body.appendChild(single);
    maxWidth = Math.max(maxWidth, single.offsetWidth);
    document.body.removeChild(single);

    cachedLabelActionButtonWidth = maxWidth;
    return maxWidth;
}

/**
 * クローズ（または復活）ボタンと削除ボタンの全体幅を揃える。
 * ラベルの状態（クローズ済みか否か）によって表示されるテキストが変わっても
 * 幅が変化しないよう、状態非依存の共通幅に合わせて主要部分の幅を調整する。
 *
 * @param {HTMLElement} closeEl buildLabelCloseButtonの戻り値
 * @param {HTMLElement} deleteEl buildLabelDeleteButtonの戻り値
 */
function alignActionButtonWidths(closeEl, deleteEl) {
    function mainOf(el) {
        return el.querySelector('.split-btn-main') || el;
    }
    const target = getLabelActionButtonWidth();

    closeEl.style.position = 'fixed';
    closeEl.style.visibility = 'hidden';
    deleteEl.style.position = 'fixed';
    deleteEl.style.visibility = 'hidden';
    document.body.appendChild(closeEl);
    document.body.appendChild(deleteEl);

    const closeMain = mainOf(closeEl);
    const deleteMain = mainOf(deleteEl);
    closeMain.style.width = `${closeMain.offsetWidth + (target - closeEl.offsetWidth)}px`;
    deleteMain.style.width = `${deleteMain.offsetWidth + (target - deleteEl.offsetWidth)}px`;

    document.body.removeChild(closeEl);
    document.body.removeChild(deleteEl);
    closeEl.style.position = '';
    closeEl.style.visibility = '';
    deleteEl.style.position = '';
    deleteEl.style.visibility = '';
}

/**
 * スプリットボタンの操作切り替えメニューを表示する。
 *
 * @param {Element} anchorEl アンカー要素
 * @param {{label: string, onSelect: function}[]} options 選択肢
 * @param {number} selectedIndex 現在選択中のインデックス
 * @param {function} onPick 選択時に呼ばれるコールバック
 */
function openSplitMenu(anchorEl, options, selectedIndex, onPick) {
    if (activePopup) {
        activePopup.remove();
        activePopup = null;
    }
    const menu = document.createElement('div');
    menu.className = 'split-menu';
    options.forEach((opt, index) => {
        const item = document.createElement('div');
        item.className = `split-menu-item${index === selectedIndex ? ' selected' : ''}`;
        item.textContent = opt.label;
        item.addEventListener('click', e => {
            e.stopPropagation();
            onPick(index);
            menu.remove();
            activePopup = null;
        });
        menu.appendChild(item);
    });
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();
    const anchorRect = anchorEl.getBoundingClientRect();
    menu.style.left = `${Math.max(4, anchorRect.right - menuRect.width)}px`;
    menu.style.top = `${anchorRect.bottom + 4}px`;
    menu.style.visibility = '';
    activePopup = menu;
    setTimeout(() => {
        document.addEventListener('click', function h(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                activePopup = null;
                document.removeEventListener('click', h);
            }
        });
    }, 0);
}

/**
 * ラベルのクローズ／再開ボタンを構築する。
 * クローズ済みの場合は「復活」ボタン、未クローズの場合は
 * 「クローズ」と「TODOをすべて完了にしてクローズ」を切り替えられるスプリットボタンにする。
 *
 * @param {data} label
 * @returns {HTMLElement}
 */
function buildLabelCloseButton(label) {
    if (label.closed) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-label-close closed';
        btn.textContent = '復活';
        btn.addEventListener('click', () => reopenLabel(label));
        return btn;
    }
    return buildSplitButton({
        options: [
            { label: 'クローズ', onSelect: () => closeLabelOnly(label) },
            { label: 'TODOをすべて完了にしてクローズ', onSelect: () => completeLabelTodosAndClose(label) },
        ],
    });
}

/**
 * ラベルの削除ボタンを構築する。
 * 「削除」と「TODOをすべて削除して削除」を切り替えられるスプリットボタンにする。
 *
 * @param {data} label
 * @returns {HTMLElement}
 */
function buildLabelDeleteButton(label) {
    return buildSplitButton({
        danger: true,
        options: [
            { label: '削除', onSelect: () => deleteLabelOnly(label) },
            { label: 'TODOをすべて削除して削除', onSelect: () => deleteLabelTodosAndLabel(label) },
        ],
    });
}

/**
 * ラベルをクローズする（付いているTODOはそのまま残す）。
 *
 * @param {data} label
 */
function closeLabelOnly(label) {
    label.closed = 1;
    scheduleLabelSave(label);
    renderLabelManagementDetail(label);
}

/**
 * ラベルのクローズを解除する。
 *
 * @param {data} label
 */
function reopenLabel(label) {
    label.closed = 0;
    scheduleLabelSave(label);
    renderLabelManagementDetail(label);
}

/**
 * このラベルが付いたTODOをすべて完了状態にしたうえで、ラベルをクローズする。
 *
 * @param {data} label
 * @returns {Promise<void>}
 */
async function completeLabelTodosAndClose(label) {
    if (!confirm(`ラベル「${label.name}」が付いたTODOをすべて完了にしてクローズしますか？`)) {
        return;
    }
    try {
        const res = await apiFetch(`${TODO_API}?tag_id=${label.id}`);
        const todos = await res.json();
        const unfinished = todos.filter(t => (t.status || (t.done ? 'done' : 'todo')) !== 'done');
        await Promise.all(unfinished.map(t => apiFetch(`${TODO_API}/${t.id}/status`, {
            method: HTTP_METHOD_PATCH, headers: JSON_HEADER,
            body: JSON.stringify({ status: 'done' }),
        })));
        clearTimeout(labelSaveTimers[label.id]);
        delete labelSaveTimers[label.id];
        label.closed = 1;
        await saveLabelNow(label);
        showToast('TODOを完了にしてラベルをクローズしました');
        renderLabelManagementDetail(label);
        renderTagNav();
    } catch (error) {
        errorHandle(error, '処理に失敗しました', 'completeLabelTodosAndClose failed.');
    }
}

/**
 * ラベルのみを削除する（付いているTODOは残す）。
 *
 * @param {data} label
 * @returns {Promise<void>}
 */
async function deleteLabelOnly(label) {
    if (!confirm(`ラベル「${label.name}」を削除しますか？`)) {
        return;
    }
    try {
        clearTimeout(labelSaveTimers[label.id]);
        delete labelSaveTimers[label.id];
        await apiFetch(`${TODO_LABELS_API}/${label.id}`, { method: HTTP_METHOD_DELETE });
        if (activeLabelMgmtId === label.id) {
            activeLabelMgmtId = null;
        }
        await renderLabelSection();
    } catch (error) {
        errorHandle(error, 'ラベルの削除に失敗しました', 'deleteLabelOnly failed.');
    }
}

/**
 * このラベルが付いたTODOをすべて削除したうえで、ラベルを削除する。
 *
 * @param {data} label
 * @returns {Promise<void>}
 */
async function deleteLabelTodosAndLabel(label) {
    if (!confirm(`ラベル「${label.name}」を、付いているTODOごとすべて削除しますか？この操作は元に戻せません。`)) {
        return;
    }
    try {
        const res = await apiFetch(`${TODO_API}?tag_id=${label.id}`);
        const todos = await res.json();
        await Promise.all(todos.map(t => apiFetch(`${TODO_API}/${t.id}`, { method: HTTP_METHOD_DELETE })));
        clearTimeout(labelSaveTimers[label.id]);
        delete labelSaveTimers[label.id];
        await apiFetch(`${TODO_LABELS_API}/${label.id}`, { method: HTTP_METHOD_DELETE });
        showToast('TODOとラベルを削除しました');
        if (activeLabelMgmtId === label.id) {
            activeLabelMgmtId = null;
        }
        await renderLabelSection();
    } catch (error) {
        errorHandle(error, '削除に失敗しました', 'deleteLabelTodosAndLabel failed.');
    }
}

async function renderLabelSection() {
    try {
        const res = await apiFetch(TODO_LABELS_API);
        allTodoLabels = await res.json();
    } catch (error) {
        errorHandle(error, 'ラベルの取得に失敗しました', 'renderLabelSection failed.');
    }

    if (activeLabelMgmtId === null) {
        const stored = loadActiveLabelMgmtId();
        if (stored !== null && allTodoLabels.find(t => t.id === stored)) {
            activeLabelMgmtId = stored;
        }
    }
    if (activeLabelMgmtId === null || !allTodoLabels.find(t => t.id === activeLabelMgmtId)) {
        activeLabelMgmtId = allTodoLabels.length > 0 ? allTodoLabels[0].id : null;
    }
    saveActiveLabelMgmtId(activeLabelMgmtId);

    renderTagNav();

    if (activeLabelMgmtId !== null) {
        const label = allTodoLabels.find(t => t.id === activeLabelMgmtId);
        if (label) {
            renderLabelManagementDetail(label);
        }
    } else {
        const container = $ge('label-mgmt-detail');
        container.innerHTML = '';
        const empty = document.createElement('p');
        empty.className = 'label-mgmt-empty';
        empty.textContent = 'ラベルがありません。';
        container.appendChild(empty);
    }
}

/**
 * ラベル管理画面左サイドバーのラベル一覧を描画する。
 * クローズ済みラベルは半透明表示にし、ラベル名に取り消し線を付ける。
 */
function renderLabelSectionNav() {
    const ul = $ge('tagList');
    ul.innerHTML = '';
    allTodoLabels.forEach(label => {
        const li = document.createElement('li');
        li.className = `tag-item ${activeLabelMgmtId === label.id ? 'active' : ''}`;
        if (label.closed) {
            li.style.opacity = '0.5';
        }
        const dot = document.createElement('span');
        dot.className = 'tag-color-btn';
        dot.style.background = label.color;
        const name = document.createElement('span');
        name.className = 'tag-item-name';
        if (label.closed) {
            name.style.textDecoration = 'line-through';
        }
        name.title = label.name;
        name.textContent = truncTag(label.name);
        li.appendChild(dot);
        li.appendChild(name);
        li.addEventListener('click', () => {
            activeLabelMgmtId = label.id;
            saveActiveLabelMgmtId(activeLabelMgmtId);
            renderTagNav();
            renderLabelManagementDetail(label);
        });
        ul.appendChild(li);
    });
}

/**
 * ラベル管理画面の表示。
 * ラベル名・色に加え、作成日とクローズ日（クローズ済みの場合のみ）を表示する。
 *
 * @param {data} label
 */
function renderLabelManagementDetail(label) {
    const container = $ge('label-mgmt-detail');
    container.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'label-mgmt-group';

    const nameRow = document.createElement('div');
    nameRow.className = 'label-mgmt-row';

    const colorBtn = document.createElement('span');
    colorBtn.className = 'tag-color-btn';
    colorBtn.style.background = label.color;
    colorBtn.title = '色を変更';
    colorBtn.addEventListener('click', e => {
        e.stopPropagation();
        openSwatchPopup(colorBtn, 5, TAG_PRESET_COLORS, label.color, color => {
            label.color = color;
            colorBtn.style.background = color;
            scheduleLabelSave(label);
        });
    });

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'label-mgmt-name';
    nameInput.value = label.name;
    nameInput.addEventListener('input', () => {
        label.name = nameInput.value;
        scheduleLabelSave(label);
    });

    nameRow.appendChild(colorBtn);
    nameRow.appendChild(nameInput);

    card.appendChild(nameRow);
    card.appendChild(buildLabelDetailTabSection(label));
    container.appendChild(card);
}

/**
 * ラベルの作成日・クローズ日と、クローズ／削除ボタンを表示する行を構築する。
 * 日付は左寄せ、クローズ・削除ボタンは同じ行の右寄せで表示する。
 * クローズ済みの場合のみクローズ日も表示する。
 *
 * @param {data} label
 * @returns {HTMLElement}
 */
function buildLabelDatesRow(label) {
    const datesRow = document.createElement('div');
    datesRow.className = 'label-mgmt-dates';

    const dateText = document.createElement('span');
    const createdText = label.created_at ? fmtDate(label.created_at) : '不明';
    dateText.textContent = (label.closed && label.closed_at)
        ? `作成日：${createdText}　　クローズ日：${fmtDate(label.closed_at)}`
        : `作成日：${createdText}`;

    const closeBtn = buildLabelCloseButton(label);
    const deleteBtn = buildLabelDeleteButton(label);
    alignActionButtonWidths(closeBtn, deleteBtn);

    const actions = document.createElement('div');
    actions.className = 'label-mgmt-name-actions';
    actions.appendChild(closeBtn);
    actions.appendChild(deleteBtn);

    datesRow.appendChild(dateText);
    datesRow.appendChild(actions);
    return datesRow;
}

/**
 * ラベル詳細の「概要」「タイムライン」切り替えタブと、その表示内容を構築する。
 * 「概要」タブには作成日欄・メモ欄・リンク欄を、「タイムライン」タブにはタイムライン欄を表示する。
 *
 * @param {data} label
 * @returns {HTMLElement}
 */
function buildLabelDetailTabSection(label) {
    const section = document.createElement('div');
    section.className = 'label-mgmt-tab-section';

    const tabBar = document.createElement('div');
    tabBar.className = 'label-mgmt-tabbar';

    [
        { key: 'overview', label: '概要' },
        { key: 'timeline', label: 'タイムライン' },
    ].forEach(tab => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `label-mgmt-tab${labelDetailTab === tab.key ? ' active' : ''}`;
        btn.textContent = tab.label;
        btn.addEventListener('click', () => {
            if (labelDetailTab === tab.key) {
                return;
            }
            labelDetailTab = tab.key;
            renderLabelManagementDetail(label);
        });
        tabBar.appendChild(btn);
    });
    section.appendChild(tabBar);

    const content = document.createElement('div');
    content.className = 'label-mgmt-tab-content';
    section.appendChild(content);

    if (labelDetailTab === 'overview') {
        content.appendChild(buildLabelDatesRow(label));
        content.appendChild(buildLabelMemoField(label));
        content.appendChild(buildLabelLinksSection(label));
    } else {
        content.appendChild(buildLabelTimelineSection(label));
    }

    return section;
}

/**
 * ラベルのメモ（概要）欄を構築する。
 * 見出しをクリックすると欄全体を折りたたむ／展開できる。
 * 普段は表示のみで、クリックしてカーソルを合わせると編集モードになる。
 * フォーカスを外す（確定する）と保留中の変更を即時保存し、表示のみの状態に戻る。
 *
 * @param {data} label
 * @returns {HTMLElement}
 */
function buildLabelMemoField(label) {
    const field = document.createElement('div');
    field.className = 'label-mgmt-memo-field';

    const collapsed = labelSectionCollapsed.memo;
    const header = document.createElement('div');
    header.className = 'label-mgmt-section-header label-mgmt-section-header-toggle';
    header.innerHTML = `<span>概要</span><span class="group-arrow">${collapsed ? '▶' : '▼'}</span>`;
    header.addEventListener('click', () => {
        labelSectionCollapsed.memo = !labelSectionCollapsed.memo;
        renderLabelManagementDetail(label);
    });
    field.appendChild(header);

    if (collapsed) {
        return field;
    }

    if (labelMemoEditingId === label.id) {
        const textarea = document.createElement('textarea');
        textarea.className = 'label-mgmt-memo-textarea';
        textarea.value = label.memo ?? '';
        textarea.addEventListener('input', () => {
            label.memo = textarea.value;
            scheduleLabelSave(label);
        });
        textarea.addEventListener('blur', async () => {
            await flushLabelSave(label);
            labelMemoEditingId = null;
            renderLabelManagementDetail(label);
        });
        field.appendChild(textarea);
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }, 0);
    } else {
        const view = document.createElement('div');
        view.className = `label-mgmt-memo-view${label.memo ? '' : ' label-mgmt-memo-empty'}`;
        view.textContent = label.memo || 'メモがありません';
        view.tabIndex = 0;
        view.addEventListener('click', () => {
            labelMemoEditingId = label.id;
            renderLabelManagementDetail(label);
        });
        field.appendChild(view);
    }

    return field;
}

/**
 * ラベル詳細の「リンク」欄を構築する。
 * 見出しをクリックすると欄全体を折りたたむ／展開できる。
 * ラベルに紐づくリンクの一覧を取得し、追加ボタンとともに表示する。
 *
 * @param {data} label
 * @returns {HTMLElement}
 */
function buildLabelLinksSection(label) {
    const section = document.createElement('div');
    section.className = 'label-mgmt-links-section';

    const collapsed = labelSectionCollapsed.links;
    const header = document.createElement('div');
    header.className = 'label-mgmt-section-header label-mgmt-section-header-toggle';
    header.innerHTML = `<span>リンク</span><span class="group-arrow">${collapsed ? '▶' : '▼'}</span>`;
    header.addEventListener('click', () => {
        labelSectionCollapsed.links = !labelSectionCollapsed.links;
        renderLabelManagementDetail(label);
    });
    section.appendChild(header);

    if (collapsed) {
        return section;
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-add label-mgmt-link-add-btn';
    addBtn.textContent = '＋ リンク追加';
    addBtn.addEventListener('click', () => addLabelLink(label));
    section.appendChild(addBtn);

    const list = document.createElement('div');
    list.className = 'label-mgmt-link-list';
    section.appendChild(list);

    renderLabelLinksList(label, list);

    return section;
}

/**
 * リンク一覧を取得してリストに描画する。
 *
 * @param {data} label
 * @param {HTMLElement} list 表示先のコンテナ要素
 * @returns {Promise<void>}
 */
async function renderLabelLinksList(label, list) {
    try {
        const res = await apiFetch(`${TODO_LABELS_API}/${label.id}/links`);
        const links = await res.json();
        if (links.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'label-mgmt-empty';
            empty.textContent = 'リンクがありません。';
            list.appendChild(empty);
            return;
        }
        links.forEach(link => list.appendChild(buildLabelLinkRow(label, link)));
    } catch (error) {
        errorHandle(error, 'リンクの取得に失敗しました', 'renderLabelLinksList failed.');
    }
}

/**
 * ラベル詳細の「タイムライン」欄を構築する。
 * 見出しをクリックすると欄全体を折りたたむ／展開できる。
 * このラベルが付いたTODOのメモを新しい順に並べて表示する。
 *
 * @param {data} label
 * @returns {HTMLElement}
 */
function buildLabelTimelineSection(label) {
    const section = document.createElement('div');
    section.className = 'label-mgmt-timeline-section';

    const collapsed = labelSectionCollapsed.timeline;
    const header = document.createElement('div');
    header.className = 'label-mgmt-section-header label-mgmt-section-header-toggle';
    header.innerHTML = `<span>タイムライン</span><span class="group-arrow">${collapsed ? '▶' : '▼'}</span>`;
    header.addEventListener('click', () => {
        labelSectionCollapsed.timeline = !labelSectionCollapsed.timeline;
        renderLabelManagementDetail(label);
    });
    section.appendChild(header);

    if (collapsed) {
        return section;
    }

    const list = document.createElement('div');
    list.className = 'label-mgmt-timeline-list';
    section.appendChild(list);

    renderLabelTimelineList(label, list);

    return section;
}

/**
 * ラベルのタイムライン（TODOメモの新しい順一覧）を取得してリストに描画する。
 *
 * @param {data} label
 * @param {HTMLElement} list 表示先のコンテナ要素
 * @returns {Promise<void>}
 */
async function renderLabelTimelineList(label, list) {
    try {
        const res = await apiFetch(`${TODO_LABELS_API}/${label.id}/timeline`);
        const entries = await res.json();
        if (entries.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'label-mgmt-empty';
            empty.textContent = 'タイムラインがありません。';
            list.appendChild(empty);
            return;
        }
        entries.forEach(entry => list.appendChild(buildLabelTimelineRow(entry)));
    } catch (error) {
        errorHandle(error, 'タイムラインの取得に失敗しました', 'renderLabelTimelineList failed.');
    }
}

/**
 * タイムライン一覧の1行分の要素を構築する。
 * クリックするとTODO画面へ移動して該当TODOを選択状態にする。
 *
 * @param {data} entry タイムライン項目（todo_id、todo_title、content、created_atを持つ）
 * @returns {HTMLElement}
 */
function buildLabelTimelineRow(entry) {
    const row = document.createElement('div');
    row.className = 'label-mgmt-timeline-row';

    const head = document.createElement('div');
    head.className = 'label-mgmt-timeline-head';

    const title = document.createElement('span');
    title.className = 'label-mgmt-timeline-title';
    title.textContent = entry.todo_title || '（無題）';
    head.appendChild(title);

    const date = document.createElement('span');
    date.className = 'label-mgmt-timeline-date';
    date.textContent = entry.created_at
        ? fmtDate(entry.created_at) + ' ' + entry.created_at.slice(11, 16)
        : '';
    head.appendChild(date);

    row.appendChild(head);

    const body = document.createElement('div');
    body.className = 'label-mgmt-timeline-body';
    body.textContent = entry.content;
    row.appendChild(body);

    row.addEventListener('click', async () => {
        await switchSection('todo');
        selectTodo(entry.todo_id);
    });

    return row;
}

/**
 * リンク一覧の1行分の要素を構築する。
 * 編集中の場合はタイトル・URLの入力欄を、それ以外は表示用の行を返す。
 *
 * @param {data} label
 * @param {data} link
 * @returns {HTMLElement}
 */
function buildLabelLinkRow(label, link) {
    const row = document.createElement('div');
    row.className = 'label-mgmt-link-row';

    if (editingLabelLinkId === link.id) {
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'label-mgmt-link-input';
        titleInput.placeholder = 'タイトル';
        titleInput.value = link.title;

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.className = 'label-mgmt-link-input';
        urlInput.placeholder = 'URL';
        urlInput.value = link.url;

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn-icon';
        saveBtn.title = '保存';
        saveBtn.textContent = '✓';
        saveBtn.addEventListener('click', () => {
            saveLabelLink(label, link.id, titleInput.value, urlInput.value);
        });

        row.appendChild(titleInput);
        row.appendChild(urlInput);
        row.appendChild(saveBtn);
        return row;
    }

    const title = document.createElement('span');
    title.className = 'label-mgmt-link-title';
    title.textContent = link.title || link.url || '(無題)';

    const actions = document.createElement('div');
    actions.className = 'label-mgmt-link-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-icon';
    editBtn.title = '編集';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', () => {
        editingLabelLinkId = link.id;
        renderLabelManagementDetail(label);
    });

    const openBtn = document.createElement('a');
    openBtn.className = 'btn-icon';
    openBtn.title = '開く';
    openBtn.textContent = '🔗';
    openBtn.href = link.url || '#';
    openBtn.target = '_blank';
    openBtn.rel = 'noopener noreferrer';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-icon';
    delBtn.title = '削除';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => deleteLabelLink(label, link.id));

    actions.appendChild(editBtn);
    actions.appendChild(openBtn);
    actions.appendChild(delBtn);
    row.appendChild(title);
    row.appendChild(actions);
    return row;
}

/**
 * ラベルに新しいリンクを追加し、作成直後から編集状態にする。
 *
 * @param {data} label
 * @returns {Promise<void>}
 */
async function addLabelLink(label) {
    try {
        const res = await apiFetch(`${TODO_LABELS_API}/${label.id}/links`, {
            method: HTTP_METHOD_POST,
            headers: JSON_HEADER,
            body: JSON.stringify({ title: '新しいリンク', url: '' }),
        });
        const newLink = await res.json();
        editingLabelLinkId = newLink.id;
        renderLabelManagementDetail(label);
    } catch (error) {
        errorHandle(error, 'リンクの追加に失敗しました', 'addLabelLink failed.');
    }
}

/**
 * リンクのタイトル・URLを保存し、編集状態を終了する。
 *
 * @param {data} label
 * @param {number} linkId
 * @param {string} title
 * @param {string} url
 * @returns {Promise<void>}
 */
async function saveLabelLink(label, linkId, title, url) {
    try {
        await apiFetch(`${TODO_LABELS_API}/${label.id}/links/${linkId}`, {
            method: HTTP_METHOD_PUT,
            headers: JSON_HEADER,
            body: JSON.stringify({ title, url }),
        });
        editingLabelLinkId = null;
        renderLabelManagementDetail(label);
    } catch (error) {
        errorHandle(error, 'リンクの保存に失敗しました', 'saveLabelLink failed.');
    }
}

/**
 * リンクを削除する。
 *
 * @param {data} label
 * @param {number} linkId
 * @returns {Promise<void>}
 */
async function deleteLabelLink(label, linkId) {
    if (!confirm('このリンクを削除しますか？')) {
        return;
    }
    try {
        await apiFetch(`${TODO_LABELS_API}/${label.id}/links/${linkId}`, { method: HTTP_METHOD_DELETE });
        renderLabelManagementDetail(label);
    } catch (error) {
        errorHandle(error, 'リンクの削除に失敗しました', 'deleteLabelLink failed.');
    }
}

/**
 * ラベルの現在の内容（名前・色・クローズ状態・メモ）を即時保存する。
 *
 * @param {data} label
 * @returns {Promise<void>}
 */
async function saveLabelNow(label) {
    await apiFetch(`${TODO_LABELS_API}/${label.id}`, {
        method: HTTP_METHOD_PUT,
        headers: JSON_HEADER,
        body: JSON.stringify({ name: label.name, color: label.color, closed: label.closed, memo: label.memo ?? '' }),
    });
}

/**
 * ラベル画面の保存タイマー
 * @param {data} label
 */
function scheduleLabelSave(label) {
    if (labelSaveTimers[label.id]) {
        clearTimeout(labelSaveTimers[label.id]);
    }
    labelSaveTimers[label.id] = setTimeout(async () => {
        delete labelSaveTimers[label.id];
        await saveLabelNow(label);
        renderTagNav();
    }, AUTO_SAVE_DEBOUNCE);
}

/**
 * 保留中のラベル保存タイマーがあれば即時実行して確定させる。
 * メモ編集を終了する際など、デバウンスを待たずに確実に保存したい場合に使う。
 *
 * @param {data} label
 * @returns {Promise<void>}
 */
async function flushLabelSave(label) {
    if (!labelSaveTimers[label.id]) {
        return;
    }
    clearTimeout(labelSaveTimers[label.id]);
    delete labelSaveTimers[label.id];
    await saveLabelNow(label);
    renderTagNav();
}

// URLハッシュが外部から変更された場合（アドレスバー編集・共有リンクの再読込など）も追従する
window.addEventListener('hashchange', () => {
    openFromLocationHash();
});

// 初期ロード（URLハッシュでセクション決定）
registerServiceWorker();
openFromLocationHash();
