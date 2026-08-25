const BATCH_SIZE = 30;
const CATEGORIES = ['人像摄影', '商品品牌', '海报排版', '插画动漫', '信息图表', '空间场景', '其他'];
const DIRECT_FALLBACK_DELAY_MS = 3500;
const PROXY_FALLBACK_DELAY_MS = 6000;
const RELAY_FALLBACK_DELAY_MS = 8000;

let activeState = null;
let imageObserver = null;
let imageFallbackObserver = null;
let loadMoreScrollRoot = null;
let loadMoreScrollHandler = null;
const imageFallbackTimers = new WeakMap();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value, { allowData = true } = {}) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (allowData && getDataUrlParts(text) && estimateDataUrlBytes(text) <= COVER_MAX_ENCODED_BYTES) return text;
  try {
    const url = new URL(text, window.location.href);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch {}
  return '';
}

function buildCommunityMediaProxyUrl(source) {
  const original = safeUrl(source, { allowData: false });
  if (!/^https:\/\//i.test(original)) return '';
  try {
    const endpoint = globalThis.APP_CONFIG?.apiProxyEndpoint || 'api-proxy.php';
    const proxy = new URL(endpoint, window.location.href);
    proxy.searchParams.set('media', '1');
    proxy.searchParams.set('target', original);
    return proxy.href;
  } catch {
    return '';
  }
}

function buildCommunityMediaRelayUrl(source) {
  const original = safeUrl(source, { allowData: false });
  if (!/^https:\/\//i.test(original)) return '';
  try {
    const target = new URL(original);
    const allowed = globalThis.APP_CONFIG?.communityRelayHosts || [
      'pbs.twimg.com',
      'linux.do',
      'i.mji.rip',
      'i.mij.rip'
    ];
    if (!allowed.includes(target.hostname.toLowerCase())) return '';
    const relay = new URL('https://images.weserv.nl/');
    relay.searchParams.set('url', original);
    relay.searchParams.set('we', '');
    return relay.href;
  } catch {
    return '';
  }
}

function buildCommunityGithubMirrorUrl(source) {
  const original = safeUrl(source, { allowData: false });
  if (!/^https:\/\//i.test(original)) return '';
  try {
    const url = new URL(original);
    const segments = url.pathname.split('/').filter(Boolean);
    if (url.hostname.toLowerCase() === 'cdn.jsdelivr.net' && segments[0] === 'gh' && segments.length >= 4) {
      const repoRef = segments[2];
      const separator = repoRef.indexOf('@');
      if (separator > 0 && separator < repoRef.length - 1) {
        const owner = segments[1];
        const repo = repoRef.slice(0, separator);
        const ref = repoRef.slice(separator + 1);
        const filePath = segments.slice(3).join('/');
        return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}${url.search}`;
      }
    }
    if (url.hostname.toLowerCase() === 'raw.githubusercontent.com' && segments.length >= 4) {
      const [owner, repo, ref] = segments;
      const filePath = segments.slice(3).join('/');
      return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${filePath}${url.search}`;
    }
  } catch {}
  return '';
}

function getPromptImageCandidates(source, { preferProxy = false, useRelay = true, fallbackSources = [] } = {}) {
  const original = safeUrl(source);
  if (!original) return [];
  const sources = [original, ...fallbackSources]
    .map(item => safeUrl(item))
    .filter(Boolean);
  const candidates = [];

  sources.forEach((item, index) => {
    if (/^data:/i.test(item)) {
      candidates.push(item);
      return;
    }

    const proxy = buildCommunityMediaProxyUrl(item);
    const relay = useRelay ? buildCommunityMediaRelayUrl(item) : '';
    const githubMirror = buildCommunityGithubMirrorUrl(item);
    if (index === 0 && preferProxy && proxy) candidates.push(proxy);
    candidates.push(item);
    if (proxy) candidates.push(proxy);
    if (relay) candidates.push(relay);
    if (githubMirror) candidates.push(githubMirror);
  });

  return [...new Set(candidates.filter(Boolean))];
}

function addImageCacheBust(source) {
  try {
    const url = new URL(source, window.location.href);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      url.searchParams.set('prompt-library-retry', String(Date.now()));
      return url.href;
    }
  } catch {}
  return source;
}

function renderPromptImage(source, alt, options = {}) {
  const original = safeUrl(source);
  if (!original) return '';
  const candidates = getPromptImageCandidates(original, options);
  const initial = candidates[0] || original;
  const proxy = candidates.find(c => c.startsWith('data:') ? false : /api-proxy|\.php\?/i.test(c) || c.includes('media=1')) || '';
  const relay = candidates.find(c => /images\.weserv\.nl|wsrv\.nl/i.test(c)) || '';
  const parts = [
    '<img',
    'src="' + escapeHtml(initial) + '"',
    'alt="' + escapeHtml(alt) + '"',
    'loading="lazy"',
    'decoding="async"',
    'referrerpolicy="no-referrer"',
    'data-image-original-url="' + escapeHtml(original) + '"',
    'data-image-candidates="' + escapeHtml(JSON.stringify(candidates)) + '"'
  ];
  if (proxy) parts.push('data-image-proxy-url="' + escapeHtml(proxy) + '"');
  if (relay) parts.push('data-image-relay-url="' + escapeHtml(relay) + '"');
  parts.push('data-image-attempt="0">');
  return parts.join(' ');
}

function clearImageFallbackTimer(image) {
  const timer = imageFallbackTimers.get(image);
  if (timer) window.clearTimeout(timer);
  imageFallbackTimers.delete(image);
}

function getImageCandidateUrls(image) {
  if (!image) return [];
  try {
    const encoded = image.dataset?.imageCandidates || '';
    const parsed = encoded ? JSON.parse(encoded) : [];
    if (Array.isArray(parsed)) {
      const candidates = parsed.map(item => safeUrl(item)).filter(Boolean);
      if (candidates.length) return [...new Set(candidates)];
    }
  } catch {}

  const original = safeUrl(image.dataset?.imageOriginalUrl);
  const proxy = safeUrl(image.dataset?.imageProxyUrl, { allowData: false });
  const relay = safeUrl(image.dataset?.imageRelayUrl, { allowData: false });
  return [...new Set([original, proxy, relay].filter(Boolean))];
}

function getImageFallbackDelay(url) {
  if (/images\.weserv\.nl|wsrv\.nl/i.test(url)) return RELAY_FALLBACK_DELAY_MS;
  if (/api-proxy|\.php\?|media=1/i.test(url)) return PROXY_FALLBACK_DELAY_MS;
  return DIRECT_FALLBACK_DELAY_MS;
}

function getImageFallbackStages(image) {
  return getImageCandidateUrls(image).map(url => ({
    url,
    delay: getImageFallbackDelay(url)
  }));
}

function scheduleImageFallback(image) {
  clearImageFallbackTimer(image);
  if (image.complete && image.naturalWidth > 0) return;
  const stages = getImageFallbackStages(image);
  const attempt = Number(image.dataset.imageAttempt) || 0;
  const next = stages[attempt + 1];
  if (!next) return;
  const timer = window.setTimeout(() => {
    imageFallbackTimers.delete(image);
    if (!image.isConnected) return;
    if (image.complete && image.naturalWidth > 0) return;
    const currentAttempt = Number(image.dataset.imageAttempt) || 0;
    if (currentAttempt !== attempt) return;
    image.dataset.imageAttempt = String(attempt + 1);
    image.src = addImageCacheBust(next.url);
    scheduleImageFallback(image);
  }, next.delay);
  imageFallbackTimers.set(image, timer);
}

function ensureImageFallbackObserver() {
  if (imageFallbackObserver) return imageFallbackObserver;
  if (typeof IntersectionObserver === 'undefined') return null;
  imageFallbackObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const image = entry.target;
      if (entry.isIntersecting) {
        if (!image.complete || image.naturalWidth === 0) {
          scheduleImageFallback(image);
        }
      } else {
        clearImageFallbackTimer(image);
      }
    });
  }, { rootMargin: '400px 0px', threshold: 0.01 });
  return imageFallbackObserver;
}

function observeImageFallback(image) {
  const observer = ensureImageFallbackObserver();
  if (!observer) {
    // Fallback: schedule immediately
    scheduleImageFallback(image);
    return;
  }
  observer.observe(image);
}

function disconnectImageFallbackObserver() {
  if (imageFallbackObserver) {
    imageFallbackObserver.disconnect();
    imageFallbackObserver = null;
  }
}

function getBridge() {
  return globalThis.PromptLibraryBridge || globalThis.AgentBridge || {};
}

function getCanvasBridge() {
  return globalThis.CanvasBridge || {};
}

function setWorkspaceNavActive(workspace) {
  if (window.AppUtils?.setActiveWorkspace) return window.AppUtils.setActiveWorkspace(workspace);
  const value = String(workspace || 'studio');
  document.querySelectorAll('[data-workspace-nav]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.workspaceNav === value);
  });
}

