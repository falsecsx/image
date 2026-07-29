const KEY_SESSION = 'agent_session_v1';
const KEY_IMAGES = 'agent_image_v1';
const KEY_V1_BACKUP = 'agent_session_v1.v1-backup';
const CURRENT_VERSION = 2;
const IMAGE_DB_NAME = 'AgentImageStore';
const IMAGE_DB_VERSION = 1;
const IMAGE_STORE = 'images';

let memoryList = null;
let imageMemory = null;
let imageDbPromise = null;
let lastStorageError = null;

function notifyStorageError(error, key) {
  lastStorageError = error;
  console.error('storage write fail', key, error);
  try {
    const message = error?.name === 'QuotaExceededError'
      ? '本地存储空间不足，Agent 数据未能完整保存'
      : `Agent 存储失败：${error?.message || error}`;
    if (typeof window !== 'undefined' && window.AgentBridge?.flashStatus) {
      window.AgentBridge.flashStatus(message, 'danger');
    }
  } catch (_) {}
}

export function getLastAgentStorageError() {
  return lastStorageError;
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    notifyStorageError(e, key);
    return false;
  }
}

function uuid() {
  return 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function newAgentList() {
  const id = 'default';
  return {
    version: CURRENT_VERSION,
    activeAgentId: id,
    agents: {
      [id]: {
        id,
        title: '新会话',
        contextScope: 'minimal',
        contextTurns: 12,
        webSearchEnabled: true,
        messages: [],
        proposals: {},
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    }
  };
}

function migrateIfNeeded(raw) {
  if (!raw) return newAgentList();
  if (raw.version === CURRENT_VERSION) return raw;
  if (raw.version === 1) {
    try { localStorage.setItem(KEY_V1_BACKUP, JSON.stringify(raw)); } catch {}
    const id = 'migrated-default';
    return {
      version: CURRENT_VERSION,
      activeAgentId: id,
      agents: {
        [id]: {
          id,
          title: '默认会话',
          contextScope: raw.contextScope || 'minimal',
          contextTurns: 12,
          webSearchEnabled: !!raw.webSearchEnabled,
          messages: Array.isArray(raw.messages) ? raw.messages : [],
          proposals: raw.proposals && typeof raw.proposals === 'object' ? raw.proposals : {},
          createdAt: raw.updatedAt || Date.now(),
          updatedAt: raw.updatedAt || Date.now()
        }
      }
    };
  }
  return newAgentList();
}

function cloneList(list) {
  return JSON.parse(JSON.stringify(list));
}

export function loadAgentList() {
  if (memoryList) return cloneList(memoryList);
  const raw = readJSON(KEY_SESSION, null);
  const list = migrateIfNeeded(raw);
  memoryList = list;
  if (!raw || raw.version !== CURRENT_VERSION) writeJSON(KEY_SESSION, list);
  return cloneList(list);
}

function saveList(list) {
  if (list.activeAgentId && list.agents[list.activeAgentId]) {
    list.agents[list.activeAgentId].updatedAt = Date.now();
  }
  memoryList = list;
  writeJSON(KEY_SESSION, list);
}

export function getActiveAgentId() {
  const list = loadAgentList();
  if (!list.agents[list.activeAgentId]) {
    list.activeAgentId = Object.keys(list.agents)[0] || null;
    saveList(list);
  }
  return list.activeAgentId;
}

export function setActiveAgentId(id) {
  const list = loadAgentList();
  if (list.agents[id]) {
    list.activeAgentId = id;
    saveList(list);
  }
}

export function loadActiveSession() {
  const id = getActiveAgentId();
  if (!id) return null;
  return loadAgentList().agents[id] || null;
}

export function saveActiveSession(patch) {
  const list = loadAgentList();
  const id = list.activeAgentId;
  if (!id || !list.agents[id]) return;
  list.agents[id] = { ...list.agents[id], ...patch, updatedAt: Date.now() };
  saveList(list);
}

export function createAgent(title) {
  const list = loadAgentList();
  const id = uuid();
  const parent = list.agents[list.activeAgentId] || {};
  const parentTurns = Number(parent.contextTurns);
  list.agents[id] = {
    id,
    title: title || '新会话',
    contextScope: parent.contextScope || 'minimal',
    contextTurns: Number.isFinite(parentTurns) ? Math.max(0, Math.floor(parentTurns)) : 12,
    webSearchEnabled: true,
    messages: [],
    proposals: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  list.activeAgentId = id;
  saveList(list);
  return id;
}

export function renameAgent(id, title) {
  const list = loadAgentList();
  if (list.agents[id]) {
    list.agents[id].title = String(title || '新会话').slice(0, 60);
    saveList(list);
  }
}

function collectImageIdsFromAgent(agent) {
  const ids = new Set();
  if (!agent) return ids;
  for (const message of agent.messages || []) {
    for (const imgId of message.attachedImageIds || []) {
      if (imgId) ids.add(imgId);
    }
  }
  for (const proposal of Object.values(agent.proposals || {})) {
    for (const imgId of proposal?.raw?.referenced_image_ids || []) {
      if (imgId) ids.add(imgId);
    }
    for (const imgId of proposal?.userOverrides?.referenced_image_ids || []) {
      if (imgId) ids.add(imgId);
    }
  }
  return ids;
}

export function deleteAgent(id) {
  const list = loadAgentList();
  if (!list.agents[id]) return;
  const removed = list.agents[id];
  const ids = Object.keys(list.agents);
  const idx = ids.indexOf(id);
  const fallbackActiveId = ids[idx + 1] || ids[idx - 1] || null;
  delete list.agents[id];
  if (Object.keys(list.agents).length === 0) {
    const nid = 'default';
    list.agents[nid] = {
      id: nid,
      title: '新会话',
      contextScope: 'minimal',
      contextTurns: 12,
      webSearchEnabled: true,
      messages: [],
      proposals: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    list.activeAgentId = nid;
  } else if (list.activeAgentId === id) {
    list.activeAgentId = fallbackActiveId && list.agents[fallbackActiveId]
      ? fallbackActiveId
      : Object.keys(list.agents)[0];
  }
  saveList(list);

  // Best-effort cleanup of images only referenced by the deleted agent.
  const remainingIds = new Set();
  Object.values(list.agents).forEach(agent => {
    collectImageIdsFromAgent(agent).forEach(imgId => remainingIds.add(imgId));
  });
  collectImageIdsFromAgent(removed).forEach(imgId => {
    if (!remainingIds.has(imgId)) deleteAgentImage(imgId);
  });
}

function truncateForTitle(text) {
  const stripped = String(text || '').replace(/\[([^\]]+)]\([^)]+\)/g, '$1').trim();
  const hasCJK = /[\u4e00-\u9fa5]/.test(stripped);
  const max = hasCJK ? 12 : 32;
  if (stripped.length <= max) return stripped;
  return stripped.slice(0, max);
}

export function autoTitleAgent(id) {
  const list = loadAgentList();
  const a = list.agents[id];
  if (!a) return;
  if (a.title !== '新会话') return;
  const first = a.messages.find(m => m.role === 'user' && (m.text || '').trim());
  if (!first) return;
  a.title = truncateForTitle(first.text);
  saveList(list);
}

// === Back-compat shims ===
export function loadAgentSession() {
  const sess = loadActiveSession();
  if (!sess) return null;
  const turns = Number(sess.contextTurns);
  return {
    version: 1,
    contextScope: sess.contextScope,
    contextTurns: Number.isFinite(turns) ? Math.max(0, Math.floor(turns)) : 12,
    webSearchEnabled: sess.webSearchEnabled !== false,
    messages: sess.messages,
    proposals: sess.proposals
  };
}

function mutateActive(fn) {
  const list = loadAgentList();
  const id = list.activeAgentId;
  if (!id || !list.agents[id]) return;
  fn(list.agents[id]);
  list.agents[id].updatedAt = Date.now();
  saveList(list);
}

export function putMessage(msg) {
  mutateActive(s => { s.messages.push(msg); });
}

export function updateMessage(id, patch) {
  mutateActive(s => {
    const idx = s.messages.findIndex(m => m.id === id);
    if (idx !== -1) s.messages[idx] = { ...s.messages[idx], ...patch };
  });
}

export function putProposal(p) {
  mutateActive(s => { s.proposals[p.id] = p; });
}

export function updateProposal(id, patch) {
  mutateActive(s => {
    if (s.proposals[id]) s.proposals[id] = { ...s.proposals[id], ...patch };
  });
}

export function clearAgentSession() {
  const list = loadAgentList();
  const id = list.activeAgentId;
  if (!id) return;
  if (Object.keys(list.agents).length > 1) {
    const removed = list.agents[id];
    delete list.agents[id];
    list.activeAgentId = Object.keys(list.agents)[0];
    saveList(list);
    const remainingIds = new Set();
    Object.values(list.agents).forEach(agent => {
      collectImageIdsFromAgent(agent).forEach(imgId => remainingIds.add(imgId));
    });
    collectImageIdsFromAgent(removed).forEach(imgId => {
      if (!remainingIds.has(imgId)) deleteAgentImage(imgId);
    });
  } else {
    list.agents[id] = {
      ...list.agents[id],
      messages: [],
      proposals: {},
      updatedAt: Date.now()
    };
    saveList(list);
  }
}

function openImageDb() {
  if (imageDbPromise) return imageDbPromise;
  if (typeof indexedDB === 'undefined') {
    imageDbPromise = Promise.reject(new Error('indexedDB is not available'));
    return imageDbPromise;
  }
  imageDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGE_DB_NAME, IMAGE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('open agent image db failed'));
  });
  return imageDbPromise;
}

