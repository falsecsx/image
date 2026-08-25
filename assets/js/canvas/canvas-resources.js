import { createId } from './canvas-model.js?v=20260813-4';

export const CANVAS_RESOURCES_DB_NAME = 'image_app:canvas_resources';
export const CANVAS_RESOURCES_STORE_NAME = 'resources';
export const CANVAS_RESOURCES_BLOBS_STORE_NAME = 'blobs';
export const CANVAS_RESOURCES_DB_VERSION = 2;
export const CANVAS_RESOURCE_CACHE_MAX_BYTES = 150 * 1024 * 1024;
export const CANVAS_RESOURCE_CACHE_MAX_ITEM_BYTES = 15 * 1024 * 1024;

function trimText(value) {
  return String(value ?? '').trim();
}

export function createEmbeddedResourceId(value) {
  const source = trimText(value);
  if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(source)) return '';
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 16777619);
    second ^= code + index;
    second = Math.imul(second, 3266489917);
  }
  return `resource-data-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function resolveResourceUrl(value, baseUrl) {
  const src = trimText(value);
  if (!src) return '';
  if (/^(data:|blob:|https?:|file:)/i.test(src)) return src;
  if (!baseUrl) return src;
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return src;
  }
}

function inferKind(source = {}) {
  const kind = trimText(source.kind).toLowerCase();
  if (kind === 'image' || kind === 'video' || kind === 'audio') return kind;
  const mimeType = trimText(source.mimeType || source.mime || '').toLowerCase();
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'image';
}

function toNumberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

export function normalizeCanvasResourceSource(source = {}, options = {}) {
  const input = typeof source === 'string' ? { src: source } : { ...source };
  const baseUrl = options.baseUrl || input.baseUrl || '';
  const kind = inferKind(input);
  const src = resolveResourceUrl(input.src || input.url || input.dataUrl || '', baseUrl);
  const label = trimText(input.label || input.title || input.name || input.alt || '');

  return {
    ...input,
    kind,
    src,
    label,
    origin: trimText(input.origin || options.origin || 'canvas-import'),
    mimeType: trimText(input.mimeType || input.mime || ''),
    width: toNumberOrNull(input.width),
    height: toNumberOrNull(input.height),
    durationMs: toNumberOrNull(input.durationMs || input.duration),
    alt: trimText(input.alt || label),
    recordId: trimText(input.recordId || input.id || ''),
    cacheKey: trimText(input.cacheKey || ''),
    cacheStatus: trimText(input.cacheStatus || ''),
    metadata: input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : {},
    thumbnailSrc: resolveResourceUrl(input.thumbnailSrc || input.thumbnail || '', baseUrl),
    posterSrc: resolveResourceUrl(input.posterSrc || input.poster || '', baseUrl)
  };
}

export function createCanvasResourceRecord(source = {}, overrides = {}) {
  const normalized = normalizeCanvasResourceSource(source, overrides);
  const now = Date.now();
  const id = trimText(overrides.id || source.id) || createId('resource');
  const mimeType = normalized.mimeType || (normalized.kind === 'video' ? 'video/mp4' : normalized.kind === 'audio' ? 'audio/mpeg' : 'image/png');

  return {
    id,
    kind: normalized.kind,
    createdAt: Number.isFinite(overrides.createdAt) ? overrides.createdAt : now,
    updatedAt: Number.isFinite(overrides.updatedAt) ? overrides.updatedAt : now,
    source: {
      origin: normalized.origin,
      src: normalized.src,
      label: normalized.label,
      mimeType,
      width: normalized.width,
      height: normalized.height,
      durationMs: normalized.durationMs,
      alt: normalized.alt,
      recordId: normalized.recordId,
      cacheKey: normalized.cacheKey,
      cacheStatus: normalized.cacheStatus,
      metadata: normalized.metadata,
      thumbnailSrc: normalized.thumbnailSrc,
      posterSrc: normalized.posterSrc,
      kind: normalized.kind
    },
    image: {
      src: normalized.kind === 'image' ? normalized.src : '',
      label: normalized.label,
      alt: normalized.alt,
      mimeType: normalized.kind === 'image' ? mimeType : '',
      width: normalized.width,
      height: normalized.height,
      thumbnailSrc: normalized.thumbnailSrc || ''
    },
    video: {
      src: normalized.kind === 'video' ? normalized.src : '',
      posterSrc: normalized.posterSrc || '',
      mimeType: normalized.kind === 'video' ? mimeType : '',
      width: normalized.width,
      height: normalized.height,
      durationMs: normalized.durationMs
    },
    audio: {
      src: normalized.kind === 'audio' ? normalized.src : '',
      mimeType: normalized.kind === 'audio' ? mimeType : '',
      durationMs: normalized.durationMs
    },
    metadata: {
      label: normalized.label,
      origin: normalized.origin,
      ...normalized.metadata
    }
  };
}

function isEmbeddedImageSource(value) {
  return /^data:image\//i.test(String(value || '').trim());
}

function createEmbeddedImageThumbnail(src, maxDimension = 320) {
  return new Promise(resolve => {
    if (typeof Image !== 'function' || typeof document === 'undefined') {
      resolve('');
      return;
    }
    const image = new Image();
    image.onload = () => {
      try {
        const naturalWidth = image.naturalWidth || image.width || 1;
        const naturalHeight = image.naturalHeight || image.height || 1;
        const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
        const width = Math.max(1, Math.round(naturalWidth * scale));
        const height = Math.max(1, Math.round(naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return resolve('');
        context.drawImage(image, 0, 0, width, height);
        let thumbnail = '';
        try { thumbnail = canvas.toDataURL('image/webp', 0.72); } catch {}
        if (!/^data:image\/webp;base64,/i.test(thumbnail)) {
          try { thumbnail = canvas.toDataURL('image/jpeg', 0.72); } catch {}
        }
        resolve(thumbnail && thumbnail !== src ? thumbnail : '');
      } catch {
        resolve('');
      }
    };
    image.onerror = () => resolve('');
    image.src = src;
  });
}

export async function prepareCanvasResourceRecord(record, options = {}) {
  const sourceSrc = trimText(record?.source?.src || '');
  if (!isEmbeddedImageSource(sourceSrc)) return record;
  const thumbnailSrc = trimText(record?.source?.thumbnailSrc || '')
    || await createEmbeddedImageThumbnail(sourceSrc, Number(options.maxDimension) || 320);
  return {
    ...record,
    source: { ...record.source, thumbnailSrc },
    image: { ...record.image, src: '', thumbnailSrc },
    metadata: { ...(record.metadata || {}), embeddedSource: 'resource-store' }
  };
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openCanvasResourceDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) {
    return Promise.reject(new Error('indexedDB is not available'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CANVAS_RESOURCES_DB_NAME, CANVAS_RESOURCES_DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CANVAS_RESOURCES_STORE_NAME)) {
        const store = db.createObjectStore(CANVAS_RESOURCES_STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('kind', 'kind', { unique: false });
        store.createIndex('origin', 'source.origin', { unique: false });
      }
      if (!db.objectStoreNames.contains(CANVAS_RESOURCES_BLOBS_STORE_NAME)) {
        const blobs = db.createObjectStore(CANVAS_RESOURCES_BLOBS_STORE_NAME, { keyPath: 'cacheKey' });
        blobs.createIndex('updatedAt', 'updatedAt', { unique: false });
        blobs.createIndex('size', 'size', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export function getCanvasResourceStore(options = {}) {
  const indexedDB = options.indexedDB || globalThis.indexedDB;
  let dbPromise = null;

  const getDb = () => {
    if (!dbPromise) dbPromise = openCanvasResourceDatabase(indexedDB);
    return dbPromise;
  };

  const run = async (mode, handler) => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CANVAS_RESOURCES_STORE_NAME, mode);
      const store = tx.objectStore(CANVAS_RESOURCES_STORE_NAME);
      let result;

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('canvas resource transaction aborted'));

      Promise.resolve(handler(store))
        .then(value => { result = value; })
        .catch(error => {
          try { tx.abort(); } catch {}
          reject(error);
        });
    });
  };

  const runBlobs = async (mode, handler) => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CANVAS_RESOURCES_BLOBS_STORE_NAME, mode);
      const store = tx.objectStore(CANVAS_RESOURCES_BLOBS_STORE_NAME);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('canvas resource blob transaction aborted'));
      Promise.resolve(handler(store))
        .then(value => { result = value; })
        .catch(error => {
          try { tx.abort(); } catch {}
          reject(error);
        });
    });
  };

  const runAllStores = async (mode, handler) => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([CANVAS_RESOURCES_STORE_NAME, CANVAS_RESOURCES_BLOBS_STORE_NAME], mode);
      const resources = tx.objectStore(CANVAS_RESOURCES_STORE_NAME);
      const blobs = tx.objectStore(CANVAS_RESOURCES_BLOBS_STORE_NAME);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('canvas resource transaction aborted'));
      Promise.resolve(handler(resources, blobs))
        .then(value => { result = value; })
        .catch(error => {
          try { tx.abort(); } catch {}
          reject(error);
        });
    });
  };

  return {
    put(record) {
      const next = { ...record, updatedAt: Date.now() };
      return run('readwrite', store => requestToPromise(store.put(next)).then(() => next));
    },
    putMany(records = []) {
      const list = Array.isArray(records) ? records.filter(Boolean) : [];
      return run('readwrite', async store => {
        for (const record of list) {
          await requestToPromise(store.put({ ...record, updatedAt: Date.now() }));
        }
        return list;
      });
    },
    get(id) {
      if (!id) return Promise.resolve(null);
      return run('readonly', store => requestToPromise(store.get(id)).then(value => value || null));
    },
    list() {
      return run('readonly', store => requestToPromise(store.getAll()).then(values => {
        const list = Array.isArray(values) ? values : [];
        return list.sort(compareCanvasResourceStable);
      }));
    },
    delete(id) {
      if (!id) return Promise.resolve();
      return (async () => {
        const record = await this.get(id);
        await run('readwrite', store => requestToPromise(store.delete(id)).then(() => undefined));
        if (record?.source?.cacheKey) {
          const remaining = await this.list();
          const stillReferenced = remaining.some(item => item?.source?.cacheKey === record.source.cacheKey);
          if (!stillReferenced) await this.deleteBlob(record.source.cacheKey);
        }
      })();
    },
    clear() {
      return runAllStores('readwrite', (resources, blobs) => Promise.all([
        requestToPromise(resources.clear()),
        requestToPromise(blobs.clear())
      ]).then(() => undefined));
    },
    putBlob(record = {}) {
      const next = { ...record, updatedAt: Date.now() };
      return runBlobs('readwrite', store => requestToPromise(store.put(next)).then(() => next));
    },
    getBlob(cacheKey) {
      if (!cacheKey) return Promise.resolve(null);
      return runBlobs('readonly', store => requestToPromise(store.get(cacheKey)).then(value => value || null));
    },
    listBlobs() {
      return runBlobs('readonly', store => requestToPromise(store.getAll()).then(values => (
        Array.isArray(values) ? values.sort(compareCanvasResourceStable) : []
      )));
    },
    deleteBlob(cacheKey) {
      if (!cacheKey) return Promise.resolve();
      return runBlobs('readwrite', store => requestToPromise(store.delete(cacheKey)).then(() => undefined));
    }
  };
}

function isCacheableRemoteImage(src) {
  return /^https:\/\//i.test(String(src || '').trim());
}

function compareCanvasResourceStable(left, right) {
  return (Number(right?.updatedAt) || 0) - (Number(left?.updatedAt) || 0)
    || (Number(right?.createdAt) || 0) - (Number(left?.createdAt) || 0)
    || String(left?.title || left?.label || left?.id || '').localeCompare(String(right?.title || right?.label || right?.id || ''), 'zh-CN', { numeric: true, sensitivity: 'base' })
    || String(left?.id || '').localeCompare(String(right?.id || ''), 'zh-CN', { numeric: true });
}

async function buildCacheKey(src) {
  const text = String(src || '');
  if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv-${(hash >>> 0).toString(16)}`;
}

