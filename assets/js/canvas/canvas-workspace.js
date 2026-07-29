import {
  createCanvasProject,
  deleteCanvasProject,
  duplicateCanvasProject,
  getCanvasProjectsStorageHealth,
  loadCanvasProjects,
  markCanvasProjectOpened,
  pruneCanvasProjects,
  renameCanvasProject,
  saveCanvasProjects
} from './canvas-store.js';
import { mountCanvasEditor } from './canvas-editor.js?v=20260711-95';
import { getCanvasResourceStore } from './canvas-resources.js?v=20260711-95';
import { exportCanvasProjectsToJson, importCanvasProjectsFromFile } from './canvas-project-transfer.js?v=20260711-95';
import { createCanvasSampleProject, isCanvasSampleProject, upgradeCanvasSampleProject } from './canvas-sample.js?v=20260728-1';

let isCanvasWorkspaceOpen = false;

function formatProjectTime(value) {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return '04';
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return '04';
  if (diff < 60 * 60 * 1000) return Math.max(1, Math.round(diff / 60000)) + ' 分钟前';
  if (diff < 24 * 60 * 60 * 1000) return Math.max(1, Math.round(diff / 3600000)) + ' 小时前';
  if (diff < 7 * 24 * 60 * 60 * 1000) return Math.max(1, Math.round(diff / 86400000)) + ' 02';
  try {
    return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '更早';
  }
}

function summarizeProject(project) {
  const nodes = project?.nodes && typeof project.nodes === 'object' ? Object.values(project.nodes) : [];
  const edges = project?.edges && typeof project.edges === 'object' ? Object.values(project.edges) : [];
  const counts = {
    total: nodes.length,
    media: 0,
    config: 0,
    text: 0,
    note: 0,
    group: 0,
    other: 0,
    edges: edges.length,
    failed: 0,
    readyConfig: 0
  };
  nodes.forEach(node => {
    if (!node) return;
    if (node.type === 'media') counts.media += 1;
    else if (node.type === 'config' || node.type === 'loop' || node.type === 'llm') {
      counts.config += 1;
      const failed = node.generationStatus === 'error' || node.loopStatus === 'error' || node.llmStatus === 'error';
      if (failed) counts.failed += 1;
      const ready = node.type === 'config'
        ? Boolean(String(node.composerContent || node.promptText || '').trim())
        : (node.type === 'loop'
          ? (Array.isArray(node.variations) && node.variations.some(v => String(v || '').trim()))
          : Boolean(String(node.llmInput || node.text || '').trim()));
      if (ready) counts.readyConfig += 1;
    } else if (node.type === 'text') counts.text += 1;
    else if (node.type === 'note') counts.note += 1;
    else if (node.type === 'group') counts.group += 1;
    else counts.other += 1;
  });
  const configIds = new Set(nodes.filter(node => node && (node.type === 'config' || node.type === 'loop' || node.type === 'llm')).map(node => node.id));
  const wired = edges.filter(edge => edge && (configIds.has(edge.fromNodeId) || configIds.has(edge.toNodeId))).length;
  const parts = [];
  if (counts.media) parts.push(counts.media + ' 05');
  if (counts.config) parts.push(counts.config + ' 编排');
  if (counts.text || counts.note) parts.push((counts.text + counts.note) + ' 03');
  if (counts.group) parts.push(counts.group + ' 分组');
  if (!parts.length) parts.push('空白画布');

  let workflowStep = 'empty';
  let workflowLabel = '空白画布';
  let workflowHint = '可一键起步或导入素材';
  if (counts.failed > 0) {
    workflowStep = 'failed';
    workflowLabel = '生成失败待处理';
    workflowHint = '打开后可改提示词 / 接线 / 重试';
  } else if (counts.total === 0) {
    workflowStep = 'empty';
    workflowLabel = '空白画布';
    workflowHint = '可一键起步或导入素材';
  } else if (counts.media > 0 && counts.config === 0) {
    workflowStep = 'add-config';
    workflowLabel = '待添加编排';
    workflowHint = '媒体已就位，下一步补生成规则';
  } else if (counts.config > 0 && counts.media > 0 && wired < Math.max(1, Math.min(counts.media, 2))) {
    workflowStep = 'needs-wire';
    workflowLabel = '待智能接线';
    workflowHint = '编排与媒体待整理连线';
  } else if (counts.readyConfig > 0) {
    workflowStep = 'ready';
    workflowLabel = '可执行生成';
    workflowHint = '打开后可直接 G 生成';
  } else if (counts.config > 0) {
    workflowStep = 'complete-config';
    workflowLabel = '待完善编排';
    workflowHint = '还差提示词或素材';
  } else {
    workflowStep = 'browse';
    workflowLabel = '已有内容';
    workflowHint = '打开后继续编辑';
  }

  return {
    counts,
    typeSummary: parts.slice(0, 3).join(' · '),
    updatedLabel: formatProjectTime(project?.updatedAt || project?.createdAt),
    openedLabel: project?.lastOpenedAt ? formatProjectTime(project.lastOpenedAt) : '',
    workflowStep,
    workflowLabel,
    workflowHint
  };
}

