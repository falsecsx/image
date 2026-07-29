/**
 * Shared image/video aspect-ratio helpers.
 * Loaded before app.js; attaches to window.ImageRatio.
 */
(function (global) {
  const ASPECT_VALUES = new Set([
    'auto', '1:1', '2:3', '3:4', '4:5', '5:4',
    '4:3', '3:2', '16:9', '9:16', '21:9'
  ]);

  const COMPATIBLE_SIZE_MAP = {
    auto: '1024x1024',
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

  const RESOLUTION_LONG_SIDE = {
    '1K': 1024,
    '2K': 2048,
    '4K': 3840
  };

  const VIDEO_PROTOCOL_ASPECTS = {
    'openai-videos': ['16:9', '9:16'],
    'openai-video-chat': ['16:9', '9:16'],
    'veo-generations': ['16:9', '9:16', '1:1'],
    'veo-create': ['16:9', '9:16', '1:1'],
    'aliyun-happyhorse': ['16:9', '9:16', '1:1', '4:3', '3:4'],
    'doubao-seedance': ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    'grok-video-create': ['3:2', '2:3', '1:1']
  };

  const VIDEO_FALLBACK_ASPECT = {
    'openai-videos': '16:9',
    'openai-video-chat': '16:9',
    'veo-generations': '16:9',
    'veo-create': '16:9',
    'aliyun-happyhorse': '16:9',
    'doubao-seedance': '16:9',
    'grok-video-create': '3:2'
  };

  function normalizeAspectRatio(value) {
    const normalized = String(value || 'auto').trim();
    return ASPECT_VALUES.has(normalized) ? normalized : 'auto';
  }

  function normalizeResolution(value, fallback = '1K') {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return fallback;
    if (raw === '1K' || raw === '2K' || raw === '4K') return raw;
    if (raw === '512') return '1K';
    if (raw === '720P' || raw === '720') return '1K';
    if (raw === '1080P' || raw === '1080') return '2K';
    if (raw === '3K') return '2K';
    return fallback;
  }

  function parseAspectRatio(value) {
    const normalized = normalizeAspectRatio(value);
    if (normalized === 'auto') return null;
    const [width, height] = normalized.split(':').map(Number);
    if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return null;
    return width / height;
  }

  function parseRatioParts(value) {
    const normalized = normalizeAspectRatio(value);
    if (normalized === 'auto') return null;
    const [width, height] = normalized.split(':').map(Number);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return { width, height };
  }

  function isPortraitAspect(value) {
    return ['2:3', '3:4', '4:5', '9:16'].includes(normalizeAspectRatio(value));
  }

  function isLandscapeAspect(value) {
    return ['5:4', '4:3', '3:2', '16:9', '21:9'].includes(normalizeAspectRatio(value));
  }

  function roundToMultiple(value, multiple = 16) {
    const step = Math.max(1, Number(multiple) || 16);
    return Math.max(step, Math.round(Number(value) / step) * step);
  }

  function isDalleModel(modelName = '') {
    const model = String(modelName || '').trim().toLowerCase();
    return /^dall[-_]?e[-_]?/.test(model) || /^dalle[-_]?/.test(model);
  }

  function isDalle2Model(modelName = '') {
    const model = String(modelName || '').trim().toLowerCase();
    return model.includes('dall-e-2') || model.includes('dalle-2');
  }

  function getLegacyCompatibleSize(aspect, modelName = '') {
    const normalizedAspect = normalizeAspectRatio(aspect);
    if (isDalleModel(modelName)) {
      if (isDalle2Model(modelName)) return '1024x1024';
      if (isPortraitAspect(normalizedAspect)) return '1024x1792';
      if (isLandscapeAspect(normalizedAspect)) return '1792x1024';
      return '1024x1024';
    }
    return COMPATIBLE_SIZE_MAP[normalizedAspect] || COMPATIBLE_SIZE_MAP.auto;
  }

  function resolveImageSize({ aspect = 'auto', resolution = '1K', model = '' } = {}) {
    const normalizedAspect = normalizeAspectRatio(aspect);
    const modelName = String(model || '').trim();

    if (isDalleModel(modelName)) {
      return getLegacyCompatibleSize(normalizedAspect, modelName);
    }

    if (normalizedAspect === 'auto') {
      return '';
    }

    const parts = parseRatioParts(normalizedAspect);
    if (!parts) return getLegacyCompatibleSize(normalizedAspect, modelName);

    const outputSize = normalizeResolution(resolution, '1K');
    const { width: ratioWidth, height: ratioHeight } = parts;

    if (ratioWidth === ratioHeight) {
      const side = RESOLUTION_LONG_SIDE[outputSize] || 1024;
      return `${side}x${side}`;
    }

    if (outputSize === '1K') {
      const shortSide = 1024;
      const width = ratioWidth > ratioHeight
        ? roundToMultiple(shortSide * ratioWidth / ratioHeight, 16)
        : shortSide;
      const height = ratioWidth > ratioHeight
        ? shortSide
        : roundToMultiple(shortSide * ratioHeight / ratioWidth, 16);
      return `${width}x${height}`;
    }

    const longSide = RESOLUTION_LONG_SIDE[outputSize] || 2048;
    const width = ratioWidth > ratioHeight
      ? longSide
      : roundToMultiple(longSide * ratioWidth / ratioHeight, 16);
    const height = ratioWidth > ratioHeight
      ? roundToMultiple(longSide * ratioHeight / ratioWidth, 16)
      : longSide;
    return `${width}x${height}`;
  }

  function getOpenAICompatibleSize(aspect, modelName = '', resolution = '1K') {
    if (typeof aspect === 'object' && aspect) {
      return resolveImageSize(aspect);
    }
    return resolveImageSize({ aspect, model: modelName, resolution });
  }

  function buildAspectInstruction(aspect) {
    const normalizedAspect = normalizeAspectRatio(aspect);
    if (normalizedAspect === 'auto') return '';
    return [
      '',
      '[Image output requirements]',
      `Aspect ratio: ${normalizedAspect}`,
      `The output image canvas must use exactly ${normalizedAspect}. Do not return a square image.`
    ].join('\n');
  }

  function buildRequestContext({ aspect = 'auto', resolution = '', model = '', referenceWidth, referenceHeight } = {}) {
    let normalizedAspect = normalizeAspectRatio(aspect);
    let inferredFromReference = false;

    if (normalizedAspect === 'auto' && Number(referenceWidth) > 0 && Number(referenceHeight) > 0) {
      const closest = detectClosestAspectRatio(referenceWidth, referenceHeight);
      if (closest && closest !== 'auto') {
        normalizedAspect = closest;
        inferredFromReference = true;
      }
    }

    const normalizedResolution = normalizeResolution(resolution, '1K');
    const size = resolveImageSize({
      aspect: normalizedAspect,
      resolution: normalizedResolution,
      model
    });

    return {
      aspect: normalizedAspect,
      requestedAspect: normalizeAspectRatio(aspect),
      inferredFromReference,
      ratio: parseAspectRatio(normalizedAspect),
      resolution: normalizedResolution,
      size,
      instruction: buildAspectInstruction(normalizedAspect)
    };
  }

  function formatAspectRatio(width, height) {
    const numericWidth = Math.round(Number(width));
    const numericHeight = Math.round(Number(height));
    if (numericWidth <= 0 || numericHeight <= 0) return '';

    let a = numericWidth;
    let b = numericHeight;
    while (b) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    return `${numericWidth / a}:${numericHeight / a}`;
  }

  function compareAspect(width, height, aspect, tolerance = 0.02) {
    const expected = parseAspectRatio(aspect);
    const actualWidth = Number(width);
    const actualHeight = Number(height);
    if (!expected || actualWidth <= 0 || actualHeight <= 0) return null;
    const actual = actualWidth / actualHeight;
    return Math.abs(actual - expected) / expected <= tolerance;
  }

  function detectClosestAspectRatio(width, height, options) {
    const list = Array.isArray(options) && options.length
      ? options
      : [...ASPECT_VALUES].filter(value => value !== 'auto');
    const actualWidth = Number(width);
    const actualHeight = Number(height);
    if (!(actualWidth > 0) || !(actualHeight > 0) || !list.length) return '1:1';

    const targetRatio = actualWidth / actualHeight;
    let closest = normalizeAspectRatio(list[0]) === 'auto' ? '1:1' : normalizeAspectRatio(list[0]);
    let closestDistance = Number.POSITIVE_INFINITY;

    list.forEach(option => {
      const value = typeof option === 'string' ? option : option?.value;
      const normalized = normalizeAspectRatio(value);
      if (normalized === 'auto') return;
      const parts = parseRatioParts(normalized);
      if (!parts) return;
      const distance = Math.abs((parts.width / parts.height) - targetRatio);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = normalized;
      }
    });

    return closest;
  }

  function pickSupportedAspect(requestedAspect, supported, fallback) {
    const requested = normalizeAspectRatio(requestedAspect);
    const supportList = Array.isArray(supported) ? supported : [];
    if (requested !== 'auto' && supportList.includes(requested)) {
      return { aspect: requested, fellBack: false };
    }

    if (requested !== 'auto') {
      const closest = detectClosestAspectRatio(
        ...(function () {
          const parts = parseRatioParts(requested);
          return parts ? [parts.width, parts.height, supportList] : [16, 9, supportList];
        })()
      );
      if (supportList.includes(closest)) {
        return {
          aspect: closest,
          fellBack: closest !== requested,
          reason: closest !== requested ? `协议不支持 ${requested}，已回落为 ${closest}` : ''
        };
      }
    }

    const effective = supportList.includes(fallback) ? fallback : (supportList[0] || '16:9');
    return {
      aspect: effective,
      fellBack: requested !== effective,
      reason: requested !== effective ? `协议不支持 ${requested === 'auto' ? 'auto' : requested}，已回落为 ${effective}` : ''
    };
  }

  function resolveOpenAiVideoSize(aspect, resolution) {
    const normalizedAspect = normalizeAspectRatio(aspect) === '9:16' ? '9:16' : '16:9';
    const high = /1080|2K|4K/i.test(String(resolution || ''));
    if (normalizedAspect === '9:16') {
      return high ? '1024x1792' : '720x1280';
    }
    return high ? '1792x1024' : '1280x720';
  }

  function resolveVideoAspectInfo({
    aspect = '16:9',
    resolution = '720P',
    protocol = 'openai-videos'
  } = {}) {
    const protocolKey = String(protocol || 'openai-videos');
    const supported = VIDEO_PROTOCOL_ASPECTS[protocolKey] || VIDEO_PROTOCOL_ASPECTS['openai-videos'];
    const fallback = VIDEO_FALLBACK_ASPECT[protocolKey] || '16:9';
    const requestedAspect = normalizeAspectRatio(aspect) === 'auto' ? '16:9' : normalizeAspectRatio(aspect);
    const picked = pickSupportedAspect(requestedAspect, supported, fallback);
    const effectiveAspect = picked.aspect;
    const orientation = isPortraitAspect(effectiveAspect) ? 'portrait' : 'landscape';

    let sizeOrResolution = String(resolution || '');
    let openAiSize = '';

    if (protocolKey === 'openai-videos' || protocolKey === 'openai-video-chat') {
      openAiSize = resolveOpenAiVideoSize(effectiveAspect, resolution);
      sizeOrResolution = openAiSize;
    } else if (protocolKey === 'veo-generations' || protocolKey === 'veo-create') {
      sizeOrResolution = String(resolution || '').toUpperCase() === '4K'
        ? '4K'
        : (String(resolution || '').toUpperCase() === '1080P' ? '1080P' : '720P');
    } else if (protocolKey === 'aliyun-happyhorse') {
      sizeOrResolution = String(resolution || '').toUpperCase() === '1080P' ? '1080P' : '720P';
    } else if (protocolKey === 'doubao-seedance') {
      sizeOrResolution = String(resolution || '').toUpperCase() === '1080P' ? '1080p' : '720p';
    } else if (protocolKey === 'grok-video-create') {
      sizeOrResolution = '720P';
    }

    return {
      requestedAspect,
      effectiveAspect,
      aspect: effectiveAspect,
      orientation,
      openAiSize: openAiSize || resolveOpenAiVideoSize(effectiveAspect, resolution),
      sizeOrResolution,
      resolution: sizeOrResolution,
      fellBack: Boolean(picked.fellBack),
      reason: picked.reason || ''
    };
  }

  function getCompatibleRetryLayout({
    aspect = 'auto',
    resolution = '1K',
    model = '',
    supportedAspects
  } = {}) {
    const requestedAspect = normalizeAspectRatio(aspect);
    const list = Array.isArray(supportedAspects) && supportedAspects.length
      ? supportedAspects.map(normalizeAspectRatio)
      : [...ASPECT_VALUES];
    let nextAspect = requestedAspect;
    let fellBack = false;
    let reason = '';

    if (nextAspect !== 'auto' && !list.includes(nextAspect)) {
      nextAspect = list.includes('1:1') ? '1:1' : (list.find(item => item !== 'auto') || 'auto');
      fellBack = true;
      reason = `当前模型不支持 ${requestedAspect}，已调整为 ${nextAspect}`;
    }

    if (isDalle2Model(model)) {
      nextAspect = '1:1';
      fellBack = requestedAspect !== '1:1';
      reason = fellBack ? 'DALL·E 2 仅支持 1:1，已调整' : reason;
    }

    const nextResolution = normalizeResolution(resolution, '1K');
    return {
      aspect: nextAspect,
      resolution: nextResolution,
      size: resolveImageSize({ aspect: nextAspect, resolution: nextResolution, model }),
      fellBack,
      reason
    };
  }

  function fitNodeSize(width, height, maxWidth = 320, maxHeight = 320) {
    const w = Math.max(1, Number(width) || 1);
    const h = Math.max(1, Number(height) || 1);
    const scale = Math.min(1, maxWidth / w, maxHeight / h);
    return {
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale))
    };
  }

  function measureImageSource(src, timeoutMs = 5000) {
    return new Promise(resolve => {
      if (!src) {
        resolve(null);
        return;
      }

      const image = new Image();
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        image.onload = null;
        image.onerror = null;
        resolve(value);
      };
      const timeoutId = setTimeout(() => finish(null), timeoutMs);

      image.onload = () => {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) {
          finish(null);
          return;
        }
        finish({
          width,
          height,
          aspect: formatAspectRatio(width, height)
        });
      };
      image.onerror = () => finish(null);
      image.src = src;
    });
  }

  async function compressReferenceDataUrl(dataUrl, options = {}) {
    const original = String(dataUrl || '');
    if (!original.startsWith('data:')) {
      return { dataUrl: original, mimeType: options.mimeType || 'image/png', compressed: false };
    }

    const originalMime = original.match(/^data:([^;]+)/)?.[1] || options.mimeType || 'image/png';
    const maxSide = Number(options.maxSide) || 2560;
    const maxPixels = Number(options.maxPixels) || 5000000;
    const thresholdBytes = Number(options.thresholdBytes) || (1.5 * 1024 * 1024);
    const base64 = original.split(',', 2)[1] || '';
    const padding = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);
    const byteSize = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
    if (byteSize <= thresholdBytes) {
      return { dataUrl: original, mimeType: originalMime, compressed: false, bytes: byteSize };
    }

    if (typeof document === 'undefined') {
      return { dataUrl: original, mimeType: originalMime, compressed: false, bytes: byteSize };
    }

    try {
      const dimensions = await measureImageSource(original, options.timeoutMs || 5000);
      if (!dimensions?.width || !dimensions?.height) {
        return { dataUrl: original, mimeType: originalMime, compressed: false, bytes: byteSize };
      }

      const sideScale = Math.min(1, maxSide / Math.max(dimensions.width, dimensions.height));
      const pixelScale = Math.min(1, Math.sqrt(maxPixels / (dimensions.width * dimensions.height)));
      const scale = Math.min(sideScale, pixelScale);
      const targetWidth = Math.max(1, Math.round(dimensions.width * scale));
      const targetHeight = Math.max(1, Math.round(dimensions.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return { dataUrl: original, mimeType: originalMime, compressed: false, bytes: byteSize };
      }

      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image decode failed'));
        img.src = original;
      });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

      const normalizedMime = originalMime.toLowerCase();
      const outputMime = (normalizedMime === 'image/png' || normalizedMime === 'image/webp')
        ? 'image/webp'
        : 'image/jpeg';
      const quality = outputMime === 'image/webp' ? 0.9 : 0.86;
      const compressed = canvas.toDataURL(outputMime, quality);
      const compressedBase64 = compressed.split(',', 2)[1] || '';
      const compressedPadding = compressedBase64.endsWith('==') ? 2 : (compressedBase64.endsWith('=') ? 1 : 0);
      const compressedBytes = Math.max(0, Math.floor((compressedBase64.length * 3) / 4) - compressedPadding);
      if (compressed.startsWith('data:') && compressedBytes < byteSize) {
        return {
          dataUrl: compressed,
          mimeType: compressed.match(/^data:([^;]+)/)?.[1] || outputMime,
          compressed: true,
          bytes: compressedBytes,
          width: targetWidth,
          height: targetHeight
        };
      }
      return { dataUrl: original, mimeType: originalMime, compressed: false, bytes: byteSize };
    } catch (error) {
      return { dataUrl: original, mimeType: originalMime, compressed: false, bytes: byteSize, error: String(error?.message || error || '') };
    }
  }

  async function compressReferenceImages(images = [], options = {}) {
    const list = Array.isArray(images) ? images : [];
    const next = [];
    for (const image of list) {
      if (!image || !image.dataUrl) {
        next.push(image);
        continue;
      }
      const result = await compressReferenceDataUrl(image.dataUrl, {
        mimeType: image.mime || image.mimeType,
        ...options
      });
      next.push({
        ...image,
        dataUrl: result.dataUrl,
        mime: result.mimeType || image.mime || image.mimeType,
        mimeType: result.mimeType || image.mimeType || image.mime,
        compressedForSubmit: Boolean(result.compressed)
      });
    }
    return next;
  }

  global.ImageRatio = {
    ASPECT_VALUES: [...ASPECT_VALUES],
    VIDEO_PROTOCOL_ASPECTS,
    normalizeAspectRatio,
    normalizeResolution,
    parseAspectRatio,
    resolveImageSize,
    getOpenAICompatibleSize,
    buildAspectInstruction,
    buildRequestContext,
    formatAspectRatio,
    compareAspect,
    detectClosestAspectRatio,
    resolveVideoAspectInfo,
    getCompatibleRetryLayout,
    fitNodeSize,
    measureImageSource,
    compressReferenceDataUrl,
    compressReferenceImages,
    getLegacyCompatibleSize
  };
})(typeof window !== 'undefined' ? window : globalThis);