function normalizeEntry(entry = {}) {
  const content = String(entry.content || entry.prompt || '').trim();
  const rawOrigin = String(entry.origin || (entry.source === 'local' ? 'local' : 'curated'));
  const origin = rawOrigin === 'curated' ? 'public' : rawOrigin;
  const rawCoverUrl = String(entry.coverUrl || '').trim();
  const coverUrl = origin === 'local'
    ? (getDataUrlParts(rawCoverUrl) && estimateDataUrlBytes(rawCoverUrl) <= COVER_MAX_ENCODED_BYTES
      ? rawCoverUrl
      : (/^https?:\/\//i.test(rawCoverUrl) ? rawCoverUrl : ''))
    : (/^https?:\/\//i.test(rawCoverUrl) ? rawCoverUrl : '');
  return {
    ...entry,
    id: String(entry.id ?? `prompt-${Math.random().toString(36).slice(2)}`),
    origin,
    title: String(entry.title || content.slice(0, 42) || '未命名提示词').trim(),
    content,
    description: String(entry.description || '').trim(),
    coverUrl,
    referenceImageUrls: Array.isArray(entry.referenceImageUrls) ? entry.referenceImageUrls.filter(Boolean).map(String) : [],
    category: CATEGORIES.includes(entry.category) ? entry.category : '其他',
    tags: Array.isArray(entry.tags) ? entry.tags.filter(Boolean).map(String) : [],
    author: String(entry.author || '').trim(),
    sourceId: String(entry.sourceId || '').trim(),
    sourceUrl: String(entry.sourceUrl || '').trim(),
    attributions: Array.isArray(entry.attributions) ? entry.attributions.filter(Boolean) : [],
    imageModel: String(entry.imageModel || '').trim(),
    imageMode: String(entry.imageMode || '').trim(),
    createdAt: Number(entry.createdAt || entry.created_at) || 0,
    updatedAt: Number(entry.updatedAt || entry.updated_at) || 0,
    usageCount: Number(entry.usageCount) || 0
  };
}

function sourceLabel(entry) {
  if (entry.origin === 'local') return '我的';
  if (entry.origin === 'community') return '社区';
  if (entry.origin === 'public') return '公共库';
  return '社区';
}

function sourceClass(entry) {
  if (entry.origin === 'local') return 'is-local';
  if (entry.origin === 'community') return 'is-community';
  return entry.origin === 'public' ? 'is-public' : 'is-community';
}

function filteredEntries(state) {
  const query = String(state.query || '').trim().toLowerCase();
  return state.entries.filter(entry => {
    if (state.tab === 'mine' && entry.origin !== 'local') return false;
    if (state.tab === 'discover' && entry.origin === 'local') return false;
    if (state.category !== 'all' && entry.category !== state.category) return false;
    if (state.source !== 'all' && entry.sourceId !== state.source) return false;
    if (state.model !== 'all' && entry.imageModel !== state.model) return false;
    if (!query) return true;
    const haystack = [entry.title, entry.content, entry.description, entry.author, entry.sourceId, ...entry.tags]
      .join('\n')
      .toLowerCase();
    return haystack.includes(query);
  });
}

function renderOptions(values, selected, allLabel) {
  return [`<option value="all">${escapeHtml(allLabel)}</option>`, ...values.map(value => (
    `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(value)}</option>`
  ))].join('');
}

function parseList(value, separator = /[,，\n]/) {
  return [...new Set(String(value || '').split(separator).map(item => item.trim()).filter(Boolean))];
}

function formatList(values, separator = ', ') {
  return Array.isArray(values) ? values.filter(Boolean).join(separator) : '';
}

function parseImportedEntries(text, fileName = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];

  if (/\.json$/i.test(fileName)) {
    const payload = JSON.parse(trimmed);
    const items = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.prompts) ? payload.prompts : (Array.isArray(payload?.entries) ? payload.entries : []));
    return items.map(item => {
      if (typeof item === 'string') return { title: item.slice(0, 42), content: item };
      const content = String(item?.content || item?.prompt || item?.text || '').trim();
      if (!content) return null;
      return {
        ...item,
        title: String(item?.title || item?.name || content.slice(0, 42)).trim(),
        content
      };
    }).filter(Boolean);
  }

  const blocks = trimmed.split(/\n\s*\n/g).map(item => item.trim()).filter(Boolean);
  const rows = blocks.length > 1 ? blocks : trimmed.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  return rows.map(row => {
    const csv = /\.csv$/i.test(fileName) ? row.match(/^([^,，]{1,80})[,，](.+)$/) : null;
    return csv
      ? { title: csv[1].trim(), content: csv[2].trim() }
      : { title: row.slice(0, 42), content: row };
  }).filter(item => item.content);
}

async function readFileText(file) {
  if (typeof file?.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

const COVER_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const COVER_MAX_ENCODED_BYTES = 2 * 1024 * 1024;
const COVER_MAX_DIMENSION = 2048;
const COVER_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function getDataUrlParts(value) {
  const match = String(value || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i);
  return match ? { mime: match[1].toLowerCase(), base64: match[2].replace(/\s+/g, '') } : null;
}

function estimateDataUrlBytes(value) {
  const parts = String(value || '').split(',', 2);
  if (parts.length !== 2) return 0;
  return Math.floor(parts[1].replace(/\s+/g, '').length * 3 / 4);
}

async function readFileBytes(file) {
  if (file?.arrayBuffer) return new Uint8Array(await file.arrayBuffer());
  return new Uint8Array(await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || new ArrayBuffer(0));
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
    reader.readAsArrayBuffer(file);
  }));
}

function sniffImageMime(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}

function decodeImageFile(file) {
  return new Promise((resolve, reject) => {
    if (typeof Image !== 'function' || typeof URL?.createObjectURL !== 'function') {
      reject(new Error('当前浏览器不支持图片解码'));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error('图片无法解码'));
        return;
      }
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片无法解码'));
    };
    image.src = url;
  });
}

function encodeCoverImage(image, options = {}) {
  const maxDimension = Math.min(Number(options.maxDimension) || COVER_MAX_DIMENSION, COVER_MAX_DIMENSION);
  const maxBytes = Number(options.maxBytes) || COVER_MAX_ENCODED_BYTES;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const baseWidth = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const baseHeight = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('当前浏览器无法处理图片');

  const dimensions = [...new Set([
    [baseWidth, baseHeight],
    [Math.round(baseWidth * 0.8), Math.round(baseHeight * 0.8)],
    [Math.round(baseWidth * 0.625), Math.round(baseHeight * 0.625)],
    [Math.round(baseWidth * 0.5), Math.round(baseHeight * 0.5)],
    [Math.round(baseWidth * 0.375), Math.round(baseHeight * 0.375)]
  ].map(([width, height]) => `${Math.max(1, width)}x${Math.max(1, height)}`))]
    .map(value => value.split('x').map(Number));
  const qualities = options.quality ? [Number(options.quality)] : [0.86, 0.74, 0.62, 0.5, 0.38];
  const formats = ['image/webp', 'image/jpeg'];

  for (const [width, height] of dimensions) {
    canvas.width = width;
    canvas.height = height;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    for (const mime of formats) {
      for (const quality of qualities) {
        let dataUrl = '';
        try { dataUrl = canvas.toDataURL(mime, quality); } catch {}
        if (!/^data:image\/(?:webp|jpeg);base64,/i.test(dataUrl)) continue;
        const size = estimateDataUrlBytes(dataUrl);
        if (size <= maxBytes) return { dataUrl, mime: dataUrl.slice(5, dataUrl.indexOf(';')).toLowerCase(), size, width, height };
      }
    }
  }
  throw new Error('图片压缩后仍超过 2MB，请选择更小的图片');
}

export async function processPromptCoverFile(file, options = {}) {
  if (!file) throw new Error('请选择图片');
  if (Number(file.size) > COVER_MAX_SOURCE_BYTES) throw new Error('图片不能超过 20MB');
  const declaredMime = String(file.type || '').toLowerCase();
  if (declaredMime && !COVER_MIME_TYPES.has(declaredMime)) throw new Error('只支持 PNG、JPEG 和 WebP 图片');
  const bytes = await readFileBytes(file);
  const actualMime = sniffImageMime(bytes);
  if (!COVER_MIME_TYPES.has(actualMime) || (declaredMime && declaredMime !== actualMime)) {
    throw new Error('图片格式无效，仅支持 PNG、JPEG 和 WebP');
  }
  const image = await decodeImageFile(file);
  return {
    ...(encodeCoverImage(image, options)),
    name: String(file.name || 'cover').trim() || 'cover',
    originalMime: actualMime
  };
}

async function dataUrlToCover(value, options = {}) {
  const parts = getDataUrlParts(value);
  if (!parts) return '';
  const bytes = Uint8Array.from(atob(parts.base64), char => char.charCodeAt(0));
  const file = new File([bytes], 'imported-cover', { type: parts.mime });
  return (await processPromptCoverFile(file, options)).dataUrl;
}

async function normalizeImportedCover(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  if (/^data:/i.test(source)) {
    try { return await dataUrlToCover(source); } catch { return ''; }
  }
  return /^https?:\/\//i.test(source) ? source : '';
}

async function recompressCoverDataUrl(value) {
  const normalized = await dataUrlToCover(value, { maxDimension: 1280, maxBytes: 800 * 1024 });
  return normalized || value;
}

const REMOTE_COVER_MAX_BYTES = 15 * 1024 * 1024;
const REMOTE_COVER_TIMEOUT_MS = 15000;