function resolveResumeProject(projects) {
  const list = Array.isArray(projects) ? projects.filter(Boolean) : [];
  const opened = list.filter(project => Number(project?.lastOpenedAt) > 0);
  if (!opened.length) return null;
  return [...opened].sort((a, b) => {
    const ao = Number(a?.lastOpenedAt) || 0;
    const bo = Number(b?.lastOpenedAt) || 0;
    if (bo !== ao) return bo - ao;
    return (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0);
  })[0] || null;
}

export { getCanvasProjectsStorageHealth, pruneCanvasProjects };

export function getCanvasResumeProject(projects = null) {
  const list = Array.isArray(projects) ? projects : loadCanvasProjects();
  const project = resolveResumeProject(list);
  if (!project) return null;
  const summary = summarizeProject(project);
  return {
    id: project.id,
    title: project.title || '未命名画布',
    lastOpenedAt: Number(project.lastOpenedAt) || 0,
    updatedAt: Number(project.updatedAt) || 0,
    workflowStep: summary.workflowStep,
    workflowLabel: summary.workflowLabel,
    workflowHint: summary.workflowHint,
    counts: summary.counts,
    openedLabel: summary.openedLabel,
    updatedLabel: summary.updatedLabel
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytesLabel(bytes) {
  const size = Math.max(0, Number(bytes) || 0);
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(size < 10 * 1024 ? 1 : 0) + ' KB';
  return (size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 2 : 1) + ' MB';
}

function renderStorageHealthCard(health) {
  if (!health) return '';
  const level = health.level || 'ok';
  const largest = Array.isArray(health.largestProjects) ? health.largestProjects.slice(0, 3) : [];
  const largestMarkup = largest.length
    ? ('<ul class="canvas-storage-largest">' + largest.map(item => (
      '<li><strong>' + escapeHtml(item.title || '未命名画布') + '</strong>'
      + '<span>' + escapeHtml(formatBytesLabel(item.bytes)) + ' · ' + (Number(item.nodes) || 0) + ' 节点</span></li>'
    )).join('') + '</ul>')
    : '<p class="canvas-storage-empty">暂无项目占用数据</p>';
  const actions = [
    '<button type="button" class="canvas-action-btn" data-action="export-all">导出全部备份</button>',
    '<button type="button" class="canvas-action-btn" data-action="export-largest">导出最大项目</button>',
    '<button type="button" class="canvas-action-btn is-danger" data-action="cleanup-old-projects">清理旧项目</button>'
  ];
  return [
    '<div class="canvas-storage-card is-level-' + escapeHtml(level) + '" data-role="storage-health" data-level="' + escapeHtml(level) + '">',
    '<div class="canvas-storage-copy">',
    '<span class="canvas-storage-kicker">本地存储</span>',
    '<strong data-role="storage-label">' + escapeHtml(health.label || '存储健康') + '</strong>',
    '<span data-role="storage-meta">已用 ' + escapeHtml(health.bytesLabel || '0 B') + ' / 建议上限 ' + escapeHtml(health.softLimitLabel || '4.5 MB')
      + ' · ' + (Number(health.projectCount) || 0) + ' 个项目</span>',
    '<small data-role="storage-hint">' + escapeHtml(health.hint || '') + '</small>',
    '</div>',
    '<div class="canvas-storage-side">',
    largestMarkup,
    '<div class="canvas-storage-actions">' + actions.join('') + '</div>',
    '</div>',
    '</div>'
  ].join('');
}

function renderWorkspaceHome(projects, state, health = null) {
  const list = Array.isArray(projects) ? projects : [];
  const resumeProject = resolveResumeProject(list);
  const resumeSummary = resumeProject ? summarizeProject(resumeProject) : null;
  const storageHealth = health || getCanvasProjectsStorageHealth(list);
  const items = list.length
    ? list.map((project, index) => {
      const summary = summarizeProject(project);
      const isResume = Boolean(resumeProject && project.id === resumeProject.id);
      const isRecent = index === 0 || isResume;
      const badges = [];
      if (isResume) badges.push('<span class="canvas-project-badge is-resume">继续</span>');
      else if (index === 0) badges.push('<span class="canvas-project-badge">最近</span>');
      if (summary.workflowStep === 'failed') badges.push('<span class="canvas-project-badge is-failed">02</span>');
      else if (summary.workflowStep === 'ready') badges.push('<span class="canvas-project-badge is-ready">可生成</span>');
      return [
        '<li>',
        '<article class="canvas-project-card' + (isRecent ? ' is-recent' : '') + (isResume ? ' is-resume' : '') + ' is-step-' + escapeHtml(summary.workflowStep) + '" data-project-card="' + escapeHtml(project.id) + '" data-workflow-step="' + escapeHtml(summary.workflowStep) + '">',
        '<button type="button" class="canvas-project-open" data-project-id="' + escapeHtml(project.id) + '">',
        '<div class="canvas-project-open-top">',
        '<strong>' + escapeHtml(project.title || '未命名画布') + '</strong>',
        '<span class="canvas-project-badges">' + badges.join('') + '</span>',
        '</div>',
        '<span class="canvas-project-meta">' + summary.counts.total + ' 个节点 · ' + summary.counts.edges + ' 条连线 · ' + escapeHtml(summary.workflowLabel) + '</span>',
        '<small class="canvas-project-submeta">' + escapeHtml(summary.typeSummary) + ' · 更新于 ' + escapeHtml(summary.updatedLabel) + (summary.openedLabel ? ' · 打开于 ' + escapeHtml(summary.openedLabel) : '') + '</small>',
        '<small class="canvas-project-workflow" data-role="project-workflow">' + escapeHtml(summary.workflowHint) + '</small>',
        '</button>',
        '<div class="canvas-project-card-actions">',
        '<button type="button" class="canvas-action-btn is-primary" data-action="open-project" data-project-id="' + escapeHtml(project.id) + '">' + (isResume ? '继续' : '打开') + '</button>',
        '<button type="button" class="canvas-action-btn" data-action="duplicate-project" data-project-id="' + escapeHtml(project.id) + '">复制</button>',
        '<details class="canvas-project-more">',
        '<summary>更多</summary>',
        '<div class="canvas-project-more-menu">',
        '<button type="button" class="canvas-action-btn" data-action="rename-project" data-project-id="' + escapeHtml(project.id) + '">重命名</button>',
        '<button type="button" class="canvas-action-btn" data-action="export-project" data-project-id="' + escapeHtml(project.id) + '">导出</button>',
        '<button type="button" class="canvas-action-btn is-danger" data-action="delete-project" data-project-id="' + escapeHtml(project.id) + '">01</button>',
        '</div>',
        '</details>',
        '</div>',
        '</article>',
        '</li>'
      ].join('');
    }).join('')
    : '<li><span class="canvas-project-empty">还没有画布项目。可先「创建示例项目」快速体验，或直接新建空白画布。</span></li>';

  const resumeCard = (resumeProject && resumeSummary) ? [
    '<div class="canvas-resume-card" data-role="resume-card" data-resume-project-id="' + escapeHtml(resumeProject.id) + '" data-workflow-step="' + escapeHtml(resumeSummary.workflowStep) + '">',
    '<div class="canvas-resume-copy">',
    '<span class="canvas-resume-kicker">继续上次</span>',
    '<strong>' + escapeHtml(resumeProject.title || '未命名画布') + '</strong>',
    '<span>' + escapeHtml(resumeSummary.workflowLabel) + ' · ' + resumeSummary.counts.total + ' 节点 · ' + (resumeSummary.openedLabel ? ('上次打开 ' + escapeHtml(resumeSummary.openedLabel)) : ('更新于 ' + escapeHtml(resumeSummary.updatedLabel))) + '</span>',
    '<small>' + escapeHtml(resumeSummary.workflowHint) + '</small>',
    '</div>',
    '<div class="canvas-resume-actions">',
    '<button type="button" class="canvas-create-btn is-primary" data-action="resume-project" data-project-id="' + escapeHtml(resumeProject.id) + '">继续编辑</button>',
    '<button type="button" class="canvas-create-btn" data-action="create-quick">新的一键起步</button>',
    '</div>',
    '</div>'
  ].join('') : '';

  return [
    '<section class="canvas-workspace canvas-workspace-home" aria-label="无限画布工作台">',
    '<div class="canvas-project-shell">',
    '<div class="canvas-project-header">',
    '<div class="canvas-project-title"><span>CANVAS WORKSPACE</span><strong>无限画布</strong></div>',
    '<button type="button" class="canvas-close-btn" data-action="close" aria-label="关闭无限画布" title="关闭">×</button>',
    '</div>',
    '<p class="canvas-project-copy canvas-home-lead">从上次项目继续，或创建「参考图 → 编排 → 结果图」工作流。Studio 素材支持批量导入并自动接线。</p>',
    resumeCard,
    renderStorageHealthCard(storageHealth),
    '<div class="canvas-project-actions">',
    '<button type="button" class="canvas-create-btn is-primary" data-action="create-quick">一键起步工作流</button>',
    '<button type="button" class="canvas-create-btn" data-action="create">新建空白画布</button>',
    '<button type="button" class="canvas-create-btn" data-action="create-sample">创建示例项目</button>',
    '<p class="canvas-home-tip">项目卡会标记待接线、可生成或失败状态。存储空间不足时，请先导出备份再清理旧项目。</p>',
    '</div>',
    '<div class="canvas-action-panel">',
    '<span class="canvas-editor-kicker">项目管理</span>',
    '<div class="canvas-project-toolbar">',
    '<input class="canvas-project-search" data-role="project-search" type="search" placeholder="搜索项目名称" value="' + escapeHtml(state.search || '') + '">',
    '<select class="canvas-project-sort" data-role="project-sort">',
    '<option value="updated"' + (state.sortMode === 'updated' ? ' selected' : '') + '>最近更新</option>',
    '<option value="opened"' + (state.sortMode === 'opened' ? ' selected' : '') + '>最近打开</option>',
    '<option value="created"' + (state.sortMode === 'created' ? ' selected' : '') + '>创建时间</option>',
    '<option value="name"' + (state.sortMode === 'name' ? ' selected' : '') + '>名称</option>',
    '</select>',
    '</div>',
    '<div class="canvas-project-transfer">',
    '<button type="button" class="canvas-action-btn" data-action="export-all">导出全部</button>',
    '<button type="button" class="canvas-action-btn" data-action="import-projects">导入项目</button>',
    '<input type="file" accept=".json,application/json" hidden data-role="import-projects-input">',
    '</div>',
    '</div>',
    '<ul class="canvas-project-list">' + items + '</ul>',
    '</div>',
    '</section>'
  ].join('');
}

function sortProjects(projects, mode = 'updated') {
  const list = [...(Array.isArray(projects) ? projects : [])];
  if (mode === 'created') return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (mode === 'name') return list.sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), 'zh-CN'));
  if (mode === 'opened') {
    return list.sort((a, b) => {
      const ao = Number(a?.lastOpenedAt) || 0;
      const bo = Number(b?.lastOpenedAt) || 0;
      if (bo !== ao) return bo - ao;
      return (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0);
    });
  }
  return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function filterProjects(projects, keyword = '') {
  const normalized = String(keyword || '').trim().toLowerCase();
  if (!normalized) return projects;
  return projects.filter(project => String(project?.title || '').toLowerCase().includes(normalized));
}

