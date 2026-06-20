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
    setTimeout(() => { el.classList.remove('toast-show'); setTimeout(() => el.remove(), TOAST_FADE_DURATION); }, TOAST_SHOW_DURATION);
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
    } catch {
        showToast('ネットワークエラーが発生しました');
        throw new Error('network');
    }
    if (!res.ok) {
        showToast(`エラーが発生しました（${res.status}）`);
        throw new Error(`HTTP ${res.status}`);
    }
    return res;
}

window.addEventListener('unhandledrejection', e => { e.preventDefault(); });
// ── API エンドポイント ──
const BASE = '/fuyuco';
const TODO_API = BASE + '/api/todos';
const NOTE_API = BASE + '/api/notes';
const TODO_TAGS_API = BASE + '/api/todo-tags';
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

const NOTE_COLORS = [
    '#ffffff', '#ffd0d0', '#ffe5c8', '#fff9c4', '#d4f5d4',
    '#ccf0ee', '#cce8ff', '#e8d5f5', '#ffd5e8', '#e8e8e8',
];
const TAG_PRESET_COLORS = [
    '#f47272', '#fb9a3a', '#fbd040', '#6ee7b0', '#5eead4',
    '#60a5fa', '#6366f1', '#a78bfa', '#f472b6', '#f87171',
    '#4ade80', '#22d3ee', '#a3e635', '#bb9165', '#8aaec8',
];

const titleMap = {
    todo: 'TODO - fuyuco',
    kanban: 'カンバン - fuyuco',
    note: 'メモ - fuyuco'
};
const iconMap = {
    todo: 'todo.png',
    kanban: 'kanban.png',
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

// ── TODO 状態 ──
let allTodos = [];
let allTodoTags = [];
let activeTodoTagId = null;
let selectedTodoId = null;
let isNewMode = false;
let sortAsc = true;
let autoSaveTimer = null;
let originalTask = null;
let showDone = false;
let todoSelectedColor = TAG_PRESET_COLORS[5];

// ── Note 状態 ──
let allNotes = [];
let allNoteTags = [];
let activeNoteTagId = null;
let noteSaveTimers = {};
let noteSelectedColor = TAG_PRESET_COLORS[5];

// ── セクション切替 ──────────────────────────
function switchSection(section) {
    activeSection = section;
    history.replaceState(null, '', '#' + section);
    document.getElementById('tab-todo').classList.toggle('active', section === 'todo');
    document.getElementById('tab-kanban').classList.toggle('active', section === 'kanban');
    document.getElementById('tab-note').classList.toggle('active', section === 'note');
    document.getElementById('todo-section').style.display = section === 'todo' ? '' : 'none';
    document.getElementById('kanban-section').style.display = section === 'kanban' ? '' : 'none';
    document.getElementById('note-section').style.display = section === 'note' ? '' : 'none';
    document.getElementById('newTagColorBtn').style.background =
        section === 'note' ? noteSelectedColor : todoSelectedColor;
    if (section === 'note') {
        closeSidebar();
        renderTagNav();
    }
    if (section === 'note') {
        fetchNoteTags().then(() => fetchNotes());
    } else {
        fetchTodoTags().then(() => fetchTodos());
    }
    if (section === 'kanban') closeSidebar();
    // ファビコンとタイトルの更新
    updatePageMeta(section);
}

// ── ファビコンとタイトルの更新 ──────────────────────────
function updatePageMeta(section) {
    document.title = titleMap[section] || 'fuyuco';
    const faviconEl = document.getElementById('favicon');
    if (faviconEl) faviconEl.href = iconMap[section] || 'todo.png';
}

// ── ポップアップ共通 ────────────────────────
function openSwatchPopup(anchorEl, cols, colors, currentColor, onSelect) {
    if (activePopup) { activePopup.remove(); activePopup = null; }
    const popup = document.createElement('div');
    popup.className = 'color-swatch-popup';
    popup.style.gridTemplateColumns = `repeat(${cols}, 22px)`;
    colors.forEach(color => {
        const sw = document.createElement('div');
        sw.className = `color-swatch ${color === currentColor ? 'selected' : ''}`;
        sw.style.background = color;
        sw.style.border = color === '#ffffff' ? '2px solid #ddd' : '2px solid transparent';
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
            popup.remove(); activePopup = null;
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
    if (activePopup) { activePopup.remove(); activePopup = null; }
    if (allNoteTags.length === 0) return;
    const popup = document.createElement('div');
    popup.className = 'tag-popup';
    allNoteTags.forEach(tag => {
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
                popup.remove(); activePopup = null;
                document.removeEventListener('click', h);
            }
        });
    }, 0);
}

