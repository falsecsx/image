import {
  CANVAS_PROJECTS_KEY,
  cloneCanvasProject,
  createCanvasConfigNode,
  createCanvasEdge,
  createCanvasGroupNode,
  createCanvasMediaNode,
  createCanvasNode,
  createCanvasNoteNode,
  createCanvasProject,
  createCanvasTextNode,
  normalizeCanvasProject
} from './canvas-model.js?v=20260803-4';

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
    return { ok: true };
  } catch (error) {
    console.error('canvas store write failed', key, error);
    return {
      ok: false,
      error,
      quotaExceeded: isQuotaExceededError(error)
    };
  }
}

function isQuotaExceededError(error) {
  if (!error) return false;
  const name = String(error.name || '');
  const code = Number(error.code);
  const message = String(error.message || '').toLowerCase();
  return name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || code === 22
    || code === 1014
    || message.includes('quota');
}

function estimateJsonBytes(value) {
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  } catch {
    return 0;
  }
}

function formatStorageBytes(bytes) {
  const size = Math.max(0, Number(bytes) || 0);
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(size < 10 * 1024 ? 1 : 0) + ' KB';
  return (size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 2 : 1) + ' MB';
}

export function getCanvasProjectsStorageHealth(projectsInput) {
  const projects = ensureArray(projectsInput != null ? projectsInput : loadCanvasProjects())
    .map(project => normalizeCanvasProject(project));
  const raw = (() => {
    try { return localStorage.getItem(CANVAS_PROJECTS_KEY) || ''; } catch { return ''; }
  })();
  const bytes = raw ? estimateJsonBytes(raw) : estimateJsonBytes(projects);
  const softLimitBytes = 4.5 * 1024 * 1024;
  const warnBytes = 1.5 * 1024 * 1024;
  const criticalBytes = 3 * 1024 * 1024;
  const projectStats = projects.map(project => {
    const nodes = project?.nodes && typeof project.nodes === 'object' ? Object.keys(project.nodes).length : 0;
    const edges = project?.edges && typeof project.edges === 'object' ? Object.keys(project.edges).length : 0;
    const projectBytes = estimateJsonBytes(project);
    return {
      id: project.id,
      title: project.title || '未命名画布',
      nodes,
      edges,
      bytes: projectBytes,
      updatedAt: Number(project.updatedAt) || 0,
      lastOpenedAt: Number(project.lastOpenedAt) || 0,
      createdAt: Number(project.createdAt) || 0
    };
  }).sort((a, b) => (b.bytes - a.bytes) || (b.updatedAt - a.updatedAt));

  let level = 'ok';
  if (bytes >= criticalBytes || projects.length >= 24) level = 'critical';
  else if (bytes >= warnBytes || projects.length >= 12) level = 'warn';

  let label = '存储健康';
  let hint = '可导出备份后继续编辑；本地保存仍有余量。';
  if (level === 'critical') {
    label = '存储接近上限';
    hint = '建议先导出大项目，再清理旧画布，避免保存失败。';
  } else if (level === 'warn') {
    label = '存储偏高';
    hint = '项目变多后建议定期导出备份，并清理不再使用的画布。';
  }

  return {
    key: CANVAS_PROJECTS_KEY,
    projectCount: projects.length,
    bytes,
    softLimitBytes,
    usageRatio: softLimitBytes > 0 ? bytes / softLimitBytes : 0,
    level,
    label,
    hint,
    bytesLabel: formatStorageBytes(bytes),
    softLimitLabel: formatStorageBytes(softLimitBytes),
    largestProjects: projectStats.slice(0, 5),
    projects: projectStats
  };
}

export function pruneCanvasProjects(projectsInput, options = {}) {
  const list = ensureArray(projectsInput).map(project => normalizeCanvasProject(project));
  const keepIds = new Set(
    (Array.isArray(options.keepProjectIds) ? options.keepProjectIds : [])
      .map(id => String(id || ''))
      .filter(Boolean)
  );
  const maxProjects = Number.isFinite(Number(options.maxProjects))
    ? Math.max(1, Math.floor(Number(options.maxProjects)))
    : 8;
  const ranked = [...list].sort((a, b) => {
    const ao = Number(a?.lastOpenedAt) || 0;
    const bo = Number(b?.lastOpenedAt) || 0;
    if (bo !== ao) return bo - ao;
    return (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0);
  });

  // Always keep forced IDs first (e.g. resume project), then fill remaining slots by recency.
  const kept = [];
  const keptIdSet = new Set();
  ranked.forEach(project => {
    if (!project || !keepIds.has(String(project.id))) return;
    if (keptIdSet.has(String(project.id))) return;
    kept.push(project);
    keptIdSet.add(String(project.id));
  });
  ranked.forEach(project => {
    if (!project || keptIdSet.has(String(project.id))) return;
    if (kept.length < maxProjects) {
      kept.push(project);
      keptIdSet.add(String(project.id));
    }
  });
  // If forced keeps already exceeded max, trim oldest non-critical? Keep all forced, but cap total by dropping lowest-ranked forced only when necessary.
  while (kept.length > maxProjects) {
    // Drop from the end (least recently opened among kept after forced-first packing).
    const drop = kept.pop();
    if (drop) keptIdSet.delete(String(drop.id));
  }
  const removed = ranked.filter(project => project && !keptIdSet.has(String(project.id)));
  return {
    projects: kept,
    removed,
    removedCount: removed.length,
    keptCount: kept.length
  };
}

