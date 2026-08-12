
    (() => {
      // --- Agent bridge (DO NOT REMOVE) ---
      window.AgentBridge = {
        getApiKey: () => typeof getApiKey === 'function' ? getApiKey() : '',
        getTextModel: () => typeof getTextModel === 'function' ? getTextModel() : 'gpt-5.4-mini',
        setTextModel: (value) => typeof setTextModel === 'function' ? setTextModel(value) : false,
        getTextModelOptions: () => typeof getTextModelOptions === 'function' ? getTextModelOptions() : [],
        getTextCapabilityStatus: () => typeof getTextCapabilityStatus === 'function' ? getTextCapabilityStatus() : { available: false, message: 'Text capability is not available' },
        getTextCapability: () => typeof getTextCapabilityStatus === 'function' ? getTextCapabilityStatus() : { available: false, message: 'Text capability is not available' },
        getTextCapabilities: () => typeof getTextCapabilityStatus === 'function' ? getTextCapabilityStatus() : { available: false, message: 'Text capability is not available' },
        getBaseUrl: () => typeof getBaseUrl === 'function' ? getBaseUrl() : '',
        buildApiUrl: (path) => typeof buildApiUrl === 'function' ? buildApiUrl(path) : path,
        sendImageRequest: (req, kind, signal) => typeof sendImageRequest === 'function' ? sendImageRequest(req, kind, signal) : Promise.reject(new Error('sendImageRequest not available')),
        appendResult: (item, params) => typeof appendResult === 'function' ? appendResult(item, params) : null,
        flashStatus: (msg, type) => typeof flashStatus === 'function' ? flashStatus(msg, type) : console.log(msg),
        getStateImages: () => Array.isArray(state?.images) ? state.images : [],
        getHistoryMeta: () => typeof loadHistory === 'function' ? loadHistory() : [],
        loadHistoryEntries: () => typeof loadHistory === 'function' ? loadHistory() : [],
        getCurrentGenerationParams: (overrides = {}) => typeof getCurrentGenerationParams === 'function' ? getCurrentGenerationParams(overrides) : { ...overrides },
        getGenerationOptions: (mediaType = 'image') => typeof getGenerationOptions === 'function' ? getGenerationOptions(mediaType) : {},
        runAgentGeneration: (mediaType, prompt, options = {}) => typeof runAgentGeneration === 'function' ? runAgentGeneration(mediaType, prompt, options) : Promise.reject(new Error('runAgentGeneration not available')),
        getPromptLibraryEntries: async (options = {}) => loadPromptLibraryEntries(options),
        recordPromptLibraryUsage: (id) => typeof incrementPromptUsage === 'function' ? incrementPromptUsage(id) : Promise.resolve(),
        sendToCanvas: (sources) => typeof sendImagesToCanvas === 'function' ? sendImagesToCanvas(sources) : null,
        getPromptLibraryTitles: async () => (await loadPromptLibraryEntries()).map(p => p?.title || p?.content || '').filter(Boolean),
        saveLocalPrompt: (record = {}) => savePromptToLocalLibrary(record.title, record.content, record),
        updateLocalPrompt: (id, patch = {}) => updateLocalPromptRecord(id, patch),
        deleteLocalPrompt: (id) => deleteLocalPromptEntry(id),
        setStudioPrompt: (content, options = {}) => setStudioPromptContent(content, options)
      };

      window.CanvasBridge = {
        getUploadPreviewImageSources: () => getCanvasUploadPreviewImageSources(),
        getResultImageSources: () => collectResultImageSources(),
        getHistoryGridImageSources: () => getCanvasHistoryGridImageSources(),
        loadHistoryEntries: () => typeof loadHistory === 'function' ? loadHistory() : [],
        runGeneration: (mediaType, prompt, options = {}) => typeof runAgentGeneration === 'function'
          ? runAgentGeneration(mediaType, prompt, options)
          : Promise.reject(new Error('runAgentGeneration not available')),
        flashStatus: (message, tone) => typeof flashStatus === 'function' ? flashStatus(message, tone) : undefined,
        getPromptLibraryEntries: async (options = {}) => loadPromptLibraryEntries(options),
        getPromptLibraryTitles: async () => (await loadPromptLibraryEntries()).map(p => p?.title || p?.content || '').filter(Boolean),
        getCanvasProjectTargets: () => typeof getCanvasProjectTargets === 'function' ? getCanvasProjectTargets() : [],
        getActiveCanvasProjectId: () => typeof getActiveCanvasProjectId === 'function' ? getActiveCanvasProjectId() : '',
        openCanvasWorkspace: (options = {}) => typeof openCanvasTool === 'function' ? openCanvasTool(options) : null,
        closeCanvasWorkspace: () => closeCanvasTool(),
        addPromptEntryToCanvas: (entry, options = {}) => typeof addPromptEntryToCanvas === 'function'
          ? addPromptEntryToCanvas(entry, options)
          : Promise.reject(new Error('Canvas prompt bridge is not available'))
      };

      window.PromptLibraryBridge = {
        getEntries: (options = {}) => loadPromptLibraryEntries(options),
        getLocalEntries: () => loadPromptLibraryEntries({ includeCommunity: false, localOnly: true }),
        getDiscoverEntries: () => loadPromptLibraryEntries({ includeLocal: false, includeCommunity: true, includePublic: true }),
        saveLocalPrompt: (record = {}) => savePromptToLocalLibrary(record.title, record.content, record),
        recordPromptLibraryUsage: (id) => typeof incrementPromptUsage === 'function' ? incrementPromptUsage(id) : Promise.resolve(),
        updateLocalPrompt: (id, patch = {}) => updateLocalPromptRecord(id, patch),
        deleteLocalPrompt: (id) => deleteLocalPromptEntry(id),
        setStudioPrompt: (content, options = {}) => setStudioPromptContent(content, options),
        addStudioReferenceImages: (sources = []) => addStudioReferenceImages(sources),
        flashStatus: (message, tone) => typeof flashStatus === 'function' ? flashStatus(message, tone) : undefined,
        open: (options = {}) => typeof openPromptLibraryFromHost === 'function' ? openPromptLibraryFromHost(options) : null
      };

      const _appScriptSrc = document.currentScript?.src || '';
      const _appBase = _appScriptSrc ? new URL('./', _appScriptSrc).href : new URL('./', location.href).href;
      const _assetVersion = '20260808-1';
      const _canvasWorkspaceModulePath = 'canvas/canvas-workspace.js?v=20260808-1';
      const _agentUiUrl = new URL(`agent/agent-ui.js?v=${_assetVersion}`, _appBase).href;

      function showUiError(message) {
        const text = String(message || '操作失败');
        if (typeof flashStatus === 'function') flashStatus(text, 'danger');
        else console.error(text);
      }

      function confirmUiAction(options = {}) {
        return window.AppUtils?.dialog?.confirm?.(options) || Promise.resolve(false);
      }

      function openManagedOverlay(overlay, options = {}) {
        const surface = options.surface || overlay.querySelector('[role="dialog"], .dialog-content, .prompt-compare-panel, .storyboard-panel, .angle-modal') || overlay;
        let handle = null;
        let closed = false;
        const close = (reason = 'close') => {
          if (closed) return;
          closed = true;
          if (handle) {
            const current = handle;
            handle = null;
            current.close(reason);
          } else if (overlay.isConnected) {
            overlay.remove();
          }
        };
        if (!overlay.isConnected) document.body.appendChild(overlay);
        handle = window.AppUtils?.dialog?.open?.({
          element: surface,
          container: overlay,
          role: options.role || 'dialog',
          label: options.label,
          openClass: options.openClass || 'active',
          closeClass: options.closeClass || options.openClass || 'active',
          trigger: options.trigger || document.activeElement,
          closeOnBackdrop: options.closeOnBackdrop !== false,
          onClose: reason => {
            closed = true;
            if (overlay.isConnected) overlay.remove();
            options.onClose?.(reason);
          }
        }) || null;
        if (!handle && !overlay.classList.contains('active')) overlay.classList.add('active');
        return { close, handle, overlay, surface };
      }

      function ensureWorkspaceStylesheet(key, fileName) {
        const href = new URL(`../css/${fileName}?v=${_assetVersion}`, _appBase).href;
        return window.AppUtils?.ensureStylesheet?.(key, href) || Promise.resolve();
      }

      function openPromptLibraryFromHost(options = {}) {
        const promptLibraryUrl = new URL(`prompt-library.js?v=${_assetVersion}`, _appBase).href;
        return ensureWorkspaceStylesheet('prompt-library', 'prompt-library.css')
          .then(() => import(promptLibraryUrl))
          .then(module => {
            const result = module.openPromptLibrary(options);
            setWorkspaceNavActive('prompts');
            return result;
          })
          .catch(error => {
            console.error('prompt library load failed', error);
            setWorkspaceNavActive('studio');
            if (typeof flashStatus === 'function') flashStatus(`提示词库加载失败：${error?.message || error}`, 'danger');
          });
      }

      function setWorkspaceNavActive(workspace) {
        if (window.AppUtils?.setActiveWorkspace) return window.AppUtils.setActiveWorkspace(workspace);
        const value = String(workspace || 'studio');
        document.querySelectorAll('[data-workspace-nav]').forEach(button => {
          button.classList.toggle('is-active', button.dataset.workspaceNav === value);
        });
      }

      function openAgentFromWorkspace() {
        return ensureWorkspaceStylesheet('agent', 'agent.css').then(() => import(_agentUiUrl)).then(m => {
          const result = m.openAgentWorkspace();
          setWorkspaceNavActive('agent');
          return result;
        }).catch(err => {
          console.error('agent load failed', err);
          setWorkspaceNavActive('studio');
          if (typeof flashStatus === 'function') flashStatus('Agent 模块加载失败：' + (err?.message || err), 'danger');
        });
      }

      document.querySelectorAll('[data-open-prompt-library]').forEach(button => {
        button.addEventListener('click', () => {
          openPromptLibraryFromHost({ context: 'global' });
        });
      });
      document.querySelectorAll('[data-open-agent]').forEach(button => {
        button.addEventListener('click', openAgentFromWorkspace);
      });
      window.addEventListener('agent-workspace-closed', () => setWorkspaceNavActive('studio'));
      window.AppUtils?.setActiveWorkspace?.('studio', { initial: true });
      try { window.lucide?.createIcons?.(); } catch (error) { console.warn('Lucide icons failed:', error); }

      // 获取用户配置的 Base URL
      const baseUrlInput = document.getElementById('base-url');
      const proxyModeInput = document.getElementById('proxy-mode');
      const autoUpscaleInput = document.getElementById('auto-upscale');
      const apiLinkEl = document.getElementById('api-link');
      const appConfig = window.APP_CONFIG || {};
      const defaultBaseUrl = appConfig.defaultBaseUrl || 'https://api.openai.com';
      const apiHomeUrl = appConfig.apiHomeUrl || 'https://api.openai.com';
      const apiProxyEndpoint = appConfig.apiProxyEndpoint || 'api-proxy.php';
      const API_PROXY_MODE_KEY = 'api_proxy_mode';
      const AUTO_UPSCALE_KEY = 'auto_upscale';
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

      function parseBaseUrl(value) {
        const raw = String(value ?? '').trim();
        if (!raw || raw.startsWith('//')) return null;
        const isAbsoluteHttp = /^https?:\/\//i.test(raw);
        const isRootRelative = raw.startsWith('/') && !raw.startsWith('//');
        if (!isAbsoluteHttp && !isRootRelative) return null;
        const normalized = raw.replace(/\/+$/, '') || (raw.startsWith('/') ? '/' : '');
        if (!normalized) return null;
        try {
          const url = new URL(normalized, window.location.href);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
          return { value: normalized, url };
        } catch {
          return null;
        }
      }

      function normalizeBaseUrl(value, fallback = defaultBaseUrl) {
        return parseBaseUrl(value)?.value || parseBaseUrl(fallback)?.value || defaultBaseUrl;
      }

      function isValidBaseUrl(value) {
        return !!parseBaseUrl(value);
      }

      function getBaseUrl() {
        const override = settingsConnectionOverride;
        const platformId = override?.platformId || committedSettingsSnapshot?.activePlatformId || activePlatformId;
        const settings = override?.settings || getRuntimePlatformSettings(platformId);
        const raw = Object.prototype.hasOwnProperty.call(settings, 'baseUrl')
          ? settings.baseUrl
          : (!committedSettingsSnapshot && !override ? baseUrlInput.value : getPlatformConfig(platformId).baseUrlValue);
        const fallback = getPlatformConfig(platformId).baseUrlValue || defaultBaseUrl;
        return normalizeBaseUrl(raw || fallback, fallback);
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
        if (base.endsWith('/api/v3') && path.startsWith('/v1/')) {
          return base + path.slice('/v1'.length);
        }
        if (base.endsWith('/api/v3') && path.startsWith('/volc/v1/')) {
          return base + path.slice('/volc/v1'.length);
        }
        return base + path;
      }

      function isApiProxyEnabled() {
        const configured = settingsConnectionOverride?.settings?.proxyMode
          ?? committedSettingsSnapshot?.platformSettings?.[settingsConnectionOverride?.platformId || activePlatformId]?.proxyMode
          ?? proxyModeInput?.checked;
        return !!configured && /^https:\/\//i.test(getBaseUrl());
      }

      function isAutoUpscaleEnabled() {
        return localStorage.getItem(AUTO_UPSCALE_KEY) === '1';
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

      function buildMediaProxyUrlForTarget(targetUrl, { retry = false } = {}) {
        const proxyUrl = new URL(apiProxyEndpoint, window.location.href);
        proxyUrl.searchParams.set('media', '1');
        proxyUrl.searchParams.set('target', targetUrl);
        if (retry) proxyUrl.searchParams.set('retry', '1');
        return proxyUrl.toString();
      }

      function normalizeResultMediaUrl(value) {
        return window.AppUtils?.normalizeMediaUrl?.(value) || String(value || '').trim();
      }

      function isKnownMediaProxyHost(value) {
        try {
          const host = new URL(value).hostname.toLowerCase();
          return host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com');
        } catch {
          return false;
        }
      }

      function isAppProxyUrl(value) {
        try {
          const endpoint = new URL(apiProxyEndpoint, window.location.href);
          const candidate = new URL(value, window.location.href);
          return candidate.origin === endpoint.origin && candidate.pathname === endpoint.pathname;
        } catch {
          return false;
        }
      }

      function canProxyMediaUrl(src) {
        return /^https:\/\//i.test(src || '') && (isApiProxyEnabled() || isKnownMediaProxyHost(src));
      }

      function canProxyImageUrl(src) {
        return canProxyMediaUrl(src);
      }

      // 当 Base URL 变化时，同步更新"前往获取"链接
      baseUrlInput.addEventListener('input', () => {
        const url = (settingsIsOpen ? baseUrlInput.value.trim() : getBaseUrl()) || defaultBaseUrl;
        if (apiLinkEl) apiLinkEl.href = url.startsWith('/') ? apiHomeUrl : url;
        if (settingsIsOpen) {
          const platform = getPlatformConfig(getSettingsPlatformId());
          if (apiLinkEl) apiLinkEl.href = platform.apiHome || (url.startsWith('/') ? apiHomeUrl : url);
          markSettingsDirty();
        }
      });

      // 模型选择下拉框
      const imageModelSelect = document.getElementById('image-model');
      const textModelSelect = document.getElementById('text-model');
      const protocolSelect = document.getElementById('api-protocol');
      const ACTIVE_PLATFORM_STORAGE_KEY = 'active_platform_id';
      const ACTIVE_PLATFORM_KIND_STORAGE_KEY = 'active_platform_kind';
      const PLATFORM_SETTINGS_STORAGE_KEY = 'platform_settings_v1';
      const MODEL_LIST_STORAGE_PREFIX = 'model_list';
      const IMAGE_MODEL_STORAGE_PREFIX = 'image_model';
      const TEXT_MODEL_STORAGE_PREFIX = 'text_model';
      const DEFAULT_TEXT_MODEL = 'gpt-5.4-mini';
      let committedSettingsSnapshot = null;
      let settingsDraft = null;
      let settingsIsOpen = false;
      let settingsFocusReturn = null;
      let settingsConnectionOverride = null;
      const PLATFORM_REGISTRY = {
        openai: {
          id: 'openai',
          label: 'OpenAI',
          kind: 'image',
          supported: true,
          defaultProtocol: 'openai-images',
          protocolOptions: [
            { value: 'openai-images', label: 'OpenAI Images' },
            { value: 'openai-chat', label: 'OpenAI Chat' }
          ],
          defaultImageModel: 'gpt-image-2',
          defaultTextModel: DEFAULT_TEXT_MODEL,
          summary: '',
          templateHint: '',
          supportNote: '',
          baseUrlPlaceholder: 'https://api.openai.com',
          baseUrlValue: 'https://api.openai.com',
          apiHome: 'https://platform.openai.com/',
          paramSummary: '',
          fields: ['aspect', 'resolution', 'quality', 'format', 'background', 'count'],
          extraFields: [],
          promptHint: ''
        },
        gemini: {
          id: 'gemini',
          label: 'Gemini',
          kind: 'image',
          supported: true,
          defaultProtocol: 'gemini',
          protocolOptions: [
            { value: 'gemini', label: 'Gemini 原生' },
            { value: 'openai-images', label: 'OpenAI Images (Go)' },
            { value: 'openai-chat', label: 'OpenAI Chat ' }
          ],
          defaultImageModel: 'gemini-3.1-flash-image-preview',
          defaultTextModel: DEFAULT_TEXT_MODEL,
          summary: '',
          templateHint: '',
          supportNote: '',
          baseUrlPlaceholder: 'https://generativelanguage.googleapis.com',
          baseUrlValue: 'https://generativelanguage.googleapis.com',
          apiHome: 'https://ai.google.dev/',
          paramSummary: '默认使用 Gemini 原生接口 /v1beta/models/{model}:generateContent；中转站兼容走 /v1/chat/completions。',
          fields: ['aspect', 'resolution', 'quality', 'count'],
          extraFields: [
            {
              title: 'Gemini 提示',
              body: 'Gemini 原生接口更适合多参考图和复合场景描述，建议在提示词里明确主体关系与画面意图。'
            }
          ],
          promptHint: ''
        },
        grok: {
          id: 'grok',
          label: 'Grok',
          kind: 'image',
          supported: true,
          defaultProtocol: 'open-images',
          protocolOptions: [
            { value: 'open-images', label: 'Open Images' },
            { value: 'openai-chat', label: 'OpenAI Chat ' }
          ],
          defaultImageModel: 'grok-imagine-image-quality',
          defaultTextModel: DEFAULT_TEXT_MODEL,
          summary: '',
          templateHint: '',
          supportNote: '',
          baseUrlPlaceholder: 'https://api.x.ai',
          baseUrlValue: 'https://api.x.ai',
          apiHome: 'https://console.x.ai/',
          paramSummary: 'Open Images 走 /v1/images/generations 与 /v1/images/edits；Chat 走 /v1/chat/completions。',
          fields: ['aspect', 'resolution', 'count'],
          extraFields: [
            { title: 'Grok Imagine', body: '官方接口当前支持 1k / 2k 输出，4K 会自动降级为 2k 发送。' }
          ],
          promptHint: ''
        },
        qwen: {
          id: 'qwen',
          label: '阿里云百炼',
          kind: 'image',
          supported: true,
          defaultProtocol: 'aliyun-images',
          protocolOptions: [
            { value: 'aliyun-images', label: '阿里云百炼' },
            { value: 'open-images', label: 'Open Images' }
          ],
          defaultImageModel: 'qwen-image-2.0-pro',
          defaultTextModel: DEFAULT_TEXT_MODEL,
          summary: '',
          templateHint: '',
          supportNote: '',
          baseUrlPlaceholder: 'https://dashscope.aliyuncs.com',
          baseUrlValue: 'https://dashscope.aliyuncs.com',
          apiHome: 'https://dashscope.aliyun.com/',
          paramSummary: '阿里云百炼走 /api/v1/services/aigc/multimodal-generation/generation；Open Images 走 /v1/images/generations。',
          fields: ['aspect', 'resolution', 'quality', 'count'],
          extraFields: [
            { title: '阿里云百炼', body: '官方接口使用 qwen-image-2.0-pro，同步返回图片 URL。' }
          ],
          promptHint: ''
        },
        doubao: {
          id: 'doubao',
          label: '豆包/火山方舟',
          kind: 'image',
          supported: true,
          defaultProtocol: 'doubao-images',
          protocolOptions: [
            { value: 'doubao-images', label: '豆包官方' },
            { value: 'open-images', label: 'Open Images' }
          ],
          defaultImageModel: 'doubao-seedream-5-0-260128',
          defaultTextModel: DEFAULT_TEXT_MODEL,
          summary: '',
          templateHint: '',
          supportNote: '',
          baseUrlPlaceholder: 'https://ark.cn-beijing.volces.com/api/v3',
          baseUrlValue: 'https://ark.cn-beijing.volces.com/api/v3',
          apiHome: 'https://www.volcengine.com/',
          paramSummary: '豆包官方走 /api/v3/images/generations；Open Images 走 /v1/images/generations。',
          fields: ['aspect', 'resolution', 'quality', 'count'],
          extraFields: [
            { title: '火山方舟', body: '官方协议使用 doubao-seedream-5-0-260128，同步返回图片 URL。' }
          ],
          promptHint: ''
        },
        flux: {
          id: 'flux',
          label: 'Flux',
          kind: 'image',
          supported: true,
          defaultProtocol: 'replicate-flux',
          protocolOptions: [
            { value: 'replicate-flux', label: 'Replicate 官方' },
            { value: 'open-images', label: 'Open Images' }
          ],
          defaultImageModel: 'black-forest-labs/flux-kontext-dev',
          defaultTextModel: DEFAULT_TEXT_MODEL,
          summary: '',
          templateHint: '',
          supportNote: '',
          baseUrlPlaceholder: 'https://api.replicate.com',
          baseUrlValue: 'https://api.replicate.com',
          apiHome: 'https://replicate.com/black-forest-labs/flux-kontext-dev',
          paramSummary: 'Replicate 官方走 /v1/models/{model}/predictions；Open Images 走 /v1/images/generations。',
          fields: ['aspect', 'quality', 'format', 'count'],
          extraFields: [
            { title: 'Replicate Flux', body: '官方协议为异步任务，会创建 prediction 并轮询到图片 URL。' }
          ],
          promptHint: ''
        },
        openaiVideo: {
          id: 'openaiVideo',
          label: 'OpenAI',
          kind: 'video',
          supported: true,
          defaultProtocol: 'openai-videos',
          protocolOptions: [
            { value: 'openai-videos', label: 'OpenAI Videos' },
            { value: 'openai-video-chat', label: 'OpenAI Chat 兼容' }
          ],
          defaultImageModel: 'sora-2',
          defaultTextModel: DEFAULT_TEXT_MODEL,
          summary: '',
          templateHint: '',
          supportNote: '',
          baseUrlPlaceholder: 'https://api.openai.com',
          baseUrlValue: 'https://api.openai.com',
          apiHome: 'https://platform.openai.com/',
          paramSummary: 'OpenAI Videos 走 /v1/videos；Chat 兼容走 /v1/chat/completions。',
          fields: ['aspect', 'resolution', 'duration', 'count'],
          extraFields: [
            { title: 'OpenAI Sora 2', body: '默认使用 sora-2；兼容协议使用 OpenAI Chat 多模态格式请求中转站。' }
          ],
          promptHint: ''
        },
        geminiVideo: {
          id: 'geminiVideo',
          label: 'Gemini',
          kind: 'video',
          supported: true,
          defaultProtocol: 'veo-generations',
          protocolOptions: [
            { value: 'veo-generations', label: 'Veo Generations' },
            { value: 'veo-create', label: 'Video Create' }
          ],
          defaultImageModel: 'veo3.1',
          defaultTextModel: DEFAULT_TEXT_MODEL,
          summary: '',
          templateHint: '',
          supportNote: '',
          baseUrlPlaceholder: 'https://generativelanguage.googleapis.com',
          baseUrlValue: 'https://generativelanguage.googleapis.com',
          apiHome: 'https://ai.google.dev/',
          paramSummary: 'Veo Generations 走 /v1/video/generations；Video Create 走 /v1/video/create。',
          fields: ['aspect', 'resolution', 'duration', 'count'],
          extraFields: [
            { title: 'Google Veo 3.1', body: 'Default model: veo3.1. Supports text-to-video and reference-image video generation.' }
          ],
          promptHint: ''
        },
        qwenVideo: {
          id: 'qwenVideo',
          label: '阿里',
          kind: 'video',
          supported: true,
          defaultProtocol: 'aliyun-happyhorse',
          protocolOptions: [
            { value: 'aliyun-happyhorse', label: '阿里 HappyHorse' }
          ],
          defaultImageModel: 'happyhorse-1.0-t2v',
          defaultTextModel: DEFAULT_TEXT_MODEL,
          summary: '',
          templateHint: '',
          supportNote: '',
          baseUrlPlaceholder: 'https://dashscope.aliyuncs.com',
          baseUrlValue: 'https://dashscope.aliyuncs.com',
          apiHome: 'https://dashscope.aliyun.com/',
          paramSummary: '阿里 HappyHorse 走 /alibailian/api/v1/services/aigc/video-generation/video-synthesis，任务轮询走 /alibailian/api/v1/tasks/{task_id}。',
          fields: ['aspect', 'resolution', 'duration', 'count'],
          extraFields: [
            { title: 'HappyHorse 1.0', body: '默认模型 happyhorse-1.0-t2v；i2v/r2v 需手动选择对应模型并提供参考图。' }
          ],
          promptHint: ''
        },
        doubaoVideo: {
          id: 'doubaoVideo',
          label: '豆包',
          kind: 'video',
          supported: true,
          defaultProtocol: 'doubao-seedance',
          protocolOptions: [
            { value: 'doubao-seedance', label: '豆包 Seedance' }
          ],
          defaultImageModel: 'doubao-seedance-1-0-pro-250528',
          defaultTextModel: DEFAULT_TEXT_MODEL,
          summary: '',
          templateHint: '',
          supportNote: '',
          baseUrlPlaceholder: 'https://ark.cn-beijing.volces.com/api/v3',
          baseUrlValue: 'https://ark.cn-beijing.volces.com/api/v3',
          apiHome: 'https://www.volcengine.com/',
          paramSummary: '豆包 Seedance 走 /volc/v1/contents/generations/tasks，任务轮询走 /volc/v1/contents/generations/tasks/{task_id}。',
          fields: ['aspect', 'resolution', 'duration', 'count'],
          extraFields: [
            { title: 'Seedance', body: '默认模型 doubao-seedance-1-0-pro-250528；支持文生、首帧和首尾帧场景。' }
          ],
          promptHint: ''
        },
        grokVideo: {
          id: 'grokVideo',
          label: 'Grok',
          kind: 'video',
          supported: true,
          defaultProtocol: 'grok-video-create',
          protocolOptions: [
            { value: 'grok-video-create', label: 'Grok Video Create' }
          ],
          defaultImageModel: 'grok-video-3',
          defaultTextModel: DEFAULT_TEXT_MODEL,
          summary: '',
          templateHint: '',
          supportNote: '',
          baseUrlPlaceholder: 'https://api.x.ai',
          baseUrlValue: 'https://api.x.ai',
          apiHome: 'https://console.x.ai/',
          paramSummary: 'Grok Video Create 走 /v1/video/create，任务轮询走 /v1/video/query?id={task_id}。',
          fields: ['aspect', 'resolution', 'duration', 'count'],
          extraFields: [
            { title: 'Grok Video', body: '默认模型 grok-video-3；当前接口按文档固定使用 720P。' }
          ],
          promptHint: ''
        }
      };
      const IMAGE_PLATFORM_ORDER = ['openai', 'gemini', 'grok', 'qwen', 'doubao', 'flux'];
      const VIDEO_PLATFORM_ORDER = ['openaiVideo', 'geminiVideo', 'qwenVideo', 'doubaoVideo', 'grokVideo'];
      PLATFORM_REGISTRY.openai.endpointResolver = ({ protocol }) => {
        if (protocol === 'openai-chat') return buildApiUrl('/v1/chat/completions');
        return buildApiUrl('/v1/images/generations');
      };
      PLATFORM_REGISTRY.openai.flashEndpointResolver = () => buildApiUrl('/v1/chat/completions');
      PLATFORM_REGISTRY.gemini.endpointResolver = ({ protocol, imageModel }) => {
        if (protocol === 'openai-chat') return buildApiUrl('/v1/chat/completions');
        if (protocol === 'openai-images') return buildApiUrl('/v1/images/generations');
        return buildApiUrl(`/v1beta/models/${imageModel || 'gemini-3.1-flash-image-preview'}:generateContent`);
      };
      PLATFORM_REGISTRY.gemini.flashEndpointResolver = () => buildApiUrl('/v1/chat/completions');
      PLATFORM_REGISTRY.grok.endpointResolver = ({ protocol }) => {
        if (protocol === 'openai-chat') return buildApiUrl('/v1/chat/completions');
        return buildApiUrl('/v1/images/generations');
      };
      PLATFORM_REGISTRY.grok.flashEndpointResolver = () => buildApiUrl('/v1/chat/completions');
      PLATFORM_REGISTRY.qwen.endpointResolver = ({ protocol }) => {
        if (protocol === 'open-images') return buildApiUrl('/v1/images/generations');
        return buildApiUrl('/api/v1/services/aigc/multimodal-generation/generation');
      };
      PLATFORM_REGISTRY.qwen.flashEndpointResolver = () => buildApiUrl('/v1/chat/completions');
      PLATFORM_REGISTRY.doubao.endpointResolver = () => buildApiUrl('/v1/images/generations');
      PLATFORM_REGISTRY.doubao.flashEndpointResolver = () => buildApiUrl('/v1/chat/completions');
      PLATFORM_REGISTRY.flux.endpointResolver = ({ protocol, imageModel }) => {
        if (protocol === 'open-images') return buildApiUrl('/v1/images/generations');
        return buildApiUrl(`/v1/models/${imageModel || 'black-forest-labs/flux-kontext-dev'}/predictions`);
      };
      PLATFORM_REGISTRY.openaiVideo.endpointResolver = ({ protocol }) => {
        if (protocol === 'openai-video-chat') return buildApiUrl('/v1/chat/completions');
        return buildApiUrl('/v1/videos');
      };
      PLATFORM_REGISTRY.geminiVideo.endpointResolver = ({ protocol }) => {
        if (protocol === 'veo-create') return buildApiUrl('/v1/video/create');
        return buildApiUrl('/v1/video/generations');
      };
      PLATFORM_REGISTRY.qwenVideo.endpointResolver = () => buildApiUrl('/alibailian/api/v1/services/aigc/video-generation/video-synthesis');
      PLATFORM_REGISTRY.qwenVideo.flashEndpointResolver = () => buildApiUrl('/v1/chat/completions');
      PLATFORM_REGISTRY.doubaoVideo.endpointResolver = () => buildApiUrl('/volc/v1/contents/generations/tasks');
      PLATFORM_REGISTRY.doubaoVideo.flashEndpointResolver = () => buildApiUrl('/v1/chat/completions');
      PLATFORM_REGISTRY.grokVideo.endpointResolver = () => buildApiUrl('/v1/video/create');
      PLATFORM_REGISTRY.grokVideo.flashEndpointResolver = () => buildApiUrl('/v1/chat/completions');
      let activePlatformId = 'openai';
      let activePlatformKind = 'image';

      function getRuntimePlatformSettings(platformId = activePlatformId) {
        return committedSettingsSnapshot?.platformSettings?.[platformId] || loadPlatformSettings(platformId) || {};
      }

      function getSettingsPlatformId() {
        return settingsDraft?.activePlatformId || activePlatformId;
      }

      function getSettingsPlatformKind() {
        return settingsDraft?.activePlatformKind || activePlatformKind;
      }

      function getImageModel() {
        const override = settingsConnectionOverride;
        const settings = override?.settings || getRuntimePlatformSettings(override?.platformId || activePlatformId);
        return settings.imageModel || (!committedSettingsSnapshot && !override ? imageModelSelect.value : '') || 'gpt-image-2';
      }
      function getTextModel() {
        const override = settingsConnectionOverride;
        const settings = override?.settings || getRuntimePlatformSettings(override?.platformId || activePlatformId);
        return settings.textModel || (!committedSettingsSnapshot && !override ? textModelSelect.value : '') || DEFAULT_TEXT_MODEL;
      }
      function getProtocol() {
        const override = settingsConnectionOverride;
        const settings = override?.settings || getRuntimePlatformSettings(override?.platformId || activePlatformId);
        return settings.protocol || (!committedSettingsSnapshot && !override ? protocolSelect.value : '') || 'openai-chat';
      }
      function getPlatformConfig(platformId = activePlatformId) {
        return PLATFORM_REGISTRY[platformId] || PLATFORM_REGISTRY.openai;
      }
      function getPlatformOrderForKind(kind = activePlatformKind) {
        return kind === 'video' ? VIDEO_PLATFORM_ORDER : IMAGE_PLATFORM_ORDER;
      }
      function getPlatformKind(platformId = activePlatformId) {
        return getPlatformConfig(platformId).kind === 'video' ? 'video' : 'image';
      }
      function ensurePlatformMatchesKind(platformId, kind = activePlatformKind) {
        const order = getPlatformOrderForKind(kind);
        return order.includes(platformId) ? platformId : order[0];
      }
      function getActivePlatformConfig() {
        return getPlatformConfig(activePlatformId);
      }
      function isActivePlatformSupported() {
        return !!getActivePlatformConfig().supported;
      }
      function getPlatformStorageKey(prefix, platformId = activePlatformId) {
        return platformId ? `${prefix}_${platformId}` : prefix;
      }
      function getEditableModels(platformId = getSettingsPlatformId()) {
        if (settingsDraft?.modelLists?.[platformId]) {
          return settingsDraft.modelLists[platformId].map(model => ({ ...model }));
        }
        return getStoredModels(platformId).map(model => ({ ...model }));
      }
      function getStoredPlatformSettingsMap() {
        try {
          const raw = localStorage.getItem(PLATFORM_SETTINGS_STORAGE_KEY) || '{}';
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (err) {
          return {};
        }
      }
      function writeStoredPlatformSettingsMap(settingsMap) {
        localStorage.setItem(PLATFORM_SETTINGS_STORAGE_KEY, JSON.stringify(settingsMap || {}));
      }
      function collectCurrentPlatformSettings() {
        return {
          protocol: protocolSelect?.value || '',
          imageModel: imageModelSelect?.value || '',
          textModel: textModelSelect?.value || '',
          baseUrl: baseUrlInput?.value?.trim() || '',
          proxyMode: !!proxyModeInput?.checked,
          aspect: aspectSelect?.value || '',
          resolution: resolutionSelect?.value || '',
          imageQuality: imageQualitySelect?.value || '',
          outputFormat: outputFormatSelect?.value || '',
          imageBackground: imageBackgroundSelect?.value || '',
          videoDuration: videoDurationSelect?.value || '10',
          count: countInput?.value || '1'
        };
      }
      function loadPlatformSettings(platformId) {
        const settingsMap = getStoredPlatformSettingsMap();
        return settingsMap?.[platformId] || null;
      }
      function savePlatformSettings(platformId = activePlatformId, settingsOverride = null) {
        if (!platformId) return;
        const settingsMap = getStoredPlatformSettingsMap();
        settingsMap[platformId] = settingsOverride || collectCurrentPlatformSettings();
        writeStoredPlatformSettingsMap(settingsMap);
      }
      function isAvailableTextModel(modelId, platformId = activePlatformId) {
        if (!modelId) return false;
        if (modelId === DEFAULT_TEXT_MODEL) return true;
        return getEditableModels(platformId).some(model => model.id === modelId);
      }
      function applyPlatformSettings(platformConfig, platformSettings) {
        if (!platformConfig) return;
        const settings = platformSettings || {};
        const textModel = isAvailableTextModel(settings.textModel, platformConfig.id)
          ? settings.textModel
          : DEFAULT_TEXT_MODEL;

        populateProtocolOptions(platformConfig, settings.protocol || platformConfig.defaultProtocol);
        const editableModels = getEditableModels(platformConfig.id);
        if (editableModels.length > 0) {
          imageModelSelect.innerHTML = '';
          textModelSelect.innerHTML = '';
          editableModels.forEach(model => {
            appendModelOption(imageModelSelect, model.id, model.name);
            appendModelOption(textModelSelect, model.id, model.name);
          });
        }
        ensurePlatformDefaultModels(platformConfig);

        if (platformConfig.defaultImageModel) {
          ensureModelOption(imageModelSelect, platformConfig.defaultImageModel, platformConfig.defaultImageModel);
        }
        if (platformConfig.defaultTextModel) {
          ensureModelOption(textModelSelect, platformConfig.defaultTextModel, platformConfig.defaultTextModel);
        }
        if (settings.imageModel) {
          ensureModelOption(imageModelSelect, settings.imageModel, settings.imageModel);
        }
        if (textModel) {
          ensureModelOption(textModelSelect, textModel, textModel);
        }

        imageModelSelect.value = settings.imageModel || platformConfig.defaultImageModel || imageModelSelect.value;
        textModelSelect.value = textModel || DEFAULT_TEXT_MODEL;

        baseUrlInput.placeholder = platformConfig.baseUrlPlaceholder || defaultBaseUrl;
        baseUrlInput.value = settings.baseUrl || platformConfig.baseUrlValue || baseUrlInput.value || defaultBaseUrl;
        if (proxyModeInput) {
          proxyModeInput.checked = typeof settings.proxyMode === 'boolean' ? settings.proxyMode : proxyModeInput.checked;
        }

        if (settings.aspect) {
          applyCompatibleRetryLayout({
            aspect: settings.aspect,
            resolution: settings.resolution,
            model: settings.imageModel || getImageModel()
          });
        } else {
          restoreSelectValue(aspectSelect, aspectSelect.value);
        }
        restoreSelectValue(resolutionSelect, settings.resolution ?? resolutionSelect.value);
        restoreSelectValue(imageQualitySelect, settings.imageQuality ?? imageQualitySelect.value);
        restoreSelectValue(outputFormatSelect, settings.outputFormat ?? outputFormatSelect.value);
        restoreSelectValue(imageBackgroundSelect, settings.imageBackground ?? imageBackgroundSelect.value);
        restoreSelectValue(videoDurationSelect, settings.videoDuration ?? videoDurationSelect?.value ?? '10');
        if (countInput) {
          countInput.value = settings.count || countInput.value || '1';
        }
      }
      function populateProtocolOptions(platformConfig, preferredValue) {
        if (!protocolSelect || !platformConfig) return;
        const previousValue = preferredValue || protocolSelect.value;
        const selectedValue = platformConfig.protocolOptions.some(option => option.value === previousValue)
          ? previousValue
          : platformConfig.defaultProtocol;

        protocolSelect.innerHTML = '';
        platformConfig.protocolOptions.forEach(option => {
          protocolSelect.add(new Option(option.label, option.value));
        });
        protocolSelect.value = selectedValue;
      }
      function ensurePlatformDefaultModels(platformConfig) {
        if (!platformConfig) return;
        const imageModelKey = getPlatformStorageKey(IMAGE_MODEL_STORAGE_PREFIX, platformConfig.id);
        const textModelKey = getPlatformStorageKey(TEXT_MODEL_STORAGE_PREFIX, platformConfig.id);
        if (platformConfig.defaultImageModel) {
          ensureModelOption(imageModelSelect, platformConfig.defaultImageModel, platformConfig.defaultImageModel);
          if (!localStorage.getItem(imageModelKey) && !localStorage.getItem(IMAGE_MODEL_STORAGE_PREFIX)) {
            imageModelSelect.value = platformConfig.defaultImageModel;
          }
        }
        if (platformConfig.defaultTextModel) {
          ensureModelOption(textModelSelect, platformConfig.defaultTextModel, platformConfig.defaultTextModel);
          if (!localStorage.getItem(textModelKey) && !localStorage.getItem(TEXT_MODEL_STORAGE_PREFIX)) {
            textModelSelect.value = platformConfig.defaultTextModel;
          }
        }
      }
      function syncPlatformBaseUrl(platformConfig, selectedPlatformId = activePlatformId) {
        if (!baseUrlInput || !platformConfig) return;
        baseUrlInput.placeholder = platformConfig.baseUrlPlaceholder || defaultBaseUrl;
        const knownPlatformBaseUrls = Object.values(PLATFORM_REGISTRY)
          .map(platform => platform.baseUrlValue)
          .filter(Boolean);
        if (platformConfig.id === selectedPlatformId && platformConfig.baseUrlValue && knownPlatformBaseUrls.includes(baseUrlInput.value) && baseUrlInput.value !== platformConfig.baseUrlValue) {
          baseUrlInput.value = platformConfig.baseUrlValue;
        } else if (platformConfig.id === selectedPlatformId && platformConfig.baseUrlValue && baseUrlInput.value === defaultBaseUrl && platformConfig.baseUrlValue !== defaultBaseUrl) {
          baseUrlInput.value = platformConfig.baseUrlValue;
        } else if (!baseUrlInput.value && platformConfig.baseUrlValue) {
          baseUrlInput.value = platformConfig.baseUrlValue;
        }
        if (apiLinkEl) {
          apiLinkEl.href = platformConfig.apiHome || apiHomeUrl;
        }
      }
      function renderPlatformKindToggle() {
        const selectedKind = getSettingsPlatformKind();
        platformKindButtons.forEach(button => {
          const isActive = button.dataset.platformKind === selectedKind;
          button.classList.toggle('active', isActive);
          button.setAttribute('aria-selected', String(isActive));
          button.tabIndex = isActive ? 0 : -1;
        });
      }

      function renderPlatformSwitcher() {
        if (!platformSwitcherEl) return;
        const selectedPlatformId = getSettingsPlatformId();
        platformSwitcherEl.innerHTML = '';
        renderPlatformKindToggle();
        getPlatformOrderForKind(getSettingsPlatformKind()).forEach(platformId => {
          const platform = getPlatformConfig(platformId);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'platform-switcher-item';
          button.dataset.platformId = platform.id;
          button.setAttribute('role', 'tab');
          button.setAttribute('aria-selected', String(platform.id === selectedPlatformId));
          if (platform.id === selectedPlatformId) {
            button.classList.add('active');
          }
          if (!platform.supported) {
            button.classList.add('pending');
          }
          if (platform.kind === 'video') {
            button.classList.add('video');
          }
          button.innerHTML = `
            <span class="platform-switcher-name">${platform.label}</span>
            <span class="platform-switcher-meta">${platform.kind === 'video' ? '视频' : '图片'} · ${platform.supported ? '已接入' : '开发中'}</span>
          `;
          const platformMeta = button.querySelector('.platform-switcher-meta');
          if (platformMeta) platformMeta.textContent = `${platform.kind === 'video' ? '视频' : '图片'} · ${platform.supported ? '已接入' : '开发中'}`;
          if (settingsDraft?.dirtyPlatforms?.has(platform.id)) {
            const status = document.createElement('span');
            status.className = 'platform-switcher-status';
            status.title = '未保存';
            status.setAttribute('aria-label', '未保存');
            button.appendChild(status);
          }
          button.addEventListener('click', () => {
            if (settingsIsOpen) selectDraftPlatform(platform.id);
            else setActivePlatform(platform.id);
          });
          button.addEventListener('keydown', event => {
            if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(event.key)) return;
            const items = [...platformSwitcherEl.querySelectorAll('.platform-switcher-item')];
            const index = items.indexOf(button);
            if (index < 0) return;
            event.preventDefault();
            const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
            const next = items[(index + direction + items.length) % items.length];
            next?.focus();
            if (next?.dataset.platformId) {
              if (settingsIsOpen) selectDraftPlatform(next.dataset.platformId);
              else setActivePlatform(next.dataset.platformId);
            }
          });
          platformSwitcherEl.appendChild(button);
        });
        syncMobilePlatformPicker(getPlatformConfig(selectedPlatformId));
      }
      function renderPlatformExtraFields(platformConfig) {
        if (!platformExtraFieldsEl) return;
        platformExtraFieldsEl.innerHTML = '';
        const fields = platformConfig?.extraFields || [];
        fields.forEach(field => {
          const card = document.createElement('div');
          card.className = 'platform-extra-card';
          card.innerHTML = `
            <strong>${field.title}</strong>
            <p>${field.body}</p>
          `;
          platformExtraFieldsEl.appendChild(card);
        });
        platformExtraFieldsEl.hidden = fields.length === 0;
      }

      const IMAGE_ASPECT_OPTIONS = [
        ['auto', 'auto[自动]'],
        ['1:1', '1:1'],
        ['2:3', '2:3'],
        ['3:4', '3:4'],
        ['4:5', '4:5'],
        ['5:4', '5:4'],
        ['4:3', '4:3'],
        ['3:2', '3:2'],
        ['16:9', '16:9'],
        ['9:16', '9:16'],
        ['21:9', '21:9']
      ];
      const VIDEO_ASPECT_OPTIONS = [
        ['16:9', '16:9'],
        ['9:16', '9:16']
      ];
      const ALIYUN_VIDEO_ASPECT_OPTIONS = [
        ['16:9', '16:9'],
        ['9:16', '9:16'],
        ['1:1', '1:1'],
        ['4:3', '4:3'],
        ['3:4', '3:4']
      ];
      const DOUBAO_VIDEO_ASPECT_OPTIONS = [
        ['16:9', '16:9'],
        ['9:16', '9:16'],
        ['1:1', '1:1'],
        ['4:3', '4:3'],
        ['3:4', '3:4'],
        ['21:9', '21:9']
      ];
      const GROK_VIDEO_ASPECT_OPTIONS = [
        ['3:2', '3:2'],
        ['2:3', '2:3'],
        ['1:1', '1:1']
      ];
      const IMAGE_RESOLUTION_OPTIONS = [
        ['1K', '1K'],
        ['2K', '2K'],
        ['4K', '4K']
      ];
      const VIDEO_RESOLUTION_OPTIONS = [
        ['720P', '720P'],
        ['1080P', '1080P']
      ];
      const GEMINI_VIDEO_RESOLUTION_OPTIONS = [
        ['720P', '720P'],
        ['1080P', '1080P'],
        ['4K', '4K']
      ];
      const GROK_VIDEO_RESOLUTION_OPTIONS = [
        ['720P', '720P']
      ];

      function setSelectOptions(selectEl, options, preferredValue) {
        if (!selectEl) return;
        const currentValue = preferredValue ?? selectEl.value;
        selectEl.innerHTML = '';
        options.forEach(([value, label]) => {
          selectEl.add(new Option(label, value));
        });
        const values = new Set(options.map(([value]) => value));
        selectEl.value = values.has(currentValue) ? currentValue : options[0]?.[0] || '';
      }

      function syncPlatformParamControls(platformConfig) {
        const isVideo = platformConfig?.kind === 'video';
        const aspectOptions = isVideo
          ? (platformConfig?.id === 'qwenVideo' ? ALIYUN_VIDEO_ASPECT_OPTIONS : (platformConfig?.id === 'doubaoVideo' ? DOUBAO_VIDEO_ASPECT_OPTIONS : (platformConfig?.id === 'grokVideo' ? GROK_VIDEO_ASPECT_OPTIONS : VIDEO_ASPECT_OPTIONS)))
          : IMAGE_ASPECT_OPTIONS;
        const resolutionOptions = isVideo
          ? (platformConfig?.id === 'geminiVideo' ? GEMINI_VIDEO_RESOLUTION_OPTIONS : (platformConfig?.id === 'grokVideo' ? GROK_VIDEO_RESOLUTION_OPTIONS : VIDEO_RESOLUTION_OPTIONS))
          : IMAGE_RESOLUTION_OPTIONS;
        if (aspectLabelEl) aspectLabelEl.textContent = isVideo ? '视频比例' : '图片比例';
        if (resolutionLabelEl) resolutionLabelEl.textContent = isVideo ? '视频清晰度' : '清晰度';
        if (countLabelEl) countLabelEl.textContent = isVideo ? '生成条数' : '生成张数';
        if (countHelpEl) countHelpEl.textContent = isVideo ? '每次调用会循环生成多条视频（最多 10 条）。' : '每次调用会循环生成多张（最多 10 张）。';

        setSelectOptions(
          aspectSelect,
          aspectOptions,
          isVideo && !aspectOptions.some(([value]) => value === aspectSelect?.value) ? (platformConfig?.id === 'grokVideo' ? '3:2' : '16:9') : aspectSelect?.value
        );
        setSelectOptions(
          resolutionSelect,
          resolutionOptions,
          isVideo && !resolutionOptions.some(([value]) => value === resolutionSelect?.value) ? '720P' : resolutionSelect?.value
        );
      }

      function renderPlatformParams(platformConfig = getActivePlatformConfig()) {
        syncPlatformParamControls(platformConfig);
        const fieldMap = {
          aspect: aspectFieldEl,
          resolution: resolutionFieldEl,
          quality: imageQualityFieldEl,
          format: outputFormatFieldEl,
          background: imageBackgroundFieldEl,
          duration: videoDurationFieldEl,
          count: countFieldEl
        };
        const visibleFields = new Set(platformConfig.fields || []);
        const effectiveImageProtocol = getPlatformImageProtocol(platformConfig.id);
        Object.entries(fieldMap).forEach(([key, fieldEl]) => {
          if (!fieldEl) return;
          const nativeGeminiQuality = platformConfig.id === 'gemini'
            && effectiveImageProtocol === 'gemini'
            && key === 'quality';
          const visible = visibleFields.has(key) && !nativeGeminiQuality;
          fieldEl.hidden = !visible;
          fieldEl.classList.toggle('is-hidden', !visible);
        });
        renderPlatformExtraFields(platformConfig);
        if (platformPendingBoxEl) {
          platformPendingBoxEl.hidden = !!platformConfig.supported;
        }
        if (platformParamsSummaryEl) {
          platformParamsSummaryEl.textContent = platformConfig.paramSummary || '';
        }
      }
      function syncPromptHints(platformConfig) {
        const templateHint = platformConfig.templateHint || '';
        const supportNote = platformConfig.supportNote || '';
        if (platformTemplateHintEl) {
          platformTemplateHintEl.textContent = templateHint;
        }
        if (platformSupportNoteEl) {
          platformSupportNoteEl.textContent = supportNote;
          platformSupportNoteEl.classList.toggle('pending', !platformConfig.supported);
        }
        const templatePanel = platformTemplateHintEl?.closest('.platform-template-panel')
          || platformSupportNoteEl?.closest('.platform-template-panel');
        if (templatePanel) {
          templatePanel.hidden = !templateHint && !supportNote;
        }
        if (promptPlatformHintEl) {
          promptPlatformHintEl.textContent = platformConfig.promptHint || '';
        }
      }
      function syncPlatformSummary() {
        const platformConfig = getActivePlatformConfig();
        const protocolLabel = protocolSelect?.selectedOptions?.[0]?.textContent?.trim() || platformConfig.defaultProtocol;
        const routeLabel = proxyModeInput?.checked ? '代理模式' : '直连模式';
        const currentNameEl = document.getElementById('provider-current-name');
        const currentProtocolEl = document.getElementById('provider-current-protocol');
        const currentRouteEl = document.getElementById('provider-current-route');
        const currentModelEl = document.getElementById('provider-current-model');

        if (platformTitleEl) platformTitleEl.textContent = platformConfig.label;
        if (platformTypeBadgeEl) {
          platformTypeBadgeEl.textContent = platformConfig.kind === 'video' ? '视频平台' : '图片平台';
          platformTypeBadgeEl.classList.toggle('video', platformConfig.kind === 'video');
          platformTypeBadgeEl.classList.toggle('pending', !platformConfig.supported);
        }
        if (platformMetaNoteEl) {
          platformMetaNoteEl.textContent = platformConfig.summary || '';
        }
        if (currentNameEl) currentNameEl.textContent = platformConfig.label;
        if (currentProtocolEl) currentProtocolEl.textContent = protocolLabel;
        if (currentRouteEl) currentRouteEl.textContent = routeLabel;
        if (currentModelEl) currentModelEl.textContent = getImageModel();
      }
      function updatePlatformActionAvailability() {
        const platformConfig = getActivePlatformConfig();
        const isSupported = !!platformConfig.supported;
        if (runBtn) {
          if (!generationInFlight) {
            runBtn.disabled = !isSupported;
            runBtn.textContent = isSupported ? '发送请求' : '平台待接入';
            runBtn.removeAttribute('aria-busy');
          } else {
            runBtn.disabled = true;
          }
        }
        syncMobileGenerateBar();
      }
      function persistActivePlatformSnapshot() {
        if (settingsIsOpen && settingsDraft) {
          captureSettingsDraftPlatform();
          markSettingsDirty();
          return;
        }
        savePlatformSettings(activePlatformId);
        if (committedSettingsSnapshot) {
          committedSettingsSnapshot.platformSettings[activePlatformId] = {
            ...(committedSettingsSnapshot.platformSettings[activePlatformId] || {}),
            ...collectCurrentPlatformSettings()
          };
        }
      }
      function ensurePlatformFeatureAvailable(featureLabel = '当前功能') {
        if (isActivePlatformSupported()) return true;
        flashStatus(`${featureLabel}在当前平台尚未接入`, 'danger');
        return false;
      }
      function setActivePlatform(platformId, options = {}) {
        const previousPlatformId = activePlatformId;
        if (!options.skipPersistCurrent && previousPlatformId && previousPlatformId !== platformId) {
          savePlatformSettings(previousPlatformId);
        }
        const nextPlatform = getPlatformConfig(platformId);
        activePlatformId = nextPlatform.id;
        activePlatformKind = getPlatformKind(activePlatformId);
        localStorage.setItem(ACTIVE_PLATFORM_STORAGE_KEY, activePlatformId);
        localStorage.setItem(ACTIVE_PLATFORM_KIND_STORAGE_KEY, activePlatformKind);

        const platformSettings = options.settings || loadPlatformSettings(activePlatformId);
        applyPlatformSettings(nextPlatform, platformSettings);
        syncPlatformBaseUrl(nextPlatform);
        renderPlatformSwitcher();
        renderPlatformParams(nextPlatform);
        syncPromptHints(nextPlatform);
        updateReferenceImageLimitText();
        updatePlatformActionAvailability();
        syncPlatformSummary();
        if (!settingsIsOpen) refreshCommittedSettingsSnapshot();
      }

      function setActivePlatformKind(kind) {
        if (settingsIsOpen) {
          setDraftPlatformKind(kind);
          return;
        }
        const nextKind = kind === 'video' ? 'video' : 'image';
        activePlatformKind = nextKind;
        localStorage.setItem(ACTIVE_PLATFORM_KIND_STORAGE_KEY, activePlatformKind);
        const nextPlatformId = ensurePlatformMatchesKind(activePlatformId, activePlatformKind);
        setActivePlatform(nextPlatformId);
      }

      function getReferenceImageLimit(protocol = getImageProtocol()) {
        if (activePlatformId === 'openaiVideo' && protocol === 'openai-videos') return 1;
        if (activePlatformId === 'geminiVideo') return 3;
        if (activePlatformId === 'gemini' && protocol === 'openai-images') return 1;
        if (activePlatformId === 'qwenVideo') return String(getImageModel() || '').includes('r2v') ? 9 : 1;
        if (activePlatformId === 'doubaoVideo') return 4;
        if (activePlatformId === 'grokVideo') return 4;
        if (activePlatformId === 'flux' && protocol === 'replicate-flux') return 1;
        if (activePlatformId === 'doubao' && (protocol === 'doubao-images' || protocol === 'open-images')) return 14;
        if (protocol === 'open-images' || protocol === 'aliyun-images') return 3;
        return protocol === 'gemini' ? 14 : 4;
      }

      function getReferenceImagesForRequest(images = state.images, protocol = getImageProtocol()) {
        return (images || []).slice(0, getReferenceImageLimit(protocol));
      }

      function isGoogleGeminiApiBaseUrl(value = getBaseUrl()) {
        const parsed = parseBaseUrl(value);
        const hostname = parsed?.url?.hostname?.toLowerCase() || '';
        return hostname === 'generativelanguage.googleapis.com';
      }

      function isGeminiPlatform(platformId = activePlatformId) {
        return platformId === 'gemini' || platformId === 'geminiVideo';
      }

      function isGoogleNativeGeminiPlatform(platformId = activePlatformId, baseUrl = getBaseUrl()) {
        return isGeminiPlatform(platformId) && isGoogleGeminiApiBaseUrl(baseUrl);
      }

      function resolveGeminiEffectiveProtocol({ platformId = activePlatformId, protocol = getProtocol(), baseUrl = getBaseUrl() } = {}) {
        if (platformId !== 'gemini') return protocol;
        return isGoogleGeminiApiBaseUrl(baseUrl) ? 'gemini' : 'openai-images';
      }

      function getPlatformImageProtocol(platformId = activePlatformId, platformSettings = null) {
        const platformConfig = getPlatformConfig(platformId);
        const settings = platformSettings
          || (settingsDraft?.activePlatformId === platformId ? settingsDraft.platformSettings?.[platformId] : null)
          || getRuntimePlatformSettings(platformId)
          || {};
        return resolveGeminiEffectiveProtocol({
          platformId,
          protocol: settings.protocol || platformConfig.defaultProtocol || 'openai-chat',
          baseUrl: settings.baseUrl || platformConfig.baseUrlValue || defaultBaseUrl
        });
      }

      function getImageProtocol() {
        const platformId = settingsConnectionOverride?.platformId || activePlatformId;
        return resolveGeminiEffectiveProtocol({
          platformId,
          protocol: getProtocol(),
          baseUrl: getBaseUrl()
        });
      }

      function resolveImageEndpoint() {
        const platformConfig = getActivePlatformConfig();
        if (typeof platformConfig.endpointResolver === 'function') {
          const resolved = platformConfig.endpointResolver({
            protocol: getImageProtocol(),
            imageModel: getImageModel(),
            textModel: getTextModel(),
            baseUrl: getBaseUrl()
          });
          if (resolved) return resolved;
        }
        return getEndpoint();
      }

      function resolveTextEndpoint() {
        const platformConfig = getActivePlatformConfig();
        if (typeof platformConfig.flashEndpointResolver === 'function') {
          const resolved = platformConfig.flashEndpointResolver({
            protocol: getProtocol(),
            imageModel: getImageModel(),
            textModel: getTextModel(),
            baseUrl: getBaseUrl()
          });
          if (resolved) return resolved;
        }
        return getFlashEndpoint();
      }

      function buildRequestHeaders(key, protocol = getProtocol()) {
        const headers = { 'Content-Type': 'application/json' };
        const effectiveProtocol = activePlatformId === 'gemini' ? getImageProtocol() : protocol;
        const platformId = settingsConnectionOverride?.platformId || activePlatformId;
        if (effectiveProtocol === 'gemini' && isGoogleNativeGeminiPlatform(platformId)) {
          headers['X-Goog-Api-Key'] = key;
        } else {
          headers['Authorization'] = `Bearer ${key}`;
        }
        return headers;
      }

      function getModelListEndpoints(protocol = getProtocol()) {
        const effectiveProtocol = activePlatformId === 'gemini' ? getImageProtocol() : protocol;
        if (effectiveProtocol === 'gemini') {
          return [buildApiUrl('/v1beta/models'), buildApiUrl('/v1/models')];
        }
        if (effectiveProtocol === 'aliyun-images' || effectiveProtocol === 'aliyun-happyhorse') {
          return [buildApiUrl('/compatible-mode/v1/models'), buildApiUrl('/v1/models')];
        }
        if (effectiveProtocol === 'doubao-seedance') {
          return [buildApiUrl('/v1/models')];
        }
        return [buildApiUrl('/v1/models')];
      }

      // 获取生图 endpoint（根据协议自动切换）
      function getEndpoint() {
        const protocol = getImageProtocol();
        if (protocol === 'openai-chat') {
          return buildApiUrl('/v1/chat/completions');
        }
        if (protocol === 'aliyun-images') {
          return buildApiUrl('/api/v1/services/aigc/multimodal-generation/generation');
        }
        if (protocol === 'openai-responses') {
          return buildApiUrl('/v1/responses');
        }
        if (protocol === 'openai-images') {
          return buildApiUrl('/v1/images/generations');
        }
        if (protocol === 'open-images') {
          return buildApiUrl('/v1/images/generations');
        }
        if (protocol === 'doubao-images') {
          return buildApiUrl('/v1/images/generations');
        }
        if (protocol === 'replicate-flux') {
          return buildApiUrl(`/v1/models/${getImageModel()}/predictions`);
        }
        // Gemini 原生
        return buildApiUrl(`/v1beta/models/${getImageModel()}:generateContent`);
      }

      // 文本操作 endpoint（分镜分析、优化、翻译）
      function getFlashEndpoint() {
        return buildApiUrl('/v1/chat/completions');
      }

      function getTextCapabilityStatus() {
        const platformId = settingsConnectionOverride?.platformId || activePlatformId;
        const isBlocked = isGoogleNativeGeminiPlatform(platformId);
        const message = 'Gemini 原生 Google 地址仅支持原生图片接口；文本工具和 Agent 需要切换到支持 OpenAI Chat 的兼容中转 Base URL。';
        return {
          available: !isBlocked,
          supported: !isBlocked,
          mode: isBlocked ? 'gemini-native-image-only' : 'openai-chat-compatible',
          protocol: isBlocked ? 'gemini' : 'openai-chat',
          endpoint: isBlocked ? '' : resolveTextEndpoint(),
          message: isBlocked ? message : ''
        };
      }

      function ensureTextCapabilityAvailable(featureLabel = '文本功能') {
        const capability = getTextCapabilityStatus();
        if (capability.available) return true;
        flashStatus(`${featureLabel}不可用：${capability.message}`, 'danger');
        return false;
      }

      const apiKeyInput = document.getElementById('api-key');
      const rememberApiKeyInput = document.getElementById('remember-api-key');
      const textApiKeyInput = document.getElementById('text-api-key');
      const apiKeyToggleBtn = document.getElementById('api-key-toggle');
      const textApiKeyToggleBtn = document.getElementById('text-api-key-toggle');
      const API_KEY_STORAGE_KEY = 'gemini_api_key';
      const API_KEY_REMEMBER_KEY = 'gemini_api_key_remember';
      const TEXT_API_KEY_STORAGE_KEY = 'text_api_key_override';
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
        const sessionKey = sessionStorage.getItem(TEXT_API_KEY_STORAGE_KEY) || '';
        if (sessionKey) return sessionKey;

        const localKey = localStorage.getItem(TEXT_API_KEY_STORAGE_KEY) || '';
        if (localStorage.getItem(API_KEY_REMEMBER_KEY) === '1') return localKey;

        localStorage.removeItem(TEXT_API_KEY_STORAGE_KEY);
        return '';
      }

      function persistTextApiKey(key, remember = localStorage.getItem(API_KEY_REMEMBER_KEY) === '1') {
        const value = (key || '').trim();
        textApiKeyValue = value;
        sessionStorage.removeItem(TEXT_API_KEY_STORAGE_KEY);
        localStorage.removeItem(TEXT_API_KEY_STORAGE_KEY);

        if (value) {
          if (remember) {
            localStorage.setItem(TEXT_API_KEY_STORAGE_KEY, value);
          } else {
            sessionStorage.setItem(TEXT_API_KEY_STORAGE_KEY, value);
          }
        }
      }

      function renderApiKeyMask() {
        if (apiKeyInput) apiKeyInput.value = apiKeyValue || '';
      }

      function getApiKey() {
        if (settingsConnectionOverride?.apiKey !== undefined) return settingsConnectionOverride.apiKey || '';
        if (committedSettingsSnapshot?.apiKey !== undefined) return committedSettingsSnapshot.apiKey || '';
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
        if (settingsConnectionOverride?.textApiKey !== undefined) {
          return (settingsConnectionOverride.textApiKey || '').trim() || (settingsConnectionOverride.apiKey || '');
        }
        if (committedSettingsSnapshot?.textApiKey !== undefined) {
          return (committedSettingsSnapshot.textApiKey || '').trim() || getApiKey();
        }
        return (textApiKeyValue || '').trim() || getApiKey();
      }

      apiKeyInput.addEventListener('paste', (event) => {
        const pastedText = event.clipboardData?.getData('text')?.trim();
        if (!pastedText) return;

        event.preventDefault();
        apiKeyValue = pastedText;
        renderApiKeyMask();
        if (settingsIsOpen) {
          captureSettingsDraftPlatform();
          markSettingsDirty();
        }
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

      function setSecretVisibility(input, button, visible) {
        if (!input || !button) return;
        input.type = visible ? 'text' : 'password';
        const label = visible ? '隐藏' : '显示';
        button.title = `${label}${input.id === 'api-key' ? ' API Key' : '文本 Key'}`;
        button.setAttribute('aria-label', button.title);
        const icon = button.querySelector('[data-lucide]');
        if (icon) icon.setAttribute('data-lucide', visible ? 'eye-off' : 'eye');
        try { window.lucide?.createIcons?.(); } catch {}
      }

      apiKeyToggleBtn?.addEventListener('click', () => {
        setSecretVisibility(apiKeyInput, apiKeyToggleBtn, apiKeyInput.type !== 'text');
      });
      textApiKeyToggleBtn?.addEventListener('click', () => {
        setSecretVisibility(textApiKeyInput, textApiKeyToggleBtn, textApiKeyInput.type !== 'text');
      });
      textApiKeyInput?.addEventListener('input', () => {
        textApiKeyValue = textApiKeyInput.value.trim();
        if (settingsIsOpen) captureSettingsDraftPlatform();
        markSettingsDirty();
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
      let generationInFlight = false;
      const mobileGenerateBar = document.getElementById('mobile-generate-bar');
      const mobileGenerateBtn = document.getElementById('mobile-generate-btn');
      const mobileGenerateMeta = document.getElementById('mobile-generate-meta');

      function syncMobileGenerateBar(options = {}) {
        if (!mobileGenerateBtn && !mobileGenerateMeta) return;
        const count = Math.max(1, Math.min(10, parseInt(countInput?.value, 10) || 1));
        const platformConfig = typeof getActivePlatformConfig === 'function' ? getActivePlatformConfig() : null;
        const isSupported = platformConfig ? !!platformConfig.supported : !runBtn?.disabled;
        const busy = !!generationInFlight || options.busy === true;
        const statusText = options.statusText
          || (busy ? (options.progressText || '生成中...') : (isSupported ? `${count} 张` : '平台待接入'));
        if (mobileGenerateMeta) mobileGenerateMeta.textContent = statusText;
        if (mobileGenerateBtn) {
          mobileGenerateBtn.disabled = busy || !isSupported;
          mobileGenerateBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
          mobileGenerateBtn.textContent = busy
            ? (options.buttonText || '生成中...')
            : (isSupported ? (runBtn?.textContent || '发送请求') : '平台待接入');
        }
        if (mobileGenerateBar) {
          mobileGenerateBar.dataset.busy = busy ? 'true' : 'false';
          mobileGenerateBar.hidden = document.body.classList.contains('agent-mode-open');
        }
      }

      const preview = document.getElementById('upload-preview');
      const resultsEl = document.getElementById('results');
      const resultsEmptyEl = document.getElementById('results-empty');
      const resultCountEl = document.getElementById('result-count');
      const resultsActionsEl = document.getElementById('results-actions');

      function getResultOutputChildren() {
        if (!resultsEl) return [];
        return Array.from(resultsEl.children).filter((child) => {
          if (child === resultsEmptyEl) return false;
          return child.classList.contains('result-card') || child.classList.contains('result-group');
        });
      }

      const outputRailTabs = [...document.querySelectorAll('[data-output-tab]')];
      const outputRailPanels = [...document.querySelectorAll('[data-output-panel]')];
      let previousOutputCount = 0;

      function setOutputRailTab(name = 'results', shouldFocus = false) {
        const active = name === 'history' ? 'history' : 'results';
        outputRailTabs.forEach(tab => {
          const selected = tab.dataset.outputTab === active;
          tab.classList.toggle('is-active', selected);
          tab.setAttribute('aria-selected', String(selected));
          tab.tabIndex = selected ? 0 : -1;
          if (selected && shouldFocus) tab.focus();
        });
        outputRailPanels.forEach(panel => {
          panel.hidden = panel.dataset.outputPanel !== active;
        });
      }

      function syncResultsEmptyState() {
        if (!resultsEl) return;
        if (resultsEmptyEl && resultsEmptyEl.parentElement !== resultsEl) {
          resultsEl.appendChild(resultsEmptyEl);
        }
        const outputs = getResultOutputChildren();
        const hasTransferableImages = typeof collectResultImageSources === 'function'
          && collectResultImageSources().length > 0;
        if (resultsEmptyEl) resultsEmptyEl.hidden = outputs.length > 0;
        if (resultCountEl) resultCountEl.textContent = `${outputs.length} 条`;
        const sendResultsBtn = document.getElementById('send-results-to-canvas');
        const clearResultsBtn = document.getElementById('clear-results');
        if (sendResultsBtn) sendResultsBtn.hidden = !hasTransferableImages;
        if (clearResultsBtn) clearResultsBtn.hidden = outputs.length === 0;
        if (resultsActionsEl) resultsActionsEl.hidden = outputs.length === 0;
        if (outputs.length > previousOutputCount) setOutputRailTab('results');
        previousOutputCount = outputs.length;
      }

      syncResultsEmptyState();
      outputRailTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => setOutputRailTab(tab.dataset.outputTab, false));
        tab.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const nextIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? outputRailTabs.length - 1
              : (index + (event.key === 'ArrowRight' ? 1 : -1) + outputRailTabs.length) % outputRailTabs.length;
          setOutputRailTab(outputRailTabs[nextIndex]?.dataset.outputTab, true);
        });
      });
      const announcementBtn = document.getElementById('announcement-btn');
      const announcementModal = document.getElementById('announcement-modal');
      const announcementCloseBtn = document.getElementById('announcement-close');
      const settingsOpenBtn = document.getElementById('settings-open-btn');
      const settingsCloseBtn = document.getElementById('settings-close-btn');
      const settingsDrawer = document.getElementById('settings-drawer');
      const settingsDrawerOverlay = document.getElementById('settings-drawer-overlay');
      const settingsCancelBtn = document.getElementById('settings-cancel-btn');
      const settingsDirtyStatus = document.getElementById('settings-dirty-status');
      const settingsTabs = [...document.querySelectorAll('#settings-tabs [data-settings-tab]')];
      const settingsPanels = [...document.querySelectorAll('[data-settings-panel]')];
      const settingsConfirm = document.getElementById('settings-confirm');
      const settingsConfirmCancel = document.getElementById('settings-confirm-cancel');
      const settingsConfirmDiscard = document.getElementById('settings-confirm-discard');
      const settingsMoreBtn = document.getElementById('settings-more-btn');
      const settingsMoreMenu = document.getElementById('settings-more-menu');
      const resetPlatformSettingsBtn = document.getElementById('reset-platform-settings');
      const testConnectionBtn = document.getElementById('test-connection-btn');
      const updateModelsBtn = document.getElementById('update-models-btn');
      const connectionStatusEl = document.getElementById('connection-status');
      const connectionStatusTextEl = document.getElementById('connection-status-text');
      const exportSettingsBtn = document.getElementById('export-settings-btn');
      const importSettingsBtn = document.getElementById('import-settings-btn');
      const settingsImportFile = document.getElementById('settings-import-file');
      const includeCredentialsInput = document.getElementById('include-credentials');
      const sensitiveExportWarning = document.getElementById('sensitive-export-warning');
      const settingsImportSummary = document.getElementById('settings-import-summary');
      const platformSwitcherEl = document.getElementById('platform-switcher');
      const mobilePlatformPickerToggle = document.getElementById('mobile-platform-picker-toggle');
      const mobilePlatformPickerNameEl = document.getElementById('mobile-platform-picker-name');
      const mobilePlatformPickerMetaEl = document.getElementById('mobile-platform-picker-meta');
      const mobilePlatformPickerStatusEl = document.getElementById('mobile-platform-picker-status');
      const platformKindButtons = [...document.querySelectorAll('.platform-kind-btn')];
      const platformTitleEl = document.getElementById('platform-title');
      const platformTypeBadgeEl = document.getElementById('platform-type-badge');
      const platformMetaNoteEl = document.getElementById('platform-meta-note');
      const platformTemplateHintEl = document.getElementById('platform-template-hint');
      const platformSupportNoteEl = document.getElementById('platform-support-note');
      const promptPlatformHintEl = document.getElementById('prompt-platform-hint');
      const platformParamsSummaryEl = document.getElementById('platform-params-summary');
      const platformExtraFieldsEl = document.getElementById('platform-extra-fields');
      const platformPendingBoxEl = document.getElementById('platform-pending-box');
      const baseUrlFieldEl = document.getElementById('base-url-field');
      const apiKeyFieldEl = document.getElementById('api-key-field');
      const imageModelFieldEl = document.getElementById('image-model-field');
      const textModelFieldEl = document.getElementById('text-model-field');
      const apiProtocolFieldEl = document.getElementById('api-protocol-field');
      const aspectFieldEl = document.getElementById('aspect-field');
      const resolutionFieldEl = document.getElementById('resolution-field');
      const imageQualityFieldEl = document.getElementById('image-quality-field');
      const outputFormatFieldEl = document.getElementById('output-format-field');
      const imageBackgroundFieldEl = document.getElementById('image-background-field');
      const countFieldEl = document.getElementById('count-field');
      const videoDurationFieldEl = document.getElementById('video-duration-field');
      const videoDurationSelect = document.getElementById('video-duration');
      const aspectLabelEl = document.getElementById('aspect-label');
      const resolutionLabelEl = document.getElementById('resolution-label');
      const countLabelEl = document.getElementById('count-label');
      const countHelpEl = document.getElementById('count-help');

      let mobilePlatformPickerExpanded = false;

      function isMobileSettingsLayout() {
        return window.matchMedia?.('(max-width: 599px)').matches === true;
      }

      function setMobilePlatformPickerExpanded(expanded = false) {
        const isMobile = isMobileSettingsLayout();
        mobilePlatformPickerExpanded = isMobile && !!expanded;
        if (platformSwitcherEl) {
          platformSwitcherEl.hidden = isMobile ? !mobilePlatformPickerExpanded : false;
          platformSwitcherEl.setAttribute('aria-hidden', String(isMobile && !mobilePlatformPickerExpanded));
        }
        if (mobilePlatformPickerToggle) {
          mobilePlatformPickerToggle.setAttribute('aria-expanded', String(mobilePlatformPickerExpanded));
        }
      }

      function syncMobilePlatformPicker(platformConfig = getPlatformConfig(settingsDraft?.activePlatformId || activePlatformId)) {
        if (!platformConfig) return;
        if (mobilePlatformPickerNameEl) mobilePlatformPickerNameEl.textContent = platformConfig.label;
        if (mobilePlatformPickerMetaEl) mobilePlatformPickerMetaEl.textContent = platformConfig.kind === 'video' ? '视频平台' : '图片平台';
        const isDirty = !!settingsDraft?.dirtyPlatforms?.has(platformConfig.id);
        mobilePlatformPickerStatusEl?.classList.toggle('is-dirty', isDirty);
        if (mobilePlatformPickerStatusEl) {
          mobilePlatformPickerStatusEl.title = isDirty ? '未保存' : '';
          mobilePlatformPickerStatusEl.setAttribute('aria-label', isDirty ? '未保存' : '');
        }
      }

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
      let lightboxDialogHandle = null;
      let announcementDialogHandle = null;
      let settingsDialogHandle = null;
      let settingsConfirmDialogHandle = null;
      let angleDialogHandle = null;

      // 打开 Lightbox
      function openLightbox(imgSrc) {
        lightboxDialogHandle?.close?.('replace', { restoreFocus: false });
        lightboxImg.src = imgSrc;
        lightboxDialogHandle = window.AppUtils?.dialog?.open?.({
          element: lightbox,
          container: lightbox,
          label: '图片预览',
          openClass: 'show',
          closeClass: 'show',
          trigger: document.activeElement
        }) || null;
        if (!lightboxDialogHandle) lightbox.classList.add('show');
      }

      // 关闭 Lightbox
      function closeLightbox() {
        if (lightboxDialogHandle) {
          const handle = lightboxDialogHandle;
          lightboxDialogHandle = null;
          handle.close('close');
        } else {
          lightbox.classList.remove('show');
          lightbox.hidden = true;
        }
      }

      function openAnnouncementModal() {
        if (!announcementModal) return;
        announcementDialogHandle?.close?.('replace', { restoreFocus: false });
        announcementDialogHandle = window.AppUtils?.dialog?.open?.({
          element: announcementModal.querySelector('[role="dialog"]') || announcementModal,
          container: announcementModal,
          label: '公告',
          openClass: 'active',
          closeClass: 'active',
          trigger: announcementBtn
        }) || null;
        if (!announcementDialogHandle) {
          announcementModal.classList.add('active');
          announcementModal.setAttribute('aria-hidden', 'false');
        }
      }

      function closeAnnouncementModal() {
        if (!announcementModal) return;
        if (announcementDialogHandle) {
          const handle = announcementDialogHandle;
          announcementDialogHandle = null;
          handle.close('close');
        } else {
          announcementModal.classList.remove('active');
          announcementModal.setAttribute('aria-hidden', 'true');
        }
      }

      function isSafeObjectKey(key) {
        return key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
      }

      function clonePlatformSettingsMap(source = {}) {
        return Object.fromEntries(Object.entries(source || {})
          .filter(([id]) => isSafeObjectKey(id))
          .map(([id, value]) => [id, { ...(value || {}) }]));
      }

      function cloneModelLists(source = {}) {
        return Object.fromEntries(Object.entries(source || {}).filter(([id]) => isSafeObjectKey(id)).map(([id, models]) => [
          id,
          Array.isArray(models) ? models.map(model => ({ id: String(model.id || ''), name: String(model.name || model.id || '') })).filter(model => model.id) : []
        ]));
      }

      function getCurrentModelListFromControls() {
        const values = new Map();
        [imageModelSelect, textModelSelect].forEach(select => {
          [...(select?.options || [])].forEach(option => {
            if (option.value) values.set(option.value, { id: option.value, name: option.textContent || option.value });
          });
        });
        return [...values.values()];
      }

      function getSettingsPlatformSignature(draft, platformId) {
        if (!draft) return '';
        return JSON.stringify({
          settings: draft.platformSettings?.[platformId] || {},
          models: draft.modelLists?.[platformId] || []
        });
      }

      function getSettingsDraftSignature(draft) {
        if (!draft) return '';
        const platformSettings = Object.fromEntries(Object.keys(draft.platformSettings || {}).sort().map(platformId => [
          platformId,
          draft.platformSettings?.[platformId] || {}
        ]));
        const modelLists = Object.fromEntries(Object.keys(draft.modelLists || {}).sort().map(platformId => [
          platformId,
          draft.modelLists?.[platformId] || []
        ]));
        return JSON.stringify({
          activePlatformId: draft.activePlatformId,
          activePlatformKind: draft.activePlatformKind,
          platformSettings,
          modelLists,
          apiKey: draft.apiKey || '',
          textApiKey: draft.textApiKey || '',
          rememberApiKey: !!draft.rememberApiKey,
          historyRetention: draft.historyRetention || 'original',
          folderAction: draft.folderAction || null,
          folderName: draft.folderHandle?.name || ''
        });
      }

      function refreshCommittedSettingsSnapshot() {
        const platformSettings = clonePlatformSettingsMap(getStoredPlatformSettingsMap());
        const current = collectCurrentPlatformSettings();
        platformSettings[activePlatformId] = { ...(platformSettings[activePlatformId] || {}), ...current };
        committedSettingsSnapshot = {
          activePlatformId,
          activePlatformKind,
          platformSettings,
          apiKey: apiKeyValue || '',
          textApiKey: textApiKeyValue || '',
          rememberApiKey: !!rememberApiKeyInput?.checked,
          historyRetention: getHistoryImageRetention()
        };
      }

      function createSettingsDraft() {
        if (!committedSettingsSnapshot) refreshCommittedSettingsSnapshot();
        const platformSettings = clonePlatformSettingsMap(committedSettingsSnapshot?.platformSettings || getStoredPlatformSettingsMap());
        platformSettings[activePlatformId] = {
          ...(platformSettings[activePlatformId] || {}),
          ...collectCurrentPlatformSettings()
        };
        const modelLists = {};
        Object.keys(PLATFORM_REGISTRY).forEach(platformId => {
          modelLists[platformId] = getStoredModels(platformId).map(model => ({ ...model }));
        });
        modelLists[activePlatformId] = getCurrentModelListFromControls();
        const draft = {
          activePlatformId,
          activePlatformKind,
          platformSettings,
          modelLists,
          apiKey: apiKeyValue || '',
          textApiKey: textApiKeyValue || '',
          rememberApiKey: !!rememberApiKeyInput?.checked,
          historyRetention: getHistoryImageRetention(),
          folderHandle,
          folderAction: null,
          dirtyPlatforms: new Set(),
          dirty: false
        };
        draft.initialSignature = getSettingsDraftSignature(draft);
        draft.initialPlatformSignatures = Object.fromEntries(Object.keys(PLATFORM_REGISTRY).map(platformId => [
          platformId,
          getSettingsPlatformSignature(draft, platformId)
        ]));
        return draft;
      }

      function markSettingsDirty() {
        if (!settingsDraft) return;
        settingsDraft.dirtyPlatforms?.add(settingsDraft.activePlatformId);
        clearConnectionStatus();
        syncSettingsDirtyState();
      }

      function setConnectionStatus(message = '', tone = '') {
        if (!connectionStatusEl) return;
        connectionStatusEl.classList.remove('success', 'warning', 'danger');
        if (tone) connectionStatusEl.classList.add(tone);
        connectionStatusEl.hidden = !message;
        if (connectionStatusTextEl) connectionStatusTextEl.textContent = message;
        else connectionStatusEl.textContent = message;
        const connectionStatusIconEl = connectionStatusEl.querySelector('.connection-status-icon, [data-lucide]');
        if (connectionStatusIconEl) {
          const iconName = tone === 'success'
            ? 'circle-check'
            : tone === 'warning'
              ? 'triangle-alert'
              : tone === 'danger'
                ? 'circle-x'
                : message
                  ? 'loader-circle'
                  : 'circle-dashed';
          connectionStatusIconEl.setAttribute('data-lucide', iconName);
          try { window.lucide?.createIcons?.(); } catch {}
        }
      }

      function clearConnectionStatus() {
        setConnectionStatus('');
        if (updateModelsBtn) updateModelsBtn.hidden = true;
        if (settingsDraft) settingsDraft.pendingModels = null;
      }

      function syncSettingsDirtyState() {
        if (settingsDraft) {
          settingsDraft.dirty = getSettingsDraftSignature(settingsDraft) !== settingsDraft.initialSignature;
          Object.keys(settingsDraft.initialPlatformSignatures || {}).forEach(platformId => {
            const currentSignature = getSettingsPlatformSignature(settingsDraft, platformId);
            if (currentSignature === settingsDraft.initialPlatformSignatures[platformId]) {
              settingsDraft.dirtyPlatforms?.delete(platformId);
            } else {
              settingsDraft.dirtyPlatforms?.add(platformId);
            }
          });
        }
        const dirty = !!settingsDraft?.dirty;
        if (settingsDirtyStatus) {
          settingsDirtyStatus.textContent = dirty ? '未保存' : '未修改';
          settingsDirtyStatus.classList.toggle('is-dirty', dirty);
        }
        syncMobilePlatformPicker(getPlatformConfig(settingsDraft?.activePlatformId || activePlatformId));
        if (saveKeyBtn) saveKeyBtn.disabled = !dirty;
      }

      function captureSettingsDraftPlatform() {
        if (!settingsDraft) return;
        const platformId = settingsDraft.activePlatformId;
        settingsDraft.platformSettings[platformId] = {
          ...(settingsDraft.platformSettings[platformId] || {}),
          ...collectCurrentPlatformSettings()
        };
        settingsDraft.modelLists[platformId] = getCurrentModelListFromControls();
        const shownApiKey = apiKeyInput?.value?.trim() || '';
        settingsDraft.apiKey = shownApiKey.includes('*') && apiKeyValue ? apiKeyValue : shownApiKey;
        settingsDraft.textApiKey = textApiKeyInput?.value?.trim() || textApiKeyValue || '';
        settingsDraft.rememberApiKey = !!rememberApiKeyInput?.checked;
        settingsDraft.historyRetention = getHistoryImageRetention();
      }

      function syncSettingsFolderUi() {
        const handle = settingsDraft ? settingsDraft.folderHandle : folderHandle;
        const supported = !isMobileDevice() && 'showDirectoryPicker' in window;
        if (selectFolderBtn) {
          selectFolderBtn.disabled = !supported;
          selectFolderBtn.title = supported ? '选择保存文件夹' : '当前浏览器不支持选择文件夹';
        }
        if (savePathEl) savePathEl.textContent = handle?.name || (supported ? '未选择' : '浏览器默认下载位置');
        if (resetFolderBtn) resetFolderBtn.hidden = !handle;
        const note = document.getElementById('folder-support-note');
        if (note) note.textContent = supported
          ? '支持 File System Access 的浏览器可选择文件夹；取消不会改变当前保存位置。'
          : '当前浏览器不支持文件夹句柄，将使用浏览器默认下载位置。';
      }

      function syncSettingsPlatformDetails(platformConfig) {
        if (!platformConfig) return;
        if (platformTitleEl) platformTitleEl.textContent = platformConfig.label;
        if (platformTypeBadgeEl) {
          platformTypeBadgeEl.textContent = platformConfig.kind === 'video' ? '视频平台' : '图片平台';
          platformTypeBadgeEl.classList.toggle('video', platformConfig.kind === 'video');
          platformTypeBadgeEl.classList.toggle('pending', !platformConfig.supported);
        }
        if (platformMetaNoteEl) platformMetaNoteEl.textContent = platformConfig.summary || '';
      }

      function renderSettingsDraftPlatform() {
        if (!settingsDraft) return;
        const platformConfig = getPlatformConfig(settingsDraft.activePlatformId);
        const platformSettings = settingsDraft.platformSettings[settingsDraft.activePlatformId] || {};
        applyPlatformSettings(platformConfig, platformSettings);
        syncPlatformBaseUrl(platformConfig, settingsDraft.activePlatformId);
        renderPlatformSwitcher();
        setMobilePlatformPickerExpanded(false);
        renderPlatformParams(platformConfig);
        syncPromptHints(platformConfig);
        syncSettingsPlatformDetails(platformConfig);
        syncMobilePlatformPicker(platformConfig);
        if (apiKeyInput) {
          apiKeyInput.value = settingsDraft.apiKey || '';
          apiKeyInput.type = 'password';
        }
        if (textApiKeyInput) {
          textApiKeyInput.value = settingsDraft.textApiKey || '';
          textApiKeyInput.type = 'password';
        }
        if (rememberApiKeyInput) rememberApiKeyInput.checked = !!settingsDraft.rememberApiKey;
        setHistoryImageRetention(settingsDraft.historyRetention);
        syncSettingsFolderUi();
        if (settingsMoreMenu) settingsMoreMenu.hidden = true;
        settingsMoreBtn?.setAttribute('aria-expanded', 'false');
        syncSettingsDirtyState();
        try { window.lucide?.createIcons?.(); } catch {}
      }

      function selectDraftPlatform(platformId) {
        if (!settingsDraft || !PLATFORM_REGISTRY[platformId]) return;
        captureSettingsDraftPlatform();
        settingsDraft.activePlatformId = platformId;
        settingsDraft.activePlatformKind = getPlatformKind(platformId);
        settingsDraft.platformSettings[platformId] ||= {};
        renderSettingsDraftPlatform();
      }

      function setDraftPlatformKind(kind) {
        if (!settingsDraft) return;
        const nextKind = kind === 'video' ? 'video' : 'image';
        captureSettingsDraftPlatform();
        settingsDraft.activePlatformKind = nextKind;
        settingsDraft.activePlatformId = ensurePlatformMatchesKind(settingsDraft.activePlatformId, nextKind);
        settingsDraft.platformSettings[settingsDraft.activePlatformId] ||= {};
        renderSettingsDraftPlatform();
      }

      function setSettingsTab(tabName) {
        const next = ['platform', 'storage', 'backup'].includes(tabName) ? tabName : 'platform';
        if (next !== 'platform' && settingsMoreMenu) {
          settingsMoreMenu.hidden = true;
          settingsMoreBtn?.setAttribute('aria-expanded', 'false');
        }
        settingsTabs.forEach(tab => {
          const active = tab.dataset.settingsTab === next;
          tab.classList.toggle('is-active', active);
          tab.setAttribute('aria-selected', String(active));
          tab.tabIndex = active ? 0 : -1;
        });
        settingsPanels.forEach(panel => {
          const active = panel.dataset.settingsPanel === next;
          panel.hidden = !active;
          panel.classList.toggle('is-active', active);
          if (active) panel.scrollTop = 0;
        });
      }

      function showSettingsDiscardConfirm() {
        if (settingsConfirmDialogHandle) return;
        if (settingsConfirm) {
          settingsConfirm.hidden = false;
          settingsConfirmDialogHandle = window.AppUtils?.dialog?.open?.({
            element: settingsConfirm.querySelector('.settings-confirm-dialog') || settingsConfirm,
            container: settingsConfirm,
            role: 'alertdialog',
            label: '放弃未保存修改',
            closeOnBackdrop: false,
            closeOnEscape: false,
            initialFocus: settingsConfirmDiscard,
            restoreFocus: false
          }) || null;
        }
        settingsConfirmDiscard?.focus();
      }

      function hideSettingsDiscardConfirm() {
        if (settingsConfirmDialogHandle) {
          const handle = settingsConfirmDialogHandle;
          settingsConfirmDialogHandle = null;
          handle.close('close', { restoreFocus: false });
          if (settingsConfirm) settingsConfirm.hidden = true;
        } else if (settingsConfirm) {
          settingsConfirm.hidden = true;
        }
      }

      function setSettingsBackgroundInert(inert) {
        const backgroundTargets = [
          document.querySelector('.app'),
          document.getElementById('main-content'),
          document.querySelector('.skip-to-content')
        ].filter(Boolean);
        backgroundTargets.forEach(target => {
          if ('inert' in target) target.inert = inert;
          if (inert) target.setAttribute('inert', '');
          else target.removeAttribute('inert');
        });
      }

      function closeSettingsDrawer(options = {}) {
        const { force = false } = options;
        if (!settingsDrawer || !settingsDrawerOverlay) return;
        if (!force && settingsDraft?.dirty) {
          showSettingsDiscardConfirm();
          return;
        }
        hideSettingsDiscardConfirm();
        settingsIsOpen = false;
        settingsDraft = null;
        if (settingsDialogHandle) {
          const handle = settingsDialogHandle;
          settingsDialogHandle = null;
          handle.close('close', { restoreFocus: false });
        } else {
          settingsDrawer.classList.remove('active');
          settingsDrawer.setAttribute('aria-hidden', 'true');
          settingsDrawer.hidden = true;
        }
        settingsDrawerOverlay.classList.remove('active');
        settingsDrawerOverlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('settings-drawer-open');
        setMobilePlatformPickerExpanded(false);
        setSettingsBackgroundInert(false);
        settingsFocusReturn?.focus?.();
        settingsFocusReturn = null;
      }

      function openSettingsDrawer() {
        if (!settingsDrawer || !settingsDrawerOverlay || settingsIsOpen) return;
        settingsFocusReturn = document.activeElement;
        settingsDraft = createSettingsDraft();
        settingsIsOpen = true;
        settingsDialogHandle = window.AppUtils?.dialog?.open?.({
          element: settingsDrawer,
          container: settingsDrawer,
          label: '工作台设置',
          openClass: 'active',
          closeClass: 'active',
          closeOnBackdrop: false,
          closeOnEscape: false,
          initialFocus: settingsCloseBtn,
          trigger: settingsFocusReturn,
          restoreFocus: false
        }) || null;
        if (!settingsDialogHandle) {
          settingsDrawer.classList.add('active');
          settingsDrawer.setAttribute('aria-hidden', 'false');
        }
        settingsDrawerOverlay.classList.add('active');
        settingsDrawerOverlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('settings-drawer-open');
        setSettingsBackgroundInert(true);
        clearConnectionStatus();
        if (includeCredentialsInput) {
          includeCredentialsInput.checked = false;
          if (sensitiveExportWarning) sensitiveExportWarning.hidden = true;
        }
        setSettingsTab('platform');
        settingsPanels.forEach(panel => {
          panel.scrollTop = 0;
        });
        renderSettingsDraftPlatform();
        settingsCloseBtn?.focus();
        window.setTimeout(() => {
          if (settingsIsOpen && !settingsConfirmDialogHandle) settingsCloseBtn?.focus?.();
        }, 0);
      }

      function getSafePlatformSettings(settings = {}) {
        const allowed = ['protocol', 'imageModel', 'textModel', 'baseUrl', 'proxyMode', 'aspect', 'resolution', 'imageQuality', 'outputFormat', 'imageBackground', 'videoDuration', 'count'];
        return Object.fromEntries(allowed.filter(key => settings[key] !== undefined).map(key => [key, settings[key]]));
      }

      const SETTINGS_STRING_FIELDS = new Set([
        'protocol', 'imageModel', 'textModel', 'baseUrl', 'aspect', 'resolution',
        'imageQuality', 'outputFormat', 'imageBackground', 'videoDuration', 'count'
      ]);

      function validateImportedPlatformSettings(platformId, value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error(`平台 ${platformId} 的配置格式无效`);
        }
        const allowed = new Set([
          'protocol', 'imageModel', 'textModel', 'baseUrl', 'proxyMode', 'aspect', 'resolution',
          'imageQuality', 'outputFormat', 'imageBackground', 'videoDuration', 'count'
        ]);
        const result = {};
        Object.entries(value).forEach(([key, fieldValue]) => {
          if (!isSafeObjectKey(key) || !allowed.has(key)) return;
          if (SETTINGS_STRING_FIELDS.has(key)) {
            if (typeof fieldValue !== 'string' || fieldValue.length > 2048) {
              throw new Error(`平台 ${platformId} 的 ${key} 类型无效`);
            }
            result[key] = fieldValue;
            return;
          }
          if (key === 'proxyMode') {
            if (typeof fieldValue !== 'boolean') throw new Error(`平台 ${platformId} 的 proxyMode 类型无效`);
            result[key] = fieldValue;
          }
        });
        const platformConfig = getPlatformConfig(platformId);
        if (result.protocol && !platformConfig.protocolOptions.some(option => option.value === result.protocol)) {
          throw new Error(`平台 ${platformId} 的 API 协议无效`);
        }
        if (result.baseUrl && !isValidBaseUrl(result.baseUrl)) {
          throw new Error(`平台 ${platformId} 的 Base URL 无效`);
        }
        return result;
      }

      function getSafeSettingsExport(includeCredentials = false) {
        captureSettingsDraftPlatform();
        const source = settingsDraft || committedSettingsSnapshot || {};
        const platformSettings = Object.fromEntries(Object.entries(source.platformSettings || {})
          .filter(([id]) => !!PLATFORM_REGISTRY[id])
          .map(([id, value]) => [id, getSafePlatformSettings(value)]));
        const modelLists = Object.fromEntries(Object.entries(source.modelLists || {})
          .filter(([id]) => !!PLATFORM_REGISTRY[id])
          .map(([id, models]) => [id, (models || []).map(model => ({ id: model.id, name: model.name || model.id }))]));
        const payload = {
          app: 'ai-image-studio',
          version: 1,
          exportedAt: new Date().toISOString(),
          settings: {
            activePlatformId: source.activePlatformId || activePlatformId,
            activePlatformKind: source.activePlatformKind || activePlatformKind,
            platformSettings,
            modelLists,
            historyImageRetention: source.historyRetention || getHistoryImageRetention(),
            autoUpscale: localStorage.getItem(AUTO_UPSCALE_KEY) === '1'
          }
        };
        if (includeCredentials) {
          payload.credentials = {
            apiKey: source.apiKey || '',
            textApiKey: source.textApiKey || '',
            rememberApiKey: !!source.rememberApiKey
          };
        }
        return payload;
      }

      function validateSettingsImport(payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('配置文件格式无效');
        if (payload.app !== 'ai-image-studio' || payload.version !== 1) throw new Error('不支持的配置文件版本');
        const settings = payload.settings;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('配置文件缺少设置数据');
        const allowedIds = new Set(Object.keys(PLATFORM_REGISTRY));
        const platformSettings = {};
        if (settings.platformSettings !== undefined && (!settings.platformSettings || typeof settings.platformSettings !== 'object' || Array.isArray(settings.platformSettings))) {
          throw new Error('平台配置字段类型无效');
        }
        const rawPlatformSettings = settings.platformSettings || {};
        Object.entries(rawPlatformSettings).forEach(([id, value]) => {
          if (!isSafeObjectKey(id) || !allowedIds.has(id)) return;
          platformSettings[id] = validateImportedPlatformSettings(id, value);
        });
        const modelLists = {};
        if (settings.modelLists !== undefined && (!settings.modelLists || typeof settings.modelLists !== 'object' || Array.isArray(settings.modelLists))) {
          throw new Error('模型列表字段类型无效');
        }
        const rawModelLists = settings.modelLists || {};
        Object.entries(rawModelLists).forEach(([id, models]) => {
          if (!isSafeObjectKey(id) || !allowedIds.has(id)) return;
          if (!Array.isArray(models)) throw new Error(`平台 ${id} 的模型列表格式无效`);
          modelLists[id] = models.map(model => {
            if (!model || typeof model !== 'object' || Array.isArray(model)) throw new Error(`平台 ${id} 的模型列表格式无效`);
            if (model.id !== undefined && typeof model.id !== 'string') throw new Error(`平台 ${id} 的模型 ID 类型无效`);
            if (model.name !== undefined && typeof model.name !== 'string') throw new Error(`平台 ${id} 的模型名称类型无效`);
            const modelId = (model.id || '').trim();
            return { id: modelId, name: (model.name || modelId).trim() };
          }).filter(model => model.id).slice(0, 500);
        });
        if (settings.activePlatformId !== undefined && typeof settings.activePlatformId !== 'string') throw new Error('活动平台字段类型无效');
        if (settings.activePlatformKind !== undefined && settings.activePlatformKind !== 'image' && settings.activePlatformKind !== 'video') throw new Error('活动平台类型无效');
        if (settings.historyImageRetention !== undefined && settings.historyImageRetention !== 'thumbnail' && settings.historyImageRetention !== 'original') throw new Error('历史保留方式无效');
        if (settings.autoUpscale !== undefined && typeof settings.autoUpscale !== 'boolean') throw new Error('超分设置类型无效');
        const requestedPlatformId = allowedIds.has(settings.activePlatformId) ? settings.activePlatformId : activePlatformId;
        const requestedKind = settings.activePlatformKind || getPlatformKind(requestedPlatformId);
        const normalizedPlatformId = ensurePlatformMatchesKind(requestedPlatformId, requestedKind);
        const normalizedPlatformKind = getPlatformKind(normalizedPlatformId);
        const historyImageRetention = settings.historyImageRetention || settingsDraft?.historyRetention || getHistoryImageRetention();
        if (payload.credentials !== undefined && (!payload.credentials || typeof payload.credentials !== 'object' || Array.isArray(payload.credentials))) {
          throw new Error('密钥字段类型无效');
        }
        const credentials = payload.credentials === undefined ? null : {
          apiKey: payload.credentials.apiKey === undefined ? '' : payload.credentials.apiKey,
          textApiKey: payload.credentials.textApiKey === undefined ? '' : payload.credentials.textApiKey,
          rememberApiKey: payload.credentials.rememberApiKey === undefined ? false : payload.credentials.rememberApiKey
        };
        if (credentials && (typeof credentials.apiKey !== 'string' || typeof credentials.textApiKey !== 'string' || typeof credentials.rememberApiKey !== 'boolean')) {
          throw new Error('密钥字段类型无效');
        }
        if (credentials && (credentials.apiKey.length > 4096 || credentials.textApiKey.length > 4096)) throw new Error('密钥字段过长');
        return {
          activePlatformId: normalizedPlatformId,
          activePlatformKind: normalizedPlatformKind,
          platformSettings,
          modelLists,
          historyImageRetention,
          autoUpscale: settings.autoUpscale === true,
          credentials
        };
      }

      function validateSettingsDraft() {
        captureSettingsDraftPlatform();
        if (!settingsDraft?.activePlatformId || !PLATFORM_REGISTRY[settingsDraft.activePlatformId]) return '请选择有效的平台';
        const activeSettings = settingsDraft.platformSettings[settingsDraft.activePlatformId] || {};
        if (activeSettings.baseUrl && !isValidBaseUrl(activeSettings.baseUrl)) return 'Base URL 格式无效，请使用 http(s):// 或 / 开头的地址';
        if (!activeSettings.imageModel || !activeSettings.textModel || !activeSettings.protocol) return '请选择完整的模型和 API 协议';
        return '';
      }

      async function commitSettingsDraft() {
        if (!settingsDraft) return;
        const validationError = validateSettingsDraft();
        if (validationError) {
          flashStatus(validationError, 'danger');
          return;
        }
        const draft = settingsDraft;
        const previous = committedSettingsSnapshot ? JSON.parse(JSON.stringify(committedSettingsSnapshot)) : null;
        const safeMap = clonePlatformSettingsMap(draft.platformSettings);
        const previousPlatformId = activePlatformId;
        const previousFolderHandle = folderHandle;
        const rollbackStorageKeys = [
          PLATFORM_SETTINGS_STORAGE_KEY, ACTIVE_PLATFORM_STORAGE_KEY, ACTIVE_PLATFORM_KIND_STORAGE_KEY,
          API_PROXY_MODE_KEY, 'api_protocol', 'image_aspect', 'image_resolution', 'image_quality',
          'output_format', 'image_background', 'video_duration', 'image_count', HISTORY_IMAGE_RETENTION_KEY,
          API_KEY_STORAGE_KEY, API_KEY_REMEMBER_KEY, TEXT_API_KEY_STORAGE_KEY,
          MODEL_LIST_STORAGE_PREFIX, IMAGE_MODEL_STORAGE_PREFIX, TEXT_MODEL_STORAGE_PREFIX,
          AUTO_UPSCALE_KEY
        ];
        Object.keys(PLATFORM_REGISTRY).forEach(platformId => {
          rollbackStorageKeys.push(
            getPlatformStorageKey(MODEL_LIST_STORAGE_PREFIX, platformId),
            getPlatformStorageKey(IMAGE_MODEL_STORAGE_PREFIX, platformId),
            getPlatformStorageKey(TEXT_MODEL_STORAGE_PREFIX, platformId)
          );
        });
        const rollbackStorage = Object.fromEntries(rollbackStorageKeys.map(key => [key, {
          local: localStorage.getItem(key),
          session: sessionStorage.getItem(key)
        }]));
        try {
          writeStoredPlatformSettingsMap(safeMap);
          Object.entries(draft.modelLists || {}).forEach(([platformId, models]) => {
            if (PLATFORM_REGISTRY[platformId]) setStoredModels(models, platformId);
          });
          persistApiKey(draft.apiKey || '', !!draft.rememberApiKey);
          persistTextApiKey(draft.textApiKey || '', !!draft.rememberApiKey);
          localStorage.setItem(ACTIVE_PLATFORM_STORAGE_KEY, draft.activePlatformId);
          localStorage.setItem(ACTIVE_PLATFORM_KIND_STORAGE_KEY, draft.activePlatformKind);
          localStorage.setItem(API_PROXY_MODE_KEY, safeMap[draft.activePlatformId]?.proxyMode ? '1' : '0');
          const activeSettings = safeMap[draft.activePlatformId] || {};
          localStorage.setItem(getPlatformStorageKey(IMAGE_MODEL_STORAGE_PREFIX, draft.activePlatformId), activeSettings.imageModel || '');
          localStorage.setItem(getPlatformStorageKey(TEXT_MODEL_STORAGE_PREFIX, draft.activePlatformId), activeSettings.textModel || '');
          localStorage.setItem(IMAGE_MODEL_STORAGE_PREFIX, activeSettings.imageModel || '');
          localStorage.setItem(TEXT_MODEL_STORAGE_PREFIX, activeSettings.textModel || '');
          localStorage.setItem(MODEL_LIST_STORAGE_PREFIX, JSON.stringify(draft.modelLists[draft.activePlatformId] || []));
          localStorage.setItem('api_protocol', activeSettings.protocol || '');
          ['aspect', 'resolution', 'imageQuality', 'outputFormat', 'imageBackground', 'videoDuration', 'count'].forEach(key => {
            const legacyKey = {
              aspect: 'image_aspect', resolution: 'image_resolution', imageQuality: 'image_quality', outputFormat: 'output_format', imageBackground: 'image_background', videoDuration: 'video_duration', count: 'image_count'
            }[key];
            if (legacyKey && activeSettings[key] !== undefined) localStorage.setItem(legacyKey, activeSettings[key]);
          });
          localStorage.setItem(HISTORY_IMAGE_RETENTION_KEY, draft.historyRetention === 'thumbnail' ? 'thumbnail' : 'original');

          if (draft.folderAction === 'reset' || draft.folderAction === 'default') {
            folderHandle = null;
            await clearSavedFolderHandle();
          } else if (draft.folderAction === 'set' && draft.folderHandle) {
            folderHandle = draft.folderHandle;
            await saveFolderHandle(folderHandle);
          }

          activePlatformId = draft.activePlatformId;
          activePlatformKind = getPlatformKind(activePlatformId);
          apiKeyValue = draft.apiKey || '';
          textApiKeyValue = draft.textApiKey || '';
          committedSettingsSnapshot = {
            activePlatformId,
            activePlatformKind,
            platformSettings: clonePlatformSettingsMap(safeMap),
            apiKey: apiKeyValue,
            textApiKey: textApiKeyValue,
            rememberApiKey: !!draft.rememberApiKey,
            historyRetention: draft.historyRetention
          };
          applyPlatformSettings(getActivePlatformConfig(), safeMap[activePlatformId]);
          renderPlatformSwitcher();
          renderPlatformParams(getActivePlatformConfig());
          syncPromptHints(getActivePlatformConfig());
          syncPlatformBaseUrl(getActivePlatformConfig());
          updateReferenceImageLimitText();
          updatePlatformActionAvailability();
          syncPlatformSummary();
          flashStatus('设置已保存', 'success');
          closeSettingsDrawer({ force: true });
        } catch (error) {
          console.error('保存设置失败', error);
          Object.entries(rollbackStorage).forEach(([key, values]) => {
            try {
              if (values.local === null) localStorage.removeItem(key); else localStorage.setItem(key, values.local);
              if (values.session === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, values.session);
            } catch {}
          });
          if (previous) committedSettingsSnapshot = previous;
          folderHandle = previousFolderHandle;
          try {
            if (folderHandle) await saveFolderHandle(folderHandle);
            else await clearSavedFolderHandle();
          } catch {}
          activePlatformId = previous?.activePlatformId || previousPlatformId;
          activePlatformKind = previous?.activePlatformKind || getPlatformKind(activePlatformId);
          settingsDraft = null;
          if (previous) {
            apiKeyValue = previous.apiKey || '';
            textApiKeyValue = previous.textApiKey || '';
            applyPlatformSettings(getActivePlatformConfig(), previous.platformSettings?.[activePlatformId] || {});
            renderPlatformParams(getActivePlatformConfig());
            syncPromptHints(getActivePlatformConfig());
            syncPlatformBaseUrl(getActivePlatformConfig());
            updateReferenceImageLimitText();
            updatePlatformActionAvailability();
            syncPlatformSummary();
          }
          settingsDraft = createSettingsDraft();
          renderSettingsDraftPlatform();
          flashStatus('设置保存失败，已保留原配置', 'danger');
        }
      }

      function normalizeDiscoveredModel(item) {
        if (!item || typeof item !== 'object') return null;
        const rawId = item.id || item.model || item.name || '';
        const id = String(rawId).replace(/^models\//, '').trim();
        if (!id) return null;
        const name = String(
          item.displayName || item.display_name || item.label || item.name || id
        ).replace(/^models\//, '').trim() || id;
        return { id, name };
      }

      function extractDiscoveredModels(data) {
        const rawModels = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.models)
            ? data.models
            : [];
        const seen = new Set();
        return rawModels
          .map(normalizeDiscoveredModel)
          .filter(model => model && !seen.has(model.id) && seen.add(model.id));
      }

      async function runConnectionTest() {
        if (!settingsDraft || !testConnectionBtn) return;
        captureSettingsDraftPlatform();
        const platformId = settingsDraft.activePlatformId;
        const settings = settingsDraft.platformSettings[platformId] || {};
        const key = settingsDraft.apiKey || '';
        if (!settings.baseUrl || !key) {
          setConnectionStatus('请先填写 Base URL 和 API Key', 'danger');
          return;
        }
        if (!isValidBaseUrl(settings.baseUrl)) {
          setConnectionStatus('Base URL 格式无效，请检查地址', 'danger');
          return;
        }
        const originalText = testConnectionBtn.textContent;
        testConnectionBtn.disabled = true;
        updateModelsBtn && (updateModelsBtn.hidden = true);
        setConnectionStatus('检测中…');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        settingsConnectionOverride = { platformId, settings, apiKey: key, textApiKey: settingsDraft.textApiKey || '' };
        try {
          const effectiveProtocol = getImageProtocol();
          const endpoints = getModelListEndpoints(effectiveProtocol);
          let response = null;
          let lastError = null;
          for (const endpoint of endpoints) {
            try {
              response = await fetch(endpoint, { method: 'GET', headers: buildRequestHeaders(key, effectiveProtocol), signal: controller.signal });
              if (response.ok) break;
              lastError = new Error(`HTTP ${response.status}`);
            } catch (error) {
              lastError = error;
            }
          }
          if (!response || !response.ok) throw lastError || new Error('连接失败');
          let data = null;
          try { data = await response.json(); } catch {}
          const models = extractDiscoveredModels(data);
          settingsDraft.pendingModels = models;
          setConnectionStatus(
            models.length ? `连接可用，发现 ${models.length} 个模型` : '连接可用，未返回兼容模型列表',
            models.length ? 'success' : 'warning'
          );
          if (updateModelsBtn) updateModelsBtn.hidden = models.length === 0;
        } catch (error) {
          setConnectionStatus(error?.name === 'AbortError' ? '连接超时（15 秒）' : '连接失败，请检查配置', 'danger');
        } finally {
          clearTimeout(timeout);
          settingsConnectionOverride = null;
          testConnectionBtn.disabled = false;
          testConnectionBtn.querySelector('span')?.replaceChildren('检测连接');
          if (!testConnectionBtn.querySelector('span')) testConnectionBtn.textContent = originalText;
        }
      }

      function applyPendingModelList() {
        if (!settingsDraft?.pendingModels?.length) return;
        const models = settingsDraft.pendingModels.map(model => ({ ...model }));
        const platform = getPlatformConfig(settingsDraft.activePlatformId);
        settingsDraft.modelLists[settingsDraft.activePlatformId] = models;
        const currentImage = imageModelSelect.value;
        const currentText = textModelSelect.value;
        imageModelSelect.innerHTML = '';
        textModelSelect.innerHTML = '';
        models.forEach(model => {
          imageModelSelect.add(new Option(model.name, model.id));
          textModelSelect.add(new Option(model.name, model.id));
        });
        if (platform.defaultImageModel) {
          ensureModelOption(imageModelSelect, platform.defaultImageModel, platform.defaultImageModel);
        }
        if (platform.defaultTextModel) {
          ensureModelOption(textModelSelect, platform.defaultTextModel, platform.defaultTextModel);
        }
        if ([...imageModelSelect.options].some(option => option.value === currentImage)) imageModelSelect.value = currentImage;
        if ([...textModelSelect.options].some(option => option.value === currentText)) textModelSelect.value = currentText;
        settingsDraft.modelLists[settingsDraft.activePlatformId] = getCurrentModelListFromControls();
        settingsDraft.pendingModels = null;
        updateModelsBtn.hidden = true;
        markSettingsDirty();
      }

      function downloadSettingsBackup() {
        const payload = getSafeSettingsExport(!!includeCredentialsInput?.checked);
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = payload.exportedAt.replace(/[:.]/g, '-');
        link.href = url;
        link.download = `ai-image-studio-settings-${stamp}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      function openSettingsImportPicker() {
        settingsImportFile?.click();
      }

      async function importSettingsBackup(file) {
        if (!settingsDraft || !file) return;
        if (file.size > 1024 * 1024) throw new Error('配置文件不能超过 1MB');
        const payload = JSON.parse(await file.text());
        const imported = validateSettingsImport(payload);
        const summaryModels = Object.values(imported.modelLists).reduce((sum, list) => sum + list.length, 0);
        if (settingsImportSummary) {
          settingsImportSummary.hidden = false;
          settingsImportSummary.textContent = `将导入 ${Object.keys(imported.platformSettings).length} 个平台、${summaryModels} 个模型${imported.credentials ? '，包含密钥' : '，不包含密钥'}`;
        }
        if (!(await confirmUiAction({
          title: '载入设置草稿',
          message: '确认将配置载入设置草稿？载入后仍需点击保存。',
          confirmLabel: '载入'
        }))) return;
        settingsDraft.activePlatformId = imported.activePlatformId;
        settingsDraft.activePlatformKind = imported.activePlatformKind;
        settingsDraft.platformSettings = {
          ...settingsDraft.platformSettings,
          ...imported.platformSettings
        };
        settingsDraft.modelLists = {
          ...settingsDraft.modelLists,
          ...imported.modelLists
        };
        settingsDraft.historyRetention = imported.historyImageRetention;
        if (imported.autoUpscale !== undefined) {
          localStorage.setItem(AUTO_UPSCALE_KEY, imported.autoUpscale ? '1' : '0');
          if (autoUpscaleInput) autoUpscaleInput.checked = imported.autoUpscale;
        }
        if (imported.credentials) {
          settingsDraft.apiKey = imported.credentials.apiKey;
          settingsDraft.textApiKey = imported.credentials.textApiKey;
          settingsDraft.rememberApiKey = imported.credentials.rememberApiKey;
        }
        settingsDraft.dirtyPlatforms?.add(imported.activePlatformId);
        markSettingsDirty();
        renderSettingsDraftPlatform();
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
        if (e.key === 'Escape' && settingsDrawer?.classList.contains('active')) {
          if (settingsMoreMenu && !settingsMoreMenu.hidden) {
            settingsMoreMenu.hidden = true;
            settingsMoreBtn?.setAttribute('aria-expanded', 'false');
            settingsMoreBtn?.focus();
            return;
          }
          if (isMobileSettingsLayout() && mobilePlatformPickerExpanded) {
            setMobilePlatformPickerExpanded(false);
            mobilePlatformPickerToggle?.focus();
            return;
          }
          closeSettingsDrawer();
        }
      });

      announcementBtn?.addEventListener('click', openAnnouncementModal);
      announcementCloseBtn?.addEventListener('click', closeAnnouncementModal);
      announcementModal?.addEventListener('click', (e) => {
        if (e.target === announcementModal) {
          closeAnnouncementModal();
        }
      });
      settingsOpenBtn?.addEventListener('click', openSettingsDrawer);
      settingsCloseBtn?.addEventListener('click', closeSettingsDrawer);
      settingsDrawerOverlay?.addEventListener('click', closeSettingsDrawer);
      settingsCancelBtn?.addEventListener('click', closeSettingsDrawer);
      mobilePlatformPickerToggle?.addEventListener('click', () => {
        setMobilePlatformPickerExpanded(!mobilePlatformPickerExpanded);
      });
      window.matchMedia?.('(max-width: 599px)')?.addEventListener?.('change', () => {
        setMobilePlatformPickerExpanded(false);
      });
      document.addEventListener('click', event => {
        if (!settingsMoreMenu || settingsMoreMenu.hidden) return;
        if (settingsMoreMenu.contains(event.target) || settingsMoreBtn?.contains(event.target)) return;
        settingsMoreMenu.hidden = true;
        settingsMoreBtn?.setAttribute('aria-expanded', 'false');
      });
      settingsConfirmCancel?.addEventListener('click', () => {
        hideSettingsDiscardConfirm();
        settingsCloseBtn?.focus();
      });
      settingsConfirmDiscard?.addEventListener('click', () => closeSettingsDrawer({ force: true }));
      settingsTabs.forEach((tab, index) => {
        tab.addEventListener('click', () => setSettingsTab(tab.dataset.settingsTab));
        tab.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? settingsTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + settingsTabs.length) % settingsTabs.length;
          settingsTabs[nextIndex]?.focus();
          setSettingsTab(settingsTabs[nextIndex]?.dataset.settingsTab);
        });
      });
      settingsMoreBtn?.addEventListener('click', () => {
        const open = settingsMoreMenu?.hidden !== false;
        if (settingsMoreMenu) settingsMoreMenu.hidden = !open;
        settingsMoreBtn.setAttribute('aria-expanded', String(open));
      });
      testConnectionBtn?.addEventListener('click', runConnectionTest);
      updateModelsBtn?.addEventListener('click', applyPendingModelList);
      resetPlatformSettingsBtn?.addEventListener('click', () => {
        if (!settingsDraft) return;
        const platformId = settingsDraft.activePlatformId;
        const platform = getPlatformConfig(platformId);
        const current = settingsDraft.platformSettings[platformId] || {};
        settingsDraft.platformSettings[platformId] = {
          ...current,
          protocol: platform.defaultProtocol,
          imageModel: platform.defaultImageModel || current.imageModel || 'gpt-image-2',
          textModel: platform.defaultTextModel || current.textModel || DEFAULT_TEXT_MODEL,
          baseUrl: platform.baseUrlValue || defaultBaseUrl,
          proxyMode: false,
          aspect: platform.kind === 'video'
            ? (platform.id === 'grokVideo' ? '3:2' : '16:9')
            : 'auto',
          resolution: platform.kind === 'video' ? '720P' : '2K',
          imageQuality: 'auto',
          outputFormat: '',
          imageBackground: 'auto',
          videoDuration: '10',
          count: '1'
        };
        settingsMoreMenu.hidden = true;
        settingsMoreBtn?.setAttribute('aria-expanded', 'false');
        markSettingsDirty();
        renderSettingsDraftPlatform();
      });
      exportSettingsBtn?.addEventListener('click', downloadSettingsBackup);
      importSettingsBtn?.addEventListener('click', openSettingsImportPicker);
      settingsImportFile?.addEventListener('change', async () => {
        const file = settingsImportFile.files?.[0];
        settingsImportFile.value = '';
        if (!file) return;
        try {
          await importSettingsBackup(file);
        } catch (error) {
          console.error('导入设置失败', error);
          flashStatus(error?.message || '配置导入失败', 'danger');
        }
      });
      includeCredentialsInput?.addEventListener('change', () => {
        if (sensitiveExportWarning) sensitiveExportWarning.hidden = !includeCredentialsInput.checked;
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
      const historyActionsEl = document.getElementById('history-actions');
      const historyMoreMenu = document.getElementById('history-more-menu');
      const clearHistoryBtn = document.getElementById('clear-history');
      const exportHistoryBtn = document.getElementById('export-history');
      const sendHistoryBtn = document.getElementById('send-history-to-canvas');
      const importHistoryBtn = document.getElementById('import-history');
      const historyImportFileInput = document.getElementById('history-import-file');
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

      function renderHistoryEmptyState(kind = 'empty') {
        if (!historyGrid) return;
        if (kind === 'error') {
          historyGrid.innerHTML = '<div class="history-empty" data-history-state="error"><strong>加载历史记录失败</strong><p>请重试，或稍后再导入历史记录。</p><div class="history-empty-actions"><button class="btn" id="history-retry" type="button"><i data-lucide="refresh-cw" aria-hidden="true"></i><span>重试</span></button></div></div>';
        } else {
          historyGrid.innerHTML = '<div class="history-empty" data-history-state="empty"><strong>暂无历史记录</strong><p>导入或生成图片后，历史记录会显示在这里。</p><div class="history-empty-actions"><button class="btn" id="history-empty-import" type="button"><i data-lucide="upload" aria-hidden="true"></i><span>导入历史</span></button></div></div>';
        }
        try { window.lucide?.createIcons?.(); } catch {}
      }

      function syncHistoryActions(state = 'loading', recordCount = 0) {
        const hasTransferableMedia = state === 'ready'
          && typeof collectHistoryImageSources === 'function'
          && collectHistoryImageSources().length > 0;
        const hasRecords = state === 'ready' && recordCount > 0;
        if (historyActionsEl) historyActionsEl.hidden = !hasRecords;
        if (sendHistoryBtn) sendHistoryBtn.hidden = !hasTransferableMedia;
        if (exportHistoryBtn) exportHistoryBtn.hidden = !hasRecords;
        if (clearHistoryBtn) clearHistoryBtn.hidden = !hasRecords;
        if (historyMoreMenu) {
          historyMoreMenu.hidden = !hasRecords;
          if (!hasRecords) historyMoreMenu.open = false;
        }
      }


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

      async function exportHistoryRecords() {
        const records = await loadHistory();
        if (!records.length) {
          flashStatus('当前没有可导出的历史记录', 'danger');
          return;
        }

        const payload = {
          type: 'ai-image-history',
          version: 1,
          exportedAt: new Date().toISOString(),
          count: records.length,
          records
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.href = url;
        link.download = `ai-image-history-${stamp}.json`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        flashStatus(`已导出 ${records.length} 条历史记录`, 'success');
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

      async function handleHistoryImportFile(file) {
        if (!file) return;
        const payload = await readHistoryImportFile(file);
        const records = parseHistoryImportPayload(payload);
        if (!records.length) {
          throw new Error('没有找到可导入的历史记录');
        }
        const result = await importHistoryRecords(records);
        historyCurrentPage = 1;
        await renderHistory();
        flashStatus(`已导入 ${result.imported} 条历史记录${result.skipped ? `，跳过 ${result.skipped} 条重复记录` : ''}`, 'success');
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
        const { autoReselect = true, mode = 'readwrite', requestPermission = true } = options;

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
          const hasPermission = await ensureFolderPermission(folderHandle, mode, requestPermission);
          if (hasPermission) {
            return { ok: true, handle: folderHandle, reselected: false };
          }

          if (!autoReselect) {
            return { ok: false, reason: 'permission_denied' };
          }

          const reselectedHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
          const reselectedPermission = await ensureFolderPermission(reselectedHandle, mode, true);
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

      async function preflightSaveFolderPermission() {
        if (!folderHandle || isMobileDevice() || !('showDirectoryPicker' in window)) {
          return { status: 'not_configured' };
        }

        const folderState = await ensureWritableFolderHandle({
          mode: 'readwrite',
          requestPermission: true,
          autoReselect: true
        });

        if (folderState.ok) {
          return { status: folderState.reselected ? 'reselected_and_saved' : 'saved_to_folder' };
        }

        return { status: folderState.reason || 'permission_denied' };
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

      // ========== 提示词库模块 ==========
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

      async function requestPromptApi(method, payload = null, options = {}) {
        const headers = { Accept: 'application/json' };
        const fetchOptions = { method, headers };

        if (payload) {
          headers['Content-Type'] = 'application/json';
          fetchOptions.body = JSON.stringify(payload);
        }

        const response = await fetch(getPromptApiUrl(options.params || {}), fetchOptions);
        const text = await response.text();
        let data = {};
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (error) {
            // 网关/代理可能返回 HTML 错误页，直接 JSON.parse 会抛出难以理解的语法错误
            throw new Error(`提示词库接口返回了非 JSON 响应（${response.status}）`);
          }
        }

        if (!response.ok || data.ok === false) {
          throw new Error(describeApiError(data.error, `提示词库接口请求失败（${response.status}）`));
        }

        return data;
      }

      // 保存提示词到本地库
      async function savePromptToLocalLibrary(title, content, metadata = {}) {
        if (!db) await initDB();

        return new Promise((resolve, reject) => {
          const transaction = db.transaction(['prompts'], 'readwrite');
          const store = transaction.objectStore('prompts');

          const rawCoverUrl = String(metadata.coverUrl || '').trim();
          const coverUrl = /^https?:\/\//i.test(rawCoverUrl)
            || /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(rawCoverUrl)
            ? rawCoverUrl
            : '';
          const record = {
            title: String(title || '').trim(),
            content: String(content || '').trim(),
            createdAt: Number(metadata.createdAt) || Date.now(),
            updatedAt: Date.now(),
            usageCount: Number(metadata.usageCount) || 0,
            tags: Array.isArray(metadata.tags) ? metadata.tags.filter(Boolean).map(String) : [],
            coverUrl,
            description: String(metadata.description || '').trim(),
            referenceImageUrls: Array.isArray(metadata.referenceImageUrls) ? metadata.referenceImageUrls.filter(Boolean).map(String) : [],
            category: String(metadata.category || '其他').trim() || '其他',
            author: String(metadata.author || '').trim(),
            imageModel: String(metadata.imageModel || metadata.model || '').trim(),
            imageMode: String(metadata.imageMode || '').trim(),
            sourceId: String(metadata.sourceId || '').trim(),
            sourceUrl: String(metadata.sourceUrl || '').trim(),
            attributions: Array.isArray(metadata.attributions) ? metadata.attributions.filter(Boolean) : []
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
          const request = store.getAll();
          request.onsuccess = () => {
            const record = request.result.find(item => String(item?.id) === String(id));
            if (!record) {
              resolve();
              return;
            }
            const remove = store.delete(record.id);
            remove.onsuccess = () => resolve();
            remove.onerror = () => reject(remove.error);
          };
          request.onerror = () => reject(request.error);
        });
      }

      // 增加本地提示词使用次数
      async function incrementLocalPromptUsage(id) {
        if (!db) await initDB();

        return new Promise((resolve, reject) => {
          const transaction = db.transaction(['prompts'], 'readwrite');
          const store = transaction.objectStore('prompts');
          const getRequest = store.getAll();

          getRequest.onsuccess = () => {
            const record = getRequest.result.find(item => String(item?.id) === String(id));
            if (!record) {
              resolve();
              return;
            }
            record.usageCount = (record.usageCount || 0) + 1;
            const updateRequest = store.put(record);
            updateRequest.onsuccess = () => resolve();
            updateRequest.onerror = () => reject(updateRequest.error);
          };
          getRequest.onerror = () => reject(getRequest.error);
        });
      }

      let communityPromptsPromise = null;

      async function loadCommunityPrompts() {
        if (communityPromptsPromise) return communityPromptsPromise;
        if (!appConfig.communityPromptStaticUrl) return [];

        communityPromptsPromise = fetch(new URL(appConfig.communityPromptStaticUrl, window.location.href).toString())
          .then(response => {
            if (!response.ok) throw new Error(`社区提示词目录加载失败：${response.status}`);
            return response.json();
          })
          .then(data => {
            const items = Array.isArray(data) ? data : (Array.isArray(data.entries) ? data.entries : []);
            return items.map(item => normalizePromptLibraryEntry(item, 'community')).filter(Boolean);
          })
          .catch(error => {
            communityPromptsPromise = null;
            console.warn('社区提示词目录加载失败:', error);
            throw error;
          });
        return communityPromptsPromise;
      }

      async function loadPromptLibraryEntries(options = {}) {
        const localOnly = options.localOnly === true;
        const includeLocal = localOnly || options.includeLocal !== false;
        const includeCommunity = !localOnly && options.includeCommunity !== false;
        const includePublic = !localOnly && options.includePublic !== false && isPromptBackendEnabled();

        const localPromise = includeLocal
          ? loadAllLocalPrompts().then(items => items
            .map(item => normalizePromptLibraryEntry({ ...item, source: 'local' }, 'local'))
            .filter(Boolean))
          : Promise.resolve([]);
        const sourceErrors = [];
        const publicPromise = includePublic
          ? loadPublicPrompts().catch(error => {
            sourceErrors.push({ source: 'public', label: '公共库', message: error?.message || String(error) });
            if (options.strictPublic) throw error;
            console.warn('公共提示词库加载失败:', error);
            return [];
          })
          : Promise.resolve([]);
        const communityPromise = includeCommunity
          ? loadCommunityPrompts().catch(error => {
            sourceErrors.push({ source: 'community', label: '社区目录', message: error?.message || String(error) });
            if (options.strictCommunity) throw error;
            console.warn('社区提示词目录加载失败:', error);
            return [];
          })
          : Promise.resolve([]);

        const [localEntries, publicEntries, communityEntries] = await Promise.all([
          localPromise,
          publicPromise,
          communityPromise
        ]);
        const entries = [...localEntries, ...publicEntries, ...communityEntries];
        Object.defineProperty(entries, 'sourceErrors', {
          value: sourceErrors,
          enumerable: false,
          configurable: true
        });
        return entries;
      }

      function setStudioPromptContent(content, options = {}) {
        const input = document.getElementById('prompt');
        if (!input) return false;
        const value = String(content || '');
        if (options.mode === 'append' && input.value.trim()) {
          input.value = `${input.value.trim()}\n\n${value}`;
        } else {
          input.value = value;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        if (options.focus !== false) {
          input.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
          input.focus();
        }
        return true;
      }

      async function loadPublicPrompts() {
        if (!isPromptBackendEnabled()) return [];
        const data = await requestPromptApi('GET');
        return (data.prompts || []).map(item => normalizePromptLibraryEntry({
          ...item,
          source: 'public',
          origin: 'public',
          createdAt: item.createdAt || item.created_at || Date.now(),
          usageCount: item.usageCount || item.usage_count || 0
        }, 'public')).filter(Boolean);
      }

      async function incrementPromptUsage(id) {
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

      function getVideoExtensionFromSrc(src, fallback = 'mp4') {
        const mime = src?.match(/^data:([^;]+);/)?.[1] || guessMimeFromUrl(src || '');
        return mime ? getExtensionFromMime(mime) : fallback;
      }

      function getHistoryThumbnailFilename(record) {
        const ext = getImageExtensionFromSrc(record.thumbnail, 'jpg');
        return `history-${record.timestamp || Date.now()}.${ext}`;
      }

      function getHistoryImageRetention() {
        if (settingsIsOpen && !settingsDraft) return committedSettingsSnapshot?.historyRetention || 'original';
        if (settingsIsOpen && settingsDraft?.historyRetention) return settingsDraft.historyRetention;
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

        if (record.imageUrl) {
          const ext = guessMimeFromUrl(record.imageUrl) ? getExtensionFromMime(guessMimeFromUrl(record.imageUrl)) : 'png';
          return `history-original-${record.timestamp || Date.now()}.${ext}`;
        }

        const ext = getImageExtensionFromSrc(record.imageSrc, 'png');
        return `history-original-${record.timestamp || Date.now()}.${ext}`;
      }

      function getHistoryStableStamp(record) {
        return record?.timestamp || record?.id || 'unknown';
      }

      function getHistoryLocalFilename(record) {
        if (!record) return '';
        if (record.filename) return record.filename;
        const stamp = getHistoryStableStamp(record);

        if (record.mediaType === 'video') {
          const videoSrc = record.videoSrc || record.videoUrl;
          const ext = getVideoExtensionFromSrc(videoSrc, 'mp4');
          return `history-video-${stamp}.${ext}`;
        }

        if (record.imageUrl) {
          const guessedMime = guessMimeFromUrl(record.imageUrl);
          const ext = guessedMime ? getExtensionFromMime(guessedMime) : 'png';
          return `history-original-${stamp}.${ext}`;
        }

        if (record.imageSrc) {
          const ext = getImageExtensionFromSrc(record.imageSrc, 'png');
          return `history-original-${stamp}.${ext}`;
        }

        if (record.thumbnail) {
          const ext = getImageExtensionFromSrc(record.thumbnail, 'jpg');
          return `history-original-${stamp}.${ext}`;
        }

        return `history-original-${stamp}.png`;
      }

      function getHistoryFilenameHint(record) {
        return getHistoryLocalFilename(record) || '未记录文件名';
      }

      async function resolveHistoryImageRecord(src) {
        const timestamp = Date.now();
        const persistentSrc = await getPersistentImageSource(src);
        const mimeType = persistentSrc.match(/data:([^;]+);/)?.[1] || 'image/png';
        const fileExt = getExtensionFromMime(mimeType);
        return {
          thumbnail: await createThumbnail(persistentSrc),
          persistentSrc,
          filename: `gemini-${timestamp}.${fileExt}`,
          mimeType,
          timestamp
        };
      }

      async function buildHistoryImageRecordFallback(src) {
        return {
          thumbnail: src,
          persistentSrc: '',
          filename: '',
          mimeType: guessMimeFromUrl(src) || 'image/png',
          timestamp: Date.now()
        };
      }

      async function buildHistoryVideoRecord(result) {
        const timestamp = Date.now();
        const videoSrc = getResultVideoSrc(result);
        const ext = getVideoExtensionFromSrc(videoSrc, 'mp4');
          return {
            mediaType: 'video',
            thumbnail: result.thumbnailUrl || '',
            videoUrl: videoSrc,
            videoSrc,
            filename: `sora-${timestamp}.${ext}`,
          mimeType: result.mime || guessMimeFromUrl(videoSrc) || 'video/mp4',
          timestamp,
          videoId: result.videoId || ''
        };
      }

      async function getHistoryDownloadImage(record) {
        const localFilename = getHistoryLocalFilename(record);

        if (localFilename && folderHandle) {
          try {
            const src = await loadImageFromFolder(localFilename);
            return {
              src,
              filename: localFilename,
              quality: 'original'
            };
          } catch (err) {
            console.warn('从文件夹加载历史原图失败，改用缩略图下载:', err);
          }
        }

        if (record.imageSrc) {
          return {
            src: record.imageSrc,
            filename: localFilename,
            quality: 'original'
          };
        }

        if (record.imageUrl) {
          return {
            src: record.imageUrl,
            filename: localFilename,
            quality: 'original'
          };
        }

        if (record.thumbnail) {
          return {
            src: record.thumbnail,
            filename: localFilename || getHistoryThumbnailFilename(record),
            quality: 'thumbnail'
          };
        }

        throw new Error('这条历史记录没有可下载的图片');
      }

      async function getHistoryDownloadVideo(record) {
        const localFilename = getHistoryLocalFilename(record);

        if (localFilename && folderHandle) {
          try {
            const src = await loadFileFromFolder(localFilename);
            return {
              src,
              filename: localFilename,
              quality: 'original'
            };
          } catch (err) {
            console.warn('读取历史视频原文件失败，改用视频链接下载:', err);
          }
        }

        if (record.videoSrc || record.videoUrl) {
          return {
            src: record.videoSrc || record.videoUrl,
            filename: localFilename,
            quality: 'original'
          };
        }

        throw new Error('这条历史记录没有可下载的视频');
      }

      async function openHistoryPreview(record) {
        if (record.mediaType === 'video') {
          let videoSrc = record.videoSrc || record.videoUrl;
          const localFilename = getHistoryLocalFilename(record);
          if (localFilename && folderHandle) {
            try {
              videoSrc = await loadFileFromFolder(localFilename);
              openVideoLightbox(videoSrc);
              return;
            } catch (err) {
              console.warn('读取历史视频原文件失败，改用视频链接打开:', err);
            }
          }

          if (videoSrc) {
            if (/^data:video\//i.test(videoSrc) || /^blob:/i.test(videoSrc)) {
              openVideoLightbox(videoSrc);
              return;
            }
            window.open(videoSrc, '_blank', 'noopener');
            return;
          }
          showUiError('这条历史记录没有可播放的视频');
          return;
        }

        const localFilename = getHistoryLocalFilename(record);
        if (localFilename && folderHandle) {
          try {
            const src = await loadImageFromFolder(localFilename);
            openLightbox(src);
            return;
          } catch (err) {
            console.warn('读取历史原图失败，改用可用预览图:', err);
          }
        }

        const fallbackSrc = record.thumbnail || record.imageSrc || record.imageUrl;
        if (fallbackSrc) {
          openLightbox(fallbackSrc);
        } else {
          showUiError('这条历史记录没有可预览的图片');
        }
      }

      function openVideoLightbox(videoSrc) {
        if (!videoSrc) {
          showUiError('这条历史记录没有可播放的视频');
          return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay active video-lightbox';
        overlay.innerHTML = `
          <div class="dialog-content video-lightbox-content">
            <button class="settings-close-btn video-lightbox-close" type="button" aria-label="关闭视频">✕</button>
            <video src="${escapeHtml(videoSrc)}" controls autoplay playsinline></video>
          </div>
        `;

        const surface = overlay.querySelector('.video-lightbox-content');
        const managed = openManagedOverlay(overlay, {
          surface,
          label: '视频预览'
        });
        const close = () => managed.close();
        overlay.querySelector('.video-lightbox-close')?.addEventListener('click', close);
      }

      async function downloadImageSource(src, filename) {
        if (!src) throw new Error('没有可下载的图片');

        if (isMobileDevice()) {
          await saveToMobileAlbum(src, filename);
          return { mode: 'mobile_share' };
        }

        let href = src;
        let objectUrl = '';
        let mode = /^https?:\/\//i.test(src) ? 'link_fallback' : 'download';

        try {
          const response = await fetch(src);
          if (!response.ok) {
            throw new Error(`图片下载失败: HTTP ${response.status}`);
          }
          const blob = await response.blob();
          objectUrl = URL.createObjectURL(blob);
          href = objectUrl;
          mode = 'download';
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

        return { mode };
      }

      async function fetchMediaBlob(src, label = '媒体', options = {}) {
        if (!src) throw new Error(`${label}地址为空`);
        const normalizedSrc = normalizeResultMediaUrl(src);
        const isGoogleMedia = isKnownMediaProxyHost(normalizedSrc);
        const googleApiKey = isGoogleMedia && typeof getApiKey === 'function' ? getApiKey() : '';
        const maxRetries = Number.isFinite(options.maxRetries) ? options.maxRetries : 2;
        const idleTimeoutMs = Number.isFinite(options.idleTimeoutMs) ? options.idleTimeoutMs : 20000;
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

        function createIdleTimeout(controller) {
          let timer = null;
          const clear = () => {
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
          };
          const reset = () => {
            clear();
            timer = setTimeout(() => {
              try { controller.abort(); } catch {}
            }, idleTimeoutMs);
          };
          return { reset, clear };
        }

        async function readResponseAsBlob(response, onChunk) {
          const totalBytes = Number(response.headers.get('content-length') || 0) || 0;
          const contentType = response.headers.get('content-type') || 'application/octet-stream';
          if (!response.body || typeof response.body.getReader !== 'function') {
            const blob = await response.blob();
            onChunk?.();
            onProgress?.({
              loadedBytes: blob.size,
              totalBytes: totalBytes || blob.size || undefined,
              percent: blob.size ? 100 : undefined
            });
            return blob;
          }

          const reader = response.body.getReader();
          const chunks = [];
          let loadedBytes = 0;
          onProgress?.({ loadedBytes, totalBytes: totalBytes || undefined, percent: totalBytes ? 0 : undefined });
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            chunks.push(value);
            loadedBytes += value.byteLength;
            onChunk?.();
            onProgress?.({
              loadedBytes,
              totalBytes: totalBytes || undefined,
              percent: totalBytes ? Math.min(100, Math.round(loadedBytes / totalBytes * 100)) : undefined
            });
          }
          return new Blob(chunks, { type: contentType });
        }

        async function fetchBlob(url, headers = {}) {
          let lastError = null;
          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const idle = createIdleTimeout(controller);
            try {
              idle.reset();
              const response = await fetch(url, {
                cache: 'no-store',
                headers,
                signal: controller.signal
              });
              if (!response.ok) {
                const err = new Error(`${label}读取失败: HTTP ${response.status}`);
                err.status = response.status;
                err.retryAfter = response.headers.get('Retry-After') || '';
                throw err;
              }
              idle.reset();
              // 每个数据块重置空闲计时，避免大图慢速下载被误判超时
              const blob = await readResponseAsBlob(response, () => idle.reset());
              idle.clear();
              return blob;
            } catch (err) {
              idle.clear();
              lastError = err;
              if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
                continue;
              }
            }
          }
          throw lastError || new Error(`${label}读取失败`);
        }

        if (isGoogleMedia) {
          const proxyUrl = buildMediaProxyUrlForTarget(normalizedSrc, { retry: true });
          try {
            return await fetchBlob(
              proxyUrl,
              googleApiKey ? { 'X-Goog-Api-Key': googleApiKey } : {}
            );
          } catch (err) {
            const detail = err?.message || String(err || '读取失败');
            throw new Error(`Google 返回的临时图片地址无法读取，可能已过期或需要有效 API Key（${detail}）`);
          }
        }

        try {
          return await fetchBlob(normalizedSrc);
        } catch (err) {
          if (!canProxyMediaUrl(normalizedSrc)) throw err;
          console.warn(`${label}直连读取失败，尝试通过代理读取:`, err);
          try {
            const proxyUrl = isKnownMediaProxyHost(normalizedSrc)
              ? buildMediaProxyUrlForTarget(normalizedSrc, { retry: options.forceRefresh === true })
              : buildApiProxyUrlForTarget(normalizedSrc);
            return await fetchBlob(proxyUrl);
          } catch (proxyErr) {
            throw new Error(`${label}读取失败，直连和代理都不可用：${proxyErr.message || proxyErr}`);
          }
        }
      }

      async function downloadVideoSource(src, filename) {
        if (!src) throw new Error('没有可下载的视频');

        let href = src;
        let objectUrl = '';
        let mode = /^https?:\/\//i.test(src) ? 'link_fallback' : 'download';

        try {
          const blob = await fetchMediaBlob(src, '视频');
          objectUrl = URL.createObjectURL(blob);
          href = objectUrl;
          mode = 'download';
        } catch (err) {
          if (!/^https?:\/\//i.test(src)) throw err;
          console.warn('视频 fetch 下载失败，改用链接打开:', err);
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

        return { mode };
      }

      // 渲染历史记录
      async function renderHistory() {
        syncHistoryActions('loading');
        try {
          const records = await loadHistory();
          historyCountEl.textContent = `${records.length} 条`;

          if (records.length === 0) {
            historyCurrentPage = 1;
            historyLastPageSize = 0;
            renderHistoryEmptyState('empty');
            updateHistoryPagination(0, 1);
            syncHistoryActions('empty');
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
            const isVideoRecord = record.mediaType === 'video';
            const localFilename = getHistoryLocalFilename(record);
            const filenameHint = getHistoryFilenameHint(record);
            const previewMarkup = isVideoRecord
              ? (record.thumbnail
                ? `<img class="history-video-poster" src="${escapeHtml(record.thumbnail)}" alt="视频封面">`
                : `<div class="history-video-placeholder"><span class="history-video-play-icon">▶</span><span>视频</span></div>`)
              : (record.thumbnail
                ? `<img class="history-image-preview" src="${escapeHtml(record.thumbnail)}" alt="缩略图">`
                : `<div class="history-image-missing"><span class="history-image-missing-icon">↗</span><span>点击查看原图</span></div>`);
            const primaryActionMarkup = isVideoRecord
              ? `<button class="action-btn play-btn" type="button" title="播放历史视频"><span class="action-icon">▶</span><span class="action-text">播放</span></button>`
              : `<button class="action-btn add-btn" title="从保存文件夹读取 ${escapeHtml(filenameHint)} 并添加到参考图"><span class="action-icon">➕</span><span class="action-text">参考</span></button>`;

            card.innerHTML = `
              <div class="history-image-wrap">
                ${previewMarkup}
                <button class="history-info-btn" type="button" title="查看生成参数" aria-label="查看生成参数">
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle cx="12" cy="12" r="8.5"></circle>
                    <path d="M12 10.6v5.2"></path>
                    <path d="M12 7.7h.01"></path>
                  </svg>
                </button>
              </div>
              <div class="info">
                <div class="history-prompt-row">
                  <div class="prompt" title="点击复制提示词">${escapeHtml(record.prompt || '无提示词')}</div>
                  <button class="action-btn save-prompt-btn" type="button" title="${record.prompt ? '保存提示词到库' : '这条记录没有可保存的提示词'}" ${record.prompt ? '' : 'disabled'}><span class="action-icon">💾</span><span class="action-text">存词</span></button>
                </div>
                <div class="meta">
                  <span>${formatDate(record.timestamp)}</span>
                  <div class="history-actions">
                    ${primaryActionMarkup}
                    <button class="action-btn download-btn" type="button" title="${isVideoRecord ? '下载历史视频' : '下载历史图片'}"><span class="action-icon">⬇️</span><span class="action-text">下载</span></button>
                    <button class="action-btn delete-btn" data-id="${record.id}" title="删除历史记录"><span class="action-icon">🗑️</span><span class="action-text">删除</span></button>
                  </div>
                </div>
              </div>
            `;

            const historyImageWrap = card.querySelector('.history-image-wrap');
            const imagePreview = card.querySelector('.history-image-preview');
            imagePreview?.addEventListener('error', () => {
              imagePreview.replaceWith(createHistoryMissingPreview());
            }, { once: true });

            // 点击缩略图放大查看
            historyImageWrap?.addEventListener('click', () => {
              openHistoryPreview(record);
            });

            const historyInfoBtn = card.querySelector('.history-info-btn');
            historyInfoBtn?.addEventListener('click', (e) => {
              e.stopPropagation();
              showHistoryParamsDialog(record);
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
                showUiError('复制失败，请手动选择文本复制');
              }
            });

            // 添加到参考图按钮
            const addBtn = card.querySelector('.add-btn');
            if (addBtn && !isVideoRecord) {
              addBtn.addEventListener('click', async (e) => {
                e.stopPropagation();

                // 检查参考图数量限制
                const limit = getReferenceImageLimit();
                if (state.images.length >= limit) {
                  showUiError(`参考图最多只能添加 ${limit} 张`);
                  return;
                }

                try {
                  setHistoryActionButtonContent(addBtn, '⏳', '处理中');
                  addBtn.disabled = true;

                  const hdImage = await loadImageFromFolder(localFilename);

                  // 添加到参考图
                  const addedReference = {
                    name: localFilename,
                    mime: 'image/png',
                    dataUrl: hdImage
                  };
                  state.images.push(addedReference);

                  renderUploads({ reason: 'added', added: [addedReference] });
                  flashStatus(`已添加到参考图（共 ${state.images.length} 张）`, 'success');

                  setHistoryActionButtonContent(addBtn, '✓', '已添加');
                  setTimeout(() => {
                    setHistoryActionButtonContent(addBtn, '➕', '参考');
                    addBtn.disabled = false;
                  }, 1500);
                } catch (err) {
                  setHistoryActionButtonContent(addBtn, '➕', '参考');
                  addBtn.disabled = false;
                  showUiError(`未在保存文件夹中找到原图。请先下载原图，并重命名为：${filenameHint}，然后放入当前保存文件夹后再试。`);
                }
              });
            }

            const playBtn = card.querySelector('.play-btn');
            if (playBtn && isVideoRecord) {
              playBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await openHistoryPreview(record);
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
                  const downloadItem = isVideoRecord
                    ? await getHistoryDownloadVideo(record)
                    : await getHistoryDownloadImage(record);
                  const downloadResult = isVideoRecord
                    ? await downloadVideoSource(downloadItem.src, downloadItem.filename)
                    : await downloadImageSource(downloadItem.src, downloadItem.filename);

                  if (isVideoRecord) {
                    if (downloadResult?.mode === 'link_fallback') {
                      flashStatus('已打开历史视频链接，可直接下载视频', 'success');
                    } else {
                      flashStatus('已开始下载历史视频', 'success');
                    }
                    return;
                  }

                  if (downloadItem.quality === 'original') {
                    if (downloadResult?.mode === 'link_fallback' && record.imageUrl) {
                      flashStatus(`已打开历史原图链接，请保存为 ${downloadItem.filename}`, 'success');
                    } else {
                      flashStatus('已开始下载历史原图', 'success');
                    }
                  } else if (localFilename) {
                    flashStatus(`未找到原图，已下载可用预览图；如需补回高清图，请命名为 ${localFilename}`, 'danger');
                  } else {
                    flashStatus('已开始下载历史缩略图', 'success');
                  }
                } catch (err) {
                  console.error(isVideoRecord ? '下载历史视频失败:' : '下载历史图片失败:', err);
                  showUiError(err.message || (isVideoRecord ? '下载历史视频失败' : '下载历史图片失败'));
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
                openPromptSaveEditor(record.prompt, {
                  context: 'history',
                  coverUrl: getHistoryPromptCover(record),
                  coverFallbackUrls: getHistoryPromptCoverCandidates(record).slice(1),
                  coverSource: 'history'
                });
              });
            }

            // 长提示词 tooltip
            const promptContainer = card.querySelector('.history-prompt-row');
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
              if (await confirmUiAction({
                title: '删除历史记录',
                message: '确定删除这条历史记录？此操作不可恢复。',
                confirmLabel: '删除',
                danger: true,
                trigger: e.currentTarget
              })) {
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
          syncHistoryActions('ready', records.length);
        } catch (err) {
          console.error('加载历史记录失败:', err);
          historyCountEl.textContent = '加载失败';
          renderHistoryEmptyState('error');
          updateHistoryPagination(0, 1);
          syncHistoryActions('error');
        }
      }

      // 辅助函数：把接口返回的 error 字段规整成可读文本
      // 有些网关返回 { error: { message, code } }，直接拼字符串会得到 "[object Object]"
      function describeApiError(value, fallback) {
        if (value == null) return fallback;
        if (typeof value === 'string') return value.trim() || fallback;
        if (typeof value === 'object') {
          const msg = value.message || value.msg || value.detail || value.error_msg;
          if (typeof msg === 'string' && msg.trim()) return msg.trim();
          try {
            return JSON.stringify(value);
          } catch (_) {
            return fallback;
          }
        }
        return String(value) || fallback;
      }

      // 辅助函数：HTML 转义（同时转义引号，可安全用于属性值）
      function escapeHtml(text) {
        return String(text ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
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

      function createHistoryMissingPreview() {
        const placeholder = document.createElement('div');
        placeholder.className = 'history-image-missing';
        placeholder.innerHTML = '<span class="history-image-missing-icon">↗</span><span>点击查看原图</span>';
        return placeholder;
      }

      function getCurrentGenerationParams(overrides = {}) {
        return {
          aspect: aspectSelect?.value || '',
          resolution: resolutionSelect?.value || '',
          quality: imageQualitySelect?.value || '',
          videoDuration: videoDurationSelect?.value || '',
          model: getImageModel(),
          protocol: getProtocol(),
          ...overrides
        };
      }

      function listSelectOptions(selectEl) {
        if (!selectEl) return [];
        return Array.from(selectEl.options || [])
          .map(option => ({
            value: String(option.value || ''),
            label: String(option.textContent || option.label || option.value || '').trim() || String(option.value || '')
          }))
          .filter(option => option.value);
      }

      function getTextModelOptions() {
        const current = getTextModel();
        const options = listSelectOptions(textModelSelect);
        if (!options.length) {
          return [{ value: current, label: current, selected: true }];
        }
        return options.map(option => ({
          ...option,
          selected: option.value === current
        }));
      }

      function setTextModel(value) {
        const next = String(value || '').trim();
        if (!next || !textModelSelect) return false;
        ensureModelOption(textModelSelect, next, next);
        textModelSelect.value = next;
        try {
          localStorage.setItem(getPlatformStorageKey(TEXT_MODEL_STORAGE_PREFIX), next);
        } catch {}
        return textModelSelect.value === next;
      }

      function getGenerationOptions(mediaType = 'image') {
        const kind = mediaType === 'video' ? 'video' : 'image';
        let modelOptions = listSelectOptions(imageModelSelect);
        const aspectOptions = listSelectOptions(aspectSelect);
        const resolutionOptions = listSelectOptions(resolutionSelect);
        const qualityOptions = listSelectOptions(imageQualitySelect);
        const durationOptions = listSelectOptions(videoDurationSelect);
        const current = getCurrentGenerationParams();
        const fallbackModel = current.model || (typeof getImageModel === 'function' ? getImageModel() : '') || imageModelSelect?.value || 'gpt-image-2';
        if (!modelOptions.length && fallbackModel) {
          modelOptions = [{ value: fallbackModel, label: fallbackModel }];
        } else if (fallbackModel && !modelOptions.some(option => option.value === fallbackModel)) {
          modelOptions = [{ value: fallbackModel, label: fallbackModel }, ...modelOptions];
        }
        return {
          mediaType: kind,
          model: fallbackModel || '',
          aspect: current.aspect || '',
          resolution: current.resolution || '',
          quality: current.quality || 'auto',
          duration: current.videoDuration || '10',
          protocol: current.protocol || '',
          modelOptions,
          aspectOptions,
          resolutionOptions,
          qualityOptions,
          durationOptions
        };
      }

      function temporarilyApplyGenerationParams(overrides = {}) {
        const snapshot = {
          model: imageModelSelect?.value || '',
          aspect: aspectSelect?.value || '',
          resolution: resolutionSelect?.value || '',
          quality: imageQualitySelect?.value || '',
          videoDuration: videoDurationSelect?.value || ''
        };

        if (overrides.model && imageModelSelect) {
          ensureModelOption(imageModelSelect, overrides.model, overrides.model);
          imageModelSelect.value = overrides.model;
        }
        if (overrides.aspect && aspectSelect) {
          const hasAspect = [...(aspectSelect.options || [])].some(opt => opt.value === overrides.aspect);
          if (hasAspect) aspectSelect.value = overrides.aspect;
        }
        if (overrides.resolution && resolutionSelect) {
          const hasResolution = [...(resolutionSelect.options || [])].some(opt => opt.value === overrides.resolution);
          if (hasResolution) resolutionSelect.value = overrides.resolution;
        }
        if (overrides.quality && imageQualitySelect) {
          const hasQuality = [...(imageQualitySelect.options || [])].some(opt => opt.value === overrides.quality);
          if (hasQuality) imageQualitySelect.value = overrides.quality;
        }
        if (overrides.videoDuration && videoDurationSelect) {
          const hasDuration = [...(videoDurationSelect.options || [])].some(opt => opt.value === String(overrides.videoDuration));
          if (hasDuration) videoDurationSelect.value = String(overrides.videoDuration);
        }

        return () => {
          if (imageModelSelect) imageModelSelect.value = snapshot.model;
          if (aspectSelect) aspectSelect.value = snapshot.aspect;
          if (resolutionSelect) resolutionSelect.value = snapshot.resolution;
          if (imageQualitySelect) imageQualitySelect.value = snapshot.quality;
          if (videoDurationSelect) videoDurationSelect.value = snapshot.videoDuration;
        };
      }

      async function runAgentGeneration(mediaType, prompt, options = {}) {
        const kind = mediaType === 'video' ? 'video' : 'image';
        const signal = options.signal;
        const throwIfAborted = () => {
          if (!signal?.aborted) return;
          throw signal.reason || new DOMException('Generation cancelled', 'AbortError');
        };
        throwIfAborted();
        if (!String(prompt || '').trim()) {
          throw new Error(kind === 'video' ? '视频提示词不能为空' : '图片提示词不能为空');
        }

        const restore = temporarilyApplyGenerationParams({
          model: options.model,
          aspect: options.aspect,
          resolution: options.resolution,
          quality: options.quality,
          videoDuration: options.videoDuration || options.duration
        });

        try {
          const images = Array.isArray(options.images) ? options.images.filter(img => img?.dataUrl) : [];
          const params = getCurrentGenerationParams({
            model: options.model || getImageModel(),
            aspect: options.aspect || aspectSelect?.value || '',
            resolution: options.resolution || resolutionSelect?.value || '',
            quality: options.quality || imageQualitySelect?.value || '',
            videoDuration: options.videoDuration || options.duration || videoDurationSelect?.value || '',
            protocol: getProtocol()
          });

          if (kind === 'video') {
            if (typeof callVideoAPI !== 'function') {
              throw new Error('当前页面未暴露视频生成方法');
            }
            const result = await callVideoAPI(prompt, images, signal);
            throwIfAborted();
            return { result, params };
          }

          if (typeof callImageAPI !== 'function') {
            throw new Error('当前页面未暴露图片生成方法');
          }
          const result = await callImageAPI(prompt, images, signal);
          throwIfAborted();
          return { result, params };
        } finally {
          restore();
        }
      }

      function formatGenerationParamValue(key, value) {
        if (value === undefined || value === null || value === '') return '';
        const normalized = String(value);
        const maps = {
          aspect: { auto: 'auto[自动]' },
          quality: { auto: 'auto[自动]', low: 'low[低]', medium: 'medium[中]', high: 'high[高]', standard: 'standard[标准]', hd: 'hd[高清]' },
          protocol: { gemini: 'Gemini 原生', 'openai-chat': 'OpenAI Chat', 'openai-images': 'OpenAI Images', 'openai-responses': 'OpenAI Responses', 'open-images': 'Open Images', 'aliyun-images': '阿里云百炼', 'doubao-images': '豆包官方', 'replicate-flux': 'Replicate 官方', 'openai-videos': 'OpenAI Videos', 'openai-video-chat': 'OpenAI Chat 兼容', 'veo-generations': 'Veo Generations', 'veo-create': 'Video Create', 'aliyun-happyhorse': '阿里 HappyHorse', 'doubao-seedance': '豆包 Seedance', 'grok-video-create': 'Grok Video Create', 'local-gif': '本地动图生成', 'gif-grid': '网格生帧' }
        };
        if (key === 'videoDuration') return `${normalized} 秒`;
        return maps[key]?.[normalized] || normalized;
      }

      function getHistoryParamRows(record) {
        const localFilename = getHistoryFilenameHint(record);
        const rows = record.mediaType === 'video'
          ? [
              ['本地文件名', 'filename', localFilename],
              ['视频比例', 'aspect', record.aspect],
              ['视频清晰度', 'resolution', record.resolution],
              ['视频时长', 'videoDuration', record.videoDuration],
              ['视频模型', 'model', record.model],
              ['API 协议', 'protocol', record.protocol],
              ['生成耗时', 'runtimeMs', record.runtimeMs ? formatDurationMs(record.runtimeMs) : '']
            ]
          : [
              ['本地文件名', 'filename', localFilename],
              ['图片比例', 'aspect', record.aspect],
              ['清晰度', 'resolution', record.resolution],
              ['质量', 'quality', record.quality],
              ['生图模型', 'model', record.model],
              ['API 协议', 'protocol', record.protocol],
              ['生成耗时', 'runtimeMs', record.runtimeMs ? formatDurationMs(record.runtimeMs) : '']
            ];
        return rows
          .map(([label, key, value]) => [label, formatGenerationParamValue(key, value)])
          .filter(([, value]) => value);
      }

      function showHistoryParamsDialog(record) {
        const rows = getHistoryParamRows(record);
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay active';
        dialogOverlay.innerHTML = `
          <div class="dialog-content history-params-dialog">
            <div class="dialog-title">生成参数</div>
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

        const managed = openManagedOverlay(dialogOverlay, {
          surface: dialogOverlay.querySelector('.history-params-dialog'),
          label: '生成参数'
        });
        const closeDialog = () => managed.close();
        dialogOverlay.querySelector('.dialog-btn-cancel')?.addEventListener('click', closeDialog);
      }

      // ========== 提示词库 UI 交互 ==========

      function openPromptSaveEditor(promptContent, options = {}) {
        const content = String(promptContent || '').trim();
        if (!content) return null;
        const coverUrl = String(options.coverUrl || '').trim();
        return openPromptLibraryFromHost({
          context: options.context || 'studio',
          tab: 'mine',
          draft: {
            title: String(options.title || getPromptTitle(content)).trim(),
            content,
            category: String(options.category || '其他'),
            coverUrl,
            coverFallbackUrls: Array.isArray(options.coverFallbackUrls) ? options.coverFallbackUrls : [],
            coverSource: String(options.coverSource || '').trim()
          }
        });
      }

      function getHistoryPromptCoverCandidates(record = {}) {
        const values = String(record.mediaType || '').toLowerCase() === 'video'
          ? [record.thumbnail]
          : [record.imageSrc, record.imageUrl, record.thumbnail];
        return [...new Set(values.map(value => String(value || '').trim()))].filter(value => (
          /^https?:\/\//i.test(value) || /^data:image\//i.test(value)
        ));
      }

      function getHistoryPromptCover(record = {}) {
        return getHistoryPromptCoverCandidates(record)[0] || '';
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
        if (settingsDraft) {
          if (isMobileDevice() || !('showDirectoryPicker' in window)) {
            settingsDraft.folderHandle = null;
            settingsDraft.folderAction = 'default';
            markSettingsDirty();
            syncSettingsFolderUi();
            flashStatus('当前环境将使用浏览器默认下载位置', 'success');
            return;
          }
          try {
            settingsDraft.folderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            settingsDraft.folderAction = 'set';
            markSettingsDirty();
            syncSettingsFolderUi();
            flashStatus(`已选择保存文件夹：${settingsDraft.folderHandle.name}`, 'success');
          } catch (err) {
            if (err?.name !== 'AbortError') console.error('选择文件夹失败', err);
          }
          return;
        }
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
        if (settingsDraft) {
          settingsDraft.folderHandle = null;
          settingsDraft.folderAction = 'reset';
          markSettingsDirty();
          syncSettingsFolderUi();
          return;
        }
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

        const folderState = await ensureWritableFolderHandle({
          mode: 'readwrite',
          requestPermission: false,
          autoReselect: false
        });
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

      async function saveVideoFile(videoSrc, filename) {
        if (isMobileDevice()) {
          return { status: 'not_configured' };
        }

        if (!folderHandle) {
          debugLog('未选择保存文件夹，跳过自动保存视频:', filename);
          return { status: 'not_configured' };
        }

        const folderState = await ensureWritableFolderHandle({
          mode: 'readwrite',
          requestPermission: false,
          autoReselect: false
        });
        if (!folderState.ok) {
          return { status: folderState.reason || 'save_failed' };
        }

        try {
          const blob = await fetchMediaBlob(videoSrc, '视频');
          const targetHandle = folderState.handle || folderHandle;
          const fileHandle = await targetHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          debugLog(`视频已保存到文件夹: ${filename}`);
          return { status: folderState.reselected ? 'reselected_and_saved' : 'saved_to_folder' };
        } catch (err) {
          console.error('保存视频到文件夹失败:', err);
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

      function getSaveVideoResultMessage(saveResult) {
        switch (saveResult?.status) {
          case 'saved_to_folder':
            return { type: 'success', text: '历史记录已保存，原视频已写入所选文件夹' };
          case 'reselected_and_saved':
            return { type: 'success', text: '已重新授权保存文件夹，历史记录和原视频都已保存' };
          case 'permission_denied':
            return { type: 'danger', text: '历史记录已保存，但未获得文件夹写入权限，原视频没有保存到所选文件夹' };
          case 'folder_unavailable':
            return { type: 'danger', text: '历史记录已保存，但当前文件夹不可用，原视频没有保存到所选文件夹' };
          case 'save_failed':
            return { type: 'danger', text: '历史记录已保存，但写入文件夹失败，原视频没有保存到所选文件夹' };
          case 'not_configured':
          default:
            return { type: 'success', text: '历史记录已保存，未配置自动保存文件夹' };
        }
      }

      function shouldSkipAutoSaveBecausePreflightFailed(preflightResult) {
        return !!folderHandle && ['permission_denied', 'folder_unavailable'].includes(preflightResult?.status);
      }

      async function handleSaveToAlbum(base64Src, filename) {
        try {
          const result = await downloadImageSource(base64Src, filename);
          if (result?.mode === 'mobile_share') {
            flashStatus('已打开保存菜单，请选择保存到相册或文件', 'success');
          } else {
            flashStatus('已开始下载图片', 'success');
          }
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error('保存图片失败:', err);
            flashStatus('保存失败，请点击“下载”按钮或打开原图后手动保存', 'danger');
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
          const folderState = await ensureWritableFolderHandle({
            mode: 'read',
            requestPermission: true,
            autoReselect: true
          });
          if (!folderState.ok) {
            throw new Error('需要重新选择保存文件夹后才能读取高清图');
          }

          const targetHandle = folderState.handle || folderHandle;
          const fileHandle = await targetHandle.getFileHandle(filename);
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

      async function loadFileFromFolder(filename) {
        if (!folderHandle) {
          throw new Error('请先选择保存文件夹');
        }

        try {
          const folderState = await ensureWritableFolderHandle({
            mode: 'read',
            requestPermission: true,
            autoReselect: true
          });
          if (!folderState.ok) {
            throw new Error('需要重新选择保存文件夹后才能读取原文件');
          }

          const targetHandle = folderState.handle || folderHandle;
          const fileHandle = await targetHandle.getFileHandle(filename);
          const file = await fileHandle.getFile();
          return URL.createObjectURL(file);
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
        if (await confirmUiAction({
          title: '清空历史记录',
          message: '确定清空所有历史记录？此操作不可恢复。',
          confirmLabel: '清空历史',
          danger: true,
          trigger: clearHistoryBtn
        })) {
          await clearAllHistory();
          await renderHistory();
          flashStatus('已清空历史记录', 'success');
        }
        if (historyMoreMenu) historyMoreMenu.open = false;
      });

      exportHistoryBtn?.addEventListener('click', async () => {
        try {
          await exportHistoryRecords();
        } catch (err) {
          console.error('导出历史记录失败:', err);
          showUiError(err.message || '导出历史记录失败');
        } finally {
          if (historyMoreMenu) historyMoreMenu.open = false;
        }
      });

      function openHistoryImportPicker() {
        if (historyMoreMenu) historyMoreMenu.open = false;
        historyImportFileInput?.click();
      }

      importHistoryBtn?.addEventListener('click', openHistoryImportPicker);
      historyGrid?.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('#history-empty-import')) {
          openHistoryImportPicker();
          return;
        }
        if (target?.closest('#history-retry')) {
          renderHistory();
        }
      });

      historyImportFileInput?.addEventListener('change', async () => {
        const file = historyImportFileInput.files?.[0];
        historyImportFileInput.value = '';
        if (!file) return;

        try {
          await handleHistoryImportFile(file);
        } catch (err) {
          console.error('导入历史记录失败:', err);
          showUiError(err.message || '导入历史记录失败');
        }
      });

      // 拉取模型列表
      const addModelsBtn = document.getElementById('add-models-btn');
      const deleteImageModelBtn = document.getElementById('delete-image-model-btn');
      const deleteTextModelBtn = document.getElementById('delete-text-model-btn');

      function getStoredModels(platformId = activePlatformId) {
        try {
          const raw = localStorage.getItem(getPlatformStorageKey(MODEL_LIST_STORAGE_PREFIX, platformId))
            || localStorage.getItem(MODEL_LIST_STORAGE_PREFIX)
            || '[]';
          const models = JSON.parse(raw);
          return Array.isArray(models) ? models : [];
        } catch (e) {
          return [];
        }
      }

      function setStoredModels(models, platformId = activePlatformId) {
        localStorage.setItem(getPlatformStorageKey(MODEL_LIST_STORAGE_PREFIX, platformId), JSON.stringify(models || []));
      }

      function saveStoredModel(modelId, modelName, platformId = activePlatformId) {
        const models = getStoredModels(platformId);
        const exists = models.some(m => m.id === modelId);
        if (!exists) {
          models.push({ id: modelId, name: modelName || modelId });
          setStoredModels(models, platformId);
        }
      }

      function deleteStoredModel(modelId, platformId = activePlatformId) {
        const models = getStoredModels(platformId).filter(m => m.id !== modelId);
        setStoredModels(models, platformId);
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
        const supported = settingsIsOpen ? !!getPlatformConfig(getSettingsPlatformId()).supported : isActivePlatformSupported();
        if (!supported) {
          flashStatus('当前平台尚未接入模型管理，请先切换到已接入平台', 'danger');
          return;
        }
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'dialog-overlay active';
        dialogOverlay.innerHTML = `
          <div class="dialog-content">
            <div class="dialog-title">➕ 手动添加模型</div>
            <div class="dialog-desc">可一次添加生图模型和文本优化模型。两个输入框至少填写一个，添加后会自动选中，点击设置底部“保存”后生效。</div>
            <input class="dialog-input" id="manual-image-model" type="text" placeholder="生图模型，例如：gpt-image-2" autocomplete="off" />
            <input class="dialog-input" id="manual-text-model" type="text" placeholder="文本优化模型，例如：gpt-5.4-mini" autocomplete="off" />
            <div class="dialog-actions">
              <button class="dialog-btn dialog-btn-cancel" type="button">取消</button>
              <button class="dialog-btn dialog-btn-confirm" type="button">添加</button>
            </div>
          </div>
        `;

        const imageInput = dialogOverlay.querySelector('#manual-image-model');
        const textInput = dialogOverlay.querySelector('#manual-text-model');
        const cancelBtn = dialogOverlay.querySelector('.dialog-btn-cancel');
        const confirmBtn = dialogOverlay.querySelector('.dialog-btn-confirm');

        const managed = openManagedOverlay(dialogOverlay, {
          surface: dialogOverlay.querySelector('.dialog-content'),
          label: '手动添加模型'
        });
        const closeDialog = () => managed.close();
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
          });
        });
        setTimeout(() => imageInput?.focus(), 80);
      }

      function addManualModel(type, modelId) {
        if (settingsIsOpen && settingsDraft) {
          const targetSelect = type === 'image' ? imageModelSelect : textModelSelect;
          ensureModelOption(targetSelect, modelId, modelId);
          const platformId = settingsDraft.activePlatformId;
          const models = settingsDraft.modelLists[platformId] || [];
          if (!models.some(model => model.id === modelId)) models.push({ id: modelId, name: modelId });
          settingsDraft.modelLists[platformId] = models;
          settingsDraft.platformSettings[platformId] = {
            ...(settingsDraft.platformSettings[platformId] || {}),
            ...(type === 'image' ? { imageModel: modelId } : { textModel: modelId })
          };
          markSettingsDirty();
          return;
        }
        const label = type === 'image' ? '生图模型' : '文本优化模型';
        const targetSelect = type === 'image' ? imageModelSelect : textModelSelect;
        ensureModelOption(targetSelect, modelId, modelId);
        saveStoredModel(modelId, modelId);
        localStorage.setItem(
          getPlatformStorageKey(type === 'image' ? IMAGE_MODEL_STORAGE_PREFIX : TEXT_MODEL_STORAGE_PREFIX),
          modelId
        );
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

      async function deleteCurrentModel(type) {
        const supported = settingsIsOpen ? !!getPlatformConfig(getSettingsPlatformId()).supported : isActivePlatformSupported();
        if (!supported) {
          flashStatus('当前平台尚未接入模型管理，请先切换到已接入平台', 'danger');
          return;
        }
        const label = type === 'image' ? '生图模型' : '文本优化模型';
        const targetSelect = type === 'image' ? imageModelSelect : textModelSelect;
        const storageKey = type === 'image' ? IMAGE_MODEL_STORAGE_PREFIX : TEXT_MODEL_STORAGE_PREFIX;
        const modelId = targetSelect.value;
        const platformConfig = getPlatformConfig(settingsIsOpen ? getSettingsPlatformId() : activePlatformId);
        const defaultModel = type === 'image' ? platformConfig.defaultImageModel : platformConfig.defaultTextModel;
        if (modelId === defaultModel) {
          flashStatus('平台注册默认模型不可删除', 'danger');
          return;
        }
        if (!modelId) {
          flashStatus(`没有可删除的${label}`, 'danger');
          return;
        }
        if (!(await confirmUiAction({
          title: `删除当前${label}`,
          message: `确定删除当前${label}？\n${modelId}`,
          confirmLabel: '删除',
          danger: true
        }))) return;

        removeModelOption(imageModelSelect, modelId);
        removeModelOption(textModelSelect, modelId);
        if (settingsIsOpen && settingsDraft) {
          const platformId = settingsDraft.activePlatformId;
          settingsDraft.modelLists[platformId] = (settingsDraft.modelLists[platformId] || []).filter(model => model.id !== modelId);
          const platform = getPlatformConfig(platformId);
          settingsDraft.platformSettings[platformId] = {
            ...(settingsDraft.platformSettings[platformId] || {}),
            imageModel: imageModelSelect.value || platform.defaultImageModel || 'gpt-image-2',
            textModel: textModelSelect.value || platform.defaultTextModel || DEFAULT_TEXT_MODEL
          };
          markSettingsDirty();
          return;
        }
        deleteStoredModel(modelId);
        localStorage.setItem(getPlatformStorageKey(IMAGE_MODEL_STORAGE_PREFIX), imageModelSelect.value || '');
        localStorage.setItem(getPlatformStorageKey(TEXT_MODEL_STORAGE_PREFIX), textModelSelect.value || '');
        localStorage.setItem(getPlatformStorageKey(storageKey), targetSelect.value || '');
        flashStatus(`已删除模型: ${modelId}`, 'success');
      }

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
        if (textApiKeyInput) {
          textApiKeyInput.value = textApiKeyValue || '';
          textApiKeyInput.type = 'password';
        }
        if (proxyModeInput) {
          proxyModeInput.checked = localStorage.getItem(API_PROXY_MODE_KEY) === '1';
        }
        if (autoUpscaleInput) {
          autoUpscaleInput.checked = localStorage.getItem(AUTO_UPSCALE_KEY) === '1';
        }
        if (apiLinkEl) {
          const url = getBaseUrl();
          apiLinkEl.href = url.startsWith('/') ? apiHomeUrl : url;
        }

        const savedPlatformId = localStorage.getItem(ACTIVE_PLATFORM_STORAGE_KEY);
        const savedKind = localStorage.getItem(ACTIVE_PLATFORM_KIND_STORAGE_KEY);
        activePlatformKind = savedKind === 'video' ? 'video' : 'image';
        activePlatformId = PLATFORM_REGISTRY[savedPlatformId] ? savedPlatformId : getPlatformOrderForKind(activePlatformKind)[0];
        activePlatformId = ensurePlatformMatchesKind(activePlatformId, activePlatformKind);

        // 恢复协议选择
        const savedProtocol = localStorage.getItem('api_protocol');

        // 恢复模型列表
        const savedModels = getStoredModels(activePlatformId);
        if (savedModels.length > 0) {
          try {
            const models = savedModels;
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
        const savedImageModel = localStorage.getItem(getPlatformStorageKey(IMAGE_MODEL_STORAGE_PREFIX, activePlatformId))
          || localStorage.getItem(IMAGE_MODEL_STORAGE_PREFIX);
        const rawSavedTextModel = localStorage.getItem(getPlatformStorageKey(TEXT_MODEL_STORAGE_PREFIX, activePlatformId))
          || localStorage.getItem(TEXT_MODEL_STORAGE_PREFIX);
        const savedTextModel = isAvailableTextModel(rawSavedTextModel, activePlatformId)
          ? rawSavedTextModel
          : DEFAULT_TEXT_MODEL;
        if (savedImageModel) ensureModelOption(imageModelSelect, savedImageModel, savedImageModel);
        ensureModelOption(textModelSelect, savedTextModel, savedTextModel);
        setActivePlatform(activePlatformId, {
          skipPersistCurrent: true
        });
        const activePlatformSettings = loadPlatformSettings(activePlatformId);
        if (!activePlatformSettings) {
          if (savedProtocol && [...protocolSelect.options].some(o => o.value === savedProtocol)) {
            protocolSelect.value = savedProtocol;
          }
          if (savedImageModel) imageModelSelect.value = savedImageModel;
          if (savedTextModel) textModelSelect.value = savedTextModel;
          restoreSelectValue(aspectSelect, localStorage.getItem('image_aspect'));
          restoreSelectValue(resolutionSelect, localStorage.getItem('image_resolution'));
          restoreSelectValue(imageQualitySelect, localStorage.getItem('image_quality'));
          restoreSelectValue(outputFormatSelect, localStorage.getItem('output_format'));
          restoreSelectValue(imageBackgroundSelect, localStorage.getItem('image_background'));
        }

        const savedHistoryRetention = localStorage.getItem(HISTORY_IMAGE_RETENTION_KEY);
        setHistoryImageRetention(savedHistoryRetention);
        refreshCommittedSettingsSnapshot();
      }

      function saveSettings() {
        if (settingsIsOpen && settingsDraft) {
          commitSettingsDraft();
          return;
        }
        const apiKey = getApiKey();
        const rememberApiKey = !!rememberApiKeyInput?.checked;
        persistApiKey(apiKey, rememberApiKey);
        persistTextApiKey(textApiKeyValue);
        savePlatformSettings(activePlatformId);
        localStorage.setItem(ACTIVE_PLATFORM_STORAGE_KEY, activePlatformId);
        localStorage.setItem(API_PROXY_MODE_KEY, proxyModeInput?.checked ? '1' : '0');
        localStorage.setItem(getPlatformStorageKey(IMAGE_MODEL_STORAGE_PREFIX), imageModelSelect.value);
        localStorage.setItem(getPlatformStorageKey(TEXT_MODEL_STORAGE_PREFIX), textModelSelect.value);
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
      function classifyGenerationFailure(errorLike) {
        const status = Number(errorLike?.status || errorLike?.statusCode || 0) || 0;
        const retryAfterHeader = errorLike?.retryAfter || errorLike?.headers?.get?.('Retry-After') || '';
        const message = String(errorLike?.message || errorLike || '');
        const lower = message.toLowerCase();
        const retryableHints = [
          'temporarily unavailable', 'service unavailable', 'rate limit', 'too many requests',
          'resource_exhausted', 'overloaded', '请稍后重试', '请求频率超限', 'service temporarily',
          'timeout', 'timed out', 'network', 'fetch failed', 'econnreset', '503', '524', '429'
        ];
        const terminalHints = [
          'invalid api key', 'unauthorized', 'permission denied', 'quota is not enough',
          'token quota', 'content policy', 'safety', 'blocked', 'not found', 'unknown model',
          'invalid_request', 'invalid parameter', 'unsupported'
        ];

        let retryAfterMs = 0;
        if (retryAfterHeader) {
          const asNum = Number(retryAfterHeader);
          if (Number.isFinite(asNum) && asNum >= 0) retryAfterMs = asNum * 1000;
          else {
            const dateMs = Date.parse(retryAfterHeader);
            if (Number.isFinite(dateMs)) retryAfterMs = Math.max(0, dateMs - Date.now());
          }
        }

        if ([401, 403, 404, 422].includes(status)) {
          return { retryable: false, terminal: true, retryAfterMs, reason: 'terminal_status', message };
        }
        if ([429, 503, 504, 524].includes(status) || retryAfterMs > 0) {
          return { retryable: true, terminal: false, retryAfterMs, reason: 'rate_limit_or_unavailable', message };
        }
        if (terminalHints.some(hint => lower.includes(hint))) {
          return { retryable: false, terminal: true, retryAfterMs, reason: 'terminal_message', message };
        }
        if (retryableHints.some(hint => lower.includes(hint))) {
          return { retryable: true, terminal: false, retryAfterMs, reason: 'retryable_message', message };
        }
        return { retryable: false, terminal: false, retryAfterMs, reason: 'unknown', message };
      }

      function formatImageModelCompatibilityError(errorMessage, model = getImageModel()) {
        const message = String(errorMessage || '');
        if (!/images endpoint requires an image model/i.test(message)) return '';

        const quotedModel = message.match(/images endpoint requires an image model,\s*got\s+["']([^"']+)["']/i);
        const bareModel = message.match(/images endpoint requires an image model,\s*got\s+(.+?)(?:\s+\([^)]*\))?$/i);
        const rejectedModel = String(quotedModel?.[1] || bareModel?.[1] || model || '').trim();
        const modelLabel = rejectedModel ? `“${rejectedModel}”` : '当前模型';
        return `兼容图片接口拒绝了${modelLabel}。应用已原样发送你填写的模型名称，不限制、猜测或替换模型；请确认当前中转站是否支持该模型的图片接口。`;
      }

      function isExpectedCapabilityGuard(errorLike) {
        const message = String(errorLike?.message || errorLike || '');
        return /Gemini .*Google .*OpenAI Chat|Veo .*Base URL/i.test(message);
      }

      async function mapPool(items, limit, worker) {
        const list = Array.isArray(items) ? items : [];
        const concurrency = Math.max(1, Math.min(Number(limit) || 1, list.length || 1));
        const results = new Array(list.length);
        let nextIndex = 0;

        async function run() {
          while (nextIndex < list.length) {
            const current = nextIndex++;
            results[current] = await worker(list[current], current);
          }
        }

        await Promise.all(Array.from({ length: concurrency }, () => run()));
        return results;
      }

      function parseApiError(errorMessage) {
        const imageModelError = formatImageModelCompatibilityError(errorMessage);
        if (imageModelError) return imageModelError;

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
          'Too many requests': '请求过于频繁',
          'Upstream service': '上游服务暂时不可用',
          'temporarily unavailable': '暂时不可用'
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

      function notifyReferenceImagesChanged(change = {}) {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
        const added = Array.isArray(change.added)
          ? change.added
            .filter(image => image?.dataUrl)
            .map(image => ({
              dataUrl: image.dataUrl,
              mime: image.mime || 'image/png',
              name: image.name || image.label || ''
            }))
          : [];
        window.dispatchEvent(new CustomEvent('studio-reference-images-changed', {
          detail: {
            reason: change.reason || 'refresh',
            added,
            autoAttach: Boolean(change.autoAttach)
          }
        }));
      }

      async function updateLocalPromptRecord(id, patch = {}) {
        if (!db) await initDB();

        return new Promise((resolve, reject) => {
          const transaction = db.transaction(['prompts'], 'readwrite');
          const store = transaction.objectStore('prompts');
          const request = store.getAll();
          request.onsuccess = () => {
            const current = request.result.find(item => String(item?.id) === String(id));
            if (!current) {
              resolve(null);
              return;
            }
            const next = {
              ...current,
              ...patch,
              title: String(patch.title ?? current.title ?? '').trim(),
              content: String(patch.content ?? current.content ?? '').trim(),
              updatedAt: Date.now()
            };
            const update = store.put(next);
            update.onsuccess = () => resolve(next);
            update.onerror = () => reject(update.error);
          };
          request.onerror = () => reject(request.error);
        });
      }

      async function deleteLocalPromptEntry(id) {
        if (!db) await initDB();
        return deleteLocalPrompt(id);
      }

      function normalizePromptLibraryEntry(item = {}, originHint = '') {
        const content = String(item.content || item.prompt || item.text || '').trim();
        if (!content) return null;
        const source = String(item.source || '').trim();
        const rawOrigin = String(item.origin || originHint || (source === 'local' ? 'local' : source === 'community' ? 'community' : 'public')).trim();
        const origin = rawOrigin === 'curated' ? 'public' : rawOrigin;
        const refs = Array.isArray(item.referenceImageUrls) ? item.referenceImageUrls.filter(Boolean).map(String) : [];
        const attributions = Array.isArray(item.attributions) ? item.attributions.filter(Boolean) : [];
        const rawCoverUrl = String(item.coverUrl || '').trim();
        const coverUrl = /^https?:\/\//i.test(rawCoverUrl)
          || (origin === 'local' && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(rawCoverUrl))
          ? rawCoverUrl
          : '';
        return {
          id: item.id ?? `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          origin,
          title: String(item.title || content.slice(0, 42)).trim(),
          content,
          description: String(item.description || '').trim(),
          coverUrl,
          referenceImageUrls: refs,
          category: String(item.category || '其他').trim() || '其他',
          tags: Array.isArray(item.tags) ? item.tags.filter(Boolean).map(String) : [],
          author: String(item.author || '').trim(),
          sourceId: String(item.sourceId || '').trim(),
          sourceUrl: String(item.sourceUrl || '').trim(),
          attributions,
          imageModel: String(item.imageModel || item.model || '').trim(),
          imageMode: String(item.imageMode || '').trim(),
          createdAt: item.createdAt || item.created_at || 0,
          usageCount: Number(item.usageCount || item.usage_count) || 0,
          updatedAt: Number(item.updatedAt || item.updated_at) || 0
        };
      }

      function renderUploads(change = null) {
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
            renderUploads({ reason: 'removed' });
          };
          wrapper.appendChild(imageEl);
          wrapper.appendChild(sizeLabel);
          wrapper.appendChild(btn);
          preview.appendChild(wrapper);
        });
        flashStatus(state.images.length ? `已选择 ${state.images.length} 张` : '待发送...');
        if (change) notifyReferenceImagesChanged(change);
      }

      function getCanvasUploadPreviewImageSourcesFromState(images) {
        return Array.isArray(images)
          ? images
            .filter(image => image?.dataUrl)
            .map((image, index) => ({
              kind: 'image',
              origin: 'upload-preview',
              src: image.dataUrl,
              label: String(image.name || `Upload ${index + 1}`),
              mimeType: String(image.mime || ''),
              width: Number.isFinite(image.width) ? image.width : null,
              height: Number.isFinite(image.height) ? image.height : null
            }))
          : [];
      }

      function getCanvasUploadPreviewImageSources() {
        return getCanvasUploadPreviewImageSourcesFromState(state?.images);
      }

      function isCanvasHistoryCardVisible(card) {
        if (!card || card.hidden) return false;
        if (card.style && card.style.display === 'none') return false;
        return true;
      }

      function getCanvasHistoryGridImageSourcesFromGrid(grid) {
        if (!grid || typeof grid.querySelectorAll !== 'function') return [];
        return [...grid.querySelectorAll('.history-card')]
          .filter(card => isCanvasHistoryCardVisible(card))
          .map((card, index) => {
            const previewImage = card.querySelector('.history-image-preview');
            return {
              kind: 'image',
              origin: 'history-grid',
              src: previewImage?.getAttribute('src') || '',
              label: card.querySelector('.prompt')?.textContent?.trim() || `History ${index + 1}`,
              alt: previewImage?.getAttribute('alt') || '',
              recordId: card.querySelector('.delete-btn')?.dataset?.id || ''
            };
          })
          .filter(item => item.src || item.recordId);
      }

      function getCanvasHistoryGridImageSources() {
        return getCanvasHistoryGridImageSourcesFromGrid(historyGrid);
      }

      // ===== 无限画布入口 =====
      const CANVAS_FEATURE_ENABLED = true;
      const CANVAS_DEV_NOTICE = '无限画布功能开发中，暂不可用';

      function showCanvasDevelopmentNotice() {
        flashStatus(CANVAS_DEV_NOTICE);
        return null;
      }

      function openCanvasTool(options = {}) {
        if (!CANVAS_FEATURE_ENABLED) return showCanvasDevelopmentNotice();
        const canvasUrl = new URL(_canvasWorkspaceModulePath, _appBase).href;
        return ensureWorkspaceStylesheet('canvas', 'canvas.css')
          .then(() => import(canvasUrl))
          .then(module => {
            const result = module.openCanvasWorkspace(options);
            setWorkspaceNavActive('canvas');
            return result;
          })
          .catch(error => {
            console.error('canvas load failed', error);
            setWorkspaceNavActive('studio');
            flashStatus('画布模块加载失败：' + (error?.message || error), 'danger');
          });
      }

      function closeCanvasTool() {
        const canvasUrl = new URL(_canvasWorkspaceModulePath, _appBase).href;
        return import(canvasUrl)
          .then(module => module.closeCanvasWorkspace?.())
          .catch(error => {
            console.warn('canvas close unavailable', error);
            return null;
          });
      }

      async function getCanvasProjectTargets() {
        if (!CANVAS_FEATURE_ENABLED) return [];
        const canvasUrl = new URL(_canvasWorkspaceModulePath, _appBase).href;
        const module = await import(canvasUrl);
        return typeof module.getCanvasProjectTargets === 'function' ? module.getCanvasProjectTargets() : [];
      }

      function getActiveCanvasProjectId() {
        return String(window.__activeCanvasProjectId || '');
      }

      async function addPromptEntryToCanvas(entry, options = {}) {
        if (!CANVAS_FEATURE_ENABLED) throw new Error(CANVAS_DEV_NOTICE);
        const canvasUrl = new URL(_canvasWorkspaceModulePath, _appBase).href;
        const module = await import(canvasUrl);
        if (typeof module.addPromptEntryToCanvas !== 'function') {
          throw new Error('Canvas prompt integration is unavailable');
        }
        return module.addPromptEntryToCanvas(entry, options);
      }

      function sendImagesToCanvas(sources) {
        if (!CANVAS_FEATURE_ENABLED) return showCanvasDevelopmentNotice();
        const list = (Array.isArray(sources) ? sources : [sources]).filter(item => item && item.src);
        if (!list.length) {
          flashStatus('没有可发送到画布的图片', 'danger');
          return null;
        }
        return openCanvasTool({ importSources: list });
      }

      function collectResultImageSources() {
        const grid = document.getElementById('results');
        if (!grid) return [];
        return [...grid.querySelectorAll('.result-card .result-thumb-btn img')]
          .map((image, index) => ({
            kind: 'image',
            origin: 'result-output',
            src: image.currentSrc || image.src || '',
            label: image.alt || `Result ${index + 1}`
          }))
          .filter(item => item.src);
      }

      function sendAllResultsToCanvas() {
        if (!CANVAS_FEATURE_ENABLED) return showCanvasDevelopmentNotice();
        return sendImagesToCanvas(collectResultImageSources());
      }

      function collectHistoryImageSources() {
        return getCanvasHistoryGridImageSourcesFromGrid(historyGrid).filter(item => item.src);
      }

      function sendAllHistoryToCanvas() {
        if (!CANVAS_FEATURE_ENABLED) return showCanvasDevelopmentNotice();
        return sendImagesToCanvas(collectHistoryImageSources());
      }

      function syncCanvasTransferButtons() {
        const setTransferLabel = (button, text) => {
          const label = button?.querySelector('[data-transfer-label]');
          if (label) label.textContent = text;
          else if (button) button.textContent = text;
        };
        const resultsBtn = document.getElementById('send-results-to-canvas');
        if (resultsBtn) {
          resultsBtn.setAttribute('data-canvas-transfer', 'results-batch');
          if (!CANVAS_FEATURE_ENABLED) {
            setTransferLabel(resultsBtn, '全部进画布（开发中）');
            resultsBtn.title = CANVAS_DEV_NOTICE;
          } else {
            setTransferLabel(resultsBtn, '全部进画布');
            resultsBtn.title = '';
          }
        }
        const historyBtn = document.getElementById('send-history-to-canvas');
        if (historyBtn) {
          historyBtn.setAttribute('data-canvas-transfer', 'history-batch');
          if (!CANVAS_FEATURE_ENABLED) {
            setTransferLabel(historyBtn, '历史进画布（开发中）');
            historyBtn.title = CANVAS_DEV_NOTICE;
          } else {
            setTransferLabel(historyBtn, '历史进画布');
            historyBtn.title = '';
          }
        }
      }

      document.querySelectorAll('[data-open-canvas]').forEach(button => {
        button.addEventListener('click', () => {
          openCanvasTool();
        });
      });
      document.getElementById('send-results-to-canvas')?.addEventListener('click', () => sendAllResultsToCanvas());
      document.getElementById('send-history-to-canvas')?.addEventListener('click', () => sendAllHistoryToCanvas());
      syncCanvasTransferButtons();

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
          renderUploads({
            reason: 'added',
            added: list,
            autoAttach: document.body.classList.contains('agent-mode-open')
          });
          const cacheHits = list.filter(item => item && item.cacheHit).length;
          if (files.length > remaining) {
            flashStatus(`已添加 ${filesToAdd.length} 张，超出的已忽略（最多 ${limit} 张）`, 'success');
          } else if (cacheHits > 0 && cacheHits === list.length) {
            flashStatus(`已添加 ${list.length} 张图片（全部命中本地缓存）`, 'success');
          } else if (cacheHits > 0) {
            flashStatus(`已添加 ${list.length} 张图片（缓存 ${cacheHits} 张，其余已压缩）`, 'success');
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

      // 处理并压缩图片（优先走 ImageCompress 哈希缓存，重复上传秒回）
      async function processAndCompressImage(file) {
        if (window.ImageCompress && typeof window.ImageCompress.processAndCompressImage === 'function') {
          const prepared = await window.ImageCompress.processAndCompressImage(file);
          if (prepared?.cacheHit) {
            debugLog(`参考图缓存命中: ${file.name}`);
          } else {
            debugLog(`参考图已处理: ${file.name}, cacheHit=${!!prepared?.cacheHit}`);
          }
          return prepared;
        }

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

      async function fetchPromptReferenceBlob(url) {
        const source = String(url || '').trim();
        if (!source) throw new Error('图片地址为空');
        const read = async target => {
          const maxBytes = 15 * 1024 * 1024;
          const controller = typeof AbortController === 'function' ? new AbortController() : null;
          const timeout = setTimeout(() => controller?.abort(), 15000);
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
            if (declaredSize > maxBytes) throw new Error('图片超过 15MB');
            if (headerMime && !headerMime.startsWith('image/')) throw new Error('返回内容不是图片');
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
                  if (size > maxBytes) {
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
            }
            if (blob.size > maxBytes) throw new Error('图片超过 15MB');
            const mime = String(blob.type || headerMime).split(';')[0].trim().toLowerCase();
            if (!mime.startsWith('image/')) throw new Error('返回内容不是图片');
            return new Blob([blob], { type: mime });
          } finally {
            clearTimeout(timeout);
          }
        };

        try {
          return await read(source);
        } catch (directError) {
          if (!/^https?:\/\//i.test(source)) throw directError;
          const proxyUrl = new URL(apiProxyEndpoint, window.location.href);
          proxyUrl.searchParams.set('media', '1');
          proxyUrl.searchParams.set('target', source);
          try {
            return await read(proxyUrl.toString());
          } catch (proxyError) {
            throw new Error(`直连和媒体代理都失败：${proxyError.message || proxyError}`);
          }
        }
      }

      async function addStudioReferenceImages(sources = []) {
        const result = { added: 0, skipped: 0, warnings: [] };
        const list = Array.isArray(sources) ? sources : [];
        const unique = [];
        const seen = new Set();
        list.forEach((item, index) => {
          const url = String(item?.url || item?.dataUrl || '').trim();
          if (!url || seen.has(url)) {
            result.skipped += 1;
            return;
          }
          seen.add(url);
          unique.push({ url, name: String(item?.name || `提示词参考图 ${index + 1}`).trim() });
        });

        const limit = getReferenceImageLimit();
        for (const source of unique) {
          if (state.images.length >= limit) {
            result.skipped += 1;
            result.warnings.push({ name: source.name, reason: `已达到当前平台的 ${limit} 张上限` });
            continue;
          }
          try {
            const blob = await fetchPromptReferenceBlob(source.url);
            const mime = String(blob.type || '').toLowerCase();
            if (!mime.startsWith('image/')) throw new Error('不是可用图片');
            const file = new File([blob], source.name || 'prompt-reference', { type: mime });
            const prepared = await processAndCompressImage(file);
            const dataUrl = String(prepared?.dataUrl || '').trim();
            if (!dataUrl) throw new Error('图片处理没有返回数据');
            if (state.images.some(image => image?.dataUrl === dataUrl || image?.sourceUrl === source.url)) {
              result.skipped += 1;
              continue;
            }
            const added = {
              ...prepared,
              name: source.name || prepared.name || '提示词参考图',
              sourceUrl: source.url,
              mime: prepared.mime || mime
            };
            state.images.push(added);
            result.added += 1;
          } catch (error) {
            result.skipped += 1;
            result.warnings.push({ name: source.name, reason: error?.message || '图片加载失败' });
          }
        }

        if (result.added) {
          renderUploads({ reason: 'prompt-library-added', added: state.images.slice(-result.added) });
        }
        return result;
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

      function buildOpenAIChatImagePayload(prompt, imgs = [], model = getImageModel(), options = {}) {
        const context = getImageRequestContext(model, { images: imgs });
        const requestPrompt = getImagePromptWithAspect(prompt, context);
        const content = imgs.length
          ? [
              { type: 'text', text: requestPrompt },
              ...imgs.map(img => ({
                type: 'image_url',
                image_url: { url: img.dataUrl }
              }))
            ]
          : requestPrompt;

        return {
          model,
          messages: [{ role: 'user', content }],
          stream: false,
          ...getOpenAICompatibleAspectFields(context, options.includeAspectFields !== false)
        };
      }

      function buildGeminiOpenAIImagesPayload(prompt, imgs = [], model = getImageModel()) {
        const context = getImageRequestContext(model, { images: imgs });
        const payload = {
          // Keep the configured model untouched. NewAPI/sub2api owns the
          // mapping from the display name to the upstream image model.
          model,
          prompt: getImagePromptWithAspect(prompt, context),
          n: 1,
          response_format: 'b64_json'
        };
        const reference = imgs.find(img => img?.dataUrl)?.dataUrl;
        if (reference) payload.image = reference;
        return payload;
      }

      function buildGeminiOpenAIImagesRequest(prompt, imgs, imageModel, key) {
        return {
          endpoint: buildApiUrl('/v1/images/generations'),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(buildGeminiOpenAIImagesPayload(prompt, imgs, imageModel))
        };
      }

      function buildOpenAIResponsesImagePayload(prompt, imgs = [], model = getImageModel(), options = {}) {
        const context = getImageRequestContext(model, { images: imgs });
        const requestPrompt = getImagePromptWithAspect(prompt, context);
        const content = imgs.length
          ? [
              { type: 'input_text', text: requestPrompt },
              ...imgs.map(img => ({
                type: 'input_image',
                image_url: img.dataUrl
              }))
            ]
          : requestPrompt;

        return {
          model,
          input: [{ role: 'user', content }],
          stream: false,
          ...getOpenAICompatibleAspectFields(context, options.includeAspectFields !== false)
        };
      }

      function buildAliyunImageParameters() {
        const parameters = {};
        if (aspectSelect?.value && aspectSelect.value !== 'auto') {
          parameters.aspect_ratio = aspectSelect.value;
        }
        if (resolutionSelect?.value) {
          parameters.size = resolutionSelect.value;
        }
        return parameters;
      }

      function buildAliyunImagePayload(prompt, imgs = [], model = getImageModel()) {
        const content = [{ text: prompt }];
        imgs.forEach(img => {
          if (img.dataUrl) content.push({ image: img.dataUrl });
        });
        return {
          model,
          input: {
            messages: [{
              role: 'user',
              content
            }]
          },
          parameters: buildAliyunImageParameters()
        };
      }

      function getDoubaoImageSize(modelName = getImageModel()) {
        const resolution = String(resolutionSelect?.value || '').toUpperCase();
        if (['2K', '3K', '4K'].includes(resolution)) return resolution;
        return getImageSize(modelName);
      }

      function buildDoubaoImagePayload(prompt, imgs = [], model = getImageModel()) {
        const payload = {
          model,
          prompt,
          size: getDoubaoImageSize(model),
          response_format: 'url',
          output_format: 'png',
          watermark: false
        };
        const imageList = imgs.map(img => img.dataUrl).filter(Boolean);
        if (imageList.length === 1) {
          payload.image = imageList[0];
        } else if (imageList.length > 1) {
          payload.image = imageList;
          payload.sequential_image_generation = 'disabled';
        }
        return payload;
      }

      function getReplicateFluxAspectRatio(imgs = []) {
        if (imgs.length > 0) return 'match_input_image';
        const aspect = aspectSelect?.value || '1:1';
        return aspect === 'auto' ? '1:1' : aspect;
      }

      function getReplicateFluxOutputFormat() {
        const format = String(outputFormatSelect?.value || '').toLowerCase();
        if (format === 'png' || format === 'webp') return format;
        return 'jpg';
      }

      function getReplicateFluxOutputQuality() {
        const quality = String(imageQualitySelect?.value || 'auto').toLowerCase();
        if (quality === 'high') return 95;
        if (quality === 'low') return 60;
        return 80;
      }

      function buildReplicateFluxPayload(prompt, imgs = []) {
        const input = {
          prompt,
          aspect_ratio: getReplicateFluxAspectRatio(imgs),
          output_format: getReplicateFluxOutputFormat(),
          output_quality: getReplicateFluxOutputQuality(),
          go_fast: true,
          guidance: 2.5,
          num_inference_steps: 30
        };
        if (imgs[0]?.dataUrl) {
          input.input_image = imgs[0].dataUrl;
        }
        return { input };
      }

      function buildPayload(prompt) {
        const protocol = getImageProtocol();
        const imgs = getReferenceImagesForRequest(state.images, protocol);

        if (protocol === 'openai-images') {
          if (activePlatformId === 'gemini') {
            return buildGeminiOpenAIImagesPayload(prompt, imgs, getImageModel());
          }
          // OpenAI Images 格式: POST /v1/images/generations
          const payload = {
            model: getImageModel(),
            prompt: prompt
          };
          applyOpenAIImageOptions(payload);
          return payload;
        }

        if (protocol === 'open-images') {
          return buildGrokImageGenerationsPayload(prompt, getImageModel());
        }

        if (protocol === 'aliyun-images') {
          return buildAliyunImagePayload(prompt, imgs, getImageModel());
        }

        if (protocol === 'doubao-images') {
          return buildDoubaoImagePayload(prompt, imgs, getImageModel());
        }

        if (protocol === 'replicate-flux') {
          return buildReplicateFluxPayload(prompt, imgs);
        }

        if (protocol === 'openai-chat') {
          // OpenAI Chat 格式: POST /v1/chat/completions
          return buildOpenAIChatImagePayload(prompt, imgs);
        }

        if (protocol === 'openai-responses') {
          return buildOpenAIResponsesImagePayload(prompt, imgs);
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

      const ImageRatio = window.ImageRatio || {};
      window.ImageRequestBuilders = window.ImageRequestBuilders || {};
      window.ImageRequestBuilders['openai-chat'] = async function(prompt, imgs = [], cfg = {}) {
        const model = cfg.modelId || getImageModel();
        return {
          endpoint: buildApiUrl('/v1/chat/completions'),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey || getApiKey()}` },
          body: JSON.stringify(buildOpenAIChatImagePayload(prompt, imgs, model))
        };
      };
      window.ImageRequestBuilders['openai-responses'] = async function(prompt, imgs = [], cfg = {}) {
        const model = cfg.modelId || getImageModel();
        return {
          endpoint: buildApiUrl('/v1/responses'),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey || getApiKey()}` },
          body: JSON.stringify(buildOpenAIResponsesImagePayload(prompt, imgs, model))
        };
      };



      function getPrimaryReferenceDimensions(images = state.images) {
        const first = (images || []).find(img => img && (Number(img.width || img.naturalWidth || 0) > 0));
        if (!first) return {};
        const width = Number(first.width || first.naturalWidth || 0);
        const height = Number(first.height || first.naturalHeight || 0);
        if (width > 0 && height > 0) return { referenceWidth: width, referenceHeight: height };
        return {};
      }

      function getImageRequestContext(modelName = getImageModel(), options = {}) {
        const aspect = options.aspect || aspectSelect?.value || 'auto';
        const resolution = options.resolution || resolutionSelect?.value || '';
        const dims = (options.referenceWidth || options.referenceHeight)
          ? { referenceWidth: options.referenceWidth, referenceHeight: options.referenceHeight }
          : getPrimaryReferenceDimensions(options.images || state.images);
        if (typeof ImageRatio.buildRequestContext === 'function') {
          return ImageRatio.buildRequestContext({ aspect, resolution, model: modelName, ...dims });
        }
        return {
          aspect,
          ratio: null,
          resolution,
          size: getImageSize(modelName, aspect, resolution),
          instruction: ''
        };
      }

      function getImagePromptWithAspect(prompt, context) {
        return `${prompt || ''}${context?.instruction || ''}`;
      }

      function getOpenAICompatibleAspectFields(context, includeAspectFields = true) {
        if (!includeAspectFields || !context || context.aspect === 'auto') return {};
        const fields = { aspect_ratio: context.aspect };
        if (context.size) fields.size = context.size;
        return fields;
      }

      function maybeWarnVideoAspectFallback(videoInfo) {
        if (videoInfo?.fellBack && videoInfo?.reason) {
          flashStatus(videoInfo.reason, 'warning');
        }
        return videoInfo;
      }

      function applyCompatibleRetryLayout(options = {}) {
        if (typeof ImageRatio.getCompatibleRetryLayout !== 'function') return options || {};
        const layout = ImageRatio.getCompatibleRetryLayout({
          aspect: options.aspect || aspectSelect?.value || 'auto',
          resolution: options.resolution || resolutionSelect?.value || '1K',
          model: options.model || getImageModel()
        });
        if (layout.aspect) restoreSelectValue(aspectSelect, layout.aspect);
        if (layout.resolution && resolutionSelect) {
          const hasResolution = [...(resolutionSelect.options || [])].some(opt => opt.value === layout.resolution);
          if (hasResolution) restoreSelectValue(resolutionSelect, layout.resolution);
        }
        if (layout.fellBack && layout.reason) flashStatus(layout.reason, 'warning');
        return {
          ...options,
          aspect: layout.aspect,
          resolution: layout.resolution,
          size: layout.size
        };
      }

      async function annotateImageResultDimensions(result, requestedAspect = aspectSelect?.value || 'auto') {
        if (!result || !(result.imageBase64 || result.imageUrl) || typeof ImageRatio.measureImageSource !== 'function') {
          return result;
        }
        const src = result.imageBase64
          ? (String(result.imageBase64).startsWith('data:') ? result.imageBase64 : `data:image/png;base64,${result.imageBase64}`)
          : result.imageUrl;
        const dimensions = await ImageRatio.measureImageSource(src);
        if (!dimensions) return result;
        const normalizedAspect = typeof ImageRatio.normalizeAspectRatio === 'function'
          ? ImageRatio.normalizeAspectRatio(requestedAspect)
          : String(requestedAspect || 'auto');
        const aspectMatch = typeof ImageRatio.compareAspect === 'function'
          ? ImageRatio.compareAspect(dimensions.width, dimensions.height, normalizedAspect)
          : null;
        Object.assign(result, {
          requestedAspect: normalizedAspect,
          sourceWidth: dimensions.width,
          sourceHeight: dimensions.height,
          sourceAspect: dimensions.aspect,
          aspectMatch
        });
        if (aspectMatch === false && !result.__aspectWarningReported) {
          result.__aspectWarningReported = true;
          const message = `中转未按要求返回比例：请求 ${normalizedAspect}，实际 ${dimensions.width}x${dimensions.height}（${dimensions.aspect}）。原图未修改。`;
          console.warn('[image-ratio] aspect mismatch:', {
            requested: normalizedAspect,
            actual: dimensions.aspect,
            width: dimensions.width,
            height: dimensions.height
          });
          flashStatus(message, 'danger');
        }
        return result;
      }

      function getImageSize(modelName = getImageModel(), aspectValue = aspectSelect?.value, resolutionValue = resolutionSelect?.value) {
        const aspect = aspectValue || aspectSelect?.value || 'auto';
        const resolution = resolutionValue || resolutionSelect?.value || '1K';
        if (typeof ImageRatio.resolveImageSize === 'function') {
          const resolved = ImageRatio.resolveImageSize({ aspect, resolution, model: modelName });
          if (String(aspect || 'auto') === 'auto') return resolved || '';
          return resolved || (typeof ImageRatio.getLegacyCompatibleSize === 'function' ? ImageRatio.getLegacyCompatibleSize(aspect, modelName) : '') || '1024x1024';
        }
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

      function getGrokAspectRatio() {
        const aspect = aspectSelect?.value || '';
        const aspectMap = {
          '4:5': '3:4',
          '5:4': '4:3',
          '21:9': '2:1'
        };
        return aspect ? (aspectMap[aspect] || aspect) : '';
      }

      function getGrokResolution() {
        const resolution = String(resolutionSelect?.value || '').toLowerCase();
        if (resolution === '2k' || resolution === '4k') return '2k';
        return '1k';
      }

      function applyGrokImageOptions(target) {
        setImageOption(target, 'aspect_ratio', getGrokAspectRatio());
        setImageOption(target, 'resolution', getGrokResolution());
        setImageOption(target, 'response_format', 'url');
      }

      function buildGrokImageGenerationsPayload(prompt, imageModel = getImageModel()) {
        const payload = {
          model: imageModel,
          prompt
        };
        applyGrokImageOptions(payload);
        return payload;
      }

      function buildGrokImageEditsPayload(prompt, imgs, imageModel = getImageModel()) {
        const images = imgs
          .map(img => img.dataUrl)
          .filter(Boolean)
          .map(dataUrl => ({ type: 'image_url', url: dataUrl }));
        const payload = {
          model: imageModel,
          prompt
        };
        if (images.length === 1) {
          payload.image = { url: images[0].url };
        } else {
          payload.images = images;
        }
        applyGrokImageOptions(payload);
        return payload;
      }

      function buildGrokImageRequest(prompt, imgs, imageModel, key) {
        const hasImages = imgs.length > 0;
        const endpoint = hasImages ? buildApiUrl('/v1/images/edits') : buildApiUrl('/v1/images/generations');
        const payload = hasImages
          ? buildGrokImageEditsPayload(prompt, imgs, imageModel)
          : buildGrokImageGenerationsPayload(prompt, imageModel);
        return {
          endpoint,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(payload)
        };
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

      function getVideoAspectInfo(protocol = getProtocol()) {
        const aspect = aspectSelect?.value || '16:9';
        const resolution = resolutionSelect?.value || '720P';
        if (typeof ImageRatio.resolveVideoAspectInfo === 'function') {
          return maybeWarnVideoAspectFallback(ImageRatio.resolveVideoAspectInfo({ aspect, resolution, protocol }));
        }
        const normalized = aspect === '9:16' || aspect === '2:3' || aspect === '3:4' || aspect === '4:5'
          ? '9:16'
          : '16:9';
        const useHighRes = resolution === '1080P';
        return {
          requestedAspect: aspect,
          effectiveAspect: normalized,
          aspect: normalized,
          orientation: normalized === '9:16' ? 'portrait' : 'landscape',
          openAiSize: normalized === '9:16'
            ? (useHighRes ? '1024x1792' : '720x1280')
            : (useHighRes ? '1792x1024' : '1280x720'),
          sizeOrResolution: normalized === '9:16'
            ? (useHighRes ? '1024x1792' : '720x1280')
            : (useHighRes ? '1792x1024' : '1280x720'),
          fellBack: false,
          reason: ''
        };
      }

      function getVideoDurationSeconds() {
        const seconds = parseInt(videoDurationSelect?.value, 10);
        return Number.isFinite(seconds) && seconds > 0 ? seconds : 10;
      }

      async function buildOpenAIVideosRequest(prompt, imgs, videoModel, key) {
        const formData = new FormData();
        const videoInfo = getVideoAspectInfo();
        formData.append('model', videoModel || 'sora-2');
        formData.append('prompt', prompt);
        formData.append('seconds', String(getVideoDurationSeconds()));
        formData.append('size', videoInfo.openAiSize);
        formData.append('watermark', 'false');
        formData.append('private', 'true');

        const firstImage = imgs.find(img => img?.dataUrl);
        if (firstImage) {
          const blob = await fetchImageAsBlob(firstImage.dataUrl);
          const ext = getExtensionFromMime(firstImage.mime || blob.type || 'image/png');
          formData.append('input_reference', blob, `reference.${ext}`);
        }

        return {
          endpoint: buildApiUrl('/v1/videos'),
          headers: { 'Authorization': `Bearer ${key}` },
          body: formData
        };
      }

      function buildOpenAIVideoChatRequest(prompt, imgs, videoModel, key) {
        const videoInfo = getVideoAspectInfo();
        const videoPrompt = [
          prompt,
          '',
          `Video parameters: aspect_ratio=${videoInfo.aspect}, orientation=${videoInfo.orientation}, resolution=${resolutionSelect?.value || '720P'}, duration_seconds=${getVideoDurationSeconds()}.`
        ].join('\n');
        const content = [{ type: 'text', text: videoPrompt }];
        imgs.forEach(img => {
          if (img.dataUrl) {
            content.push({ type: 'image_url', image_url: { url: img.dataUrl } });
          }
        });
        const payload = {
          model: videoModel || 'sora-2',
          messages: [{ role: 'user', content }],
          stream: false
        };
        return {
          endpoint: buildApiUrl('/v1/chat/completions'),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(payload)
        };
      }

      function buildVeoVideoPayload(prompt, imgs, videoModel) {
        const videoInfo = getVideoAspectInfo();
        const resolution = resolutionSelect?.value === '4K'
          ? '4K'
          : (resolutionSelect?.value === '1080P' ? '1080P' : '720P');
        const payload = {
          model: videoModel || 'veo3.1',
          prompt,
          aspect_ratio: videoInfo.aspect,
          duration: getVideoDurationSeconds(),
          size: resolution,
          enhance_prompt: true,
          enable_upsample: resolution === '1080P' || resolution === '4K'
        };
        const imageUrls = imgs.map(img => img?.dataUrl).filter(Boolean);
        if (imageUrls.length) payload.images = imageUrls;
        return payload;
      }

      function buildVeoGenerationsRequest(prompt, imgs, videoModel, key) {
        return {
          endpoint: buildApiUrl('/v1/video/generations'),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(buildVeoVideoPayload(prompt, imgs, videoModel))
        };
      }

      function buildVeoCreateRequest(prompt, imgs, videoModel, key) {
        return {
          endpoint: buildApiUrl('/v1/video/create'),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(buildVeoVideoPayload(prompt, imgs, videoModel))
        };
      }

      function getHappyHorseDurationSeconds() {
        const seconds = getVideoDurationSeconds();
        return Math.min(15, Math.max(3, seconds));
      }

      function getHappyHorseResolution() {
        return resolutionSelect?.value === '1080P' ? '1080P' : '720P';
      }

      function getHappyHorseRatio() {
        const info = getVideoAspectInfo('aliyun-happyhorse');
        return info.effectiveAspect || info.aspect || '16:9';
      }

      function buildHappyHorseVideoPayload(prompt, imgs, videoModel) {
        const model = videoModel || 'happyhorse-1.0-t2v';
        if (model.includes('video-edit')) {
          throw new Error('当前界面暂不支持 happyhorse-1.0-video-edit 的视频素材输入');
        }

        const parameters = {
          resolution: getHappyHorseResolution(),
          ratio: getHappyHorseRatio(),
          duration: getHappyHorseDurationSeconds(),
          watermark: false
        };
        const input = { prompt };

        if (model.includes('i2v')) {
          const firstImage = imgs.find(img => img?.dataUrl);
          if (!firstImage) throw new Error('happyhorse-1.0-i2v 需要至少 1 张参考图');
          input.media = [{ type: 'first_frame', url: firstImage.dataUrl }];
        } else if (model.includes('r2v')) {
          const imageUrls = imgs.map(img => img?.dataUrl).filter(Boolean).slice(0, 9);
          if (!imageUrls.length) throw new Error('happyhorse-1.0-r2v 需要 1-9 张参考图');
          input.media = imageUrls.map(url => ({ type: 'reference_image', url }));
        }

        return { model, input, parameters };
      }

      function buildHappyHorseVideoRequest(prompt, imgs, videoModel, key) {
        return {
          endpoint: buildApiUrl('/alibailian/api/v1/services/aigc/video-generation/video-synthesis'),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(buildHappyHorseVideoPayload(prompt, imgs, videoModel))
        };
      }

      function getDoubaoVideoResolution() {
        return resolutionSelect?.value === '1080P' ? '1080p' : '720p';
      }

      function getDoubaoVideoRatio() {
        const info = getVideoAspectInfo('doubao-seedance');
        return info.effectiveAspect || info.aspect || '16:9';
      }

      function getDoubaoVideoDurationSeconds(videoModel = '') {
        const seconds = getVideoDurationSeconds();
        const min = String(videoModel || '').includes('1-5-pro') ? 4 : 2;
        return Math.min(12, Math.max(min, seconds));
      }

      function buildDoubaoSeedancePrompt(prompt, videoModel) {
        return [
          prompt,
          `--resolution ${getDoubaoVideoResolution()}`,
          `--ratio ${getDoubaoVideoRatio()}`,
          `--duration ${getDoubaoVideoDurationSeconds(videoModel)}`,
          '--camera_fixed false',
          '--watermark false'
        ].filter(Boolean).join(' ');
      }

      function buildDoubaoSeedancePayload(prompt, imgs, videoModel) {
        const model = videoModel || 'doubao-seedance-1-0-pro-250528';
        const content = [{ type: 'text', text: buildDoubaoSeedancePrompt(prompt, model) }];
        const imageUrls = imgs.map(img => img?.dataUrl).filter(Boolean);

        if (model.includes('lite-t2v') && imageUrls.length) {
          throw new Error('doubao-seedance-1-0-lite-t2v 仅支持文生视频，请移除参考图或切换模型');
        }

        imageUrls.slice(0, 4).forEach((url, index) => {
          const item = {
            type: 'image_url',
            image_url: { url }
          };
          if (imageUrls.length > 1) {
            item.role = index === 0 ? 'first_frame' : (index === 1 ? 'last_frame' : 'reference_image');
          } else if (model.includes('lite-i2v')) {
            item.role = 'first_frame';
          }
          content.push(item);
        });

        return {
          model,
          content,
          ratio: getDoubaoVideoRatio(),
          duration: getDoubaoVideoDurationSeconds(model),
          watermark: false
        };
      }

      function buildDoubaoSeedanceRequest(prompt, imgs, videoModel, key) {
        return {
          endpoint: buildApiUrl('/volc/v1/contents/generations/tasks'),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(buildDoubaoSeedancePayload(prompt, imgs, videoModel))
        };
      }

      function getGrokVideoAspectRatio() {
        const info = getVideoAspectInfo('grok-video-create');
        return info.effectiveAspect || info.aspect || '3:2';
      }

      function buildGrokVideoPrompt(prompt) {
        const text = String(prompt || '').trim();
        return /--mode\s*=/i.test(text) ? text : `${text} --mode=custom`.trim();
      }

      function buildGrokVideoCreatePayload(prompt, imgs, videoModel) {
        return {
          model: videoModel || 'grok-video-3',
          prompt: buildGrokVideoPrompt(prompt),
          aspect_ratio: getGrokVideoAspectRatio(),
          size: '720P',
          images: imgs.map(img => img?.dataUrl).filter(Boolean)
        };
      }

      function buildGrokVideoCreateRequest(prompt, imgs, videoModel, key) {
        return {
          endpoint: buildApiUrl('/v1/video/create'),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(buildGrokVideoCreatePayload(prompt, imgs, videoModel))
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

      function buildOpenImagesGenerationsRequest(prompt, imgs, imageModel, key) {
        const payload = {
          model: imageModel,
          prompt
        };
        if (imgs.length > 0) {
          payload.image = imgs.map(img => img.dataUrl).filter(Boolean);
        }
        setImageOption(payload, 'size', getImageSize(imageModel));
        return {
          endpoint: buildApiUrl('/v1/images/generations'),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(payload)
        };
      }

      function buildAliyunImageRequest(prompt, imgs, imageModel, key) {
        return {
          endpoint: buildApiUrl('/api/v1/services/aigc/multimodal-generation/generation'),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(buildAliyunImagePayload(prompt, imgs, imageModel))
        };
      }

      function buildDoubaoImageRequest(prompt, imgs, imageModel, key) {
        return {
          endpoint: buildApiUrl('/v1/images/generations'),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(buildDoubaoImagePayload(prompt, imgs, imageModel))
        };
      }

      function buildReplicateFluxRequest(prompt, imgs, imageModel, key) {
        const model = imageModel || 'black-forest-labs/flux-kontext-dev';
        return {
          endpoint: buildApiUrl(`/v1/models/${model}/predictions`),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(buildReplicateFluxPayload(prompt, imgs))
        };
      }

      function getApiUrlForAbsoluteTarget(targetUrl) {
        if (isApiProxyEnabled() && /^https:\/\//i.test(targetUrl || '')) {
          return buildApiProxyUrlForTarget(targetUrl);
        }
        return targetUrl;
      }

      async function pollReplicateFluxPrediction(initialResponse, key) {
        if (!initialResponse.ok) return initialResponse;

        let data = initialResponse.data;
        const startedAt = Date.now();
        const timeoutMs = 600000;
        const terminalStatuses = new Set(['succeeded', 'failed', 'canceled']);

        while (data && typeof data === 'object' && !data.output && !terminalStatuses.has(String(data.status || '').toLowerCase())) {
          if (Date.now() - startedAt > timeoutMs) {
            throw new Error('Replicate 任务超时（10分钟），请稍后在 Replicate 控制台查看结果');
          }

          if (!data.id && !data.urls?.get) {
            return initialResponse;
          }

          const getUrl = data.urls?.get
            ? getApiUrlForAbsoluteTarget(data.urls.get)
            : buildApiUrl(`/v1/predictions/${data.id}`);

          await new Promise(resolve => setTimeout(resolve, 2000));
          const res = await fetch(getUrl, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${key}` }
          });
          const raw = await res.text();
          debugLog('[replicate-flux] poll response:', raw.slice(0, 2000));
          try { data = JSON.parse(raw); } catch (_) { data = raw; }
          if (!res.ok) return { ok: false, status: res.status, raw, data };
        }

        if (String(data?.status || '').toLowerCase() === 'failed') {
          throw new Error(describeApiError(data.error, 'Replicate 任务失败'));
        }
        if (String(data?.status || '').toLowerCase() === 'canceled') {
          throw new Error(describeApiError(data.error, 'Replicate 任务已取消'));
        }

        return {
          ok: true,
          status: initialResponse.status,
          raw: typeof data === 'string' ? data : JSON.stringify(data),
          data
        };
      }

      function getNestedVideoUrl(data) {
        if (!data || typeof data !== 'object') return '';
        const direct = data.upsample_video_url
          || data.video_url
          || data.videoUrl
          || data.url
          || data.download_url
          || data.downloadUrl
          || data.content_url
          || data.contentUrl
          || data.file_url
          || data.fileUrl;
        if (typeof direct === 'string' && direct) return direct;
        const nestedUrl =
          data.video?.url
          || data.video?.uri
          || data.video?.download_url
          || data.file?.url
          || data.file?.uri
          || data.file?.download_url
          || data.asset?.url
          || data.asset?.uri
          || data.result?.url
          || data.result?.video_url
          || data.result?.videoUrl
          || data.content?.video_url
          || data.content?.videoUrl
          || data.content?.url
          || data.content?.download_url
          || data.draft_info?.url
          || data.draftInfo?.url;
        if (typeof nestedUrl === 'string' && nestedUrl) return nestedUrl;
        if (typeof data.output === 'string' && /^https?:\/\//i.test(data.output)) return data.output;
        if (Array.isArray(data.output)) {
          const outputUrl = data.output.find(item => typeof item === 'string' && /^https?:\/\//i.test(item));
          if (outputUrl) return outputUrl;
          for (const item of data.output) {
            const url = getNestedVideoUrl(item);
            if (url) return url;
          }
        }
        if (data.output && typeof data.output === 'object') {
          const url = getNestedVideoUrl(data.output);
          if (url) return url;
        }
        if (Array.isArray(data.data)) {
          for (const item of data.data) {
            const url = getNestedVideoUrl(item);
            if (url) return url;
          }
        }
        if (data.detail && typeof data.detail === 'object') {
          const url = getNestedVideoUrl(data.detail);
          if (url) return url;
        }
        if (data.content && typeof data.content === 'object') {
          const url = getNestedVideoUrl(data.content);
          if (url) return url;
        }
        if (data.response && typeof data.response === 'object') {
          const url = getNestedVideoUrl(data.response);
          if (url) return url;
        }
        const generatedVideos = data.response?.generatedVideos || data.generatedVideos;
        if (Array.isArray(generatedVideos)) {
          for (const item of generatedVideos) {
            const url = item?.video?.uri || item?.video?.url || item?.url || getNestedVideoUrl(item);
            if (url) return url;
          }
        }
        const chatContent = data?.choices?.[0]?.message?.content;
        if (typeof chatContent === 'string') {
          const urlMatch = chatContent.match(/https?:\/\/[^\s"'<>]+\.(mp4|webm|mov)(\?[^\s"'<>]*)?/i)
            || chatContent.match(/https?:\/\/[^\s"'<>]+/i);
          if (urlMatch) return urlMatch[0];
          try {
            return getNestedVideoUrl(JSON.parse(chatContent));
          } catch (_) {}
        }
        if (Array.isArray(chatContent)) {
          for (const item of chatContent) {
            const url = item.video_url || item.videoUrl || item.url || item.file_url || item?.video?.url;
            if (url) return typeof url === 'string' ? url : url.url;
            const text = item.text || item.content;
            if (typeof text === 'string') {
              const urlMatch = text.match(/https?:\/\/[^\s"'<>]+\.(mp4|webm|mov)(\?[^\s"'<>]*)?/i)
                || text.match(/https?:\/\/[^\s"'<>]+/i);
              if (urlMatch) return urlMatch[0];
            }
          }
        }
        for (const value of Object.values(data)) {
          if (typeof value === 'string') {
            const urlMatch = value.match(/https?:\/\/[^\s"'<>]+\.(mp4|webm|mov)(\?[^\s"'<>]*)?/i);
            if (urlMatch) return urlMatch[0];
          } else if (value && typeof value === 'object') {
            const url = getNestedVideoUrl(value);
            if (url) return url;
          }
        }
        return '';
      }

      function getNestedThumbnailUrl(data) {
        if (!data || typeof data !== 'object') return '';
        const direct = data.thumbnail_url || data.thumbnailUrl || data.poster || data.poster_url;
        if (typeof direct === 'string' && direct) return direct;
        if (data.detail && typeof data.detail === 'object') return getNestedThumbnailUrl(data.detail);
        return '';
      }

      function getVideoTaskStatus(data) {
        const rawStatus = data?.status || data?.detail?.status || data?.output?.task_status || data?.output?.status || data?.state || data?.detail?.state || data?.content?.status || '';
        return String(rawStatus || '').toLowerCase();
      }

      function getVideoTaskId(data) {
        return data?.id || data?.video_id || data?.task_id || data?.output?.task_id || data?.detail?.id || data?.detail?.video_id || '';
      }

      function isVideoPendingStatus(status) {
        return [
          'queued',
          'pending',
          'processing',
          'running',
          'starting',
          'submitted',
          'created',
          'in_progress',
          'generating',
          'waiting',
          'submitting',
          'submitted',
          'queued_for_generation',
          'submitted_to_google',
          'media_generating'
        ].includes(status);
      }

      function isVideoSuccessStatus(status) {
        return ['completed', 'succeeded', 'success', 'finished', 'done'].includes(status);
      }

      function isVideoFailureStatus(status) {
        return ['failed', 'failure', 'error', 'cancelled', 'canceled', 'expired'].includes(status);
      }

      function getVideoErrorMessage(data) {
        return data?.error_message || data?.error?.message || data?.error || data?.message || data?.output?.message || data?.output?.error_message || data?.detail?.error_message || data?.detail?.error || '';
      }

      function hasVideoTaskError(data) {
        if (!data || typeof data !== 'object') return false;
        if (getNestedVideoUrl(data)) return false;
        const status = getVideoTaskStatus(data);
        if (isVideoFailureStatus(status)) return true;
        return !!getVideoErrorMessage(data);
      }

      function getVideoDebugFields(data) {
        if (!data || typeof data !== 'object') return '';
        const topFields = Object.keys(data).slice(0, 20).join(', ');
        const detailFields = data.detail && typeof data.detail === 'object'
          ? Object.keys(data.detail).slice(0, 20).join(', ')
          : '';
        const outputFields = data.output && typeof data.output === 'object'
          ? Object.keys(data.output).slice(0, 20).join(', ')
          : '';
        return `top=[${topFields}] detail=[${detailFields}] output=[${outputFields}]`;
      }

      async function sendVideoRequest(request, label = 'video', externalSignal) {
        debugLog('[callVideoAPI] request:', {
          label,
          endpoint: request.endpoint,
          contentType: request.headers?.['Content-Type'] || '(multipart)',
          hasBody: !!request.body
        });

        const controller = new AbortController();
        const propagateAbort = () => {
          try { controller.abort(externalSignal?.reason); } catch { controller.abort(); }
        };
        if (externalSignal?.aborted) propagateAbort();
        else externalSignal?.addEventListener('abort', propagateAbort, { once: true });
        const timeoutId = setTimeout(() => controller.abort(), 600000);
        let res;
        try {
          res = await fetch(request.endpoint, {
            method: request.method || 'POST',
            headers: request.headers,
            body: request.body,
            signal: controller.signal
          });
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          externalSignal?.removeEventListener('abort', propagateAbort);
          if (externalSignal?.aborted) throw externalSignal.reason || fetchErr;
          if (fetchErr.name === 'AbortError') throw new Error('视频请求超时（10分钟），请稍后重试');
          let endpointHost = '';
          try { endpointHost = new URL(request.endpoint, window.location.href).hostname; } catch {}
          if (/^api\.openai\.com$/i.test(endpointHost) && !isApiProxyEnabled()) {
            throw new Error('OpenAI 直连请求失败，当前网络无法访问 api.openai.com。请在设置中开启代理模式，或更换可用的中转地址后重试');
          }
          throw new Error(`网络请求失败（${endpointHost || '目标接口'}）：${fetchErr.message || fetchErr}`);
        }
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', propagateAbort);

        const raw = await res.text();
        debugLog(`[callVideoAPI] raw response (${label}):`, raw.slice(0, 2000));
        let data;
        try { data = JSON.parse(raw); } catch (_) { data = raw; }
        return { ok: res.ok, status: res.status, raw, data };
      }

      async function sendVideoGet(endpoint, key, label = 'video-poll', signal) {
        return sendVideoRequest({
          method: 'GET',
          endpoint,
          headers: { 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' }
        }, label, signal);
      }

      async function fetchVideoContentUrl(videoId, key, signal) {
        if (!videoId) return '';
        const endpoint = buildApiUrl(`/v1/videos/${encodeURIComponent(videoId)}/content`);
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${key}` },
          signal
        });
        if (!res.ok) return '';
        const contentType = res.headers.get('Content-Type') || '';
        if (/application\/json/i.test(contentType)) {
          const data = await res.json();
          return getNestedVideoUrl(data);
        }
        if (/^text\//i.test(contentType)) {
          const text = (await res.text()).trim();
          if (/^https?:\/\//i.test(text)) return text;
          return '';
        }
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      }

      async function pollVideoTask(initialResponse, key, protocol, signal) {
        if (!initialResponse.ok) return initialResponse;
        if (protocol === 'openai-video-chat') return initialResponse;

        let data = initialResponse.data;
        const startedAt = Date.now();
        const timeoutMs = 600000;
        const id = getVideoTaskId(data);
        if (!id) return initialResponse;
        const isVeoProtocol = protocol === 'veo-generations' || protocol === 'veo-create';
        const isHappyHorseProtocol = protocol === 'aliyun-happyhorse';
        const isDoubaoSeedanceProtocol = protocol === 'doubao-seedance';
        const isGrokVideoCreateProtocol = protocol === 'grok-video-create';
        const requiresVideoUrl = isVeoProtocol || isHappyHorseProtocol || isDoubaoSeedanceProtocol || isGrokVideoCreateProtocol;
        let completedWithoutUrlAt = 0;

        while (true) {
          const status = getVideoTaskStatus(data);
          const videoUrl = getNestedVideoUrl(data);

          if (videoUrl || (isVideoSuccessStatus(status) && !requiresVideoUrl)) {
            let finalUrl = videoUrl;
            if (!finalUrl && protocol === 'openai-videos') {
              finalUrl = await fetchVideoContentUrl(id, key, signal);
            }
            return {
              ok: true,
              status: initialResponse.status,
              raw: typeof data === 'string' ? data : JSON.stringify(data),
              data: {
                ...(data && typeof data === 'object' ? data : {}),
                video_url: finalUrl,
                thumbnail_url: getNestedThumbnailUrl(data),
                video_id: id
              }
            };
          }

          if (isVideoSuccessStatus(status) && requiresVideoUrl) {
            if (!completedWithoutUrlAt) {
              completedWithoutUrlAt = Date.now();
              debugLog('[callVideoAPI] video task completed without url, keep polling:', {
                protocol,
                id,
                status,
                fields: getVideoDebugFields(data)
              });
            }
            if (Date.now() - completedWithoutUrlAt > 60000) {
              throw new Error(`任务已完成，但接口未返回视频地址（任务ID: ${id}，状态: ${status || 'unknown'}，字段: ${getVideoDebugFields(data)}）`);
            }
          }

          if (hasVideoTaskError(data)) {
            throw new Error(getVideoErrorMessage(data) || '视频生成任务失败');
          }

          if (!isVideoPendingStatus(status) && status && !isVideoSuccessStatus(status)) {
            if (requiresVideoUrl) {
              debugLog('[callVideoAPI] unknown video task status, keep polling:', {
                protocol,
                id,
                status,
                fields: getVideoDebugFields(data)
              });
            } else {
              return {
                ok: true,
                status: initialResponse.status,
                raw: typeof data === 'string' ? data : JSON.stringify(data),
                data
              };
            }
          }

          if (Date.now() - startedAt > timeoutMs) {
            throw new Error('视频生成任务超时（10分钟），请稍后到平台控制台查看结果');
          }

          if (signal?.aborted) throw signal.reason || new DOMException('Generation cancelled', 'AbortError');
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 3000);
            const onAbort = () => {
              clearTimeout(timer);
              reject(signal.reason || new DOMException('Generation cancelled', 'AbortError'));
            };
            signal?.addEventListener('abort', onAbort, { once: true });
            setTimeout(() => signal?.removeEventListener('abort', onAbort), 3001);
          });
          const endpoint = isVeoProtocol
            ? buildApiUrl(`/v1/video/query?id=${encodeURIComponent(id)}`)
            : isHappyHorseProtocol
              ? buildApiUrl(`/alibailian/api/v1/tasks/${encodeURIComponent(id)}`)
              : isDoubaoSeedanceProtocol
                ? buildApiUrl(`/volc/v1/contents/generations/tasks/${encodeURIComponent(id)}`)
                : isGrokVideoCreateProtocol
                  ? buildApiUrl(`/v1/video/query?id=${encodeURIComponent(id)}`)
            : buildApiUrl(`/v1/videos/${encodeURIComponent(id)}`);
          const pollResponse = await sendVideoGet(endpoint, key, isVeoProtocol ? 'veo-video-query' : (isHappyHorseProtocol ? 'aliyun-happyhorse-query' : (isDoubaoSeedanceProtocol ? 'doubao-seedance-query' : (isGrokVideoCreateProtocol ? 'grok-video-query' : 'openai-videos-query'))), signal);
          if (!pollResponse.ok) return pollResponse;
          data = pollResponse.data;
        }
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

      async function sendImageRequest(request, label = 'default', externalSignal) {
        debugLog('[callImageAPI] request:', {
          label,
          endpoint: request.endpoint,
          contentType: request.headers?.['Content-Type'] || '(multipart)',
          hasBody: !!request.body
        });

        const controller = new AbortController();
        const propagateAbort = () => {
          try { controller.abort(externalSignal?.reason); } catch { controller.abort(); }
        };
        if (externalSignal?.aborted) propagateAbort();
        else externalSignal?.addEventListener('abort', propagateAbort, { once: true });
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
          let proxyRecovered = false;
          const directEndpoint = String(request.endpoint || '');
          const canRetryThroughAppProxy = !externalSignal?.aborted
            && fetchErr?.name !== 'AbortError'
            && /^https:\/\//i.test(directEndpoint)
            && !isAppProxyUrl(directEndpoint)
            && !isApiProxyEnabled();
          if (canRetryThroughAppProxy) {
            try {
              const proxyEndpoint = buildApiProxyUrlForTarget(directEndpoint);
              debugLog('[callImageAPI] direct request failed, retrying through same-origin proxy:', proxyEndpoint);
              res = await fetch(proxyEndpoint, {
                method: 'POST',
                headers: request.headers,
                body: request.body,
                signal: controller.signal
              });
              proxyRecovered = true;
            } catch (proxyErr) {
              proxyErr.cause = fetchErr;
              fetchErr = proxyErr;
            }
          }
          if (!proxyRecovered) {
            clearTimeout(timeoutId);
            externalSignal?.removeEventListener('abort', propagateAbort);
            if (externalSignal?.aborted) throw externalSignal.reason || fetchErr;
            if (fetchErr.name === 'AbortError') throw new Error('请求超时（10分钟），请稍后重试');
            throw fetchErr;
          }
        }
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', propagateAbort);

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
        if (lower.endsWith('.mp4')) return 'video/mp4';
        if (lower.endsWith('.webm')) return 'video/webm';
        if (lower.endsWith('.mov')) return 'video/quicktime';
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
            imageUrl = normalizeResultMediaUrl(p.file_data?.file_uri || p.fileData?.fileUri);
          }
        });

        if (!imageBase64 && data?.imageBase64) {
          imageBase64 = data.imageBase64;
          mime = data.mimeType || mime;
        }
        if (!textList.length && typeof data?.text === 'string') textList.push(data.text);

        // Replicate prediction 格式：{ output: "https://..." } 或 { output: ["https://..."] }
        if (!imageBase64 && !imageUrl && typeof data?.output === 'string') {
          imageUrl = data.output;
          mime = guessMimeFromUrl(imageUrl) || mime;
        }
        if (!imageBase64 && !imageUrl && Array.isArray(data?.output)) {
          const firstOutputUrl = data.output.find(item => typeof item === 'string' && /^https?:\/\//i.test(item));
          if (firstOutputUrl) {
            imageUrl = firstOutputUrl;
            mime = guessMimeFromUrl(imageUrl) || mime;
          }
        }

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

        // OpenAI Responses 格式：output/content 里可能返回文本、图片 URL 或 Base64
        if (!imageBase64 && !imageUrl && Array.isArray(data?.output)) {
          data.output.forEach(outputItem => {
            const content = Array.isArray(outputItem?.content) ? outputItem.content : [];
            content.forEach(item => {
              const text = item.text || item.output_text;
              const url = item.image_url || item.url;
              const b64 = item.b64_json || item.image_base64 || item.data;
              if (text) textList.push(text);
              if (!imageUrl && url) imageUrl = typeof url === 'string' ? url : url.url;
              if (!imageBase64 && b64) imageBase64 = String(b64).replace(/^data:image\/[^;]+;base64,/, '');
              if (item.mime_type || item.mimeType) mime = item.mime_type || item.mimeType;
            });
          });
        }
        if (!imageBase64 && !imageUrl && typeof data?.output_text === 'string') {
          textList.push(data.output_text);
        }

        // 阿里云百炼图像格式：output.choices[].message.content[].image
        if (!imageBase64 && !imageUrl && Array.isArray(data?.output?.choices)) {
          data.output.choices.forEach(choice => {
            const content = Array.isArray(choice?.message?.content) ? choice.message.content : [];
            content.forEach(item => {
              if (!imageUrl && item.image) imageUrl = item.image;
              if (item.text) textList.push(item.text);
            });
          });
          if (imageUrl) mime = guessMimeFromUrl(imageUrl) || mime;
        }
        if (!imageBase64 && !imageUrl && Array.isArray(data?.output?.results)) {
          const first = data.output.results.find(item => item.url || item.image || item.image_url);
          if (first) {
            imageUrl = first.url || first.image || first.image_url;
            mime = guessMimeFromUrl(imageUrl) || mime;
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

      function extractVideoResult(data) {
        const videoUrl = getNestedVideoUrl(data);
        const thumbnailUrl = getNestedThumbnailUrl(data);
        const videoId = getVideoTaskId(data);
        const text = data?.enhanced_prompt || data?.detail?.enhanced_prompt || data?.message || '';
        return {
          mediaType: 'video',
          text,
          videoUrl,
          videoSrc: videoUrl,
          thumbnailUrl,
          videoId,
          mime: guessMimeFromUrl(videoUrl) || 'video/mp4',
          blocked: false
        };
      }

      // 从 result 获取可显示的图片 src
      function getResultImgSrc(result) {
        if (!result) return '';
        if (result.imageBase64) {
          return result.imageBase64.startsWith('data:')
            ? result.imageBase64
            : `data:${result.mime || 'image/png'};base64,${result.imageBase64}`;
        }
        return normalizeResultMediaUrl(result.imageUrl || '');
      }

      const RESULT_MEDIA_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

      function getResultImageDisplaySrc(src) {
        const normalized = normalizeResultMediaUrl(src);
        return isKnownMediaProxyHost(normalized) ? RESULT_MEDIA_PLACEHOLDER : normalized;
      }

      function getResultImageActionSrc(src) {
        const normalized = normalizeResultMediaUrl(src);
        return isKnownMediaProxyHost(normalized)
          ? buildMediaProxyUrlForTarget(normalized, { retry: true })
          : normalized;
      }

      function getResultVideoSrc(result) {
        if (!result) return '';
        return normalizeResultMediaUrl(result.videoSrc || result.videoUrl || '');
      }

      function hasResultVideo(result) {
        return !!(result && (result.mediaType === 'video' || result.videoSrc || result.videoUrl));
      }

      function buildContinueSourceState(initialSrc = '') {
        return {
          displaySrc: initialSrc || '',
          cachedSrc: /^data:image\//i.test(initialSrc || '') ? initialSrc : '',
          failed: false,
          error: ''
        };
      }

      function getContinueImageSource(sourceState) {
        if (!sourceState) return '';
        if (sourceState.failed && !sourceState.cachedSrc) return '';
        return sourceState.cachedSrc || sourceState.displaySrc || '';
      }

      async function warmContinueImageSource(sourceState, options = {}) {
        if (!sourceState) return '';
        if (sourceState.cachedSrc) return sourceState.cachedSrc;
        if (!sourceState.displaySrc) {
          sourceState.failed = true;
          sourceState.error = '当前图片没有可用图源';
          return '';
        }

        try {
          const persistentSrc = await getPersistentImageSource(sourceState.displaySrc, {
            maxRetries: 2,
            forceRefresh: options.forceRefresh === true,
            onProgress: (progress) => {
              sourceState.downloadProgress = progress;
              options.onProgress?.(progress);
            }
          });
          sourceState.cachedSrc = persistentSrc;
          sourceState.failed = false;
          sourceState.error = '';
          sourceState.downloadProgress = { percent: 100, stage: 'done' };
          return persistentSrc;
        } catch (err) {
          sourceState.failed = true;
          sourceState.error = err?.message || String(err || '');
          return '';
        }
      }

      function applyContinueSourceAvailability(continueBtn, sourceState) {
        if (!continueBtn || !sourceState) return;
        const hasSource = !!(sourceState.cachedSrc || sourceState.displaySrc);
        continueBtn.disabled = !hasSource;
        continueBtn.title = sourceState.cachedSrc
          ? '基于这张图继续生成'
          : hasSource
            ? '点击后会先准备图片，若失败请下载后上传为参考图'
            : '该图片没有可用图源，请先下载后再上传';
      }

      async function getPersistentImageSource(src, options = {}) {
        if (!src) throw new Error('图片地址为空');
        if (/^data:/i.test(src)) {
          options.onProgress?.({ loadedBytes: 1, totalBytes: 1, percent: 100, stage: 'cached' });
          return src;
        }

        options.onProgress?.({ loadedBytes: 0, totalBytes: 0, percent: 0, stage: 'downloading' });
        const blob = await fetchImageAsBlob(src, options);
        options.onProgress?.({ loadedBytes: blob.size, totalBytes: blob.size, percent: 100, stage: 'encoding' });
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            options.onProgress?.({ loadedBytes: blob.size, totalBytes: blob.size, percent: 100, stage: 'done' });
            resolve(reader.result);
          };
          reader.onerror = () => reject(new Error('图片转为本地数据失败'));
          reader.readAsDataURL(blob);
        });
      }

      async function fetchImageAsBlob(src, options = {}) {
        if (!src) throw new Error('图片地址为空');
        return fetchMediaBlob(src, '图片', options);
      }

      // 判断 result 是否包含图片
      function hasResultImage(result) {
        return !!(result && (result.imageBase64 || result.imageUrl));
      }

      function bindResultImageFallback(image, source) {
        if (!image || !source || /^data:/i.test(source)) return;
        const candidates = [source];
        if (isKnownMediaProxyHost(source)) {
          candidates.push(buildMediaProxyUrlForTarget(source, { retry: true }));
        } else if (canProxyMediaUrl(source)) {
          candidates.push(buildApiProxyUrlForTarget(source));
        }
        const uniqueCandidates = [...new Set(candidates.filter(Boolean))];
        if (uniqueCandidates.length < 2) return;

        let attempt = 0;
        image.addEventListener('error', () => {
          attempt += 1;
          const next = uniqueCandidates[attempt];
          if (!next || image.src === next) return;
          image.src = next;
        });
      }

      function hasVisualResult(result) {
        return hasResultImage(result) || hasResultVideo(result);
      }

      // 根据 MIME 类型获取正确的文件扩展名
      function getExtensionFromMime(mime) {
        const mimeToExt = {
          'image/jpeg': 'jpg',
          'image/jpg': 'jpg',
          'image/png': 'png',
          'image/gif': 'gif',
          'image/webp': 'webp',
          'video/mp4': 'mp4',
          'video/webm': 'webm',
          'video/quicktime': 'mov'
        };
        return mimeToExt[mime] || 'png';
      }

      function extractTextFromApiResponse(data) {
        const pieces = [];
        const appendContent = (content) => {
          if (!content) return;
          if (typeof content === 'string') {
            pieces.push(content);
            return;
          }
          if (Array.isArray(content)) {
            content.forEach(item => appendContent(item?.text || item?.content || item?.output_text || ''));
          }
        };

        if (Array.isArray(data?.choices)) {
          data.choices.forEach(choice => {
            appendContent(choice?.message?.content);
            appendContent(choice?.delta?.content);
            appendContent(choice?.text);
          });
        }
        appendContent(data?.output_text);
        if (Array.isArray(data?.output)) {
          data.output.forEach(item => {
            appendContent(item?.content);
            appendContent(item?.text || item?.output_text);
          });
        }
        return pieces.filter(Boolean).join('');
      }

      function getTextApiRawPreview(raw, limit = 300) {
        return String(raw || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, limit);
      }

      function getTextApiUsage(data) {
        const usage = data?.usage || data?.response?.usage || data?.data?.usage;
        if (usage && typeof usage === 'object') return usage;
        if (Array.isArray(data?.choices)) {
          const choiceUsage = data.choices.map(choice => choice?.usage).find(Boolean);
          if (choiceUsage && typeof choiceUsage === 'object') return choiceUsage;
        }
        return null;
      }

      function mergeTextApiUsage(current, next) {
        if (!next || typeof next !== 'object') return current || null;
        return {
          ...(current || {}),
          ...next
        };
      }

      function getTextApiUsageSummary(usage) {
        if (!usage || typeof usage !== 'object') return '';
        const parts = [];
        const inputTokens = usage.prompt_tokens ?? usage.input_tokens;
        const outputTokens = usage.completion_tokens ?? usage.output_tokens;
        const totalTokens = usage.total_tokens;
        const imageTokens = getTextApiImageTokenCount(usage);
        if (inputTokens !== undefined) parts.push(`input_tokens=${inputTokens}`);
        if (outputTokens !== undefined) parts.push(`completion_tokens=${outputTokens}`);
        if (totalTokens !== undefined) parts.push(`total_tokens=${totalTokens}`);
        if (imageTokens !== undefined) parts.push(`image_tokens=${imageTokens}`);
        return parts.join(', ');
      }

      function getTextApiUsageFromRaw(raw) {
        const source = String(raw || '');
        const pickNumber = (name) => {
          const match = source.match(new RegExp(`["']?${name}["']?\\s*[:：]\\s*(\\d+)`, 'i'));
          return match ? Number(match[1]) : undefined;
        };
        const usage = {
          prompt_tokens: pickNumber('prompt_tokens') ?? pickNumber('input_tokens'),
          completion_tokens: pickNumber('completion_tokens') ?? pickNumber('output_tokens'),
          total_tokens: pickNumber('total_tokens'),
          prompt_tokens_details: {
            image_tokens: pickNumber('image_tokens')
          }
        };
        return [
          usage.prompt_tokens,
          usage.completion_tokens,
          usage.total_tokens,
          usage.prompt_tokens_details.image_tokens
        ].some(value => value !== undefined) ? usage : null;
      }

      function isLikelyPlainTextPayload(payload) {
        const text = String(payload || '').trim();
        if (!text) return false;
        if (/^[\[{(]/.test(text)) return false;
        if (/"?(choices|usage|prompt_tokens|completion_tokens|total_tokens|object|model|created)"?\s*[:：]/i.test(text)) return false;
        if (/\b(chat\.completion|chat\.completion\.chunk)\b/i.test(text)) return false;
        return true;
      }

      function parseTextApiJsonPayload(raw) {
        try {
          return JSON.parse(raw);
        } catch (_) {
          return null;
        }
      }

      function parseTextApiSseResponse(raw) {
        const textParts = [];
        const errors = [];
        let usage = null;
        const events = String(raw || '')
          .split(/\r?\n\r?\n/)
          .map(event => event.trim())
          .filter(Boolean);

        const handlePayload = (payload) => {
          if (!payload || payload === '[DONE]') return true;

          const data = parseTextApiJsonPayload(payload);
          if (!data) {
            if (isLikelyPlainTextPayload(payload)) textParts.push(payload);
            return false;
          }

          const errorMessage = extractApiErrorMessage(data);
          if (errorMessage) errors.push(errorMessage);
          usage = mergeTextApiUsage(usage, getTextApiUsage(data));

          const text = extractTextFromApiResponse(data);
          if (text) textParts.push(text);
          return true;
        };

        events.forEach(event => {
          const dataLines = [];
          let sawDataLine = false;
          event.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            if (trimmed.startsWith('data:')) {
              sawDataLine = true;
              dataLines.push(trimmed.slice(5).trim());
              return;
            }
            if (sawDataLine && !/^[a-zA-Z-]+:/.test(trimmed)) {
              dataLines.push(trimmed);
            }
          });
          if (!dataLines.length) return;

          dataLines.forEach(handlePayload);
          const joined = dataLines.length > 1
            ? dataLines.filter(line => line && line !== '[DONE]').join('')
            : '';
          if (joined) handlePayload(joined);
        });

        return {
          isSse: true,
          text: textParts.join(''),
          errorMessage: errors.find(Boolean) || '',
          usage: usage || getTextApiUsageFromRaw(raw)
        };
      }

      function parseTextApiResponse(raw) {
        const trimmed = String(raw || '').trim();
        if (!trimmed) return { text: '', errorMessage: '', isSse: false, data: null };

        if (/^\s*data:/m.test(trimmed)) {
          return parseTextApiSseResponse(trimmed);
        }

        const data = parseTextApiJsonPayload(trimmed);
        if (data) {
          return {
            text: extractTextFromApiResponse(data),
            errorMessage: extractApiErrorMessage(data),
            isSse: false,
            data,
            usage: getTextApiUsage(data)
          };
        }

        return {
          text: /^[<{]/.test(trimmed) ? '' : trimmed,
          errorMessage: '',
          isSse: false,
          data: null,
          usage: getTextApiUsageFromRaw(trimmed)
        };
      }

      // 统一的文本API调用：固定走 OpenAI Chat 兼容格式
      function buildTextApiPayload(promptText, options = {}) {
        const maxTokens = options.maxTokens ?? 1200;
        return {
          model: getTextModel(),
          messages: [{ role: 'user', content: options.content || promptText }],
          temperature: options.temperature ?? 0.3,
          max_tokens: maxTokens,
          max_completion_tokens: maxTokens,
          stream: options.stream ?? true,
          ...(options.extraPayload || {})
        };
      }

      async function callTextAPI(promptText, options = {}) {
        const capability = getTextCapabilityStatus();
        if (!capability.available) {
          const error = new Error(capability.message);
          error.code = 'GEMINI_NATIVE_TEXT_UNSUPPORTED';
          throw error;
        }
        const key = getTextApiKey();
        if (!key) throw new Error('请先配置 API Key');

        const payload = buildTextApiPayload(promptText, options);

        const res = await fetch(capability.endpoint, {
          method: 'POST',
          headers: buildRequestHeaders(key, 'openai-chat'),
          body: JSON.stringify(payload)
        });

        const raw = await res.text();
        const parsed = parseTextApiResponse(raw);

        if (!res.ok) {
          const detail = parsed.errorMessage || parsed.text || getTextApiRawPreview(raw);
          const error = new Error(`API 错误 (${res.status}): ${detail || '请求失败'}`);
          error.status = res.status;
          error.parsed = parsed;
          error.rawPreview = getTextApiRawPreview(raw);
          throw error;
        }

        if (parsed.errorMessage) {
          console.error('[callTextAPI] error payload:', parsed.data || raw);
          const error = new Error(parsed.errorMessage);
          error.status = res.status;
          error.parsed = parsed;
          error.rawPreview = getTextApiRawPreview(raw);
          throw error;
        }

        if (parsed.text) return parsed.text;
        const preview = getTextApiRawPreview(raw);
        const usageSummary = getTextApiUsageSummary(parsed.usage);
        const imageTokens = getTextApiImageTokenCount(parsed.usage);
        const diagnostics = [
          options.expectImageInput && imageTokens === 0 ? '中转站没有把图片字段识别为视觉输入' : '',
          `模型：${getTextModel()}`,
          usageSummary ? `用量：${usageSummary}` : '',
          preview ? `摘要：${preview}` : ''
        ].filter(Boolean).join('；');
        const emptyMessage = options.emptyMessage || 'API 返回内容为空';
        const error = new Error(`${emptyMessage}${diagnostics ? `（${diagnostics}）` : ''}`);
        error.status = res.status;
        error.parsed = parsed;
        error.rawPreview = preview;
        error.isEmptyText = true;
        if (parsed.isSse) {
          throw error;
        }
        throw error;
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

      function getDataUrlImageParts(dataUrl) {
        const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return null;
        return {
          mime: match[1] || 'image/png',
          base64: match[2] || '',
          byteSize: Math.round((match[2] || '').length * 0.75)
        };
      }

      function formatByteSize(bytes) {
        const value = Number(bytes || 0);
        if (!value) return '0KB';
        if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`;
        return `${Math.max(1, Math.round(value / 1024))}KB`;
      }

      function compressImageForReversePrompt(image) {
        return new Promise((resolve, reject) => {
          const source = image?.dataUrl || '';
          const sourceParts = getDataUrlImageParts(source);
          if (!sourceParts?.base64) {
            reject(new Error('参考图不是可用的 Data URL，无法反推提示词'));
            return;
          }

          const img = new Image();
          img.onload = () => {
            const result = compressImageOnce(img, 1280, 1280, 0.85, 'image/jpeg');
            resolve({
              ...image,
              dataUrl: result.dataUrl,
              mime: result.mime,
              width: result.width,
              height: result.height,
              reverseOriginalSize: sourceParts.byteSize || image?.size || image?.compressedSize || image?.originalSize || 0,
              reversePayloadSize: result.size,
              reversePayloadNote: `原图 ${formatByteSize(sourceParts.byteSize || image?.size || image?.compressedSize || image?.originalSize || 0)}，反推发送 ${formatByteSize(result.size)}，格式 ${result.mime}`
            });
          };
          img.onerror = () => reject(new Error('反推前压缩参考图失败'));
          img.src = source;
        });
      }

      function getTextApiImageTokenCount(usage) {
        if (!usage || typeof usage !== 'object') return undefined;
        return usage.prompt_tokens_details?.image_tokens
          ?? usage.input_tokens_details?.image_tokens
          ?? usage.input_token_details?.image_tokens
          ?? usage.image_tokens;
      }

      function shouldRetryReversePromptWithBase64(error) {
        const status = Number(error?.status || 0);
        if ([401, 403, 429].includes(status)) return false;
        if (/Failed to fetch|NetworkError|timeout/i.test(String(error?.message || ''))) return false;
        if (status >= 500 && !/bad_response_status_code|openai_error/i.test(String(error?.message || ''))) return false;

        const usage = error?.parsed?.usage;
        const imageTokens = getTextApiImageTokenCount(usage);
        const completionTokens = usage?.completion_tokens ?? usage?.output_tokens;
        if (error?.isEmptyText && (imageTokens === 0 || completionTokens === 0)) return true;
        if (status === 502 && /bad_response_status_code|openai_error/i.test(String(error?.message || ''))) return true;

        return /image(_url)?|base64|data url|unsupported|invalid|图片|图像|视觉|多模态/i.test(String(error?.message || ''));
      }

      function getReverseImageModeLabel(mode) {
        if (mode === 'base64-json') return 'Base64 JSON';
        if (mode === 'data-url') return 'Data URL';
        return '自动';
      }

      function getReversePromptInstruction() {
        return `你是专业的 AI 图像提示词反推专家。你必须先真实观察随消息附带的参考图，再根据图像内容反推一段适合图像生成或视频生成复用的中文提示词。
要求：
1. 只描述参考图中真实可见的内容，不要编造图中不存在的元素
2. 描述主体、服饰、物体、场景、构图、镜头、光线、色彩、材质、风格和氛围
3. 如果画面包含产品、人物或文字，请尽量保留关键视觉信息
4. 输出一段可直接复制使用的中文提示词
5. 不要输出分析过程、标题、编号或额外解释
6. 如果你没有收到或无法查看参考图，只返回 IMAGE_NOT_RECEIVED，不要猜测画面内容`;
      }

      function buildReversePromptPayload(image, instruction, mode) {
        const parts = getDataUrlImageParts(image?.dataUrl);
        if (!parts?.base64) {
          throw new Error('参考图不是可用的 Data URL，无法反推提示词');
        }

        const imageNote = image?.reversePayloadNote || '';
        const emptyMessage = `接口没有返回反推结果，请确认当前文本优化模型支持图片理解（图片格式：${getReverseImageModeLabel(mode)}，${imageNote || '反推图片已压缩'}，未启用公网 URL 转存）`;
        const common = {
          temperature: 0.2,
          maxTokens: 900,
          emptyMessage,
          expectImageInput: true
        };

        if (mode === 'base64-json') {
          const format = parts.mime.split('/')[1] || 'png';
          const options = {
            ...common,
            extraPayload: {
              image: [parts.base64],
              images: [parts.base64],
              image_format: format,
              mime_type: parts.mime,
              image_mime_type: parts.mime
            }
          };
          const payload = buildTextApiPayload(instruction, options);
          return {
            promptText: instruction,
            options,
            payload,
            meta: {
              mode,
              imageFormat: parts.mime,
              originalSize: image?.reverseOriginalSize || image?.size || image?.compressedSize || image?.originalSize || 0,
              payloadSize: image?.reversePayloadSize || parts.byteSize || 0,
              note: imageNote
            }
          };
        }

        const options = {
          ...common,
          content: [
            { type: 'text', text: instruction },
            { type: 'image_url', image_url: { url: image.dataUrl } }
          ]
        };
        const payload = buildTextApiPayload('', options);
        return {
          promptText: '',
          options,
          payload,
          meta: {
            mode,
            imageFormat: parts.mime,
            originalSize: image?.reverseOriginalSize || image?.size || image?.compressedSize || image?.originalSize || 0,
            payloadSize: image?.reversePayloadSize || parts.byteSize || 0,
            note: imageNote
          }
        };
      }

      function assertReversePromptLooksVisual(text, mode, image) {
        const value = String(text || '').trim();
        if (!value) return value;
        const blockedPatterns = [
          /IMAGE_NOT_RECEIVED/i,
          /没有(?:收到|看到|附带|提供).{0,12}(?:图片|图像|参考图)/,
          /请(?:上传|发送|提供).{0,12}(?:图片|图像|参考图)/,
          /无法(?:查看|看到|识别|访问).{0,12}(?:图片|图像|参考图)/,
          /作为(?:AI|语言模型).{0,20}无法/
        ];
        if (blockedPatterns.some(pattern => pattern.test(value))) {
          throw new Error(`接口没有真正识别参考图，请切换反推图片格式或确认当前文本优化模型支持图片理解（图片格式：${getReverseImageModeLabel(mode)}，${image?.reversePayloadNote || '反推图片已压缩'}，模型：${getTextModel()}，未启用公网 URL 转存）`);
        }
        return value;
      }

      async function callReversePromptWithMode(image, instruction, mode) {
        const request = buildReversePromptPayload(image, instruction, mode);
        return callTextAPI(request.promptText, request.options);
      }

      async function reversePromptFromImage(image) {
        const reversePromptInstruction = getReversePromptInstruction();
        const reverseImage = image?.reversePayloadNote ? image : await compressImageForReversePrompt(image);

        let dataUrlError = null;
        try {
          const text = await callReversePromptWithMode(reverseImage, reversePromptInstruction, 'data-url');
          return assertReversePromptLooksVisual(text.replace(/```.*?\n?/g, '').trim(), 'data-url', reverseImage);
        } catch (error) {
          dataUrlError = error;
          if (!shouldRetryReversePromptWithBase64(error)) throw error;
        }

        try {
          const text = await callReversePromptWithMode(reverseImage, reversePromptInstruction, 'base64-json');
          return assertReversePromptLooksVisual(text.replace(/```.*?\n?/g, '').trim(), 'base64-json', reverseImage);
        } catch (base64Error) {
          throw new Error(`${base64Error.message || base64Error}\n\n自动模式已尝试 Data URL 和 Base64 JSON，仍未获得反推结果。当前中转站/模型没有成功接收图片输入。反推图片信息：${reverseImage.reversePayloadNote}；模型：${getTextModel()}；未启用公网 URL 转存。Data URL 错误：${dataUrlError?.message || dataUrlError}`);
        }
      }

      function getGifSourceImages() {
        const sources = [];
        const seen = new Set();
        const addSource = (src, label) => {
          if (!src || seen.has(src) || /^data:video\//i.test(src)) return;
          if (!/^data:image\//i.test(src) && !/^https?:\/\//i.test(src) && !/^blob:/i.test(src)) return;
          seen.add(src);
          sources.push({ src, label: label || `Frame ${sources.length + 1}` });
        };

        state.images.forEach((image, index) => addSource(image?.dataUrl, `参考图 ${index + 1}`));

        if (!sources.length && resultsEl) {
          resultsEl.querySelectorAll('.result-thumb-btn img, .result-card img, img.zoomable').forEach((img, index) => {
            addSource(img.currentSrc || img.src, `输出图 ${index + 1}`);
          });
        }

        return sources.slice(0, 12);
      }

      function getInitialGifGridReferences() {
        return state.images
          .filter(image => image?.dataUrl)
          .slice(0, 6)
          .map((image, index) => ({
            ...image,
            name: image.name || `参考图 ${index + 1}`
          }));
      }

      function loadGifImage(src) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('图片加载失败，无法合成 GIF'));
          img.crossOrigin = 'anonymous';
          img.src = src;
        });
      }

      async function prepareGifSource(src) {
        if (/^data:image\//i.test(src || '')) return src;
        return getPersistentImageSource(src);
      }

      function clampGifSize(value) {
        const size = parseInt(value, 10) || 512;
        return Math.max(256, Math.min(1024, size));
      }

      function clampGifDelay(value) {
        const delay = parseInt(value, 10) || 120;
        return Math.max(40, Math.min(2000, delay));
      }

      function getGifColorIndex(r, g, b) {
        return ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
      }

      function getGifGlobalPalette() {
        const palette = [];
        for (let r = 0; r < 8; r++) {
          for (let g = 0; g < 8; g++) {
            for (let b = 0; b < 4; b++) {
              palette.push(Math.round((r / 7) * 255), Math.round((g / 7) * 255), Math.round((b / 3) * 255));
            }
          }
        }
        return palette;
      }

      function renderGifFrame(image, options, frameIndex, totalFrames) {
        const width = options.width;
        const height = options.height;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = options.background || '#ffffff';
        ctx.fillRect(0, 0, width, height);

        const baseScale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
        const progress = totalFrames <= 1 ? 0 : frameIndex / (totalFrames - 1);
        const pulse = options.animateSingle ? Math.sin(progress * Math.PI * 2) : 0;
        const scale = baseScale * (options.animateSingle ? 1 + pulse * 0.035 : 1);
        const drawW = image.naturalWidth * scale;
        const drawH = image.naturalHeight * scale;
        const panX = options.animateSingle ? Math.sin(progress * Math.PI * 2) * width * 0.018 : 0;
        const panY = options.animateSingle ? Math.cos(progress * Math.PI * 2) * height * 0.012 : 0;
        ctx.drawImage(image, (width - drawW) / 2 + panX, (height - drawH) / 2 + panY, drawW, drawH);

        const data = ctx.getImageData(0, 0, width, height).data;
        const indexed = new Uint8Array(width * height);
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
          const alpha = data[i + 3] / 255;
          const r = Math.round(data[i] * alpha + 255 * (1 - alpha));
          const g = Math.round(data[i + 1] * alpha + 255 * (1 - alpha));
          const b = Math.round(data[i + 2] * alpha + 255 * (1 - alpha));
          indexed[p] = getGifColorIndex(r, g, b);
        }
        return indexed;
      }

      function gifWriteShort(bytes, value) {
        bytes.push(value & 255, (value >> 8) & 255);
      }

      function gifWriteString(bytes, value) {
        for (let i = 0; i < value.length; i++) bytes.push(value.charCodeAt(i) & 255);
      }

      function lzwEncodeGifPixels(indexedPixels, minCodeSize = 8) {
        const clearCode = 1 << minCodeSize;
        const endCode = clearCode + 1;
        const codeSize = minCodeSize + 1;
        const output = [];
        let bitBuffer = 0;
        let bitCount = 0;
        const writeCode = (code) => {
          bitBuffer |= code << bitCount;
          bitCount += codeSize;
          while (bitCount >= 8) {
            output.push(bitBuffer & 255);
            bitBuffer >>= 8;
            bitCount -= 8;
          }
        };

        // Literal-only LZW is larger, but it avoids decoder drift in browser GIF playback.
        writeCode(clearCode);
        let literalCount = 0;
        for (let i = 0; i < indexedPixels.length; i++) {
          if (literalCount >= 254) {
            writeCode(clearCode);
            literalCount = 0;
          }
          writeCode(indexedPixels[i]);
          literalCount++;
        }
        writeCode(endCode);
        if (bitCount > 0) output.push(bitBuffer & 255);
        return output;
      }

      function appendGifDataSubBlocks(bytes, data) {
        for (let i = 0; i < data.length; i += 255) {
          const block = data.slice(i, i + 255);
          bytes.push(block.length, ...block);
        }
        bytes.push(0);
      }

      function encodeGif(frames, options) {
        if (!frames.length) throw new Error('没有可合成的帧');
        const bytes = [];
        const width = options.width;
        const height = options.height;
        gifWriteString(bytes, 'GIF89a');
        gifWriteShort(bytes, width);
        gifWriteShort(bytes, height);
        bytes.push(0xf7, 0, 0);
        bytes.push(...getGifGlobalPalette());

        bytes.push(0x21, 0xff, 0x0b);
        gifWriteString(bytes, 'NETSCAPE2.0');
        bytes.push(0x03, 0x01);
        gifWriteShort(bytes, options.loop ? 0 : 1);
        bytes.push(0);

        const delayCs = Math.max(1, Math.round(options.delayMs / 10));
        frames.forEach(frame => {
          bytes.push(0x21, 0xf9, 0x04, 0x04);
          gifWriteShort(bytes, delayCs);
          bytes.push(0, 0);
          bytes.push(0x2c);
          gifWriteShort(bytes, 0);
          gifWriteShort(bytes, 0);
          gifWriteShort(bytes, width);
          gifWriteShort(bytes, height);
          bytes.push(0);
          bytes.push(8);
          appendGifDataSubBlocks(bytes, lzwEncodeGifPixels(frame, 8));
        });
        bytes.push(0x3b);
        return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
      }

      function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('GIF 读取失败'));
          reader.readAsDataURL(blob);
        });
      }

      async function buildGifDataUrl(sources, options) {
        const width = clampGifSize(options.width);
        const height = clampGifSize(options.height);
        const delayMs = clampGifDelay(options.delayMs);
        const preparedSources = await Promise.all(sources.map(source => prepareGifSource(source.src)));
        const images = await Promise.all(preparedSources.map(src => loadGifImage(src)));
        const frames = [];
        const animateSingle = images.length === 1;
        const totalFrames = animateSingle ? Math.max(6, Math.min(24, parseInt(options.singleFrameCount, 10) || 12)) : images.length;
        for (let i = 0; i < totalFrames; i++) {
          const image = animateSingle ? images[0] : images[i];
          frames.push(renderGifFrame(image, { width, height, background: options.background || '#ffffff', animateSingle }, i, totalFrames));
        }
        const gifBlob = encodeGif(frames, { width, height, delayMs, loop: options.loop !== false });
        return blobToDataUrl(gifBlob);
      }

      function buildGifGridPrompt(theme) {
        const subject = String(theme || '').trim();
        return [
          'Create one animation sprite sheet for GIF generation.',
          'Canvas layout: exactly 3 columns by 4 rows, 12 frames total.',
          'Target full image size: 3264x2448. Each frame is a square 816x816 cell.',
          'The 12 frames must describe a smooth continuous motion sequence from frame 1 to frame 12.',
          'Keep the same subject identity, outfit, style, lighting, camera angle, and background across all frames.',
          'No text, no numbers, no labels, no borders, no gutters, no frame separators, no watermark.',
          'Each cell must be a complete centered square frame, suitable for slicing into an animated GIF.',
          `Animation theme/action: ${subject}`
        ].join('\n');
      }

      function buildGifGridImageRequest(prompt, refs, model, key) {
        const payload = {
          model: model || 'gpt-image-2',
          prompt,
          size: '3264x2448',
          n: 1,
          response_format: 'b64_json'
        };
        const images = refs.map(ref => ref?.dataUrl).filter(Boolean).slice(0, 6);
        if (images.length) {
          payload.image = images;
          payload.images = images;
        }
        return {
          endpoint: buildApiUrl('/v1/images/generations'),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify(payload)
        };
      }

      async function callGifGridImageAPI(theme, refs, model) {
        const key = getApiKey();
        if (!key) throw new Error('请先配置 API Key');
        const request = buildGifGridImageRequest(buildGifGridPrompt(theme), refs, model, key);
        const response = await sendImageRequest(request, 'gif-grid-generations');
        if (!response.ok) {
          const errorText = extractApiErrorMessage(response.data) || response.raw || `API 错误: ${response.status}`;
          throw new Error(errorText);
        }
        const apiErrorMessage = extractApiErrorMessage(response.data);
        if (apiErrorMessage) throw new Error(apiErrorMessage);
        const result = await annotateImageResultDimensions(extractResult(response.data), aspectSelect?.value || 'auto');
        if (!hasResultImage(result)) throw new Error('接口未返回可用网格图');
        return result;
      }

      async function sliceGifGridFrames(gridSrc, options = {}) {
        const frameSize = Math.max(256, Math.min(1024, parseInt(options.frameSize, 10) || 816));
        const image = await loadGifImage(await prepareGifSource(gridSrc));
        const cols = 3;
        const rows = 4;
        const cellW = image.naturalWidth / cols;
        const cellH = image.naturalHeight / rows;
        const frames = [];
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const canvas = document.createElement('canvas');
            canvas.width = frameSize;
            canvas.height = frameSize;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, frameSize, frameSize);
            ctx.drawImage(
              image,
              Math.round(col * cellW),
              Math.round(row * cellH),
              Math.ceil(cellW),
              Math.ceil(cellH),
              0,
              0,
              frameSize,
              frameSize
            );
            frames.push({
              src: canvas.toDataURL('image/png'),
              label: `帧 ${frames.length + 1}`
            });
          }
        }
        return frames;
      }

      async function readGifReferenceFiles(fileList, existing = []) {
        const files = Array.from(fileList || []).filter(file => /^image\//i.test(file.type || ''));
        const remaining = Math.max(0, 6 - existing.length);
        if (!files.length || remaining <= 0) return existing;
        const nextRefs = await Promise.all(files.slice(0, remaining).map(processAndCompressImage));
        return [...existing, ...nextRefs].slice(0, 6);
      }

      function renderGifReferenceList(container, refs) {
        if (!container) return;
        if (!refs.length) {
          container.innerHTML = '<div class="gif-ref-empty">可选：拖放或粘贴参考图，最多 6 张。</div>';
          return;
        }
        container.innerHTML = refs.map((ref, index) => `
          <div class="gif-ref-item">
            <img src="${escapeHtml(ref.dataUrl)}" alt="${escapeHtml(ref.name || `参考图 ${index + 1}`)}">
            <span>${escapeHtml(ref.name || `参考图 ${index + 1}`)}</span>
          </div>
        `).join('');
      }

      function showUpscaleToolDialog() {
        const overlay = document.createElement('div');
        overlay.className = 'prompt-compare-overlay upscale-tool-overlay';
        overlay.innerHTML = `
          <div class="prompt-compare-panel upscale-tool-panel">
            <div class="prompt-compare-header">
              <h3>AI 超分</h3>
              <button class="prompt-compare-close" type="button">✕</button>
            </div>
            <div class="prompt-compare-content upscale-tool-content">
              <div class="upscale-upload-zone" tabindex="0">
                <input class="upscale-file-input" type="file" accept="image/png,image/jpeg,image/webp" hidden>
                <i class="upscale-upload-icon" data-lucide="upload" aria-hidden="true"></i>
                <strong>拖放图片或点击上传</strong>
                <small>支持 PNG / JPEG / WebP，建议小于 10MB</small>
              </div>
              <div class="upscale-workspace" hidden>
                <div class="upscale-preview-row">
                  <div class="upscale-preview-col">
                    <div class="upscale-preview-label">原始图片</div>
                    <div class="upscale-preview-box">
                      <img class="upscale-original-img" alt="原始图片">
                    </div>
                    <div class="upscale-dimensions upscale-original-dim"></div>
                  </div>
                  <div class="upscale-preview-col">
                    <div class="upscale-preview-label">超分结果</div>
                    <div class="upscale-preview-box">
                      <img class="upscale-result-img" alt="超分结果" hidden>
                      <div class="upscale-preview-empty">点击"开始超分"后显示结果</div>
                    </div>
                    <div class="upscale-dimensions upscale-result-dim"></div>
                  </div>
                </div>
                <div class="upscale-options">
                  <label class="upscale-scale-option">
                    <input type="radio" name="upscale-scale" value="2x" checked>
                    <strong>2x</strong>
                    <small>放大至 2 倍</small>
                  </label>
                  <label class="upscale-scale-option">
                    <input type="radio" name="upscale-scale" value="4x">
                    <strong>4x</strong>
                    <small>放大至 4 倍</small>
                  </label>
                  <label class="upscale-scale-option">
                    <input type="radio" name="upscale-scale" value="custom">
                    <strong>自定义</strong>
                    <small>指定目标尺寸</small>
                  </label>
                  <div class="upscale-custom-size" hidden>
                    <label>宽
                      <input class="upscale-custom-width" type="number" min="1" max="8192">
                    </label>
                    <label>高
                      <input class="upscale-custom-height" type="number" min="1" max="8192">
                    </label>
                  </div>
                </div>
                <div class="upscale-progress" hidden>
                  <div class="upscale-progress-bar">
                    <div class="upscale-progress-fill"></div>
                  </div>
                  <span class="upscale-progress-text">准备中...</span>
                </div>
              </div>
            </div>
            <div class="prompt-compare-actions">
              <button class="prompt-compare-btn prompt-compare-btn-secondary close-btn" type="button">关闭</button>
              <button class="prompt-compare-btn prompt-compare-btn-secondary upscale-download-btn" type="button" disabled>下载结果</button>
              <button class="prompt-compare-btn prompt-compare-btn-secondary upscale-send-btn" type="button" disabled>发送到输出</button>
              <button class="prompt-compare-btn prompt-compare-btn-primary upscale-start-btn" type="button" disabled>开始超分</button>
            </div>
          </div>
        `;
        const managed = openManagedOverlay(overlay, {
          surface: overlay.querySelector('.upscale-tool-panel'),
          label: 'AI 超分'
        });
        const close = () => managed.close();
        const uploadZone = overlay.querySelector('.upscale-upload-zone');
        const fileInput = overlay.querySelector('.upscale-file-input');
        const workspace = overlay.querySelector('.upscale-workspace');
        const originalImg = overlay.querySelector('.upscale-original-img');
        const resultImg = overlay.querySelector('.upscale-result-img');
        const resultEmpty = overlay.querySelector('.upscale-preview-empty');
        const originalDim = overlay.querySelector('.upscale-original-dim');
        const resultDim = overlay.querySelector('.upscale-result-dim');
        const startBtn = overlay.querySelector('.upscale-start-btn');
        const downloadBtn = overlay.querySelector('.upscale-download-btn');
        const sendBtn = overlay.querySelector('.upscale-send-btn');
        const progressEl = overlay.querySelector('.upscale-progress');
        const progressText = overlay.querySelector('.upscale-progress-text');
        const progressFill = overlay.querySelector('.upscale-progress-fill');
        const customSizeRow = overlay.querySelector('.upscale-custom-size');
        const customWidthInput = overlay.querySelector('.upscale-custom-width');
        const customHeightInput = overlay.querySelector('.upscale-custom-height');
        try { window.lucide?.createIcons?.(); } catch {}

        let sourceDataUrl = null;
        let sourceDimensions = null;
        let resultDataUrl = null;
        let resultDimensions = null;
        let isProcessing = false;
        const MAX_FILE_SIZE = 10 * 1024 * 1024;

        overlay.querySelector('.prompt-compare-close')?.addEventListener('click', close);
        overlay.querySelector('.close-btn')?.addEventListener('click', close);

        function readFileAsDataURL(file) {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
          });
        }

        async function handleFile(file) {
          if (!file) return;
          if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
            flashStatus('不支持的图片格式，请上传 PNG / JPEG / WebP', 'danger');
            return;
          }
          if (file.size > MAX_FILE_SIZE) {
            flashStatus('图片过大（超过 10MB），请压缩后重试', 'danger');
            return;
          }
          try {
            const dataUrl = await readFileAsDataURL(file);
            const dimensions = await ImageRatio.measureImageSource(dataUrl);
            if (!dimensions || !dimensions.width) {
              flashStatus('图片读取失败，请更换图片重试', 'danger');
              return;
            }
            sourceDataUrl = dataUrl;
            sourceDimensions = dimensions;
            resultDataUrl = null;
            resultDimensions = null;
            uploadZone.hidden = true;
            workspace.hidden = false;
            originalImg.src = dataUrl;
            originalDim.textContent = `${dimensions.width} × ${dimensions.height} px`;
            resultImg.hidden = true;
            resultImg.src = '';
            if (resultEmpty) resultEmpty.hidden = false;
            resultDim.textContent = '';
            downloadBtn.disabled = true;
            sendBtn.disabled = true;
            startBtn.disabled = false;
            startBtn.textContent = '开始超分';
            customWidthInput.value = dimensions.width * 2;
            customHeightInput.value = dimensions.height * 2;
            flashStatus('图片已加载，选择倍率后点击"开始超分"', 'success');
          } catch (err) {
            flashStatus(err.message || '图片加载失败', 'danger');
          }
        }

        uploadZone?.addEventListener('click', () => fileInput?.click());
        uploadZone?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput?.click();
          }
        });
        uploadZone?.addEventListener('dragover', (e) => {
          e.preventDefault();
          uploadZone.classList.add('dragging');
        });
        uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('dragging'));
        uploadZone?.addEventListener('drop', (e) => {
          e.preventDefault();
          uploadZone.classList.remove('dragging');
          handleFile(e.dataTransfer?.files?.[0]);
        });
        fileInput?.addEventListener('change', () => {
          handleFile(fileInput.files?.[0]);
          fileInput.value = '';
        });

        overlay.querySelectorAll('input[name="upscale-scale"]').forEach(radio => {
          radio.addEventListener('change', () => {
            const isCustom = radio.value === 'custom';
            customSizeRow.hidden = !isCustom;
            if (isCustom && sourceDimensions) {
              customWidthInput.value = sourceDimensions.width * 2;
              customHeightInput.value = sourceDimensions.height * 2;
            }
          });
        });

        function getTargetDimensions() {
          if (!sourceDimensions) return null;
          const selected = overlay.querySelector('input[name="upscale-scale"]:checked')?.value || '2x';
          if (selected === '2x') {
            return { width: sourceDimensions.width * 2, height: sourceDimensions.height * 2 };
          } else if (selected === '4x') {
            return { width: sourceDimensions.width * 4, height: sourceDimensions.height * 4 };
          } else {
            let w = parseInt(customWidthInput.value, 10);
            let h = parseInt(customHeightInput.value, 10);
            if (!w || w < 1) w = sourceDimensions.width * 2;
            if (!h || h < 1) h = sourceDimensions.height * 2;
            w = Math.min(w, 8192);
            h = Math.min(h, 8192);
            return { width: w, height: h };
          }
        }

        startBtn?.addEventListener('click', async () => {
          if (!sourceDataUrl || isProcessing) return;
          const target = getTargetDimensions();
          if (!target) {
            flashStatus('请先上传图片', 'danger');
            return;
          }
          isProcessing = true;
          startBtn.disabled = true;
          downloadBtn.disabled = true;
          sendBtn.disabled = true;
          progressEl.hidden = false;
          progressFill.style.width = '0%';
          progressText.textContent = '准备中...';
          let progressPercent = 0;
          const progressTimer = setInterval(() => {
            progressPercent = Math.min(progressPercent + 5, 90);
            progressFill.style.width = progressPercent + '%';
          }, 500);
          try {
            const result = await ImageUpscaler.upscale(
              sourceDataUrl,
              target.width,
              target.height,
              { onProgress: (msg) => { progressText.textContent = msg; } }
            );
            clearInterval(progressTimer);
            progressFill.style.width = '100%';
            progressText.textContent = '超分完成！';
            if (result && result.dataUrl) {
              resultDataUrl = result.dataUrl;
              resultDimensions = { width: result.width, height: result.height };
              resultImg.src = result.dataUrl;
              resultImg.hidden = false;
              if (resultEmpty) resultEmpty.hidden = true;
              resultDim.textContent = `${result.width} × ${result.height} px（${result.method === 'ai' ? 'AI' : '高速缩放'}）`;
              downloadBtn.disabled = false;
              sendBtn.disabled = false;
              startBtn.disabled = false;
              startBtn.textContent = '重新超分';
              flashStatus(`超分完成：${result.width}×${result.height}（${result.method === 'ai' ? 'AI 模型' : '高速回退'}）`, 'success');
              setTimeout(() => { progressEl.hidden = true; }, 1500);
            } else {
              throw new Error('超分结果为空');
            }
          } catch (err) {
            clearInterval(progressTimer);
            progressEl.hidden = true;
            startBtn.disabled = false;
            const msg = err?.message || '超分失败';
            let userMsg = msg;
            if (/timeout/i.test(msg)) userMsg = '超分超时，图片可能过大，请尝试更小的倍率';
            else if (/WebGL/i.test(msg)) userMsg = '浏览器不支持 WebGL，已使用高速缩放替代';
            else if (/Script load/i.test(msg)) userMsg = 'AI 模型加载失败，请检查网络后重试';
            flashStatus(userMsg, 'danger');
          } finally {
            isProcessing = false;
          }
        });

        downloadBtn?.addEventListener('click', async () => {
          if (!resultDataUrl) return;
          try {
            await downloadImageSource(resultDataUrl, `upscale-${Date.now()}.png`);
            flashStatus('超分图片已下载', 'success');
          } catch (err) {
            flashStatus(err.message || '下载失败', 'danger');
          }
        });

        sendBtn?.addEventListener('click', async () => {
          if (!resultDataUrl) return;
          try {
            const base64 = resultDataUrl.includes(',') ? resultDataUrl.split(',')[1] : resultDataUrl;
            await appendResult({
              imageBase64: base64,
              mime: 'image/png',
              text: '',
              sourceWidth: resultDimensions?.width,
              sourceHeight: resultDimensions?.height,
              upscaled: true,
              upscaleMethod: 'manual'
            }, getCurrentGenerationParams({
              prompt: `AI 超分：${sourceDimensions?.width}×${sourceDimensions?.height} → ${resultDimensions?.width}×${resultDimensions?.height}`,
              model: 'local-upscaler',
              protocol: 'local-upscaler'
            }));
            flashStatus('超分结果已添加到输出面板', 'success');
          } catch (err) {
            flashStatus(err.message || '发送到输出失败', 'danger');
          }
        });
      }

      function showGifToolDialog() {
        const localSources = getGifSourceImages();
        let gridReferences = getInitialGifGridReferences();
        const overlay = document.createElement('div');
        overlay.className = 'prompt-compare-overlay gif-tool-overlay';
        const sourceItems = localSources.map((source, index) => `
          <label class="gif-source-item">
            <input type="checkbox" value="${index}" checked>
            <img src="${escapeHtml(source.src)}" alt="${escapeHtml(source.label)}">
            <span>${escapeHtml(source.label)}</span>
            <span class="gif-order-control">顺序 <input class="gif-order-input" type="number" min="1" max="${Math.max(1, localSources.length)}" value="${index + 1}"></span>
          </label>
        `).join('');
        overlay.innerHTML = `
          <div class="prompt-compare-panel gif-tool-panel">
            <div class="prompt-compare-header">
              <h3>动图生成</h3>
              <button class="prompt-compare-close" type="button">✕</button>
            </div>
            <div class="prompt-compare-content gif-tool-content">
              <div class="gif-tool-tabs" role="tablist" aria-label="动图生成模式">
                <button class="gif-tool-tab active" type="button" data-gif-tab="grid">网格生帧</button>
                <button class="gif-tool-tab" type="button" data-gif-tab="local">本地合成</button>
              </div>

              <div class="gif-tab-panel" data-gif-panel="grid">
                <div class="gif-grid-layout">
                  <div class="gif-grid-form">
                    <label class="gif-field">动画主题 / 动作
                      <textarea class="gif-grid-theme" rows="5" placeholder="例如：一只虎斑猫缓慢眨眼">${escapeHtml(promptInput?.value?.trim() || '')}</textarea>
                    </label>
                    <div class="gif-field-row">
                      <label class="gif-field">模型
                        <select class="gif-grid-model">
                          <option value="gpt-image-2" selected>gpt-image-2</option>
                        </select>
                      </label>
                      <label class="gif-field">每帧时长
                        <input class="gif-grid-delay" type="number" min="40" max="2000" step="20" value="120">
                      </label>
                    </div>
                    <label class="gif-loop-field gif-grid-loop">
                      <input class="gif-grid-loop-input" type="checkbox" checked>
                      循环播放
                    </label>
                    <div class="gif-ref-drop" tabindex="0">
                      <input class="gif-ref-file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden>
                      <strong>可选：拖放或点击添加参考图</strong>
                      <span>最多 6 张；默认已带入当前工作台参考图。</span>
                    </div>
                    <div class="gif-ref-list"></div>
                  </div>
                  <div class="gif-grid-preview-column">
                    <div class="gif-preview-title">网格底图</div>
                    <div class="gif-preview-box gif-grid-image-box">
                      <img class="gif-grid-img" alt="网格底图预览" hidden>
                      <div class="gif-preview-empty">生成后显示 3×4 网格底图。</div>
                    </div>
                    <div class="gif-preview-title">GIF 预览</div>
                    <div class="gif-preview-box">
                      <img class="gif-preview-img gif-grid-preview-img" alt="GIF 预览" hidden>
                      <div class="gif-preview-empty">生成完成后自动切片并合成 GIF。</div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="gif-tab-panel" data-gif-panel="local" hidden>
                <div class="prompt-compare-section">
                  <div class="prompt-compare-label">来源图片</div>
                  ${localSources.length ? `<div class="gif-source-grid">${sourceItems}</div>` : '<div class="gif-ref-empty">请先上传参考图，或先生成至少一张图片结果。</div>'}
                </div>
                <div class="gif-mode-grid">
                  <button class="gif-mode-card active" type="button" data-mode="auto">
                    <strong>自动生成</strong>
                    <small>使用默认尺寸、节奏和循环设置快速合成</small>
                  </button>
                  <button class="gif-mode-card" type="button" data-mode="custom">
                    <strong>微调生成</strong>
                    <small>调整尺寸、每帧时长、循环和单图帧数</small>
                  </button>
                </div>
                <div class="gif-custom-panel" hidden>
                  <label>输出尺寸
                    <select class="gif-size-select">
                      <option value="512" selected>512 x 512</option>
                      <option value="768">768 x 768</option>
                      <option value="1024">1024 x 1024</option>
                    </select>
                  </label>
                  <label>每帧时长
                    <input class="gif-delay-input" type="number" min="40" max="2000" step="20" value="120">
                  </label>
                  <label>单图动画帧数
                    <input class="gif-frame-count-input" type="number" min="6" max="24" value="12">
                  </label>
                  <label class="gif-loop-field">
                    <input class="gif-loop-input" type="checkbox" checked>
                    循环播放
                  </label>
                </div>
                <div class="gif-preview-box">
                  <img class="gif-preview-img gif-local-preview-img" alt="GIF 预览" hidden>
                  <div class="gif-preview-empty">选择图片后点击生成，结果会添加到当前输出和历史记录。</div>
                </div>
              </div>
            </div>
            <div class="prompt-compare-actions">
              <button class="prompt-compare-btn prompt-compare-btn-secondary close-btn" type="button">关闭</button>
              <button class="prompt-compare-btn prompt-compare-btn-secondary gif-reference-slice-btn" type="button">参考图生成</button>
              <button class="prompt-compare-btn prompt-compare-btn-primary gif-generate-btn" type="button">生成网格图</button>
            </div>
          </div>
        `;
        const managed = openManagedOverlay(overlay, {
          surface: overlay.querySelector('.gif-tool-panel'),
          label: '动图生成'
        });
        const close = () => managed.close();
        const customPanel = overlay.querySelector('.gif-custom-panel');
        const generateBtn = overlay.querySelector('.gif-generate-btn');
        const referenceSliceBtn = overlay.querySelector('.gif-reference-slice-btn');
        const localPreviewImg = overlay.querySelector('.gif-local-preview-img');
        const gridPreviewImg = overlay.querySelector('.gif-grid-preview-img');
        const gridImageEl = overlay.querySelector('.gif-grid-img');
        const refListEl = overlay.querySelector('.gif-ref-list');
        const refFileInput = overlay.querySelector('.gif-ref-file-input');
        let localMode = 'auto';
        let activeGifTab = 'grid';

        overlay.querySelector('.prompt-compare-close')?.addEventListener('click', close);
        overlay.querySelector('.close-btn')?.addEventListener('click', close);
        renderGifReferenceList(refListEl, gridReferences);

        const setActiveGifTab = (tab) => {
          activeGifTab = tab === 'local' ? 'local' : 'grid';
          overlay.querySelectorAll('.gif-tool-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.gifTab === activeGifTab));
          overlay.querySelectorAll('.gif-tab-panel').forEach(panel => {
            panel.hidden = panel.dataset.gifPanel !== activeGifTab;
          });
          generateBtn.textContent = activeGifTab === 'grid'
            ? '生成网格图'
            : (localMode === 'custom' ? '微调生成' : '自动生成');
          if (referenceSliceBtn) referenceSliceBtn.hidden = activeGifTab !== 'grid';
        };

        overlay.querySelectorAll('.gif-tool-tab').forEach(btn => {
          btn.addEventListener('click', () => setActiveGifTab(btn.dataset.gifTab));
        });

        overlay.querySelectorAll('.gif-mode-card').forEach(card => {
          card.addEventListener('click', () => {
            localMode = card.dataset.mode || 'auto';
            overlay.querySelectorAll('.gif-mode-card').forEach(item => item.classList.toggle('active', item === card));
            customPanel.hidden = localMode !== 'custom';
            if (activeGifTab === 'local') {
              generateBtn.textContent = localMode === 'custom' ? '微调生成' : '自动生成';
            }
          });
        });

        const handleRefFiles = async (files) => {
          try {
            gridReferences = await readGifReferenceFiles(files, gridReferences);
            renderGifReferenceList(refListEl, gridReferences);
            flashStatus(`动图参考图 ${gridReferences.length}/6`, 'success');
          } catch (error) {
            console.error('动图参考图处理失败:', error);
            flashStatus(error.message || '动图参考图处理失败', 'danger');
          }
        };

        const refDrop = overlay.querySelector('.gif-ref-drop');
        refDrop?.addEventListener('click', () => refFileInput?.click());
        refDrop?.addEventListener('dragover', (event) => {
          event.preventDefault();
          refDrop.classList.add('dragging');
        });
        refDrop?.addEventListener('dragleave', () => refDrop.classList.remove('dragging'));
        refDrop?.addEventListener('drop', (event) => {
          event.preventDefault();
          refDrop.classList.remove('dragging');
          handleRefFiles(event.dataTransfer?.files);
        });
        refFileInput?.addEventListener('change', () => {
          handleRefFiles(refFileInput.files);
          refFileInput.value = '';
        });

        async function generateLocalGif() {
          const selected = [...overlay.querySelectorAll('[data-gif-panel="local"] .gif-source-item input:checked')]
            .map(input => {
              const item = input.closest('.gif-source-item');
              const sourceIndex = parseInt(input.value, 10);
              const order = parseInt(item?.querySelector('.gif-order-input')?.value, 10) || sourceIndex + 1;
              return { ...localSources[sourceIndex], order };
            })
            .sort((a, b) => a.order - b.order)
            .filter(Boolean);
          if (!selected.length) {
            flashStatus('请至少选择一张图片用于动图生成', 'danger');
            return false;
          }
          const startedAt = performance.now();
          const size = localMode === 'custom' ? overlay.querySelector('.gif-size-select')?.value : 512;
          const delayMs = localMode === 'custom' ? overlay.querySelector('.gif-delay-input')?.value : 120;
          const singleFrameCount = localMode === 'custom' ? overlay.querySelector('.gif-frame-count-input')?.value : 12;
          const loop = localMode === 'custom' ? !!overlay.querySelector('.gif-loop-input')?.checked : true;
          const gifDataUrl = await buildGifDataUrl(selected, { width: size, height: size, delayMs, singleFrameCount, loop });
          const empty = localPreviewImg?.parentElement?.querySelector('.gif-preview-empty');
          localPreviewImg.src = gifDataUrl;
          localPreviewImg.hidden = false;
          if (empty) empty.hidden = true;
          await appendResult({
            mediaType: 'gif',
            imageBase64: gifDataUrl,
            mime: 'image/gif',
            text: ''
          }, getCurrentGenerationParams({
            prompt: `动图生成：${selected.map(item => item.label).join('、')}`,
            model: 'local-gif',
            protocol: 'local-gif',
            runtimeMs: performance.now() - startedAt
          }));
          return true;
        }

        async function generateGridGif() {
          const theme = overlay.querySelector('.gif-grid-theme')?.value.trim();
          if (!theme) {
            flashStatus('请先填写动画主题 / 动作', 'danger');
            overlay.querySelector('.gif-grid-theme')?.focus();
            return false;
          }
          const startedAt = performance.now();
          const model = overlay.querySelector('.gif-grid-model')?.value || 'gpt-image-2';
          const delayMs = overlay.querySelector('.gif-grid-delay')?.value || 120;
          const loop = !!overlay.querySelector('.gif-grid-loop-input')?.checked;
          flashStatus('正在生成 3×4 网格底图...', '');
          const gridResult = await callGifGridImageAPI(theme, gridReferences, model);
          const gridSrc = getResultImgSrc(gridResult);
          gridImageEl.src = gridSrc;
          gridImageEl.hidden = false;
          const gridEmpty = gridImageEl.parentElement?.querySelector('.gif-preview-empty');
          if (gridEmpty) gridEmpty.hidden = true;

          flashStatus('网格底图已生成，正在切片合成 GIF...', '');
          const frames = await sliceGifGridFrames(gridSrc, { frameSize: 816 });
          const gifDataUrl = await buildGifDataUrl(frames, { width: 816, height: 816, delayMs, loop });
          gridPreviewImg.src = gifDataUrl;
          gridPreviewImg.hidden = false;
          const gifEmpty = gridPreviewImg.parentElement?.querySelector('.gif-preview-empty');
          if (gifEmpty) gifEmpty.hidden = true;
          await appendResult({
            mediaType: 'gif',
            imageBase64: gifDataUrl,
            mime: 'image/gif',
            text: ''
          }, getCurrentGenerationParams({
            prompt: `网格生帧：${theme}`,
            model,
            protocol: 'gif-grid',
            runtimeMs: performance.now() - startedAt
          }));
          return true;
        }

        async function generateGifFromReferenceGrid() {
          const referenceGrid = gridReferences.find(ref => ref?.dataUrl);
          if (!referenceGrid) {
            flashStatus('请先添加一张 3×4 网格参考图', 'danger');
            return false;
          }
          const startedAt = performance.now();
          const theme = overlay.querySelector('.gif-grid-theme')?.value.trim();
          const delayMs = overlay.querySelector('.gif-grid-delay')?.value || 120;
          const loop = !!overlay.querySelector('.gif-grid-loop-input')?.checked;
          gridImageEl.src = referenceGrid.dataUrl;
          gridImageEl.hidden = false;
          const gridEmpty = gridImageEl.parentElement?.querySelector('.gif-preview-empty');
          if (gridEmpty) gridEmpty.hidden = true;
          flashStatus('正在切片参考图并合成 GIF...', '');

          const frames = await sliceGifGridFrames(referenceGrid.dataUrl, { frameSize: 816 });
          const gifDataUrl = await buildGifDataUrl(frames, { width: 816, height: 816, delayMs, loop });
          gridPreviewImg.src = gifDataUrl;
          gridPreviewImg.hidden = false;
          const gifEmpty = gridPreviewImg.parentElement?.querySelector('.gif-preview-empty');
          if (gifEmpty) gifEmpty.hidden = true;
          await appendResult({
            mediaType: 'gif',
            imageBase64: gifDataUrl,
            mime: 'image/gif',
            text: ''
          }, getCurrentGenerationParams({
            prompt: `参考图切片合成：${theme || referenceGrid.name || '3×4 网格图'}`,
            model: 'reference-grid',
            protocol: 'gif-grid',
            runtimeMs: performance.now() - startedAt
          }));
          return true;
        }

        referenceSliceBtn?.addEventListener('click', async () => {
          const originalText = referenceSliceBtn.textContent;
          referenceSliceBtn.disabled = true;
          generateBtn.disabled = true;
          referenceSliceBtn.textContent = '切片中...';
          try {
            const ok = await generateGifFromReferenceGrid();
            if (ok) flashStatus('已使用参考图切片合成 GIF', 'success');
          } catch (error) {
            console.error('参考图切片合成 GIF 失败:', error);
            flashStatus(error.message || '参考图切片合成 GIF 失败', 'danger');
          } finally {
            referenceSliceBtn.disabled = false;
            generateBtn.disabled = false;
            referenceSliceBtn.textContent = originalText;
          }
        });

        generateBtn?.addEventListener('click', async () => {
          const originalText = generateBtn.textContent;
          generateBtn.disabled = true;
          generateBtn.textContent = activeGifTab === 'grid' ? '生成中...' : '合成中...';

          try {
            const ok = activeGifTab === 'grid'
              ? await generateGridGif()
              : await generateLocalGif();
            if (ok) flashStatus('GIF 已生成并添加到当前输出', 'success');
          } catch (error) {
            console.error('GIF 生成失败:', error);
            flashStatus(error.message || 'GIF 生成失败', 'danger');
          } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = originalText;
          }
        });
      }

      function showReversePromptDialog() {
        const image = state.images.find(img => img?.dataUrl);
        if (!image) {
          flashStatus('请先上传参考图', 'danger');
          fileInput?.focus();
          return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'prompt-compare-overlay';
        overlay.innerHTML = `
          <div class="prompt-compare-panel">
            <div class="prompt-compare-header">
              <h3>🔎 反推提示词</h3>
              <button class="prompt-compare-close" type="button">✕</button>
            </div>
            <div class="prompt-compare-content">
              <div class="prompt-compare-section">
                <div class="prompt-compare-label">参考图</div>
                <img src="${escapeHtml(image.dataUrl)}" alt="参考图" style="max-width: 100%; max-height: 220px; border-radius: 8px; border: 1px solid var(--border); object-fit: contain; background: var(--panel);" />
              </div>
              <div class="prompt-compare-section">
                <div class="prompt-compare-label">反推结果</div>
                <textarea class="prompt-compare-text" rows="7" id="reverse-prompt-textarea" placeholder="点击「开始反推」后生成提示词" readonly style="background: var(--panel);"></textarea>
              </div>
            </div>
            <div class="prompt-compare-actions">
              <button class="prompt-compare-btn prompt-compare-btn-secondary close-btn" type="button">关闭</button>
              <button class="prompt-compare-btn prompt-compare-btn-primary start-reverse-btn" type="button">开始反推</button>
              <button class="prompt-compare-btn prompt-compare-btn-secondary copy-reverse-btn" type="button" disabled>复制结果</button>
              <button class="prompt-compare-btn prompt-compare-btn-secondary save-reverse-btn" type="button" disabled>保存到提示词库</button>
              <button class="prompt-compare-btn prompt-compare-btn-primary use-reverse-btn" type="button" disabled>使用到提示词输入框</button>
            </div>
          </div>
        `;
        const managed = openManagedOverlay(overlay, {
          surface: overlay.querySelector('.prompt-compare-panel'),
          label: '反推提示词'
        });
        const close = () => managed.close();
        const textarea = overlay.querySelector('#reverse-prompt-textarea');
        const useBtn = overlay.querySelector('.use-reverse-btn');
        const saveBtn = overlay.querySelector('.save-reverse-btn');
        const copyBtn = overlay.querySelector('.copy-reverse-btn');
        const startBtn = overlay.querySelector('.start-reverse-btn');
        overlay.querySelector('.prompt-compare-close')?.addEventListener('click', close);
        overlay.querySelector('.close-btn')?.addEventListener('click', close);

        copyBtn?.addEventListener('click', async () => {
          const value = textarea.value.trim();
          if (!value) return;
          try {
            await copyTextToClipboard(value);
            flashStatus('已复制反推结果', 'success');
          } catch (error) {
            textarea.focus();
            textarea.select();
            flashStatus(error.message || '复制失败，请手动复制', 'danger');
          }
        });

        startBtn?.addEventListener('click', async () => {
          if (startBtn.disabled) return;
          startBtn.disabled = true;
          startBtn.textContent = '反推中...';
          textarea.value = '';
          textarea.readOnly = true;
          textarea.placeholder = '正在反推提示词...';
          useBtn.disabled = true;
          saveBtn.disabled = true;
          copyBtn.disabled = true;

          try {
            const reverseImage = await compressImageForReversePrompt(image);
            const result = await reversePromptFromImage(reverseImage);
            textarea.value = result;
            textarea.readOnly = false;
            textarea.style.background = 'var(--card)';
            useBtn.disabled = !result;
            saveBtn.disabled = !result;
            copyBtn.disabled = !result;
            startBtn.disabled = false;
            startBtn.textContent = '重新反推';
            flashStatus('反推完成', 'success');
          } catch (error) {
            console.error('反推提示词失败:', error);
            textarea.value = `反推失败：${error.message || error}`;
            textarea.readOnly = false;
            textarea.style.background = 'var(--card)';
            copyBtn.disabled = false;
            startBtn.disabled = false;
            startBtn.textContent = '重新反推';
            flashStatus('反推提示词失败，请检查文本模型接口配置', 'danger');
          }
        });

        useBtn?.addEventListener('click', () => {
          const value = textarea.value.trim();
          if (!value) return;
          promptInput.value = value;
          promptInput.focus();
          flashStatus('已使用反推提示词', 'success');
          close();
        });

        saveBtn?.addEventListener('click', () => {
          const value = textarea.value.trim();
          if (value) openPromptSaveEditor(value, { context: 'reverse-prompt' });
        });

        textarea.value = '';
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

        const closeBtn = overlay.querySelector('.close-btn');
        const closeIconBtn = overlay.querySelector('.prompt-compare-close');
        const optimizeNowBtn = overlay.querySelector('#optimize-now-btn');
        const originalTextarea = overlay.querySelector('#original-textarea');
        const optimizedTextarea = overlay.querySelector('#optimized-textarea');
        const useOptimizedBtn = overlay.querySelector('.use-optimized-btn');
        const englishTranslationSection = overlay.querySelector('#english-translation-section');
        let isDialogClosed = false;
        const managed = openManagedOverlay(overlay, {
          surface: overlay.querySelector('.prompt-compare-panel'),
          label: '提示词优化',
          onClose: () => { isDialogClosed = true; }
        });

        function closeDialog() {
          if (isDialogClosed) return;
          isDialogClosed = true;
          managed.close();
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

      }

      // 显示分镜输入框
      function showStoryboardInput() {
        const overlay = document.createElement('div');
        overlay.className = 'storyboard-overlay';
        overlay.innerHTML = `
          <div class="storyboard-panel">
            <div class="storyboard-header">
              <h3>🎬 分镜脚本输入</h3>
              <button class="storyboard-close" type="button" aria-label="Close storyboard input" title="Close">✕</button>
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

        const managed = openManagedOverlay(overlay, {
          surface: overlay.querySelector('.storyboard-panel'),
          label: '分镜脚本输入'
        });
        const closeDialog = () => managed.close();

        const textarea = overlay.querySelector('.storyboard-textarea');
        const closeBtn = overlay.querySelectorAll('.close-btn, .storyboard-close');
        const analyzeBtn = overlay.querySelector('.analyze-btn');

        // 关闭弹窗
        closeBtn.forEach(btn => {
          btn.addEventListener('click', closeDialog);
        });

        // 点击遮罩层关闭
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeDialog();
        });

        // 识别分镜
        analyzeBtn.addEventListener('click', async () => {
          const scriptText = textarea.value.trim();
          if (!scriptText) {
            showUiError('请输入分镜脚本');
            return;
          }

          // 显示加载状态
          analyzeBtn.disabled = true;
          analyzeBtn.textContent = '识别中...';

          try {
            const result = await analyzeStoryboard(scriptText);
            closeDialog();
            showStoryboardPreview(result, scriptText);
          } catch (error) {
            showUiError('识别失败：' + error.message);
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
          showUiError('未识别到分镜，请检查脚本格式');
          return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'storyboard-overlay';

        let shotsHtml = '';
        shots.forEach(shot => {
          shotsHtml += `
            <div class="storyboard-shot-item">
              <span class="storyboard-shot-number">分镜${escapeHtml(shot.index)}：</span>
              <textarea class="storyboard-shot-desc" data-index="${escapeHtml(shot.index)}" rows="2">${escapeHtml(shot.description || '')}</textarea>
            </div>
          `;
        });

        overlay.innerHTML = `
          <div class="storyboard-panel">
            <div class="storyboard-header">
              <h3>🎬 分镜识别结果</h3>
              <button class="storyboard-close" type="button" aria-label="Close storyboard result" title="Close">✕</button>
            </div>
            <div class="storyboard-content">
              ${globalRequirements ? `
                <div class="storyboard-preview-section">
                  <div class="storyboard-section-title">全局要求：</div>
                  <textarea class="storyboard-global-req" rows="2">${escapeHtml(globalRequirements)}</textarea>
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

        const managed = openManagedOverlay(overlay, {
          surface: overlay.querySelector('.storyboard-panel'),
          label: '分镜识别结果'
        });
        const closeDialog = () => managed.close();

        const closeBtn = overlay.querySelector('.storyboard-close');
        const retryBtn = overlay.querySelector('.retry-btn');
        const generateBtn = overlay.querySelector('.generate-btn');

        closeBtn.addEventListener('click', closeDialog);
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeDialog();
        });

        retryBtn.addEventListener('click', () => {
          closeDialog();
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
            showUiError('请至少保留一个分镜描述');
            return;
          }

          // 使用更新后的数据
          const updatedResult = {
            globalRequirements: updatedGlobalRequirements,
            shots: updatedShots
          };

          closeDialog();
          generateStoryboardImages(updatedResult);
        });
      }

      // 生成单个分镜图片
      // 通用的生图API调用（分镜、多角度等都用这个）
      async function callImageAPI(prompt, images, signal) {
        const key = getApiKey();
        if (!key) throw new Error('请先配置 API Key');

        const protocol = getImageProtocol();
        const imageModel = getImageModel();
        let imgs = getReferenceImagesForRequest((images || []).filter(img => img.dataUrl), protocol);
        if (typeof ImageRatio.compressReferenceImages === 'function') {
          imgs = await ImageRatio.compressReferenceImages(imgs);
        }
        let response;

        if (protocol === 'openai-images') {
          if (activePlatformId === 'gemini') {
            const request = buildGeminiOpenAIImagesRequest(prompt, imgs, imageModel, key);
            debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
            response = await sendImageRequest(request, 'gemini-openai-images', signal);
          } else if (imgs.length > 0) {
            const editsRequest = await buildOpenAIImageEditsRequest(prompt, imgs, imageModel, key);
            debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', editsRequest.endpoint, 'hasImages:', true);
            response = await sendImageRequest(editsRequest, 'openai-images-edits', signal);

            if (!response.ok) {
              const errorText = extractApiErrorMessage(response.data) || response.raw || `API 错误: ${response.status}`;
              console.error('[callImageAPI] error response:', response.raw);

              if (shouldRetryOpenAIImageWithRelay(response.status, errorText)) {
                const relayRequest = buildOpenAIImageRelayGenerationsRequest(prompt, imgs, imageModel, key);
                debugLog('[callImageAPI] retrying with relay generations endpoint');
                response = await sendImageRequest(relayRequest, 'openai-images-relay-generations', signal);
              } else {
                throw new Error(formatImageModelCompatibilityError(errorText, imageModel) || errorText || `API 错误: ${response.status}`);
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
            response = await sendImageRequest(request, 'openai-images-generations', signal);
          }
        } else if (protocol === 'aliyun-images') {
          const request = buildAliyunImageRequest(prompt, imgs, imageModel, key);
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          response = await sendImageRequest(request, 'aliyun-images', signal);
        } else if (protocol === 'doubao-images') {
          const request = buildDoubaoImageRequest(prompt, imgs, imageModel, key);
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          response = await sendImageRequest(request, 'doubao-images', signal);
        } else if (protocol === 'replicate-flux') {
          const request = buildReplicateFluxRequest(prompt, imgs, imageModel, key);
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          response = await sendImageRequest(request, 'replicate-flux-create', signal);
          response = await pollReplicateFluxPrediction(response, key);
        } else if (protocol === 'open-images') {
          const activePlatform = getActivePlatformConfig().id;
          const request = (activePlatform === 'qwen' || activePlatform === 'doubao' || activePlatform === 'flux')
            ? buildOpenImagesGenerationsRequest(prompt, imgs, imageModel, key)
            : buildGrokImageRequest(prompt, imgs, imageModel, key);
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          const label = (activePlatform === 'qwen' || activePlatform === 'doubao' || activePlatform === 'flux')
            ? 'open-images-generations'
            : (imgs.length > 0 ? 'open-images-edits' : 'open-images-generations');
          response = await sendImageRequest(request, label, signal);
        } else if (protocol === 'openai-chat') {
          const payload = buildOpenAIChatImagePayload(prompt, imgs, imageModel);
          const request = {
            endpoint: resolveImageEndpoint(),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(payload)
          };
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          response = await sendImageRequest(request, protocol, signal);
        } else if (protocol === 'openai-responses') {
          const payload = buildOpenAIResponsesImagePayload(prompt, imgs, imageModel);
          const request = {
            endpoint: resolveImageEndpoint(),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(payload)
          };
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          response = await sendImageRequest(request, 'openai-responses', signal);
        } else {
          // Gemini 原生
          const payload = buildGeminiImagePayload(prompt, imgs);
          const request = {
            endpoint: resolveImageEndpoint(),
            headers: buildRequestHeaders(key, protocol),
            body: JSON.stringify(payload)
          };
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          response = await sendImageRequest(request, 'gemini', signal);
        }

        if (!response.ok) {
          const errorText = extractApiErrorMessage(response.data) || response.raw || `API 错误: ${response.status}`;
          console.error('[callImageAPI] error response:', response.raw);
          throw new Error(formatImageModelCompatibilityError(errorText, imageModel) || errorText || `API 错误: ${response.status}`);
        }

        const apiErrorMessage = extractApiErrorMessage(response.data);
        if (apiErrorMessage) {
          console.error('[callImageAPI] error payload:', response.data);
          throw new Error(apiErrorMessage);
        }

        const result = await annotateImageResultDimensions(extractResult(response.data), aspectSelect?.value || 'auto');
        debugLog('[callImageAPI] extractResult:', { text: result.text?.slice(0,200), imageBase64: !!result.imageBase64, imageUrl: result.imageUrl });
        if (!result.imageBase64 && !result.imageUrl && !result.text) {
          throw new Error('接口未返回可用图片');
        }

        // === 自动超分 ===
        if (isAutoUpscaleEnabled() && hasResultImage(result) && window.ImageUpscaler) {
          try {
            const detection = ImageUpscaler.detectUpscaleNeed(result, resolutionSelect?.value, aspectSelect?.value);
            if (detection.needed) {
              flashStatus('正在AI超分放大...', '');
              const src = result.imageBase64
                ? (String(result.imageBase64).startsWith('data:') ? result.imageBase64 : `data:${result.mime || 'image/png'};base64,${result.imageBase64}`)
                : result.imageUrl;
              const persistentSrc = src.startsWith('data:') ? src : await getPersistentImageSource(src);
              const upscaled = await ImageUpscaler.upscale(persistentSrc, detection.targetWidth, detection.targetHeight, {
                onProgress: (msg) => flashStatus(msg, '')
              });
              if (upscaled.dataUrl && !upscaled.error) {
                result.imageBase64 = upscaled.dataUrl.split(',')[1] || upscaled.dataUrl;
                result.imageUrl = '';
                result.sourceWidth = upscaled.width;
                result.sourceHeight = upscaled.height;
                result.upscaled = true;
                result.upscaleMethod = upscaled.method;
                flashStatus(`超分完成：${upscaled.width}×${upscaled.height}（${upscaled.method === 'ai' ? 'AI' : '高速'}）`, 'success');
              }
            }
          } catch (e) {
            console.warn('[upscale] 超分失败，使用原图:', e);
            flashStatus('超分失败，已使用原图', 'danger');
          }
        }
        // === 自动超分结束 ===

        return result;
      }

      async function generateStoryboardShot(prompt) {
        return callImageAPI(prompt, getReferenceImagesForRequest());
      }

      async function callVideoAPI(prompt, images, signal) {
        if (activePlatformId !== 'openaiVideo' && activePlatformId !== 'geminiVideo' && activePlatformId !== 'qwenVideo' && activePlatformId !== 'doubaoVideo' && activePlatformId !== 'grokVideo') {
          throw new Error('当前视频平台暂未接入');
        }
        if (activePlatformId === 'geminiVideo' && isGoogleNativeGeminiPlatform('geminiVideo')) {
          throw new Error('Google 官方地址不支持当前 Veo 兼容协议，请切换到 Veo 兼容中转 Base URL。');
        }
        const key = getApiKey();
        if (!key) throw new Error('请先配置 API Key');

        const protocol = getProtocol();
        const videoModel = getImageModel();
        let imgs = getReferenceImagesForRequest((images || []).filter(img => img.dataUrl), protocol);
        if (typeof ImageRatio.compressReferenceImages === 'function') {
          imgs = await ImageRatio.compressReferenceImages(imgs);
        }
        let request;
        if (protocol === 'openai-video-chat') {
          request = buildOpenAIVideoChatRequest(prompt, imgs, videoModel, key);
        } else if (protocol === 'veo-generations') {
          request = buildVeoGenerationsRequest(prompt, imgs, videoModel, key);
        } else if (protocol === 'veo-create') {
          request = buildVeoCreateRequest(prompt, imgs, videoModel, key);
        } else if (protocol === 'aliyun-happyhorse') {
          request = buildHappyHorseVideoRequest(prompt, imgs, videoModel, key);
        } else if (protocol === 'doubao-seedance') {
          request = buildDoubaoSeedanceRequest(prompt, imgs, videoModel, key);
        } else if (protocol === 'grok-video-create') {
          request = buildGrokVideoCreateRequest(prompt, imgs, videoModel, key);
        } else {
          request = await buildOpenAIVideosRequest(prompt, imgs, videoModel, key);
        }

        let response = await sendVideoRequest(request, protocol, signal);
        if (!response.ok) {
          const errorText = extractApiErrorMessage(response.data) || response.raw || `API 错误: ${response.status}`;
          throw new Error(errorText || `API 错误: ${response.status}`);
        }

        response = await pollVideoTask(response, key, protocol, signal);
        if (!response.ok) {
          const errorText = extractApiErrorMessage(response.data) || response.raw || `API 错误: ${response.status}`;
          throw new Error(errorText || `API 错误: ${response.status}`);
        }

        const apiErrorMessage = extractApiErrorMessage(response.data);
        if (apiErrorMessage) {
          throw new Error(apiErrorMessage);
        }

        const result = extractVideoResult(response.data);
        debugLog('[callVideoAPI] extractVideoResult:', { videoUrl: result.videoUrl, videoId: result.videoId });
        if (!result.videoUrl && !result.videoSrc) {
          throw new Error('接口未返回可用视频');
        }
        return result;
      }

      // 批量生成分镜图片
      async function generateStoryboardImages(analysisResult) {
        const { globalRequirements, shots } = analysisResult;
        const savePreflightResult = await preflightSaveFolderPermission();

        // 创建任务信息
        const taskId = ++taskIdCounter;
        const taskInfo = {
          taskId,
          savePreflightResult,
          scenario: {
            id: 'storyboard',
            label: '🎬 分镜生成',
            angles: shots.map(s => `分镜${s.index}`)
          }
        };

        // 创建分组容器
        const groupContainer = createResultGroup(taskInfo);
        resultsEl.insertBefore(groupContainer, resultsEl.firstChild);
        syncResultsEmptyState();

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
            // 逐条错开，避免所有分镜在 500ms 后同时打到接口
            await new Promise(r => setTimeout(r, 500 * index));
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
              await appendResultToGroup(groupContainer, result, `分镜${shot.index}`, actualElapsedMs, finalPrompt, savePreflightResult);
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
        card.className = 'card result-card';
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
            <div class="loading-status" style="font-size: 12px; margin-top: 4px; color: var(--accent);">正在请求...</div>
            <div class="card-timer" style="font-size: 12px; margin-top: 2px; color: var(--muted);">0.0s</div>
            <div class="loading-status" style="font-size: 11px; margin-top: 6px; color: var(--warning);"></div>
            <div class="loading-status" style="font-size: 11px; margin-top: 6px; color: var(--warning); min-height: 16px;"></div>
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

      function buildResultCard(result, meta = {}) {
        const card = document.createElement('div');
        card.className = 'card result-card';
        if (hasResultVideo(result)) {
          return buildVideoResultCard(result, meta, card);
        }
        if (!hasResultImage(result)) return card;

        const imgSrc = getResultImgSrc(result);
        const continueSource = buildContinueSourceState(imgSrc);
        const imageDisplaySrc = getResultImageDisplaySrc(imgSrc);
        const imageActionSrc = getResultImageActionSrc(imgSrc);
        const filename = meta.filename || `gemini-${Date.now()}.${getExtensionFromMime(result.mime)}`;
        card._continueSource = continueSource;

        const imageButton = document.createElement('button');
        imageButton.className = 'result-thumb-btn';
        imageButton.type = 'button';
        imageButton.title = '点击查看原图';
        imageButton.setAttribute('aria-label', '查看原图');

        const imgEl = document.createElement('img');
        imgEl.src = imageDisplaySrc;
        imgEl.className = 'zoomable';
        if (imageDisplaySrc !== RESULT_MEDIA_PLACEHOLDER) bindResultImageFallback(imgEl, imgSrc);
        imgEl.alt = meta.label || '生成结果';
        imageButton.appendChild(imgEl);
        imageButton.addEventListener('click', () => openLightbox(
          imgEl.currentSrc && imgEl.currentSrc !== RESULT_MEDIA_PLACEHOLDER ? imgEl.currentSrc : imageActionSrc
        ));
        card.appendChild(imageButton);

        if (result.upscaled) {
          const badge = document.createElement('span');
          badge.className = 'upscale-badge';
          badge.textContent = result.upscaleMethod === 'ai' ? 'AI超分' : '已超分';
          badge.title = `已从原分辨率超分放大至 ${result.sourceWidth}×${result.sourceHeight}`;
          imageButton.appendChild(badge);
        }

        const actions = document.createElement('div');
        actions.className = 'actions result-card-actions';

        if (meta.label) {
          const labelEl = document.createElement('span');
          labelEl.className = 'time-label';
          labelEl.textContent = meta.label;
          actions.appendChild(labelEl);
        }

        const downloadLink = document.createElement('a');
        downloadLink.className = 'mini-btn';
        downloadLink.textContent = '下载';
        downloadLink.href = imageActionSrc;
        downloadLink.download = filename;
        actions.appendChild(downloadLink);

        const saveAlbumBtn = document.createElement('button');
        saveAlbumBtn.className = 'mini-btn primary';
        saveAlbumBtn.type = 'button';
        saveAlbumBtn.textContent = isMobileDevice() ? '保存相册' : '保存';
        saveAlbumBtn.addEventListener('click', () => handleSaveToAlbum(imageActionSrc, filename));
        actions.appendChild(saveAlbumBtn);

        const continueBtn = document.createElement('button');
        continueBtn.className = 'mini-btn primary continue-result-btn';
        continueBtn.type = 'button';
        continueBtn.textContent = '续图';
        applyContinueSourceAvailability(continueBtn, continueSource);
        actions.appendChild(continueBtn);

        const canvasBtn = document.createElement('button');
        canvasBtn.className = 'mini-btn canvas-transfer-btn';
        canvasBtn.type = 'button';
        canvasBtn.setAttribute('data-canvas-transfer', 'result-card');
        if (CANVAS_FEATURE_ENABLED) {
          canvasBtn.textContent = '进画布';
        } else {
          canvasBtn.textContent = '进画布（开发中）';
          canvasBtn.title = CANVAS_DEV_NOTICE;
        }
        canvasBtn.addEventListener('click', () => sendImagesToCanvas([{
          kind: 'image',
          origin: 'result-output',
          src: imageActionSrc,
          label: meta.label || filename
        }]));
        actions.appendChild(canvasBtn);
        card._continueBtn = continueBtn;
        card._resultImgEl = imgEl;
        card._downloadLink = downloadLink;

        if (meta.retryPrompt) {
          const retryBtn = document.createElement('button');
          retryBtn.className = 'mini-btn retry-result-btn';
          retryBtn.type = 'button';
          retryBtn.textContent = '重试';
          retryBtn.title = '使用相同参数重新生成此分镜';
          actions.appendChild(retryBtn);
          meta.bindRetry?.({ retryBtn, imgEl, downloadLink, continueSource, continueBtn });
        }

        card.appendChild(actions);

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

        continueBtn.addEventListener('click', async () => {
          if (continueBtn.disabled) {
            flashStatus('该图片没有可用图源，请先下载后再上传为参考图', 'danger');
            return;
          }

          if (!continueSource.cachedSrc) {
            const originalText = continueBtn.textContent;
            continueBtn.disabled = true;
            continueBtn.textContent = '准备中';
            const preparedSrc = await warmContinueImageSource(continueSource);
            continueBtn.disabled = false;
            continueBtn.textContent = originalText;
            applyContinueSourceAvailability(continueBtn, continueSource);

            if (!preparedSrc) {
              flashStatus('当前图片无法直接复用为续图参考，请先下载后再上传到参考图', 'danger');
              return;
            }
          }

          continuePanel.classList.toggle('show');
          if (continuePanel.classList.contains('show')) {
            continuePanel.querySelector('textarea').focus();
          }
        });

        continuePanel.querySelector('.cancel-btn').addEventListener('click', () => {
          continuePanel.classList.remove('show');
        });

        continuePanel.querySelector('.gen-btn').addEventListener('click', async () => {
          const newPrompt = continuePanel.querySelector('textarea').value.trim();
          if (!newPrompt) {
            flashStatus('请输入修改提示词', 'danger');
            return;
          }

          const continueSrc = getContinueImageSource(continueSource);
          if (!continueSrc) {
            flashStatus('当前图片无法直接复用为续图参考，请先下载后再上传到参考图', 'danger');
            return;
          }

          await generateFromImage(continueSrc, newPrompt, continuePanel.querySelector('.gen-btn'));
          continuePanel.classList.remove('show');
        });

        return card;
      }

      function buildVideoResultCard(result, meta = {}, card = document.createElement('div')) {
        card.className = 'card result-card';
        const videoSrc = getResultVideoSrc(result);
        if (!videoSrc) return card;

        const filename = meta.filename || `sora-${Date.now()}.${getVideoExtensionFromSrc(videoSrc, 'mp4')}`;
        const videoEl = document.createElement('video');
        videoEl.className = 'result-video';
        videoEl.src = videoSrc;
        videoEl.controls = true;
        videoEl.playsInline = true;
        videoEl.preload = 'metadata';
        if (result.thumbnailUrl) videoEl.poster = result.thumbnailUrl;
        card.appendChild(videoEl);

        const actions = document.createElement('div');
        actions.className = 'actions result-card-actions';

        if (meta.label) {
          const labelEl = document.createElement('span');
          labelEl.className = 'time-label';
          labelEl.textContent = meta.label;
          actions.appendChild(labelEl);
        }

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'mini-btn primary';
        downloadBtn.type = 'button';
        downloadBtn.textContent = '下载视频';
        downloadBtn.addEventListener('click', async () => {
          try {
            await downloadVideoSource(videoSrc, filename);
            flashStatus('已开始下载视频', 'success');
          } catch (err) {
            console.error('下载视频失败:', err);
            flashStatus(err.message || '下载视频失败', 'danger');
          }
        });
        actions.appendChild(downloadBtn);

        const openBtn = document.createElement('a');
        openBtn.className = 'mini-btn';
        openBtn.textContent = '打开';
        openBtn.href = videoSrc;
        openBtn.target = '_blank';
        openBtn.rel = 'noopener';
        actions.appendChild(openBtn);

        card.appendChild(actions);
        card._videoSrc = videoSrc;
        return card;
      }

      async function persistVideoResult(result, meta = {}) {
        const videoSrc = getResultVideoSrc(result);
        if (!videoSrc) return;

        try {
          const videoRecord = await buildHistoryVideoRecord(result);
          const historyRecord = {
            mediaType: 'video',
            thumbnail: videoRecord.thumbnail,
            filename: videoRecord.filename,
            videoUrl: videoRecord.videoUrl,
            videoSrc: videoRecord.videoSrc,
            videoId: videoRecord.videoId,
            prompt: meta?.prompt || '',
            aspect: meta?.aspect || '',
            resolution: meta?.resolution || '',
            quality: meta?.quality || '',
            videoDuration: meta?.videoDuration || '',
            model: meta?.model || '',
            protocol: meta?.protocol || '',
            timestamp: videoRecord.timestamp,
            runtimeMs: meta?.runtimeMs || 0
          };
          await saveHistory(historyRecord);
          await renderHistory();

          const saveResult = shouldSkipAutoSaveBecausePreflightFailed(meta?.savePreflightResult)
            ? { status: meta.savePreflightResult.status }
            : await saveVideoFile(videoSrc, videoRecord.filename);
          const feedback = getSaveVideoResultMessage(saveResult);
          flashStatus(feedback.text, feedback.type);
          debugLog('视频保存结果:', videoRecord.filename, saveResult);
        } catch (err) {
          console.error('保存视频历史记录或文件失败:', err);
        }
      }

      // 替换占位符卡片为真实结果
      function ensureResultCacheStatusEl(card) {
        if (!card) return null;
        let statusEl = card.querySelector('.result-cache-status');
        if (statusEl) return statusEl;
        const actions = card.querySelector('.result-card-actions') || card;
        statusEl = document.createElement('div');
        statusEl.className = 'result-cache-status';
        statusEl.style.cssText = 'width:100%;font-size:11px;color:var(--accent);margin-top:6px;min-height:16px;';
        actions.appendChild(statusEl);
        return statusEl;
      }

      function setResultCacheStatus(card, text, type) {
        const statusEl = ensureResultCacheStatusEl(card);
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.style.color = type === 'danger'
          ? 'var(--danger)'
          : type === 'success'
            ? 'var(--success, var(--accent))'
            : 'var(--accent)';
      }

      function ensureRecacheButton(card, continueSource, meta, imgSrc) {
        if (!card || !continueSource) return null;
        let btn = card.querySelector('.recache-result-btn');
        if (btn) return btn;
        const actions = card.querySelector('.result-card-actions');
        if (!actions) return null;
        btn = document.createElement('button');
        btn.className = 'mini-btn recache-result-btn';
        btn.type = 'button';
        btn.textContent = '重新缓存';
        btn.title = '重新把远程结果下载到本地并保存';
        btn.addEventListener('click', async () => {
          if (btn.disabled) return;
          const original = btn.textContent;
          btn.disabled = true;
          btn.textContent = '缓存中...';
          setResultCacheStatus(card, '重新缓存中...', undefined);
          try {
            // 允许重新拉取
            continueSource.cachedSrc = '';
            continueSource.failed = false;
            continueSource.error = '';
            const persistentImgSrc = await warmContinueImageSource(continueSource, {
              forceRefresh: true,
              onProgress: (progress) => {
                if (progress?.percent != null) setResultCacheStatus(card, `本地缓存 ${progress.percent}%`);
                else if (progress?.stage) setResultCacheStatus(card, `本地缓存 ${progress.stage}`);
              }
            });
            applyContinueSourceAvailability(card._continueBtn, continueSource);
            if (!persistentImgSrc) throw new Error(continueSource.error || '重新缓存失败');

            const imageRecord = await resolveHistoryImageRecord(persistentImgSrc);
            if (card._resultImgEl && persistentImgSrc) card._resultImgEl.src = persistentImgSrc;
            if (card._downloadLink && persistentImgSrc) {
              card._downloadLink.href = persistentImgSrc;
              if (imageRecord.filename) card._downloadLink.download = imageRecord.filename;
            }

            const historyRecord = {
              thumbnail: imageRecord.thumbnail,
              filename: imageRecord.filename,
              prompt: meta?.prompt || '',
              aspect: meta?.aspect || '',
              resolution: meta?.resolution || '',
              quality: meta?.quality || '',
              model: meta?.model || '',
              protocol: meta?.protocol || '',
              timestamp: imageRecord.timestamp,
              runtimeMs: meta?.runtimeMs || 0,
              imageSrc: imageRecord.persistentSrc
            };
            await saveHistory(historyRecord);
            await renderHistory();

            const saveResult = await saveImageFile(imageRecord.persistentSrc, imageRecord.filename);
            const feedback = getSaveImageResultMessage(saveResult);
            flashStatus(feedback.text, feedback.type);
            setResultCacheStatus(card, '已重新缓存到本地', 'success');
            btn.remove();
          } catch (err) {
            console.error('重新缓存失败:', err);
            setResultCacheStatus(card, err?.message || '重新缓存失败', 'danger');
            flashStatus(err?.message || '重新缓存失败', 'danger');
            btn.disabled = false;
            btn.textContent = original;
          }
        });
        actions.appendChild(btn);
        return btn;
      }

      async function replaceCardWithResult(placeholderCard, result, meta) {
        // 清理计时器
        if (placeholderCard.dataset.intervalId) {
          clearInterval(parseInt(placeholderCard.dataset.intervalId));
        }

        // 计算卡片自己的实际耗时
        const actualElapsedMs = placeholderCard.dataset.startTime
          ? (performance.now() - placeholderCard.dataset.startTime)
          : (meta?.runtimeMs || 0);

        const replacementCard = buildResultCard(result, {
          filename: `gemini-${Date.now()}.${getExtensionFromMime(result.mime)}`
        });
        placeholderCard.replaceWith(replacementCard);

        if (hasResultVideo(result)) {
          await persistVideoResult(result, {
            ...meta,
            runtimeMs: actualElapsedMs
          });
          return;
        }

        if (hasResultImage(result)) {
          const imgSrc = getResultImgSrc(result);
          const continueSource = replacementCard._continueSource || buildContinueSourceState(imgSrc);
          const continueBtn = replacementCard._continueBtn;
          const needsRemoteCache = !!(result?.imageUrl && !result?.imageBase64 && !/^data:/i.test(imgSrc || ''));

          // 自动保存历史记录和下载图片
          try {
            let imageRecord;
            try {
              if (needsRemoteCache) setResultCacheStatus(replacementCard, '本地缓存 0%');
              const persistentImgSrc = await warmContinueImageSource(continueSource, {
                onProgress: (progress) => {
                  meta?.onCacheProgress?.(progress);
                  if (progress?.percent != null) setResultCacheStatus(replacementCard, `本地缓存 ${progress.percent}%`);
                  else if (progress?.stage) setResultCacheStatus(replacementCard, `本地缓存 ${progress.stage}`);
                }
              });
              if (!persistentImgSrc) {
                applyContinueSourceAvailability(continueBtn, continueSource);
                throw new Error(continueSource.error || '图片缓存失败');
              }
              applyContinueSourceAvailability(continueBtn, continueSource);
              if (replacementCard._resultImgEl && persistentImgSrc) {
                replacementCard._resultImgEl.src = persistentImgSrc;
              }
              if (replacementCard._downloadLink && persistentImgSrc) {
                replacementCard._downloadLink.href = persistentImgSrc;
              }
              imageRecord = await resolveHistoryImageRecord(persistentImgSrc);
              if (needsRemoteCache) setResultCacheStatus(replacementCard, '已缓存到本地', 'success');
            } catch (imageErr) {
              console.warn('结果图无法缓存为本地数据，历史记录降级为 URL 记录:', imageErr);
              imageRecord = await buildHistoryImageRecordFallback(imgSrc);
              setResultCacheStatus(replacementCard, '本地缓存失败，可点重新缓存', 'danger');
              ensureRecacheButton(replacementCard, continueSource, meta, imgSrc);
            }

            const historyRecord = {
              thumbnail: imageRecord.thumbnail,
              filename: imageRecord.filename,
              prompt: meta?.prompt || '',
              aspect: meta?.aspect || '',
              resolution: meta?.resolution || '',
              quality: meta?.quality || '',
              model: meta?.model || '',
              protocol: meta?.protocol || '',
              timestamp: imageRecord.timestamp,
              runtimeMs: actualElapsedMs || meta?.runtimeMs || 0
            };
            if (imageRecord.persistentSrc) {
              // Always keep a previewable local source for Agent/history panes.
              historyRecord.imageSrc = imageRecord.persistentSrc;
              if (!shouldSaveHistoryOriginal() && imgSrc && imgSrc !== imageRecord.persistentSrc) {
                historyRecord.imageUrl = imgSrc;
              }
            } else if (imgSrc) {
              historyRecord.imageUrl = imgSrc;
            }
            if (!historyRecord.thumbnail) {
              historyRecord.thumbnail = historyRecord.imageSrc || historyRecord.imageUrl || imgSrc || '';
            }
            if (!historyRecord.mediaType) historyRecord.mediaType = 'image';
            if (!historyRecord.mime) historyRecord.mime = imageRecord.mimeType || 'image/png';
            await saveHistory(historyRecord);
            await renderHistory();

            if (imageRecord.persistentSrc) {
              const saveResult = shouldSkipAutoSaveBecausePreflightFailed(meta?.savePreflightResult)
                ? { status: meta.savePreflightResult.status }
                : await saveImageFile(imageRecord.persistentSrc, imageRecord.filename);
              const feedback = getSaveImageResultMessage(saveResult);
              flashStatus(feedback.text, feedback.type);
              debugLog('图片历史记录已保存:', imageRecord.filename, saveResult);
            } else {
              flashStatus('历史记录已保存，可在历史记录中下载原图链接；如需继续生成，请先下载后再上传', 'success');
            }
          } catch (err) {
            console.error('保存历史记录或图片失败:', err);
          }
        }
      }

      async function appendResult(result, meta) {
        const card = buildResultCard(result, {
          filename: `gemini-${Date.now()}.${getExtensionFromMime(result.mime)}`
        });
        if (hasResultVideo(result)) {
          await persistVideoResult(result, meta);
        }
        if (hasResultImage(result)) {
          const imgSrc = getResultImgSrc(result);
          const continueSource = card._continueSource || buildContinueSourceState(imgSrc);
          const continueBtn = card._continueBtn;

          // === 自动保存历史记录和下载图片 ===
          try {
            let imageRecord;
            try {
              const persistentImgSrc = await warmContinueImageSource(continueSource, {
                onProgress: meta?.onCacheProgress
              });
              if (!persistentImgSrc) {
                applyContinueSourceAvailability(continueBtn, continueSource);
                throw new Error(continueSource.error || '图片不可用');
              }
              applyContinueSourceAvailability(continueBtn, continueSource);
              imageRecord = await resolveHistoryImageRecord(persistentImgSrc);
            } catch (imageErr) {
              console.warn('继续生成源图不可用，改用原始 URL 记录:', imageErr);
              imageRecord = await buildHistoryImageRecordFallback(imgSrc);
              setResultCacheStatus(card, '本地缓存失败，可点重新缓存', 'danger');
              ensureRecacheButton(card, continueSource, meta, imgSrc);
            }

            const historyRecord = {
              thumbnail: imageRecord.thumbnail,
              filename: imageRecord.filename,
              prompt: meta?.prompt || '',
              aspect: meta?.aspect || '',
              resolution: meta?.resolution || '',
              quality: meta?.quality || '',
              model: meta?.model || '',
              protocol: meta?.protocol || '',
              timestamp: imageRecord.timestamp,
              runtimeMs: meta?.runtimeMs || 0
            };
            if (imageRecord.persistentSrc) {
              // Always keep a previewable local source for Agent/history panes.
              historyRecord.imageSrc = imageRecord.persistentSrc;
              if (!shouldSaveHistoryOriginal() && imgSrc && imgSrc !== imageRecord.persistentSrc) {
                historyRecord.imageUrl = imgSrc;
              }
            } else if (imgSrc) {
              historyRecord.imageUrl = imgSrc;
            }
            if (!historyRecord.thumbnail) {
              historyRecord.thumbnail = historyRecord.imageSrc || historyRecord.imageUrl || imgSrc || '';
            }
            if (!historyRecord.mediaType) historyRecord.mediaType = 'image';
            if (!historyRecord.mime) historyRecord.mime = imageRecord.mimeType || 'image/png';
            await saveHistory(historyRecord);
            await renderHistory();

            if (imageRecord.persistentSrc) {
              const saveResult = shouldSkipAutoSaveBecausePreflightFailed(meta?.savePreflightResult)
                ? { status: meta.savePreflightResult.status }
                : await saveImageFile(imageRecord.persistentSrc, imageRecord.filename);
              const feedback = getSaveImageResultMessage(saveResult);
              flashStatus(feedback.text, feedback.type);
              debugLog('图片保存结果:', imageRecord.filename, saveResult);
            } else {
              flashStatus('已添加到历史记录，可从结果卡片继续操作', 'success');
            }
          } catch (err) {
            console.error('保存历史记录或图片失败:', err);
          }
        }
        resultsEl.prepend(card);
        syncResultsEmptyState();
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
        const savePreflightResult = await preflightSaveFolderPermission();

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
            runtimeMs: elapsed,
            savePreflightResult
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
        // 先停掉占位卡片上的计时器，否则 innerHTML 清空后 setInterval 会成为孤儿一直跑
        resultsEl.querySelectorAll('[data-interval-id]').forEach((card) => {
          const id = parseInt(card.dataset.intervalId, 10);
          if (Number.isFinite(id)) clearInterval(id);
          delete card.dataset.intervalId;
        });
        resultsEl.innerHTML = '';
        if (resultsEmptyEl) resultsEl.appendChild(resultsEmptyEl);
        syncResultsEmptyState();
        flashStatus('已清空结果', 'success');
      }

      async function handleRun() {
        if (!isActivePlatformSupported()) {
          flashStatus('当前平台协议尚未接入，暂不可发起请求', 'danger');
          return;
        }
        const key = getApiKey();
        const headerName = 'Authorization';
        const prefix = 'Bearer ';
        const prompt = promptInput.value.trim();
        const count = Math.max(1, Math.min(10, parseInt(countInput.value, 10) || 1));
        if (!key) return flashStatus('需要 API Key', 'danger');
        if (!prompt) return flashStatus('提示词必填', 'danger');

        if (generationInFlight) return;
        generationInFlight = true;
        if (runBtn) {
          runBtn.disabled = true;
          runBtn.setAttribute('aria-busy', 'true');
          runBtn.textContent = '准备生成...';
        }
        syncMobileGenerateBar({ busy: true, buttonText: '准备生成...', progressText: '准备生成...' });
        try {

        const savePreflightResult = await preflightSaveFolderPermission();

        const headers = { 'Content-Type': 'application/json' };
        headers[headerName] = `${prefix || ''}${key}`;

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
          syncMobileGenerateBar({
            busy: true,
            buttonText: '生成中...',
            progressText: statusText
          });
        }

        // 显示简单的进度提示（不显示时间）
        updateRunProgress();

        // 单个请求的处理函数
        async function generateOne(index, placeholderCard) {
          const startedAt = performance.now();

          const MAX_RETRIES = 3;
          const BASE_DELAY_MS = 3000;
          let attempt = 0;

          while (attempt <= MAX_RETRIES) {
            try {
              const result = getActivePlatformConfig().kind === 'video'
                ? await callVideoAPI(prompt, getReferenceImagesForRequest())
                : await callImageAPI(prompt, getReferenceImagesForRequest());
              const durationMs = performance.now() - startedAt;

              // 替换占位符为真实结果；远程 URL 会在持久化阶段带进度回写
              const statusEl = placeholderCard.querySelector('.loading-status');
              if (statusEl && (result?.imageUrl || result?.videoUrl) && !result?.imageBase64) {
                statusEl.textContent = '结果下载到本地...';
              }
              await replaceCardWithResult(placeholderCard, result, getCurrentGenerationParams({
                prompt,
                runtimeMs: durationMs,
                savePreflightResult,
                onCacheProgress: (progress) => {
                  if (!statusEl) return;
                  if (progress?.percent != null) statusEl.textContent = `本地缓存 ${progress.percent}%`;
                  else if (progress?.stage) statusEl.textContent = `本地缓存 ${progress.stage}`;
                }
              }));
              completed++;
              updateRunProgress();
              return; // 成功，退出重试循环
            } catch (err) {
              const errMsg = err.message || '';
              attempt++;
              const failure = classifyGenerationFailure(err);
              const canRetry = attempt <= MAX_RETRIES && failure.retryable && !failure.terminal;

              if (canRetry) {
                const delayMs = Math.max(
                  failure.retryAfterMs || 0,
                  BASE_DELAY_MS * Math.pow(2, attempt - 1)
                );
                const retryMsg = `请求被限流/暂不可用，第 ${attempt} 次重试（等待 ${Math.round(delayMs/1000)} 秒）...`;
                console.warn(`请求 #${index + 1} 第 ${attempt} 次重试:`, errMsg);

                // 更新占位符卡片显示重试状态
                const statusEl = placeholderCard.querySelector('.loading-status');
                if (statusEl) statusEl.textContent = retryMsg;
                flashStatus(retryMsg, 'warning');

                await new Promise(r => setTimeout(r, delayMs));
                // 继续下一轮重试
              } else {
                // 不可重试或已达最大重试次数
                if (!isExpectedCapabilityGuard(err)) {
                  console.error(`请求 #${index + 1} 失败:`, err);
                }
                failed++;
                lastErrorMsg = parseApiError(errMsg);
                showErrorInCard(placeholderCard, lastErrorMsg);
                updateRunProgress();
                return;
              }
            }
          }
        }

        // 图片受控并发（默认 2，最大 3）；视频保持串行，避免轮询打爆中转。
        const isVideoRun = getActivePlatformConfig().kind === 'video';
        const concurrency = isVideoRun ? 1 : Math.max(1, Math.min(3, count > 1 ? 2 : 1));
        const jobs = [];
        for (let i = 0; i < count; i++) {
          const placeholderCard = createLoadingPlaceholder(i + 1);
          resultsEl.insertBefore(placeholderCard, resultsEl.firstChild);
          syncResultsEmptyState();
          jobs.push({ index: i, placeholderCard });
        }
        await mapPool(jobs, concurrency, async (job) => {
          if (!isVideoRun && job.index > 0) {
            await new Promise(r => setTimeout(r, 250 * Math.min(job.index, 3)));
          } else if (isVideoRun && job.index > 0) {
            await new Promise(r => setTimeout(r, 1200));
          }
          await generateOne(job.index, job.placeholderCard);
        });

        // 显示完成状态（不显示总时间）
        if (failed === 0) {
          flashStatus(`完成 ${completed} 张`, 'success');
        } else {
          // 显示失败原因的中文提示
          flashStatus(`失败 ${failed} 张: ${lastErrorMsg}`, 'danger');
        }
      
        } finally {
          generationInFlight = false;
          if (runBtn) runBtn.removeAttribute('aria-busy');
          updatePlatformActionAvailability();
          syncMobileGenerateBar();
        }
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
        // 面板隐藏时 clientWidth/Height 为 0，除法会得到 NaN 并污染投影矩阵
        if (!width || !height) return;

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
          showUiError('请先上传参考图，然后再使用产品角度工具。');
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
          angleDialogHandle?.close?.('replace', { restoreFocus: false });
          angleDialogHandle = window.AppUtils?.dialog?.open?.({
            element: modal.querySelector('.angle-modal') || modal,
            container: modal,
            label: '自定义产品角度',
            openClass: 'active',
            closeClass: 'active',
            trigger: document.activeElement
          }) || null;
          if (!angleDialogHandle) modal.classList.add('active');

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
          if (angleDialogHandle) {
            const handle = angleDialogHandle;
            angleDialogHandle = null;
            handle.close('close');
          } else {
            modal.classList.remove('active');
          }

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
            showUiError('请先在提示词输入框中输入分镜脚本');
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
            showUiError('此场景需要参考图，请先上传参考图或生成一张产品图。');
            return;
          }
        }

        // 确认生成
        const confirmed = await confirmUiAction({
          title: scenario.label,
          message:
          `${scenario.label}\n\n` +
          `将基于当前参考图生成 ${scenario.prompts.length} 张图片。\n\n` +
          `⚠️ 提示：AI生成的多角度图可能存在细节差异，建议多次生成选择最佳效果。\n\n` +
          `是否继续？`,
          confirmLabel: '开始生成',
          trigger: document.activeElement
        });

        if (!confirmed) return;

        const savePreflightResult = await preflightSaveFolderPermission();

        // 创建任务
        const taskId = ++taskIdCounter;
        const taskInfo = {
          id: taskId,
          scenario: scenario,
          savePreflightResult,
          startTime: Date.now(),
          completed: 0,
          failed: 0,
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
        syncResultsEmptyState();

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
            appendResultToGroup(groupContainer, result, scenario.angles[index], actualElapsedMs, null, taskInfo.savePreflightResult);

            // 更新进度
            updateTaskProgress(taskId, `已完成 ${taskInfo.completed}/${taskInfo.total}`);

            return result;
          } catch (error) {
            console.error(`生成 ${scenario.angles[index]} 失败:`, error);
            taskInfo.completed++;
            taskInfo.failed = (taskInfo.failed || 0) + 1;
            const placeholderEl = document.getElementById(`placeholder-${taskId}-${index}`);
            if (placeholderEl) {
              showErrorInCard(placeholderEl, parseApiError(error.message));
            }
            updateTaskProgress(taskId, `已完成 ${taskInfo.completed}/${taskInfo.total}，失败 ${taskInfo.failed}`);
            return null;
          }
        });

        // 等待所有生成完成
        await Promise.all(promises);

        // 任务完成
        const elapsed = ((Date.now() - taskInfo.startTime) / 1000).toFixed(1);
        updateTaskProgress(
          taskId,
          taskInfo.failed
            ? `完成 ${taskInfo.completed}/${taskInfo.total}，失败 ${taskInfo.failed}，耗时 ${elapsed}s`
            : `✅ 全部完成！耗时 ${elapsed}s`
        );

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
        const { scenario } = taskInfo;
        // 分镜流程用 taskId，多角度流程用 id，两者都要兼容，否则会生成 task-group-undefined
        const taskId = taskInfo.id ?? taskInfo.taskId;

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
            <div class="loading-status" style="font-size: 11px; margin-top: 6px; color: var(--accent);"></div>
            <div class="loading-status" style="font-size: 11px; margin-top: 6px; color: var(--accent);"></div>
            <div class="loading-status" style="font-size: 11px; margin-top: 6px; color: var(--warning);"></div>
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
      async function appendResultToGroup(groupContainer, result, angleName, actualElapsedMs, retryPrompt, savePreflightResult = null) {
        const gridEl = groupContainer.querySelector('.result-group-grid');
        if (!gridEl || !result || !hasResultImage(result)) return;

        const card = document.createElement('div');
        card.className = 'card';

        const imgSrc = getResultImgSrc(result);
        const continueSource = buildContinueSourceState(imgSrc);
        const imageDisplaySrc = getResultImageDisplaySrc(imgSrc);
        const imageActionSrc = getResultImageActionSrc(imgSrc);

        const imageButton = document.createElement('button');
        imageButton.className = 'result-thumb-btn';
        imageButton.type = 'button';
        imageButton.title = '点击查看原图';
        imageButton.setAttribute('aria-label', '查看原图');

        const imgEl = document.createElement('img');
        imgEl.src = imageDisplaySrc;
        imgEl.className = 'zoomable';
        imgEl.alt = angleName || '生成结果';
        if (imageDisplaySrc !== RESULT_MEDIA_PLACEHOLDER) bindResultImageFallback(imgEl, imgSrc);
        imageButton.appendChild(imgEl);
        imageButton.addEventListener('click', () => openLightbox(
          imgEl.currentSrc && imgEl.currentSrc !== RESULT_MEDIA_PLACEHOLDER ? imgEl.currentSrc : imageActionSrc
        ));
        card.appendChild(imageButton);

        // 操作按钮
        const actions = document.createElement('div');
        actions.className = 'actions result-card-actions';

        // 角度标签
        const angleLabel = document.createElement('span');
        angleLabel.className = 'time-label';
        angleLabel.textContent = angleName;
        actions.appendChild(angleLabel);

        // 下载按钮
        const downloadLink = document.createElement('a');
        downloadLink.className = 'mini-btn';
        downloadLink.textContent = '下载';
        downloadLink.href = imageActionSrc;
        downloadLink.download = `${angleName}-${Date.now()}.${getExtensionFromMime(result.mime)}`;
        actions.appendChild(downloadLink);

        const saveAlbumBtn = document.createElement('button');
        saveAlbumBtn.className = 'mini-btn primary';
        saveAlbumBtn.textContent = isMobileDevice() ? '保存相册' : '保存';
        saveAlbumBtn.addEventListener('click', () => handleSaveToAlbum(imageActionSrc, downloadLink.download));
        actions.appendChild(saveAlbumBtn);

        const continueBtn = document.createElement('button');
        continueBtn.className = 'mini-btn primary continue-result-btn';
        continueBtn.textContent = '续图';
        applyContinueSourceAvailability(continueBtn, continueSource);
        actions.appendChild(continueBtn);

        const continuePanel = document.createElement('div');
        continuePanel.className = 'continue-panel';
        continuePanel.innerHTML = `
          <textarea placeholder="请输入修改提示词，例如：把背景换成海边、添加阳光效果..."></textarea>
          <div class="panel-actions">
            <button class="gen-btn">🎌 生成</button>
            <button class="cancel-btn">取消</button>
          </div>
        `;
        card.appendChild(continuePanel);

        continueBtn.addEventListener('click', async () => {
          if (continueBtn.disabled) {
            flashStatus('该图片没有可用图源，请先下载后再上传为参考图', 'danger');
            return;
          }

          if (!continueSource.cachedSrc) {
            const originalText = continueBtn.textContent;
            continueBtn.disabled = true;
            continueBtn.textContent = '准备中';
            const preparedSrc = await warmContinueImageSource(continueSource);
            continueBtn.disabled = false;
            continueBtn.textContent = originalText;
            applyContinueSourceAvailability(continueBtn, continueSource);

            if (!preparedSrc) {
              flashStatus('当前图片无法直接复用为续图参考，请先下载后再上传到参考图', 'danger');
              return;
            }
          }

          continuePanel.classList.toggle('show');
          if (continuePanel.classList.contains('show')) {
            continuePanel.querySelector('textarea').focus();
          }
        });

        continuePanel.querySelector('.cancel-btn').addEventListener('click', () => {
          continuePanel.classList.remove('show');
        });

        continuePanel.querySelector('.gen-btn').addEventListener('click', async () => {
          const newPrompt = continuePanel.querySelector('textarea').value.trim();
          if (!newPrompt) {
            flashStatus('请输入修改提示词', 'danger');
            return;
          }

          const continueSrc = getContinueImageSource(continueSource);
          if (!continueSrc) {
            flashStatus('当前图片无法直接复用为续图参考，请先下载后再上传到参考图', 'danger');
            return;
          }

          await generateFromImage(continueSrc, newPrompt, continuePanel.querySelector('.gen-btn'));
          continuePanel.classList.remove('show');
        });

        // 重试按钮（如果有 retryPrompt）
        if (retryPrompt) {
          const retryBtn = document.createElement('button');
          retryBtn.className = 'mini-btn retry-result-btn';
          retryBtn.textContent = '重试';
          retryBtn.title = '使用相同参数重新生成此分镜';
          retryBtn.addEventListener('click', async () => {
            const originalText = retryBtn.textContent;
            retryBtn.disabled = true;
            retryBtn.textContent = '生成中...';
            const startedAt = performance.now();
            const retrySavePreflightResult = await preflightSaveFolderPermission();

            try {
              // 重新生成
              const newResult = await generateStoryboardShot(retryPrompt);

              // 替换当前卡片的图片
              const newImgSrc = getResultImgSrc(newResult);
              continueSource.displaySrc = newImgSrc;
              continueSource.cachedSrc = /^data:image\//i.test(newImgSrc || '') ? newImgSrc : '';
              continueSource.failed = false;
              continueSource.error = '';

              imgEl.src = getResultImageDisplaySrc(newImgSrc);
              downloadLink.href = getResultImageActionSrc(newImgSrc);
              downloadLink.download = `${angleName}-${Date.now()}.${getExtensionFromMime(newResult.mime)}`;

              // 保存新图片
              let imageRecord;
              try {
                const persistentNewImgSrc = await warmContinueImageSource(continueSource);
                if (!persistentNewImgSrc) {
                  applyContinueSourceAvailability(continueBtn, continueSource);
                  throw new Error(continueSource.error || '图片不可用');
                }
                applyContinueSourceAvailability(continueBtn, continueSource);
                imageRecord = await resolveHistoryImageRecord(persistentNewImgSrc);
              } catch (imageErr) {
                console.warn('重试结果源图不可用，改用原始 URL 记录:', imageErr);
                imageRecord = await buildHistoryImageRecordFallback(newImgSrc);
              }
              const historyRecord = {
                thumbnail: imageRecord.thumbnail,
                filename: imageRecord.filename,
                prompt: angleName,
                aspect: aspectSelect.value,
                resolution: resolutionSelect.value,
                quality: imageQualitySelect?.value || '',
                model: getImageModel(),
                protocol: getProtocol(),
                timestamp: imageRecord.timestamp,
                runtimeMs: performance.now() - startedAt
              };
              if (imageRecord.persistentSrc) {
                historyRecord.imageSrc = imageRecord.persistentSrc;
                if (!shouldSaveHistoryOriginal() && newImgSrc && newImgSrc !== imageRecord.persistentSrc) {
                  historyRecord.imageUrl = newImgSrc;
                }
              } else if (newImgSrc) {
                historyRecord.imageUrl = newImgSrc;
              }
              if (!historyRecord.thumbnail) {
                historyRecord.thumbnail = historyRecord.imageSrc || historyRecord.imageUrl || newImgSrc || '';
              }
              if (!historyRecord.mediaType) historyRecord.mediaType = 'image';
              if (!historyRecord.mime) historyRecord.mime = imageRecord.mimeType || 'image/png';
              await saveHistory(historyRecord);
              await renderHistory();

              if (imageRecord.persistentSrc) {
                const saveResult = shouldSkipAutoSaveBecausePreflightFailed(retrySavePreflightResult)
                  ? { status: retrySavePreflightResult.status }
                  : await saveImageFile(imageRecord.persistentSrc, imageRecord.filename);
                const feedback = getSaveImageResultMessage(saveResult);
                flashStatus(`${angleName} 重试完成：${feedback.text}`, feedback.type);
              } else {
                flashStatus(`${angleName} 已添加到历史记录，可从结果卡片继续操作`, 'success');
              }
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
          let imageRecord;
          try {
            const persistentImgSrc = await warmContinueImageSource(continueSource, {
                onProgress: meta?.onCacheProgress
              });
            if (!persistentImgSrc) {
              applyContinueSourceAvailability(continueBtn, continueSource);
              throw new Error(continueSource.error || '图片不可用');
            }
            applyContinueSourceAvailability(continueBtn, continueSource);
            imageRecord = await resolveHistoryImageRecord(persistentImgSrc);
          } catch (imageErr) {
            console.warn('生成结果源图不可用，改用原始 URL 记录:', imageErr);
            imageRecord = await buildHistoryImageRecordFallback(imgSrc);
          }
          const historyRecord = {
            thumbnail: imageRecord.thumbnail,
            filename: imageRecord.filename,
            prompt: angleName,
            aspect: aspectSelect.value,
            resolution: resolutionSelect.value,
            quality: imageQualitySelect?.value || '',
            model: getImageModel(),
            protocol: getProtocol(),
            timestamp: imageRecord.timestamp,
            runtimeMs: actualElapsedMs || 0
          };
                      if (imageRecord.persistentSrc) {
              historyRecord.imageSrc = imageRecord.persistentSrc;
              if (!shouldSaveHistoryOriginal() && imgSrc && imgSrc !== imageRecord.persistentSrc) {
                historyRecord.imageUrl = imgSrc;
              }
            } else if (imgSrc) {
              historyRecord.imageUrl = imgSrc;
            }
            if (!historyRecord.thumbnail) {
              historyRecord.thumbnail = historyRecord.imageSrc || historyRecord.imageUrl || imgSrc || '';
            }
            if (!historyRecord.mediaType) historyRecord.mediaType = 'image';
            if (!historyRecord.mime) historyRecord.mime = imageRecord.mimeType || 'image/png';
          await saveHistory(historyRecord);
          await renderHistory();

          if (imageRecord.persistentSrc) {
            const saveResult = shouldSkipAutoSaveBecausePreflightFailed(savePreflightResult)
              ? { status: savePreflightResult.status }
              : await saveImageFile(imageRecord.persistentSrc, imageRecord.filename);
            const feedback = getSaveImageResultMessage(saveResult);
            flashStatus(`${angleName} 完成：${feedback.text}`, feedback.type);
          } else {
            flashStatus(`${angleName} 已添加到历史记录，可从结果卡片继续操作`, 'success');
          }
        } catch (err) {
          console.error('保存失败:', err);
        }
      }

      const clearResultsBtn = document.getElementById('clear-results');
      const savePromptFromInputBtn = document.getElementById('save-prompt-from-input');
      const optimizePromptBtn = document.getElementById('optimize-prompt-btn');
      const advancedToolsPanel = document.getElementById('advanced-tools-panel');
      const advancedToolsToggleBtn = document.getElementById('advanced-tools-toggle');
      const advancedToolsBody = document.getElementById('advanced-tools-body');
      const storyboardToolBtn = document.getElementById('storyboard-tool-btn');
      const angleToolBtn = document.getElementById('angle-tool-btn');
      const reversePromptToolBtn = document.getElementById('reverse-prompt-tool-btn');
      const gifToolBtn = document.getElementById('gif-tool-btn');
      const upscaleToolBtn = document.getElementById('upscale-tool-btn');

      function setAdvancedToolsCollapsed(collapsed) {
        if (!advancedToolsPanel || !advancedToolsToggleBtn) return;
        advancedToolsPanel.classList.toggle('collapsed', collapsed);
        advancedToolsToggleBtn.setAttribute('aria-expanded', String(!collapsed));
        if (advancedToolsBody) advancedToolsBody.hidden = collapsed;
      }

      function updateProviderStudioStatus() {
        syncPlatformSummary();
      }

      setAdvancedToolsCollapsed(advancedToolsPanel?.classList.contains('collapsed'));

      fileInput.addEventListener('change', e => handleFiles(e.target.files));
      protocolSelect.addEventListener('change', () => {
        persistActivePlatformSnapshot();
        updateReferenceImageLimitText();
        updateProviderStudioStatus();
        if (state.images.length > getReferenceImageLimit()) {
          flashStatus(`当前协议最多使用 ${getReferenceImageLimit()} 张参考图，已保留前 ${getReferenceImageLimit()} 张用于发送`, 'success');
        }
      });
      saveKeyBtn.addEventListener('click', saveSettings);
      historyImageRetentionSelect?.querySelectorAll('.history-retention-option').forEach(option => {
        option.addEventListener('click', () => {
          setHistoryImageRetention(option.dataset.value, { persist: !settingsIsOpen, notify: !settingsIsOpen });
          if (settingsIsOpen && settingsDraft) {
            settingsDraft.historyRetention = option.dataset.value === 'thumbnail' ? 'thumbnail' : 'original';
            markSettingsDirty();
          }
        });
      });
      runBtn.addEventListener('click', handleRun);
      mobileGenerateBtn?.addEventListener('click', handleRun);
      countInput?.addEventListener('input', () => syncMobileGenerateBar());
      countInput?.addEventListener('change', () => syncMobileGenerateBar());
      syncMobileGenerateBar();
      baseUrlInput.addEventListener('input', () => {
        persistActivePlatformSnapshot();
        updateProviderStudioStatus();
      });
      proxyModeInput?.addEventListener('change', () => {
        persistActivePlatformSnapshot();
        updateProviderStudioStatus();
      });
      autoUpscaleInput?.addEventListener('change', () => {
        localStorage.setItem(AUTO_UPSCALE_KEY, autoUpscaleInput.checked ? '1' : '0');
      });
      apiKeyInput?.addEventListener('input', () => {
        if (settingsIsOpen) {
          captureSettingsDraftPlatform();
          markSettingsDirty();
        }
      });
      rememberApiKeyInput?.addEventListener('change', () => {
        if (settingsIsOpen) {
          settingsDraft.rememberApiKey = !!rememberApiKeyInput.checked;
          markSettingsDirty();
        }
      });
      imageModelSelect?.addEventListener('change', () => {
        persistActivePlatformSnapshot();
        updateProviderStudioStatus();
      });
      textModelSelect?.addEventListener('change', () => {
        persistActivePlatformSnapshot();
        updateProviderStudioStatus();
      });
      aspectSelect?.addEventListener('change', persistActivePlatformSnapshot);
      resolutionSelect?.addEventListener('change', persistActivePlatformSnapshot);
      imageQualitySelect?.addEventListener('change', persistActivePlatformSnapshot);
      outputFormatSelect?.addEventListener('change', persistActivePlatformSnapshot);
      imageBackgroundSelect?.addEventListener('change', persistActivePlatformSnapshot);
      videoDurationSelect?.addEventListener('change', persistActivePlatformSnapshot);
      countInput.addEventListener('input', () => {
        let val = parseInt(countInput.value, 10);
        if (val > 10) countInput.value = 10;
        if (val < 1 && countInput.value !== '') countInput.value = 1;
        persistActivePlatformSnapshot();
      });
      countInput.addEventListener('blur', () => {
        let val = parseInt(countInput.value, 10);
        if (isNaN(val) || val < 1) countInput.value = 1;
        if (val > 10) countInput.value = 10;
        persistActivePlatformSnapshot();
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

        openPromptSaveEditor(promptContent, { context: 'studio' });
      });
      advancedToolsToggleBtn?.addEventListener('click', () => {
        setAdvancedToolsCollapsed(!advancedToolsPanel?.classList.contains('collapsed'));
      });
      storyboardToolBtn?.addEventListener('click', () => {
        if (!ensurePlatformFeatureAvailable('分镜生成')) return;
        if (!ensureTextCapabilityAvailable('分镜分析')) return;
        showStoryboardInput();
      });
      angleToolBtn?.addEventListener('click', () => {
        if (!ensurePlatformFeatureAvailable('产品角度')) return;
        openAngleModal();
      });
      reversePromptToolBtn?.addEventListener('click', () => {
        if (!ensurePlatformFeatureAvailable('反推提示词')) return;
        if (!ensureTextCapabilityAvailable('反推提示词')) return;
        showReversePromptDialog();
      });
      gifToolBtn?.addEventListener('click', () => {
        showGifToolDialog();
      });
      upscaleToolBtn?.addEventListener('click', () => {
        showUpscaleToolDialog();
      });

      optimizePromptBtn?.addEventListener('click', () => {
        if (!ensureTextCapabilityAvailable('提示词优化')) return;
        const promptContent = promptInput.value.trim();

        if (!promptContent) {
          flashStatus('请先输入提示词内容', 'danger');
          promptInput.focus();
          return;
        }

        showPromptCompareDialog(promptContent);
      });

      platformKindButtons.forEach(button => {
        button.addEventListener('click', () => {
          setActivePlatformKind(button.dataset.platformKind);
        });
        button.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const index = platformKindButtons.indexOf(button);
          const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? platformKindButtons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + platformKindButtons.length) % platformKindButtons.length;
          const next = platformKindButtons[nextIndex];
          next?.focus();
          if (next?.dataset.platformKind) setActivePlatformKind(next.dataset.platformKind);
        });
      });

      renderPlatformSwitcher();
      loadSettings();
      updateReferenceImageLimitText();
      updateProviderStudioStatus();
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
          renderHistory();
        }, 300);
      }).catch(err => {
        console.error('初始化数据库失败:', err);
        historyCountEl.textContent = '加载失败';
        renderHistoryEmptyState('error');
        syncHistoryActions('error');
      });
    })();
  