async function fetchImageBlob(src, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 12000;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(src, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'force-cache',
      signal: controller?.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const declaredSize = Number(response.headers.get('content-length')) || 0;
    if (declaredSize > CANVAS_RESOURCE_CACHE_MAX_ITEM_BYTES) throw new Error('image is too large');
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
          if (size > CANVAS_RESOURCE_CACHE_MAX_ITEM_BYTES) {
            await reader.cancel().catch(() => {});
            throw new Error('image is too large');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock?.();
      }
      blob = new Blob(chunks, { type: contentType || 'application/octet-stream' });
    } else {
      blob = await response.blob();
    }
    if (blob.size > CANVAS_RESOURCE_CACHE_MAX_ITEM_BYTES) throw new Error('image is too large');
    if (!contentType.startsWith('image/') && !String(blob.type || '').toLowerCase().startsWith('image/')) {
      throw new Error('response is not an image');
    }
    return blob;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function collectCanvasResourceIds(projects = []) {
  const ids = new Set();
  const list = Array.isArray(projects) ? projects : [projects];
  list.forEach(project => {
    Object.values(project?.nodes || {}).forEach(node => {
      const id = trimText(node?.resourceId);
      if (id) ids.add(id);
    });
  });
  return ids;
}

export async function garbageCollectCanvasResources(store, projects = [], options = {}) {
  if (!store?.list || !store?.delete) return { removed: 0, kept: 0 };
  const keepIds = collectCanvasResourceIds(projects);
  (Array.isArray(options.keepResourceIds) ? options.keepResourceIds : []).forEach(id => {
    const value = trimText(id);
    if (value) keepIds.add(value);
  });
  const records = await store.list();
  let removed = 0;
  for (const record of Array.isArray(records) ? records : []) {
    if (!record?.id || keepIds.has(record.id)) continue;
    await store.delete(record.id);
    removed += 1;
  }
  return { removed, kept: Math.max(0, (Array.isArray(records) ? records.length : 0) - removed) };
}

async function fetchImageViaProxy(src, options = {}) {
  const endpoint = options.proxyEndpoint || 'api-proxy.php';
  const url = new URL(endpoint, globalThis.location?.href || 'http://localhost/');
  url.searchParams.set('media', '1');
  url.searchParams.set('target', src);
  return fetchImageBlob(url.href, { ...options, timeoutMs: options.proxyTimeoutMs || 15000 });
}

async function trimBlobCache(store, maxBytes = CANVAS_RESOURCE_CACHE_MAX_BYTES) {
  try {
    const blobs = (await store.listBlobs()).sort((a, b) => compareCanvasResourceStable(b, a));
    let total = blobs.reduce((sum, record) => sum + (Number(record.size) || Number(record.blob?.size) || 0), 0);
    for (const record of blobs) {
      if (total <= maxBytes) break;
      await store.deleteBlob(record.cacheKey);
      total -= Number(record.size) || Number(record.blob?.size) || 0;
    }
  } catch (error) {
    console.warn('canvas blob cache trim failed', error);
  }
}

export async function cacheCanvasResourceRecord(record, options = {}) {
  const store = options.store || getCanvasResourceStore(options);
  const src = trimText(record?.source?.src || '');
  if (!isCacheableRemoteImage(src)) {
    return { record, cached: false, status: 'not-cacheable', cacheWarnings: [] };
  }

  const cacheKey = await buildCacheKey(src);
  const cached = await store.getBlob(cacheKey).catch(() => null);
  if (cached?.blob) {
    await store.putBlob({ ...cached, updatedAt: Date.now() }).catch(() => {});
    const hydrated = {
      ...record,
      source: { ...record.source, cacheKey, cacheStatus: 'cached' },
      metadata: { ...(record.metadata || {}), cacheKey, cacheStatus: 'cached' }
    };
    await store.put(hydrated).catch(() => {});
    return { record: hydrated, cached: true, status: 'cached', cacheKey, blob: cached.blob, cacheWarnings: [] };
  }

  let blob = null;
  const errors = [];
  try {
    blob = await fetchImageBlob(src, options);
  } catch (error) {
    errors.push(error);
  }
  if (!blob && options.proxy !== false) {
    try {
      blob = await fetchImageViaProxy(src, options);
    } catch (error) {
      errors.push(error);
    }
  }

  if (!blob) {
    const remoteOnly = {
      ...record,
      source: { ...record.source, cacheKey, cacheStatus: 'remote-only' },
      metadata: { ...(record.metadata || {}), cacheKey, cacheStatus: 'remote-only' }
    };
    await store.put(remoteOnly).catch(() => {});
    return {
      record: remoteOnly,
      cached: false,
      status: 'remote-only',
      cacheKey,
      cacheWarnings: [errors[errors.length - 1]?.message || 'image cache unavailable']
    };
  }

  const blobRecord = {
    cacheKey,
    blob,
    mimeType: blob.type || 'image/png',
    size: blob.size,
    sourceUrl: src,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  try {
    await store.putBlob(blobRecord);
    await trimBlobCache(store, options.maxBytes || CANVAS_RESOURCE_CACHE_MAX_BYTES);
  } catch (error) {
    const remoteOnly = {
      ...record,
      source: { ...record.source, cacheKey, cacheStatus: 'remote-only' },
      metadata: { ...(record.metadata || {}), cacheKey, cacheStatus: 'remote-only' }
    };
    return { record: remoteOnly, cached: false, status: 'remote-only', cacheKey, cacheWarnings: [error?.message || 'cache quota exceeded'] };
  }

  const hydrated = {
    ...record,
    source: { ...record.source, cacheKey, cacheStatus: 'cached' },
    metadata: { ...(record.metadata || {}), cacheKey, cacheStatus: 'cached' }
  };
  await store.put(hydrated).catch(() => {});
  return { record: hydrated, cached: true, status: 'cached', cacheKey, blob, cacheWarnings: [] };
}

export async function getCanvasResourceDisplaySource(record, options = {}) {
  const src = trimText(record?.source?.src || '');
  const cacheKey = trimText(record?.source?.cacheKey || record?.metadata?.cacheKey || '');
  const store = options.store || getCanvasResourceStore(options);
  if (!cacheKey || !globalThis.URL || typeof globalThis.URL.createObjectURL !== 'function') {
    return { src, objectUrl: '', revoke: () => {} };
  }
  const cached = await store.getBlob(cacheKey).catch(() => null);
  if (!cached?.blob) return { src, objectUrl: '', revoke: () => {} };
  const objectUrl = globalThis.URL.createObjectURL(cached.blob);
  return { src: objectUrl, objectUrl, revoke: () => globalThis.URL.revokeObjectURL(objectUrl) };
}

function normalizeBridgeSourceList(list, baseUrl, origin) {
  return (Array.isArray(list) ? list : []).map(source => (
    normalizeCanvasResourceSource({ ...source, origin }, { baseUrl, origin })
  ));
}

function getHistoryRecordCanvasSource(record = {}) {
  const src = trimText(record.imageSrc || record.imageUrl || record.videoSrc || record.videoUrl || '');
  if (!src) return null;

  return {
    kind: record.mediaType === 'video' ? 'video' : record.mediaType === 'audio' ? 'audio' : 'image',
    src,
    label: trimText(record.prompt || record.filename || ''),
    alt: trimText(record.prompt || ''),
    mimeType: trimText(record.mimeType || ''),
    width: null,
    height: null,
    durationMs: toNumberOrNull(record.durationMs || record.duration),
    recordId: trimText(record.id || ''),
    thumbnailSrc: trimText(record.thumbnail || ''),
    posterSrc: trimText(record.thumbnail || '')
  };
}

export async function getCanvasImportSourcesFromBridge(bridge = globalThis.CanvasBridge, options = {}) {
  const baseUrl = options.baseUrl || globalThis.location?.href || '';
  const includeOrigins = Array.isArray(options.origins) && options.origins.length
    ? new Set(options.origins.map(item => trimText(item)))
    : null;
  const allowOrigin = (origin) => !includeOrigins || includeOrigins.has(origin);
  const read = async (method, origin) => {
    if (!allowOrigin(origin)) return [];
    const list = typeof bridge?.[method] === 'function' ? await bridge[method]() : [];
    return normalizeBridgeSourceList(list, baseUrl, origin);
  };

  const uploadSources = await read('getUploadPreviewImageSources', 'upload-preview');
  const resultSources = await read('getResultImageSources', 'result-output');
  const historyGridSources = await read('getHistoryGridImageSources', 'history-grid');
  const historyEntryList = allowOrigin('history-grid') && typeof bridge?.loadHistoryEntries === 'function'
    ? await bridge.loadHistoryEntries()
    : [];
  const historyRecordMap = new Map(
    (Array.isArray(historyEntryList) ? historyEntryList : [])
      .map(record => [trimText(record?.id || ''), record])
      .filter(([recordId]) => recordId)
  );

  const upgradedHistorySources = historyGridSources
    .map(source => {
      const record = historyRecordMap.get(source.recordId || '');
      const upgraded = record ? getHistoryRecordCanvasSource(record) : null;
      if (!upgraded) return source.src ? source : null;

      return normalizeCanvasResourceSource({
        ...source,
        ...upgraded,
        origin: 'history-grid',
        recordId: source.recordId || upgraded.recordId
      }, { baseUrl, origin: 'history-grid' });
    })
    .filter(Boolean);

  return [...uploadSources, ...resultSources, ...upgradedHistorySources].filter(source => source?.src);
}

export async function importCanvasResourcesFromBridge(bridge = globalThis.CanvasBridge, options = {}) {
  const store = options.store || getCanvasResourceStore(options);
  const sources = await getCanvasImportSourcesFromBridge(bridge, options);
  const records = sources.map(source => createCanvasResourceRecord(source));
  if (records.length) {
    await store.putMany(records);
  }
  return records;
}
