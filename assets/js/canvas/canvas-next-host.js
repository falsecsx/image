import { loadCanvasProjects } from './canvas-store.js?v=20260928-1';
import { getCanvasResourceStore } from './canvas-resources.js?v=20260928-1';

const FRAME_URL = '/assets/canvas-app/index.html?v=20260928-2#/canvas';
const MIRROR_KEY = 'image_app:canvas_v2_project_index';
const activeRequests = new Map();
const pendingImports = [];
let frame = null;
let ready = false;
let listening = false;
let migrationError = '';

function root() {
  return document.getElementById('canvas-workspace-root');
}

function send(method, payload) {
  if (!ready || !frame?.contentWindow) return false;
  frame.contentWindow.postMessage({ canvasBridge: 1, type: 'event', method, payload }, location.origin);
  return true;
}

function flushImports() {
  if (!ready || !pendingImports.length) return;
  for (const item of pendingImports.splice(0)) send(item.method, item.payload);
}

function showStatus(message, tone = 'info') {
  const status = root()?.querySelector('[data-canvas-next-status]');
  if (!status) return;
  status.textContent = String(message || '');
  status.dataset.tone = tone;
  status.hidden = !message;
  if (message && tone !== 'danger') setTimeout(() => {
    if (status.textContent === message) status.hidden = true;
  }, 5000);
}

function publishMirror(projects) {
  const list = (Array.isArray(projects) ? projects : []).map(project => ({
    id: String(project.id || ''), title: String(project.title || ''), updatedAt: project.updatedAt || ''
  })).filter(project => project.id);
  try { localStorage.setItem(MIRROR_KEY, JSON.stringify(list)); } catch {}
}

async function getLegacyProject(id) {
  let rawProjects = [];
  try { rawProjects = JSON.parse(localStorage.getItem('image_app:canvas_projects') || '[]'); } catch {}
  const project = (Array.isArray(rawProjects) ? rawProjects : []).find(item => item?.id === id)
    || loadCanvasProjects().find(item => item.id === id);
  if (!project) throw new Error('旧画布项目不存在');
  const store = getCanvasResourceStore();
  const ids = [...new Set(Object.values(project.nodes || {}).map(node => node?.resourceId).filter(Boolean))];
  const resources = [];
  for (const resourceId of ids) {
    const record = await store.get(resourceId);
    if (!record) continue;
    const cached = record.source?.cacheKey ? await store.getBlob(record.source.cacheKey) : null;
    resources.push({ record, blob: cached?.blob || null });
  }
  return { project, resources };
}

async function handleRequest(message, event) {
  const { id, method, payload } = message;
  if (!id || typeof method !== 'string') return;
  const controller = new AbortController();
  activeRequests.set(id, controller);
  try {
    let result;
    if (method === 'config') {
      result = {
        image: globalThis.AgentBridge?.getGenerationOptions?.('image') || {},
        video: globalThis.AgentBridge?.getGenerationOptions?.('video') || {},
        text: globalThis.AgentBridge?.getTextCapabilityStatus?.() || { available: false }
      };
    } else if (method === 'legacyList') {
      result = loadCanvasProjects().map(project => ({ id: project.id, title: project.title, updatedAt: project.updatedAt }));
    } else if (method === 'legacyProject') {
      result = await getLegacyProject(String(payload?.id || ''));
    } else if (method === 'generate') {
      if (!['image', 'video'].includes(payload?.kind) || typeof payload?.prompt !== 'string') throw new Error('无效的生成请求');
      result = await globalThis.CanvasBridge.runGeneration(payload.kind, payload.prompt, {
        ...(payload.options || {}), images: Array.isArray(payload.images) ? payload.images : [], signal: controller.signal
      });
    } else if (method === 'text') {
      const capability = globalThis.AgentBridge?.getTextCapabilityStatus?.();
      if (!capability?.available) throw new Error(capability?.message || '当前配置不支持文本能力');
      result = await globalThis.CanvasBridge.callText(payload?.messages || [], controller.signal);
    } else if (method === 'openAgent') {
      closeCanvasWorkspace();
      document.querySelector('[data-open-agent]')?.click();
      result = { ok: true };
    } else {
      throw new Error('不支持的画布请求');
    }
    if (!controller.signal.aborted) event.source?.postMessage({ canvasBridge: 1, type: 'response', id, payload: result }, event.origin);
  } catch (error) {
    if (!controller.signal.aborted) event.source?.postMessage({ canvasBridge: 1, type: 'response', id, error: String(error?.message || error) }, event.origin);
  } finally {
    activeRequests.delete(id);
  }
}