let activeEditorApi = null;
let pendingImportSources = [];

function takePendingImportSources(extra = []) {
  const merged = [...pendingImportSources, ...(Array.isArray(extra) ? extra : [])]
    .filter(source => source && (source.src || source.dataUrl || source.url));
  pendingImportSources = [];
  return merged;
}

function queuePendingImportSources(sources = []) {
  const list = (Array.isArray(sources) ? sources : []).filter(source => source && (source.src || source.dataUrl || source.url));
  if (!list.length) return;
  pendingImportSources.push(...list);
}

async function applyPendingImportsToEditor(editorApi, sources = [], options = {}) {
  if (!editorApi || typeof editorApi.importSources !== 'function') return [];
  const list = (Array.isArray(sources) ? sources : []).filter(Boolean);
  if (!list.length) return [];
  const created = await editorApi.importSources(list, options.point || null, {
    pushHistory: options.pushHistory !== false,
    select: true,
    fit: true,
    flash: true,
    tidy: true,
    autoWire: options.autoWire !== false,
    statusText: options.statusText || (list.length > 1 ? `已导入 ${list.length} 张并自动整理/接线` : '')
  });
  return Array.isArray(created) ? created : [];
}

export function openCanvasWorkspace(options = {}) {
  const root = document.getElementById('canvas-workspace-root');
  if (!root) throw new Error('canvas-workspace-root is missing');

  if (Array.isArray(options.importSources) && options.importSources.length) {
    queuePendingImportSources(options.importSources);
  }

  const wantsImport = pendingImportSources.length > 0;

  if (isCanvasWorkspaceOpen) {
    // Root may have been remounted by host/tests; drop stale editor handle if DOM is gone.
    // Skip persist: the abandoned editor may hold an outdated projects array and would clobber storage.
    if (activeEditorApi && !root.querySelector?.('.canvas-editor, .canvas-workspace-home, .canvas-project-shell')) {
      try { activeEditorApi.destroy?.({ skipPersist: true }); } catch {}
      activeEditorApi = null;
    }
    if (activeEditorApi) {
      const sources = takePendingImportSources();
      applyPendingImportsToEditor(activeEditorApi, sources);
      return activeEditorApi;
    }
    // Home shell is open: if we have pending imports, continue into setup and auto-open a project.
    // If the root was remounted/emptied, fall through and re-render home instead of no-op.
    const hasShell = Boolean(root.querySelector?.('.canvas-workspace-home, .canvas-editor, .canvas-project-shell'));
    if (hasShell && !wantsImport) return null;
  } else {
    isCanvasWorkspaceOpen = true;
    root.hidden = false;
    document.body.classList.add('canvas-workspace-open');
  }

  const resourceStore = options.resourceStore || getCanvasResourceStore();
  const workspaceState = { search: '', sortMode: 'updated' };

  if (!document.body.classList.contains('canvas-workspace-open')) {
    root.hidden = false;
    document.body.classList.add('canvas-workspace-open');
  }

  const existingProjects = loadCanvasProjects();
  const upgradedProjects = existingProjects.map(project => upgradeCanvasSampleProject(project));
  const hasChanges = upgradedProjects.some((project, index) => project !== existingProjects[index]);
  const hasSampleProject = upgradedProjects.some(project => isCanvasSampleProject(project));
  const seededSampleProject = hasSampleProject ? null : createCanvasSampleProject();
  const nextProjects = seededSampleProject ? [seededSampleProject, ...upgradedProjects] : upgradedProjects;

  const notifyWorkspace = (message, tone = 'info') => {
    try {
      if (activeEditorApi?.setStatus) {
        activeEditorApi.setStatus(message, { tone, stickyMs: tone === 'danger' ? 4200 : 2800 });
        return;
      }
    } catch {}
    try {
      const host = globalThis.CanvasBridge;
      if (host && typeof host.flashStatus === 'function') host.flashStatus(message, tone);
      else if (host && typeof host.setStatus === 'function') host.setStatus(message, tone);
    } catch {}
    if (tone === 'danger') console.warn(message);
  };

  const saveProjectsSafely = (projects, options = {}) => {
    const result = saveCanvasProjects(projects);
    if (result && result.ok === false) {
      const health = result.storageHealth || getCanvasProjectsStorageHealth(projects);
      const detail = result.quotaExceeded
        ? ('本地存储空间不足（约已用 ' + (health?.bytesLabel || '?') + '）。请先导出备份并清理旧项目。')
        : ('保存画布失败：' + (result.error?.message || 'unknown error'));
      notifyWorkspace(detail, 'danger');
      if (options.rethrow) {
        const error = result.error || new Error(detail);
        error.quotaExceeded = result.quotaExceeded === true;
        error.storageHealth = health;
        throw error;
      }
      return result;
    }
    return result || { ok: true };
  };

  if (seededSampleProject || hasChanges) saveProjectsSafely(nextProjects);

  const disposeActiveEditor = () => {
    if (activeEditorApi?.destroy) {
      try { activeEditorApi.destroy(); } catch {}
    }
    activeEditorApi = null;
  };

  const closeWorkspace = () => {
    disposeActiveEditor();
    root.innerHTML = '';
    root.hidden = true;
    isCanvasWorkspaceOpen = false;
    document.body.classList.remove('canvas-workspace-open');
  };

  const openProjectEditor = projectId => {
    const projects = loadCanvasProjects();
    const project = projects.find(entry => entry?.id === projectId);
    if (!project) return renderWorkspace();
    markCanvasProjectOpened(projects, projectId);
    saveProjectsSafely(projects);
    disposeActiveEditor();
    activeEditorApi = mountCanvasEditor(root, {
      project,
      projects,
      bridge: options.bridge || globalThis.CanvasBridge,
      agentBridge: options.agentBridge || globalThis.AgentBridge,
      resourceStore,
      onBack: () => {
        disposeActiveEditor();
        renderWorkspace();
      },
      onProjectChange: (nextProject, nextProjects) => {
        const index = nextProjects.findIndex(entry => entry?.id === nextProject?.id);
        if (index !== -1) {
          if (!Number(nextProject.lastOpenedAt) && Number(project.lastOpenedAt)) {
            nextProject.lastOpenedAt = project.lastOpenedAt;
          }
          nextProjects[index] = nextProject;
          saveProjectsSafely(nextProjects);
        }
      }
    });
    const pending = takePendingImportSources();
    if (pending.length) {
      void applyPendingImportsToEditor(activeEditorApi, pending, {
        statusText: pending.length > 1
          ? `04 Studio 导入 ${pending.length} 张并自动整理/接线`
          : `已从 Studio 导入 ${pending.length} 张图片`
      }).then(created => {
        if (activeEditorApi?.setStatus && created?.length) {
          activeEditorApi.setStatus(`04 Studio 导入 ${created.length} 张并定位`, { stickyMs: 2400, tone: 'success' });
        }
      }).catch(error => {
        console.error('pending import failed', error);
      });
    }
  };

  const createProject = (title) => {
    const nextProjects = loadCanvasProjects();
    const safeTitle = typeof title === 'string' && title.trim() ? title.trim() : '';
    const project = createCanvasProject(safeTitle || `画布 ${nextProjects.length + 1}`);
    nextProjects.unshift(project);
    saveProjectsSafely(nextProjects);
    openProjectEditor(project.id);
    return project;
  };

  const createStudioImportProject = () => {
    const stamp = new Date();
    const hh = String(stamp.getHours()).padStart(2, '0');
    const mm = String(stamp.getMinutes()).padStart(2, '0');
    const title = `Studio 导入 ${hh}:${mm}`;
    return createProject(title);
  };

  const createSampleProject = () => {
    const nextProjects = loadCanvasProjects();
    const sample = createCanvasSampleProject();
    nextProjects.unshift(sample);
    saveProjectsSafely(nextProjects);
    openProjectEditor(sample.id);
  };

  const createQuickWorkflowProject = () => {
    const project = createProject('起步工作流');
    // openProjectEditor is sync for mount; starter runs after mount via microtask.
    queueMicrotask(() => {
      try {
        if (activeEditorApi && typeof activeEditorApi.startQuickWorkflow === 'function') {
          activeEditorApi.startQuickWorkflow({ dismissOnboarding: true });
          activeEditorApi.setStatus?.('已创建起步工作流，可替换参考图后按 G 生成', { tone: 'success', stickyMs: 2800 });
        }
      } catch (error) {
        console.error('quick workflow bootstrap failed', error);
      }
    });
    return project;
  };

  const handleDuplicateProject = projectId => {
    const projects = loadCanvasProjects();
    const duplicated = duplicateCanvasProject(projects, projectId);
    if (!duplicated) return;
    saveProjectsSafely(projects);
    renderWorkspace();
  };

  const handleRenameProject = projectId => {
    const projects = loadCanvasProjects();
    const project = projects.find(entry => entry?.id === projectId);
    if (!project) return;
    const nextTitle = globalThis.prompt?.('输入新的画布名称', project.title || '未命名画布');
    if (nextTitle == null) return;
    renameCanvasProject(projects, projectId, nextTitle);
    saveProjectsSafely(projects);
    renderWorkspace();
  };

  const handleDeleteProject = projectId => {
    const projects = loadCanvasProjects();
    const project = projects.find(entry => entry?.id === projectId);
    if (!project) return;
    const confirmed = globalThis.confirm?.(`确认删除「${project.title || '未命名画布'}」吗？`);
    if (!confirmed) return;
    deleteCanvasProject(projects, projectId);
    saveProjectsSafely(projects);
    renderWorkspace();
  };

  const handleExportProjects = async projectIds => {
    const projects = loadCanvasProjects().filter(project => projectIds.includes(project.id));
    if (!projects.length) return;
    await exportCanvasProjectsToJson(projects, resourceStore, { fileName: projects.length === 1 ? projects[0].title : 'canvas-projects' });
    notifyWorkspace(projects.length === 1 ? ('已导出「' + (projects[0].title || '画布') + '」') : ('已导出 ' + projects.length + ' 个画布项目'), 'success');
  };

  const handleExportLargestProjects = async () => {
    const health = getCanvasProjectsStorageHealth();
    const ids = (health.largestProjects || []).slice(0, 3).map(item => item.id).filter(Boolean);
    if (!ids.length) {
      notifyWorkspace('暂无项目可导出', 'info');
      return;
    }
    await handleExportProjects(ids);
  };

  const handleCleanupOldProjects = async () => {
    const projects = loadCanvasProjects();
    const health = getCanvasProjectsStorageHealth(projects);
    if (projects.length <= 8 && health.level === 'ok') {
      notifyWorkspace('当前项目不多，暂无需清理', 'info');
      return;
    }
    const resume = resolveResumeProject(projects);
    const plan = pruneCanvasProjects(projects, {
      maxProjects: 8,
      keepProjectIds: resume?.id ? [resume.id] : []
    });
    if (!plan.removedCount) {
      notifyWorkspace('没有可清理的旧项目', 'info');
      return;
    }
    const preview = plan.removed.slice(0, 5).map(item => item.title || '未命名画布').join('、');
    const extra = plan.removedCount > 5 ? (' 等 ' + plan.removedCount + ' 个') : '';
    const confirmed = globalThis.confirm?.(
      '将保留最近 8 个项目（含继续上次），并删除：' + preview + extra + '。\n建议先导出备份。是否继续清理？'
    );
    if (!confirmed) return;
    // Save first so cleanup remains useful even if backup download/IDB is blocked.
    const saved = saveProjectsSafely(plan.projects);
    if (saved?.ok === false) return;
    try {
      // Skip resource store during cleanup backup to avoid IndexedDB stalls.
      await exportCanvasProjectsToJson(plan.removed, null, {
        fileName: 'canvas-cleanup-backup',
        download: true
      });
      notifyWorkspace('已清理 ' + plan.removedCount + ' 个旧项目，并导出清理备份', 'success');
    } catch (error) {
      console.error('cleanup backup export failed', error);
      notifyWorkspace('已清理 ' + plan.removedCount + ' 个旧项目（备份导出失败，可稍后手动导出）', 'success');
    }
    renderWorkspace();
  };

  const handleImportProjects = async file => {
    if (!file) return;
    const imported = await importCanvasProjectsFromFile(file);
    const existing = loadCanvasProjects();
    const merged = [...existing];
    imported.projects.forEach(project => {
      const index = merged.findIndex(entry => entry.id === project.id);
      if (index >= 0) merged[index] = project;
      else merged.unshift(project);
    });
    const saved = saveProjectsSafely(merged);
    if (saved?.ok === false) return;
    if (imported.resources?.length) await resourceStore.putMany(imported.resources);
    notifyWorkspace('已导入 ' + (imported.projects?.length || 0) + ' 个画布项目', 'success');
    renderWorkspace();
  };

  const renderWorkspace = () => {
    const projects = loadCanvasProjects();
    const health = getCanvasProjectsStorageHealth(projects);
    const visibleProjects = filterProjects(sortProjects(projects, workspaceState.sortMode), workspaceState.search);
    root.innerHTML = renderWorkspaceHome(visibleProjects, workspaceState, health);

    root.querySelector('[data-action="close"]')?.addEventListener('click', closeWorkspace);
    root.querySelector('[data-action="create-quick"]')?.addEventListener('click', createQuickWorkflowProject);
    root.querySelector('[data-action="create"]')?.addEventListener('click', createProject);
    root.querySelector('[data-action="create-sample"]')?.addEventListener('click', createSampleProject);
    root.querySelectorAll('[data-action="resume-project"]').forEach(button => {
      button.addEventListener('click', () => openProjectEditor(button.dataset.projectId));
    });
    root.querySelector('[data-action="export-all"]')?.addEventListener('click', () => void handleExportProjects(projects.map(project => project.id)));
    root.querySelectorAll('[data-action="export-largest"]').forEach(button => {
      button.addEventListener('click', () => void handleExportLargestProjects());
    });
    root.querySelectorAll('[data-action="cleanup-old-projects"]').forEach(button => {
      button.addEventListener('click', () => void handleCleanupOldProjects());
    });
    const importInput = root.querySelector('[data-role="import-projects-input"]');
    root.querySelector('[data-action="import-projects"]')?.addEventListener('click', () => importInput?.click());
    importInput?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      void handleImportProjects(file);
    });

    root.querySelectorAll('.canvas-project-open[data-project-id]').forEach(button => {
      button.addEventListener('click', () => openProjectEditor(button.dataset.projectId));
    });

    root.querySelectorAll('[data-action="open-project"]').forEach(button => {
      button.addEventListener('click', () => openProjectEditor(button.dataset.projectId));
    });
    root.querySelectorAll('[data-action="duplicate-project"]').forEach(button => {
      button.addEventListener('click', () => handleDuplicateProject(button.dataset.projectId));
    });
    root.querySelectorAll('[data-action="rename-project"]').forEach(button => {
      button.addEventListener('click', () => handleRenameProject(button.dataset.projectId));
    });

    root.querySelectorAll('[data-action="delete-project"]').forEach(button => {
      button.addEventListener('click', () => handleDeleteProject(button.dataset.projectId));
    });

    root.querySelectorAll('[data-action="export-project"]').forEach(button => {
      button.addEventListener('click', () => void handleExportProjects([button.dataset.projectId]));
    });

    root.querySelector('[data-role="project-search"]')?.addEventListener('input', event => {
      workspaceState.search = event.target.value || '';
      renderWorkspace();
    });
    root.querySelector('[data-role="project-sort"]')?.addEventListener('change', event => {
      workspaceState.sortMode = event.target.value || 'updated';
      renderWorkspace();
    });
  };

  // Seed sample into the project list. If caller sent images, open a dedicated import board.
  // Optional open targets: importSources > openProjectId > resumeLast > home.
  if (wantsImport) {
    createStudioImportProject();
  } else {
    const preferredId = String(options.openProjectId || options.projectId || '').trim();
    const resumeLast = options.resumeLast === true || options.resume === true;
    let targetId = '';
    if (preferredId && nextProjects.some(project => project?.id === preferredId)) {
      targetId = preferredId;
    } else if (resumeLast) {
      const resumeProject = resolveResumeProject(nextProjects);
      if (resumeProject?.id) targetId = resumeProject.id;
    }
    if (targetId) openProjectEditor(targetId);
    else renderWorkspace();
  }
}
