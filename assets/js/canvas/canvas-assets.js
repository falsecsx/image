// Global asset library: cross-project favorites, reusable via @asset:<id> tokens.
// Separate from canvas-resources.js (project resource snapshots): this is a persistent favorites layer.
import { createId } from './canvas-model.js?v=20260813-4';

export const CANVAS_ASSETS_DB_NAME = 'image_app:canvas_assets';
export const CANVAS_ASSETS_STORE_NAME = 'assets';
export const CANVAS_ASSETS_DB_VERSION = 1;

function trimText(value) {
  return String(value ?? '').trim();
}

function compareAssetText(left, right) {
  return trimText(left).localeCompare(trimText(right), 'zh-CN', {
    numeric: true,
    sensitivity: 'base'
  });
}

function compareAssetsStable(left, right) {
  return (Number(right?.updatedAt) || 0) - (Number(left?.updatedAt) || 0)
    || (Number(right?.createdAt) || 0) - (Number(left?.createdAt) || 0)
    || compareAssetText(left?.title, right?.title)
    || compareAssetText(left?.id, right?.id);
}

function inferKind(source = {}) {
  const kind = trimText(source.kind).toLowerCase();
  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'text') return kind;
  const mimeType = trimText(source.mimeType || source.mime || '').toLowerCase();
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('text/')) return 'text';
  return 'image';
}

/**
 * Build an asset record from a media node, history card, or resource source.
 * @param {object} source - { src/dataUrl/content, kind?, mimeType?, title?, tags?, note? }
 * @returns {object} asset record (without id/createdAt; those added on put)
 */
export function createCanvasAsset(source = {}) {
  const kind = inferKind(source);
  const now = Date.now();
  const isText = kind === 'text';
  const content = isText ? trimText(source.content || source.text || source.src || '') : '';
  const src = isText ? '' : trimText(source.src || source.dataUrl || source.url || '');
  return {
    id: trimText(source.id) || createId('asset'),
    kind,
    title: trimText(source.title || source.label || source.name || (isText ? '文本素材' : '图片素材')),
    src,
    content,
    mimeType: trimText(source.mimeType || source.mime || '') || (kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : kind === 'text' ? 'text/plain' : 'image/png'),
    tags: Array.isArray(source.tags) ? source.tags.map(t => trimText(t)).filter(Boolean) : [],
    note: trimText(source.note || ''),
    originProjectId: trimText(source.originProjectId || ''),
    originLabel: trimText(source.originLabel || ''),
    createdAt: Number.isFinite(source.createdAt) ? source.createdAt : now,
    updatedAt: Number.isFinite(source.updatedAt) ? source.updatedAt : now,
    lastUsedAt: Number.isFinite(source.lastUsedAt) ? source.lastUsedAt : 0
  };
}

export function getNodeAssetToken(assetId) {
  return assetId ? `@[asset:${assetId}]` : '';
}

/**
 * Extract @[asset:id] tokens from a string. Mirrors extractNodeReferenceIds shape.
 */
export function extractAssetReferenceIds(value = '') {
  const text = String(value || '');
  const matches = [...text.matchAll(/@\[asset:([a-z0-9-]+)\]/gi)];
  return [...new Set(matches.map(match => String(match[1] || '').trim()).filter(Boolean))];
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openCanvasAssetDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) {
    return Promise.reject(new Error('indexedDB is not available'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CANVAS_ASSETS_DB_NAME, CANVAS_ASSETS_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CANVAS_ASSETS_STORE_NAME)) {
        const store = db.createObjectStore(CANVAS_ASSETS_STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('kind', 'kind', { unique: false });
        store.createIndex('originProjectId', 'originProjectId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export function getCanvasAssetStore(options = {}) {
  const indexedDB = options.indexedDB || globalThis.indexedDB;
  let dbPromise = null;

  const getDb = () => {
    if (!dbPromise) dbPromise = openCanvasAssetDatabase(indexedDB);
    return dbPromise;
  };

  const run = async (mode, handler) => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CANVAS_ASSETS_STORE_NAME, mode);
      const store = tx.objectStore(CANVAS_ASSETS_STORE_NAME);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('canvas asset transaction aborted'));
      Promise.resolve(handler(store))
        .then(value => { result = value; })
        .catch(error => {
          try { tx.abort(); } catch {}
          reject(error);
        });
    });
  };

  return {
    put(asset) {
      const next = { ...asset, updatedAt: Date.now() };
      return run('readwrite', store => requestToPromise(store.put(next)).then(() => next));
    },
    get(id) {
      if (!id) return Promise.resolve(null);
      return run('readonly', store => requestToPromise(store.get(id)).then(value => value || null));
    },
    /** Resolve a list of asset ids to their records (for @asset token hydration). */
    getMany(ids = []) {
      const unique = [...new Set(ids.map(id => trimText(id)).filter(Boolean))];
      if (!unique.length) return Promise.resolve([]);
      return run('readonly', async store => {
        const results = [];
        for (const id of unique) {
          const value = await requestToPromise(store.get(id));
          if (value) results.push(value);
        }
        return results;
      });
    },
    list() {
      return run('readonly', store => requestToPromise(store.getAll()).then(values => {
        const list = Array.isArray(values) ? values : [];
        return list.sort(compareAssetsStable);
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

/**
 * Convert an asset record into a reference image for generation (image/video kinds only).
 * Text assets return null; callers should inline their content into the prompt instead.
 */
export function assetToReferenceImage(asset) {
  if (!asset || asset.kind === 'text') return null;
  const src = trimText(asset.src);
  if (!src) return null;
  return {
    dataUrl: src,
    name: asset.title || 'asset',
    role: 'asset'
  };
}
