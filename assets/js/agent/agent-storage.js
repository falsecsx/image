const KEY_SESSION = 'agent_session_v1';
const KEY_IMAGES = 'agent_image_v1';
const KEY_V1_BACKUP = 'agent_session_v1.v1-backup';
const KEY_V2_BACKUP = 'agent_session_v1.v2-backup';
const CURRENT_VERSION = 3;
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

const PROPOSAL_STATES = new Set(['pending', 'generating', 'completed', 'failed', 'cancelled', 'interrupted']);

function compareAgentText(left, right) {
  return String(left ?? '').trim().localeCompare(String(right ?? '').trim(), 'zh-CN', {
    numeric: true,
    sensitivity: 'base'
  });
}

function compareAgentResume(left, right) {
  return (Number(right?.updatedAt) || 0) - (Number(left?.updatedAt) || 0)
    || compareAgentText(left?.title, right?.title)
    || compareAgentText(left?.id, right?.id);
}

function emptyDraft() {
  return { text: '', referenceImageIds: [], updatedAt: 0 };
}

function normalizeDraft(draft) {
  const value = draft && typeof draft === 'object' ? draft : {};
  return {
    text: typeof value.text === 'string' ? value.text : '',
    referenceImageIds: Array.isArray(value.referenceImageIds)
      ? [...new Set(value.referenceImageIds.filter(id => typeof id === 'string' && id))]
      : [],
    updatedAt: Number(value.updatedAt) || 0
  };
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const status = message.status === 'failed' || message.status === 'cancelled'
    ? message.status
    : message.status === 'generating' || message.status === 'pending'
      ? 'interrupted'
      : 'completed';
  return {
    ...message,
    status,
    sources: normalizeSources(message.sources)
  };
}

function normalizeSources(sources) {
  const seen = new Set();
  const normalized = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    let url;
    try { url = new URL(String(source?.url || '')); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || seen.has(url.href)) continue;
    seen.add(url.href);
    normalized.push({
      title: String(source?.title || url.hostname || url.href).trim().slice(0, 240),
      url: url.href
    });
  }
  return normalized;
}

function normalizeProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return null;
  let executionState = PROPOSAL_STATES.has(proposal.executionState)
    ? proposal.executionState
    : 'pending';
  if (executionState === 'generating') executionState = 'interrupted';
  return {
    ...proposal,
    executionState,
    progress: {
      completed: Math.max(0, Number(proposal.progress?.completed) || 0),
      total: Math.max(1, Number(proposal.progress?.total) || Number(proposal.raw?.parallel_count) || 1)
    }
  };
}

function normalizeAgent(agent, id, fallback = {}) {
  const value = agent && typeof agent === 'object' ? agent : {};
  const proposals = {};
  for (const [proposalId, proposal] of Object.entries(value.proposals || {})) {
    const normalized = normalizeProposal(proposal);
    if (normalized) proposals[proposalId] = normalized;
  }
  return {
    ...value,
    id: value.id || id,
    title: String(value.title || fallback.title || '新会话').slice(0, 60),
    contextScope: value.contextScope || fallback.contextScope || 'minimal',
    contextTurns: Number.isFinite(Number(value.contextTurns))
      ? Math.max(0, Math.floor(Number(value.contextTurns)))
      : 12,
    webSearchEnabled: value.webSearchEnabled !== false,
    draft: normalizeDraft(value.draft),
    messages: (Array.isArray(value.messages) ? value.messages : []).map(normalizeMessage).filter(Boolean),
    proposals,
    createdAt: Number(value.createdAt) || Number(fallback.createdAt) || Date.now(),
    updatedAt: Number(value.updatedAt) || Number(fallback.updatedAt) || Date.now()
  };
}

function createAgentRecord(id, title = '新会话', settings = {}) {
  return normalizeAgent({
    id,
    title,
    contextScope: settings.contextScope || 'minimal',
    contextTurns: settings.contextTurns,
    webSearchEnabled: settings.webSearchEnabled !== false,
    draft: emptyDraft(),
    messages: [],
    proposals: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  }, id);
}

