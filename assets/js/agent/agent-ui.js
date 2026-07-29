import { streamAgentChat } from './agent-client.js';
import { buildInstructions, buildInputMessages } from './agent-context.js';
import {
  loadAgentList, getActiveAgentId, setActiveAgentId, loadActiveSession,
  saveActiveSession, createAgent, deleteAgent, autoTitleAgent,
  putMessage, updateMessage, putProposal, updateProposal, getAgentImage, storeAgentImage,
  hydrateAgentImages
} from './agent-storage.js';
import { downloadAgentMarkdown } from './agent-md.js';

const ASPECT_RATIO_OPTIONS = ['auto', '1:1', '2:3', '3:4', '4:5', '5:4', '4:3', '3:2', '16:9', '9:16', '21:9'];
const VIDEO_DURATION_OPTIONS = ['5', '8', '10', '12', '15', '20'];
const CONTEXT_TURN_OPTIONS = [
  { value: 6, label: '6 轮' },
  { value: 12, label: '12 轮' },
  { value: 20, label: '20 轮' },
  { value: 40, label: '40 轮' },
  { value: 0, label: '全部' }
];
const DEFAULT_CONTEXT_TURNS = 12;

const PROPOSE_TOOL = {
  type: 'function',
  name: 'propose_media_action',
  description: '提出一次图片或视频生成方案，仅在你已经判断用户准备开始生成时调用',
  parameters: {
    type: 'object', additionalProperties: false,
    properties: {
      media_type: { type: 'string', enum: ['image', 'video'] },
      action: { type: 'string', enum: ['generate', 'edit'] },
      prompt: { type: 'string', description: '完整的中文生成提示词' },
      reason: { type: 'string' },
      referenced_image_ids: { type: 'array', items: { type: 'string' } },
      requested_aspect_ratio: { type: 'string' },
      suggested_aspect_ratio: { type: 'string' },
      parallel_count: { type: 'integer', minimum: 1, maximum: 4 },
      video_duration: { type: 'integer', minimum: 3, maximum: 30 },
      video_style: { type: 'string' },
      video_motion: { type: 'string' },
      gpt_image_quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high'] },
      gpt_image_style: { type: 'string', enum: ['auto', 'vivid', 'natural'] },
      gpt_image_background: { type: 'string', enum: ['auto', 'transparent', 'opaque'] },
      requested_output_size: { type: 'string' }
    },
    required: ['media_type', 'action', 'prompt']
  }
};

function uuid() { return 'm-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

function formatContextTurnsLabel(value) {
  const turns = normalizeContextTurns(value, DEFAULT_CONTEXT_TURNS);
  const found = CONTEXT_TURN_OPTIONS.find(option => option.value === turns);
  if (found) return found.label;
  return turns === 0 ? '全部' : `${turns} 轮`;
}

function normalizeContextTurns(value, fallback = DEFAULT_CONTEXT_TURNS) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n <= 0) return 0; // 0 = all
  return Math.max(1, Math.min(200, Math.floor(n)));
}

function sliceHistoryByTurns(messages = [], turns = DEFAULT_CONTEXT_TURNS) {
  const list = Array.isArray(messages) ? messages : [];
  const limit = normalizeContextTurns(turns, DEFAULT_CONTEXT_TURNS);
  if (!limit || list.length <= limit * 2) return list;
  // 一轮 ≈ user + assistant 两条消息；保留最近 N 轮
  return list.slice(-(limit * 2));
}

function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseDataUrl(dataUrl = '') {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1] || 'image/png', base64: match[2] || '' };
}

function buildAttachedImageMeta(image, index) {
  return {
    id: image.id,
    label: image.label || `参考图 ${index + 1}`,
    dataUrl: image.dataUrl || '',
    mime: image.mime || 'image/png'
  };
}

function getHistoryPreviewSrc(record) {
  if (!record || typeof record !== 'object') return '';
  if (record.mediaType === 'video') {
    return record.thumbnail || record.videoSrc || record.videoUrl || '';
  }
  return record.imageSrc || record.imageUrl || record.thumbnail || '';
}

function getResultPreviewSrc(result) {
  if (!result || typeof result !== 'object') return '';
  if (result.mediaType === 'video' || result.videoSrc || result.videoUrl) {
    return result.thumbnailUrl || result.thumbnail || result.videoSrc || result.videoUrl || '';
  }
  if (result.imageBase64) {
    return String(result.imageBase64).startsWith('data:')
      ? result.imageBase64
      : `data:${result.mime || 'image/png'};base64,${result.imageBase64}`;
  }
  if (typeof result.imageUrl === 'string' && result.imageUrl) return result.imageUrl;
  return result.thumbnailUrl || result.thumbnail || '';
}

function guessMimeFromUrl(url = '') {
  const clean = String(url || '').split('?')[0].split('#')[0].toLowerCase();
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.bmp')) return 'image/bmp';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

async function blobToDataUrl(blob) {
  if (!(blob instanceof Blob)) return '';
  if (typeof FileReader === 'undefined') {
    if (typeof Buffer !== 'undefined') {
      const buf = Buffer.from(await blob.arrayBuffer());
      const mime = blob.type || 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
    return '';
  }
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('read blob failed'));
    reader.readAsDataURL(blob);
  });
}

async function fetchRemoteImageAsDataUrl(url, mimeHint = 'image/png') {
  if (!url || typeof fetch !== 'function') return null;
  try {
    const resp = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const dataUrl = await blobToDataUrl(blob);
    if (!dataUrl) return null;
    const parsed = parseDataUrl(dataUrl);
    return {
      dataUrl,
      base64: parsed?.base64 || '',
      mime: parsed?.mime || blob.type || mimeHint || guessMimeFromUrl(url)
    };
  } catch (err) {
    console.warn('Agent remote image materialize failed:', err);
    return null;
  }
}

async function materializeResultImageData(result) {
  if (!result || typeof result !== 'object') return null;
  if (result.mediaType === 'video' || result.videoSrc || result.videoUrl) return null;

  let mime = result.mime || 'image/png';
  const previewSrc = getResultPreviewSrc(result);

  if (result.imageBase64) {
    const raw = String(result.imageBase64);
    if (raw.startsWith('data:')) {
      const parsed = parseDataUrl(raw);
      if (!parsed?.base64) return previewSrc ? { previewSrc, base64: '', mime } : null;
      return {
        previewSrc: raw,
        base64: parsed.base64,
        mime: parsed.mime || mime
      };
    }
    if (raw) {
      return {
        previewSrc: `data:${mime};base64,${raw}`,
        base64: raw,
        mime
      };
    }
  }

  if (typeof result.imageUrl === 'string' && result.imageUrl.startsWith('data:')) {
    const parsed = parseDataUrl(result.imageUrl);
    if (!parsed?.base64) return { previewSrc: result.imageUrl, base64: '', mime };
    return {
      previewSrc: result.imageUrl,
      base64: parsed.base64,
      mime: parsed.mime || mime
    };
  }

  if (typeof result.imageUrl === 'string' && /^https?:\/\//i.test(result.imageUrl)) {
    const remote = await fetchRemoteImageAsDataUrl(result.imageUrl, mime || guessMimeFromUrl(result.imageUrl));
    if (remote?.base64) {
      return {
        previewSrc: remote.dataUrl || result.imageUrl,
        base64: remote.base64,
        mime: remote.mime || mime
      };
    }
    return {
      previewSrc: result.imageUrl,
      base64: '',
      mime: mime || guessMimeFromUrl(result.imageUrl)
    };
  }

  if (previewSrc) {
    return { previewSrc, base64: '', mime };
  }
  return null;
}

async function storeGeneratedResultImage(result, label = 'Agent 生成结果') {
  const material = await materializeResultImageData(result);
  if (!material) return { id: null, previewSrc: '' };

  if (material.base64) {
    const imgId = 'gen-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    storeAgentImage(imgId, material.base64, material.mime || 'image/png', {
      source: 'agent',
      label,
      createdAt: Date.now()
    });
    return {
      id: imgId,
      previewSrc: material.previewSrc || `data:${material.mime || 'image/png'};base64,${material.base64}`
    };
  }

  return {
    id: null,
    previewSrc: material.previewSrc || getResultPreviewSrc(result) || ''
  };
}

function getProposalMediaType(raw = {}) {
  return raw?.media_type === 'video' ? 'video' : 'image';
}

function getProposalAspectRatio(raw = {}) {
  return raw?.suggested_aspect_ratio || raw?.requested_aspect_ratio || 'auto';
}

function getProposalModel(raw = {}, bridge, mediaType = 'image') {
  const options = bridge?.getGenerationOptions?.(mediaType) || {};
  const current = String(bridge?.getCurrentGenerationParams?.()?.model || '');
  const requested = String(raw?.requested_model || raw?.model || '');
  const optionValues = normalizeSelectOptions(options.modelOptions, options.model || current || requested)
    .map(option => option.value);
  if (requested && optionValues.includes(requested)) return requested;
  if (options.model && optionValues.includes(String(options.model))) return String(options.model);
  if (current && optionValues.includes(current)) return current;
  return requested || String(options.model || current || optionValues[0] || '');
}