function receive(event) {
  if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
  const message = event.data;
  if (message?.canvasBridge !== 1) return;
  if (message.type === 'ready') {
    for (const controller of activeRequests.values()) controller.abort();
    activeRequests.clear();
    ready = true;
    flushImports();
  } else if (message.type === 'cancel' && message.id) {
    activeRequests.get(message.id)?.abort();
  } else if (message.type === 'request') {
    void handleRequest(message, event);
  } else if (message.type === 'event') {
    if (message.method === 'projects') publishMirror(message.payload);
    if (message.method === 'activeProject') globalThis.__activeCanvasProjectId = String(message.payload?.id || '');
    if (message.method === 'status') showStatus(message.payload?.message, message.payload?.tone);
    if (message.method === 'migrationError') {
      migrationError = String(message.payload?.message || '旧项目迁移失败');
      showStatus(`${migrationError}。旧数据仍保留，请重试或导出。`, 'danger');
    }
  }
}

function bindHostToolbar(container) {
  const closeMenu = () => {
    const menu = container.querySelector('[data-canvas-next-more-menu]');
    const trigger = container.querySelector('[data-canvas-next-more]');
    if (!menu || !trigger) return;
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };
  const openAgent = () => {
    closeMenu();
    closeCanvasWorkspace();
    document.querySelector('[data-open-agent]')?.click();
  };
  const openSettings = () => {
    closeMenu();
    closeCanvasWorkspace();
    document.getElementById('settings-open-btn')?.click();
  };
  const retry = () => {
    closeMenu();
    if (!frame) return;
    ready = false;
    migrationError = '';
    frame.src = FRAME_URL;
    showStatus('正在重新加载画布…');
  };

  container.querySelector('[data-canvas-next-close]')?.addEventListener('click', () => closeCanvasWorkspace());
  container.querySelector('[data-canvas-next-agent]')?.addEventListener('click', openAgent);
  container.querySelector('[data-canvas-next-settings]')?.addEventListener('click', openSettings);
  container.querySelector('[data-canvas-next-retry]')?.addEventListener('click', retry);
  container.querySelector('[data-canvas-next-command="agent"]')?.addEventListener('click', openAgent);
  container.querySelector('[data-canvas-next-command="settings"]')?.addEventListener('click', openSettings);
  container.querySelector('[data-canvas-next-command="retry"]')?.addEventListener('click', retry);

  const more = container.querySelector('[data-canvas-next-more]');
  const menu = container.querySelector('[data-canvas-next-more-menu]');
  const setMenu = open => {
    if (!more || !menu) return;
    menu.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
  };
  more?.addEventListener('click', event => {
    event.stopPropagation();
    setMenu(menu?.hidden !== false);
    if (menu?.hidden === false) menu.querySelector('[role="menuitem"]')?.focus();
  });
  container.addEventListener('click', event => {
    if (menu?.hidden === false && !menu.contains(event.target) && event.target !== more && !more?.contains(event.target)) closeMenu();
  });
  container.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeMenu();
      more?.focus();
      return;
    }
    if (menu?.hidden !== false || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  });
}