// ── タグナビ共通 ────────────────────────────
function renderTagNav() {
    const tags = activeSection !== 'note' ? allTodoTags : allNoteTags;
    const activeId = activeSection !== 'note' ? activeTodoTagId : activeNoteTagId;
    const items = activeSection === 'note' ? allNotes
        : activeSection === 'kanban' ? allTodos.filter(t => !t.recurrence)
            : allTodos;
    const tagsApi = activeSection !== 'note' ? TODO_TAGS_API : NOTE_TAGS_API;
    const ul = document.getElementById('tagList');
    ul.innerHTML = '';

    const allItem = document.createElement('li');
    allItem.className = `tag-item ${activeId === null ? 'active' : ''}`;
    allItem.innerHTML = `<span class="tag-dot"></span><span class="tag-item-name">すべて</span>`;
    allItem.addEventListener('click', () => selectTag(null));
    ul.appendChild(allItem);

    if (activeSection === 'note') {
        const archItem = document.createElement('li');
        archItem.className = `tag-item ${activeId === 'archived' ? 'active' : ''}`;
        archItem.innerHTML = `<span class="tag-dot" style="background:#cce5fd"></span><span class="tag-item-name">アーカイブ済み</span>`;
        archItem.addEventListener('click', () => selectTag('archived'));
        ul.appendChild(archItem);
    }

    tags.forEach(tag => {
        const count = items.filter(item => !item.done).filter(item => item.tags.some(t => t.id === tag.id)).length;
        const li = document.createElement('li');
        li.className = `tag-item ${activeId === tag.id ? 'active' : ''}`;

        const dot = document.createElement('span');
        dot.className = 'tag-color-btn';
        dot.style.background = tag.color;
        dot.title = '色を変更';
        dot.addEventListener('click', e => {
            e.stopPropagation();
            openSwatchPopup(dot, 5, TAG_PRESET_COLORS, tag.color, async color => {
                await apiFetch(`${tagsApi}/${tag.id}/color`, {
                    method: HTTP_METHOD_PATCH, headers: JSON_HEADER,
                    body: JSON.stringify({ color }),
                });
                if (activeSection !== 'note') { await fetchTodoTags(); fetchTodos(); }
                else { await fetchNoteTags(); fetchNotes(); }
            });
        });

        li.appendChild(dot);
        li.insertAdjacentHTML('beforeend', `
          <span class="tag-item-name" title="${escHtml(tag.name)}">${escHtml(truncTag(tag.name))}</span>
          <span class="tag-count">${count}</span>
          <button class="tag-del" onclick="event.stopPropagation(); deleteTag(${tag.id})">✕</button>
        `);
        li.addEventListener('click', () => selectTag(tag.id));
        ul.appendChild(li);
    });
}

/**
 * 引数で指定されたタグを選択状態にする
 * 
 * @param {*} tagId 
 */
async function selectTag(tagId) {
    if (activeSection !== 'note') {
        activeTodoTagId = tagId;
        await fetchTodos();
    } else {
        activeNoteTagId = tagId;
        await fetchNotes();
    }
    renderTagNav();
}

/**
 * タグの追加
 * @returns 
 */
async function addTag() {
    const name = document.getElementById('tagInput').value.trim();
    if (!name) return;
    const tagsApi = activeSection !== 'note' ? TODO_TAGS_API : NOTE_TAGS_API;
    const color = activeSection !== 'note' ? todoSelectedColor : noteSelectedColor;
    await apiFetch(tagsApi, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
    });
    document.getElementById('tagInput').value = '';
    if (activeSection !== 'note') await fetchTodoTags();
    else await fetchNoteTags();
}

/**
 * タグの削除
 * 
 * @param {number} tagId 
 * @returns 
 */
async function deleteTag(tagId) {
    const tags = activeSection !== 'note' ? allTodoTags : allNoteTags;
    const tagsApi = activeSection !== 'note' ? TODO_TAGS_API : NOTE_TAGS_API;
    const tag = tags.find(t => t.id === tagId);
    if (!confirm(`タグ「${tag?.name}」を削除しますか？`)) return;
    await apiFetch(`${tagsApi}/${tagId}`, { method: 'DELETE' });
    if (activeSection !== 'note') {
        if (activeTodoTagId === tagId) activeTodoTagId = null;
        await Promise.all([fetchTodoTags(), fetchTodos()]);
    } else {
        if (activeNoteTagId === tagId) activeNoteTagId = null;
        await Promise.all([fetchNoteTags(), fetchNotes()]);
    }
}

// ── TODO タグ ───────────────────────────────
async function fetchTodoTags() {
    try {
        const res = await apiFetch(TODO_TAGS_API);
        allTodoTags = await res.json();
        renderTagNav();
    } catch { }
}

let sidebarTagIds = [];

