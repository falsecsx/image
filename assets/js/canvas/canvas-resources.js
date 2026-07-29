import { createId } from './canvas-model.js?v=20260626-2';

export const CANVAS_RESOURCES_DB_NAME = 'image_app:canvas_resources';
export const CANVAS_RESOURCES_STORE_NAME = 'resources';
export const CANVAS_RESOURCES_DB_VERSION = 1;

function trimText(value) {
  return String(value ?? '').trim();
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
      origin: normalized.origin
    }
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
        return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || (b.createdAt || 0) - (a.createdAt || 0));
      }));
    },
    delete(id) {
      if (!id) return Promise.resolve();
      return run('readwrite', store => requestToPromise(store.delete(id)).then(() => undefined));
    },
    clear() {
      return run('readwrite', store => requestToPromise(store.clear()).then(() => undefined));
    }
  };
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