async function fetchRemoteCoverBlob(source) {
  const read = async target => {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = setTimeout(() => controller?.abort(), REMOTE_COVER_TIMEOUT_MS);
    try {
      const response = await fetch(target, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'force-cache',
        signal: controller?.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const headerMime = String(response.headers?.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const declaredSize = Number(response.headers?.get('content-length')) || 0;
      if (declaredSize > REMOTE_COVER_MAX_BYTES) throw new Error('图片超过 15MB');
      if (headerMime && !COVER_MIME_TYPES.has(headerMime)) throw new Error('只支持 PNG、JPEG 和 WebP 图片');

      let blob;
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            size += value.byteLength;
            if (size > REMOTE_COVER_MAX_BYTES) {
              await reader.cancel().catch(() => {});
              throw new Error('图片超过 15MB');
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock?.();
        }
        blob = new Blob(chunks, { type: headerMime || 'application/octet-stream' });
      } else {
        blob = await response.blob();
        if (blob.size > REMOTE_COVER_MAX_BYTES) throw new Error('图片超过 15MB');
      }
      if (blob.size > REMOTE_COVER_MAX_BYTES) throw new Error('图片超过 15MB');
      const mime = String(blob.type || headerMime).split(';')[0].trim().toLowerCase();
      if (!COVER_MIME_TYPES.has(mime)) throw new Error('只支持 PNG、JPEG 和 WebP 图片');
      return new Blob([blob], { type: mime });
    } finally {
      clearTimeout(timeout);
    }
  };

  const errors = [];
  try {
    return await read(source);
  } catch (error) {
    errors.push(error);
  }

  if (/^https:\/\//i.test(source)) {
    try {
      const endpoint = globalThis.APP_CONFIG?.apiProxyEndpoint || 'api-proxy.php';
      const proxyUrl = new URL(endpoint, window.location.href);
      proxyUrl.searchParams.set('media', '1');
      proxyUrl.searchParams.set('target', source);
      return await read(proxyUrl.href);
    } catch (error) {
      errors.push(error);
    }
  }

  throw errors[errors.length - 1] || new Error('图片加载失败');
}

async function materializeCoverCandidate(source) {
  const value = String(source || '').trim();
  if (!value) throw new Error('图片地址为空');
  if (/^data:/i.test(value)) return dataUrlToCover(value);
  if (!/^https?:\/\//i.test(value)) throw new Error('图片地址无效');
  const blob = await fetchRemoteCoverBlob(value);
  const file = new File([blob], 'history-cover', { type: blob.type });
  return (await processPromptCoverFile(file)).dataUrl;
}

async function resolveHistoryDraftCover(state) {
  const editor = state?.localEditor;
  if (!editor || editor.coverSource !== 'history' || editor.coverProcessing || !editor.coverUrl) return;

  const token = (editor.coverToken || 0) + 1;
  editor.coverToken = token;
  editor.coverProcessing = true;
  editor.coverError = '';
  updateCoverPickerUi(state);

  const candidates = [...new Set([
    editor.coverUrl,
    ...(Array.isArray(editor.coverFallbackUrls) ? editor.coverFallbackUrls : [])
  ].map(item => String(item || '').trim()).filter(Boolean))];
  const remoteFallback = candidates.find(item => /^https?:\/\//i.test(item)) || '';
  let lastError = null;

  try {
    for (const candidate of candidates) {
      if (state.localEditor !== editor || editor.coverToken !== token) return;
      try {
        const dataUrl = await materializeCoverCandidate(candidate);
        if (!dataUrl) throw new Error('图片处理没有返回数据');
        if (state.localEditor !== editor || editor.coverToken !== token) return;
        editor.coverUrl = dataUrl;
        editor.coverRemote = false;
        editor.coverError = '';
        return;
      } catch (error) {
        lastError = error;
      }
    }

    if (state.localEditor === editor && editor.coverToken === token) {
      editor.coverUrl = remoteFallback;
      editor.coverRemote = Boolean(remoteFallback);
      editor.coverError = remoteFallback ? '仅远程链接' : (lastError?.message || '图片无法读取');
    }
  } finally {
    if (state.localEditor === editor && editor.coverToken === token) {
      editor.coverProcessing = false;
      updateCoverPickerUi(state);
    }
  }
}

function renderCard(entry) {
  const cover = safeUrl(entry.coverUrl);
  const tags = entry.tags.slice(0, 3).map(tag => `<span class="prompt-library-tag">${escapeHtml(tag)}</span>`).join('');
  const preview = entry.description || String(entry.content || '').replace(/\s+/g, ' ').trim().slice(0, 140) + (String(entry.content || '').replace(/\s+/g, ' ').trim().length > 140 ? '...' : '');
  const fallback = `<div class="prompt-library-image-fallback"><i data-lucide="image-off" aria-hidden="true"></i><span>暂无预览</span></div>`;
  return `
    <article class="prompt-library-card" data-prompt-card="${escapeHtml(entry.id)}">
      <button type="button" class="prompt-library-card-media" data-action="detail" data-prompt-id="${escapeHtml(entry.id)}" aria-label="查看 ${escapeHtml(entry.title)}">
        <div class="prompt-library-image-frame" data-image-frame>
          ${cover ? renderPromptImage(cover, entry.title, {
            preferProxy: entry.origin === 'community',
            fallbackSources: entry.referenceImageUrls.slice(0, 4)
          }) : fallback}
          <span class="prompt-library-image-status" data-image-status hidden>图片暂时无法加载</span>
        </div>
      </button>
      <div class="prompt-library-card-body">
        <div class="prompt-library-card-heading">
          <button type="button" class="prompt-library-card-title" data-action="detail" data-prompt-id="${escapeHtml(entry.id)}">${escapeHtml(entry.title)}</button>
          <span class="prompt-library-source ${sourceClass(entry)}">${escapeHtml(sourceLabel(entry))}</span>
        </div>
        <p class="prompt-library-card-description">${escapeHtml(preview)}</p>
        <div class="prompt-library-card-meta">
          <span>${escapeHtml(entry.category)}</span>
          ${entry.author ? `<span>${escapeHtml(entry.author)}</span>` : ''}
          ${entry.imageModel ? `<span>${escapeHtml(entry.imageModel)}</span>` : ''}
        </div>
        ${tags ? `<div class="prompt-library-tags">${tags}</div>` : ''}
        <div class="prompt-library-card-actions">
          <button type="button" class="prompt-library-action" data-action="copy" data-prompt-id="${escapeHtml(entry.id)}" title="复制完整提示词"><i data-lucide="copy" aria-hidden="true"></i><span>复制</span></button>
          <button type="button" class="prompt-library-action" data-action="fill" data-prompt-id="${escapeHtml(entry.id)}" title="填入 Studio 生图输入"><i data-lucide="wand-sparkles" aria-hidden="true"></i><span>填入生图</span></button>
          <button type="button" class="prompt-library-action is-primary" data-action="add" data-prompt-id="${escapeHtml(entry.id)}" title="新增画布分支"><i data-lucide="workflow" aria-hidden="true"></i><span>加入画布</span></button>
        </div>
        ${entry.origin === 'local' ? `<div class="prompt-library-card-secondary"><button type="button" data-action="edit" data-prompt-id="${escapeHtml(entry.id)}">编辑</button><button type="button" data-action="delete" data-prompt-id="${escapeHtml(entry.id)}">删除</button></div>` : ''}
        ${cover ? `<button type="button" class="prompt-library-image-retry" data-action="retry-image" data-prompt-id="${escapeHtml(entry.id)}" data-image-url="${escapeHtml(entry.coverUrl)}" hidden>重试图片</button>` : ''}
      </div>
    </article>
  `;
}

function renderDetail(state) {
  const detail = state.detail;
  if (!detail) return '';
  const entry = detail.entry;
  const allImages = [
    ...(entry.coverUrl ? [{ url: entry.coverUrl, label: '效果示例', cover: true }] : []),
    ...entry.referenceImageUrls.map((url, index) => ({ url, label: `参考图 ${index + 1}`, cover: false }))
  ];
  const attributions = (Array.isArray(entry.attributions) ? entry.attributions : [])
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      author: String(item.author || '').trim(),
      title: String(item.title || '').trim(),
      sourceId: String(item.sourceId || '').trim(),
      sourceUrl: safeUrl(item.sourceUrl, { allowData: false })
    }))
    .filter(item => item.author || item.title || item.sourceId || item.sourceUrl);
  if (!attributions.length && (entry.author || entry.sourceUrl)) {
    attributions.push({
      author: entry.author,
      title: '',
      sourceId: entry.sourceId,
      sourceUrl: safeUrl(entry.sourceUrl, { allowData: false })
    });
  }
  return `
    <div class="prompt-library-overlay" data-role="detail-overlay">
      <section class="prompt-library-detail" role="dialog" aria-modal="true" aria-labelledby="prompt-library-detail-title">
        <div class="prompt-library-detail-head">
          <div><span class="prompt-library-eyebrow">Prompt detail</span><h2 id="prompt-library-detail-title">${escapeHtml(entry.title)}</h2></div>
          <button type="button" class="prompt-library-icon-btn" data-action="detail-close" aria-label="关闭详情" title="关闭"><i data-lucide="x" aria-hidden="true"></i></button>
        </div>
        <div class="prompt-library-detail-grid">
          <div class="prompt-library-detail-images">
            ${allImages.length ? allImages.map((image, index) => {
              const url = safeUrl(image.url);
              const imageMarkup = url
                ? renderPromptImage(url, image.label, {
                  preferProxy: entry.origin === 'community',
                  fallbackSources: image.cover ? entry.referenceImageUrls.slice(0, 4) : []
                })
                : '';
              return `<div class="prompt-library-detail-image ${image.cover ? 'is-cover' : ''}">
                ${url ? `<div class="prompt-library-image-frame" data-image-frame>${imageMarkup}<span class="prompt-library-image-status" data-image-status hidden>图片暂时无法加载</span></div>` : '<span>暂无预览</span>'}
                ${!image.cover ? `<label class="prompt-library-detail-check"><input type="checkbox" data-ref-index="${index - (entry.coverUrl ? 1 : 0)}"${detail.references.has(index - (entry.coverUrl ? 1 : 0)) ? ' checked' : ''}>${escapeHtml(image.label)}</label>` : `<span class="prompt-library-detail-image-label">${escapeHtml(image.label)}</span>`}
                ${url ? `<button type="button" class="prompt-library-image-retry" data-action="retry-image" data-prompt-id="${escapeHtml(entry.id)}" data-image-url="${escapeHtml(image.url)}" hidden>重试图片</button>` : ''}
              </div>`;
            }).join('') : '<div class="prompt-library-detail-no-image">暂无图片</div>'}
          </div>
          <div class="prompt-library-detail-copy">
            <div class="prompt-library-detail-badges"><span class="prompt-library-source ${sourceClass(entry)}">${escapeHtml(sourceLabel(entry))}</span><span>${escapeHtml(entry.category)}</span>${entry.imageModel ? `<span>${escapeHtml(entry.imageModel)}</span>` : ''}</div>
            <pre class="prompt-library-full-prompt">${escapeHtml(entry.content)}</pre>
            ${entry.description ? `<p class="prompt-library-detail-description">${escapeHtml(entry.description)}</p>` : ''}
            ${entry.coverUrl ? `<label class="prompt-library-checkbox"><input type="checkbox" data-use-cover${detail.useCover ? ' checked' : ''}><span>将封面作为参考图</span></label>` : ''}
            <div class="prompt-library-detail-actions">
              <button type="button" class="prompt-library-action" data-action="detail-copy"><i data-lucide="copy" aria-hidden="true"></i><span>复制</span></button>
              <button type="button" class="prompt-library-action" data-action="detail-fill"><i data-lucide="wand-sparkles" aria-hidden="true"></i><span>填入生图</span></button>
              <button type="button" class="prompt-library-action is-primary" data-action="detail-add"><i data-lucide="workflow" aria-hidden="true"></i><span>加入画布</span></button>
            </div>
            <div class="prompt-library-attribution">
              <strong>来源</strong>
              ${attributions.length ? `<ul>${attributions.map(item => `<li>${item.title ? `<span>${escapeHtml(item.title)}</span>` : ''}${item.author ? `<span>作者：${escapeHtml(item.author)}</span>` : ''}${item.sourceId ? `<span>${escapeHtml(item.sourceId)}</span>` : ''}${item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.sourceUrl)}</a>` : ''}</li>`).join('')}</ul>` : `<span>${escapeHtml(sourceLabel(entry))}</span>`}
            </div>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderTargetPicker(state) {
  if (!state.targetPicker) return '';
  const projects = state.targetPicker.projects;
  return `
    <div class="prompt-library-overlay" data-role="target-overlay">
      <section class="prompt-library-target-picker" role="dialog" aria-modal="true" aria-labelledby="prompt-target-title">
        <div class="prompt-library-detail-head"><div><span class="prompt-library-eyebrow">Canvas target</span><h2 id="prompt-target-title">选择加入位置</h2></div><button type="button" class="prompt-library-icon-btn" data-action="target-cancel" aria-label="取消"><i data-lucide="x" aria-hidden="true"></i></button></div>
        <div class="prompt-library-target-list">
          ${projects.map(project => `<button type="button" class="prompt-library-target" data-action="target-select" data-project-id="${escapeHtml(project.id)}"><span><strong>${escapeHtml(project.title || '未命名画布')}</strong><small>${escapeHtml(project.meta || '')}</small></span><i data-lucide="chevron-right" aria-hidden="true"></i></button>`).join('')}
          <button type="button" class="prompt-library-target is-new" data-action="target-select" data-project-id=""><span><strong>新建画布</strong><small>创建一条独立的提示词工作流</small></span><i data-lucide="plus" aria-hidden="true"></i></button>
        </div>
      </section>
    </div>
  `;
}

function renderLocalEditor(state) {
  const editor = state.localEditor;
  if (!editor) return '';
  const entry = editor.entry || {};
  const category = CATEGORIES.includes(entry.category) ? entry.category : '其他';
  const categories = CATEGORIES.map(value => '<option value="' + escapeHtml(value) + '"' + (value === category ? ' selected' : '') + '>' + escapeHtml(value) + '</option>').join('');
  const cover = safeUrl(editor.coverUrl || entry.coverUrl);
  const coverMarkup = cover
    ? '<div data-image-frame>' + renderPromptImage(cover, '效果示例', { preferProxy: false }).replace('<img ', '<img data-role="cover-preview-image" ') + '<span class="prompt-library-image-status" data-image-status hidden>图片暂时无法加载</span></div>'
    : '<div class="prompt-library-cover-empty"><i data-lucide="image-plus" aria-hidden="true"></i><span>可选效果示例</span></div>';
  const coverStatus = editor.coverProcessing ? '图片处理中…' : (editor.coverError || (cover && editor.coverRemote ? '仅远程链接' : '支持 PNG、JPEG、WebP，最大 20MB'));
  return [
    '<div class="prompt-library-overlay" data-role="local-editor-overlay">',
    '<section class="prompt-library-local-editor" role="dialog" aria-modal="true" aria-labelledby="prompt-local-editor-title">',
    '<div class="prompt-library-detail-head"><div><span class="prompt-library-eyebrow">Personal prompt</span><h2 id="prompt-local-editor-title">' + (editor.mode === 'edit' ? '编辑提示词' : '新增提示词') + '</h2></div>',
    '<button type="button" class="prompt-library-icon-btn" data-action="local-editor-cancel" aria-label="取消" title="取消"><i data-lucide="x" aria-hidden="true"></i></button></div>',
    '<form class="prompt-library-local-form" data-role="local-form">',
    '<div class="prompt-library-form-grid">',
    '<label><span>标题</span><input name="title" required maxlength="120" value="' + escapeHtml(entry.title || '') + '" placeholder="例如：电影感产品主视觉"></label>',
    '<label><span>分类</span><select name="category">' + categories + '</select></label>',
    '<label class="is-wide"><span>完整提示词</span><textarea name="content" required rows="8" placeholder="输入完整提示词正文">' + escapeHtml(entry.content || '') + '</textarea></label>',
    '<label class="is-wide"><span>摘要</span><textarea name="description" rows="2" maxlength="240" placeholder="可选：用于卡片预览的简短说明">' + escapeHtml(entry.description || '') + '</textarea></label>',
    '<label><span>标签</span><input name="tags" value="' + escapeHtml(formatList(entry.tags)) + '" placeholder="逗号分隔"></label>',
    '<label><span>图片模型</span><input name="imageModel" value="' + escapeHtml(entry.imageModel || '') + '" placeholder="可选"></label>',
    '<label><span>作者</span><input name="author" value="' + escapeHtml(entry.author || '') + '" placeholder="可选"></label>',
    '<div class="prompt-library-cover-field is-wide"><span>效果示例（可选）</span><div class="prompt-library-cover-picker" data-role="cover-picker" tabindex="0">',
    '<input type="file" hidden data-role="cover-input" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp">',
    '<div class="prompt-library-cover-preview" data-role="cover-preview">' + coverMarkup + '</div>',
    '<div class="prompt-library-cover-controls"><button type="button" class="prompt-library-choice-actions-secondary" data-action="choose-cover"' + (editor.coverProcessing ? ' disabled' : '') + '><i data-lucide="upload" aria-hidden="true"></i><span>' + (cover ? '更换图片' : '选择图片') + '</span></button>',
    '<button type="button" class="prompt-library-choice-actions-secondary" data-action="remove-cover"' + (!cover || editor.coverProcessing ? ' hidden disabled' : '') + '>移除</button>',
    '<small data-role="cover-status">' + escapeHtml(coverStatus) + '</small></div></div></div>',
    '</div>',
    '<div class="prompt-library-form-actions"><button type="button" class="prompt-library-choice-actions-secondary" data-action="local-editor-cancel">取消</button>',
    '<button type="submit" class="prompt-library-action is-primary"' + (editor.coverProcessing || editor.saving ? ' disabled' : '') + '><i data-lucide="save" aria-hidden="true"></i><span>' + (editor.saving ? '保存中…' : '保存') + '</span></button></div>',
    '</form></section></div>'
  ].join('');
}

function renderMineHeaderActions(state) {
  if (state.tab !== 'mine') return '';
  return [
    '<button type="button" class="prompt-library-header-btn" data-action="new-local" aria-label="新增个人提示词" title="新增个人提示词"><i data-lucide="plus" aria-hidden="true"></i><span>新增</span></button>',
    '<button type="button" class="prompt-library-header-btn" data-action="import-local" aria-label="导入提示词文件" title="导入提示词文件"><i data-lucide="upload" aria-hidden="true"></i><span>导入</span></button>',
    '<button type="button" class="prompt-library-header-btn" data-action="export-local" aria-label="导出个人提示词" title="导出个人提示词"><i data-lucide="download" aria-hidden="true"></i><span>导出</span></button>',
    '<input type="file" hidden data-role="import-file" accept=".json,.txt,.md,.csv,application/json,text/plain,text/csv">'
  ].join('');
}

function renderEditor(state) {
  closePromptDialogHandles(state);
  const filtered = filteredEntries(state);
  const visible = filtered.slice(0, state.visibleCount);
  const sources = [...new Set(state.entries.filter(entry => entry.sourceId).map(entry => entry.sourceId))].sort();
  const models = [...new Set(state.entries.map(entry => entry.imageModel).filter(Boolean))].sort();
  const hasMore = visible.length < filtered.length;
  const emptyText = state.loading
    ? '正在加载提示词目录…'
    : state.error
      ? `提示词来源加载失败：${state.error}`
      : filtered.length ? '' : (state.tab === 'mine' ? '还没有个人提示词' : '没有匹配的提示词');

  state.root.innerHTML = `
    <section class="prompt-library-workspace" aria-label="提示词库">
      <header class="prompt-library-header">
        <div class="prompt-library-header-main">
          <button type="button" class="prompt-library-back" data-action="close" aria-label="返回上一级界面" title="返回上一级界面"><i data-lucide="arrow-left" aria-hidden="true"></i><span>${state.returnWorkspace === 'canvas' ? '返回画布' : '返回 Studio'}</span></button>
          <div><span class="prompt-library-eyebrow">Prompt library</span><h1>提示词库</h1></div>
          <span class="prompt-library-count" aria-live="polite">${state.loading ? '加载中' : `${filtered.length} 条`}</span>
        </div>
        <div class="prompt-library-header-actions">${renderMineHeaderActions(state)}<button type="button" class="prompt-library-header-btn" data-action="open-canvas" aria-label="打开无限画布" title="打开无限画布"><i data-lucide="infinity" aria-hidden="true"></i><span>无限画布</span></button></div>
      </header>
      <div class="prompt-library-content" id="prompt-library-panel" role="tabpanel" aria-labelledby="prompt-library-tab-${state.tab}">
        <div class="prompt-library-toolbar">
          <div class="prompt-library-tabs" role="tablist" aria-label="提示词范围">
            <button type="button" class="prompt-library-tab${state.tab === 'discover' ? ' is-active' : ''}" id="prompt-library-tab-discover" data-action="tab" data-tab="discover" role="tab" aria-selected="${state.tab === 'discover'}" aria-controls="prompt-library-panel" tabindex="${state.tab === 'discover' ? '0' : '-1'}">发现</button>
            <button type="button" class="prompt-library-tab${state.tab === 'mine' ? ' is-active' : ''}" id="prompt-library-tab-mine" data-action="tab" data-tab="mine" role="tab" aria-selected="${state.tab === 'mine'}" aria-controls="prompt-library-panel" tabindex="${state.tab === 'mine' ? '0' : '-1'}">我的</button>
          </div>
          <label class="prompt-library-search"><i data-lucide="search" aria-hidden="true"></i><input type="search" data-role="search" placeholder="搜索标题、正文、作者或标签" value="${escapeHtml(state.query)}" autocomplete="off"><kbd>/</kbd></label>
          <div class="prompt-library-filters">
            <select data-filter="category" aria-label="筛选分类">${renderOptions(CATEGORIES, state.category, '全部分类')}</select>
            <select data-filter="source" aria-label="筛选来源">${renderOptions(sources, state.source, '全部来源')}</select>
            <select data-filter="model" aria-label="筛选模型">${renderOptions(models, state.model, '全部模型')}</select>
          </div>
        </div>
        ${state.error ? `<div class="prompt-library-error"><span>${escapeHtml(emptyText)}</span><button type="button" data-action="retry">重试</button></div>` : ''}
        ${emptyText && !state.error ? `<div class="prompt-library-empty-state"><i data-lucide="library" aria-hidden="true"></i><strong>${escapeHtml(emptyText)}</strong></div>` : ''}
        <div class="prompt-library-grid" data-role="grid">${visible.map(renderCard).join('')}</div>
        ${hasMore ? '<div class="prompt-library-load-more" data-role="load-more"><button type="button" class="prompt-library-load-more-button" data-action="load-more"><i data-lucide="chevrons-down" aria-hidden="true"></i><span>加载更多</span></button></div>' : ''}
        ${!state.loading && !state.error && filtered.length ? '<p class="prompt-library-attribution-note">社区提示词和图片归原作者及来源项目所有，本站仅保留提示词元数据和远程链接。</p>' : ''}
      </div>
      ${renderDetail(state)}
      ${renderTargetPicker(state)}
      ${renderLocalEditor(state)}
    </section>
  `;

  bindImageErrors(state.root);
  observeLoadMore(state);
  mountPromptDialogs(state);
  try { globalThis.lucide?.createIcons?.(); } catch {}
}

function bindImageErrors(root) {
  root.querySelectorAll('img').forEach(image => {
    if (image.dataset.promptLibraryImageBound === 'true') return;
    image.dataset.promptLibraryImageBound = 'true';
    const stages = getImageFallbackStages(image);
    const hasFallback = stages.length > 1;
    const handleLoad = () => {
      clearImageFallbackTimer(image);
      const frame = image.closest('[data-image-frame]') || image.closest('.prompt-library-detail-image');
      if (!frame) return;
      frame.classList.remove('is-broken');
      image.hidden = false;
      const status = frame.querySelector('[data-image-status]');
      if (status) status.hidden = true;
      const retry = frame.querySelector('[data-action="retry-image"]')
        || image.closest('.prompt-library-detail-image')?.querySelector('[data-action="retry-image"]')
        || image.closest('[data-prompt-card]')?.querySelector('[data-action="retry-image"]');
      if (retry) retry.hidden = true;
    };
    const handleError = () => {
      clearImageFallbackTimer(image);
      const frame = image.closest('[data-image-frame]') || image.closest('.prompt-library-detail-image');
      if (!frame) return;
      const currentAttempt = Number(image.dataset.imageAttempt) || 0;
      const nextAttempt = currentAttempt + 1;
      const nextStage = stages[nextAttempt];
      const status = frame.querySelector('[data-image-status]');
      const retry = frame.querySelector('[data-action="retry-image"]')
        || image.closest('.prompt-library-detail-image')?.querySelector('[data-action="retry-image"]')
        || image.closest('[data-prompt-card]')?.querySelector('[data-action="retry-image"]');
      // Keep a manual retry available as soon as a remote candidate fails.
      // Automatic mirrors may still recover the preview, and handleLoad will
      // hide this control again when one of them succeeds.
      if (retry) retry.hidden = false;
      if (nextStage) {
        image.dataset.imageAttempt = String(nextAttempt);
        image.hidden = false;
        frame.classList.remove('is-broken');
        if (status) status.hidden = true;
        image.src = addImageCacheBust(nextStage.url);
        scheduleImageFallback(image);
        return;
      }
      frame.classList.add('is-broken');
      image.hidden = true;
      if (status) status.hidden = false;
      if (retry) retry.hidden = false;
    };
    image.addEventListener('load', handleLoad);
    image.addEventListener('error', handleError);
    if (hasFallback) observeImageFallback(image);
    if (image.complete && image.naturalWidth > 0) handleLoad();
  });
}

function retryImage(state, button, entry) {
  const source = safeUrl(button?.dataset?.imageUrl || entry?.coverUrl);
  if (!source) return;
  const image = button.closest('.prompt-library-detail-image')?.querySelector('img')
    || button.closest('[data-prompt-card]')?.querySelector('.prompt-library-image-frame img');
  if (!image) return;
  const frame = image.closest('[data-image-frame]') || image.closest('.prompt-library-detail-image');
  const status = frame?.querySelector('[data-image-status]');
  button.hidden = true;
  image.hidden = false;
  frame?.classList.remove('is-broken');
  if (status) status.hidden = true;
  const storedCandidates = getImageCandidateUrls(image);
  const candidates = storedCandidates.length
    ? storedCandidates
    : getPromptImageCandidates(source, { preferProxy: entry?.origin === 'community' });
  const currentAttempt = Number(image.dataset.imageAttempt) || 0;
  const nextAttempt = candidates.length > 1 ? (currentAttempt + 1) % candidates.length : 0;
  image.dataset.imageAttempt = String(nextAttempt);
  image.src = addImageCacheBust(candidates[nextAttempt] || source);
  if (candidates.length > 1) scheduleImageFallback(image);
  setNotice(state, '正在重新加载图片', 'info');
}

function appendNextBatch(state) {
  if (state.isAppending) return;
  const filtered = filteredEntries(state);
  const prevCount = state.visibleCount;
  const nextCount = Math.min(prevCount + BATCH_SIZE, filtered.length);
  if (nextCount <= prevCount) return;
  const grid = state.root.querySelector('[data-role="grid"]');
  if (!grid) { state.visibleCount = nextCount; renderEditor(state); return; }
  state.isAppending = true;
  try {
    const newCards = filtered.slice(prevCount, nextCount);
    state.visibleCount = nextCount;
    grid.insertAdjacentHTML('beforeend', newCards.map(renderCard).join(''));
    bindImageErrors(grid);
    const countEl = state.root.querySelector('.prompt-library-count');
    if (countEl) countEl.textContent = `${filtered.length} 条`;
    if (nextCount >= filtered.length) {
      state.root.querySelector('[data-role="load-more"]')?.remove();
      stopLoadMoreObservation();
    }
    try { globalThis.lucide?.createIcons?.(); } catch {}
  } finally {
    state.isAppending = false;
  }
}

function stopLoadMoreObservation() {
  imageObserver?.disconnect?.();
  imageObserver = null;
  disconnectImageFallbackObserver();
  if (loadMoreScrollRoot && loadMoreScrollHandler) {
    loadMoreScrollRoot.removeEventListener('scroll', loadMoreScrollHandler);
  }
  loadMoreScrollRoot = null;
  loadMoreScrollHandler = null;
}

function observeLoadMore(state) {
  stopLoadMoreObservation();
  const sentinel = state.root.querySelector('[data-role="load-more"]');
  if (!sentinel) return;

  const appendIfNearBottom = () => {
    if (activeState !== state || state.isAppending) return;
    const root = state.root;
    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 720) appendNextBatch(state);
  };

  if (globalThis.IntersectionObserver) {
    imageObserver = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      appendNextBatch(state);
    }, { root: state.root, rootMargin: '640px' });
    imageObserver.observe(sentinel);
    return;
  }

  loadMoreScrollRoot = state.root;
  loadMoreScrollHandler = appendIfNearBottom;
  state.root.addEventListener('scroll', loadMoreScrollHandler, { passive: true });
}

