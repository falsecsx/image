import {
  canCreateEdgeBetween,
  createCanvasMediaNode,
  createCanvasMediaNodeFromResource,
  createCanvasNoteNode,
  createCanvasTextNode,
  createCanvasConfigNode,
  createCanvasLlmNode,
  createCanvasLoopNode,
  normalizeCanvasProject,
  ensureCanvasConfigNode,
  ensureCanvasMediaNodeClip,
  ensureCanvasProjectTimeline,
  getPreferredTrackIdForKind,
  getProjectTimelineClips,
  getTimelineDurationMs,
  setTimelineCurrentTime,
  setTimelinePlaybackState,
  buildCanvasNodeLabel,
  attachNodeToTimeline,
  extractNodeReferenceIds,
  getNodeReferenceToken,
  createNodeReferenceSnapshot
} from './canvas-model.js?v=20260803-4';
import {
  renderCanvasGrid,
  renderCanvasNodes,
  renderCanvasEdges,
  renderCanvasTimeline,
  renderCanvasMiniMap,
  updateCanvasMiniMapViewport,
  buildCanvasEdgeLaneOffsets,
  resolveCanvasEdgeGeometry,
  buildCanvasNodeRenderSignature,
  buildCanvasNodeMarkup
} from './canvas-renderer.js?v=20260803-4';
import { createCanvasInteractionScheduler } from './canvas-interactions.js?v=20260803-4';
import {
  createCanvasResourceRecord,
  getCanvasImportSourcesFromBridge,
  getCanvasResourceStore,
  getCanvasResourceDisplaySource,
  importCanvasResourcesFromBridge,
  cacheCanvasResourceRecord,
  garbageCollectCanvasResources,
  prepareCanvasResourceRecord
} from './canvas-resources.js?v=20260803-4';
import { createPromptBranch, removePromptBranchResourceNodes } from './canvas-prompt.js?v=20260803-4';
import {
  createCanvasProjectSnapshot,
  removeCanvasNode,
  removeCanvasEdge,
  saveCanvasProjects,
  upsertCanvasEdge,
  upsertCanvasNode,
  duplicateCanvasNode
} from './canvas-store.js?v=20260803-4';
import {
  getCanvasAssetStore,
  createCanvasAsset,
  extractAssetReferenceIds,
  assetToReferenceImage
} from './canvas-assets.js?v=20260803-4';
import {
  cropImage,
  upscaleImage,
  buildMaskFromStrokes,
  composeOutpaint,
  composeOutpaintMask
} from './canvas-edit.js?v=20260803-4';
import {
  splitImage,
  buildAngleLabel,
  buildAnglePrompt,
  loadImageQuickTools,
  saveImageQuickTools,
  DEFAULT_IMAGE_QUICK_TOOLS
} from './canvas-image-tools.js?v=20260803-4';
import { mountCanvasAssistant } from './canvas-assistant.js?v=20260803-4';

const MIN_SCALE = 0.05;
const MAX_SCALE = 5;
const TIMELINE_PIXELS_PER_SECOND = 32;
const TIMELINE_LANE_STEP = 72;
const CANVAS_NO_ZOOM_SELECTOR = [
  '[data-canvas-no-zoom]',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]'
].join(',');
export function zoomAroundPoint(viewport, point, nextScale) {
  const currentScale = Number.isFinite(viewport?.scale) && viewport.scale > 0 ? viewport.scale : 1;
  const scale = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : currentScale;
  const originX = Number.isFinite(viewport?.x) ? viewport.x : 0;
  const originY = Number.isFinite(viewport?.y) ? viewport.y : 0;
  const pointX = Number.isFinite(point?.x) ? point.x : 0;
  const pointY = Number.isFinite(point?.y) ? point.y : 0;
  const worldX = (pointX - originX) / currentScale;
  const worldY = (pointY - originY) / currentScale;
  return { x: pointX - (worldX * scale), y: pointY - (worldY * scale), scale };
}

export function hitTestBoxSelection(box, nodes) {
  const originX = Number.isFinite(box?.x) ? box.x : 0;
  const originY = Number.isFinite(box?.y) ? box.y : 0;
  const width = Number.isFinite(box?.width) ? box.width : 0;
  const height = Number.isFinite(box?.height) ? box.height : 0;
  const left = Math.min(originX, originX + width);
  const right = Math.max(originX, originX + width);
  const top = Math.min(originY, originY + height);
  const bottom = Math.max(originY, originY + height);
  return (Array.isArray(nodes) ? nodes : []).filter(node => {
    const nodeLeft = Number.isFinite(node?.x) ? node.x : 0;
    const nodeTop = Number.isFinite(node?.y) ? node.y : 0;
    const nodeRight = nodeLeft + (Number.isFinite(node?.width) ? node.width : 0);
    const nodeBottom = nodeTop + (Number.isFinite(node?.height) ? node.height : 0);
    return nodeLeft < right && nodeRight > left && nodeTop < bottom && nodeBottom > top;
  }).map(node => node.id).filter(Boolean);
}

export function buildCanvasContextMenuMarkup() {
  return `<div class="canvas-context-menu" hidden data-role="context-menu" data-canvas-no-zoom data-legacy-label="新建文本">
      <button type="button" class="canvas-context-menu-root" data-menu-section="create">
        <span>新建节点</span>
        <small>文本 / 媒体 / 智能</small>
      </button>
      <div class="canvas-context-menu-submenu" data-menu-submenu="create" hidden>
        <button type="button" data-action="new-text">添加文本节点</button>
        <button type="button" data-action="new-note">添加便签</button>
        <button type="button" data-action="new-config">添加编排节点（生成规则）</button>
        <button type="button" data-action="new-loop">新建循环节点</button>
        <button type="button" data-action="new-llm">新建智能文本</button>
        <button type="button" data-action="new-media">新建媒体</button>
        <button type="button" data-action="upload-local-images">本地上传图片</button>
        <button type="button" data-action="upload-image">从 Studio 导入</button>
      </div>
      <button type="button" class="canvas-context-menu-root" data-menu-section="selection">
        <span>选中操作</span>
        <small>复制 / 对齐 / 删除</small>
      </button>
      <div class="canvas-context-menu-submenu" data-menu-submenu="selection" hidden>
        <button type="button" data-action="duplicate-selected">复制所选</button>
        <button type="button" data-action="focus-selected">定位所选</button>
        <button type="button" data-action="fit-selection">适配所选</button>
        <button type="button" data-action="cycle-role-selected">切换角色</button>
        <button type="button" data-action="open-inspector">打开设置</button>
        <button type="button" data-action="group-selected">创建分组</button>
        <button type="button" data-action="select-group-members">选中分组成员</button>
        <button type="button" data-action="ungroup-selected">解散分组</button>
        <button type="button" data-action="rotate-left-selected">向左旋转 15°</button>
        <button type="button" data-action="rotate-right-selected">向右旋转 15°</button>
        <button type="button" data-action="select-connected">选中相连节点</button>
        <button type="button" data-action="connect-selected">连接所选</button>
        <button type="button" data-action="smart-wire-selected">智能接线</button>
        <button type="button" data-action="replace-sample-reference">替换到历史图节点</button>
        <button type="button" data-action="fill-sample-from-history">示例填入历史</button>
        <button type="button" data-action="toggle-lock-selected">锁定/解锁</button>
        <button type="button" data-action="add-selected-to-timeline">加入时间轴</button>
        <button type="button" data-action="favorite-selected">收藏到素材库</button>
        <button type="button" data-action="delete-selected">删除所选</button>
      </div>
      <button type="button" class="canvas-context-menu-root" data-menu-section="align">
        <span>对齐分布</span>
        <small>多选后可用</small>
      </button>
      <div class="canvas-context-menu-submenu" data-menu-submenu="align" hidden>
        <button type="button" data-action="align-left">左对齐</button>
        <button type="button" data-action="align-center-h">水平居中</button>
        <button type="button" data-action="align-right">右对齐</button>
        <button type="button" data-action="align-top">顶对齐</button>
        <button type="button" data-action="align-center-v">垂直居中</button>
        <button type="button" data-action="align-bottom">底对齐</button>
        <button type="button" data-action="distribute-h">水平均分</button>
        <button type="button" data-action="distribute-v">垂直分布</button>
      </div>
      <button type="button" class="canvas-context-menu-root" data-menu-section="smart">
        <span>智能处理</span>
        <small>生成 / 裁剪 / 放大</small>
      </button>
      <div class="canvas-context-menu-submenu" data-menu-submenu="smart" hidden>
        <button type="button" data-action="generate-selected">执行生成</button>
        <button type="button" data-action="crop-selected">裁剪所选图片</button>
        <button type="button" data-action="upscale-selected">放大所选图片</button>
        <button type="button" data-action="edit-loop-selected">编辑循环节点</button>
        <button type="button" data-action="run-llm-selected">运行智能文本</button>
      </div>
      <button type="button" class="canvas-context-menu-root" data-menu-section="view">
        <span>视图</span>
        <small>适配 / 重置</small>
      </button>
      <div class="canvas-context-menu-submenu" data-menu-submenu="view" hidden>
        <button type="button" data-action="fit-view">适配全部</button>
        <button type="button" data-action="fit-selection">适配所选</button>
        <button type="button" data-action="toggle-minimap">小地图</button>
        <button type="button" data-action="toggle-shortcuts">快捷键</button>
        <button type="button" data-action="reset-view">重置视图</button>
      </div>
    </div>`;
}

export function mountCanvasEditor(root, options = {}) {
  if (!root) {
    throw new Error('canvas editor root is required');
  }

  const state = createEditorState(options);
  renderEditorShell(root);
  try { globalThis.lucide?.createIcons?.(); } catch {}

  state.root = root;
  state.stage = root.querySelector('[data-role="stage"]');
  state.viewportElement = root.querySelector('[data-role="viewport"]');
  state.edgeLayer = root.querySelector('[data-role="edge-layer"]');
  state.nodeLayer = root.querySelector('[data-role="node-layer"]');
  state.selectionBox = root.querySelector('[data-role="selection-box"]');
  state.selectionBoundsEl = root.querySelector('[data-role="selection-bounds"]');
  state.snapGuidesEl = root.querySelector('[data-role="snap-guides"]');
  state.statusLabel = root.querySelector('[data-role="status"]');
  state.titleLabel = root.querySelector('[data-role="project-title"]');
  state.contextMenu = root.querySelector('[data-role="context-menu"]');
  state.contextMenuSections = [...root.querySelectorAll('[data-menu-section]')];
  state.contextMenuSubmenus = [...root.querySelectorAll('[data-menu-submenu]')];
  state.sidebarTabs = [...root.querySelectorAll('[data-action="switch-sidebar-tab"]')];
  state.sidebarPanels = [...root.querySelectorAll('[data-role="sidebar-panel"]')];
  state.sidebarForm = root.querySelector('[data-role="node-form"]');
  state.emptyInspector = root.querySelector('[data-role="inspector-empty"]');
  state.scaleLabel = root.querySelector('[data-role="zoom-level"]');
  state.backgroundSelect = root.querySelector('[data-role="background-mode"]');
  state.inspectorTab = root.querySelector('[data-role="inspector-tab"]');
  state.timelineLayer = root.querySelector('[data-role="timeline"]');
  state.timelineScroller = root.querySelector('[data-role="timeline-scroller"]');
  state.timelineInfo = root.querySelector('[data-role="timeline-info"]');
  state.playheadLabel = root.querySelector('[data-role="playhead-time"]');
  state.playbackButton = root.querySelector('[data-role="playback-button"]');
  state.playbackRateReadout = root.querySelector('[data-role="playback-rate-readout"]');
  state.playbackRateSelect = root.querySelector('[data-role="playback-rate"]');
  state.miniMap = root.querySelector('[data-role="mini-map"]');
  state.stageNav = root.querySelector('[data-role="stage-nav"]');
  state.stageNavMeta = root.querySelector('[data-role="stage-nav-meta"]');
  state.stageNavZoom = root.querySelector('[data-role="stage-nav-zoom"]');
  state.modalOverlay = root.querySelector('[data-role="canvas-modal"]');
  state.timelinePanel = root.querySelector('[data-role="timeline-panel"]');
  state.interactionHint = root.querySelector('[data-role="interaction-hint"]');
  state.shortcutPanel = root.querySelector('[data-role="shortcut-panel"]');
  state.onboardingEl = root.querySelector('[data-role="onboarding"]');
  state.emptyStageEl = root.querySelector('[data-role="empty-stage"]');
  state.stageCoachEl = root.querySelector('[data-role="stage-coach"]');
  state.stageCoachTitle = root.querySelector('[data-role="stage-coach-title"]');
  state.stageCoachDetail = root.querySelector('[data-role="stage-coach-detail"]');
  state.stageCoachActions = root.querySelector('[data-role="stage-coach-actions"]');
  state.dropOverlayEl = root.querySelector('[data-role="drop-overlay"]');
  state.runBanner = root.querySelector('[data-role="run-banner"]');
  state.connectTipEl = root.querySelector('[data-role="connect-tip"]');
  state.connectTipTitle = root.querySelector('[data-role="connect-tip-title"]');
  state.connectTipDetail = root.querySelector('[data-role="connect-tip-detail"]');
  state.modeHudEl = root.querySelector('[data-role="mode-hud"]');
  state.modeHudMode = root.querySelector('[data-role="mode-hud-mode"]');
  state.modeHudTitle = root.querySelector('[data-role="mode-hud-title"]');
  state.modeHudMeta = root.querySelector('[data-role="mode-hud-meta"]');
  state.modeHudFlags = root.querySelector('[data-role="mode-hud-flags"]');
  state.modeHudActions = root.querySelector('[data-role="mode-hud-actions"]');
  state.resultToast = root.querySelector('[data-role="result-toast"]');
  state.resultToastTitle = root.querySelector('[data-role="result-toast-title"]');
  state.resultToastDetail = root.querySelector('[data-role="result-toast-detail"]');
  state.resultToastFocusBtn = root.querySelector('[data-role="result-toast-focus"]');
  state.runBannerTitle = root.querySelector('[data-role="run-banner-title"]');
  state.runBannerDetail = root.querySelector('[data-role="run-banner-detail"]');
  state.runBannerRetryBtn = root.querySelector('[data-role="run-banner-retry"]');
  state.runBannerEditBtn = root.querySelector('[data-role="run-banner-edit"]');
  state.runBannerWireBtn = root.querySelector('[data-role="run-banner-wire"]');
  state.runBannerHint = root.querySelector('[data-role="run-banner-hint"]');
  state.runBannerResultBtn = root.querySelector('[data-role="run-banner-result"]');
  state.runBannerFocusBtn = root.querySelector('[data-role="run-banner-focus"]');
  state.selectionToolbar = root.querySelector('[data-role="selection-toolbar"]');
  state.selectionCountLabel = root.querySelector('[data-role="selection-count"]');
  state.selectionHintLabel = root.querySelector('[data-role="selection-hint"]');
  state.nodeQuickbar = root.querySelector('[data-role="node-quickbar"]');
  state.nodeQuickbarTitle = root.querySelector('[data-role="node-quickbar-title"]');
  state.nodeQuickbarType = root.querySelector('[data-role="node-quickbar-type"]');
  state.assistantRoot = root.querySelector('[data-role="canvas-assistant"]');
  state.edgeQuickbar = root.querySelector('[data-role="edge-quickbar"]');
  state.edgeQuickbarTitle = root.querySelector('[data-role="edge-quickbar-title"]');
  state.edgeQuickbarHint = root.querySelector('[data-role="edge-quickbar-hint"]');
  state.nodeSearchInput = root.querySelector('[data-role="node-search"]');
  state.nodeSearchResults = root.querySelector('[data-role="node-search-results"]');
  state.nodeSearchFiltersEl = root.querySelector('[data-role="node-search-filters"]');
  state.stageSearchEl = root.querySelector('[data-role="stage-search"]');
  state.stageSearchInput = root.querySelector('[data-role="stage-search-input"]');
  state.stageSearchResults = root.querySelector('[data-role="stage-search-results"]');
  state.stageSearchFiltersEl = root.querySelector('[data-role="stage-search-filters"]');
  state.stageSearchOpen = false;
  state.nodeSearchActiveIndex = -1;
  state.actionPanel = root.querySelector('[data-role="action-panel"]');
  state.contextCard = root.querySelector('[data-role="context-card"]');
  state.contextTitle = root.querySelector('[data-role="context-title"]');
  state.contextMeta = root.querySelector('[data-role="context-meta"]');
  state.contextHint = root.querySelector('[data-role="context-hint"]');
  state.contextActions = root.querySelector('[data-role="context-actions"]');
  state.actionHint = root.querySelector('[data-role="action-hint"]');
  state.actionGuide = root.querySelector('[data-role="action-guide"]');
  state.selectedOpsEl = root.querySelector('[data-role="selected-ops"]');
  state.selectedOpsSummary = root.querySelector('[data-role="selected-ops-summary"]');
  state.toolButtons = [...root.querySelectorAll('[data-tool]')];

  bindEditorEvents(state);
  state.assistantApi = mountCanvasAssistant(state.assistantRoot, {
    getProject: () => state.project,
    getSelectedIds: () => [...(state.selectedNodeIds || [])],
    persist: () => persistProject(state, { immediate: true }),
    agentBridge: state.agentBridge,
    onGenerate: (kind, prompt) => generateFromCanvasAssistant(state, kind, prompt)
  });
  // Keep latest dirty board durable across tab close / refresh.
  if (!state._onPersistPageHide) {
    state._onPersistPageHide = () => {
      try { flushPersistProject(state, { allowDestroyed: true }); } catch {}
    };
    try { window.addEventListener('pagehide', state._onPersistPageHide); } catch {}
    try { window.addEventListener('beforeunload', state._onPersistPageHide); } catch {}
  }
  setInteractionMode(state, state.interactionMode || 'pan');
  maybeShowCanvasOnboarding(state);
  setTimelineCollapsed(state, Boolean(state.timelineCollapsed), { persist: false });
  setSidebarCollapsed(state, Boolean(state.sidebarCollapsed), { persist: false, fromFocusMode: true });
  setTimelineCollapsed(state, Boolean(state.timelineCollapsed), { persist: false, fromFocusMode: true });
  if (state.focusMode) {
    // Re-enter focus chrome from saved prefs without clobbering restore snapshot badly.
    state._focusModeRestore = {
      sidebarCollapsed: false,
      timelineCollapsed: true,
      miniMapOpen: false
    };
    setFocusMode(state, true, { silent: true, persist: false, force: true, rerender: false });
  }
  syncViewToggleButtons(state);
  ensureViewportHistory(state);
  pushViewportHistory(state, { force: true, minGapMs: 0 });
  rerenderEditor(state);
  try { syncEditorDensityChrome(state); } catch {}
  try { syncStageNav(state); } catch {}
  // Auto-frame only when the saved camera clearly misses board content.
  try { maybeAutoFrameViewportOnOpen(state); } catch {}
  try { syncModeHud(state); } catch {}
  void refreshCanvasResourceDisplaySources(state);
  return buildEditorApi(state);
}

function createEditorState(options) {
  const projects = Array.isArray(options.projects) ? options.projects : [];
  const project = normalizeCanvasProject(options.project || null);
  const projectIndex = project ? projects.findIndex(entry => entry?.id === project.id) : -1;
  if (project) {
    ensureCanvasProjectTimeline(project);
  }

  return {
    root: null,
    stage: null,
    viewportElement: null,
    edgeLayer: null,
    nodeLayer: null,
    selectionBox: null,
    statusLabel: null,
    titleLabel: null,
    contextMenu: null,
    contextMenuSection: null,
    contextMenuSections: [],
    contextMenuSubmenus: [],
    sidebarForm: null,
    emptyInspector: null,
    dropOverlayEl: null,
    scaleLabel: null,
    backgroundSelect: null,
    sidebarTabs: [],
    sidebarPanels: [],
    inspectorTab: null,
    activeSidebarTab: 'actions',
    nodeSearchFilter: 'all',
    nodeSearchQuery: '',
    timelineLayer: null,
    timelineScroller: null,
    timelineInfo: null,
    playheadLabel: null,
    playbackButton: null,
    playbackRateReadout: null,
    playbackRateSelect: null,
    miniMap: null,
    playbackFrameId: null,
    playbackLastTickMs: 0,
    modalOverlay: null,
    previewActive: false,
    previewViewport: null,
    projects,
    project,
    projectIndex,
    selectedNodeIds: [],
    selectedEdgeId: '',
    focusFlashNodeId: '',
    focusFlashUntil: 0,
    resultToastTimer: null,
    resultToastNodeId: '',
    statusSource: '',
    shortcutsOpen: false,
    onboardingDismissed: false,
    stageCoachDismissed: false,
    clipboardNodes: [],
    clipboardEdges: [],
    clipboardSeedIds: [],
    interactionMode: 'pan',
    spacePanActive: false,
    viewportHistory: [],
    viewportHistoryIndex: -1,
    _viewportHistorySuspended: false,
    _viewportHistoryLastPushAt: 0,
    _renderStats: {
      total: 0,
      fullChrome: 0,
      lightChrome: 0
    },
    _gestureStats: { panStarts: 0, panEnds: 0, panFrames: 0, boxStarts: 0, lastPanDeltaX: 0, lastPanDeltaY: 0 },
    timelineCollapsed: project?.viewPrefs?.timelineCollapsed !== false,
    miniMapOpen: project?.viewPrefs?.miniMapOpen === true,
    sidebarCollapsed: project?.viewPrefs?.sidebarCollapsed === true,
    focusMode: project?.viewPrefs?.focusMode === true,
    _focusModeRestore: null,
    viewport: {
      x: Number.isFinite(project?.viewport?.x) ? project.viewport.x : 0,
      y: Number.isFinite(project?.viewport?.y) ? project.viewport.y : 0,
      scale: Number.isFinite(project?.viewport?.scale) && project.viewport.scale > 0 ? project.viewport.scale : 1
    },
    dragState: null,
    resizeState: null,
    rotateState: null,
    runBannerDismissed: false,
    activeRunNodeId: '',
    snapGuides: [],
    connectState: null,
    clickConnectFromId: '',
    clickConnectFromSide: '',
    panState: null,
    boxState: null,
    timelineDragState: null,
    contextMenuPoint: { x: 120, y: 120 },
    resourceStore: options.resourceStore || getCanvasResourceStore(),
    resourceDisplaySources: new Map(),
    resourceDisplayToken: 0,
    assetStore: null,
    onBack: typeof options.onBack === 'function' ? options.onBack : null,
    onProjectChange: typeof options.onProjectChange === 'function' ? options.onProjectChange : null,
    bridge: options.bridge || globalThis.CanvasBridge,
    agentBridge: options.agentBridge || globalThis.AgentBridge,
    assistantApi: null,
    imageQuickTools: loadImageQuickTools(),
    undoStack: [],
    redoStack: [],
    applyingHistory: false,
    _persistTimer: null,
    _persistDirty: false,
    _persistPending: false,
    _persistScheduleCount: 0,
    _persistFlushCount: 0,
    _persistLastFlushAt: 0
  };
}

function revokeCanvasResourceDisplaySources(state) {
  for (const display of state?.resourceDisplaySources?.values?.() || []) {
    try { display.revoke?.(); } catch {}
  }
  if (state) state.resourceDisplaySources = new Map();
}

function scheduleCanvasResourceGarbageCollection(state) {
  if (!state?.resourceStore?.list || !state.resourceStore.delete) return Promise.resolve(null);
  const task = () => garbageCollectCanvasResources(state.resourceStore, [
    ...(Array.isArray(state.projects) ? state.projects : []),
    ...(Array.isArray(state.undoStack) ? state.undoStack : []),
    ...(Array.isArray(state.redoStack) ? state.redoStack : [])
  ]).catch(error => {
    console.warn('canvas resource cleanup failed:', error);
    return null;
  });
  state._resourceGcPromise = (state._resourceGcPromise || Promise.resolve()).then(task);
  return state._resourceGcPromise;
}

async function refreshCanvasResourceDisplaySources(state) {
  if (!state || state.destroyed || !state.resourceStore?.get) return;
  const token = (state.resourceDisplayToken || 0) + 1;
  state.resourceDisplayToken = token;
  const nodes = Object.values(state.project?.nodes || {})
    .filter(node => node?.type === 'media' && node.resourceId);
  const resourceDisplays = new Map();
  const resourcePromises = new Map();
  await Promise.all(nodes.map(async node => {
    const resourceId = String(node.resourceId || '');
    if (!resourceId) return;
    let displayPromise = resourcePromises.get(resourceId);
    if (!displayPromise) {
      displayPromise = state.resourceStore.get(resourceId)
        .then(record => record ? getCanvasResourceDisplaySource(record, { store: state.resourceStore }) : null)
        .catch(() => null);
      resourcePromises.set(resourceId, displayPromise);
    }
    const display = await displayPromise;
    if (display?.src) resourceDisplays.set(resourceId, display);
  }));
  if (state.destroyed || state.resourceDisplayToken !== token) {
    for (const display of resourceDisplays.values()) {
      try { display.revoke?.(); } catch {}
    }
    return;
  }

  const next = new Map();
  nodes.forEach(node => {
    const display = resourceDisplays.get(String(node.resourceId || ''));
    if (display) next.set(node.id, display);
  });
  const previous = state.resourceDisplaySources || new Map();
  const displaySourcesChanged = previous.size !== next.size
    || [...next].some(([nodeId, display]) => previous.get(nodeId) !== display);
  if (!displaySourcesChanged) return;
  for (const [nodeId, display] of previous) {
    if (next.get(nodeId) !== display) {
      try { display.revoke?.(); } catch {}
    }
  }
  state.resourceDisplaySources = next;
  if (!state.destroyed) rerenderEditor(state, { skipPersist: true, forceFull: true });
}

function renderEditorShell(root) {
  root.innerHTML = `
    <section class="canvas-workspace" aria-label="无限画布编辑器">
      <aside class="canvas-project-shell canvas-project-shell--editor">
        <div class="canvas-project-header">
          <strong data-role="project-title">画布项目</strong>
          <div class="canvas-project-header-actions">
            <button type="button" class="canvas-sidebar-toggle canvas-prompt-library-btn" data-action="prompt-library" title="打开提示词库"><i data-lucide="library" aria-hidden="true"></i><span>提示词库</span></button>
            <button type="button" class="canvas-sidebar-toggle" data-action="toggle-sidebar" data-role="toggle-sidebar-btn" title="折叠侧栏 (B)" aria-pressed="false">折叠侧栏</button>
            <button type="button" class="canvas-close-btn" data-action="back">返回</button>
          </div>
        </div>
        <p class="canvas-project-copy canvas-project-copy--editor">空白左拖平移 · Ctrl/Cmd 拖动框选 · 滚轮缩放。双击空白创建节点；B 折叠侧栏；G 生成。</p>
        <div class="canvas-workspace-stacked">
          <div class="canvas-workspace-tabs" role="tablist" aria-label="编辑侧栏">
            <button type="button" class="canvas-workspace-tab is-active" role="tab" aria-selected="true" data-action="switch-sidebar-tab" data-tab="actions" title="导入 / 添加 / 查找">画布操作</button>
            <button type="button" class="canvas-workspace-tab" role="tab" aria-selected="false" data-action="switch-sidebar-tab" data-tab="inspector" data-role="inspector-tab" data-has-selection="false" title="选中节点后的属性与批量编辑 (Enter)">
              <span data-role="inspector-tab-label">节点设置</span>
              <span class="canvas-inspector-tab-badge" data-role="inspector-tab-badge" hidden></span>
            </button>
          </div>
          <div class="canvas-workspace-panel">
            <div class="canvas-workspace-panel-shell" data-role="sidebar-panel" data-tab-panel="actions">
              <div class="canvas-action-panel canvas-action-panel-inline" data-role="action-panel">
                <span class="canvas-editor-kicker">画布操作</span>
                <div class="canvas-context-card" data-role="context-card">
                  <div class="canvas-context-card-head">
                    <strong data-role="context-title">未选中节点</strong>
                    <span data-role="context-meta">可框选/ 点击节点</span>
                  </div>
                  <p data-role="context-hint">从下方导入素材，或点「一键起步」生成参考→编排→结果图</p>
                  <div class="canvas-context-actions" data-role="context-actions"></div>
                </div>
                <div class="canvas-action-guide" data-role="action-guide" data-section="guide">
                  <h3>3 步上手</h3>
                  <ol class="canvas-action-steps" data-role="action-steps">
                  <li><strong>1. 导入</strong><span>本地上传 / Studio 导入 / 拖拽粘贴</span></li>
                  <li><strong>2. 接线</strong><span>智能接线自动连参考→编排 →结果</span></li>
                  <li><strong>3. 生成</strong><span>选中编排节点后按 G 或点执行生成</span></li>
                </ol>
                </div>
                <div class="canvas-action-section" data-section="import" data-role="action-section-import">
                  <div class="canvas-action-section-head">
                    <h3>导入素材</h3>
                    <span data-role="section-import-meta">最快入口</span>
                  </div>
                  <div class="canvas-action-list canvas-action-list-primary">
                    <button type="button" class="canvas-action-btn is-emphasis" data-action="upload-local-images">本地上传</button>
                    <button type="button" class="canvas-action-btn is-emphasis" data-action="import-media">Studio 导入</button>
                    <button type="button" class="canvas-action-btn" data-action="fill-sample-from-history">示例历史</button>
                    <button type="button" class="canvas-action-btn" data-action="start-quick-workflow">一键起步</button>
                  </div>
                </div>
                <div class="canvas-action-section" data-section="execute" data-role="action-section-execute">
                  <div class="canvas-action-section-head">
                    <h3>编排执行</h3>
                    <span data-role="section-execute-meta">选中后可用</span>
                  </div>
                  <div class="canvas-action-list canvas-action-list-primary">
                    <button type="button" class="canvas-action-btn" data-action="smart-wire-selected">智能接线</button>
                    <button type="button" class="canvas-action-btn is-primary-action" data-action="generate-selected">执行生成</button>
                    <button type="button" class="canvas-action-btn" data-action="tidy-selected">网格整理</button>
                    <button type="button" class="canvas-action-btn" data-action="fit-view">适配全部</button>
                  </div>
                </div>
                <p class="canvas-action-hint" data-role="action-hint">提示：拖图到画布中央，或 Ctrl+V 粘贴；多选后可批量设角色/尺寸/标题。</p>
                <div class="canvas-action-section" data-section="add" data-role="action-section-add">
                  <div class="canvas-action-section-head">
                    <h3>添加节点</h3>
                    <span data-role="section-add-meta">常用</span>
                  </div>
                  <div class="canvas-action-list canvas-action-list-primary">
                    <button type="button" class="canvas-action-btn" data-action="new-config" title="编排节点（生成规则）">编排节点（生成规则）</button>
                    <button type="button" class="canvas-action-btn" data-action="new-media">图片节点</button>
                    <button type="button" class="canvas-action-btn" data-action="new-text">文本节点</button>
                    <button type="button" class="canvas-action-btn" data-action="new-note">便签</button>
                  </div>
                </div>
                <details class="canvas-action-more" data-section="more-nodes" data-role="action-more-nodes">
                  <summary>更多节点</summary>
                  <div class="canvas-action-list">
                    <button type="button" class="canvas-action-btn" data-action="new-audio">音频</button>
                    <button type="button" class="canvas-action-btn" data-action="new-subtitle">字幕</button>
                    <button type="button" class="canvas-action-btn" data-action="new-loop">循环节点</button>
                    <button type="button" class="canvas-action-btn" data-action="new-llm">智能文本</button>
                  </div>
                </details>
                <div class="canvas-action-section" data-section="search" data-role="action-section-search">
                  <div class="canvas-action-section-head">
                    <h3>查找节点</h3>
                    <span>/</span>
                  </div>
                  <label class="canvas-node-search">
                  <span class="canvas-sr-only">查找节点</span>
                  <input type="search" data-role="node-search" placeholder="标题 / 角色 / 类型 / 锁定 / 生成中" autocomplete="off" />
                </label>
                  <div class="canvas-node-search-filters" data-role="node-search-filters" aria-label="节点筛选">
                  <button type="button" class="is-active" data-search-filter="all" aria-pressed="true">全部</button>
                  <button type="button" data-search-filter="media" aria-pressed="false">媒体</button>
                  <button type="button" data-search-filter="config" aria-pressed="false">编排</button>
                  <button type="button" data-search-filter="text" aria-pressed="false">文本</button>
                  <button type="button" data-search-filter="group" aria-pressed="false">分组</button>
                  <button type="button" data-search-filter="locked" aria-pressed="false">锁定</button>
                  <button type="button" data-search-filter="running" aria-pressed="false">生成中</button>
                  <button type="button" data-search-filter="error" aria-pressed="false">异常</button>
                </div>
                  <div class="canvas-node-search-results" data-role="node-search-results" hidden></div>
                </div>
                <div class="canvas-action-section canvas-action-section-view" data-section="view" data-role="action-section-view">
                  <div class="canvas-action-section-head">
                    <h3>视图</h3>
                    <span>常用</span>
                  </div>
                  <div class="canvas-action-icon-strip" aria-label="画布快捷工具">
                  <button type="button" class="canvas-action-icon-btn" data-action="fit-view" aria-label="适配全部" title="适配全部"><span aria-hidden="true">⛶</span></button>
                  <button type="button" class="canvas-action-icon-btn" data-action="toggle-minimap" aria-label="切换小地图" title="切换小地图"><span aria-hidden="true">▦</span></button>
                  <button type="button" class="canvas-action-icon-btn" data-action="undo" aria-label="撤销" title="撤销"><span aria-hidden="true">→</span></button>
                  <button type="button" class="canvas-action-icon-btn" data-action="redo" aria-label="重做" title="重做"><span aria-hidden="true">→</span></button>
                </div>
                </div>
                <details class="canvas-action-more" data-section="selected-ops" data-role="selected-ops">
                  <summary data-role="selected-ops-summary">已选操作</summary>
                  <div class="canvas-action-list">
                    <button type="button" class="canvas-action-btn" data-action="connect-selected">连接</button>
                    <button type="button" class="canvas-action-btn" data-action="replace-sample-reference">替换历史图</button>
                    <button type="button" class="canvas-action-btn" data-action="align-left">左对齐</button>
                    <button type="button" class="canvas-action-btn" data-action="align-center-h">水平居中</button>
                    <button type="button" class="canvas-action-btn" data-action="align-right">右对齐</button>
                    <button type="button" class="canvas-action-btn" data-action="align-top">顶对齐</button>
                    <button type="button" class="canvas-action-btn" data-action="align-center-v">垂直居中</button>
                    <button type="button" class="canvas-action-btn" data-action="align-bottom">底对齐</button>
                    <button type="button" class="canvas-action-btn" data-action="distribute-h">水平均分</button>
                    <button type="button" class="canvas-action-btn" data-action="distribute-v">垂直分布</button>
                    <button type="button" class="canvas-action-btn" data-action="duplicate-selected">复制</button>
                    <button type="button" class="canvas-action-btn" data-action="group-selected">分组</button>
                    <button type="button" class="canvas-action-btn" data-action="select-group-members">选中组成员</button>
                    <button type="button" class="canvas-action-btn" data-action="ungroup-selected">解散分组</button>
                    <button type="button" class="canvas-action-btn" data-action="toggle-lock-selected">锁定/解锁</button>
                    <button type="button" class="canvas-action-btn" data-action="bring-forward-selected">上移</button>
                    <button type="button" class="canvas-action-btn" data-action="send-backward-selected">下移</button>
                    <button type="button" class="canvas-action-btn" data-action="add-selected-to-timeline">加入时间轴</button>
                    <button type="button" class="canvas-action-btn canvas-action-btn-danger" data-action="delete-selected">删除</button>
                  </div>
                </details>
              </div>
            </div>
            <div class="canvas-workspace-panel-shell" data-role="sidebar-panel" data-tab-panel="inspector" data-canvas-no-zoom hidden>
              <div class="canvas-inspector-panel canvas-inspector-panel-inline">
                <span class="canvas-editor-kicker">属性</span>
                <h3>节点设置</h3>
                <div class="canvas-inspector-empty" data-role="inspector-empty">
                  <strong>未选中节点</strong>
                  <p>单击节点自动打开此面板；双击可聚焦标题。也可框选多个节点做批量操作。</p>
                  <div class="canvas-inspector-empty-actions">
                    <button type="button" class="canvas-action-btn" data-action="focus-node-search">查找节点 /</button>
                    <button type="button" class="canvas-action-btn" data-action="upload-local-images">本地上传</button>
                    <button type="button" class="canvas-action-btn" data-action="new-config" title="编排节点（生成规则）">添加编排（生成规则）</button>
                  </div>
                </div>
                <form class="canvas-inspector-form" data-role="node-form" data-canvas-no-zoom hidden>
                  <div class="canvas-inspector-summary" data-role="inspector-summary">
                    <div class="canvas-inspector-summary-main">
                      <div class="canvas-inspector-type" data-role="inspector-type" hidden>节点</div>
                      <strong data-role="inspector-summary-title">未命名</strong>
                      <span data-role="inspector-summary-meta"></span>
                    </div>
                    <div class="canvas-inspector-quick-actions" data-role="inspector-quick-actions">
                      <button type="button" data-action="focus-selected" title="定位所选">定位</button>
                      <button type="button" data-action="select-connected" title="选中相连节点">相连</button>
                      <button type="button" data-action="duplicate-selected" title="复制所选">复制</button>
                      <button type="button" data-action="generate-selected" data-quick="generate" title="执行生成">生成</button>
                    </div>
                  </div>
                  <div class="canvas-inspector-primary">
                    <div class="canvas-inspector-kicker">基础信息</div>
                    <label><span>标题</span><input type="text" name="title" autocomplete="off" /></label>
                    <label><span>正文</span><textarea name="text" rows="3"></textarea></label>
                    <label><span>编排内容</span><textarea name="composerContent" rows="5" placeholder="可写提示词，也可使用 @[node:11ID] 引用其他节点"></textarea></label>
                    <div class="canvas-inspector-row">
                      <label><span>节点角色</span>
                        <select name="canvasRole">
                          <option value="">普通</option>
                          <option value="reference">历史图 / 参考输入</option>
                          <option value="target">结果图/ 输出</option>
                          <option value="reference-prompt">参考提示词</option>
                        </select>
                      </label>
                      <label><span>媒体类型</span>
                        <select name="kind">
                          <option value="image">图片</option>
                          <option value="video">视频</option>
                          <option value="audio">音频</option>
                          <option value="subtitle">字幕</option>
                        </select>
                      </label>
                    </div>
                  </div>
                  <details class="canvas-inspector-advanced">
                    <summary>生成参数<span>模型 / 比例 / 张数</span></summary>
                    <div class="canvas-inspector-advanced-body">
                      <label><span>结果节点 ID</span><input type="text" name="targetNodeId" placeholder="为空则自动创建结果节点" /></label>
                      <label><span>模型</span><input type="text" name="model" placeholder="为空时使用当前默认模型" /></label>
                      <div class="canvas-inspector-row">
                        <label><span>比例</span><input type="text" name="aspect" placeholder="如 1:1 / 16:9" /></label>
                        <label><span>清晰度</span><input type="text" name="resolution" placeholder="如 1024 / 720P" /></label>
                      </div>
                      <div class="canvas-inspector-row">
                        <label><span>质量</span><input type="text" name="quality" placeholder="auto / high / hd" /></label>
                        <label><span>张数</span><input type="number" name="count" min="1" max="10" step="1" /></label>
                      </div>
                    </div>
                  </details>
                  <details class="canvas-inspector-advanced">
                    <summary>位置尺寸<span>坐标 / 宽高 / 旋转</span></summary>
                    <div class="canvas-inspector-advanced-body">
                      <div class="canvas-inspector-row">
                        <label><span>X</span><input type="number" name="x" step="1" /></label>
                        <label><span>Y</span><input type="number" name="y" step="1" /></label>
                      </div>
                      <div class="canvas-inspector-row">
                        <label><span>宽度</span><input type="number" name="width" step="1" min="80" /></label>
                        <label><span>高度</span><input type="number" name="height" step="1" min="60" /></label>
                      </div>
                      <div class="canvas-inspector-row">
                        <label><span>旋转</span><input type="number" name="rotation" step="1" /></label>
                      </div>
                    </div>
                  </details>
                  <label><span>所在轨道</span>
                    <select name="trackId">
                      <option value="track-video">视频轨</option>
                      <option value="track-audio">音频轨</option>
                      <option value="track-subtitle">字幕轨</option>
                    </select>
                  </label>
                  <div class="canvas-inspector-row">
                    <label><span>时长(秒)</span><input type="number" name="durationSeconds" step="0.5" min="0.5" /></label>
                    <label><span>开始(秒)</span><input type="number" name="timelineStartSeconds" step="0.5" min="0" /></label>
                  </div>
                  <div class="canvas-inspector-row">
                    <label><span>裁入(秒)</span><input type="number" name="trimInSeconds" step="0.5" min="0" /></label>
                    <label><span>片段时长(秒)</span><input type="number" name="clipDurationSeconds" step="0.5" min="0.5" /></label>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </aside>
      <div class="canvas-editor-shell">
        <div class="canvas-editor-main">
          <section class="canvas-editor" aria-label="画布编辑器">
            <div class="canvas-editor-toolbar">
              <div class="canvas-tool-group" role="group" aria-label="交互工具">
                <button type="button" data-tool="select" title="选择 / 框选 (V)">选择</button>
                <button type="button" data-tool="connect" title="点击连线 (C)：先点源节点，再点目标节点">连线</button>
                <button type="button" class="is-active" data-tool="pan" title="平移画布 (H / 按住空格)">平移</button>
              </div>
              <div class="canvas-tool-group" role="group" aria-label="缩放" data-toolbar-tier="nav-dup" title="缩放/适配也可在右下导航使用">
                <button type="button" data-action="zoom-out" title="缩小">-</button>
                <button type="button" class="canvas-zoom-chip" data-role="zoom-level" data-action="cycle-zoom" title="点击切换 50% / 100% / 150%，右键重置">100%</button>
                <button type="button" data-action="zoom-in" title="放大">+</button>
                <button type="button" data-action="fit-view" title="适配全部 (Shift+1)">适配</button>
                <button type="button" data-action="fit-selection" data-toolbar-tier="secondary" title="适配所选(Shift+2)">所选</button>
              </div>
              <div class="canvas-tool-group" role="group" aria-label="面板">
                <button type="button" data-action="toggle-minimap" data-role="toggle-minimap-btn" data-toolbar-tier="secondary" title="小地图 (M)" aria-pressed="false">小地图</button>
                <button type="button" data-action="toggle-timeline" data-role="toggle-timeline-btn" title="折叠/展开时间轴(T)" aria-pressed="true">时间轴</button>
                <button type="button" data-action="toggle-sidebar" data-role="toggle-sidebar-btn" title="切换侧栏 (B)" aria-pressed="false">侧栏</button>
                <button type="button" data-action="toggle-focus-mode" data-role="toggle-focus-mode-btn" title="专注模式 (\\)：折叠侧栏/时间轴，专注画布" aria-pressed="false">专注</button>
                <button type="button" data-action="toggle-shortcuts" data-toolbar-tier="secondary" title="快捷键帮助(? / F1)">?</button>
                <button type="button" data-action="toggle-canvas-assistant" title="画布助手" aria-pressed="false">助手</button>
              </div>
              <div class="canvas-tool-group" role="group" aria-label="编辑">
                <button type="button" data-action="undo" title="撤销 (Ctrl+Z)">撤销</button>
                <button type="button" data-action="redo" data-toolbar-tier="secondary" title="重做 (Ctrl+Y)">重做</button>
                <button type="button" data-action="reset-view" data-toolbar-tier="secondary" title="重置视图">重置</button>
              </div>
              <label class="canvas-toolbar-field" data-toolbar-tier="secondary">
                <span>网格</span>
                <select data-role="background-mode">
                  <option value="lines">线条</option>
                  <option value="dots">点阵</option>
                </select>
              </label>
              <span class="canvas-editor-hint" data-role="interaction-hint">平移：拖动画布 · 滚轮缩放 · Shift+滚轮平移 · V 回选择</span>
              <span class="canvas-editor-status" data-role="status">平移模式</span>
            </div>
            <div class="canvas-editor-stage" data-role="stage">
              <button type="button" class="canvas-sidebar-reopen" data-action="toggle-sidebar" data-role="sidebar-reopen" title="展开侧栏 (B)" hidden>侧栏</button>
              <div class="canvas-editor-viewport" data-role="viewport">
                <svg class="canvas-editor-edge-layer" data-role="edge-layer" aria-hidden="true"></svg>
                <div class="canvas-editor-node-layer" data-role="node-layer"></div>
              </div>
              <div class="canvas-selection-box" data-role="selection-box" hidden></div>
              <div class="canvas-selection-bounds" data-role="selection-bounds" hidden></div>
              <div class="canvas-snap-guides" data-role="snap-guides" hidden></div>
              <div class="canvas-mini-map" data-role="mini-map" hidden></div>
              <aside class="canvas-assistant-panel" data-role="canvas-assistant" data-canvas-no-zoom hidden aria-label="画布助手">
                <div class="canvas-assistant-head">
                  <strong>画布助手</strong>
                  <div>
                    <button type="button" data-action="canvas-assistant-new" title="新建会话">+</button>
                    <button type="button" data-action="canvas-assistant-delete" title="删除当前会话">删除</button>
                    <button type="button" data-action="toggle-canvas-assistant" title="收起助手">×</button>
                  </div>
                </div>
                <label class="canvas-assistant-session-label"><span>会话</span><select data-role="canvas-assistant-session"></select></label>
                <div class="canvas-assistant-messages" data-role="canvas-assistant-messages"></div>
                <div class="canvas-assistant-compose">
                  <select data-role="canvas-assistant-prompt-library" aria-label="提示词库"><option value="">提示词库</option></select>
                  <textarea rows="3" data-role="canvas-assistant-input" placeholder="围绕选中节点继续创作，Enter 发送"></textarea>
                  <div class="canvas-assistant-actions">
                    <span data-role="canvas-assistant-status">就绪</span>
                    <button type="button" data-action="canvas-assistant-generate-image" title="按输入内容生成图片">生图</button>
                    <button type="button" data-action="canvas-assistant-generate-video" title="按输入内容生成视频">视频</button>
                    <button type="button" data-action="canvas-assistant-stop" hidden>中止</button>
                    <button type="button" data-action="canvas-assistant-send">发送</button>
                  </div>
                </div>
              </aside>
              <div class="canvas-stage-nav" data-role="stage-nav" data-canvas-no-zoom>
                <div class="canvas-stage-nav-meta" data-role="stage-nav-meta" title="画布导航">导航</div>
                <div class="canvas-stage-nav-actions" role="group" aria-label="舞台导航">
                  <button type="button" data-action="viewport-back" data-role="viewport-back" title="上一个视角 (Alt+←)" aria-label="上一个视角">←</button>
                  <button type="button" data-action="viewport-forward" data-role="viewport-forward" title="下一个视角 (Alt+→)" aria-label="下一个视角">→</button>
                  <button type="button" data-action="zoom-out" title="缩小">-</button>
                  <button type="button" class="canvas-stage-nav-zoom" data-role="stage-nav-zoom" data-action="cycle-zoom" title="点击切换 50% / 100% / 150%，右键重置">100%</button>
                  <button type="button" data-action="zoom-in" title="放大">+</button>
                  <button type="button" data-action="fit-view" title="适配全部 (Shift+1 / F)">适配</button>
                  <button type="button" data-action="fit-selection" title="适配所选(Shift+2 / F)">所选</button>
                  <button type="button" data-action="reset-view" title="重置视图到原点100%">重置</button>
                  <button type="button" data-action="toggle-minimap" data-role="stage-nav-minimap" title="小地图 (M)" aria-pressed="false">图</button>
                </div>
              </div>
              <div class="canvas-drop-overlay" data-role="drop-overlay" hidden>
                <div class="canvas-drop-overlay-card">
                  <strong>释放以导入图片</strong>
                  <span>支持多张图片，将按网格落点避免重叠</span>
                </div>
              </div>
              <div class="canvas-stage-coach" data-role="stage-coach" data-canvas-no-zoom hidden data-step="">
                <div class="canvas-stage-coach-copy">
                  <strong data-role="stage-coach-title">一键起步</strong>
                  <span data-role="stage-coach-detail">继续完善画布工作流</span>
                </div>
                <div class="canvas-stage-coach-actions" data-role="stage-coach-actions"></div>
                <button type="button" class="canvas-stage-coach-dismiss" data-action="dismiss-stage-coach" data-role="stage-coach-dismiss" title="暂时隐藏下一步提示" aria-label="关闭下一步提示">×</button>
              </div>
              <div class="canvas-empty-stage" data-role="empty-stage" hidden>
                <div class="canvas-empty-stage-card">
                  <div class="canvas-empty-stage-kicker">空画布</div>
                  <strong>3 步开始编排</strong>
                  <p>推荐先「一键起步」，或从 Studio 勾选历史输出图导入。导入后可自动接线，再按 <kbd>G</kbd> 生成；成功会高亮结果节点。</p>
                  <ol class="canvas-empty-stage-steps">
                    <li>放图：一键起步/ 本地上传 / Studio 勾选导入</li>
                    <li>接线：智能接线整理 参考图 → 编排 → 结果图</li>
                    <li>生成：选中编排节点后按 <kbd>G</kbd>，看结果高亮</li>
                  </ol>
                  <div class="canvas-empty-stage-actions" data-role="empty-stage-primary">
                    <button type="button" class="is-primary" data-action="start-quick-workflow">一键起步</button>
                    <button type="button" data-action="upload-local-images">本地上传</button>
                    <button type="button" data-action="import-media">Studio 导入</button>
                  </div>
                  <details class="canvas-empty-stage-more" data-role="empty-stage-more">
                    <summary>更多入口</summary>
                    <div class="canvas-empty-stage-actions is-secondary">
                      <button type="button" data-action="fill-sample-from-history">示例填入历史</button>
                      <button type="button" data-action="new-config" title="编排节点（生成规则）">添加编排节点（生成规则）</button>
                      <button type="button" data-action="new-note">添加便签</button>
                      <button type="button" data-action="focus-node-search">查找节点 /</button>
                    </div>
                  </details>
                  <p class="canvas-empty-stage-tip">提示：空白左拖平移 · <kbd>Ctrl/Cmd</kbd> 拖动框选 · 滚轮缩放 · 双击空白创建节点 · 拖图/<kbd>Ctrl</kbd>+<kbd>V</kbd> 可放入图片</p>
                </div>
              </div>
              <div class="canvas-stage-search" data-role="stage-search" data-canvas-no-zoom hidden>
                <div class="canvas-stage-search-card">
                  <div class="canvas-stage-search-head">
                    <strong>查找节点</strong>
                    <span>/</span>
                    <button type="button" class="canvas-stage-search-close" data-action="close-stage-search" aria-label="关闭查找">关闭</button>
                  </div>
                  <label class="canvas-stage-search-input">
                    <span class="canvas-sr-only">舞台查找节点</span>
                    <input type="search" data-role="stage-search-input" placeholder="标题 / 角色 / 类型 / 锁定 / 生成中 / 异常" autocomplete="off" />
                  </label>
                  <div class="canvas-stage-search-filters" data-role="stage-search-filters" aria-label="舞台查找筛选">
                    <button type="button" class="is-active" data-search-filter="all" aria-pressed="true">全部</button>
                    <button type="button" data-search-filter="media" aria-pressed="false">媒体</button>
                    <button type="button" data-search-filter="config" aria-pressed="false">编排</button>
                    <button type="button" data-search-filter="text" aria-pressed="false">文本</button>
                    <button type="button" data-search-filter="group" aria-pressed="false">分组</button>
                    <button type="button" data-search-filter="locked" aria-pressed="false">锁定</button>
                    <button type="button" data-search-filter="running" aria-pressed="false">生成中</button>
                    <button type="button" data-search-filter="error" aria-pressed="false">异常</button>
                  </div>
                  <div class="canvas-stage-search-results" data-role="stage-search-results" hidden></div>
                  <p class="canvas-stage-search-tip">↑↓ 选择 · Enter 定位 · Esc 关闭 · 侧栏折叠时也能查找</p>
                </div>
              </div>
              <div class="canvas-connect-tip" data-role="connect-tip" data-canvas-no-zoom hidden>
                <div class="canvas-connect-tip-copy">
                  <strong data-role="connect-tip-title">连线模式</strong>
                  <span data-role="connect-tip-detail">先点源节点，再点目标节点</span>
                </div>
                <div class="canvas-connect-tip-actions">
                  <button type="button" data-action="cancel-connect-mode" data-role="connect-tip-cancel">退出(Esc/V)</button>
                </div>
              </div>
              <div class="canvas-mode-hud" data-role="mode-hud" data-canvas-no-zoom data-mode="pan" data-focus="0" data-has-selection="0">
                <div class="canvas-mode-hud-main">
                  <span class="canvas-mode-hud-pill" data-role="mode-hud-mode">平移</span>
                  <strong data-role="mode-hud-title">平移模式</strong>
                  <span class="canvas-mode-hud-meta" data-role="mode-hud-meta">拖动画布 · 滚轮缩放 · V 回选择</span>
                </div>
                <div class="canvas-mode-hud-flags" data-role="mode-hud-flags" hidden></div>
                <div class="canvas-mode-hud-actions" data-role="mode-hud-actions"></div>
              </div>
              <div class="canvas-result-toast" data-role="result-toast" data-canvas-no-zoom hidden data-has-result="0">
                <div class="canvas-result-toast-copy">
                  <strong data-role="result-toast-title">生成完成</strong>
                  <span data-role="result-toast-detail">结果已回写</span>
                </div>
                <div class="canvas-result-toast-actions">
                  <button type="button" data-action="focus-result-toast" data-role="result-toast-focus">看结果</button>
                  <button type="button" data-action="use-result-as-reference" data-role="result-toast-as-ref" title="把结果设为参考图，方便继续迭代">作参考</button>
                  <button type="button" data-action="continue-from-result" data-role="result-toast-continue" title="选中结果并打开设置，继续改图">继续改</button>
                  <button type="button" data-action="retry-generation" data-role="result-toast-retry" title="用原编排再生成一次">再生成</button>
                  <button type="button" data-action="dismiss-result-toast" data-role="result-toast-dismiss" aria-label="关闭结果提示">关闭</button>
                </div>
              </div>
              <div class="canvas-run-banner" data-role="run-banner" data-canvas-no-zoom hidden data-tone="">
                <div class="canvas-run-banner-main">
                  <span class="canvas-run-banner-dot" aria-hidden="true"></span>
                  <div class="canvas-run-banner-copy">
                    <strong data-role="run-banner-title">生成中</strong>
                    <span data-role="run-banner-detail">正在执行画布生成</span>
                    <small data-role="run-banner-hint" hidden></small>
                  </div>
                </div>
                <div class="canvas-run-banner-actions">
                  <button type="button" data-action="retry-generation" data-role="run-banner-retry" title="重新执行生成" hidden>重试</button>
                  <button type="button" data-action="open-inspector" data-role="run-banner-edit" title="打开编排设置，修改提示词" hidden>改提示词</button>
                  <button type="button" data-action="smart-wire-selected" data-role="run-banner-wire" title="智能接线检查参考/结果" hidden>检查接线</button>
                  <button type="button" data-action="focus-result-node" data-role="run-banner-result" title="定位到结果节点" hidden>看结果</button>
                  <button type="button" data-action="focus-running-node" data-role="run-banner-focus" title="定位到相关节点">定位</button>
                  <button type="button" data-action="dismiss-run-banner" title="关闭提示">✕</button>
                </div>
              </div>
              <div class="canvas-selection-toolbar" data-role="selection-toolbar" data-canvas-no-zoom hidden>
                <div class="canvas-selection-toolbar-meta">
                  <strong data-role="selection-count">已选0</strong>
                  <span data-role="selection-hint">批量操作</span>
                </div>
                <div class="canvas-selection-toolbar-actions">
                  <div class="canvas-selection-toolbar-row" data-row="primary">
                    <button type="button" data-action="smart-wire-selected" data-toolbar="wire" title="智能接线">接线</button>
                    <button type="button" data-action="connect-selected" data-toolbar="connect" title="按选择顺序链式连接">连接</button>
                    <button type="button" data-action="generate-selected" data-toolbar="generate" title="执行生成 (G)">生成</button>
                    <button type="button" data-action="tidy-selected" data-toolbar="tidy" title="网格整理所选">整理</button>
                    <button type="button" data-action="match-size-selected" data-toolbar="size" title="统一为第一个选中节点的尺寸">同尺寸</button>
                    <button type="button" data-action="cycle-role-selected" data-toolbar="role" title="批量轮换角色 (R)">角色</button>
                    <button type="button" data-action="group-selected" data-toolbar="group" title="分组所选 (Ctrl+G)">分组</button>
                    <button type="button" data-action="duplicate-selected" data-toolbar="duplicate" title="复制所选">复制</button>
                    <button type="button" data-action="fit-selection" data-toolbar="fit" title="适配所选(Shift+2)">适配</button>
                    <button type="button" class="is-danger" data-action="delete-selected" data-toolbar="delete" title="删除所选">删除</button>
                  </div>
                  <div class="canvas-selection-toolbar-row" data-row="align" data-toolbar-group="align">
                    <span class="canvas-selection-toolbar-row-label" data-role="align-row-label">对齐</span>
                    <button type="button" data-action="align-left" title="左对齐">左齐</button>
                    <button type="button" data-action="align-center-h" title="水平居中">水平居中</button>
                    <button type="button" data-action="align-right" title="右对齐">右齐</button>
                    <button type="button" data-action="align-top" title="顶对齐">顶齐</button>
                    <button type="button" data-action="align-center-v" title="垂直居中">居中</button>
                    <button type="button" data-action="align-bottom" title="底对齐">底齐</button>
                    <button type="button" data-action="distribute-h" title="水平均分">均分H</button>
                    <button type="button" data-action="distribute-v" title="垂直分布">均分V</button>
                  </div>
                  <div class="canvas-selection-toolbar-row" data-row="secondary" data-toolbar-group="secondary">
                    <button type="button" data-action="select-connected" data-toolbar="connected" title="选中相连节点 (Ctrl+Shift+E)">相连</button>
                    <button type="button" data-action="select-group-members" data-toolbar="members" title="选中分组成员">组员</button>
                    <button type="button" data-action="ungroup-selected" data-toolbar="ungroup" title="解散分组 (Ctrl+Shift+G)">解组</button>
                    <button type="button" data-action="rotate-left-selected" data-toolbar="rotate-left" title="向左旋转 15° ([)">左转</button>
                    <button type="button" data-action="rotate-right-selected" data-toolbar="rotate-right" title="向右旋转 15° (])">右转</button>
                    <button type="button" data-action="toggle-lock-selected" data-toolbar="lock" title="锁定/解锁">锁定</button>
                  </div>
                </div>
              </div>
              <div class="canvas-node-quickbar" data-role="node-quickbar" data-canvas-no-zoom hidden>
                <div class="canvas-node-quickbar-meta">
                  <strong data-role="node-quickbar-title">未命名</strong>
                  <span data-role="node-quickbar-type">操作</span>
                </div>
                <div class="canvas-node-quickbar-actions">
                  <button type="button" data-action="generate-selected" data-quick="generate" title="执行生成 (G)">生成</button>
                  <button type="button" data-action="retry-generation" data-quick="retry" title="重试生成" hidden>重试</button>
                  <button type="button" data-action="smart-wire-selected" data-quick="wire" title="智能接线">接线</button>
                  <button type="button" data-action="cycle-role-selected" data-quick="role" title="切换角色 (R)：普通/参考/结果">角色</button>
                  <button type="button" data-action="add-selected-to-timeline" data-quick="timeline" title="加入时间轴">时轴</button>
                  <button type="button" data-action="download-selected-image" data-quick="download" title="下载图片">下载</button>
                  <button type="button" data-action="favorite-selected" data-quick="favorite" title="收藏到素材库">收藏</button>
                  <button type="button" data-action="crop-selected" data-quick="crop" title="裁剪图片">裁剪</button>
                  <button type="button" data-action="split-selected" data-quick="split" title="分割图片">分割</button>
                  <button type="button" data-action="upscale-selected" data-quick="upscale" title="本地放大图片">放大</button>
                  <button type="button" data-action="super-resolve-selected" data-quick="super-resolve" title="AI 超分">超分</button>
                  <button type="button" data-action="inpaint-selected" data-quick="inpaint" title="局部重绘">重绘</button>
                  <button type="button" data-action="outpaint-selected" data-quick="outpaint" title="扩展画面">扩图</button>
                  <button type="button" data-action="angle-selected" data-quick="angle" title="生成新角度">角度</button>
                  <button type="button" data-action="toggle-free-resize" data-quick="free-resize" title="切换图片自由缩放">比例</button>
                  <button type="button" data-action="configure-image-tools" data-quick="image-settings" title="配置图片快捷工具">更多</button>
                  <button type="button" data-action="select-group-members" data-quick="members" title="选中分组成员（双击分组）">成员</button>
                  <button type="button" data-action="ungroup-selected" data-quick="ungroup" title="解散分组 (Ctrl+Shift+G)">解组</button>
                  <button type="button" data-action="select-connected" data-quick="connected" title="选中相连节点 (Ctrl+Shift+E)">相连</button>
                  <button type="button" data-action="open-inspector" data-quick="inspect" title="打开设置 (Enter)">设置</button>
                  <button type="button" data-action="duplicate-selected" data-quick="duplicate" title="复制">复制</button>
                  <button type="button" data-action="fit-selection" data-quick="fit" title="适配所选 (Shift+2)">适配</button>
                  <button type="button" data-action="focus-selected" data-quick="focus" title="定位到视图中心">定位</button>
                  <button type="button" data-action="rotate-left-selected" data-quick="rotate-left" title="向左旋转 15° ([)">左转</button>
                  <button type="button" data-action="rotate-right-selected" data-quick="rotate-right" title="向右旋转 15° (])">右转</button>
                  <button type="button" class="is-danger" data-action="delete-selected" data-quick="delete" title="删除">删除</button>
                </div>
              </div>
              <div class="canvas-edge-quickbar" data-role="edge-quickbar" data-canvas-no-zoom hidden>
                <div class="canvas-edge-quickbar-meta">
                  <strong data-role="edge-quickbar-title">连线</strong>
                  <span data-role="edge-quickbar-hint">Delete 删除 · R 反转</span>
                </div>
                <div class="canvas-edge-quickbar-actions">
                  <button type="button" data-action="reverse-selected-edge" data-quick="reverse" title="反转连线方向 (R)">反转</button>
                  <button type="button" data-action="focus-edge-source" data-quick="from" title="定位起点">起点</button>
                  <button type="button" data-action="focus-edge-target" data-quick="to" title="定位终点">终点</button>
                  <button type="button" data-action="select-edge-endpoints" data-quick="ends" title="选中两端节点">两端</button>
                  <button type="button" data-action="open-inspector" data-quick="inspect" title="打开连线信息">详情</button>
                  <button type="button" class="is-danger" data-action="delete-selected-edge" data-quick="delete" title="删除连线 (Delete)">删除</button>
                </div>
              </div>
              <div class="canvas-onboarding" data-role="onboarding" data-canvas-no-zoom hidden>
                <div class="canvas-onboarding-card">
                  <div class="canvas-onboarding-kicker">30 秒上手</div>
                  <strong>无限画布推荐流程</strong>
                  <ol>
                    <li>点「一键起步」，或从 Studio 导入时勾选历史参考输出。</li>
                    <li>用「智能接线」整理 参考图 → 编排节点 → 结果图</li>
                    <li>选中编排节点后按 <kbd>G</kbd> 生成；成功后会闪动结果节点</li>
                  </ol>
                  <p>常用：框选 · 滚轮缩放 · Shift 平移 · <kbd>B</kbd> 侧栏 · <kbd>T</kbd> 时间轴 · <kbd>?</kbd> 快捷键。</p>
                  <div class="canvas-onboarding-actions">
                    <button type="button" data-action="start-quick-workflow">一键起步</button>
                    <button type="button" data-action="onboarding-upload-local">本地上传</button>
                    <button type="button" data-action="onboarding-fill-history">示例填入历史</button>
                    <button type="button" data-action="onboarding-dismiss">知道了</button>
                  </div>
                </div>
              </div>
              <aside class="canvas-shortcut-panel" data-role="shortcut-panel" data-canvas-no-zoom hidden>
                <div class="canvas-shortcut-panel-head">
                  <strong>画布快捷键</strong>
                  <button type="button" data-action="toggle-shortcuts" aria-label="关闭快捷键面板">✕</button>
                </div>
                <div class="canvas-shortcut-grid">
                  <div><kbd>V</kbd><span>选择 / 框选</span></div>
                  <div><kbd>H</kbd><span>平移模式</span></div>
                  <div><kbd>T</kbd><span>折叠 / 展开时间轴</span></div>
                  <div><kbd>B</kbd><span>折叠 / 展开侧栏</span></div>
                  <div><kbd>M</kbd><span>打开 / 关闭小地图</span></div>
                  <div><kbd>Space</kbd><span>按住临时平移</span></div>
                  <div><kbd>滚轮</kbd><span>缩放画布</span></div>
                  <div><kbd>Shift</kbd>+<kbd>滚轮</kbd><span>平移画布（竖滚转横移）</span></div>
                  <div><kbd>触控板横滑</kbd><span>平移画布</span></div>
                  <div><kbd>中键</kbd>/<kbd>Alt</kbd>+拖<span>平移画布</span></div>
                  <div><kbd>双指</kbd><span>捏合缩放 / 平移画布</span></div>
                  <div><kbd>Shift</kbd>+<kbd>1</kbd><span>适配全部</span></div>
                  <div><kbd>Shift</kbd>+<kbd>2</kbd><span>适配所选</span></div>
                  <div><kbd>F</kbd><span>适配所选（无选中则适配全部）</span></div>
                  <div><kbd>打开画布</kbd><span>内容不在视野时自动适配</span></div>
                  <div><kbd>导入/生成</kbd><span>多图自动整理并适配视野</span></div>
                  <div><kbd>C 连线</kbd><span>顶部提示引导：源 → 目标（隐藏下一步条）</span></div>
                  <div><kbd>双击空白</kbd><span>新建文本；侧栏收起/专注时不强行展开</span></div>
                  <div><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd><span>微调节点 / 无选中时平移画布</span></div>
                  <div><kbd>小地图</kbd><span>点击跳转视角</span></div>
                  <div><kbd>右下导航</kbd><span>缩放 / 适配全部 / 适配所选 / 重置 / 小地图</span></div>
                  <div><kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd><span>视角后退 / 前进</span></div>
                  <div><kbd>Ctrl</kbd>+<kbd>A</kbd><span>全选节点</span></div>
                  <div><kbd>Ctrl</kbd>+<kbd>D</kbd><span>复制节点</span></div>
                  <div><kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd><span>拷贝 / 粘贴节点</span></div>
                  <div><kbd>Ctrl</kbd>+<kbd>Z</kbd><span>撤销</span></div>
                  <div><kbd>Ctrl</kbd>+<kbd>Y</kbd><span>重做</span></div>
                  <div><kbd>Delete</kbd><span>删除节点 / 连线（分组含成员；批量会确认；默认跳过锁定）</span></div>
                  <div><kbd>多选包围框</kbd><span>2 个以上选中时显示范围</span></div>
                  <div><kbd>粘贴图片</kbd><span>直接放入画布</span></div>
                  <div><kbd>Esc</kbd><span>取消选择</span></div>
                  <div><kbd>双击空白</kbd><span>新建文本</span></div>
                  <div><kbd>双击节点</kbd><span>打开设置并聚焦编辑</span></div>
                  <div><kbd>?</kbd>/<kbd>F1</kbd><span>打开本面板</span></div>
                  <div><kbd>多选</kbd><span>底部浮动条：对齐 / 分布 / 连接</span></div>
                  <div><kbd>G</kbd><span>执行所选编排生成</span></div>
                  <div><kbd>R</kbd><span>切换节点角色</span></div>
                  <div><kbd>Enter</kbd><span>打开节点设置</span></div>
                  <div><kbd>/</kbd><span>聚焦查找节点</span></div>
                  <div><kbd>Ctrl</kbd>+拖动<span>拖动时吸附网格</span></div>
                  <div><kbd>拖近节点</kbd><span>自动对齐并显示辅助线</span></div>
                  <div><kbd>组内移动</kbd><span>松手后分组框自动贴合</span></div>
                  <div><kbd>Shift</kbd>+拖动<span>锁定水平/垂直方向</span></div>
                  <div><kbd>双击分组</kbd><span>选中组内全部成员</span></div>
                  <div><kbd>选中角点</kbd><span>拖角点调整大小（Shift 比例）</span></div>
                  <div><kbd>[</kbd>/<kbd>]</kbd><span>旋转节点（Shift=45°）</span></div>
                  <div><kbd>Ctrl</kbd>+<kbd>G</kbd><span>创建分组</span></div>
                  <div><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd><span>解散分组</span></div>
                  <div><kbd>拖分组框</kbd><span>整体移动组内成员</span></div>
                </div>
                <p class="canvas-shortcut-tip">教学流：示例填入历史 → 智能接线 → 执行生成。C 进入点击连线；单选有就近快捷条，多选工具条贴着选区。</p>
              </aside>
            </div>
            ${buildCanvasContextMenuMarkup()}
            <div class="canvas-modal-overlay" data-role="canvas-modal" data-canvas-no-zoom hidden></div>
          </section>
          <section class="canvas-timeline-panel" data-role="timeline-panel" aria-label="时间轴">
            <div class="canvas-timeline-panel-head">
              <div class="canvas-timeline-titlebar">
                <div>
                  <span class="canvas-editor-kicker">编排</span>
                  <h3>时间轴</h3>
                  <span class="canvas-timeline-collapsed-summary" data-role="timeline-collapsed-summary" hidden>已折叠 · 点击展开</span>
                </div>
                <button type="button" class="canvas-timeline-toggle" data-action="toggle-timeline" data-role="toggle-timeline-btn" title="折叠/展开时间轴(T)">收起时间轴</button>
              </div>
              <div class="canvas-timeline-head-meta">
                <div class="canvas-playback-controls" data-role="playback-controls">
                  <button type="button" data-action="toggle-playback" data-role="playback-button">播放</button>
                  <button type="button" data-action="stop-playback">停止</button>
                  <select data-role="playback-rate" class="canvas-playback-rate-select">
                    <option value="0.5">0.5x</option>
                    <option value="1" selected>1x</option>
                    <option value="2">2x</option>
                  </select>
                  <span class="canvas-editor-zoom canvas-playhead-chip" data-role="playhead-time">00:00</span>
                  <span class="canvas-editor-status canvas-playback-rate-readout" data-role="playback-rate-readout">1x</span>
                  <span class="canvas-timeline-summary-chip" data-role="timeline-info">等待加入片段</span>
                </div>
              </div>
            </div>
            <div class="canvas-timeline-rail">
              <div class="canvas-timeline-scroller" data-role="timeline-scroller">
                <div class="canvas-timeline" data-role="timeline"></div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  `;
}

function bindEditorEvents(state) {
  state.root.querySelector('[data-action="back"]')?.addEventListener('click', () => {
    state.onBack?.();
  });
  bindAction(state, 'prompt-library', () => {
    globalThis.PromptLibraryBridge?.open?.({ context: 'canvas-editor', targetProjectId: state.project?.id || '' });
  });

  state.sidebarTabs.forEach(button => {
    button.addEventListener('click', () => {
      setSidebarTab(state, button.dataset.tab || 'actions');
    });
  });

  bindAction(state, 'new-note', () => {
    pushHistory(state);
    addNodeAtViewportCenter(state, createCanvasNoteNode({ text: '新的便签内容' }));
  });
  bindAction(state, 'new-text', () => {
    pushHistory(state);
    addNodeAtViewportCenter(state, createCanvasTextNode({ text: '在这里输入文本内容' }));
  });
  bindAction(state, 'new-config', () => {
    pushHistory(state);
    addNodeAtViewportCenter(state, createCanvasConfigNode({ composerContent: '以 @[node:参考图节点ID] 作为参考，生成新的画面。' }));
  });
  bindAction(state, 'new-media', () => {
    pushHistory(state);
    addNodeAtViewportCenter(state, createCanvasMediaNode({ kind: 'image', title: '图片节点' }));
  });
  bindAction(state, 'new-audio', () => {
    pushHistory(state);
    addNodeAtViewportCenter(state, createCanvasMediaNode({ kind: 'audio', title: '音频节点' }));
  });
  bindAction(state, 'new-subtitle', () => {
    pushHistory(state);
    addNodeAtViewportCenter(state, createCanvasMediaNode({ kind: 'subtitle', title: '字幕节点' }));
  });
  bindAction(state, 'import-media', async () => {
    pushHistory(state);
    await importMediaNodesFromBridge(state);
  });
  bindAction(state, 'upload-local-images', async () => {
    await uploadLocalImages(state);
  });
  bindAction(state, 'delete-selected-edge', () => {
    deleteSelectedEdge(state);
  });
  bindAction(state, 'reverse-selected-edge', () => {
    reverseSelectedEdge(state);
  });
  bindAction(state, 'connect-selected', () => {
    connectSelectedNodes(state);
  });
  bindAction(state, 'smart-wire-selected', () => {
    smartWireSelectedNodes(state);
  });
  bindAction(state, 'align-left', () => {
    alignSelectedNodes(state, 'left');
  });
  bindAction(state, 'align-center-h', () => {
    alignSelectedNodes(state, 'center-h');
  });
  bindAction(state, 'align-right', () => {
    alignSelectedNodes(state, 'right');
  });
  bindAction(state, 'align-top', () => {
    alignSelectedNodes(state, 'top');
  });
  bindAction(state, 'align-center-v', () => {
    alignSelectedNodes(state, 'center-v');
  });
  bindAction(state, 'align-bottom', () => {
    alignSelectedNodes(state, 'bottom');
  });
  bindAction(state, 'distribute-h', () => {
    distributeSelectedNodes(state, 'horizontal');
  });
  bindAction(state, 'distribute-v', () => {
    distributeSelectedNodes(state, 'vertical');
  });
  bindAction(state, 'replace-sample-reference', () => {
    replaceSampleReferenceWithSelection(state);
  });
  bindAction(state, 'fill-sample-from-history', async () => {
    await fillSampleReferenceFromHistory(state);
  });
  bindAction(state, 'add-selected-to-timeline', () => {
    addSelectedNodesToTimeline(state);
  });
  bindAction(state, 'delete-selected', async () => {
    await deleteSelectedNodes(state);
  });
  bindAction(state, 'duplicate-selected', () => {
    duplicateSelectedNodes(state);
  });
  bindAction(state, 'tidy-selected', () => {
    tidySelectedNodes(state);
  });
  bindAction(state, 'group-selected', () => {
    createGroupFromSelection(state);
  });
  bindAction(state, 'ungroup-selected', () => {
    ungroupSelectedNodes(state);
  });
  bindAction(state, 'select-group-members', () => {
    selectGroupMembersFromSelection(state);
  });
  bindAction(state, 'rotate-left-selected', () => {
    rotateSelectedNodes(state, -15);
  });
  bindAction(state, 'rotate-right-selected', () => {
    rotateSelectedNodes(state, 15);
  });
  bindAction(state, 'toggle-lock-selected', () => {
    toggleLockSelectedNodes(state);
  });
  bindAction(state, 'bring-forward-selected', () => {
    shiftSelectedNodeZIndex(state, 1);
  });
  bindAction(state, 'send-backward-selected', () => {
    shiftSelectedNodeZIndex(state, -1);
  });
  bindAction(state, 'generate-selected', async () => {
    await runSelectedGeneration(state);
  });
  bindAction(state, 'toggle-canvas-assistant', () => {
    if (!state.assistantRoot) return;
    state.assistantRoot.hidden = !state.assistantRoot.hidden;
    state.root.querySelectorAll('[data-action="toggle-canvas-assistant"]').forEach(button => {
      button.setAttribute('aria-pressed', state.assistantRoot.hidden ? 'false' : 'true');
    });
    if (!state.assistantRoot.hidden) state.assistantApi?.render?.();
  });
  bindAction(state, 'download-selected-image', () => {
    downloadSelectedImage(state);
  });
  bindAction(state, 'crop-selected', async () => {
    await openCropDialog(state);
  });
  bindAction(state, 'split-selected', async () => {
    await openSplitDialog(state);
  });
  bindAction(state, 'upscale-selected', async () => {
    await openUpscaleDialog(state);
  });
  bindAction(state, 'super-resolve-selected', async () => {
    await openSuperResolveDialog(state);
  });
  bindAction(state, 'inpaint-selected', async () => {
    await openInpaintDialog(state);
  });
  bindAction(state, 'outpaint-selected', async () => {
    await openOutpaintDialog(state);
  });
  bindAction(state, 'angle-selected', async () => {
    await openAngleDialog(state);
  });
  bindAction(state, 'toggle-free-resize', () => {
    toggleSelectedImageFreeResize(state);
  });
  bindAction(state, 'configure-image-tools', () => {
    openImageQuickToolsDialog(state);
  });
  bindAction(state, 'focus-running-node', () => {
    focusActiveRunNode(state);
  });
  bindAction(state, 'focus-result-node', () => {
    focusActiveResultNode(state);
  });
  bindAction(state, 'focus-result-toast', () => {
    const nodeId = state.resultToastNodeId || getActiveResultNodeId(state);
    if (nodeId && state.project?.nodes?.[nodeId]) {
      setSelectedNodes(state, [nodeId], { rerender: true, persist: false, openInspector: false });
      focusNodeInView(state, nodeId, { flash: true, select: false, durationMs: 2400 });
      updateStatus(state, `已定位结果：${state.project.nodes[nodeId].title || '结果节点'}`);
    } else {
      focusActiveResultNode(state);
    }
    hideResultToast(state);
  });
  bindAction(state, 'use-result-as-reference', () => {
    useResultNodeAsReference(state, state.resultToastNodeId || getActiveResultNodeId(state));
  });
  bindAction(state, 'continue-from-result', () => {
    continueFromResultNode(state, state.resultToastNodeId || getActiveResultNodeId(state));
  });
  bindAction(state, 'dismiss-result-toast', () => {
    hideResultToast(state);
  });
  bindAction(state, 'retry-generation', async () => {
    await retryActiveGeneration(state);
  });
  bindAction(state, 'dismiss-run-banner', () => {
    dismissRunBanner(state);
  });
  bindAction(state, 'focus-selected', () => {
    focusSelectedNode(state);
  });
  bindAction(state, 'select-connected', () => {
    selectConnectedNodes(state);
  });
  bindAction(state, 'focus-edge-source', () => {
    focusSelectedEdgeEndpoint(state, 'from');
  });
  bindAction(state, 'focus-edge-target', () => {
    focusSelectedEdgeEndpoint(state, 'to');
  });
  bindAction(state, 'select-edge-endpoints', () => {
    selectSelectedEdgeEndpoints(state);
  });
  bindAction(state, 'open-inspector', () => {
    // Keep selected-edge inspector when an edge is active and no nodes are selected.
    if (!(state.selectedNodeIds || []).length && state.selectedEdgeId) {
      setSidebarTab(state, 'inspector');
      setSidebarCollapsed(state, false, { persist: true });
      syncInspector(state);
      updateStatus(state, '已打弢连线详情');
      return;
    }
    // stage-coach-open-inspector-fallback + failure recovery
    if (!(state.selectedNodeIds || []).length) {
      const failed = findActiveRunNode(state);
      const preferred = (failed && (failed.type === 'config' || failed.type === 'loop' || failed.type === 'llm') ? failed : null)
        || findPreferredGeneratorNode(state, [])
        || findPreferredConfigNode(state, []);
      if (preferred) setSelectedNodes(state, [preferred.id], { rerender: true, persist: false, openInspector: true });
      else openInspectorForSelection(state);
      return;
    }
    openInspectorForSelection(state);
  });
  bindAction(state, 'cycle-role-selected', () => {
    cycleSelectedNodeRole(state);
  });
  bindAction(state, 'set-role-selected', (event) => {
    const target = event?.target instanceof Element ? event.target.closest('[data-role-value]') : null;
    const role = target?.getAttribute?.('data-role-value') || '';
    setSelectedNodesRole(state, role);
  });
  bindAction(state, 'match-size-selected', () => {
    matchSelectedNodesSize(state);
  });
  bindAction(state, 'set-size-selected', (event) => {
    const target = event?.target instanceof Element
      ? event.target.closest('[data-action="set-size-selected"]')
      : null;
    const width = Number(target?.getAttribute?.('data-width'));
    const height = Number(target?.getAttribute?.('data-height'));
    setSelectedNodesSize(state, width, height);
  });
  bindAction(state, 'set-title-selected', () => {
    setSelectedNodesTitle(state, readBatchTitleInput(state));
  });
  bindAction(state, 'prefix-title-selected', () => {
    setSelectedNodesTitle(state, readBatchTitleInput(state), { mode: 'prefix' });
  });
  bindAction(state, 'suffix-title-selected', () => {
    setSelectedNodesTitle(state, readBatchTitleInput(state), { mode: 'suffix' });
  });
  bindAction(state, 'number-title-selected', () => {
    const base = readBatchTitleInput(state) || '节点';
    setSelectedNodesTitle(state, base, { mode: 'number' });
  });
  bindAction(state, 'undo', () => {
    undo(state);
  });
  bindAction(state, 'redo', () => {
    redo(state);
  });
  bindAction(state, 'fit-view', () => {
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    fitViewportToNodes(state);
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    try { syncStageNav(state); } catch {}
  });
  bindAction(state, 'fit-selection', () => {
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    fitViewportToSelection(state);
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    try { syncStageNav(state); } catch {}
  });
  bindAction(state, 'viewport-back', () => {
    viewportHistoryBack(state);
  });
  bindAction(state, 'viewport-forward', () => {
    viewportHistoryForward(state);
  });
  bindAction(state, 'toggle-minimap', () => {
    state.miniMapOpen = !state.miniMapOpen;
    writeViewPrefs(state);
    syncViewToggleButtons(state);
    persistProject(state);
    rerenderEditor(state, { skipPersist: true });
  });
  bindAction(state, 'cycle-zoom', (event) => {
    cycleCanvasZoom(state, event);
  });
  state.root?.querySelector?.('[data-role="zoom-level"]')?.addEventListener('contextmenu', event => {
    event.preventDefault();
    cycleCanvasZoom(state, event);
  });
  bindAction(state, 'zoom-out', () => {
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    zoomViewportByStep(state, 1 / 1.15);
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    try { syncStageNav(state); } catch {}
  });
  bindAction(state, 'zoom-in', () => {
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    zoomViewportByStep(state, 1.15);
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    try { syncStageNav(state); } catch {}
  });
  bindAction(state, 'reset-view', () => {
    pushHistory(state);
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    state.viewport = { x: 0, y: 0, scale: 1 };
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    persistProject(state);
    rerenderEditor(state);
    try { syncStageNav(state); } catch {}
  });
  bindAction(state, 'toggle-timeline', () => {
    if (state.focusMode) state.focusMode = false;
    setTimelineCollapsed(state, !state.timelineCollapsed);
  });
  bindAction(state, 'toggle-sidebar', () => {
    // Manual chrome toggles leave focus mode.
    if (state.focusMode) state.focusMode = false;
    setSidebarCollapsed(state, !state.sidebarCollapsed);
    updateStatus(state, state.sidebarCollapsed ? '侧栏已折叠（B 展开）' : '侧栏已展开（B 收起）');
  });
  bindAction(state, 'toggle-focus-mode', () => {
    setFocusMode(state, !state.focusMode);
  });
  bindAction(state, 'set-tool-select', () => setInteractionMode(state, 'select'));
  bindAction(state, 'set-tool-connect', () => setInteractionMode(state, 'connect'));
  bindAction(state, 'set-tool-pan', () => setInteractionMode(state, 'pan'));
  bindAction(state, 'cancel-connect-mode', () => {
    clearClickConnectSource(state, { silent: true });
    setInteractionMode(state, 'select');
    updateStatus(state, '已退出连线模式', { stickyMs: 1000 });
  });
  state.root?.querySelector?.('[data-role="timeline-collapsed-summary"]')?.addEventListener('click', () => {
    setTimelineCollapsed(state, false);
  });
  // timeline panel click expand
  state.timelinePanel?.addEventListener('click', event => {
    if (!state.timelineCollapsed) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-action="toggle-timeline"]')) return;
    // Only expand from the collapsed head chrome/summary. Ignore bubbled clicks from
    // timeline clips/tracks (including synthetic clicks after pointer drag tests).
    if (!target.closest('[data-role="timeline-collapsed-summary"], .canvas-timeline-titlebar, .canvas-timeline-panel-head')) return;
    if (target.closest('.canvas-timeline-clip, [data-role="timeline-track-body"], .canvas-timeline-rail, .canvas-playback-controls')) return;
    setTimelineCollapsed(state, false);
  });
  bindAction(state, 'toggle-shortcuts', () => {
    setShortcutPanelOpen(state, !state.shortcutsOpen);
  });
  bindAction(state, 'start-quick-workflow', () => {
    startQuickWorkflow(state);
  });
  bindAction(state, 'onboarding-dismiss', () => {
    dismissCanvasOnboarding(state, { persist: true });
  });
  bindAction(state, 'dismiss-stage-coach', () => {
    dismissStageCoach(state);
  });
  bindAction(state, 'onboarding-fill-history', async () => {
    dismissCanvasOnboarding(state, { persist: true });
    await fillSampleReferenceFromHistory(state);
  });
  bindAction(state, 'onboarding-upload-local', async () => {
    dismissCanvasOnboarding(state, { persist: true, silent: true });
    await uploadLocalImages(state);
  });
  state.toolButtons?.forEach(button => {
    button.addEventListener('click', () => {
      const raw = String(button.dataset.tool || 'select').toLowerCase();
      const tool = raw === 'pan' || raw === 'connect' ? raw : 'select';
      setInteractionMode(state, tool);
    });
  });

  state.playbackButton?.addEventListener('click', () => {
    togglePlayback(state);
  });
  bindAction(state, 'stop-playback', () => {
    stopPlayback(state);
  });
  state.root.querySelectorAll('[data-action="set-playback-rate"]').forEach(button => {
    button.addEventListener('click', () => {
      const rate = Number(button.dataset.rate) || 1;
      setPlaybackRate(state, rate);
    });
  });
  state.playbackRateSelect?.addEventListener('change', event => {
    setPlaybackRate(state, Number(event.target.value) || 1);
  });

  state.backgroundSelect?.addEventListener('change', event => {
    pushHistory(state);
    state.project.backgroundMode = event.target.value || 'lines';
    persistProject(state);
    rerenderEditor(state);
    updateStatus(state, '已切换画布网格');
  });

  state.miniMap?.addEventListener('pointerdown', event => {
    handleMiniMapPointer(state, event);
  });

  const handleSearchInputEvent = (value) => {
    state.nodeSearchQuery = value || '';
    state.nodeSearchActiveIndex = 0;
    renderNodeSearchResults(state, state.nodeSearchQuery);
  };
  const handleSearchKeydown = (event, inputEl) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      clearNodeSearch(state, { keepFilter: true, closeStage: true });
      inputEl?.blur?.();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveNodeSearchActive(state, 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveNodeSearchActive(state, -1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const list = (state.stageSearchOpen && state.stageSearchResults) || state.nodeSearchResults;
      const active = list?.querySelector?.('.canvas-node-search-item.is-active[data-node-search-id]')
        || list?.querySelector?.('[data-node-search-id]');
      if (active) focusNodeFromSearch(state, active.getAttribute('data-node-search-id'));
      else updateStatus(state, '没有可定位的匹配节点');
    }
  };
  state.nodeSearchInput?.addEventListener('input', () => handleSearchInputEvent(state.nodeSearchInput.value || ''));
  state.nodeSearchInput?.addEventListener('keydown', event => handleSearchKeydown(event, state.nodeSearchInput));
  state.stageSearchInput?.addEventListener('input', () => handleSearchInputEvent(state.stageSearchInput.value || ''));
  state.stageSearchInput?.addEventListener('keydown', event => handleSearchKeydown(event, state.stageSearchInput));
  const onSearchResultClick = event => {
    const target = event.target instanceof Element ? event.target.closest('[data-node-search-id]') : null;
    if (!target) return;
    focusNodeFromSearch(state, target.getAttribute('data-node-search-id'));
  };
  state.nodeSearchResults?.addEventListener('click', onSearchResultClick);
  state.stageSearchResults?.addEventListener('click', onSearchResultClick);
  const onSearchFilterClick = event => {
    const button = event.target instanceof Element ? event.target.closest('[data-search-filter]') : null;
    if (!button) return;
    event.preventDefault();
    setNodeSearchFilter(state, button.getAttribute('data-search-filter') || 'all');
  };
  state.nodeSearchFiltersEl?.addEventListener('click', onSearchFilterClick);
  state.stageSearchFiltersEl?.addEventListener('click', onSearchFilterClick);
  bindAction(state, 'focus-node-search', () => {
    focusNodeSearch(state, { selectAll: true });
  });
  bindAction(state, 'close-stage-search', () => {
    clearNodeSearch(state, { keepFilter: true, closeStage: true });
  });
  syncNodeSearchFilterButtons(state);

  state.stage?.addEventListener('pointerdown', event => {
    const target = event.target instanceof Element ? event.target : null;
    const resizeEl = target?.closest?.('[data-resize-handle]');
    const rotateEl = target?.closest?.('[data-rotate-handle]');
    const handleEl = target?.closest?.('[data-connect-handle]');
    if (target?.closest(CANVAS_NO_ZOOM_SELECTOR) && !resizeEl && !rotateEl) return;
    const nodeEl = target?.closest?.('[data-node-id]');
    const wantsPan =
      event.button === 1
      || event.altKey
      || state.spacePanActive
      || state.interactionMode === 'pan';

    if (wantsPan && event.button !== 2) {
      startPan(state, event, { deselectOnClick: event.button === 0 && !state.spacePanActive && state.interactionMode === 'pan' });
      return;
    }
    if (resizeEl && nodeEl) {
      startNodeResize(state, nodeEl.dataset.nodeId, resizeEl.dataset.resizeHandle || 'se', event);
      return;
    }
    if (rotateEl && nodeEl) {
      startNodeRotate(state, nodeEl.dataset.nodeId, event);
      return;
    }
    if (handleEl && nodeEl) {
      startNodeConnection(state, nodeEl.dataset.nodeId, handleEl.dataset.connectHandle, event);
      return;
    }
    if (nodeEl) {
      // Click-to-connect mode: first node = source, second node = target.
      if (state.interactionMode === 'connect' && event.button === 0 && !event.altKey) {
        event.preventDefault();
        const nodeId = nodeEl.dataset.nodeId;
        if (!state.clickConnectFromId) {
          setClickConnectSource(state, nodeId, 'out');
          setSelectedNodes(state, [nodeId], { rerender: true, persist: false, openInspector: false });
        } else {
          completeClickConnect(state, nodeId);
        }
        return;
      }
      startNodeDrag(state, nodeEl.dataset.nodeId, event);
      return;
    }

    // Empty stage click in connect mode cancels pending source.
    if (state.interactionMode === 'connect' && event.button === 0 && state.clickConnectFromId) {
      clearClickConnectSource(state);
      return;
    }

    // Upstream behavior: Ctrl/Cmd + empty left-drag selects; plain left-drag pans.
    if (event.button === 0 && (event.ctrlKey || event.metaKey)) {
      startBoxSelection(state, event);
      return;
    }

    if (event.button === 0) {
      startPan(state, event, { deselectOnClick: true });
    }
  });

  state.stage?.addEventListener('dblclick', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(CANVAS_NO_ZOOM_SELECTOR)) return;
    const nodeEl = target?.closest?.('[data-node-id]');
    event.preventDefault();
    if (nodeEl) {
      const nodeId = nodeEl.dataset.nodeId;
      const node = state.project?.nodes?.[nodeId];
      if (node?.type === 'group') {
        const memberIds = selectGroupMembersForGroup(state, nodeId, { includeGroup: false });
        if (memberIds.length) {
          updateStatus(state, `已选中分组。${node.title || '分组'}」的 ${memberIds.length} 个成员`);
          return;
        }
      }
      const focusField = (node?.type === 'text' || node?.type === 'note' || node?.type === 'llm')
        ? '[name="text"]'
        : '[name="title"]';
      openNodeEditorChrome(state, nodeId, {
        focusField,
        status: shouldKeepCanvasChromeQuiet(state)
          ? '已选中节点 · Enter 打开设置（保持侧栏收起）'
          : '已打弢节点编辑'
      });
      return;
    }
    state.contextMenuPoint = getStagePoint(state, event);
    openContextMenu(state, event.clientX, event.clientY, { section: 'create' });
  });

  state.stage?.addEventListener('contextmenu', event => {
    event.preventDefault();
    const target = event.target instanceof Element ? event.target : null;
    const nodeEl = target?.closest?.('[data-node-id]');
    const point = getStagePoint(state, event);
    state.contextMenuPoint = point;
    state.pendingConnectionFromId = '';
    if (nodeEl?.dataset?.nodeId) {
      const nodeId = nodeEl.dataset.nodeId;
      const already = state.selectedNodeIds?.includes(nodeId);
      if (!already) {
        setSelectedNodes(state, [nodeId], { rerender: true, persist: false, openInspector: false });
      }
    }
    const selectedCount = state.selectedNodeIds?.length || 0;
    const section = nodeEl ? (selectedCount >= 2 ? 'align' : 'selection') : (selectedCount ? 'selection' : 'create');
    openContextMenu(state, event.clientX, event.clientY, { section });
  });

  state.stage?.addEventListener('wheel', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(CANVAS_NO_ZOOM_SELECTOR)) return;
    event.preventDefault();
    const rect = state.stage.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const beforeScale = Number(state.viewport.scale) || 1;
    applyWheelNavigation(state, event, point);
    applyViewportTransformLive(state);
    const afterScale = Number(state.viewport.scale) || 1;
    scheduleViewportCommit(state, {
      reason: Math.abs(afterScale - beforeScale) > 0.0001 ? 'wheel' : 'wheel-pan'
    });
  }, { passive: false });

  // Touch / trackpad-like multi-pointer gestures: pinch zoom + two-finger pan.
  state._onStagePointerDownGesture = event => handleStageGesturePointerDown(state, event);
  state._onStagePointerMoveGesture = event => handleStageGesturePointerMove(state, event);
  state._onStagePointerUpGesture = event => handleStageGesturePointerUp(state, event);
  state.stage?.addEventListener('pointerdown', state._onStagePointerDownGesture);
  state.stage?.addEventListener('pointermove', state._onStagePointerMoveGesture);
  state.stage?.addEventListener('pointerup', state._onStagePointerUpGesture);
  state.stage?.addEventListener('pointercancel', state._onStagePointerUpGesture);
  state.stage?.addEventListener('lostpointercapture', state._onStagePointerUpGesture);
  if (state.stage) {
    state.stage.style.touchAction = 'none';
  }

  state._onStageDragOver = event => {
    if (!event.dataTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setStageDropActive(state, true);
  };
  state._onStageDragLeave = event => {
    // Ignore leaves that stay within stage descendants.
    const related = event.relatedTarget;
    if (related && state.stage?.contains?.(related)) return;
    if (event.target === state.stage || !state.stage?.contains?.(related)) {
      setStageDropActive(state, false);
    }
  };
  state._onStageDrop = event => {
    setStageDropActive(state, false);
    void handleCanvasFileDrop(state, event);
  };
  state.stage?.addEventListener('dragover', state._onStageDragOver);
  state.stage?.addEventListener('dragleave', state._onStageDragLeave);
  state.stage?.addEventListener('drop', state._onStageDrop);

  state.nodeLayer?.addEventListener('click', event => {
    if (event.target?.closest?.('[data-connect-handle]')) return;
    const nodeEl = event.target?.closest?.('[data-node-id]');
    if (!nodeEl) return;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const nextIds = additive
      ? (state.selectedNodeIds.includes(nodeEl.dataset.nodeId)
        ? state.selectedNodeIds.filter(id => id !== nodeEl.dataset.nodeId)
        : dedupe([...state.selectedNodeIds, nodeEl.dataset.nodeId]))
      : [nodeEl.dataset.nodeId];
    setSelectedNodes(state, nextIds, { rerender: true, persist: false });
  });

  state.edgeLayer?.addEventListener('click', event => {
    const edgeEl = event.target?.closest?.('[data-edge-id]');
    if (!edgeEl?.dataset?.edgeId) return;
    event.stopPropagation();
    setSelectedEdge(state, edgeEl.dataset.edgeId);
  });

  state.timelineLayer?.addEventListener('click', event => {
    if (state.timelineCollapsed) return;
    const clipButton = event.target?.closest?.('.canvas-timeline-clip');
    if (clipButton) {
      setSelectedNodes(state, [clipButton.dataset.nodeId], { rerender: true, persist: false });
      syncPlayheadToSelectedNode(state);
      persistProject(state);
      rerenderEditor(state);
      return;
    }
    const trackBody = event.target?.closest?.('[data-role="timeline-track-body"]');
    if (trackBody) {
      const rect = trackBody.getBoundingClientRect();
      const x = Math.max(0, event.clientX - rect.left);
      const currentTimeMs = Math.round((x / TIMELINE_PIXELS_PER_SECOND) * 1000);
      setTimelineCurrentTime(state.project, currentTimeMs);
      persistProject(state);
      rerenderEditor(state);
    }
  });

  state.timelineLayer?.addEventListener('pointerdown', event => {
    if (state.timelineCollapsed) return;
    const clipButton = event.target?.closest?.('.canvas-timeline-clip');
    if (!clipButton) return;
    const mode = event.target?.closest?.('[data-role="clip-resize"]') ? 'resize' : 'move';
    startTimelineClipInteraction(state, clipButton.dataset.nodeId, mode, event);
  });

  const processInteractionPointerMove = event => {
    updateDragState(state, event);
    updateNodeResizeState(state, event);
    updateNodeRotateState(state, event);
    updateConnectionState(state, event);
    updateClickConnectHover(state, event);
    updatePanState(state, event);
    updateBoxSelectionState(state, event);
    updateTimelineClipInteraction(state, event);
  };
  state.interactionScheduler = createCanvasInteractionScheduler(processInteractionPointerMove);
  state._onWindowPointerMove = event => {
    const active = Boolean(
      state.dragState || state.resizeState || state.rotateState || state.panState
      || state.boxState || state.timelineDragState || state.connectState || state.clickConnectFromId
    );
    if (!active) return;
    state.interactionScheduler.enqueue(event);
  };
  state._onWindowPointerUp = () => {
    // Apply the last sampled position before committing the gesture.
    state.interactionScheduler.flush();
    endDragState(state);
    endNodeResizeState(state);
    endNodeRotateState(state);
    endConnectionState(state);
    endPanState(state);
    endBoxSelectionState(state);
    endTimelineClipInteraction(state);
  };
  state._onWindowKeyDown = event => {
    const targetTag = event.target?.tagName || '';
    const editing = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT' || event.target?.isContentEditable;
    const key = String(event.key || '').toLowerCase();

    if (!editing && event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      state.spacePanActive = true;
      syncStageCursor(state);
      updateStatus(state, '按住空格：拖动画布');
      return;
    }

    if ((event.ctrlKey || event.metaKey) && !editing && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(state);
      else undo(state);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !editing && key === 'y') {
      event.preventDefault();
      redo(state);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !editing && key === 'a') {
      event.preventDefault();
      const allIds = getProjectNodeList(state.project).filter(node => !node.hidden).map(node => node.id);
      setSelectedNodes(state, allIds, { rerender: true, persist: false });
      updateStatus(state, allIds.length ? `全选 ${allIds.length} 个节点` : '画布为空');
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !editing && key === 'd') {
      event.preventDefault();
      duplicateSelectedNodes(state);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !editing && key === 'c') {
      event.preventDefault();
      copySelectedNodesToClipboard(state);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !editing && key === 'v') {
      event.preventDefault();
      pasteClipboardNodes(state);
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'v') {
      event.preventDefault();
      setInteractionMode(state, 'select');
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'c' && !event.shiftKey) {
      // Prefer connect mode over browser copy when not editing text.
      // Keep Ctrl/Cmd+C as copy via existing handler branch.
      event.preventDefault();
      setInteractionMode(state, state.interactionMode === 'connect' ? 'select' : 'connect');
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'h') {
      event.preventDefault();
      setInteractionMode(state, 'pan');
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && key === 't') {
      event.preventDefault();
      if (state.focusMode) state.focusMode = false;
      setTimelineCollapsed(state, !state.timelineCollapsed);
      updateStatus(state, state.timelineCollapsed ? '时间轴已折叠（T 展开）' : '时间轴已展开（T 收起）');
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'b') {
      event.preventDefault();
      if (state.focusMode) state.focusMode = false;
      setSidebarCollapsed(state, !state.sidebarCollapsed);
      updateStatus(state, state.sidebarCollapsed ? '侧栏已折叠（B 展开）' : '侧栏已展开（B 收起）');
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && (key === '\\' || event.code === 'Backslash')) {
      event.preventDefault();
      setFocusMode(state, !state.focusMode);
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'm') {
      event.preventDefault();
      state.miniMapOpen = !state.miniMapOpen;
      writeViewPrefs(state);
      syncViewToggleButtons(state);
      persistProject(state);
      rerenderEditor(state, { skipPersist: true });
      updateStatus(state, state.miniMapOpen ? '小地图已打开（M 关闭）' : '小地图已关闭（M 打开）');
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === '1' && event.shiftKey) {
      event.preventDefault();
      fitViewportToNodes(state);
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === '2' && event.shiftKey) {
      event.preventDefault();
      fitViewportToSelection(state);
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || key === 'arrowleft' || key === 'arrowright')) {
      event.preventDefault();
      if (event.key === 'ArrowLeft' || key === 'arrowleft') viewportHistoryBack(state);
      else viewportHistoryForward(state);
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'f') {
      event.preventDefault();
      pushViewportHistory(state, { force: true, minGapMs: 0 });
      if ((state.selectedNodeIds || []).length) fitViewportToSelection(state);
      else fitViewportToNodes(state);
      pushViewportHistory(state, { force: true, minGapMs: 0 });
      try { syncStageNav(state); } catch {}
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'a' && !state.previewActive) {
      event.preventDefault();
      void openAssetLibrary(state);
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && (key === '?' || event.key === 'F1' || (event.shiftKey && key === '/'))) {
      event.preventDefault();
      setShortcutPanelOpen(state, !state.shortcutsOpen);
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && (key === '/' || event.code === 'Slash') && !event.shiftKey) {
      event.preventDefault();
      focusNodeSearch(state, { selectAll: true });
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && (key === 'g')) {
      event.preventDefault();
      void runSelectedGeneration(state);
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'r') {
      if (state.selectedEdgeId) {
        event.preventDefault();
        reverseSelectedEdge(state);
        return;
      }
      if (state.selectedNodeIds.length >= 1) {
        event.preventDefault();
        cycleSelectedNodeRole(state);
        return;
      }
    }
    if (!editing && (event.ctrlKey || event.metaKey) && event.shiftKey && key === 'e') {
      event.preventDefault();
      selectConnectedNodes(state);
      return;
    }
    if (!editing && !event.altKey && (event.ctrlKey || event.metaKey) && key === 'g') {
      event.preventDefault();
      if (event.shiftKey) ungroupSelectedNodes(state);
      else createGroupFromSelection(state);
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === '[' || event.key === ']')) {
      if (state.selectedNodeIds.length) {
        event.preventDefault();
        const step = event.shiftKey ? 45 : 15;
        rotateSelectedNodes(state, event.key === ']' ? step : -step);
        return;
      }
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'enter') {
      if (state.selectedNodeIds.length || state.selectedEdgeId) {
        event.preventDefault();
        openInspectorForSelection(state);
        return;
      }
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && ['arrowup','arrowdown','arrowleft','arrowright'].includes(key)) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
      const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
      if (state.selectedNodeIds.length) {
        nudgeSelectedNodes(state, dx, dy);
      } else {
        // No selection: arrow keys pan the viewport so large boards stay keyboard-navigable.
        const panStep = event.shiftKey ? 120 : 48;
        const panX = key === 'arrowleft' ? panStep : key === 'arrowright' ? -panStep : 0;
        const panY = key === 'arrowup' ? panStep : key === 'arrowdown' ? -panStep : 0;
        state.viewport = {
          ...state.viewport,
          x: (Number(state.viewport.x) || 0) + panX,
          y: (Number(state.viewport.y) || 0) + panY
        };
        applyViewportTransformLive(state);
        scheduleViewportCommit(state, { reason: 'keyboard-pan' });
        updateStatus(state, '方向键平移画布（Shift 加速）', { stickyMs: 700 });
      }
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'escape') {
      event.preventDefault();
      closeContextMenu(state);
      if (state.clickConnectFromId || state.interactionMode === 'connect') {
        if (state.clickConnectFromId) {
          clearClickConnectSource(state);
          return;
        }
        setInteractionMode(state, 'select');
        return;
      }
      if (state.stageSearchOpen) {
        clearNodeSearch(state, { keepFilter: true, closeStage: true });
        return;
      }
      if (state.shortcutsOpen) {
        setShortcutPanelOpen(state, false);
        return;
      }
      if (state.onboardingEl && !state.onboardingEl.hidden) {
        dismissCanvasOnboarding(state, { persist: true });
        return;
      }
      if (state.modalOverlay && !state.modalOverlay.hidden) {
        state.modalOverlay.hidden = true;
        state.modalOverlay.innerHTML = '';
      }
      setSelectedNodes(state, [], { rerender: false, persist: false });
      setSelectedEdge(state, '');
      updateStatus(state, '已取消选择');
      return;
    }
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'z' && !state.previewActive) {
      event.preventDefault();
      enterFitAllPreview(state);
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && !editing) {
      if (state.selectedEdgeId) {
        event.preventDefault();
        deleteSelectedEdge(state);
        return;
      }
      if (state.selectedNodeIds.length) {
        event.preventDefault();
        void deleteSelectedNodes(state);
      }
    }
  };
  state._onWindowKeyUp = event => {
    if (event.code === 'Space') {
      state.spacePanActive = false;
      syncStageCursor(state);
      if (!state.panState) updateStatus(state, state.selectedNodeIds.length ? `已选中 ${state.selectedNodeIds.length} 个节点` : '就绪');
    }
    if (state.previewActive && String(event.key || '').toLowerCase() === 'z') {
      exitFitAllPreview(state);
    }
  };

  window.addEventListener('pointermove', state._onWindowPointerMove);
  window.addEventListener('pointerup', state._onWindowPointerUp);
  window.addEventListener('pointercancel', state._onWindowPointerUp);
  window.addEventListener('keydown', state._onWindowKeyDown);
  window.addEventListener('keyup', state._onWindowKeyUp);
  state._onWindowPaste = event => {
    void handleCanvasPaste(state, event);
  };
  window.addEventListener('paste', state._onWindowPaste);

  state.contextMenu?.addEventListener('click', async event => {
    const rootButton = event.target?.closest?.('[data-menu-section]');
    if (rootButton) {
      const section = rootButton.dataset.menuSection;
      const nextSection = state.contextMenuSection === section ? null : section;
      state.contextMenuSection = nextSection;
      toggleContextMenuSection(state, nextSection);
      return;
    }

    const actionEl = event.target instanceof Element
      ? event.target.closest('[data-action]')
      : null;
    const action = actionEl?.getAttribute?.('data-action') || event.target?.dataset?.action || '';
    if (!action) return;
    if (actionEl?.disabled || actionEl?.classList?.contains('is-disabled')) {
      updateStatus(state, '当前选择下该操作不可用');
      return;
    }
    closeContextMenu(state);

    if (action === 'new-text') {
      pushHistory(state);
      connectPendingCreatedNode(state, addNodeAtPoint(state, state.contextMenuPoint, createCanvasTextNode({ text: '这里是新的文本节点' })));
      return;
    }
    if (action === 'new-note') {
      pushHistory(state);
      connectPendingCreatedNode(state, addNodeAtPoint(state, state.contextMenuPoint, createCanvasNoteNode({ text: '这里是新的便签节点' })));
      return;
    }
    if (action === 'new-config') {
      pushHistory(state);
      connectPendingCreatedNode(state, addNodeAtPoint(state, state.contextMenuPoint, createCanvasConfigNode({ composerContent: '在这里配置生成逻辑。' })));
      return;
    }
    if (action === 'new-loop') {
      pushHistory(state);
      connectPendingCreatedNode(state, addNodeAtPoint(state, state.contextMenuPoint, createCanvasLoopNode({ basePrompt: '一个可爱的小动物', variations: ['在花园里', '在雪地里', '在海边'] })));
      return;
    }
    if (action === 'new-llm') {
      pushHistory(state);
      connectPendingCreatedNode(state, addNodeAtPoint(state, state.contextMenuPoint, createCanvasLlmNode({ llmInput: '写一段赛博朋克风格的提示词' })));
      return;
    }
    if (action === 'new-media') {
      pushHistory(state);
      connectPendingCreatedNode(state, addNodeAtPoint(state, state.contextMenuPoint, createCanvasMediaNode({ kind: 'image', title: '上下文媒体节点' })));
      return;
    }
    if (action === 'upload-local-images') {
      await uploadLocalImages(state, state.contextMenuPoint);
      return;
    }
    if (action === 'upload-image') {
      pushHistory(state);
      await importMediaNodesFromBridge(state, state.contextMenuPoint);
      return;
    }
    if (action === 'duplicate-selected') {
      duplicateSelectedNodes(state);
      return;
    }
    if (action === 'tidy-selected') {
      tidySelectedNodes(state);
      return;
    }
    if (action === 'group-selected') {
      createGroupFromSelection(state);
      return;
    }
    if (action === 'ungroup-selected') {
      ungroupSelectedNodes(state);
      return;
    }
    if (action === 'select-group-members') {
      selectGroupMembersFromSelection(state);
      return;
    }
    if (action === 'rotate-left-selected') {
      rotateSelectedNodes(state, -15);
      return;
    }
    if (action === 'rotate-right-selected') {
      rotateSelectedNodes(state, 15);
      return;
    }
    if (action === 'smart-wire-selected') {
      smartWireSelectedNodes(state);
      return;
    }
    if (action === 'replace-sample-reference') {
      replaceSampleReferenceWithSelection(state);
      return;
    }
    if (action === 'fill-sample-from-history') {
      void fillSampleReferenceFromHistory(state);
      return;
    }
    if (action === 'toggle-lock-selected') {
      toggleLockSelectedNodes(state);
      return;
    }
    if (action === 'generate-selected') {
      await runSelectedGeneration(state);
      return;
    }
    if (action === 'run-llm-selected') {
      await runLlmNode(state);
      return;
    }
    if (action === 'add-selected-to-timeline') {
      addSelectedNodesToTimeline(state);
      return;
    }
    if (action === 'crop-selected') {
      await openCropDialog(state);
      return;
    }
    if (action === 'inpaint-selected') {
      await openInpaintDialog(state);
      return;
    }
    if (action === 'outpaint-selected') {
      await openOutpaintDialog(state);
      return;
    }
    if (action === 'upscale-selected') {
      await openUpscaleDialog(state);
      return;
    }
    if (action === 'delete-selected') {
      await deleteSelectedNodes(state);
      return;
    }
    if (action === 'favorite-selected') {
      await favoriteSelectedNode(state);
      return;
    }
    if (action === 'edit-loop-selected') {
      await openLoopEditDialog(state);
      return;
    }
    if (action === 'focus-selected') {
      focusSelectedNode(state);
      return;
    }
    if (action === 'fit-selection') {
      fitViewportToSelection(state);
      return;
    }
    if (action === 'cycle-role-selected') {
      cycleSelectedNodeRole(state);
      return;
    }
    if (action === 'open-inspector') {
      openInspectorForSelection(state);
      return;
    }
    if (action === 'select-connected') {
      selectConnectedNodes(state);
      return;
    }
    if (action === 'connect-selected') {
      connectSelectedNodes(state);
      return;
    }
    if (action === 'align-left') {
      alignSelectedNodes(state, 'left');
      return;
    }
    if (action === 'align-center-h') {
      alignSelectedNodes(state, 'center-h');
      return;
    }
    if (action === 'align-right') {
      alignSelectedNodes(state, 'right');
      return;
    }
    if (action === 'align-top') {
      alignSelectedNodes(state, 'top');
      return;
    }
    if (action === 'align-center-v') {
      alignSelectedNodes(state, 'center-v');
      return;
    }
    if (action === 'align-bottom') {
      alignSelectedNodes(state, 'bottom');
      return;
    }
    if (action === 'distribute-h') {
      distributeSelectedNodes(state, 'horizontal');
      return;
    }
    if (action === 'distribute-v') {
      distributeSelectedNodes(state, 'vertical');
      return;
    }
    if (action === 'toggle-minimap') {
      state.miniMapOpen = !state.miniMapOpen;
      writeViewPrefs(state);
      syncViewToggleButtons(state);
      persistProject(state);
      rerenderEditor(state, { skipPersist: true });
      return;
    }
    if (action === 'toggle-shortcuts') {
      setShortcutPanelOpen(state, !state.shortcutsOpen);
      return;
    }
    if (action === 'fit-view') {
      fitViewportToNodes(state);
      return;
    }
    if (action === 'reset-view') {
      pushHistory(state);
      state.viewport = { x: 0, y: 0, scale: 1 };
      persistProject(state);
      rerenderEditor(state);
      return;
    }
    // Fallback: reuse bound action handlers so menu never shows dead items.
    const fallback = state._actionHandlers?.get?.(action);
    if (typeof fallback === 'function') {
      const result = fallback(event);
      if (result && typeof result.then === 'function') {
        result.catch(error => console.error('context menu action failed', action, error));
      }
      return;
    }
    updateStatus(state, '该菜单项暂不可用');
  });

  state.sidebarForm?.addEventListener('input', event => {
    const node = getPrimarySelectedNode(state);
    if (!node) return;
    applyInspectorField(state, event.target, node);
  });

  state.root.addEventListener('click', event => {
    if (!event.target.closest('[data-role="context-menu"]')) {
      closeContextMenu(state);
    }
  });
}

function bindAction(state, action, handler) {
  if (!state || !state.root || typeof handler !== 'function') return;
  if (!state._actionHandlers) {
    state._actionHandlers = new Map();
    state.root.addEventListener('click', event => {
      const target = event.target instanceof Element
        ? event.target.closest('[data-action]')
        : null;
      if (!target || !state.root.contains(target)) return;
      // Context menu keeps its own action router.
      if (target.closest('[data-role="context-menu"]')) return;
      const actionName = target.getAttribute('data-action') || '';
      const fn = state._actionHandlers.get(actionName);
      if (!fn) return;
      const result = fn(event);
      if (result && typeof result.then === 'function') {
        result.catch(error => {
          console.error('canvas action failed', actionName, error);
        });
      }
    });
  }
  state._actionHandlers.set(action, handler);
}

async function fitCanvasMediaNodeToSource(state, nodeId, src, options = {}) {
  if (!nodeId || !src) return null;
  const measure = globalThis.ImageRatio?.measureImageSource;
  const fit = globalThis.ImageRatio?.fitNodeSize;
  if (typeof measure !== 'function' || typeof fit !== 'function') return null;
  const dims = await measure(src);
  if (!dims?.width || !dims?.height) return null;
  const node = state.project?.nodes?.[nodeId];
  if (!node) return null;
  const size = fit(dims.width, dims.height, Number(options.maxWidth) || 320, Number(options.maxHeight) || 320);
  node.width = size.width;
  node.height = size.height;
  node.naturalWidth = dims.width;
  node.naturalHeight = dims.height;
  node.updatedAt = Date.now();
  return node;
}

async function fitCanvasMediaNodes(state, nodeSpecs = [], options = {}) {
  const list = Array.isArray(nodeSpecs) ? nodeSpecs : [];
  const results = await Promise.all(list.map(item => fitCanvasMediaNodeToSource(state, item.id, item.src, options)));
  if (results.some(Boolean)) {
    persistProject(state);
    rerenderEditor(state);
  }
  return results.filter(Boolean);
}

function pushHistory(state) {
  if (!state.project || state.applyingHistory) return;
  state.undoStack.push(createCanvasProjectSnapshot(state.project));
  if (state.undoStack.length > 50) state.undoStack.shift();
  const hadRedo = state.redoStack.length > 0;
  state.redoStack.length = 0;
  if (hadRedo) void scheduleCanvasResourceGarbageCollection(state);
}

function undo(state) {
  if (!state.undoStack.length) {
    updateStatus(state, '没有可撤销的操作');
    return;
  }
  const snapshot = state.undoStack.pop();
  state.redoStack.push(createCanvasProjectSnapshot(state.project));
  restoreSnapshot(state, snapshot);
  void scheduleCanvasResourceGarbageCollection(state);
  updateStatus(state, '已撤锢');
}

function redo(state) {
  if (!state.redoStack.length) {
    updateStatus(state, '没有可重做的操作');
    return;
  }
  const snapshot = state.redoStack.pop();
  state.undoStack.push(createCanvasProjectSnapshot(state.project));
  restoreSnapshot(state, snapshot);
  void scheduleCanvasResourceGarbageCollection(state);
  updateStatus(state, '已重做');
}

function restoreSnapshot(state, snapshot) {
  state.applyingHistory = true;
  state.project = normalizeCanvasProject(snapshot);
  const index = state.projects.findIndex(entry => entry?.id === state.project?.id);
  if (index >= 0) {
    state.projectIndex = index;
    state.projects[index] = state.project;
  }
  state.viewport = {
    x: Number(state.project?.viewport?.x) || 0,
    y: Number(state.project?.viewport?.y) || 0,
    scale: Number(state.project?.viewport?.scale) || 1
  };
  state.selectedNodeIds = state.selectedNodeIds.filter(id => state.project?.nodes?.[id]);
  persistProject(state);
  void scheduleCanvasResourceGarbageCollection(state);
  rerenderEditor(state, { skipPersist: true });
  state.applyingHistory = false;
}

function applyInspectorField(state, field, node) {
  if (!field?.name) return;
  // Group rapid typing into one undo step.
  const now = Date.now();
  if (!state._inspectorHistoryAt || now - state._inspectorHistoryAt > 700) {
    pushHistory(state);
  }
  state._inspectorHistoryAt = now;
  const name = field.name;

  if (name === 'title') node.title = field.value;
  if (name === 'text') node.text = field.value;
  if (name === 'text' && node.type === 'llm') node.llmInput = field.value;
  if (name === 'composerContent' && node.type === 'config') node.composerContent = field.value;
  if (name === 'canvasRole') node.canvasRole = field.value || '';
  if (name === 'targetNodeId' && node.type === 'config') node.targetNodeId = field.value || '';
  if (name === 'model' && node.type === 'config') {
    ensureCanvasConfigNode(node);
    node.genConfig.model = field.value || '';
  }
  if (name === 'aspect' && node.type === 'config') {
    ensureCanvasConfigNode(node);
    node.genConfig.aspect = field.value || '';
  }
  if (name === 'resolution' && node.type === 'config') {
    ensureCanvasConfigNode(node);
    node.genConfig.resolution = field.value || '';
  }
  if (name === 'quality' && node.type === 'config') {
    ensureCanvasConfigNode(node);
    node.genConfig.quality = field.value || '';
  }
  if (name === 'count' && node.type === 'config') {
    ensureCanvasConfigNode(node);
    node.genConfig.count = Math.max(1, Math.min(10, Math.round(toNumber(field.value, 1))));
  }
  if (name === 'kind' && node.type === 'media') {
    node.kind = field.value || 'image';
    ensureCanvasMediaNodeClip(node);
    node.clip.trackId = getPreferredTrackIdForKind(node.kind);
  }
  if (name === 'x') node.x = toNumber(field.value, node.x);
  if (name === 'y') node.y = toNumber(field.value, node.y);
  if (name === 'width') node.width = Math.max(80, toNumber(field.value, node.width));
  if (name === 'height') node.height = Math.max(60, toNumber(field.value, node.height));
  if (name === 'rotation') node.rotation = toNumber(field.value, node.rotation);

  if (node.type === 'media') {
    ensureCanvasMediaNodeClip(node);
    if (name === 'trackId') node.clip.trackId = field.value || getPreferredTrackIdForKind(node.kind);
    if (name === 'durationSeconds') node.durationMs = Math.max(500, Math.round(toNumber(field.value, 0) * 1000));
    if (name === 'timelineStartSeconds') node.clip.startMs = Math.max(0, Math.round(toNumber(field.value, 0) * 1000));
    if (name === 'trimInSeconds') node.clip.trimInMs = Math.max(0, Math.round(toNumber(field.value, 0) * 1000));
    if (name === 'clipDurationSeconds') node.clip.durationMs = Math.max(500, Math.round(toNumber(field.value, 1) * 1000));
    if (name === 'durationSeconds' && node.clip.durationMs > node.durationMs) {
      node.clip.durationMs = node.durationMs;
    }
  }

  if (node.type === 'config') {
    ensureCanvasConfigNode(node);
  }

  upsertCanvasNode(state.project, node);
  syncPlayheadToSelectedNode(state);
  persistProject(state);
  rerenderEditor(state, { skipPersist: true });
}

function setSidebarTab(state, tabId = 'actions') {
  state.activeSidebarTab = tabId === 'inspector' ? 'inspector' : 'actions';
  // Focus mode owns chrome density: don't auto-expand sidebar just because inspector is active.
  // Explicit open-inspector actions still expand via openInspectorForSelection / open-inspector.
  if (state.activeSidebarTab === 'inspector' && state.sidebarCollapsed && !state.focusMode) {
    setSidebarCollapsed(state, false, { persist: true });
  }
  state.sidebarTabs.forEach(button => {
    const active = button.dataset.tab === state.activeSidebarTab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  state.sidebarPanels.forEach(panel => {
    panel.hidden = panel.dataset.tabPanel !== state.activeSidebarTab;
  });
  syncInspectorTabChrome(state);
}

function startNodeDrag(state, nodeId, event) {
  const node = state.project?.nodes?.[nodeId];
  if (!node) return;

  event.preventDefault();
  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  const alreadySelected = state.selectedNodeIds.includes(nodeId);
  const nextSelection = additive
    ? (alreadySelected ? state.selectedNodeIds.filter(id => id !== nodeId) : dedupe([...state.selectedNodeIds, nodeId]))
    : (alreadySelected && state.selectedNodeIds.length > 1 ? state.selectedNodeIds : [nodeId]);
  setSelectedNodes(state, nextSelection, { openInspector: false, rerender: true, persist: false });
  const dragIds = collectGroupAwareNodeIds(state, state.selectedNodeIds)
    .filter(id => {
      const current = state.project?.nodes?.[id];
      return current && !current.locked;
    });
  if (!dragIds.length) {
    updateStatus(state, '锁定节点不能拖动');
    return;
  }
  invalidateSnapTargetCache(state);
  state.dragState = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    axisLock: null,
    autoPanAccumX: 0,
    autoPanAccumY: 0,
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    startPositions: dragIds.map(id => ({
      id,
      x: state.project.nodes[id]?.x || 0,
      y: state.project.nodes[id]?.y || 0
    })),
    affectedEdgeIds: collectConnectedEdgeIds(state.project, dragIds)
  };
  try { state.stage?.setPointerCapture?.(event.pointerId); } catch {}
  const selectedUnlocked = state.selectedNodeIds.filter(id => dragIds.includes(id));
  const lockedSkipped = Math.max(0, state.selectedNodeIds.length - selectedUnlocked.length);
  const memberExtra = Math.max(0, dragIds.length - selectedUnlocked.length);
  const base = memberExtra > 0
    ? `已复制 ${selectedUnlocked.length} 个节点（含组内 ${memberExtra} 个成员）`
    : `已复制 ${dragIds.length} 个节点`;
  updateStatus(state, lockedSkipped > 0 ? `${base}（已跳过锁定）` : base);
}

function startNodeResize(state, nodeId, handle = 'se', event) {
  const node = state.project?.nodes?.[nodeId];
  if (!node || node.locked) {
    updateStatus(state, '锁定节点不能调整大小');
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  setSelectedNodes(state, [nodeId], { openInspector: false, rerender: true, persist: false });
  pushHistory(state);
  state.resizeState = {
    pointerId: event.pointerId,
    nodeId,
    handle: ['nw', 'ne', 'sw', 'se'].includes(handle) ? handle : 'se',
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: Number(node.x) || 0,
    startY: Number(node.y) || 0,
    startWidth: Math.max(80, Number(node.width) || 160),
    startHeight: Math.max(60, Number(node.height) || 96),
    affectedEdgeIds: collectConnectedEdgeIds(state.project, [nodeId])
  };
  try { state.stage?.setPointerCapture?.(event.pointerId); } catch {}
  updateStatus(state, '拖动调整节点大小（Shift 保持比例）');
}

function updateNodeResizeState(state, event) {
  if (!state.resizeState) return;
  const node = state.project?.nodes?.[state.resizeState.nodeId];
  if (!node) return;
  const scale = Number(state.viewport?.scale) || 1;
  const dx = (event.clientX - state.resizeState.startClientX) / scale;
  const dy = (event.clientY - state.resizeState.startClientY) / scale;
  const keepRatio = Boolean(event.shiftKey || (node.type === 'media' && node.kind === 'image' && !node.freeResize));
  const ratio = state.resizeState.startWidth / Math.max(1, state.resizeState.startHeight);
  const handle = state.resizeState.handle;
  const fromLeft = handle.includes('w');
  const fromTop = handle.includes('n');
  let width = state.resizeState.startWidth + (fromLeft ? -dx : dx);
  let height = state.resizeState.startHeight + (fromTop ? -dy : dy);
  if (keepRatio) {
    const widthChange = Math.abs(width - state.resizeState.startWidth) / Math.max(1, state.resizeState.startWidth);
    const heightChange = Math.abs(height - state.resizeState.startHeight) / Math.max(1, state.resizeState.startHeight);
    if (widthChange >= heightChange) height = width / ratio;
    else width = height * ratio;
  }

  node.width = Math.max(80, Math.round(width));
  node.height = Math.max(60, Math.round(height));
  node.x = fromLeft
    ? state.resizeState.startX + state.resizeState.startWidth - node.width
    : state.resizeState.startX;
  node.y = fromTop
    ? state.resizeState.startY + state.resizeState.startHeight - node.height
    : state.resizeState.startY;
  upsertCanvasNode(state.project, node);
  renderLiveResizeFrame(state);
  updateStatus(state, `尺寸 ${node.width} × ${node.height}${keepRatio ? '（锁定比例）' : ''}`);
}

function endNodeResizeState(state) {
  if (!state.resizeState) return;
  state.resizeState = null;
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, '已调整节点大小');
}

function getNodeCenterClientPoint(state, node) {
  const stageRect = state.stage?.getBoundingClientRect?.();
  if (!stageRect || !node) return { x: 0, y: 0 };
  const scale = Number(state.viewport?.scale) || 1;
  const vx = Number(state.viewport?.x) || 0;
  const vy = Number(state.viewport?.y) || 0;
  const width = Number(node.width) || 160;
  const height = Number(node.height) || 96;
  return {
    x: stageRect.left + vx + ((Number(node.x) || 0) + width / 2) * scale,
    y: stageRect.top + vy + ((Number(node.y) || 0) + height / 2) * scale
  };
}

function startNodeRotate(state, nodeId, event) {
  const node = state.project?.nodes?.[nodeId];
  if (!node || node.locked) {
    updateStatus(state, '锁定节点不能旋转');
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  setSelectedNodes(state, [nodeId], { openInspector: false, rerender: true, persist: false });
  pushHistory(state);
  const center = getNodeCenterClientPoint(state, node);
  const startAngle = Math.atan2(event.clientY - center.y, event.clientX - center.x) * 180 / Math.PI;
  state.rotateState = {
    pointerId: event.pointerId,
    nodeId,
    centerX: center.x,
    centerY: center.y,
    startPointerAngle: startAngle,
    startRotation: Number(node.rotation) || 0,
    affectedEdgeIds: collectConnectedEdgeIds(state.project, [nodeId])
  };
  try { state.stage?.setPointerCapture?.(event.pointerId); } catch {}
  updateStatus(state, '拖动旋转节点（Shift 吸附 15°）');
}

function updateNodeRotateState(state, event) {
  if (!state.rotateState) return;
  const node = state.project?.nodes?.[state.rotateState.nodeId];
  if (!node) return;
  const angle = Math.atan2(event.clientY - state.rotateState.centerY, event.clientX - state.rotateState.centerX) * 180 / Math.PI;
  let next = state.rotateState.startRotation + (angle - state.rotateState.startPointerAngle);
  if (event.shiftKey) next = Math.round(next / 15) * 15;
  node.rotation = Math.round(next * 100) / 100;
  upsertCanvasNode(state.project, node);
  renderLiveRotateFrame(state);
  updateStatus(state, `旋转 ${Math.round(node.rotation)}°${event.shiftKey ? '（吸附 15°）' : ''}`);
}

function endNodeRotateState(state) {
  if (!state.rotateState) return;
  state.rotateState = null;
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, '已旋转节点');
}

function resolveConnectSide(side = 'right') {
  const value = String(side || '').toLowerCase();
  if (value === 'left' || value === 'in') return 'left';
  if (value === 'right' || value === 'out') return 'right';
  return 'right';
}

function getNodeConnectionPoint(state, nodeId, side = 'right') {
  const node = state.project?.nodes?.[nodeId];
  if (!node) return null;
  const x = (Number(node.x) || 0) + (side === 'left' ? 0 : (Number(node.width) || 0));
  const y = (Number(node.y) || 0) + ((Number(node.height) || 0) / 2);
  return { x, y };
}

function clearClickConnectSource(state, options = {}) {
  const had = Boolean(state.clickConnectFromId);
  state.clickConnectFromId = '';
  state.clickConnectFromSide = '';
  state.stage?.classList?.toggle('has-click-connect-source', false);
  // Drop click-connect ghost preview without creating an edge.
  if (state.connectState?.clickPreview) {
    state.connectState = null;
    stopEdgeAutoPanLoop(state);
    clearConnectTargetHighlights(state);
    try { rerenderEditor(state, { skipPersist: true, lightChrome: true }); } catch {}
  } else if (state.nodeLayer && !state.connectState) {
    state.nodeLayer.querySelectorAll('.is-connect-source').forEach(el => el.classList.remove('is-connect-source'));
  }
  syncStageCursor(state);
  if (had && options.silent !== true) {
    updateStatus(state, state.interactionMode === 'connect' ? '已取消源节点，可重新点击选择' : '已取消连线', { stickyMs: 1200 });
  }
  try { syncConnectTip(state); } catch {}
}

function setClickConnectSource(state, nodeId, side = 'out') {
  const node = state.project?.nodes?.[nodeId];
  if (!node) return false;
  const fromSide = resolveConnectSide(side) || 'right';
  state.clickConnectFromId = nodeId;
  state.clickConnectFromSide = fromSide;
  state.stage?.classList?.toggle('has-click-connect-source', true);
  if (state.nodeLayer) {
    state.nodeLayer.querySelectorAll('[data-node-id]').forEach(el => {
      el.classList.toggle('is-connect-source', el.dataset.nodeId === nodeId);
    });
  }
  // Ghost preview line follows cursor until target click / cancel.
  const startPoint = getNodeConnectionPoint(state, nodeId, fromSide);
  state.connectState = {
    pointerId: null,
    fromNodeId: nodeId,
    fromSide,
    currentPoint: { ...startPoint },
    startPoint,
    previewTargetNodeId: '',
    previewValid: false,
    snapped: false,
    lastClientX: Number.NaN,
    lastClientY: Number.NaN,
    clickPreview: true
  };
  syncStageCursor(state);
  renderLiveConnectionFrame(state);
  try { syncConnectTip(state); } catch {}
  updateStatus(state, '已选源节点，移动到目标节点点击完成（Esc 取消）', { stickyMs: 1800 });
  return true;
}

function createEdgeBetweenNodes(state, fromNodeId, toNodeId, options = {}) {
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return null;
  if (!canCreateEdgeBetween(fromNodeId, toNodeId)) return null;
  const fromNode = state.project?.nodes?.[fromNodeId];
  const toNode = state.project?.nodes?.[toNodeId];
  if (!fromNode || !toNode) return null;
  if (hasEdgeBetween(state.project, fromNodeId, toNodeId)) {
    if (options.silent !== true) updateStatus(state, '这两个节点已经连过了', { stickyMs: 1400 });
    return null;
  }
  if (options.pushHistory !== false) pushHistory(state);
  const edge = upsertCanvasEdge(state.project, {
    fromNodeId,
    toNodeId,
    kind: options.kind || 'relation'
  });
  persistProject(state, options.immediate ? { immediate: true } : {});
  if (options.rerender !== false) rerenderEditor(state, { skipPersist: true });
  if (options.silent !== true) {
    const fromTitle = fromNode.title || getNodeTypeLabel(fromNode) || '源节点';
    const toTitle = toNode.title || getNodeTypeLabel(toNode) || '目标节点';
    updateStatus(state, '已连接：' + fromTitle + ' →' + toTitle, { tone: 'success', stickyMs: 1800 });
  }
  return edge;
}

function completeClickConnect(state, targetNodeId) {
  const sourceId = state.clickConnectFromId;
  if (!sourceId) return false;
  if (!targetNodeId) {
    clearClickConnectSource(state);
    return false;
  }
  if (targetNodeId === sourceId) {
    updateStatus(state, '不能连接到自己，请点另一个节点', { stickyMs: 1400 });
    return false;
  }
  // Drop ghost preview before edge create/rerender so result edges render cleanly.
  if (state.connectState?.clickPreview) {
    state.connectState = null;
    stopEdgeAutoPanLoop(state);
  }
  const edge = createEdgeBetweenNodes(state, sourceId, targetNodeId);
  clearClickConnectSource(state, { silent: true });
  if (edge && state.interactionMode === 'connect') {
    updateStatus(state, '连线完成，可继续点选下一组节点', { tone: 'success', stickyMs: 1600 });
  }
  return Boolean(edge);
}

function startNodeConnection(state, nodeId, side, event) {
  const node = state.project?.nodes?.[nodeId];
  if (!node) return;
  event.preventDefault();
  event.stopPropagation();
  // In connect mode, handle click sets/completes source without drag preview.
  if (state.interactionMode === 'connect' && !state.clickConnectFromId) {
    setClickConnectSource(state, nodeId, side);
    return;
  }
  if (state.interactionMode === 'connect' && state.clickConnectFromId) {
    completeClickConnect(state, nodeId);
    return;
  }
  const fromSide = resolveConnectSide(side);
  // Real handle-drag takes over any click-connect ghost.
  state.clickConnectFromId = '';
  state.clickConnectFromSide = '';
  state.stage?.classList?.toggle('has-click-connect-source', false);
  state.connectState = {
    pointerId: event.pointerId,
    fromNodeId: nodeId,
    fromSide,
    currentPoint: getWorldPoint(state, getStagePoint(state, event)),
    startPoint: getNodeConnectionPoint(state, nodeId, fromSide),
    previewTargetNodeId: '',
    previewValid: false,
    snapped: false,
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    clickPreview: false
  };
  try { state.stage?.setPointerCapture?.(event.pointerId); } catch {}
  updateStatus(state, '拖到目标节点后松开即可连线（靠近自动吸附）');
  renderLiveConnectionFrame(state);
}

function updateClickConnectHover(state, event) {
  if (!state?.clickConnectFromId) return;
  if (!state.connectState?.clickPreview) {
    // Ensure ghost state exists if source set via API without preview bootstrap.
    setClickConnectSource(state, state.clickConnectFromId, state.clickConnectFromSide || 'out');
  }
  if (!state.connectState?.clickPreview) return;
  updateConnectionState(state, event);
}

function updateConnectionState(state, event) {
  if (!state.connectState) return;
  if (event) {
    state.connectState.lastClientX = event.clientX;
    state.connectState.lastClientY = event.clientY;
  }
  const clientX = event?.clientX ?? state.connectState.lastClientX;
  const clientY = event?.clientY ?? state.connectState.lastClientY;
  if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
    maybeApplyEdgeAutoPan(state, clientX, clientY, { source: 'connect' });
    const fakeEvent = { clientX, clientY };
    const pointerWorld = getWorldPoint(state, getStagePoint(state, fakeEvent));
    const resolved = resolveConnectionPreviewTarget(state, pointerWorld, {
      clientX,
      clientY,
      fromNodeId: state.connectState.fromNodeId
    });
    state.connectState.currentPoint = resolved.currentPoint;
    state.connectState.previewTargetNodeId = resolved.targetNodeId || '';
    state.connectState.previewValid = Boolean(resolved.valid);
    state.connectState.snapped = Boolean(resolved.snapped);
    if (resolved.targetNodeId) {
      const title = state.project?.nodes?.[resolved.targetNodeId]?.title || '目标节点';
      updateStatus(state, resolved.valid
        ? (resolved.snapped ? `已吸附：${title}（松开创建连接）` : `可连接到「${title}」`)
        : `无法连接到：${title}`);
    } else {
      updateStatus(state, '拖到目标节点后松开即可连线（靠近自动吸附）');
    }
  }
  ensureEdgeAutoPanLoop(state);
  renderLiveConnectionFrame(state);
}

function endConnectionState(state) {
  if (!state.connectState) return;
  // Click-to-connect keeps a soft preview; only explicit complete/clear ends it.
  if (state.connectState.clickPreview) return;
  const connection = state.connectState;
  state.connectState = null;
  stopEdgeAutoPanLoop(state);
  clearConnectTargetHighlights(state);

  const targetNodeId = connection.previewTargetNodeId;
  if (targetNodeId && canCreateEdgeBetween(connection.fromNodeId, targetNodeId)) {
    const edge = createEdgeBetweenNodes(state, connection.fromNodeId, targetNodeId);
    if (edge) return;
  }

  if (!targetNodeId && Number.isFinite(connection.lastClientX) && Number.isFinite(connection.lastClientY)) {
    const pointerEvent = { clientX: connection.lastClientX, clientY: connection.lastClientY };
    state.contextMenuPoint = getStagePoint(state, pointerEvent);
    rerenderEditor(state, { skipPersist: true, forceFullChrome: true, reason: 'connect-create-menu' });
    openContextMenu(state, connection.lastClientX, connection.lastClientY, {
      section: 'create',
      pendingConnectionFromId: connection.fromNodeId
    });
    updateStatus(state, '选择下游节点类型，创建后将自动连线');
    return;
  }

  rerenderEditor(state, { skipPersist: true, forceFullChrome: true, reason: 'connect-end' });
  if (targetNodeId) updateStatus(state, '无法创建该连线');
  else updateStatus(state, '已取消连线');
}

function updateDragState(state, event) {
  if (!state.dragState) return;
  if (event) {
    state.dragState.lastClientX = event.clientX;
    state.dragState.lastClientY = event.clientY;
    state.dragState.forceGrid = event.ctrlKey || event.metaKey;
    state.dragState.axisLockEnabled = event.shiftKey;
  }
  const clientX = event?.clientX ?? state.dragState.lastClientX;
  const clientY = event?.clientY ?? state.dragState.lastClientY;
  if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
    maybeApplyEdgeAutoPan(state, clientX, clientY, { source: 'drag' });
  }
  ensureEdgeAutoPanLoop(state);

  const scale = state.viewport.scale || 1;
  let deltaX = ((clientX - state.dragState.startClientX) / scale) + (state.dragState.autoPanAccumX || 0);
  let deltaY = ((clientY - state.dragState.startClientY) / scale) + (state.dragState.autoPanAccumY || 0);
  const forceGrid = Boolean(event ? (event.ctrlKey || event.metaKey) : state.dragState.forceGrid);
  const axisLockEnabled = Boolean(event ? event.shiftKey : state.dragState.axisLockEnabled);
  if (axisLockEnabled) {
    if (!state.dragState.axisLock) {
      state.dragState.axisLock = Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y';
    }
    if (state.dragState.axisLock === 'x') deltaY = 0;
    else deltaX = 0;
  } else {
    state.dragState.axisLock = null;
  }
  const movingIds = new Set((state.dragState.startPositions || []).map(entry => entry.id));
  let adjustX = 0;
  let adjustY = 0;
  let guides = [];
  let snapLabel = '';

  // Prefer multi-selection bounds snap so groups/multi-drag align as a unit.
  const snapResult = resolveDragSnapForMove(state, state.dragState.startPositions || [], deltaX, deltaY, movingIds, {
    forceGrid,
    lockAxis: state.dragState.axisLock || ''
  });
  adjustX = snapResult.adjustX || 0;
  adjustY = snapResult.adjustY || 0;
  guides = snapResult.guides || [];
  snapLabel = snapResult.label || '';

  const finalDeltaX = deltaX + adjustX;
  const finalDeltaY = deltaY + adjustY;
  if (!state.dragState.historyPushed && (Math.abs(finalDeltaX) > 0.5 || Math.abs(finalDeltaY) > 0.5)) {
    pushHistory(state);
    state.dragState.historyPushed = true;
  }

  state.dragState.startPositions.forEach(entry => {
    const current = state.project?.nodes?.[entry.id];
    if (!current || current.locked) return;
    current.x = Math.round(entry.x + finalDeltaX);
    current.y = Math.round(entry.y + finalDeltaY);
  });
  state.snapGuides = guides;
  const axisLabel = state.dragState.axisLock === 'x' ? '水平锁定' : (state.dragState.axisLock === 'y' ? '垂直锁定' : '');
  if (snapLabel || axisLabel) {
    updateStatus(state, [axisLabel, snapLabel].filter(Boolean).join(' · '));
  }
  renderLiveDragFrame(state);
}

function endDragState(state) {
  if (!state.dragState) return;
  const hadMove = Boolean(state.dragState.historyPushed);
  state.dragState = null;
  stopEdgeAutoPanLoop(state);
  state.snapGuides = [];
  clearSnapGuides(state);
  // Keep group frames wrapped around members after member/group moves.
  const touchedGroupIds = new Set();
  (state.selectedNodeIds || []).forEach(id => {
    const node = state.project?.nodes?.[id];
    if (!node) return;
    if (node.type === 'group') touchedGroupIds.add(node.id);
    if (node.groupId) touchedGroupIds.add(node.groupId);
  });
  touchedGroupIds.forEach(groupId => fitGroupBoundsToMembers(state, groupId, { padding: 36 }));
  if (state.selectedNodeIds.length === 1) {
    setSidebarTab(state, 'inspector');
  }
  if (hadMove) persistProject(state);
  rerenderEditor(state, { skipPersist: true, forceFullChrome: true, reason: 'drag-end' });
  if (hadMove) updateStatus(state, '已移动节点');
}

function startPan(state, event, options = {}) {
  event.preventDefault();
  state._gestureStats = state._gestureStats || { panStarts: 0, panFrames: 0, boxStarts: 0 };
  state._gestureStats.panStarts += 1;
  state.panState = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startViewport: { ...state.viewport },
    deselectOnClick: Boolean(options.deselectOnClick),
    hasMoved: false
  };
  try { state.stage?.setPointerCapture?.(event.pointerId); } catch {}
  syncStageCursor(state);
  updateStatus(state, '正在平移画布');
}

function toggleContextMenuSection(state, section) {
  if (!state.contextMenuSubmenus?.length) return;
  const next = section || null;
  state.contextMenuSection = next;
  state.contextMenuSubmenus.forEach(menu => {
    menu.hidden = menu.dataset.menuSubmenu !== next;
  });
  state.contextMenuSections?.forEach(button => {
    button.classList.toggle('is-active', Boolean(next) && button.dataset.menuSection === next);
    button.setAttribute('aria-expanded', button.dataset.menuSection === next ? 'true' : 'false');
  });
}

function closeContextMenu(state) {
  if (state.contextMenu) state.contextMenu.hidden = true;
  toggleContextMenuSection(state, null);
}

function updatePanState(state, event) {
  if (!state.panState) return;
  const deltaX = event.clientX - state.panState.startClientX;
  const deltaY = event.clientY - state.panState.startClientY;
  state._gestureStats.panFrames = (Number(state._gestureStats.panFrames) || 0) + 1;
  state._gestureStats.lastPanDeltaX = deltaX;
  state._gestureStats.lastPanDeltaY = deltaY;
  if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
    state.panState.hasMoved = true;
  }
  state.viewport = {
    ...state.panState.startViewport,
    x: state.panState.startViewport.x + deltaX,
    y: state.panState.startViewport.y + deltaY
  };
  if (state.viewportElement) {
    state.viewportElement.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})`;
  }
  syncZoomLabel(state);
  // The minimap structure is stable while panning; only move its viewport rectangle.
  if (state.miniMap && state.miniMapOpen) {
    updateCanvasMiniMapViewport(state.miniMap, state.viewport);
  }
}

function endPanState(state) {
  if (!state.panState) return;
  state._gestureStats.panEnds = (Number(state._gestureStats.panEnds) || 0) + 1;
  const shouldDeselect = state.panState.deselectOnClick && !state.panState.hasMoved;
  const hadMove = Boolean(state.panState.hasMoved);
  state.panState = null;
  syncStageCursor(state);
  if (shouldDeselect) {
    setSelectedNodes(state, [], { rerender: false, persist: false });
  }
  if (hadMove) {
    pushViewportHistory(state, { force: true, minGapMs: 0 });
  }
  if (hadMove) {
    persistProject(state);
    rerenderEditor(state, { skipPersist: true, forceFullChrome: true, reason: 'pan-end' });
    updateStatus(state, '已平移画布', { stickyMs: 700 });
  } else {
    rerenderEditor(state, { skipPersist: true, forceFullChrome: true, reason: 'pan-click' });
    updateStatus(state, state.selectedNodeIds.length ? `已选中 ${state.selectedNodeIds.length} 个节点` : '就绪');
  }
}

function startBoxSelection(state, event) {
  state._gestureStats = state._gestureStats || { panStarts: 0, panFrames: 0, boxStarts: 0 };
  state._gestureStats.boxStarts += 1;
  const rect = state.stage.getBoundingClientRect();
  state.boxState = {
    startClientX: event.clientX,
    startClientY: event.clientY,
    startLocalX: event.clientX - rect.left,
    startLocalY: event.clientY - rect.top,
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    autoPanAccumX: 0,
    autoPanAccumY: 0
  };
  setSelectedNodes(state, [], { openInspector: false });
  state.selectedEdgeId = '';
  state.selectionBox.hidden = false;
  state.selectionBox.style.left = `${state.boxState.startLocalX}px`;
  state.selectionBox.style.top = `${state.boxState.startLocalY}px`;
  state.selectionBox.style.width = '0px';
  state.selectionBox.style.height = '0px';
  updateStatus(state, '框选中。');
}

function updateBoxSelectionState(state, event) {
  if (!state.boxState) return;
  if (event) {
    state.boxState.lastClientX = event.clientX;
    state.boxState.lastClientY = event.clientY;
  }
  const clientX = event?.clientX ?? state.boxState.lastClientX;
  const clientY = event?.clientY ?? state.boxState.lastClientY;
  if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
    maybeApplyEdgeAutoPan(state, clientX, clientY, { source: 'box' });
  }
  ensureEdgeAutoPanLoop(state);

  const rect = state.stage.getBoundingClientRect();
  const currentLocalX = clientX - rect.left;
  const currentLocalY = clientY - rect.top;
  const startLocalX = state.boxState.startLocalX + (state.boxState.autoPanAccumX || 0);
  const startLocalY = state.boxState.startLocalY + (state.boxState.autoPanAccumY || 0);
  const left = Math.min(startLocalX, currentLocalX);
  const top = Math.min(startLocalY, currentLocalY);
  const width = Math.abs(currentLocalX - startLocalX);
  const height = Math.abs(currentLocalY - startLocalY);

  state.selectionBox.style.left = `${left}px`;
  state.selectionBox.style.top = `${top}px`;
  state.selectionBox.style.width = `${width}px`;
  state.selectionBox.style.height = `${height}px`;

  const worldBox = {
    x: (left - state.viewport.x) / state.viewport.scale,
    y: (top - state.viewport.y) / state.viewport.scale,
    width: width / state.viewport.scale,
    height: height / state.viewport.scale
  };
  const selected = hitTestBoxSelection(worldBox, getProjectNodeList(state.project));
  setSelectedNodes(state, selected, { rerender: false, persist: false, openInspector: false });
  renderLiveBoxSelectionFrame(state);
  updateStatus(state, selected.length ? `框选中。已选${selected.length} 个` : '框选中。');
}

function endBoxSelectionState(state) {
  if (!state.boxState) return;
  state.boxState = null;
  stopEdgeAutoPanLoop(state);
  state.selectionBox.hidden = true;
  if (state.selectedNodeIds.length === 1) {
    setSidebarTab(state, 'inspector');
  }
  rerenderEditor(state, { skipPersist: true });
  updateStatus(state, state.selectedNodeIds.length
    ? `已框选${state.selectedNodeIds.length} 个节点`
    : `当前共 ${Object.keys(state.project?.nodes || {}).length} 个节点`);
}

function startTimelineClipInteraction(state, nodeId, mode, event) {
  const node = state.project?.nodes?.[nodeId];
  if (!node || node.type !== 'media') return;
  ensureCanvasMediaNodeClip(node);
  event.preventDefault();
  pushHistory(state);
  setSelectedNodes(state, [nodeId], { rerender: true, persist: false });
  syncPlayheadToSelectedNode(state);
  state.timelineDragState = {
    nodeId,
    mode,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startStartMs: node.clip.startMs || 0,
    startDurationMs: node.clip.durationMs || node.durationMs || 4000,
    startTrackId: node.clip.trackId || getPreferredTrackIdForKind(node.kind),
    startTrackIndex: Math.max(0, (state.project?.timeline?.tracks || []).findIndex(track => track.id === (node.clip.trackId || getPreferredTrackIdForKind(node.kind))))
  };
  updateStatus(state, mode === 'resize' ? '正在调整片段时长' : '正在移动时间轴片段');
}

function updateTimelineClipInteraction(state, event) {
  if (!state.timelineDragState) return;
  const node = state.project?.nodes?.[state.timelineDragState.nodeId];
  if (!node || node.type !== 'media') return;
  ensureCanvasMediaNodeClip(node);

  const deltaMs = Math.round(((event.clientX - state.timelineDragState.startClientX) / TIMELINE_PIXELS_PER_SECOND) * 1000);
  if (state.timelineDragState.mode === 'move') {
    node.clip.startMs = Math.max(0, state.timelineDragState.startStartMs + deltaMs);
    node.clip.trackId = resolveTrackIdFromPointer(
      state,
      state.timelineDragState.startTrackId,
      event.clientY,
      state.timelineDragState.startTrackIndex,
      state.timelineDragState.startClientY
    );
  } else {
    node.clip.durationMs = Math.max(500, state.timelineDragState.startDurationMs + deltaMs);
    if (Number.isFinite(node.durationMs) && node.clip.durationMs > node.durationMs) {
      node.clip.durationMs = node.durationMs;
    }
  }

  setTimelineCurrentTime(state.project, node.clip.startMs);
  rerenderEditor(state, { skipPersist: true });
}

function endTimelineClipInteraction(state) {
  if (!state.timelineDragState) return;
  state.timelineDragState = null;
  syncPlayheadToSelectedNode(state);
  persistProject(state);
  rerenderEditor(state);
}

function resolveTrackIdFromPointer(state, fallbackTrackId, clientY, startTrackIndex = -1, startClientY = 0) {
  const lanes = [...(state.timelineLayer?.querySelectorAll?.('.canvas-timeline-lane') || [])];
  if (Number.isFinite(startTrackIndex) && startTrackIndex >= 0 && lanes.length) {
    const deltaRows = Math.round((clientY - startClientY) / TIMELINE_LANE_STEP);
    const nextIndex = clamp(startTrackIndex + deltaRows, 0, lanes.length - 1);
    const nextTrackId = lanes[nextIndex]?.dataset?.trackId;
    if (nextTrackId) return nextTrackId;
  }

  for (const lane of lanes) {
    const rect = lane.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return lane.dataset.trackId || fallbackTrackId;
    }
  }

  if (!lanes.length) return fallbackTrackId;
  const firstRect = lanes[0].getBoundingClientRect();
  const laneIndex = clamp(Math.round((clientY - firstRect.top) / TIMELINE_LANE_STEP), 0, lanes.length - 1);
  return lanes[laneIndex]?.dataset?.trackId || fallbackTrackId;
}

function openContextMenu(state, clientX, clientY, options = {}) {
  if (!state.contextMenu) return;
  state.pendingConnectionFromId = options.pendingConnectionFromId || '';
  state.contextMenu.hidden = false;
  state.contextMenu.style.position = 'fixed';

  const selectedCount = state.selectedNodeIds?.length || 0;
  const nodes = (state.selectedNodeIds || []).map(id => state.project?.nodes?.[id]).filter(Boolean);
  const hasMedia = nodes.some(node => node.type === 'media');
  const hasConfigLike = nodes.some(node => node.type === 'config' || node.type === 'loop' || node.type === 'llm');
  const preferred = options.section
    || (selectedCount >= 2 ? 'align'
      : (selectedCount === 1
        ? (hasConfigLike || hasMedia ? 'smart' : 'selection')
        : 'create'));

  syncContextMenuAvailability(state, { preferredSection: preferred });

  // Clamp inside viewport so nested menus stay usable near edges.
  // Measure after availability toggles so height reflects visible items.
  const menuWidth = state.contextMenu.offsetWidth || 220;
  const menuHeight = state.contextMenu.offsetHeight || 280;
  const maxLeft = Math.max(8, window.innerWidth - menuWidth - 8);
  const maxTop = Math.max(8, window.innerHeight - menuHeight - 8);
  const left = Math.min(Math.max(8, Number(clientX) || 0), maxLeft);
  const top = Math.min(Math.max(8, Number(clientY) || 0), maxTop);
  state.contextMenu.style.left = `${left}px`;
  state.contextMenu.style.top = `${top}px`;

  toggleContextMenuSection(state, preferred);

  // Update root hints for faster scanning.
  state.contextMenuSections?.forEach(button => {
    const section = button.dataset.menuSection;
    button.classList.toggle('is-active', section === preferred);
    const small = button.querySelector('small');
    if (!small) return;
    if (section === 'selection') {
      small.textContent = selectedCount ? `已选${selectedCount}` : '复制 / 设置 / 删除';
    } else if (section === 'align') {
      small.textContent = selectedCount >= 2 ? `多选 ${selectedCount}` : '多选后可用';
    } else if (section === 'smart') {
      small.textContent = hasConfigLike ? '生成 / 接线' : (hasMedia ? '裁剪 / 放大 / 接线' : '生成 / 裁剪 / 放大');
    } else if (section === 'create') {
      small.textContent = selectedCount ? '继续添加' : '文本 / 媒体 / 智能';
    } else if (section === 'view') {
      small.textContent = selectedCount ? '适配所选 / 重置' : '适配 / 重置';
    }
  });
}

function setContextMenuItemState(el, { hidden = false, disabled = false } = {}) {
  if (!el) return;
  el.hidden = Boolean(hidden);
  if ('disabled' in el) el.disabled = Boolean(disabled);
  el.classList.toggle('is-disabled', Boolean(disabled));
  el.setAttribute('aria-disabled', disabled ? 'true' : 'false');
}

function syncContextMenuAvailability(state, options = {}) {
  if (!state?.contextMenu) return;
  const selectedIds = state.selectedNodeIds || [];
  const count = selectedIds.length;
  const nodes = selectedIds.map(id => state.project?.nodes?.[id]).filter(Boolean);
  const primary = count === 1 ? nodes[0] : null;
  const hasMedia = nodes.some(node => node.type === 'media');
  const hasConfig = nodes.some(node => node.type === 'config');
  const hasLoop = nodes.some(node => node.type === 'loop');
  const hasLlm = nodes.some(node => node.type === 'llm');
  const hasConfigLike = hasConfig || hasLoop || hasLlm;
  const hasGroup = nodes.some(node => node.type === 'group');
  const canGroup = nodes.filter(node => node && node.type !== 'group').length >= 2;
  const canUngroup = nodes.some(node => node && (node.type === 'group' || node.groupId));
  const canSelectMembers = hasGroup;
  const canConnect = count >= 2;
  const canAlign = count >= 2;
  const canDistribute = count >= 3;
  const mode = count === 0 ? 'empty' : (count > 1 ? 'multi' : (primary?.type || 'single'));
  state.contextMenu.dataset.mode = mode;
  state.contextMenu.dataset.count = String(count);

  const actionState = {
    'duplicate-selected': { disabled: count < 1 },
    'focus-selected': { disabled: count < 1 },
    'fit-selection': { disabled: count < 1 },
    'cycle-role-selected': { hidden: count < 1 || hasGroup && count === 1, disabled: count < 1 },
    'open-inspector': { disabled: count < 1 },
    'group-selected': { disabled: !canGroup, hidden: count < 2 },
    'select-group-members': { hidden: !canSelectMembers, disabled: !canSelectMembers },
    'ungroup-selected': { hidden: !canUngroup, disabled: !canUngroup },
    'rotate-left-selected': { disabled: count < 1 || nodes.every(node => node.locked) },
    'rotate-right-selected': { disabled: count < 1 || nodes.every(node => node.locked) },
    'select-connected': { disabled: count < 1 },
    'connect-selected': { disabled: !canConnect, hidden: count < 2 },
    'smart-wire-selected': {
      disabled: (() => {
        if (count >= 1 || hasConfigLike) return false;
        const snap = getBoardWorkflowSnapshot(state);
        return !(snap.hasConfig || snap.hasMedia);
      })(),
      hidden: false
    },
    'replace-sample-reference': { hidden: !(count === 1 && hasMedia), disabled: !(count === 1 && hasMedia) },
    'fill-sample-from-history': { hidden: count > 0 && !(count === 1 && hasMedia), disabled: false },
    'toggle-lock-selected': { disabled: count < 1 },
    'add-selected-to-timeline': { hidden: !hasMedia && count > 0, disabled: !hasMedia },
    'favorite-selected': { hidden: !(count === 1 && hasMedia), disabled: !(count === 1 && hasMedia) },
    'delete-selected': { disabled: count < 1 },
    'align-left': { disabled: !canAlign },
    'align-center-h': { disabled: !canAlign },
    'align-right': { disabled: !canAlign },
    'align-top': { disabled: !canAlign },
    'align-center-v': { disabled: !canAlign },
    'align-bottom': { disabled: !canAlign },
    'distribute-h': { disabled: !canDistribute },
    'distribute-v': { disabled: !canDistribute },
    'generate-selected': (() => {
      if (count > 0) {
        return { disabled: !hasConfigLike, hidden: !hasConfigLike };
      }
      const snap = getBoardWorkflowSnapshot(state);
      const boardReady = Boolean(snap.hasConfig && (snap.canGenerate || snap.needsWire || snap.configCount > 0));
      return { disabled: !boardReady, hidden: false };
    })(),
    'crop-selected': { disabled: !hasMedia, hidden: count > 0 && !hasMedia },
    'upscale-selected': { disabled: !hasMedia, hidden: count > 0 && !hasMedia },
    'edit-loop-selected': { disabled: !hasLoop, hidden: !hasLoop },
    'run-llm-selected': { disabled: !hasLlm, hidden: !hasLlm },
    'fit-view': { disabled: false },
    'toggle-minimap': { disabled: false },
    'toggle-sidebar': { disabled: false },
    'toggle-shortcuts': { disabled: false },
    'reset-view': { disabled: false },
    'tidy-selected': { disabled: count < 1, hidden: count < 1 }
  };

  state.contextMenu.querySelectorAll('[data-action]').forEach(button => {
    const action = button.getAttribute('data-action') || '';
    const conf = actionState[action] || {};
    setContextMenuItemState(button, {
      hidden: conf.hidden === true,
      disabled: conf.disabled === true
    });
  });

  // Section-level availability: hide empty/disabled sections.
  const sectionRules = {
    create: true,
    selection: true,
    align: count >= 2,
    smart: count === 0 || hasConfigLike || hasMedia || hasLoop || hasLlm,
    view: true
  };
  state.contextMenuSections?.forEach(button => {
    const section = button.dataset.menuSection;
    const enabled = sectionRules[section] !== false;
    button.hidden = !enabled;
    button.disabled = !enabled;
    button.classList.toggle('is-section-disabled', !enabled);
  });
  state.contextMenuSubmenus?.forEach(menu => {
    const section = menu.dataset.menuSubmenu;
    if (sectionRules[section] === false) {
      menu.hidden = true;
    }
  });

  // If preferred section got hidden, fall back.
  let preferred = options.preferredSection || state.contextMenuSection || 'create';
  if (sectionRules[preferred] === false) {
    preferred = count >= 2 ? 'selection' : (count === 1 ? 'selection' : 'create');
  }
  return preferred;
}

function addNodeAtViewportCenter(state, node) {
  const stageRect = state.stage.getBoundingClientRect();
  // Keep cascade offsets small and cyclic so newly added nodes remain near the current view.
  const offsetIndex = getProjectNodeList(state.project).length % 5;
  const point = {
    x: (stageRect.width / 2 - state.viewport.x) / state.viewport.scale + (offsetIndex * 28),
    y: (stageRect.height / 2 - state.viewport.y) / state.viewport.scale + (offsetIndex * 20)
  };
  addNodeAtPoint(state, point, node, { world: true });
}

function addNodeAtPoint(state, point, node, options = {}) {
  const worldPoint = options.world ? point : getWorldPoint(state, point);
  const nextNode = upsertCanvasNode(state.project, {
    ...node,
    x: Math.round(worldPoint.x),
    y: Math.round(worldPoint.y)
  });
  persistProject(state);
  setSelectedNodes(state, nextNode?.id ? [nextNode.id] : [], { rerender: true, persist: false });
  updateStatus(state, `已添加${resolveNodeTypeLabel(nextNode?.type)}`);
  return nextNode;
}

function connectPendingCreatedNode(state, node) {
  const fromNodeId = state.pendingConnectionFromId;
  state.pendingConnectionFromId = '';
  if (!fromNodeId || !node?.id || !canCreateEdgeBetween(fromNodeId, node.id)) return node;
  createEdgeBetweenNodes(state, fromNodeId, node.id);
  updateStatus(state, `已创建并连接${resolveNodeTypeLabel(node.type)}`);
  return node;
}

function enterFitAllPreview(state) {
  const nodes = getProjectNodeList(state.project).filter(node => !node.hidden);
  if (!nodes.length) return;
  state.previewActive = true;
  state.previewViewport = { ...state.viewport };
  const bounds = computeNodeBounds(nodes);
  const stageRect = state.stage.getBoundingClientRect();
  const padding = 80;
  const scaleX = (stageRect.width - padding * 2) / Math.max(bounds.width, 1);
  const scaleY = (stageRect.height - padding * 2) / Math.max(bounds.height, 1);
  const scale = clamp(Math.min(scaleX, scaleY), MIN_SCALE, MAX_SCALE);
  state.viewport = {
    scale,
    x: Math.round((stageRect.width / 2) - ((bounds.minX + bounds.width / 2) * scale)),
    y: Math.round((stageRect.height / 2) - ((bounds.minY + bounds.height / 2) * scale))
  };
  rerenderEditor(state, { skipPersist: true });
  updateStatus(state, '全局预览（按住 Z）');
}

function exitFitAllPreview(state) {
  if (!state.previewActive) return;
  state.previewActive = false;
  if (state.previewViewport) {
    state.viewport = { ...state.previewViewport };
    state.previewViewport = null;
  }
  rerenderEditor(state, { skipPersist: true });
  updateStatus(state, '就绪');
}

function getSelectedImageNode(state) {
  const node = getPrimarySelectedNode(state);
  if (!node || node.type !== 'media' || node.kind !== 'image') return null;
  const src = node.resourceSrc || node.thumbnailSrc || node.posterSrc || '';
  return src ? { node, src } : null;
}

async function favoriteSelectedNode(state) {
  const node = getPrimarySelectedNode(state);
  if (!node) { updateStatus(state, '请选中一个节点'); return; }
  const store = state.assetStore || (state.assetStore = getCanvasAssetStore());
  let asset;
  if (node.type === 'media') {
    const src = node.resourceSrc || node.thumbnailSrc || node.posterSrc || '';
    if (!src) { updateStatus(state, '该节点没有可收藏的媒体'); return; }
    asset = createCanvasAsset({
      src,
      kind: node.kind || 'image',
      title: node.title || '媒体素材',
      mimeType: node.mimeType || '',
      originProjectId: state.project?.id || '',
      originLabel: state.project?.title || ''
    });
  } else if (node.type === 'text' || node.type === 'note') {
    const content = node.text || node.title || '';
    if (!content) { updateStatus(state, '该节点没有可收藏的文本'); return; }
    asset = createCanvasAsset({
      content,
      kind: 'text',
      title: node.title || '文本素材',
      originProjectId: state.project?.id || '',
      originLabel: state.project?.title || ''
    });
  } else {
    updateStatus(state, '仅支持媒体、文本、便签节点收藏');
    return;
  }
  await store.put(asset);
  updateStatus(state, `已收藏到素材库：${asset.title}`);
}

async function applyEditResultAsNode(state, sourceNode, src, titlePrefix) {
  const record = createCanvasResourceRecord({ kind: 'image', src, label: `${titlePrefix} 结果`, mimeType: 'image/png' });
  const saved = await state.resourceStore.put(record);
  const resultNode = createCanvasMediaNodeFromResource(saved, {
    title: `${sourceNode.title || '图片'} ${titlePrefix}`,
    canvasRole: 'target',
    x: (Number(sourceNode.x) || 0) + (Number(sourceNode.width) || 0) + 48,
    y: Number(sourceNode.y) || 0
  });
  upsertCanvasNode(state.project, resultNode);
  const resultSrc = resultNode.resourceSrc || resultNode.thumbnailSrc || saved?.source?.src || '';
  if (resultSrc && resultNode.id) {
    void fitCanvasMediaNodeToSource(state, resultNode.id, resultSrc).then(updated => {
      if (updated) {
        persistProject(state);
        rerenderEditor(state);
      }
    });
  }
  upsertCanvasEdge(state.project, { fromNodeId: sourceNode.id, toNodeId: resultNode.id, kind: 'relation' });
  persistProject(state);
  rerenderEditor(state);
  return resultNode;
}

function openCanvasModal(state, innerHtml) {
  const overlay = state.modalOverlay;
  if (!overlay) return null;
  overlay.innerHTML = innerHtml;
  overlay.hidden = false;
  return overlay;
}

function closeCanvasModal(state) {
  const overlay = state.modalOverlay;
  if (!overlay) return;
  overlay.hidden = true;
  overlay.innerHTML = '';
}

async function openCropDialog(state) {
  const picked = getSelectedImageNode(state);
  if (!picked) { updateStatus(state, '请选中一个图片节点'); return; }
  const ratios = [['free', '自由'], ['1:1', '1:1'], ['16:9', '16:9'], ['9:16', '9:16'], ['4:3', '4:3'], ['3:4', '3:4']];
  const overlay = openCanvasModal(state, `<div class="canvas-modal-card"><h3>裁剪图片</h3>
    <label>比例 <select name="ratio">${ratios.map(r => `<option value="${r[0]}">${r[1]}</option>`).join('')}</select></label>
    <div class="canvas-crop-preview" data-role="crop-preview"><img src="${escapeHtmlAttr(picked.src)}" alt=""></div>
    <div class="canvas-crop-controls"><label>X <input type="number" name="cx" min="0" max="100" value="5" step="1"></label><label>Y <input type="number" name="cy" min="0" max="100" value="5" step="1"></label><label>W <input type="number" name="cw" min="10" max="100" value="90" step="1"></label><label>H <input type="number" name="ch" min="10" max="100" value="90" step="1"></label></div>
    <div class="canvas-modal-actions"><button type="button" data-role="crop-confirm">确认裁剪</button><button type="button" data-role="modal-cancel">取消</button></div>
    </div>`);
  if (!overlay) return;
  const previewBox = overlay.querySelector('[data-role="crop-preview"]');
  const cxInput = overlay.querySelector('[name="cx"]');
  const cyInput = overlay.querySelector('[name="cy"]');
  const cwInput = overlay.querySelector('[name="cw"]');
  const chInput = overlay.querySelector('[name="ch"]');
  const ratioInput = overlay.querySelector('[name="ratio"]');
  const cropBox = document.createElement('div');
  cropBox.className = 'canvas-crop-box';
  cropBox.innerHTML = ['nw', 'ne', 'sw', 'se'].map(handle => `<button type="button" data-crop-handle="${handle}" aria-label="调整裁剪区域"></button>`).join('');
  previewBox?.appendChild(cropBox);
  const getRatio = () => {
    const [w, h] = String(ratioInput?.value || '').split(':').map(Number);
    return w > 0 && h > 0 ? w / h : 0;
  };
  const readRect = () => ({
    x: clamp((Number(cxInput.value) || 0) / 100, 0, 0.99),
    y: clamp((Number(cyInput.value) || 0) / 100, 0, 0.99),
    w: clamp((Number(cwInput.value) || 10) / 100, 0.02, 1),
    h: clamp((Number(chInput.value) || 10) / 100, 0.02, 1)
  });
  const writeRect = rect => {
    rect.w = clamp(rect.w, 0.02, 1 - rect.x);
    rect.h = clamp(rect.h, 0.02, 1 - rect.y);
    rect.x = clamp(rect.x, 0, 1 - rect.w);
    rect.y = clamp(rect.y, 0, 1 - rect.h);
    cxInput.value = String(Math.round(rect.x * 1000) / 10);
    cyInput.value = String(Math.round(rect.y * 1000) / 10);
    cwInput.value = String(Math.round(rect.w * 1000) / 10);
    chInput.value = String(Math.round(rect.h * 1000) / 10);
    cropBox.style.left = `${rect.x * 100}%`;
    cropBox.style.top = `${rect.y * 100}%`;
    cropBox.style.width = `${rect.w * 100}%`;
    cropBox.style.height = `${rect.h * 100}%`;
  };
  const enforceRatio = rect => {
    const ratio = getRatio();
    if (!ratio || !previewBox) return rect;
    const bounds = previewBox.getBoundingClientRect();
    const normalizedRatio = ratio * (bounds.height / Math.max(bounds.width, 1));
    rect.h = rect.w / Math.max(normalizedRatio, 0.001);
    if (rect.y + rect.h > 1) {
      rect.h = 1 - rect.y;
      rect.w = rect.h * normalizedRatio;
    }
    return rect;
  };
  const syncBox = () => writeRect(enforceRatio(readRect()));
  [cxInput, cyInput, cwInput, chInput].forEach(input => input.addEventListener('input', syncBox));
  ratioInput?.addEventListener('change', syncBox);
  previewBox?.querySelector('img')?.addEventListener('load', event => {
    const image = event.currentTarget;
    if (image.naturalWidth && image.naturalHeight) previewBox.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
    syncBox();
  });
  cropBox.addEventListener('pointerdown', event => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.target?.closest?.('[data-crop-handle]')?.dataset?.cropHandle || 'move';
    const start = readRect();
    const bounds = previewBox.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const move = moveEvent => {
      const dx = (moveEvent.clientX - startX) / Math.max(bounds.width, 1);
      const dy = (moveEvent.clientY - startY) / Math.max(bounds.height, 1);
      const next = { ...start };
      if (handle === 'move') {
        next.x += dx;
        next.y += dy;
      } else {
        if (handle.includes('e')) next.w += dx;
        if (handle.includes('s')) next.h += dy;
        if (handle.includes('w')) { next.x += dx; next.w -= dx; }
        if (handle.includes('n')) { next.y += dy; next.h -= dy; }
        enforceRatio(next);
      }
      writeRect(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  });
  syncBox();
  overlay.querySelector('[data-role="modal-cancel"]').addEventListener('click', () => closeCanvasModal(state));
  overlay.querySelector('[data-role="crop-confirm"]').addEventListener('click', async () => {
    const rect = { x: (Number(cxInput.value) || 0) / 100, y: (Number(cyInput.value) || 0) / 100, w: (Number(cwInput.value) || 0) / 100, h: (Number(chInput.value) || 0) / 100 };
    try {
      updateStatus(state, '正在裁剪…');
      const result = await cropImage(picked.src, rect);
      pushHistory(state);
      await applyEditResultAsNode(state, picked.node, result, '裁剪');
      closeCanvasModal(state);
      updateStatus(state, '裁剪完成');
    } catch (error) {
      updateStatus(state, `裁剪失败：${error.message}`);
    }
  });
}

async function openUpscaleDialog(state) {
  const picked = getSelectedImageNode(state);
  if (!picked) { updateStatus(state, '请选中一个图片节点'); return; }
  const overlay = openCanvasModal(state, `<div class="canvas-modal-card"><h3>放大图片</h3>
    <label>目标长边 <select name="target"><option value="1024">1024px</option><option value="2048" selected>2048px</option><option value="3072">3072px</option><option value="4096">4096px</option></select></label>
    <label>算法 <select name="algo"><option value="high" selected>高质量</option><option value="bilinear">双线性</option><option value="nearest">最近邻</option></select></label>
    <div class="canvas-modal-actions"><button type="button" data-role="upscale-confirm">确认放大</button><button type="button" data-role="modal-cancel">取消</button></div>
    </div>`);
  if (!overlay) return;
  overlay.querySelector('[data-role="modal-cancel"]').addEventListener('click', () => closeCanvasModal(state));
  overlay.querySelector('[data-role="upscale-confirm"]').addEventListener('click', async () => {
    const target = Number(overlay.querySelector('[name="target"]').value) || 2048;
    const algo = overlay.querySelector('[name="algo"]').value || 'high';
    try {
      updateStatus(state, '正在放大…');
      const result = await upscaleImage(picked.src, target, algo);
      pushHistory(state);
      await applyEditResultAsNode(state, picked.node, result, '放大');
      closeCanvasModal(state);
      updateStatus(state, '放大完成');
    } catch (error) {
      updateStatus(state, `放大失败：${error.message}`);
    }
  });
}

function downloadSelectedImage(state) {
  const picked = getSelectedImageNode(state);
  if (!picked) { updateStatus(state, '请选中一个图片节点'); return; }
  const anchor = document.createElement('a');
  anchor.href = picked.src;
  anchor.download = `${String(picked.node.title || 'canvas-image').replace(/[\\/:*?"<>|]+/g, '-')}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  updateStatus(state, '已开始下载图片');
}

function toggleSelectedImageFreeResize(state) {
  const picked = getSelectedImageNode(state);
  if (!picked) { updateStatus(state, '请选中一个图片节点'); return; }
  pushHistory(state);
  picked.node.freeResize = !picked.node.freeResize;
  upsertCanvasNode(state.project, picked.node);
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, picked.node.freeResize ? '图片已切换为自由缩放' : '图片已锁定原始比例');
}

function openImageQuickToolsDialog(state) {
  const selected = new Set(state.imageQuickTools || DEFAULT_IMAGE_QUICK_TOOLS);
  const labels = {
    download: '下载', favorite: '收藏', crop: '裁剪', split: '分割', upscale: '本地放大',
    'super-resolve': 'AI 超分', inpaint: '局部重绘', outpaint: '扩图', angle: '产品角度'
  };
  const overlay = openCanvasModal(state, `<div class="canvas-modal-card"><h3>图片快捷工具</h3>
    <p class="canvas-crop-hint">选择显示在图片节点快捷栏中的工具。</p>
    <div class="canvas-image-tool-settings">${DEFAULT_IMAGE_QUICK_TOOLS.map(id => `<label><input type="checkbox" value="${id}"${selected.has(id) ? ' checked' : ''}>${labels[id] || id}</label>`).join('')}</div>
    <div class="canvas-modal-actions"><button type="button" data-role="quick-tools-save">保存</button><button type="button" data-role="modal-cancel">取消</button></div></div>`);
  if (!overlay) return;
  overlay.querySelector('[data-role="modal-cancel"]')?.addEventListener('click', () => closeCanvasModal(state));
  overlay.querySelector('[data-role="quick-tools-save"]')?.addEventListener('click', () => {
    state.imageQuickTools = saveImageQuickTools([...overlay.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value));
    closeCanvasModal(state);
    rerenderEditor(state, { skipPersist: true });
    updateStatus(state, '图片快捷工具已保存');
  });
}

async function openSplitDialog(state) {
  const picked = getSelectedImageNode(state);
  if (!picked) { updateStatus(state, '请选中一个图片节点'); return; }
  const overlay = openCanvasModal(state, `<div class="canvas-modal-card"><h3>分割图片</h3>
    <div class="canvas-inspector-row"><label>行数<input type="number" name="rows" min="1" max="8" value="2"></label><label>列数<input type="number" name="columns" min="1" max="8" value="2"></label></div>
    <p class="canvas-crop-hint">每个切片会成为独立子节点，并自动连接到原图。</p>
    <div class="canvas-modal-actions"><button type="button" data-role="split-confirm">确认分割</button><button type="button" data-role="modal-cancel">取消</button></div></div>`);
  if (!overlay) return;
  overlay.querySelector('[data-role="modal-cancel"]')?.addEventListener('click', () => closeCanvasModal(state));
  overlay.querySelector('[data-role="split-confirm"]')?.addEventListener('click', async () => {
    const rows = Number(overlay.querySelector('[name="rows"]')?.value) || 2;
    const columns = Number(overlay.querySelector('[name="columns"]')?.value) || 2;
    try {
      updateStatus(state, '正在分割图片…');
      const pieces = await splitImage(picked.src, { rows, columns });
      pushHistory(state);
      const gap = 16;
      const cellWidth = Math.max(80, Math.round((Number(picked.node.width) || 240) / columns));
      const cellHeight = Math.max(60, Math.round((Number(picked.node.height) || 180) / rows));
      const createdIds = [];
      for (const piece of pieces) {
        const record = createCanvasResourceRecord({ kind: 'image', src: piece.dataUrl, label: `${picked.node.title || '图片'} ${piece.row + 1}-${piece.column + 1}`, mimeType: 'image/png' });
        const saved = await state.resourceStore.put(record);
        const child = createCanvasMediaNodeFromResource(saved, {
          title: record.source.label,
          canvasRole: 'target',
          x: (Number(picked.node.x) || 0) + (Number(picked.node.width) || 0) + 64 + piece.column * (cellWidth + gap),
          y: (Number(picked.node.y) || 0) + piece.row * (cellHeight + gap),
          width: cellWidth,
          height: cellHeight
        });
        upsertCanvasNode(state.project, child);
        upsertCanvasEdge(state.project, { fromNodeId: picked.node.id, toNodeId: child.id, kind: 'derived' });
        createdIds.push(child.id);
      }
      state.selectedNodeIds = createdIds;
      closeCanvasModal(state);
      persistProject(state, { immediate: true });
      rerenderEditor(state);
      updateStatus(state, `已分割为 ${createdIds.length} 个子节点`);
    } catch (error) {
      updateStatus(state, `分割失败：${error?.message || error}`);
    }
  });
}

async function openSuperResolveDialog(state) {
  const picked = getSelectedImageNode(state);
  if (!picked) { updateStatus(state, '请选中一个图片节点'); return; }
  const overlay = openCanvasModal(state, `<div class="canvas-modal-card"><h3>AI 超分</h3>
    <label>处理要求<textarea name="prompt" rows="3">提升图片分辨率和细节清晰度，修复压缩噪点，保持主体、构图、颜色和光线不变。</textarea></label>
    <div class="canvas-modal-actions"><button type="button" data-role="super-resolve-confirm">开始超分</button><button type="button" data-role="modal-cancel">取消</button></div></div>`);
  if (!overlay) return;
  overlay.querySelector('[data-role="modal-cancel"]')?.addEventListener('click', () => closeCanvasModal(state));
  overlay.querySelector('[data-role="super-resolve-confirm"]')?.addEventListener('click', async () => {
    const prompt = String(overlay.querySelector('[name="prompt"]')?.value || '').trim();
    if (!prompt) return;
    closeCanvasModal(state);
    await runDerivedGeneration(state, [picked.node], 'image', prompt, 'AI 超分');
  });
}

async function openAngleDialog(state) {
  const picked = getSelectedImageNode(state);
  if (!picked) { updateStatus(state, '请选中一个图片节点'); return; }
  const overlay = openCanvasModal(state, `<div class="canvas-modal-card canvas-angle-card"><h3>产品角度</h3>
    <img class="canvas-angle-source" src="${escapeHtmlAttr(picked.src)}" alt="参考图">
    <label>水平角度 <input type="range" name="azimuth" min="0" max="359" step="1" value="45"><output data-role="azimuth-output">45°</output></label>
    <label>俯仰角度 <input type="range" name="elevation" min="-90" max="90" step="1" value="0"><output data-role="elevation-output">0°</output></label>
    <label>镜头距离 <input type="range" name="distance" min="0.5" max="3" step="0.1" value="1"><output data-role="distance-output">1.0x</output></label>
    <p class="canvas-crop-hint" data-role="angle-label"></p>
    <div class="canvas-modal-actions"><button type="button" data-role="angle-confirm">生成新角度</button><button type="button" data-role="modal-cancel">取消</button></div></div>`);
  if (!overlay) return;
  const read = () => ({
    azimuth: Number(overlay.querySelector('[name="azimuth"]')?.value) || 0,
    elevation: Number(overlay.querySelector('[name="elevation"]')?.value) || 0,
    distance: Number(overlay.querySelector('[name="distance"]')?.value) || 1
  });
  const sync = () => {
    const value = read();
    overlay.querySelector('[data-role="azimuth-output"]').textContent = `${value.azimuth}°`;
    overlay.querySelector('[data-role="elevation-output"]').textContent = `${value.elevation}°`;
    overlay.querySelector('[data-role="distance-output"]').textContent = `${value.distance.toFixed(1)}x`;
    overlay.querySelector('[data-role="angle-label"]').textContent = buildAngleLabel(value);
  };
  overlay.querySelectorAll('input[type="range"]').forEach(input => input.addEventListener('input', sync));
  sync();
  overlay.querySelector('[data-role="modal-cancel"]')?.addEventListener('click', () => closeCanvasModal(state));
  overlay.querySelector('[data-role="angle-confirm"]')?.addEventListener('click', async () => {
    const value = read();
    closeCanvasModal(state);
    await runDerivedGeneration(state, [picked.node], 'image', buildAnglePrompt(value), buildAngleLabel(value));
  });
}

async function generateFromCanvasAssistant(state, kind, prompt) {
  const sources = collectAssistantSourceNodes(state);
  return runDerivedGeneration(state, sources, kind, prompt, kind === 'video' ? '助手视频' : '助手图片');
}

function collectAssistantSourceNodes(state) {
  const nodes = state.project?.nodes || {};
  const edges = Object.values(state.project?.edges || {});
  const ids = new Set((state.selectedNodeIds || []).filter(id => nodes[id]));
  const queue = [...ids];
  while (queue.length) {
    const targetId = queue.shift();
    edges.forEach(edge => {
      if (edge?.toNodeId !== targetId || !nodes[edge.fromNodeId] || ids.has(edge.fromNodeId)) return;
      ids.add(edge.fromNodeId);
      queue.push(edge.fromNodeId);
    });
  }
  return [...ids].map(id => nodes[id]).filter(Boolean);
}

async function runDerivedGeneration(state, sourceNodes, kind, prompt, title, options = {}) {
  if (typeof state.bridge?.runGeneration !== 'function') throw new Error('当前宿主未提供生成接口');
  const sources = Array.isArray(sourceNodes) ? sourceNodes.filter(Boolean) : [];
  const anchor = sources[0] || { id: '', x: 0, y: 0, width: 260 };
  const generationKind = kind === 'video' ? 'video' : 'image';
  const existingPlaceholder = options.placeholderNode && state.project?.nodes?.[options.placeholderNode.id]
    ? state.project.nodes[options.placeholderNode.id]
    : null;
  const placeholder = existingPlaceholder || createCanvasMediaNode({
    kind: generationKind,
    title,
    canvasRole: 'target',
    x: (Number(anchor.x) || 0) + (Number(anchor.width) || 260) + 64,
    y: Number(anchor.y) || 0,
    generationStatus: 'running',
    generationStartedAt: Date.now(),
    prompt,
    derivedKind: generationKind,
    derivedTitle: title,
    derivedSourceNodeIds: sources.map(node => node.id).filter(Boolean)
  });
  if (existingPlaceholder) {
    placeholder.generationStatus = 'running';
    placeholder.generationStartedAt = Date.now();
    placeholder.generationError = '';
    placeholder.prompt = prompt;
  } else {
    pushHistory(state);
  }
  upsertCanvasNode(state.project, placeholder);
  if (!existingPlaceholder) {
    sources.forEach(source => {
      if (source.id) upsertCanvasEdge(state.project, { fromNodeId: source.id, toNodeId: placeholder.id, kind: 'derived' });
    });
  }
  state.selectedNodeIds = [placeholder.id];
  persistProject(state, { immediate: true });
  rerenderEditor(state);
  updateStatus(state, `正在生成：${title}`, { tone: 'running' });
  try {
    const images = sources
      .filter(node => node.type === 'media' && node.kind === 'image')
      .map(node => ({ dataUrl: node.resourceSrc || node.thumbnailSrc || node.posterSrc || '', name: node.title || 'reference' }))
      .filter(item => item.dataUrl);
    const response = await state.bridge.runGeneration(generationKind, prompt, { images });
    const result = response?.result || response;
    const src = normalizeGenerationResultSource(generationKind, result);
    if (!src) throw new Error('生成接口未返回媒体地址');
    const record = createCanvasResourceRecord({
      kind: generationKind,
      src,
      thumbnailSrc: result?.thumbnailUrl || '',
      posterSrc: result?.thumbnailUrl || '',
      label: title,
      mimeType: guessMimeTypeFromResult(generationKind, result, src)
    });
    const saved = await state.resourceStore.put(record);
    const completed = createCanvasMediaNodeFromResource(saved, {
      ...placeholder,
      id: placeholder.id,
      x: placeholder.x,
      y: placeholder.y,
      title,
      canvasRole: 'target',
      generationStatus: 'success',
      generationStartedAt: 0,
      generationError: '',
      prompt
    });
    upsertCanvasNode(state.project, completed);
    persistProject(state, { immediate: true });
    rerenderEditor(state);
    updateStatus(state, `生成完成：${title}`, { tone: 'success' });
    return completed;
  } catch (error) {
    const live = state.project?.nodes?.[placeholder.id] || placeholder;
    live.generationStatus = 'error';
    live.generationStartedAt = 0;
    live.generationError = error?.message || String(error);
    upsertCanvasNode(state.project, live);
    persistProject(state, { immediate: true });
    rerenderEditor(state);
    updateStatus(state, `生成失败：${live.generationError}`, { tone: 'error' });
    throw error;
  }
}

async function openLoopEditDialog(state) {
  const node = getPrimarySelectedNode(state);
  if (!node || node.type !== 'loop') { updateStatus(state, '请选中一个循环节点'); return; }
  const variations = Array.isArray(node.variations) ? node.variations.join('\n') : '';
  const overlay = openCanvasModal(state, `
    <div class="canvas-modal-card">
      <h3>编辑循环节点</h3>
      <label>基础提示词 <textarea name="basePrompt" rows="3">${escapeHtmlAttr(node.basePrompt || '')}</textarea></label>
      <label>变化项（每行一条） <textarea name="variations" rows="6">${escapeHtmlAttr(variations)}</textarea></label>
      <p class="canvas-crop-hint">每行一个变化项，运行时会与基础提示词拼接后逐条生成，结果自动加入时间轴。</p>
      <div class="canvas-modal-actions"><button type="button" data-role="loop-save">保存</button><button type="button" data-role="modal-cancel">取消</button></div>
    </div>`);
  if (!overlay) return;
  overlay.querySelector('[data-role="modal-cancel"]').addEventListener('click', () => closeCanvasModal(state));
  overlay.querySelector('[data-role="loop-save"]').addEventListener('click', () => {
    pushHistory(state);
    node.basePrompt = overlay.querySelector('[name="basePrompt"]').value;
    node.variations = overlay.querySelector('[name="variations"]').value.split('\n').map(s => s.trim()).filter(Boolean);
    persistProject(state);
    rerenderEditor(state);
    closeCanvasModal(state);
    updateStatus(state, `已保存 ${node.variations.length} 个变化项`);
  });
}

async function openAssetLibrary(state) {
  const store = state.assetStore || (state.assetStore = getCanvasAssetStore());
  const assets = await store.list();
  const items = assets.length ? assets.map(a => `
    <div class="canvas-asset-item" data-asset-id="${a.id}">
      <div class="canvas-asset-thumb">${a.kind === 'text' ? '<span>文</span>' : (a.src ? `<img src="${escapeHtmlAttr(a.src)}" alt="">` : '<span>素</span>')}</div>
      <div class="canvas-asset-meta"><strong>${escapeHtmlAttr(a.title)}</strong><span>${escapeHtmlAttr(a.kind)} · ${(a.tags || []).join('/') || '无标签'}</span></div>
      <button type="button" data-role="asset-insert" data-id="${a.id}">引用</button>
      <button type="button" data-role="asset-delete" data-id="${a.id}">删除</button>
    </div>`).join('') : '<p class="canvas-asset-empty">还没有收藏的素材。右键节点选「收藏到素材库」即可加入。</p>';
  const overlay = openCanvasModal(state, `
    <div class="canvas-modal-card canvas-asset-card">
      <h3>素材库（跨画布）</h3>
      <p class="canvas-crop-hint">共 ${assets.length} 个素材。点击「引用」复制 <code>@[asset:id]</code>，粘贴到编排节点提示词即可作为参考图。</p>
      <div class="canvas-asset-list">${items}</div>
      <div class="canvas-modal-actions"><button type="button" data-role="modal-cancel">关闭</button></div>
    </div>`);
  if (!overlay) return;
  overlay.querySelector('[data-role="modal-cancel"]').addEventListener('click', () => closeCanvasModal(state));
  overlay.querySelectorAll('[data-role="asset-insert"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const token = `@[asset:${btn.dataset.id}]`;
      try { navigator.clipboard?.writeText(token); } catch (err) { /* clipboard optional */ }
      updateStatus(state, `已复制引用：${token}`);
    });
  });
  overlay.querySelectorAll('[data-role="asset-delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await store.delete(btn.dataset.id);
      btn.closest('.canvas-asset-item')?.remove();
      updateStatus(state, '已删除素材');
    });
  });
}

async function openInpaintDialog(state) {
  const picked = getSelectedImageNode(state);
  if (!picked) { updateStatus(state, '请选中一个图片节点'); return; }
  if (typeof state.bridge?.runGeneration !== 'function') {
    updateStatus(state, '当前宿主未提供runGeneration');
    return;
  }

  const previewHtml = `
    <div class="canvas-mask-canvas" data-role="inpaint-stage">
      <img class="canvas-mask-image" data-role="inpaint-image" src="${escapeHtmlAttr(picked.src)}" alt="">
      <canvas class="canvas-mask-paint" data-role="inpaint-paint" width="512" height="512"></canvas>
      <div class="canvas-mask-hint" data-role="inpaint-hint">按住鼠标在图片上涂红色区域</div>
    </div>`;

  const overlay = openCanvasModal(state, `
    <div class="canvas-modal-card canvas-mask-card">
      <h3>局部重绘</h3>
      <p class="canvas-crop-hint">用画笔涂抹需要重绘的区域，输入提示词后提交。会调用 bridge.runGeneration('image', prompt, { images:[原图], mask })。</p>
      ${previewHtml}
      <div class="canvas-mask-controls">
        <label>画笔大小 <input type="range" name="brush" min="8" max="96" value="32" step="2"><span data-role="brush-size">32</span>px</label>
        <button type="button" data-role="inpaint-clear">清除涂抹</button>
      </div>
      <label>提示词<textarea name="prompt" rows="3" placeholder="描述你想要在红色区域生成的内容"></textarea></label>
      <div class="canvas-modal-actions">
        <button type="button" data-role="inpaint-submit">提交生成</button>
        <button type="button" data-role="modal-cancel">取消</button>
      </div>
    </div>`);
  if (!overlay) return;

  const stage = overlay.querySelector('[data-role="inpaint-stage"]');
  const img = overlay.querySelector('[data-role="inpaint-image"]');
  const paint = overlay.querySelector('[data-role="inpaint-paint"]');
  const brushInput = overlay.querySelector('[name="brush"]');
  const brushLabel = overlay.querySelector('[data-role="brush-size"]');
  const clearBtn = overlay.querySelector('[data-role="inpaint-clear"]');
  const ctx = paint.getContext('2d');

  let drawing = false;
  let lastPoint = null;
  const sourceSize = await readInpaintSourceSize(picked.src);
  const layout = computeInpaintLayout(paint, sourceSize);

  const configureCanvas = () => {
    paint.width = layout.canvasWidth;
    paint.height = layout.canvasHeight;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(255, 80, 80, 0.0)';
    ctx.fillRect(0, 0, paint.width, paint.height);
  };
  configureCanvas();

  const paintAt = (x, y) => {
    const radius = Number(brushInput.value) || 32;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255, 80, 80, 0.85)';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (lastPoint) {
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.85)';
      ctx.lineWidth = radius * 2;
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    lastPoint = { x, y };
  };

  const toLocal = event => {
    const rect = paint.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * paint.width,
      y: ((event.clientY - rect.top) / rect.height) * paint.height
    };
  };

  paint.addEventListener('pointerdown', event => {
    drawing = true;
    try { try { paint.setPointerCapture(event.pointerId); } catch {} } catch {}
    lastPoint = null;
    const p = toLocal(event);
    paintAt(p.x, p.y);
  });
  paint.addEventListener('pointermove', event => {
    if (!drawing) return;
    const p = toLocal(event);
    paintAt(p.x, p.y);
  });
  const stopDraw = event => {
    if (!drawing) return;
    drawing = false;
    try { paint.releasePointerCapture(event.pointerId); } catch (err) { /* ignore */ }
    lastPoint = null;
  };
  paint.addEventListener('pointerup', stopDraw);
  paint.addEventListener('pointercancel', stopDraw);

  brushInput.addEventListener('input', () => {
    brushLabel.textContent = brushInput.value;
  });
  clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, paint.width, paint.height);
  });

  overlay.querySelector('[data-role="modal-cancel"]').addEventListener('click', () => closeCanvasModal(state));
  overlay.querySelector('[data-role="inpaint-submit"]').addEventListener('click', async () => {
    const prompt = (overlay.querySelector('[name="prompt"]').value || '').trim();
    if (!prompt) { updateStatus(state, '请填写提示词'); return; }
    try {
      const maskDataUrl = paint.toDataURL('image/png');
      updateStatus(state, '正在局部重绘…');
      const result = await state.bridge.runGeneration('image', prompt, {
        images: [{ dataUrl: picked.src, name: picked.node?.title || 'inpaint-source' }],
        mask: maskDataUrl
      });
      const payload = result?.result || result;
      const src = payload?.imageBase64
        ? (payload.imageBase64.startsWith('data:')
          ? payload.imageBase64
          : `data:${payload.mime || 'image/png'};base64,${payload.imageBase64}`)
        : (payload?.imageUrl || '');
      if (!src) throw new Error('生成接口未返回图片');
      pushHistory(state);
      await applyEditResultAsNode(state, picked.node, src, '局部重绘');
      closeCanvasModal(state);
      updateStatus(state, '局部重绘完成');
    } catch (error) {
      updateStatus(state, `局部重绘失败：${error.message || error}`);
    }
  });
}

async function readInpaintSourceSize(src) {
  return await new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 512, height: image.naturalHeight || 512 });
    image.onerror = () => resolve({ width: 512, height: 512 });
    image.src = src;
  });
}

function computeInpaintLayout(canvas, sourceSize) {
  const maxSide = 512;
  const ratio = sourceSize.width / Math.max(sourceSize.height, 1);
  let width = maxSide;
  let height = Math.round(maxSide / ratio);
  if (height > maxSide) {
    height = maxSide;
    width = Math.round(maxSide * ratio);
  }
  return { canvasWidth: width, canvasHeight: height };
}

async function openOutpaintDialog(state) {
  const picked = getSelectedImageNode(state);
  if (!picked) { updateStatus(state, '请选中一个图片节点'); return; }
  if (typeof state.bridge?.runGeneration !== 'function') {
    updateStatus(state, '当前宿主未提供runGeneration');
    return;
  }

  const overlay = openCanvasModal(state, `
    <div class="canvas-modal-card canvas-mask-card">
      <h3>扩图</h3>
      <p class="canvas-crop-hint">按方向设置扩展像素，原图会居中嵌入扩展画布，外围作为 mask 重绘。提交时调用 bridge.runGeneration('image', prompt, { images:[合成图], mask:[外围mask] })。</p>
      <div class="canvas-outpaint-grid">
        <label>上 <input type="number" name="top" min="0" max="512" value="64" step="8">px</label>
        <label>右 <input type="number" name="right" min="0" max="512" value="64" step="8">px</label>
        <label>下 <input type="number" name="bottom" min="0" max="512" value="64" step="8">px</label>
        <label>左 <input type="number" name="left" min="0" max="512" value="64" step="8">px</label>
      </div>
      <div class="canvas-outpaint-preview" data-role="outpaint-preview"><img data-role="outpaint-img" src="${escapeHtmlAttr(picked.src)}" alt=""></div>
      <label>提示词<textarea name="prompt" rows="3" placeholder="描述外围要补全的内容"></textarea></label>
      <div class="canvas-modal-actions">
        <button type="button" data-role="outpaint-submit">提交扩图</button>
        <button type="button" data-role="modal-cancel">取消</button>
      </div>
    </div>`);
  if (!overlay) return;

  const previewImg = overlay.querySelector('[data-role="outpaint-img"]');
  const syncPreview = () => {
    const pad = getOutpaintPad(overlay);
    previewImg.style.padding = `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`;
    previewImg.style.background = 'repeating-linear-gradient(45deg, #f3f3f3 0 6px, #e0e0e0 6px 12px)';
  };
  ['top', 'right', 'bottom', 'left'].forEach(name => {
    overlay.querySelector(`[name="${name}"]`).addEventListener('input', syncPreview);
  });
  syncPreview();

  overlay.querySelector('[data-role="modal-cancel"]').addEventListener('click', () => closeCanvasModal(state));
  overlay.querySelector('[data-role="outpaint-submit"]').addEventListener('click', async () => {
    const prompt = (overlay.querySelector('[name="prompt"]').value || '').trim();
    if (!prompt) { updateStatus(state, '请填写提示词'); return; }
    const pad = getOutpaintPad(overlay);
    try {
      updateStatus(state, '正在合成扩图画布…');
      const composed = await composeOutpaint(picked.src, pad);
      const mask = await composeOutpaintMask(picked.src, pad);
      updateStatus(state, '正在扩图生成…');
      const result = await state.bridge.runGeneration('image', prompt, {
        images: [{ dataUrl: composed, name: `${picked.node?.title || 'outpaint'}-canvas` }],
        mask
      });
      const payload = result?.result || result;
      const src = payload?.imageBase64
        ? (payload.imageBase64.startsWith('data:')
          ? payload.imageBase64
          : `data:${payload.mime || 'image/png'};base64,${payload.imageBase64}`)
        : (payload?.imageUrl || '');
      if (!src) throw new Error('生成接口未返回图片');
      pushHistory(state);
      await applyEditResultAsNode(state, picked.node, src, '扩图');
      closeCanvasModal(state);
      updateStatus(state, '扩图完成');
    } catch (error) {
      updateStatus(state, `扩图失败：${error.message || error}`);
    }
  });
}

function getOutpaintPad(overlay) {
  const num = name => Math.max(0, Math.min(512, Math.round(Number(overlay.querySelector(`[name="${name}"]`).value) || 0)));
  return { top: num('top'), right: num('right'), bottom: num('bottom'), left: num('left') };
}

const CANVAS_IMPORT_ORIGIN_OPTIONS = [
  { id: 'history-grid', label: '历史记录', hint: '右侧历史里当前可见的图片' },
  { id: 'upload-preview', label: '当前参考图', hint: '主界面已上传的参考图' },
  { id: 'result-output', label: '当前输出区', hint: '右侧结果区已生成的图片' }
];

function resolveImportOriginLabel(origin) {
  const found = CANVAS_IMPORT_ORIGIN_OPTIONS.find(item => item.id === origin);
  return found?.label || origin || '其他来源';
}

function groupImportSourcesByOrigin(sources = []) {
  const groups = new Map(CANVAS_IMPORT_ORIGIN_OPTIONS.map(item => [item.id, []]));
  (Array.isArray(sources) ? sources : []).forEach(source => {
    const origin = source?.origin || 'history-grid';
    if (!groups.has(origin)) groups.set(origin, []);
    groups.get(origin).push(source);
  });
  return groups;
}

const CANVAS_IMPORT_MAX_ITEMS = 12;
const CANVAS_IMPORT_DEFAULT_ITEMS = 6;

function getImportSourcePreview(source = {}) {
  return source.thumbnailSrc || source.posterSrc || source.src || source.dataUrl || source.url || '';
}

function getImportSourceLabel(source = {}, index = 0) {
  return source.label || source.name || source.metadata?.label || `图片 ${index + 1}`;
}

function getPreferredImportOrigin(available = []) {
  return available.find(item => item.id === 'history-grid')
    || available.find(item => item.id === 'upload-preview')
    || available.find(item => item.id === 'result-output')
    || available[0]
    || null;
}

async function chooseCanvasImportOrigins(state, sourceGroups) {
  const selection = await chooseCanvasImportSelection(state, sourceGroups, { mode: 'origins' });
  return selection?.origins || [];
}

async function chooseCanvasImportSelection(state, sourceGroups, options = {}) {
  const available = CANVAS_IMPORT_ORIGIN_OPTIONS
    .map(item => ({ ...item, count: (sourceGroups.get(item.id) || []).length }))
    .filter(item => item.count > 0);
  if (!available.length) return { origins: [], sources: [] };

  // Single origin + single image: no need to ask.
  if (available.length === 1 && available[0].count === 1) {
    const only = sourceGroups.get(available[0].id) || [];
    return { origins: [available[0].id], sources: only.slice(0, 1) };
  }

  return new Promise(resolve => {
    const preferred = getPreferredImportOrigin(available);
    let activeOrigin = preferred?.id || available[0].id;
    let autoWire = options.autoWire !== false;
    const selectedByOrigin = new Map();
    available.forEach(item => {
      const list = sourceGroups.get(item.id) || [];
      const defaults = list.slice(0, Math.min(CANVAS_IMPORT_DEFAULT_ITEMS, list.length));
      // Prefer only the active preferred origin pre-checked; others start empty for clarity.
      selectedByOrigin.set(item.id, item.id === activeOrigin ? new Set(defaults.map((_, idx) => idx)) : new Set());
    });

    const overlay = openCanvasModal(state, `
      <div class="canvas-modal-card canvas-import-modal" data-role="import-modal">
        <div class="canvas-import-modal-head">
          <div>
            <h3>导入到画布</h3>
            <p class="canvas-crop-hint" data-role="import-step-hint">第 1 步：选择来源。第 2 步：勾选要导入的图片（最多 ${CANVAS_IMPORT_MAX_ITEMS} 张）</p>
          </div>
          <span class="canvas-import-step-pill" data-role="import-step-pill">步骤 1/2</span>
        </div>
        <div class="canvas-import-origin-tabs" data-role="import-origin-tabs" role="tablist" aria-label="导入来源"></div>
        <div class="canvas-import-toolbar">
          <div class="canvas-import-toolbar-left">
            <strong data-role="import-origin-title">导入来源</strong>
            <span data-role="import-selection-count">已选0</span>
          </div>
          <div class="canvas-import-toolbar-actions">
            <button type="button" data-role="import-select-visible">本源全选</button>
            <button type="button" data-role="import-clear-visible">清空本源</button>
            <button type="button" data-role="import-select-all">全选全部来源</button>
          </div>
        </div>
        <div class="canvas-import-item-list" data-role="import-item-list"></div>
        <label class="canvas-import-autowire">
          <input type="checkbox" data-role="import-auto-wire" ${autoWire ? 'checked' : ''}>
          <span>导入后自动接线（参考图 →编排 →结果图）</span>
        </label>
        <div class="canvas-modal-actions">
          <button type="button" class="is-primary" data-role="import-confirm">导入所选</button>
          <button type="button" data-role="modal-cancel">取消</button>
        </div>
      </div>
    `);
    if (!overlay) {
      const fallbackOrigin = preferred?.id || available[0].id;
      const fallbackSources = (sourceGroups.get(fallbackOrigin) || []).slice(0, CANVAS_IMPORT_DEFAULT_ITEMS);
      resolve({ origins: [fallbackOrigin], sources: fallbackSources, autoWire: true });
      return;
    }

    const tabsEl = overlay.querySelector('[data-role="import-origin-tabs"]');
    const listEl = overlay.querySelector('[data-role="import-item-list"]');
    const countEl = overlay.querySelector('[data-role="import-selection-count"]');
    const titleEl = overlay.querySelector('[data-role="import-origin-title"]');
    const stepPill = overlay.querySelector('[data-role="import-step-pill"]');
    const stepHint = overlay.querySelector('[data-role="import-step-hint"]');
    const autoWireInput = overlay.querySelector('[data-role="import-auto-wire"]');

    const totalSelectedCount = () => {
      let total = 0;
      selectedByOrigin.forEach(set => { total += set.size; });
      return total;
    };

    const collectSelectedSources = () => {
      const selected = [];
      const origins = [];
      available.forEach(item => {
        const set = selectedByOrigin.get(item.id) || new Set();
        if (!set.size) return;
        origins.push(item.id);
        const list = sourceGroups.get(item.id) || [];
        [...set].sort((a, b) => a - b).forEach(index => {
          if (list[index]) selected.push(list[index]);
        });
      });
      return { origins, sources: selected.slice(0, CANVAS_IMPORT_MAX_ITEMS) };
    };

    const renderTabs = () => {
      if (!tabsEl) return;
      tabsEl.innerHTML = available.map(item => {
        const selectedCount = (selectedByOrigin.get(item.id) || new Set()).size;
        const active = item.id === activeOrigin ? ' is-active' : '';
        const selectedClass = selectedCount > 0 ? ' is-selected' : '';
        return `
          <button type="button" class="canvas-import-origin-tab${active}${selectedClass}" data-import-origin="${escapeHtmlAttr(item.id)}" role="tab" aria-selected="${item.id === activeOrigin ? 'true' : 'false'}">
            <strong>${escapeHtml(item.label)}</strong>
            <small>${item.count} 张${selectedCount ? ` · 已选${selectedCount}` : ''}</small>
            <span>${escapeHtml(item.hint)}</span>
          </button>
        `;
      }).join('');
    };

    const renderList = () => {
      const meta = available.find(item => item.id === activeOrigin) || available[0];
      const list = sourceGroups.get(activeOrigin) || [];
      const selectedSet = selectedByOrigin.get(activeOrigin) || new Set();
      if (titleEl) titleEl.textContent = `${meta.label}（${list.length}）`;
      if (stepPill) stepPill.textContent = available.length > 1 ? '步骤 2/2' : '勾选图片';
      if (stepHint) {
        stepHint.textContent = available.length > 1
          ? `当前来源「${meta.label}」。可切换上方来源，勾选后一次导入（最多 ${CANVAS_IMPORT_MAX_ITEMS} 张）。`
          : `从「${meta.label}」勾选要导入的图片（最多 ${CANVAS_IMPORT_MAX_ITEMS} 张）。`;
      }
      if (!listEl) return;
      if (!list.length) {
        listEl.innerHTML = '<div class="canvas-import-empty">这个来源暂时没有图片</div>';
        return;
      }
      listEl.innerHTML = list.map((source, index) => {
        const preview = getImportSourcePreview(source);
        const label = getImportSourceLabel(source, index);
        const checked = selectedSet.has(index) ? 'checked' : '';
        const role = source.origin === 'result-output' ? '结果图' : '参考图';
        return `
          <label class="canvas-import-item">
            <input type="checkbox" data-import-item-index="${index}" ${checked}>
            <span class="canvas-import-item-thumb"${preview ? ` style="background-image:url('${escapeHtmlAttr(preview)}')"` : ''}></span>
            <span class="canvas-import-item-copy">
              <strong title="${escapeHtmlAttr(label)}">${escapeHtml(label)}</strong>
              <small>${escapeHtml(role)} · #${index + 1}</small>
            </span>
          </label>
        `;
      }).join('');
    };

    const syncCount = () => {
      const total = totalSelectedCount();
      if (countEl) {
        countEl.textContent = total > CANVAS_IMPORT_MAX_ITEMS
          ? `已选${total}（将导入前 ${CANVAS_IMPORT_MAX_ITEMS} 张）`
          : `已选${total}`;
      }
      const confirmBtn = overlay.querySelector('[data-role="import-confirm"]');
      if (confirmBtn) {
        confirmBtn.disabled = total === 0;
        confirmBtn.textContent = total ? `导入所选（${Math.min(total, CANVAS_IMPORT_MAX_ITEMS)}）` : '请先勾选图片';
      }
    };

    const rerender = () => {
      renderTabs();
      renderList();
      syncCount();
    };

    const finish = (payload) => {
      closeCanvasModal(state);
      resolve(payload);
    };

    tabsEl?.addEventListener('click', event => {
      const btn = event.target instanceof Element ? event.target.closest('[data-import-origin]') : null;
      if (!btn) return;
      activeOrigin = btn.getAttribute('data-import-origin') || activeOrigin;
      // If switching to an untouched origin with no selection, preselect a small default batch.
      const set = selectedByOrigin.get(activeOrigin) || new Set();
      const list = sourceGroups.get(activeOrigin) || [];
      if (!set.size && list.length) {
        list.slice(0, Math.min(CANVAS_IMPORT_DEFAULT_ITEMS, list.length)).forEach((_, idx) => set.add(idx));
        selectedByOrigin.set(activeOrigin, set);
      }
      rerender();
    });

    listEl?.addEventListener('change', event => {
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      if (!input || !input.matches('[data-import-item-index]')) return;
      const index = Number(input.getAttribute('data-import-item-index'));
      if (!Number.isFinite(index)) return;
      const set = selectedByOrigin.get(activeOrigin) || new Set();
      if (input.checked) {
        // Enforce global cap by preventing additional checks beyond max.
        if (totalSelectedCount() >= CANVAS_IMPORT_MAX_ITEMS && !set.has(index)) {
          input.checked = false;
          updateStatus(state, `一次最多导入 ${CANVAS_IMPORT_MAX_ITEMS} 张，请先取消部分勾选`);
          return;
        }
        set.add(index);
      } else {
        set.delete(index);
      }
      selectedByOrigin.set(activeOrigin, set);
      renderTabs();
      syncCount();
    });

    overlay.querySelector('[data-role="import-select-visible"]')?.addEventListener('click', () => {
      const list = sourceGroups.get(activeOrigin) || [];
      const set = new Set();
      let remaining = Math.max(0, CANVAS_IMPORT_MAX_ITEMS - (totalSelectedCount() - (selectedByOrigin.get(activeOrigin)?.size || 0)));
      list.forEach((_, index) => {
        if (remaining <= 0) return;
        set.add(index);
        remaining -= 1;
      });
      selectedByOrigin.set(activeOrigin, set);
      rerender();
    });

    overlay.querySelector('[data-role="import-clear-visible"]')?.addEventListener('click', () => {
      selectedByOrigin.set(activeOrigin, new Set());
      rerender();
    });

    overlay.querySelector('[data-role="import-select-all"]')?.addEventListener('click', () => {
      let remaining = CANVAS_IMPORT_MAX_ITEMS;
      available.forEach(item => {
        const list = sourceGroups.get(item.id) || [];
        const set = new Set();
        list.forEach((_, index) => {
          if (remaining <= 0) return;
          set.add(index);
          remaining -= 1;
        });
        selectedByOrigin.set(item.id, set);
      });
      rerender();
    });

    autoWireInput?.addEventListener('change', () => {
      autoWire = Boolean(autoWireInput.checked);
    });

    overlay.querySelector('[data-role="import-confirm"]')?.addEventListener('click', () => {
      const picked = collectSelectedSources();
      if (!picked.sources.length) {
        updateStatus(state, '请先勾选要导入的图片');
        return;
      }
      finish({ ...picked, autoWire: Boolean(autoWireInput?.checked ?? autoWire) });
    });
    overlay.querySelector('[data-role="modal-cancel"]')?.addEventListener('click', () => finish({ origins: [], sources: [], autoWire: false }));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) finish({ origins: [], sources: [], autoWire: false });
    });

    rerender();
  });
}

function getImportPlacementPoint(originPoint, index = 0, options = {}) {
  const columns = Math.max(1, Number(options.columns) || 4);
  const col = index % columns;
  const row = Math.floor(index / columns);
  const gapX = Number(options.gapX) || 220;
  const gapY = Number(options.gapY) || 180;
  const offsetX = Number(options.offsetX) || 0;
  const offsetY = Number(options.offsetY) || 0;
  return {
    x: Math.round((Number(originPoint?.x) || 0) + offsetX + col * gapX),
    y: Math.round((Number(originPoint?.y) || 0) + offsetY + row * gapY)
  };
}


function ensureImportWorkflowScaffold(state, createdIds = [], originPoint = null) {
  if (!state?.project) return null;
  const nodes = getProjectNodeList(state.project);
  let configNode = nodes.find(node => node?.type === 'config') || null;
  const mediaNodes = createdIds.map(id => state.project.nodes?.[id]).filter(node => node?.type === 'media');
  const hasTarget = mediaNodes.some(node => node.canvasRole === 'target') || nodes.some(node => node?.type === 'media' && node.canvasRole === 'target');
  const baseX = Number(originPoint?.x) || 0;
  const baseY = Number(originPoint?.y) || 0;
  if (!configNode) {
    configNode = upsertCanvasNode(state.project, createCanvasConfigNode({
      title: '编排生成',
      x: baseX + 280,
      y: baseY + 20,
      width: 240,
      height: 180,
      prompt: '基于参考图生成结果，保持主体一致'
    }));
  }
  if (!hasTarget) {
    const target = upsertCanvasNode(state.project, createCanvasMediaNode({
      title: '结果图',
      canvasRole: 'target',
      x: baseX + 560,
      y: baseY,
      width: 220,
      height: 160,
      text: '生成结果会写到这里'
    }));
    if (target?.id) createdIds.push(target.id);
  }
  return configNode;
}
function resolveImportLayoutPlan(list = [], options = {}) {
  const total = Array.isArray(list) ? list.length : 0;
  const columns = Math.max(1, Number(options.columns) || (total <= 3 ? total || 1 : total <= 8 ? Math.min(4, total) : 4));
  const references = [];
  const targets = [];
  const others = [];
  (Array.isArray(list) ? list : []).forEach((source, index) => {
    const origin = source?.origin || source?.source?.origin || '';
    const role = source?.canvasRole
      || (origin === 'result-output' ? 'target'
        : (origin === 'history-grid' || origin === 'upload-preview' ? 'reference' : 'reference'));
    const bucket = role === 'target' ? targets : (role === 'reference' ? references : others);
    bucket.push({ source, index, role });
  });
  const laneGapX = Number(options.laneGapX) || 360;
  const gapX = Number(options.gapX) || 220;
  const gapY = Number(options.gapY) || 180;
  const placements = new Map();
  const placeBucket = (bucket, laneIndex, laneColumns, offsetY = 0) => {
    bucket.forEach((entry, order) => {
      placements.set(entry.index, getImportPlacementPoint(
        { x: 0, y: 0 },
        order,
        {
          columns: Math.max(1, laneColumns || columns),
          gapX,
          gapY,
          offsetX: laneIndex * laneGapX,
          offsetY
        }
      ));
    });
  };
  if (targets.length && references.length) {
    placeBucket(references, 0, Math.min(3, Math.max(1, references.length)), 0);
    placeBucket(targets, 1, Math.min(3, Math.max(1, targets.length)), 0);
    const belowRows = Math.max(
      Math.ceil(references.length / Math.min(3, Math.max(1, references.length))),
      Math.ceil(targets.length / Math.min(3, Math.max(1, targets.length))),
      1
    );
    placeBucket(others, 0, columns, belowRows * gapY);
  } else {
    placeBucket([...references, ...targets, ...others], 0, columns, 0);
  }
  return { columns, placements, gapX, gapY, mixedRoles: Boolean(targets.length && references.length) };
}

function importSourceRecordsIntoCanvas(state, sources = [], point = null, options = {}) {
  const list = (Array.isArray(sources) ? sources : []).filter(source => source && (source.src || source.dataUrl || source.url));
  if (!list.length) {
    updateStatus(state, '没有可导入的图片');
    return [];
  }
  if (options.pushHistory !== false) pushHistory(state);
  const records = list.map((source, index) => createCanvasResourceRecord({
    kind: source.kind || 'image',
    src: source.src || source.dataUrl || source.url || '',
    label: source.label || source.name || `导入图片 ${index + 1}`,
    mimeType: source.mimeType || source.mime || 'image/png',
    origin: source.origin || 'external-import',
    metadata: source.metadata || {}
  }));
  state.resourceStore?.putMany?.(records).catch?.(error => {
    console.error('canvas resource import failed', error);
  });
  const originPoint = point || {
    x: (state.stage.clientWidth / 2 - state.viewport.x) / state.viewport.scale,
    y: (state.stage.clientHeight / 2 - state.viewport.y) / state.viewport.scale
  };
  const layout = resolveImportLayoutPlan(list, options);
  const createdIds = [];
  records.forEach((record, index) => {
    const source = list[index] || {};
    const sourceOrigin = source.origin || record?.source?.origin || '';
    const role = source.canvasRole
      || (sourceOrigin === 'result-output' ? 'target'
        : (sourceOrigin === 'history-grid' || sourceOrigin === 'upload-preview' ? 'reference' : 'reference'));
    const local = layout.placements.get(index) || getImportPlacementPoint(originPoint, index, { columns: layout.columns, gapX: layout.gapX, gapY: layout.gapY });
    const nextNode = createCanvasMediaNodeFromResource(record, {
      title: record?.metadata?.label || record?.source?.label || source.label || `导入图片 ${index + 1}`,
      canvasRole: role,
      x: Math.round((Number(originPoint?.x) || 0) + (Number(local.x) || 0)),
      y: Math.round((Number(originPoint?.y) || 0) + (Number(local.y) || 0))
    });
    const saved = upsertCanvasNode(state.project, nextNode);
    if (saved?.id) {
      createdIds.push(saved.id);
      const src = saved.resourceSrc || saved.thumbnailSrc || record?.source?.src || '';
      if (src) {
        void fitCanvasMediaNodeToSource(state, saved.id, src).then(updated => {
          if (updated) {
            persistProject(state);
            rerenderEditor(state);
          }
        });
      }
    }
  });
  if (createdIds.length) {
    // Auto-arrange same-role batches; keep mixed reference/target lane layout intact.
    const createdNodes = createdIds.map(id => state.project?.nodes?.[id]).filter(Boolean);
    const roles = new Set(createdNodes.map(node => node.canvasRole || ''));
    const mixedRoles = roles.has('reference') && roles.has('target');
    if (options.tidy !== false && createdIds.length >= 2 && !mixedRoles) {
      setSelectedNodes(state, createdIds, { rerender: false, persist: false });
      tidySelectedNodes(state, {
        pushHistory: false,
        columns: layout.columns,
        gapX: 36,
        gapY: 36,
        silent: true
      });
    }
    if (options.autoWire) {
      ensureImportWorkflowScaffold(state, createdIds, originPoint);
      setSelectedNodes(state, createdIds, { rerender: false, persist: false });
      smartWireSelectedNodes(state);
    }
    persistProject(state, { immediate: true });
    if (options.select !== false) {
      setSelectedNodes(state, createdIds, { rerender: true, persist: false });
    } else {
      rerenderEditor(state, { skipPersist: true });
    }
    if (options.fit !== false) {
      if (createdIds.length === 1) focusNodeInView(state, createdIds[0], { flash: options.flash !== false, select: false });
      else fitViewportToSelection(state);
    } else if (options.flash !== false && createdIds[0]) {
      focusNodeInView(state, createdIds[0], { flash: true, select: false });
    }
    const statusText = options.statusText
      || (createdIds.length > 1
        ? `已导入${createdIds.length} 张图片并自动整理`
        : `已导入 ${createdIds.length} 张图片`);
    updateStatus(state, statusText, { tone: 'success', stickyMs: 2400 });
    void refreshCanvasResourceDisplaySources(state);
  } else {
    updateStatus(state, '导入失败：没有创建节点');
  }
  return createdIds;
}

async function importMediaNodesFromBridge(state, point, options = {}) {
  const allSources = await getCanvasImportSourcesFromBridge(state.bridge, {});
  if (!allSources.length) {
    updateStatus(state, '没有可导入的媒体来源');
    return [];
  }

  const sourceGroups = groupImportSourcesByOrigin(allSources);
  let selectedOrigins = Array.isArray(options.origins) ? options.origins.filter(Boolean) : null;
  let selectedSources = Array.isArray(options.sources) ? options.sources.filter(Boolean) : null;
  let autoWire = options.autoWire === true;

  if ((!selectedSources || !selectedSources.length) && (!selectedOrigins || !selectedOrigins.length)) {
    if (options.skipChooser) {
      selectedOrigins = CANVAS_IMPORT_ORIGIN_OPTIONS
        .map(item => item.id)
        .filter(id => (sourceGroups.get(id) || []).length);
      selectedSources = selectedOrigins
        .flatMap(origin => sourceGroups.get(origin) || [])
        .slice(0, CANVAS_IMPORT_MAX_ITEMS);
    } else {
      const picked = await chooseCanvasImportSelection(state, sourceGroups, {
        autoWire: options.autoWire !== false
      });
      selectedOrigins = picked?.origins || [];
      selectedSources = picked?.sources || [];
      autoWire = Boolean(picked?.autoWire);
    }
  }

  if ((!selectedSources || !selectedSources.length) && selectedOrigins?.length) {
    selectedSources = selectedOrigins
      .flatMap(origin => sourceGroups.get(origin) || [])
      .slice(0, CANVAS_IMPORT_MAX_ITEMS);
  }

  if (!selectedSources?.length) {
    updateStatus(state, '已取消导入');
    return [];
  }

  const sources = selectedSources.slice(0, CANVAS_IMPORT_MAX_ITEMS);
  if (!selectedOrigins?.length) {
    selectedOrigins = [...new Set(sources.map(source => source?.origin).filter(Boolean))];
  }

  const createdIds = importSourceRecordsIntoCanvas(state, sources, point, {
    pushHistory: false,
    autoWire,
    statusText: ''
  });
  if (!createdIds.length) return [];

  const originText = (selectedOrigins.length ? selectedOrigins : ['其他来源'])
    .map(resolveImportOriginLabel)
    .join(' / ');
  const extra = sources.length < selectedSources.length
    ? `（已限制前 ${CANVAS_IMPORT_MAX_ITEMS} 张）`
    : '';
  updateStatus(
    state,
    `已从${originText}导入 ${createdIds.length} 张，${autoWire ? '并自动接线' : '并自动整理'}${extra}`,
    { tone: 'success', stickyMs: 2600 }
  );
  return createdIds;
}

function connectSelectedNodes(state) {
  const selectedIds = dedupe((state.selectedNodeIds || []).filter(id => state.project?.nodes?.[id]));
  if (selectedIds.length < 2) {
    updateStatus(state, '至少选择两个节点后才能连接');
    return { created: 0, skipped: 0, totalPairs: 0 };
  }

  // Chain in selection order: A→B→C?so multi-select connect is predictable.
  const pairs = [];
  for (let i = 0; i < selectedIds.length - 1; i += 1) {
    pairs.push([selectedIds[i], selectedIds[i + 1]]);
  }

  let created = 0;
  let skipped = 0;
  let invalid = 0;
  const creatable = pairs.filter(([fromNodeId, toNodeId]) => (
    canCreateEdgeBetween(fromNodeId, toNodeId) && !hasEdgeBetween(state.project, fromNodeId, toNodeId)
  ));
  const existing = pairs.filter(([fromNodeId, toNodeId]) => (
    canCreateEdgeBetween(fromNodeId, toNodeId) && hasEdgeBetween(state.project, fromNodeId, toNodeId)
  )).length;
  invalid = pairs.length - creatable.length - existing;

  if (!creatable.length) {
    if (existing > 0 && invalid === 0) {
      updateStatus(state, existing === 1 ? '所选相邻节点已连接' : `所选链式连接已存在（${existing}）`);
    } else {
      updateStatus(state, '当前选择无法建立连线');
    }
    return { created: 0, skipped: existing, invalid, totalPairs: pairs.length };
  }

  pushHistory(state);
  creatable.forEach(([fromNodeId, toNodeId]) => {
    upsertCanvasEdge(state.project, { fromNodeId, toNodeId, kind: 'relation' });
    created += 1;
  });
  skipped = existing;
  persistProject(state);
  rerenderEditor(state, { skipPersist: true });
  if (pairs.length === 1) {
    updateStatus(state, '已创建节点连接');
  } else if (skipped || invalid) {
    updateStatus(state, `已链式连接 ${created} 条` + (skipped ? `，跳过已连 ${skipped}` : '') + (invalid ? `，无效 ${invalid}` : ''));
  } else {
    updateStatus(state, `已按选择顺序链式连接 ${created} 条`);
  }
  return { created, skipped, invalid, totalPairs: pairs.length };
}

function nodeCenter(node) {
  return {
    x: (Number(node?.x) || 0) + ((Number(node?.width) || 0) / 2),
    y: (Number(node?.y) || 0) + ((Number(node?.height) || 0) / 2)
  };
}

function distanceBetweenNodes(a, b) {
  const ca = nodeCenter(a);
  const cb = nodeCenter(b);
  const dx = ca.x - cb.x;
  const dy = ca.y - cb.y;
  return Math.hypot(dx, dy);
}

function findNearestNode(sourceNode, candidates = []) {
  let best = null;
  let bestDist = Infinity;
  candidates.forEach(node => {
    if (!node || node.id === sourceNode?.id) return;
    const dist = distanceBetweenNodes(sourceNode, node);
    if (dist < bestDist) {
      bestDist = dist;
      best = node;
    }
  });
  return best;
}

function hasEdgeBetween(project, fromNodeId, toNodeId) {
  return Object.values(project?.edges || {}).some(edge => (
    edge?.fromNodeId === fromNodeId && edge?.toNodeId === toNodeId
  ));
}

function ensureEdgeBetween(state, fromNodeId, toNodeId, label = '') {
  if (!canCreateEdgeBetween(fromNodeId, toNodeId)) return false;
  if (hasEdgeBetween(state.project, fromNodeId, toNodeId)) return false;
  upsertCanvasEdge(state.project, {
    fromNodeId,
    toNodeId,
    label: label || ''
  });
  return true;
}

function getBoardWorkflowSnapshot(state) {
  const nodes = getProjectNodeList(state.project).filter(node => node && !node.hidden);
  const edges = Object.values(state.project?.edges || {}).filter(Boolean);
  const media = nodes.filter(node => node.type === 'media');
  const configs = nodes.filter(node => node.type === 'config' || node.type === 'loop' || node.type === 'llm');
  const references = media.filter(node => node.canvasRole === 'reference' || /历史图|参考/.test(String(node.title || '')));
  const targets = media.filter(node => node.canvasRole === 'target' || /结果图|输出/.test(String(node.title || '')));
  const plainMedia = media.filter(node => !node.canvasRole);
  const configIds = new Set(configs.map(node => node.id));
  const wiredRefCount = edges.filter(edge => configIds.has(edge.toNodeId)).length;
  const wiredTargetCount = edges.filter(edge => configIds.has(edge.fromNodeId)).length;
  return {
    nodeCount: nodes.length,
    mediaCount: media.length,
    configCount: configs.length,
    referenceCount: references.length || plainMedia.length,
    targetCount: targets.length,
    plainMediaCount: plainMedia.length,
    edgeCount: edges.length,
    wiredRefCount,
    wiredTargetCount,
    hasConfig: configs.length > 0,
    hasMedia: media.length > 0,
    isEmpty: nodes.length === 0,
    needsWire: (media.length > 0 || configs.length > 0) && (wiredRefCount + wiredTargetCount) < Math.max(1, Math.min(media.length || 1, 2)),
    canGenerate: configs.some(node => {
      if (node.type === 'config') return Boolean(String(node.composerContent || node.promptText || '').trim());
      if (node.type === 'loop') return Array.isArray(node.variations) && node.variations.some(v => String(v || '').trim());
      if (node.type === 'llm') return Boolean(String(node.llmInput || node.text || '').trim());
      return false;
    })
  };
}

function findPreferredConfigNode(state, preferredIds = []) {
  const nodes = getProjectNodeList(state.project).filter(node => node && !node.hidden);
  const preferred = preferredIds
    .map(id => state.project?.nodes?.[id])
    .filter(node => node?.type === 'config');
  if (preferred.length) return preferred[0];
  return nodes.find(node => node?.type === 'config') || null;
}

function findPreferredGeneratorNode(state, preferredIds = []) {
  const selectedIds = Array.isArray(preferredIds) ? preferredIds : [];
  const selected = selectedIds
    .map(id => state.project?.nodes?.[id])
    .filter(node => node && (node.type === 'config' || node.type === 'loop' || node.type === 'llm'));
  if (selected.length) {
    const readySelected = selected.find(node => getGenerationReadiness(state, node).canGenerate);
    return readySelected || selected[0];
  }

  const boardNodes = getProjectNodeList(state.project).filter(node => node && !node.hidden);
  const generators = boardNodes.filter(node => node.type === 'config' || node.type === 'loop' || node.type === 'llm');
  if (!generators.length) return null;

  const ready = generators
    .map(node => ({ node, readiness: getGenerationReadiness(state, node) }))
    .filter(item => item.readiness.canGenerate)
    .sort((a, b) => {
      const rank = level => (level === 'ready' ? 0 : (level === 'warn' ? 1 : 2));
      return rank(a.readiness.level) - rank(b.readiness.level);
    });
  if (ready.length) return ready[0].node;

  // Prefer config over loop/llm when nothing is ready yet.
  return generators.find(node => node.type === 'config')
    || generators.find(node => node.type === 'loop')
    || generators[0]
    || null;
}

function findPreferredReferenceNode(state, preferredIds = []) {
  const nodes = getProjectNodeList(state.project);
  const preferred = preferredIds
    .map(id => state.project?.nodes?.[id])
    .filter(node => node?.type === 'media' && (node.canvasRole === 'reference' || /历史图|参考/.test(String(node.title || ''))));
  if (preferred.length) return preferred[0];
  return nodes.find(node => node?.type === 'media' && node.canvasRole === 'reference')
    || nodes.find(node => node?.type === 'media' && /历史图|参考/.test(String(node.title || '')))
    || null;
}

function applyMediaSourceToNode(targetNode, sourceNode, options = {}) {
  if (!targetNode || !sourceNode) return targetNode;
  targetNode.kind = sourceNode.kind || targetNode.kind || 'image';
  targetNode.resourceId = sourceNode.resourceId || targetNode.resourceId || '';
  targetNode.resourceSrc = sourceNode.resourceSrc || sourceNode.thumbnailSrc || sourceNode.posterSrc || '';
  targetNode.thumbnailSrc = sourceNode.thumbnailSrc || sourceNode.resourceSrc || sourceNode.posterSrc || '';
  targetNode.posterSrc = sourceNode.posterSrc || '';
  targetNode.mimeType = sourceNode.mimeType || targetNode.mimeType || '';
  if (Number.isFinite(sourceNode.durationMs)) targetNode.durationMs = sourceNode.durationMs;
  if (options.keepTitle !== true) {
    const sourceTitle = String(sourceNode.title || '').trim();
    if (sourceTitle && !/历史图|结果图|参考输入|自动回写/.test(sourceTitle)) {
      targetNode.title = sourceTitle;
    } else if (!targetNode.title) {
      targetNode.title = sourceTitle || '历史图（参考输入）';
    }
  }
  if (options.role) targetNode.canvasRole = options.role;
  else if (!targetNode.canvasRole) targetNode.canvasRole = 'reference';
  ensureCanvasMediaNodeClip(targetNode);
  return targetNode;
}

function applyResourceRecordToNode(targetNode, record, options = {}) {
  if (!targetNode || !record) return targetNode;
  const media = createCanvasMediaNodeFromResource(record, {
    id: targetNode.id,
    title: options.title || targetNode.title,
    canvasRole: options.role || targetNode.canvasRole || 'reference',
    x: targetNode.x,
    y: targetNode.y,
    width: targetNode.width,
    height: targetNode.height
  });
  Object.assign(targetNode, {
    kind: media.kind,
    resourceId: media.resourceId,
    resourceSrc: media.resourceSrc,
    thumbnailSrc: media.thumbnailSrc,
    posterSrc: media.posterSrc,
    mimeType: media.mimeType,
    durationMs: media.durationMs,
    canvasRole: media.canvasRole || 'reference',
    title: media.title || targetNode.title
  });
  ensureCanvasMediaNodeClip(targetNode);
  return targetNode;
}

function smartWireSelectedNodes(state) {
  const selectedIds = [...(state.selectedNodeIds || [])];
  const selectedNodes = selectedIds.map(id => state.project?.nodes?.[id]).filter(Boolean);
  const allNodes = getProjectNodeList(state.project).filter(node => node && !node.hidden);
  const configNode = findPreferredConfigNode(state, selectedIds)
    || findNearestNode(selectedNodes[0], allNodes.filter(node => node.type === 'config'))
    || allNodes.find(node => node.type === 'config');
  if (!configNode) {
    updateStatus(state, '请先添加一个编排节点（生成规则），再使用智能接线');
    return { created: 0, reason: 'missing-config' };
  }

  const roleMediaFallback = allNodes.filter(node => (
    node.type === 'media'
    && node.id !== configNode.id
    && (
      node.canvasRole === 'reference'
      || node.canvasRole === 'target'
      || /历史图|参考|结果图|输出/.test(String(node.title || ''))
    )
  ));
  // Empty selection: fall back to role media, then any media on the board.
  const boardMediaFallback = roleMediaFallback.length
    ? roleMediaFallback
    : allNodes.filter(node => node.type === 'media' && node.id !== configNode.id);
  const mediaNodes = (selectedNodes.length ? selectedNodes : boardMediaFallback)
    .filter(node => node.type === 'media' && node.id !== configNode.id);
  const sourceNodes = mediaNodes.filter(node => node.canvasRole !== 'target' && !/结果图|输出/.test(String(node.title || '')));
  const targetNodes = mediaNodes.filter(node => node.canvasRole === 'target' || /结果图|输出/.test(String(node.title || '')));
  const textNodes = (selectedNodes.length ? selectedNodes : allNodes)
    .filter(node => (node.type === 'text' || node.type === 'note') && /文本|prompt|补充/.test(String(node.title || node.text || '')));

  if (!sourceNodes.length && !targetNodes.length && !textNodes.length) {
    updateStatus(state, selectedNodes.length
      ? '请先选中参考图/结果图，或选中要接入编排的节点'
      : '画布上还没有可接线的媒体节点，请先导入图片');
    return { created: 0, reason: 'missing-media' };
  }

  pushHistory(state);
  let created = 0;
  const referenceIds = new Set(Array.isArray(configNode.references) ? configNode.references : []);

  sourceNodes.forEach(node => {
    if (!node.canvasRole) node.canvasRole = 'reference';
    if (ensureEdgeBetween(state, node.id, configNode.id, '历史图参考')) created += 1;
    referenceIds.add(node.id);
    upsertCanvasNode(state.project, node);
  });

  textNodes.forEach(node => {
    if (ensureEdgeBetween(state, node.id, configNode.id, '补充提示词')) created += 1;
  });

  let targetNode = targetNodes[0] || (configNode.targetNodeId ? state.project?.nodes?.[configNode.targetNodeId] : null);
  if (!targetNode) {
    targetNode = findNearestNode(configNode, allNodes.filter(node => node.type === 'media' && node.canvasRole === 'target'));
  }
  if (targetNode) {
    targetNode.canvasRole = targetNode.canvasRole || 'target';
    configNode.targetNodeId = targetNode.id;
    if (ensureEdgeBetween(state, configNode.id, targetNode.id, '执行生成并回写')) created += 1;
    upsertCanvasNode(state.project, targetNode);
  }

  configNode.references = [...referenceIds];
  ensureCanvasConfigNode(configNode);
  upsertCanvasNode(state.project, configNode);
  persistProject(state);
  setSelectedNodes(state, [configNode.id], { rerender: true, persist: false, openInspector: false });
  updateStatus(
    state,
    created
      ? `智能接线完成：已整理 ${created} 条连线到「${configNode.title || '编排节点'}」`
      : `智能接线完成：编排关系已是最新`
  );
  return { created, configId: configNode.id };
}

function replaceSampleReferenceWithSelection(state) {
  const selected = getPrimarySelectedNode(state);
  if (!selected || selected.type !== 'media') {
    updateStatus(state, '请先选中一张要替换进去的媒体节点');
    return;
  }
  const target = findPreferredReferenceNode(state, state.selectedNodeIds.filter(id => id !== selected.id));
  if (!target) {
    updateStatus(state, '画布里还没有历史图/参考节点可替换');
    return;
  }
  if (target.id === selected.id) {
    updateStatus(state, '当前选中的就是历史图节点');
    return;
  }

  pushHistory(state);
  applyMediaSourceToNode(target, selected, { role: 'reference', keepTitle: true });
  if (!/历史图|参考/.test(String(target.title || ''))) {
    target.title = '历史图（参考输入）';
  }
  upsertCanvasNode(state.project, target);

  const configNode = findPreferredConfigNode(state);
  if (configNode) {
    const refs = new Set(Array.isArray(configNode.references) ? configNode.references : []);
    refs.add(target.id);
    configNode.references = [...refs];
    ensureEdgeBetween(state, target.id, configNode.id, '历史图参考');
    ensureCanvasConfigNode(configNode);
    upsertCanvasNode(state.project, configNode);
  }

  // Keep the board clean: remove the temporary imported source node if it was only a carrier.
  if (selected.canvasRole !== 'target' && selected.id !== configNode?.targetNodeId) {
    removeCanvasNode(state.project, selected.id);
  }

  persistProject(state);
  setSelectedNodes(state, [target.id], { rerender: false, persist: false, openInspector: false });
  focusNodeInView(state, target.id, { flash: true, select: false });
  updateStatus(state, `已替换到历史图节点选${target.title || target.id}」`);
}

async function fillSampleReferenceFromHistory(state) {
  const target = findPreferredReferenceNode(state, state.selectedNodeIds);
  if (!target) {
    updateStatus(state, '当前项目没有可填充的历史图节点');
    return;
  }

  const sources = await getCanvasImportSourcesFromBridge(state.bridge, {
    origins: ['history-grid']
  });
  if (!sources.length) {
    updateStatus(state, '右侧历史记录里暂无可用图片');
    return;
  }

  const record = createCanvasResourceRecord(sources[0]);
  state.resourceStore?.put?.(record).catch?.(error => {
    console.error('canvas sample fill failed', error);
  });

  pushHistory(state);
  applyResourceRecordToNode(target, record, {
    role: 'reference',
    title: target.title || '历史图（参考输入）'
  });
  upsertCanvasNode(state.project, target);

  const configNode = findPreferredConfigNode(state);
  if (configNode) {
    const refs = new Set(Array.isArray(configNode.references) ? configNode.references : []);
    refs.add(target.id);
    configNode.references = [...refs];
    ensureEdgeBetween(state, target.id, configNode.id, '历史图参考');
    ensureCanvasConfigNode(configNode);
    upsertCanvasNode(state.project, configNode);
  }

  persistProject(state);
  setSelectedNodes(state, [target.id], { rerender: false, persist: false, openInspector: false });
  focusNodeInView(state, target.id, { flash: true, select: false });
  updateStatus(state, `已用最新历史记录填充「${target.title || '历史图'}」`);
}

function addSelectedNodesToTimeline(state) {
  const mediaNodeIds = state.selectedNodeIds.filter(nodeId => state.project?.nodes?.[nodeId]?.type === 'media');
  if (!mediaNodeIds.length) {
    updateStatus(state, '请选择媒体节点后再加入时间轴');
    return;
  }
  pushHistory(state);

  const trackTails = getTimelineTailMsByTrack(state.project);
  mediaNodeIds.forEach(nodeId => {
    const node = state.project.nodes[nodeId];
    ensureCanvasMediaNodeClip(node);
    const trackId = node.clip.trackId || getPreferredTrackIdForKind(node.kind);
    const startMs = trackTails.get(trackId) || 0;
    attachNodeToTimeline(state.project, nodeId, {
      trackId,
      startMs,
      durationMs: node.clip.durationMs || node.durationMs || 4000
    });
    trackTails.set(trackId, startMs + node.clip.durationMs);
  });

  // Adding clips is an intentional timeline action; expand so the user can edit them.
  if (state.timelineCollapsed) setTimelineCollapsed(state, false);
  syncPlayheadToSelectedNode(state);
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, `已将 ${mediaNodeIds.length} 个媒体节点加入时间轴`);
}

function zoomViewportByStep(state, factor) {
  const stageRect = state.stage.getBoundingClientRect();
  const point = { x: stageRect.width / 2, y: stageRect.height / 2 };
  const nextScale = clamp(state.viewport.scale * factor, MIN_SCALE, MAX_SCALE);
  state.viewport = zoomAroundPoint(state.viewport, point, nextScale);
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, `缩放 ${(nextScale * 100).toFixed(0)}%`);
}

function setSelectedEdge(state, edgeId = '') {
  const nextId = edgeId && state.project?.edges?.[edgeId] ? edgeId : '';
  state.selectedEdgeId = nextId;
  if (nextId) {
    // Selecting an edge clears node selection for clearer delete semantics.
    state.selectedNodeIds = [];
    setSidebarTab(state, 'inspector');
    const info = describeSelectedEdge(state);
    updateStatus(state, info?.status || '已选中连线，按 Delete 删除');
  }
  const midGesture = Boolean(state.dragState || state.boxState || state.panState || state.pinchState);
  rerenderEditor(state, {
    skipPersist: true,
    forceFullChrome: !midGesture,
    reason: 'select-edge'
  });
}

function deleteSelectedEdge(state) {
  if (!state.selectedEdgeId) return;
  pushHistory(state);
  removeCanvasEdge(state.project, state.selectedEdgeId);
  state.selectedEdgeId = '';
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, '已删除连线');
}

function reverseSelectedEdge(state, options = {}) {
  const edgeId = state.selectedEdgeId;
  if (!edgeId) {
    if (options.silent !== true) updateStatus(state, '请先选择一条连线');
    return null;
  }
  const edge = state.project?.edges?.[edgeId];
  if (!edge) {
    if (options.silent !== true) updateStatus(state, '连线不存在');
    return null;
  }
  const fromNodeId = edge.fromNodeId;
  const toNodeId = edge.toNodeId;
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
    if (options.silent !== true) updateStatus(state, '无法反转该连线');
    return null;
  }
  if (!canCreateEdgeBetween(toNodeId, fromNodeId)) {
    if (options.silent !== true) updateStatus(state, '反转后的方向不被允许');
    return null;
  }
  const reverseExisting = Object.values(state.project?.edges || {}).find(item => (
    item && item.id !== edgeId && item.fromNodeId === toNodeId && item.toNodeId === fromNodeId
  ));
  if (reverseExisting) {
    if (options.silent !== true) updateStatus(state, '反方向连线已存在');
    return null;
  }
  if (options.pushHistory !== false) pushHistory(state);
  const next = upsertCanvasEdge(state.project, {
    ...edge,
    id: edgeId,
    fromNodeId: toNodeId,
    toNodeId: fromNodeId
  });
  persistProject(state, options.immediate ? { immediate: true } : {});
  state.selectedEdgeId = edgeId;
  if (options.rerender !== false) rerenderEditor(state, { skipPersist: true });
  if (options.silent !== true) {
    const fromTitle = state.project?.nodes?.[toNodeId]?.title || toNodeId;
    const toTitle = state.project?.nodes?.[fromNodeId]?.title || fromNodeId;
    updateStatus(state, '已反转连线：' + fromTitle + ' →' + toTitle, { tone: 'success', stickyMs: 1600 });
  }
  return next;
}

function getEdgeQuickbarAnchor(state, edge) {
  if (!edge) return null;
  const from = state.project?.nodes?.[edge.fromNodeId];
  const to = state.project?.nodes?.[edge.toNodeId];
  if (!from && !to) return null;
  const fromPoint = from
    ? {
        x: (Number(from.x) || 0) + ((Number(from.width) || 0) / 2),
        y: (Number(from.y) || 0) + ((Number(from.height) || 0) / 2)
      }
    : null;
  const toPoint = to
    ? {
        x: (Number(to.x) || 0) + ((Number(to.width) || 0) / 2),
        y: (Number(to.y) || 0) + ((Number(to.height) || 0) / 2)
      }
    : null;
  if (fromPoint && toPoint) {
    return {
      x: (fromPoint.x + toPoint.x) / 2,
      y: (fromPoint.y + toPoint.y) / 2
    };
  }
  return fromPoint || toPoint;
}

function syncEdgeQuickbar(state, options = {}) {
  if (!state.edgeQuickbar) return;
  const hideForDrag = options.hideForDrag ?? Boolean(
    state.boxState || state.panState || state.dragState || state.resizeState
    || state.rotateState || state.connectState || state.previewActive
  );
  const edgeId = state.selectedEdgeId || '';
  const edge = edgeId ? state.project?.edges?.[edgeId] : null;
  const visible = Boolean(edge) && !hideForDrag && !(state.selectedNodeIds || []).length;
  state.edgeQuickbar.hidden = !visible;
  if (!visible) {
    state.edgeQuickbar.style.left = '';
    state.edgeQuickbar.style.top = '';
    return;
  }

  const fromNode = state.project?.nodes?.[edge.fromNodeId];
  const toNode = state.project?.nodes?.[edge.toNodeId];
  const fromTitle = String(fromNode?.title || edge.fromNodeId || '起点').replace(/\s+/g, ' ').trim();
  const toTitle = String(toNode?.title || edge.toNodeId || '目标节点').replace(/\s+/g, ' ').trim();
  const title = (fromTitle.length > 8 ? fromTitle.slice(0, 8) + '…' : fromTitle)
    + ' →'
    + (toTitle.length > 8 ? toTitle.slice(0, 8) + '…' : toTitle);
  if (state.edgeQuickbarTitle) state.edgeQuickbarTitle.textContent = title;
  if (state.edgeQuickbarHint) state.edgeQuickbarHint.textContent = 'R 反转 · Delete 删除';

  const canReverse = Boolean(
    edge.fromNodeId && edge.toNodeId && edge.fromNodeId !== edge.toNodeId
    && canCreateEdgeBetween(edge.toNodeId, edge.fromNodeId)
    && !Object.values(state.project?.edges || {}).some(item => (
      item && item.id !== edgeId && item.fromNodeId === edge.toNodeId && item.toNodeId === edge.fromNodeId
    ))
  );
  state.edgeQuickbar.querySelectorAll('[data-action="reverse-selected-edge"]').forEach(button => {
    button.disabled = !canReverse;
    button.classList.toggle('is-disabled', !canReverse);
    button.classList.add('is-quick-recommended');
  });
  state.edgeQuickbar.querySelectorAll('[data-action="focus-edge-source"]').forEach(button => {
    button.disabled = !fromNode;
    button.classList.toggle('is-disabled', !fromNode);
  });
  state.edgeQuickbar.querySelectorAll('[data-action="focus-edge-target"]').forEach(button => {
    button.disabled = !toNode;
    button.classList.toggle('is-disabled', !toNode);
  });
  state.edgeQuickbar.querySelectorAll('[data-action="select-edge-endpoints"]').forEach(button => {
    const ok = Boolean(fromNode || toNode);
    button.disabled = !ok;
    button.classList.toggle('is-disabled', !ok);
  });

  const stage = state.stage;
  const stageRect = stage?.getBoundingClientRect?.();
  if (!stageRect || !stageRect.width || !stageRect.height) return;
  const anchor = getEdgeQuickbarAnchor(state, edge);
  if (!anchor) return;
  const scale = Math.max(0.2, Number(state.viewport?.scale) || 1);
  const vx = Number(state.viewport?.x) || 0;
  const vy = Number(state.viewport?.y) || 0;
  const screenX = vx + anchor.x * scale;
  const screenY = vy + anchor.y * scale - 18;
  const barWidth = state.edgeQuickbar.offsetWidth || 320;
  const barHeight = state.edgeQuickbar.offsetHeight || 72;
  const left = Math.min(Math.max(10, screenX - barWidth / 2), Math.max(10, stageRect.width - barWidth - 10));
  const bottomReserve = getStageFloatingBottomReserve(state);
  const top = Math.min(Math.max(10, screenY - barHeight), Math.max(10, stageRect.height - barHeight - bottomReserve));
  state.edgeQuickbar.style.left = Math.round(left) + 'px';
  state.edgeQuickbar.style.top = Math.round(top) + 'px';
}

function collectDeleteNodeIds(state, seedIds = [], options = {}) {
  const ids = new Set((seedIds || []).filter(Boolean));
  const nodes = state.project?.nodes || {};
  const includeLocked = options.includeLocked === true;
  [...ids].forEach(id => {
    const node = nodes[id];
    if (!node || node.type !== 'group') return;
    Object.values(nodes).forEach(member => {
      if (member && member.groupId === id) ids.add(member.id);
    });
  });
  return [...ids].filter(id => {
    const node = nodes[id];
    if (!node) return false;
    if (!includeLocked && node.locked) return false;
    return true;
  });
}

function summarizeDeleteSelection(state, seedIds = [], deleteIds = [], options = {}) {
  const nodes = state.project?.nodes || {};
  const seedNodes = seedIds.map(id => nodes[id]).filter(Boolean);
  const groupCount = seedNodes.filter(node => node.type === 'group').length;
  const memberExtra = Math.max(0, deleteIds.length - seedIds.filter(id => deleteIds.includes(id)).length);
  const lockedSkipped = seedIds
    .map(id => nodes[id])
    .filter(node => node && node.locked)
    .length;
  const lockedCount = deleteIds.map(id => nodes[id]).filter(node => node && node.locked).length;
  const titles = seedNodes
    .filter(node => options.includeLocked === true || !node.locked)
    .slice(0, 3)
    .map(node => node.title || (node.type === 'group' ? '分组' : '未命名'));
  const more = seedNodes.length > 3 ? ` 等 ${seedNodes.length} 项` : '';
  const detailParts = [];
  if (groupCount > 0) detailParts.push(`${groupCount} 个分组`);
  if (memberExtra > 0) detailParts.push(`${memberExtra} 个组内成员`);
  if (lockedCount > 0) detailParts.push(`${lockedCount} 个锁定节点`);
  if (lockedSkipped > 0 && options.includeLocked !== true) detailParts.push(`跳过 ${lockedSkipped} 个锁定`);
  return {
    count: deleteIds.length,
    groupCount,
    memberExtra,
    lockedCount,
    lockedSkipped,
    includeLocked: options.includeLocked === true,
    titleText: titles.join('、') + more,
    detailText: detailParts.length ? detailParts.join('；') : '所选节点',
    needsConfirm: groupCount > 0 || deleteIds.length >= 3 || lockedCount > 0
  };
}

function confirmDeleteSelection(state, summary) {
  return new Promise(resolve => {
    const lockedNote = summary.includeLocked && summary.lockedCount > 0
      ? '<p class="canvas-delete-warning">包含锁定节点，确认后将一并删除。</p>'
      : (summary.lockedSkipped > 0
        ? `<p class="canvas-delete-warning">已默认跳过 ${summary.lockedSkipped} 个锁定节点；如需删除请先解锁。</p>`
        : '<p class="canvas-delete-warning">分组会连同成员一起删除，可稍后 Ctrl+Z 撤销。</p>');
    const overlay = openCanvasModal(state, `
      <div class="canvas-modal-card canvas-delete-modal" data-role="delete-confirm-modal">
        <h3>确认删除</h3>
        <p class="canvas-delete-lead">将永久删除 <strong>${summary.count}</strong> 个节点。</p>
        <p class="canvas-delete-detail">${escapeHtml(summary.detailText)}：${escapeHtml(summary.titleText || '未命名')}</p>
        ${lockedNote}
        <div class="canvas-modal-actions">
          <button type="button" class="is-danger" data-role="delete-confirm">删除</button>
          <button type="button" data-role="delete-cancel">取消</button>
        </div>
      </div>
    `);
    if (!overlay) {
      resolve(true);
      return;
    }
    let settled = false;
    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      }
    };
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('keydown', onKey, true);
      closeCanvasModal(state);
      resolve(Boolean(ok));
    };
    overlay.querySelector('[data-role="delete-confirm"]')?.addEventListener('click', () => finish(true));
    overlay.querySelector('[data-role="delete-cancel"]')?.addEventListener('click', () => finish(false));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) finish(false);
    });
    window.addEventListener('keydown', onKey, true);
    // Focus primary danger action for keyboard users.
    queueMicrotask(() => {
      overlay.querySelector('[data-role="delete-confirm"]')?.focus?.();
    });
  });
}

async function deleteSelectedNodes(state, options = {}) {
  if (!state.selectedNodeIds.length) return [];
  if (state._deleteConfirmOpen) return [];
  const seedIds = [...state.selectedNodeIds];
  const includeLocked = options.includeLocked === true;
  const deleteIds = collectDeleteNodeIds(state, seedIds, { includeLocked });
  if (!deleteIds.length) {
    const lockedOnly = seedIds.some(id => state.project?.nodes?.[id]?.locked);
    updateStatus(state, lockedOnly ? '所选节点已锁定，请先解锁再删除' : '没有可删除的节点');
    return [];
  }
  const summary = summarizeDeleteSelection(state, seedIds, deleteIds, { includeLocked });
  const skipConfirm = options.skipConfirm === true;
  if (!skipConfirm && summary.needsConfirm) {
    state._deleteConfirmOpen = true;
    let confirmed = false;
    try {
      confirmed = await confirmDeleteSelection(state, summary);
    } finally {
      state._deleteConfirmOpen = false;
    }
    if (!confirmed) {
      updateStatus(state, '已取消删除');
      return [];
    }
  }
  pushHistory(state);
  deleteIds.forEach(nodeId => removeCanvasNode(state.project, nodeId));
  // Keep remaining locked selection if any were skipped.
  state.selectedNodeIds = seedIds.filter(id => state.project?.nodes?.[id]);
  state.selectedEdgeId = '';
  persistProject(state, { immediate: true });
  void scheduleCanvasResourceGarbageCollection(state);
  rerenderEditor(state);
  const skippedNote = summary.lockedSkipped > 0 && !includeLocked ? `，跳过 ${summary.lockedSkipped} 个锁定` : '';
  if (summary.groupCount > 0 && summary.memberExtra > 0) {
    updateStatus(state, `已删除 ${deleteIds.length} 个节点（含 ${summary.groupCount} 个分组及成员${skippedNote}）`);
  } else {
    updateStatus(state, `已删除 ${deleteIds.length} 个节点${skippedNote}`);
  }
  return deleteIds;
}

function collectCloneSeedIds(state, seedIds = []) {
  const ids = new Set((seedIds || []).filter(Boolean));
  const nodes = state.project?.nodes || {};
  [...ids].forEach(id => {
    const node = nodes[id];
    if (!node) return;
    if (node.type === 'group') {
      Object.values(nodes).forEach(member => {
        if (member && member.groupId === id) ids.add(member.id);
      });
    }
  });
  return [...ids];
}

function collectInternalEdgesForNodes(state, nodeIds = []) {
  const idSet = new Set(nodeIds || []);
  return Object.values(state.project?.edges || {}).filter(edge =>
    edge && idSet.has(edge.fromNodeId) && idSet.has(edge.toNodeId)
  ).map(edge => JSON.parse(JSON.stringify(edge)));
}

function buildClonePayloadFromSelection(state, seedIds = []) {
  const expandedIds = collectCloneSeedIds(state, seedIds);
  const nodes = expandedIds
    .map(id => state.project?.nodes?.[id])
    .filter(Boolean)
    .map(node => JSON.parse(JSON.stringify(node)));
  const edges = collectInternalEdgesForNodes(state, expandedIds);
  return { nodeIds: expandedIds, nodes, edges };
}

function clonePayloadIntoProject(state, payload, options = {}) {
  const nodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
  if (!nodes.length) return [];
  const offsetX = Number.isFinite(options.offsetX) ? options.offsetX : 36;
  const offsetY = Number.isFinite(options.offsetY) ? options.offsetY : 36;
  const rename = options.rename !== false;
  const idMap = new Map();

  // Create all nodes first with temporary empty groupId, then remap membership.
  const created = [];
  nodes.forEach(node => {
    const oldId = node.id;
    const next = {
      ...JSON.parse(JSON.stringify(node)),
      id: undefined,
      x: (Number(node.x) || 0) + offsetX,
      y: (Number(node.y) || 0) + offsetY,
      groupId: '',
      title: rename
        ? ((node.type === 'group' || !String(node.title || '').includes('副本'))
          ? `${node.title || '未命名'} 副本`
          : (node.title || '未命名'))
        : (node.title || '未命名'),
      generationTaskId: '',
      generationStartedAt: 0,
      generationStatus: 'idle',
      generationError: '',
      createdAt: undefined,
      updatedAt: undefined
    };
    const saved = upsertCanvasNode(state.project, next);
    if (saved?.id) {
      if (oldId) idMap.set(oldId, saved.id);
      created.push(saved);
    }
  });

  // Remap group membership for cloned members.
  nodes.forEach(original => {
    const newId = idMap.get(original.id);
    if (!newId) return;
    const live = state.project.nodes[newId];
    if (!live) return;
    if (original.groupId && idMap.has(original.groupId)) {
      live.groupId = idMap.get(original.groupId);
      upsertCanvasNode(state.project, live);
    }
  });

  // Clone internal edges with remapped endpoints.
  (Array.isArray(payload?.edges) ? payload.edges : []).forEach(edge => {
    const fromNodeId = idMap.get(edge.fromNodeId);
    const toNodeId = idMap.get(edge.toNodeId);
    if (!fromNodeId || !toNodeId) return;
    upsertCanvasEdge(state.project, {
      ...edge,
      id: undefined,
      fromNodeId,
      toNodeId
    });
  });

  // Prefer selecting top-level clones corresponding to original seed selection.
  const seedIds = Array.isArray(options.seedIds) ? options.seedIds : [];
  const selectedIds = (seedIds.length ? seedIds : nodes.map(node => node.id))
    .map(id => idMap.get(id))
    .filter(Boolean);
  return selectedIds.length ? selectedIds : created.map(node => node.id);
}

function duplicateSelectedNodes(state) {
  if (!state.selectedNodeIds.length) return [];
  pushHistory(state);
  const seedIds = [...state.selectedNodeIds];
  const payload = buildClonePayloadFromSelection(state, seedIds);
  const createdIds = clonePayloadIntoProject(state, payload, {
    offsetX: 36,
    offsetY: 36,
    rename: true,
    seedIds
  });
  persistProject(state);
  setSelectedNodes(state, createdIds, { rerender: true, persist: false });
  if (createdIds[0]) focusNodeInView(state, createdIds[0], { flash: true, select: false });
  updateStatus(state, `已复制 ${createdIds.length} 个节点${payload.nodes.length > seedIds.length ? '（含分组成员）' : ''}`);
  return createdIds;
}

function copySelectedNodesToClipboard(state) {
  if (!state.selectedNodeIds.length) {
    state.clipboardNodes = [];
    state.clipboardEdges = [];
    state.clipboardSeedIds = [];
    updateStatus(state, '没有可拷贝的节点');
    return;
  }
  const seedIds = [...state.selectedNodeIds];
  const payload = buildClonePayloadFromSelection(state, seedIds);
  state.clipboardNodes = payload.nodes;
  state.clipboardEdges = payload.edges;
  state.clipboardSeedIds = seedIds;
  const extra = payload.nodes.length - seedIds.length;
  updateStatus(state, extra > 0
    ? `已拷贝 ${seedIds.length} 个（含 ${extra} 个分组成员）`
    : `已拷贝 ${payload.nodes.length} 个节点`);
}

function pasteClipboardNodes(state, offset = { x: 36, y: 36 }) {
  const nodes = Array.isArray(state.clipboardNodes) ? state.clipboardNodes : [];
  if (!nodes.length) {
    updateStatus(state, '剪贴板为空，先 Ctrl+C 或复制节点');
    return [];
  }
  pushHistory(state);
  const createdIds = clonePayloadIntoProject(state, {
    nodes,
    edges: Array.isArray(state.clipboardEdges) ? state.clipboardEdges : []
  }, {
    offsetX: Number(offset.x) || 36,
    offsetY: Number(offset.y) || 36,
    rename: false,
    seedIds: Array.isArray(state.clipboardSeedIds) ? state.clipboardSeedIds : []
  });
  persistProject(state);
  setSelectedNodes(state, createdIds, { rerender: true, persist: false });
  if (createdIds[0]) focusNodeInView(state, createdIds[0], { flash: true, select: false });
  updateStatus(state, `已粘贴 ${createdIds.length} 个节点`);
  return createdIds;
}


function startQuickWorkflow(state, options = {}) {
  if (!state?.project) return null;
  pushHistory(state);
  const origin = options.point || {
    x: ((state.stage?.clientWidth || 720) / 2 - (state.viewport?.x || 0)) / Math.max(0.0001, state.viewport?.scale || 1) - 260,
    y: ((state.stage?.clientHeight || 480) / 2 - (state.viewport?.y || 0)) / Math.max(0.0001, state.viewport?.scale || 1) - 40
  };
  const note = upsertCanvasNode(state.project, createCanvasNoteNode({
    title: '起步提示',
    text: '1) 把参考图放左边\n2) 编排节点写提示词\n3) 结果图会落在右边\n4) 选中后按 G 生成',
    x: origin.x,
    y: origin.y - 150,
    width: 220,
    height: 140
  }));
  const reference = upsertCanvasNode(state.project, createCanvasMediaNode({
    title: '参考图',
    canvasRole: 'reference',
    x: origin.x,
    y: origin.y,
    width: 220,
    height: 160,
    text: '可替换为历史图 / 本地上传'
  }));
  const config = upsertCanvasNode(state.project, createCanvasConfigNode({
    title: '编排生成',
    x: origin.x + 280,
    y: origin.y + 10,
    width: 240,
    height: 180,
    prompt: '基于参考图生成更清晰的结果，保持主体一致'
  }));
  const target = upsertCanvasNode(state.project, createCanvasMediaNode({
    title: '结果图',
    canvasRole: 'target',
    x: origin.x + 560,
    y: origin.y,
    width: 220,
    height: 160,
    text: '生成结果会写到这里'
  }));
  if (reference?.id && config?.id) {
    upsertCanvasEdge(state.project, { fromNodeId: reference.id, toNodeId: config.id, kind: 'relation' });
  }
  if (config?.id && target?.id) {
    upsertCanvasEdge(state.project, { fromNodeId: config.id, toNodeId: target.id, kind: 'relation' });
  }
  const createdIds = [note?.id, reference?.id, config?.id, target?.id].filter(Boolean);
  persistProject(state);
  setSelectedNodes(state, [config?.id].filter(Boolean), { rerender: true, persist: false });
  fitViewportToNodes(state);
  if (options.dismissOnboarding !== false) {
    try { dismissCanvasOnboarding(state, { persist: true, silent: true }); } catch {}
  }
  updateStatus(state, '已创建起步工作流：参考图 →编排 →结果图', { tone: 'success', stickyMs: 2800 });
  return { nodeIds: createdIds, configId: config?.id || '' };
}

function tidySelectedNodes(state, options = {}) {
  const nodes = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(node => node && !node.locked && node.type !== 'group');
  if (nodes.length < 2) {
    if (options.silent !== true) updateStatus(state, '至少选中 2 个未锁定非分组节点才能整理');
    return [];
  }
  if (options.pushHistory !== false) pushHistory(state);
  const gapX = Number(options.gapX) || 36;
  const gapY = Number(options.gapY) || 36;
  const columns = Math.max(1, Number(options.columns) || Math.ceil(Math.sqrt(nodes.length)));
  const ordered = [...nodes].sort((a, b) => {
    const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
    if (Math.abs(dy) > 8) return dy;
    return (Number(a.x) || 0) - (Number(b.x) || 0);
  });
  const originX = Math.min(...ordered.map(node => Number(node.x) || 0));
  const originY = Math.min(...ordered.map(node => Number(node.y) || 0));
  const colWidths = Array.from({ length: columns }, () => 0);
  const rowHeights = [];
  ordered.forEach((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    colWidths[col] = Math.max(colWidths[col], Number(node.width) || 160);
    rowHeights[row] = Math.max(rowHeights[row] || 0, Number(node.height) || 96);
  });
  const colOffsets = [];
  let xCursor = 0;
  colWidths.forEach((width, index) => {
    colOffsets[index] = xCursor;
    xCursor += width + gapX;
  });
  const rowOffsets = [];
  let yCursor = 0;
  rowHeights.forEach((height, index) => {
    rowOffsets[index] = yCursor;
    yCursor += height + gapY;
  });
  ordered.forEach((node, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    node.x = Math.round(originX + colOffsets[col]);
    node.y = Math.round(originY + rowOffsets[row]);
    upsertCanvasNode(state.project, node);
  });
  const touchedGroupIds = new Set();
  ordered.forEach(node => { if (node.groupId) touchedGroupIds.add(node.groupId); });
  touchedGroupIds.forEach(groupId => fitGroupBoundsToMembers(state, groupId, { padding: 36 }));
  persistProject(state);
  rerenderEditor(state);
  if (options.silent !== true) updateStatus(state, `已网格整理 ${ordered.length} 个节点`);
  return ordered.map(node => node.id);
}

function readFileAsDataUrl(file) {
  return new Promise(resolve => {
    if (!file) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

function setStageDropActive(state, active = false) {
  state.stage?.classList?.toggle('is-drop-target', Boolean(active));
  if (state.dropOverlayEl) state.dropOverlayEl.hidden = !active;
}

function pickLocalImageFiles(options = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = options.multiple !== false;
    input.hidden = true;
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    const cleanup = () => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      if (input.parentNode) input.parentNode.removeChild(input);
    };
    const onChange = () => {
      const files = [...(input.files || [])];
      cleanup();
      resolve(files);
    };
    const onCancel = () => {
      cleanup();
      resolve([]);
    };
    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    document.body.appendChild(input);
    // Some browsers only fire change; cancel is progressive.
    input.click();
    // Fallback if dialog dismissed without events in rare cases.
    window.setTimeout(() => {
      if (!input.isConnected) return;
      // still open / not chosen; leave to change/cancel
    }, 0);
  });
}

async function importLocalImageFiles(state, files = [], point = null, options = {}) {
  const list = [...(files || [])].filter(file => file && String(file.type || '').startsWith('image/'));
  if (!list.length) {
    updateStatus(state, '没有可导入的图片文件');
    return [];
  }
  if (options.pushHistory !== false) pushHistory(state);
  const originPoint = point || {
    x: (state.stage.clientWidth / 2 - state.viewport.x) / state.viewport.scale,
    y: (state.stage.clientHeight / 2 - state.viewport.y) / state.viewport.scale
  };
  const createdIds = [];
  for (let index = 0; index < list.length; index += 1) {
    const file = list[index];
    const dataUrl = await readFileAsDataUrl(file);
    if (!dataUrl) continue;
    const record = createCanvasResourceRecord({
      kind: 'image',
      src: dataUrl,
      label: file.name || `本地图片 ${index + 1}`,
      mimeType: file.type || 'image/png',
      origin: options.origin || 'local-upload'
    });
    state.resourceStore?.put?.(record).catch?.(() => {});
    const place = getImportPlacementPoint(originPoint, index);
    const node = createCanvasMediaNodeFromResource(record, {
      title: file.name || `本地图片 ${index + 1}`,
      canvasRole: options.canvasRole || 'reference',
      x: place.x,
      y: place.y
    });
    const saved = upsertCanvasNode(state.project, node);
    if (saved?.id) {
      createdIds.push(saved.id);
      void fitCanvasMediaNodeToSource(state, saved.id, dataUrl).then(updated => {
        if (updated) {
          persistProject(state);
          rerenderEditor(state);
        }
      });
    }
  }
  if (!createdIds.length) {
    updateStatus(state, '图片读取失败');
    return [];
  }
  if (options.tidy !== false && createdIds.length >= 3) {
    setSelectedNodes(state, createdIds, { rerender: false, persist: false });
    try {
      tidySelectedNodes(state, {
        pushHistory: false,
        columns: Math.min(4, Math.ceil(Math.sqrt(createdIds.length))),
        gapX: 36,
        gapY: 36,
        silent: true
      });
    } catch {}
  }
  persistProject(state);
  if (options.select !== false) {
    setSelectedNodes(state, createdIds, { rerender: true, persist: false });
  } else {
    rerenderEditor(state, { skipPersist: true });
  }
  if (options.fit !== false) {
    frameNodeIdsInView(state, createdIds, { flash: options.flash !== false });
  } else if (options.flash !== false && createdIds[0]) {
    focusNodeInView(state, createdIds[0], { flash: true, select: false });
  }
  updateStatus(
    state,
    createdIds.length > 1
      ? `已导入${createdIds.length} 张本地图片并适配视野`
      : `已导入${createdIds.length} 张本地图片`,
    { tone: 'success', stickyMs: 2200 }
  );
  return createdIds;
}

async function uploadLocalImages(state, point = null, options = {}) {
  const files = await pickLocalImageFiles({ multiple: true });
  if (!files.length) {
    updateStatus(state, '已取消本地上传');
    return [];
  }
  return importLocalImageFiles(state, files, point, options);
}

async function handleCanvasFileDrop(state, event) {
  event.preventDefault();
  setStageDropActive(state, false);
  const files = [...(event.dataTransfer?.files || [])];
  const point = getWorldPoint(state, getStagePoint(state, event));
  const createdIds = await importLocalImageFiles(state, files, point, {
    origin: 'file-drop',
    canvasRole: 'reference'
  });
  if (!createdIds.length) {
    // importLocalImageFiles already set status for empty/invalid
    if (![...files].some(file => String(file?.type || '').startsWith('image/'))) {
      updateStatus(state, '请拖入图片文件');
    }
  } else {
    updateStatus(state, `已拖入 ${createdIds.length} 张图片`);
  }
  return createdIds;
}

function getNodeBox(node) {
  const x = Number(node?.x) || 0;
  const y = Number(node?.y) || 0;
  const width = Math.max(1, Number(node?.width) || 160);
  const height = Math.max(1, Number(node?.height) || 96);
  return { x, y, width, height, right: x + width, bottom: y + height, cx: x + width / 2, cy: y + height / 2 };
}

function nudgeSelectedNodes(state, dx = 0, dy = 0) {
  const targetIds = collectGroupAwareNodeIds(state, state.selectedNodeIds || []);
  const nodes = targetIds
    .map(id => state.project?.nodes?.[id])
    .filter(node => node && !node.locked);
  if (!nodes.length) {
    updateStatus(state, '请先选择要移动的节点');
    return;
  }
  if (!dx && !dy) return;
  if (!state._nudgeHistoryPushed) {
    pushHistory(state);
    state._nudgeHistoryPushed = true;
    if (state._nudgeHistoryTimer) clearTimeout(state._nudgeHistoryTimer);
    state._nudgeHistoryTimer = setTimeout(() => {
      state._nudgeHistoryPushed = false;
      state._nudgeHistoryTimer = null;
    }, 500);
  }
  nodes.forEach(node => {
    node.x = Math.round((Number(node.x) || 0) + dx);
    node.y = Math.round((Number(node.y) || 0) + dy);
    upsertCanvasNode(state.project, node);
  });
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, `微调 ${nodes.length} 个节点`);
}

function alignSelectedNodes(state, mode = 'left') {
  const nodes = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(node => node && !node.locked);
  if (nodes.length < 2) {
    updateStatus(state, '至少选中 2 个未锁定节点才能对齐');
    return;
  }
  pushHistory(state);
  const boxes = nodes.map(getNodeBox);
  const minX = Math.min(...boxes.map(box => box.x));
  const maxRight = Math.max(...boxes.map(box => box.right));
  const minY = Math.min(...boxes.map(box => box.y));
  const maxBottom = Math.max(...boxes.map(box => box.bottom));
  const centerX = (minX + maxRight) / 2;
  const centerY = (minY + maxBottom) / 2;

  nodes.forEach(node => {
    const box = getNodeBox(node);
    if (mode === 'left') node.x = Math.round(minX);
    else if (mode === 'right') node.x = Math.round(maxRight - box.width);
    else if (mode === 'center-h') node.x = Math.round(centerX - box.width / 2);
    else if (mode === 'top') node.y = Math.round(minY);
    else if (mode === 'bottom') node.y = Math.round(maxBottom - box.height);
    else if (mode === 'center-v') node.y = Math.round(centerY - box.height / 2);
    upsertCanvasNode(state.project, node);
  });

  const labels = {
    left: '左对齐',
    right: '右对齐',
    'center-h': '水平居中',
    top: '顶对齐',
    bottom: '底对齐',
    'center-v': '垂直居中'
  };
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, `已${labels[mode] || '对齐'}所选节点`);
}

function distributeSelectedNodes(state, axis = 'horizontal') {
  const nodes = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(node => node && !node.locked);
  if (nodes.length < 3) {
    updateStatus(state, '至少选中 3 个未锁定节点才能分布');
    return;
  }
  pushHistory(state);
  if (axis === 'horizontal') {
    const ordered = [...nodes].sort((a, b) => (Number(a.x) || 0) - (Number(b.x) || 0));
    const first = getNodeBox(ordered[0]);
    const last = getNodeBox(ordered[ordered.length - 1]);
    const totalWidth = ordered.reduce((sum, node) => sum + getNodeBox(node).width, 0);
    const span = last.right - first.x;
    const gap = (span - totalWidth) / (ordered.length - 1);
    let cursor = first.x;
    ordered.forEach((node, index) => {
      const box = getNodeBox(node);
      if (index === 0) {
        node.x = Math.round(first.x);
      } else if (index === ordered.length - 1) {
        node.x = Math.round(last.right - box.width);
      } else {
        cursor += getNodeBox(ordered[index - 1]).width + gap;
        node.x = Math.round(cursor);
      }
      upsertCanvasNode(state.project, node);
    });
  } else {
    const ordered = [...nodes].sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0));
    const first = getNodeBox(ordered[0]);
    const last = getNodeBox(ordered[ordered.length - 1]);
    const totalHeight = ordered.reduce((sum, node) => sum + getNodeBox(node).height, 0);
    const span = last.bottom - first.y;
    const gap = (span - totalHeight) / (ordered.length - 1);
    let cursor = first.y;
    ordered.forEach((node, index) => {
      const box = getNodeBox(node);
      if (index === 0) {
        node.y = Math.round(first.y);
      } else if (index === ordered.length - 1) {
        node.y = Math.round(last.bottom - box.height);
      } else {
        cursor += getNodeBox(ordered[index - 1]).height + gap;
        node.y = Math.round(cursor);
      }
      upsertCanvasNode(state.project, node);
    });
  }
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, axis === 'vertical' ? '已垂直分布所选节点' : '已水平分布所选节点');
}

function toggleLockSelectedNodes(state) {
  if (!state.selectedNodeIds.length) return;
  pushHistory(state);
  state.selectedNodeIds.forEach(nodeId => {
    const node = state.project?.nodes?.[nodeId];
    if (!node) return;
    node.locked = !node.locked;
    upsertCanvasNode(state.project, node);
  });
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, '已切换锁定状态');
}

function shiftSelectedNodeZIndex(state, delta) {
  if (!state.selectedNodeIds.length) return;
  pushHistory(state);
  state.selectedNodeIds.forEach(nodeId => {
    const node = state.project?.nodes?.[nodeId];
    if (!node) return;
    node.zIndex = (Number(node.zIndex) || 0) + delta;
    upsertCanvasNode(state.project, node);
  });
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, delta > 0 ? '已上移层级' : '已下移层级');
}

function collectGroupAwareNodeIds(state, seedIds = []) {
  const ids = new Set((seedIds || []).filter(Boolean));
  const nodes = state.project?.nodes || {};
  [...ids].forEach(id => {
    const node = nodes[id];
    if (!node || node.type !== 'group') return;
    Object.values(nodes).forEach(member => {
      if (member && member.groupId === id) ids.add(member.id);
    });
  });
  return [...ids];
}

function getGroupMemberNodes(state, groupId) {
  return Object.values(state.project?.nodes || {}).filter(node => node && node.groupId === groupId);
}

function selectGroupMembersForGroup(state, groupId, options = {}) {
  const group = state.project?.nodes?.[groupId];
  if (!group || group.type !== 'group') return [];
  const memberIds = getGroupMemberNodes(state, groupId).map(node => node.id).filter(Boolean);
  const ids = options.includeGroup ? dedupe([groupId, ...memberIds]) : memberIds;
  if (!ids.length) {
    updateStatus(state, '该分组还没有成员');
    return [];
  }
  setSelectedNodes(state, ids, { rerender: true, persist: false, openInspector: false });
  return ids;
}

function selectGroupMembersFromSelection(state) {
  const selected = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(Boolean);
  const group = selected.find(node => node.type === 'group')
    || selected.map(node => state.project?.nodes?.[node.groupId]).find(node => node && node.type === 'group');
  if (!group) {
    updateStatus(state, '请先选中一个分组节点');
    return [];
  }
  const ids = selectGroupMembersForGroup(state, group.id, { includeGroup: false });
  if (ids.length) updateStatus(state, `已选中分组。${group.title || '分组'}」的 ${ids.length} 个成员`);
  return ids;
}

function fitGroupBoundsToMembers(state, groupId, options = {}) {
  const group = state.project?.nodes?.[groupId];
  if (!group || group.type !== 'group') return null;
  const members = getGroupMemberNodes(state, groupId);
  if (!members.length) return group;
  const padding = Number.isFinite(options.padding) ? options.padding : 36;
  const bounds = computeNodeBounds(members);
  group.x = Math.round(bounds.minX - padding);
  group.y = Math.round(bounds.minY - padding);
  group.width = Math.max(120, Math.round(bounds.width + padding * 2));
  group.height = Math.max(90, Math.round(bounds.height + padding * 2));
  return upsertCanvasNode(state.project, group);
}

function clearSnapGuides(state) {
  state.snapGuides = [];
  if (state.snapGuidesEl) {
    state.snapGuidesEl.hidden = true;
    state.snapGuidesEl.innerHTML = '';
  }
}

function renderSnapGuides(state) {
  if (!state.snapGuidesEl) return;
  const guides = Array.isArray(state.snapGuides) ? state.snapGuides : [];
  if (!guides.length || state.dragState == null) {
    state.snapGuidesEl.hidden = true;
    state.snapGuidesEl.innerHTML = '';
    return;
  }
  const scale = Number(state.viewport?.scale) || 1;
  const vx = Number(state.viewport?.x) || 0;
  const vy = Number(state.viewport?.y) || 0;
  state.snapGuidesEl.hidden = false;
  state.snapGuidesEl.innerHTML = guides.map(guide => {
    if (guide.axis === 'x') {
      const left = vx + (Number(guide.value) || 0) * scale;
      return `<div class="canvas-snap-guide is-x" style="left:${Math.round(left)}px"></div>`;
    }
    const top = vy + (Number(guide.value) || 0) * scale;
    return `<div class="canvas-snap-guide is-y" style="top:${Math.round(top)}px"></div>`;
  }).join('');
}

function applyWheelNavigation(state, event, point = null) {
  if (!state?.viewport) return state.viewport;
  const deltaX = Number(event.deltaX) || 0;
  const deltaY = Number(event.deltaY) || 0;
  const modeFactor = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? 100 : 1);
  const wantsExplicitZoom = event.ctrlKey || event.metaKey;
  const wantsExplicitPan = event.shiftKey || event.altKey || Math.abs(deltaX) > 0.5;
  // Hybrid navigation:
  // - plain vertical wheel => zoom (legacy mouse muscle memory)
  // - shift/alt wheel, or trackpad deltaX => pan
  // - ctrl/meta wheel => zoom (explicit, also used by browser trackpad pinch)
  if (wantsExplicitPan && !wantsExplicitZoom) {
    let dx = deltaX;
    let dy = deltaY;
    if (event.shiftKey && Math.abs(dx) < 0.01 && Math.abs(dy) > 0.01) {
      dx = dy;
      dy = 0;
    }
    state.viewport = {
      ...state.viewport,
      x: (Number(state.viewport.x) || 0) - dx * modeFactor,
      y: (Number(state.viewport.y) || 0) - dy * modeFactor
    };
    return state.viewport;
  }

  const stageRect = state.stage?.getBoundingClientRect?.();
  const focus = point || {
    x: stageRect ? (stageRect.width / 2) : 0,
    y: stageRect ? (stageRect.height / 2) : 0
  };
  const nextScale = clamp(
    state.viewport.scale * (deltaY < 0 ? 1.1 : 0.92),
    MIN_SCALE,
    MAX_SCALE
  );
  state.viewport = zoomAroundPoint(state.viewport, focus, nextScale);
  return state.viewport;
}

function applyViewportTransformLive(state) {
  if (!state?.viewportElement || !state.viewport) return;
  state.viewportElement.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})`;
  if (state.scaleLabel) state.scaleLabel.textContent = `${Math.round(state.viewport.scale * 100)}%`;
}

function scheduleViewportCommit(state, options = {}) {
  if (!state || state.destroyed) return;
  state._viewportCommitPending = true;
  markInteractionLightWindow(state, options.lightMs != null ? options.lightMs : 220);
  if (state._viewportCommitTimer) {
    try { clearTimeout(state._viewportCommitTimer); } catch {}
  }
  const nodeCount = Object.keys(state.project?.nodes || {}).length;
  const defaultDelay = nodeCount >= 100 ? 48 : (nodeCount >= 40 ? 56 : 72);
  state._viewportCommitTimer = setTimeout(() => {
    state._viewportCommitTimer = null;
    state._viewportCommitPending = false;
    if (!state || state.destroyed) return;
    persistProject(state);
    const stillGesturing = Boolean(
      state.panState || state.dragState || state.resizeState || state.rotateState
      || state.boxState || state.pinchState
      || (state.connectState && !state.connectState.clickPreview)
    );
    // While still moving, keep light frames; once quiet, restore full cubic edges/chrome immediately.
    rerenderEditor(state, {
      skipPersist: true,
      lightChrome: stillGesturing,
      forceFullChrome: !stillGesturing,
      reason: options.reason || 'viewport'
    });
    // After continuous interaction settles, schedule one full chrome sync for inspector/minimap.
    if (state._viewportSettleTimer) {
      try { clearTimeout(state._viewportSettleTimer); } catch {}
    }
    state._viewportSettleTimer = setTimeout(() => {
      state._viewportSettleTimer = null;
      if (!state || state.destroyed) return;
      // If user is still interacting, skip settle; otherwise force a full chrome pass.
      if (
        state.panState || state.dragState || state.resizeState || state.rotateState
        || state.boxState || state.pinchState || state._viewportCommitPending
        || (state.connectState && !state.connectState.clickPreview)
      ) {
        return;
      }
      state._interactionLightUntil = 0;
      rerenderEditor(state, {
        skipPersist: true,
        forceFullChrome: true,
        reason: 'viewport-settle'
      });
    }, options.settleMs != null ? options.settleMs : 90);
    if (options.reason === 'pinch' || options.reason === 'wheel') {
      updateStatus(state, `缩放 ${Math.round(state.viewport.scale * 100)}%`, { stickyMs: 900 });
    }
  }, options.delayMs != null ? options.delayMs : defaultDelay);
}

function getStageLocalPointFromClient(state, clientX, clientY) {
  const rect = state.stage?.getBoundingClientRect?.();
  if (!rect) return { x: 0, y: 0 };
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function ensureGesturePointerMap(state) {
  if (!state.gesturePointers || !(state.gesturePointers instanceof Map)) {
    state.gesturePointers = new Map();
  }
  return state.gesturePointers;
}

function gestureDistance(a, b) {
  const dx = (a?.x || 0) - (b?.x || 0);
  const dy = (a?.y || 0) - (b?.y || 0);
  return Math.hypot(dx, dy);
}

function gestureMidpoint(a, b) {
  return {
    x: ((a?.x || 0) + (b?.x || 0)) / 2,
    y: ((a?.y || 0) + (b?.y || 0)) / 2
  };
}

function beginPinchGesture(state) {
  const map = ensureGesturePointerMap(state);
  if (map.size < 2) return false;
  const points = [...map.values()];
  const a = points[0];
  const b = points[1];
  const distance = Math.max(1, gestureDistance(a, b));
  state.pinchState = {
    startDistance: distance,
    startViewport: { ...state.viewport },
    startMidLocal: gestureMidpoint(a, b),
    lastMidLocal: gestureMidpoint(a, b)
  };
  // Cancel competing single-pointer interactions when multi-touch starts.
  if (state.dragState) endDragState(state);
  if (state.boxState) endBoxSelectionState(state);
  if (state.connectState) endConnectionState(state);
  if (state.panState) endPanState(state);
  if (state.resizeState) endNodeResizeState(state);
  if (state.rotateState) endNodeRotateState(state);
  updateStatus(state, '双指缩放 / 平移画布');
  return true;
}

function updatePinchGesture(state) {
  if (!state.pinchState) return false;
  const map = ensureGesturePointerMap(state);
  if (map.size < 2) return false;
  const points = [...map.values()];
  const a = points[0];
  const b = points[1];
  const distance = Math.max(1, gestureDistance(a, b));
  const mid = gestureMidpoint(a, b);
  const scaleFactor = distance / Math.max(1, state.pinchState.startDistance);
  const nextScale = clamp(state.pinchState.startViewport.scale * scaleFactor, MIN_SCALE, MAX_SCALE);
  // Zoom around the original midpoint, then add pan delta of midpoint movement.
  let next = zoomAroundPoint(state.pinchState.startViewport, state.pinchState.startMidLocal, nextScale);
  next = {
    ...next,
    x: next.x + (mid.x - state.pinchState.startMidLocal.x),
    y: next.y + (mid.y - state.pinchState.startMidLocal.y)
  };
  state.viewport = next;
  markInteractionLightWindow(state, 180);
  state.pinchState.lastMidLocal = mid;
  applyViewportTransformLive(state);
  if (state.miniMap && state.miniMapOpen) updateCanvasMiniMapViewport(state.miniMap, state.viewport);
  return true;
}

function endPinchGesture(state, options = {}) {
  if (!state.pinchState) return false;
  state.pinchState = null;
  if (options.commit !== false) {
    scheduleViewportCommit(state, { reason: 'pinch', delayMs: 0 });
  }
  return true;
}

function handleStageGesturePointerDown(state, event) {
  if (!state?.stage || event.pointerType !== 'touch') return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest?.(CANVAS_NO_ZOOM_SELECTOR)) return;
  const map = ensureGesturePointerMap(state);
  map.set(event.pointerId, getStageLocalPointFromClient(state, event.clientX, event.clientY));
  try { state.stage.setPointerCapture?.(event.pointerId); } catch {}
  if (map.size >= 2) {
    event.preventDefault();
    event.stopPropagation();
    beginPinchGesture(state);
  }
}

function handleStageGesturePointerMove(state, event) {
  if (!state?.gesturePointers?.has(event.pointerId)) return;
  state.gesturePointers.set(event.pointerId, getStageLocalPointFromClient(state, event.clientX, event.clientY));
  if (state.gesturePointers.size >= 2) {
    event.preventDefault();
    if (!state.pinchState) beginPinchGesture(state);
    updatePinchGesture(state);
  }
}

function handleStageGesturePointerUp(state, event) {
  if (!state?.gesturePointers?.has(event.pointerId) && !state.pinchState) return;
  if (state.gesturePointers?.has(event.pointerId)) {
    state.gesturePointers.delete(event.pointerId);
  }
  try { state.stage?.releasePointerCapture?.(event.pointerId); } catch {}
  if (state.pinchState && (state.gesturePointers?.size || 0) < 2) {
    endPinchGesture(state);
  }
}

function applyPinchZoomFromPoints(state, pointA, pointB, options = {}) {
  // Test helper: simulate a two-finger gesture between two local stage points.
  if (!state?.viewport) return null;
  const startDistance = Math.max(1, Number(options.startDistance) || 100);
  const startViewport = options.startViewport ? { ...options.startViewport } : { ...state.viewport };
  const startMid = options.startMidLocal || {
    x: ((pointA?.x || 0) + (pointB?.x || 0)) / 2,
    y: ((pointA?.y || 0) + (pointB?.y || 0)) / 2
  };
  const distance = Math.max(1, gestureDistance(pointA, pointB));
  const mid = gestureMidpoint(pointA, pointB);
  const nextScale = clamp(startViewport.scale * (distance / startDistance), MIN_SCALE, MAX_SCALE);
  let next = zoomAroundPoint(startViewport, startMid, nextScale);
  next = {
    ...next,
    x: next.x + (mid.x - startMid.x),
    y: next.y + (mid.y - startMid.y)
  };
  state.viewport = next;
  applyViewportTransformLive(state);
  if (options.commit) {
    persistProject(state);
    rerenderEditor(state, { skipPersist: true });
  }
  return { ...next };
}

function invalidateSnapTargetCache(state) {
  if (state) state._snapTargetCache = null;
}

function getSnapBucketKey(value, cell) {
  return Math.floor(Number(value) / cell);
}

function buildSnapTargetIndex(state, movingIds = new Set()) {
  const xs = [];
  const ys = [];
  Object.values(state.project?.nodes || {}).forEach(node => {
    if (!node || node.hidden || movingIds.has(node.id)) return;
    const box = getNodeBox(node);
    xs.push(
      { axis: 'x', value: box.x, kind: 'left' },
      { axis: 'x', value: box.cx, kind: 'center' },
      { axis: 'x', value: box.right, kind: 'right' }
    );
    ys.push(
      { axis: 'y', value: box.y, kind: 'top' },
      { axis: 'y', value: box.cy, kind: 'middle' },
      { axis: 'y', value: box.bottom, kind: 'bottom' }
    );
  });
  xs.sort((a, b) => a.value - b.value);
  ys.sort((a, b) => a.value - b.value);
  // Bucket size ~ threshold scale; rebuilt per drag query with current threshold.
  return { xs, ys, movingKey: [...movingIds].sort().join('|') };
}

function collectSnapTargets(state, movingIds = new Set()) {
  const index = buildSnapTargetIndex(state, movingIds);
  return index.xs.concat(index.ys);
}

function querySnapAxisTargets(sortedTargets, value, threshold) {
  if (!sortedTargets?.length) return [];
  // Binary search lower bound for value - threshold.
  const min = value - threshold;
  const max = value + threshold;
  let lo = 0;
  let hi = sortedTargets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedTargets[mid].value < min) lo = mid + 1;
    else hi = mid;
  }
  const out = [];
  for (let i = lo; i < sortedTargets.length; i += 1) {
    const target = sortedTargets[i];
    if (target.value > max) break;
    out.push(target);
  }
  return out;
}

function resolveBoxSnap(state, box, movingIds = new Set(), options = {}) {
  const threshold = Math.max(4, 8 / Math.max(0.25, Number(state.viewport?.scale) || 1));
  const guides = [];
  let adjustX = 0;
  let adjustY = 0;
  let labelParts = [];
  const forceGrid = Boolean(options.forceGrid);
  const lockAxis = options.lockAxis === 'x' || options.lockAxis === 'y' ? options.lockAxis : '';

  if (!box) {
    return { adjustX: 0, adjustY: 0, guides: [], label: '' };
  }

  if (forceGrid) {
    const grid = 16;
    const snappedX = Math.round(box.x / grid) * grid;
    const snappedY = Math.round(box.y / grid) * grid;
    adjustX = lockAxis === 'y' ? 0 : (snappedX - box.x);
    adjustY = lockAxis === 'x' ? 0 : (snappedY - box.y);
    labelParts.push('网格吸附');
  } else {
    const movingKey = [...movingIds].sort().join('|');
    if (!state._snapTargetCache || state._snapTargetCache.movingKey !== movingKey) {
      state._snapTargetCache = buildSnapTargetIndex(state, movingIds);
    }
    const index = state._snapTargetCache;
    const xCandidates = [
      { value: box.x, anchor: 'left' },
      { value: box.cx, anchor: 'center' },
      { value: box.right, anchor: 'right' }
    ];
    const yCandidates = [
      { value: box.y, anchor: 'top' },
      { value: box.cy, anchor: 'middle' },
      { value: box.bottom, anchor: 'bottom' }
    ];
    let bestX = null;
    let bestY = null;
    xCandidates.forEach(candidate => {
      querySnapAxisTargets(index.xs, candidate.value, threshold).forEach(target => {
        const dist = Math.abs(candidate.value - target.value);
        if (dist <= threshold && (!bestX || dist < bestX.dist)) {
          bestX = { dist, adjust: target.value - candidate.value, guide: target.value, kind: target.kind };
        }
      });
    });
    yCandidates.forEach(candidate => {
      querySnapAxisTargets(index.ys, candidate.value, threshold).forEach(target => {
        const dist = Math.abs(candidate.value - target.value);
        if (dist <= threshold && (!bestY || dist < bestY.dist)) {
          bestY = { dist, adjust: target.value - candidate.value, guide: target.value, kind: target.kind };
        }
      });
    });
    if (bestX) {
      adjustX = bestX.adjust;
      guides.push({ axis: 'x', value: bestX.guide });
      labelParts.push(movingIds.size > 1 ? '多选水平对齐' : '水平对齐');
    }
    if (bestY) {
      adjustY = bestY.adjust;
      guides.push({ axis: 'y', value: bestY.guide });
      labelParts.push(movingIds.size > 1 ? '多选垂直对齐' : '垂直对齐');
    }
    if (lockAxis === 'x') {
      adjustY = 0;
      for (let i = guides.length - 1; i >= 0; i -= 1) if (guides[i].axis === 'y') guides.splice(i, 1);
    } else if (lockAxis === 'y') {
      adjustX = 0;
      for (let i = guides.length - 1; i >= 0; i -= 1) if (guides[i].axis === 'x') guides.splice(i, 1);
    }
  }

  return {
    adjustX,
    adjustY,
    guides,
    label: labelParts.length ? `吸附中：${labelParts.join(' + ')}` : ''
  };
}

function resolveDragSnap(state, node, movingIds = new Set(), options = {}) {
  return resolveBoxSnap(state, getNodeBox(node), movingIds, options);
}

function resolveDragSnapForMove(state, startPositions = [], deltaX = 0, deltaY = 0, movingIds = new Set(), options = {}) {
  const nodes = (startPositions || [])
    .map(entry => {
      const node = state.project?.nodes?.[entry.id];
      if (!node || node.locked) return null;
      return {
        ...node,
        x: entry.x + deltaX,
        y: entry.y + deltaY
      };
    })
    .filter(Boolean);
  if (!nodes.length) {
    return { adjustX: 0, adjustY: 0, guides: [], label: '' };
  }
  if (nodes.length === 1) {
    return resolveBoxSnap(state, getNodeBox(nodes[0]), movingIds, options);
  }
  const bounds = computeNodeBounds(nodes);
  if (!bounds) {
    return resolveBoxSnap(state, getNodeBox(nodes[0]), movingIds, options);
  }
  const groupBox = {
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.width,
    height: bounds.height,
    right: bounds.minX + bounds.width,
    bottom: bounds.minY + bounds.height,
    cx: bounds.minX + bounds.width / 2,
    cy: bounds.minY + bounds.height / 2
  };
  return resolveBoxSnap(state, groupBox, movingIds, options);
}

function applyNodeDomTransform(state, nodeId) {
  if (!state?.nodeLayer || !nodeId) return false;
  const node = state.project?.nodes?.[nodeId];
  if (!node) return false;
  const el = state.nodeLayer.querySelector(`[data-node-id="${cssEscape(nodeId)}"]`);
  if (!el) return false;
  const rotation = Number(node.rotation) || 0;
  const x = Number(node.x) || 0;
  const y = Number(node.y) || 0;
  const width = Number.isFinite(node.width) ? node.width : null;
  const height = Number.isFinite(node.height) ? node.height : null;
  el.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg)`;
  if (width != null) el.style.width = `${width}px`;
  if (height != null) el.style.height = `${height}px`;
  return true;
}

function cssEscape(value) {
  const text = String(value || '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text);
  return text.replace(/["\\]/g, '\\$&');
}

async function addPromptEntryToCanvasState(state, entry, options = {}) {
  if (!state?.project) throw new Error('canvas project is unavailable');
  pushHistory(state);
  const point = options.point || {
    x: (state.stage.clientWidth / 2 - state.viewport.x) / state.viewport.scale - 240,
    y: (state.stage.clientHeight / 2 - state.viewport.y) / state.viewport.scale - 120
  };
  const branch = createPromptBranch(state.project, entry, {
    point,
    referenceUrls: options.referenceUrls,
    useCoverAsReference: options.useCoverAsReference === true
  });
  const cacheWarnings = [];
  const omittedNodeIds = new Set();
  for (let index = 0; index < (branch.resourceRecords || []).length; index += 1) {
    let record = branch.resourceRecords[index];
    try {
      record = await prepareCanvasResourceRecord(record, { maxDimension: 320 });
      branch.resourceRecords[index] = record;
      const embedded = /^data:image\//i.test(String(record?.source?.src || ''));
      Object.values(state.project.nodes || {}).forEach(node => {
        if (node?.resourceId !== record.id) return;
        if (embedded) node.resourceSrc = '';
        if (record.source?.thumbnailSrc) node.thumbnailSrc = record.source.thumbnailSrc;
      });
      const result = await cacheCanvasResourceRecord(record, {
        store: state.resourceStore,
        proxyEndpoint: options.proxyEndpoint || 'api-proxy.php'
      });
      if (Array.isArray(result.cacheWarnings)) cacheWarnings.push(...result.cacheWarnings);
      if (result?.record) await state.resourceStore.put(result.record);
    } catch (error) {
      cacheWarnings.push(error?.message || '图片缓存失败');
      try {
        await state.resourceStore.put(record);
      } catch {
        if (/^data:image\//i.test(String(record?.source?.src || ''))) {
          removePromptBranchResourceNodes(state.project, record.id).forEach(id => omittedNodeIds.add(id));
        }
      }
    }
  }
  const branchNodeIds = branch.nodeIds.filter(id => !omittedNodeIds.has(id));
  await refreshCanvasResourceDisplaySources(state);
  persistProject(state, { immediate: true });
  void scheduleCanvasResourceGarbageCollection(state);
  setSelectedNodes(state, branchNodeIds, { rerender: true, persist: false });
  fitViewportToSelection(state);
  updateStatus(state, cacheWarnings.length
    ? `已加入提示词分支，${cacheWarnings.length} 张图片使用远程链接`
    : '已加入提示词分支：示例图 → 编排 → 结果', {
      tone: cacheWarnings.length ? 'info' : 'success',
      stickyMs: 3000
    });
  return {
    projectId: state.project.id,
    nodeIds: branchNodeIds,
    configId: branch.configId,
    targetId: branch.targetId,
    cacheWarnings
  };
}

function collectConnectedEdgeIds(project, nodeIds = []) {
  const ids = new Set((nodeIds || []).map(id => String(id || '')).filter(Boolean));
  if (!ids.size) return [];
  return Object.entries(project?.edges || {})
    .filter(([, edge]) => edge && (ids.has(String(edge.fromNodeId || '')) || ids.has(String(edge.toNodeId || ''))))
    .map(([id]) => id);
}

function buildGestureEdgeProject(state, affectedEdgeIds = []) {
  const edgeIds = new Set(affectedEdgeIds || []);
  const edges = Object.fromEntries(
    Object.entries(state.project?.edges || {}).filter(([id]) => edgeIds.has(id))
  );
  return {
    ...state.project,
    viewport: { ...state.viewport },
    edges
  };
}

function resolveInteractionEdgeOptions(state, options = {}) {
  const totalNodeCount = Number(options.nodeCount);
  const edgeCount = Number(options.edgeCount);
  const nodes = Number.isFinite(totalNodeCount)
    ? totalNodeCount
    : Object.keys(state?.project?.nodes || {}).length;
  const edges = Number.isFinite(edgeCount)
    ? edgeCount
    : Object.keys(state?.project?.edges || {}).length;
  const scale = Number(options.scale != null ? options.scale : state?.viewport?.scale) || 1;
  const interaction = options.interaction !== false;
  const simplifyEdges = Boolean(
    interaction
    || scale <= 0.7
    || nodes >= 70
    || (nodes >= 40 && scale <= 0.9)
  );
  const preferStraightEdges = Boolean(
    interaction && (
      nodes >= 40
      || edges >= 48
      || scale <= 0.85
    )
  );
  const skipHitPaths = Boolean(interaction);
  const skipMarkers = Boolean(interaction);
  let maxVisibleEdges = 0;
  if (interaction) {
    if (nodes >= 160 || edges >= 180) maxVisibleEdges = 48;
    else if (nodes >= 100 || edges >= 110) maxVisibleEdges = 72;
    else if (nodes >= 60 || edges >= 70) maxVisibleEdges = 96;
    else if (nodes >= 40 || edges >= 48) maxVisibleEdges = 120;
  } else {
    // Idle dense boards: soft-cap when zoomed out so rest frames stay lighter.
    if ((nodes >= 140 || edges >= 160) && scale <= 0.7) maxVisibleEdges = 120;
    else if ((nodes >= 180 || edges >= 200) && scale <= 0.85) maxVisibleEdges = 140;
  }
  return { simplifyEdges, preferStraightEdges, skipHitPaths, skipMarkers, maxVisibleEdges };
}

function buildCulledProjectView(state, options = {}) {
  const now = Date.now();
  if (state.focusFlashUntil && now > state.focusFlashUntil) {
    state.focusFlashNodeId = '';
    state.focusFlashUntil = 0;
  }
  const interaction = options.interaction !== false;
  const cullBounds = options.cull === false
    ? null
    : getViewportCullBounds(state, { lightChrome: interaction });
  const selectedEdge = state.selectedEdgeId ? state.project?.edges?.[state.selectedEdgeId] : null;
  const endpointIds = new Set(
    selectedEdge
      ? [selectedEdge.fromNodeId, selectedEdge.toNodeId].map(id => String(id || '')).filter(Boolean)
      : []
  );
  const keepIds = new Set([
    ...(state.selectedNodeIds || []),
    ...endpointIds,
    ...(Array.isArray(options.keepNodeIds) ? options.keepNodeIds : [])
  ]);
  if (state.connectState?.fromNodeId) keepIds.add(state.connectState.fromNodeId);
  if (state.connectState?.previewTargetNodeId) keepIds.add(state.connectState.previewTargetNodeId);
  if (state.clickConnectFromId) keepIds.add(state.clickConnectFromId);

  return {
    ...state.project,
    viewport: { ...state.viewport },
    nodes: Object.fromEntries(
      Object.entries(state.project?.nodes || {}).map(([id, node]) => {
        const selected = (state.selectedNodeIds || []).includes(id);
        const keep = selected || keepIds.has(id);
        const inView = !cullBounds || keep || isNodeInCullBounds(node, cullBounds);
        return [id, {
          ...node,
          selected,
          isActive: options.includeActive ? isNodeActiveAtPlayhead(state.project, node) : false,
          isFocusFlash: state.focusFlashNodeId === id && now <= (state.focusFlashUntil || 0),
          isEdgeEndpoint: endpointIds.has(id),
          hidden: Boolean(node.hidden) || !inView
        }];
      })
    )
  };
}

function renderLiveDragFrame(state, options = {}) {
  if (!state?.project) return false;
  const nodeIds = Array.isArray(options.nodeIds) && options.nodeIds.length
    ? options.nodeIds
    : ((state.dragState?.startPositions || []).map(entry => entry.id));
  if (!nodeIds.length && !state.dragState) return false;

  // Keep edge geometry accurate while avoiding full inspector/minimap rebuilds.
  const now = Date.now();
  if (state.focusFlashUntil && now > state.focusFlashUntil) {
    state.focusFlashNodeId = '';
    state.focusFlashUntil = 0;
  }
  markInteractionLightWindow(state, 160);
  const totalNodeCount = Object.keys(state.project.nodes || {}).length;
  const edgeCount = Object.keys(state.project.edges || {}).length;
  const edgeOpts = resolveInteractionEdgeOptions(state, {
    interaction: true,
    nodeCount: totalNodeCount,
    edgeCount
  });
  const projectView = buildGestureEdgeProject(
    state,
    state.dragState?.affectedEdgeIds || collectConnectedEdgeIds(state.project, nodeIds)
  );

  // Prefer DOM transform updates for moved nodes; rebuild only if some are missing.
  let missing = !nodeIds.length;
  let updated = 0;
  nodeIds.forEach(id => {
    if (applyNodeDomTransform(state, id)) updated += 1;
    else missing = true;
  });
  if (missing) {
    renderCanvasNodes(state.nodeLayer, projectView, {
      incremental: options.forceFull !== true
    });
  }
  renderCanvasEdges(state.edgeLayer, projectView, {
    previewConnection: state.connectState,
    selectedEdgeId: state.selectedEdgeId,
    ...edgeOpts
  });
  if (state.viewportElement) {
    state.viewportElement.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})`;
  }
  if (state.scaleLabel) state.scaleLabel.textContent = `${Math.round(state.viewport.scale * 100)}%`;
  if (state.dragState) renderSnapGuides(state);
  return { updated, rebuilt: missing };
}

function renderLiveResizeFrame(state) {
  if (!state?.resizeState?.nodeId) return;
  applyNodeDomTransform(state, state.resizeState.nodeId);
  const projectView = buildGestureEdgeProject(state, state.resizeState.affectedEdgeIds);
  renderCanvasEdges(state.edgeLayer, projectView, {
    previewConnection: state.connectState,
    selectedEdgeId: state.selectedEdgeId,
    ...resolveInteractionEdgeOptions(state, { interaction: true })
  });
}

function renderLiveRotateFrame(state) {
  if (!state?.rotateState?.nodeId) return;
  applyNodeDomTransform(state, state.rotateState.nodeId);
  const projectView = buildGestureEdgeProject(state, state.rotateState.affectedEdgeIds);
  renderCanvasEdges(state.edgeLayer, projectView, {
    previewConnection: state.connectState,
    selectedEdgeId: state.selectedEdgeId,
    ...resolveInteractionEdgeOptions(state, { interaction: true })
  });
}

const CONNECT_SNAP_SCREEN_PX = 56;

function pointInNodeBox(point, node, padding = 0) {
  if (!point || !node) return false;
  const x = Number(node.x) || 0;
  const y = Number(node.y) || 0;
  const w = Math.max(1, Number(node.width) || 160);
  const h = Math.max(1, Number(node.height) || 96);
  return point.x >= x - padding
    && point.x <= x + w + padding
    && point.y >= y - padding
    && point.y <= y + h + padding;
}

function distanceToNodeBox(point, node) {
  if (!point || !node) return Infinity;
  const x = Number(node.x) || 0;
  const y = Number(node.y) || 0;
  const w = Math.max(1, Number(node.width) || 160);
  const h = Math.max(1, Number(node.height) || 96);
  const cx = Math.min(Math.max(point.x, x), x + w);
  const cy = Math.min(Math.max(point.y, y), y + h);
  const dx = point.x - cx;
  const dy = point.y - cy;
  return Math.hypot(dx, dy);
}

function resolveConnectionPreviewTarget(state, pointerWorld, options = {}) {
  const fromNodeId = options.fromNodeId || state.connectState?.fromNodeId || '';
  const scale = Math.max(0.25, Number(state.viewport?.scale) || 1);
  const snapWorld = CONNECT_SNAP_SCREEN_PX / scale;
  let hitId = '';
  if (Number.isFinite(options.clientX) && Number.isFinite(options.clientY)) {
    const target = document.elementFromPoint(options.clientX, options.clientY);
    hitId = target?.closest?.('[data-node-id]')?.dataset?.nodeId || '';
    if (hitId === fromNodeId) hitId = '';
  }

  let best = null;
  Object.values(state.project?.nodes || {}).forEach(node => {
    if (!node || node.hidden || node.id === fromNodeId) return;
    const dist = distanceToNodeBox(pointerWorld, node);
    const inside = pointInNodeBox(pointerWorld, node, 8 / scale);
    if (!inside && dist > snapWorld) return;
    if (!best || dist < best.dist || (Math.abs(dist - best.dist) < 0.01 && inside && !best.inside)) {
      best = { id: node.id, dist, inside };
    }
  });

  // Prefer direct DOM hit when it is valid; otherwise fall back to nearest snap candidate.
  let targetNodeId = '';
  let snapped = false;
  if (hitId && state.project?.nodes?.[hitId]) {
    targetNodeId = hitId;
    snapped = Boolean(best && best.id === hitId && !best.inside);
  } else if (best) {
    targetNodeId = best.id;
    snapped = !best.inside;
  }

  const valid = Boolean(targetNodeId && canCreateEdgeBetween(fromNodeId, targetNodeId));
  let currentPoint = pointerWorld;
  if (targetNodeId && valid) {
    const anchor = getNodeConnectionPoint(state, targetNodeId, 'left') || pointerWorld;
    // Soft snap: stick preview endpoint to target input when close/inside.
    if (snapped || pointInNodeBox(pointerWorld, state.project.nodes[targetNodeId], 8 / scale)) {
      currentPoint = anchor;
      snapped = true;
    }
  }
  return { targetNodeId, valid, snapped, currentPoint };
}

function clearConnectTargetHighlights(state) {
  if (!state?.nodeLayer) return;
  state.nodeLayer.querySelectorAll('.is-connect-source, .is-connect-target, .is-connect-invalid').forEach(el => {
    el.classList.remove('is-connect-source', 'is-connect-target', 'is-connect-invalid');
  });
  if (state.edgeLayer) {
    state.edgeLayer.classList.remove('is-connect-preview-valid', 'is-connect-preview-invalid', 'is-connect-preview-snapped');
  }
  // Keep click-to-connect source highlight after drag-preview cleanup.
  if (state.clickConnectFromId) {
    state.nodeLayer.querySelector('[data-node-id="' + cssEscape(state.clickConnectFromId) + '"]')?.classList.add('is-connect-source');
    state.stage?.classList?.toggle('has-click-connect-source', true);
  }
}

function syncConnectTargetHighlights(state) {
  if (!state?.nodeLayer) return;
  clearConnectTargetHighlights(state);
  if (!state.connectState) return;
  const sourceId = state.connectState.fromNodeId;
  const targetId = state.connectState.previewTargetNodeId;
  if (sourceId) {
    state.nodeLayer.querySelector(`[data-node-id="${cssEscape(sourceId)}"]`)?.classList.add('is-connect-source');
  }
  if (targetId) {
    const targetEl = state.nodeLayer.querySelector(`[data-node-id="${cssEscape(targetId)}"]`);
    if (targetEl) {
      targetEl.classList.add(state.connectState.previewValid ? 'is-connect-target' : 'is-connect-invalid');
    }
  }
  if (state.edgeLayer) {
    state.edgeLayer.classList.toggle('is-connect-preview-valid', Boolean(state.connectState.previewValid && targetId));
    state.edgeLayer.classList.toggle('is-connect-preview-invalid', Boolean(targetId && !state.connectState.previewValid));
    state.edgeLayer.classList.toggle('is-connect-preview-snapped', Boolean(state.connectState.snapped && state.connectState.previewValid));
  }
}

function buildLiteProjectView(state, options = {}) {
  const selectedSet = new Set(state.selectedNodeIds || []);
  return {
    ...state.project,
    viewport: { ...state.viewport },
    nodes: Object.fromEntries(
      Object.entries(state.project?.nodes || {}).map(([id, node]) => [id, {
        ...node,
        selected: selectedSet.has(id),
        isActive: options.includeActive ? isNodeActiveAtPlayhead(state.project, node) : false,
        isFocusFlash: false,
        hidden: Boolean(node.hidden)
      }])
    )
  };
}

function syncSelectionClasses(state) {
  if (!state?.nodeLayer) return;
  const selected = new Set(state.selectedNodeIds || []);
  state.nodeLayer.querySelectorAll('[data-node-id]').forEach(el => {
    const id = el.dataset.nodeId || '';
    el.classList.toggle('is-selected', selected.has(id));
  });
}

function renderLiveBoxSelectionFrame(state) {
  if (!state?.boxState) return false;
  if (state.viewportElement) {
    state.viewportElement.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})`;
  }
  syncSelectionClasses(state);
  // Avoid full node HTML rebuild; selection chrome is class-based.
  return true;
}

function renderLiveConnectionFrame(state) {
  if (!state?.connectState || !state.project) return false;
  markInteractionLightWindow(state, 120);
  const edgeOpts = resolveInteractionEdgeOptions(state, { interaction: true });
  const projectView = buildCulledProjectView(state, {
    interaction: true,
    includeActive: false,
    keepNodeIds: [
      state.connectState.fromNodeId,
      state.connectState.previewTargetNodeId,
      state.clickConnectFromId
    ].filter(Boolean)
  });
  renderCanvasEdges(state.edgeLayer, projectView, {
    previewConnection: state.connectState,
    selectedEdgeId: state.selectedEdgeId,
    ...edgeOpts
  });
  if (state.viewportElement) {
    state.viewportElement.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})`;
  }
  syncConnectTargetHighlights(state);
  return true;
}

function createGroupFromSelection(state) {
  const selected = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(Boolean);
  const members = selected.filter(node => node.type !== 'group');
  if (members.length < 2) {
    updateStatus(state, '至少选择两个非分组节点后才能创建分组');
    return null;
  }
  pushHistory(state);
  const bounds = computeNodeBounds(members);
  const groupNode = upsertCanvasNode(state.project, {
    type: 'group',
    title: '路径',
    x: bounds.minX - 36,
    y: bounds.minY - 36,
    width: bounds.width + 72,
    height: bounds.height + 72,
    zIndex: Math.min(...members.map(node => Number(node.zIndex) || 0)) - 1
  });
  members.forEach(node => {
    node.groupId = groupNode.id;
    upsertCanvasNode(state.project, node);
  });
  persistProject(state);
  setSelectedNodes(state, [groupNode.id], { rerender: true, persist: false });
  updateStatus(state, `已创建分组（${members.length} 个成员）`);
  return groupNode;
}

function ungroupSelectedNodes(state) {
  const selected = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(Boolean);
  const groups = selected.filter(node => node.type === 'group');
  const looseMembers = selected.filter(node => node.type !== 'group' && node.groupId);
  if (!groups.length && !looseMembers.length) {
    updateStatus(state, '请选择分组节点，或已归属分组的成员');
    return [];
  }
  pushHistory(state);
  const releasedIds = [];
  groups.forEach(group => {
    getGroupMemberNodes(state, group.id).forEach(member => {
      member.groupId = '';
      upsertCanvasNode(state.project, member);
      releasedIds.push(member.id);
    });
    removeCanvasNode(state.project, group.id);
  });
  looseMembers.forEach(member => {
    if (!member.groupId) return;
    member.groupId = '';
    upsertCanvasNode(state.project, member);
    releasedIds.push(member.id);
  });
  const uniqueReleased = [...new Set(releasedIds)];
  persistProject(state);
  setSelectedNodes(state, uniqueReleased, { rerender: true, persist: false });
  updateStatus(state, uniqueReleased.length ? `已解散分组，释放 ${uniqueReleased.length} 个节点` : '已解散分组');
  return uniqueReleased;
}

function rotateSelectedNodes(state, delta = 15) {
  const amount = Number(delta) || 0;
  if (!amount) return [];
  const nodes = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(node => node && !node.locked);
  if (!nodes.length) {
    updateStatus(state, '请先选择要旋转的节点');
    return [];
  }
  pushHistory(state);
  nodes.forEach(node => {
    const current = Number(node.rotation) || 0;
    node.rotation = Math.round((current + amount) * 100) / 100;
    upsertCanvasNode(state.project, node);
  });
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, `已旋转 ${nodes.length} 个节点（${amount > 0 ? '+' : ''}${amount}°）`);
  return nodes.map(node => node.id);
}

async function runLlmNode(state) {
  const node = getPrimarySelectedNode(state);
  if (!node || node.type !== 'llm') { updateStatus(state, '请选中一个智能文本节点'); return; }
  node.llmStatus = 'running';
  node.llmOutput = '';
  persistProject(state);
  rerenderEditor(state);
  try {
    let output = '';
    if (node.llmMode === 'describe') {
      if (typeof state.bridge?.describeImage !== 'function') throw new Error('宿主未提供describeImage');
      const picked = getSelectedImageNode(state) || findFirstImageNode(state);
      if (!picked) throw new Error('没有可描述的图片节点');
      output = await state.bridge.describeImage({ src: picked.src, dataUrl: picked.src });
    } else {
      if (typeof state.bridge?.optimizePrompt !== 'function') throw new Error('宿主未提供optimizePrompt');
      output = await state.bridge.optimizePrompt(node.llmInput || node.text || '');
    }
    node.llmOutput = String(output || '').trim();
    node.llmStatus = 'success';
    updateStatus(state, '智能文本处理完成');
  } catch (error) {
    node.llmStatus = 'error';
    node.llmOutput = String(error?.message || error);
    updateStatus(state, `智能文本失败：${node.llmOutput}`);
  }
  persistProject(state);
  rerenderEditor(state);
}

function findFirstImageNode(state) {
  const nodes = getProjectNodeList(state.project);
  for (const n of nodes) {
    if (n.type === 'media' && n.kind === 'image' && (n.resourceSrc || n.thumbnailSrc)) {
      return { node: n, src: n.resourceSrc || n.thumbnailSrc || n.posterSrc || '' };
    }
  }
  return null;
}


function countConfigReferenceMedia(state, configNode) {
  if (!configNode) return 0;
  const promptIds = extractNodeReferenceIds(configNode.composerContent || configNode.promptText || '');
  const explicitIds = Array.isArray(configNode.references) ? configNode.references : [];
  const edgeIds = Object.values(state.project?.edges || {})
    .filter(edge => edge?.toNodeId === configNode.id)
    .map(edge => edge.fromNodeId);
  const allIds = dedupe([
    ...promptIds,
    ...explicitIds,
    ...edgeIds
  ]);
  return allIds
    .map(id => state.project?.nodes?.[id])
    .filter(node => node && node.type === 'media' && node.canvasRole !== 'target')
    .length;
}

function getGenerationReadiness(state, node = null) {
  let target = node || getPrimarySelectedNode(state);
  let usedBoardFallback = false;
  if (!target && !node) {
    target = findPreferredGeneratorNode(state, state.selectedNodeIds || []);
    usedBoardFallback = Boolean(target);
  }
  if (!target) {
    return {
      ok: false,
      level: 'empty',
      canGenerate: false,
      reason: '请先选择编排节点',
      hint: '选中编排节点后可执行生成；也可先智能接线。',
      missing: ['selection']
    };
  }
  const decorateReadiness = (result) => {
    if (!result || typeof result !== 'object') return result;
    if (usedBoardFallback && target?.id) {
      result.boardFallback = true;
      result.nodeId = target.id;
      result.nodeType = target.type;
      if (result.canGenerate && result.hint && !/空选中|未选中|画布编排/.test(String(result.hint))) {
        result.hint = String(result.hint) + '（空选中将使用画布编排）';
      }
    }
    return result;
  };
  if (target.type === 'loop') {
    const variations = Array.isArray(target.variations) ? target.variations.filter(v => String(v || '').trim()) : [];
    if (!variations.length) {
      return decorateReadiness({
        ok: false,
        level: 'blocked',
        canGenerate: false,
        reason: '循环节点没有变化。',
        hint: '先编辑循环节点，补充至少 1 条变化项。',
        missing: ['variations']
      });
    }
    return decorateReadiness({
      ok: true,
      level: 'ready',
      canGenerate: true,
      reason: '可以开始循环生成',
      hint: '将按变化项依次生成。',
      missing: []
    });
  }
  if (target.type === 'llm') {
    const input = String(target.llmInput || target.text || '').trim();
    if (!input) {
      return decorateReadiness({
        ok: false,
        level: 'blocked',
        canGenerate: false,
        reason: '智能文本还没有输入',
        hint: '打开设置填写输入内容后再运行。',
        missing: ['llmInput']
      });
    }
    return decorateReadiness({
      ok: true,
      level: 'ready',
      canGenerate: true,
      reason: '可以运行智能文本',
      hint: '将根据输入生成文本结果图',
      missing: []
    });
  }
  if (target.type !== 'config') {
    const configNode = (state.selectedNodeIds || [])
      .map(id => state.project?.nodes?.[id])
      .find(node => node?.type === 'config');
    if (configNode) return getGenerationReadiness(state, configNode);
    // As a last resort, try board generator when caller passed a non-generatable node without selection context.
    if (!usedBoardFallback) {
      const boardGen = findPreferredGeneratorNode(state, state.selectedNodeIds || []);
      if (boardGen && boardGen.id !== target.id) return getGenerationReadiness(state, boardGen);
    }
    return decorateReadiness({
      ok: false,
      level: 'blocked',
      canGenerate: false,
      reason: '当前节点不能直接生成',
      hint: '请选择编排 / 循环 / 智能文本节点，或先智能接线。',
      missing: ['config']
    });
  }

  const prompt = String(target.composerContent || target.promptText || '').trim();
  const refCount = countConfigReferenceMedia(state, target);
  const hasTarget = Boolean(target.targetNodeId && state.project?.nodes?.[target.targetNodeId]);
  const missing = [];
  if (!prompt) missing.push('prompt');
  if (!refCount) missing.push('reference');
  if (!hasTarget) missing.push('target');

  if (!prompt) {
    return decorateReadiness({
      ok: false,
      level: 'blocked',
      canGenerate: false,
      reason: '编排节点还没有提示词',
      hint: '打开设置填写提示词，或先一键起步导入素材。',
      missing,
      refCount,
      hasTarget
    });
  }
  if (!refCount) {
    return decorateReadiness({
      ok: false,
      level: 'warn',
      canGenerate: true,
      reason: '还没有参考图连入',
      hint: '建议先智能接线或导入参考图，再生成效果更稳。',
      missing,
      refCount,
      hasTarget
    });
  }
  if (!hasTarget) {
    return decorateReadiness({
      ok: true,
      level: 'warn',
      canGenerate: true,
      reason: '尚未指定结果节点',
      hint: '仍可生成；建议智能接线自动补齐结果图节点选',
      missing,
      refCount,
      hasTarget
    });
  }
  return decorateReadiness({
    ok: true,
    level: 'ready',
    canGenerate: true,
    reason: `就绪：参考图 ${refCount} · 结果节点已连接`,
    hint: '可直接执行生成（G）。',
    missing: [],
    refCount,
    hasTarget
  });
}

async function runSelectedGeneration(state) {
  const selected = getPrimarySelectedNode(state);
  const preferred = selected && (selected.type === 'config' || selected.type === 'loop' || selected.type === 'llm')
    ? selected
    : findPreferredGeneratorNode(state, state.selectedNodeIds || []);

  // Empty selection / non-generator selection: auto-focus the board generator so G / 执行生成 just works.
  if (preferred && (!selected || (selected.id !== preferred.id && selected.type !== 'config' && selected.type !== 'loop' && selected.type !== 'llm'))) {
    setSelectedNodes(state, [preferred.id], { rerender: true, persist: false, openInspector: false });
  }

  const active = getPrimarySelectedNode(state) || preferred;
  if (active?.type === 'loop') {
    const readiness = getGenerationReadiness(state, active);
    if (!readiness.canGenerate) {
      const statusText = readiness.hint
        ? (readiness.reason + ' · ' + readiness.hint)
        : (readiness.reason || '循环节点尚未就绪');
      updateStatus(state, statusText, { tone: 'error', stickyMs: 4200 });
      setSelectedNodes(state, [active.id], { rerender: true, persist: false, openInspector: true });
      openInspectorForSelection(state, { silent: true });
      updateStatus(state, statusText, { tone: 'error', stickyMs: 4200 });
      return { ok: false, reason: readiness.reason, nodeId: active.id, readiness, guided: true };
    }
    await runLoopNodeGeneration(state, active.id);
    return { ok: true, nodeId: active.id, type: 'loop' };
  }
  if (active?.type === 'llm') {
    const readiness = getGenerationReadiness(state, active);
    if (!readiness.canGenerate) {
      const statusText = readiness.hint
        ? (readiness.reason + ' · ' + readiness.hint)
        : (readiness.reason || '智能文本尚未就绪');
      updateStatus(state, statusText, { tone: 'error', stickyMs: 4200 });
      setSelectedNodes(state, [active.id], { rerender: true, persist: false, openInspector: true });
      openInspectorForSelection(state, { silent: true });
      updateStatus(state, statusText, { tone: 'error', stickyMs: 4200 });
      return { ok: false, reason: readiness.reason, nodeId: active.id, readiness, guided: true };
    }
    await runLlmNode(state);
    return { ok: true, nodeId: active.id, type: 'llm' };
  }
  const configNode = active?.type === 'config'
    ? active
    : (state.selectedNodeIds || []).map(id => state.project?.nodes?.[id]).find(node => node?.type === 'config')
      || findPreferredConfigNode(state, state.selectedNodeIds || []);
  if (!configNode) {
    updateStatus(state, '请先添加编排节点（生成规则），再执行生成 · 可在右侧空设置面板点「添加编排」', { tone: 'error', stickyMs: 4200 });
    try { setSidebarTab(state, 'inspector'); } catch {}
    try { syncInspector(state); } catch {}
    return { ok: false, reason: 'missing-config', guided: true };
  }
  const readiness = getGenerationReadiness(state, configNode);
  if (!readiness.canGenerate) {
    const needsPrompt = readiness.missing?.includes('prompt');
    const needsWire = readiness.missing?.includes('reference') || readiness.missing?.includes('target');
    const statusText = readiness.hint
      ? (readiness.reason + ' · ' + readiness.hint)
      : (readiness.reason || '编排尚未就绪');
    updateStatus(state, statusText, { tone: 'error', stickyMs: 4200 });
    setSelectedNodes(state, [configNode.id], {
      rerender: true,
      persist: false,
      openInspector: needsPrompt || !needsWire
    });
    if (needsPrompt || !needsWire) openInspectorForSelection(state, { silent: true });
    updateStatus(state, statusText, { tone: 'error', stickyMs: 4200 });
    return { ok: false, reason: readiness.reason, nodeId: configNode.id, readiness, guided: true };
  }
  if (readiness.level === 'warn') {
    updateStatus(state, readiness.hint || readiness.reason, { tone: 'warn' });
  }
  // Ensure the running config is selected for status/focus continuity.
  if (getPrimarySelectedNode(state)?.id !== configNode.id) {
    setSelectedNodes(state, [configNode.id], { rerender: true, persist: false, openInspector: false });
  }
  await runConfigNodeGeneration(state, configNode.id);
  return { ok: true, nodeId: configNode.id, type: 'config', readiness };
}

async function runLoopNodeGeneration(state, loopNodeId) {
  const loopNode = state.project?.nodes?.[loopNodeId];
  if (!loopNode || loopNode.type !== 'loop') return;
  const variations = Array.isArray(loopNode.variations) ? loopNode.variations.filter(v => String(v || '').trim()) : [];
  if (!variations.length) { updateStatus(state, '循环节点没有变化。'); return; }
  if (typeof state.bridge?.runGeneration !== 'function') { updateStatus(state, '当前宿主未提供runGeneration'); return; }

  pushHistory(state);
  loopNode.loopStatus = 'running';
  loopNode.loopProgress = 0;
  persistProject(state, { immediate: true });
  rerenderEditor(state);

  const total = variations.length;
  let succeeded = 0;
  let firstResultNodeId = '';
  for (let index = 0; index < total; index++) {
    const variation = variations[index];
    const prompt = `${loopNode.basePrompt || ''}\n\n${variation}`.trim();
    try {
      updateStatus(state, `循环生成 ${index + 1}/${total}`);
      const generationKind = loopNode.generationKind || loopNode.genConfig?.kind || 'image';
      const result = await state.bridge.runGeneration(generationKind, prompt, {
        images: await collectReferenceImagesForConfig(state, loopNode),
        model: loopNode.genConfig?.model || '',
        aspect: loopNode.genConfig?.aspect || '',
        resolution: loopNode.genConfig?.resolution || '',
        quality: loopNode.genConfig?.quality || '',
        videoDuration: loopNode.genConfig?.videoDuration || '',
        count: 1
      });
      const resource = buildGenerationResourceRecord({ title: loopNode.title, genConfig: loopNode.genConfig }, generationKind, result?.result || result);
      const saved = await state.resourceStore.put(resource);
      const resultNode = createCanvasMediaNodeFromResource(saved, {
        title: `${loopNode.title} #${index + 1}`,
        canvasRole: 'target',
        x: (Number(loopNode.x) || 0) + (Number(loopNode.width) || 0) + 48,
        y: (Number(loopNode.y) || 0) + index * 40
      });
      upsertCanvasNode(state.project, resultNode);
      upsertCanvasEdge(state.project, { fromNodeId: loopNode.id, toNodeId: resultNode.id, kind: 'relation' });
      attachNodeToTimeline(state.project, resultNode.id, { trackId: getPreferredTrackIdForKind(resultNode.kind) });
      if (!firstResultNodeId) firstResultNodeId = resultNode.id;
      succeeded += 1;
    } catch (error) {
      console.error('loop variation failed', index, error);
      // single failure does not abort the batch
    }
    loopNode.loopProgress = (index + 1) / total;
    persistProject(state, { immediate: true });
    rerenderEditor(state);
  }

  loopNode.loopStatus = succeeded === total ? 'success' : (succeeded === 0 ? 'error' : 'partial');
  loopNode.targetNodeId = firstResultNodeId;
  persistProject(state, { immediate: true });
  rerenderEditor(state);
  updateStatus(state, `循环完成：${succeeded}/${total} 条`);
}

async function runConfigNodeGeneration(state, configNodeId) {
  const node = state.project?.nodes?.[configNodeId];
  if (!node || node.type !== 'config') return;
  ensureCanvasConfigNode(node);
  if (!node.composerContent && !node.promptText) {
    updateStatus(state, '编排节点还没有提示词内容');
    return;
  }
  if (typeof state.bridge?.runGeneration !== 'function') {
    node.generationStatus = 'error';
    node.generationError = '当前宿主未提供runGeneration';
    state.activeRunNodeId = node.id;
    state.runBannerDismissed = false;
    persistProject(state, { immediate: true });
    rerenderEditor(state);
    updateStatus(state, '生成失败：当前宿主未提供 runGeneration', { tone: 'error' });
    return;
  }

  pushHistory(state);
  node.generationStatus = 'running';
  node.generationTaskId = `gen-${Date.now()}`;
  node.generationStartedAt = Date.now();
  node.generationError = '';
  state.activeRunNodeId = node.id;
  state.runBannerDismissed = false;
  persistProject(state, { immediate: true });
  rerenderEditor(state);
  updateStatus(state, `正在生成：${node.title || '编排节点'}`, { tone: 'running' });

  try {
    const basePrompt = buildConfigNodePrompt(state, node);
    const prompt = await hydrateAssetTokens(state, basePrompt);
    const images = await collectReferenceImagesForConfig(state, node);
    const generationKind = node.generationKind || node.genConfig.kind || 'image';
    const options = {
      images,
      model: node.genConfig.model || '',
      aspect: node.genConfig.aspect || '',
      resolution: node.genConfig.resolution || '',
      quality: node.genConfig.quality || '',
      videoDuration: node.genConfig.videoDuration || '',
      count: node.genConfig.count || 1
    };
    const response = await state.bridge.runGeneration(generationKind, prompt, options);
    const result = response?.result || response;
    const resourceRecord = await persistGenerationResult(state, node, generationKind, result);
    // upsertCanvasNode may replace the object; always write status onto the live project node.
    const liveNode = state.project?.nodes?.[configNodeId] || node;
    liveNode.generationStatus = 'success';
    liveNode.generationError = '';
    liveNode.generationTaskId = '';
    liveNode.generationStartedAt = 0;
    const targetNodeId = liveNode.targetNodeId || node.targetNodeId || '';
    const targetNode = targetNodeId ? state.project?.nodes?.[targetNodeId] : null;
    if (targetNodeId) ensureGenerationResultEdge(state, liveNode.id || configNodeId, targetNodeId);
    upsertCanvasNode(state.project, liveNode);
    persistProject(state, { immediate: true });
    if (targetNodeId) {
      const liveTarget = state.project?.nodes?.[targetNodeId];
      if (liveTarget && liveTarget.canvasRole !== 'target') {
        liveTarget.canvasRole = 'target';
        upsertCanvasNode(state.project, liveTarget);
      }
      setSelectedNodes(state, [targetNodeId], { rerender: false, persist: false, openInspector: false });
      focusNodeInView(state, targetNodeId, { flash: true, select: false, durationMs: 2600 });
    } else {
      rerenderEditor(state);
    }
    const targetTitle = (targetNodeId && state.project?.nodes?.[targetNodeId]?.title)
      || targetNode?.title
      || resourceRecord?.metadata?.label
      || '结果节点';
    const statusNode = state.project?.nodes?.[configNodeId] || liveNode;
    statusNode._lastResultTitle = targetTitle;
    statusNode._lastResultNodeId = targetNodeId || statusNode._lastResultNodeId || '';
    state.activeRunNodeId = statusNode.id || configNodeId;
    state.runBannerDismissed = false;
    // Ensure banner/actions re-sync even if selection already moved to result.
    rerenderEditor(state, { skipPersist: true });
    updateStatus(state, `生成完成：已回写到「${targetTitle}」`, { tone: 'success' });
    if (targetNodeId) {
      // If the result landed off-screen, gently bring it into view so users don't hunt for it.
      if (!isNodeRoughlyInViewport(state, targetNodeId)) {
        try {
          focusNodeInView(state, targetNodeId, { flash: true, select: false });
        } catch {}
      } else {
        state.focusFlashNodeId = targetNodeId;
        state.focusFlashUntil = Date.now() + 1600;
      }
      showResultToast(state, {
        nodeId: targetNodeId,
        sourceNodeId: statusNode.id || configNodeId,
        title: '生成完成',
        detail: '「' + targetTitle + '」，可作参考继续改'
      });
    }
  } catch (error) {
    const liveNode = state.project?.nodes?.[configNodeId] || node;
    liveNode.generationStatus = 'error';
    liveNode.generationError = error?.message || String(error || '生成失败');
    liveNode.generationTaskId = '';
    liveNode.generationStartedAt = 0;
    state.activeRunNodeId = liveNode.id || configNodeId;
    state.runBannerDismissed = false;
    upsertCanvasNode(state.project, liveNode);
    persistProject(state, { immediate: true });
    rerenderEditor(state);
    updateStatus(state, `生成失败：${liveNode.generationError}`, { tone: 'error' });
  }
}

function buildConfigNodePrompt(state, node) {
  const raw = String(node.composerContent || node.promptText || '');
  return raw.replace(/@\[node:([a-z0-9-]+)\]/gi, (_match, nodeId) => {
    const refNode = state.project?.nodes?.[nodeId];
    if (!refNode) return '';
    if (refNode.type === 'text' || refNode.type === 'note') {
      return refNode.text || refNode.title || '';
    }
    if (refNode.type === 'config') {
      return refNode.composerContent || refNode.promptText || refNode.title || '';
    }
    return `[11:${buildCanvasNodeLabel(refNode)}]`;
  }).trim();
}

async function hydrateAssetTokens(state, text) {
  const assetIds = extractAssetReferenceIds(text);
  if (!assetIds.length) return text;
  const store = state.assetStore || (state.assetStore = getCanvasAssetStore());
  const assets = await store.getMany(assetIds);
  const byId = new Map(assets.map(a => [a.id, a]));
  return text.replace(/@\[asset:([a-z0-9-]+)\]/gi, (_match, assetId) => {
    const asset = byId.get(assetId);
    if (!asset) return '';
    if (asset.kind === 'text') return asset.content || asset.title || '';
    return `[10:${asset.title || '参考图'}]`;
  });
}

async function collectReferenceImagesForConfig(state, node) {
  const base = collectNodeReferenceImages(state, node);
  const assetIds = extractAssetReferenceIds(node.composerContent || node.promptText || '');
  if (!assetIds.length) return base;
  const store = state.assetStore || (state.assetStore = getCanvasAssetStore());
  const assets = await store.getMany(assetIds);
  const assetImages = assets.map(assetToReferenceImage).filter(Boolean);
  return [...base, ...assetImages];
}

function collectNodeReferenceImages(state, node) {
  const promptIds = extractNodeReferenceIds(node.composerContent || node.promptText || '');
  const explicitIds = Array.isArray(node.references) ? node.references : [];
  const edgeIds = Object.values(state.project?.edges || {})
    .filter(edge => edge?.toNodeId === node.id)
    .map(edge => edge.fromNodeId);
  const allIds = dedupe([
    ...promptIds,
    ...explicitIds,
    ...edgeIds,
    ...(node.targetNodeId ? [node.targetNodeId] : [])
  ]);

  return allIds
    .map(id => state.project?.nodes?.[id])
    .filter(refNode => refNode?.type === 'media')
    .map(refNode => ({
      dataUrl: refNode.resourceSrc || refNode.thumbnailSrc || refNode.posterSrc || '',
      name: refNode.title || 'canvas-reference',
      role: refNode.canvasRole || ''
    }))
    .filter(item => item.dataUrl);
}

async function persistGenerationResult(state, configNode, kind, result) {
  const resource = buildGenerationResourceRecord(configNode, kind, result);
  const savedResource = await state.resourceStore.put(resource);
  const targetNode = resolveGenerationTargetNode(state, configNode, savedResource);
  const savedTarget = upsertCanvasNode(state.project, targetNode);
  if (!configNode.targetNodeId && savedTarget?.id) {
    configNode.targetNodeId = savedTarget.id;
    upsertCanvasNode(state.project, configNode);
  }
  if (configNode.id && configNode.targetNodeId) {
    ensureGenerationResultEdge(state, configNode.id, configNode.targetNodeId);
  }
  return savedResource;
}

function buildGenerationResourceRecord(configNode, kind, result) {
  const src = normalizeGenerationResultSource(kind, result);
  const thumbnailSrc = result?.thumbnailUrl || (kind === 'image' ? src : '');
  const posterSrc = result?.thumbnailUrl || '';
  return createCanvasResourceRecord({
    kind: kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'image',
    src,
    thumbnailSrc,
    posterSrc,
    label: `${configNode.title || '编排节点'} 结果`,
    mimeType: guessMimeTypeFromResult(kind, result, src),
    durationMs: kind === 'video'
      ? toNumber(result?.durationMs || result?.videoDuration || configNode?.genConfig?.videoDuration, 0) * 1000
      : null
  });
}

function normalizeGenerationResultSource(kind, result) {
  if (kind === 'video') {
    return result?.videoSrc || result?.videoUrl || result?.imageUrl || '';
  }
  if (result?.imageBase64) {
    return result.imageBase64.startsWith('data:')
      ? result.imageBase64
      : `data:${result.mime || 'image/png'};base64,${result.imageBase64}`;
  }
  return result?.imageUrl || result?.videoUrl || result?.videoSrc || '';
}

function guessMimeTypeFromResult(kind, result, src) {
  if (result?.mime) return result.mime;
  if (kind === 'video') return 'video/mp4';
  if (/\.jpe?g(\?|$)/i.test(src)) return 'image/jpeg';
  if (/\.webp(\?|$)/i.test(src)) return 'image/webp';
  return 'image/png';
}

function resolveGenerationTargetNode(state, configNode, resourceRecord) {
  const existing = configNode.targetNodeId ? state.project?.nodes?.[configNode.targetNodeId] : null;
  const baseNode = createCanvasMediaNodeFromResource(resourceRecord, {
    title: `${configNode.title || '编排节点'} 输出`,
    canvasRole: 'target',
    x: (Number(configNode.x) || 0) + (Number(configNode.width) || 0) + 48,
    y: Number(configNode.y) || 0
  });
  if (!existing) return baseNode;
  return {
    ...existing,
    ...baseNode,
    id: existing.id,
    x: existing.x,
    y: existing.y,
    width: existing.width,
    height: existing.height,
    canvasRole: existing.canvasRole || 'target'
  };
}

function ensureGenerationResultEdge(state, fromNodeId, toNodeId) {
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return null;
  const exists = Object.values(state.project?.edges || {}).some(edge =>
    edge && edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId
  );
  if (exists) return null;
  return upsertCanvasEdge(state.project, {
    fromNodeId,
    toNodeId,
    kind: 'relation'
  });
}

function getGenerationFailureRecovery(state, node = null) {
  const target = node || findActiveRunNode(state) || getPrimarySelectedNode(state);
  if (!target) return null;
  const tone = getNodeRunTone(target);
  if (tone !== 'error') return null;
  if (!(target.type === 'config' || target.type === 'loop' || target.type === 'llm')) return null;
  const readiness = getGenerationReadiness(state, target);
  const errorText = String(target.generationError || target.loopError || target.llmError || '').trim();
  const missing = Array.isArray(readiness?.missing) ? readiness.missing : [];
  const needsPrompt = missing.includes('prompt') || /提示词|prompt|内容为空|没有提示/.test(errorText);
  const needsWire = missing.includes('reference') || missing.includes('target') || /参考|接线|image|图片/.test(errorText);
  const needsHost = /宿主|runGeneration|bridge|未提供/.test(errorText);
  let reason = errorText || readiness?.reason || '生成失败';
  let hint = '';
  const actions = [];
  if (needsHost) {
    hint = '当前环境未接通生成服务。可先完善提示词/接线，待服务可用后重试。';
    actions.push(
      { action: 'open-inspector', label: '改提示词', primary: true },
      { action: 'smart-wire-selected', label: '检查接线' },
      { action: 'focus-running-node', label: '定位节点' }
    );
  } else if (needsPrompt) {
    hint = '失败原因偏向提示词不完整。先改提示词，再重试生成。';
    actions.push(
      { action: 'open-inspector', label: '改提示词', primary: true },
      { action: 'retry-generation', label: '重试生成' },
      { action: 'smart-wire-selected', label: '检查接线' }
    );
  } else if (needsWire) {
    hint = '失败可能与参考图/结果节点有关。建议先智能接线，再重试。';
    actions.push(
      { action: 'smart-wire-selected', label: '智能接线', primary: true },
      { action: 'retry-generation', label: '重试生成' },
      { action: 'open-inspector', label: '改提示词' }
    );
  } else if (readiness && readiness.canGenerate === false) {
    hint = readiness.hint || '编排尚未就绪。先完善设置，再重试。';
    actions.push(
      { action: 'open-inspector', label: '完善设置', primary: true },
      { action: 'smart-wire-selected', label: '智能接线' },
      { action: 'retry-generation', label: '重试生成' }
    );
  } else {
    hint = '可直接重试；若结果仍失败，再改提示词或检查接线。';
    actions.push(
      { action: 'retry-generation', label: '重试生成', primary: true },
      { action: 'open-inspector', label: '改提示词' },
      { action: 'smart-wire-selected', label: '检查接线' }
    );
  }
  return {
    nodeId: target.id,
    nodeType: target.type,
    title: target.title || '编排节点',
    reason,
    hint,
    needsPrompt,
    needsWire,
    needsHost,
    readiness,
    actions
  };
}

function getNodeRunTone(node) {
  if (!node) return '';
  if (node.generationStatus === 'running' || node.loopStatus === 'running' || node.llmStatus === 'running') return 'running';
  if (node.generationStatus === 'error' || node.loopStatus === 'error' || node.llmStatus === 'error') return 'error';
  if (node.generationStatus === 'success' || node.loopStatus === 'success' || node.llmStatus === 'success') return 'success';
  return '';
}

function findActiveRunNode(state) {
  if (state.activeRunNodeId && state.project?.nodes?.[state.activeRunNodeId]) {
    return state.project.nodes[state.activeRunNodeId];
  }
  const nodes = Object.values(state.project?.nodes || {}).filter(Boolean);
  const running = nodes.find(node => getNodeRunTone(node) === 'running');
  if (running) {
    state.activeRunNodeId = running.id;
    return running;
  }
  const errored = nodes.find(node => getNodeRunTone(node) === 'error');
  if (errored) {
    state.activeRunNodeId = errored.id;
    return errored;
  }
  const success = nodes.find(node => getNodeRunTone(node) === 'success');
  if (success) {
    state.activeRunNodeId = success.id;
    return success;
  }
  return null;
}

function getActiveResultNodeId(state, node = null) {
  const focusNode = node || findActiveRunNode(state);
  if (!focusNode) return '';
  if (focusNode._lastResultNodeId && state.project?.nodes?.[focusNode._lastResultNodeId]) {
    return focusNode._lastResultNodeId;
  }
  if (focusNode.targetNodeId && state.project?.nodes?.[focusNode.targetNodeId]) {
    return focusNode.targetNodeId;
  }
  if (focusNode.type === 'media' && focusNode.canvasRole === 'target') return focusNode.id;
  return '';
}

function syncRunBanner(state) {
  if (!state.runBanner) return;
  const runningNode = Object.values(state.project?.nodes || {}).find(node => getNodeRunTone(node) === 'running');
  const focusNode = runningNode || findActiveRunNode(state);
  const tone = runningNode ? 'running' : getNodeRunTone(focusNode);
  const resultNodeId = getActiveResultNodeId(state, focusNode);
  const shouldShow = Boolean(runningNode) || (Boolean(focusNode) && !state.runBannerDismissed && (tone === 'error' || tone === 'success'));
  state.runBanner.hidden = !shouldShow;
  state.runBanner.dataset.tone = tone || '';
  state.runBanner.classList.toggle('is-running', tone === 'running');
  state.runBanner.classList.toggle('is-error', tone === 'error');
  state.runBanner.classList.toggle('is-success', tone === 'success');
  if (!shouldShow) return;

  const title = tone === 'running'
    ? '生成中'
    : (tone === 'error' ? '生成失败' : '生成完成');
  let detail = '';
  if (tone === 'running') {
    detail = `正在执行「${focusNode?.title || '编排节点'}」`;
  } else if (tone === 'error') {
    detail = String(focusNode?.generationError || focusNode?.loopError || focusNode?.llmError || '生成失败');
  } else {
    detail = resultNodeId
      ? `结果已回写「${focusNode?._lastResultTitle || state.project?.nodes?.[resultNodeId]?.title || '结果节点'}」`
      : `「${focusNode?.title || '节点'}」已完成`;
  }
  if (state.runBannerTitle) state.runBannerTitle.textContent = title;
  if (state.runBannerDetail) state.runBannerDetail.textContent = detail;

  const recovery = tone === 'error' ? getGenerationFailureRecovery(state, focusNode) : null;
  if (state.runBannerHint) {
    if (recovery?.hint) {
      state.runBannerHint.hidden = false;
      state.runBannerHint.textContent = recovery.hint;
    } else {
      state.runBannerHint.hidden = true;
      state.runBannerHint.textContent = '';
    }
  }
  if (state.runBannerRetryBtn) {
    const canRetry = tone === 'error' && focusNode && (
      focusNode.type === 'config' || focusNode.type === 'loop' || focusNode.type === 'llm' ||
      (focusNode.type === 'media' && focusNode.derivedKind && focusNode.prompt)
    );
    state.runBannerRetryBtn.hidden = !canRetry;
    state.runBannerRetryBtn.disabled = !canRetry;
    if (canRetry) {
      state.runBannerRetryBtn.classList.toggle('is-primary-action', Boolean(recovery?.actions?.[0]?.action === 'retry-generation'));
      state.runBannerRetryBtn.textContent = recovery?.needsHost ? '稍后重试' : '重试';
    }
  }
  if (state.runBannerEditBtn) {
    const canEdit = tone === 'error' && focusNode && (focusNode.type === 'config' || focusNode.type === 'loop' || focusNode.type === 'llm');
    state.runBannerEditBtn.hidden = !canEdit;
    state.runBannerEditBtn.disabled = !canEdit;
    if (canEdit) {
      state.runBannerEditBtn.classList.toggle('is-primary-action', Boolean(recovery?.actions?.[0]?.action === 'open-inspector'));
      state.runBannerEditBtn.textContent = recovery?.needsPrompt ? '改提示词' : '完善设置';
    }
  }
  if (state.runBannerWireBtn) {
    const canWire = tone === 'error' && focusNode && (focusNode.type === 'config' || focusNode.type === 'loop' || focusNode.type === 'llm');
    state.runBannerWireBtn.hidden = !canWire;
    state.runBannerWireBtn.disabled = !canWire;
    if (canWire) {
      state.runBannerWireBtn.classList.toggle('is-primary-action', Boolean(recovery?.actions?.[0]?.action === 'smart-wire-selected'));
      state.runBannerWireBtn.textContent = recovery?.needsWire ? '智能接线' : '检查接线';
    }
  }
  if (state.runBannerResultBtn) {
    const canResult = tone === 'success' && Boolean(resultNodeId);
    state.runBannerResultBtn.hidden = !canResult;
    state.runBannerResultBtn.disabled = !canResult;
  }
  if (state.runBannerFocusBtn) {
    state.runBannerFocusBtn.textContent = tone === 'success' && resultNodeId ? '看结果' : '定位';
    state.runBannerFocusBtn.title = tone === 'success' && resultNodeId ? '定位到编排来源' : '定位到相关节点';
  }
}

function focusActiveRunNode(state) {
  const node = findActiveRunNode(state);
  if (!node) {
    updateStatus(state, '当前没有可定位的生成节点');
    return '';
  }
  setSelectedNodes(state, [node.id], { rerender: true, persist: false, openInspector: false });
  focusNodeInView(state, node.id, { flash: true, select: false });
  updateStatus(state, `已定位：${node.title || '生成节点'}`);
  return node.id;
}

function focusActiveResultNode(state) {
  const source = findActiveRunNode(state);
  const resultId = getActiveResultNodeId(state, source);
  if (!resultId) {
    // fallback to source
    return focusActiveRunNode(state);
  }
  setSelectedNodes(state, [resultId], { rerender: true, persist: false, openInspector: false });
  focusNodeInView(state, resultId, { flash: true, select: false });
  const title = state.project?.nodes?.[resultId]?.title || '结果节点';
  updateStatus(state, `已定位结果：${title}`);
  return resultId;
}

async function retryActiveGeneration(state) {
  // Prefer the generator that just produced the toast result, then active/run lookup.
  const preferredId = state.resultToastSourceNodeId || state.activeRunNodeId || '';
  const preferred = preferredId ? state.project?.nodes?.[preferredId] : null;
  const node = (preferred && (
    preferred.type === 'config' || preferred.type === 'loop' || preferred.type === 'llm' ||
    (preferred.type === 'media' && preferred.derivedKind && preferred.prompt)
  ))
    ? preferred
    : findActiveRunNode(state);
  if (!node) {
    updateStatus(state, '当前没有可重试的生成节点');
    return { ok: false, reason: 'missing-node' };
  }
  if (!(node.type === 'config' || node.type === 'loop' || node.type === 'llm' || (node.type === 'media' && node.derivedKind && node.prompt))) {
    updateStatus(state, '当前节点不支持重试生成');
    return { ok: false, reason: 'unsupported-type', nodeId: node.id };
  }
  state.runBannerDismissed = false;
  state.activeRunNodeId = node.id;
  setSelectedNodes(state, [node.id], { rerender: false, persist: false, openInspector: false });
  updateStatus(state, `正在重试：${node.title || '节点'}`, { tone: 'running' });
  if (node.type === 'media') {
    const sourceIds = Array.isArray(node.derivedSourceNodeIds) ? node.derivedSourceNodeIds : [];
    const inboundIds = Object.values(state.project?.edges || {})
      .filter(edge => edge?.toNodeId === node.id)
      .map(edge => edge.fromNodeId);
    const sources = [...new Set([...sourceIds, ...inboundIds])]
      .map(id => state.project?.nodes?.[id])
      .filter(Boolean);
    await runDerivedGeneration(
      state,
      sources,
      node.derivedKind,
      node.prompt,
      node.derivedTitle || node.title || '派生结果',
      { placeholderNode: node }
    );
    return { ok: true, nodeId: node.id, type: 'derived' };
  }
  if (node.type === 'loop') {
    await runLoopNodeGeneration(state, node.id);
    return { ok: true, nodeId: node.id, type: 'loop' };
  }
  if (node.type === 'llm') {
    await runLlmNode(state);
    return { ok: true, nodeId: node.id, type: 'llm' };
  }
  await runConfigNodeGeneration(state, node.id);
  return { ok: true, nodeId: node.id, type: 'config' };
}

function dismissRunBanner(state) {
  state.runBannerDismissed = true;
  if (state.runBanner) state.runBanner.hidden = true;
}

function describeSelectedEdge(state) {
  const edgeId = state.selectedEdgeId;
  if (!edgeId) return null;
  const edge = state.project?.edges?.[edgeId];
  if (!edge) return null;
  const fromNode = state.project?.nodes?.[edge.fromNodeId];
  const toNode = state.project?.nodes?.[edge.toNodeId];
  const fromTitle = fromNode?.title || edge.fromNodeId || '未知节点';
  const toTitle = toNode?.title || edge.toNodeId || '未知节点';
  const label = edge.label ? String(edge.label) : '关系连线';
  const hasFrom = Boolean(fromNode);
  const hasTo = Boolean(toNode);
  return {
    title: `${fromTitle} →${toTitle}`,
    status: `已选中连线：${fromTitle} → ${toTitle}（R 反转 · Delete 删除）`,
    fromNodeId: edge.fromNodeId || '',
    toNodeId: edge.toNodeId || '',
    html: `
      <div class="canvas-edge-inspector">
        <div class="canvas-edge-inspector-kicker">已选中连线</div>
        <strong>${escapeHtml(fromTitle)} →${escapeHtml(toTitle)}</strong>
        <p>语义：${escapeHtml(label)}</p>
        <p class="canvas-project-copy">端点已在画布高亮。可定位/选中两端，或按 Delete 删除连线。</p>
        <div class="canvas-edge-inspector-actions">
          <button type="button" class="canvas-action-btn" data-action="reverse-selected-edge" ${hasFrom && hasTo ? '' : 'disabled'}>反转方向</button>
          <button type="button" class="canvas-action-btn" data-action="focus-edge-source" ${hasFrom ? '' : 'disabled'}>定位起点</button>
          <button type="button" class="canvas-action-btn" data-action="focus-edge-target" ${hasTo ? '' : 'disabled'}>定位终点</button>
          <button type="button" class="canvas-action-btn" data-action="select-edge-endpoints" ${hasFrom || hasTo ? '' : 'disabled'}>选中两端</button>
          <button type="button" class="canvas-action-btn is-danger" data-action="delete-selected-edge">删除连线</button>
        </div>
      </div>
    `
  };
}

function hideResultToast(state) {
  if (!state) return;
  if (state.resultToastTimer) {
    try { window.clearTimeout(state.resultToastTimer); } catch {}
    state.resultToastTimer = null;
  }
  state.resultToastNodeId = '';
  state.resultToastSourceNodeId = '';
  if (state.resultToast) {
    state.resultToast.hidden = true;
    state.resultToast.dataset.hasResult = '0';
    state.resultToast.dataset.hasSource = '0';
  }
}

function useResultNodeAsReference(state, nodeId = '', options = {}) {
  const targetId = nodeId || state.resultToastNodeId || getActiveResultNodeId(state) || '';
  const node = targetId ? state.project?.nodes?.[targetId] : null;
  if (!node) {
    updateStatus(state, '没有可设为参考的结果节点', { tone: 'error', stickyMs: 2600 });
    return { ok: false, reason: 'missing-result' };
  }
  pushHistory(state);
  node.canvasRole = 'reference';
  const title = String(node.title || '').trim();
  if (title && /结果|输出|生成/.test(title) && !/参考/.test(title)) {
    node.title = title.replace(/结果|输出/g, '参考');
  } else if (!title) {
    node.title = '参考图';
  }
  upsertCanvasNode(state.project, node);
  setSelectedNodes(state, [node.id], { rerender: false, persist: false, openInspector: false });
  persistProject(state);
  rerenderEditor(state, { skipPersist: true, forceFullChrome: true, reason: 'use-result-as-reference' });
  try { focusNodeInView(state, node.id, { flash: true, select: false, durationMs: 1400 }); } catch {}
  if (options.silent !== true) {
    updateStatus(state, '已将结果设为参考图，可继续接线或生成', { tone: 'success', stickyMs: 2600 });
  }
  return { ok: true, nodeId: node.id, role: 'reference' };
}

function continueFromResultNode(state, nodeId = '', options = {}) {
  const targetId = nodeId || state.resultToastNodeId || getActiveResultNodeId(state) || '';
  const node = targetId ? state.project?.nodes?.[targetId] : null;
  if (!node) {
    updateStatus(state, '没有可继续编辑的结果节点', { tone: 'error', stickyMs: 2600 });
    return { ok: false, reason: 'missing-result' };
  }
  setSelectedNodes(state, [node.id], { rerender: true, persist: false, openInspector: options.openInspector !== false });
  try { focusNodeInView(state, node.id, { flash: true, select: false, durationMs: 1400 }); } catch {}
  if (options.openInspector !== false) {
    try { openInspectorForSelection(state, { silent: true }); } catch {}
  }
  if (options.silent !== true) {
    updateStatus(state, '已选中结果，可改角色 / 接线 / 继续生成', { stickyMs: 2400 });
  }
  return { ok: true, nodeId: node.id };
}

function showResultToast(state, options = {}) {
  if (!state?.resultToast) return;
  const nodeId = options.nodeId || '';
  const sourceNodeId = options.sourceNodeId || options.configNodeId || state.activeRunNodeId || '';
  const title = String(options.title || '生成完成');
  const detail = String(options.detail || '可看结果、设为参考或继续改');
  state.resultToastNodeId = nodeId;
  state.resultToastSourceNodeId = sourceNodeId;
  if (state.resultToastTitle) state.resultToastTitle.textContent = title;
  if (state.resultToastDetail) state.resultToastDetail.textContent = detail;
  state.resultToast.hidden = false;
  state.resultToast.dataset.hasResult = nodeId ? '1' : '0';
  state.resultToast.dataset.hasSource = sourceNodeId ? '1' : '0';
  const asRefBtn = state.resultToast.querySelector?.('[data-role="result-toast-as-ref"]');
  const continueBtn = state.resultToast.querySelector?.('[data-role="result-toast-continue"]');
  const retryBtn = state.resultToast.querySelector?.('[data-role="result-toast-retry"]');
  if (asRefBtn) asRefBtn.hidden = !nodeId;
  if (continueBtn) continueBtn.hidden = !nodeId;
  if (retryBtn) retryBtn.hidden = !sourceNodeId;
  if (state.resultToastTimer) {
    try { window.clearTimeout(state.resultToastTimer); } catch {}
  }
  const holdMs = Math.max(2600, Number(options.holdMs) || 7800);
  state.resultToastTimer = window.setTimeout(() => {
    if (state.resultToastNodeId !== nodeId && nodeId) return;
    hideResultToast(state);
  }, holdMs);
}


function frameNodeIdsInView(state, nodeIds = [], options = {}) {
  const ids = dedupe((Array.isArray(nodeIds) ? nodeIds : [nodeIds]).filter(Boolean));
  const nodes = ids.map(id => state.project?.nodes?.[id]).filter(node => node && !node.hidden);
  if (!nodes.length) return false;
  if (nodes.length === 1) {
    focusNodeInView(state, nodes[0].id, {
      flash: options.flash !== false,
      select: false,
      recordHistory: options.recordHistory
    });
    return true;
  }
  const previousSelection = [...(state.selectedNodeIds || [])];
  const restoreSelection = options.restoreSelection === true;
  // fitViewportToSelection uses current selection; temporarily align it.
  setSelectedNodes(state, nodes.map(node => node.id), { rerender: false, persist: false, openInspector: false });
  fitViewportToSelection(state);
  if (restoreSelection) {
    setSelectedNodes(state, previousSelection, { rerender: false, persist: false, openInspector: false });
  }
  if (options.flash !== false && nodes[0]) {
    state.focusFlashNodeId = nodes[0].id;
    state.focusFlashUntil = Date.now() + Math.max(900, Number(options.durationMs) || 1600);
  }
  return true;
}

function isNodeRoughlyInViewport(state, nodeId, options = {}) {
  const node = state.project?.nodes?.[nodeId];
  if (!node || !state.stage) return false;
  const world = getViewportVisibleWorldRect(state, { padPx: Number.isFinite(options.padPx) ? options.padPx : 40 });
  if (!world) return true;
  const x = Number(node.x) || 0;
  const y = Number(node.y) || 0;
  const w = Math.max(1, Number(node.width) || 40);
  const h = Math.max(1, Number(node.height) || 30);
  return boundsIntersect({ minX: x, minY: y, maxX: x + w, maxY: y + h }, world);
}

function focusNodeInView(state, nodeId, options = {}) {
  const node = state.project?.nodes?.[nodeId];
  if (!node || !state.stage) return;
  const stageRect = state.stage.getBoundingClientRect();
  const width = Number(node.width) || 160;
  const height = Number(node.height) || 96;
  const centerX = (Number(node.x) || 0) + width / 2;
  const centerY = (Number(node.y) || 0) + height / 2;
  const scale = Number(state.viewport?.scale) || 1;
  if (options.recordHistory !== false) {
    pushViewportHistory(state, { force: true, minGapMs: 0 });
  }
  state.viewport = {
    ...state.viewport,
    scale,
    x: Math.round((stageRect.width / 2) - (centerX * scale)),
    y: Math.round((stageRect.height / 2) - (centerY * scale))
  };
  if (options.recordHistory !== false) {
    pushViewportHistory(state, { force: true, minGapMs: 0 });
  }
  if (options.flash !== false) {
    const durationMs = Math.max(900, Number(options.durationMs) || 1800);
    state.focusFlashNodeId = nodeId;
    state.focusFlashUntil = Date.now() + durationMs;
    window.setTimeout(() => {
      if (state.focusFlashNodeId !== nodeId) return;
      if (Date.now() < state.focusFlashUntil) return;
      state.focusFlashNodeId = '';
      state.focusFlashUntil = 0;
      rerenderEditor(state, { skipPersist: true });
    }, durationMs + 120);
  }
  if (options.select) {
    setSelectedNodes(state, [nodeId], { rerender: true, persist: false, openInspector: false });
  } else {
    rerenderEditor(state, { skipPersist: true });
  }
}

function handleMiniMapPointer(state, event) {
  if (!state.miniMap || !state.stage) return;
  const nodes = getProjectNodeList(state.project).filter(node => !node.hidden);
  if (!nodes.length) return;
  event.preventDefault();
  const rect = state.miniMap.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const bounds = computeNodeBounds(nodes);
  const padding = 18;
  const width = Math.max(200, state.miniMap.clientWidth || rect.width || 220);
  const height = Math.max(140, state.miniMap.clientHeight || rect.height || 160);
  const scaleX = (width - padding * 2) / Math.max(bounds.width, 1);
  const scaleY = (height - padding * 2) / Math.max(bounds.height, 1);
  const mapScale = Math.min(scaleX, scaleY) || 1;
  const worldX = bounds.minX + ((localX - padding) / mapScale);
  const worldY = bounds.minY + ((localY - padding) / mapScale);
  const scale = Number(state.viewport?.scale) || 1;
  const stageRect = state.stage.getBoundingClientRect();
  pushViewportHistory(state, { force: true, minGapMs: 0 });
  state.viewport = {
    ...state.viewport,
    scale,
    x: Math.round((stageRect.width / 2) - (worldX * scale)),
    y: Math.round((stageRect.height / 2) - (worldY * scale))
  };
  pushViewportHistory(state, { force: true, minGapMs: 0 });
  try { syncStageNav(state); } catch {}
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, '已通过小地图跳转视角');
}

function isDefaultViewportCamera(viewport = {}) {
  const x = Number(viewport?.x) || 0;
  const y = Number(viewport?.y) || 0;
  const scale = Number(viewport?.scale) || 1;
  return Math.abs(x) <= 1 && Math.abs(y) <= 1 && Math.abs(scale - 1) <= 0.03;
}

function getViewportVisibleWorldRect(state, options = {}) {
  const stage = state?.stage;
  if (!stage) return null;
  const rect = stage.getBoundingClientRect?.() || { width: stage.clientWidth || 0, height: stage.clientHeight || 0 };
  const width = Number(rect.width) || 0;
  const height = Number(rect.height) || 0;
  if (width < 40 || height < 40) return null;
  const scale = Math.max(0.05, Number(state.viewport?.scale) || 1);
  const vx = Number(state.viewport?.x) || 0;
  const vy = Number(state.viewport?.y) || 0;
  const padPx = Number.isFinite(options.padPx) ? Number(options.padPx) : 48;
  const left = ((0 - vx) / scale) - (padPx / scale);
  const top = ((0 - vy) / scale) - (padPx / scale);
  const right = ((width - vx) / scale) + (padPx / scale);
  const bottom = ((height - vy) / scale) + (padPx / scale);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    stageWidth: width,
    stageHeight: height,
    scale
  };
}

function boundsIntersect(a, b) {
  if (!a || !b) return false;
  return a.minX <= b.right && a.maxX >= b.left && a.minY <= b.bottom && a.maxY >= b.top;
}

function countNodesInWorldRect(nodes, worldRect) {
  if (!worldRect || !Array.isArray(nodes) || !nodes.length) return 0;
  let count = 0;
  nodes.forEach(node => {
    if (!node || node.hidden) return;
    const x = Number(node.x) || 0;
    const y = Number(node.y) || 0;
    const w = Math.max(1, Number(node.width) || 40);
    const h = Math.max(1, Number(node.height) || 30);
    const nodeBounds = { minX: x, minY: y, maxX: x + w, maxY: y + h };
    if (boundsIntersect(nodeBounds, worldRect)) count += 1;
  });
  return count;
}

function shouldAutoFrameViewportOnOpen(state, options = {}) {
  if (!state?.project || !state.stage) return { needed: false, reason: 'no-stage' };
  if (options.force === true) return { needed: true, reason: 'force' };
  const nodes = getProjectNodeList(state.project).filter(node => node && !node.hidden);
  if (!nodes.length) return { needed: false, reason: 'empty' };
  const world = getViewportVisibleWorldRect(state, { padPx: 72 });
  if (!world) return { needed: false, reason: 'no-world' };
  const visibleCount = countNodesInWorldRect(nodes, world);
  const bounds = computeNodeBounds(nodes);
  if (!bounds) return { needed: false, reason: 'no-bounds' };
  // Default camera on a board with content that is not near origin is almost always wrong.
  if (isDefaultViewportCamera(state.viewport) && !boundsIntersect(bounds, world)) {
    return { needed: true, reason: 'default-miss', visibleCount, total: nodes.length };
  }
  // If almost nothing is in view, reframe. Keep intentional zoomed-in workspaces.
  const ratio = visibleCount / Math.max(1, nodes.length);
  const scale = Number(state.viewport?.scale) || 1;
  if (visibleCount === 0) {
    return { needed: true, reason: 'nothing-visible', visibleCount, total: nodes.length };
  }
  if (nodes.length >= 3 && ratio < 0.18 && scale <= 1.35) {
    return { needed: true, reason: 'mostly-offscreen', visibleCount, total: nodes.length, ratio };
  }
  // Extremely tiny content under default-ish zoom also benefits from a gentle fit.
  if (isDefaultViewportCamera(state.viewport) && nodes.length >= 1) {
    const contentMax = Math.max(bounds.width || 0, bounds.height || 0);
    if (contentMax > 0 && contentMax < Math.min(world.width, world.height) * 0.18) {
      return { needed: true, reason: 'tiny-content', visibleCount, total: nodes.length };
    }
  }
  return { needed: false, reason: 'ok', visibleCount, total: nodes.length, ratio };
}

function maybeAutoFrameViewportOnOpen(state, options = {}) {
  if (!state) return { applied: false, reason: 'no-state' };
  if (state._autoFramedOnOpen && options.force !== true && options.sync !== true) {
    return { applied: false, reason: 'already', ...(state._autoFrameDecision || {}) };
  }
  // Wait one frame so stage has real client metrics after mount.
  const run = () => {
    if (!state || state.destroyed) return { applied: false, reason: 'destroyed' };
    // sync/force calls may re-evaluate; mark only after a real attempt.
    state._autoFramedOnOpen = true;
    const decision = shouldAutoFrameViewportOnOpen(state, options);
    if (!decision.needed) {
      state._autoFrameDecision = decision;
      return { applied: false, ...decision };
    }
    try {
      // Avoid double history noise from nested fit pushes by suspending then forcing one pair.
      pushViewportHistory(state, { force: true, minGapMs: 0 });
      const nodes = getProjectNodeList(state.project).filter(node => node && !node.hidden);
      if (!nodes.length) return { applied: false, reason: 'empty' };
      const bounds = computeNodeBounds(nodes);
      const stageRect = state.stage.getBoundingClientRect();
      if (!stageRect?.width || !stageRect?.height || !bounds) {
        return { applied: false, reason: 'no-metrics' };
      }
      const padding = 80;
      const scaleX = (stageRect.width - padding * 2) / Math.max(bounds.width, 1);
      const scaleY = (stageRect.height - padding * 2) / Math.max(bounds.height, 1);
      const scale = clamp(Math.min(scaleX, scaleY), MIN_SCALE, MAX_SCALE);
      state.viewport = {
        scale,
        x: Math.round((stageRect.width / 2) - ((bounds.minX + bounds.width / 2) * scale)),
        y: Math.round((stageRect.height / 2) - ((bounds.minY + bounds.height / 2) * scale))
      };
      pushViewportHistory(state, { force: true, minGapMs: 0 });
      persistProject(state);
      rerenderEditor(state, { skipPersist: true, forceFullChrome: true, reason: 'auto-frame-open' });
      try { syncStageNav(state); } catch {}
      if (options.silent !== true) {
        updateStatus(state, '已自动适配画布内容', { stickyMs: 1200 });
      }
      state._autoFrameDecision = { ...decision, applied: true };
      return { applied: true, ...decision };
    } catch (err) {
      state._autoFrameDecision = { needed: true, applied: false, reason: 'error', error: String(err?.message || err || '') };
      return state._autoFrameDecision;
    }
  };

  if (options.sync === true) return run();
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      // second frame helps after layout/focus-mode class toggles
      requestAnimationFrame(run);
    });
    return { applied: false, reason: 'scheduled' };
  }
  setTimeout(run, 0);
  return { applied: false, reason: 'scheduled-timeout' };
}

function syncEditorDensityChrome(state) {
  if (!state?.root) return;
  const nodes = getProjectNodeList(state.project).filter(node => node && !node.hidden);
  const nodeCount = nodes.length;
  const isEmpty = nodeCount === 0;
  const workspace = state.root.querySelector?.('.canvas-workspace') || state.root;
  workspace.classList?.toggle('is-empty-board', isEmpty);
  workspace.classList?.toggle('is-dense-board', nodeCount >= 12);
  workspace.classList?.toggle('is-crowded-board', nodeCount >= 36);
  workspace.classList?.toggle('has-stage-nav', Boolean(state.stageNav));
  workspace.classList?.toggle('is-connect-busy', Boolean(
    state.interactionMode === 'connect' || state.clickConnectFromId || state.connectState
  ));
  // Collapse long intro copy once the board has content so the left shell stays scannable.
  state.root.querySelectorAll?.('.canvas-project-copy--editor').forEach(el => {
    el.hidden = !isEmpty;
  });
  // Keep the 3-step guide only for empty / brand-new boards.
  const guide = state.actionGuide || state.root.querySelector?.('[data-role="action-guide"]');
  if (guide && !isEmpty && nodeCount >= 3) {
    // syncContextActions also manages this; enforce density here as a safety net.
    if (!guide.hasAttribute('data-force-show')) guide.hidden = true;
  }
  state._boardDensity = { nodeCount, isEmpty };
}

function fitViewportToNodes(state) {
  const nodes = getProjectNodeList(state.project).filter(node => !node.hidden);
  if (!nodes.length) {
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    state.viewport = { x: 0, y: 0, scale: 1 };
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    persistProject(state);
    rerenderEditor(state);
    try { syncStageNav(state); } catch {}
    return;
  }
  pushViewportHistory(state, { force: true, minGapMs: 0 });
  const bounds = computeNodeBounds(nodes);
  const stageRect = state.stage.getBoundingClientRect();
  const padding = 80;
  const scaleX = (stageRect.width - padding * 2) / Math.max(bounds.width, 1);
  const scaleY = (stageRect.height - padding * 2) / Math.max(bounds.height, 1);
  const scale = clamp(Math.min(scaleX, scaleY), MIN_SCALE, MAX_SCALE);
  state.viewport = {
    scale,
    x: Math.round((stageRect.width / 2) - ((bounds.minX + bounds.width / 2) * scale)),
    y: Math.round((stageRect.height / 2) - ((bounds.minY + bounds.height / 2) * scale))
  };
  pushViewportHistory(state, { force: true, minGapMs: 0 });
  persistProject(state);
  rerenderEditor(state);
  try { syncStageNav(state); } catch {}
  updateStatus(state, '已适配全部节点');
}

function fitViewportToSelection(state) {
  const selected = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(node => node && !node.hidden);
  if (!selected.length) {
    updateStatus(state, '请先选择节点再适配所选');
    return;
  }
  if (selected.length === 1) {
    focusNodeInView(state, selected[0].id, { flash: true });
    updateStatus(state, '已适配到所选节点');
    return;
  }
  const bounds = computeNodeBounds(selected);
  const stageRect = state.stage.getBoundingClientRect();
  const padding = 72;
  const scaleX = (stageRect.width - padding * 2) / Math.max(bounds.width, 1);
  const scaleY = (stageRect.height - padding * 2) / Math.max(bounds.height, 1);
  const scale = clamp(Math.min(scaleX, scaleY), MIN_SCALE, MAX_SCALE);
  pushViewportHistory(state, { force: true, minGapMs: 0 });
  state.viewport = {
    scale,
    x: Math.round((stageRect.width / 2) - ((bounds.minX + bounds.width / 2) * scale)),
    y: Math.round((stageRect.height / 2) - ((bounds.minY + bounds.height / 2) * scale))
  };
  pushViewportHistory(state, { force: true, minGapMs: 0 });
  persistProject(state);
  rerenderEditor(state);
  try { syncStageNav(state); } catch {}
  updateStatus(state, `已适配所选${selected.length} 个节点`);
}

function isNodeActiveAtPlayhead(project, node) {
  if (!node || node.type !== 'media' || !node.clip) return false;
  const timeline = ensureCanvasProjectTimeline(project);
  const clip = ensureCanvasMediaNodeClip(node);
  return timeline.currentTimeMs >= clip.startMs && timeline.currentTimeMs <= (clip.startMs + clip.durationMs);
}

function isInteractionLightMode(state, options = {}) {
  if (options.forceFullChrome === true) return false;
  // Explicit lightChrome wins only when not forcing full chrome.
  if (options.lightChrome === true && options.forceFullChrome !== true) return true;
  if (!state) return false;
  // Live continuous gestures auto-enter light mode (including connect drag + pinch).
  // Pending viewport timers must not suppress later explicit full rerenders unless
  // a caller explicitly opts into the short light window.
  const liveGesture = Boolean(
    state.panState
    || state.dragState
    || state.resizeState
    || state.rotateState
    || state.boxState
    || state.spacePanActive
    || state.pinchState
    || (state.connectState && !state.connectState.clickPreview)
  );
  if (liveGesture) return true;
  if (options.useLightWindow === true) {
    return Boolean(state._interactionLightUntil && Date.now() < state._interactionLightUntil);
  }
  return false;
}

function markInteractionLightWindow(state, ms = 180) {
  if (!state) return;
  const until = Date.now() + Math.max(0, Number(ms) || 0);
  state._interactionLightUntil = Math.max(Number(state._interactionLightUntil) || 0, until);
}

function getViewportCullBounds(state, options = {}) {
  if (!state?.stage) return null;
  const nodeCount = Object.keys(state.project?.nodes || {}).length;
  // Cull earlier so medium/large boards stay responsive while panning/zooming.
  if (nodeCount < 10) return null;
  const scale = Number(state.viewport?.scale) || 1;
  const interaction = isInteractionLightMode(state, options);
  // Tighter padding on denser boards / while zoomed out reduces DOM work dramatically.
  let padPx = 160;
  if (nodeCount >= 24) padPx = 130;
  if (nodeCount >= 40) padPx = 110;
  if (nodeCount >= 70) padPx = 90;
  if (nodeCount >= 100) padPx = 72;
  if (nodeCount >= 160) padPx = 56;
  if (scale < 0.85) padPx = Math.min(padPx, 120);
  if (scale < 0.7) padPx = Math.min(padPx, 100);
  if (scale < 0.55) padPx = Math.min(padPx, 80);
  if (scale < 0.42) padPx = Math.min(padPx, 60);
  // Interaction-time: shrink pad further so pan/zoom/drag stays light on dense boards.
  if (interaction) {
    if (nodeCount >= 24) padPx = Math.min(padPx, Math.round(padPx * 0.82));
    if (nodeCount >= 60) padPx = Math.min(padPx, Math.round(padPx * 0.9));
    if (nodeCount >= 100) padPx = Math.min(padPx, 48);
    if (nodeCount >= 160) padPx = Math.min(padPx, 36);
    if (scale < 0.8) padPx = Math.min(padPx, 44);
  }
  const pad = padPx / scale;
  const width = (state.stage.clientWidth || 1) / scale;
  const height = (state.stage.clientHeight || 1) / scale;
  const left = (-(Number(state.viewport?.x) || 0) / scale) - pad;
  const top = (-(Number(state.viewport?.y) || 0) / scale) - pad;
  return {
    left,
    top,
    right: left + width + pad * 2,
    bottom: top + height + pad * 2,
    nodeCount,
    scale,
    interaction: interaction ? 1 : 0,
    padPx
  };
}

function resolveNodeLod(state, node, options = {}) {
  if (!node) return 'full';
  if (node.selected || node.isFocusFlash || node.isEdgeEndpoint) return 'full';
  if (node.type === 'group') return 'full';
  // Keep active generation / result roles readable a bit longer (idle only).
  const scale = Number(state?.viewport?.scale) || 1;
  const nodeCount = options.nodeCount || Object.keys(state?.project?.nodes || {}).length;
  const interaction = options.interaction === true || options.lightChrome === true;
  if (!interaction && node.canvasRole === 'target' && scale >= 0.85) return 'full';
  const forceLite = options.forceLite === true;
  if (forceLite) return 'lite';
  // Interaction-time thresholds kick in earlier so continuous pan/zoom stays responsive.
  if (interaction) {
    if (nodeCount >= 24) return 'lite';
    if (scale <= 0.9) return 'lite';
  }
  if (scale <= 0.72) return 'lite';
  if (nodeCount >= 36 && scale <= 0.92) return 'lite';
  if (nodeCount >= 60 && scale <= 1.0) return 'lite';
  if (nodeCount >= 80 && scale <= 1.12) return 'lite';
  if (nodeCount >= 100) return 'lite';
  if (nodeCount >= 140) return 'lite';
  return 'full';
}

function isNodeInCullBounds(node, bounds) {
  if (!node || !bounds) return true;
  const x = Number(node.x) || 0;
  const y = Number(node.y) || 0;
  const w = Number(node.width) || 160;
  const h = Number(node.height) || 96;
  return x + w >= bounds.left
    && x <= bounds.right
    && y + h >= bounds.top
    && y <= bounds.bottom;
}

function rerenderEditor(state, options = {}) {
  if (!state.project) return;
  ensureCanvasProjectTimeline(state.project);
  syncStageSize(state);

  const now = Date.now();
  if (state.focusFlashUntil && now > state.focusFlashUntil) {
    state.focusFlashNodeId = '';
    state.focusFlashUntil = 0;
  }
  // forceFullChrome always wins over lightChrome.
  const lightChrome = options.forceFullChrome === true
    ? false
    : (options.lightChrome === true || isInteractionLightMode(state, options));
  if (!state._renderStats) state._renderStats = { total: 0, fullChrome: 0, lightChrome: 0 };
  state._renderStats.total += 1;
  if (lightChrome) state._renderStats.lightChrome += 1;
  else state._renderStats.fullChrome += 1;
  const interaction = lightChrome;
  if (options.forceFullChrome === true) {
    // Cancel pending light viewport frames so async pan/zoom commits cannot re-straighten edges.
    if (state._viewportCommitTimer) {
      try { clearTimeout(state._viewportCommitTimer); } catch {}
      state._viewportCommitTimer = null;
      state._viewportCommitPending = false;
    }
    if (state._viewportSettleTimer) {
      try { clearTimeout(state._viewportSettleTimer); } catch {}
      state._viewportSettleTimer = null;
    }
    state._interactionLightUntil = 0;
    if (state.connectState?.clickPreview && state.interactionMode !== 'connect') {
      // Drop stale click-connect ghost so idle cubic edges render cleanly.
      state.connectState = null;
    }
  }
  const cullBounds = getViewportCullBounds(state, { lightChrome: interaction });
  const selectedEdge = state.selectedEdgeId ? state.project?.edges?.[state.selectedEdgeId] : null;
  const endpointIds = new Set(
    selectedEdge
      ? [selectedEdge.fromNodeId, selectedEdge.toNodeId].map(id => String(id || '')).filter(Boolean)
      : []
  );
  const totalNodeCount = Object.keys(state.project.nodes || {}).length;
  const scale = Number(state.viewport?.scale) || 1;
  let visibleCount = 0;
  let liteCount = 0;
  const forceLite = Boolean(
    options.forceLite === true
    || (interaction && totalNodeCount >= 24)
    || (interaction && totalNodeCount >= 16 && scale <= 0.95)
    || (options.lightChrome === true && totalNodeCount >= 28 && scale <= 1.05)
  );
  const projectView = {
    ...state.project,
    viewport: { ...state.viewport },
      nodes: Object.fromEntries(
      Object.entries(state.project.nodes || {}).map(([id, node]) => {
        const selected = state.selectedNodeIds.includes(id);
        const displaySource = state.resourceDisplaySources?.get(id)?.src || '';
        const displayNode = displaySource
          ? { ...node, resourceSrc: displaySource, thumbnailSrc: displaySource }
          : node;
        const inView = !cullBounds || selected || isNodeInCullBounds(node, cullBounds) || endpointIds.has(id);
        const lod = resolveNodeLod(state, {
          ...displayNode,
          selected,
          isEdgeEndpoint: endpointIds.has(id),
          isFocusFlash: state.focusFlashNodeId === id && now <= (state.focusFlashUntil || 0)
        }, {
          nodeCount: totalNodeCount,
          forceLite,
          interaction,
          lightChrome: interaction
        });
        if (inView && !node.hidden) {
          visibleCount += 1;
          if (lod === 'lite') liteCount += 1;
        }
        return [id, {
          ...displayNode,
          selected,
          lod,
          isEdgeEndpoint: endpointIds.has(id),
          isEdgeSource: selectedEdge?.fromNodeId === id,
          isEdgeTarget: selectedEdge?.toNodeId === id,
          isActive: isNodeActiveAtPlayhead(state.project, node),
          isFocusFlash: state.focusFlashNodeId === id && now <= (state.focusFlashUntil || 0),
          hidden: node.hidden || !inView
        }];
      })
    )
  };
  if (state.nodeLayer) {
    state.nodeLayer.dataset.cullTotal = String(totalNodeCount);
    state.nodeLayer.dataset.cullVisible = String(visibleCount);
    state.nodeLayer.dataset.cullLite = String(liteCount);
    state.nodeLayer.dataset.cullActive = cullBounds ? '1' : '0';
    state.nodeLayer.dataset.cullInteraction = interaction ? '1' : '0';
  }

  const edgeCount = Object.keys(state.project.edges || {}).length;
  const {
    simplifyEdges,
    preferStraightEdges,
    skipHitPaths,
    skipMarkers,
    maxVisibleEdges
  } = resolveInteractionEdgeOptions(state, {
    interaction,
    nodeCount: totalNodeCount,
    edgeCount,
    scale
  });
  renderCanvasGrid(state.stage, state.project.backgroundMode || 'lines');
  renderCanvasEdges(state.edgeLayer, projectView, {
    previewConnection: state.connectState,
    selectedEdgeId: state.selectedEdgeId,
    simplifyEdges,
    preferStraightEdges,
    skipHitPaths,
    skipMarkers,
    maxVisibleEdges
  });
  renderCanvasNodes(state.nodeLayer, projectView, {
    incremental: options.forceFull !== true
  });
  // lightChrome already computed above for interaction-aware virtualization

  if (state.timelineLayer) {
    const reason = String(options.reason || '');
    const forceTimeline = options.forceTimeline === true
      || options.forceFullChrome === true
      || /playhead|playback|timeline/i.test(reason);
    // Keep timeline honest for playhead/playback; skip only pure geometry light frames.
    if (!lightChrome || forceTimeline) {
      renderCanvasTimeline(state.timelineLayer, projectView, { pixelsPerSecond: TIMELINE_PIXELS_PER_SECOND });
    }
  }
  if (!lightChrome && state.miniMap) {
    renderCanvasMiniMap(state.miniMap, projectView, state.viewport);
  }

  state.viewportElement.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})`;
  state.titleLabel.textContent = state.project.title || '画布项目';
  setSidebarTab(state, state.activeSidebarTab);
  if (state.scaleLabel) state.scaleLabel.textContent = `${Math.round(state.viewport.scale * 100)}%`;
  if (state.backgroundSelect) state.backgroundSelect.value = state.project.backgroundMode || 'lines';
  if (state.miniMap) state.miniMap.hidden = !state.miniMapOpen;
  try { syncStageNav(state); } catch {}
  if (!options.lightChrome) {
    try { syncEditorDensityChrome(state); } catch {}
    try { syncConnectTip(state); } catch {}
    try { syncModeHud(state); } catch {}
  } else {
    // Mode/selection chip is cheap and should stay honest during pan/zoom.
    try { syncModeHud(state); } catch {}
  }
  if (!options.skipPersist) state.project.viewport = { ...state.viewport };
  if (!lightChrome) {
    syncPlaybackUI(state);
    syncTimelineSummary(state);
    maybeAutoOpenMiniMap(state);
    syncSelectionToolbar(state);
    syncRunBanner(state);
    renderSnapGuides(state);
  } else {
    // Keep zoom/status readable during continuous pan/zoom commits.
    syncZoomLabel(state);
    // Selection chrome must stay honest even during light frames.
    syncSelectionToolbar(state);
  }
  // Inspector empty/form visibility is cheap and must not lag behind selection changes.
  syncInspector(state);
  syncEmptyStage(state);
  if (!lightChrome) {
    syncSelectionStatus(state);
    syncContextActions(state);
    syncStageCoach(state);
  } else {
    syncSelectionStatus(state);
  }
}

function setPlaybackRate(state, rate) {
  setTimelinePlaybackState(state.project, { playbackRate: Number(rate) || 1 });
  persistProject(state);
  rerenderEditor(state, { skipPersist: true });
  updateStatus(state, `播放速度已切换到 ${Number(rate) || 1}x`);
}

function syncPlaybackUI(state) {
  const timeline = ensureCanvasProjectTimeline(state.project);
  if (state.playbackButton) {
    state.playbackButton.textContent = timeline.isPlaying ? '暂停' : '播放';
  }
  if (state.playbackRateReadout) {
    state.playbackRateReadout.textContent = `${timeline.playbackRate || 1}x`;
  }
  if (state.playbackRateSelect) {
    state.playbackRateSelect.value = String(timeline.playbackRate || 1);
  }
  state.root.querySelectorAll('[data-action="set-playback-rate"]').forEach(button => {
    const active = Math.abs((Number(button.dataset.rate) || 1) - (timeline.playbackRate || 1)) < 0.001;
    button.classList.toggle('is-active', active);
  });
  syncPlaybackLoop(state);
}

function syncTimelineSummary(state) {
  if (!state.timelineInfo || !state.playheadLabel) return;
  const timeline = ensureCanvasProjectTimeline(state.project);
  const clips = getProjectTimelineClips(state.project);
  const playheadText = formatDurationLabel(timeline.currentTimeMs || 0);
  state.playheadLabel.textContent = playheadText;
  state.timelineInfo.textContent = clips.length
    ? `共 ${clips.length} 个片段已进入时间轴，可横向改时间、纵向跨轨移动`
    : '选中媒体节点后可加入时间轴。';
  const summary = state.root?.querySelector?.('[data-role="timeline-collapsed-summary"]');
  if (summary && state.timelineCollapsed) {
    summary.hidden = false;
    summary.textContent = clips.length
      ? `已折叠 · ${clips.length} 片段 · ${playheadText} · 点击展开`
      : '已折叠 · 暂无片段 · 点击展开';
  }
  syncViewToggleButtons(state);
}

function maybeAutoOpenMiniMap(state) {
  if (!state || state.miniMapOpen || state._miniMapAutoOpened) return;
  // If the project already has an explicit closed preference, don't auto-open again.
  if (state.project?.viewPrefs && Object.prototype.hasOwnProperty.call(state.project.viewPrefs, 'miniMapOpen') && state.project.viewPrefs.miniMapOpen === false) {
    state._miniMapAutoOpened = true;
    return;
  }
  const count = Object.keys(state.project?.nodes || {}).length;
  if (count < 12) return;
  state.miniMapOpen = true;
  state._miniMapAutoOpened = true;
  if (state.project) {
    state.project.viewPrefs = {
      ...(state.project.viewPrefs || {}),
      miniMapOpen: true
    };
  }
  if (state.miniMap) state.miniMap.hidden = false;
}

function resolveBoardNextStep(state, options = {}) {
  const board = getBoardWorkflowSnapshot(state);
  const selectedCount = state.selectedNodeIds?.length || 0;
  const hasEdge = Boolean(state.selectedEdgeId);
  const forCoach = options.forCoach === true;
  const includeSelectionGate = options.includeSelectionGate !== false;

  // When selection/edge owns the context card, default plan is "selected" (coach stays hidden).
  // Callers that need board-level empty guidance can pass includeSelectionGate: false.
  if (includeSelectionGate && (selectedCount > 0 || hasEdge)) {
    return {
      step: 'selected',
      visible: false,
      title: '',
      meta: '',
      detail: '',
      hint: '',
      actions: [],
      recommend: [],
      panel: { prefer: 'none' },
      board
    };
  }

  if (board.isEmpty) {
    return {
      step: 'empty',
      visible: false,
      title: '未选中节点',
      meta: '可框选/ 点击节点',
      detail: '先导入素材或一键起步',
      hint: '点「一键起步」，或 Studio 导入勾选图片；也可本地上传 / 拖图',
      actions: [
        { action: 'upload-local-images', label: '本地上传', emphasis: true },
        { action: 'import-media', label: 'Studio 导入', emphasis: true },
        { action: 'start-quick-workflow', label: '一键起步' },
        { action: 'focus-node-search', label: '查找 /' }
      ],
      recommend: ['[data-action="start-quick-workflow"]', '[data-action="import-media"]', '[data-action="upload-local-images"]'],
      panel: { prefer: 'import', executeMeta: '有节点后可用', importMeta: '从这里开始', addMeta: '或手动添加' },
      board
    };
  }

  // Prefer recovery guidance for empty selection when a generator just failed.
  const failed = getGenerationFailureRecovery(state, findActiveRunNode(state));
  if (failed) {
    return {
      step: 'recover-failure',
      visible: true,
      title: '下一步：处理生成失败',
      meta: failed.reason || '生成失败待处理',
      detail: failed.reason || '生成失败待处理',
      hint: failed.hint || failed.reason || '可改提示词、检查接线后重试。',
      actions: (failed.actions || []).slice(0, 4).map(item => ({
        action: item.action,
        label: item.label,
        primary: Boolean(item.primary)
      })),
      recommend: (failed.actions || []).slice(0, 2).map(item => '[data-action="' + item.action + '"]'),
      panel: {
        prefer: 'execute',
        executeMeta: '失败恢复',
        importMeta: '补充素材',
        addMeta: '常用'
      },
      board,
      recovery: failed
    };
  }

  if (!board.hasConfig && board.hasMedia) {
    return {
      step: 'add-config',
      visible: true,
      title: '下一步：添加编排',
      meta: '已有 ' + board.mediaCount + ' 张媒体 · 还差生成规则',
      detail: '已有 ' + board.mediaCount + ' 张媒体，补生成规则后可接线',
      hint: '媒体已就位。添加编排节点（生成规则）后，可一键智能接线并生成。',
      actions: [
        { action: 'new-config', label: '添加编排', primary: true },
        { action: 'smart-wire-selected', label: '智能接线' },
        { action: 'import-media', label: '继续导入' },
        { action: 'fit-view', label: '适配全部' }
      ],
      recommend: ['[data-action="new-config"]', '[data-action="smart-wire-selected"]'],
      panel: {
        prefer: 'add',
        executeMeta: '稍后生成',
        importMeta: '已有素材',
        addMeta: '一键起步'
      },
      board
    };
  }

  if (board.hasConfig && board.needsWire) {
    return {
      step: 'smart-wire',
      visible: true,
      title: '下一步：智能接线',
      meta: board.hasMedia
        ? ('编排 ' + board.configCount + ' · 媒体 ' + board.mediaCount + ' · 待整理连线')
        : ('编排 ' + board.configCount + ' · 建议补充参考图'),
      detail: board.hasMedia
        ? ('编排 ' + board.configCount + ' · 媒体 ' + board.mediaCount + ' · 待整理连线')
        : ('编排 ' + board.configCount + ' · 建议补充参考图'),
      hint: board.hasMedia
        ? '点击智能接线，自动整理 参考图 → 编排 → 结果图。'
        : '先导入参考图，再智能接线。',
      actions: [
        { action: 'smart-wire-selected', label: '智能接线', primary: true },
        { action: 'generate-selected', label: '执行生成' },
        { action: 'import-media', label: board.hasMedia ? '补充素材' : 'Studio 导入' },
        { action: 'fit-view', label: '适配全部' }
      ],
      recommend: ['[data-action="smart-wire-selected"]', '[data-action="generate-selected"]'],
      panel: {
        prefer: 'execute',
        executeMeta: '先接线',
        importMeta: '补充素材',
        addMeta: '常用'
      },
      board
    };
  }

  if (board.hasConfig && board.canGenerate) {
    return {
      step: 'generate',
      visible: true,
      title: '下一步：执行生成',
      meta: '编排已就绪 · 参考 ' + board.referenceCount + ' · 结果 ' + board.targetCount,
      detail: '编排已就绪 · 参考 ' + board.referenceCount + ' · 结果 ' + board.targetCount + ' · 可直接按 G',
      hint: '选中编排节点后按 G，或直接点执行生成。成功后会高亮结果节点。',
      actions: [
        { action: 'generate-selected', label: '执行生成', primary: true },
        { action: 'smart-wire-selected', label: '检查接线' },
        { action: 'fit-view', label: '适配全部' },
        { action: 'focus-node-search', label: '查找 /' }
      ],
      recommend: ['[data-action="generate-selected"]', '[data-action="smart-wire-selected"]'],
      panel: {
        prefer: 'execute',
        executeMeta: '可生成',
        importMeta: '补充素材',
        addMeta: '常用'
      },
      board
    };
  }

  if (board.hasConfig && !board.canGenerate) {
    return {
      step: 'complete-config',
      visible: true,
      title: '下一步：完善编排',
      meta: '编排 ' + board.configCount + ' · 还差提示词或素材',
      detail: '编排 ' + board.configCount + ' · 还差提示词或素材',
      hint: '打开编排设置填写提示词，或先导入参考图再智能接线。',
      actions: [
        { action: 'open-inspector', label: '完善设置', primary: true },
        { action: 'smart-wire-selected', label: '智能接线' },
        { action: 'import-media', label: '补充素材' },
        { action: 'upload-local-images', label: '本地上传' }
      ],
      recommend: ['[data-action="open-inspector"]', '[data-action="smart-wire-selected"]'],
      panel: {
        prefer: 'execute',
        executeMeta: '完善编排',
        importMeta: '补充素材',
        addMeta: '常用'
      },
      board
    };
  }

  return {
    step: 'browse',
    visible: true,
    title: '画布已有内容',
    meta: '共 ' + board.nodeCount + ' 个节点',
    detail: '共 ' + board.nodeCount + ' 个节点 · 点击节点继续，或导入/查找',
    hint: '点击节点继续编辑；也可导入素材、查找节点或适配视图。',
    actions: [
      { action: 'import-media', label: 'Studio 导入', primary: true },
      { action: 'upload-local-images', label: '本地上传' },
      { action: 'focus-node-search', label: '查找 /' },
      { action: 'fit-view', label: '适配全部' }
    ],
    recommend: ['[data-action="import-media"]', '[data-action="focus-node-search"]'],
    panel: {
      prefer: 'import',
      executeMeta: '选中后可用',
      importMeta: '继续导入',
      addMeta: '常用'
    },
    board
  };
}

function dismissStageCoach(state, options = {}) {
  state.stageCoachDismissed = true;
  state.stageCoachDismissedStep = state.stageCoachStep || '';
  if (state.stageCoachEl) state.stageCoachEl.hidden = true;
  if (options.silent !== true) updateStatus(state, '已隐藏下丢步提示（切换步骤后会再出现）');
}

function syncStageCoach(state) {
  if (!state?.stageCoachEl) return;
  const plan = resolveBoardNextStep(state, { forCoach: true });
  state.stageCoachStep = plan.step || '';
  // Re-show when workflow step changes after user dismissed.
  if (state.stageCoachDismissed && state.stageCoachDismissedStep && state.stageCoachDismissedStep !== plan.step) {
    state.stageCoachDismissed = false;
    state.stageCoachDismissedStep = '';
  }

  // Keep empty-stage/onboarding chrome in sync before deciding coach visibility.
  try { syncEmptyStage(state); } catch {}
  const boardHasNodes = Boolean(plan.board ? !plan.board.isEmpty : (plan.step && plan.step !== 'empty'));
  const connectBusy = Boolean(
    state.interactionMode === 'connect'
    || state.clickConnectFromId
    || state.connectState
    || (state.connectTipEl && !state.connectTipEl.hidden)
  );
  const hideForOverlays = Boolean(
    (!boardHasNodes && state.onboardingEl && !state.onboardingEl.hidden)
    || (state.dropOverlayEl && !state.dropOverlayEl.hidden)
    || (!boardHasNodes && state.emptyStageEl && !state.emptyStageEl.hidden)
    || (state.resultToast && !state.resultToast.hidden)
    || (state.runBanner && !state.runBanner.hidden && state.runBanner.dataset?.tone === 'running')
    || state.boxState
    || state.panState
    || state.dragState
    || state.resizeState
    || state.rotateState
    || connectBusy
    || (state.modalOverlay && !state.modalOverlay.hidden)
  );

  const visible = Boolean(plan.visible) && !state.stageCoachDismissed && !hideForOverlays;
  state.stageCoachEl.hidden = !visible;
  state.stageCoachEl.dataset.step = plan.step || '';
  state.stageCoachEl.classList.toggle('is-visible', visible);
  state.stageCoachEl.classList.toggle('is-sidebar-collapsed', Boolean(state.sidebarCollapsed));
  state.stageCoachEl.classList.toggle('is-timeline-collapsed', Boolean(state.timelineCollapsed));
  state.stageCoachEl.classList.toggle('is-compact', Boolean(state.sidebarCollapsed || state.timelineCollapsed));
  const floatingToolbar = state.selectionToolbar && !state.selectionToolbar.hidden && state.selectionToolbar.classList.contains('is-floating');
  state.stageCoachEl.classList.toggle('is-toolbar-floating', Boolean(floatingToolbar));
  if (floatingToolbar && state._selectionToolbarScreen) {
    const dockGap = Math.max(72, Math.round((state._selectionToolbarScreen.height || 0) + 28));
    state.stageCoachEl.style.setProperty('--coach-toolbar-offset', dockGap + 'px');
  } else {
    state.stageCoachEl.style.removeProperty('--coach-toolbar-offset');
  }

  if (state.stageCoachTitle) state.stageCoachTitle.textContent = plan.title || '一键起步';
  if (state.stageCoachDetail) state.stageCoachDetail.textContent = plan.detail || '';

  if (state.stageCoachActions) {
    const actions = Array.isArray(plan.actions) ? plan.actions : [];
    state.stageCoachActions.innerHTML = actions.map(item => {
      const primary = item.primary ? ' is-primary-action' : '';
      return '<button type="button" class="canvas-stage-coach-btn' + primary + '" data-action="' + item.action + '">' + item.label + '</button>';
    }).join('');
  }

  return plan;
}

function syncEmptyStage(state) {
  if (!state.emptyStageEl && !state.onboardingEl) return;
  const count = getProjectNodeList(state.project).filter(node => !node.hidden).length;
  // First-run onboarding only belongs on an empty board.
  if (state.onboardingEl && count > 0 && !state.onboardingEl.hidden) {
    state.onboardingEl.hidden = true;
  }
  if (!state.emptyStageEl) return;
  const hideForOverlays = Boolean(
    (state.onboardingEl && !state.onboardingEl.hidden)
    || (state.dropOverlayEl && !state.dropOverlayEl.hidden)
  );
  state.emptyStageEl.hidden = count > 0 || hideForOverlays;
  state.emptyStageEl.classList.toggle('is-visible', !state.emptyStageEl.hidden);
}

function syncSelectionBounds(state, options = {}) {
  if (!state.selectionBoundsEl) return;
  const hideForDrag = options.hideForDrag ?? Boolean(state.boxState || state.panState || state.dragState || state.resizeState || state.rotateState || state.connectState || state.previewActive);
  const selected = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(node => node && !node.hidden);
  if (hideForDrag || selected.length < 2) {
    state.selectionBoundsEl.hidden = true;
    return;
  }
  const bounds = computeNodeBounds(selected);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    state.selectionBoundsEl.hidden = true;
    return;
  }
  const scale = Number(state.viewport?.scale) || 1;
  const vx = Number(state.viewport?.x) || 0;
  const vy = Number(state.viewport?.y) || 0;
  const pad = 8;
  const left = vx + bounds.minX * scale - pad;
  const top = vy + bounds.minY * scale - pad;
  const width = bounds.width * scale + pad * 2;
  const height = bounds.height * scale + pad * 2;
  state.selectionBoundsEl.hidden = false;
  state.selectionBoundsEl.style.left = Math.round(left) + 'px';
  state.selectionBoundsEl.style.top = Math.round(top) + 'px';
  state.selectionBoundsEl.style.width = Math.round(width) + 'px';
  state.selectionBoundsEl.style.height = Math.round(height) + 'px';
  state.selectionBoundsEl.dataset.count = String(selected.length);
}

function syncSelectionToolbar(state) {
  const count = state.selectedNodeIds?.length || 0;
  const hideForDrag = Boolean(state.boxState || state.panState || state.dragState || state.resizeState || state.rotateState || state.connectState || state.previewActive);
  syncSelectionBounds(state, { hideForDrag });

  if (state.selectionToolbar) {
    const multiVisible = count >= 2 && !hideForDrag;
    state.selectionToolbar.hidden = !multiVisible;
    if (!multiVisible) {
      state.selectionToolbar.classList.remove('is-floating');
      state.selectionToolbar.dataset.placement = 'dock';
      state.selectionToolbar.style.left = '';
      state.selectionToolbar.style.top = '';
      state.selectionToolbar.style.right = '';
      state.selectionToolbar.style.bottom = '';
      state.selectionToolbar.style.transform = '';
      state.selectionToolbar.style.width = '';
      state._selectionToolbarScreen = null;
    }
    const nodes = (state.selectedNodeIds || []).map(id => state.project?.nodes?.[id]).filter(Boolean);
    const typeSet = new Set(nodes.map(node => node.type || 'note'));
    const hasConfigLike = nodes.some(node => node.type === 'config' || node.type === 'loop' || node.type === 'llm');
    const hasMedia = nodes.some(node => node.type === 'media');
    const canGroup = nodes.filter(node => node && node.type !== 'group').length >= 2;
    const canUngroup = nodes.some(node => node && (node.type === 'group' || node.groupId));
    const canSelectMembers = nodes.some(node => node?.type === 'group');
    const mode = hasConfigLike ? 'generate' : (hasMedia ? 'media' : (canSelectMembers ? 'group' : 'layout'));

    state.selectionToolbar.dataset.count = String(count);
    state.selectionToolbar.dataset.mode = mode;
    state.selectionToolbar.dataset.types = String(typeSet.size);

    if (state.selectionCountLabel) {
      state.selectionCountLabel.textContent = count > 0 ? `已选${count}` : '已选0';
    }
    if (state.selectionHintLabel) {
      if (hasConfigLike) state.selectionHintLabel.textContent = count >= 2 ? '接线 / 生成 / 对齐 / 整理' : '接线 / 生成 / 整理';
      else if (hasMedia) state.selectionHintLabel.textContent = count >= 2 ? '分布 / 对齐 / 同尺寸 / 整理' : '复制 / 接线 / 同尺寸 / 整理';
      else if (count >= 3) state.selectionHintLabel.textContent = '对齐 / 均分 / 连接 / 分组';
      else state.selectionHintLabel.textContent = '对齐 / 连接 / 整理 / 分组';
    }

    state.selectionToolbar.querySelectorAll('[data-action="distribute-h"], [data-action="distribute-v"]').forEach(button => {
      button.disabled = count < 3;
      button.classList.toggle('is-disabled', count < 3);
    });
    state.selectionToolbar.querySelectorAll('[data-action^="align-"]').forEach(button => {
      button.disabled = count < 2;
      button.classList.toggle('is-disabled', count < 2);
    });
    state.selectionToolbar.querySelectorAll('[data-action="group-selected"]').forEach(button => {
      button.disabled = !canGroup;
      button.classList.toggle('is-disabled', !canGroup);
    });
    state.selectionToolbar.querySelectorAll('[data-action="ungroup-selected"]').forEach(button => {
      button.disabled = !canUngroup;
      button.classList.toggle('is-disabled', !canUngroup);
      button.hidden = !canUngroup;
    });
    state.selectionToolbar.querySelectorAll('[data-action="select-group-members"]').forEach(button => {
      button.disabled = !canSelectMembers;
      button.classList.toggle('is-disabled', !canSelectMembers);
      button.hidden = !canSelectMembers;
    });

    // Context emphasize primary actions.
    const recommended = new Set();
    if (hasConfigLike) {
      recommended.add('smart-wire-selected');
      recommended.add('generate-selected');
      recommended.add('tidy-selected');
      if (count >= 2) {
        recommended.add('align-left');
        recommended.add('align-center-h');
      }
    } else if (hasMedia) {
      recommended.add('smart-wire-selected');
      recommended.add('cycle-role-selected');
      recommended.add('match-size-selected');
      recommended.add('tidy-selected');
      if (count >= 2) {
        recommended.add('align-top');
        recommended.add('align-center-v');
      }
    } else {
      recommended.add('connect-selected');
      recommended.add('tidy-selected');
      recommended.add('group-selected');
      recommended.add('align-left');
      recommended.add('align-center-h');
      if (count >= 3) {
        recommended.add('distribute-h');
        recommended.add('distribute-v');
      }
    }
    state.selectionToolbar.querySelectorAll('[data-action]').forEach(button => {
      const action = button.getAttribute('data-action');
      button.classList.toggle('is-toolbar-recommended', recommended.has(action));
    });

    // Keep align/secondary rows available; promote align for multi-select discovery.
    const alignRow = state.selectionToolbar.querySelector('[data-toolbar-group="align"]');
    const secondaryRow = state.selectionToolbar.querySelector('[data-toolbar-group="secondary"]');
    if (alignRow) {
      alignRow.hidden = false;
      // Layout mode: primary + full size. Other modes: still visible, slightly denser.
      const promoteAlign = count >= 2;
      alignRow.classList.toggle('is-compact', !promoteAlign || (mode !== 'layout' && count < 3));
      alignRow.classList.toggle('is-secondary-row', mode !== 'layout' && count < 3);
      alignRow.classList.toggle('is-align-promoted', promoteAlign);
      const alignLabel = alignRow.querySelector('[data-role="align-row-label"]');
      if (alignLabel) {
        alignLabel.textContent = count >= 3 ? '对齐 / 均分' : '对齐';
        alignLabel.hidden = false;
      }
    }
    if (secondaryRow) {
      secondaryRow.hidden = false;
      secondaryRow.classList.toggle('is-compact', true);
    }

    // Float near the selected cluster so multi-select actions stay by the nodes (not only bottom dock).
    if (multiVisible) positionSelectionToolbar(state, nodes);
  }

  syncNodeQuickbar(state, { hideForDrag });
  syncEdgeQuickbar(state, { hideForDrag });
}

function positionSelectionToolbar(state, selectedNodes = []) {
  const toolbar = state.selectionToolbar;
  const stage = state.stage;
  if (!toolbar || !stage) return;
  const stageRect = stage.getBoundingClientRect?.();
  if (!stageRect || !stageRect.width || !stageRect.height) return;

  const nodes = (Array.isArray(selectedNodes) ? selectedNodes : [])
    .filter(node => node && !node.hidden);
  if (nodes.length < 2) {
    toolbar.classList.remove('is-floating');
    toolbar.dataset.placement = 'dock';
    toolbar.style.left = '';
    toolbar.style.top = '';
    toolbar.style.right = '';
    toolbar.style.bottom = '';
    toolbar.style.transform = '';
    return;
  }

  const bounds = computeNodeBounds(nodes);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

  const scale = Number(state.viewport?.scale) || 1;
  const vx = Number(state.viewport?.x) || 0;
  const vy = Number(state.viewport?.y) || 0;
  const pad = 10;
  const screen = {
    left: vx + bounds.minX * scale,
    top: vy + bounds.minY * scale,
    right: vx + bounds.maxX * scale,
    bottom: vy + bounds.maxY * scale,
    width: bounds.width * scale,
    height: bounds.height * scale
  };
  const centerX = screen.left + screen.width / 2;

  // Force layout so measured size is current before clamping.
  toolbar.classList.add('is-floating');
  toolbar.style.right = 'auto';
  toolbar.style.bottom = 'auto';
  toolbar.style.transform = 'none';

  const barWidth = Math.min(toolbar.offsetWidth || 520, stageRect.width - 16);
  const barHeight = toolbar.offsetHeight || 96;
  const margin = 10;
  const gap = 14;

  // Prefer below selection; flip above when near bottom chrome / timeline.
  const preferBelowTop = screen.bottom + gap;
  const preferAboveTop = screen.top - gap - barHeight;
  const bottomSafe = stageRect.height - barHeight - getStageFloatingBottomReserve(state);
  let placement = 'below';
  let top = preferBelowTop;
  if (preferBelowTop > bottomSafe && preferAboveTop >= margin) {
    placement = 'above';
    top = preferAboveTop;
  } else if (preferBelowTop > bottomSafe) {
    placement = 'clamp';
    top = bottomSafe;
  }
  top = Math.min(Math.max(margin, top), Math.max(margin, stageRect.height - barHeight - margin));

  let left = centerX - barWidth / 2;
  left = Math.min(Math.max(margin, left), Math.max(margin, stageRect.width - barWidth - margin));

  toolbar.dataset.placement = placement;
  toolbar.style.left = Math.round(left) + 'px';
  toolbar.style.top = Math.round(top) + 'px';
  toolbar.style.width = Math.round(barWidth) + 'px';

  // Expose measured offset so stage coach can dodge the floating chrome.
  state._selectionToolbarScreen = {
    left,
    top,
    width: barWidth,
    height: barHeight,
    placement
  };
}

function syncNodeQuickbar(state, options = {}) {
  if (!state.nodeQuickbar) return;
  const count = state.selectedNodeIds?.length || 0;
  const hideForDrag = options.hideForDrag ?? Boolean(state.boxState || state.panState || state.dragState || state.resizeState || state.rotateState || state.connectState || state.previewActive);
  const node = count === 1 ? getPrimarySelectedNode(state) : null;
  const visible = Boolean(node) && !hideForDrag;
  state.nodeQuickbar.hidden = !visible;
  if (!visible) return;

  const title = String(node.title || node.text || getNodeTypeLabel(node) || '未命名').replace(/\s+/g, ' ').trim();
  if (state.nodeQuickbarTitle) {
    state.nodeQuickbarTitle.textContent = title.length > 16 ? title.slice(0, 16) + '…' : title;
  }
  if (state.nodeQuickbarType) {
    state.nodeQuickbarType.textContent = getNodeTypeLabel(node);
  }

  const canGenerate = node.type === 'config' || node.type === 'loop' || node.type === 'llm';
  const recovery = canGenerate ? getGenerationFailureRecovery(state, node) : null;
  const canRetry = Boolean(recovery);
  const canWire = node.type === 'config' || node.type === 'media' || node.canvasRole === 'reference' || node.canvasRole === 'target';
  const canUngroup = node.type === 'group' || Boolean(node.groupId);
  const canSelectMembers = node.type === 'group';
  const canTimeline = node.type === 'media' || Boolean(node.clip);
  const isImage = node.type === 'media' && node.kind === 'image' && Boolean(node.resourceSrc || node.thumbnailSrc || node.posterSrc);
  const imageToolIds = new Set(state.imageQuickTools || DEFAULT_IMAGE_QUICK_TOOLS);
  const canRole = node.type === 'media' || node.type === 'config' || node.type === 'text' || node.type === 'note';
  const canRotate = node.type === 'media' || node.type === 'text' || node.type === 'note' || node.type === 'group';
  const mode = canRetry ? 'recover' : (canGenerate ? 'generate' : (node.type === 'media' ? 'media' : (node.type === 'group' ? 'group' : 'edit')));
  state.nodeQuickbar.dataset.mode = mode;
  state.nodeQuickbar.dataset.nodeType = node.type || '';

  const recommended = new Set();
  if (canRetry) {
    recovery.actions.slice(0, 3).forEach(item => {
      if (item.action === 'retry-generation') recommended.add('retry');
      if (item.action === 'open-inspector') recommended.add('inspect');
      if (item.action === 'smart-wire-selected') recommended.add('wire');
      if (item.action === 'generate-selected') recommended.add('generate');
    });
  } else if (canGenerate) {
    recommended.add('generate');
    recommended.add('wire');
    recommended.add('inspect');
  } else if (node.type === 'media') {
    if (isImage) {
      recommended.add('crop');
      recommended.add('angle');
    }
    if (node.canvasRole === 'target') {
      recommended.add('role');
      recommended.add('wire');
      recommended.add('inspect');
      recommended.add('duplicate');
    } else if (node.canvasRole === 'reference') {
      recommended.add('wire');
      recommended.add('role');
      recommended.add('inspect');
    } else {
      recommended.add('role');
      recommended.add('wire');
      recommended.add('timeline');
      recommended.add('inspect');
    }
  } else if (node.type === 'group') {
    recommended.add('members');
    recommended.add('fit');
    recommended.add('ungroup');
  } else {
    recommended.add('inspect');
    recommended.add('duplicate');
    recommended.add('connected');
  }

  state.nodeQuickbar.querySelectorAll('[data-quick]').forEach(button => {
    const kind = button.getAttribute('data-quick');
    let enabled = true;
    let hidden = false;
    if (DEFAULT_IMAGE_QUICK_TOOLS.includes(kind)) {
      enabled = isImage;
      hidden = !isImage || !imageToolIds.has(kind);
    } else if (kind === 'free-resize') {
      enabled = isImage;
      hidden = !isImage;
      button.textContent = node.freeResize ? '自由' : '等比';
      button.title = node.freeResize ? '当前可自由缩放，点击锁定图片比例' : '当前保持图片比例，点击切换自由缩放';
    } else if (kind === 'image-settings') {
      enabled = isImage;
      hidden = !isImage;
    } else if (kind === 'generate') {
      enabled = canGenerate && !canRetry;
      hidden = !canGenerate || canRetry;
    } else if (kind === 'retry') {
      enabled = canRetry;
      hidden = !canRetry;
      if (canRetry) {
        button.textContent = recovery?.needsHost ? '稍后重试' : '重试';
        button.title = recovery?.reason ? ('重试生成：' + recovery.reason) : '重试生成';
      }
    } else if (kind === 'wire') {
      enabled = canWire || canRetry;
      hidden = !(canWire || canGenerate || canRetry || node.type === 'media');
      if (canRetry) {
        button.title = recovery?.needsWire ? '智能接线（建议先补参考/结果）' : '检查接线';
      }
    } else if (kind === 'role') {
      enabled = canRole;
      hidden = !canRole || node.type === 'group';
      button.textContent = '角色:' + getCanvasRoleLabel(node.canvasRole);
      button.title = '切换角色 (R)：当前 ' + getCanvasRoleLabel(node.canvasRole);
    } else if (kind === 'timeline') {
      enabled = canTimeline;
      hidden = !canTimeline;
    } else if (kind === 'ungroup') {
      enabled = canUngroup;
      hidden = !canUngroup;
    } else if (kind === 'members') {
      enabled = canSelectMembers;
      hidden = !canSelectMembers;
    } else if (kind === 'rotate-left' || kind === 'rotate-right') {
      enabled = canRotate && !node.locked;
      hidden = node.type === 'config' || node.type === 'loop' || node.type === 'llm';
    } else if (kind === 'inspect' || kind === 'delete') {
      enabled = true;
      hidden = false;
    } else if (kind === 'connected' || kind === 'duplicate' || kind === 'focus' || kind === 'fit') {
      // Compact by default: only keep these when recommended for the current node context.
      enabled = true;
      hidden = !recommended.has(kind);
    }
    // For plain text/note, keep the bar compact: hide low-value extras.
    if ((node.type === 'text' || node.type === 'note') && (kind === 'wire' || kind === 'timeline' || kind === 'role')) {
      hidden = true;
    }
    // Generator nodes: keep only generate/wire/inspect (+retry) primary.
    if (canGenerate && (kind === 'rotate-left' || kind === 'rotate-right' || kind === 'timeline' || kind === 'role')) {
      hidden = true;
    }
    // Rotate is secondary chrome; hide unless no higher-priority recommendations remain sparse.
    if ((kind === 'rotate-left' || kind === 'rotate-right') && recommended.size >= 2) {
      hidden = true;
    }
    button.disabled = !enabled;
    button.classList.toggle('is-disabled', !enabled);
    button.classList.toggle('is-quick-recommended', recommended.has(kind) && !hidden && enabled);
    button.hidden = hidden;
  });
  state.nodeQuickbar.dataset.compact = '1';
  state.nodeQuickbar.classList.toggle('is-compact', true);

  // Position near the selected node in screen space.
  const stageRect = state.stage?.getBoundingClientRect?.();
  if (!stageRect) return;
  const scale = Number(state.viewport?.scale) || 1;
  const vx = Number(state.viewport?.x) || 0;
  const vy = Number(state.viewport?.y) || 0;
  const nodeWidth = Number(node.width) || 160;
  const nodeHeight = Number(node.height) || 96;
  const screenX = vx + ((Number(node.x) || 0) + nodeWidth / 2) * scale;
  const screenY = vy + ((Number(node.y) || 0) + nodeHeight) * scale + 12;
  const barWidth = state.nodeQuickbar.offsetWidth || 280;
  const barHeight = state.nodeQuickbar.offsetHeight || 72;
  const left = Math.min(Math.max(10, screenX - barWidth / 2), Math.max(10, stageRect.width - barWidth - 10));
  const bottomReserve = getStageFloatingBottomReserve(state);
  const top = Math.min(Math.max(10, screenY), Math.max(10, stageRect.height - barHeight - bottomReserve));
  state.nodeQuickbar.style.left = Math.round(left) + 'px';
  state.nodeQuickbar.style.top = Math.round(top) + 'px';
}

function buildEmptyInspectorGuidance(state) {
  const board = getBoardWorkflowSnapshot(state);
  const failed = getGenerationFailureRecovery(state, findActiveRunNode(state));
  const plan = resolveBoardNextStep(state, { forCoach: false, includeSelectionGate: false });
  const actions = [];
  let title = '未选中节点';
  let detail = '单击节点查看设置；框选多个节点可批量整理 / 接线 / 生成。';
  let tone = 'idle';
  let step = plan?.step || 'idle';

  if (failed) {
    tone = 'recover';
    step = 'recover-failure';
    title = '有生成失败待处理';
    detail = failed.hint || failed.reason || '可定位失败节点后改提示词、检查接线并重试。';
    (failed.actions || []).slice(0, 3).forEach(item => {
      actions.push({
        action: item.action,
        label: item.label,
        primary: Boolean(item.primary),
        emphasis: Boolean(item.primary)
      });
    });
    if (!actions.some(item => item.action === 'focus-running-node')) {
      actions.unshift({ action: 'focus-running-node', label: '定位失败节点', primary: true, emphasis: true });
    }
  } else if (plan?.step === 'add-config') {
    tone = 'workflow';
    step = 'add-config';
    title = '下一步：添加编排';
    detail = plan.detail || plan.hint || '媒体已就位，补生成规则后可接线生成。';
    actions.push(
      { action: 'new-config', label: '添加编排', primary: true, emphasis: true },
      { action: 'smart-wire-selected', label: '智能接线' },
      { action: 'import-media', label: '继续导入' }
    );
  } else if (plan?.step === 'smart-wire') {
    tone = 'workflow';
    step = 'smart-wire';
    title = '下一步：智能接线';
    detail = plan.detail || plan.hint || '把参考图 / 编排 / 结果图连起来，再执行生成。';
    actions.push(
      { action: 'smart-wire-selected', label: '智能接线', primary: true, emphasis: true },
      { action: 'generate-selected', label: '执行生成' },
      { action: 'fit-view', label: '适配全部' }
    );
  } else if (plan?.step === 'generate' || plan?.step === 'ready-generate') {
    tone = 'workflow';
    step = plan.step === 'ready-generate' ? 'ready-generate' : 'generate';
    title = '下一步：执行生成';
    detail = plan.detail || plan.hint || '接线完成后，选中编排节点按 G 或点执行生成。';
    actions.push(
      { action: 'generate-selected', label: '执行生成', primary: true, emphasis: true },
      { action: 'smart-wire-selected', label: '检查接线' },
      { action: 'fit-view', label: '适配全部' }
    );
  } else if (plan?.step === 'complete-config') {
    tone = 'workflow';
    step = 'complete-config';
    title = '下一步：完善编排';
    detail = plan.detail || plan.hint || '打开编排设置填写提示词，或先导入参考图再智能接线。';
    actions.push(
      { action: 'open-inspector', label: '完善设置', primary: true, emphasis: true },
      { action: 'smart-wire-selected', label: '智能接线' },
      { action: 'import-media', label: '补充素材' }
    );
  } else if (board?.isEmpty) {
    tone = 'empty';
    step = 'empty';
    title = '空画布';
    detail = '先导入图片或一键起步，再编排生成。';
    actions.push(
      { action: 'upload-local-images', label: '本地上传', primary: true, emphasis: true },
      { action: 'import-media', label: 'Studio 导入', emphasis: true },
      { action: 'start-quick-workflow', label: '一键起步' },
      { action: 'focus-node-search', label: '查找节点 /' }
    );
  } else {
    tone = 'idle';
    step = plan?.step || 'browse';
    title = board?.nodeCount ? ('画布 ' + board.nodeCount + ' 个节点') : '未选中节点';
    detail = plan?.hint || '单击节点查看设置；也可查找节点或继续导入素材。';
    actions.push(
      { action: 'focus-node-search', label: '查找节点 /' },
      { action: 'upload-local-images', label: '本地上传' },
      { action: 'import-media', label: 'Studio 导入' },
      { action: 'new-config', label: '添加编排' }
    );
  }

  const seen = new Set();
  const compactActions = [];
  for (const item of actions) {
    if (!item?.action || seen.has(item.action)) continue;
    seen.add(item.action);
    compactActions.push(item);
    if (compactActions.length >= 4) break;
  }

  return {
    title,
    detail,
    tone,
    step,
    board,
    plan,
    recovery: failed || null,
    actions: compactActions
  };
}

function renderEmptyInspectorGuidanceHtml(guidance) {
  const guide = guidance || { title: '未选中节点', detail: '', tone: 'idle', step: 'idle', actions: [] };
  const actionHtml = (guide.actions || []).map(item => {
    const cls = ['canvas-action-btn'];
    if (item.primary || item.emphasis) cls.push('is-primary');
    if (item.primary) cls.push('is-primary-action');
    return '<button type="button" class="' + cls.join(' ') + '" data-action="' + item.action + '">' + item.label + '</button>';
  }).join('');
  return [
    '<div class="canvas-inspector-empty-card" data-role="empty-inspector-guidance" data-tone="' + (guide.tone || 'idle') + '" data-step="' + (guide.step || 'idle') + '">',
    '<strong>' + (guide.title || '未选中节点') + '</strong>',
    '<p>' + (guide.detail || '') + '</p>',
    '<div class="canvas-inspector-empty-actions" data-role="empty-inspector-actions">',
    actionHtml,
    '</div>',
    '</div>'
  ].join('');
}

function syncInspector(state) {
  const count = state.selectedNodeIds?.length || 0;
  const node = count === 1 ? getPrimarySelectedNode(state) : null;
  if (!state.sidebarForm || !state.emptyInspector) return;

  const typeBadge = state.sidebarForm.querySelector('[data-role="inspector-type"]');
  const summaryTitle = state.sidebarForm.querySelector('[data-role="inspector-summary-title"]');
  const summaryMeta = state.sidebarForm.querySelector('[data-role="inspector-summary-meta"]');
  const generateQuickBtn = state.sidebarForm.querySelector('[data-role="inspector-quick-actions"] [data-quick="generate"]');

  if (!node) {
    const edgeInfo = count === 0 ? describeSelectedEdge(state) : null;
    state.sidebarForm.hidden = true;
    state.emptyInspector.hidden = false;
    if (typeBadge) typeBadge.hidden = true;

    if (edgeInfo) {
      state.emptyInspector.innerHTML = edgeInfo.html;
      if (state.inspectorTab) {
        setInspectorTabLabel(state, '连线', edgeInfo.title);
      } else {
        syncInspectorTabChrome(state);
      }
      return;
    }

    if (count > 1) {
      state.emptyInspector.innerHTML = `
        <div class="canvas-inspector-empty-card">
          <strong>已选中 ${count} 个节点</strong>
          <p>可批量设角色、整理布局、智能接线，或直接生成。</p>
          <div class="canvas-inspector-empty-actions canvas-inspector-role-actions" data-role="batch-role-actions">
            <button type="button" class="canvas-action-btn" data-action="set-role-selected" data-role-value="">角色：普通</button>
            <button type="button" class="canvas-action-btn" data-action="set-role-selected" data-role-value="reference">角色：参考</button>
            <button type="button" class="canvas-action-btn" data-action="set-role-selected" data-role-value="target">角色：结果</button>
            <button type="button" class="canvas-action-btn" data-action="cycle-role-selected">轮换角色</button>
          </div>
          <div class="canvas-inspector-empty-actions canvas-inspector-size-actions" data-role="batch-size-actions">
            <button type="button" class="canvas-action-btn" data-action="match-size-selected" title="以首个选中节点尺寸统一其余节点">统一尺寸</button>
            <button type="button" class="canvas-action-btn" data-action="set-size-selected" data-width="160" data-height="96">小</button>
            <button type="button" class="canvas-action-btn" data-action="set-size-selected" data-width="220" data-height="160">中卡</button>
            <button type="button" class="canvas-action-btn" data-action="set-size-selected" data-width="280" data-height="200">大卡</button>
          </div>
          <div class="canvas-inspector-batch-title" data-role="batch-title-actions">
            <label>
              <span>批量标题</span>
              <input type="text" data-role="batch-title-input" placeholder="例如：场景A / 角色参考 autocomplete="off" />
            </label>
            <div class="canvas-inspector-empty-actions">
              <button type="button" class="canvas-action-btn" data-action="set-title-selected">设为相同标题</button>
              <button type="button" class="canvas-action-btn" data-action="prefix-title-selected">添加前缀</button>
              <button type="button" class="canvas-action-btn" data-action="suffix-title-selected">添加后缀</button>
              <button type="button" class="canvas-action-btn" data-action="number-title-selected">顺序编号</button>
            </div>
          </div>
          <div class="canvas-inspector-empty-actions">
            <button type="button" class="canvas-action-btn" data-action="tidy-selected">网格整理</button>
            <button type="button" class="canvas-action-btn" data-action="smart-wire-selected">智能接线</button>
            <button type="button" class="canvas-action-btn" data-action="generate-selected">执行生成</button>
            <button type="button" class="canvas-action-btn" data-action="toggle-lock-selected">锁定/解锁</button>
            <button type="button" class="canvas-action-btn" data-action="select-connected">扩展相连</button>
            <button type="button" class="canvas-action-btn" data-action="fit-selection">适配所选</button>
            <button type="button" class="canvas-action-btn" data-action="group-selected">创建分组</button>
          </div>
        </div>
      `;
      if (state.inspectorTab) {
        setInspectorTabLabel(state, `已选${count}`, `已选中 ${count} 个节点 · Enter 打开`);
      } else {
        syncInspectorTabChrome(state);
      }
      return;
    }

    const emptyGuidance = buildEmptyInspectorGuidance(state);
    state.emptyInspector.innerHTML = renderEmptyInspectorGuidanceHtml(emptyGuidance);
    if (state.inspectorTab) {
      const tabLabel = emptyGuidance.tone === 'recover'
        ? '失败恢复'
        : (emptyGuidance.step === 'empty' ? '空画布' : (emptyGuidance.title || '节点设置'));
      setInspectorTabLabel(state, tabLabel.length > 8 ? tabLabel.slice(0, 8) : tabLabel, emptyGuidance.detail || emptyGuidance.title || '节点设置');
    } else {
      syncInspectorTabChrome(state);
    }
    return;
  }

  state.sidebarForm.hidden = false;
  state.emptyInspector.hidden = true;
  if (state.inspectorTab) {
    const shortTitle = abbreviateLabel(node.title || '节点设置', 8);
    setInspectorTabLabel(state, shortTitle, (node.title || '节点设置') + ' · Enter 打开设置');
  } else {
    syncInspectorTabChrome(state);
  }

  const typeLabel = resolveNodeTypeLabel(node.type) + (node.kind ? ` · ${node.kind}` : '');
  if (typeBadge) {
    typeBadge.textContent = typeLabel;
    typeBadge.hidden = false;
  }
  if (summaryTitle) summaryTitle.textContent = node.title || typeLabel || '未命名';
  if (summaryMeta) {
    const roleLabel = node.canvasRole === 'reference' ? '参考'
      : node.canvasRole === 'target' ? '结果'
        : node.canvasRole === 'reference-prompt' ? '参考提示'
          : '普通';
    const lockedLabel = node.locked ? ' · 锁定' : '';
    summaryMeta.textContent = `${typeLabel} · ${roleLabel}${lockedLabel}`;
  }
  if (generateQuickBtn) {
    const canGenerate = node.type === 'config' || node.type === 'loop' || node.type === 'llm';
    generateQuickBtn.hidden = !canGenerate;
    generateQuickBtn.disabled = !canGenerate;
  }

  setFormValue(state.sidebarForm, 'title', node.title || '');
  setFormValue(state.sidebarForm, 'text', node.text || '');
  setFormValue(state.sidebarForm, 'composerContent', node.composerContent || '');
  setFormValue(state.sidebarForm, 'x', node.x ?? 0);
  setFormValue(state.sidebarForm, 'y', node.y ?? 0);
  setFormValue(state.sidebarForm, 'width', node.width ?? 0);
  setFormValue(state.sidebarForm, 'height', node.height ?? 0);
  setFormValue(state.sidebarForm, 'rotation', node.rotation ?? 0);
  setFormValue(state.sidebarForm, 'canvasRole', node.canvasRole || '');
  setFormValue(state.sidebarForm, 'targetNodeId', node.targetNodeId || '');
  setFormValue(state.sidebarForm, 'model', node?.genConfig?.model || '');
  setFormValue(state.sidebarForm, 'aspect', node?.genConfig?.aspect || '');
  setFormValue(state.sidebarForm, 'resolution', node?.genConfig?.resolution || '');
  setFormValue(state.sidebarForm, 'quality', node?.genConfig?.quality || '');
  setFormValue(state.sidebarForm, 'count', node?.genConfig?.count || 1);

  const kindField = state.sidebarForm.querySelector('[name="kind"]');
  const textField = state.sidebarForm.querySelector('[name="text"]');
  const composerField = state.sidebarForm.querySelector('[name="composerContent"]');
  const trackField = state.sidebarForm.querySelector('[name="trackId"]');
  const targetField = state.sidebarForm.querySelector('[name="targetNodeId"]');
  const roleField = state.sidebarForm.querySelector('[name="canvasRole"]');
  const configOnlyFields = ['model', 'aspect', 'resolution', 'quality', 'count']
    .map(name => state.sidebarForm.querySelector(`[name="${name}"]`))
    .filter(Boolean);
  const mediaOnlyFields = ['trackId', 'durationSeconds', 'timelineStartSeconds', 'trimInSeconds', 'clipDurationSeconds']
    .map(name => state.sidebarForm.querySelector(`[name="${name}"]`))
    .filter(Boolean);

  if (kindField) {
    kindField.value = node.kind || 'image';
    kindField.closest('label').hidden = node.type !== 'media';
  }
  if (trackField) trackField.closest('label').hidden = node.type !== 'media';
  if (roleField) {
    roleField.closest('label').hidden = !(node.type === 'media' || node.type === 'config');
  }
  if (textField) textField.closest('label').hidden = node.type === 'media' || node.type === 'config' || node.type === 'group';
  if (textField && node.type === 'llm') { setFormValue(state.sidebarForm, 'text', node.llmInput || ''); }
  if (composerField) composerField.closest('label').hidden = node.type !== 'config';
  if (targetField) targetField.closest('label').hidden = node.type !== 'config';
  configOnlyFields.forEach(field => { field.closest('label') && (field.closest('label').hidden = node.type !== 'config'); });
  mediaOnlyFields.forEach(field => { field.closest('label') && (field.closest('label').hidden = node.type !== 'media'); });

  // Hide advanced sections that have no visible fields.
  state.sidebarForm.querySelectorAll('.canvas-inspector-advanced').forEach(section => {
    const labels = [...section.querySelectorAll('label')];
    const anyVisible = labels.some(label => !label.hidden);
    section.hidden = !anyVisible;
    if (anyVisible && node.type === 'config' && /生成参数/.test(section.querySelector('summary')?.textContent || '')) {
      section.open = true;
    }
  });

  if (node.type === 'media') {
    ensureCanvasMediaNodeClip(node);
    setFormValue(state.sidebarForm, 'trackId', node.clip.trackId || getPreferredTrackIdForKind(node.kind));
    setFormValue(state.sidebarForm, 'durationSeconds', ((node.durationMs || 0) / 1000).toFixed(1));
    setFormValue(state.sidebarForm, 'timelineStartSeconds', ((node.clip.startMs || 0) / 1000).toFixed(1));
    setFormValue(state.sidebarForm, 'trimInSeconds', ((node.clip.trimInMs || 0) / 1000).toFixed(1));
    setFormValue(state.sidebarForm, 'clipDurationSeconds', ((node.clip.durationMs || node.durationMs || 0) / 1000).toFixed(1));
  }
}

function abbreviateLabel(value, maxChars = 8) {
  const text = String(value || '').trim();
  if (!text) return '';
  const chars = [...text];
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join('')}…` : text;
}

function syncStageSize(state) {
  const editorElement = state.root.querySelector('.canvas-editor');
  const toolbarHeight = state.root.querySelector('.canvas-editor-toolbar')?.getBoundingClientRect?.().height || 0;
  const stageWidth = Math.max(editorElement?.clientWidth || state.root.clientWidth || 0, 480);
  const stageHeight = Math.max((editorElement?.clientHeight || 0) - toolbarHeight - 28, 420);
  state.viewportElement.style.width = `${stageWidth}px`;
  state.viewportElement.style.height = `${stageHeight}px`;
  state.edgeLayer.dataset.canvasWidth = String(stageWidth);
  state.edgeLayer.dataset.canvasHeight = String(stageHeight);
  state.nodeLayer.style.width = `${stageWidth}px`;
  state.nodeLayer.style.height = `${stageHeight}px`;
  if (state.miniMap) {
    state.miniMap.dataset.viewportWidth = String(stageWidth);
    state.miniMap.dataset.viewportHeight = String(stageHeight);
  }
}

function applyProjectPersistSnapshot(state) {
  if (!state?.project || state.projectIndex < 0) return false;
  state.project.viewport = { ...state.viewport };
  state.project.viewPrefs = {
    ...(state.project.viewPrefs || {}),
    timelineCollapsed: Boolean(state.timelineCollapsed),
    miniMapOpen: Boolean(state.miniMapOpen),
    sidebarCollapsed: Boolean(state.sidebarCollapsed),
    focusMode: Boolean(state.focusMode)
  };
  state.projects[state.projectIndex] = state.project;
  return true;
}

function getPersistDelayMs(state, options = {}) {
  if (Number.isFinite(Number(options.delayMs))) return Math.max(0, Number(options.delayMs));
  const nodeCount = Object.keys(state?.project?.nodes || {}).length;
  // Dense boards get a slightly longer coalesce window to avoid localStorage thrash.
  if (nodeCount >= 100) return 220;
  if (nodeCount >= 40) return 160;
  return 120;
}

function flushPersistProject(state, options = {}) {
  if (!state || state.destroyed && options.allowDestroyed !== true) return false;
  if (state._persistTimer) {
    try { clearTimeout(state._persistTimer); } catch {}
    state._persistTimer = null;
  }
  if (!applyProjectPersistSnapshot(state)) {
    state._persistDirty = false;
    state._persistPending = false;
    return false;
  }
  // Prefer a single write path:
  // - with onProjectChange (workspace host): host owns saveCanvasProjects
  // - without host callback: editor writes directly
  if (typeof state.onProjectChange === 'function') {
    state.onProjectChange(state.project, state.projects);
  } else {
    saveCanvasProjects(state.projects);
  }
  state._persistDirty = false;
  state._persistPending = false;
  state._persistLastFlushAt = Date.now();
  state._persistFlushCount = (Number(state._persistFlushCount) || 0) + 1;
  return true;
}

function schedulePersistProject(state, options = {}) {
  if (!state || state.destroyed) return false;
  if (!applyProjectPersistSnapshot(state)) return false;
  state._persistDirty = true;
  state._persistPending = true;
  state._persistScheduleCount = (Number(state._persistScheduleCount) || 0) + 1;
  if (state._persistTimer) {
    try { clearTimeout(state._persistTimer); } catch {}
  }
  const delayMs = getPersistDelayMs(state, options);
  state._persistTimer = setTimeout(() => {
    state._persistTimer = null;
    if (!state || state.destroyed) {
      state._persistPending = false;
      state._persistDirty = false;
      return;
    }
    flushPersistProject(state);
  }, delayMs);
  return true;
}

function persistProject(state, options = {}) {
  if (!state?.project || state.projectIndex < 0) return false;
  // Critical mutations (delete/import/generate/history) flush immediately so reload never loses them.
  if (options.immediate === true || options.flush === true) {
    state._persistScheduleCount = (Number(state._persistScheduleCount) || 0) + 1;
    return flushPersistProject(state, options);
  }
  return schedulePersistProject(state, options);
}

function getPersistStats(state) {
  if (!state) return null;
  return {
    dirty: state._persistDirty === true,
    pending: state._persistPending === true,
    scheduled: Number(state._persistScheduleCount) || 0,
    flushed: Number(state._persistFlushCount) || 0,
    lastFlushAt: Number(state._persistLastFlushAt) || 0,
    hasTimer: Boolean(state._persistTimer)
  };
}

function setSelectedNodes(state, ids, options = {}) {
  state.selectedNodeIds = dedupe((Array.isArray(ids) ? ids : []).filter(id => state.project?.nodes?.[id]));
  if (options.keepEdgeSelection !== true) {
    state.selectedEdgeId = '';
  }
  // v55: keep users on the actions/context panel by default.
  // Only jump to inspector when the caller explicitly requests it (Enter / double-click / open-inspector).
  if (options.openInspector === true && state.selectedNodeIds.length >= 1 && !state.dragState && !state.boxState && !state.connectState) {
    setSidebarTab(state, 'inspector');
  }
  if (options.persist) {
    persistProject(state);
  }
  if (options.rerender !== false) {
    const midGesture = Boolean(state.dragState || state.boxState || state.panState || state.connectState || state.pinchState);
    rerenderEditor(state, {
      skipPersist: true,
      forceFullChrome: options.forceFullChrome === true || !midGesture,
      reason: options.reason || 'selection'
    });
  } else {
    syncInspectorTabChrome(state);
    syncInspector(state);
  }
}

function syncPlayheadToSelectedNode(state) {
  const nodeId = state.selectedNodeIds[0];
  if (!nodeId) return;
  const node = state.project?.nodes?.[nodeId];
  if (!node || !node.clip || !Number.isFinite(node.clip.startMs)) return;
  setTimelineCurrentTime(state.project, node.clip.startMs);
}

function focusTimelineClip(state, nodeId) {
  const node = state.project?.nodes?.[nodeId];
  if (!node || !node.clip) return;
  setSelectedNodes(state, [nodeId], { rerender: true, persist: false });
  syncPlayheadToSelectedNode(state);
  persistProject(state);
  rerenderEditor(state, { skipPersist: true });
}

const EDGE_AUTO_PAN_MARGIN = 48;
const EDGE_AUTO_PAN_MAX_SPEED = 28;

function getStageVisibleRect(state) {
  const rect = state?.stage?.getBoundingClientRect?.();
  if (!rect || !rect.width || !rect.height) return null;
  // Auto-pan against the visible intersection so tall/overflowing stages still
  // react near the on-screen edges (not the off-screen element bounds).
  const viewLeft = 0;
  const viewTop = 0;
  const viewRight = Number(window.innerWidth) || rect.right;
  const viewBottom = Number(window.innerHeight) || rect.bottom;
  const left = Math.max(rect.left, viewLeft);
  const top = Math.max(rect.top, viewTop);
  const right = Math.min(rect.right, viewRight);
  const bottom = Math.min(rect.bottom, viewBottom);
  const width = right - left;
  const height = bottom - top;
  if (width <= 1 || height <= 1) return null;
  return { left, top, right, bottom, width, height };
}

function getEdgeAutoPanScreenDelta(state, clientX, clientY) {
  if (!state?.stage || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return { x: 0, y: 0, active: false };
  }
  const rect = getStageVisibleRect(state);
  if (!rect) return { x: 0, y: 0, active: false };
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  // Keep top/bottom and left/right zones from collapsing on short/narrow stages.
  const marginX = Math.max(8, Math.min(EDGE_AUTO_PAN_MARGIN, rect.width / 4));
  const marginY = Math.max(8, Math.min(EDGE_AUTO_PAN_MARGIN, rect.height / 4));
  let x = 0;
  let y = 0;
  if (localX < marginX) {
    const t = Math.max(0, Math.min(1, (marginX - localX) / marginX));
    x = EDGE_AUTO_PAN_MAX_SPEED * t;
  } else if (localX > rect.width - marginX) {
    const t = Math.max(0, Math.min(1, (localX - (rect.width - marginX)) / marginX));
    x = -EDGE_AUTO_PAN_MAX_SPEED * t;
  }
  if (localY < marginY) {
    const t = Math.max(0, Math.min(1, (marginY - localY) / marginY));
    y = EDGE_AUTO_PAN_MAX_SPEED * t;
  } else if (localY > rect.height - marginY) {
    const t = Math.max(0, Math.min(1, (localY - (rect.height - marginY)) / marginY));
    y = -EDGE_AUTO_PAN_MAX_SPEED * t;
  }
  return { x, y, active: Boolean(x || y) };
}

function applyViewportScreenPan(state, screenDeltaX = 0, screenDeltaY = 0) {
  if (!screenDeltaX && !screenDeltaY) return false;
  state.viewport = {
    ...state.viewport,
    x: (Number(state.viewport?.x) || 0) + screenDeltaX,
    y: (Number(state.viewport?.y) || 0) + screenDeltaY
  };
  return true;
}

function maybeApplyEdgeAutoPan(state, clientX, clientY, options = {}) {
  if (!state || state.destroyed) return { x: 0, y: 0, active: false };
  if (state.panState) return { x: 0, y: 0, active: false };
  const delta = getEdgeAutoPanScreenDelta(state, clientX, clientY);
  if (!delta.active) return delta;
  applyViewportScreenPan(state, delta.x, delta.y);
  const source = options.source || '';
  if (source === 'drag' && state.dragState) {
    // Keep world-space drag delta stable while the viewport pans under the cursor.
    const scale = state.viewport.scale || 1;
    state.dragState.autoPanAccumX = (state.dragState.autoPanAccumX || 0) - (delta.x / scale);
    state.dragState.autoPanAccumY = (state.dragState.autoPanAccumY || 0) - (delta.y / scale);
  } else if (source === 'box' && state.boxState) {
    // Preserve the original world start corner of the selection rectangle.
    state.boxState.autoPanAccumX = (state.boxState.autoPanAccumX || 0) + delta.x;
    state.boxState.autoPanAccumY = (state.boxState.autoPanAccumY || 0) + delta.y;
  }
  return delta;
}

function edgeAutoPanInteractionActive(state) {
  return Boolean(state?.dragState || state?.boxState || state?.connectState);
}

function ensureEdgeAutoPanLoop(state) {
  if (!state || state.destroyed || state._edgeAutoPanRaf) return;
  if (!edgeAutoPanInteractionActive(state)) return;
  const tick = () => {
    state._edgeAutoPanRaf = null;
    if (!state || state.destroyed || !edgeAutoPanInteractionActive(state)) return;
    if (state.dragState && Number.isFinite(state.dragState.lastClientX)) {
      updateDragState(state, null);
    } else if (state.boxState && Number.isFinite(state.boxState.lastClientX)) {
      updateBoxSelectionState(state, null);
    } else if (state.connectState && Number.isFinite(state.connectState.lastClientX)) {
      updateConnectionState(state, null);
    } else {
      return;
    }
    if (edgeAutoPanInteractionActive(state)) {
      state._edgeAutoPanRaf = requestAnimationFrame(tick);
    }
  };
  state._edgeAutoPanRaf = requestAnimationFrame(tick);
}

function stopEdgeAutoPanLoop(state) {
  if (!state) return;
  if (state._edgeAutoPanRaf) {
    try { cancelAnimationFrame(state._edgeAutoPanRaf); } catch {}
    state._edgeAutoPanRaf = null;
  }
}

function getStagePoint(state, event) {
  const rect = state.stage.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function getWorldPoint(state, point) {
  return {
    x: (Number(point?.x) - state.viewport.x) / state.viewport.scale,
    y: (Number(point?.y) - state.viewport.y) / state.viewport.scale
  };
}

function updateStatus(state, text, options = {}) {
  const tone = options.tone || '';
  const stickyMs = Number(options.stickyMs);
  const isSelectionSummary = options.selectionSummary === true;
  if (isSelectionSummary && state.statusStickyUntil && Date.now() < state.statusStickyUntil) {
    return;
  }
  if (state.statusLabel) {
    state.statusLabel.textContent = text;
    state.statusLabel.dataset.tone = tone || 'neutral';
    state.statusLabel.classList.toggle('is-running', tone === 'running');
    state.statusLabel.classList.toggle('is-success', tone === 'success');
    state.statusLabel.classList.toggle('is-error', tone === 'error');
    state.statusLabel.classList.toggle('is-sticky', !isSelectionSummary && ((Number.isFinite(stickyMs) && stickyMs > 0) || !Number.isFinite(stickyMs)));
  }
  state.statusSource = options.source || '';
  if (isSelectionSummary) {
    // selection summaries never extend sticky window
  } else if (Number.isFinite(stickyMs)) {
    state.statusStickyUntil = stickyMs > 0 ? Date.now() + stickyMs : 0;
  } else {
    // Keep action feedback visible long enough to read.
    state.statusStickyUntil = Date.now() + 1600;
  }
  if (tone === 'running' || tone === 'success' || tone === 'error') {
    state.runBannerDismissed = tone === 'running' ? false : state.runBannerDismissed;
    syncRunBanner(state);
  }
}

function syncZoomLabel(state) {
  if (!state) return;
  const pct = Math.round((Number(state.viewport?.scale) || 1) * 100);
  const total = Object.keys(state.project?.nodes || {}).length;
  const selected = state.selectedNodeIds?.length || 0;
  const edgeSelected = state.selectedEdgeId ? 1 : 0;
  const title = edgeSelected
    ? `缩放 ${pct}% · 已连线`
    : `缩放 ${pct}% · 节点 ${total}${selected ? ` · 已选${selected}` : ''}`;
  if (state.scaleLabel) {
    state.scaleLabel.textContent = pct + '%';
    state.scaleLabel.title = title;
  }
  if (state.stageNavZoom) {
    state.stageNavZoom.textContent = pct + '%';
    state.stageNavZoom.title = title + ' · 点击切换 50/100/150%';
  }
  if (state.stageNavMeta) {
    state.stageNavMeta.textContent = selected
      ? `${pct}% · ${selected}/${total}`
      : (total ? `${pct}% · ${total} 节点` : `${pct}%`);
    state.stageNavMeta.title = title;
  }
}

function buildContextActionButton(action, label, options = {}) {
  const emphasis = options.emphasis ? ' is-emphasis' : '';
  const primary = options.primary ? ' is-primary-action' : '';
  const attrs = options.attrs || '';
  return `<button type="button" class="canvas-action-btn${emphasis}${primary}" data-action="${action}" ${attrs}>${label}</button>`;
}

function syncContextActions(state) {
  if (!state?.contextCard) return;
  const count = state.selectedNodeIds?.length || 0;
  const edge = state.selectedEdgeId ? state.project?.edges?.[state.selectedEdgeId] : null;
  const nodes = (state.selectedNodeIds || []).map(id => state.project?.nodes?.[id]).filter(Boolean);
  const primary = count === 1 ? nodes[0] : null;

  const board = getBoardWorkflowSnapshot(state);
  let title = board.isEmpty ? '未选中节点' : (board.nodeCount ? ('画布 ' + board.nodeCount + ' 个节点') : '未选中节点');
  let meta = board.isEmpty ? '可框选 / 点击节点' : ('媒体 ' + board.mediaCount + ' · 编排 ' + board.configCount + ' · 连线 ' + board.edgeCount);
  let hint = '点「一键起步」，或 Studio 导入勾选图片；也可本地上传 / 拖图';
  let actions = [
    buildContextActionButton('upload-local-images', '本地上传', { emphasis: true }),
    buildContextActionButton('import-media', 'Studio 导入', { emphasis: true }),
    buildContextActionButton('start-quick-workflow', '一键起步'),
    buildContextActionButton('focus-node-search', '查找 /')
  ];

  // Highlight relevant static sections.
  state.actionPanel?.querySelectorAll?.('[data-action]').forEach(btn => {
    btn.classList.remove('is-context-recommended');
  });

  const recommend = (selectorList = []) => {
    selectorList.forEach(sel => {
      state.actionPanel?.querySelectorAll?.(sel).forEach(btn => btn.classList.add('is-context-recommended'));
    });
  };

  // Empty selection: single workflow plan drives context card + action panel recommendations.
  let emptyPlan = null;
  if (count === 0 && !edge) {
    emptyPlan = resolveBoardNextStep(state, { forCoach: false, includeSelectionGate: false });
    if (emptyPlan) {
      title = emptyPlan.title || title;
      meta = emptyPlan.meta || emptyPlan.detail || meta;
      hint = emptyPlan.hint || emptyPlan.detail || hint;
      if (Array.isArray(emptyPlan.actions) && emptyPlan.actions.length) {
        actions = emptyPlan.actions.map(item => buildContextActionButton(
          item.action,
          // Keep the longer config CTA in the sidebar card for clarity.
          item.action === 'new-config' ? '添加编排（生成规则）' : item.label,
          { primary: Boolean(item.primary), emphasis: Boolean(item.emphasis) }
        ));
      }
      if (Array.isArray(emptyPlan.recommend) && emptyPlan.recommend.length) {
        recommend(emptyPlan.recommend);
      }
    }
  }

  if (edge && count === 0) {
    const fromNode = state.project?.nodes?.[edge.fromNodeId];
    const toNode = state.project?.nodes?.[edge.toNodeId];
    const fromTitle = String(fromNode?.title || edge.fromNodeId || '起点').replace(/\s+/g, ' ').trim();
    const toTitle = String(toNode?.title || edge.toNodeId || '目标节点').replace(/\s+/g, ' ').trim();
    title = '已选中连线';
    meta = edge.label
      ? String(edge.label)
      : ((fromTitle.length > 10 ? fromTitle.slice(0, 10) + '…' : fromTitle) + ' →' + (toTitle.length > 10 ? toTitle.slice(0, 10) + '…' : toTitle));
    hint = '可反转方向、定位端点、选择两端节点，或删除该连线（R 反转 · Delete 删除）。';
    actions = [
      buildContextActionButton('reverse-selected-edge', '反转方向', { primary: true }),
      buildContextActionButton('focus-edge-source', '定位起点'),
      buildContextActionButton('focus-edge-target', '定位终点'),
      buildContextActionButton('select-edge-endpoints', '选中两端'),
      buildContextActionButton('delete-selected-edge', '删除连线')
    ];
    recommend(['[data-action="reverse-selected-edge"]', '[data-action="select-edge-endpoints"]']);
  } else if (count === 1 && primary) {
    const typeLabel = getNodeTypeLabel(primary);
    const roleLabel = getCanvasRoleLabel(primary.canvasRole);
    title = String(primary.title || primary.text || typeLabel || '未命名').replace(/\s+/g, ' ').trim();
    if (title.length > 18) title = title.slice(0, 18) + '…';
    meta = `${typeLabel} · ${roleLabel}${primary.locked ? ' · 锁定' : ''}`;
    if (primary.type === 'config' || primary.type === 'loop' || primary.type === 'llm') {
      const readiness = getGenerationReadiness(state, primary);
      const recovery = getGenerationFailureRecovery(state, primary);
      if (recovery) {
        meta = `${typeLabel} · 生成失败${primary.locked ? ' · 锁定' : ''}`;
        hint = recovery.hint || recovery.reason || '生成失败，可改提示词、检查接线后重试。';
        actions = recovery.actions.map(item => buildContextActionButton(item.action, item.label, { primary: Boolean(item.primary) }));
        if (!actions.some(html => html.includes('select-connected'))) {
          actions.push(buildContextActionButton('select-connected', '选中相连'));
        }
        recommend(recovery.actions.slice(0, 2).map(item => '[data-action="' + item.action + '"]'));
      } else {
        meta = `${typeLabel} · ${readiness.level === 'ready' ? '可生成' : (readiness.level === 'warn' ? '可生成（建议补齐）' : '待完善')}${primary.locked ? ' · 锁定' : ''}`;
        hint = readiness.hint || readiness.reason || '可直接生成；建议先智能接线。';
        actions = readiness.canGenerate
          ? [
              buildContextActionButton('generate-selected', '执行生成', { primary: true }),
              buildContextActionButton('smart-wire-selected', readiness.missing?.includes('reference') || readiness.missing?.includes('target') ? '先智能接线' : '智能接线'),
              buildContextActionButton('open-inspector', '打开设置'),
              buildContextActionButton('select-connected', '选中相连')
            ]
          : [
              buildContextActionButton('open-inspector', '完善设置', { primary: true }),
              buildContextActionButton('smart-wire-selected', '智能接线'),
              buildContextActionButton('upload-local-images', '补充素材'),
              buildContextActionButton('select-connected', '选中相连')
            ];
        if (readiness.canGenerate) recommend(['[data-action="generate-selected"]', '[data-action="smart-wire-selected"]']);
        else recommend(['[data-action="smart-wire-selected"]', '[data-action="open-inspector"]']);
      }
    } else if (primary.type === 'media') {
      hint = primary.canvasRole === 'target'
        ? '这是结果图节点：可定位、加入时间轴，或切换为参考图。'
        : '这是媒体节点：可设为参考/结果，并加入时间轴或智能接线。';
      actions = [
        buildContextActionButton('cycle-role-selected', '切换角色'),
        buildContextActionButton('add-selected-to-timeline', '进时间轴'),
        buildContextActionButton('smart-wire-selected', '智能接线'),
        buildContextActionButton('open-inspector', '打开设置')
      ];
      recommend(['[data-action="smart-wire-selected"]']);
    } else if (primary.type === 'group') {
      hint = '双击分组可选中全部成员；也可解散或整体适配。';
      actions = [
        buildContextActionButton('select-group-members', '选中组成员'),
        buildContextActionButton('ungroup-selected', '解散分组'),
        buildContextActionButton('fit-selection', '适配所选'),
        buildContextActionButton('open-inspector', '打开设置')
      ];
    } else {
      hint = '可编辑文本/便签内容，或复制后继续扩展画布。';
      actions = [
        buildContextActionButton('open-inspector', '打开设置'),
        buildContextActionButton('duplicate-selected', '复制'),
        buildContextActionButton('fit-selection', '适配所选'),
        buildContextActionButton('select-connected', '选中相连')
      ];
    }
  } else if (count > 1) {
    const types = new Set(nodes.map(node => node.type || 'note'));
    const unlocked = nodes.filter(node => !node.locked && node.type !== 'group');
    const hasConfigLike = nodes.some(node => node.type === 'config' || node.type === 'loop' || node.type === 'llm');
    const hasMedia = nodes.some(node => node.type === 'media');
    title = `已选中 ${count} 个节点`;
    meta = types.size === 1 ? `同类 · ${getNodeTypeLabel(nodes[0])}` : `含 ${types.size} 种类型`;
    if (!hasConfigLike && !hasMedia) {
      hint = count >= 3
        ? '可对齐/均分布局，再整理、分组或连线。'
        : '可对齐布局，再整理、分组或连线。';
      actions = [
        buildContextActionButton('align-left', '左对齐', { primary: true }),
        buildContextActionButton('align-center-h', '水平居中'),
        buildContextActionButton('align-top', '顶对齐'),
        ...(count >= 3
          ? [
              buildContextActionButton('distribute-h', '水平均分'),
              buildContextActionButton('distribute-v', '垂直均分')
            ]
          : []),
        buildContextActionButton('tidy-selected', '网格整理'),
        buildContextActionButton('match-size-selected', '统一尺寸'),
        buildContextActionButton('connect-selected', '按序连接'),
        buildContextActionButton('group-selected', '创建分组')
      ];
      recommend([
        '[data-action="align-left"]',
        '[data-action="align-center-h"]',
        count >= 3 ? '[data-action="distribute-h"]' : '[data-action="tidy-selected"]'
      ]);
    } else {
      hint = '可批量设角色/尺寸/标题，或整理后智能接线并生成。';
      actions = [
        buildContextActionButton('tidy-selected', '网格整理'),
        buildContextActionButton('smart-wire-selected', '智能接线'),
        buildContextActionButton('generate-selected', '执行生成', { primary: true }),
        buildContextActionButton('align-left', '左对齐'),
        buildContextActionButton('match-size-selected', '统一尺寸'),
        buildContextActionButton('group-selected', '创建分组'),
        buildContextActionButton('open-inspector', '批量设置')
      ];
      recommend(['[data-action="tidy-selected"]', '[data-action="smart-wire-selected"]', '[data-action="generate-selected"]', '[data-action="align-left"]']);
    }
    if (unlocked.length < 2) {
      // still ok
    }
  }

  if (state.contextTitle) state.contextTitle.textContent = title;
  if (state.contextMeta) state.contextMeta.textContent = meta;
  if (state.contextHint) state.contextHint.textContent = hint;
  if (state.contextActions) state.contextActions.innerHTML = actions.join('');
  const mode = edge && count === 0 ? 'edge' : (count > 1 ? 'multi' : (count === 1 ? 'single' : 'empty'));
  state.contextCard.dataset.mode = mode;
  if (count === 0 && !edge && emptyPlan) {
    state.contextCard.dataset.workflowStep = emptyPlan.step || '';
  } else if (count === 0 && !edge) {
    state.contextCard.dataset.workflowStep = board.isEmpty ? 'empty' : '';
  } else {
    state.contextCard.dataset.workflowStep = '';
  }
  syncActionPanelSections(state, {
    mode,
    count,
    primary,
    nodes,
    edge
  });
}

function resolveActionPanelMode(state, options = {}) {
  if (options.mode) return options.mode;
  const count = options.count ?? (state.selectedNodeIds?.length || 0);
  const edge = options.edge ?? (state.selectedEdgeId ? state.project?.edges?.[state.selectedEdgeId] : null);
  if (edge && count === 0) return 'edge';
  if (count > 1) return 'multi';
  if (count === 1) return 'single';
  return 'empty';
}

function setActionSectionState(el, { hidden = false, priority = false, secondary = false } = {}) {
  if (!el) return;
  el.hidden = Boolean(hidden);
  el.classList.toggle('is-context-priority', Boolean(priority) && !hidden);
  el.classList.toggle('is-context-secondary', Boolean(secondary) && !hidden);
  el.dataset.contextState = hidden ? 'hidden' : (priority ? 'priority' : (secondary ? 'secondary' : 'normal'));
}

function syncActionPanelSections(state, options = {}) {
  if (!state?.actionPanel) return;
  const count = options.count ?? (state.selectedNodeIds?.length || 0);
  const primary = options.primary ?? (count === 1 ? state.project?.nodes?.[state.selectedNodeIds[0]] : null);
  const edge = options.edge ?? (state.selectedEdgeId ? state.project?.edges?.[state.selectedEdgeId] : null);
  const mode = resolveActionPanelMode(state, { mode: options.mode, count, edge });
  const nodeCount = getProjectNodeList(state.project).filter(node => !node.hidden).length;
  const isEmptyBoard = nodeCount === 0;
  const boardSnap = getBoardWorkflowSnapshot(state);
  const canGenerate = primary && (primary.type === 'config' || primary.type === 'loop' || primary.type === 'llm');
  const isMedia = primary?.type === 'media';
  const isGroup = primary?.type === 'group';

  state.actionPanel.dataset.mode = mode;
  state.actionPanel.dataset.nodeCount = String(nodeCount);
  state.actionPanel.dataset.selectionCount = String(count);
  state.actionPanel.dataset.primaryType = primary?.type || (edge ? 'edge' : '');

  const guide = state.actionGuide || state.actionPanel.querySelector('[data-section="guide"]');
  const importSection = state.actionPanel.querySelector('[data-section="import"]');
  const executeSection = state.actionPanel.querySelector('[data-section="execute"]');
  const addSection = state.actionPanel.querySelector('[data-section="add"]');
  const moreNodes = state.actionPanel.querySelector('[data-section="more-nodes"]');
  const searchSection = state.actionPanel.querySelector('[data-section="search"]');
  const viewSection = state.actionPanel.querySelector('[data-section="view"]');
  const selectedOps = state.selectedOpsEl || state.actionPanel.querySelector('[data-section="selected-ops"]');
  const selectedSummary = state.selectedOpsSummary || selectedOps?.querySelector?.('[data-role="selected-ops-summary"]');
  const importMeta = state.actionPanel.querySelector('[data-role="section-import-meta"]');
  const executeMeta = state.actionPanel.querySelector('[data-role="section-execute-meta"]');
  const addMeta = state.actionPanel.querySelector('[data-role="section-add-meta"]');
  const hintEl = state.actionHint || state.actionPanel.querySelector('[data-role="action-hint"]');

  const showGuide = isEmptyBoard || (mode === 'empty' && nodeCount < 3 && !boardSnap.hasConfig);
  setActionSectionState(guide, { hidden: !showGuide, priority: showGuide && isEmptyBoard });

  // Shared empty-selection workflow plan keeps action panel aligned with context card / stage coach.
  const emptyPlan = (mode === 'empty')
    ? resolveBoardNextStep(state, { forCoach: false, includeSelectionGate: false })
    : null;
  const prefer = emptyPlan?.panel?.prefer || 'none';
  state.actionPanel.dataset.workflowStep = emptyPlan?.step || (mode === 'empty' && isEmptyBoard ? 'empty' : '');

  if (mode === 'empty') {
    const preferImport = prefer === 'import' || isEmptyBoard;
    const preferAdd = prefer === 'add';
    const preferExecute = prefer === 'execute';
    setActionSectionState(importSection, {
      priority: preferImport,
      secondary: !preferImport
    });
    if (importMeta) importMeta.textContent = emptyPlan?.panel?.importMeta || (isEmptyBoard ? '从这里开始' : '继续导入');

    setActionSectionState(executeSection, {
      priority: preferExecute,
      secondary: !preferExecute
    });
    if (executeMeta) executeMeta.textContent = emptyPlan?.panel?.executeMeta || (isEmptyBoard ? '有节点后可用' : '选中后可用');

    setActionSectionState(addSection, {
      priority: preferAdd,
      secondary: !preferAdd && !isEmptyBoard
    });
    setActionSectionState(moreNodes, { secondary: true });
    if (addMeta) addMeta.textContent = emptyPlan?.panel?.addMeta || (isEmptyBoard ? '或手动添加' : '常用');
  } else {
    setActionSectionState(importSection, { secondary: true });
    if (importMeta) importMeta.textContent = '补充素材';

    if (canGenerate || mode === 'multi' || mode === 'edge' || isMedia) {
      setActionSectionState(executeSection, { priority: true });
      if (executeMeta) {
        executeMeta.textContent = canGenerate
          ? '可直接生成'
          : (mode === 'multi' ? '批量处理' : (mode === 'edge' ? '连线相关' : '可接线 / 整理'));
      }
    } else {
      setActionSectionState(executeSection, { priority: false, secondary: false });
      if (executeMeta) executeMeta.textContent = '选中后可用';
    }

    if (mode === 'single' || mode === 'multi' || mode === 'edge') {
      setActionSectionState(addSection, { secondary: true });
      setActionSectionState(moreNodes, { secondary: true });
      if (addMeta) addMeta.textContent = '扩展画布';
    } else {
      setActionSectionState(addSection, {});
      setActionSectionState(moreNodes, {});
      if (addMeta) addMeta.textContent = '常用';
    }
  }

  setActionSectionState(searchSection, { priority: nodeCount >= 12 && mode === 'empty' });
  setActionSectionState(viewSection, { secondary: mode !== 'empty' });

  if (selectedOps) {
    const showSelectedOps = count >= 1 || Boolean(edge);
    setActionSectionState(selectedOps, {
      hidden: !showSelectedOps && isEmptyBoard,
      priority: count >= 2,
      secondary: count === 1
    });
    if (showSelectedOps) {
      if (count >= 2) selectedOps.open = true;
      else if (mode === 'empty') selectedOps.open = false;
    } else {
      selectedOps.open = false;
    }
    if (selectedSummary) {
      selectedSummary.textContent = count >= 2
        ? ('已选操作（' + count + '）')
        : (count === 1 ? '当前节点操作' : (edge ? '连线操作' : '已选操作'));
    }
  }

  if (hintEl) {
    if (mode === 'empty') {
      if (emptyPlan?.hint) {
        hintEl.textContent = emptyPlan.hint;
      } else if (isEmptyBoard) {
        hintEl.textContent = '先导入图片或点「一键起步」；也可拖图到画布中央 / Ctrl+V 粘贴';
      } else {
        hintEl.textContent = '点击节点查看情境操作；多选后可批量设角色/尺寸/标题。';
      }
    } else if (canGenerate) {
      hintEl.textContent = '建议：智能接线 → 执行生成（快捷键 G）；Enter 打开详细设置。';
    } else if (isMedia) {
      hintEl.textContent = '可切换角色、加入时间轴，或与编排节点智能接线。';
    } else if (isGroup) {
      hintEl.textContent = '双击分组可选中成员；也可解散或整体适配。';
    } else if (mode === 'multi') {
      hintEl.textContent = '可整理布局、统一尺寸/标题，再智能接线或生成。';
    } else if (mode === 'edge') {
      hintEl.textContent = '可定位端点、选中两端，或删除该连线。';
    } else {
      hintEl.textContent = 'Enter 打开设置；G 生成；/ 查找；T 时间轴；M 小地图。';
    }
  }
}


function getInspectorTabLabelEl(state) {
  if (!state?.inspectorTab) return null;
  return state.inspectorTab.querySelector?.('[data-role="inspector-tab-label"]') || state.inspectorTab;
}

function getInspectorTabBadgeEl(state) {
  if (!state?.inspectorTab) return null;
  let badge = state.inspectorTab.querySelector?.('[data-role="inspector-tab-badge"]');
  if (!badge && state.inspectorTab) {
    badge = document.createElement('span');
    badge.className = 'canvas-inspector-tab-badge';
    badge.setAttribute('data-role', 'inspector-tab-badge');
    badge.hidden = true;
    state.inspectorTab.appendChild(badge);
  }
  return badge;
}

function setInspectorTabLabel(state, label, title) {
  if (!state?.inspectorTab) return;
  const labelEl = getInspectorTabLabelEl(state);
  if (labelEl) labelEl.textContent = label;
  if (title != null) state.inspectorTab.title = title;
  syncInspectorTabChrome(state);
}

function syncInspectorTabChrome(state) {
  if (!state?.inspectorTab) return;
  const count = state.selectedNodeIds?.length || 0;
  const hasEdge = Boolean(state.selectedEdgeId && state.project?.edges?.[state.selectedEdgeId]);
  const hasSelection = count > 0 || hasEdge;
  state.inspectorTab.dataset.hasSelection = hasSelection ? 'true' : 'false';
  state.inspectorTab.dataset.count = String(count);
  state.inspectorTab.dataset.mode = hasEdge && count === 0
    ? 'edge'
    : (count > 1 ? 'multi' : (count === 1 ? 'single' : 'empty'));
  const badge = getInspectorTabBadgeEl(state);
  if (!badge) return;
  if (count > 0) {
    badge.hidden = false;
    badge.textContent = count > 99 ? '99+' : String(count);
  } else if (hasEdge) {
    badge.hidden = false;
    badge.textContent = '线';
  } else {
    badge.hidden = true;
    badge.textContent = '';
  }
}

function shouldKeepCanvasChromeQuiet(state) {
  return Boolean(state?.focusMode || state?.sidebarCollapsed);
}

function openNodeEditorChrome(state, nodeId = '', options = {}) {
  const quiet = options.forceExpand === true ? false : shouldKeepCanvasChromeQuiet(state);
  if (quiet) {
    // Keep the stage uncluttered: rely on selection + quickbar / Enter to open settings later.
    if (nodeId) setSelectedNodes(state, [nodeId], { rerender: options.rerender !== false, persist: false, openInspector: false });
    if (options.status) updateStatus(state, options.status, { stickyMs: options.stickyMs || 1600 });
    return { opened: false, quiet: true };
  }
  if (nodeId) setSelectedNodes(state, [nodeId], { rerender: options.rerender !== false, persist: false, openInspector: false });
  openInspectorForSelection(state);
  if (options.focusField) {
    queueMicrotask(() => {
      const preferred = state.sidebarForm?.querySelector?.(options.focusField)
        || state.sidebarForm?.querySelector?.('[name="text"]')
        || state.sidebarForm?.querySelector?.('[name="title"]')
        || state.sidebarForm?.querySelector?.('[name="composerContent"]');
      preferred?.focus?.();
      if (preferred && typeof preferred.select === 'function' && preferred.tagName === 'INPUT') preferred.select();
    });
  }
  if (options.status) updateStatus(state, options.status, { stickyMs: options.stickyMs || 1400 });
  return { opened: true, quiet: false };
}

function openInspectorForSelection(state, options = {}) {
  // Expand sidebar before focusing inspector so Enter / 设置 remain usable when collapsed.
  // Callers that want quiet canvas (focus mode / collapsed sidebar) should use openNodeEditorChrome.
  if (state.sidebarCollapsed) {
    setSidebarCollapsed(state, false, { persist: true });
  }
  setSidebarTab(state, 'inspector');
  if ((state.selectedNodeIds || []).length === 1) {
    queueMicrotask(() => {
      const preferred = state.sidebarForm?.querySelector?.('[name="title"]')
        || state.sidebarForm?.querySelector?.('[name="composerContent"]')
        || state.sidebarForm?.querySelector?.('[name="text"]');
      preferred?.focus?.();
    });
  }
  if (options.silent === true) return;
  // Keep sticky error/running guidance visible when generation just blocked.
  const stickyActive = state.statusStickyUntil && Date.now() < state.statusStickyUntil;
  const stickyTone = state.statusLabel?.dataset?.tone || '';
  if (stickyActive && (stickyTone === 'error' || stickyTone === 'running' || stickyTone === 'success')) return;
  const count = state.selectedNodeIds?.length || 0;
  if (!count && state.selectedEdgeId) updateStatus(state, '已打弢连线设置');
  else if (count > 1) updateStatus(state, '已打开批量设置（' + count + '）');
  else updateStatus(state, '已打弢节点设置');
}

function syncSelectionStatus(state) {
  if (!state || state.boxState) return;
  if (state.selectedEdgeId) {
    const info = describeSelectedEdge(state);
    updateStatus(state, info?.status || '已选中连线', { selectionSummary: true });
    return;
  }
  const selectedCount = state.selectedNodeIds?.length || 0;
  const total = Object.keys(state.project?.nodes || {}).length;
  const edgeCount = Object.keys(state.project?.edges || {}).length;
  if (!selectedCount) {
    // Prefer workflow next-step copy so empty selection always points to action.
    try {
      const plan = resolveBoardNextStep(state, { forCoach: false, includeSelectionGate: false });
      if (plan?.step && plan.step !== 'empty' && plan.step !== 'selected' && plan.step !== 'browse') {
        const short = String(plan.title || plan.detail || '').replace(/^下一步[：: ]\s*/, '') || plan.step;
        updateStatus(state, `节点 ${total} · ${short}`, { selectionSummary: true });
        return;
      }
      if (plan?.step === 'browse') {
        updateStatus(state, `节点 ${total} · 连线 ${edgeCount} · 点击节点继续`, { selectionSummary: true });
        return;
      }
    } catch {}
    updateStatus(state, total > 0
      ? `节点 ${total} · 连线 ${edgeCount}`
      : '空画布 · 导入素材或一键起步', { selectionSummary: true });
    return;
  }
  if (selectedCount === 1) {
    const node = getPrimarySelectedNode(state);
    const typeLabel = getNodeTypeLabel(node);
    const generateHint = (node?.type === 'config' || node?.type === 'loop' || node?.type === 'llm') ? ' · G 生成' : '';
    const connected = collectConnectedNodeIds(state.project, [node?.id].filter(Boolean), { includeSeeds: false }).length;
    const linkHint = connected > 0 ? ` · 相连 ${connected}` : '';
    updateStatus(state, `已选 ${typeLabel}${linkHint}${generateHint}`, { selectionSummary: true });
    return;
  }
  updateStatus(state, `已选 ${selectedCount} 个节点 · 底部批量操作`, { selectionSummary: true });
}

function getProjectNodeList(project) {
  if (!project?.nodes) return [];
  return Object.values(project.nodes).filter(Boolean);
}

function getPrimarySelectedNode(state) {
  if (!state.selectedNodeIds.length) return null;
  return state.project?.nodes?.[state.selectedNodeIds[0]] || null;
}

function getNodeTypeLabel(node) {
  if (!node) return '节点';
  if (node.type === 'config') return '编排节点（生成规则）';
  if (node.type === 'media') return node.kind === 'video' ? '视频节点' : node.kind === 'audio' ? '音频节点' : '图片节点';
  if (node.type === 'text') return '文本节点';
  if (node.type === 'note') return '便签';
  if (node.type === 'loop') return '循环节点';
  if (node.type === 'llm') return '智能文本';
  if (node.type === 'group') return '分组';
  return '节点';
}

function focusSelectedNode(state) {
  const node = getPrimarySelectedNode(state);
  if (!node?.id) {
    updateStatus(state, '请先选择一个节点');
    return;
  }
  focusNodeInView(state, node.id, { flash: true });
  updateStatus(state, '已定位到所选节点');
}

function collectConnectedNodeIds(project, seedIds = [], options = {}) {
  const seeds = [...new Set((Array.isArray(seedIds) ? seedIds : []).map(id => String(id || '')).filter(Boolean))];
  if (!seeds.length) return [];
  const includeSeeds = options.includeSeeds !== false;
  const nodes = project?.nodes && typeof project.nodes === 'object' ? project.nodes : {};
  const edges = project?.edges && typeof project.edges === 'object' ? Object.values(project.edges) : [];
  const seedSet = new Set(seeds);
  const connected = new Set(includeSeeds ? seeds : []);
  edges.forEach(edge => {
    const fromId = String(edge?.fromNodeId || '');
    const toId = String(edge?.toNodeId || '');
    if (!fromId || !toId) return;
    if (seedSet.has(fromId) && nodes[toId] && !nodes[toId].hidden) connected.add(toId);
    if (seedSet.has(toId) && nodes[fromId] && !nodes[fromId].hidden) connected.add(fromId);
  });
  return [...connected];
}

function getSelectedEdgeEndpoints(state) {
  const edge = state.project?.edges?.[state.selectedEdgeId];
  if (!edge) return { fromNodeId: '', toNodeId: '', ids: [] };
  const ids = [edge.fromNodeId, edge.toNodeId]
    .map(id => String(id || ''))
    .filter(id => id && state.project?.nodes?.[id]);
  return {
    fromNodeId: edge.fromNodeId || '',
    toNodeId: edge.toNodeId || '',
    ids: [...new Set(ids)]
  };
}

function focusSelectedEdgeEndpoint(state, which = 'from') {
  const edge = state.project?.edges?.[state.selectedEdgeId];
  if (!edge) {
    updateStatus(state, '请先选择一条连线');
    return '';
  }
  const nodeId = which === 'to' ? edge.toNodeId : edge.fromNodeId;
  if (!nodeId || !state.project?.nodes?.[nodeId]) {
    updateStatus(state, '连线端点不存在');
    return '';
  }
  focusNodeInView(state, nodeId, { flash: true, select: false });
  updateStatus(state, which === 'to' ? '已定位到连线终点' : '已定位到连线起点');
  return nodeId;
}

function selectSelectedEdgeEndpoints(state) {
  const { ids } = getSelectedEdgeEndpoints(state);
  if (!ids.length) {
    updateStatus(state, '连线端点不存在');
    return [];
  }
  state.selectedEdgeId = '';
  setSelectedNodes(state, ids, { rerender: true, persist: false });
  if (ids[0]) focusNodeInView(state, ids[0], { flash: true, select: false });
  updateStatus(state, `已选中连线两端 ${ids.length} 个节点`);
  return ids;
}

function selectConnectedNodes(state, options = {}) {
  const seedIds = Array.isArray(options.seedIds) && options.seedIds.length
    ? options.seedIds
    : [...(state.selectedNodeIds || [])];
  if (!seedIds.length) {
    updateStatus(state, '请先选择一个节点');
    return [];
  }
  const connectedIds = collectConnectedNodeIds(state.project, seedIds, { includeSeeds: options.includeSeeds !== false });
  if (!connectedIds.length) {
    updateStatus(state, '没有找到相连节点');
    return [];
  }
  setSelectedNodes(state, connectedIds, { rerender: true, persist: false });
  const added = connectedIds.filter(id => !seedIds.includes(id)).length;
  if (options.fit !== false && connectedIds.length > 1) {
    // soft-focus: keep selection readable without forcing fit when already dense
    const primary = connectedIds.find(id => !seedIds.includes(id)) || connectedIds[0];
    if (primary) focusNodeInView(state, primary, { flash: true, select: false });
  }
  updateStatus(state, added > 0 ? `已扩展选中 ${added} 个相连节点（共 ${connectedIds.length}）` : `已选中 ${connectedIds.length} 个节点（无额外相连）`);
  return connectedIds;
}

function openSelectedInspector(state) {
  if (!state.selectedNodeIds.length && !state.selectedEdgeId) {
    updateStatus(state, '请先选择一个节点');
    return;
  }
  openInspectorForSelection(state);
}

const CANVAS_ROLE_CYCLE = ['', 'reference', 'target'];

function getCanvasRoleLabel(role) {
  if (role === 'reference') return '参考';
  if (role === 'target') return '结果';
  if (role === 'reference-prompt') return '参考提示词';
  return '普通';
}

function cycleSelectedNodeRole(state) {
  const nodes = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(Boolean);
  if (!nodes.length) {
    updateStatus(state, '请先选择一个节点');
    return;
  }
  pushHistory(state);
  let nextLabel = '';
  nodes.forEach(node => {
    const current = String(node.canvasRole || '');
    const idx = CANVAS_ROLE_CYCLE.indexOf(current);
    const next = CANVAS_ROLE_CYCLE[(idx >= 0 ? idx + 1 : 0) % CANVAS_ROLE_CYCLE.length];
    node.canvasRole = next;
    upsertCanvasNode(state.project, node);
    nextLabel = getCanvasRoleLabel(next);
  });
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, nodes.length > 1
    ? `已为 ${nodes.length} 个节点轮换角色（末项为 ${nextLabel}）`
    : `已切换角色：${nextLabel}`);
}

function readBatchTitleInput(state) {
  const input = state.emptyInspector?.querySelector?.('[data-role="batch-title-input"]');
  return String(input?.value || '').trim();
}

function setSelectedNodesTitle(state, title, options = {}) {
  const nodes = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(Boolean);
  if (!nodes.length) {
    updateStatus(state, '请先选择节点');
    return 0;
  }
  const nextTitle = String(title || '').trim();
  if (!nextTitle) {
    updateStatus(state, '请输入批量标题');
    return 0;
  }
  if (options.pushHistory !== false) pushHistory(state);
  nodes.forEach((node, index) => {
    if (options.mode === 'prefix') node.title = `${nextTitle}${node.title || ''}`;
    else if (options.mode === 'suffix') node.title = `${node.title || ''}${nextTitle}`;
    else if (options.mode === 'number') node.title = `${nextTitle}${index + 1}`;
    else node.title = nextTitle;
    upsertCanvasNode(state.project, node);
  });
  persistProject(state);
  rerenderEditor(state);
  const modeLabel = options.mode === 'prefix' ? '前缀' : options.mode === 'suffix' ? '后缀' : options.mode === 'number' ? '编号' : '标题';
  updateStatus(state, `已批量更新 ${nodes.length} 个节点${modeLabel}`);
  return nodes.length;
}

function setSelectedNodesSize(state, width, height, options = {}) {
  const nodes = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(node => node && !node.locked && node.type !== 'group');
  if (!nodes.length) {
    updateStatus(state, '请选择未锁定的非分组节点再设置尺寸');
    return 0;
  }
  const nextW = Math.max(80, Math.round(Number(width) || 0));
  const nextH = Math.max(60, Math.round(Number(height) || 0));
  if (!Number.isFinite(nextW) || !Number.isFinite(nextH) || nextW <= 0 || nextH <= 0) {
    updateStatus(state, '尺寸无效');
    return 0;
  }
  if (options.pushHistory !== false) pushHistory(state);
  nodes.forEach(node => {
    node.width = nextW;
    node.height = nextH;
    upsertCanvasNode(state.project, node);
  });
  // keep group frames coherent if members resized
  const touchedGroups = new Set(nodes.map(node => node.groupId).filter(Boolean));
  touchedGroups.forEach(groupId => {
    try { fitGroupBoundsToMembers(state, groupId, { padding: 36 }); } catch {}
  });
  persistProject(state);
  rerenderEditor(state);
  if (options.silent !== true) {
    updateStatus(state, `已为 ${nodes.length} 个节点设置${nextW}×${nextH}`);
  }
  return nodes.length;
}

function matchSelectedNodesSize(state, options = {}) {
  const nodes = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(node => node && !node.locked && node.type !== 'group');
  if (nodes.length < 2) {
    updateStatus(state, '至少选中 2 个未锁定非分组节点才能统丢尺寸');
    return 0;
  }
  const source = nodes[0];
  const count = setSelectedNodesSize(state, source.width || 160, source.height || 96, {
    ...options,
    silent: true
  });
  if (count) {
    updateStatus(state, `已按「${source.title || '首个节点'}」统一 ${count} 个节点尺寸`);
  }
  return count;
}

function setSelectedNodesRole(state, role = '') {
  const nodes = (state.selectedNodeIds || [])
    .map(id => state.project?.nodes?.[id])
    .filter(Boolean);
  if (!nodes.length) {
    updateStatus(state, '请先选择节点再设置角色');
    return 0;
  }
  const nextRole = role === 'reference' || role === 'target' ? role : '';
  pushHistory(state);
  nodes.forEach(node => {
    node.canvasRole = nextRole;
    upsertCanvasNode(state.project, node);
  });
  persistProject(state);
  rerenderEditor(state);
  updateStatus(state, `已为 ${nodes.length} 个节点设置${getCanvasRoleLabel(nextRole)}`);
  return nodes.length;
}

function getNodeSearchStatus(node) {
  return String(node?.generationStatus || node?.loopStatus || node?.llmStatus || '').trim().toLowerCase();
}

function getNodeSearchFilter(state) {
  const value = String(state?.nodeSearchFilter || 'all').toLowerCase();
  return ['all', 'media', 'config', 'text', 'group', 'locked', 'running', 'error'].includes(value) ? value : 'all';
}

function nodeMatchesSearchFilter(node, filter = 'all') {
  if (!node) return false;
  const mode = String(filter || 'all').toLowerCase();
  if (mode === 'all') return true;
  if (mode === 'media') return node.type === 'media';
  if (mode === 'config') return node.type === 'config' || node.type === 'loop' || node.type === 'llm';
  if (mode === 'text') return node.type === 'text' || node.type === 'note';
  if (mode === 'group') return node.type === 'group';
  if (mode === 'locked') return Boolean(node.locked);
  if (mode === 'running') {
    const status = getNodeSearchStatus(node);
    return status === 'running' || status === 'queued';
  }
  if (mode === 'error') {
    const status = getNodeSearchStatus(node);
    return status === 'error' || Boolean(node.generationError);
  }
  return true;
}

function buildNodeSearchHaystack(node) {
  const status = getNodeSearchStatus(node);
  return [
    node?.title,
    node?.text,
    node?.type,
    node?.kind,
    node?.canvasRole,
    getNodeTypeLabel(node),
    getCanvasRoleLabel(node?.canvasRole),
    status,
    node?.locked ? 'locked lock 锁定' : '',
    status === 'running' || status === 'queued' ? 'running queued 生成中' : '',
    status === 'error' || node?.generationError ? 'error fail 异常' : '',
    node?.type === 'config' ? '编排 配置 prompt' : '',
    node?.type === 'media' ? '媒体 图片 视频 音频' : '',
    node?.type === 'group' ? '分组 group' : ''
  ].join(' ').toLowerCase();
}

function collectNodeSearchMatches(state, query = '', filter = 'all') {
  const q = String(query || '').trim().toLowerCase();
  const mode = String(filter || 'all').toLowerCase();
  return getProjectNodeList(state.project)
    .filter(node => node && !node.hidden)
    .filter(node => nodeMatchesSearchFilter(node, mode))
    .filter(node => {
      if (!q) return mode !== 'all'; // filter chips can list without query
      return buildNodeSearchHaystack(node).includes(q);
    })
    .slice(0, 12);
}

function getNodeSearchSurfaces(state) {
  return {
    sidebarInput: state?.nodeSearchInput || null,
    sidebarResults: state?.nodeSearchResults || null,
    sidebarFilters: state?.nodeSearchFiltersEl || null,
    stageRoot: state?.stageSearchEl || null,
    stageInput: state?.stageSearchInput || null,
    stageResults: state?.stageSearchResults || null,
    stageFilters: state?.stageSearchFiltersEl || null
  };
}

function syncNodeSearchFilterButtons(state) {
  const active = getNodeSearchFilter(state);
  const surfaces = getNodeSearchSurfaces(state);
  [surfaces.sidebarFilters, surfaces.stageFilters].forEach(group => {
    if (!group) return;
    group.querySelectorAll('[data-search-filter]').forEach(button => {
      const value = button.getAttribute('data-search-filter') || 'all';
      const isActive = value === active;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  });
}

function setNodeSearchFilter(state, filter = 'all') {
  state.nodeSearchFilter = ['all', 'media', 'config', 'text', 'group', 'locked', 'running', 'error'].includes(String(filter || '').toLowerCase())
    ? String(filter).toLowerCase()
    : 'all';
  syncNodeSearchFilterButtons(state);
  renderNodeSearchResults(state, state.nodeSearchQuery || state.nodeSearchInput?.value || state.stageSearchInput?.value || '');
  const labelMap = {
    all: '全部',
    media: '媒体',
    config: '编排',
    text: '文本',
    group: '分组',
    locked: '锁定',
    running: '生成中',
    error: '异常'
  };
  updateStatus(state, '查找筛选：' + (labelMap[state.nodeSearchFilter] || '全部'));
}

function setStageSearchOpen(state, open = true) {
  state.stageSearchOpen = Boolean(open);
  if (state.stageSearchEl) {
    state.stageSearchEl.hidden = !state.stageSearchOpen;
    state.stageSearchEl.classList.toggle('is-open', state.stageSearchOpen);
  }
  if (!state.stageSearchOpen) state.nodeSearchActiveIndex = -1;
}

function clearNodeSearch(state, options = {}) {
  state.nodeSearchQuery = '';
  state.nodeSearchActiveIndex = -1;
  if (state.nodeSearchInput) state.nodeSearchInput.value = '';
  if (state.stageSearchInput) state.stageSearchInput.value = '';
  if (!options.keepFilter) {
    state.nodeSearchFilter = 'all';
    syncNodeSearchFilterButtons(state);
  }
  if (state.nodeSearchResults) {
    state.nodeSearchResults.hidden = true;
    state.nodeSearchResults.innerHTML = '';
  }
  if (state.stageSearchResults) {
    state.stageSearchResults.hidden = true;
    state.stageSearchResults.innerHTML = '';
  }
  if (options.closeStage !== false) setStageSearchOpen(state, false);
}

function buildNodeSearchResultMarkup(matches = [], activeIndex = -1) {
  return matches.map((node, index) => {
    const title = String(node.title || node.text || getNodeTypeLabel(node) || '未命名').replace(/</g, '&lt;');
    const status = getNodeSearchStatus(node);
    const statusLabel = status ? (' · ' + status) : '';
    const lockLabel = node.locked ? ' · 锁定' : '';
    const meta = getNodeTypeLabel(node) + ' · ' + getCanvasRoleLabel(node.canvasRole) + lockLabel + statusLabel;
    const activeClass = index === activeIndex ? ' is-active' : '';
    return '<button type="button" class="canvas-node-search-item' + activeClass + '" data-node-search-id="' + node.id + '" data-search-index="' + index + '"><strong>' + title + '</strong><span>' + meta + '</span></button>';
  }).join('');
}

function syncNodeSearchActiveItem(state) {
  const surfaces = getNodeSearchSurfaces(state);
  const index = Number(state.nodeSearchActiveIndex);
  [surfaces.sidebarResults, surfaces.stageResults].forEach(list => {
    if (!list) return;
    list.querySelectorAll('[data-node-search-id]').forEach((item, itemIndex) => {
      const active = itemIndex === index;
      item.classList.toggle('is-active', active);
      if (active) {
        try { item.scrollIntoView({ block: 'nearest' }); } catch {}
      }
    });
  });
}

function moveNodeSearchActive(state, delta = 1) {
  const list = (state.stageSearchOpen && state.stageSearchResults) || state.nodeSearchResults;
  if (!list) return;
  const items = [...list.querySelectorAll('[data-node-search-id]')];
  if (!items.length) return;
  const current = Number.isInteger(state.nodeSearchActiveIndex) ? state.nodeSearchActiveIndex : -1;
  const next = current < 0
    ? (delta > 0 ? 0 : items.length - 1)
    : (current + delta + items.length) % items.length;
  state.nodeSearchActiveIndex = next;
  syncNodeSearchActiveItem(state);
}

function focusNodeSearch(state, options = {}) {
  const surfaces = getNodeSearchSurfaces(state);
  if (!surfaces.sidebarInput && !surfaces.stageInput) {
    updateStatus(state, '当前画布没有查找结果');
    return false;
  }
  if (state.shortcutsOpen) setShortcutPanelOpen(state, false);
  if (state.onboardingEl && !state.onboardingEl.hidden) {
    dismissCanvasOnboarding(state, { persist: true, silent: true });
  }

  const preferStage = options.forceStage === true
    || options.surface === 'stage'
    || Boolean(state.sidebarCollapsed)
    || (options.forceSidebar !== true && state.stageSearchOpen);

  if (preferStage && surfaces.stageInput) {
    setStageSearchOpen(state, true);
    if (surfaces.sidebarInput && state.nodeSearchQuery && !surfaces.stageInput.value) {
      surfaces.stageInput.value = state.nodeSearchQuery;
    }
    const input = surfaces.stageInput;
    input.focus();
    if (options.selectAll) {
      try { input.select(); } catch {}
    }
    renderNodeSearchResults(state, input.value || state.nodeSearchQuery || '');
    updateStatus(state, '舞台查找：↑↓ 选择，Enter 定位，Esc 关闭');
    return true;
  }

  if (state.sidebarCollapsed) setSidebarCollapsed(state, false, { persist: false });
  setSidebarTab(state, 'actions');
  setStageSearchOpen(state, false);
  const input = surfaces.sidebarInput;
  if (!input) return focusNodeSearch(state, { ...options, forceStage: true });
  input.focus();
  if (options.selectAll) {
    try { input.select(); } catch {}
  }
  renderNodeSearchResults(state, input.value || state.nodeSearchQuery || '');
  updateStatus(state, '查找节点：输入关键字，或点筛选标签');
  return true;
}

function renderNodeSearchResults(state, query) {
  const surfaces = getNodeSearchSurfaces(state);
  const q = String(query ?? state.nodeSearchQuery ?? surfaces.sidebarInput?.value ?? surfaces.stageInput?.value ?? '').trim();
  state.nodeSearchQuery = q;
  if (query != null) {
    if (surfaces.sidebarInput && surfaces.sidebarInput.value !== q) surfaces.sidebarInput.value = q;
    if (surfaces.stageInput && surfaces.stageInput.value !== q) surfaces.stageInput.value = q;
  } else if (surfaces.sidebarInput && surfaces.stageInput) {
    if (document.activeElement === surfaces.sidebarInput && surfaces.stageInput.value !== surfaces.sidebarInput.value) {
      surfaces.stageInput.value = surfaces.sidebarInput.value;
    } else if (document.activeElement === surfaces.stageInput && surfaces.sidebarInput.value !== surfaces.stageInput.value) {
      surfaces.sidebarInput.value = surfaces.stageInput.value;
    }
  }

  const filter = getNodeSearchFilter(state);
  const matches = collectNodeSearchMatches(state, q, filter);
  const shouldShow = Boolean(q || filter !== 'all');
  const activeIndex = shouldShow && matches.length
    ? Math.min(Math.max(Number(state.nodeSearchActiveIndex) || 0, 0), matches.length - 1)
    : -1;
  state.nodeSearchActiveIndex = activeIndex;

  const emptyHtml = shouldShow
    ? ('<div class="canvas-node-search-empty">没有匹配节点' + (filter === 'all' ? '' : ('（筛选：' + filter + '）')) + '</div>')
    : '';
  const listHtml = matches.length ? buildNodeSearchResultMarkup(matches, activeIndex) : emptyHtml;

  [surfaces.sidebarResults, surfaces.stageResults].forEach(list => {
    if (!list) return;
    if (!shouldShow) {
      list.hidden = true;
      list.innerHTML = '';
      return;
    }
    list.hidden = false;
    list.innerHTML = listHtml;
  });
  return matches;
}

function focusNodeFromSearch(state, nodeId, options = {}) {
  if (!nodeId || !state.project?.nodes?.[nodeId]) return;
  setSelectedNodes(state, [nodeId], { rerender: true, persist: false, openInspector: options.openInspector === true });
  focusNodeInView(state, nodeId, { flash: true });
  if (state.nodeSearchInput) state.nodeSearchInput.blur();
  if (state.stageSearchInput) state.stageSearchInput.blur();
  if (options.closeSearch !== false) setStageSearchOpen(state, false);
  updateStatus(state, '已定位搜索节点 · Enter 打开设置');
}

function setFormValue(form, name, value) {
  const input = form.querySelector(`[name="${name}"]`);
  if (input) input.value = value != null ? String(value) : '';
}

function getTimelineTailMsByTrack(project) {
  const tail = new Map();
  const clips = getProjectTimelineClips(project);
  clips.forEach(clip => {
    const tailMs = tail.get(clip.trackId) || 0;
    tail.set(clip.trackId, Math.max(tailMs, clip.clip.startMs + clip.clip.durationMs));
  });
  return tail;
}

function formatDurationLabel(ms) {
  return formatDuration(Number(ms) || 0);
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dedupe(values) {
  return [...new Set(values)];
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function resolveNodeTypeLabel(type) {
  const labels = {
    note: '便签',
    text: '文本',
    config: '编排',
    loop: '循环',
    llm: '智能文本',
    media: '媒体',
    group: '分组'
  };
  return labels[type] || type;
}

function togglePlayback(state) {
  const timeline = ensureCanvasProjectTimeline(state.project);
  const willPlay = !timeline.isPlaying;
  setTimelinePlaybackState(state.project, { isPlaying: willPlay });
  state.playbackLastTickMs = 0;
  syncPlaybackLoop(state);
  persistProject(state);
  rerenderEditor(state, { skipPersist: true });
  updateStatus(state, willPlay ? '正在播放' : '已暂停');
}

function stopPlayback(state) {
  const timeline = ensureCanvasProjectTimeline(state.project);
  setTimelinePlaybackState(state.project, { isPlaying: false });
  timeline.currentTimeMs = 0;
  state.playbackLastTickMs = 0;
  syncPlaybackLoop(state);
  persistProject(state);
  rerenderEditor(state, { skipPersist: true });
  updateStatus(state, '已重置播放');
}

function syncPlaybackLoop(state) {
  const timeline = ensureCanvasProjectTimeline(state.project);
  if (timeline.isPlaying && !state.playbackFrameId) {
    state.playbackFrameId = requestAnimationFrame(ts => playbackTick(state, ts));
  } else if (!timeline.isPlaying && state.playbackFrameId) {
    cancelAnimationFrame(state.playbackFrameId);
    state.playbackFrameId = null;
  }
}

function playbackTick(state, timestamp) {
  const timeline = ensureCanvasProjectTimeline(state.project);
  if (!timeline.isPlaying) {
    state.playbackFrameId = null;
    return;
  }

  if (!state.playbackLastTickMs) state.playbackLastTickMs = timestamp;
  const deltaMs = (timestamp - state.playbackLastTickMs) * (timeline.playbackRate || 1);
  state.playbackLastTickMs = timestamp;

  const maxMs = getTimelineDurationMs(state.project);
  let nextTime = timeline.currentTimeMs + deltaMs;
  if (nextTime >= maxMs) {
    nextTime = maxMs;
    setTimelinePlaybackState(state.project, { isPlaying: false });
  }
  setTimelineCurrentTime(state.project, Math.round(nextTime));

  rerenderEditor(state, { skipPersist: true });
  state.playbackFrameId = null;
  syncPlaybackLoop(state);
}


function normalizeInteractionMode(mode = 'pan') {
  const value = String(mode || 'pan').toLowerCase();
  if (value === 'select' || value === 'pan' || value === 'connect') return value;
  return 'pan';
}

function buildModeHudModel(state) {
  const mode = normalizeInteractionMode(state.interactionMode || 'pan');
  const selectedCount = state.selectedNodeIds?.length || 0;
  const hasEdge = Boolean(state.selectedEdgeId);
  const focusMode = Boolean(state.focusMode);
  const quiet = shouldKeepCanvasChromeQuiet(state);
  const connectSource = Boolean(state.clickConnectFromId || state.connectState?.fromNodeId);
  let title = '选择模式';
  let pill = '选择';
  let meta = '左拖平移 · Ctrl/Cmd 拖动框选 · F 适配';
  let tone = 'select';
  const actions = [];
  const flags = [];

  if (mode === 'connect') {
    title = connectSource ? '连线中' : '连线模式';
    pill = '连线';
    meta = connectSource ? '再点目标节点 · Esc 取消' : '先点源节点，再点目标 · Esc/V 退出';
    tone = 'connect';
    actions.push({ action: 'cancel-connect-mode', label: '退出连线' });
  } else if (mode === 'pan') {
    title = '平移模式';
    pill = '平移';
    meta = '拖动画布 · 滚轮缩放 · V 回选择';
    tone = 'pan';
    actions.push({ action: 'set-tool-select', label: '回选择 (V)' });
  } else {
    if (selectedCount > 1) {
      meta = '已选 ' + selectedCount + ' · 可整理 / 接线 / 生成';
      actions.push({ action: 'smart-wire-selected', label: '智能接线' });
      actions.push({ action: 'generate-selected', label: '执行生成' });
    } else if (selectedCount === 1) {
      const node = getPrimarySelectedNode(state);
      const label = String(node?.title || node?.text || resolveNodeTypeLabel(node?.type) || '节点').replace(/\s+/g, ' ').trim();
      meta = (label.length > 16 ? label.slice(0, 16) + '…' : label) + ' · Enter 设置 · G 生成';
      actions.push({ action: 'open-inspector', label: '设置' });
      if (node && (node.type === 'config' || node.type === 'loop' || node.type === 'llm')) {
        actions.push({ action: 'generate-selected', label: '生成' });
      } else {
        actions.push({ action: 'fit-selection', label: '适配' });
      }
    } else if (hasEdge) {
      meta = '已选连线 · R 反转 · Delete 删除';
      actions.push({ action: 'reverse-selected-edge', label: '反转' });
      actions.push({ action: 'focus-edge-source', label: '起点' });
    } else {
      const plan = resolveBoardNextStep(state, { forCoach: false, includeSelectionGate: false });
      meta = plan?.hint || plan?.detail || '空选中 · / 查找 · G 生成';
      if (plan?.step === 'add-config') actions.push({ action: 'new-config', label: '添加编排' });
      else if (plan?.step === 'smart-wire') actions.push({ action: 'smart-wire-selected', label: '智能接线' });
      else if (plan?.step === 'generate' || plan?.step === 'ready-generate') actions.push({ action: 'generate-selected', label: '执行生成' });
      else if (plan?.step === 'recover-failure') actions.push({ action: 'focus-running-node', label: '定位失败' });
      else if (plan?.step === 'empty') actions.push({ action: 'start-quick-workflow', label: '一键起步' });
      else actions.push({ action: 'focus-node-search', label: '查找 /' });
    }
    actions.push({ action: 'set-tool-connect', label: '连线 (C)' });
  }

  if (focusMode) flags.push({ key: 'focus', label: '专注' });
  if (quiet && !focusMode) flags.push({ key: 'quiet', label: '侧栏收起' });
  if (selectedCount > 0) flags.push({ key: 'selection', label: '已选 ' + selectedCount });
  else if (hasEdge) flags.push({ key: 'edge', label: '连线' });

  const seen = new Set();
  const compact = [];
  for (const item of actions) {
    if (!item?.action || seen.has(item.action)) continue;
    seen.add(item.action);
    compact.push(item);
    if (compact.length >= 3) break;
  }

  return {
    mode,
    tone,
    title,
    pill,
    meta,
    focusMode,
    quiet,
    selectedCount,
    hasEdge,
    connectSource,
    flags,
    actions: compact
  };
}

function syncModeHud(state) {
  if (!state?.modeHudEl) return null;
  const model = buildModeHudModel(state);
  const hideForOverlays = Boolean(
    state.previewActive
    || (state.modalOverlay && !state.modalOverlay.hidden)
    || (state.connectTipEl && !state.connectTipEl.hidden)
    || (state.resultToast && !state.resultToast.hidden)
    || (state.runBanner && !state.runBanner.hidden && state.runBanner.dataset?.tone === 'running')
  );
  state.modeHudEl.hidden = hideForOverlays;
  state.modeHudEl.dataset.mode = model.mode || 'pan';
  state.modeHudEl.dataset.tone = model.tone || 'pan';
  state.modeHudEl.dataset.focus = model.focusMode ? '1' : '0';
  state.modeHudEl.dataset.quiet = model.quiet ? '1' : '0';
  state.modeHudEl.dataset.hasSelection = (model.selectedCount > 0 || model.hasEdge) ? '1' : '0';
  state.modeHudEl.dataset.connectSource = model.connectSource ? '1' : '0';
  state.modeHudEl.classList.toggle('is-focus', Boolean(model.focusMode));
  state.modeHudEl.classList.toggle('is-connect', model.mode === 'connect');
  state.modeHudEl.classList.toggle('is-pan', model.mode === 'pan');
  if (state.modeHudMode) state.modeHudMode.textContent = model.pill;
  if (state.modeHudTitle) state.modeHudTitle.textContent = model.title;
  if (state.modeHudMeta) state.modeHudMeta.textContent = model.meta;
  if (state.modeHudFlags) {
    if (!model.flags.length) {
      state.modeHudFlags.hidden = true;
      state.modeHudFlags.innerHTML = '';
    } else {
      state.modeHudFlags.hidden = false;
      state.modeHudFlags.innerHTML = model.flags.map(flag => (
        '<span class="canvas-mode-hud-flag" data-flag="' + flag.key + '">' + flag.label + '</span>'
      )).join('');
    }
  }
  if (state.modeHudActions) {
    state.modeHudActions.innerHTML = model.actions.map(item => (
      '<button type="button" class="canvas-mode-hud-btn" data-action="' + item.action + '">' + item.label + '</button>'
    )).join('');
  }
  return model;
}

function syncConnectTip(state) {
  if (!state?.connectTipEl) return;
  const connectMode = state.interactionMode === 'connect' || Boolean(state.clickConnectFromId) || Boolean(state.connectState?.clickPreview);
  const hideForOverlays = Boolean(
    state.previewActive
    || (state.modalOverlay && !state.modalOverlay.hidden)
    || (state.resultToast && !state.resultToast.hidden)
    || (state.runBanner && !state.runBanner.hidden && state.runBanner.dataset?.tone === 'running')
  );
  const visible = connectMode && !hideForOverlays;
  state.connectTipEl.hidden = !visible;
  state.connectTipEl.classList.toggle('is-visible', visible);
  state.connectTipEl.classList.toggle('has-source', Boolean(state.clickConnectFromId));
  const sourceId = state.clickConnectFromId || state.connectState?.fromNodeId || '';
  const sourceNode = sourceId ? state.project?.nodes?.[sourceId] : null;
  const sourceTitle = String(sourceNode?.title || sourceNode?.text || '').replace(/\s+/g, ' ').trim();
  if (state.connectTipTitle) {
    state.connectTipTitle.textContent = sourceId ? '已选源节点' : '连线模式';
  }
  if (state.connectTipDetail) {
    state.connectTipDetail.textContent = sourceId
      ? (`源：${sourceTitle ? (sourceTitle.length > 18 ? sourceTitle.slice(0, 18) + '…' : sourceTitle) : '节点'} · 再点目标完成 · Esc 取消`)
      : '先点源节点，再点目标节点 · Esc/V 退出';
  }
}

function setInteractionMode(state, mode = 'pan') {
  const next = normalizeInteractionMode(mode);
  // Leaving connect mode cancels pending click-to-connect source.
  if (state.interactionMode === 'connect' && next !== 'connect') {
    clearClickConnectSource(state, { silent: true });
  }
  state.interactionMode = next;
  state.toolButtons?.forEach(button => {
    const active = button.dataset.tool === state.interactionMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const editorShell = state.root?.querySelector?.('.canvas-editor') || state.root;
  editorShell?.classList?.toggle('is-connect-mode', state.interactionMode === 'connect');
  state.stage?.classList?.toggle('is-connect-mode', state.interactionMode === 'connect');
  if (state.interactionMode !== 'connect') {
    state.stage?.classList?.toggle('has-click-connect-source', false);
    editorShell?.classList?.toggle('has-click-connect-source', false);
  }
  syncStageCursor(state);
  if (state.interactionHint) {
    if (state.interactionMode === 'pan') {
      state.interactionHint.textContent = '平移：拖动画布 · 滚轮缩放 · Shift+滚轮平移 · V 回选择';
    } else if (state.interactionMode === 'connect') {
      state.interactionHint.textContent = '连线：先点源节点，再点目标 · Esc 取消 · V 回选择';
    } else {
      state.interactionHint.textContent = '空白左拖平移 · Ctrl/Cmd 拖动框选 · 滚轮缩放 · F适配 · C连线';
    }
  }
  // Keep a changed tool's feedback coherent without clobbering generation/error feedback.
  const stickyActive = state.statusStickyUntil && Date.now() < state.statusStickyUntil;
  if (!stickyActive || state.statusSource === 'interaction-mode') {
    const label = state.interactionMode === 'pan'
      ? '平移模式'
      : (state.interactionMode === 'connect' ? '连线模式：先点源节点，再点目标节点' : '选择模式');
    updateStatus(state, label, { stickyMs: 1200, source: 'interaction-mode' });
  }
  try { syncConnectTip(state); } catch {}
  try { syncModeHud(state); } catch {}
}

function setShortcutPanelOpen(state, open = false) {
  state.shortcutsOpen = Boolean(open);
  if (state.shortcutPanel) {
    state.shortcutPanel.hidden = !state.shortcutsOpen;
  }
  state.root?.querySelectorAll?.('[data-action="toggle-shortcuts"]').forEach(button => {
    button.classList.toggle('is-active', state.shortcutsOpen);
    button.setAttribute('aria-pressed', state.shortcutsOpen ? 'true' : 'false');
  });
  if (state.shortcutsOpen) {
    updateStatus(state, '快捷键面板已打开（Esc 关闭）');
  }
}

const CANVAS_ONBOARDING_KEY = 'image_app:canvas_onboarding_dismissed_v1';

function isCanvasOnboardingDismissed() {
  try {
    return globalThis.localStorage?.getItem(CANVAS_ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

function maybeShowCanvasOnboarding(state) {
  if (!state?.onboardingEl) return;
  if (state.onboardingDismissed || isCanvasOnboardingDismissed()) {
    state.onboardingEl.hidden = true;
    return;
  }
  const nodeCount = getProjectNodeList(state.project).filter(node => !node.hidden).length;
  // Keep first-run guidance for empty boards; skip for already-populated projects.
  if (nodeCount > 0) {
    state.onboardingEl.hidden = true;
    return;
  }
  state.onboardingEl.hidden = false;
  updateStatus(state, '空画布：可本地上传、拖图或示例填入后开始');
}

function dismissCanvasOnboarding(state, options = {}) {
  state.onboardingDismissed = true;
  if (state.onboardingEl) state.onboardingEl.hidden = true;
  if (options.persist) {
    try { globalThis.localStorage?.setItem(CANVAS_ONBOARDING_KEY, '1'); } catch {}
  }
  if (options.silent !== true) {
    updateStatus(state, '已关闭上手提示');
  }
}

function cloneViewportSnapshot(viewport = {}) {
  return {
    x: Number(viewport?.x) || 0,
    y: Number(viewport?.y) || 0,
    scale: Number(viewport?.scale) > 0 ? Number(viewport.scale) : 1
  };
}

function viewportSnapshotsEqual(a, b, epsilon = 0.75) {
  if (!a || !b) return false;
  return Math.abs((Number(a.x) || 0) - (Number(b.x) || 0)) <= epsilon
    && Math.abs((Number(a.y) || 0) - (Number(b.y) || 0)) <= epsilon
    && Math.abs((Number(a.scale) || 1) - (Number(b.scale) || 1)) <= 0.02;
}

function ensureViewportHistory(state) {
  if (!state) return;
  if (!Array.isArray(state.viewportHistory)) state.viewportHistory = [];
  if (!Number.isFinite(state.viewportHistoryIndex)) state.viewportHistoryIndex = -1;
  if (!state.viewportHistory.length && state.viewport) {
    state.viewportHistory = [cloneViewportSnapshot(state.viewport)];
    state.viewportHistoryIndex = 0;
  }
}

function pushViewportHistory(state, options = {}) {
  if (!state?.viewport || state._viewportHistorySuspended) return false;
  ensureViewportHistory(state);
  const snap = cloneViewportSnapshot(state.viewport);
  const idx = state.viewportHistoryIndex;
  const current = idx >= 0 ? state.viewportHistory[idx] : null;
  if (current && viewportSnapshotsEqual(current, snap)) return false;
  const now = Date.now();
  const minGap = Number.isFinite(options.minGapMs) ? Number(options.minGapMs) : 180;
  if (!options.force && current && now - (Number(state._viewportHistoryLastPushAt) || 0) < minGap) {
    // Coalesce rapid pan/zoom commits into the latest snapshot.
    state.viewportHistory[idx] = snap;
    state._viewportHistoryLastPushAt = now;
    return true;
  }
  const next = state.viewportHistory.slice(0, Math.max(0, idx + 1));
  next.push(snap);
  const maxEntries = 40;
  if (next.length > maxEntries) {
    next.splice(0, next.length - maxEntries);
  }
  state.viewportHistory = next;
  state.viewportHistoryIndex = next.length - 1;
  state._viewportHistoryLastPushAt = now;
  return true;
}

function canViewportBack(state) {
  ensureViewportHistory(state);
  return (Number(state.viewportHistoryIndex) || 0) > 0;
}

function canViewportForward(state) {
  ensureViewportHistory(state);
  return (Number(state.viewportHistoryIndex) || 0) < ((state.viewportHistory?.length || 0) - 1);
}

function applyViewportSnapshot(state, snapshot, options = {}) {
  if (!state || !snapshot) return false;
  state._viewportHistorySuspended = true;
  state.viewport = cloneViewportSnapshot(snapshot);
  try {
    applyViewportTransformLive(state);
    syncZoomLabel(state);
    if (options.persist !== false) persistProject(state, options.immediate ? { immediate: true } : {});
    if (options.rerender !== false) {
      rerenderEditor(state, {
        skipPersist: true,
        forceFullChrome: options.forceFullChrome !== false,
        reason: options.reason || 'viewport-history'
      });
    } else {
      try { syncStageNav(state); } catch {}
    }
  } finally {
    state._viewportHistorySuspended = false;
  }
  return true;
}

function viewportHistoryBack(state, options = {}) {
  ensureViewportHistory(state);
  // If the live viewport drifted from the current history entry, capture it first
  // so Back from a post-pan view can return to the previous committed camera.
  const live = cloneViewportSnapshot(state.viewport);
  const head = state.viewportHistoryIndex >= 0 ? state.viewportHistory[state.viewportHistoryIndex] : null;
  if (head && !viewportSnapshotsEqual(head, live)) {
    pushViewportHistory(state, { force: true, minGapMs: 0 });
  }
  if (!canViewportBack(state)) {
    if (options.silent !== true) updateStatus(state, '没有上一个视角', { stickyMs: 900 });
    try { syncStageNav(state); } catch {}
    return false;
  }
  state.viewportHistoryIndex = Math.max(0, state.viewportHistoryIndex - 1);
  const snap = state.viewportHistory[state.viewportHistoryIndex];
  applyViewportSnapshot(state, snap, { reason: 'viewport-back' });
  if (options.silent !== true) updateStatus(state, '已回到上一个视角', { stickyMs: 900 });
  try { syncStageNav(state); } catch {}
  return true;
}

function viewportHistoryForward(state, options = {}) {
  ensureViewportHistory(state);
  if (!canViewportForward(state)) {
    if (options.silent !== true) updateStatus(state, '没有下一个视角', { stickyMs: 900 });
    try { syncStageNav(state); } catch {}
    return false;
  }
  state.viewportHistoryIndex = Math.min(state.viewportHistory.length - 1, state.viewportHistoryIndex + 1);
  const snap = state.viewportHistory[state.viewportHistoryIndex];
  applyViewportSnapshot(state, snap, { reason: 'viewport-forward' });
  if (options.silent !== true) updateStatus(state, '已前进到下一个视角', { stickyMs: 900 });
  try { syncStageNav(state); } catch {}
  return true;
}

function getStageFloatingBottomReserve(state, options = {}) {
  const stage = state?.stage;
  const stageRect = stage?.getBoundingClientRect?.();
  const stageHeight = stageRect?.height || stage?.clientHeight || 0;
  let reserve = 18;
  // Timeline eats bottom space when expanded.
  if (!state?.timelineCollapsed) reserve = Math.max(reserve, 72);
  // Stage navigator is always-on bottom-right chrome.
  if (state?.stageNav && !state.stageNav.hidden) {
    const navH = state.stageNav.offsetHeight || 44;
    reserve = Math.max(reserve, navH + 18);
  }
  // Minimap sits above the navigator when open.
  if (state?.miniMapOpen && state?.miniMap && !state.miniMap.hidden) {
    const mapH = state.miniMap.offsetHeight || 150;
    const navH = (state?.stageNav && !state.stageNav.hidden) ? (state.stageNav.offsetHeight || 44) : 0;
    reserve = Math.max(reserve, mapH + navH + 28);
  }
  // Optional extra for specific bars.
  if (Number.isFinite(options.extra)) reserve += Number(options.extra);
  // Never consume more than 45% of the stage.
  if (stageHeight > 0) reserve = Math.min(reserve, Math.round(stageHeight * 0.45));
  return Math.max(12, Math.round(reserve));
}

function syncStageNav(state) {
  if (!state?.stageNav) return;
  // Keep navigator visible during normal editing; hide only under modal/preview overlays.
  const hide = Boolean(state.previewActive || (state.modalOverlay && !state.modalOverlay.hidden));
  state.stageNav.hidden = hide;
  state.stageNav.classList.toggle('is-minimap-open', Boolean(state.miniMapOpen));
  state.stageNav.querySelectorAll?.('[data-action="toggle-minimap"]').forEach(button => {
    button.classList.toggle('is-active', Boolean(state.miniMapOpen));
    button.setAttribute('aria-pressed', state.miniMapOpen ? 'true' : 'false');
    button.title = state.miniMapOpen ? '关闭小地图(M)' : '打开小地图(M)';
  });
  const hasSelection = (state.selectedNodeIds || []).length > 0;
  state.stageNav.querySelectorAll?.('[data-action="fit-selection"]').forEach(button => {
    button.disabled = !hasSelection;
    button.classList.toggle('is-disabled', !hasSelection);
    button.title = hasSelection ? '适配所选(Shift+2 / F)' : '先选择节点再适配选区';
  });
  const canBack = canViewportBack(state);
  const canForward = canViewportForward(state);
  state.stageNav.querySelectorAll?.('[data-action="viewport-back"]').forEach(button => {
    button.disabled = !canBack;
    button.classList.toggle('is-disabled', !canBack);
    button.title = canBack ? '上一个视角 (Alt+←)' : '没有上一个视角';
  });
  state.stageNav.querySelectorAll?.('[data-action="viewport-forward"]').forEach(button => {
    button.disabled = !canForward;
    button.classList.toggle('is-disabled', !canForward);
    button.title = canForward ? '下一个视角 (Alt+→)' : '没有下一个视角';
  });
  syncZoomLabel(state);
}

function writeViewPrefs(state, patch = {}) {
  if (!state?.project) return null;
  state.project.viewPrefs = {
    ...(state.project.viewPrefs || {}),
    timelineCollapsed: Boolean(state.timelineCollapsed),
    miniMapOpen: Boolean(state.miniMapOpen),
    sidebarCollapsed: Boolean(state.sidebarCollapsed),
    focusMode: Boolean(state.focusMode),
    ...patch
  };
  return state.project.viewPrefs;
}

function setFocusMode(state, enabled, options = {}) {
  const next = Boolean(enabled);
  const silent = options.silent === true;
  if (next === Boolean(state.focusMode) && options.force !== true) {
    writeViewPrefs(state);
    if (options.persist !== false) persistProject(state, options.immediate ? { immediate: true } : {});
    if (!silent) updateStatus(state, next ? '已在专注模式' : '已退出专注模式', { stickyMs: 900 });
    return state.focusMode;
  }

  if (next) {
    state._focusModeRestore = {
      sidebarCollapsed: Boolean(state.sidebarCollapsed),
      timelineCollapsed: Boolean(state.timelineCollapsed),
      miniMapOpen: Boolean(state.miniMapOpen)
    };
    state.focusMode = true;
    setSidebarCollapsed(state, true, { persist: false, fromFocusMode: true });
    setTimelineCollapsed(state, true, { persist: false, fromFocusMode: true });
    if (state.miniMapOpen) {
      state.miniMapOpen = false;
    }
  } else {
    const restore = state._focusModeRestore || {};
    state.focusMode = false;
    state._focusModeRestore = null;
    // Restore prior chrome; default to expanded sidebar + collapsed timeline if unknown.
    setSidebarCollapsed(state, restore.sidebarCollapsed === true, { persist: false, fromFocusMode: true });
    setTimelineCollapsed(state, restore.timelineCollapsed !== false, { persist: false, fromFocusMode: true });
    if (typeof restore.miniMapOpen === 'boolean') {
      state.miniMapOpen = restore.miniMapOpen;
    }
  }

  writeViewPrefs(state);
  syncViewToggleButtons(state);
  if (state.miniMap) state.miniMap.hidden = !state.miniMapOpen;
  try { syncStageCoach(state); } catch {}
  if (options.persist !== false) persistProject(state, options.immediate ? { immediate: true } : {});
  if (options.rerender !== false) rerenderEditor(state, { skipPersist: true, forceFullChrome: true, reason: 'focus-mode' });
  // Rerender may touch sidebar/tab chrome; re-assert focus prefs as source of truth.
  if (state.focusMode) {
    state.sidebarCollapsed = true;
    state.timelineCollapsed = true;
    if (state.miniMapOpen) state.miniMapOpen = false;
    if (state.miniMap) state.miniMap.hidden = true;
    state.root?.classList?.toggle('is-sidebar-collapsed', true);
    state.root?.querySelector?.('.canvas-workspace')?.classList?.toggle('is-sidebar-collapsed', true);
    state.root?.classList?.toggle('is-timeline-collapsed', true);
    state.root?.querySelector?.('.canvas-workspace')?.classList?.toggle('is-timeline-collapsed', true);
    state.root?.querySelector?.('.canvas-editor-main')?.classList?.toggle('is-timeline-collapsed', true);
    state.timelinePanel?.classList?.toggle('is-collapsed', true);
  }
  writeViewPrefs(state);
  syncViewToggleButtons(state);
  try { syncModeHud(state); } catch {}
  if (options.persist !== false) persistProject(state, options.immediate ? { immediate: true } : {});
  if (!silent) {
    updateStatus(
      state,
      state.focusMode ? '专注模式：侧栏/时间轴已收起（\\ 退出）' : '已退出专注模式',
      { stickyMs: 1400 }
    );
  }
  return state.focusMode;
}

function setSidebarCollapsed(state, collapsed, options = {}) {
  state.sidebarCollapsed = Boolean(collapsed);
  if (!options.fromFocusMode && state.focusMode && !state.sidebarCollapsed) {
    // Expanding sidebar manually exits focus mode.
    state.focusMode = false;
    state._focusModeRestore = null;
  }
  if (state.project) {
    writeViewPrefs(state);
  }
  state.root?.classList?.toggle('is-sidebar-collapsed', state.sidebarCollapsed);
  state.root?.querySelector?.('.canvas-workspace')?.classList?.toggle('is-sidebar-collapsed', state.sidebarCollapsed);
  state.root?.querySelector?.('.canvas-project-shell--editor')?.classList?.toggle('is-collapsed', state.sidebarCollapsed);
  const reopen = state.root?.querySelector?.('[data-role="sidebar-reopen"]');
  if (reopen) reopen.hidden = !state.sidebarCollapsed;
  state.root?.querySelectorAll?.('[data-action="toggle-sidebar"]').forEach(button => {
    const isToolbar = button.classList?.contains?.('canvas-sidebar-reopen')
      || button.closest?.('.canvas-editor-toolbar');
    if (button.matches?.('[data-role="sidebar-reopen"]')) {
      button.textContent = '侧栏';
      button.title = '展开侧栏 (B)';
    } else if (isToolbar) {
      button.textContent = '侧栏';
      button.title = state.sidebarCollapsed ? '展开侧栏 (B)' : '折叠侧栏 (B)';
    } else {
      button.textContent = state.sidebarCollapsed ? '展开侧栏' : '折叠侧栏';
      button.title = state.sidebarCollapsed ? '展开侧栏 (B)' : '折叠侧栏 (B)';
    }
    button.setAttribute('aria-pressed', state.sidebarCollapsed ? 'true' : 'false');
    button.classList.toggle('is-active', !state.sidebarCollapsed);
  });
  syncViewToggleButtons(state);
  if (options.persist !== false && state.projectIndex >= 0) {
    persistProject(state);
  }
  requestAnimationFrame(() => {
    try { syncStageSize(state); } catch {}
  });
}

function setTimelineCollapsed(state, collapsed, options = {}) {
  state.timelineCollapsed = Boolean(collapsed);
  if (!options.fromFocusMode && state.focusMode && !state.timelineCollapsed) {
    state.focusMode = false;
    state._focusModeRestore = null;
  }
  if (state.project) {
    writeViewPrefs(state);
  }
  state.root?.classList?.toggle('is-timeline-collapsed', state.timelineCollapsed);
  state.root?.querySelector?.('.canvas-workspace')?.classList?.toggle('is-timeline-collapsed', state.timelineCollapsed);
  state.root?.querySelector?.('.canvas-editor-main')?.classList?.toggle('is-timeline-collapsed', state.timelineCollapsed);
  state.timelinePanel?.classList?.toggle('is-collapsed', state.timelineCollapsed);
  const summary = state.root?.querySelector?.('[data-role="timeline-collapsed-summary"]');
  if (summary) {
    const clips = getProjectTimelineClips(state.project);
    const playhead = formatDurationLabel(ensureCanvasProjectTimeline(state.project).currentTimeMs || 0);
    summary.hidden = !state.timelineCollapsed;
    summary.textContent = state.timelineCollapsed
      ? (clips.length
        ? `已折叠 · ${clips.length} 片段 · ${playhead} · 点击或按 T 展开`
        : '已折叠 · 暂无片段 · 点击或按 T 展开')
      : '';
  }
  state.root?.querySelectorAll?.('[data-action="toggle-timeline"]').forEach(button => {
    button.textContent = state.timelineCollapsed ? '展开时间轴' : '收起时间轴';
    button.setAttribute('aria-pressed', state.timelineCollapsed ? 'true' : 'false');
    button.classList.toggle('is-active', !state.timelineCollapsed);
    button.title = state.timelineCollapsed ? '展开时间轴(T)' : '折叠时间轴(T)';
  });
  // Keep top toolbar label short.
  state.root?.querySelectorAll?.('.canvas-editor-toolbar [data-action="toggle-timeline"]').forEach(button => {
    button.textContent = '时间轴';
    button.title = state.timelineCollapsed ? '展开时间轴(T)' : '折叠时间轴(T)';
  });
  syncViewToggleButtons(state);
  if (options.persist !== false && state.projectIndex >= 0) {
    persistProject(state);
  }
  requestAnimationFrame(() => {
    try { syncStageSize(state); } catch {}
  });
}

function syncViewToggleButtons(state) {
  if (!state?.root) return;
  state.root.classList?.toggle('is-focus-mode', Boolean(state.focusMode));
  state.root.querySelector?.('.canvas-workspace')?.classList?.toggle('is-focus-mode', Boolean(state.focusMode));
  state.root.querySelector?.('.canvas-editor')?.classList?.toggle('is-focus-mode', Boolean(state.focusMode));
  state.root.querySelectorAll('[data-action="toggle-focus-mode"]').forEach(button => {
    button.classList.toggle('is-active', Boolean(state.focusMode));
    button.setAttribute('aria-pressed', state.focusMode ? 'true' : 'false');
    button.title = state.focusMode
      ? '退出专注模式 (\\)'
      : '专注模式 (\\)：折叠侧栏/时间轴，专注画布';
    if (button.matches?.('[data-role="toggle-focus-mode-btn"]') || button.closest?.('.canvas-editor-toolbar')) {
      button.textContent = state.focusMode ? '专注中' : '专注';
    }
  });
  state.root.querySelectorAll('[data-action="toggle-minimap"]').forEach(button => {
    button.classList.toggle('is-active', Boolean(state.miniMapOpen));
    button.setAttribute('aria-pressed', state.miniMapOpen ? 'true' : 'false');
    button.title = state.miniMapOpen ? '关闭小地图' : '打开小地图';
  });
  state.root.querySelectorAll('.canvas-editor-toolbar [data-action="toggle-timeline"]').forEach(button => {
    button.classList.toggle('is-active', !state.timelineCollapsed);
    button.setAttribute('aria-pressed', state.timelineCollapsed ? 'true' : 'false');
    button.title = state.timelineCollapsed ? '展开时间轴' : '折叠时间轴';
  });
  state.root.querySelectorAll('.canvas-editor-toolbar [data-action="toggle-sidebar"]').forEach(button => {
    button.classList.toggle('is-active', !state.sidebarCollapsed);
    button.setAttribute('aria-pressed', state.sidebarCollapsed ? 'true' : 'false');
    button.title = state.sidebarCollapsed ? '展开侧栏 (B)' : '折叠侧栏 (B)';
  });
  try { syncStageNav(state); } catch {}
}

function cycleCanvasZoom(state, event) {
  if (!state?.viewport) return;
  // Right click / shift click resets to 100% and recenters lightly via fit if empty selection.
  if (event?.shiftKey || event?.button === 2 || event?.type === 'contextmenu') {
    if (event?.preventDefault) event.preventDefault();
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    state.viewport = { ...state.viewport, scale: 1 };
    pushViewportHistory(state, { force: true, minGapMs: 0 });
    applyViewportTransformLive(state);
    syncZoomLabel(state);
    persistProject(state);
    rerenderEditor(state, { skipPersist: true, lightChrome: true });
    updateStatus(state, '缩放已重置为 100%');
    return;
  }
  const steps = [0.5, 1, 1.5];
  const current = Number(state.viewport.scale) || 1;
  let idx = steps.findIndex(step => Math.abs(step - current) < 0.08);
  if (idx < 0) {
    // nearest step then advance
    idx = steps.reduce((best, step, i) => (
      Math.abs(step - current) < Math.abs(steps[best] - current) ? i : best
    ), 0);
  }
  const next = steps[(idx + 1) % steps.length];
  const rect = state.stage?.getBoundingClientRect?.();
  const point = rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 0, y: 0 };
  pushViewportHistory(state, { force: true, minGapMs: 0 });
  state.viewport = zoomAroundPoint(state.viewport, point, next);
  applyViewportTransformLive(state);
  pushViewportHistory(state, { force: true, minGapMs: 0 });
  try { syncStageNav(state); } catch {}
  syncZoomLabel(state);
  persistProject(state);
  rerenderEditor(state, { skipPersist: true, lightChrome: true });
  updateStatus(state, `缩放 ${Math.round(next * 100)}%`);
}



function syncStageCursor(state) {
  if (!state.stage) return;
  if (state.interactionMode === 'connect' && !state.spacePanActive && !state.panState) {
    state.stage.dataset.interaction = 'connect';
    state.stage.classList.toggle('is-panning', false);
    state.stage.classList.toggle('is-space-pan', false);
    state.stage.style.cursor = state.clickConnectFromId ? 'cell' : 'crosshair';
    return;
  }
  const panning = state.spacePanActive || state.interactionMode === 'pan' || Boolean(state.panState);
  state.stage.dataset.interaction = panning ? 'pan' : 'select';
  state.stage.classList.toggle('is-panning', panning);
  state.stage.classList.toggle('is-space-pan', Boolean(state.spacePanActive));
  if (state.stage.style.cursor === 'crosshair' || state.stage.style.cursor === 'cell') {
    state.stage.style.cursor = '';
  }
}

function computeNodeBounds(nodes) {
  if (!Array.isArray(nodes) || !nodes.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  const bounds = nodes.reduce((acc, node) => {
    const left = Number(node.x) || 0;
    const top = Number(node.y) || 0;
    const right = left + (Number(node.width) || 0);
    const bottom = top + (Number(node.height) || 0);
    return {
      minX: Math.min(acc.minX, left),
      minY: Math.min(acc.minY, top),
      maxX: Math.max(acc.maxX, right),
      maxY: Math.max(acc.maxY, bottom)
    };
  }, {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  });
  return {
    ...bounds,
    width: Math.max(0, bounds.maxX - bounds.minX),
    height: Math.max(0, bounds.maxY - bounds.minY)
  };
}

function buildEditorApi(state) {
  return {
    root: state.root,
    stage: state.stage,
    edgeLayer: state.edgeLayer,
    nodeLayer: state.nodeLayer,
    timelineLayer: state.timelineLayer,
    get viewport() { return state.viewport; },
    getProject() { return state.project; },
    addNote() { pushHistory(state); addNodeAtViewportCenter(state, createCanvasNoteNode({ text: '新便签内容' })); },
    addText() { pushHistory(state); addNodeAtViewportCenter(state, createCanvasTextNode({ text: '新的文本节点' })); },
    addConfig() { pushHistory(state); addNodeAtViewportCenter(state, createCanvasConfigNode({ composerContent: '以 @[node:参考图节点ID] 作为参考，生成新的画面。' })); },
    addMedia(kind = 'image') {
      const titles = { video: '视频节点', audio: '音频节点', subtitle: '字幕节点', image: '图片节点' };
      pushHistory(state);
      addNodeAtViewportCenter(state, createCanvasMediaNode({ kind, title: titles[kind] || '媒体节点' }));
    },
    selectNodes(nodeIds, options = {}) {
      setSelectedNodes(state, nodeIds, {
        rerender: true,
        persist: false,
        openInspector: options.openInspector === true,
        keepEdgeSelection: options.keepEdgeSelection === true
      });
    },
    selectEdge(edgeId) { setSelectedEdge(state, edgeId); },
    deleteSelectedEdge() { deleteSelectedEdge(state); },
    connectSelected() { return connectSelectedNodes(state); },
    selectConnected(seedIds) { return selectConnectedNodes(state, seedIds ? { seedIds } : {}); },
    collectConnectedNodeIds(seedIds = []) { return collectConnectedNodeIds(state.project, seedIds); },
    focusEdgeSource() { return focusSelectedEdgeEndpoint(state, 'from'); },
    focusEdgeTarget() { return focusSelectedEdgeEndpoint(state, 'to'); },
    selectEdgeEndpoints() { return selectSelectedEdgeEndpoints(state); },
    syncSelectionStatus() { return syncSelectionStatus(state); },
    getStatusText() { return state.statusLabel?.textContent || ''; },
    clearStatusSticky() { state.statusStickyUntil = 0; state.statusSource = ''; if (state.statusLabel) state.statusLabel.classList.remove('is-sticky'); },
    setStatus(text, options = {}) { updateStatus(state, text, options); return state.statusLabel?.textContent || ''; },
    smartWireSelected() { return smartWireSelectedNodes(state); },
    replaceSampleReference() { replaceSampleReferenceWithSelection(state); },
    async fillSampleFromHistory() { return fillSampleReferenceFromHistory(state); },
    addSelectedToTimeline() { addSelectedNodesToTimeline(state); },
    async generateSelected() { return runSelectedGeneration(state); },
    findPreferredGeneratorNode() { return findPreferredGeneratorNode(state, state.selectedNodeIds || []); },
    setPlayhead(seconds) {
      setTimelineCurrentTime(state.project, Math.max(0, Math.round(Number(seconds || 0) * 1000)));
      persistProject(state);
      // Timeline active/playhead chrome must not be skipped by interaction light mode.
      rerenderEditor(state, { forceFullChrome: true, reason: 'playhead' });
    },
    togglePlayback() { togglePlayback(state); },
    stopPlayback() { stopPlayback(state); },
    setPlaybackRate(rate) { setPlaybackRate(state, Number(rate) || 1); },
    getPlaybackState() {
      const timeline = ensureCanvasProjectTimeline(state.project);
      return { isPlaying: timeline.isPlaying, playbackRate: timeline.playbackRate, currentTimeMs: timeline.currentTimeMs };
    },
    deleteSelected(options = {}) { return deleteSelectedNodes(state, options); },
    collectDeleteNodeIds(seedIds = [], options = {}) { return collectDeleteNodeIds(state, seedIds, options); },
    summarizeDeleteSelection(seedIds = [], deleteIds = [], options = {}) {
      return summarizeDeleteSelection(state, seedIds, deleteIds, options);
    },
    getEdgeAutoPanScreenDelta(clientX, clientY) { return getEdgeAutoPanScreenDelta(state, clientX, clientY); },
    applyEdgeAutoPan(clientX, clientY, options = {}) { return maybeApplyEdgeAutoPan(state, clientX, clientY, options); },
    resolveDragSnapForMove(startPositions = [], deltaX = 0, deltaY = 0, options = {}) {
      const movingIds = new Set((startPositions || []).map(entry => entry.id));
      return resolveDragSnapForMove(state, startPositions, deltaX, deltaY, movingIds, options);
    },
    renderLiveDragFrame(options = {}) { return renderLiveDragFrame(state, options); },
    applyNodeDomTransform(nodeId) { return applyNodeDomTransform(state, nodeId); },
    resolveConnectionPreviewTarget(pointerWorld, options = {}) {
      return resolveConnectionPreviewTarget(state, pointerWorld, options);
    },
    renderLiveConnectionFrame() { return renderLiveConnectionFrame(state); },
    renderLiveBoxSelectionFrame() { return renderLiveBoxSelectionFrame(state); },
    duplicateSelected() { return duplicateSelectedNodes(state); },
    copySelected() { copySelectedNodesToClipboard(state); },
    pasteClipboard() { return pasteClipboardNodes(state); },
    tidySelected(options = {}) { return tidySelectedNodes(state, options); },
    startQuickWorkflow(options = {}) { return startQuickWorkflow(state, options); },
    alignSelected(mode = 'left') { alignSelectedNodes(state, mode); },
    nudgeSelected(dx = 0, dy = 0) { nudgeSelectedNodes(state, dx, dy); },
    resizeSelected(width, height) {
      const node = getPrimarySelectedNode(state);
      if (!node || node.locked) return null;
      pushHistory(state);
      if (Number.isFinite(width)) node.width = Math.max(80, Math.round(width));
      if (Number.isFinite(height)) node.height = Math.max(60, Math.round(height));
      upsertCanvasNode(state.project, node);
      persistProject(state);
      rerenderEditor(state);
      return { width: node.width, height: node.height };
    },
    rotateSelected(delta = 15) { return rotateSelectedNodes(state, delta); },
    groupSelected() { return createGroupFromSelection(state); },
    ungroupSelected() { return ungroupSelectedNodes(state); },
    selectGroupMembers(groupId) {
      if (groupId) return selectGroupMembersForGroup(state, groupId, { includeGroup: false });
      return selectGroupMembersFromSelection(state);
    },
    fitGroupBounds(groupId) { return fitGroupBoundsToMembers(state, groupId, { padding: 36 }); },
    distributeSelected(axis = 'horizontal') { distributeSelectedNodes(state, axis); },
    async dropFiles(files, point) {
      return importLocalImageFiles(state, files, point, { origin: 'file-drop', canvasRole: 'reference' });
    },
    undo() { undo(state); },
    redo() { redo(state); },
    async importMedia(point, options = {}) { pushHistory(state); return importMediaNodesFromBridge(state, point, options); },
    async openImportChooser() {
      const allSources = await getCanvasImportSourcesFromBridge(state.bridge, {});
      const sourceGroups = groupImportSourcesByOrigin(allSources);
      return chooseCanvasImportSelection(state, sourceGroups, { autoWire: true });
    },
    importSources(sources = [], point = null, options = {}) {
      return importSourceRecordsIntoCanvas(state, sources, point, options);
    },
    async addPromptEntry(entry, options = {}) {
      return addPromptEntryToCanvasState(state, entry, options);
    },
    uploadLocalImages(point = null, options = {}) {
      return uploadLocalImages(state, point, options);
    },
    importLocalImageFiles(files = [], point = null, options = {}) {
      return importLocalImageFiles(state, files, point, options);
    },
    setStageDropActive(active = false) {
      setStageDropActive(state, active);
    },
    cycleZoom(event) { cycleCanvasZoom(state, event || {}); return Math.round((state.viewport?.scale || 1) * 100); },
    setTimelineCollapsed(collapsed) { setTimelineCollapsed(state, collapsed); },
    isTimelineCollapsed() { return Boolean(state.timelineCollapsed); },
    setSidebarCollapsed(collapsed) { setSidebarCollapsed(state, collapsed); },
    isSidebarCollapsed() { return Boolean(state.sidebarCollapsed); },
    toggleSidebar() { setSidebarCollapsed(state, !state.sidebarCollapsed); },
    setFocusMode(enabled) { return setFocusMode(state, enabled); },
    toggleFocusMode() { return setFocusMode(state, !state.focusMode); },
    isFocusMode() { return Boolean(state.focusMode); },
    isStageNavOpen() { return Boolean(state.stageNav && !state.stageNav.hidden); },
    getStageNavZoomText() { return String(state.stageNavZoom?.textContent || state.scaleLabel?.textContent || ''); },
    pushViewportHistory(options = {}) { return pushViewportHistory(state, options); },
    viewportBack() { return viewportHistoryBack(state); },
    viewportForward() { return viewportHistoryForward(state); },
    canViewportBack() { return canViewportBack(state); },
    canViewportForward() { return canViewportForward(state); },
    getViewportHistory() {
      ensureViewportHistory(state);
      return {
        index: state.viewportHistoryIndex,
        entries: (state.viewportHistory || []).map(cloneViewportSnapshot)
      };
    },
    getStageFloatingBottomReserve() { return getStageFloatingBottomReserve(state); },
    shouldAutoFrameViewportOnOpen(options = {}) { return shouldAutoFrameViewportOnOpen(state, options); },
    maybeAutoFrameViewportOnOpen(options = {}) { return maybeAutoFrameViewportOnOpen(state, { ...options, sync: true }); },
    syncEditorDensityChrome() { return syncEditorDensityChrome(state); },
    isEmptyBoard() {
      return getProjectNodeList(state.project).filter(node => node && !node.hidden).length === 0;
    },
    frameNodesInView(nodeIds = [], options = {}) { return frameNodeIdsInView(state, nodeIds, options); },
    isNodeInViewport(nodeId, options = {}) { return isNodeRoughlyInViewport(state, nodeId, options); },
    isConnectTipOpen() { return Boolean(state.connectTipEl && !state.connectTipEl.hidden); },
    syncConnectTip() { return syncConnectTip(state); },
    syncModeHud() { return syncModeHud(state); },
    getModeHudState() { return buildModeHudModel(state); },
    isModeHudOpen() { return Boolean(state.modeHudEl && !state.modeHudEl.hidden); },
    isStageCoachOpen() { return Boolean(state.stageCoachEl && !state.stageCoachEl.hidden); },
    shouldKeepCanvasChromeQuiet() { return shouldKeepCanvasChromeQuiet(state); },
    isMiniMapOpen() { return Boolean(state.miniMapOpen); },
    getInspectorState() {
      return {
        formHidden: Boolean(state.sidebarForm?.hidden),
        emptyHidden: Boolean(state.emptyInspector?.hidden),
        emptyText: state.emptyInspector?.textContent || '',
        typeLabel: state.sidebarForm?.querySelector?.('[data-role="inspector-type"]')?.textContent || '',
        summaryTitle: state.sidebarForm?.querySelector?.('[data-role="inspector-summary-title"]')?.textContent || '',
        summaryMeta: state.sidebarForm?.querySelector?.('[data-role="inspector-summary-meta"]')?.textContent || '',
        advancedVisible: [...(state.sidebarForm?.querySelectorAll?.('.canvas-inspector-advanced') || [])]
          .filter(section => !section.hidden).length,
        composerHidden: Boolean(state.sidebarForm?.querySelector?.('[name="composerContent"]')?.closest('label')?.hidden),
        roleHidden: Boolean(state.sidebarForm?.querySelector?.('[name="canvasRole"]')?.closest('label')?.hidden)
      };
    },
    syncContextActions() { syncContextActions(state); syncStageCoach(state); },
    syncStageCoach() { return syncStageCoach(state); },
    getBoardNextStep() { return resolveBoardNextStep(state); },
    dismissStageCoach() { dismissStageCoach(state); },
    syncActionPanelSections() { syncActionPanelSections(state); },
    syncContextMenuAvailability() { return syncContextMenuAvailability(state); },
    getGenerationReadiness(nodeId) {
      const node = nodeId ? state.project?.nodes?.[nodeId] : getPrimarySelectedNode(state);
      return getGenerationReadiness(state, node || null);
    },
    getEmptyInspectorGuidance() { return buildEmptyInspectorGuidance(state); },
    getGenerationFailureRecovery(nodeId) {
      const node = nodeId ? state.project?.nodes?.[nodeId] : null;
      return getGenerationFailureRecovery(state, node || null);
    },
    getBoardWorkflowSnapshot() { return getBoardWorkflowSnapshot(state); },
    focusActiveRunNode() { return focusActiveRunNode(state); },
    focusActiveResultNode() { return focusActiveResultNode(state); },
    showResultToast(options = {}) { showResultToast(state, options); },
    hideResultToast() { hideResultToast(state); },
    getResultToastNodeId() { return state.resultToastNodeId || ''; },
    getResultToastSourceNodeId() { return state.resultToastSourceNodeId || ''; },
    useResultAsReference(nodeId) { return useResultNodeAsReference(state, nodeId); },
    continueFromResult(nodeId) { return continueFromResultNode(state, nodeId); },
    retryActiveGeneration() { return retryActiveGeneration(state); },
    dismissRunBanner() { dismissRunBanner(state); },
    getActiveRunNodeId() { return findActiveRunNode(state)?.id || ''; },
    getActiveResultNodeId() { return getActiveResultNodeId(state); },
    openContextMenuAt(x = 120, y = 120, options = {}) { openContextMenu(state, x, y, options); },
    closeContextMenu() { closeContextMenu(state); },
    syncInspectorTabChrome() { syncInspectorTabChrome(state); },
    getActiveSidebarTab() { return state.activeSidebarTab || 'actions'; },
    setSidebarTab(tabId = 'actions') { setSidebarTab(state, tabId); },
    getNodeRenderStats() {
      const layer = state.nodeLayer;
      const edges = state.edgeLayer;
      if (!layer) return null;
      return {
        mode: layer.dataset.renderMode || '',
        reused: Number(layer.dataset.renderReused || 0),
        rebuilt: Number(layer.dataset.renderRebuilt || 0),
        visible: Number(layer.dataset.renderVisible || 0),
        cullTotal: Number(layer.dataset.cullTotal || 0),
        cullVisible: Number(layer.dataset.cullVisible || 0),
        cullLite: Number(layer.dataset.cullLite || 0),
        cullActive: layer.dataset.cullActive === '1',
        cullInteraction: layer.dataset.cullInteraction === '1',
        edgeVisible: Number(edges?.dataset?.edgeVisible || 0),
        edgeTotal: Number(edges?.dataset?.edgeTotal || 0),
        edgeSimplified: edges?.dataset?.edgeSimplified === '1',
        edgeStraight: edges?.dataset?.edgeStraight === '1',
        edgeSkipHit: edges?.dataset?.edgeSkipHit === '1',
        edgeSkipMarkers: edges?.dataset?.edgeSkipMarkers === '1',
        interactionLight: isInteractionLightMode(state),
        hasConnectGesture: Boolean(state.connectState && !state.connectState.clickPreview),
        hasPinchGesture: Boolean(state.pinchState)
      };
    },
    getInteractionStats() {
      return {
        scheduler: state.interactionScheduler?.getStats?.() || null,
        gestures: { ...(state._gestureStats || {}) },
        active: {
          pan: Boolean(state.panState),
          box: Boolean(state.boxState),
          drag: Boolean(state.dragState),
          resize: Boolean(state.resizeState),
          rotate: Boolean(state.rotateState),
          connect: Boolean(state.connectState && !state.connectState.clickPreview)
        },
        renders: { ...(state._renderStats || {}) },
        persistence: getPersistStats(state)
      };
    },
    resetInteractionStats() {
      state.interactionScheduler?.resetStats?.();
      state._renderStats = { total: 0, fullChrome: 0, lightChrome: 0 };
      state._gestureStats = { panStarts: 0, panEnds: 0, panFrames: 0, boxStarts: 0, lastPanDeltaX: 0, lastPanDeltaY: 0 };
      state._persistScheduleCount = 0;
      state._persistFlushCount = 0;
    },
    rerender(options = {}) {
      const opts = options && typeof options === 'object' ? { ...options } : {};
      // Explicit API rerenders are user/test-facing: prefer full chrome unless light path requested.
      if (opts.lightChrome === true) {
        opts.forceFullChrome = false;
      } else if (opts.forceFullChrome !== false) {
        opts.forceFullChrome = true;
      }
      rerenderEditor(state, opts);
    },
    zoomIn() { zoomViewportByStep(state, 1.15); },
    zoomOut() { zoomViewportByStep(state, 1 / 1.15); },
    fitView() { fitViewportToNodes(state); },
    fitSelection() { fitViewportToSelection(state); },
    applyWheelNavigation(event, point = null) {
      return applyWheelNavigation(state, event || {}, point);
    },
    panViewportBy(dx = 0, dy = 0) {
      state.viewport = {
        ...state.viewport,
        x: (Number(state.viewport.x) || 0) + (Number(dx) || 0),
        y: (Number(state.viewport.y) || 0) + (Number(dy) || 0)
      };
      applyViewportTransformLive(state);
      return { ...state.viewport };
    },
    applyPinchZoomFromPoints(pointA, pointB, options = {}) {
      return applyPinchZoomFromPoints(state, pointA, pointB, options);
    },
    collectSnapTargets(movingIds = []) {
      return collectSnapTargets(state, new Set(movingIds || []));
    },
    querySnapAxisTargets(sortedTargets, value, threshold) {
      return querySnapAxisTargets(sortedTargets, value, threshold);
    },
    focusNode(nodeId, options = {}) { focusNodeInView(state, nodeId, options); },
    focusSelected() { focusSelectedNode(state); },
    openInspector() { openSelectedInspector(state); },
    cycleSelectedRole() { cycleSelectedNodeRole(state); },
    setSelectedRole(role = '') { return setSelectedNodesRole(state, role); },
    setSelectedSize(width, height) { return setSelectedNodesSize(state, width, height); },
    matchSelectedSize() { return matchSelectedNodesSize(state); },
    setSelectedTitle(title, options = {}) { return setSelectedNodesTitle(state, title, options); },
    searchNodes(query = '', options = {}) {
      if (options && options.filter) setNodeSearchFilter(state, options.filter);
      if (options && options.openStage) setStageSearchOpen(state, true);
      return renderNodeSearchResults(state, query);
    },
    setNodeSearchFilter(filter = 'all') { setNodeSearchFilter(state, filter); },
    focusNodeSearch(options = {}) { return focusNodeSearch(state, options); },
    clearNodeSearch(options = {}) { clearNodeSearch(state, options); },
    isStageSearchOpen() { return Boolean(state.stageSearchOpen); },
    closeStageSearch() { clearNodeSearch(state, { keepFilter: true, closeStage: true }); },
    setInteractionMode(mode) { setInteractionMode(state, mode); },
    getInteractionMode() { return state.interactionMode || 'pan'; },
    beginClickConnect(nodeId, side = 'out') { return setClickConnectSource(state, nodeId, side); },
    completeClickConnect(nodeId) { return completeClickConnect(state, nodeId); },
    clearClickConnect() { clearClickConnectSource(state); },
    createEdge(fromNodeId, toNodeId, options = {}) { return createEdgeBetweenNodes(state, fromNodeId, toNodeId, options); },
    selectEdge(edgeId = '') { setSelectedEdge(state, edgeId); },
    reverseSelectedEdge() { return reverseSelectedEdge(state); },
    getSelectedEdgeId() { return state.selectedEdgeId || ''; },
    isEdgeQuickbarOpen() { return Boolean(state.edgeQuickbar && !state.edgeQuickbar.hidden); },
    toggleShortcuts(open) {
      const next = typeof open === 'boolean' ? open : !state.shortcutsOpen;
      setShortcutPanelOpen(state, next);
    },
    dismissOnboarding() { dismissCanvasOnboarding(state, { persist: true }); },
    showOnboarding() {
      state.onboardingDismissed = false;
      if (state.onboardingEl) state.onboardingEl.hidden = false;
    },
    toggleTimeline() { setTimelineCollapsed(state, !state.timelineCollapsed); },
    toggleMiniMap() {
      state.miniMapOpen = !state.miniMapOpen;
      writeViewPrefs(state);
      syncViewToggleButtons(state);
      persistProject(state);
      rerenderEditor(state, { skipPersist: true });
    },
    setBackgroundMode(mode) {
      state.project.backgroundMode = mode === 'dots' ? 'dots' : 'lines';
      persistProject(state);
      rerenderEditor(state);
    },
    updateSelectedNode(patch = {}) {
      const node = getPrimarySelectedNode(state);
      if (!node) return;
      pushHistory(state);
      Object.assign(node, patch);
      if (node.type === 'media') ensureCanvasMediaNodeClip(node);
      if (node.type === 'config') ensureCanvasConfigNode(node);
      upsertCanvasNode(state.project, node);
      syncPlayheadToSelectedNode(state);
      persistProject(state);
      rerenderEditor(state, { skipPersist: true });
    },

    flushPersist() { return flushPersistProject(state); },
    getPersistStats() { return getPersistStats(state); },
    persist(options = {}) { return persistProject(state, options); },
    destroy(options = {}) { destroyCanvasEditor(state, options); }
  };
}

function destroyCanvasEditor(state, options = {}) {
  if (!state || state.destroyed) return;
  try { state.assistantApi?.destroy?.(); } catch {}
  state.assistantApi = null;
  // Snapshot + flush while still alive so close/back never drops the latest board.
  // Remount/host teardown may pass skipPersist to avoid overwriting newer storage.
  if (options.skipPersist !== true) {
    try { flushPersistProject(state, { allowDestroyed: false }); } catch {}
  } else if (state._persistTimer) {
    try { clearTimeout(state._persistTimer); } catch {}
    state._persistTimer = null;
    state._persistPending = false;
    state._persistDirty = false;
  }
  state.destroyed = true;
  state.interactionScheduler?.cancel?.();
  try { stopPlayback(state); } catch {}
  if (state.playbackFrameId) {
    try { cancelAnimationFrame(state.playbackFrameId); } catch {}
    state.playbackFrameId = null;
  }
  stopEdgeAutoPanLoop(state);
  if (state._persistTimer) {
    try { clearTimeout(state._persistTimer); } catch {}
    state._persistTimer = null;
  }
  state._persistPending = false;
  state._persistDirty = false;
  if (state._onPersistPageHide) {
    try { window.removeEventListener('pagehide', state._onPersistPageHide); } catch {}
    try { window.removeEventListener('beforeunload', state._onPersistPageHide); } catch {}
    state._onPersistPageHide = null;
  }
  if (state._viewportCommitTimer) {
    try { clearTimeout(state._viewportCommitTimer); } catch {}
    state._viewportCommitTimer = null;
  }
  if (state.stage) {
    if (state._onStagePointerDownGesture) state.stage.removeEventListener('pointerdown', state._onStagePointerDownGesture);
    if (state._onStagePointerMoveGesture) state.stage.removeEventListener('pointermove', state._onStagePointerMoveGesture);
    if (state._onStagePointerUpGesture) {
      state.stage.removeEventListener('pointerup', state._onStagePointerUpGesture);
      state.stage.removeEventListener('pointercancel', state._onStagePointerUpGesture);
      state.stage.removeEventListener('lostpointercapture', state._onStagePointerUpGesture);
    }
  }
  if (state._onWindowPointerMove) window.removeEventListener('pointermove', state._onWindowPointerMove);
  if (state._onWindowPointerUp) window.removeEventListener('pointerup', state._onWindowPointerUp);
  if (state._onWindowPointerUp) window.removeEventListener('pointercancel', state._onWindowPointerUp);
  if (state._onWindowKeyDown) window.removeEventListener('keydown', state._onWindowKeyDown);
  if (state._onWindowKeyUp) window.removeEventListener('keyup', state._onWindowKeyUp);
  if (state._onWindowPaste) window.removeEventListener('paste', state._onWindowPaste);
  state._onWindowPointerMove = null;
  state._onWindowPointerUp = null;
  state._onWindowKeyDown = null;
  state._onWindowKeyUp = null;
  state.interactionScheduler = null;
  state._onStagePointerDownGesture = null;
  state._onStagePointerMoveGesture = null;
  state._onStagePointerUpGesture = null;
  state.dragState = null;
  state.connectState = null;
  if (state._viewportCommitTimer) {
    try { clearTimeout(state._viewportCommitTimer); } catch {}
    state._viewportCommitTimer = null;
  }
  if (state._viewportSettleTimer) {
    try { clearTimeout(state._viewportSettleTimer); } catch {}
    state._viewportSettleTimer = null;
  }
  state._viewportCommitPending = false;
  state._interactionLightUntil = 0;
  state.panState = null;
  state.boxState = null;
  state.timelineDragState = null;
  state.pinchState = null;
  state.gesturePointers = null;
  state._snapTargetCache = null;
  state.resourceDisplayToken = (state.resourceDisplayToken || 0) + 1;
  revokeCanvasResourceDisplaySources(state);
}