function ensureImageMemory() {
  if (imageMemory) return imageMemory;
  imageMemory = readJSON(KEY_IMAGES, {}) || {};
  // Migrate legacy localStorage images into IndexedDB in background.
  const legacyIds = Object.keys(imageMemory);
  if (legacyIds.length) {
    openImageDb().then(db => {
      const tx = db.transaction(IMAGE_STORE, 'readwrite');
      const store = tx.objectStore(IMAGE_STORE);
      for (const [id, entry] of Object.entries(imageMemory)) {
        store.put({ id, base64: entry.base64, mime: entry.mime || 'image/png', updatedAt: Date.now() });
      }
      tx.oncomplete = () => {
        try { localStorage.removeItem(KEY_IMAGES); } catch {}
      };
    }).catch(() => {});
  }
  return imageMemory;
}

function persistImageToDb(imgId, base64, mime) {
  return openImageDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, 'readwrite');
    tx.objectStore(IMAGE_STORE).put({ id: imgId, base64, mime: mime || 'image/png', updatedAt: Date.now() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  })).catch(error => {
    // Fallback to localStorage if IDB unavailable.
    const all = ensureImageMemory();
    all[imgId] = { base64, mime: mime || 'image/png' };
    if (!writeJSON(KEY_IMAGES, all)) throw error;
    return false;
  });
}