function closePromptDialogHandles(state) {
  (state.dialogHandles || []).forEach(handle => {
    try { handle.close('rerender', { restoreFocus: false }); } catch {}
  });
  state.dialogHandles = [];
}

function mountOverlay(state, html) {
  const workspace = state.root.querySelector('.prompt-library-workspace');
  if (!workspace) { renderEditor(state); return; }
  workspace.insertAdjacentHTML('beforeend', html);
  const overlay = workspace.lastElementChild;
  bindImageErrors(overlay);
  try { globalThis.lucide?.createIcons?.(); } catch {}
  mountPromptDialogs(state);
}

function closeOverlay(state, selector) {
  const overlay = state.root.querySelector(selector);
  if (!overlay) return;
  state.dialogHandles = (state.dialogHandles || []).filter(handle => {
    if (handle?._overlayEl === overlay) {
      try { handle.close('overlay-close'); } catch {}
      return false;
    }
    return true;
  });
  overlay.remove();
}

function mountPromptDialogs(state) {
  const dialogApi = window.AppUtils?.dialog;
  if (!dialogApi?.open) return;
  const root = state.root;
  const register = (overlaySelector, surfaceSelector, options = {}) => {
    const overlay = root.querySelector(overlaySelector);
    const surface = overlay?.querySelector(surfaceSelector);
    if (!overlay || !surface) return;
    if (overlay.dataset.dialogBound === 'true') return;
    overlay.dataset.dialogBound = 'true';
    const handle = dialogApi.open({
      element: surface,
      container: overlay,
      closeOnBackdrop: options.closeOnBackdrop !== false,
      closeOnEscape: options.closeOnEscape !== false,
      restoreFocus: options.restoreFocus !== false,
      onClose: (reason, record) => {
        options.onClose?.(reason, record);
        // Prompt-library overlays are created dynamically and do not carry a
        // hidden state of their own. Remove them when the shared dialog closes
        // so Escape cannot leave a visible, aria-hidden surface behind.
        if (overlay.isConnected) overlay.remove();
      },
      role: options.role || 'dialog'
    });
    if (handle) handle._overlayEl = overlay;
    state.dialogHandles.push(handle);
    if (options.backdropHandler) overlay.addEventListener('click', options.backdropHandler, { once: true });
  };
  register('[data-role="detail-overlay"]', '[role="dialog"]', {
    onClose: () => {
      if (activeState !== state) return;
      state.detail = null;
    }
  });
  register('[data-role="target-overlay"]', '[role="dialog"]', {
    onClose: () => {
      if (activeState !== state) return;
      const resolve = state.targetPicker?.resolve;
      state.targetPicker = null;
      resolve?.(null);
    }
  });
  register('[data-role="local-editor-overlay"]', '[role="dialog"]', {
    closeOnBackdrop: false,
    closeOnEscape: false,
    backdropHandler: event => {
      const overlay = event.currentTarget;
      if (event.target !== overlay || activeState !== state) return;
      void confirmCloseLocalEditor(state).then(allowed => {
        if (!allowed || activeState !== state) return;
        state.localEditor = null;
        closeOverlay(state, '[data-role="local-editor-overlay"]');
      });
    }
  });
}

