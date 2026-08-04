export const CANVAS_PROJECTS_KEY = 'image_app:canvas_projects';
export const CANVAS_EXPORT_VERSION = 3;

const DEFAULT_GROUP_TITLE = '分组';
const DEFAULT_NOTE_TITLE = '注释';
const DEFAULT_TEXT_TITLE = '文本';
const DEFAULT_MEDIA_TITLE = '图片';
const DEFAULT_CONFIG_TITLE = '编排节点';
const MAX_EMBEDDED_MEDIA_SRC_LENGTH = 4096;

export const DEFAULT_CANVAS_GENERATION_CONFIG = {
  kind: 'image',
  model: '',
  aspect: '',
  resolution: '',
  quality: '',
  videoDuration: '',
  count: 1,
  promptMode: 'text'
};

export const DEFAULT_TIMELINE_TRACKS = [
  { id: 'track-video', title: '视频轨', kind: 'video' },
  { id: 'track-audio', title: '音频轨', kind: 'audio' },
  { id: 'track-subtitle', title: '字幕轨', kind: 'subtitle' }
];

export function createId(prefix = 'canvas') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultNodeSize(type, kind) {
  if (type === 'group') return { width: 320, height: 220 };
  if (type === 'text') return { width: 280, height: 180 };
  if (type === 'config') return { width: 360, height: 300 };
  if (type === 'media' && kind === 'audio') return { width: 300, height: 120 };
  if (type === 'media' && kind === 'video') return { width: 320, height: 220 };
  if (type === 'media' && kind === 'subtitle') return { width: 320, height: 140 };
  if (type === 'media') return { width: 260, height: 200 };
  return { width: 220, height: 160 };
}

export function fitMediaNodeSize(width, height, maxWidth = 320, maxHeight = 320) {
  if (globalThis.ImageRatio && typeof globalThis.ImageRatio.fitNodeSize === 'function') {
    return globalThis.ImageRatio.fitNodeSize(width, height, maxWidth, maxHeight);
  }
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const scale = Math.min(1, maxWidth / w, maxHeight / h);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale))
  };
}

function sanitizeEmbeddedMediaSrc(value) {
  const src = String(value || '');
  if (!src) return '';
  if (/^data:/i.test(src) && src.length > MAX_EMBEDDED_MEDIA_SRC_LENGTH) {
    return '';
  }
  return src;
}

function normalizeDurationMs(value, fallback = null) {
  if (Number.isFinite(value) && value >= 0) return Math.round(value);
  return fallback;
}

function normalizeTrimMs(value) {
  if (Number.isFinite(value) && value >= 0) return Math.round(value);
  return 0;
}

function normalizeTrackId(trackId, kind = '') {
  const direct = String(trackId || '').trim();
  if (direct) return direct;
  if (kind === 'audio') return 'track-audio';
  if (kind === 'subtitle') return 'track-subtitle';
  return 'track-video';
}