function newAgentList() {
  const id = 'default';
  return {
    version: CURRENT_VERSION,
    activeAgentId: id,
    agents: {
      [id]: createAgentRecord(id)
    }
  };
}

function migrateIfNeeded(raw) {
  if (!raw) return newAgentList();
  if (raw.version === CURRENT_VERSION) {
    const agents = {};
    for (const [id, agent] of Object.entries(raw.agents || {})) agents[id] = normalizeAgent(agent, id);
    if (!Object.keys(agents).length) return newAgentList();
    return {
      version: CURRENT_VERSION,
      activeAgentId: agents[raw.activeAgentId] ? raw.activeAgentId : Object.keys(agents)[0],
      agents
    };
  }
  if (raw.version === 2) {
    try { localStorage.setItem(KEY_V2_BACKUP, JSON.stringify(raw)); } catch {}
    const agents = {};
    for (const [id, agent] of Object.entries(raw.agents || {})) agents[id] = normalizeAgent(agent, id);
    if (!Object.keys(agents).length) return newAgentList();
    return {
      version: CURRENT_VERSION,
      activeAgentId: agents[raw.activeAgentId] ? raw.activeAgentId : Object.keys(agents)[0],
      agents
    };
  }
  if (raw.version === 1) {
    try { localStorage.setItem(KEY_V1_BACKUP, JSON.stringify(raw)); } catch {}
    const id = 'migrated-default';
    return {
      version: CURRENT_VERSION,
      activeAgentId: id,
      agents: {
        [id]: normalizeAgent({
          id,
          title: '默认会话',
          contextScope: raw.contextScope || 'minimal',
          contextTurns: 12,
          webSearchEnabled: !!raw.webSearchEnabled,
          messages: Array.isArray(raw.messages) ? raw.messages : [],
          proposals: raw.proposals && typeof raw.proposals === 'object' ? raw.proposals : {},
          createdAt: raw.updatedAt || Date.now(),
          updatedAt: raw.updatedAt || Date.now()
        }, id)
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
  try { window.dispatchEvent(new CustomEvent('agent-session-updated')); } catch {}
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
  list.agents[id] = createAgentRecord(id, title || '新会话', {
    contextScope: parent.contextScope || 'minimal',
    contextTurns: Number.isFinite(parentTurns) ? Math.max(0, Math.floor(parentTurns)) : 12,
    webSearchEnabled: parent.webSearchEnabled !== false
  });
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

export function duplicateAgent(id) {
  const list = loadAgentList();
  const source = list.agents[id];
  if (!source) return null;
  const nextId = uuid();
  const copy = normalizeAgent(JSON.parse(JSON.stringify(source)), nextId);
  copy.id = nextId;
  copy.title = `${source.title || '新会话'} 副本`.slice(0, 60);
  copy.createdAt = Date.now();
  copy.updatedAt = copy.createdAt;
  copy.messages = copy.messages.map(message => ({ ...message, id: message.id ? `${message.id}-copy-${nextId}` : message.id }));
  const proposalIdMap = new Map();
  const proposals = {};
  for (const [oldId, proposal] of Object.entries(copy.proposals)) {
    const proposalId = `${oldId}-copy-${nextId}`;
    proposalIdMap.set(oldId, proposalId);
    proposals[proposalId] = { ...proposal, id: proposalId };
  }
  copy.proposals = proposals;
  copy.messages = copy.messages.map(message => ({
    ...message,
    proposalId: message.proposalId ? proposalIdMap.get(message.proposalId) || message.proposalId : undefined
  }));
  list.agents[nextId] = copy;
  list.activeAgentId = nextId;
  saveList(list);
  return nextId;
}

export function saveAgentDraft(text, referenceImageIds = []) {
  mutateActive(session => {
    session.draft = normalizeDraft({
      text: String(text || ''),
      referenceImageIds,
      updatedAt: Date.now()
    });
  });
}

export function clearAgentDraft() {
  mutateActive(session => { session.draft = emptyDraft(); });
}

export function getAgentResumeSummary() {
  const list = loadAgentList();
  const candidates = Object.values(list.agents)
    .filter(agent => (agent.messages || []).length || agent.draft?.text?.trim() || agent.draft?.referenceImageIds?.length)
    .sort(compareAgentResume);
  const agent = candidates[0] || list.agents[list.activeAgentId] || null;
  const hasResume = !!(agent && (
    (agent.messages || []).length || agent.draft?.text?.trim() || agent.draft?.referenceImageIds?.length
  ));
  return {
    hasResume,
    agentId: agent?.id || list.activeAgentId || null,
    title: agent?.title || '新会话',
    draft: normalizeDraft(agent?.draft),
    updatedAt: Number(agent?.updatedAt) || 0
  };
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
    list.agents[nid] = createAgentRecord(nid);
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
    draft: normalizeDraft(sess.draft),
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
      draft: emptyDraft(),
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
        store.put({
          id,
          base64: entry.base64,
          mime: entry.mime || 'image/png',
          meta: normalizeImageMeta(entry.meta),
          updatedAt: Date.now()
        });
      }
      tx.oncomplete = () => {
        try { localStorage.removeItem(KEY_IMAGES); } catch {}
      };
    }).catch(() => {});
  }
  return imageMemory;
}