function setNotice(state, message, tone = 'success', action = null) {
  state.notice = { message, tone };
  const existing = state.root.querySelector('[data-role="notice"]');
  if (existing) existing.remove();
  const notice = document.createElement('div');
  notice.className = `prompt-library-notice is-${tone}`;
  notice.dataset.role = 'notice';
  notice.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
  notice.setAttribute('aria-live', tone === 'danger' ? 'assertive' : 'polite');
  notice.setAttribute('aria-atomic', 'true');
  const copy = document.createElement('span');
  copy.textContent = message;
  notice.appendChild(copy);
  if (action?.label && action?.name) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action.name;
    if (action.projectId) button.dataset.projectId = action.projectId;
    button.textContent = action.label;
    notice.appendChild(button);
  }
  state.root.querySelector('.prompt-library-workspace')?.appendChild(notice);
  window.setTimeout(() => notice.remove(), 3200);
}

function confirmPromptAction(options = {}) {
  const dialogConfirm = window.AppUtils?.dialog?.confirm;
  if (typeof dialogConfirm !== 'function') return Promise.resolve(false);
  try {
    return Promise.resolve(dialogConfirm(options));
  } catch {
    return Promise.resolve(false);
  }
}

function resetTabFilters(state, tab) {
  const entries = state.entryCache.get(tab) || [];
  if (state.source !== 'all' && !entries.some(entry => entry.sourceId === state.source)) state.source = 'all';
  if (state.model !== 'all' && !entries.some(entry => entry.imageModel === state.model)) state.model = 'all';
}