export function storeAgentImage(imgId, base64, mime, _meta) {
  const all = ensureImageMemory();
  all[imgId] = { base64, mime: mime || 'image/png' };
  // Prefer IndexedDB; keep memory hot for sync reads.
  persistImageToDb(imgId, base64, mime).catch(error => notifyStorageError(error, IMAGE_STORE));
  // Avoid bloating localStorage once IDB path is available.
  try {
    if (typeof indexedDB !== 'undefined') localStorage.removeItem(KEY_IMAGES);
  } catch {}
  return true;
}

export function getAgentImage(imgId) {
  const all = ensureImageMemory();
  const e = all[imgId];
  if (!e) return null;
  return { dataUrl: `data:${e.mime || 'image/png'};base64,${e.base64}`, mime: e.mime || 'image/png' };
}

export function getAgentImageMeta(imgId) {
  return null;
}

export function deleteAgentImage(imgId) {
  const all = ensureImageMemory();
  delete all[imgId];
  try {
    if (localStorage.getItem(KEY_IMAGES)) writeJSON(KEY_IMAGES, all);
  } catch {}
  openImageDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, 'readwrite');
    tx.objectStore(IMAGE_STORE).delete(imgId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  })).catch(() => {});
}

// Hydrate image memory from IndexedDB when available.
// 复用同一个 Promise：getAgentImage 是同步的，调用方需要一个可 await 的句柄，
// 否则页面刷新后首次渲染会读到还没填充的内存缓存，缩略图全部丢失。
let hydratePromise = null;
export function hydrateAgentImages() {
  if (hydratePromise) return hydratePromise;
  hydratePromise = openImageDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, 'readonly');
    const req = tx.objectStore(IMAGE_STORE).getAll();
    req.onsuccess = () => {
      const map = ensureImageMemory();
      for (const row of req.result || []) {
        if (row?.id) map[row.id] = { base64: row.base64, mime: row.mime || 'image/png' };
      }
      resolve(Object.keys(map).length);
    };
    req.onerror = () => reject(req.error);
  })).catch(() => Object.keys(ensureImageMemory()).length);
  return hydratePromise;
}

// Kick off hydrate in browsers.
try { hydrateAgentImages(); } catch {}