function normalizeImageMeta(meta, previous = {}) {
  const value = meta && typeof meta === 'object' ? meta : {};
  return {
    label: String(value.label ?? previous.label ?? '').slice(0, 240),
    source: String(value.source ?? previous.source ?? '').slice(0, 120),
    note: String(value.note ?? previous.note ?? '').slice(0, 2000),
    caption: String(value.caption ?? previous.caption ?? '').slice(0, 2000),
    createdAt: Number(value.createdAt) || Number(previous.createdAt) || Date.now()
  };
}

function persistImageToDb(imgId, base64, mime, meta) {
  return openImageDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IMAGE_STORE, 'readwrite');
    tx.objectStore(IMAGE_STORE).put({ id: imgId, base64, mime: mime || 'image/png', meta, updatedAt: Date.now() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  })).catch(error => {
    // Fallback to localStorage if IDB unavailable.
    const all = ensureImageMemory();
    all[imgId] = { base64, mime: mime || 'image/png', meta };
    if (!writeJSON(KEY_IMAGES, all)) throw error;
    return false;
  });
}

export function storeAgentImage(imgId, base64, mime, meta = {}) {
  const all = ensureImageMemory();
  const normalizedMeta = normalizeImageMeta(meta, all[imgId]?.meta);
  all[imgId] = { base64, mime: mime || 'image/png', meta: normalizedMeta };
  // Prefer IndexedDB; keep memory hot for sync reads.
  persistImageToDb(imgId, base64, mime, normalizedMeta).catch(error => notifyStorageError(error, IMAGE_STORE));
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
  const entry = ensureImageMemory()[imgId];
  return entry ? { ...normalizeImageMeta(entry.meta) } : null;
}

export function updateAgentImageMeta(imgId, patch = {}) {
  const all = ensureImageMemory();
  const entry = all[imgId];
  if (!entry) return false;
  const meta = normalizeImageMeta({ ...entry.meta, ...patch }, entry.meta);
  entry.meta = meta;
  persistImageToDb(imgId, entry.base64, entry.mime, meta).catch(error => notifyStorageError(error, IMAGE_STORE));
  try {
    if (localStorage.getItem(KEY_IMAGES)) writeJSON(KEY_IMAGES, all);
  } catch {}
  return true;
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
        if (row?.id) map[row.id] = {
          base64: row.base64,
          mime: row.mime || 'image/png',
          meta: normalizeImageMeta(row.meta, { createdAt: row.updatedAt })
        };
      }
      resolve(Object.keys(map).length);
    };
    req.onerror = () => reject(req.error);
  })).catch(() => Object.keys(ensureImageMemory()).length);
  return hydratePromise;
}

// Kick off hydrate in browsers.
try { hydrateAgentImages(); } catch {}