function touch(project) {
  project.updatedAt = Date.now();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

export function loadCanvasProjects() {
  const projects = readJSON(CANVAS_PROJECTS_KEY, []);
  return ensureArray(projects).map(project => normalizeCanvasProject(project));
}

export function saveCanvasProjects(projects) {
  const normalized = ensureArray(projects).map(project => normalizeCanvasProject(project));
  const result = writeJSON(CANVAS_PROJECTS_KEY, normalized);
  const storageHealth = getCanvasProjectsStorageHealth(normalized);
  if (result && result.ok === false) {
    return {
      ok: false,
      count: normalized.length,
      quotaExceeded: result.quotaExceeded === true,
      error: result.error || new Error('canvas store write failed'),
      storageHealth
    };
  }
  return {
    ok: true,
    count: normalized.length,
    storageHealth
  };
}

export { createCanvasProject };

export function renameCanvasProject(projects, projectId, nextTitle) {
  const project = ensureArray(projects).find(entry => entry && entry.id === projectId);
  if (!project) return;
  const trimmed = String(nextTitle || '').trim();
  if (!trimmed) return;
  project.title = trimmed;
  touch(project);
}

export function markCanvasProjectOpened(projects, projectId, openedAt = Date.now()) {
  const list = ensureArray(projects);
  const project = list.find(entry => entry && entry.id === projectId);
  if (!project) return null;
  const ts = Number.isFinite(Number(openedAt)) ? Number(openedAt) : Date.now();
  project.lastOpenedAt = ts;
  project.updatedAt = Math.max(Number(project.updatedAt) || 0, ts);
  return project;
}

export function duplicateCanvasProject(projects, projectId, options = {}) {
  const list = Array.isArray(projects) ? projects : [];
  const source = list.find(entry => entry?.id === projectId);
  if (!source) return null;
  const base = createCanvasProject(String(options.title || ((source.title || '未命名画布') + ' 副本')));
  const cloned = cloneCanvasProject(normalizeCanvasProject(source));
  const now = Date.now();
  const duplicated = normalizeCanvasProject({
    ...cloned,
    id: base.id,
    title: base.title,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: 0
  });
  list.unshift(duplicated);
  return duplicated;
}


export function deleteCanvasProject(projects, projectId) {
  const list = ensureArray(projects);
  const index = list.findIndex(entry => entry && entry.id === projectId);
  if (index !== -1) list.splice(index, 1);
}

export function upsertCanvasNode(project, node) {
  if (!project || !node) return null;
  if (!project.nodes || typeof project.nodes !== 'object') project.nodes = {};
  if (!Array.isArray(project.nodeOrder)) project.nodeOrder = [];
  const existingNode = node.id && project.nodes[node.id] ? project.nodes[node.id] : {};
  const nextInput = { ...existingNode, ...node };
  const nextNode = createNodeByType(nextInput);
  project.nodes[nextNode.id] = nextNode;
  if (!project.nodeOrder.includes(nextNode.id)) project.nodeOrder.push(nextNode.id);
  touch(project);
  return nextNode;
}

export function duplicateCanvasNode(project, nodeId, offset = { x: 32, y: 32 }) {
  const node = project?.nodes?.[nodeId];
  if (!node) return null;
  const next = createNodeByType({
    ...JSON.parse(JSON.stringify(node)),
    id: undefined,
    x: (Number(node.x) || 0) + (Number(offset.x) || 32),
    y: (Number(node.y) || 0) + (Number(offset.y) || 32),
    title: `${node.title || '节点'} 副本`,
    createdAt: undefined,
    updatedAt: undefined,
    generationTaskId: '',
    generationStartedAt: 0,
    generationStatus: 'idle',
    generationError: ''
  });
  return upsertCanvasNode(project, next);
}

export function upsertCanvasEdge(project, edge) {
  if (!project || !edge) return null;
  if (!project.edges || typeof project.edges !== 'object') project.edges = {};
  const existingEdge = edge.id && project.edges[edge.id] ? project.edges[edge.id] : {};
  const nextEdge = createCanvasEdge({ ...existingEdge, ...edge });
  project.edges[nextEdge.id] = nextEdge;
  touch(project);
  return nextEdge;
}

export function removeCanvasEdge(project, edgeId) {
  if (!project || !project.edges || !edgeId) return;
  if (project.edges[edgeId]) {
    delete project.edges[edgeId];
    touch(project);
  }
}

export function removeCanvasNode(project, nodeId) {
  if (!project || !nodeId) return;
  if (project.nodes && project.nodes[nodeId]) delete project.nodes[nodeId];
  if (Array.isArray(project.nodeOrder)) {
    project.nodeOrder = project.nodeOrder.filter(id => id !== nodeId);
  }
  if (project.edges && typeof project.edges === 'object') {
    for (const [edgeId, edge] of Object.entries(project.edges)) {
      if (edge && (edge.fromNodeId === nodeId || edge.toNodeId === nodeId)) delete project.edges[edgeId];
    }
  }
  Object.values(project.nodes || {}).forEach(node => {
    if (node?.targetNodeId === nodeId) node.targetNodeId = '';
    if (node?.groupId === nodeId) node.groupId = '';
    if (Array.isArray(node?.references)) {
      node.references = node.references.filter(id => id !== nodeId);
    }
  });
  touch(project);
}

export function createCanvasProjectSnapshot(project) {
  return cloneCanvasProject(normalizeCanvasProject(project));
}

function createNodeByType(node) {
  if (node?.type === 'media') return createCanvasMediaNode(node);
  if (node?.type === 'text') return createCanvasTextNode(node);
  if (node?.type === 'group') return createCanvasGroupNode(node);
  if (node?.type === 'config') return createCanvasConfigNode(node);
  if (node?.type === 'note') return createCanvasNoteNode(node);
  return createCanvasNode(node);
}