function invalidateEntryTab(state, tab) {
  state.loadedTabs.delete(tab);
  state.entryCache.delete(tab);
  state.errorCache.delete(tab);
  if (tab === state.tab) {
    state.entries = [];
    state.error = '';
  }
  if (Array.isArray(state.entryPool)) {
    state.entryPool = state.entryPool.filter(entry => tab === 'mine'
      ? entry.origin !== 'local'
      : entry.origin === 'local');
  }
}

function findEntry(state, id) {
  return state.entries.find(entry => String(entry.id) === String(id)) || null;
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) throw new Error('当前环境不允许访问剪贴板');
}

function markActionSuccess(button, label = '已复制') {
  if (!button) return;
  const labelEl = button.querySelector('span');
  const original = labelEl?.textContent || '';
  button.classList.add('is-success');
  if (labelEl) labelEl.textContent = label;
  window.setTimeout(() => {
    if (!button.isConnected) return;
    button.classList.remove('is-success');
    if (labelEl) labelEl.textContent = original;
  }, 1600);
}

function chooseFillMode(state) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'prompt-library-overlay';
    overlay.dataset.role = 'fill-choice';
    overlay.innerHTML = `
      <section class="prompt-library-choice" role="dialog" aria-modal="true" aria-labelledby="prompt-fill-choice-title">
        <span class="prompt-library-eyebrow">Studio prompt</span><h2 id="prompt-fill-choice-title">当前已有提示词</h2>
        <p>选择如何处理当前输入，不会自动发送生成请求。</p>
        <div class="prompt-library-choice-actions"><button type="button" data-choice="cancel">取消</button><button type="button" data-choice="append">追加</button><button type="button" class="is-primary" data-choice="replace">替换</button></div>
      </section>`;
    let finished = false;
    let dialogHandle = null;
    const finish = value => {
      if (finished) return;
      finished = true;
      if (state.fillChoice?.overlay === overlay) state.fillChoice = null;
      dialogHandle?.close?.('choice');
      overlay.remove();
      resolve(value);
    };
    overlay.addEventListener('click', event => {
      const choice = event.target.closest('[data-choice]')?.dataset.choice;
      if (choice) finish(choice);
      else if (event.target === overlay) finish('cancel');
    });
    state.fillChoice = { overlay, finish };
    state.root.querySelector('.prompt-library-workspace')?.appendChild(overlay);
    const surface = overlay.querySelector('[role="dialog"]');
    dialogHandle = window.AppUtils?.dialog?.open?.({
      element: surface,
      container: overlay,
      closeOnBackdrop: false,
      closeOnEscape: true,
      restoreFocus: true,
      onClose: () => finish('cancel')
    }) || null;
    if (!dialogHandle) {
      const escapeHandler = event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        finish('cancel');
      };
      overlay.addEventListener('keydown', escapeHandler);
      state.fillChoice.escapeHandler = escapeHandler;
    }
    overlay.querySelector('[data-choice="replace"]')?.focus();
  });
}

async function fillEntry(state, entry, options = {}) {
  const bridge = getBridge();
  const current = document.getElementById('prompt')?.value?.trim() || '';
  let mode = 'replace';
  if (current && current !== entry.content.trim()) mode = await chooseFillMode(state);
  if (mode === 'cancel') return;
  const filled = typeof bridge.setStudioPrompt === 'function'
    ? bridge.setStudioPrompt(entry.content, { mode, focus: true })
    : false;
  if (!filled) throw new Error('Studio 提示词输入框不可用');
  const sources = Array.isArray(options.referenceUrls) ? options.referenceUrls : [];
  if (sources.length && typeof bridge.addStudioReferenceImages === 'function') {
    const result = await bridge.addStudioReferenceImages(sources.map((url, index) => ({
      url,
      name: index === 0 && options.useCoverAsReference ? '效果示例' : `参考图 ${index + 1}`
    })));
    const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
    if (warnings.length) {
      const flash = bridge.flashStatus;
      if (typeof flash === 'function') flash(`文字已填入，${warnings.length} 张图片未能加入`, 'info');
      else setNotice(state, `文字已填入，${warnings.length} 张图片未能加入`, 'info');
    }
  }
  if (state.returnWorkspace === 'canvas') {
    await getCanvasBridge().closeCanvasWorkspace?.();
  }
  closePromptLibraryState(state, { workspace: 'studio' });
}

async function resolveCanvasTarget(state) {
  const bridge = getCanvasBridge();
  const activeId = typeof bridge.getActiveCanvasProjectId === 'function' ? bridge.getActiveCanvasProjectId() : '';
  if (activeId) return { targetProjectId: activeId };
  const projects = typeof bridge.getCanvasProjectTargets === 'function'
    ? await bridge.getCanvasProjectTargets()
    : [];
  return await new Promise(resolve => {
    state.targetPicker = { projects: Array.isArray(projects) ? projects : [], resolve };
    mountOverlay(state, renderTargetPicker(state));
  });
}

async function addEntry(state, entry, options = {}) {
  const target = await resolveCanvasTarget(state);
  if (!target) return;
  const bridge = getCanvasBridge();
  if (typeof bridge.addPromptEntryToCanvas !== 'function') throw new Error('画布桥接不可用');
  const result = await bridge.addPromptEntryToCanvas(entry, {
    ...target,
    referenceUrls: options.referenceUrls || [],
    useCoverAsReference: options.useCoverAsReference === true
  });
  state.targetPicker = null;
  if (result?.cacheWarnings?.length) {
    setNotice(state, `已加入画布；${result.cacheWarnings.length} 张图片将使用远程链接`, 'info', {
      name: 'open-added-canvas',
      label: '打开画布',
      projectId: result.projectId
    });
  } else {
    setNotice(state, '已新增画布分支', 'success', {
      name: 'open-added-canvas',
      label: '打开画布',
      projectId: result?.projectId
    });
  }
}

function openDetail(state, entry) {
  state.detail = { entry, references: new Set(), useCover: false };
  mountOverlay(state, renderDetail(state));
}

function createLocalEditor(mode, entry = {}) {
  const coverUrl = /^blob:/i.test(String(entry.coverUrl || '')) ? '' : String(entry.coverUrl || '').trim();
  return {
    mode,
    entry: { ...entry },
    coverUrl,
    coverFallbackUrls: Array.isArray(entry.coverFallbackUrls)
      ? [...new Set(entry.coverFallbackUrls.map(item => String(item || '').trim()).filter(Boolean))]
      : (entry.coverFallbackUrl ? [String(entry.coverFallbackUrl).trim()] : []),
    coverSource: String(entry.coverSource || '').trim(),
    coverRemote: /^https?:\/\//i.test(coverUrl),
    coverProcessing: false,
    coverError: '',
    coverToken: 0,
    saving: false,
    dirty: false
  };
}

async function editLocalEntry(state, entry) {
  state.localEditor = createLocalEditor('edit', entry);
  if (state.detail) { state.detail = null; closeOverlay(state, '[data-role="detail-overlay"]'); }
  mountOverlay(state, renderLocalEditor(state));
  window.setTimeout(() => state.root.querySelector('[data-role="local-form"] [name="title"]')?.focus(), 0);
}

async function deleteLocalEntry(state, entry) {
  const confirmed = await confirmPromptAction({
    title: '删除提示词',
    message: `确定删除“${entry.title}”吗？此操作不可恢复。`,
    confirmLabel: '删除',
    danger: true
  });
  if (!confirmed) return;
  const bridge = getBridge();
  if (typeof bridge.deleteLocalPrompt !== 'function') throw new Error('本地提示词删除不可用');
  await bridge.deleteLocalPrompt(entry.id);
  invalidateEntryTab(state, 'mine');
  await loadEntries(state);
}

function readLocalFormRecord(form, state) {
  const data = new FormData(form);
  const editor = state.localEditor || {};
  const previous = editor.entry || {};
  const content = String(data.get('content') || '').trim();
  const title = String(data.get('title') || '').trim();
  if (!title) throw new Error('请输入提示词标题');
  if (!content) throw new Error('请输入提示词正文');
  return {
    title,
    content,
    description: String(data.get('description') || '').trim(),
    category: CATEGORIES.includes(String(data.get('category') || '')) ? String(data.get('category')) : '其他',
    tags: parseList(data.get('tags')),
    imageModel: String(data.get('imageModel') || '').trim(),
    coverUrl: String(editor.coverUrl || '').trim(),
    referenceImageUrls: Array.isArray(previous.referenceImageUrls) ? [...previous.referenceImageUrls] : [],
    author: String(data.get('author') || '').trim(),
    sourceId: String(previous.sourceId || '').trim(),
    sourceUrl: String(previous.sourceUrl || '').trim(),
    attributions: Array.isArray(previous.attributions) ? [...previous.attributions] : [],
    imageMode: String(previous.imageMode || '').trim()
  };
}

function isQuotaError(error) {
  return /quota|storage|space|超出|配额/i.test(String(error?.name || '') + ' ' + String(error?.message || ''));
}

