/**
 * IndexedDB history / folder / prompt store.
 * Loaded before app.js; attaches to window.HistoryStore.
 */
(function (global) {
  const DB_NAME = 'GeminiImageHistory';
  const DB_VERSION = 5;
  const STORE_NAME = 'history';
  const STORE_NAME_FOLDER = 'folderHandle';
  const STORE_NAME_PROMPTS = 'prompts';
  const MAX_HISTORY = 100;
  let db = null;

  function compareText(left, right) {
    return String(left ?? '').trim().localeCompare(String(right ?? '').trim(), 'zh-CN', {
      numeric: true,
      sensitivity: 'base'
    });
  }

  function compareHistoryRecords(left, right) {
    return (Number(right?.updatedAt) || Number(right?.timestamp) || Number(right?.createdAt) || 0)
      - (Number(left?.updatedAt) || Number(left?.timestamp) || Number(left?.createdAt) || 0)
      || compareText(left?.prompt || left?.title, right?.prompt || right?.title)
      || compareText(left?.filename, right?.filename)
      || compareText(left?.id || left?.imageSrc || left?.imageUrl, right?.id || right?.imageSrc || right?.imageUrl);
  }

  function compareLocalPrompts(left, right) {
    return (Number(right?.updatedAt) || Number(right?.createdAt) || 0)
      - (Number(left?.updatedAt) || Number(left?.createdAt) || 0)
      || compareText(left?.title, right?.title)
      || compareText(left?.id || left?.content, right?.id || right?.content);
  }

  function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        // 创建提示词库 Store
        if (!database.objectStoreNames.contains('prompts')) {
          const promptStore = database.createObjectStore('prompts', { keyPath: 'id', autoIncrement: true });
          promptStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
        // 创建文件夹句柄 Store（用于持久化保存位置）
        if (!database.objectStoreNames.contains(STORE_NAME_FOLDER)) {
          database.createObjectStore(STORE_NAME_FOLDER, { keyPath: 'id' });
        }
      };
    });
  }

  async function saveHistory(record) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const request = store.add(record);
      request.onsuccess = () => {
        // 检查是否超过最大数量，删除最旧的
        trimHistory().then(() => resolve(request.result));
      };
      request.onerror = () => reject(request.error);
    });
  }

  function createHistoryDedupKey(record) {
    return [
      record.mediaType || 'image',
      record.timestamp || '',
      record.filename || '',
      record.imageUrl || record.videoUrl || record.imageSrc || record.videoSrc || '',
      record.prompt || ''
    ].map(value => String(value).trim()).join('|');
  }

  function normalizeImportedHistoryRecord(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    const normalized = { ...record };
    delete normalized.id;
    normalized.timestamp = Number(normalized.timestamp) || Date.now();
    if (!normalized.mediaType && (normalized.videoUrl || normalized.videoSrc)) {
      normalized.mediaType = 'video';
    }
    if (!normalized.thumbnail && !normalized.imageSrc && !normalized.imageUrl && !normalized.videoUrl && !normalized.videoSrc) {
      return null;
    }
    return normalized;
  }

  function parseHistoryImportPayload(payload) {
    const records = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.records) ? payload.records : (Array.isArray(payload?.history) ? payload.history : []));
    return records.map(normalizeImportedHistoryRecord).filter(Boolean);
  }

  async function importHistoryRecords(records) {
    if (!db) await initDB();
    const existingRecords = await loadHistory();
    const existingKeys = new Set(existingRecords.map(createHistoryDedupKey));
    const uniqueRecords = [];
    let skipped = 0;

    records.forEach(record => {
      const key = createHistoryDedupKey(record);
      if (existingKeys.has(key)) {
        skipped++;
        return;
      }
      existingKeys.add(key);
      uniqueRecords.push(record);
    });

    if (!uniqueRecords.length) return { imported: 0, skipped };

    await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      uniqueRecords.forEach(record => store.add(record));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('导入历史记录失败'));
    });

    await trimHistory();
    return { imported: uniqueRecords.length, skipped };
  }

  async function trimHistory() {
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const countRequest = store.count();

      countRequest.onsuccess = () => {
        const count = countRequest.result;
        if (count > MAX_HISTORY) {
          const deleteCount = count - MAX_HISTORY;
          const cursorRequest = index.openCursor();
          let deleted = 0;

          cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor && deleted < deleteCount) {
              store.delete(cursor.primaryKey);
              deleted++;
              cursor.continue();
            } else {
              resolve();
            }
          };
        } else {
          resolve();
        }
      };
    });
  }

  async function loadHistory() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        // 按时间戳倒序排列（最新的在前）
        const records = request.result.sort(compareHistoryRecords);
        resolve(records);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteHistoryById(id) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function clearAllHistory() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function saveFolderHandle(handle) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME_FOLDER], 'readwrite');
      const store = transaction.objectStore(STORE_NAME_FOLDER);

      // 清除旧的句柄（只保留一个）
      store.clear();

      // 保存新的句柄
      const request = store.add({ id: 'savedFolder', handle: handle, savedAt: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function clearSavedFolderHandle() {
    if (!db) await initDB();

    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME_FOLDER], 'readwrite');
      const store = transaction.objectStore(STORE_NAME_FOLDER);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }

  async function savePromptToLocalLibrary(title, content) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['prompts'], 'readwrite');
      const store = transaction.objectStore('prompts');

      const record = {
        title: title,
        content: content,
        createdAt: Date.now(),
        usageCount: 0
      };

      const request = store.add(record);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function loadAllLocalPrompts() {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['prompts'], 'readonly');
      const store = transaction.objectStore('prompts');
      const request = store.getAll();

      request.onsuccess = () => {
        // 按创建时间倒序排列（最新的在前）
        const records = request.result.sort(compareLocalPrompts);
        resolve(records);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteLocalPrompt(id) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['prompts'], 'readwrite');
      const store = transaction.objectStore('prompts');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function incrementLocalPromptUsage(id) {
    if (!db) await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['prompts'], 'readwrite');
      const store = transaction.objectStore('prompts');
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const record = getRequest.result;
        if (record) {
          record.usageCount = (record.usageCount || 0) + 1;
          const updateRequest = store.put(record);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  function readHistoryImportFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(reader.result));
        } catch (err) {
          reject(new Error('历史记录文件不是有效 JSON'));
        }
      };
      reader.onerror = () => reject(new Error('读取历史记录文件失败'));
      reader.readAsText(file);
    });
  }

  async function loadFolderHandleRecord() {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME_FOLDER], 'readonly');
      const store = transaction.objectStore(STORE_NAME_FOLDER);
      const request = store.get('savedFolder');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  global.HistoryStore = {
    DB_NAME,
    DB_VERSION,
    STORE_NAME,
    STORE_NAME_FOLDER,
    MAX_HISTORY,
    initDB,
    saveHistory,
    loadHistory,
    trimHistory,
    deleteHistoryById,
    clearAllHistory,
    createHistoryDedupKey,
    normalizeImportedHistoryRecord,
    parseHistoryImportPayload,
    importHistoryRecords,
    readHistoryImportFile,
    saveFolderHandle,
    clearSavedFolderHandle,
    loadFolderHandleRecord,
    savePromptToLocalLibrary,
    loadAllLocalPrompts,
    deleteLocalPrompt,
    incrementLocalPromptUsage,
    getDb() { return db; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