function getProposalResolution(raw = {}, bridge, mediaType = 'image') {
  const options = bridge?.getGenerationOptions?.(mediaType);
  const current = String(bridge?.getCurrentGenerationParams?.()?.resolution || '');
  return String(raw?.requested_output_size || raw?.resolution || options?.resolution || current || '');
}

function getProposalImageQuality(raw = {}, bridge) {
  const options = bridge?.getGenerationOptions?.('image') || {};
  const current = String(raw?.gpt_image_quality || raw?.quality || options?.quality || bridge?.getCurrentGenerationParams?.()?.quality || 'auto');
  const values = normalizeSelectOptions(options.qualityOptions, current).map(option => option.value);
  return values.includes(current) ? current : (values[0] || 'auto');
}

function getProposalVideoDuration(raw = {}, bridge) {
  const options = bridge?.getGenerationOptions?.('video') || {};
  const current = String(options?.duration || bridge?.getCurrentGenerationParams?.()?.videoDuration || '10');
  const candidate = String(raw?.video_duration || current || '10');
  const values = normalizeSelectOptions(options.durationOptions, current).map(option => option.value);
  return values.includes(candidate) ? candidate : (values[0] || current);
}

function normalizeSelectOptions(options = [], fallbackValue = '') {
  const list = Array.isArray(options) ? options : [];
  const mapped = list
    .map(option => {
      if (!option) return null;
      if (typeof option === 'string') return { value: option, label: option };
      const value = String(option.value || '');
      if (!value) return null;
      return { value, label: String(option.label || option.name || value) };
    })
    .filter(Boolean);
  if (!mapped.length && fallbackValue) {
    return [{ value: String(fallbackValue), label: String(fallbackValue) }];
  }
  if (fallbackValue && !mapped.some(option => option.value === String(fallbackValue))) {
    mapped.unshift({ value: String(fallbackValue), label: String(fallbackValue) });
  }
  return mapped;
}

function getProposalView(raw = {}, userOverrides = {}) {
  return { ...raw, ...userOverrides };
}

function getProposalPromptPlaceholder(mediaType) {
  return mediaType === 'video'
    ? '请输入视频指令，说明镜头、动作、时长与风格。'
    : '请输入图片指令，说明主体、构图、风格与细节。';
}

function getProposalScalarLabel(mediaType) {
  return mediaType === 'video' ? '时长' : '质量';
}

function getProposalUiMeta(mediaType) {
  if (mediaType === 'video') {
    return {
      title: '🎬 出视频方案',
      confirmText: '确认出视频',
      successText: 'Agent 出视频完成',
      failurePrefix: 'Agent 出视频失败：'
    };
  }
  return {
    title: '🖼️ 出图方案',
    confirmText: '确认出图',
    successText: 'Agent 出图完成',
    failurePrefix: 'Agent 出图失败：'
  };
}

function getProposalStatusLabel(state, elapsedSeconds = 0) {
  if (state === 'generating') return elapsedSeconds > 0 ? `生成中（${elapsedSeconds}s）` : '生成中';
  if (state === 'completed') return '生成完成';
  if (state === 'cancelled') return '已取消';
  if (state === 'failed') return '生成失败';
  return '待确认';
}

function isProposalCollapsedByDefault(state) {
  return state === 'generating' || state === 'completed';
}

function formatProposalPromptSummary(prompt) {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!text) return '（未填写提示词）';
  return text.length > 72 ? text.slice(0, 72) + '…' : text;
}

function updateProposalCollapsedSummary(wrap) {
  if (!wrap) return;
  const summary = wrap.querySelector('.agent-proposal-summary-text');
  if (!summary) return;
  const prompt = wrap.querySelector('.agent-proposal-prompt')?.value || '';
  summary.textContent = formatProposalPromptSummary(prompt);
}

function setProposalCardCollapsed(wrap, collapsed, opts = {}) {
  if (!wrap) return;
  const nextCollapsed = !!collapsed;
  const changed = wrap.classList.contains('is-collapsed') !== nextCollapsed;
  wrap.classList.toggle('is-collapsed', nextCollapsed);
  const toggle = wrap.querySelector('.agent-proposal-collapse');
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(!nextCollapsed));
    toggle.textContent = nextCollapsed ? '展开' : '收起';
  }
  if (nextCollapsed) updateProposalCollapsedSummary(wrap);
  if (!nextCollapsed && (changed || opts.forceScroll)) {
    const scrollIntoMessages = () => {
      try {
        wrap.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: opts.smooth ? 'smooth' : 'auto' });
      } catch (_) {
        wrap.scrollIntoView(false);
      }
    };
    scrollIntoMessages();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scrollIntoMessages);
  }
}

function supportsVision(model) {
  if (!model) return false;
  const m = model.toLowerCase();
  return m.includes('gpt-4o') || m.includes('gpt-4.1') || m.includes('gpt-4-turbo') || m.includes('gpt-4-vision') || m.includes('claude') || m.includes('gemini') || m.includes('qwen-vl') || m.includes('glm-4v');
}

function buildCatalog(currentAgent, getImage) {
  const ids = new Set();
  for (const m of (currentAgent?.messages || [])) {
    if (Array.isArray(m?.attachedImageIds)) {
      for (const id of m.attachedImageIds) ids.add(id);
    }
  }
  const catalog = [];
  for (const id of ids) {
    if (!getImage) break;
    const img = getImage(id);
    if (img?.dataUrl) catalog.push({ imgId: id, source: 'turn', description: '当前对话引用的图片' });
  }
  return catalog;
}

