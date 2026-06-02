
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
        if (base.endsWith('/api/v3') && path.startsWith('/v1/')) {
          return base + path.slice('/v1'.length);
        }
        if (base.endsWith('/api/v3') && path.startsWith('/volc/v1/')) {
          return base + path.slice('/volc/v1'.length);
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

      function canProxyMediaUrl(src) {
        return isApiProxyEnabled() && /^https:\/\//i.test(src || '');
      }

      function canProxyImageUrl(src) {
        return canProxyMediaUrl(src);
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
      const ACTIVE_PLATFORM_STORAGE_KEY = 'active_platform_id';
      const ACTIVE_PLATFORM_KIND_STORAGE_KEY = 'active_platform_kind';
      const PLATFORM_SETTINGS_STORAGE_KEY = 'platform_settings_v1';
      const MODEL_LIST_STORAGE_PREFIX = 'model_list';
      const IMAGE_MODEL_STORAGE_PREFIX = 'image_model';
      const TEXT_MODEL_STORAGE_PREFIX = 'text_model';
      const DEFAULT_TEXT_MODEL = 'gpt-5.4-mini';
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

      function getImageModel() {
        return imageModelSelect.value || 'gpt-image-2';
      }
      function getTextModel() {
        return textModelSelect.value || DEFAULT_TEXT_MODEL;
      }
      function getProtocol() {
        return protocolSelect.value || 'openai-chat';
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
        return getStoredModels(platformId).some(model => model.id === modelId);
      }
      function applyPlatformSettings(platformConfig, platformSettings) {
        if (!platformConfig) return;
        const settings = platformSettings || {};
        const textModel = isAvailableTextModel(settings.textModel, platformConfig.id)
          ? settings.textModel
          : DEFAULT_TEXT_MODEL;

        populateProtocolOptions(platformConfig, settings.protocol || platformConfig.defaultProtocol);
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

        restoreSelectValue(aspectSelect, settings.aspect ?? aspectSelect.value);
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
      function syncPlatformBaseUrl(platformConfig) {
        if (!baseUrlInput || !platformConfig) return;
        baseUrlInput.placeholder = platformConfig.baseUrlPlaceholder || defaultBaseUrl;
        const knownPlatformBaseUrls = Object.values(PLATFORM_REGISTRY)
          .map(platform => platform.baseUrlValue)
          .filter(Boolean);
        if (platformConfig.id === activePlatformId && platformConfig.baseUrlValue && knownPlatformBaseUrls.includes(baseUrlInput.value) && baseUrlInput.value !== platformConfig.baseUrlValue) {
          baseUrlInput.value = platformConfig.baseUrlValue;
        } else if (platformConfig.id === activePlatformId && platformConfig.baseUrlValue && baseUrlInput.value === defaultBaseUrl && platformConfig.baseUrlValue !== defaultBaseUrl) {
          baseUrlInput.value = platformConfig.baseUrlValue;
        } else if (!baseUrlInput.value && platformConfig.baseUrlValue) {
          baseUrlInput.value = platformConfig.baseUrlValue;
        }
        if (apiLinkEl) {
          apiLinkEl.href = platformConfig.apiHome || apiHomeUrl;
        }
      }
      function renderPlatformKindToggle() {
        platformKindButtons.forEach(button => {
          const isActive = button.dataset.platformKind === activePlatformKind;
          button.classList.toggle('active', isActive);
          button.setAttribute('aria-selected', String(isActive));
        });
      }

      function renderPlatformSwitcher() {
        if (!platformSwitcherEl) return;
        platformSwitcherEl.innerHTML = '';
        renderPlatformKindToggle();
        getPlatformOrderForKind().forEach(platformId => {
          const platform = getPlatformConfig(platformId);
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'platform-switcher-item';
          button.dataset.platformId = platform.id;
          button.setAttribute('role', 'tab');
          button.setAttribute('aria-selected', String(platform.id === activePlatformId));
          if (platform.id === activePlatformId) {
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
          button.addEventListener('click', () => {
            setActivePlatform(platform.id);
          });
          platformSwitcherEl.appendChild(button);
        });
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
        Object.entries(fieldMap).forEach(([key, fieldEl]) => {
          if (!fieldEl) return;
          const visible = visibleFields.has(key);
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
          runBtn.disabled = !isSupported;
          runBtn.textContent = isSupported ? '发送请求' : '平台待接入';
        }
        if (fetchModelsBtn) fetchModelsBtn.disabled = !isSupported;
      }
      function persistActivePlatformSnapshot() {
        savePlatformSettings(activePlatformId);
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
      }

      function setActivePlatformKind(kind) {
        const nextKind = kind === 'video' ? 'video' : 'image';
        activePlatformKind = nextKind;
        localStorage.setItem(ACTIVE_PLATFORM_KIND_STORAGE_KEY, activePlatformKind);
        const nextPlatformId = ensurePlatformMatchesKind(activePlatformId, activePlatformKind);
        setActivePlatform(nextPlatformId);
      }

      function getReferenceImageLimit(protocol = getProtocol()) {
        if (activePlatformId === 'openaiVideo' && protocol === 'openai-videos') return 1;
        if (activePlatformId === 'geminiVideo') return 3;
        if (activePlatformId === 'qwenVideo') return String(getImageModel() || '').includes('r2v') ? 9 : 1;
        if (activePlatformId === 'doubaoVideo') return 4;
        if (activePlatformId === 'grokVideo') return 4;
        if (activePlatformId === 'flux' && protocol === 'replicate-flux') return 1;
        if (activePlatformId === 'doubao' && (protocol === 'doubao-images' || protocol === 'open-images')) return 14;
        if (protocol === 'open-images' || protocol === 'aliyun-images') return 3;
        return protocol === 'gemini' ? 14 : 4;
      }

      function getReferenceImagesForRequest(images = state.images, protocol = getProtocol()) {
        return (images || []).slice(0, getReferenceImageLimit(protocol));
      }

      function isGoogleNativeEndpoint(key = getApiKey()) {
        return /(^|\.)googleapis\.com$/i.test(new URL(getBaseUrl(), window.location.href).hostname)
          || /^AIza[0-9A-Za-z_-]{20,}$/.test(String(key || '').trim());
      }

      function resolveImageEndpoint() {
        const platformConfig = getActivePlatformConfig();
        if (typeof platformConfig.endpointResolver === 'function') {
          const resolved = platformConfig.endpointResolver({
            protocol: getProtocol(),
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
        if (protocol === 'gemini' && isGoogleNativeEndpoint(key)) {
          headers['x-goog-api-key'] = key;
        } else {
          headers['Authorization'] = `Bearer ${key}`;
        }
        return headers;
      }

      function getModelListEndpoints(protocol = getProtocol()) {
        if (protocol === 'gemini') {
          return [buildApiUrl('/v1beta/models'), buildApiUrl('/v1/models')];
        }
        if (protocol === 'aliyun-images' || protocol === 'aliyun-happyhorse') {
          return [buildApiUrl('/compatible-mode/v1/models'), buildApiUrl('/v1/models')];
        }
        if (protocol === 'doubao-seedance') {
          return [buildApiUrl('/v1/models')];
        }
        return [buildApiUrl('/v1/models')];
      }

      // 获取生图 endpoint（根据协议自动切换）
      function getEndpoint() {
        const protocol = getProtocol();
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

          persistTextApiKey(dialogKeyValue, !!rememberApiKeyInput?.checked);
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
      const settingsOpenBtn = document.getElementById('settings-open-btn');
      const settingsCloseBtn = document.getElementById('settings-close-btn');
      const settingsDrawer = document.getElementById('settings-drawer');
      const settingsDrawerOverlay = document.getElementById('settings-drawer-overlay');
      const platformSwitcherEl = document.getElementById('platform-switcher');
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

      function openSettingsDrawer() {
        if (!settingsDrawer || !settingsDrawerOverlay) return;
        settingsDrawer.classList.add('active');
        settingsDrawer.setAttribute('aria-hidden', 'false');
        settingsDrawerOverlay.classList.add('active');
        settingsDrawerOverlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('settings-drawer-open');
      }

      function closeSettingsDrawer() {
        if (!settingsDrawer || !settingsDrawerOverlay) return;
        settingsDrawer.classList.remove('active');
        settingsDrawer.setAttribute('aria-hidden', 'true');
        settingsDrawerOverlay.classList.remove('active');
        settingsDrawerOverlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('settings-drawer-open');
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
        if (e.key === 'Escape' && settingsDrawer?.classList.contains('active')) {
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

      function getVideoExtensionFromSrc(src, fallback = 'mp4') {
        const mime = src?.match(/^data:([^;]+);/)?.[1] || guessMimeFromUrl(src || '');
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

        if (record.imageUrl) {
          const ext = guessMimeFromUrl(record.imageUrl) ? getExtensionFromMime(guessMimeFromUrl(record.imageUrl)) : 'png';
          return `history-original-${record.timestamp || Date.now()}.${ext}`;
        }

        const ext = getImageExtensionFromSrc(record.imageSrc, 'png');
        return `history-original-${record.timestamp || Date.now()}.${ext}`;
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

        if (record.imageUrl) {
          return {
            src: record.imageUrl,
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

      async function getHistoryDownloadVideo(record) {
        if (record.filename && folderHandle) {
          try {
            const src = await loadFileFromFolder(record.filename);
            return {
              src,
              filename: record.filename,
              quality: 'original'
            };
          } catch (err) {
            console.warn('读取历史视频原文件失败，改用视频链接下载:', err);
          }
        }

        if (record.videoSrc || record.videoUrl) {
          return {
            src: record.videoSrc || record.videoUrl,
            filename: record.filename || `history-video-${record.timestamp || Date.now()}.mp4`,
            quality: 'original'
          };
        }

        throw new Error('这条历史记录没有可下载的视频');
      }

      async function openHistoryPreview(record) {
        if (record.mediaType === 'video') {
          let videoSrc = record.videoSrc || record.videoUrl;
          if (record.filename && folderHandle) {
            try {
              videoSrc = await loadFileFromFolder(record.filename);
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
          alert('这条历史记录没有可播放的视频');
          return;
        }

        if (record.filename && folderHandle) {
          try {
            const src = await loadImageFromFolder(record.filename);
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
          alert('这条历史记录没有可预览的图片');
        }
      }

      function openVideoLightbox(videoSrc) {
        if (!videoSrc) {
          alert('这条历史记录没有可播放的视频');
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

        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('.video-lightbox-close')?.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) close();
        });
        overlay.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') close();
        });
        overlay.tabIndex = -1;
        overlay.focus();
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

      async function fetchMediaBlob(src, label = '媒体') {
        if (!src) throw new Error(`${label}地址为空`);

        async function fetchBlob(url) {
          const response = await fetch(url, { cache: 'no-store' });
          if (!response.ok) {
            throw new Error(`${label}读取失败: HTTP ${response.status}`);
          }
          return response.blob();
        }

        try {
          return await fetchBlob(src);
        } catch (err) {
          if (!canProxyMediaUrl(src)) throw err;

          console.warn(`${label}直连读取失败，尝试通过代理读取:`, err);
          try {
            return await fetchBlob(buildApiProxyUrlForTarget(src));
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
            const isVideoRecord = record.mediaType === 'video';
            const previewMarkup = isVideoRecord
              ? (record.thumbnail
                ? `<img class="history-video-poster" src="${escapeHtml(record.thumbnail)}" alt="视频封面">`
                : `<div class="history-video-placeholder"><span class="history-video-play-icon">▶</span><span>视频</span></div>`)
              : `<img src="${record.thumbnail}" alt="缩略图">`;
            const primaryActionMarkup = isVideoRecord
              ? `<button class="action-btn play-btn" type="button" title="播放历史视频"><span class="action-icon">▶</span><span class="action-text">播放</span></button>`
              : `<button class="action-btn add-btn" title="${hasFilename ? '添加到参考图' : '需要保存文件夹原图才能添加到参考图'}" ${hasFilename ? '' : 'disabled'}><span class="action-icon">➕</span><span class="action-text">参考</span></button>`;

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

            // 点击缩略图放大查看
            card.querySelector(isVideoRecord ? '.history-image-wrap' : 'img')?.addEventListener('click', () => {
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
                alert('复制失败，请手动选择文本复制');
              }
            });

            // 添加到参考图按钮
            const addBtn = card.querySelector('.add-btn');
            if (addBtn && hasFilename && !isVideoRecord) {
              addBtn.addEventListener('click', async (e) => {
                e.stopPropagation();

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
                      flashStatus('已打开历史原图链接，可直接下载原图', 'success');
                    } else {
                      flashStatus('已开始下载历史原图', 'success');
                    }
                  } else if (record.filename) {
                    flashStatus('未选择或未找到原保存文件夹，已下载历史缩略图', 'danger');
                  } else {
                    flashStatus('已开始下载历史缩略图', 'success');
                  }
                } catch (err) {
                  console.error(isVideoRecord ? '下载历史视频失败:' : '下载历史图片失败:', err);
                  alert(err.message || (isVideoRecord ? '下载历史视频失败' : '下载历史图片失败'));
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
          videoDuration: videoDurationSelect?.value || '',
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
          protocol: { gemini: 'Gemini 原生', 'openai-chat': 'OpenAI Chat', 'openai-images': 'OpenAI Images', 'openai-responses': 'OpenAI Responses', 'open-images': 'Open Images', 'aliyun-images': '阿里云百炼', 'doubao-images': '豆包官方', 'replicate-flux': 'Replicate 官方', 'openai-videos': 'OpenAI Videos', 'openai-video-chat': 'OpenAI Chat 兼容', 'veo-generations': 'Veo Generations', 'veo-create': 'Video Create', 'aliyun-happyhorse': '阿里 HappyHorse', 'doubao-seedance': '豆包 Seedance', 'grok-video-create': 'Grok Video Create' }
        };
        if (key === 'videoDuration') return `${normalized} 秒`;
        return maps[key]?.[normalized] || normalized;
      }

      function getHistoryParamRows(record) {
        const rows = record.mediaType === 'video'
          ? [
              ['视频比例', 'aspect', record.aspect],
              ['视频清晰度', 'resolution', record.resolution],
              ['视频时长', 'videoDuration', record.videoDuration],
              ['视频模型', 'model', record.model],
              ['API 协议', 'protocol', record.protocol],
              ['生成耗时', 'runtimeMs', record.runtimeMs ? formatDurationMs(record.runtimeMs) : '']
            ]
          : [
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
        if (!isActivePlatformSupported()) {
          flashStatus('当前平台尚未接入模型管理，请先切换到已接入平台', 'danger');
          return;
        }
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

      function deleteCurrentModel(type) {
        if (!isActivePlatformSupported()) {
          flashStatus('当前平台尚未接入模型管理，请先切换到已接入平台', 'danger');
          return;
        }
        const label = type === 'image' ? '生图模型' : '文本优化模型';
        const targetSelect = type === 'image' ? imageModelSelect : textModelSelect;
        const storageKey = type === 'image' ? IMAGE_MODEL_STORAGE_PREFIX : TEXT_MODEL_STORAGE_PREFIX;
        const modelId = targetSelect.value;
        if (!modelId) {
          flashStatus(`没有可删除的${label}`, 'danger');
          return;
        }
        if (!confirm(`确定删除当前${label}？\n${modelId}`)) return;

        removeModelOption(imageModelSelect, modelId);
        removeModelOption(textModelSelect, modelId);
        deleteStoredModel(modelId);
        localStorage.setItem(getPlatformStorageKey(IMAGE_MODEL_STORAGE_PREFIX), imageModelSelect.value || '');
        localStorage.setItem(getPlatformStorageKey(TEXT_MODEL_STORAGE_PREFIX), textModelSelect.value || '');
        localStorage.setItem(getPlatformStorageKey(storageKey), targetSelect.value || '');
        flashStatus(`已删除模型: ${modelId}`, 'success');
      }

      async function fetchModelList() {
        if (!isActivePlatformSupported()) {
          flashStatus('当前平台尚未接入模型拉取，请先切换到已接入平台', 'danger');
          return;
        }
        const key = getApiKey();
        if (!key) { flashStatus('请先填写 API Key', 'danger'); return; }
        const protocol = getProtocol();

        fetchModelsBtn.disabled = true;
        fetchModelsBtn.textContent = '拉取中...';

        try {
          const endpoints = getModelListEndpoints(protocol);
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

          setStoredModels(models);
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
        if (proxyModeInput) {
          proxyModeInput.checked = localStorage.getItem(API_PROXY_MODE_KEY) === '1';
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
      }

      function saveSettings() {
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

      function buildOpenAIResponsesImagePayload(prompt, imgs = [], model = getImageModel()) {
        const content = imgs.length
          ? [
              { type: 'input_text', text: prompt },
              ...imgs.map(img => ({
                type: 'input_image',
                image_url: img.dataUrl
              }))
            ]
          : prompt;

        return {
          model,
          input: [{ role: 'user', content }],
          stream: false
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

      function getVideoAspectInfo() {
        const aspect = aspectSelect?.value || '16:9';
        const normalized = aspect === '9:16' || aspect === '2:3' || aspect === '3:4' || aspect === '4:5'
          ? '9:16'
          : '16:9';
        const resolution = resolutionSelect?.value || '720P';
        const useHighRes = resolution === '1080P';
        return {
          aspect: normalized,
          orientation: normalized === '9:16' ? 'portrait' : 'landscape',
          openAiSize: normalized === '9:16'
            ? (useHighRes ? '1024x1792' : '720x1280')
            : (useHighRes ? '1792x1024' : '1280x720')
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
        const value = aspectSelect?.value || '16:9';
        return ['16:9', '9:16', '1:1', '4:3', '3:4'].includes(value) ? value : '16:9';
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
        const value = aspectSelect?.value || '16:9';
        return ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].includes(value) ? value : '16:9';
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
        const value = aspectSelect?.value || '3:2';
        return ['3:2', '2:3', '1:1'].includes(value) ? value : '3:2';
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
          throw new Error(data.error || 'Replicate 任务失败');
        }
        if (String(data?.status || '').toLowerCase() === 'canceled') {
          throw new Error(data.error || 'Replicate 任务已取消');
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

      async function sendVideoRequest(request, label = 'video') {
        debugLog('[callVideoAPI] request:', {
          label,
          endpoint: request.endpoint,
          contentType: request.headers?.['Content-Type'] || '(multipart)',
          hasBody: !!request.body
        });

        const controller = new AbortController();
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
          if (fetchErr.name === 'AbortError') throw new Error('视频请求超时（10分钟），请稍后重试');
          throw fetchErr;
        }
        clearTimeout(timeoutId);

        const raw = await res.text();
        debugLog(`[callVideoAPI] raw response (${label}):`, raw.slice(0, 2000));
        let data;
        try { data = JSON.parse(raw); } catch (_) { data = raw; }
        return { ok: res.ok, status: res.status, raw, data };
      }

      async function sendVideoGet(endpoint, key, label = 'video-poll') {
        return sendVideoRequest({
          method: 'GET',
          endpoint,
          headers: { 'Authorization': `Bearer ${key}`, 'Accept': 'application/json' }
        }, label);
      }

      async function fetchVideoContentUrl(videoId, key) {
        if (!videoId) return '';
        const endpoint = buildApiUrl(`/v1/videos/${encodeURIComponent(videoId)}/content`);
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${key}` }
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

      async function pollVideoTask(initialResponse, key, protocol) {
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
              finalUrl = await fetchVideoContentUrl(id, key);
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

          await new Promise(resolve => setTimeout(resolve, 3000));
          const endpoint = isVeoProtocol
            ? buildApiUrl(`/v1/video/query?id=${encodeURIComponent(id)}`)
            : isHappyHorseProtocol
              ? buildApiUrl(`/alibailian/api/v1/tasks/${encodeURIComponent(id)}`)
              : isDoubaoSeedanceProtocol
                ? buildApiUrl(`/volc/v1/contents/generations/tasks/${encodeURIComponent(id)}`)
                : isGrokVideoCreateProtocol
                  ? buildApiUrl(`/v1/video/query?id=${encodeURIComponent(id)}`)
            : buildApiUrl(`/v1/videos/${encodeURIComponent(id)}`);
          const pollResponse = await sendVideoGet(endpoint, key, isVeoProtocol ? 'veo-video-query' : (isHappyHorseProtocol ? 'aliyun-happyhorse-query' : (isDoubaoSeedanceProtocol ? 'doubao-seedance-query' : (isGrokVideoCreateProtocol ? 'grok-video-query' : 'openai-videos-query'))));
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
            imageUrl = p.file_data?.file_uri || p.fileData?.fileUri;
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
        return result.imageUrl || '';
      }

      function getResultVideoSrc(result) {
        if (!result) return '';
        return result.videoSrc || result.videoUrl || '';
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

      async function warmContinueImageSource(sourceState) {
        if (!sourceState) return '';
        if (sourceState.cachedSrc) return sourceState.cachedSrc;
        if (!sourceState.displaySrc) {
          sourceState.failed = true;
          sourceState.error = '当前图片没有可用图源';
          return '';
        }

        try {
          const persistentSrc = await getPersistentImageSource(sourceState.displaySrc);
          sourceState.cachedSrc = persistentSrc;
          sourceState.failed = false;
          sourceState.error = '';
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
        return fetchMediaBlob(src, '图片');
      }

      // 判断 result 是否包含图片
      function hasResultImage(result) {
        return !!(result && (result.imageBase64 || result.imageUrl));
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
        const key = getTextApiKey();
        if (!key) throw new Error('请先配置 API Key');

        const payload = buildTextApiPayload(promptText, options);

        const res = await fetch(buildApiUrl('/v1/chat/completions'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
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
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
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
          if (value) showSavePromptDialog(value);
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
        } else if (protocol === 'aliyun-images') {
          const request = buildAliyunImageRequest(prompt, imgs, imageModel, key);
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          response = await sendImageRequest(request, 'aliyun-images');
        } else if (protocol === 'doubao-images') {
          const request = buildDoubaoImageRequest(prompt, imgs, imageModel, key);
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          response = await sendImageRequest(request, 'doubao-images');
        } else if (protocol === 'replicate-flux') {
          const request = buildReplicateFluxRequest(prompt, imgs, imageModel, key);
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          response = await sendImageRequest(request, 'replicate-flux-create');
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
          response = await sendImageRequest(request, label);
        } else if (protocol === 'openai-chat') {
          const payload = buildOpenAIChatImagePayload(prompt, imgs, imageModel);
          const request = {
            endpoint: resolveImageEndpoint(),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(payload)
          };
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          response = await sendImageRequest(request, protocol);
        } else if (protocol === 'openai-responses') {
          const payload = buildOpenAIResponsesImagePayload(prompt, imgs, imageModel);
          const request = {
            endpoint: resolveImageEndpoint(),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(payload)
          };
          debugLog('[callImageAPI] protocol:', protocol, 'endpoint:', request.endpoint, 'hasImages:', imgs.length > 0);
          response = await sendImageRequest(request, 'openai-responses');
        } else {
          // Gemini 原生
          const payload = buildGeminiImagePayload(prompt, imgs);
          const request = {
            endpoint: resolveImageEndpoint(),
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

      async function callVideoAPI(prompt, images) {
        const key = getApiKey();
        if (!key) throw new Error('请先配置 API Key');
        if (activePlatformId !== 'openaiVideo' && activePlatformId !== 'geminiVideo' && activePlatformId !== 'qwenVideo' && activePlatformId !== 'doubaoVideo' && activePlatformId !== 'grokVideo') {
          throw new Error('当前视频平台暂未接入');
        }

        const protocol = getProtocol();
        const videoModel = getImageModel();
        const imgs = getReferenceImagesForRequest((images || []).filter(img => img.dataUrl), protocol);
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

        let response = await sendVideoRequest(request, protocol);
        if (!response.ok) {
          const errorText = extractApiErrorMessage(response.data) || response.raw || `API 错误: ${response.status}`;
          throw new Error(errorText || `API 错误: ${response.status}`);
        }

        response = await pollVideoTask(response, key, protocol);
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

      function buildResultCard(result, meta = {}) {
        const card = document.createElement('div');
        card.className = 'card result-card';
        if (hasResultVideo(result)) {
          return buildVideoResultCard(result, meta, card);
        }
        if (!hasResultImage(result)) return card;

        const imgSrc = getResultImgSrc(result);
        const continueSource = buildContinueSourceState(imgSrc);
        const filename = meta.filename || `gemini-${Date.now()}.${getExtensionFromMime(result.mime)}`;
        card._continueSource = continueSource;

        const imageButton = document.createElement('button');
        imageButton.className = 'result-thumb-btn';
        imageButton.type = 'button';
        imageButton.title = '点击查看原图';
        imageButton.setAttribute('aria-label', '查看原图');

        const imgEl = document.createElement('img');
        imgEl.src = imgSrc;
        imgEl.className = 'zoomable';
        imgEl.alt = meta.label || '生成结果';
        imageButton.appendChild(imgEl);
        imageButton.addEventListener('click', () => openLightbox(imgSrc));
        card.appendChild(imageButton);

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
        downloadLink.href = imgSrc;
        downloadLink.download = filename;
        actions.appendChild(downloadLink);

        const saveAlbumBtn = document.createElement('button');
        saveAlbumBtn.className = 'mini-btn primary';
        saveAlbumBtn.type = 'button';
        saveAlbumBtn.textContent = isMobileDevice() ? '保存相册' : '保存';
        saveAlbumBtn.addEventListener('click', () => handleSaveToAlbum(imgSrc, filename));
        actions.appendChild(saveAlbumBtn);

        const continueBtn = document.createElement('button');
        continueBtn.className = 'mini-btn primary continue-result-btn';
        continueBtn.type = 'button';
        continueBtn.textContent = '续图';
        applyContinueSourceAvailability(continueBtn, continueSource);
        actions.appendChild(continueBtn);
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

          // 自动保存历史记录和下载图片
          try {
            let imageRecord;
            try {
              const persistentImgSrc = await warmContinueImageSource(continueSource);
              if (!persistentImgSrc) {
                applyContinueSourceAvailability(continueBtn, continueSource);
                throw new Error(continueSource.error || '图片缓存失败');
              }
              applyContinueSourceAvailability(continueBtn, continueSource);
              imageRecord = await resolveHistoryImageRecord(persistentImgSrc);
            } catch (imageErr) {
              console.warn('结果图无法缓存为本地数据，历史记录降级为 URL 记录:', imageErr);
              imageRecord = await buildHistoryImageRecordFallback(imgSrc);
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
            if (shouldSaveHistoryOriginal() && imageRecord.persistentSrc) {
              historyRecord.imageSrc = imageRecord.persistentSrc;
            } else if (!imageRecord.persistentSrc) {
              historyRecord.imageUrl = imgSrc;
            }
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
              const persistentImgSrc = await warmContinueImageSource(continueSource);
              if (!persistentImgSrc) {
                applyContinueSourceAvailability(continueBtn, continueSource);
                throw new Error(continueSource.error || '图片不可用');
              }
              applyContinueSourceAvailability(continueBtn, continueSource);
              imageRecord = await resolveHistoryImageRecord(persistentImgSrc);
            } catch (imageErr) {
              console.warn('继续生成源图不可用，改用原始 URL 记录:', imageErr);
              imageRecord = await buildHistoryImageRecordFallback(imgSrc);
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
            if (shouldSaveHistoryOriginal() && imageRecord.persistentSrc) {
              historyRecord.imageSrc = imageRecord.persistentSrc;
            } else if (!imageRecord.persistentSrc) {
              historyRecord.imageUrl = imgSrc;
            }
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
        resultsEl.innerHTML = '';
        resultCountEl.textContent = '0 条';
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

        const savePreflightResult = await preflightSaveFolderPermission();

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
            const result = getActivePlatformConfig().kind === 'video'
              ? await callVideoAPI(prompt, getReferenceImagesForRequest())
              : await callImageAPI(prompt, getReferenceImagesForRequest());
            const durationMs = performance.now() - startedAt;

            // 替换占位符为真实结果
            await replaceCardWithResult(placeholderCard, result, getCurrentGenerationParams({
              prompt,
              runtimeMs: durationMs,
              savePreflightResult
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
      async function appendResultToGroup(groupContainer, result, angleName, actualElapsedMs, retryPrompt, savePreflightResult = null) {
        const gridEl = groupContainer.querySelector('.result-group-grid');
        if (!gridEl || !result || !hasResultImage(result)) return;

        const card = document.createElement('div');
        card.className = 'card';

        const imgSrc = getResultImgSrc(result);
        const continueSource = buildContinueSourceState(imgSrc);

        const imageButton = document.createElement('button');
        imageButton.className = 'result-thumb-btn';
        imageButton.type = 'button';
        imageButton.title = '点击查看原图';
        imageButton.setAttribute('aria-label', '查看原图');

        const imgEl = document.createElement('img');
        imgEl.src = imgSrc;
        imgEl.className = 'zoomable';
        imgEl.alt = angleName || '生成结果';
        imageButton.appendChild(imgEl);
        imageButton.addEventListener('click', () => openLightbox(imgSrc));
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
        downloadLink.href = imgSrc;
        downloadLink.download = `${angleName}-${Date.now()}.${getExtensionFromMime(result.mime)}`;
        actions.appendChild(downloadLink);

        const saveAlbumBtn = document.createElement('button');
        saveAlbumBtn.className = 'mini-btn primary';
        saveAlbumBtn.textContent = isMobileDevice() ? '保存相册' : '保存';
        saveAlbumBtn.addEventListener('click', () => handleSaveToAlbum(imgSrc, downloadLink.download));
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

              imgEl.src = newImgSrc;
              downloadLink.href = newImgSrc;
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
              if (shouldSaveHistoryOriginal() && imageRecord.persistentSrc) {
                historyRecord.imageSrc = imageRecord.persistentSrc;
              } else if (!imageRecord.persistentSrc) {
                historyRecord.imageUrl = newImgSrc;
              }
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
            const persistentImgSrc = await warmContinueImageSource(continueSource);
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
          if (shouldSaveHistoryOriginal() && imageRecord.persistentSrc) {
            historyRecord.imageSrc = imageRecord.persistentSrc;
          } else if (!imageRecord.persistentSrc) {
            historyRecord.imageUrl = imgSrc;
          }
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
      const promptLibraryOpenBtn = document.getElementById('prompt-library-open-btn');
      const promptLibraryDialog = document.getElementById('prompt-library-dialog');
      const promptLibraryCloseBtn = document.getElementById('prompt-library-close-btn');
      const promptLibraryPanel = document.getElementById('prompt-library-panel');
      const promptLibraryToggleBtn = document.getElementById('prompt-library-toggle');
      const promptLibrarySearchInput = document.getElementById('prompt-library-search');
      const importPromptsBtn = document.getElementById('import-prompts-btn');
      const exportLocalPromptsBtn = document.getElementById('export-local-prompts-btn');
      const importPromptsFile = document.getElementById('import-prompts-file');
      const optimizePromptBtn = document.getElementById('optimize-prompt-btn');
      const advancedToolsPanel = document.getElementById('advanced-tools-panel');
      const advancedToolsToggleBtn = document.getElementById('advanced-tools-toggle');
      const storyboardToolBtn = document.getElementById('storyboard-tool-btn');
      const angleToolBtn = document.getElementById('angle-tool-btn');
      const reversePromptToolBtn = document.getElementById('reverse-prompt-tool-btn');

      function setPromptLibraryCollapsed(collapsed) {
        if (!promptLibraryPanel || !promptLibraryToggleBtn) return;
        promptLibraryPanel.classList.toggle('collapsed', collapsed);
        promptLibraryToggleBtn.setAttribute('aria-expanded', String(!collapsed));
      }

      function openPromptLibraryDialog() {
        if (!promptLibraryDialog) return;
        promptLibraryDialog.classList.add('active');
        promptLibraryDialog.setAttribute('aria-hidden', 'false');
        document.body.classList.add('dialog-open');
        setPromptLibraryCollapsed(false);
        renderPromptLibrary();
        setTimeout(() => promptLibrarySearchInput?.focus(), 80);
      }

      function closePromptLibraryDialog() {
        if (!promptLibraryDialog) return;
        promptLibraryDialog.classList.remove('active');
        promptLibraryDialog.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('dialog-open');
      }

      function setAdvancedToolsCollapsed(collapsed) {
        if (!advancedToolsPanel || !advancedToolsToggleBtn) return;
        advancedToolsPanel.classList.toggle('collapsed', collapsed);
        advancedToolsToggleBtn.setAttribute('aria-expanded', String(!collapsed));
      }

      function updateProviderStudioStatus() {
        syncPlatformSummary();
      }

      setPromptLibraryCollapsed(false);
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
          setHistoryImageRetention(option.dataset.value, { persist: true, notify: true });
        });
      });
      runBtn.addEventListener('click', handleRun);
      baseUrlInput.addEventListener('input', () => {
        persistActivePlatformSnapshot();
        updateProviderStudioStatus();
      });
      proxyModeInput?.addEventListener('change', () => {
        persistActivePlatformSnapshot();
        updateProviderStudioStatus();
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

        showSavePromptDialog(promptContent);
      });

      promptLibrarySearchInput?.addEventListener('input', () => {
        renderPromptLibrary();
      });

      promptLibraryOpenBtn?.addEventListener('click', openPromptLibraryDialog);
      promptLibraryCloseBtn?.addEventListener('click', closePromptLibraryDialog);
      promptLibraryDialog?.addEventListener('click', (e) => {
        if (e.target === promptLibraryDialog) closePromptLibraryDialog();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && promptLibraryDialog?.classList.contains('active')) {
          closePromptLibraryDialog();
        }
      });

      promptLibraryToggleBtn?.addEventListener('click', () => {
        setPromptLibraryCollapsed(!promptLibraryPanel?.classList.contains('collapsed'));
      });
      advancedToolsToggleBtn?.addEventListener('click', () => {
        setAdvancedToolsCollapsed(!advancedToolsPanel?.classList.contains('collapsed'));
      });
      storyboardToolBtn?.addEventListener('click', () => {
        if (!ensurePlatformFeatureAvailable('分镜生成')) return;
        showStoryboardInput();
      });
      angleToolBtn?.addEventListener('click', () => {
        if (!ensurePlatformFeatureAvailable('产品角度')) return;
        openAngleModal();
      });
      reversePromptToolBtn?.addEventListener('click', () => {
        if (!ensurePlatformFeatureAvailable('反推提示词')) return;
        showReversePromptDialog();
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

      platformKindButtons.forEach(button => {
        button.addEventListener('click', () => {
          setActivePlatformKind(button.dataset.platformKind);
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
          renderPromptLibrary();
        }, 150);

        scheduleNonCriticalTask(() => {
          renderHistory();
        }, 300);
      }).catch(err => {
        console.error('初始化数据库失败:', err);
      });
    })();
  