async function saveLocalEntry(state, form) {
  const bridge = getBridge();
  const editor = state.localEditor;
  if (!editor || editor.coverProcessing || editor.saving) return;
  const record = readLocalFormRecord(form, state);
  editor.saving = true;
  updateLocalEditorControls(state);
  const submit = async () => {
    if (editor.mode === 'edit') {
      if (typeof bridge.updateLocalPrompt !== 'function') throw new Error('本地提示词编辑不可用');
      return bridge.updateLocalPrompt(editor.entry.id, record);
    }
    if (typeof bridge.saveLocalPrompt !== 'function') throw new Error('本地提示词新增不可用');
    return bridge.saveLocalPrompt(record);
  };
  try {
    try {
      await submit();
    } catch (error) {
      if (!isQuotaError(error) || !/^data:image\//i.test(record.coverUrl)) throw error;
      try {
        record.coverUrl = await recompressCoverDataUrl(record.coverUrl);
        editor.coverUrl = record.coverUrl;
        await submit();
      } catch (retryError) {
        retryError.message = '图片占用空间过大，请移除封面后重试';
        throw retryError;
      }
    }
  } finally {
    editor.saving = false;
    updateLocalEditorControls(state);
  }
  state.localEditor = null;
  state.detail = null;
  closeOverlay(state, '[data-role="local-editor-overlay"]');
  closeOverlay(state, '[data-role="detail-overlay"]');
  state.tab = 'mine';
  state.visibleCount = BATCH_SIZE;
  invalidateEntryTab(state, 'mine');
  await loadEntries(state);
  setNotice(state, editor?.mode === 'edit' ? '提示词已更新' : '提示词已保存到我的', 'success');
}

function updateLocalEditorControls(state) {
  const editor = state?.localEditor;
  if (!editor) return;
  const busy = editor.coverProcessing || editor.saving;
  const submit = state.root.querySelector('[data-role="local-form"] button[type="submit"]');
  if (submit) {
    submit.disabled = busy;
    const label = submit.querySelector('span');
    if (label) label.textContent = editor.saving ? '保存中…' : '保存';
  }
  state.root.querySelectorAll('[data-action="local-editor-cancel"]').forEach(button => {
    button.disabled = editor.saving;
  });
}

function updateCoverPickerUi(state) {
  const editor = state.localEditor;
  if (!editor) return;
  const picker = state.root.querySelector('[data-role="cover-picker"]');
  if (!picker) {
    updateLocalEditorControls(state);
    return;
  }
  const cover = safeUrl(editor.coverUrl);
  const preview = picker.querySelector('[data-role="cover-preview"]');
  const status = picker.querySelector('[data-role="cover-status"]');
  const choose = picker.querySelector('[data-action="choose-cover"]');
  const remove = picker.querySelector('[data-action="remove-cover"]');
  if (preview) {
    preview.innerHTML = cover
      ? '<div data-image-frame>' + renderPromptImage(cover, '效果示例', { preferProxy: false }).replace('<img ', '<img data-role="cover-preview-image" ') + '<span class="prompt-library-image-status" data-image-status hidden>图片暂时无法加载</span></div>'
      : '<div class="prompt-library-cover-empty"><i data-lucide="image-plus" aria-hidden="true"></i><span>可选效果示例</span></div>';
  }
  if (status) status.textContent = editor.coverProcessing
    ? '图片处理中…'
    : (editor.coverError || (cover && editor.coverRemote ? '仅远程链接' : '支持 PNG、JPEG、WebP，最大 20MB'));
  if (choose) {
    choose.disabled = editor.coverProcessing || editor.saving;
    const label = choose.querySelector('span');
    if (label) label.textContent = cover ? '更换图片' : '选择图片';
  }
  if (remove) {
    remove.hidden = !cover;
    remove.disabled = editor.coverProcessing || editor.saving || !cover;
  }
  if (window.lucide?.createIcons) {
    try { window.lucide.createIcons({ attrs: { 'data-prompt-cover': 'true' } }); } catch {}
  }
  bindImageErrors(state.root);
  updateLocalEditorControls(state);
}

async function replaceLocalCover(state, file) {
  if (!state) return;
  const editor = state.localEditor;
  if (!editor || !file || editor.saving) return;
  const token = (editor.coverToken || 0) + 1;
  editor.coverToken = token;
  editor.coverProcessing = true;
  editor.coverError = '';
  updateCoverPickerUi(state);
  try {
    const result = await processPromptCoverFile(file);
    if (state.localEditor !== editor || editor.coverToken !== token) return;
    editor.coverUrl = result.dataUrl;
    editor.coverRemote = false;
    editor.coverError = '';
    editor.dirty = true;
  } catch (error) {
    if (state.localEditor === editor && editor.coverToken === token) editor.coverError = error?.message || '图片处理失败';
  } finally {
    if (state.localEditor === editor && editor.coverToken === token) {
      editor.coverProcessing = false;
      updateCoverPickerUi(state);
    }
  }
}

function removeLocalCover(state) {
  if (!state) return;
  const editor = state.localEditor;
  if (!editor || editor.coverProcessing || editor.saving) return;
  editor.coverToken = (editor.coverToken || 0) + 1;
  editor.coverUrl = '';
  editor.coverRemote = false;
  editor.coverError = '';
  editor.dirty = true;
  updateCoverPickerUi(state);
}

async function confirmCloseLocalEditor(state) {
  const editor = state.localEditor;
  if (!editor) return true;
  if (editor.saving) {
    setNotice(state, '提示词正在保存，请稍候', 'info');
    return false;
  }
  if (!editor.dirty && !editor.coverProcessing && !editor.saving) return true;
  return confirmPromptAction({
    title: '放弃未保存修改',
    message: editor.saving || editor.coverProcessing
      ? '图片或提示词仍在处理中，确定放弃当前修改吗？'
      : '当前提示词有未保存修改，确定关闭吗？',
    confirmLabel: '放弃修改',
    danger: true
  });
}

async function importLocalEntries(state, files) {
  const bridge = getBridge();
  if (typeof bridge.saveLocalPrompt !== 'function') throw new Error('本地提示词导入不可用');
  let importedCount = 0;
  for (const file of files) {
    const text = await readFileText(file);
    const items = parseImportedEntries(text, file.name || '');
    for (const item of items) {
      const rawCoverUrl = String(item?.coverUrl || '').trim();
      const record = normalizeEntry({
        ...item,
        origin: 'local',
        coverUrl: /^data:/i.test(rawCoverUrl) ? '' : rawCoverUrl
      });
      if (!record.content) continue;
      record.coverUrl = await normalizeImportedCover(rawCoverUrl);
      await bridge.saveLocalPrompt(record);
      importedCount += 1;
    }
  }
  state.tab = 'mine';
  state.query = '';
  state.visibleCount = BATCH_SIZE;
  invalidateEntryTab(state, 'mine');
  await loadEntries(state);
  setNotice(state, importedCount ? '已导入 ' + importedCount + ' 条个人提示词' : '没有找到可导入的提示词', importedCount ? 'success' : 'danger');
}

async function exportLocalEntries(state) {
  const bridge = getBridge();
  let entries = [];
  if (typeof bridge.getLocalEntries === 'function') {
    entries = await bridge.getLocalEntries();
  } else if (typeof bridge.getEntries === 'function') {
    entries = await bridge.getEntries({ includeCommunity: false, localOnly: true });
  } else {
    entries = state.entries.filter(entry => entry.origin === 'local');
  }
  const prompts = (Array.isArray(entries) ? entries : [])
    .map(item => normalizeEntry({ ...item, origin: 'local' }))
    .filter(item => item.content);
  if (!prompts.length) {
    setNotice(state, '当前没有可导出的个人提示词', 'danger');
    return false;
  }
  const payload = {
    source: 'local',
    exportedAt: new Date().toISOString(),
    count: prompts.length,
    prompts
  };
  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = 'prompt-library-local-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
    link.remove();
  }, 1000);
  setNotice(state, '已导出 ' + prompts.length + ' 条个人提示词', 'success');
  return true;
}

async function loadEntries(state) {
  if (activeState !== state) return;
  const tab = state.tab;
  if (state.loadedTabs.has(tab)) {
    state.entries = state.entryCache.get(tab) || [];
    state.error = state.errorCache.get(tab) || '';
    state.loading = false;
    renderEditor(state);
    return;
  }
  state.loading = true;
  state.error = '';
  state.entries = state.entryCache.get(tab) || [];
  renderEditor(state);
  try {
    const bridge = getBridge();
    const combinedLoader = bridge.getEntries || bridge.getPromptLibraryEntries;
    const localLoader = bridge.getLocalEntries;
    const discoverLoader = bridge.getDiscoverEntries;
    const loader = tab === 'mine' ? (localLoader || combinedLoader) : (discoverLoader || combinedLoader);
    if (typeof loader !== 'function') throw new Error('提示词数据接口不可用');
    const entries = await loader(tab === 'mine'
      ? { includeCommunity: false, includePublic: false, localOnly: true }
      : { includeLocal: false, includeCommunity: true, includePublic: true });
    if (activeState !== state) return;
    const allNormalized = (Array.isArray(entries) ? entries : [])
      .map(normalizeEntry)
      .filter(entry => entry.content);
    state.entryPool = allNormalized;
    const sourceErrors = Array.isArray(entries?.sourceErrors) ? entries.sourceErrors : [];
    state.sourceErrors = sourceErrors;
    const normalized = allNormalized
      .filter(entry => entry.content && (tab === 'mine' ? entry.origin === 'local' : entry.origin !== 'local'));
    state.entryCache.set(tab, normalized);
    if (sourceErrors.length) {
      state.error = sourceErrors.map(item => `${item.label || item.source || '提示词来源'}：${item.message || '加载失败'}`).join('；');
      state.errorCache.set(tab, state.error);
      state.loadedTabs.delete(tab);
    } else {
      state.loadedTabs.add(tab);
      state.errorCache.delete(tab);
    }
    state.entries = normalized;
    state.loading = false;
    if (!sourceErrors.length) state.error = '';
    renderEditor(state);
  } catch (error) {
    if (activeState !== state) return;
    state.loading = false;
    state.error = error?.message || String(error);
    state.errorCache.set(tab, state.error);
    renderEditor(state);
  }
}

function closePromptLibraryState(state, options = {}) {
  state.fillChoice?.finish?.('cancel');
  closePromptDialogHandles(state);
  stopLoadMoreObservation();
  state.root.scrollTop = 0;
  state.root.hidden = true;
  state.root.classList.remove('is-open');
  document.body.classList.remove('prompt-library-open');
  setWorkspaceNavActive(options.workspace || state.returnWorkspace || 'studio');
  state.previousFocus?.focus?.();
  if (activeState === state) activeState = null;
}