export function openAgentWorkspace() {
  const existing = document.querySelector('.agent-workspace');
  if (existing) {
    existing.querySelector('.agent-input')?.focus();
    const existingClose = typeof existing.__agentClose === 'function' ? existing.__agentClose : null;
    return { close() { if (existingClose) existingClose(); } };
  }
  const bridge = window.AgentBridge;
  if (!bridge) { alert('主 app bridge 不可用'); return { close() { } }; }
  const returnFocus = document.activeElement;
  loadAgentList();
  // 图片内存是异步从 IndexedDB 填充的，拿到句柄等 hydrate 完成后再渲染一次，
  // 否则刷新页面后首帧读到的还是空缓存，缩略图会全部空白。
  let hydrateReady = Promise.resolve(0);
  try { hydrateReady = hydrateAgentImages() || hydrateReady; } catch {}
  document.body.classList.add('agent-mode-open');

  // Keep the underlying studio out of the accessibility tree while Agent is open.
  const backgroundElements = Array.from(document.body.children);
  const backgroundState = backgroundElements.map(element => ({
    element,
    ariaHidden: element.getAttribute('aria-hidden'),
    inert: 'inert' in element ? element.inert : null,
    inertAttr: element.hasAttribute('inert')
  }));

  const root = document.createElement('div');
  root.className = 'agent-workspace';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Agent 创作台');
  root.tabIndex = -1;
  root.innerHTML = `
    <aside class="agent-sidebar">
      <div class="agent-sidebar-head">
        <div>
          <strong>Agent 创作台</strong>
          <div class="agent-sidebar-copy">多轮对话，确认后出图/视频</div>
        </div>
      </div>
      <button class="agent-btn agent-btn-primary agent-new" type="button" aria-label="新建会话">+ 新会话</button>
      <div class="agent-agent-list"></div>
    </aside>
    <section class="agent-shell">
      <section class="agent-main">
        <div class="agent-main-header">
          <div class="agent-main-heading">
            <div class="agent-main-kicker">创作对话</div>
            <div class="agent-main-title"></div>
          </div>
          <div class="agent-toolbar">
            <label class="agent-context-turns" title="控制发给模型的最近对话轮数；联网搜索默认开启">
              <span class="agent-context-turns-label">上下文轮数</span>
              <span class="agent-context-turns-value" aria-hidden="true">${CONTEXT_TURN_OPTIONS.find(option => option.value === DEFAULT_CONTEXT_TURNS)?.label || '12 轮'}</span>
              <select class="agent-context-turns-select" aria-label="上下文轮数">
                ${CONTEXT_TURN_OPTIONS.map(option => `<option value="${option.value}" ${option.value === DEFAULT_CONTEXT_TURNS ? 'selected' : ''}>${option.label}</option>`).join('')}
              </select>
            </label>
          </div>
          <div class="agent-main-actions">
            <button class="agent-btn agent-export" type="button">导出 MD</button>
            <button class="agent-btn agent-close" type="button" aria-label="返回工作台" title="返回工作台">
              <span aria-hidden="true">&#8592;</span>
            </button>
          </div>
        </div>
        <div class="agent-status" aria-live="polite">空闲</div>
        <div class="agent-messages"></div>
          <div class="agent-input-bar">
          <div class="agent-input-wrap">
            <div class="agent-attach-strip" hidden></div>
            <textarea class="agent-input" rows="3" placeholder="输入消息，Enter 发送，Shift+Enter 换行"></textarea>
            <label class="agent-model-control" title="切换对话模型">
              <span>模型</span>
              <span class="agent-model-value" aria-hidden="true"></span>
              <select class="agent-model-select" aria-label="对话模型"></select>
            </label>
          </div>
          <button class="agent-btn agent-send" type="button">发送</button>
          <button class="agent-btn agent-abort" type="button" hidden>中止</button>
        </div>
      </section>
      <aside class="agent-sidepane" aria-label="参考与最近结果">
        <div class="agent-sidepane-tabs" role="tablist" aria-label="辅助面板">
          <button class="agent-side-tab is-active" id="agent-reference-tab" type="button" role="tab" aria-selected="true" aria-controls="agent-reference-card" data-agent-pane="reference">参考图</button>
          <button class="agent-side-tab" id="agent-recent-tab" type="button" role="tab" aria-selected="false" aria-controls="agent-recent-card" data-agent-pane="recent" tabindex="-1">最近结果</button>
        </div>
        <section class="agent-sidecard" id="agent-reference-card" role="tabpanel" aria-labelledby="agent-reference-tab">
          <div class="agent-sidecard-head">
            <div>
              <div class="agent-sidecard-kicker">Reference</div>
              <h3>主工作台参考图</h3>
            </div>
            <button class="agent-btn agent-refresh-assets" type="button">同步</button>
          </div>
          <p class="agent-sidecard-copy">同步主工作台参考图，直接用于图生图 / 图生视频。</p>
          <div class="agent-reference-grid"></div>
        </section>
        <section class="agent-sidecard" id="agent-recent-card" role="tabpanel" aria-labelledby="agent-recent-tab">
          <div class="agent-sidecard-head">
            <div>
              <div class="agent-sidecard-kicker">Recent</div>
              <h3>最近结果</h3>
            </div>
          </div>
          <p class="agent-sidecard-copy">生成结果会回流到这里，方便继续追问或二次创作。</p>
          <div class="agent-recent-grid"></div>
        </section>
      </aside>
    </section>
  `;
  document.body.appendChild(root);

  for (const element of backgroundElements) {
    if ('inert' in element) element.inert = true;
    else element.setAttribute('inert', '');
    element.setAttribute('aria-hidden', 'true');
  }

  const getFocusableElements = () => Array.from(root.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(element => !element.hidden && !element.closest('[hidden]') && (element.offsetWidth || element.offsetHeight || element === document.activeElement));

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements();
    if (!focusable.length) {
      event.preventDefault();
      root.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  root.addEventListener('keydown', trapFocus);

  function focusFirstAvailable() {
    const focusable = getFocusableElements();
    (focusable[0] || root).focus();
  }

  function keepFocusInside(event) {
    if (!document.body.contains(root) || !event.target || root.contains(event.target)) return;
    event.stopPropagation();
    focusFirstAvailable();
  }

  document.addEventListener('focusin', keepFocusInside, true);

  function restoreBackground() {
    for (const state of backgroundState) {
      const { element } = state;
      if ('inert' in element && state.inert !== null) element.inert = state.inert;
      if (!state.inertAttr) element.removeAttribute('inert');
      if (state.ariaHidden == null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', state.ariaHidden);
    }
  }

  const $sidebar = root.querySelector('.agent-sidebar');
  const $agentList = root.querySelector('.agent-agent-list');
  const $new = root.querySelector('.agent-new');
  const $export = root.querySelector('.agent-export');
  const $contextTurns = root.querySelector('.agent-context-turns-select');
  const $contextTurnsValue = root.querySelector('.agent-context-turns-value');
  const $close = root.querySelector('.agent-close');
  const $title = root.querySelector('.agent-main-title');
  const $status = root.querySelector('.agent-status');
  const $messages = root.querySelector('.agent-messages');
  const $attachStrip = root.querySelector('.agent-attach-strip');
  const $input = root.querySelector('.agent-input');
  const $modelSelect = root.querySelector('.agent-model-select');
  const $modelValue = root.querySelector('.agent-model-value');
  const $send = root.querySelector('.agent-send');
  const $abort = root.querySelector('.agent-abort');
  const $refreshAssets = root.querySelector('.agent-refresh-assets');
  const $referenceGrid = root.querySelector('.agent-reference-grid');
  const $recentGrid = root.querySelector('.agent-recent-grid');
  const $sidePane = root.querySelector('.agent-sidepane');
  const $sideTabs = Array.from(root.querySelectorAll('.agent-side-tab'));

  const ctrl = { current: null };
  const importedRefMap = new Map();
  const draftReferenceIds = new Set();
  let lastCreateAt = 0;

  function setSidePaneTab(name, shouldFocus = false) {
    const active = name === 'recent' ? 'recent' : 'reference';
    $sidePane?.setAttribute('data-active-pane', active);
    $sideTabs.forEach(tab => {
      const selected = tab.dataset.agentPane === active;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && shouldFocus) tab.focus();
    });
  }

  function setStatus(text) { $status.textContent = text; }
  function setSending(on) { $send.hidden = on; $abort.hidden = !on; $input.disabled = on; if ($modelSelect) $modelSelect.disabled = on; }
  function scrollMessagesToBottom() {
    if (!$messages) return;
    const scroll = () => { $messages.scrollTop = $messages.scrollHeight; };
    scroll();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(scroll);
    else setTimeout(scroll, 0);
  }

  function renderModelSelect() {
    if (!$modelSelect) return;
    const current = bridge.getTextModel?.() || 'gpt-5.4-mini';
    const options = bridge.getTextModelOptions?.() || [];
    const normalized = options.length ? options : [{ value: current, label: current, selected: true }];
    $modelSelect.innerHTML = '';
    for (const option of normalized) {
      const el = document.createElement('option');
      el.value = option.value;
      el.textContent = option.label || option.value;
      $modelSelect.appendChild(el);
    }
    const selectedValue = normalized.some(option => option.value === current) ? current : normalized[0].value;
    $modelSelect.value = selectedValue;
    const selectedOption = normalized.find(option => option.value === selectedValue) || normalized[0];
    const selectedLabel = selectedOption?.label || selectedOption?.value || selectedValue;
    if ($modelValue) $modelValue.textContent = selectedLabel;
    $modelSelect.title = selectedLabel;
    $modelSelect.setAttribute('aria-valuetext', selectedLabel);
  }

  function activeSession() { return loadActiveSession(); }

  function renderSidebar() {
    const list = loadAgentList();
    const active = list.activeAgentId;
    const ids = Object.keys(list.agents);
    $agentList.innerHTML = '';
    for (const id of ids) {
      const a = list.agents[id];
      const item = document.createElement('div');
      item.className = 'agent-agent-item' + (id === active ? ' is-active' : '');
      item.dataset.agentId = id;
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-current', id === active ? 'true' : 'false');
      const dot = id === active ? '<span class="agent-dot">●</span>' : '<span class="agent-dot">○</span>';
      item.innerHTML = `${dot}<span class="agent-agent-title" title="${esc(a.title)}">${esc(a.title)}</span><button class="agent-agent-del" type="button" title="删除" ${ids.length <= 1 ? 'disabled' : ''}>🗑</button>`;
      $agentList.appendChild(item);
    }
  }

  function renderMain() {
    const sess = activeSession();
    if (!sess) return;
    $title.textContent = sess.title || '新会话';
    if ($contextTurns) {
      const turns = normalizeContextTurns(sess.contextTurns, DEFAULT_CONTEXT_TURNS);
      const label = formatContextTurnsLabel(turns);
      if (![...$contextTurns.options].some(option => Number(option.value) === turns)) {
        $contextTurns.add(new Option(label, String(turns), true, true));
      }
      $contextTurns.value = String(turns);
      if ($contextTurnsValue) $contextTurnsValue.textContent = label;
      $contextTurns.title = label;
      $contextTurns.setAttribute('aria-valuetext', label);
    }
    $messages.innerHTML = '';
    const messages = sess.messages || [];
    if (!messages.length) {
      const empty = document.createElement('div');
      empty.className = 'agent-empty-conversation';
      empty.innerHTML = `
        <div class="agent-empty-mark" aria-hidden="true">✦</div>
        <div class="agent-empty-copy">
          <strong>从一个想法开始</strong>
          <p>告诉 Agent 你想做什么，先讨论方向，再确认生成。</p>
        </div>
        <div class="agent-starter-list" role="list" aria-label="创作起点">
          <button class="agent-starter" type="button" data-agent-starter="把这张参考图做成一张有视觉冲击力的海报">做一张海报</button>
          <button class="agent-starter" type="button" data-agent-starter="帮我把这个想法拆成三个镜头">拆成三个镜头</button>
          <button class="agent-starter" type="button" data-agent-starter="围绕这个产品设计一组电商视觉">设计一组产品图</button>
        </div>
      `;
      empty.querySelectorAll('[data-agent-starter]').forEach((button) => {
        button.addEventListener('click', () => {
          $input.value = button.dataset.agentStarter || '';
          $input.focus();
        });
      });
      $messages.appendChild(empty);
    }
    for (const m of messages) {
      appendMessageBubble(m);
      if (m.proposalId && sess.proposals && sess.proposals[m.proposalId]) {
        appendProposalBubbleV2(sess.proposals[m.proposalId]);
      }
    }
    scrollMessagesToBottom();
  }

  function renderAll() {
    renderSidebar();
    renderMain();
    refreshAssetPanes();
  }

  function renderDraftAttachments() {
    if (!$attachStrip) return;
    const refs = Array.from(draftReferenceIds).map(id => {
      const img = getAgentImage(id);
      return img ? { id, dataUrl: img.dataUrl, mime: img.mime } : null;
    }).filter(Boolean);
    $attachStrip.innerHTML = '';
    $attachStrip.hidden = refs.length === 0;
    if (!refs.length) return;
    for (const ref of refs) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'agent-attach-chip';
      chip.title = '移除参考图';
      chip.innerHTML = `<img alt="" src="${esc(ref.dataUrl)}"><span>${esc(ref.id.slice(0, 6))}</span><i>×</i>`;
      chip.addEventListener('click', () => {
        draftReferenceIds.delete(ref.id);
        renderDraftAttachments();
      });
      $attachStrip.appendChild(chip);
    }
  }

  function importReferenceImage(source, label) {
    if (!source?.dataUrl) return null;
    const parsed = parseDataUrl(source.dataUrl);
    if (!parsed) return null;
    const key = `${source.dataUrl}|${source.mime || parsed.mime}`;
    if (importedRefMap.has(key)) return importedRefMap.get(key);
    const imgId = uuid();
    storeAgentImage(imgId, parsed.base64, source.mime || parsed.mime || 'image/png', {
      label: label || '参考图',
      source: 'workspace',
      createdAt: Date.now()
    });
    importedRefMap.set(key, imgId);
    return imgId;
  }

  function syncDraftReferencesFromWorkspace() {
    const imgs = Array.isArray(bridge.getStateImages?.()) ? bridge.getStateImages() : [];
    const normalized = imgs.map((img, idx) => ({
      dataUrl: img?.dataUrl || '',
      mime: img?.mime || 'image/png',
      label: img?.name || img?.label || `参考图 ${idx + 1}`
    })).filter(img => img.dataUrl);
    if (!$referenceGrid) return;
    $referenceGrid.innerHTML = '';
    if (!normalized.length) {
      $referenceGrid.innerHTML = '<div class="agent-empty-state">还没有同步到参考图</div>';
      renderDraftAttachments();
      return;
    }
    normalized.forEach((img, idx) => {
      const imgId = importReferenceImage(img, img.label);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'agent-reference-card';
      card.dataset.imgId = imgId || '';
      const active = imgId ? draftReferenceIds.has(imgId) : false;
      card.classList.toggle('is-selected', active);
      card.innerHTML = `
        <img alt="${esc(img.label)}" src="${esc(img.dataUrl)}">
        <span>${esc(img.label)}</span>
      `;
      card.addEventListener('click', () => {
        if (!imgId) return;
        if (draftReferenceIds.has(imgId)) draftReferenceIds.delete(imgId);
        else draftReferenceIds.add(imgId);
        renderDraftAttachments();
        syncDraftReferencesFromWorkspace();
      });
      $referenceGrid.appendChild(card);
    });
    renderDraftAttachments();
  }

  async function renderRecentResults() {
    if (!$recentGrid) return;
    let records = [];
    try {
      if (typeof bridge.loadHistoryEntries === 'function') {
        records = await bridge.loadHistoryEntries();
      } else if (typeof bridge.getHistoryMeta === 'function') {
        records = await bridge.getHistoryMeta();
      }
    } catch {
      try {
        records = typeof bridge.getHistoryMeta === 'function' ? await bridge.getHistoryMeta() : [];
      } catch {
        records = [];
      }
    }
    if (!Array.isArray(records)) records = [];
    const recent = [...records].sort((a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0)).slice(0, 8);
    $recentGrid.innerHTML = '';
    if (!recent.length) {
      $recentGrid.innerHTML = '<div class="agent-empty-state">还没有生成结果</div>';
      return;
    }
    let rendered = 0;
    recent.forEach(record => {
      const src = getHistoryPreviewSrc(record);
      const isVideo = record.mediaType === 'video' || !!(record.videoSrc || record.videoUrl);
      if (!isVideo && !src) return;
      const card = document.createElement('div');
      card.className = 'agent-recent-card';
      if (isVideo) {
        const videoSrc = record.videoSrc || record.videoUrl || src;
        if (!videoSrc && !src) return;
        card.innerHTML = `
          <video src="${esc(videoSrc)}" ${src ? `poster="${esc(src)}"` : ''} muted playsinline preload="metadata" controls></video>
          <div class="agent-recent-meta">
            <strong>视频</strong>
            <span>${esc(record.videoDuration || '')}${record.videoDuration ? ' 秒' : ''}</span>
          </div>
        `;
      } else {
        card.innerHTML = `
          <img alt="最近结果" src="${esc(src)}" loading="lazy">
          <div class="agent-recent-meta">
            <strong>图片</strong>
            <span>${esc(record.aspect || '')}</span>
          </div>
        `;
        if (src) {
          const refBtn = document.createElement('button');
          refBtn.type = 'button';
          refBtn.className = 'agent-recent-ref-btn';
          refBtn.textContent = '用作参考';
          refBtn.addEventListener('click', () => {
            const imported = importReferenceImage({ dataUrl: src, mime: record.mime || 'image/png' }, record.prompt || '历史结果');
            if (!imported) {
              bridge.flashStatus?.('当前结果不是可直接引用的图片', 'danger');
              return;
            }
            draftReferenceIds.add(imported);
            renderDraftAttachments();
            syncDraftReferencesFromWorkspace();
            bridge.flashStatus?.('已加入参考图', 'success');
          });
          card.appendChild(refBtn);
        }
      }
      $recentGrid.appendChild(card);
      rendered += 1;
    });
    if (!rendered) {
      $recentGrid.innerHTML = '<div class="agent-empty-state">还没有可预览的生成结果</div>';
    }
  }

  async function refreshAssetPanes() {
    syncDraftReferencesFromWorkspace();
    await renderRecentResults();
  }

  function appendMessageBubble(m) {
    const hasAttachments = Array.isArray(m.attachedImageIds) && m.attachedImageIds.length > 0;
    const displayText = m.text || (hasAttachments ? '已附带参考图，请结合本条素材继续创作。' : '');
    const div = document.createElement('div');
    div.className = 'agent-msg agent-msg-' + m.role;
    div.innerHTML = `<div class="agent-msg-text">${esc(displayText)}</div>`;
    if (hasAttachments) {
      const strip = document.createElement('div');
      strip.className = 'agent-msg-attachments';
      for (const imgId of m.attachedImageIds) {
        const img = getAgentImage(imgId);
        if (!img?.dataUrl) continue;
        const item = document.createElement('div');
        item.className = 'agent-msg-attachment';
        item.innerHTML = `<img alt="${esc(imgId)}" src="${esc(img.dataUrl)}"><span>${esc(imgId.slice(0, 6))}</span>`;
        strip.appendChild(item);
      }
      if (strip.childElementCount) div.appendChild(strip);
    }
    if (m.reasoning) {
      const det = document.createElement('details');
      det.className = 'agent-reasoning';
      det.innerHTML = `<summary>💭 思考过程</summary><pre>${esc(m.reasoning)}</pre>`;
      div.appendChild(det);
    }
    $messages.appendChild(div);
  }

  function renderProposalResults(wrap, imageIds = [], previewSrcs = []) {
    const host = wrap?.querySelector?.('.agent-proposal-results');
    if (!host) return;
    const ids = Array.isArray(imageIds) ? imageIds.filter(Boolean) : [];
    const previews = Array.isArray(previewSrcs) ? previewSrcs.filter(Boolean) : [];
    host.innerHTML = '';
    if (!ids.length && !previews.length) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    const title = document.createElement('div');
    title.className = 'agent-proposal-results-title';
    title.textContent = `生成结果（${ids.length || previews.length}）`;
    host.appendChild(title);
    const grid = document.createElement('div');
    grid.className = 'agent-proposal-results-grid';

    const appendCard = ({ src, imgId = '', label = '', clickable = false }) => {
      if (!src) return;
      const card = document.createElement(clickable ? 'button' : 'div');
      if (clickable) card.type = 'button';
      card.className = 'agent-proposal-result-card';
      if (clickable) card.title = '点击加入参考图';
      card.innerHTML = `<img alt="${esc(label || imgId || '生成结果')}" src="${esc(src)}"><span>${esc(label || String(imgId || '结果').slice(0, 6))}</span>`;
      if (clickable && imgId) {
        card.addEventListener('click', () => {
          draftReferenceIds.add(imgId);
          renderDraftAttachments();
          syncDraftReferencesFromWorkspace();
          bridge.flashStatus?.('已加入参考图', 'success');
        });
      }
      grid.appendChild(card);
    };

    if (ids.length) {
      for (const imgId of ids) {
        const img = getAgentImage(imgId);
        if (!img?.dataUrl) continue;
        appendCard({ src: img.dataUrl, imgId, label: String(imgId).slice(0, 6), clickable: true });
      }
    }

    if (!grid.childElementCount && previews.length) {
      previews.forEach((src, index) => {
        appendCard({ src, label: `结果 ${index + 1}`, clickable: false });
      });
    }

    if (!grid.childElementCount) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.appendChild(grid);
  }

  function appendProposalBubble(p) {
    const wrap = document.createElement('div');
    wrap.className = 'agent-proposal-card';
    wrap.dataset.proposalId = p.id;
    const proposalView = getProposalView(p.raw, p.userOverrides);
    const mediaType = getProposalMediaType(proposalView);
    const aspect = getProposalAspectRatio(proposalView);
    const videoDuration = getProposalVideoDuration(proposalView, bridge);
    const count = clamp(parseInt(proposalView?.parallel_count, 10) || 1, 1, 4);
    const proposalMeta = getProposalUiMeta(mediaType);
    const isCollapsed = isProposalCollapsedByDefault(p.executionState);
    wrap.innerHTML = `
      <div class="agent-proposal-head">
        <div class="agent-proposal-head-main">
          <div class="agent-proposal-kicker">待确认提案</div>
          <div class="agent-proposal-title agent-proposal-kind-title">${proposalMeta.title}</div>
        </div>
        <div class="agent-proposal-head-side">
          <div class="agent-proposal-status">${getProposalStatusLabel(p.executionState)}</div>
          <button class="agent-proposal-collapse" type="button" aria-expanded="${String(!isCollapsed)}">${isCollapsed ? '展开' : '收起'}</button>
        </div>
      </div>
      <div class="agent-proposal-summary" title="折叠时显示提示词摘要">
        <span class="agent-proposal-summary-label">提示词</span>
        <div class="agent-proposal-summary-text">${esc(formatProposalPromptSummary(proposalView?.prompt || ''))}</div>
      </div>
      <div class="agent-proposal-body">
        <label class="agent-proposal-field">
          <span>提示词</span>
          <textarea class="agent-proposal-prompt" rows="3" placeholder="${esc(getProposalPromptPlaceholder(mediaType))}">${esc(proposalView?.prompt || '')}</textarea>
        </label>
        <div class="agent-proposal-row">
          <label>类型 <select class="agent-prop-media-type">
            <option value="image" ${mediaType === 'image' ? 'selected' : ''}>图片</option>
            <option value="video" ${mediaType === 'video' ? 'selected' : ''}>视频</option>
          </select></label>
          <label>比例 <select class="agent-prop-aspect">
            ${ASPECT_RATIO_OPTIONS.map(a => `<option value="${a}" ${a === aspect ? 'selected' : ''}>${a}</option>`).join('')}
          </select></label>
        </div>
        <div class="agent-proposal-row agent-proposal-row-image" ${mediaType === 'video' ? 'hidden' : ''}>
          <label>张数 <input class="agent-prop-count" type="number" min="1" max="4" value="${count}"></label>
        </div>
        <div class="agent-proposal-row agent-proposal-row-video" ${mediaType === 'image' ? 'hidden' : ''}>
          <label>时长 <select class="agent-prop-duration">
            ${VIDEO_DURATION_OPTIONS.map(value => `<option value="${value}" ${value === videoDuration ? 'selected' : ''}>${value} 秒</option>`).join('')}
          </select></label>
        </div>
        </div>
      <div class="agent-proposal-collapsed-actions">
        <div class="agent-proposal-actions">
          <button class="agent-btn agent-prop-confirm" type="button">${proposalMeta.confirmText}</button>
          <button class="agent-btn agent-prop-cancel" type="button">取消</button>
        </div>
        <div class="agent-proposal-state"></div>
      </div>
    `;
    $messages.appendChild(wrap);
    const collapseBtn = wrap.querySelector('.agent-proposal-collapse');
    const confirmBtn = wrap.querySelector('.agent-prop-confirm');
    const mediaTypeSelect = wrap.querySelector('.agent-prop-media-type');
    const kindTitle = wrap.querySelector('.agent-proposal-kind-title');
    const imageRow = wrap.querySelector('.agent-proposal-row-image');
    const videoRow = wrap.querySelector('.agent-proposal-row-video');
    const stateEl = wrap.querySelector('.agent-proposal-state');
    let timer = null;

    const syncMediaFields = () => {
      const nextMediaType = mediaTypeSelect?.value === 'video' ? 'video' : 'image';
      const meta = getProposalUiMeta(nextMediaType);
      if (kindTitle) kindTitle.textContent = meta.title;
      if (confirmBtn) confirmBtn.textContent = meta.confirmText;
      if (imageRow) imageRow.hidden = nextMediaType !== 'image';
      if (videoRow) videoRow.hidden = nextMediaType !== 'video';
    };

    const syncState = (state, seconds = 0) => {
      stateEl.textContent = `状态：${getProposalStatusLabel(state, seconds)}`;
      const locked = state === 'generating';
      confirmBtn.disabled = locked;
      const cancelBtn = wrap.querySelector('.agent-prop-cancel');
      if (cancelBtn) cancelBtn.disabled = locked;
      updateProposalCollapsedSummary(wrap);
      if (!wrap.dataset.userExpanded) setProposalCardCollapsed(wrap, isProposalCollapsedByDefault(state));
      if (state === 'generating') {
        if (timer) clearInterval(timer);
        const started = Date.now();
        timer = setInterval(() => {
          const elapsed = Math.floor((Date.now() - started) / 1000);
          stateEl.textContent = `状态：${getProposalStatusLabel('generating', elapsed)}`;
        }, 1000);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    setProposalCardCollapsed(wrap, isCollapsed);
    syncMediaFields();
    syncState(p.executionState || 'pending');

        collapseBtn?.addEventListener('click', () => {
      const next = !wrap.classList.contains('is-collapsed');
      if (next) delete wrap.dataset.userExpanded;
      else wrap.dataset.userExpanded = '1';
      setProposalCardCollapsed(wrap, next, { forceScroll: !next, smooth: true });
    });
    wrap.querySelector('.agent-proposal-prompt')?.addEventListener('input', () => updateProposalCollapsedSummary(wrap));
    mediaTypeSelect?.addEventListener('change', syncMediaFields);

    wrap.querySelector('.agent-prop-cancel').onclick = () => {
      updateProposal(p.id, { executionState: 'cancelled' });
      syncState('cancelled');
    };
    wrap.querySelector('.agent-prop-confirm').onclick = () => executeProposal(wrap, p, syncState);
  }

  async function executeProposal(wrap, p, syncState) {
    const mediaType = wrap.querySelector('.agent-prop-media-type').value === 'video' ? 'video' : 'image';
    const prompt = wrap.querySelector('.agent-proposal-prompt').value.trim();
    const aspect = wrap.querySelector('.agent-prop-aspect').value;
    const count = clamp(parseInt(wrap.querySelector('.agent-prop-count')?.value, 10) || 1, 1, 4);
    const videoDuration = String(wrap.querySelector('.agent-prop-duration')?.value || '10');
    const proposalMeta = getProposalUiMeta(mediaType);
    const userOverrides = {
      media_type: mediaType,
      prompt,
      requested_aspect_ratio: aspect,
      ...(mediaType === 'image'
        ? { parallel_count: count }
        : { video_duration: parseInt(videoDuration, 10) || 10 })
    };

    if (!prompt) {
      bridge.flashStatus?.('提示词不能为空', 'danger');
      return;
    }

    updateProposal(p.id, { executionState: 'generating', userOverrides, error: '' });
    syncState?.('generating');
    try {
      let appended = 0;
      const referenceImages = Array.isArray(p.raw?.referenced_image_ids)
        ? p.raw.referenced_image_ids
          .map(id => getAgentImage(id))
          .filter(img => img?.dataUrl)
        : [];
      const currentParams = bridge.getCurrentGenerationParams?.() || {};

      if (typeof bridge.runAgentGeneration === 'function') {
        if (mediaType === 'video') {
          const startedAt = performance.now();
          const payload = await bridge.runAgentGeneration('video', prompt, {
            aspect,
            videoDuration,
            images: referenceImages
          });
          const result = payload?.result || payload;
          const params = payload?.params || currentParams;
          await bridge.appendResult(result, {
            ...params,
            prompt,
            aspect,
            videoDuration,
            runtimeMs: performance.now() - startedAt
          });
          appended = 1;
        } else {
          for (let i = 0; i < count; i++) {
            const startedAt = performance.now();
            const payload = await bridge.runAgentGeneration('image', prompt, {
              aspect,
              count: 1,
              images: referenceImages
            });
            const result = payload?.result || payload;
            const params = payload?.params || currentParams;
            await bridge.appendResult(result, {
              ...params,
              prompt,
              aspect,
              runtimeMs: performance.now() - startedAt
            });
            appended += 1;
          }
        }
      } else {
        if (mediaType !== 'image') {
          throw new Error('当前页面未暴露视频生成桥接方法');
        }
        const req = {
          endpoint: bridge.buildApiUrl('/v1/images/generations'),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bridge.getApiKey()}` },
          body: JSON.stringify((() => {
            const ratioApi = globalThis.ImageRatio || window.ImageRatio || {};
            const size = typeof ratioApi.resolveImageSize === 'function'
              ? (ratioApi.resolveImageSize({ aspect: '1:1', resolution: '1K', model: 'gpt-image-2' }) || '1024x1024')
              : '1024x1024';
            return { model: 'gpt-image-2', prompt, size, n: count, response_format: 'b64_json' };
          })())
        };
        const resp = await bridge.sendImageRequest(req, 'agent-generate');
        const items = Array.isArray(resp?.data?.data) ? resp.data.data : [];
        if (!resp?.ok) {
          const errorText = resp?.data?.error?.message || resp?.raw || `API 错误: ${resp?.status || 'unknown'}`;
          throw new Error(errorText);
        }
        for (const item of items) {
          const b64 = typeof item?.b64_json === 'string' ? item.b64_json : '';
          const url = typeof item?.url === 'string' ? item.url : '';
          if (!b64 && !url) continue;
          await bridge.appendResult(
            {
              mediaType: 'image',
              imageBase64: b64 ? 'data:image/png;base64,' + b64 : '',
              imageUrl: url,
              mime: 'image/png',
              text: prompt
            },
            { prompt, model: 'gpt-image-2', aspect, resolution: '1K', protocol: 'agent-generate' }
          );
          appended += 1;
        }
      }
      if (!appended) {
        throw new Error(mediaType === 'video' ? '接口已返回成功，但没有可用视频数据' : '接口已返回成功，但没有可用图片数据');
      }
      updateProposal(p.id, {
        executionState: 'completed',
        executionResult: { completedAt: Date.now(), mediaType, itemCount: appended, imageIds: [] }
      });
      syncState?.('completed');
      setProposalCardCollapsed(wrap, false);
      try {
        setSidePaneTab('recent');
        await renderRecentResults();
        scrollMessagesToBottom();
      } catch (uiErr) {
        console.warn('Agent result UI refresh failed:', uiErr);
      }
      bridge.flashStatus?.(appended > 1 ? `${proposalMeta.successText}（${appended} 个结果）` : proposalMeta.successText, 'success');
    } catch (err) {
      updateProposal(p.id, { executionState: 'failed', error: String(err?.message || err) });
      syncState?.('failed');
      setProposalCardCollapsed(wrap, false);
      bridge.flashStatus?.(proposalMeta.failurePrefix + err.message, 'danger');
    }
  }

  function appendProposalBubbleV2(p) {
    const wrap = document.createElement('div');
    wrap.className = 'agent-proposal-card';
    wrap.dataset.proposalId = p.id;
    const proposalView = getProposalView(p.raw, p.userOverrides);
    const mediaType = getProposalMediaType(proposalView);
    const aspect = getProposalAspectRatio(proposalView);
    const model = getProposalModel(proposalView, bridge, mediaType);
    const resolution = getProposalResolution(proposalView, bridge, mediaType);
    const imageQuality = getProposalImageQuality(proposalView, bridge);
    const videoDuration = getProposalVideoDuration(proposalView, bridge);
    const count = clamp(parseInt(proposalView?.parallel_count, 10) || 1, 1, 4);
    const proposalMeta = getProposalUiMeta(mediaType);
    const isCollapsed = isProposalCollapsedByDefault(p.executionState);
    const generationConfig = bridge.getGenerationOptions?.(mediaType) || {};
    const modelSeed = model || generationConfig.model || bridge.getCurrentGenerationParams?.()?.model || '';
    const modelOptions = normalizeSelectOptions(generationConfig.modelOptions, modelSeed);
    const resolutionOptions = normalizeSelectOptions(generationConfig.resolutionOptions, resolution || generationConfig.resolution || '');
    const scalarOptions = mediaType === 'video'
      ? normalizeSelectOptions(generationConfig.durationOptions, videoDuration)
      : normalizeSelectOptions(generationConfig.qualityOptions, imageQuality);
    const scalarValue = mediaType === 'video' ? videoDuration : imageQuality;
    const resolvedModel = modelOptions.some(option => option.value === modelSeed)
      ? modelSeed
      : (modelOptions[0]?.value || modelSeed);
    wrap.innerHTML = `
      <div class="agent-proposal-head">
        <div class="agent-proposal-head-main">
          <div class="agent-proposal-kicker">待确认提案</div>
          <div class="agent-proposal-title agent-proposal-kind-title">${proposalMeta.title}</div>
        </div>
        <div class="agent-proposal-head-side">
          <div class="agent-proposal-status">${getProposalStatusLabel(p.executionState)}</div>
          <button class="agent-proposal-collapse" type="button" aria-expanded="${String(!isCollapsed)}">${isCollapsed ? '展开' : '收起'}</button>
        </div>
      </div>
      <div class="agent-proposal-summary" title="折叠时显示提示词摘要">
        <span class="agent-proposal-summary-label">提示词</span>
        <div class="agent-proposal-summary-text">${esc(formatProposalPromptSummary(proposalView?.prompt || ''))}</div>
      </div>
      <div class="agent-proposal-body">
        <label class="agent-proposal-field">
          <span>提示词</span>
          <textarea class="agent-proposal-prompt" rows="3">${esc(proposalView?.prompt || '')}</textarea>
        </label>
        <div class="agent-proposal-row agent-proposal-row-primary">
          <label class="agent-proposal-control">
            <span class="agent-proposal-control-label">类型</span>
            <select class="agent-prop-media-type">
              <option value="image" ${mediaType === 'image' ? 'selected' : ''}>图片</option>
              <option value="video" ${mediaType === 'video' ? 'selected' : ''}>视频</option>
            </select>
          </label>
          <label class="agent-proposal-control">
            <span class="agent-proposal-control-label">比例</span>
            <select class="agent-prop-aspect">
              ${ASPECT_RATIO_OPTIONS.map(option => `<option value="${option}" ${option === aspect ? 'selected' : ''}>${option}</option>`).join('')}
            </select>
          </label>
        </div>
        <details class="agent-proposal-advanced">
          <summary>
            <span class="agent-proposal-advanced-title">更多参数</span>
            <span class="agent-proposal-advanced-hint">模型 / 分辨率 / 质量</span>
          </summary>
          <div class="agent-proposal-advanced-body">
            <div class="agent-proposal-row">
              <label class="agent-proposal-control">
                <span class="agent-proposal-control-label">模型</span>
                <select class="agent-prop-model">
                  ${modelOptions.map(option => `<option value="${esc(option.value)}" ${option.value === resolvedModel ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}
                </select>
              </label>
              <label class="agent-proposal-control">
                <span class="agent-proposal-control-label">分辨率</span>
                <select class="agent-prop-resolution">
                  ${resolutionOptions.map(option => `<option value="${esc(option.value)}" ${option.value === resolution ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}
                </select>
              </label>
            </div>
            <div class="agent-proposal-row">
              <label class="agent-proposal-control">
                <span class="agent-proposal-control-label agent-prop-scalar-label">${getProposalScalarLabel(mediaType)}</span>
                <select class="agent-prop-scalar">
                  ${scalarOptions.map(option => `<option value="${esc(option.value)}" ${option.value === scalarValue ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}
                </select>
              </label>
              <label class="agent-proposal-control">
                <span class="agent-proposal-control-label agent-prop-count-label">${mediaType === 'video' ? '条数' : '张数'}</span>
                <input class="agent-prop-count" type="number" min="1" max="4" value="${count}">
              </label>
            </div>
          </div>
        </details>
      </div>
      <div class="agent-proposal-results" hidden></div>
      <div class="agent-proposal-footer agent-proposal-collapsed-actions">
        <div class="agent-proposal-actions">
          <button class="agent-btn agent-prop-confirm" type="button">${proposalMeta.confirmText}</button>
          <button class="agent-btn agent-prop-cancel" type="button">取消</button>
        </div>
        <div class="agent-proposal-state"></div>
      </div>
    `;
    $messages.appendChild(wrap);

    const collapseBtn = wrap.querySelector('.agent-proposal-collapse');
    const confirmBtn = wrap.querySelector('.agent-prop-confirm');
    const modelSelect = wrap.querySelector('.agent-prop-model');
    const mediaTypeSelect = wrap.querySelector('.agent-prop-media-type');
    const resolutionSelect = wrap.querySelector('.agent-prop-resolution');
    const scalarSelect = wrap.querySelector('.agent-prop-scalar');
    const scalarLabel = wrap.querySelector('.agent-prop-scalar-label');
    const countLabel = wrap.querySelector('.agent-prop-count-label');
    const kindTitle = wrap.querySelector('.agent-proposal-kind-title');
    const promptField = wrap.querySelector('.agent-proposal-prompt');
    const stateEl = wrap.querySelector('.agent-proposal-state');
    let timer = null;

    const syncSelectOptions = (selectEl, options, preferredValue) => {
      if (!selectEl) return;
      const normalized = normalizeSelectOptions(options, preferredValue);
      const selectedValue = String(preferredValue || normalized[0]?.value || '');
      selectEl.innerHTML = normalized
        .map(option => `<option value="${esc(option.value)}" ${option.value === selectedValue ? 'selected' : ''}>${esc(option.label)}</option>`)
        .join('');
      if (selectedValue) selectEl.value = selectedValue;
      if (!selectEl.value && normalized[0]?.value) selectEl.value = normalized[0].value;
    };

    const syncMediaFields = () => {
      const nextMediaType = mediaTypeSelect?.value === 'video' ? 'video' : 'image';
      const meta = getProposalUiMeta(nextMediaType);
      const nextConfig = bridge.getGenerationOptions?.(nextMediaType) || {};
      const nextResolutionOptions = normalizeSelectOptions(nextConfig.resolutionOptions, nextConfig.resolution || '');
      const nextResolutionValue = nextConfig.resolution || nextResolutionOptions[0]?.value || '';
      const nextScalarOptions = nextMediaType === 'video'
        ? normalizeSelectOptions(nextConfig.durationOptions, nextConfig.duration || '10')
        : normalizeSelectOptions(nextConfig.qualityOptions, nextConfig.quality || 'auto');
      const nextScalarValue = nextMediaType === 'video'
        ? (nextConfig.duration || nextScalarOptions[0]?.value || '10')
        : (nextConfig.quality || nextScalarOptions[0]?.value || 'auto');
      if (kindTitle) kindTitle.textContent = meta.title;
      if (confirmBtn) confirmBtn.textContent = meta.confirmText;
      if (promptField) promptField.placeholder = getProposalPromptPlaceholder(nextMediaType);
      if (countLabel) countLabel.textContent = nextMediaType === 'video' ? '条数' : '张数';
      if (scalarLabel) scalarLabel.textContent = getProposalScalarLabel(nextMediaType);
      syncSelectOptions(modelSelect, nextConfig.modelOptions, nextConfig.model || '');
      syncSelectOptions(resolutionSelect, nextResolutionOptions, nextResolutionValue);
      syncSelectOptions(scalarSelect, nextScalarOptions, nextScalarValue);
    };

    const syncState = (state, seconds = 0) => {
      stateEl.textContent = `状态：${getProposalStatusLabel(state, seconds)}`;
      const locked = state === 'generating';
      confirmBtn.disabled = locked;
      const cancelBtn = wrap.querySelector('.agent-prop-cancel');
      if (cancelBtn) cancelBtn.disabled = locked;
      updateProposalCollapsedSummary(wrap);
      if (!wrap.dataset.userExpanded) setProposalCardCollapsed(wrap, isProposalCollapsedByDefault(state));
      if (state === 'generating') {
        if (timer) clearInterval(timer);
        const started = Date.now();
        timer = setInterval(() => {
          const elapsed = Math.floor((Date.now() - started) / 1000);
          stateEl.textContent = `状态：${getProposalStatusLabel('generating', elapsed)}`;
        }, 1000);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    setProposalCardCollapsed(wrap, isCollapsed);
    syncMediaFields();
    syncState(p.executionState || 'pending');
    renderProposalResults(
      wrap,
      p.executionResult?.imageIds || [],
      p.executionResult?.previewSrcs || []
    );
    const advanced = wrap.querySelector('.agent-proposal-advanced');
    if (advanced && (!modelSelect || modelSelect.options.length <= 1)) {
      advanced.open = true;
    }

    collapseBtn?.addEventListener('click', () => {
      const next = !wrap.classList.contains('is-collapsed');
      if (next) delete wrap.dataset.userExpanded;
      else wrap.dataset.userExpanded = '1';
      setProposalCardCollapsed(wrap, next, { forceScroll: !next, smooth: true });
    });
    promptField?.addEventListener('input', () => updateProposalCollapsedSummary(wrap));
    mediaTypeSelect?.addEventListener('change', () => {
      syncMediaFields();
      if (advanced && modelSelect && modelSelect.options.length <= 1) advanced.open = true;
    });

    wrap.querySelector('.agent-prop-cancel').onclick = () => {
      updateProposal(p.id, { executionState: 'cancelled' });
      syncState('cancelled');
    };
    wrap.querySelector('.agent-prop-confirm').onclick = () => executeProposalV2(wrap, p, syncState);
  }

  async function executeProposalV2(wrap, p, syncState) {
    const mediaType = wrap.querySelector('.agent-prop-media-type').value === 'video' ? 'video' : 'image';
    const prompt = wrap.querySelector('.agent-proposal-prompt').value.trim();
    const model = String(wrap.querySelector('.agent-prop-model')?.value || '');
    const aspect = wrap.querySelector('.agent-prop-aspect').value;
    const resolution = String(wrap.querySelector('.agent-prop-resolution')?.value || '');
    const scalarValue = String(wrap.querySelector('.agent-prop-scalar')?.value || '');
    const count = clamp(parseInt(wrap.querySelector('.agent-prop-count')?.value, 10) || 1, 1, 4);
    const proposalMeta = getProposalUiMeta(mediaType);
    const generationConfig = bridge.getGenerationOptions?.(mediaType) || {};
    const currentParams = bridge.getCurrentGenerationParams?.() || {};
    const effectiveResolution = String(resolution || generationConfig.resolution || currentParams.resolution || getProposalResolution(getProposalView(p.raw, p.userOverrides), bridge, mediaType) || '');
    const videoDuration = mediaType === 'video' ? String(scalarValue || generationConfig.duration || '10') : '';
    const imageQuality = mediaType === 'image' ? String(scalarValue || generationConfig.quality || 'auto') : '';
    const userOverrides = {
      media_type: mediaType,
      prompt,
      requested_model: model,
      requested_aspect_ratio: aspect,
      requested_output_size: effectiveResolution,
      ...(mediaType === 'image'
        ? { parallel_count: count, gpt_image_quality: imageQuality }
        : { parallel_count: count, video_duration: parseInt(videoDuration, 10) || 10 })
    };

    if (!prompt) {
      bridge.flashStatus?.('提示词不能为空', 'danger');
      return;
    }

    updateProposal(p.id, { executionState: 'generating', userOverrides, error: '' });
    syncState?.('generating');
    try {
      let appended = 0;
      const imageIds = [];
      const previewSrcs = [];
      const referenceImages = Array.isArray(p.raw?.referenced_image_ids)
        ? p.raw.referenced_image_ids
          .map(id => getAgentImage(id))
          .filter(img => img?.dataUrl)
        : [];

      if (typeof bridge.runAgentGeneration === 'function') {
        if (mediaType === 'video') {
          for (let i = 0; i < count; i++) {
            const startedAt = performance.now();
            const payload = await bridge.runAgentGeneration('video', prompt, {
              model,
              aspect,
              resolution: effectiveResolution,
              videoDuration,
              images: referenceImages
            });
            const result = payload?.result || payload;
            const params = payload?.params || currentParams;
            await bridge.appendResult(result, {
              ...params,
              prompt,
              model,
              aspect,
              resolution: effectiveResolution,
              videoDuration,
              runtimeMs: performance.now() - startedAt
            });
            const stored = await storeGeneratedResultImage(result, prompt);
            if (stored?.id) imageIds.push(stored.id);
            if (stored?.previewSrc) previewSrcs.push(stored.previewSrc);
            appended += 1;
          }
        } else {
          for (let i = 0; i < count; i++) {
            const startedAt = performance.now();
            const payload = await bridge.runAgentGeneration('image', prompt, {
              model,
              aspect,
              resolution: effectiveResolution,
              quality: imageQuality,
              count: 1,
              images: referenceImages
            });
            const result = payload?.result || payload;
            const params = payload?.params || currentParams;
            await bridge.appendResult(result, {
              ...params,
              prompt,
              model,
              aspect,
              resolution: effectiveResolution,
              quality: imageQuality,
              runtimeMs: performance.now() - startedAt
            });
            const stored = await storeGeneratedResultImage(result, prompt);
            if (stored?.id) imageIds.push(stored.id);
            if (stored?.previewSrc) previewSrcs.push(stored.previewSrc);
            appended += 1;
          }
        }
      } else {
        if (mediaType !== 'image') {
          throw new Error('当前页面未暴露视频生成桥接方法');
        }
        const req = {
          endpoint: bridge.buildApiUrl('/v1/images/generations'),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bridge.getApiKey()}` },
          body: JSON.stringify((() => {
            const ratioApi = globalThis.ImageRatio || window.ImageRatio || {};
            const modelName = model || 'gpt-image-2';
            const size = typeof ratioApi.resolveImageSize === 'function'
              ? (ratioApi.resolveImageSize({ aspect, resolution: effectiveResolution || '1K', model: modelName }) || '1024x1024')
              : (effectiveResolution && /\d+x\d+/i.test(effectiveResolution) ? effectiveResolution : '1024x1024');
            const payload = { model: modelName, prompt, n: count, response_format: 'b64_json' };
            if (size) payload.size = size;
            if (aspect && aspect !== 'auto') payload.aspect_ratio = aspect;
            return payload;
          })())
        };
        const resp = await bridge.sendImageRequest(req, 'agent-generate');
        const items = Array.isArray(resp?.data?.data) ? resp.data.data : [];
        if (!resp?.ok) {
          const errorText = resp?.data?.error?.message || resp?.raw || `API 错误: ${resp?.status || 'unknown'}`;
          throw new Error(errorText);
        }
        for (const item of items) {
          const b64 = typeof item?.b64_json === 'string' ? item.b64_json : '';
          const url = typeof item?.url === 'string' ? item.url : '';
          if (!b64 && !url) continue;
          const result = {
            mediaType: 'image',
            imageBase64: b64 ? 'data:image/png;base64,' + b64 : '',
            imageUrl: url,
            mime: 'image/png',
            text: prompt
          };
          await bridge.appendResult(
            result,
            { prompt, model: model || 'gpt-image-2', aspect, resolution: effectiveResolution || '1K', quality: imageQuality, protocol: 'agent-generate' }
          );
          const stored = await storeGeneratedResultImage(result, prompt);
          if (stored?.id) imageIds.push(stored.id);
          if (stored?.previewSrc) previewSrcs.push(stored.previewSrc);
          appended += 1;
        }
      }

      if (!appended) {
        throw new Error(mediaType === 'video' ? '接口已返回成功，但没有可用视频数据' : '接口已返回成功，但没有可用图片数据');
      }
      updateProposal(p.id, {
        executionState: 'completed',
        executionResult: {
          completedAt: Date.now(),
          mediaType,
          itemCount: appended,
          imageIds,
          previewSrcs
        }
      });
      syncState?.('completed');
      renderProposalResults(wrap, imageIds, previewSrcs);
      setProposalCardCollapsed(wrap, false);
      try {
        setSidePaneTab('recent');
        await renderRecentResults();
        scrollMessagesToBottom();
      } catch (uiErr) {
        console.warn('Agent result UI refresh failed:', uiErr);
      }
      bridge.flashStatus?.(appended > 1 ? `${proposalMeta.successText}（${appended} 个结果）` : proposalMeta.successText, 'success');
    } catch (err) {
      updateProposal(p.id, { executionState: 'failed', error: String(err?.message || err) });
      syncState?.('failed');
      setProposalCardCollapsed(wrap, false);
      bridge.flashStatus?.(proposalMeta.failurePrefix + (err?.message || err), 'danger');
    }
  }

  function switchAgent(id) {
    if (ctrl.current) { try { ctrl.current.abort(); } catch { } ctrl.current = null; setSending(false); setStatus('已取消切换'); }
    setActiveAgentId(id);
    renderAll();
  }

  async function send() {
    const text = $input.value.trim();
    const attachedImageIds = Array.from(draftReferenceIds);
    if (!text && !attachedImageIds.length) return;
    $input.value = '';
    draftReferenceIds.clear();
    renderDraftAttachments();
    const userMsg = { id: uuid(), role: 'user', text, createdAt: Date.now(), attachedImageIds };
    putMessage(userMsg);
    autoTitleAgent(getActiveAgentId());
    const sess = loadActiveSession();
    appendMessageBubble(userMsg);
    renderSidebar();
    $title.textContent = sess.title;

    const placeholder = { id: 'streaming-' + Date.now(), role: 'assistant', text: '', reasoning: '', createdAt: Date.now() };
    putMessage(placeholder);
    appendMessageBubble(placeholder);
    const bubble = $messages.lastElementChild;

    setSending(true); setStatus('Agent 思考中…');
    let accText = '', accReason = '';

    const ac = new AbortController();
    ctrl.current = ac;
    const sessForSend = loadActiveSession();
    const contextTurns = normalizeContextTurns(sessForSend?.contextTurns, DEFAULT_CONTEXT_TURNS);
    const history = sliceHistoryByTurns(
      sessForSend.messages.slice(0, -1).map(m => ({ role: m.role, text: m.text, attachedImageIds: m.attachedImageIds })),
      contextTurns
    );
    const sess2 = loadActiveSession();
    const model = bridge.getTextModel();
    const visionEnabled = supportsVision(model);
    const instructions = buildInstructions('conversation', buildCatalog(sess2, getAgentImage));
    const inputMsgs = await buildInputMessages(history, visionEnabled ? getAgentImage : async () => null);
    // 默认能联网就联网：始终附带 web_search，由上游模型/接口决定是否实际调用
    const tools = [PROPOSE_TOOL, { type: 'web_search' }];

    try {
      const handle = streamAgentChat({
        apiKey: bridge.getApiKey(),
        model,
        baseUrl: bridge.getBaseUrl(),
        endpoint: bridge.buildApiUrl('/v1/responses'),
        chatEndpoint: bridge.buildApiUrl('/v1/chat/completions'),
        instructions, tools, history: inputMsgs, signal: ac.signal
      }, {
        onDelta: (t) => { accText += t; bubble.querySelector('.agent-msg-text').textContent = accText; scrollMessagesToBottom(); },
        onReasoning: (t) => {
          accReason += t;
          let det = bubble.querySelector('.agent-reasoning');
          if (!det) {
            det = document.createElement('details');
            det.className = 'agent-reasoning';
            det.innerHTML = '<summary>💭 思考过程</summary><pre></pre>';
            bubble.appendChild(det);
          }
          det.querySelector('pre').textContent = accReason;
        },
        onRetry: (nextAttempt, maxAttempts) => {
          setStatus(`接口响应异常，正在重试（${nextAttempt}/${maxAttempts}）`);
        },
        onDone: (fullText, proposal) => {
          placeholder.text = fullText;
          placeholder.reasoning = accReason;
          if (proposal) {
            const pid = uuid();
            const p = { id: pid, raw: proposal, executionState: 'pending' };
            putProposal(p);
            placeholder.proposalId = pid;
            appendProposalBubbleV2(p);
            scrollMessagesToBottom();
          }
          updateMessage(placeholder.id, { text: fullText, reasoning: accReason, proposalId: placeholder.proposalId });
          setStatus('空闲');
        },
        onError: (err) => {
          placeholder.text = `Error: ${err.message}`;
          updateMessage(placeholder.id, { text: placeholder.text, reasoning: accReason });
          bubble.querySelector('.agent-msg-text').textContent = placeholder.text;
          setStatus('Error: ' + err.message);
        }
      });
      $abort.onclick = () => { handle.abort(); setStatus('已取消'); setSending(false); };
      await handle.promise;
    } catch (err) {
      placeholder.text = `Error: ${err.message}`;
      updateMessage(placeholder.id, { text: placeholder.text, reasoning: accReason });
      bubble.querySelector('.agent-msg-text').textContent = placeholder.text;
      setStatus('Error: ' + err.message);
    } finally {
      setSending(false);
      ctrl.current = null;
    }
  }

  $new.onclick = () => {
    const now = Date.now();
    if (now - lastCreateAt < 300) return;
    lastCreateAt = now;
    createAgent('新会话');
    renderAll();
  };

  $agentList.onclick = (e) => {
    const delBtn = e.target.closest('.agent-agent-del');
    if (delBtn) {
      const item = delBtn.closest('.agent-agent-item');
      const id = item?.dataset.agentId;
      if (!id) return;
      const list = loadAgentList();
      if (Object.keys(list.agents).length <= 1) return;
      if (!confirm('确定删除这个会话吗？')) return;
      deleteAgent(id);
      renderAll();
      bridge.flashStatus?.('已删除会话', 'success');
      return;
    }
    const item = e.target.closest('.agent-agent-item');
    const id = item?.dataset.agentId;
    if (id && id !== getActiveAgentId()) switchAgent(id);
  };

  $agentList.addEventListener('keydown', (e) => {
    if (e.target.closest('.agent-agent-del')) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const id = e.target.closest('.agent-agent-item')?.dataset.agentId;
    if (id && id !== getActiveAgentId()) switchAgent(id);
  });

  $export.onclick = () => {
    const sess = activeSession();
    if (!sess) return;
    if ((sess.messages || []).length === 0) {
      bridge.flashStatus?.('当前会话为空，无可导出内容', 'danger');
      return;
    }
    if ((sess.messages || []).length > 200) {
      if (!confirm('MD 较大，仍继续？')) return;
    }
    downloadAgentMarkdown(sess);
    bridge.flashStatus?.('已导出 MD', 'success');
  };

  $modelSelect?.addEventListener('change', () => {
    bridge.setTextModel?.($modelSelect.value);
    renderModelSelect();
  });

  $refreshAssets?.addEventListener('click', async () => {
    await refreshAssetPanes();
    bridge.flashStatus?.('已同步主工作台素材', 'success');
  });

  if ($contextTurns) {
    $contextTurns.onchange = () => {
      const next = normalizeContextTurns($contextTurns.value, DEFAULT_CONTEXT_TURNS);
      const label = formatContextTurnsLabel(next);
      saveActiveSession({ contextTurns: next, webSearchEnabled: true });
      $contextTurns.value = String(next);
      if ($contextTurnsValue) $contextTurnsValue.textContent = label;
      $contextTurns.title = label;
      $contextTurns.setAttribute('aria-valuetext', label);
    };
  }

  $close.onclick = close;
  document.addEventListener('keydown', escClose);
  function escClose(e) { if (e.key === 'Escape' && document.body.contains(root)) close(); }
  function close() {
    if (ctrl.current) try { ctrl.current.abort(); } catch { }
    document.removeEventListener('keydown', escClose);
    document.removeEventListener('focusin', keepFocusInside, true);
    document.body.classList.remove('agent-mode-open');
    restoreBackground();
    root.remove();
    if (returnFocus && returnFocus !== document.body && document.contains(returnFocus) && typeof returnFocus.focus === 'function') {
      returnFocus.focus();
    }
  }

  $send.onclick = send;
  $input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  $sideTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setSidePaneTab(tab.dataset.agentPane));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? $sideTabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + $sideTabs.length) % $sideTabs.length;
      setSidePaneTab($sideTabs[nextIndex]?.dataset.agentPane, true);
    });
  });

  renderModelSelect();
  renderAll();
  hydrateReady.then(() => { if (root.isConnected) renderAll(); }).catch(() => {});
  setSidePaneTab('reference');
  root.__agentClose = close;
  if (!$input.disabled) $input.focus();
  return { close };
}

