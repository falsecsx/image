
    (() => {
      // 获取用户配置的 Base URL
      const baseUrlInput = document.getElementById('base-url');
      const proxyModeInput = document.getElementById('proxy-mode');
      const apiLinkEl = document.getElementById('api-link');
      const appConfig = window.APP_CONFIG || {};
      const defaultBaseUrl = appConfig.defaultBaseUrl || 'https://api.openai.com';
      const apiHomeUrl = appConfig.apiHomeUrl || 'https://api.openai.com';
      const apiProxyEndpoint = appConfig.apiProxyEndpoint || 'api-proxy.php';
      const API_PROXY_MODE_KEY = 'api_proxy_mode';
      const THREE_JS_CDN = 'https://cdn.jsdelivr.net/npm/three@0.140.0/build/three.min.js';
      const ORBIT_CONTROLS_CDN = 'https://cdn.jsdelivr.net/npm/three@0.140.0/examples/js/controls/OrbitControls.js';
      const debugEnabled = appConfig.debug === true || new URLSearchParams(window.location.search).get('debug') === '1';
      const debugLog = (...args) => {
        if (debugEnabled) console.log(...args);
      };
      let threeJsLoadPromise = null;

      function loadExternalScript(src) {
        return new Promise((resolve, reject) => {
          const existing = document.querySelector(`script[src="${src}"]`);
          if (existing) {
            if (existing.dataset.loaded === 'true') {
              resolve();
              return;
            }

            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error(`Failed to load script: ${src}`)), { once: true });
            return;
          }

          const script = document.createElement('script');
          script.src = src;
          script.async = true;
          script.onload = () => {
            script.dataset.loaded = 'true';
            resolve();
          };
          script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
          document.head.appendChild(script);
        });
      }

      async function ensureThreeJsReady() {
        if (window.THREE?.OrbitControls) return;
        if (!threeJsLoadPromise) {
          threeJsLoadPromise = (async () => {
            await loadExternalScript(THREE_JS_CDN);
            await loadExternalScript(ORBIT_CONTROLS_CDN);
          })().catch(err => {
            threeJsLoadPromise = null;
            throw err;
          });
        }

        await threeJsLoadPromise;
      }

      function scheduleNonCriticalTask(task, timeout = 300) {
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(() => task(), { timeout });
          return;
        }

        window.setTimeout(task, 0);
      }

      function yieldToBrowser() {
        return new Promise(resolve => {
          if ('requestAnimationFrame' in window) {
            window.requestAnimationFrame(() => resolve());
            return;
          }

          window.setTimeout(resolve, 0);
        });
      }

      function getBaseUrl() {
        const url = baseUrlInput.value.trim().replace(/\/+$/, '');
        return url || defaultBaseUrl;
      }

      function buildDirectApiUrl(path) {
        const base = getBaseUrl();
        if (base.endsWith('/v1') && path.startsWith('/v1/')) {
          return base + path.slice('/v1'.length);
        }
        if (base.endsWith('/v1') && path.startsWith('/v1beta/')) {
          return base.slice(0, -'/v1'.length) + path;
        }
        if (base.endsWith('/v1beta') && path.startsWith('/v1beta/')) {
          return base + path.slice('/v1beta'.length);
        }
        if (base.endsWith('/v1beta') && path.startsWith('/v1/')) {
          return base.slice(0, -'/v1beta'.length) + path;
        }
        return base + path;
      }

      function isApiProxyEnabled() {
        return !!proxyModeInput?.checked && /^https:\/\//i.test(getBaseUrl());
      }

      function buildApiUrl(path) {
        const directUrl = buildDirectApiUrl(path);
        if (!isApiProxyEnabled()) return directUrl;

        const proxyUrl = new URL(apiProxyEndpoint, window.location.href);
        proxyUrl.searchParams.set('target', directUrl);
        return proxyUrl.toString();
      }

      function buildApiProxyUrlForTarget(targetUrl) {
        const proxyUrl = new URL(apiProxyEndpoint, window.location.href);
        proxyUrl.searchParams.set('target', targetUrl);
        return proxyUrl.toString();
      }

      function canProxyImageUrl(src) {
        return isApiProxyEnabled() && /^https:\/\//i.test(src || '');
      }

      // 当 Base URL 变化时，同步更新"前往获取"链接
      baseUrlInput.addEventListener('input', () => {
        const url = getBaseUrl();
        if (apiLinkEl) apiLinkEl.href = url.startsWith('/') ? apiHomeUrl : url;
      });

      // 模型选择下拉框
      const imageModelSelect = document.getElementById('image-model');
      const textModelSelect = document.getElementById('text-model');
      const protocolSelect = document.getElementById('api-protocol');

      function getImageModel() {
        return imageModelSelect.value || 'gpt-image-2';
      }
      function getTextModel() {
        return textModelSelect.value || 'gpt-5.4-mini';
      }
      function getProtocol() {
        return protocolSelect.value || 'openai-chat';
      }

      function getReferenceImageLimit(protocol = getProtocol()) {
        return protocol === 'gemini' ? 14 : 4;
      }

      function getReferenceImagesForRequest(images = state.images, protocol = getProtocol()) {
        return (images || []).slice(0, getReferenceImageLimit(protocol));
      }

      function isGoogleNativeEndpoint(key = getApiKey()) {
        return /(^|\.)googleapis\.com$/i.test(new URL(getBaseUrl(), window.location.href).hostname)
          || /^AIza[0-9A-Za-z_-]{20,}$/.test(String(key || '').trim());
      }

      function buildRequestHeaders(key, protocol = getProtocol()) {
        const headers = { 'Content-Type': 'application/json' };
        if (protocol === 'gemini' && isGoogleNativeEndpoint(key)) {
          headers['x-goog-api-key'] = key;
        } else {
          headers['Authorization'] = `Bearer ${key}`;
        }
        return headers;
      }

      // 获取生图 endpoint（根据协议自动切换）
      function getEndpoint() {
        const protocol = getProtocol();
        if (protocol === 'openai-chat') {
          return buildApiUrl('/v1/chat/completions');
        }
        if (protocol === 'openai-images') {
          return buildApiUrl('/v1/images/generations');
        }
        // Gemini 原生
        return buildApiUrl(`/v1beta/models/${getImageModel()}:generateContent`);
      }

      // 文本操作 endpoint（分镜分析、优化、翻译）
      function getFlashEndpoint() {
        const protocol = getProtocol();
        if (protocol === 'gemini') {
          return buildApiUrl(`/v1beta/models/${getTextModel()}:generateContent`);
        }
        // OpenAI 格式统一走 chat/completions
        return buildApiUrl('/v1/chat/completions');
      }

      const apiKeyInput = document.getElementById('api-key');
      const rememberApiKeyInput = document.getElementById('remember-api-key');
      const setTextKeyBtn = document.getElementById('set-text-key-btn');
      const API_KEY_STORAGE_KEY = 'gemini_api_key';
      const API_KEY_REMEMBER_KEY = 'gemini_api_key_remember';
      const TEXT_API_KEY_STORAGE_KEY = 'text_api_key_override';
      const PROMPT_ADMIN_TOKEN_STORAGE_KEY = 'prompt_admin_token';
      let apiKeyValue = '';
      let textApiKeyValue = '';

      function loadStoredApiKey() {
        const sessionKey = sessionStorage.getItem(API_KEY_STORAGE_KEY) || '';
        const localKey = localStorage.getItem(API_KEY_STORAGE_KEY) || '';
        const remember = localStorage.getItem(API_KEY_REMEMBER_KEY) === '1';
        return {
          key: sessionKey || localKey,
          remember
        };
      }

      function persistApiKey(key, remember) {
        const value = (key || '').trim();
        sessionStorage.removeItem(API_KEY_STORAGE_KEY);
        localStorage.removeItem(API_KEY_STORAGE_KEY);

        if (!value) {
          localStorage.removeItem(API_KEY_REMEMBER_KEY);
          return;
        }

        if (remember) {
          localStorage.setItem(API_KEY_STORAGE_KEY, value);
          localStorage.setItem(API_KEY_REMEMBER_KEY, '1');
        } else {
          sessionStorage.setItem(API_KEY_STORAGE_KEY, value);
          localStorage.removeItem(API_KEY_REMEMBER_KEY);
        }
      }

      function loadStoredTextApiKey() {
        return localStorage.getItem(TEXT_API_KEY_STORAGE_KEY) || '';
      }

      function persistTextApiKey(key) {
        const value = (key || '').trim();
        textApiKeyValue = value;
        if (value) {
          localStorage.setItem(TEXT_API_KEY_STORAGE_KEY, value);
        } else {
          localStorage.removeItem(TEXT_API_KEY_STORAGE_KEY);
        }
        updateTextKeyButtonState();
      }

      function maskApiKey(key) {
        const value = (key || '').trim();
        if (!value) return '';
        if (value.length <= 11) return value;

        const prefix = value.slice(0, 7);
        const suffix = value.slice(-4);
        return prefix + '*'.repeat(value.length - 11) + suffix;
      }

      function renderApiKeyMask() {
        apiKeyInput.value = maskApiKey(apiKeyValue);
      }

      function getApiKey() {
        const shownValue = apiKeyInput.value.trim();
        if (!shownValue) {
          apiKeyValue = '';
          return '';
        }

        if (apiKeyValue && shownValue.includes('*')) {
          renderApiKeyMask();
          return apiKeyValue;
        }

        apiKeyValue = shownValue;
        return apiKeyValue;
      }

      function getTextApiKey() {
        return (textApiKeyValue || '').trim() || getApiKey();
      }

      function updateTextKeyButtonState() {
        if (!setTextKeyBtn) return;
        setTextKeyBtn.title = textApiKeyValue
          ? '已设置文本模型专用 Key，留空保存可恢复使用上方默认 Key'
          : '留空时默认使用上方 API Key';
      }

      function showTextKeyDialog() {
        let dialogKeyValue = textApiKeyValue || '';
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay active';
        dialogOverlay.innerHTML = `
          <div class="dialog-content">
            <div class="dialog-title">设置文本模型专用 Key</div>
            <div class="dialog-desc">仅用于文本优化、翻译、分镜分析等文本模型请求。留空后保存，则默认使用上方 API Key。</div>
            <input class="dialog-input" id="text-key-input" type="text" placeholder="留空则使用上方 API Key" autocomplete="off" />
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn-cancel" type="button">取消</button>
              <button class="dialog-btn dialog-btn-confirm" type="button">保存</button>
            </div>
          </div>
        `;

        document.body.appendChild(dialogOverlay);

        const textKeyInput = dialogOverlay.querySelector('#text-key-input');
        const cancelBtn = dialogOverlay.querySelector('.dialog-btn-cancel');
        const confirmBtn = dialogOverlay.querySelector('.dialog-btn-confirm');

        textKeyInput.value = maskApiKey(dialogKeyValue);

        const closeDialog = () => dialogOverlay.remove();
        const confirmSave = () => {
          const shownValue = textKeyInput.value.trim();
          if (!shownValue) {
            dialogKeyValue = '';
          } else if (!(shownValue.includes('*') && dialogKeyValue)) {
            dialogKeyValue = shownValue;
          }

          persistTextApiKey(dialogKeyValue);
          closeDialog();
          flashStatus(
            dialogKeyValue
              ? '已保存文本模型专用 Key'
              : '已清除文本模型专用 Key，文本请求将默认使用上方 API Key',
            'success'
          );
        };

        textKeyInput.addEventListener('paste', (event) => {
          const pastedText = event.clipboardData?.getData('text')?.trim();
          if (!pastedText) return;

          event.preventDefault();
          dialogKeyValue = pastedText;
          textKeyInput.value = maskApiKey(dialogKeyValue);
        });

        textKeyInput.addEventListener('input', () => {
          const shownValue = textKeyInput.value.trim();
          if (!shownValue) {
            dialogKeyValue = '';
            return;
          }

          if (shownValue.includes('*') && dialogKeyValue) {
            textKeyInput.value = maskApiKey(dialogKeyValue);
            return;
          }

          dialogKeyValue = shownValue;
        });

        cancelBtn.addEventListener('click', closeDialog);
        confirmBtn.addEventListener('click', confirmSave);
        textKeyInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') confirmSave();
          if (e.key === 'Escape') closeDialog();
        });
        dialogOverlay.addEventListener('click', (e) => {
          if (e.target === dialogOverlay) closeDialog();
        });

        setTimeout(() => textKeyInput.focus(), 80);
      }

      apiKeyInput.addEventListener('paste', (event) => {
        const pastedText = event.clipboardData?.getData('text')?.trim();
        if (!pastedText) return;

        event.preventDefault();
        apiKeyValue = pastedText;
        renderApiKeyMask();
      });

      apiKeyInput.addEventListener('input', () => {
        const shownValue = apiKeyInput.value.trim();
        if (!shownValue) {
          apiKeyValue = '';
          return;
        }

        if (shownValue.includes('*') && apiKeyValue) {
          renderApiKeyMask();
          return;
        }

        apiKeyValue = shownValue;
      });

      apiKeyInput.addEventListener('blur', renderApiKeyMask);
      apiKeyInput.addEventListener('focus', () => {
        if (apiKeyValue) {
          setTimeout(() => apiKeyInput.select(), 0);
        }
      });

      const promptInput = document.getElementById('prompt');
      const fileInput = document.getElementById('image');
      const uploadLabel = document.querySelector('label[for="image"]');
      const aspectSelect = document.getElementById('aspect');
      const resolutionSelect = document.getElementById('resolution');
      const imageQualitySelect = document.getElementById('image-quality');
      const outputFormatSelect = document.getElementById('output-format');
      const imageBackgroundSelect = document.getElementById('image-background');
      const countInput = document.getElementById('count');
      const statusEl = document.getElementById('status');
      const saveKeyBtn = document.getElementById('save-key');
      const runBtn = document.getElementById('run');
      const preview = document.getElementById('upload-preview');
      const resultsEl = document.getElementById('results');
      const resultCountEl = document.getElementById('result-count');
      const announcementBtn = document.getElementById('announcement-btn');
      const announcementModal = document.getElementById('announcement-modal');
      const announcementCloseBtn = document.getElementById('announcement-close');

      const state = { images: [] };
      let timeoutHandle = null;

      // 任务管理：每个任务有独立的定时器
      const taskTimers = new Map(); // taskId -> intervalId

      // 任务管理变量
      let activeTasks = new Map();
      let taskIdCounter = 0;

      // Lightbox 相关元素
      const lightbox = document.getElementById('lightbox');
      const lightboxImg = document.getElementById('lightbox-img');
      const lightboxClose = document.getElementById('lightbox-close');

      // 打开 Lightbox
      function openLightbox(imgSrc) {
        lightboxImg.src = imgSrc;
        lightbox.classList.add('show');
        document.body.style.overflow = 'hidden';
      }

      // 关闭 Lightbox
      function closeLightbox() {
        lightbox.classList.remove('show');
        document.body.style.overflow = '';
      }

      function openAnnouncementModal() {
        if (!announcementModal) return;
        announcementModal.classList.add('active');
        announcementModal.setAttribute('aria-hidden', 'false');
      }

      function closeAnnouncementModal() {
        if (!announcementModal) return;
        announcementModal.classList.remove('active');
        announcementModal.setAttribute('aria-hidden', 'true');
      }

      // Lightbox 事件监听
      lightboxClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeLightbox();
      });

      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
          closeLightbox();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lightbox.classList.contains('show')) {
          closeLightbox();
        }
        if (e.key === 'Escape' && announcementModal?.classList.contains('active')) {
          closeAnnouncementModal();
        }
      });

      announcementBtn?.addEventListener('click', openAnnouncementModal);
      announcementCloseBtn?.addEventListener('click', closeAnnouncementModal);
      announcementModal?.addEventListener('click', (e) => {
        if (e.target === announcementModal) {
          closeAnnouncementModal();
        }
      });

      // ========== IndexedDB 历史记录模块 ==========
      const DB_NAME = 'GeminiImageHistory';
      const DB_VERSION = 5;  // 版本 5：与现有浏览器库版本对齐，避免降级打开失败
      const STORE_NAME = 'history';
      const STORE_NAME_FOLDER = 'folderHandle';
      const MAX_HISTORY = 100;
      let db = null;

      // 历史记录相关 DOM 元素
      const historyGrid = document.getElementById('history-grid');
      const historyCountEl = document.getElementById('history-count');
      const clearHistoryBtn = document.getElementById('clear-history');
      const historyPaginationEl = document.getElementById('history-pagination');
      const historyPrevBtn = document.getElementById('history-prev');
      const historyNextBtn = document.getElementById('history-next');
      const historyPageMetaEl = document.getElementById('history-page-meta');
      const selectFolderBtn = document.getElementById('select-folder');
      const resetFolderBtn = document.getElementById('reset-folder');
      const savePathEl = document.getElementById('save-path');
      const historyImageRetentionSelect = document.getElementById('history-image-retention');
      const HISTORY_IMAGE_RETENTION_KEY = 'history_image_retention';
      let historyCurrentPage = 1;
      let historyLastPageSize = 0;
      let historyResizeTimer = null;


      // 文件夹句柄
      let folderHandle = null;

      // 初始化 IndexedDB
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

      // 保存历史记录
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

      // 限制历史记录数量
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

      // 加载所有历史记录
      async function loadHistory() {
        if (!db) await initDB();

        return new Promise((resolve, reject) => {
          const transaction = db.transaction([STORE_NAME], 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.getAll();

          request.onsuccess = () => {
            // 按时间戳倒序排列（最新的在前）
            const records = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(records);
          };
          request.onerror = () => reject(request.error);
        });
      }

      function getHistoryColumnCount() {
        if (!historyGrid) return 1;
        if (window.matchMedia('(max-width: 420px)').matches) return 1;
        if (window.matchMedia('(max-width: 760px)').matches) return 2;

        const gridWidth = historyGrid.clientWidth || historyGrid.getBoundingClientRect().width || 0;
        if (!gridWidth) return 4;

        const minCardWidth = 180;
        const gap = 14;
        return Math.max(1, Math.floor((gridWidth + gap) / (minCardWidth + gap)));
      }

      function getHistoryPageSize() {
        return Math.max(1, getHistoryColumnCount() * 2);
      }

      function updateHistoryPagination(totalRecords, pageSize) {
        if (!historyPaginationEl || !historyPrevBtn || !historyNextBtn || !historyPageMetaEl) return;

        const normalizedPageSize = Math.max(1, pageSize || 1);
        const totalPages = Math.max(1, Math.ceil(totalRecords / normalizedPageSize));
        historyCurrentPage = Math.min(Math.max(historyCurrentPage, 1), totalPages);

        const shouldShowPagination = totalRecords > normalizedPageSize;
        historyPaginationEl.hidden = !shouldShowPagination;

        if (!shouldShowPagination) {
          historyPageMetaEl.textContent = totalRecords > 0 ? `共 ${totalRecords} 条记录` : '';
          return;
        }

        const start = (historyCurrentPage - 1) * normalizedPageSize + 1;
        const end = Math.min(totalRecords, historyCurrentPage * normalizedPageSize);

        historyPrevBtn.disabled = historyCurrentPage <= 1;
        historyNextBtn.disabled = historyCurrentPage >= totalPages;
        historyPageMetaEl.textContent = `第 ${historyCurrentPage} / ${totalPages} 页 · 显示 ${start}-${end} / ${totalRecords}`;
      }

      // 删除单条历史记录
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

      // 清空所有历史记录
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

      // ========== 文件夹句柄持久化模块 ==========

      // 保存文件夹句柄到 IndexedDB
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

      // 从 IndexedDB 恢复文件夹句柄
      async function restoreFolderHandle() {
        if (!db) await initDB();

        if (!('showDirectoryPicker' in window)) {
          debugLog('File System Access API unavailable');
          return false;
        }

        return new Promise((resolve) => {
          const transaction = db.transaction([STORE_NAME_FOLDER], 'readonly');
          const store = transaction.objectStore(STORE_NAME_FOLDER);
          const request = store.get('savedFolder');

          request.onsuccess = async () => {
            const result = request.result;
            if (!result || !result.handle) {
              resolve(false);
              return;
            }

            try {
              folderHandle = result.handle;
              savePathEl.textContent = folderHandle.name;
              resetFolderBtn.style.display = 'inline-block';
              resolve(true);
            } catch (err) {
              console.error('Restore saved folder failed:', err);
              await clearSavedFolderHandle();
              resolve(false);
            }
          };

          request.onerror = () => {
            console.error('Read saved folder handle failed');
            resolve(false);
          };
        });
      }

      async function ensureFolderPermission(handle, mode = 'readwrite', requestIfNeeded = false) {
        if (!handle || typeof handle.queryPermission !== 'function') {
          return false;
        }

        try {
          const permission = await handle.queryPermission({ mode });
          if (permission === 'granted') {
            return true;
          }

          if (!requestIfNeeded || typeof handle.requestPermission !== 'function') {
            return false;
          }

          const requested = await handle.requestPermission({ mode });
          return requested === 'granted';
        } catch (err) {
          console.error('Check folder permission failed:', err);
          return false;
        }
      }

      async function ensureWritableFolderHandle(options = {}) {
        const { autoReselect = true } = options;

        if (isMobileDevice()) {
          return { ok: false, reason: 'not_configured' };
        }

        if (!('showDirectoryPicker' in window)) {
          return { ok: false, reason: 'folder_unavailable' };
        }

        if (!folderHandle) {
          return { ok: false, reason: 'not_configured' };
        }

        try {
          const hasPermission = await ensureFolderPermission(folderHandle, 'readwrite', false);
          if (hasPermission) {
            return { ok: true, handle: folderHandle, reselected: false };
          }

          if (!autoReselect) {
            return { ok: false, reason: 'permission_denied' };
          }

          const reselectedHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
          const reselectedPermission = await ensureFolderPermission(reselectedHandle, 'readwrite', true);
          if (!reselectedPermission) {
            return { ok: false, reason: 'permission_denied' };
          }

          folderHandle = reselectedHandle;
          savePathEl.textContent = folderHandle.name;
          resetFolderBtn.style.display = 'inline-block';
          await saveFolderHandle(folderHandle);
          return { ok: true, handle: folderHandle, reselected: true };
        } catch (err) {
          if (err?.name === 'AbortError') {
            return { ok: false, reason: 'permission_denied' };
          }
          console.error('恢复文件夹写入权限失败:', err);
          return { ok: false, reason: 'folder_unavailable', error: err };
        }
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

      // ========== ????????? ==========
      function isPromptBackendEnabled() {
        return appConfig.promptApiUrl !== false && /^https?:$/.test(window.location.protocol);
      }

      function getPromptApiUrl(params = {}) {
        const url = new URL(appConfig.promptApiUrl || 'api/prompts.php', window.location.href);
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, value);
          }
        });
        return url.toString();
      }

      function getPromptAdminToken() {
        const savedToken = sessionStorage.getItem(PROMPT_ADMIN_TOKEN_STORAGE_KEY);
        if (savedToken) return savedToken;

        const token = prompt('请输入提示词库管理密钥（只用于新增、导入、删除公共提示词）');
        if (!token) throw new Error('已取消管理操作');

        sessionStorage.setItem(PROMPT_ADMIN_TOKEN_STORAGE_KEY, token.trim());
        return token.trim();
      }

      async function requestPromptApi(method, payload = null, options = {}) {
        const headers = { Accept: 'application/json' };
        const fetchOptions = { method, headers };

        if (payload) {
          headers['Content-Type'] = 'application/json';
          fetchOptions.body = JSON.stringify(payload);
        }

        if (options.admin) {
          headers['X-Admin-Token'] = getPromptAdminToken();
        }

        const response = await fetch(getPromptApiUrl(options.params || {}), fetchOptions);
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};

        if (!response.ok || data.ok === false) {
          if (response.status === 401 || response.status === 403) {
            sessionStorage.removeItem(PROMPT_ADMIN_TOKEN_STORAGE_KEY);
          }
          throw new Error(data.error || `提示词库接口请求失败（${response.status}）`);
        }

        return data;
      }

      // 保存提示词到本地库
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

      // 加载所有本地提示词
      async function loadAllLocalPrompts() {
        if (!db) await initDB();

        return new Promise((resolve, reject) => {
          const transaction = db.transaction(['prompts'], 'readonly');
          const store = transaction.objectStore('prompts');
          const request = store.getAll();

          request.onsuccess = () => {
            // 按创建时间倒序排列（最新的在前）
            const records = request.result.sort((a, b) => b.createdAt - a.createdAt);
            resolve(records);
          };
          request.onerror = () => reject(request.error);
        });
      }

      // 删除本地提示词
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

      // 增加本地提示词使用次数
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

      async function savePromptToLibrary(title, content) {
        if (!isPromptBackendEnabled()) {
          return savePromptToLocalLibrary(title, content);
        }

        const data = await requestPromptApi('POST', { title, content }, { admin: true });
        return data.id;
      }

      async function loadStaticPrompts() {
        if (!appConfig.promptStaticUrl) return [];

        try {
          const response = await fetch(new URL(appConfig.promptStaticUrl, window.location.href).toString());
          if (!response.ok) return [];

          const data = await response.json();
          const items = Array.isArray(data) ? data : (Array.isArray(data.prompts) ? data.prompts : []);

          return items
            .map((item, index) => {
              const content = typeof item === 'string'
                ? item.trim()
                : String(item.content || item.prompt || item.text || '').trim();

              if (!content) return null;

              const title = typeof item === 'string'
                ? getPromptTitle(content)
                : String(item.title || item.name || getPromptTitle(content)).trim();

              return {
                id: `static-${index + 1}`,
                title,
                content,
                createdAt: item.createdAt || item.created_at || 0,
                usageCount: item.usageCount || item.usage_count || 0,
                source: 'static'
              };
            })
            .filter(Boolean);
        } catch (err) {
          console.warn('静态提示词库加载失败:', err);
          return [];
        }
      }

      async function loadAllPrompts() {
        if (!isPromptBackendEnabled()) {
          const [staticPrompts, localPrompts] = await Promise.all([
            loadStaticPrompts(),
            loadAllLocalPrompts()
          ]);

          return [
            ...localPrompts.map(item => ({ ...item, source: 'local' })),
            ...staticPrompts
          ];
        }

        try {
          const data = await requestPromptApi('GET');
          return (data.prompts || []).map(item => ({
            id: item.id,
            title: item.title,
            content: item.content,
            createdAt: item.createdAt || item.created_at || Date.now(),
            usageCount: item.usageCount || item.usage_count || 0,
            source: 'static'
          }));
        } catch (err) {
          console.warn('公共提示词库加载失败，改用本地提示词库:', err);
          const localPrompts = await loadAllLocalPrompts();
          return localPrompts.map(item => ({ ...item, source: 'local' }));
        }
      }

      async function deletePrompt(id) {
        if (String(id).startsWith('static-')) {
          throw new Error('静态公共提示词需要在 data/prompts.json 中删除');
        }

        if (!isPromptBackendEnabled()) {
          return deleteLocalPrompt(id);
        }

        return requestPromptApi('DELETE', null, { admin: true, params: { id } });
      }

      async function incrementPromptUsage(id) {
        if (String(id).startsWith('static-')) return;

        if (!isPromptBackendEnabled()) {
          return incrementLocalPromptUsage(id);
        }

        try {
          await requestPromptApi('POST', { action: 'increment', id });
        } catch (err) {
          console.warn('提示词使用次数更新失败:', err);
        }
      }

      // 生成缩略图
      function createThumbnail(base64Src, maxSize = 200) {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let { width, height } = img;

            // 计算缩放比例
            if (width > height) {
              if (width > maxSize) {
                height = Math.round(height * maxSize / width);
                width = maxSize;
              }
            } else {
              if (height > maxSize) {
                width = Math.round(width * maxSize / height);
                height = maxSize;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            resolve(canvas.toDataURL('image/jpeg', 0.7));
          };
          img.src = base64Src;
        });
      }

      function getImageExtensionFromSrc(src, fallback = 'png') {
        const mime = src?.match(/^data:([^;]+);/)?.[1];
        return mime ? getExtensionFromMime(mime) : fallback;
      }

      function getHistoryThumbnailFilename(record) {
        const ext = getImageExtensionFromSrc(record.thumbnail, 'jpg');
        return `history-${record.timestamp || Date.now()}.${ext}`;
      }

      function getHistoryImageRetention() {
        const activeOption = historyImageRetentionSelect?.querySelector('.history-retention-option.active');
        return activeOption?.dataset.value || 'original';
      }

      function setHistoryImageRetention(value, options = {}) {
        const nextValue = value === 'thumbnail' ? 'thumbnail' : 'original';
        historyImageRetentionSelect?.querySelectorAll('.history-retention-option').forEach(option => {
          const isActive = option.dataset.value === nextValue;
          option.classList.toggle('active', isActive);
          option.setAttribute('aria-pressed', String(isActive));
        });

        if (options.persist) {
          localStorage.setItem(HISTORY_IMAGE_RETENTION_KEY, nextValue);
        }

        if (options.notify) {
          flashStatus(`历史图片将保留为${nextValue === 'original' ? '原图' : '缩略图'}`, 'success');
        }
      }

      function shouldSaveHistoryOriginal() {
        return getHistoryImageRetention() === 'original';
      }

      function getHistoryOriginalFilename(record) {
        if (record.filename) return record.filename;

        const ext = getImageExtensionFromSrc(record.imageSrc, 'png');
        return `history-original-${record.timestamp || Date.now()}.${ext}`;
      }

      async function getHistoryDownloadImage(record) {
        if (record.filename && folderHandle) {
          try {
            const src = await loadImageFromFolder(record.filename);
            return {
              src,
              filename: record.filename,
              quality: 'original'
            };
          } catch (err) {
            console.warn('从文件夹加载历史原图失败，改用缩略图下载:', err);
          }
        }

        if (record.imageSrc) {
          return {
            src: record.imageSrc,
            filename: getHistoryOriginalFilename(record),
            quality: 'original'
          };
        }

        if (record.thumbnail) {
          return {
            src: record.thumbnail,
            filename: record.filename ? `thumb-${record.filename}` : getHistoryThumbnailFilename(record),
            quality: 'thumbnail'
          };
        }

        throw new Error('这条历史记录没有可下载的图片');
      }

      async function downloadImageSource(src, filename) {
        if (!src) throw new Error('没有可下载的图片');

        if (isMobileDevice()) {
          return saveToMobileAlbum(src, filename);
        }

        let href = src;
        let objectUrl = '';

        try {
          const response = await fetch(src);
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          href = objectUrl;
        } catch (err) {
          if (!/^https?:\/\//i.test(src)) throw err;
          console.warn('图片 fetch 下载失败，改用链接下载:', err);
        }

        const link = document.createElement('a');
        link.href = href;
        link.download = filename;
        if (/^https?:\/\//i.test(href)) link.target = '_blank';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          link.remove();
        }, 1000);

        return true;
      }

      // 渲染历史记录
      async function renderHistory() {
        try {
          const records = await loadHistory();
          historyCountEl.textContent = `${records.length} 条`;
          clearHistoryBtn.hidden = records.length === 0;

          if (records.length === 0) {
            historyCurrentPage = 1;
            historyLastPageSize = 0;
            historyGrid.innerHTML = '<div class="history-empty">暂无历史记录</div>';
            updateHistoryPagination(0, 1);
            return;
          }

          const pageSize = getHistoryPageSize();
          historyLastPageSize = pageSize;
          const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
          historyCurrentPage = Math.min(Math.max(historyCurrentPage, 1), totalPages);
          const startIndex = (historyCurrentPage - 1) * pageSize;
          const pageRecords = records.slice(startIndex, startIndex + pageSize);

          historyGrid.innerHTML = '';
          const fragment = document.createDocumentFragment();
          const chunkSize = 24;

          for (const [index, record] of pageRecords.entries()) {
            const card = document.createElement('div');
            card.className = 'history-card';

            // 判断是否有文件名（新版本记录才有）
            const hasFilename = record.filename && record.filename.length > 0;

            card.innerHTML = `
              <img src="${record.thumbnail}" alt="缩略图">
              <div class="info">
                <div class="prompt-container">
                  <div class="prompt" title="点击复制提示词">${escapeHtml(record.prompt || '无提示词')}</div>
                </div>
                <div class="meta">
                  <span>${formatDate(record.timestamp)}</span>
                  <div class="history-actions">
                    ${hasFilename ? '<button class="action-btn add-btn" title="添加到参考图"><span class="action-icon">➕</span><span class="action-text">参考</span></button>' : ''}
                    ${hasFilename ? '<button class="action-btn hd-btn" title="从文件夹加载高清图"><span class="action-icon">🔍</span><span class="action-text">高清</span></button>' : ''}
                    <button class="action-btn download-btn" title="下载历史图片"><span class="action-icon">⬇️</span><span class="action-text">下载</span></button>
                    <button class="action-btn save-prompt-btn" title="保存提示词到库"><span class="action-icon">💾</span><span class="action-text">存词</span></button>
                    <button class="action-btn params-btn" title="查看本次生图参数"><span class="action-icon">⚙️</span><span class="action-text">参数</span></button>
                    <button class="action-btn delete-btn" data-id="${record.id}" title="删除历史记录"><span class="action-icon">🗑️</span><span class="action-text">删除</span></button>
                  </div>
                </div>
              </div>
            `;

            // 点击缩略图放大查看
            card.querySelector('img').addEventListener('click', () => {
              if (record.thumbnail) {
                openLightbox(record.thumbnail);
              }
            });

            // 点击提示词复制
            const promptEl = card.querySelector('.prompt');
            promptEl.style.cursor = 'pointer';
            promptEl.addEventListener('click', async () => {
              const promptText = record.prompt || '无提示词';
              try {
                await copyTextToClipboard(promptText);
                const originalText = promptEl.textContent;
                promptEl.textContent = '✓ 已复制';
                promptEl.style.color = 'var(--success)';
                setTimeout(() => {
                  promptEl.textContent = originalText;
                  promptEl.style.color = '';
                }, 1500);
              } catch (err) {
                console.error('复制失败:', err);
                alert('复制失败，请手动选择文本复制');
              }
            });

            // 添加到参考图按钮
            const addBtn = card.querySelector('.add-btn');
            if (addBtn && hasFilename) {
              addBtn.addEventListener('click', async (e) => {
                e.stopPropagation();

                if (!folderHandle) {
                  alert('请先点击「选择文件夹」选择图片保存的文件夹');
                  return;
                }

                // 检查参考图数量限制
                const limit = getReferenceImageLimit();
                if (state.images.length >= limit) {
                  alert(`参考图最多只能添加 ${limit} 张`);
                  return;
                }

                try {
                  setHistoryActionButtonContent(addBtn, '⏳', '处理中');
                  addBtn.disabled = true;

                  const hdImage = await loadImageFromFolder(record.filename);

                  // 添加到参考图
                  state.images.push({
                    name: record.filename,
                    mime: 'image/png',
                    dataUrl: hdImage
                  });

                  renderUploads();
                  flashStatus(`已添加到参考图（共 ${state.images.length} 张）`, 'success');

                  setHistoryActionButtonContent(addBtn, '✓', '已添加');
                  setTimeout(() => {
                    setHistoryActionButtonContent(addBtn, '➕', '参考');
                    addBtn.disabled = false;
                  }, 1500);
                } catch (err) {
                  setHistoryActionButtonContent(addBtn, '➕', '参考');
                  addBtn.disabled = false;
                  alert(err.message || '加载图片失败');
                }
              });
            }

            // 查看高清按钮
            const hdBtn = card.querySelector('.hd-btn');
            if (hdBtn && hasFilename) {
              hdBtn.addEventListener('click', async (e) => {
                e.stopPropagation();

                if (!folderHandle) {
                  alert('请先点击「选择文件夹」选择图片保存的文件夹，然后才能加载高清图。');
                  return;
                }

                try {
                  setHistoryActionButtonContent(hdBtn, '⏳', '加载中');
                  hdBtn.disabled = true;

                  const hdImage = await loadImageFromFolder(record.filename);
                  openLightbox(hdImage);

                  setHistoryActionButtonContent(hdBtn, '🔍', '高清');
                  hdBtn.disabled = false;
                } catch (err) {
                  setHistoryActionButtonContent(hdBtn, '🔍', '高清');
                  hdBtn.disabled = false;
                  alert(err.message || '加载高清图失败');
                }
              });
            }

            // 下载历史图片按钮
            const downloadBtn = card.querySelector('.download-btn');
            if (downloadBtn) {
              downloadBtn.addEventListener('click', async (e) => {
                e.stopPropagation();

                const originalHtml = downloadBtn.innerHTML;
                setHistoryActionButtonContent(downloadBtn, '⏳', '下载中');
                downloadBtn.disabled = true;

                try {
                  const downloadItem = await getHistoryDownloadImage(record);
                  await downloadImageSource(downloadItem.src, downloadItem.filename);

                  if (downloadItem.quality === 'original') {
                    flashStatus('已开始下载历史原图', 'success');
                  } else if (record.filename) {
                    flashStatus('未选择或未找到原保存文件夹，已下载历史缩略图', 'danger');
                  } else {
                    flashStatus('已开始下载历史缩略图', 'success');
                  }
                } catch (err) {
                  console.error('下载历史图片失败:', err);
                  alert(err.message || '下载历史图片失败');
                } finally {
                  downloadBtn.innerHTML = originalHtml;
                  downloadBtn.disabled = false;
                }
              });
            }

            // 保存提示词到库按钮
            const savePromptBtn = card.querySelector('.save-prompt-btn');
            if (savePromptBtn && record.prompt) {
              savePromptBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                showSavePromptDialog(record.prompt);
              });
            }

            const paramsBtn = card.querySelector('.params-btn');
            if (paramsBtn) {
              paramsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showHistoryParamsDialog(record);
              });
            }

            // 长提示词 tooltip
            const promptContainer = card.querySelector('.prompt-container');
            if (promptContainer) {
              const promptEl = promptContainer.querySelector('.prompt');
              const fullPrompt = record.prompt || '无提示词';

              // 鼠标移入时显示 tooltip
              promptContainer.addEventListener('mouseenter', () => {
                if (fullPrompt.length > 0) {
                  const tooltip = document.createElement('div');
                  tooltip.className = 'prompt-tooltip';
                  tooltip.textContent = fullPrompt;

                  // 计算位置（在提示词下方）
                  const rect = promptContainer.getBoundingClientRect();
                  tooltip.style.position = 'fixed';
                  tooltip.style.top = (rect.bottom + 8) + 'px';
                  tooltip.style.left = rect.left + 'px';

                  document.body.appendChild(tooltip);
                  promptContainer._tooltip = tooltip;

                  // 避免超出屏幕右边界
                  setTimeout(() => {
                    const tooltipRect = tooltip.getBoundingClientRect();
                    if (tooltipRect.right > window.innerWidth - 10) {
                      tooltip.style.left = 'auto';
                      tooltip.style.right = '10px';
                    }
                  }, 10);
                }
              });

              // 鼠标移出时隐藏 tooltip
              promptContainer.addEventListener('mouseleave', () => {
                if (promptContainer._tooltip) {
                  promptContainer._tooltip.remove();
                  promptContainer._tooltip = null;
                }
              });
            }

            // 删除按钮
            card.querySelector('.delete-btn').addEventListener('click', async (e) => {
              e.stopPropagation();
              if (confirm('确定删除这条历史记录？')) {
                await deleteHistoryById(record.id);
                await renderHistory();
              }
            });

            fragment.appendChild(card);

            if ((index + 1) % chunkSize === 0) {
              historyGrid.appendChild(fragment);
              await yieldToBrowser();
            }
          }

          if (fragment.childNodes.length) {
            historyGrid.appendChild(fragment);
          }

          updateHistoryPagination(records.length, pageSize);
        } catch (err) {
          console.error('加载历史记录失败:', err);
          historyGrid.innerHTML = '<div class="history-empty">加载历史记录失败</div>';
          updateHistoryPagination(0, 1);
        }
      }

      // 辅助函数：HTML 转义
      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      // 辅助函数：格式化日期
      function formatDate(timestamp) {
        const date = new Date(timestamp);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        return `${month}-${day} ${hour}:${minute}`;
      }

      function formatDurationMs(durationMs) {
        const ms = Number(durationMs);
        if (!Number.isFinite(ms) || ms <= 0) return '--';
        return `${(ms / 1000).toFixed(2)}s`;
      }

      async function copyTextToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();

        if (!copied) {
          throw new Error('浏览器未允许复制，请手动选择文本复制');
        }
      }

      function getPromptTitle(content, fallback = '未命名提示词') {
        const normalized = content.replace(/\s+/g, ' ').trim();
        return normalized ? normalized.substring(0, 24) + (normalized.length > 24 ? '...' : '') : fallback;
      }

      function setHistoryActionButtonContent(button, icon, text) {
        if (!button) return;
        button.innerHTML = `<span class="action-icon">${icon}</span><span class="action-text">${text}</span>`;
      }

      function getCurrentGenerationParams(overrides = {}) {
        return {
          aspect: aspectSelect?.value || '',
          resolution: resolutionSelect?.value || '',
          quality: imageQualitySelect?.value || '',
          model: getImageModel(),
          protocol: getProtocol(),
          ...overrides
        };
      }

      function formatGenerationParamValue(key, value) {
        if (value === undefined || value === null || value === '') return '';
        const normalized = String(value);
        const maps = {
          aspect: { auto: 'auto[自动]' },
          quality: { auto: 'auto[自动]', low: 'low[低]', medium: 'medium[中]', high: 'high[高]', standard: 'standard[标准]', hd: 'hd[高清]' },
          protocol: { gemini: 'Gemini 原生', 'openai-chat': 'OpenAI Chat', 'openai-images': 'OpenAI Images' }
        };
        return maps[key]?.[normalized] || normalized;
      }

      function getHistoryParamRows(record) {
        return [
          ['图片比例', 'aspect', record.aspect],
          ['清晰度', 'resolution', record.resolution],
          ['质量', 'quality', record.quality],
          ['生图模型', 'model', record.model],
          ['API 协议', 'protocol', record.protocol],
          ['生成耗时', 'runtimeMs', record.runtimeMs ? formatDurationMs(record.runtimeMs) : '']
        ]
          .map(([label, key, value]) => [label, formatGenerationParamValue(key, value)])
          .filter(([, value]) => value);
      }

      function showHistoryParamsDialog(record) {
        const rows = getHistoryParamRows(record);
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay active';
        dialogOverlay.innerHTML = `
          <div class="dialog-content history-params-dialog">
            <div class="dialog-title">⚙️ 生图参数</div>
            ${rows.length ? `
              <div class="history-param-grid">
                ${rows.map(([label, value]) => `
                  <div class="history-param-label">${escapeHtml(label)}</div>
                  <div class="history-param-value">${escapeHtml(value)}</div>
                `).join('')}
              </div>
            ` : '<div class="dialog-desc">这条历史记录没有保存参数信息，新的生成记录会自动保存。</div>'}
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn-cancel" type="button">关闭</button>
            </div>
          </div>
        `;

        document.body.appendChild(dialogOverlay);
        const closeDialog = () => dialogOverlay.remove();
        dialogOverlay.querySelector('.dialog-btn-cancel')?.addEventListener('click', closeDialog);
        dialogOverlay.addEventListener('click', (e) => {
          if (e.target === dialogOverlay) closeDialog();
        });
        dialogOverlay.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') closeDialog();
        });
        dialogOverlay.tabIndex = -1;
        dialogOverlay.focus();
      }

      // ========== 提示词库 UI 交互 ==========

      // 显示保存提示词对话框
      function showSavePromptDialog(promptContent) {
        // 创建对话框 HTML
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay active';

        // 自动生成标题（取前 24 个字符）
        const autoTitle = getPromptTitle(promptContent);

        dialogOverlay.innerHTML = `
          <div class="dialog-content">
            <div class="dialog-title">💾 保存提示词到库</div>
            <input class="dialog-input" type="text" placeholder="输入提示词标题" value="${escapeHtml(autoTitle)}" />
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn-cancel">取消</button>
              <button class="dialog-btn dialog-btn-confirm">保存</button>
            </div>
          </div>
        `;

        document.body.appendChild(dialogOverlay);

        const input = dialogOverlay.querySelector('.dialog-input');
        const cancelBtn = dialogOverlay.querySelector('.dialog-btn-cancel');
        const confirmBtn = dialogOverlay.querySelector('.dialog-btn-confirm');

        // 输入框自动获焦
        setTimeout(() => input.focus(), 100);
        input.select();

        // 取消按钮
        cancelBtn.addEventListener('click', () => {
          dialogOverlay.remove();
        });

        // 保存按钮
        confirmBtn.addEventListener('click', async () => {
          const title = input.value.trim();
          if (!title) {
            alert('请输入提示词标题');
            return;
          }

          try {
            confirmBtn.disabled = true;
            confirmBtn.textContent = '保存中...';

            // 保存到 IndexedDB
            await savePromptToLibrary(title, promptContent);

            // 刷新提示词库列表
            await renderPromptLibrary();

            // 显示成功反馈
            dialogOverlay.remove();
            flashStatus('✓ 已保存到提示词库', 'success');

          } catch (err) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '保存';
            console.error('保存失示词失败:', err);
            alert('保存失败: ' + err.message);
          }
        });

        // Enter 键保存
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            confirmBtn.click();
          }
        });

        // Escape 键取消
        dialogOverlay.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            cancelBtn.click();
          }
        });
      }

      function parsePromptImportText(text, fileName = '') {
        const trimmed = text.trim();
        if (!trimmed) return [];

        if (/\.json$/i.test(fileName)) {
          const data = JSON.parse(trimmed);
          const items = Array.isArray(data) ? data : (Array.isArray(data.prompts) ? data.prompts : []);

          return items
            .map(item => {
              if (typeof item === 'string') {
                const content = item.trim();
                return content ? { title: getPromptTitle(content), content } : null;
              }

              const content = String(item.content || item.prompt || item.text || '').trim();
              if (!content) return null;

              return {
                title: String(item.title || item.name || getPromptTitle(content)).trim(),
                content
              };
            })
            .filter(Boolean);
        }

        const blocks = trimmed
          .split(/\n\s*\n/g)
          .map(block => block.trim())
          .filter(Boolean);

        const rows = blocks.length > 1 ? blocks : trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

        return rows.map(row => {
          const csvMatch = /\.csv$/i.test(fileName) ? row.match(/^([^,，]{1,40})[,，](.+)$/) : null;
          if (csvMatch) {
            return {
              title: csvMatch[1].trim(),
              content: csvMatch[2].trim()
            };
          }

          return {
            title: getPromptTitle(row),
            content: row
          };
        });
      }

      async function importPromptFiles(files) {
        let importedCount = 0;

        for (const file of files) {
          const text = await file.text();
          const prompts = parsePromptImportText(text, file.name);

          for (const prompt of prompts) {
            if (prompt.content) {
              await savePromptToLibrary(prompt.title || getPromptTitle(prompt.content), prompt.content);
              importedCount += 1;
            }
          }
        }

        await renderPromptLibrary();
        flashStatus(importedCount ? `已导入 ${importedCount} 条提示词` : '未找到可导入的提示词', importedCount ? 'success' : 'danger');
      }

      function filterPromptLibraryItems(prompts, keyword) {
        const normalizedKeyword = String(keyword || '').trim().toLowerCase();
        if (!normalizedKeyword) return prompts;

        return prompts.filter(prompt => {
          const title = String(prompt.title || '').toLowerCase();
          const content = String(prompt.content || '').toLowerCase();
          return title.includes(normalizedKeyword) || content.includes(normalizedKeyword);
        });
      }

      async function exportLocalPromptLibrary() {
        const prompts = await loadAllLocalPrompts();
        if (!prompts.length) {
          flashStatus('当前没有可导出的本地提示词', 'danger');
          return false;
        }

        const exportPayload = {
          source: 'local',
          exportedAt: new Date().toISOString(),
          count: prompts.length,
          prompts: prompts.map(prompt => ({
            id: prompt.id,
            title: prompt.title || '',
            content: prompt.content || '',
            createdAt: prompt.createdAt || 0,
            usageCount: prompt.usageCount || 0
          }))
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `local-prompts-${timestamp}.json`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          link.remove();
        }, 1000);

        flashStatus(`已导出 ${prompts.length} 条本地提示词`, 'success');
        return true;
      }

      // 渲染提示词库列表
      async function renderPromptLibrary() {
        try {
          const prompts = await loadAllPrompts();
          const libraryList = document.querySelector('.prompt-library-list');
          const libraryEmpty = document.querySelector('.prompt-library-empty');
          const searchInput = document.getElementById('prompt-library-search');
          const keyword = searchInput?.value || '';
          const filteredPrompts = filterPromptLibraryItems(prompts, keyword);

          if (prompts.length === 0) {
            libraryList.innerHTML = '';
            libraryEmpty.textContent = '暂无保存的提示词';
            libraryEmpty.style.display = 'block';
            return;
          }

          if (filteredPrompts.length === 0) {
            libraryList.innerHTML = '';
            libraryEmpty.textContent = '没有匹配的提示词';
            libraryEmpty.style.display = 'block';
            return;
          }

          libraryEmpty.style.display = 'none';
          libraryList.innerHTML = '';

          filteredPrompts.forEach(prompt => {
            const item = document.createElement('div');
            item.className = 'prompt-lib-item';
            const isLocalPrompt = prompt.source === 'local';
            const sourceLabel = isLocalPrompt ? '本地' : '云端';
            const sourceClass = isLocalPrompt ? 'local' : 'cloud';

            item.innerHTML = `
              <div class="prompt-lib-item-title">
                <span class="prompt-lib-title-text">${escapeHtml(prompt.title)}</span>
                <span class="prompt-source-badge ${sourceClass}">${sourceLabel}</span>
              </div>
              <div class="prompt-lib-item-content" title="点击复制完整内容">${escapeHtml(prompt.content)}</div>
              <div class="prompt-lib-actions">
                <button class="prompt-lib-btn" data-action="copy" data-id="${prompt.id}" title="复制到剪贴板">📋 复制</button>
                ${isLocalPrompt ? `<button class="prompt-lib-btn prompt-lib-btn-delete" data-action="delete" data-id="${prompt.id}" title="删除此提示词">🗑️ 删除</button>` : ''}
              </div>
            `;

            const contentEl = item.querySelector('.prompt-lib-item-content');

            async function copyPromptContent(feedbackEl) {
              try {
                await copyTextToClipboard(prompt.content);
                await incrementPromptUsage(prompt.id);

                const originalText = feedbackEl.textContent;
                feedbackEl.textContent = '✓ 已复制';
                feedbackEl.style.color = 'var(--success)';
                setTimeout(() => {
                  feedbackEl.textContent = originalText;
                  feedbackEl.style.color = '';
                }, 1500);
              } catch (err) {
                alert('复制失败：' + err.message);
              }
            }

            contentEl.addEventListener('click', () => copyPromptContent(contentEl));

            // 复制按钮
            const copyBtn = item.querySelector('[data-action="copy"]');
            copyBtn.addEventListener('click', () => copyPromptContent(copyBtn));

            // 删除按钮
            const deleteBtn = item.querySelector('[data-action="delete"]');
            if (deleteBtn) {
              deleteBtn.addEventListener('click', async () => {
                if (confirm('确定删除此提示词吗？')) {
                  try {
                    await deletePrompt(prompt.id);
                    await renderPromptLibrary();
                    flashStatus('已删除提示词', 'success');
                  } catch (err) {
                    alert('删除失败：' + err.message);
                  }
                }
              });
            }

            libraryList.appendChild(item);
          });
        } catch (err) {
          console.error('加载提示词库失败:', err);
        }
      }

      // ========== 文件夹选择模块 ==========


      function isMobileDevice() {
        return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
      }

      function getFileExtension(filename, fallback = 'png') {
        const match = filename.match(/\.([a-z0-9]+)$/i);
        return match ? match[1].toLowerCase() : fallback;
      }


      async function saveToMobileAlbum(base64Src, filename) {
        const response = await fetch(base64Src);
        const blob = await response.blob();
        const mimeType = blob.type || `image/${getFileExtension(filename)}`;

        try {
          const file = new File([blob], filename, { type: mimeType });
          if (navigator.canShare?.({ files: [file] }) && navigator.share) {
            await navigator.share({ files: [file], title: filename, text: '保存图片' });
            return true;
          }
        } catch (err) {
          console.warn('当前浏览器不支持文件分享，改用下载方式:', err);
        }

        const link = document.createElement('a');
        const objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          link.remove();
        }, 1000);
        return true;
      }


      // 选择保存文件夹
      async function selectSaveFolder() {
        try {
          if (isMobileDevice()) {
            savePathEl.textContent = '手机相册/下载';
            resetFolderBtn.style.display = 'inline-block';
            flashStatus('手机端无需选择文件夹，生成后请点“保存到相册”或“下载图片”', 'success');
            return;
          }

          if (!('showDirectoryPicker' in window)) {
            savePathEl.textContent = '历史记录';
            resetFolderBtn.style.display = 'inline-block';
            flashStatus('当前浏览器不支持选择文件夹，将保存到历史记录', 'success');
            return;
          }

          folderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
          savePathEl.textContent = folderHandle.name;
          resetFolderBtn.style.display = 'inline-block';
          // 保存句柄到 IndexedDB 以便刷新后恢复
          await saveFolderHandle(folderHandle);
          flashStatus(`已选择保存文件夹：${folderHandle.name}`, 'success');
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error('选择文件夹失败:', err);
          }
        }
      }

      // 重置保存位置
      async function resetSaveFolder() {
        folderHandle = null;
        savePathEl.textContent = '未选择';
        resetFolderBtn.style.display = 'none';
        // 清除保存的句柄
        await clearSavedFolderHandle();
        flashStatus('已重置保存位置，之后会保存到历史记录', 'success');
      }


      // 已选择文件夹时自动保存原图；未选择时仅写入历史记录
      async function saveImageFile(base64Src, filename) {
        if (isMobileDevice()) {
          return { status: 'not_configured' };
        }

        // 转换 base64 为 Blob
        const response = await fetch(base64Src);
        const blob = await response.blob();

        debugLog(`保存文件: ${filename}, 大小: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);

        if (!folderHandle) {
          // 未选择文件夹时不自动下载，用户可手动点击下载按钮
          debugLog('未选择保存文件夹，跳过自动保存:', filename);
          return { status: 'not_configured' };
        }

        const folderState = await ensureWritableFolderHandle({ autoReselect: true });
        if (!folderState.ok) {
          return { status: folderState.reason || 'save_failed' };
        }

        try {
          const targetHandle = folderState.handle || folderHandle;
          const fileHandle = await targetHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          debugLog(`图片已保存到文件夹: ${filename}`);
          return { status: folderState.reselected ? 'reselected_and_saved' : 'saved_to_folder' };
        } catch (err) {
          console.error('保存到文件夹失败:', err);
          return { status: 'save_failed', error: err };
        }
      }

      function getSaveImageResultMessage(saveResult) {
        switch (saveResult?.status) {
          case 'saved_to_folder':
            return { type: 'success', text: '历史记录已保存，原图已写入所选文件夹' };
          case 'reselected_and_saved':
            return { type: 'success', text: '已重新授权保存文件夹，历史记录和原图都已保存' };
          case 'permission_denied':
            return { type: 'danger', text: '历史记录已保存，但未获得文件夹写入权限，原图没有保存到所选文件夹' };
          case 'folder_unavailable':
            return { type: 'danger', text: '历史记录已保存，但当前文件夹不可用，原图没有保存到所选文件夹' };
          case 'save_failed':
            return { type: 'danger', text: '历史记录已保存，但写入文件夹失败，原图没有保存到所选文件夹' };
          case 'not_configured':
          default:
            return { type: 'success', text: '历史记录已保存，未配置自动保存文件夹' };
        }
      }

      async function handleSaveToAlbum(base64Src, filename) {
        try {
          const saved = await saveToMobileAlbum(base64Src, filename);
          if (saved) flashStatus('已打开保存菜单，请选择保存到相册或文件', 'success');
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error('保存到手机失败:', err);
            flashStatus('保存失败，请长按图片或点击下载图片', 'danger');
          }
        }
      }

      // 获取图片信息（尺寸和文件大小）
      function getImageInfo(base64Src) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const size = Math.round(base64Src.length * 0.75); // base64 转字节数
            resolve({
              width: img.width,
              height: img.height,
              size: size
            });
          };
          img.onerror = () => reject(new Error('获取图片信息失败'));
          img.src = base64Src;
        });
      }

      // 从文件夹读取高清图
      async function loadImageFromFolder(filename) {
        if (!folderHandle) {
          throw new Error('请先选择保存文件夹');
        }

        try {
          const fileHandle = await folderHandle.getFileHandle(filename);
          const file = await fileHandle.getFile();

          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('读取文件失败'));
            reader.readAsDataURL(file);
          });
        } catch (err) {
          if (err.name === 'NotFoundError') {
            throw new Error(`文件不存在：${filename}`);
          }
          throw err;
        }
      }

      // 绑定文件夹选择事件
      selectFolderBtn.addEventListener('click', selectSaveFolder);
      resetFolderBtn.addEventListener('click', resetSaveFolder);

      historyPrevBtn?.addEventListener('click', async () => {
        if (historyCurrentPage <= 1) return;
        historyCurrentPage--;
        await renderHistory();
      });

      historyNextBtn?.addEventListener('click', async () => {
        historyCurrentPage++;
        await renderHistory();
      });

      window.addEventListener('resize', () => {
        clearTimeout(historyResizeTimer);
        historyResizeTimer = window.setTimeout(() => {
          const nextPageSize = getHistoryPageSize();
          if (nextPageSize === historyLastPageSize || !historyLastPageSize) return;

          const firstVisibleIndex = (historyCurrentPage - 1) * historyLastPageSize;
          historyCurrentPage = Math.floor(firstVisibleIndex / nextPageSize) + 1;
          renderHistory().catch(err => {
            console.error('History pagination resize failed:', err);
          });
        }, 120);
      });

      // 清空历史按钮
      clearHistoryBtn.addEventListener('click', async () => {
        if (confirm('确定清空所有历史记录？此操作不可恢复。')) {
          await clearAllHistory();
          await renderHistory();
          flashStatus('已清空历史记录', 'success');
        }
      });

      // 拉取模型列表
      const fetchModelsBtn = document.getElementById('fetch-models-btn');
      const addModelsBtn = document.getElementById('add-models-btn');
      const deleteImageModelBtn = document.getElementById('delete-image-model-btn');
      const deleteTextModelBtn = document.getElementById('delete-text-model-btn');

      function getStoredModels() {
        try {
          const models = JSON.parse(localStorage.getItem('model_list') || '[]');
          return Array.isArray(models) ? models : [];
        } catch (e) {
          return [];
        }
      }

      function saveStoredModel(modelId, modelName) {
        const models = getStoredModels();
        const exists = models.some(m => m.id === modelId);
        if (!exists) {
          models.push({ id: modelId, name: modelName || modelId });
          localStorage.setItem('model_list', JSON.stringify(models));
        }
      }

      function deleteStoredModel(modelId) {
        const models = getStoredModels().filter(m => m.id !== modelId);
        localStorage.setItem('model_list', JSON.stringify(models));
      }

      function ensureModelOption(selectEl, modelId, modelName) {
        const exists = [...selectEl.options].some(o => o.value === modelId);
        if (!exists) {
          selectEl.add(new Option(modelName || modelId, modelId));
        }
        selectEl.value = modelId;
      }

      function appendModelOption(selectEl, modelId, modelName) {
        const currentValue = selectEl.value;
        const exists = [...selectEl.options].some(o => o.value === modelId);
        if (!exists) {
          selectEl.add(new Option(modelName || modelId, modelId));
        }
        if (currentValue && [...selectEl.options].some(o => o.value === currentValue)) {
          selectEl.value = currentValue;
        }
      }

      function showAddModelsDialog() {
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay active';
        dialogOverlay.innerHTML = `
          <div class="dialog-content">
            <div class="dialog-title">➕ 手动添加模型</div>
            <div class="dialog-desc">可一次添加生图模型和文本优化模型。两个输入框至少填写一个，添加后会自动选中并保存到浏览器本地历史。</div>
            <input class="dialog-input" id="manual-image-model" type="text" placeholder="生图模型，例如：gpt-image-2" autocomplete="off" />
            <input class="dialog-input" id="manual-text-model" type="text" placeholder="文本优化模型，例如：gpt-5.4-mini" autocomplete="off" />
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn-cancel" type="button">取消</button>
              <button class="dialog-btn dialog-btn-confirm" type="button">添加</button>
            </div>
          </div>
        `;

        document.body.appendChild(dialogOverlay);

        const imageInput = dialogOverlay.querySelector('#manual-image-model');
        const textInput = dialogOverlay.querySelector('#manual-text-model');
        const cancelBtn = dialogOverlay.querySelector('.dialog-btn-cancel');
        const confirmBtn = dialogOverlay.querySelector('.dialog-btn-confirm');

        const closeDialog = () => dialogOverlay.remove();
        const confirmAdd = () => {
          const imageModelId = imageInput.value.trim();
          const textModelId = textInput.value.trim();
          if (!imageModelId && !textModelId) {
            flashStatus('请至少填写一个模型 ID', 'danger');
            imageInput.focus();
            return;
          }

          if (imageModelId) addManualModel('image', imageModelId);
          if (textModelId) addManualModel('text', textModelId);
          flashStatus('已添加并选中手动模型', 'success');
          closeDialog();
        };

        cancelBtn.addEventListener('click', closeDialog);
        confirmBtn.addEventListener('click', confirmAdd);
        [imageInput, textInput].forEach(input => {
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirmAdd();
            if (e.key === 'Escape') closeDialog();
          });
        });
        dialogOverlay.addEventListener('click', (e) => {
          if (e.target === dialogOverlay) closeDialog();
        });

        setTimeout(() => imageInput.focus(), 80);
      }

      function addManualModel(type, modelId) {
        const label = type === 'image' ? '生图模型' : '文本优化模型';
        const targetSelect = type === 'image' ? imageModelSelect : textModelSelect;
        ensureModelOption(targetSelect, modelId, modelId);
        saveStoredModel(modelId, modelId);
        localStorage.setItem(type === 'image' ? 'image_model' : 'text_model', modelId);
        flashStatus(`已添加并选中${label}: ${modelId}`, 'success');
      }

      function removeModelOption(selectEl, modelId) {
        const option = [...selectEl.options].find(o => o.value === modelId);
        if (!option) return;
        option.remove();
        if (selectEl.options.length > 0) {
          selectEl.selectedIndex = 0;
        }
      }

      function deleteCurrentModel(type) {
        const label = type === 'image' ? '生图模型' : '文本优化模型';
        const targetSelect = type === 'image' ? imageModelSelect : textModelSelect;
        const storageKey = type === 'image' ? 'image_model' : 'text_model';
        const modelId = targetSelect.value;
        if (!modelId) {
          flashStatus(`没有可删除的${label}`, 'danger');
          return;
        }
        if (!confirm(`确定删除当前${label}？\n${modelId}`)) return;

        removeModelOption(imageModelSelect, modelId);
        removeModelOption(textModelSelect, modelId);
        deleteStoredModel(modelId);
        localStorage.setItem('image_model', imageModelSelect.value || '');
        localStorage.setItem('text_model', textModelSelect.value || '');
        localStorage.setItem(storageKey, targetSelect.value || '');
        flashStatus(`已删除模型: ${modelId}`, 'success');
      }

      async function fetchModelList() {
        const key = getApiKey();
        if (!key) { flashStatus('请先填写 API Key', 'danger'); return; }
        const protocol = getProtocol();

        fetchModelsBtn.disabled = true;
        fetchModelsBtn.textContent = '拉取中...';

        try {
          const endpoints = protocol === 'gemini'
            ? [buildApiUrl('/v1beta/models'), buildApiUrl('/v1/models')]
            : [buildApiUrl('/v1/models')];
          const headers = buildRequestHeaders(key, protocol);
          let data = null;
          let lastError = null;

          for (const endpoint of endpoints) {
            try {
              const res = await fetch(endpoint, { headers });
              if (!res.ok) {
                let detail = '';
                try {
                  const raw = await res.text();
                  detail = raw ? ` ${raw.slice(0, 240)}` : '';
                } catch (_) {
                  detail = '';
                }
                throw new Error(`HTTP ${res.status}${detail}`);
              }
              data = await res.json();
              break;
            } catch (err) {
              lastError = err;
              console.warn('[fetchModelList] endpoint failed:', endpoint, err);
            }
          }

          if (!data) throw lastError || new Error('模型列表请求失败');

          let models = [];
          if (data.data && Array.isArray(data.data)) {
            // OpenAI 格式: { data: [{ id: "xxx" }] }
            models = data.data.map(m => ({ id: m.id, name: m.id }));
          } else if (data.models && Array.isArray(data.models)) {
            // Gemini 格式: { models: [{ name: "models/xxx" }] }
            models = data.models.map(m => {
              const id = m.name?.replace('models/', '') || m.id || m.name;
              return { id, name: m.displayName || id };
            });
          }

          if (models.length === 0) {
            flashStatus('未获取到模型列表，请检查 API', 'danger');
            return;
          }

          const prevImage = imageModelSelect.value;
          const prevText = textModelSelect.value;

          imageModelSelect.innerHTML = '';
          textModelSelect.innerHTML = '';
          models.forEach(m => {
            imageModelSelect.add(new Option(m.name, m.id));
            textModelSelect.add(new Option(m.name, m.id));
          });

          // 恢复之前的选中值
          if ([...imageModelSelect.options].some(o => o.value === prevImage)) {
            imageModelSelect.value = prevImage;
          }
          if ([...textModelSelect.options].some(o => o.value === prevText)) {
            textModelSelect.value = prevText;
          }

          localStorage.setItem('model_list', JSON.stringify(models));
          flashStatus(`已获取 ${models.length} 个模型`, 'success');
        } catch (err) {
          console.error('拉取模型列表失败:', err);
          flashStatus(getModelListErrorMessage(err), 'danger');
        } finally {
          fetchModelsBtn.disabled = false;
          fetchModelsBtn.textContent = '拉取列表';
        }
      }

      fetchModelsBtn.addEventListener('click', fetchModelList);
      addModelsBtn.addEventListener('click', showAddModelsDialog);
      deleteImageModelBtn.addEventListener('click', () => deleteCurrentModel('image'));
      deleteTextModelBtn.addEventListener('click', () => deleteCurrentModel('text'));
      setTextKeyBtn?.addEventListener('click', showTextKeyDialog);

      function restoreSelectValue(selectEl, value) {
        if (!selectEl || value === null) return;
        if ([...selectEl.options].some(o => o.value === value)) {
          selectEl.value = value;
        }
      }

      function loadSettings() {
        const storedApiKey = loadStoredApiKey();
        apiKeyValue = storedApiKey.key || '';
        textApiKeyValue = loadStoredTextApiKey();
        if (rememberApiKeyInput) {
          rememberApiKeyInput.checked = storedApiKey.remember;
        }
        renderApiKeyMask();
        updateTextKeyButtonState();
        const savedBaseUrl = localStorage.getItem('gemini_base_url');
        if (appConfig.forceDefaultBaseUrl || !savedBaseUrl) {
          baseUrlInput.value = defaultBaseUrl;
        } else {
          baseUrlInput.value = savedBaseUrl;
        }
        if (proxyModeInput) {
          proxyModeInput.checked = localStorage.getItem(API_PROXY_MODE_KEY) === '1';
        }
        if (apiLinkEl) {
          const url = getBaseUrl();
          apiLinkEl.href = url.startsWith('/') ? apiHomeUrl : url;
        }

        // 恢复协议选择
        const savedProtocol = localStorage.getItem('api_protocol');
        if (savedProtocol && [...protocolSelect.options].some(o => o.value === savedProtocol)) {
          protocolSelect.value = savedProtocol;
        }

        // 恢复模型列表
        const savedModels = localStorage.getItem('model_list');
        if (savedModels) {
          try {
            const models = JSON.parse(savedModels);
          if (models.length > 0) {
            imageModelSelect.innerHTML = '';
            textModelSelect.innerHTML = '';
            models.forEach(m => {
                appendModelOption(imageModelSelect, m.id, m.name);
                appendModelOption(textModelSelect, m.id, m.name);
            });
          }
          } catch (e) { /* ignore */ }
        }
        const savedImageModel = localStorage.getItem('image_model');
        const savedTextModel = localStorage.getItem('text_model');
        if (savedImageModel) ensureModelOption(imageModelSelect, savedImageModel, savedImageModel);
        if (savedTextModel) ensureModelOption(textModelSelect, savedTextModel, savedTextModel);
        restoreSelectValue(aspectSelect, localStorage.getItem('image_aspect'));
        restoreSelectValue(resolutionSelect, localStorage.getItem('image_resolution'));
        restoreSelectValue(imageQualitySelect, localStorage.getItem('image_quality'));
        restoreSelectValue(outputFormatSelect, localStorage.getItem('output_format'));
        restoreSelectValue(imageBackgroundSelect, localStorage.getItem('image_background'));

        const savedHistoryRetention = localStorage.getItem(HISTORY_IMAGE_RETENTION_KEY);
        setHistoryImageRetention(savedHistoryRetention);
      }

      function saveSettings() {
        const apiKey = getApiKey();
        const rememberApiKey = !!rememberApiKeyInput?.checked;
        persistApiKey(apiKey, rememberApiKey);
        persistTextApiKey(textApiKeyValue);
        localStorage.setItem('gemini_base_url', getBaseUrl());
        localStorage.setItem(API_PROXY_MODE_KEY, proxyModeInput?.checked ? '1' : '0');
        localStorage.setItem('image_model', imageModelSelect.value);
        localStorage.setItem('text_model', textModelSelect.value);
        localStorage.setItem('api_protocol', protocolSelect.value);
        localStorage.setItem('image_aspect', aspectSelect.value);
        localStorage.setItem('image_resolution', resolutionSelect.value);
        localStorage.setItem('image_quality', imageQualitySelect.value);
        localStorage.setItem('output_format', outputFormatSelect.value);
        localStorage.setItem('image_background', imageBackgroundSelect.value);
        localStorage.setItem(HISTORY_IMAGE_RETENTION_KEY, getHistoryImageRetention());

        flashStatus(rememberApiKey ? '已保存到浏览器本地' : '已保存到当前会话', 'success');
      }

      function flashStatus(msg, type) {
        statusEl.textContent = msg;
        statusEl.classList.remove('danger', 'success');
        if (type) statusEl.classList.add(type);
      }

      // 解析 API 错误并返回中文提示
      function parseApiError(errorMessage) {
        // 先尝试直接匹配英文错误消息并翻译
        if (errorMessage.includes('token quota is not enough') ||
          errorMessage.includes('pre_consume_token_quota_failed')) {
          // 提取剩余配额和所需配额
          const remainMatch = errorMessage.match(/remain quota: ¥([\d.]+)/);
          const needMatch = errorMessage.match(/need quota: ¥([\d.]+)/);
          if (remainMatch && needMatch) {
            return `Token 配额不足！剩余: ¥${remainMatch[1]}，所需: ¥${needMatch[1]}，请充值后重试`;
          }
          return 'Token 配额不足，请充值后重试';
        }

        try {
          // 尝试解析 JSON 格式的错误
          const errorData = JSON.parse(errorMessage);

          // 处理 token 配额不足的错误
          if (errorData.code === 'pre_consume_token_quota_failed' ||
            errorData.type === 'new_api_error') {
            const message = errorData.message || '';
            // 提取剩余配额和所需配额
            const remainMatch = message.match(/remain quota: ¥([\d.]+)/);
            const needMatch = message.match(/need quota: ¥([\d.]+)/);
            if (remainMatch && needMatch) {
              return `Token 配额不足！剩余: ¥${remainMatch[1]}，所需: ¥${needMatch[1]}，请充值后重试`;
            }
            return 'Token 配额不足，请充值后重试';
          }

          // 处理其他常见错误类型
          if (errorData.error) {
            const error = errorData.error;
            if (error.code === 'UNAUTHENTICATED' || error.status === 'UNAUTHENTICATED') {
              return 'API Key 无效或已过期，请检查后重试';
            }
            if (error.code === 'PERMISSION_DENIED' || error.status === 'PERMISSION_DENIED') {
              return '没有权限访问此 API，请检查 API Key 权限';
            }
            if (error.code === 'RESOURCE_EXHAUSTED' || error.status === 'RESOURCE_EXHAUSTED') {
              return '请求频率超限，请稍后重试';
            }
            if (error.code === 'INVALID_ARGUMENT' || error.status === 'INVALID_ARGUMENT') {
              return '请求参数无效：' + translateErrorMessage(error.message || '请检查输入');
            }
            if (error.message) {
              return translateErrorMessage(error.message);
            }
          }

          // 返回原始消息（翻译后）
          if (errorData.message) {
            return translateErrorMessage(errorData.message);
          }
        } catch (e) {
          // 不是 JSON 格式，继续处理
        }

        // 处理网络相关错误
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
          return '网络连接失败，请检查网络后重试';
        }
        if (errorMessage.includes('aborted') || errorMessage.includes('timeout')) {
          return '请求超时，请稍后重试';
        }

        // 返回翻译后的错误消息
        return translateErrorMessage(errorMessage) || '未知错误';
      }

      // 翻译常见英文错误消息为中文
      function translateErrorMessage(msg) {
        if (!msg) return '未知错误';

        const translations = {
          'error code: 524': '请求超时：代理服务器或 CDN 等待上游生图接口返回太久。请关闭 CDN 代理、或换用响应更快/支持直连的中转站',
          'HTTP 524': '请求超时：代理服务器或 CDN 等待上游生图接口返回太久。请关闭 CDN 代理、或换用响应更快/支持直连的中转站',
          'no image generated': '上游接口没有生成图片，请尝试切换 API 协议、模型或换一个提示词',
          'token quota is not enough': 'Token 配额不足',
          'remain quota': '剩余配额',
          'need quota': '所需配额',
          'request id': '请求ID',
          'Invalid API key': 'API Key 无效',
          'API key expired': 'API Key 已过期',
          'Rate limit exceeded': '请求频率超限',
          'Internal server error': '服务器内部错误',
          'Service unavailable': '服务暂时不可用',
          'Bad request': '请求格式错误',
          'Unauthorized': '未授权访问',
          'Forbidden': '禁止访问',
          'Not found': '资源不存在',
          'Request timeout': '请求超时',
          'Too many requests': '请求过于频繁'
        };

        let translated = msg;
        for (const [en, zh] of Object.entries(translations)) {
          translated = translated.replace(new RegExp(en, 'gi'), zh);
        }
        return translated;
      }

      function extractApiErrorMessage(data) {
        if (!data || typeof data !== 'object') return '';

        const error = data.error || data.error_message || data.errorMessage;
        if (error) {
          if (typeof error === 'string') return error;
          const message = error.message || error.msg || error.detail || '';
          const code = error.code || error.type || error.status || '';
          if (message && code) return `${message} (${code})`;
          if (message) return message;
          if (code) return String(code);
          try { return JSON.stringify(error); } catch (_) { return String(error); }
        }

        if (data.status === 'error' || data.success === false) {
          return data.message || data.msg || data.detail || 'API 返回失败';
        }

        return '';
      }

      function getModelListErrorMessage(error) {
        const message = String(error?.message || '').trim();
        if (/HTTP 401/i.test(message)) {
          return '拉取模型列表失败：认证未通过，请检查 API Key、协议类型和请求头配置';
        }
        if (/HTTP 403/i.test(message)) {
          return '拉取模型列表失败：当前接口禁止列出模型（HTTP 403）。很多中转站不开放 /models，请改用“手动添加”填写模型名';
        }
        if (/HTTP 404/i.test(message)) {
          return '拉取模型列表失败：当前接口没有提供模型列表端点（HTTP 404），请改用“手动添加”填写模型名';
        }
        if (/Failed to fetch|NetworkError/i.test(message)) {
          return '拉取模型列表失败：网络连接失败，或目标接口未放行浏览器跨域';
        }
        return '拉取模型列表失败: ' + (parseApiError(message) || message || '未知错误');
      }

      function renderUploads() {
        updateReferenceImageLimitText();
        preview.innerHTML = '';
        state.images.forEach((img, idx) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'thumb';
          const imageEl = document.createElement('img');
          imageEl.src = img.dataUrl;
          imageEl.style.cursor = 'zoom-in';
          imageEl.title = '点击预览';

          // 点击预览
          imageEl.addEventListener('click', () => {
            openLightbox(img.dataUrl);
          });

          // 显示图片大小
          const sizeKB = Math.round(img.dataUrl.length * 0.75 / 1024);
          const sizeLabel = document.createElement('span');
          sizeLabel.className = 'size-label';
          sizeLabel.textContent = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)}MB` : `${sizeKB}KB`;

          const btn = document.createElement('button');
          btn.textContent = `删除`;
          btn.onclick = () => {
            state.images.splice(idx, 1);
            renderUploads();
          };
          wrapper.appendChild(imageEl);
          wrapper.appendChild(sizeLabel);
          wrapper.appendChild(btn);
          preview.appendChild(wrapper);
        });
        flashStatus(state.images.length ? `已选择 ${state.images.length} 张` : '待发送...');
      }

      function updateReferenceImageLimitText() {
        const limit = getReferenceImageLimit();
        if (uploadLabel) {
          uploadLabel.textContent = `上传参考图（最多 ${limit} 张，可拖拽/粘贴）`;
        }
      }

      function handleFiles(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        // 计算还能添加多少张
        const limit = getReferenceImageLimit();
        const remaining = limit - state.images.length;
        if (remaining <= 0) {
          flashStatus(`最多只能上传 ${limit} 张参考图`, 'danger');
          return;
        }
        const filesToAdd = files.slice(0, remaining);
        flashStatus(`正在处理 ${filesToAdd.length} 张图片...`);

        Promise.all(filesToAdd.map(processAndCompressImage)).then(list => {
          state.images = [...state.images, ...list];
          renderUploads();
          if (files.length > remaining) {
            flashStatus(`已添加 ${filesToAdd.length} 张，超出的已忽略（最多 ${limit} 张）`, 'success');
          } else {
            flashStatus(`已添加 ${list.length} 张图片（已自动压缩至10MB内）`, 'success');
          }
        }).catch(err => {
          console.error('处理图片失败:', err);
          flashStatus('处理图片失败，请重试', 'danger');
        });
      }

      // 图片大小限制（字节）
      const MIN_IMAGE_SIZE = 5 * 1024 * 1024; // 最小目标：5MB
      const MAX_IMAGE_SIZE = 9 * 1024 * 1024; // 最大目标：9MB

      // 压缩图片到指定尺寸和质量
      function compressImageOnce(img, maxWidth, maxHeight, quality, mime) {
        let { width, height } = img;

        // 计算缩放比例
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // 创建 canvas 进行压缩
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // 转换为 base64，对于大文件优先使用 JPEG 格式
        const outputMime = mime === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(outputMime, quality);

        return {
          dataUrl,
          mime: outputMime,
          width,
          height,
          size: Math.round(dataUrl.length * 0.75)
        };
      }

      // 递进式压缩图片，确保不超过 10MB
      function compressImageToLimit(file) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          const url = URL.createObjectURL(file);

          img.onload = () => {
            URL.revokeObjectURL(url);

            const originalWidth = img.width;
            const originalHeight = img.height;
            const originalSizeKB = file.size / 1024;

            // 如果原图已经 ≤ 9MB，直接使用原图，不压缩
            if (file.size <= MAX_IMAGE_SIZE) {
              debugLog(
                `图片无需压缩: ${file.name}\n` +
                `  尺寸: ${originalWidth}x${originalHeight}\n` +
                `  大小: ${originalSizeKB.toFixed(1)}KB (${(file.size / 1024 / 1024).toFixed(2)}MB)`
              );

              // 读取原图为 dataUrl
              const reader = new FileReader();
              reader.onload = () => {
                resolve({
                  name: file.name,
                  mime: file.type,
                  dataUrl: reader.result,
                  originalSize: file.size,
                  compressedSize: file.size
                });
              };
              reader.onerror = () => reject(new Error('读取图片失败'));
              reader.readAsDataURL(file);
              return;
            }

            // 压缩参数配置：[最大宽度, 最大高度, 质量, MIME类型]
            // 策略：从高质量JPEG开始，逐步降低质量和尺寸
            // 注意：PNG不支持质量参数，所以不使用PNG压缩级别
            const compressionLevels = [];

            // 尝试高质量JPEG（从1.0开始，逐步降低，增加细粒度）
            compressionLevels.push(
              [originalWidth, originalHeight, 1.00, 'image/jpeg'],  // 最高质量
              [originalWidth, originalHeight, 0.99, 'image/jpeg'],  // 极高质量
              [originalWidth, originalHeight, 0.98, 'image/jpeg'],
              [originalWidth, originalHeight, 0.97, 'image/jpeg'],
              [originalWidth, originalHeight, 0.96, 'image/jpeg'],
              [originalWidth, originalHeight, 0.95, 'image/jpeg'],
              [originalWidth, originalHeight, 0.93, 'image/jpeg'],
              [originalWidth, originalHeight, 0.90, 'image/jpeg'],
              [originalWidth, originalHeight, 0.87, 'image/jpeg'],
              [originalWidth, originalHeight, 0.85, 'image/jpeg'],
              [originalWidth, originalHeight, 0.80, 'image/jpeg'],
              [4096, 4096, 0.92, 'image/jpeg'],  // 开始缩放尺寸
              [3072, 3072, 0.85, 'image/jpeg'],
              [2560, 2560, 0.80, 'image/jpeg'],
              [2048, 2048, 0.75, 'image/jpeg'],
              [1920, 1920, 0.70, 'image/jpeg'],
              [1600, 1600, 0.65, 'image/jpeg'],
              [1280, 1280, 0.60, 'image/jpeg'],
              [1024, 1024, 0.55, 'image/jpeg'],
              [800, 800, 0.50, 'image/jpeg'],
              [640, 640, 0.45, 'image/jpeg']
            );

            let result = null;
            let previousResult = null;
            let finalLevel = 0;

            // 调试：输出压缩级别数组长度
            debugLog(`压缩级别总数: ${compressionLevels.length}`);

            // 尝试各级压缩，目标是找到 5-9MB 之间的结果
            for (let i = 0; i < compressionLevels.length; i++) {
              const [maxW, maxH, quality, mimeType] = compressionLevels[i];
              debugLog(`尝试压缩级别 ${i + 1}/${compressionLevels.length}: ${mimeType}, 质量=${quality}, 尺寸=${maxW}x${maxH}`);

              result = compressImageOnce(img, maxW, maxH, quality, mimeType);
              finalLevel = i + 1;

              const resultSizeMB = (result.size / 1024 / 1024).toFixed(2);
              debugLog(`  结果: ${resultSizeMB}MB (${result.width}x${result.height})`);

              // 如果结果在 5-9MB 之间，完美！
              if (result.size >= MIN_IMAGE_SIZE && result.size <= MAX_IMAGE_SIZE) {
                debugLog(`  ✓ 在目标范围内，停止压缩`);
                break;
              }

              // 如果结果 < 5MB，检查是否在容忍范围内（4-9MB）
              if (result.size < MIN_IMAGE_SIZE) {
                const toleranceSize = 4 * 1024 * 1024; // 4MB容忍下限

                if (result.size >= toleranceSize) {
                  // 在容忍范围内（4-5MB），接受这个结果
                  debugLog(`  ✓ 在容忍范围内 (4-5MB)，接受结果`);
                  break;
                } else {
                  // < 4MB，压缩过度
                  debugLog(`  ⚠ 压缩过度 (<4MB)`);

                  // 如果有上一级结果，且上一级在合理范围内（<= 9MB），才回退
                  if (previousResult && previousResult.size <= MAX_IMAGE_SIZE) {
                    result = previousResult;
                    finalLevel = i; // 回退到上一级
                    debugLog(`  → 回退到上一级`);
                  } else if (previousResult) {
                    // 上一级超出9MB，当前级虽然<4MB，但比超出范围的结果好
                    debugLog(`  → 上一级超出范围，保持当前结果`);
                  }
                  // 否则使用当前结果（第一级就 < 4MB 的情况）
                  break;
                }
              }

              // 如果结果 > 9MB，继续尝试下一级
              debugLog(`  → 继续尝试下一级`);
              previousResult = result;
            }

            // 如果所有级别都 > 9MB，尝试强制转为 JPEG
            if (result.size > MAX_IMAGE_SIZE && file.type === 'image/png') {
              const jpegResult = compressImageOnce(img, 640, 640, 0.40, 'image/jpeg');
              if (jpegResult.size >= MIN_IMAGE_SIZE) {
                result = jpegResult;
                finalLevel = 'JPEG强制';
              }
            }

            const finalSizeKB = result.size / 1024;
            const finalSizeMB = (result.size / 1024 / 1024).toFixed(2);
            const compressionRatio = ((1 - result.size / file.size) * 100).toFixed(1);
            const inTargetRange = result.size >= MIN_IMAGE_SIZE && result.size <= MAX_IMAGE_SIZE;

            debugLog(
              `图片压缩完成: ${file.name}\n` +
              `  原始: ${originalWidth}x${originalHeight}, ${originalSizeKB.toFixed(1)}KB (${(file.size / 1024 / 1024).toFixed(2)}MB)\n` +
              `  压缩后: ${result.width}x${result.height}, ${finalSizeKB.toFixed(1)}KB (${finalSizeMB}MB)\n` +
              `  压缩级别: ${finalLevel}, 压缩率: ${compressionRatio}%\n` +
              `  目标范围: 5-9MB, 状态: ${inTargetRange ? '✓ 在范围内' : '⚠ 超出范围'}`
            );

            resolve({
              name: file.name,
              mime: result.mime,
              dataUrl: result.dataUrl,
              originalSize: file.size,
              compressedSize: result.size
            });
          };

          img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('图片加载失败'));
          };

          img.src = url;
        });
      }

      // 处理并压缩图片
      async function processAndCompressImage(file) {
        const fileSizeBytes = file.size;
        const fileSizeKB = fileSizeBytes / 1024;
        const fileSizeMB = fileSizeKB / 1024;

        debugLog(`处理图片: ${file.name}, 原始大小: ${fileSizeMB.toFixed(2)}MB`);

        // 如果图片已经小于 10MB，直接读取
        if (fileSizeKB <= 10240) {
          debugLog(`图片较小，无需压缩: ${file.name}`);
          return await readFileAsDataUrl(file);
        }

        // 对于大于 10MB 的图片，进行压缩
        return await compressImageToLimit(file);
      }

      function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({
            name: file.name,
            mime: file.type || 'image/png',
            dataUrl: reader.result
          });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      function getImagePromptParts(prompt, imgs) {
        const parts = [{ text: prompt }];
        imgs.forEach(img => {
          const base64 = img.dataUrl.split(',')[1];
          parts.push({
            inline_data: {
              mime_type: img.mime || 'image/png',
              data: base64
            }
          });
        });
        return parts;
      }

      function buildGeminiImageConfig() {
        const imageConfig = { imageSize: resolutionSelect.value };
        if (aspectSelect.value !== 'auto') {
          imageConfig.aspectRatio = aspectSelect.value;
        }
        return imageConfig;
      }

      function buildGeminiImagePayload(prompt, imgs = []) {
        return {
          contents: [{
            role: 'user',
            parts: getImagePromptParts(prompt, imgs)
          }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: buildGeminiImageConfig()
          }
        };
      }

      function buildOpenAIChatImagePayload(prompt, imgs = [], model = getImageModel()) {
        const content = imgs.length
          ? [
              { type: 'text', text: prompt },
              ...imgs.map(img => ({
                type: 'image_url',
                image_url: { url: img.dataUrl }
              }))
            ]
          : prompt;

        return {
          model,
          messages: [{ role: 'user', content }],
          stream: false
        };
      }

      function buildPayload(prompt) {
        const protocol = getProtocol();
        const imgs = getReferenceImagesForRequest(state.images, protocol);

        if (protocol === 'openai-images') {
          // OpenAI Images 格式: POST /v1/images/generations
          const payload = {
            model: getImageModel(),
            prompt: prompt
          };
          applyOpenAIImageOptions(payload);
          return payload;
        }

        if (protocol === 'openai-chat') {
          // OpenAI Chat 格式: POST /v1/chat/completions
          return buildOpenAIChatImagePayload(prompt, imgs);
        }

        // Gemini 原生格式
        return buildGeminiImagePayload(prompt, imgs);
      }

      function isPortraitAspect(aspect) {
        return ['2:3', '3:4', '4:5', '9:16'].includes(aspect);
      }

      function isLandscapeAspect(aspect) {
        return ['5:4', '4:3', '3:2', '16:9', '21:9'].includes(aspect);
      }

      // 根据比例获取像素尺寸（用于 OpenAI Images 格式）
      function getImageSize(modelName = getImageModel()) {
        const aspect = aspectSelect.value;
        const family = getImageModelFamily(modelName);
        const model = String(modelName || '').trim().toLowerCase();

        if (family === 'dalle') {
          if (model.includes('dall-e-2') || model.includes('dalle-2')) {
            return '1024x1024';
          }
          if (isPortraitAspect(aspect)) return '1024x1792';
          if (isLandscapeAspect(aspect)) return '1792x1024';
          return '1024x1024';
        }

        const sizes = {
          'auto': '1024x1024',
          '1:1': '1024x1024',
          '2:3': '1024x1536',
          '3:4': '1024x1536',
          '4:5': '1024x1536',
          '5:4': '1536x1024',
          '4:3': '1536x1024',
          '3:2': '1536x1024',
          '16:9': '1536x1024',
          '9:16': '1024x1536',
          '21:9': '1536x1024'
        };
        return sizes[aspect] || '1024x1024';
      }

      function getImageModelFamily(modelName = getImageModel()) {
        const model = String(modelName || '').trim().toLowerCase();
        if (/^dall[-_]?e[-_]?/.test(model) || /^dalle[-_]?/.test(model)) return 'dalle';
        if (/^gpt[-_]?image[-_]?/.test(model)) return 'gpt-image';
        return 'unknown';
      }

      function shouldSendImageResponseFormat(modelName = getImageModel()) {
        return getImageModelFamily(modelName) === 'dalle';
      }

      function getOpenAIImageQuality(modelName = getImageModel()) {
        const quality = imageQualitySelect?.value || '';
        if (!quality) return '';

        const family = getImageModelFamily(modelName);
        if (family === 'dalle') {
          return ['standard', 'hd'].includes(quality) ? quality : '';
        }
        if (family === 'gpt-image') {
          return ['auto', 'low', 'medium', 'high'].includes(quality) ? quality : '';
        }
        return quality;
      }

      function shouldSendGptImageOutputOption(modelName = getImageModel()) {
        return getImageModelFamily(modelName) !== 'dalle';
      }

      function getOpenAIImageFieldName(imageCount = 1) {
        return (isApiProxyEnabled() || imageCount > 1) ? 'image[]' : 'image';
      }

      function setImageOption(target, key, value, asFormData = false) {
        if (value === null || value === undefined || value === '') return;
        if (asFormData) target.append(key, String(value));
        else target[key] = value;
      }

      function applyOpenAIImageOptions(target, modelName = getImageModel(), asFormData = false) {
        setImageOption(target, 'size', getImageSize(modelName), asFormData);
        setImageOption(target, 'quality', getOpenAIImageQuality(modelName), asFormData);
        if (shouldSendImageResponseFormat(modelName)) {
          setImageOption(target, 'response_format', 'b64_json', asFormData);
        }
        if (shouldSendGptImageOutputOption(modelName)) {
          setImageOption(target, 'output_format', outputFormatSelect?.value || '', asFormData);
          setImageOption(target, 'background', imageBackgroundSelect?.value || '', asFormData);
        }
      }

      async function buildOpenAIImageEditsRequest(prompt, imgs, imageModel, key) {
        const endpoint = buildApiUrl('/v1/images/edits');
        const formData = new FormData();
        formData.append('model', imageModel);
        formData.append('prompt', prompt);
        applyOpenAIImageOptions(formData, imageModel, true);
        const imageFieldName = getOpenAIImageFieldName(imgs.length);
        for (const img of imgs) {
          const blob = await fetchImageAsBlob(img.dataUrl);
          const ext = getExtensionFromMime(img.mime || blob.type || 'image/png');
          formData.append(imageFieldName, blob, `ref.${ext}`);
        }
        return {
          endpoint,
          headers: { 'Authorization': `Bearer ${key}` },
          body: formData
        };
      }

      function buildOpenAIImageRelayGenerationsRequest(prompt, imgs, imageModel, key) {
        const endpoint = buildApiUrl('/v1/images/generations');
        const payload = {
          model: imageModel,
          prompt,
          image: imgs.map(img => img.dataUrl).filter(Boolean)
        };
        applyOpenAIImageOptions(payload, imageModel);
        return {
          endpoint,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(payload)
        };
      }

      function shouldRetryOpenAIImageWithRelay(status, errorText = '') {
        if ([401, 403, 429].includes(status) || status >= 500) return false;
        if ([400, 404, 415, 422].includes(status)) return true;

        const text = String(errorText || '').toLowerCase();
        if (!text) return false;

        const retryPatterns = [
          /\/v1\/images\/edits/,
          /\/images\/edits/,
          /unsupported media type/,
          /unknown endpoint/,
          /not found/,
          /invalid image/,
          /image.*(must|should).*(array|string)/,
          /generations/
        ];

        return retryPatterns.some(pattern => pattern.test(text));
      }

      async function sendImageRequest(request, label = 'default') {
        debugLog('[callImageAPI] request:', {
          label,
          endpoint: request.endpoint,
          contentType: request.headers?.['Content-Type'] || '(multipart)',
          hasBody: !!request.body
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000); // 10分钟超时
        let res;
        try {
          res = await fetch(request.endpoint, {
            method: 'POST',
            headers: request.headers,
            body: request.body,
            signal: controller.signal
          });
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') throw new Error('请求超时（10分钟），请稍后重试');
          throw fetchErr;
        }
        clearTimeout(timeoutId);

        const raw = await res.text();
        debugLog(`[callImageAPI] raw response (${label}):`, raw.slice(0, 2000));

        let data;
        try { data = JSON.parse(raw); } catch(_) { data = raw; }

        return { ok: res.ok, status: res.status, raw, data };
      }

      function guessMimeFromUrl(url) {
        if (!url) return '';
        const lower = url.toLowerCase().split('?')[0];
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
        if (lower.endsWith('.png')) return 'image/png';
        if (lower.endsWith('.gif')) return 'image/gif';
        if (lower.endsWith('.webp')) return 'image/webp';
        return '';
      }

      function extractResult(data) {
        const emptyResult = (extra) => ({ text: '', imageBase64: '', imageUrl: '', mime: 'image/png', blocked: false, ...extra });

        // 检测是否被安全策略拦截
        const candidate = data?.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const blockReason = data?.promptFeedback?.blockReason;

        if (blockReason) {
          return emptyResult({ blocked: true, blockMessage: `内容被拦截：${blockReason}` });
        }
        if (finishReason && finishReason !== 'STOP' && !candidate?.content?.parts?.length) {
          const reasonMap = { 'SAFETY': '安全策略拦截', 'RECITATION': '内容重复', 'OTHER': '其他原因', 'BLOCKLIST': '命中黑名单' };
          return emptyResult({ blocked: true, blockMessage: `生成被拒绝：${reasonMap[finishReason] || finishReason}` });
        }

        const parts = candidate?.content?.parts
          || data?.contents?.[0]?.parts
          || data?.content?.parts
          || [];
        const textList = [];
        let imageBase64 = '';
        let imageUrl = '';
        let mime = 'image/png';

        parts.forEach(p => {
          if (p.text) textList.push(p.text);
          const inline = p.inline_data || p.inlineData;
          if (inline?.data) {
            imageBase64 = inline.data;
            mime = inline.mime_type || inline.mimeType || mime;
          }
          if (p.file_data?.file_uri || p.fileData?.fileUri) {
            imageUrl = p.file_data?.file_uri || p.fileData?.fileUri;
          }
        });

        if (!imageBase64 && data?.imageBase64) {
          imageBase64 = data.imageBase64;
          mime = data.mimeType || mime;
        }
        if (!textList.length && typeof data?.text === 'string') textList.push(data.text);

        // 1. OpenAI images 格式: { data: [{ url }] } 或 { data: [{ b64_json }] }
        if (!imageBase64 && !imageUrl && Array.isArray(data?.data)) {
          const withUrl = data.data.find(d => d.url);
          if (withUrl) { imageUrl = withUrl.url; mime = guessMimeFromUrl(withUrl.url) || mime; }
          const withB64 = data.data.find(d => d.b64_json);
          if (!imageBase64 && withB64) imageBase64 = withB64.b64_json;
        }

        // 2. OpenAI chat 格式: { choices: [{ message: { content } }] }
        if (!imageBase64 && !imageUrl && data?.choices?.[0]?.message?.content) {
          const content = data.choices[0].message.content;
          if (Array.isArray(content)) {
            content.forEach(item => {
              if (item.type === 'image_url' && item.image_url?.url) imageUrl = item.image_url.url;
              if (item.type === 'text' && item.text) textList.push(item.text);
            });
          } else if (typeof content === 'string' && content.trim()) {
            textList.push(content);
          }
        }

        // 3. text 中包含 URL JSON 数组: [{"url":"..."}]
        if (!imageBase64 && !imageUrl && textList.length) {
          const fullText = textList.join('\n').trim();
          try {
            const parsed = JSON.parse(fullText);
            if (Array.isArray(parsed)) {
              const firstUrl = parsed.find(item => item.url);
              if (firstUrl) { imageUrl = firstUrl.url; mime = guessMimeFromUrl(firstUrl.url) || mime; textList.length = 0; }
            } else if (parsed && parsed.url) {
              imageUrl = parsed.url; mime = guessMimeFromUrl(parsed.url) || mime; textList.length = 0;
            }
          } catch (_) {}
        }

        // 4. text 中包含 markdown 图片 ![...](data:...) 或 ![...](https://...)
        if (!imageBase64 && !imageUrl && textList.length) {
          const fullText = textList.join('\n');
          const mdMatch = fullText.match(/!\[.*?\]\((data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)\)/);
          if (mdMatch) {
            const dataUri = mdMatch[1];
            const mimeMatch = dataUri.match(/^data:(image\/[^;]+);base64,/);
            if (mimeMatch) mime = mimeMatch[1];
            imageBase64 = dataUri.split(',')[1];
            textList.length = 0;
          }
          if (!imageBase64 && !imageUrl) {
            const mdUrlMatch = fullText.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
            if (mdUrlMatch) { imageUrl = mdUrlMatch[1]; mime = guessMimeFromUrl(imageUrl) || mime; textList.length = 0; }
          }
        }

        // 5. 单条 text 本身就是图片 URL 或 data URI
        if (!imageBase64 && !imageUrl && textList.length === 1) {
          const single = textList[0].trim();
          if (/^data:image\/[^;]+;base64,/.test(single)) {
            const mimeMatch = single.match(/^data:(image\/[^;]+);base64,/);
            if (mimeMatch) mime = mimeMatch[1];
            imageBase64 = single.split(',')[1];
            textList.length = 0;
          } else if (/^https?:\/\/.+/i.test(single)) {
            imageUrl = single; mime = guessMimeFromUrl(single) || mime; textList.length = 0;
          }
        }

        // 6. text 中包含图片 URL
        if (!imageBase64 && !imageUrl && textList.length) {
          const fullText = textList.join('\n');
          const urlMatch = fullText.match(/https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|gif|webp)(\?[^\s"'<>]*)?/i);
          if (urlMatch) { imageUrl = urlMatch[0]; mime = guessMimeFromUrl(imageUrl) || mime; }
        }

        return { text: textList.join('\n\n'), imageBase64, imageUrl, mime, blocked: false };
      }

      // 从 result 获取可显示的图片 src
      function getResultImgSrc(result) {
        if (!result) return '';
        if (result.imageBase64) {
          return result.imageBase64.startsWith('data:')
            ? result.imageBase64
            : `data:${result.mime || 'image/png'};base64,${result.imageBase64}`;
        }
        return result.imageUrl || '';
      }

      async function getPersistentImageSource(src) {
        if (!src) throw new Error('图片地址为空');
        if (/^data:/i.test(src)) return src;

        const blob = await fetchImageAsBlob(src);
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('图片转为本地数据失败'));
          reader.readAsDataURL(blob);
        });
      }

      async function fetchImageAsBlob(src) {
        if (!src) throw new Error('图片地址为空');

        async function fetchBlob(url) {
          const response = await fetch(url, { cache: 'no-store' });
          if (!response.ok) {
            throw new Error(`图片下载失败: HTTP ${response.status}`);
          }
          return response.blob();
        }

        try {
          return await fetchBlob(src);
        } catch (err) {
          if (!canProxyImageUrl(src)) throw err;

          console.warn('图片直连读取失败，尝试通过代理读取:', err);
          try {
            return await fetchBlob(buildApiProxyUrlForTarget(src));
          } catch (proxyErr) {
            throw new Error(`图片读取失败，直连和代理都不可用：${proxyErr.message || proxyErr}`);
          }
        }
      }

      // 判断 result 是否包含图片
      function hasResultImage(result) {
        return !!(result && (result.imageBase64 || result.imageUrl));
      }

      // 根据 MIME 类型获取正确的文件扩展名
      function getExtensionFromMime(mime) {
        const mimeToExt = {
          'image/jpeg': 'jpg',
          'image/jpg': 'jpg',
          'image/png': 'png',
          'image/gif': 'gif',
          'image/webp': 'webp'
        };
        return mimeToExt[mime] || 'png';
      }

      // 统一的文本API调用：根据协议自动构建请求和解析响应
      async function callTextAPI(promptText, options = {}) {
        const key = getTextApiKey();
        if (!key) throw new Error('请先配置 API Key');

        const protocol = getProtocol();
        const endpoint = getFlashEndpoint();
        let payload;

        if (protocol === 'gemini') {
          payload = {
            contents: [{ role: 'user', parts: [{ text: promptText }] }],
            generationConfig: {
              temperature: options.temperature ?? 0.3,
              candidateCount: 1
            }
          };
        } else {
          payload = {
            model: getTextModel(),
            messages: [{ role: 'user', content: promptText }],
            temperature: options.temperature ?? 0.3
          };
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: buildRequestHeaders(key, protocol),
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`API 错误 (${res.status}): ${errText}`);
        }

        const data = await res.json();
        const apiErrorMessage = extractApiErrorMessage(data);
        if (apiErrorMessage) {
          console.error('[callTextAPI] error payload:', data);
          throw new Error(apiErrorMessage);
        }

        // 提取文本：兼容 Gemini 和 OpenAI 格式
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
          || (typeof data?.choices?.[0]?.message?.content === 'string' ? data.choices[0].message.content : '')
          || '';

        if (!text) throw new Error('API 返回内容为空');
        return text;
      }

      // 分镜识别：降级正则方案
      function fallbackRegexParse(scriptText) {
        const lines = scriptText.split('\n');
        let globalRequirements = '';
        const shots = [];

        // 提取全局要求（第一行包含"严格执行"或"要求"）
        if (lines[0] && (lines[0].includes('严格执行') || lines[0].includes('要求'))) {
          globalRequirements = lines[0];
        }

        // 识别分镜（匹配"分镜X："、"镜头X："、"场景X："）
        const shotRegex = /(分镜|镜头|场景)\s*(\d+)[：:]/;
        let currentShot = null;

        lines.forEach(line => {
          const match = line.match(shotRegex);
          if (match) {
            if (currentShot) shots.push(currentShot);
            currentShot = {
              index: parseInt(match[2]),
              description: line.replace(shotRegex, '').trim()
            };
          } else if (currentShot && line.trim()) {
            currentShot.description += ' ' + line.trim();
          }
        });

        if (currentShot) shots.push(currentShot);
        return { globalRequirements, shots };
      }

      // 分镜识别：调用文本API
      async function analyzeStoryboard(scriptText) {
        const promptText = `请分析以下视频分镜脚本，提取所有分镜描述。

要求：
1. 识别所有分镜（可能是"分镜X"、"镜头X"、"场景X"等格式）
2. 提取每个分镜的完整描述
3. 如果脚本开头有全局要求，需要**智能改写**：
   - 理解哪些要求适用于"单张静态图片"（如视角、色彩、光线、风格等）
   - 移除那些需要"多个时间点"或"多个画面"才能表达的要求
   - 特别注意：将"每张图片"、"所有图片"、"全部画面"等表述改写为适合单张图片的描述
   - 改写后的全局要求应该能直接用于指导AI生成单张静态图片
4. 返回严格的 JSON 格式，不要添加任何markdown标记

示例说明：
- 原文："每张图片需体现擦拭动作，并清晰展示出擦拭后的洁净区域"
- 改写："第一视角，喷出的液体为透明色，画面风格统一"
- 原因：单张图片无法同时展示"擦拭动作"和"擦拭后效果"，这需要拆分成多个分镜

脚本内容：
${scriptText}

返回格式示例：
{
  "globalRequirements": "改写后适合单张图片的全局要求",
  "shots": [
    {"index": 1, "description": "分镜描述"},
    {"index": 2, "description": "分镜描述"}
  ]
}`;

        try {
          const text = await callTextAPI(promptText, { temperature: 0.1 });
          try {
            const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            return JSON.parse(cleanText);
          } catch (e) {
            console.warn('JSON解析失败，使用降级方案', e);
            return fallbackRegexParse(scriptText);
          }
        } catch (error) {
          console.error('Flash识别失败:', error);
          return fallbackRegexParse(scriptText);
        }
      }

      // 优化提示词：调用文本API
      async function optimizePromptWithAI(originalPrompt) {
        const promptText = `你是一个专业的AI图像生成提示词优化专家。请优化以下提示词，使其更适合AI图像生成。

优化要求：
1. 保持原始意图和主题不变
2. 添加更多视觉细节描述（光线、色彩、构图、氛围等）
3. 使用更专业、更精确的描述词汇
4. 增强画面感和艺术性
5. 保持简洁，不要过度冗长
6. **必须使用中文输出优化后的提示词**
7. 直接返回优化后的提示词，不要添加任何解释或额外内容

原始提示词：
${originalPrompt}

请直接返回优化后的中文提示词：`;

        const text = await callTextAPI(promptText, { temperature: 0.7 });
        return text.replace(/```.*?\n?/g, '').trim();
      }

      // 检测文本是否主要为英文
      function isEnglishText(text) {
        // 统计英文字符和中文字符的数量
        const englishChars = text.match(/[a-zA-Z]/g) || [];
        const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];

        // 如果英文字符数量明显多于中文字符，判定为英文
        return englishChars.length > chineseChars.length * 2;
      }

      // 翻译英文提示词为中文
      async function translatePromptToChinese(englishPrompt) {
        const text = await callTextAPI(`请将以下英文AI图像生成提示词翻译成中文，保持原意和专业性。只返回翻译后的中文文本，不要添加任何解释。

英文提示词：
${englishPrompt}

请直接返回中文翻译：`, { temperature: 0.3 });
        return text.replace(/```.*?\n?/g, '').trim();
      }

      // 翻译中文提示词为英文
      async function translatePromptToEnglish(chinesePrompt) {
        const text = await callTextAPI(`请将以下中文AI图像生成提示词翻译成英文，保持原意和专业性。只返回翻译后的英文文本，不要添加任何解释。

中文提示词：
${chinesePrompt}

请直接返回英文翻译：`, { temperature: 0.3 });
        return text.replace(/```.*?\n?/g, '').trim();
      }

      // 显示提示词对比弹窗
      async function showPromptCompareDialog(originalPrompt) {
        const overlay = document.createElement('div');
        overlay.className = 'prompt-compare-overlay';

        overlay.innerHTML = `
          <div class="prompt-compare-panel">
            <div class="prompt-compare-header">
              <h3>✨ 提示词优化</h3>
              <button class="prompt-compare-close">✕</button>
            </div>
            <div class="prompt-compare-content">
              <div class="prompt-compare-section">
                <div class="prompt-compare-label">📝 原始提示词</div>
                <textarea class="prompt-compare-text" rows="4" id="original-textarea">${escapeHtml(originalPrompt)}</textarea>
              </div>
              <div class="prompt-compare-section">
                <div class="prompt-compare-label">
                  ✨ 优化后的提示词（中文）
                  <button class="prompt-compare-btn prompt-compare-btn-secondary" id="optimize-now-btn" style="margin-left: 10px; padding: 4px 12px; font-size: 12px;">
                    开始优化
                  </button>
                </div>
                <textarea class="prompt-compare-text" rows="4" id="optimized-textarea" placeholder="点击上方「开始优化」按钮进行优化..." readonly style="background: var(--panel);"></textarea>
                <div style="margin-top: 8px; display: flex; gap: 8px; justify-content: flex-end;">
                  <button class="prompt-compare-btn prompt-compare-btn-primary use-optimized-btn" disabled>使用优化后的</button>
                  <button class="prompt-compare-btn prompt-compare-btn-secondary translate-to-english-btn" disabled>翻译成英文</button>
                </div>
              </div>
              <div class="prompt-compare-section" id="english-translation-section" style="display: none;">
                <div class="prompt-compare-label">🌍 英文翻译版本</div>
                <textarea class="prompt-compare-text" rows="4" id="english-textarea" placeholder="点击上方「翻译成英文」按钮进行翻译..."></textarea>
                <div style="margin-top: 8px; display: flex; gap: 8px; justify-content: flex-end;">
                  <button class="prompt-compare-btn prompt-compare-btn-primary use-english-btn" disabled>使用英文版本</button>
                </div>
              </div>
            </div>
            <div class="prompt-compare-actions">
              <button class="prompt-compare-btn prompt-compare-btn-secondary close-btn">取消</button>
            </div>
          </div>
        `;

        document.body.appendChild(overlay);

        const closeBtn = overlay.querySelector('.close-btn');
        const closeIconBtn = overlay.querySelector('.prompt-compare-close');
        const optimizeNowBtn = overlay.querySelector('#optimize-now-btn');
        const originalTextarea = overlay.querySelector('#original-textarea');
        const optimizedTextarea = overlay.querySelector('#optimized-textarea');
        const useOptimizedBtn = overlay.querySelector('.use-optimized-btn');
        const englishTranslationSection = overlay.querySelector('#english-translation-section');
        let isDialogClosed = false;

        function closeDialog() {
          if (isDialogClosed) return;
          isDialogClosed = true;
          document.removeEventListener('keydown', escHandler);
          overlay.remove();
        }

        // "开始优化"按钮点击事件
        optimizeNowBtn.addEventListener('click', async () => {
          const currentPrompt = originalTextarea.value.trim();

          if (!currentPrompt) {
            flashStatus('原始提示词不能为空', 'danger');
            return;
          }

          // 禁用按钮，显示加载状态
          optimizeNowBtn.disabled = true;
          optimizeNowBtn.textContent = '优化中...';
          optimizedTextarea.placeholder = '正在优化中，请稍候...';

          try {
            // 调用API优化提示词
            const optimizedPrompt = await optimizePromptWithAI(currentPrompt);

            // 更新优化后的提示词
            optimizedTextarea.value = optimizedPrompt;
            optimizedTextarea.readOnly = false;
            optimizedTextarea.style.background = 'var(--card)';

            // 启用"使用优化后的"按钮
            useOptimizedBtn.disabled = false;

            // 恢复按钮状态
            optimizeNowBtn.disabled = false;
            optimizeNowBtn.textContent = '重新优化';

            flashStatus('优化完成', 'success');

            // 启用"翻译成英文"按钮
            const translateToEnglishBtn = overlay.querySelector('.translate-to-english-btn');
            if (translateToEnglishBtn) {
              translateToEnglishBtn.disabled = false;
            }

          } catch (error) {
            console.error('优化提示词失败:', error);
            optimizedTextarea.placeholder = '优化失败，请重试';
            flashStatus(error.message || '优化失败，请重试', 'danger');

            // 恢复按钮状态
            optimizeNowBtn.disabled = false;
            optimizeNowBtn.textContent = '开始优化';
          }
        });

        // "翻译成英文"按钮事件处理
        const translateToEnglishBtn = overlay.querySelector('.translate-to-english-btn');
        if (translateToEnglishBtn) {
          translateToEnglishBtn.addEventListener('click', async () => {
            const chineseValue = optimizedTextarea.value.trim();

            if (!chineseValue) {
              flashStatus('优化后的提示词为空，请先进行优化', 'danger');
              return;
            }

            // 禁用按钮并显示加载状态
            translateToEnglishBtn.disabled = true;
            translateToEnglishBtn.textContent = '翻译中...';

            try {
              const englishPrompt = await translatePromptToEnglish(chineseValue);

              // 更新英文翻译section
              englishTranslationSection.innerHTML = `
                <div class="prompt-compare-label">🌍 英文翻译版本</div>
                <textarea class="prompt-compare-text" rows="4" id="english-textarea">${escapeHtml(englishPrompt)}</textarea>
                <div style="margin-top: 8px; display: flex; gap: 8px; justify-content: flex-end;">
                  <button class="prompt-compare-btn prompt-compare-btn-primary use-english-btn">使用英文版本</button>
                </div>
              `;

              // 显示英文翻译区域
              englishTranslationSection.style.display = 'block';

              // 绑定使用英文版本按钮
              const useEnglishBtn = englishTranslationSection.querySelector('.use-english-btn');
              useEnglishBtn.addEventListener('click', () => {
                const englishTextarea = overlay.querySelector('#english-textarea');
                if (englishTextarea) {
                  const englishValue = englishTextarea.value.trim();
                  if (englishValue) {
                    promptInput.value = englishValue;
                    closeDialog();
                    flashStatus('已使用英文版本的提示词', 'success');
                  }
                }
              });

              // 恢复按钮状态
              translateToEnglishBtn.disabled = false;
              translateToEnglishBtn.textContent = '翻译成英文';

              flashStatus('翻译成功', 'success');
            } catch (error) {
              console.error('英文翻译失败:', error);

              // 恢复按钮状态
              translateToEnglishBtn.disabled = false;
              translateToEnglishBtn.textContent = '翻译成英文';

              flashStatus(`翻译失败: ${error.message}`, 'danger');
            }
          });
        }

        // 关闭按钮
        closeBtn.addEventListener('click', closeDialog);
        closeIconBtn.addEventListener('click', closeDialog);

        // 使用优化后的提示词（从textarea读取）
        useOptimizedBtn.addEventListener('click', () => {
          const optimizedValue = optimizedTextarea.value.trim();
          if (optimizedValue) {
            promptInput.value = optimizedValue;
            closeDialog();
            flashStatus('已使用优化后的提示词', 'success');
          }
        });

        // ESC键关闭
        const escHandler = (e) => {
          if (e.key === 'Escape') {
            closeDialog();
          }
        };
        document.addEventListener('keydown', escHandler);
      }

      // 显示分镜输入框
      function showStoryboardInput() {
        const overlay = document.createElement('div');
        overlay.className = 'storyboard-overlay';
        overlay.innerHTML = `
          <div class="storyboard-panel">
            <div class="storyboard-header">
              <h3>🎬 分镜脚本输入</h3>
              <button class="storyboard-close">✕</button>
            </div>
            <div class="storyboard-content">
              <div class="storyboard-input-area">
                <label>请粘贴分镜脚本：</label>
                <textarea class="storyboard-textarea" placeholder="例如：
严格执行：喷出的液体为透明色，且必须保证每个分镜都有擦拭和展示擦后干净的画面。全程第一视角。

分镜1：中景展示用户清洁充满油污的油烟机表面，喷洒后轻轻一擦即可去除污渍...
分镜2：中景展示用户清洁充满油污的锅底表面，喷洒后轻轻一擦即可去除污渍..."></textarea>
              </div>
            </div>
            <div class="storyboard-actions">
              <button class="storyboard-btn storyboard-btn-secondary close-btn">取消</button>
              <button class="storyboard-btn storyboard-btn-primary analyze-btn">识别分镜</button>
            </div>
          </div>
        `;

        document.body.appendChild(overlay);

        const textarea = overlay.querySelector('.storyboard-textarea');
        const closeBtn = overlay.querySelectorAll('.close-btn, .storyboard-close');
        const analyzeBtn = overlay.querySelector('.analyze-btn');

        // 关闭弹窗
        closeBtn.forEach(btn => {
          btn.addEventListener('click', () => overlay.remove());
        });

        // 点击遮罩层关闭
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) overlay.remove();
        });

        // 识别分镜
        analyzeBtn.addEventListener('click', async () => {
          const scriptText = textarea.value.trim();
          if (!scriptText) {
            alert('请输入分镜脚本');
            return;
          }

          // 显示加载状态
          analyzeBtn.disabled = true;
          analyzeBtn.textContent = '识别中...';

          try {
            const result = await analyzeStoryboard(scriptText);
            overlay.remove();
            showStoryboardPreview(result, scriptText);
          } catch (error) {
            alert('识别失败：' + error.message);
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = '识别分镜';
          }
        });

        textarea.focus();
      }

      // 显示分镜预览界面
      function showStoryboardPreview(result, scriptText) {
        const { globalRequirements, shots } = result;

        if (!shots || shots.length === 0) {
          alert('未识别到分镜，请检查脚本格式');
          return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'storyboard-overlay';

        let shotsHtml = '';
        shots.forEach(shot => {
          shotsHtml += `
            <div class="storyboard-shot-item">
              <span class="storyboard-shot-number">分镜${shot.index}：</span>
              <textarea class="storyboard-shot-desc" data-index="${shot.index}" rows="2">${shot.description}</textarea>
            </div>
          `;
        });

        overlay.innerHTML = `
          <div class="storyboard-panel">
            <div class="storyboard-header">
              <h3>🎬 分镜识别结果</h3>
              <button class="storyboard-close">✕</button>
            </div>
            <div class="storyboard-content">
              ${globalRequirements ? `
                <div class="storyboard-preview-section">
                  <div class="storyboard-section-title">全局要求：</div>
                  <textarea class="storyboard-global-req" rows="2">${globalRequirements}</textarea>
                </div>
              ` : ''}
              <div class="storyboard-preview-section">
                <div class="storyboard-section-title">识别到 ${shots.length} 个分镜：</div>
                <div class="storyboard-shots-list">
                  ${shotsHtml}
                </div>
              </div>
            </div>
            <div class="storyboard-actions">
              <button class="storyboard-btn storyboard-btn-secondary retry-btn">重新识别</button>
              <button class="storyboard-btn storyboard-btn-primary generate-btn">开始生成图片</button>
            </div>
          </div>
        `;

        document.body.appendChild(overlay);

        const closeBtn = overlay.querySelector('.storyboard-close');
        const retryBtn = overlay.querySelector('.retry-btn');
        const generateBtn = overlay.querySelector('.generate-btn');

        closeBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) overlay.remove();
        });

        retryBtn.addEventListener('click', () => {
          overlay.remove();
          showStoryboardInput();
        });

        generateBtn.addEventListener('click', () => {
          // 读取用户编辑后的全局要求
          const globalReqTextarea = overlay.querySelector('.storyboard-global-req');
          const updatedGlobalRequirements = globalReqTextarea ? globalReqTextarea.value.trim() : '';

          // 读取用户编辑后的分镜描述
          const textareas = overlay.querySelectorAll('.storyboard-shot-desc');
          const updatedShots = [];
          textareas.forEach(textarea => {
            const index = parseInt(textarea.dataset.index);
            const description = textarea.value.trim();
            if (description) {
              updatedShots.push({ index, description });
            }
          });

          if (updatedShots.length === 0) {
            alert('请至少保留一个分镜描述');
            return;
          }

          // 使用更新后的数据
          const updatedResult = {
            globalRequirements: updatedGlobalRequirements,
            shots: updatedShots
          };

          overlay.remove();
          generateStoryboardImages(updatedResult);
        });
      }

      // 生成单个分镜图片
      // 通用的生图API调用（分镜、多角度等都用这个）
      async function callImageAPI(prompt, images) {
        const key = getApiKey();
        if (!key) throw new Error('请先配置 API Key');

        const protocol = getProtocol();
        const imageModel = getImageModel();
        const imgs = getReferenceImagesForRequest((images || []).filter(img => img.dataUrl), protocol);
        let response;

        if (protocol === 'openai-images') {
          if (imgs.length > 0) {
            const editsRequest = await buildOpenAIImageEditsRequest(prompt, imgs, imageModel, key);
            debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', editsRequest.endpoint, 'hasImages:', true);
            response = await sendImageRequest(editsRequest, 'openai-images-edits');

            if (!response.ok) {
              const errorText = extractApiErrorMessage(response.data) || response.raw || `API 错误: ${response.status}`;
              console.error('[callImageAPI] error response:', response.raw);

              if (shouldRetryOpenAIImageWithRelay(response.status, errorText)) {
                const relayRequest = buildOpenAIImageRelayGenerationsRequest(prompt, imgs, imageModel, key);
                debugLog('[callImageAPI] retrying with relay generations endpoint');
                response = await sendImageRequest(relayRequest, 'openai-images-relay-generations');
              } else {
                throw new Error(errorText || `API 错误: ${response.status}`);
              }
            }
          } else {
            const payload = {
              model: imageModel,
              prompt
            };
            applyOpenAIImageOptions(payload, imageModel);
            const request = {
              endpoint: buildApiUrl('/v1/images/generations'),
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
              body: JSON.stringify(payload)
            };
            debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', false);
            response = await sendImageRequest(request, 'openai-images-generations');
          }
        } else if (protocol === 'openai-chat') {
          const payload = buildOpenAIChatImagePayload(prompt, imgs, imageModel);
          const request = {
            endpoint: getEndpoint(),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(payload)
          };
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          response = await sendImageRequest(request, 'openai-chat');
        } else {
          // Gemini 原生
          const payload = buildGeminiImagePayload(prompt, imgs);
          const request = {
            endpoint: getEndpoint(),
            headers: buildRequestHeaders(key, protocol),
            body: JSON.stringify(payload)
          };
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          response = await sendImageRequest(request, 'gemini');
        }

        if (!response.ok) {
          const errorText = extractApiErrorMessage(response.data) || response.raw || `API 错误: ${response.status}`;
          console.error('[callImageAPI] error response:', response.raw);
          throw new Error(errorText || `API 错误: ${response.status}`);
        }

        const apiErrorMessage = extractApiErrorMessage(response.data);
        if (apiErrorMessage) {
          console.error('[callImageAPI] error payload:', response.data);
          throw new Error(apiErrorMessage);
        }

        const result = extractResult(response.data);
        debugLog('[callImageAPI] extractResult:', { text: result.text?.slice(0,200), imageBase64: !!result.imageBase64, imageUrl: result.imageUrl });
        if (!result.imageBase64 && !result.imageUrl && !result.text) {
          throw new Error('接口未返回可用图片');
        }
        return result;
      }

      async function generateStoryboardShot(prompt) {
        return callImageAPI(prompt, getReferenceImagesForRequest());
      }

      // 批量生成分镜图片
      async function generateStoryboardImages(analysisResult) {
        const { globalRequirements, shots } = analysisResult;

        // 创建任务信息
        const taskId = ++taskIdCounter;
        const taskInfo = {
          taskId,
          scenario: {
            id: 'storyboard',
            label: '🎬 分镜生成',
            angles: shots.map(s => `分镜${s.index}`)
          }
        };

        // 创建分组容器
        const groupContainer = createResultGroup(taskInfo);
        resultsEl.insertBefore(groupContainer, resultsEl.firstChild);

        // 为每个分镜创建占位符
        const placeholders = [];
        shots.forEach((shot, index) => {
          const placeholderId = `storyboard-placeholder-${taskId}-${index}`;
          const card = createPlaceholderCard(`分镜${shot.index}`, placeholderId);
          const gridEl = groupContainer.querySelector('.result-group-grid');
          gridEl.appendChild(card);
          placeholders.push({ placeholderId, shot, index });
        });

        // 并发生成所有分镜（立即返回，后台继续生成）
        placeholders.forEach(async ({ placeholderId, shot, index }) => {
          if (index > 0) {
            await new Promise(r => setTimeout(r, 500));
          }

          try {
            const finalPrompt = globalRequirements
              ? `${globalRequirements}\n\n${shot.description}`
              : shot.description;

            const result = await generateStoryboardShot(finalPrompt);

            // 替换占位符
            const placeholderEl = document.getElementById(placeholderId);
            if (placeholderEl) {
              if (placeholderEl.dataset.intervalId) {
                clearInterval(parseInt(placeholderEl.dataset.intervalId));
              }
              const actualElapsedMs = placeholderEl.dataset.startTime
                ? (performance.now() - placeholderEl.dataset.startTime)
                : 0;
              placeholderEl.remove();
              await appendResultToGroup(groupContainer, result, `分镜${shot.index}`, actualElapsedMs, finalPrompt);
            }
          } catch (error) {
            console.error(`分镜${shot.index}生成失败:`, error);
            const placeholderEl = document.getElementById(placeholderId);
            if (placeholderEl) {
              if (placeholderEl.dataset.intervalId) {
                clearInterval(parseInt(placeholderEl.dataset.intervalId));
              }
              const elapsed = placeholderEl.dataset.startTime
                ? ((performance.now() - placeholderEl.dataset.startTime) / 1000).toFixed(1)
                : '0.0';
              const errorWrap = document.createElement('div');
              errorWrap.style.textAlign = 'center';
              errorWrap.style.color = 'var(--danger)';
              errorWrap.style.padding = '20px';

              const iconEl = document.createElement('div');
              iconEl.style.fontSize = '32px';
              iconEl.style.marginBottom = '8px';
              iconEl.textContent = '❌';

              const titleEl = document.createElement('div');
              titleEl.style.fontSize = '14px';
              titleEl.style.fontWeight = '600';
              titleEl.textContent = '生成失败';

              const detailEl = document.createElement('div');
              detailEl.style.fontSize = '12px';
              detailEl.style.marginTop = '4px';
              detailEl.style.color = 'var(--muted)';
              detailEl.textContent = error.message;

              const elapsedEl = document.createElement('div');
              elapsedEl.style.fontSize = '12px';
              elapsedEl.style.marginTop = '4px';
              elapsedEl.style.color = 'var(--muted)';
              elapsedEl.textContent = `耗时: ${elapsed}s`;

              errorWrap.appendChild(iconEl);
              errorWrap.appendChild(titleEl);
              errorWrap.appendChild(detailEl);
              errorWrap.appendChild(elapsedEl);

              placeholderEl.replaceChildren(errorWrap);
            }
          }
        });
      }

      // 创建加载中的占位符卡片
      function createLoadingPlaceholder(index) {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.minHeight = '300px';
        card.style.display = 'flex';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'center';

        // 记录开始时间
        card.dataset.startTime = performance.now();

        card.innerHTML = `
          <div style="text-align: center; color: var(--muted);">
            <div style="font-size: 48px; margin-bottom: 12px; animation: spin 2s linear infinite;">⏳</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--text);">生成中 #${index}</div>
            <div class="card-timer" style="font-size: 12px; margin-top: 4px; color: var(--accent);">0.0s</div>
          </div>
          <style>
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          </style>
        `;

        // 启动计时器，每100ms更新一次
        const timerEl = card.querySelector('.card-timer');
        const intervalId = setInterval(() => {
          const elapsed = ((performance.now() - card.dataset.startTime) / 1000).toFixed(1);
          timerEl.textContent = `${elapsed}s`;
        }, 100);

        // 保存计时器ID，以便后续清理
        card.dataset.intervalId = intervalId;

        return card;
      }

      // 在卡片中显示错误信息
      function showErrorInCard(card, errorMsg) {
        // 清理计时器
        if (card.dataset.intervalId) {
          clearInterval(parseInt(card.dataset.intervalId));
        }

        // 计算实际耗时
        const elapsed = card.dataset.startTime
          ? ((performance.now() - card.dataset.startTime) / 1000).toFixed(1)
          : '?';

        card.style.minHeight = '200px';

        const errorWrap = document.createElement('div');
        errorWrap.style.textAlign = 'center';
        errorWrap.style.color = 'var(--danger)';
        errorWrap.style.padding = '20px';

        const iconEl = document.createElement('div');
        iconEl.style.fontSize = '48px';
        iconEl.style.marginBottom = '12px';
        iconEl.textContent = '❌';

        const titleEl = document.createElement('div');
        titleEl.style.fontSize = '14px';
        titleEl.style.fontWeight = '600';
        titleEl.textContent = '生成失败';

        const detailEl = document.createElement('div');
        detailEl.style.fontSize = '12px';
        detailEl.style.marginTop = '8px';
        detailEl.style.color = 'var(--muted)';
        detailEl.textContent = errorMsg;

        const elapsedEl = document.createElement('div');
        elapsedEl.style.fontSize = '11px';
        elapsedEl.style.marginTop = '4px';
        elapsedEl.style.color = 'var(--muted)';
        elapsedEl.textContent = `耗时: ${elapsed}s`;

        errorWrap.appendChild(iconEl);
        errorWrap.appendChild(titleEl);
        errorWrap.appendChild(detailEl);
        errorWrap.appendChild(elapsedEl);

        card.replaceChildren(errorWrap);
      }

      // 替换占位符卡片为真实结果
      async function replaceCardWithResult(placeholderCard, result, meta) {
        // 清理计时器
        if (placeholderCard.dataset.intervalId) {
          clearInterval(parseInt(placeholderCard.dataset.intervalId));
        }

        // 计算卡片自己的实际耗时
        const actualElapsedMs = placeholderCard.dataset.startTime
          ? (performance.now() - placeholderCard.dataset.startTime)
          : (meta?.runtimeMs || 0);

        // 清空占位符内容
        placeholderCard.innerHTML = '';
        placeholderCard.style.minHeight = '';
        placeholderCard.style.display = '';
        placeholderCard.style.alignItems = '';
        placeholderCard.style.justifyContent = '';

        if (hasResultImage(result)) {
          const imgSrc = getResultImgSrc(result);
          const imgEl = document.createElement('img');
          imgEl.src = imgSrc;
          imgEl.className = 'zoomable';
          imgEl.title = '点击放大查看';
          imgEl.addEventListener('click', () => openLightbox(imgSrc));
          placeholderCard.appendChild(imgEl);

          // 操作按钮区域
          const actions = document.createElement('div');
          actions.className = 'actions';

          // 下载按钮
          const downloadLink = document.createElement('a');
          downloadLink.className = 'mini-btn';
          downloadLink.textContent = '下载图片';
          downloadLink.href = imgSrc;
          downloadLink.download = `gemini-${Date.now()}.${getExtensionFromMime(result.mime)}`;
          actions.appendChild(downloadLink);

          const saveAlbumBtn = document.createElement('button');
          saveAlbumBtn.className = 'mini-btn primary';
          saveAlbumBtn.textContent = isMobileDevice() ? '保存到相册' : '保存图片';
          saveAlbumBtn.addEventListener('click', () => handleSaveToAlbum(imgSrc, downloadLink.download));
          actions.appendChild(saveAlbumBtn);

          // 基于此图继续按钮
          const continueBtn = document.createElement('button');
          continueBtn.className = 'mini-btn primary';
          continueBtn.textContent = '🔄 基于此图继续';
          actions.appendChild(continueBtn);

          placeholderCard.appendChild(actions);

          // 继续生成面板
          const continuePanel = document.createElement('div');
          continuePanel.className = 'continue-panel';
          continuePanel.innerHTML = `
            <textarea placeholder="请输入修改提示词，例如：把背景换成海边、添加阳光效果..."></textarea>
            <div class="panel-actions">
              <button class="gen-btn">🚀 生成</button>
              <button class="cancel-btn">取消</button>
            </div>
          `;
          placeholderCard.appendChild(continuePanel);

          // 点击展开/收起面板
          continueBtn.addEventListener('click', () => {
            continuePanel.classList.toggle('show');
            if (continuePanel.classList.contains('show')) {
              continuePanel.querySelector('textarea').focus();
            }
          });

          // 取消按钮
          continuePanel.querySelector('.cancel-btn').addEventListener('click', () => {
            continuePanel.classList.remove('show');
          });

          // 生成按钮
          continuePanel.querySelector('.gen-btn').addEventListener('click', async () => {
            const newPrompt = continuePanel.querySelector('textarea').value.trim();
            if (!newPrompt) {
              flashStatus('请输入修改提示词', 'danger');
              return;
            }
            await generateFromImage(imgSrc, newPrompt, continuePanel.querySelector('.gen-btn'));
            continuePanel.classList.remove('show');
          });

          // 自动保存历史记录和下载图片
          try {
            const persistentImgSrc = await getPersistentImageSource(imgSrc);
            const thumbnail = await createThumbnail(persistentImgSrc);
            const mimeType = persistentImgSrc.match(/data:([^;]+);/)?.[1] || 'unknown';

            const fileExt = getExtensionFromMime(mimeType);
            const filename = `gemini-${Date.now()}.${fileExt}`;

            const historyRecord = {
              thumbnail,
              filename,
              prompt: meta?.prompt || '',
              aspect: meta?.aspect || '',
              resolution: meta?.resolution || '',
              quality: meta?.quality || '',
              model: meta?.model || '',
              protocol: meta?.protocol || '',
              timestamp: Date.now(),
              runtimeMs: meta?.runtimeMs || 0
            };
            if (shouldSaveHistoryOriginal()) historyRecord.imageSrc = persistentImgSrc;
            await saveHistory(historyRecord);
            await renderHistory();
            const saveResult = await saveImageFile(persistentImgSrc, filename);
            const feedback = getSaveImageResultMessage(saveResult);
            flashStatus(feedback.text, feedback.type);
            debugLog('图片历史记录已保存:', filename, saveResult);
          } catch (err) {
            console.error('保存历史记录或图片失败:', err);
          }
        }
      }

      async function appendResult(result, meta) {
        const card = document.createElement('div');
        card.className = 'card';
        if (hasResultImage(result)) {
          const imgSrc = getResultImgSrc(result);
          const imgEl = document.createElement('img');
          imgEl.src = imgSrc;
          imgEl.className = 'zoomable';
          imgEl.title = '点击放大查看';
          imgEl.addEventListener('click', () => openLightbox(imgSrc));
          card.appendChild(imgEl);

          // 操作按钮区域
          const actions = document.createElement('div');
          actions.className = 'actions';

          // 下载按钮
          const downloadLink = document.createElement('a');
          downloadLink.className = 'mini-btn';
          downloadLink.textContent = '下载图片';
          downloadLink.href = imgSrc;
          downloadLink.download = `gemini-${Date.now()}.${getExtensionFromMime(result.mime)}`;
          actions.appendChild(downloadLink);

          const saveAlbumBtn = document.createElement('button');
          saveAlbumBtn.className = 'mini-btn primary';
          saveAlbumBtn.textContent = isMobileDevice() ? '保存到相册' : '保存图片';
          saveAlbumBtn.addEventListener('click', () => handleSaveToAlbum(imgSrc, downloadLink.download));
          actions.appendChild(saveAlbumBtn);

          // 基于此图继续按钮
          const continueBtn = document.createElement('button');
          continueBtn.className = 'mini-btn primary';
          continueBtn.textContent = '🔄 基于此图继续';
          actions.appendChild(continueBtn);

          card.appendChild(actions);

          // 继续生成面板（默认隐藏）
          const continuePanel = document.createElement('div');
          continuePanel.className = 'continue-panel';
          continuePanel.innerHTML = `
            <textarea placeholder="请输入修改提示词，例如：把背景换成海边、添加阳光效果..."></textarea>
            <div class="panel-actions">
              <button class="gen-btn">🚀 生成</button>
              <button class="cancel-btn">取消</button>
            </div>
          `;
          card.appendChild(continuePanel);

          // 点击展开/收起面板
          continueBtn.addEventListener('click', () => {
            continuePanel.classList.toggle('show');
            if (continuePanel.classList.contains('show')) {
              continuePanel.querySelector('textarea').focus();
            }
          });

          // 取消按钮
          continuePanel.querySelector('.cancel-btn').addEventListener('click', () => {
            continuePanel.classList.remove('show');
          });

          // 生成按钮
          continuePanel.querySelector('.gen-btn').addEventListener('click', async () => {
            const newPrompt = continuePanel.querySelector('textarea').value.trim();
            if (!newPrompt) {
              flashStatus('请输入修改提示词', 'danger');
              return;
            }
            await generateFromImage(imgSrc, newPrompt, continuePanel.querySelector('.gen-btn'));
            continuePanel.classList.remove('show');
          });

          // === 自动保存历史记录和下载图片 ===
          try {
            const persistentImgSrc = await getPersistentImageSource(imgSrc);

            // 生成缩略图
            const thumbnail = await createThumbnail(persistentImgSrc);

            // 获取图片实际尺寸和详细信息
            const imgInfo = await getImageInfo(persistentImgSrc);
            const base64Size = persistentImgSrc.length;
            const fileSize = Math.round(base64Size * 0.75); // base64 转实际字节数
            const mimeType = persistentImgSrc.match(/data:([^;]+);/)?.[1] || 'unknown';

            debugLog('========== 图片详细信息 ==========');
            debugLog(`分辨率: ${imgInfo.width}×${imgInfo.height} (${(imgInfo.width * imgInfo.height / 1000000).toFixed(2)}M像素)`);
            debugLog(`MIME类型: ${mimeType}`);
            debugLog(`Base64长度: ${base64Size.toLocaleString()} 字符`);
            debugLog(`实际文件大小: ${(fileSize / 1024 / 1024).toFixed(2)}MB (${fileSize.toLocaleString()} 字节)`);
            debugLog(`平均每像素: ${(fileSize / (imgInfo.width * imgInfo.height)).toFixed(2)} 字节`);
            debugLog('===================================');

            // 根据API返回的MIME类型生成文件名
            const fileExt = getExtensionFromMime(mimeType);
            const filename = `gemini-${Date.now()}.${fileExt}`;

            // 保存到历史记录（包含文件名）
            const historyRecord = {
              thumbnail,
              filename,
              prompt: meta?.prompt || '',
              aspect: meta?.aspect || '',
              resolution: meta?.resolution || '',
              quality: meta?.quality || '',
              model: meta?.model || '',
              protocol: meta?.protocol || '',
              timestamp: Date.now(),
              runtimeMs: meta?.runtimeMs || 0
            };
            if (shouldSaveHistoryOriginal()) historyRecord.imageSrc = persistentImgSrc;
            await saveHistory(historyRecord);

            // 刷新历史记录显示
            await renderHistory();

            const saveResult = await saveImageFile(persistentImgSrc, filename);
            const feedback = getSaveImageResultMessage(saveResult);
            flashStatus(feedback.text, feedback.type);
            debugLog('图片历史记录已保存:', filename, saveResult);
          } catch (err) {
            console.error('保存历史记录或图片失败:', err);
          }
        }
        resultsEl.prepend(card);
        resultCountEl.textContent = `${resultsEl.children.length} 条`;
      }

      // 基于图片继续生成
      async function generateFromImage(imageSrc, prompt, btn) {
        const key = getApiKey();
        if (!key) {
          flashStatus('需要 API Key', 'danger');
          return;
        }

        const originalText = btn.textContent;
        btn.disabled = true;
        const startTime = performance.now();

        const timingInterval = setInterval(() => {
          const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
          btn.textContent = `生成中... ${elapsed}s`;
        }, 100);

        flashStatus('基于图片生成中...', '');

        try {
          const referenceSrc = await getPersistentImageSource(imageSrc);
          const mimeType = referenceSrc.match(/data:([^;]+);/)?.[1] || 'image/png';
          const refImage = { dataUrl: referenceSrc, mime: mimeType };
          const result = await callImageAPI(prompt, [refImage]);
          if (!hasResultImage(result)) {
            throw new Error(result.text || '未返回图片，请调整提示词后重试');
          }
          const elapsed = performance.now() - startTime;
          appendResult(result, getCurrentGenerationParams({
            prompt,
            runtimeMs: elapsed
          }));
          flashStatus(`基于图片生成完成！耗时 ${(elapsed / 1000).toFixed(2)}s`, 'success');
        } catch (err) {
          console.error('基于图片生成失败:', err);
          const errorMsg = parseApiError(err.message);
          const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
          flashStatus(`生成失败 (${elapsed}s): ${errorMsg}`, 'danger');
        } finally {
          clearInterval(timingInterval);
          btn.disabled = false;
          btn.textContent = originalText;
        }
      }

      function clearResults() {
        resultsEl.innerHTML = '';
        resultCountEl.textContent = '0 条';
        flashStatus('已清空结果', 'success');
      }

      async function handleRun() {
        const key = getApiKey();
        const headerName = 'Authorization';
        const prefix = 'Bearer ';
        const prompt = promptInput.value.trim();
        const count = Math.max(1, Math.min(10, parseInt(countInput.value, 10) || 1));
        if (!key) return flashStatus('需要 API Key', 'danger');
        if (!prompt) return flashStatus('提示词必填', 'danger');

        const headers = { 'Content-Type': 'application/json' };
        headers[headerName] = `${prefix || ''}${key}`;

        // 不禁用按钮，允许并行生成
        // runBtn.disabled = true;
        const startedAtAll = performance.now();
        let completed = 0;
        let failed = 0;
        let lastErrorMsg = ''; // 保存最后一个错误信息

        function updateRunProgress() {
          const finished = completed + failed;
          let statusText = `生成中... 已完成 ${finished}/${count}`;
          if (failed > 0) {
            statusText += `，失败 ${failed}`;
          }
          flashStatus(statusText, failed > 0 ? 'danger' : undefined);
        }

        // 显示简单的进度提示（不显示时间）
        updateRunProgress();

        // 单个请求的处理函数
        async function generateOne(index, placeholderCard) {
          const startedAt = performance.now();

          try {
            const result = await callImageAPI(prompt, getReferenceImagesForRequest());
            const durationMs = performance.now() - startedAt;

            // 替换占位符为真实结果
            await replaceCardWithResult(placeholderCard, result, getCurrentGenerationParams({
              prompt,
              runtimeMs: durationMs
            }));
            completed++;
            updateRunProgress();
          } catch (err) {
            console.error(`请求 #${index + 1} 失败:`, err);
            failed++;
            lastErrorMsg = parseApiError(err.message);
            showErrorInCard(placeholderCard, parseApiError(err.message));
            updateRunProgress();
          }
        }

        // 按频率发送所有请求（并发执行，但启动间隔 500ms，即每秒 2 次）
        const promises = [];
        for (let i = 0; i < count; i++) {
          // 立即创建占位符卡片
          const placeholderCard = createLoadingPlaceholder(i + 1);
          resultsEl.insertBefore(placeholderCard, resultsEl.firstChild);
          resultCountEl.textContent = `${resultsEl.children.length} 条`;

          if (i > 0) {
            await new Promise(r => setTimeout(r, 500));
          }
          promises.push(generateOne(i, placeholderCard));
        }
        await Promise.all(promises);

        // 显示完成状态（不显示总时间）
        if (failed === 0) {
          flashStatus(`完成 ${completed} 张`, 'success');
        } else {
          // 显示失败原因的中文提示
          flashStatus(`失败 ${failed} 张: ${lastErrorMsg}`, 'danger');
        }
        // 不需要重新启用按钮，因为从未禁用
        // runBtn.disabled = false;
      }

      // ========== 自定义角度功能 ==========

      // 角度转提示词
      function angleToPrompt(azimuth, pitch, zoom) {
        // 方位角描述（0-360度）
        let azimuthDesc = '';
        if (azimuth >= 0 && azimuth < 30) azimuthDesc = '正面';
        else if (azimuth >= 30 && azimuth < 60) azimuthDesc = '右前方';
        else if (azimuth >= 60 && azimuth < 120) azimuthDesc = '右侧';
        else if (azimuth >= 120 && azimuth < 150) azimuthDesc = '右后方';
        else if (azimuth >= 150 && azimuth < 210) azimuthDesc = '背面';
        else if (azimuth >= 210 && azimuth < 240) azimuthDesc = '左后方';
        else if (azimuth >= 240 && azimuth < 300) azimuthDesc = '左侧';
        else if (azimuth >= 300 && azimuth < 330) azimuthDesc = '左前方';
        else azimuthDesc = '正面';

        // 俯仰角描述（-90到90度）
        let pitchDesc = '';
        if (pitch >= -90 && pitch < -45) pitchDesc = '从下方仰视';
        else if (pitch >= -45 && pitch < -15) pitchDesc = '从稍低角度';
        else if (pitch >= -15 && pitch <= 15) pitchDesc = '平视';
        else if (pitch > 15 && pitch <= 45) pitchDesc = '从稍高角度俯视';
        else if (pitch > 45 && pitch <= 90) pitchDesc = '从正上方俯视';

        // 缩放描述
        let zoomDesc = '';
        if (zoom < 0.8) zoomDesc = '远景';
        else if (zoom >= 0.8 && zoom < 1.2) zoomDesc = '中景';
        else if (zoom >= 1.2 && zoom < 2.0) zoomDesc = '近景';
        else zoomDesc = '特写';

        return `${azimuthDesc}${pitchDesc}拍摄产品，${zoomDesc}镜头，专业产品摄影，高质量，细节丰富`;
      }

      // ========== 3D场景相关变量 ==========
      let angleScene = null;
      let angleCamera = null;
      let angleRenderer = null;
      let angleControls = null;
      let angleAnimationId = null;
      let referenceImageMesh = null;
      let cameraIconMesh = null;
      let cameraDirectionLine = null;

      // 初始化3D场景
      function init3DScene() {
        if (!window.THREE?.OrbitControls) {
          throw new Error('Three.js not ready');
        }

        const canvas = document.getElementById('angle-canvas');
        if (!canvas) return;

        // 创建场景
        angleScene = new THREE.Scene();
        angleScene.background = new THREE.Color(0x0a0f1e);

        // 创建相机
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        angleCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        angleCamera.position.set(0, 5, 10);
        angleCamera.lookAt(0, 0, 0);

        // 创建渲染器
        angleRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        angleRenderer.setSize(width, height);
        angleRenderer.setPixelRatio(window.devicePixelRatio);

        // 创建轨道控制器
        angleControls = new THREE.OrbitControls(angleCamera, canvas);
        angleControls.enableDamping = true;
        angleControls.dampingFactor = 0.05;
        angleControls.minDistance = 5;
        angleControls.maxDistance = 20;

        // 创建3D对象
        create3DObjects();

        // 启动渲染循环
        animate3DScene();

        // 监听窗口大小变化
        window.addEventListener('resize', onWindowResize);
      }

      // 创建3D对象
      function create3DObjects() {
        // 创建水平圆环（青色）
        const horizontalRingGeometry = new THREE.TorusGeometry(3, 0.02, 16, 100);
        const horizontalRingMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
        const horizontalRing = new THREE.Mesh(horizontalRingGeometry, horizontalRingMaterial);
        horizontalRing.rotation.x = Math.PI / 2;
        angleScene.add(horizontalRing);

        // 创建垂直椭圆轨道（灰白色）
        const verticalEllipseCurve = new THREE.EllipseCurve(
          0, 0,           // 中心点
          3, 4,           // x半径, y半径
          0, 2 * Math.PI, // 起始角度, 结束角度
          false,          // 顺时针
          0               // 旋转角度
        );
        const verticalEllipsePoints = verticalEllipseCurve.getPoints(100);
        const verticalEllipseGeometry = new THREE.BufferGeometry().setFromPoints(verticalEllipsePoints);
        const verticalEllipseMaterial = new THREE.LineBasicMaterial({ color: 0x94a3b8 });
        const verticalEllipse = new THREE.Line(verticalEllipseGeometry, verticalEllipseMaterial);
        verticalEllipse.rotation.y = Math.PI / 2;
        angleScene.add(verticalEllipse);

        // 创建参考图片平面
        createReferenceImagePlane();

        // 创建相机图标
        createCameraIcon();

        // 创建相机方向指示线（从相机指向图片中心）
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0, 0)
        ]);
        const lineMaterial = new THREE.LineBasicMaterial({
          color: 0xffd700,  // 金黄色
          linewidth: 2,
          opacity: 0.8,
          transparent: true
        });
        cameraDirectionLine = new THREE.Line(lineGeometry, lineMaterial);
        angleScene.add(cameraDirectionLine);

        // 添加环境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        angleScene.add(ambientLight);

        // 添加方向光
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
        directionalLight.position.set(5, 5, 5);
        angleScene.add(directionalLight);
      }

      // 创建参考图片平面
      function createReferenceImagePlane() {
        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9
        });
        referenceImageMesh = new THREE.Mesh(geometry, material);
        referenceImageMesh.position.set(0, 0, 0);
        angleScene.add(referenceImageMesh);
      }

      // 创建相机图标
      function createCameraIcon() {
        const group = new THREE.Group();

        // 相机主体（更大的立方体，黑色）
        const bodyGeometry = new THREE.BoxGeometry(0.5, 0.6, 0.8);
        const bodyMaterial = new THREE.MeshPhongMaterial({
          color: 0x2d3748,
          shininess: 30
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        group.add(body);

        // 镜头主体（更大的圆柱体，深灰色）- 朝向-Z方向
        const lensBodyGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.4, 32);
        const lensBodyMaterial = new THREE.MeshPhongMaterial({
          color: 0x1a202c,
          shininess: 50
        });
        const lensBody = new THREE.Mesh(lensBodyGeometry, lensBodyMaterial);
        lensBody.rotation.x = Math.PI / 2;
        lensBody.position.set(0, 0, 0.45);
        group.add(lensBody);

        // 镜头外环（银色，更突出）
        const lensRingGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.05, 32);
        const lensRingMaterial = new THREE.MeshPhongMaterial({
          color: 0x718096,
          shininess: 80,
          metalness: 0.5
        });
        const lensRing = new THREE.Mesh(lensRingGeometry, lensRingMaterial);
        lensRing.rotation.x = Math.PI / 2;
        lensRing.position.set(0, 0, 0.65);
        group.add(lensRing);

        // 镜头玻璃（深蓝色，半透明）
        const lensGlassGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.05, 32);
        const lensGlassMaterial = new THREE.MeshPhongMaterial({
          color: 0x1e3a8a,
          shininess: 100,
          transparent: true,
          opacity: 0.8
        });
        const lensGlass = new THREE.Mesh(lensGlassGeometry, lensGlassMaterial);
        lensGlass.rotation.x = Math.PI / 2;
        lensGlass.position.set(0, 0, 0.68);
        group.add(lensGlass);

        // 取景器（顶部的小突起）
        const viewfinderGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.25);
        const viewfinderMaterial = new THREE.MeshPhongMaterial({
          color: 0x1a202c,
          shininess: 30
        });
        const viewfinder = new THREE.Mesh(viewfinderGeometry, viewfinderMaterial);
        viewfinder.position.set(0, 0.4, -0.15);
        group.add(viewfinder);

        // 闪光灯（顶部的小方块，青色发光）
        const flashGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.15);
        const flashMaterial = new THREE.MeshPhongMaterial({
          color: 0x22d3ee,
          emissive: 0x22d3ee,
          emissiveIntensity: 0.5,
          shininess: 100
        });
        const flash = new THREE.Mesh(flashGeometry, flashMaterial);
        flash.position.set(0, 0.35, 0.2);
        group.add(flash);

        // 握把（底部的突起）
        const gripGeometry = new THREE.BoxGeometry(0.4, 0.5, 0.3);
        const gripMaterial = new THREE.MeshPhongMaterial({
          color: 0x374151,
          shininess: 20
        });
        const grip = new THREE.Mesh(gripGeometry, gripMaterial);
        grip.position.set(0, -0.1, -0.45);
        group.add(grip);

        // 快门按钮（顶部的小圆柱）
        const shutterGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.08, 16);
        const shutterMaterial = new THREE.MeshPhongMaterial({
          color: 0xef4444,
          shininess: 80
        });
        const shutter = new THREE.Mesh(shutterGeometry, shutterMaterial);
        shutter.position.set(0.15, 0.35, -0.3);
        group.add(shutter);

        cameraIconMesh = group;
        angleScene.add(cameraIconMesh);
      }

      // 渲染循环
      function animate3DScene() {
        if (!angleRenderer || !angleScene || !angleCamera) return;

        angleAnimationId = requestAnimationFrame(animate3DScene);

        if (angleControls) {
          angleControls.update();
        }

        angleRenderer.render(angleScene, angleCamera);
      }

      // 窗口大小变化处理
      function onWindowResize() {
        if (!angleCamera || !angleRenderer) return;

        const canvas = document.getElementById('angle-canvas');
        if (!canvas) return;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        angleCamera.aspect = width / height;
        angleCamera.updateProjectionMatrix();
        angleRenderer.setSize(width, height);
      }

      // 根据滑块值更新3D视图
      function update3DView(azimuth, pitch, zoom) {
        if (!cameraIconMesh || !referenceImageMesh) return;

        // 将角度转换为弧度
        const azimuthRad = (azimuth * Math.PI) / 180;
        const pitchRad = (pitch * Math.PI) / 180;

        // 计算相机图标的位置（在椭圆轨道上）
        const radius = 3;
        const x = radius * Math.cos(azimuthRad) * Math.cos(pitchRad);
        const y = radius * Math.sin(pitchRad);
        const z = radius * Math.sin(azimuthRad) * Math.cos(pitchRad);

        cameraIconMesh.position.set(x, y, z);

        // 让相机图标朝向参考图片
        cameraIconMesh.lookAt(0, 0, 0);

        // 更新相机方向指示线（从相机位置指向图片中心）
        if (cameraDirectionLine) {
          const positions = cameraDirectionLine.geometry.attributes.position.array;
          positions[0] = x;
          positions[1] = y;
          positions[2] = z;
          positions[3] = 0;
          positions[4] = 0;
          positions[5] = 0;
          cameraDirectionLine.geometry.attributes.position.needsUpdate = true;
        }

        // 更新参考图片的缩放
        const scale = zoom;
        referenceImageMesh.scale.set(scale, scale, scale);
      }

      // 清理3D场景
      function dispose3DScene() {
        if (angleAnimationId) {
          cancelAnimationFrame(angleAnimationId);
          angleAnimationId = null;
        }

        if (angleRenderer) {
          angleRenderer.dispose();
          angleRenderer = null;
        }

        if (angleControls) {
          angleControls.dispose();
          angleControls = null;
        }

        angleScene = null;
        angleCamera = null;
        referenceImageMesh = null;
        cameraIconMesh = null;
        cameraDirectionLine = null;

        window.removeEventListener('resize', onWindowResize);
      }

      // 加载参考图片到3D场景
      function loadReferenceImage(file) {
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            // 更新左侧预览
            const referenceImageContainer = document.getElementById('angle-reference-image');
            if (referenceImageContainer) {
              referenceImageContainer.innerHTML = `
                <img src="${e.target.result}" alt="参考图片">
                <button class="angle-reference-close" onclick="clearReferenceImage()">✕</button>
              `;
            }

            // 更新3D场景中的纹理
            if (referenceImageMesh) {
              const texture = new THREE.TextureLoader().load(e.target.result);
              referenceImageMesh.material.map = texture;
              referenceImageMesh.material.needsUpdate = true;

              // 根据图片比例调整平面尺寸
              const aspect = img.width / img.height;
              if (aspect > 1) {
                referenceImageMesh.scale.set(aspect, 1, 1);
              } else {
                referenceImageMesh.scale.set(1, 1 / aspect, 1);
              }
            }
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      }

      // 从 dataUrl 加载参考图片到3D场景
      function loadReferenceImageFromDataUrl(dataUrl) {
        if (!dataUrl) return;

        const img = new Image();
        img.onload = () => {
          // 更新左侧预览（不显示关闭按钮，因为是自动加载的）
          const referenceImageContainer = document.getElementById('angle-reference-image');
          if (referenceImageContainer) {
            referenceImageContainer.innerHTML = `
              <img src="${dataUrl}" alt="参考图片">
            `;
          }

          // 更新3D场景中的纹理
          if (referenceImageMesh) {
            const texture = new THREE.TextureLoader().load(dataUrl);
            referenceImageMesh.material.map = texture;
            referenceImageMesh.material.needsUpdate = true;

            // 根据图片比例调整平面尺寸
            const aspect = img.width / img.height;
            if (aspect > 1) {
              referenceImageMesh.scale.set(aspect, 1, 1);
            } else {
              referenceImageMesh.scale.set(1, 1 / aspect, 1);
            }
          }
        };
        img.src = dataUrl;
      }

      // 清除参考图片
      function clearReferenceImage() {
        const referenceImageContainer = document.getElementById('angle-reference-image');
        if (referenceImageContainer) {
          referenceImageContainer.innerHTML = '<div class="angle-reference-placeholder">未选择参考图片</div>';
        }

        // 清除3D场景中的纹理
        if (referenceImageMesh) {
          referenceImageMesh.material.map = null;
          referenceImageMesh.material.needsUpdate = true;
          referenceImageMesh.scale.set(1, 1, 1);
        }
      }

      // 暴露到全局作用域，供HTML onclick使用
      window.clearReferenceImage = clearReferenceImage;

      // 更新角度预览
      function updateAnglePreview() {
        const azimuth = parseInt(document.getElementById('azimuth-slider').value);
        const pitch = parseInt(document.getElementById('pitch-slider').value);
        const zoom = parseFloat(document.getElementById('zoom-slider').value);

        // 更新显示值
        document.getElementById('azimuth-value').textContent = `${azimuth}°`;
        document.getElementById('pitch-value').textContent = `${pitch}°`;
        document.getElementById('zoom-value').textContent = `${zoom.toFixed(1)}x`;

        // 更新3D视图
        update3DView(azimuth, pitch, zoom);
      }

      // 打开角度调整弹窗
      async function openAngleModal() {
        // 检查是否有参考图
        if (!state.images || state.images.length === 0) {
          alert('⚠️ 请先上传参考图\n\n请在主界面上传产品图片后再使用此功能。');
          return;
        }

        try {
          flashStatus('Loading 3D angle tool...', 'info');
          await ensureThreeJsReady();
        } catch (error) {
          console.error('Three.js load failed:', error);
          flashStatus('Failed to load 3D angle tool', 'danger');
          return;
        }

        const modal = document.getElementById('angle-modal');
        if (modal) {
          modal.classList.add('active');

          // 延迟初始化3D场景，等待DOM渲染完成
          setTimeout(() => {
            init3DScene();
            // 自动加载主界面的第一张参考图
            loadReferenceImageFromDataUrl(state.images[0].dataUrl);
            updateAnglePreview(); // 初始化预览
          }, 100);
        }
      }

      // 关闭角度调整弹窗
      function closeAngleModal() {
        const modal = document.getElementById('angle-modal');
        if (modal) {
          modal.classList.remove('active');

          // 清理3D场景
          dispose3DScene();
        }
      }

      // 处理快捷按钮点击
      async function handlePresetClick(scenario) {
        // 如果是分镜生成，直接使用外面的提示词
        if (scenario.isStoryboard) {
          const scriptText = promptInput.value.trim();
          if (!scriptText) {
            alert('请先在提示词输入框中输入分镜脚本');
            return;
          }

          // 显示加载状态
          flashStatus('正在识别分镜...', 'info');

          try {
            const result = await analyzeStoryboard(scriptText);
            showStoryboardPreview(result, scriptText);
          } catch (error) {
            flashStatus('识别失败：' + error.message, 'danger');
          }
          return;
        }

        // 检查是否需要参考图
        if (scenario.requiresReference) {
          const hasReference = state.images.length > 0;
          if (!hasReference) {
            alert('⚠️ 此场景需要参考图\n\n请先上传参考图或生成一张满意的产品图，然后再使用此功能。');
            return;
          }
        }

        // 确认生成
        const confirmed = confirm(
          `${scenario.label}\n\n` +
          `将基于当前参考图生成 ${scenario.prompts.length} 张图片。\n\n` +
          `⚠️ 提示：AI生成的多角度图可能存在细节差异，建议多次生成选择最佳效果。\n\n` +
          `是否继续？`
        );

        if (!confirmed) return;

        // 创建任务
        const taskId = ++taskIdCounter;
        const taskInfo = {
          id: taskId,
          scenario: scenario,
          startTime: Date.now(),
          completed: 0,
          total: scenario.prompts.length,
          results: []
        };

        activeTasks.set(taskId, taskInfo);

        // 开始生成
        await generateMultiAngle(taskInfo);
      }

      // 多角度生成核心函数
      async function generateMultiAngle(taskInfo) {
        const { scenario, id: taskId } = taskInfo;

        // 创建结果分组容器
        const groupContainer = createResultGroup(taskInfo);
        resultsEl.insertBefore(groupContainer, resultsEl.firstChild);

        // 创建占位符卡片
        const gridEl = groupContainer.querySelector('.result-group-grid');
        const placeholders = scenario.angles.map((angleName, index) => {
          const placeholder = createPlaceholderCard(angleName, `placeholder-${taskId}-${index}`);
          gridEl.appendChild(placeholder);
          return { element: placeholder, id: `placeholder-${taskId}-${index}` };
        });

        // 获取当前参考图
        const currentReferenceImages = [...state.images];

        // 并发生成所有角度
        const promises = scenario.prompts.map(async (promptTemplate, index) => {
          try {
            // 延迟启动（避免API限流）
            if (index > 0) {
              await new Promise(r => setTimeout(r, 500 * index));
            }

            // 更新进度
            updateTaskProgress(taskId, `正在生成 ${scenario.angles[index]}...`);

            // 调用图生图API
            const result = await generateWithReference(
              promptTemplate,
              currentReferenceImages,
              scenario.angles[index]
            );

            // 保存结果
            taskInfo.results.push(result);
            taskInfo.completed++;

            // 替换占位符为实际结果
            const placeholderId = `placeholder-${taskId}-${index}`;
            const placeholderEl = document.getElementById(placeholderId);
            let actualElapsedMs = 0;

            if (placeholderEl) {
              // 清理计时器
              if (placeholderEl.dataset.intervalId) {
                clearInterval(parseInt(placeholderEl.dataset.intervalId));
              }

              // 计算实际耗时
              if (placeholderEl.dataset.startTime) {
                actualElapsedMs = performance.now() - placeholderEl.dataset.startTime;
              }

              placeholderEl.remove();
            }

            // 显示结果（传递实际耗时）
            appendResultToGroup(groupContainer, result, scenario.angles[index], actualElapsedMs);

            // 更新进度
            updateTaskProgress(taskId, `已完成 ${taskInfo.completed}/${taskInfo.total}`);

            return result;
          } catch (error) {
            console.error(`生成 ${scenario.angles[index]} 失败:`, error);
            taskInfo.completed++;
            return null;
          }
        });

        // 等待所有生成完成
        await Promise.all(promises);

        // 任务完成
        const elapsed = ((Date.now() - taskInfo.startTime) / 1000).toFixed(1);
        updateTaskProgress(taskId, `✅ 全部完成！耗时 ${elapsed}s`);

        // 3秒后移除任务
        setTimeout(() => {
          activeTasks.delete(taskId);
        }, 3000);
      }

      // 图生图API调用
      async function generateWithReference(promptTemplate, referenceImages, angleName) {
        return callImageAPI(promptTemplate, referenceImages);
      }

      // 创建结果分组容器
      function createResultGroup(taskInfo) {
        const { scenario, id: taskId } = taskInfo;

        const group = document.createElement('div');
        group.className = 'result-group';
        group.id = `task-group-${taskId}`;

        group.innerHTML = `
          <div class="result-group-header">
            <div class="result-group-title">${scenario.label}</div>
            <div class="result-group-meta">
              <span id="task-progress-${taskId}">准备中...</span>
            </div>
          </div>
          <div class="result-group-grid" id="task-grid-${taskId}"></div>
        `;

        return group;
      }

      // 更新任务进度
      function updateTaskProgress(taskId, message) {
        const progressEl = document.getElementById(`task-progress-${taskId}`);
        if (progressEl) {
          progressEl.textContent = message;
        }
      }

      // 创建占位符卡片
      function createPlaceholderCard(angleName, placeholderId) {
        const card = document.createElement('div');
        card.className = 'card';
        card.id = placeholderId;
        card.style.minHeight = '300px';
        card.style.display = 'flex';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'center';
        card.style.background = 'var(--card)';
        card.style.border = '2px dashed var(--border)';

        // 记录开始时间
        card.dataset.startTime = performance.now();

        card.innerHTML = `
          <div style="text-align: center; color: var(--muted);">
            <div style="font-size: 48px; margin-bottom: 12px; animation: spin 2s linear infinite;">⏳</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--text);">${angleName}</div>
            <div class="card-timer" style="font-size: 12px; margin-top: 4px; color: var(--accent);">0.0s</div>
          </div>
          <style>
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          </style>
        `;

        // 启动计时器，每100ms更新一次
        const timerEl = card.querySelector('.card-timer');
        const intervalId = setInterval(() => {
          const elapsed = ((performance.now() - card.dataset.startTime) / 1000).toFixed(1);
          timerEl.textContent = `${elapsed}s`;
        }, 100);

        // 保存计时器ID，以便后续清理
        card.dataset.intervalId = intervalId;

        return card;
      }

      // 添加结果到分组
      async function appendResultToGroup(groupContainer, result, angleName, actualElapsedMs, retryPrompt) {
        const gridEl = groupContainer.querySelector('.result-group-grid');
        if (!gridEl || !result || !hasResultImage(result)) return;

        const card = document.createElement('div');
        card.className = 'card';

        const imgSrc = getResultImgSrc(result);

        const imgEl = document.createElement('img');
        imgEl.src = imgSrc;
        imgEl.className = 'zoomable';
        imgEl.title = '点击放大查看';
        imgEl.addEventListener('click', () => openLightbox(imgSrc));
        card.appendChild(imgEl);

        // 操作按钮
        const actions = document.createElement('div');
        actions.className = 'actions';

        // 角度标签
        const angleLabel = document.createElement('span');
        angleLabel.className = 'time-label';
        angleLabel.textContent = angleName;
        actions.appendChild(angleLabel);

        // 下载按钮
        const downloadLink = document.createElement('a');
        downloadLink.className = 'mini-btn';
        downloadLink.textContent = '下载';
        downloadLink.href = imgSrc;
        downloadLink.download = `${angleName}-${Date.now()}.${getExtensionFromMime(result.mime)}`;
        actions.appendChild(downloadLink);

        const saveAlbumBtn = document.createElement('button');
        saveAlbumBtn.className = 'mini-btn primary';
        saveAlbumBtn.textContent = isMobileDevice() ? '保存到相册' : '保存图片';
        saveAlbumBtn.addEventListener('click', () => handleSaveToAlbum(imgSrc, downloadLink.download));
        actions.appendChild(saveAlbumBtn);

        // 重试按钮（如果有 retryPrompt）
        if (retryPrompt) {
          const retryBtn = document.createElement('button');
          retryBtn.className = 'mini-btn';
          retryBtn.textContent = '🔄 重试';
          retryBtn.title = '使用相同参数重新生成此分镜';
          retryBtn.addEventListener('click', async () => {
            const originalText = retryBtn.textContent;
            retryBtn.disabled = true;
            retryBtn.textContent = '生成中...';
            const startedAt = performance.now();

            try {
              // 重新生成
              const newResult = await generateStoryboardShot(retryPrompt);

              // 替换当前卡片的图片
              const newImgSrc = getResultImgSrc(newResult);

              imgEl.src = newImgSrc;
              downloadLink.href = newImgSrc;
              downloadLink.download = `${angleName}-${Date.now()}.${getExtensionFromMime(newResult.mime)}`;

              // 保存新图片
              const persistentNewImgSrc = await getPersistentImageSource(newImgSrc);
              const thumbnail = await createThumbnail(persistentNewImgSrc);
              const filename = `${angleName}-${Date.now()}.${getExtensionFromMime(newResult.mime)}`;
              const historyRecord = {
                thumbnail,
                filename,
                prompt: angleName,
                aspect: aspectSelect.value,
                resolution: resolutionSelect.value,
                quality: imageQualitySelect?.value || '',
                model: getImageModel(),
                protocol: getProtocol(),
                timestamp: Date.now(),
                runtimeMs: performance.now() - startedAt
              };
              if (shouldSaveHistoryOriginal()) historyRecord.imageSrc = persistentNewImgSrc;
              await saveHistory(historyRecord);
              const saveResult = await saveImageFile(persistentNewImgSrc, filename);
              await renderHistory();

              const feedback = getSaveImageResultMessage(saveResult);
              flashStatus(`${angleName} 重新生成成功。${feedback.text}`, feedback.type);
            } catch (error) {
              console.error('重试失败:', error);
              flashStatus(`${angleName} 重试失败: ${parseApiError(error.message)}`, 'danger');
            } finally {
              retryBtn.disabled = false;
              retryBtn.textContent = originalText;
            }
          });
          actions.appendChild(retryBtn);
        }

        card.appendChild(actions);
        gridEl.appendChild(card);

        // 自动保存
        try {
          const persistentImgSrc = await getPersistentImageSource(imgSrc);
          const thumbnail = await createThumbnail(persistentImgSrc);
          const filename = `${angleName}-${Date.now()}.${getExtensionFromMime(result.mime)}`;

          const historyRecord = {
            thumbnail,
            filename,
            prompt: angleName,
            aspect: aspectSelect.value,
            resolution: resolutionSelect.value,
            quality: imageQualitySelect?.value || '',
            model: getImageModel(),
            protocol: getProtocol(),
            timestamp: Date.now(),
            runtimeMs: actualElapsedMs || 0
          };
          if (shouldSaveHistoryOriginal()) historyRecord.imageSrc = persistentImgSrc;
          await saveHistory(historyRecord);

          const saveResult = await saveImageFile(persistentImgSrc, filename);

          // 刷新历史记录显示
          await renderHistory();
          const feedback = getSaveImageResultMessage(saveResult);
          flashStatus(`${angleName} 已生成。${feedback.text}`, feedback.type);
        } catch (err) {
          console.error('保存失败:', err);
        }
      }

      const clearResultsBtn = document.getElementById('clear-results');
      const savePromptFromInputBtn = document.getElementById('save-prompt-from-input');
      const promptLibraryPanel = document.getElementById('prompt-library-panel');
      const promptLibraryToggleBtn = document.getElementById('prompt-library-toggle');
      const promptLibrarySearchInput = document.getElementById('prompt-library-search');
      const importPromptsBtn = document.getElementById('import-prompts-btn');
      const exportLocalPromptsBtn = document.getElementById('export-local-prompts-btn');
      const importPromptsFile = document.getElementById('import-prompts-file');
      const optimizePromptBtn = document.getElementById('optimize-prompt-btn');

      function setPromptLibraryCollapsed(collapsed) {
        if (!promptLibraryPanel || !promptLibraryToggleBtn) return;
        promptLibraryPanel.classList.toggle('collapsed', collapsed);
        promptLibraryToggleBtn.setAttribute('aria-expanded', String(!collapsed));
      }

      setPromptLibraryCollapsed(promptLibraryPanel?.classList.contains('collapsed'));

      fileInput.addEventListener('change', e => handleFiles(e.target.files));
      protocolSelect.addEventListener('change', () => {
        updateReferenceImageLimitText();
        if (state.images.length > getReferenceImageLimit()) {
          flashStatus(`当前协议最多使用 ${getReferenceImageLimit()} 张参考图，已保留前 ${getReferenceImageLimit()} 张用于发送`, 'success');
        }
      });
      saveKeyBtn.addEventListener('click', saveSettings);
      historyImageRetentionSelect?.querySelectorAll('.history-retention-option').forEach(option => {
        option.addEventListener('click', () => {
          setHistoryImageRetention(option.dataset.value, { persist: true, notify: true });
        });
      });
      runBtn.addEventListener('click', handleRun);
      countInput.addEventListener('input', () => {
        let val = parseInt(countInput.value, 10);
        if (val > 10) countInput.value = 10;
        if (val < 1 && countInput.value !== '') countInput.value = 1;
      });
      countInput.addEventListener('blur', () => {
        let val = parseInt(countInput.value, 10);
        if (isNaN(val) || val < 1) countInput.value = 1;
        if (val > 10) countInput.value = 10;
      });
      clearResultsBtn.addEventListener('click', clearResults);
      window.addEventListener('paste', e => {
        if (e.clipboardData?.files?.length) handleFiles(e.clipboardData.files);
      });
      window.addEventListener('dragover', e => e.preventDefault());
      window.addEventListener('drop', e => {
        e.preventDefault();
        if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
      });

      savePromptFromInputBtn?.addEventListener('click', () => {
        const promptContent = promptInput.value.trim();

        if (!promptContent) {
          flashStatus('请先输入提示词内容', 'danger');
          promptInput.focus();
          return;
        }

        showSavePromptDialog(promptContent);
      });

      promptLibrarySearchInput?.addEventListener('input', () => {
        renderPromptLibrary();
      });

      promptLibraryToggleBtn?.addEventListener('click', () => {
        setPromptLibraryCollapsed(!promptLibraryPanel?.classList.contains('collapsed'));
      });

      importPromptsBtn?.addEventListener('click', () => {
        importPromptsFile?.click();
      });

      importPromptsFile?.addEventListener('change', async () => {
        const files = Array.from(importPromptsFile.files || []);
        if (!files.length) return;

        importPromptsBtn.disabled = true;
        importPromptsBtn.textContent = '导入中...';

        try {
          await importPromptFiles(files);
        } catch (err) {
          console.error('导入提示词失败:', err);
          alert('导入失败：' + err.message);
        } finally {
          importPromptsBtn.disabled = false;
          importPromptsBtn.textContent = '📥 导入提示词';
          importPromptsFile.value = '';
        }
      });

      exportLocalPromptsBtn?.addEventListener('click', async () => {
        exportLocalPromptsBtn.disabled = true;
        exportLocalPromptsBtn.textContent = '导出中...';

        try {
          await exportLocalPromptLibrary();
        } catch (err) {
          console.error('导出本地提示词失败:', err);
          alert('导出失败：' + err.message);
        } finally {
          exportLocalPromptsBtn.disabled = false;
          exportLocalPromptsBtn.textContent = '📦 导出本地';
        }
      });

      optimizePromptBtn?.addEventListener('click', () => {
        const promptContent = promptInput.value.trim();

        if (!promptContent) {
          flashStatus('请先输入提示词内容', 'danger');
          promptInput.focus();
          return;
        }

        showPromptCompareDialog(promptContent);
      });

      loadSettings();
      updateReferenceImageLimitText();
      renderUploads();

      // 初始化角度调整弹窗事件监听器
      const angleModal = document.getElementById('angle-modal');
      const angleModalClose = document.getElementById('angle-modal-close');
      const angleModalCancel = document.getElementById('angle-modal-cancel');
      const angleModalConfirm = document.getElementById('angle-modal-confirm');
      const azimuthSlider = document.getElementById('azimuth-slider');
      const pitchSlider = document.getElementById('pitch-slider');
      const zoomSlider = document.getElementById('zoom-slider');

      // 移除了参考图片上传功能，改为自动加载主界面的第一张参考图

      // 滑块实时更新预览
      if (azimuthSlider) azimuthSlider.addEventListener('input', updateAnglePreview);
      if (pitchSlider) pitchSlider.addEventListener('input', updateAnglePreview);
      if (zoomSlider) zoomSlider.addEventListener('input', updateAnglePreview);

      // 关闭按钮
      if (angleModalClose) angleModalClose.addEventListener('click', closeAngleModal);
      if (angleModalCancel) angleModalCancel.addEventListener('click', closeAngleModal);

      // 点击遮罩层关闭弹窗
      if (angleModal) {
        angleModal.addEventListener('click', (e) => {
          if (e.target === angleModal) closeAngleModal();
        });
      }

      // 确定按钮：将提示词填入输入框
      if (angleModalConfirm) {
        angleModalConfirm.addEventListener('click', () => {
          const azimuth = parseInt(document.getElementById('azimuth-slider').value);
          const pitch = parseInt(document.getElementById('pitch-slider').value);
          const zoom = parseFloat(document.getElementById('zoom-slider').value);
          const prompt = angleToPrompt(azimuth, pitch, zoom);

          // 填入提示词输入框
          promptInput.value = prompt;

          // 关闭弹窗
          closeAngleModal();

          // 提示用户
          flashStatus('提示词已生成', 'success');
        });
      }

      // 初始化 IndexedDB 并加载历史记录
      initDB().then(() => {
        // 尝试恢复保存的文件夹句柄
        restoreFolderHandle().then(restored => {
          if (restored) {
            debugLog('已恢复保存的文件夹选择');
          }
        });

        scheduleNonCriticalTask(() => {
          renderPromptLibrary();
        }, 150);

        scheduleNonCriticalTask(() => {
          renderHistory();
        }, 300);
      }).catch(err => {
        console.error('初始化数据库失败:', err);
      });
    })();
  