export function openCanvasWorkspace(options = {}) {
  const container = root();
  if (!container) throw new Error('canvas-workspace-root is missing');
  if (!listening) {
    window.addEventListener('message', receive);
    listening = true;
  }
  if (!frame) {
    container.innerHTML = `
      <div class="canvas-next-shell">
        <nav class="workspace-return-nav canvas-next-hostbar" aria-label="工作区导航">
          <button type="button" class="canvas-next-hostbar-back" data-workspace-back data-canvas-next-close aria-label="返回 Studio" title="返回 Studio">
            <i data-lucide="arrow-left" aria-hidden="true"></i><span>返回 Studio</span>
          </button>
          <div class="canvas-next-hostbar-title"><span class="canvas-next-hostbar-kicker">工作区</span><strong>无限画布</strong></div>
          <span class="canvas-next-hostbar-spacer"></span>
          <div class="canvas-next-hostbar-direct" aria-label="画布操作">
            <button type="button" data-canvas-next-agent title="打开 Agent"><i data-lucide="sparkles" aria-hidden="true"></i><span>Agent</span></button>
            <button type="button" data-canvas-next-settings title="打开设置"><i data-lucide="settings-2" aria-hidden="true"></i><span>设置</span></button>
            <button type="button" data-canvas-next-retry title="重新加载画布" aria-label="重新加载画布"><i data-lucide="refresh-cw" aria-hidden="true"></i></button>
          </div>
          <button type="button" class="canvas-next-hostbar-more" data-canvas-next-more aria-label="更多画布操作" title="更多画布操作" aria-haspopup="menu" aria-expanded="false">
            <i data-lucide="ellipsis" aria-hidden="true"></i>
          </button>
          <div class="canvas-next-hostbar-menu" data-canvas-next-more-menu role="menu" hidden>
            <button type="button" data-canvas-next-command="agent" role="menuitem"><i data-lucide="sparkles" aria-hidden="true"></i><span>打开 Agent</span></button>
            <button type="button" data-canvas-next-command="settings" role="menuitem"><i data-lucide="settings-2" aria-hidden="true"></i><span>打开设置</span></button>
            <button type="button" data-canvas-next-command="retry" role="menuitem"><i data-lucide="refresh-cw" aria-hidden="true"></i><span>重新加载画布</span></button>
          </div>
        </nav>
        <div class="canvas-next-status" data-canvas-next-status role="status" hidden></div>
        <iframe class="canvas-next-frame" title="无限画布" src="${FRAME_URL}" allow="clipboard-read; clipboard-write"></iframe>
      </div>`;
    frame = container.querySelector('iframe');
    bindHostToolbar(container);
    try { globalThis.lucide?.createIcons?.(); } catch {}
  }
  container.hidden = false;
  container.inert = false;
  container.setAttribute('aria-hidden', 'false');
  document.body.classList.add('canvas-workspace-open');
  if (migrationError) showStatus(`${migrationError}。旧数据仍保留，请重试或导出。`, 'danger');
  if (Array.isArray(options.importSources) && options.importSources.length) {
    pendingImports.push({ method: 'importSources', payload: { sources: options.importSources, projectId: options.projectId } });
  }
  flushImports();
  return { close: closeCanvasWorkspace };
}

export function closeCanvasWorkspace() {
  const container = root();
  if (!container) return;
  // The canvas is a managed workspace, so closing it must go through the
  // shared visibility state machine. Toggling only the host root leaves the
  // Studio shell hidden after AppUtils.setActiveWorkspace('canvas').
  const restored = globalThis.AppUtils?.setActiveWorkspace?.('studio');
  container.hidden = true;
  container.inert = true;
  container.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('canvas-workspace-open');
  if (!restored) {
    document.body?.setAttribute('data-active-workspace', 'studio');
    document.querySelectorAll('[data-workspace-nav]').forEach(button => {
      const active = button.dataset.workspaceNav === 'studio';
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }
}

export async function getCanvasProjectTargets() {
  try { return JSON.parse(localStorage.getItem(MIRROR_KEY) || '[]'); } catch { return []; }
}

export async function addPromptEntryToCanvas(entry, options = {}) {
  openCanvasWorkspace();
  pendingImports.push({ method: 'importPrompt', payload: { entry, projectId: options.projectId || '' } });
  flushImports();
  return { queued: true };
}