function normalizeRotation(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function normalizeCanvasRole(value, fallback = '') {
  const normalized = String(value || fallback || '').trim();
  if (normalized === 'reference' || normalized === 'target' || normalized === 'reference-prompt') return normalized;
  return '';
}

function normalizeGenerationStatus(value) {
  const normalized = String(value || '').trim();
  if (normalized === 'idle' || normalized === 'queued' || normalized === 'running' || normalized === 'success' || normalized === 'error') {
    return normalized;
  }
  return 'idle';
}

function normalizeTimelineClip(clip = {}, kind = '') {
  const startMs = normalizeTrimMs(clip.startMs);
  const durationMs = normalizeDurationMs(clip.durationMs, 4000) || 4000;
  const trimInMs = normalizeTrimMs(clip.trimInMs);
  const trackId = normalizeTrackId(clip.trackId, kind);

  return {
    id: clip.id || createId('clip'),
    trackId,
    startMs,
    durationMs,
    trimInMs
  };
}

function createDefaultTimeline() {
  return {
    currentTimeMs: 0,
    playbackRate: 1,
    isPlaying: false,
    tracks: DEFAULT_TIMELINE_TRACKS.map(track => ({ ...track }))
  };
}

function normalizeGenerationConfig(config = {}) {
  return {
    ...DEFAULT_CANVAS_GENERATION_CONFIG,
    ...config,
    count: clampCount(config.count),
    promptMode: String(config.promptMode || DEFAULT_CANVAS_GENERATION_CONFIG.promptMode || 'text')
  };
}

function clampCount(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 1;
  return Math.max(1, Math.min(10, Math.round(next)));
}

export function createCanvasNode(node = {}) {
  const id = node.id || createId('node');
  const type = node.type || 'note';
  const kind = node.kind || '';
  const size = getDefaultNodeSize(type, kind);
  const now = Date.now();

  return {
    ...node,
    id,
    type,
    title: String(node.title || ''),
    x: Number.isFinite(node.x) ? node.x : 0,
    y: Number.isFinite(node.y) ? node.y : 0,
    width: Number.isFinite(node.width) ? node.width : size.width,
    height: Number.isFinite(node.height) ? node.height : size.height,
    rotation: normalizeRotation(node.rotation),
    zIndex: Number.isFinite(node.zIndex) ? node.zIndex : 0,
    hidden: Boolean(node.hidden),
    locked: Boolean(node.locked),
    groupId: String(node.groupId || ''),
    createdAt: Number.isFinite(node.createdAt) ? node.createdAt : now,
    updatedAt: Number.isFinite(node.updatedAt) ? node.updatedAt : now,
    canvasRole: normalizeCanvasRole(node.canvasRole, node.role),
    generationStatus: normalizeGenerationStatus(node.generationStatus),
    generationTaskId: String(node.generationTaskId || ''),
    generationStartedAt: Number.isFinite(node.generationStartedAt) ? node.generationStartedAt : 0,
    generationError: String(node.generationError || '')
  };
}

export function createCanvasMediaNode(node = {}) {
  const durationMs = normalizeDurationMs(node.durationMs, node.kind === 'video' ? 8000 : node.kind === 'audio' ? 12000 : 5000);
  return {
    ...createCanvasNode(node),
    type: 'media',
    kind: node.kind || 'image',
    title: String(node.title || DEFAULT_MEDIA_TITLE),
    text: String(node.text || ''),
    resourceId: node.resourceId || '',
    resourceSrc: sanitizeEmbeddedMediaSrc(node.resourceSrc || ''),
    thumbnailSrc: sanitizeEmbeddedMediaSrc(node.thumbnailSrc || ''),
    posterSrc: sanitizeEmbeddedMediaSrc(node.posterSrc || ''),
    mimeType: node.mimeType || '',
    freeResize: Boolean(node.freeResize),
    durationMs,
    clip: normalizeTimelineClip({
      ...node.clip,
      durationMs: node?.clip?.durationMs ?? durationMs
    }, node.kind || 'image')
  };
}

export function createCanvasEdge(edge = {}) {
  const id = edge.id || createId('edge');
  const now = Date.now();
  return {
    ...edge,
    id,
    fromNodeId: edge.fromNodeId || '',
    toNodeId: edge.toNodeId || '',
    label: String(edge.label || ''),
    kind: String(edge.kind || 'relation'),
    createdAt: Number.isFinite(edge.createdAt) ? edge.createdAt : now,
    updatedAt: Number.isFinite(edge.updatedAt) ? edge.updatedAt : now
  };
}

export function createCanvasProject(title) {
  const now = Date.now();
  return {
    id: createId('project'),
    title: String(title || '未命名画布'),
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: 0,
    viewport: { x: 0, y: 0, scale: 1 },
    backgroundMode: 'lines',
    viewPrefs: {
      timelineCollapsed: true,
      miniMapOpen: false,
      sidebarCollapsed: false,
      focusMode: false
    },
    nodeOrder: [],
    nodes: {},
    edges: {},
    assistantSessions: [],
    activeAssistantSessionId: '',
    timeline: createDefaultTimeline()
  };
}

export function createGroupNodeData(title = DEFAULT_GROUP_TITLE) {
  return {
    title: String(title || DEFAULT_GROUP_TITLE),
    color: '#4f7cff'
  };
}

export function createTextNodeData(text = '') {
  return {
    text: String(text || ''),
    style: {
      fontSize: 16,
      color: '#f5f7ff',
      align: 'left'
    }
  };
}

export function createNoteNodeData(title = DEFAULT_NOTE_TITLE, text = '') {
  return {
    title: String(title || DEFAULT_NOTE_TITLE),
    text: String(text || ''),
    color: '#ffd86b'
  };
}

export function createConfigNodeData(config = {}) {
  return {
    title: String(config.title || DEFAULT_CONFIG_TITLE),
    composerContent: String(config.composerContent || ''),
    promptText: String(config.promptText || ''),
    targetNodeId: String(config.targetNodeId || ''),
    lockResultNodes: Boolean(config.lockResultNodes),
    generationKind: String(config.generationKind || 'image'),
    references: Array.isArray(config.references) ? config.references.filter(Boolean) : [],
    genConfig: normalizeGenerationConfig(config.genConfig)
  };
}

export function createCanvasTextNode(node = {}) {
  const data = createTextNodeData(node.text);
  return createCanvasNode({
    ...data,
    ...node,
    type: 'text',
    title: String(node.title || DEFAULT_TEXT_TITLE)
  });
}

export function createCanvasNoteNode(node = {}) {
  const data = createNoteNodeData(node.title, node.text);
  return createCanvasNode({
    ...data,
    ...node,
    type: 'note',
    title: data.title
  });
}

export function createCanvasGroupNode(node = {}) {
  const data = createGroupNodeData(node.title);
  return createCanvasNode({
    ...data,
    ...node,
    type: 'group',
    title: data.title
  });
}

const DEFAULT_LOOP_TITLE = '循环节点';

const DEFAULT_LLM_TITLE = '智能文本节点';

export function createCanvasLlmNode(node = {}) {
  return createCanvasNode({
    ...node,
    type: 'llm',
    title: String(node.title || DEFAULT_LLM_TITLE),
    text: String(node.text || ''),
    llmInput: String(node.llmInput || ''),
    llmMode: String(node.llmMode || 'optimize'),
    llmOutput: String(node.llmOutput || ''),
    llmStatus: String(node.llmStatus || 'idle')
  });
}

export function createCanvasLoopNode(node = {}) {
  return createCanvasNode({
    ...node,
    type: 'loop',
    title: String(node.title || DEFAULT_LOOP_TITLE),
    basePrompt: String(node.basePrompt || ''),
    variations: Array.isArray(node.variations) ? node.variations.filter(v => String(v || '').trim()) : [],
    targetNodeId: String(node.targetNodeId || ''),
    genConfig: normalizeGenerationConfig(node.genConfig),
    generationKind: String(node.generationKind || 'image'),
    loopProgress: Number.isFinite(node.loopProgress) ? Math.max(0, Math.min(1, node.loopProgress)) : 0,
    loopStatus: String(node.loopStatus || 'idle')
  });
}

export function createCanvasConfigNode(node = {}) {
  const data = createConfigNodeData(node);
  return createCanvasNode({
    ...data,
    ...node,
    type: 'config',
    title: String(node.title || data.title || DEFAULT_CONFIG_TITLE),
    composerContent: data.composerContent,
    promptText: data.promptText,
    targetNodeId: data.targetNodeId,
    lockResultNodes: data.lockResultNodes,
    generationKind: data.generationKind,
    references: data.references,
    genConfig: data.genConfig
  });
}

export function createCanvasMediaNodeFromResource(record = {}, overrides = {}) {
  const label = String(
    overrides.title
      || record?.metadata?.label
      || record?.source?.label
      || record?.image?.label
      || DEFAULT_MEDIA_TITLE
  );

  const naturalWidth = Number(overrides.naturalWidth || record?.source?.width || record?.image?.width || 0);
  const naturalHeight = Number(overrides.naturalHeight || record?.source?.height || record?.image?.height || 0);
  let sizeOverrides = {};
  if (!(Number.isFinite(overrides.width) && Number.isFinite(overrides.height)) && naturalWidth > 0 && naturalHeight > 0) {
    sizeOverrides = fitMediaNodeSize(naturalWidth, naturalHeight, Number(overrides.maxWidth) || 320, Number(overrides.maxHeight) || 320);
  }

  return createCanvasMediaNode({
    ...overrides,
    ...sizeOverrides,
    title: label,
    kind: record?.kind || overrides.kind || 'image',
    resourceId: record?.id || overrides.resourceId || '',
    resourceSrc: record?.source?.src || overrides.resourceSrc || '',
    thumbnailSrc: record?.source?.thumbnailSrc || record?.image?.thumbnailSrc || record?.image?.src || overrides.thumbnailSrc || '',
    posterSrc: record?.video?.posterSrc || record?.source?.posterSrc || overrides.posterSrc || '',
    mimeType: record?.source?.mimeType || overrides.mimeType || '',
    durationMs: Number.isFinite(record?.source?.durationMs) ? record.source.durationMs : overrides.durationMs,
    canvasRole: normalizeCanvasRole(overrides.canvasRole || record?.source?.canvasRole || ''),
    naturalWidth: naturalWidth || overrides.naturalWidth,
    naturalHeight: naturalHeight || overrides.naturalHeight
  });
}

export function canCreateEdgeBetween(fromNodeId, toNodeId) {
  return Boolean(fromNodeId && toNodeId && fromNodeId !== toNodeId);
}

export function ensureCanvasProjectTimeline(project) {
  if (!project || typeof project !== 'object') return createDefaultTimeline();
  if (!project.timeline || typeof project.timeline !== 'object') {
    project.timeline = createDefaultTimeline();
  }

  if (!Array.isArray(project.timeline.tracks) || !project.timeline.tracks.length) {
    project.timeline.tracks = createDefaultTimeline().tracks;
  }

  project.timeline.currentTimeMs = normalizeTrimMs(project.timeline.currentTimeMs);
  project.timeline.playbackRate = Number.isFinite(project.timeline.playbackRate) && project.timeline.playbackRate > 0
    ? project.timeline.playbackRate
    : 1;
  project.timeline.isPlaying = Boolean(project.timeline.isPlaying);
  project.timeline.tracks = project.timeline.tracks.map(track => ({
    id: String(track?.id || createId('track')),
    title: String(track?.title || '轨道'),
    kind: String(track?.kind || 'mixed')
  }));

  return project.timeline;
}

export function ensureCanvasMediaNodeClip(node) {
  if (!node || node.type !== 'media') return null;
  node.clip = normalizeTimelineClip({
    ...node.clip,
    durationMs: node?.clip?.durationMs ?? node.durationMs
  }, node.kind);
  return node.clip;
}

export function ensureCanvasConfigNode(node) {
  if (!node || node.type !== 'config') return null;
  node.promptText = String(node.promptText || '');
  node.composerContent = String(node.composerContent || '');
  node.targetNodeId = String(node.targetNodeId || '');
  node.lockResultNodes = Boolean(node.lockResultNodes);
  node.generationKind = String(node.generationKind || 'image');
  node.references = Array.isArray(node.references) ? node.references.filter(Boolean) : [];
  node.genConfig = normalizeGenerationConfig(node.genConfig || {});
  node.generationStatus = normalizeGenerationStatus(node.generationStatus);
  return node;
}

export function getTimelineTrack(project, trackId = '') {
  const timeline = ensureCanvasProjectTimeline(project);
  return timeline.tracks.find(track => track.id === trackId)
    || timeline.tracks.find(track => track.id === 'track-video')
    || timeline.tracks[0]
    || null;
}

export function getPreferredTrackIdForKind(kind = '') {
  if (kind === 'audio') return 'track-audio';
  if (kind === 'subtitle') return 'track-subtitle';
  return 'track-video';
}

export function attachNodeToTimeline(project, nodeId, options = {}) {
  if (!project?.nodes?.[nodeId]) return null;
  const node = project.nodes[nodeId];
  if (node.type !== 'media') return null;

  ensureCanvasProjectTimeline(project);
  const clip = ensureCanvasMediaNodeClip(node);
  const track = getTimelineTrack(project, options.trackId || clip.trackId || getPreferredTrackIdForKind(node.kind));
  if (!track || !clip) return null;

  clip.trackId = track.id;
  clip.startMs = normalizeTrimMs(options.startMs ?? clip.startMs);
  clip.durationMs = normalizeDurationMs(options.durationMs, clip.durationMs) || clip.durationMs;
  clip.trimInMs = normalizeTrimMs(options.trimInMs ?? clip.trimInMs);
  return clip;
}

export function setTimelineCurrentTime(project, currentTimeMs) {
  const timeline = ensureCanvasProjectTimeline(project);
  timeline.currentTimeMs = normalizeTrimMs(currentTimeMs);
  return timeline.currentTimeMs;
}

export function setTimelinePlaybackState(project, nextState = {}) {
  const timeline = ensureCanvasProjectTimeline(project);
  if (typeof nextState.isPlaying === 'boolean') {
    timeline.isPlaying = nextState.isPlaying;
  }
  if (Number.isFinite(nextState.playbackRate) && nextState.playbackRate > 0) {
    timeline.playbackRate = nextState.playbackRate;
  }
  return timeline;
}

export function getProjectTimelineClips(project) {
  const timeline = ensureCanvasProjectTimeline(project);
  return Object.values(project?.nodes || {})
    .filter(node => node?.type === 'media' && node?.clip)
    .map(node => {
      const clip = ensureCanvasMediaNodeClip(node);
      return {
        nodeId: node.id,
        title: node.title || DEFAULT_MEDIA_TITLE,
        kind: node.kind || 'image',
        durationMs: normalizeDurationMs(node.durationMs, clip.durationMs) || clip.durationMs,
        clip,
        track: getTimelineTrack(project, clip.trackId),
        node,
        isActive: timeline.currentTimeMs >= clip.startMs && timeline.currentTimeMs <= (clip.startMs + clip.durationMs)
      };
    })
    .sort((a, b) => (a.clip.trackId.localeCompare(b.clip.trackId)) || (a.clip.startMs - b.clip.startMs));
}

export function getTimelineDurationMs(project) {
  const timeline = ensureCanvasProjectTimeline(project);
  const clips = getProjectTimelineClips(project);
  const maxClipEndMs = clips.reduce((max, item) => (
    Math.max(max, (item?.clip?.startMs || 0) + (item?.clip?.durationMs || 0))
  ), 0);
  return Math.max(maxClipEndMs, timeline.currentTimeMs || 0, 0);
}

export function getNodeReferenceToken(nodeId) {
  return nodeId ? `@[node:${nodeId}]` : '';
}

export function extractNodeReferenceIds(value = '') {
  const text = String(value || '');
  const matches = [...text.matchAll(/@\[node:([a-z0-9-]+)\]/gi)];
  return [...new Set(matches.map(match => String(match[1] || '').trim()).filter(Boolean))];
}

export function createNodeReferenceSnapshot(node, project) {
  if (!node) return null;
  const referencedIds = extractNodeReferenceIds(node.composerContent || node.promptText || '');
  const explicitIds = Array.isArray(node.references) ? node.references.filter(Boolean) : [];
  const inboundIds = project?.edges
    ? Object.values(project.edges)
      .filter(edge => edge?.toNodeId === node.id && edge?.fromNodeId)
      .map(edge => edge.fromNodeId)
    : [];
  const allIds = [...new Set([...referencedIds, ...explicitIds, ...inboundIds])];

  return {
    nodeId: node.id || '',
    references: allIds,
    tokens: allIds.map(id => ({
      id,
      token: getNodeReferenceToken(id),
      title: buildCanvasNodeLabel(project?.nodes?.[id])
    }))
  };
}

export function buildCanvasNodeLabel(node) {
  if (!node) return '未知节点';
  if (node.title) return String(node.title);
  if (node.type === 'config') return DEFAULT_CONFIG_TITLE;
  if (node.type === 'media') return DEFAULT_MEDIA_TITLE;
  if (node.type === 'group') return DEFAULT_GROUP_TITLE;
  if (node.type === 'text') return DEFAULT_TEXT_TITLE;
  return DEFAULT_NOTE_TITLE;
}

export function cloneCanvasProject(project) {
  return JSON.parse(JSON.stringify(project || createCanvasProject()));
}

export function normalizeCanvasProject(project = {}) {
  const nextProject = {
    ...createCanvasProject(project.title || '未命名画布'),
    ...project,
    title: String(project.title || '未命名画布')
  };
  nextProject.createdAt = Number.isFinite(Number(project.createdAt)) ? Number(project.createdAt) : nextProject.createdAt;
  nextProject.updatedAt = Number.isFinite(Number(project.updatedAt)) ? Number(project.updatedAt) : nextProject.updatedAt;
  nextProject.lastOpenedAt = Number.isFinite(Number(project.lastOpenedAt)) ? Number(project.lastOpenedAt) : 0;

  nextProject.viewport = {
    x: Number.isFinite(project?.viewport?.x) ? project.viewport.x : 0,
    y: Number.isFinite(project?.viewport?.y) ? project.viewport.y : 0,
    scale: Number.isFinite(project?.viewport?.scale) && project.viewport.scale > 0 ? project.viewport.scale : 1
  };
  nextProject.backgroundMode = project.backgroundMode === 'dots' ? 'dots' : 'lines';
  nextProject.viewPrefs = {
    timelineCollapsed: project?.viewPrefs?.timelineCollapsed !== false,
    miniMapOpen: project?.viewPrefs?.miniMapOpen === true,
    sidebarCollapsed: project?.viewPrefs?.sidebarCollapsed === true,
    focusMode: project?.viewPrefs?.focusMode === true
  };
  nextProject.nodeOrder = Array.isArray(project.nodeOrder) ? [...project.nodeOrder] : [];
  nextProject.nodes = Object.fromEntries(
    Object.entries(project.nodes || {}).map(([id, node]) => {
      const input = { ...node, id };
      if (input.type === 'media') return [id, createCanvasMediaNode(input)];
      if (input.type === 'text') return [id, createCanvasTextNode(input)];
      if (input.type === 'group') return [id, createCanvasGroupNode(input)];
      if (input.type === 'loop') return [id, createCanvasLoopNode(input)];
      if (input.type === 'llm') return [id, createCanvasLlmNode(input)];
      if (input.type === 'config') return [id, createCanvasConfigNode(input)];
      return [id, createCanvasNoteNode(input)];
    })
  );
  nextProject.edges = Object.fromEntries(
    Object.entries(project.edges || {}).map(([id, edge]) => [id, createCanvasEdge({ ...edge, id })])
  );
  nextProject.assistantSessions = (Array.isArray(project.assistantSessions) ? project.assistantSessions : []).map(session => ({
    id: String(session?.id || createId('canvas-chat')),
    title: String(session?.title || '新会话'),
    createdAt: Number(session?.createdAt) || Date.now(),
    updatedAt: Number(session?.updatedAt) || Date.now(),
    messages: (Array.isArray(session?.messages) ? session.messages : []).map(message => ({
      id: String(message?.id || createId('canvas-message')),
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      text: String(message?.text || ''),
      createdAt: Number(message?.createdAt) || Date.now()
    }))
  }));
  nextProject.activeAssistantSessionId = nextProject.assistantSessions.some(session => session.id === project.activeAssistantSessionId)
    ? String(project.activeAssistantSessionId)
    : (nextProject.assistantSessions[0]?.id || '');
  ensureCanvasProjectTimeline(nextProject);
  if (!nextProject.nodeOrder.length) {
    nextProject.nodeOrder = Object.keys(nextProject.nodes);
  } else {
    nextProject.nodeOrder = [...new Set([
      ...nextProject.nodeOrder.filter(id => nextProject.nodes[id]),
      ...Object.keys(nextProject.nodes).filter(id => !nextProject.nodeOrder.includes(id))
    ])];
  }
  return nextProject;
}