function bindEvents(initialState) {
  const root = initialState.root;
  if (root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';
  const getState = () => activeState?.root === root ? activeState : null;
  root.addEventListener('click', async event => {
    const state = getState();
      if (!state) return;
      const button = event.target.closest('[data-action]');
      if (!button || !root.contains(button)) return;
      const action = button.dataset.action;
      try {
        if (action === 'close') {
          if (!(await confirmCloseLocalEditor(state))) return;
          return closePromptLibraryState(state);
        }
        if (action === 'retry') return loadEntries(state);
      if (action === 'load-more') return appendNextBatch(state);
      if (action === 'tab') {
        state.tab = button.dataset.tab === 'mine' ? 'mine' : 'discover';
        state.visibleCount = BATCH_SIZE;
        resetTabFilters(state, state.tab);
        if (state.tab === 'mine' && !state.loadedTabs.has('mine') && Array.isArray(state.entryPool) && state.entryPool.some(entry => entry.origin === 'local')) {
          const localEntries = state.entryPool.filter(entry => entry.origin === 'local');
          state.entryCache.set('mine', localEntries);
          state.loadedTabs.add('mine');
        }
        state.entries = state.entryCache.get(state.tab) || [];
        state.error = state.errorCache.get(state.tab) || '';
        renderEditor(state);
        return loadEntries(state);
      }
      if (action === 'new-local') {
        if (state.detail) { state.detail = null; closeOverlay(state, '[data-role="detail-overlay"]'); }
        state.localEditor = createLocalEditor('create', { category: '其他', tags: [], referenceImageUrls: [] });
        mountOverlay(state, renderLocalEditor(state));
        window.setTimeout(() => state.root.querySelector('[data-role="local-form"] [name="title"]')?.focus(), 0);
        return;
      }
      if (action === 'local-editor-cancel') {
        if (!(await confirmCloseLocalEditor(state))) return;
        state.localEditor = null;
        closeOverlay(state, '[data-role="local-editor-overlay"]');
        return;
      }
      if (action === 'choose-cover') {
        state.root.querySelector('[data-role="cover-input"]')?.click();
        return;
      }
      if (action === 'remove-cover') {
        removeLocalCover(state);
        return;
      }
      if (action === 'import-local') {
        state.root.querySelector('[data-role="import-file"]')?.click();
        return;
      }
      if (action === 'export-local') {
        return exportLocalEntries(state);
      }
      if (action === 'detail') { const entry = findEntry(state, button.dataset.promptId); if (entry) return openDetail(state, entry); }
      if (action === 'detail-close') { state.detail = null; closeOverlay(state, '[data-role="detail-overlay"]'); return; }
      if (action === 'target-cancel') { const resolve = state.targetPicker?.resolve; state.targetPicker = null; resolve?.(null); closeOverlay(state, '[data-role="target-overlay"]'); return; }
      if (action === 'target-select') { const resolve = state.targetPicker?.resolve; state.targetPicker = null; resolve?.({ targetProjectId: button.dataset.projectId || '', createNew: !button.dataset.projectId }); closeOverlay(state, '[data-role="target-overlay"]'); return; }
      if (action === 'open-canvas') {
        const bridge = getCanvasBridge();
        closePromptLibraryState(state);
        return bridge.openCanvasWorkspace?.();
      }
      if (action === 'open-added-canvas') {
        const bridge = getCanvasBridge();
        const projectId = button.dataset.projectId || '';
        closePromptLibraryState(state);
        return bridge.openCanvasWorkspace?.(projectId ? { openProjectId: projectId } : {});
      }
      if (action === 'retry-image') {
        const entry = findEntry(state, button.dataset.promptId);
        if (entry) retryImage(state, button, entry);
        return;
      }
      const entry = findEntry(state, button.dataset.promptId || state.detail?.entry?.id);
      if (!entry) return;
      if (action === 'copy' || action === 'detail-copy') {
        await copyText(entry.content);
        try { await getBridge().recordPromptLibraryUsage?.(entry.id); } catch {}
        markActionSuccess(button);
        setNotice(state, '已复制完整提示词', 'success');
      } else if (action === 'fill' || action === 'detail-fill') {
        const detail = action === 'detail-fill' ? state.detail : null;
        const selectedReferenceIndexes = detail
          ? [...detail.references].sort((left, right) => left - right)
          : [];
        const referenceUrls = detail
          ? [
              ...(detail.useCover && entry.coverUrl ? [entry.coverUrl] : []),
              ...selectedReferenceIndexes.map(index => entry.referenceImageUrls[index]).filter(Boolean)
            ]
          : [];
        await fillEntry(state, entry, {
          referenceUrls,
          useCoverAsReference: detail?.useCover === true
        });
      } else if (action === 'add' || action === 'detail-add') {
        const detail = action === 'detail-add' ? state.detail : null;
        const referenceUrls = detail
          ? [...detail.references].sort((left, right) => left - right).map(index => entry.referenceImageUrls[index]).filter(Boolean)
          : [];
        await addEntry(state, entry, { referenceUrls, useCoverAsReference: detail?.useCover === true });
      } else if (action === 'edit') {
        await editLocalEntry(state, entry);
      } else if (action === 'delete') {
        await deleteLocalEntry(state, entry);
      }
    } catch (error) {
      console.error('prompt library action failed', error);
      setNotice(state, error?.message || String(error), 'danger');
    }
  });
  root.addEventListener('submit', async event => {
    const state = getState();
    if (!state || !event.target.matches('[data-role="local-form"]')) return;
    event.preventDefault();
    try {
      await saveLocalEntry(state, event.target);
    } catch (error) {
      console.error('save local prompt failed', error);
      setNotice(state, error?.message || String(error), 'danger');
    }
  });
  root.addEventListener('input', event => {
    const state = getState();
    if (!state) return;
    if (event.target.matches('[data-role="search"]')) {
      state.query = event.target.value || '';
      state.visibleCount = BATCH_SIZE;
      renderEditor(state);
      return;
    }
    if (event.target.closest('[data-role="local-form"]') && state.localEditor) state.localEditor.dirty = true;
  });
  root.addEventListener('change', async event => {
    const state = getState();
    if (!state) return;
    if (event.target.matches('[data-role="import-file"]')) {
      const files = [...(event.target.files || [])];
      event.target.value = '';
      if (!files.length) return;
      try {
        await importLocalEntries(state, files);
      } catch (error) {
        console.error('import local prompts failed', error);
        setNotice(state, error?.message || String(error), 'danger');
      }
      return;
    }
    if (event.target.matches('[data-role="cover-input"]')) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) await replaceLocalCover(state, file);
      return;
    }
    if (event.target.closest('[data-role="local-form"]') && state.localEditor) state.localEditor.dirty = true;
    const filter = event.target.closest('[data-filter]');
    if (filter) {
      state[filter.dataset.filter] = filter.value || 'all';
      state.visibleCount = BATCH_SIZE;
      renderEditor(state);
      return;
    }
    const ref = event.target.closest('[data-ref-index]');
    if (ref && state.detail) {
      const index = Number(ref.dataset.refIndex);
      if (ref.checked) state.detail.references.add(index);
      else state.detail.references.delete(index);
      return;
    }
    const cover = event.target.closest('[data-use-cover]');
    if (cover && state.detail) state.detail.useCover = cover.checked;
  });
  root.addEventListener('keydown', event => {
    const state = getState();
    if (!state) return;
    const coverPicker = event.target.closest?.('[data-role="cover-picker"]');
    if (coverPicker && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      state.root.querySelector('[data-role="cover-input"]')?.click();
      return;
    }
    if (event.key === 'Escape') {
      if (state.fillChoice) {
        event.preventDefault();
        event.stopPropagation();
        state.fillChoice.finish('cancel');
      } else if (state.targetPicker) {
        const resolve = state.targetPicker.resolve;
        state.targetPicker = null;
        resolve?.(null);
        closeOverlay(state, '[data-role="target-overlay"]');
      } else if (state.localEditor) {
        event.preventDefault();
        void confirmCloseLocalEditor(state).then(allowed => {
          if (!allowed || activeState !== state) return;
          state.localEditor = null;
          closeOverlay(state, '[data-role="local-editor-overlay"]');
        });
      } else if (state.detail) {
        state.detail = null;
        closeOverlay(state, '[data-role="detail-overlay"]');
      } else {
        closePromptLibraryState(state);
      }
    }
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      state.root.querySelector('[data-role="search"]')?.focus();
    }
  });
  root.addEventListener('dragover', event => {
    if (!event.target.closest('[data-role="cover-picker"]')) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  root.addEventListener('drop', async event => {
    if (!event.target.closest('[data-role="cover-picker"]')) return;
    event.preventDefault();
    const file = [...(event.dataTransfer?.files || [])][0];
    if (file) await replaceLocalCover(getState(), file);
  });
  root.addEventListener('paste', async event => {
    const state = getState();
    if (!state?.localEditor) return;
    const file = [...(event.clipboardData?.files || [])].find(item => String(item.type || '').startsWith('image/'));
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    await replaceLocalCover(state, file);
  });
}

export function openPromptLibrary(options = {}) {
  const root = document.getElementById('prompt-library-root');
  if (!root) throw new Error('prompt-library-root is missing');
  if (activeState && (
    activeState.root?.hidden
    || !activeState.root?.classList.contains('is-open')
    || !document.body.classList.contains('prompt-library-open')
  )) activeState = null;
  if (activeState) {
    activeState.context = options.context || activeState.context;
    activeState.returnWorkspace = options.returnWorkspace || activeState.returnWorkspace;
    if (options.tab === 'mine' || options.tab === 'discover') activeState.tab = options.tab;
    if (options.draft) {
      activeState.tab = 'mine';
      activeState.detail = null;
      activeState.localEditor = createLocalEditor('create', normalizeEntry({ ...options.draft, origin: 'local' }));
      activeState.entries = activeState.entryCache.get('mine') || [];
      renderEditor(activeState);
      void resolveHistoryDraftCover(activeState);
      void loadEntries(activeState);
    }
    root.hidden = false;
    return activeState;
  }
  const initialTab = options.tab === 'mine' || options.draft ? 'mine' : 'discover';
  const state = {
    root,
    context: options.context || 'global',
    returnWorkspace: options.returnWorkspace || (options.context === 'canvas-editor' || options.context === 'canvas-home' ? 'canvas' : 'studio'),
    entries: [],
    loading: true,
    error: '',
    tab: initialTab,
    query: '',
    category: 'all',
    source: 'all',
    model: 'all',
    visibleCount: BATCH_SIZE,
    detail: null,
    targetPicker: null,
    localEditor: null,
    entryCache: new Map(),
    loadedTabs: new Set(),
    errorCache: new Map(),
    entryPool: [],
    sourceErrors: [],
    fillChoice: null,
    dialogHandles: [],
    previousFocus: document.activeElement
  };
  if (options.draft) {
    state.localEditor = createLocalEditor('create', normalizeEntry({ ...options.draft, origin: 'local' }));
  }
  activeState = state;
  root.scrollTop = 0;
  root.hidden = false;
  root.classList.add('is-open');
  document.body.classList.add('prompt-library-open');
  setWorkspaceNavActive('prompts');
  bindEvents(state);
  renderEditor(state);
  if (state.localEditor?.coverSource === 'history') void resolveHistoryDraftCover(state);
  void loadEntries(state);
  return state;
}

export function closePromptLibrary() {
  if (activeState) closePromptLibraryState(activeState);
}