function renderSidebarSelectedTags() {
    const container = document.getElementById('sb-selected-tags');
    container.innerHTML = '';
    allTodoTags.filter(t => sidebarTagIds.includes(t.id)).forEach(tag => {
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
    const anchorEl = document.getElementById('sb-tag-btn');
    if (activePopup) { activePopup.remove(); activePopup = null; }
    if (allTodoTags.length === 0) return;
    const popup = document.createElement('div');
    popup.className = 'tag-popup';
    allTodoTags.forEach(tag => {
        const label = document.createElement('label');
        label.className = 'tag-popup-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = tag.id;
        cb.checked = sidebarTagIds.includes(tag.id);
        cb.style.accentColor = tag.color;
        cb.addEventListener('change', () => {
            sidebarTagIds = allTodoTags.filter(t =>
                document.querySelector(`.tag-popup input[value="${t.id}"]`)?.checked
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
                popup.remove(); activePopup = null;
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
    const container = document.getElementById('sb-urls');
    if (container.children.length >= 5) return;
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
    del.addEventListener('click', e => { e.stopPropagation(); row.remove(); updateUrlAddBtn(); scheduleAutoSave(); });
    row.appendChild(input);
    row.appendChild(del);
    container.appendChild(row);
    updateUrlAddBtn();
}

function updateUrlAddBtn() {
    const count = document.getElementById('sb-urls').children.length;
    document.getElementById('sb-url-add-btn').style.display = count >= 5 ? 'none' : '';
}

function getSidebarUrls() {
    return [...document.querySelectorAll('#sb-urls .sb-url-row input')]
        .map(i => i.value.trim()).filter(Boolean);
}

// ── TODO CRUD ───────────────────────────────
async function fetchTodos() {
    try {
        const url = activeTodoTagId !== null ? `${TODO_API}?tag_id=${activeTodoTagId}` : TODO_API;
        const res = await apiFetch(url);
        allTodos = await res.json();
        render(allTodos);
        renderTagNav();
        if (selectedTodoId !== null) {
            const t = allTodos.find(t => t.id === selectedTodoId);
            if (t) updateSidebar(t, false); else closeSidebar();
        }
    } catch { }
}

/**
 * TODO用ソート順の切り替え
 */
function toggleSort() {
    sortAsc = !sortAsc;
    document.getElementById('sortBtn').textContent = sortAsc ? '期限 ▲ 昇順' : '期限 ▼ 降順';
    render(allTodos);
}

/**
 * TODO用ソート順の切り替え
 */
function sortedTodos(todos) {
    return [...todos].sort((a, b) => {
        const da = a.deadline ?? (sortAsc ? SORT_DUMMY_DATE : '');
        const db = b.deadline ?? (sortAsc ? SORT_DUMMY_DATE : '');
        return sortAsc ? da.localeCompare(db) : db.localeCompare(da);
    });
}

function deadlineDatePart(dl) { return dl ? dl.slice(0, 10) : null; }
function fmtDate(d) { return d ? d.slice(0, 10).replace(/-/g, '/') : ''; }

function groupByDeadline(todos) {
    const map = new Map();
    sortedTodos(todos.filter(t => !t.done)).forEach(t => {
        const key = deadlineDatePart(t.deadline) ?? '__none__';
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(t);
    });
    const done = todos.filter(t => t.done);
    if (done.length > 0) map.set('__done__', done);
    return map;
}

/**
 * TODOを期限と現在日付に応じてグルーピングする。
 * @param {String} key 
 * @returns 
 */
function groupLabel(key) {
    if (key === '__done__') return { text: '完了済み', cls: '' };
    if (key === '__none__') return { text: '期限なし', cls: '' };
    if (key < today) return { text: `${fmtDate(key)}（期限切れ）`, cls: 'overdue' };
    if (key === today) return { text: `${fmtDate(key)}（今日）`, cls: 'today' };
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
            const da = a.deadline ?? SORT_DUMMY_DATE, db = b.deadline ?? SORT_DUMMY_DATE;
            return da < db ? -1 : da > db ? 1 : 0;
        }
        if (order === KANBAN_SORT_KEY.DL_DESC) {
            const da = a.deadline ?? '', db = b.deadline ?? '';
            return da > db ? -1 : da < db ? 1 : 0;
        }
        return a.title.localeCompare(b.title, 'ja');
    };
}

/**
 * カンバンの画面反映
 * 
 */
function renderKanban() {
    ['todo', 'doing', 'done'].forEach(s => {
        const sel = document.getElementById(`k-sort-${s}`);
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
        (activeTodoTagId === null || t.tags.some(tg => tg.id === activeTodoTagId))
    );
    const cols = { todo: [], doing: [], done: [] };
    filtered.forEach(t => {
        const s = t.status || (t.done ? 'done' : 'todo');
        (cols[s] || cols.todo).push(t);
    });
    ['todo', 'doing', 'done'].forEach(s => {
        const order = document.getElementById(`k-sort-${s}`).value;
        cols[s].sort(kanbanSortFn(order));
    });

    ['todo', 'doing', 'done'].forEach(status => {
        const container = document.getElementById(`k-${status}`);
        document.getElementById(`k-count-${status}`).textContent = cols[status].length;
        container.innerHTML = '';
        cols[status].forEach(t => {
            const memo = t.memo ? (t.memo.length > MEMO_TRUNCATE_LEN ? t.memo.slice(0, MEMO_TRUNCATE_LEN) + '…' : t.memo) : '';
            const dl = fmtDate(t.deadline);
            const isOverdue = t.deadline && t.deadline < now && status !== 'done';
            const isToday = deadlineDatePart(t.deadline) === today && status !== 'done';
            const dlCls = isOverdue ? 'kanban-dl-overdue' : isToday ? 'kanban-dl-today' : 'kanban-dl-future';
            const tagPills = t.tags.map(tg =>
                `<span class="card-tag-pill" style="background:${escHtml(tg.color)};color:#fff" title="${escHtml(tg.name)}">${escHtml(truncTag(tg.name))}</span>`
            ).join('');
            const urlBtns = (t.urls || []).map(u =>
                `<a class="btn-url" href="${escHtml(u)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="${escHtml(u)}">🔗</a>`
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
            ${dl ? `<span class="kanban-card-deadline ${dlCls}">${escHtml(dl)}</span>` : ''}
            </div>
            ${memo ? `<div class="kanban-card-memo">${escHtml(memo)}</div>` : ''}
            ${tagPills ? `<div class="card-tags" style="margin-top:6px">${tagPills}</div>` : ''}
            <div class="kanban-card-footer">
            <div>${urlBtns}</div>
            <div class="kanban-move-btns">
                ${status !== 'todo' ? `<button class="btn-kmove" title="戻す" onclick="event.stopPropagation();setStatusById(${t.id},'${status === 'doing' ? 'todo' : 'doing'}')">◀</button>` : ''}
                ${status !== 'done' ? `<button class="btn-kmove" title="進める" onclick="event.stopPropagation();setStatusById(${t.id},'${status === 'todo' ? 'doing' : 'done'}')">▶</button>` : ''}
            </div>
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
    const list = document.getElementById('list');
    const empty = document.getElementById('todo-empty');
    list.innerHTML = '';
    if (todos.length === 0) { empty.style.display = ''; return; }
    empty.style.display = 'none';

    groupByDeadline(todos).forEach((items, key) => {
        const { text, cls } = groupLabel(key);
        const label = document.createElement('div');
        label.className = `group-label ${cls}`;
        if (key === '__done__') {
            label.classList.add('group-label-toggle');
            label.innerHTML = `<span>${text}（${items.length}件）</span><span class="done-arrow">${showDone ? '▼' : '▶'}</span>`;
            label.addEventListener('click', () => { showDone = !showDone; render(allTodos); });
            list.appendChild(label);
            if (!showDone) return;
        } else {
            label.textContent = text;
            list.appendChild(label);
        }

        items.forEach(t => {
            const isOverdue = t.deadline && t.deadline < now && !t.done;
            const isToday = deadlineDatePart(t.deadline) === today && !t.done;
            const status = t.status || (t.done ? 'done' : 'todo');
            const cardCls = ['todo-card',
                status === 'done' ? 'done' : '',
                status === 'doing' ? 'doing' : '',
                isOverdue ? 'overdue' : '',
                isToday ? 'today' : '',
                t.id === selectedTodoId ? 'selected' : '',
            ].filter(Boolean).join(' ');

            const tagPills = t.tags.map(tg =>
                `<span class="card-tag-pill" style="background:${escHtml(tg.color)};color:#fff" title="${escHtml(tg.name)}">${escHtml(truncTag(tg.name))}</span>`
            ).join('');

            const recLabelMap = { daily: '毎日', weekly: '毎週', monthly: '毎月' };
            function recLabel(r) {
                if (!r) return '';
                try { const p = JSON.parse(r); return recLabelMap[p.type] || p.type; } catch { return recLabelMap[r] || r; }
            }
            const card = document.createElement('div');
            card.className = cardCls;
            card.innerHTML = `
            <div class="check ${status === 'done' ? 'checked' : status === 'doing' ? 'doing' : ''}" onclick="event.stopPropagation(); toggleById(${t.id})"></div>
            <div class="card-info">
            <div class="card-title">${escHtml(t.title)}</div>
            ${t.memo ? `<div class="card-memo">${escHtml(t.memo)}</div>` : ''}
            ${tagPills ? `<div class="card-tags">${tagPills}</div>` : ''}
            </div>
            ${t.recurrence ? `<span class="card-recurrence">🔁</span>` : ''}
            ${(t.urls || []).map(u => `<a class="btn-url" href="${escHtml(u)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="${escHtml(u)}">🔗</a>`).join('')}
            <button class="btn-del" onclick="event.stopPropagation(); delById(${t.id})">✕</button>
            `;
            card.addEventListener('click', () => selectTodo(t.id));
            card.querySelector('.card-title').addEventListener('click', e => {
                if (t.id !== selectedTodoId) return;
                e.stopPropagation();
                startInlineEdit(e.currentTarget, t);
            });
            list.appendChild(card);
        });
    });
    if (activeSection === 'kanban') renderKanban();
}

// ── サイドバー ──────────────────────────────
function selectTodo(id) {
    selectedTodoId = id;
    isNewMode = false;
    const t = allTodos.find(t => t.id === id);
    updateSidebar(t, false);
    render(allTodos);
}
/**
 * 
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
        if (done) return;
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
                if (idx !== -1) allTodos[idx] = updated;
                if (selectedTodoId === t.id) updateSidebar(updated, false);
            } catch { }
        }
        render(allTodos);
    }
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { done = true; render(allTodos); }
    });
}

function parseRecurrence(rec) {
    if (!rec) return { type: '', days: [], dates: [], end: '' };
    try {
        const p = JSON.parse(rec);
        return { type: p.type || '', days: p.days || [], dates: p.dates || [], end: p.end || '' };
    } catch {
        return { type: rec, days: [], dates: [], end: '' };
    }
}

function getRecurrenceValue() {
    const type = document.getElementById('sb-recurrence').value;
    if (!type) return null;
    const days = [...document.querySelectorAll('.recurrence-day-btn.on')].map(b => +b.dataset.day);
    const dates = [...document.querySelectorAll('.recurrence-date-btn.on')].map(b => +b.dataset.date);
    return JSON.stringify({ type, days, dates });
}

function updateRecurrenceUI(type, days, dates, end) {
    const extra = document.getElementById('sb-recurrence-extra');
    extra.classList.toggle('active', !!type);
    document.getElementById('sb-weekdays-field').style.display = type === 'weekly' ? '' : 'none';
    document.getElementById('sb-monthdates-field').style.display = type === 'monthly' ? '' : 'none';
    document.querySelectorAll('.recurrence-day-btn').forEach(b =>
        b.classList.toggle('on', (days || []).includes(+b.dataset.day)));
    document.querySelectorAll('.recurrence-date-btn').forEach(b =>
        b.classList.toggle('on', (dates || []).includes(+b.dataset.date)));
}

function updateSidebar(t, isNew) {
    originalTask = isNew ? null : JSON.parse(JSON.stringify(t));
    document.getElementById('sb-title').value = t.title ?? '';
    const dlVal = t.deadline
        ? (t.deadline.includes('T') ? t.deadline : t.deadline + 'T00:00')
        : '';
    document.getElementById('sb-deadline-date').value = t.deadline ? t.deadline.slice(0, 10) : '';
    document.getElementById('sb-deadline-time').value = (t.deadline && t.deadline.includes('T')) ? t.deadline.slice(11, 13) + ':00' : '00:00';
    const rec = parseRecurrence(t.recurrence);
    document.getElementById('sb-recurrence').value = rec.type;
    updateRecurrenceUI(rec.type, rec.days, rec.dates, rec.end);
    const urlContainer = document.getElementById('sb-urls');
    urlContainer.innerHTML = '';
    (t.urls || []).forEach(u => addUrlInput(u));
    updateUrlAddBtn();
    document.getElementById('sb-memo').value = t.memo ?? '';
    document.getElementById('sb-status-field').style.display = '';
    document.getElementById('sb-del-btn').style.display = '';
    document.getElementById('sb-discard-btn').style.display = 'none';
    const currentStatus = t.status || (t.done ? 'done' : 'todo');
    document.querySelector(`input[name="sb-status"][value="${currentStatus}"]`).checked = true;
    sidebarTagIds = (t.tags ?? []).map(tg => tg.id);
    renderSidebarSelectedTags();
    document.getElementById('sidebar').classList.add('open');
}

function scheduleAutoSave() {
    if (selectedTodoId === null) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveSelected, AUTO_SAVE_DEBOUNCE);
}

function discardSidebar() {
    clearTimeout(autoSaveTimer);
    if (isNewMode) { closeSidebar(); return; }
    if (originalTask) updateSidebar(originalTask, false);
    closeSidebar();
}

/**
 * 
 */
async function openNewTodo() {
    // const title = document.getElementById('titleInput').value.trim() || DEFAULT_TITLE;
    const title = document.getElementById('titleInput').value.trim();
    // デフォルトで当日の00:00を設定するように修正。
    const today = nowJST().slice(0, 10);
    const deadline = `${today}T00:00`;
    const res = await apiFetch(TODO_API, {
        method: HTTP_METHOD_POST, headers: JSON_HEADER,
        body: JSON.stringify({ title, deadline }),
    });
    const created = await res.json();
    document.getElementById('titleInput').value = '';
    await fetchTodos();
    selectTodo(created.id);
    document.getElementById('sb-title').select();
}

/**
 * サイドバーのクローズ。
 * 
 */
function closeSidebar() {
    selectedTodoId = null;
    isNewMode = false;
    document.getElementById('sidebar').classList.remove('open');
    render(allTodos);
}

/**
 * 選択中のTODOの保存処理。
 * 
 * @returns 
 */
async function saveSelected() {
    const title = document.getElementById('sb-title').value.trim() || DEFAULT_TITLE;
    const dlDate = document.getElementById('sb-deadline-date').value;
    const dlTime = document.getElementById('sb-deadline-time').value || '00:00';
    const deadline = dlDate ? dlDate + 'T' + dlTime : null;
    const recurrence = getRecurrenceValue();
    const urls = getSidebarUrls();
    const memo = document.getElementById('sb-memo').value || null;
    const tag_ids = getSidebarCheckedTagIds();

    if (selectedTodoId === null) return;
    await apiFetch(`${TODO_API}/${selectedTodoId}`, {
        method: HTTP_METHOD_PUT, headers: JSON_HEADER,
        body: JSON.stringify({ title, deadline, urls, memo, tag_ids, recurrence }),
    });
    originalTask = {
        ...originalTask, title, deadline, urls, memo,
        tags: allTodoTags.filter(t => tag_ids.includes(t.id))
    };
    await fetchTodos();
}

/**
 * 選択中のTODOの完了／未完の切り替え
 * @returns 
 */
async function toggleSelected() {
    if (selectedTodoId === null) return;
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
    if (selectedTodoId === null) return;
    await setStatusById(selectedTodoId, status);
}

/**
 * TODOのステータス変更。
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
    fetchTodos();
}

/**
 * 選択したTODOの削除処理。
 * 
 * @returns 
 */
async function delSelected() {
    if (selectedTodoId === null) return;
    const t = allTodos.find(t => t.id === selectedTodoId);
    if (!confirm(DELETE_TODO_MSG(t?.title))) return;
    await delById(selectedTodoId);
    closeSidebar();
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
 * TODOの削除処理。
 * 
 * @param {number} id 
 * @returns 
 */
async function delById(id) {
    const t = allTodos.find(t => t.id === id);
    if (!confirm(DELETE_TODO_MSG(t?.title))) return;
    if (selectedTodoId === id) { selectedTodoId = null; document.getElementById('sidebar').classList.remove('open'); }
    await apiFetch(`${TODO_API}/${id}`, { method: 'DELETE' });
    fetchTodos();
}

// ── Note タグ ───────────────────────────────
async function fetchNoteTags() {
    try {
        const res = await apiFetch(NOTE_TAGS_API);
        allNoteTags = await res.json();
        renderTagNav();
    } catch { }
}

// ── Note CRUD ───────────────────────────────
async function fetchNotes() {
    try {
        let url;
        if (activeNoteTagId === 'archived') url = `${NOTE_API}?archived=true`;
        else if (activeNoteTagId !== null) url = `${NOTE_API}?tag_id=${activeNoteTagId}`;
        else url = NOTE_API;
        const res = await apiFetch(url);
        allNotes = await res.json();
        renderNotes();
        renderTagNav();
    } catch { }
}

/**
 * メモを割り当てる。
 * 
 * @returns 
 */
function renderNotes() {
    document.querySelector('#note-section .btn-new').style.display =
        activeNoteTagId === 'archived' ? 'none' : '';
    const grid = document.getElementById('notesGrid');
    const empty = document.getElementById('note-empty');
    grid.innerHTML = '';
    if (allNotes.length === 0) { empty.style.display = ''; return; }
    empty.style.display = 'none';
    allNotes.forEach(note => grid.appendChild(buildCard(note)));
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
    card.style.background = note.color;

    const titleEl = document.createElement('div');
    titleEl.className = 'note-title';
    titleEl.contentEditable = 'true';
    titleEl.dataset.placeholder = 'タイトル';
    titleEl.innerText = note.title;
    titleEl.addEventListener('input', () => scheduleNoteSave(note.id));

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
        if (e.target.tagName === 'A' && !bodyWasFocused)
            window.open(e.target.href, '_blank', 'noopener noreferrer');
        if (e.target.classList.contains('note-img') && !bodyWasFocused)
            openImageLightbox(e.target.src);
    });
    bodyEl.addEventListener('paste', e => {
        const items = e.clipboardData?.items;
        if (!items) return;
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
    });

    // ── 書式ツールバー ──
    const toolbar = document.createElement('div');
    toolbar.className = 'note-toolbar';
    bodyEl.addEventListener('focus', () => { toolbar.style.opacity = '1'; });
    //  bodyEl.addEventListener('blur', () => { toolbar.style.opacity = '0'; linkifyDom(bodyEl); });
    bodyEl.addEventListener('blur', () => {
        toolbar.style.opacity = '0';
        bodyEl.innerHTML = linkifyText(DOMPurify.sanitize(bodyEl.innerHTML));
    });

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
            const ind = document.createElement('span');
            ind.style.cssText = 'border-bottom:2.5px solid #ef4444;padding-bottom:1px';
            ind.textContent = 'A';
            btn.appendChild(ind);
            btn.addEventListener('click', () => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
                openSwatchPopup(btn, 5, TEXT_COLORS, null, color => {
                    ind.style.borderBottomColor = color;
                    if (savedRange) {
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
            if (def.style) btn.setAttribute('style', def.style);
            btn.textContent = def.label;
            btn.addEventListener('click', () => {
                document.execCommand(def.cmd, false, null);
                scheduleNoteSave(note.id);
            });
        }
        toolbar.appendChild(btn);
    });

    const tagsEl = document.createElement('div');
    tagsEl.className = 'note-tags';
    tagsEl.id = `tags-${note.id}`;
    renderNoteTags(tagsEl, note.tags);

    const footer = document.createElement('div');
    footer.className = 'note-footer';
    const left = document.createElement('div');
    left.className = 'note-footer-left';

    const colorBtn = document.createElement('button');
    colorBtn.className = 'note-btn';
    colorBtn.title = '色を変更';
    colorBtn.textContent = '🎨';
    colorBtn.addEventListener('click', e => {
        e.stopPropagation();
        openSwatchPopup(colorBtn, 5, NOTE_COLORS, note.color, async color => {
            note.color = color;
            card.style.background = color;
            scheduleNoteSave(note.id);
        });
    });

    const tagBtn = document.createElement('button');
    tagBtn.className = 'note-btn';
    tagBtn.title = 'タグを編集';
    tagBtn.textContent = '🏷';
    tagBtn.addEventListener('click', e => {
        e.stopPropagation();
        openTagPopup(tagBtn, note.id, new Set(note.tags.map(t => t.id)));
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'note-btn note-del-btn';
    delBtn.title = '削除';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(DELETE_NOTE_MSG)) return;
        clearTimeout(noteSaveTimers[note.id]);
        await apiFetch(`${NOTE_API}/${note.id}`, { method: HTTP_METHOD_DELETE });
        fetchNotes();
    });

    const archBtn = document.createElement('button');
    archBtn.className = 'note-btn';
    archBtn.title = activeNoteTagId === 'archived' ? 'アーカイブ解除' : 'アーカイブ';
    archBtn.textContent = activeNoteTagId === 'archived' ? '↩' : '📦';
    archBtn.addEventListener('click', async e => {
        e.stopPropagation();
        clearTimeout(noteSaveTimers[note.id]);
        await apiFetch(`${NOTE_API}/${note.id}/archive`, { method: HTTP_METHOD_PATCH });
        fetchNotes();
    });

    left.appendChild(colorBtn);
    left.appendChild(tagBtn);
    left.appendChild(archBtn);
    footer.appendChild(left);
    footer.appendChild(delBtn);

    card.appendChild(titleEl);
    card.appendChild(bodyEl);
    card.appendChild(tagsEl);
    card.appendChild(toolbar);
    card.appendChild(footer);

    card.addEventListener('focusout', e => {
        if (!card.contains(e.relatedTarget)) flushNoteSave(note.id);
    });

    // ── ドラッグ並び替え ──
    card.draggable = true;
    card.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', note.id);
        card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        document.querySelectorAll('.note-card.drag-over').forEach(c => c.classList.remove('drag-over'));
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
        if (fromId === toId) return;
        const grid = document.getElementById('notesGrid');
        const cards = [...grid.querySelectorAll('.note-card')];
        const fromEl = grid.querySelector(`.note-card[data-id="${fromId}"]`);
        const toEl = card;
        const fromIdx = cards.indexOf(fromEl);
        const toIdx = cards.indexOf(toEl);
        if (fromIdx < toIdx) toEl.after(fromEl);
        else toEl.before(fromEl);
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
    const card = document.querySelector(`.note-card[data-id="${noteId}"]`);
    if (!card) return null;
    const note = allNotes.find(n => n.id === noteId);
    const tagIds = activePopup
        ? [...activePopup.querySelectorAll('input[type=checkbox]:checked')].map(cb => +cb.value)
        : note?.tags.map(t => t.id) ?? [];
    return {
        title: card.querySelector('.note-title').innerText.trim(),
        body: card.querySelector('.note-body').innerHTML,
        color: card.style.background || note?.color || '#ffffff',
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
    if (!data) return;
    const res = await apiFetch(`${NOTE_API}/${noteId}`, {
        method: HTTP_METHOD_PUT, headers: JSON_HEADER,
        body: JSON.stringify(data),
    });
    const updated = await res.json();
    const note = allNotes.find(n => n.id === noteId);
    if (note) {
        note.tags = updated.tags;
        const tagsEl = document.getElementById(`tags-${noteId}`);
        if (tagsEl) renderNoteTags(tagsEl, updated.tags);
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
    document.getElementById('note-empty').style.display = 'none';
    const card = buildCard(note);
    document.getElementById('notesGrid').prepend(card);
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
        if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', h); }
    });
    document.body.appendChild(overlay);
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
    if (!body) return '';
    if (/<[a-z][\s\S]*?>/i.test(body)) return DOMPurify.sanitize(body);
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
document.getElementById('tagInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTag();
});

const newTagColorBtn = document.getElementById('newTagColorBtn');
newTagColorBtn.style.background = todoSelectedColor;
newTagColorBtn.addEventListener('click', () => {
    const current = activeSection !== 'note' ? todoSelectedColor : noteSelectedColor;
    openSwatchPopup(newTagColorBtn, 5, TAG_PRESET_COLORS, current, color => {
        if (activeSection !== 'note') todoSelectedColor = color;
        else noteSelectedColor = color;
        newTagColorBtn.style.background = color;
    });
});

/**
 * 画面のどこかをクリックしたときのイベント。
 * サイドバーを非表示にする。
 * 
 */
document.addEventListener('click', e => {
    if (activeSection === 'note') return;
    if (!selectedTodoId && !isNewMode) return;
    if (
        e.target.closest('.todo-card') ||
        e.target.closest('.kanban-card') ||
        e.target.closest('.sidebar') ||
        e.target.closest('.tag-nav') ||
        e.target.closest('.form-card') ||
        e.target.closest('.color-swatch-popup') ||
        e.target.closest('.tag-popup')
    ) return;
    closeSidebar();
});

/**
 * TODOのタイトル入力欄でのキーイベント処理。
 * 
 */
document.getElementById('titleInput').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const title = document.getElementById('titleInput').value.trim();
    if (!title) return;
    // デフォルトで当日の00:00を設定するように修正。
    const today = nowJST().slice(0, 10);
    const deadline = `${today}T00:00`;
    const res = await apiFetch(TODO_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, deadline}),
    });
    document.getElementById('titleInput').value = '';
    const created = await res.json();
    selectedTodoId = created.id;
    isNewMode = false;
    await fetchTodos();
    const t = allTodos.find(t => t.id === created.id);
    if (t) updateSidebar(t, false);
});

// 毎月日付グリッドを生成
(function () {
    const grid = document.getElementById('sb-date-grid');
    for (let d = 1; d <= 31; d++) {
        const btn = document.createElement('button');
        btn.className = 'recurrence-date-btn';
        btn.dataset.date = d;
        btn.type = 'button';
        btn.textContent = d;
        btn.addEventListener('click', () => { btn.classList.toggle('on'); scheduleAutoSave(); });
        grid.appendChild(btn);
    }
})();

document.querySelectorAll('.recurrence-day-btn').forEach(btn => {
    btn.addEventListener('click', () => { btn.classList.toggle('on'); scheduleAutoSave(); });
});

document.getElementById('sb-recurrence').addEventListener('change', () => {
    const type = document.getElementById('sb-recurrence').value;
    updateRecurrenceUI(type, [], [], null);
    scheduleAutoSave();
});

['sb-title', 'sb-memo', 'sb-deadline-date'].forEach(id => {
    document.getElementById(id).addEventListener('input', scheduleAutoSave);
});
document.getElementById('sb-deadline-time').addEventListener('change', scheduleAutoSave);
document.getElementById('sb-tag-btn').addEventListener('click', openSidebarTagPopup);
document.getElementById('sb-url-add-btn').addEventListener('click', () => addUrlInput());

// 日付変更検知（日付が変わったらTODOを再取得して繰り返しタスクを生成）
setInterval(() => {
    const newDate = nowJST().slice(0, 10);
    now = nowJST().slice(0, 16);
    if (newDate !== today) {
        today = newDate;
        if (activeSection !== 'note') fetchTodos();
    } else if (activeSection !== 'note') {
        render(allTodos);
    }
}, 60000);

// 初期ロード（URLハッシュでセクション決定）
switchSection(location.hash === '#note' ? 'note' : location.hash === '#kanban' ? 'kanban' : 'todo');