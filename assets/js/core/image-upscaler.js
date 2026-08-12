/**
 * Image Upscaler Module
 * Browser-side AI super-resolution using UpscalerJS + ESRGAN Slim models.
 * Falls back to high-quality Canvas bicubic interpolation when AI is unavailable.
 * Loaded before app.js; attaches to window.ImageUpscaler.
 */
(function (global) {
  'use strict';

  // ── CDN URLs ──────────────────────────────────────────────
  var CDN = {
    tfjs:      'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
    upscaler:  'https://cdn.jsdelivr.net/npm/upscaler@1.0.0-beta.17/dist/browser/umd/upscaler.min.js',
    model2x:   'https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@0.0.1-beta.10/dist/umd/2x.min.js',
    model4x:   'https://cdn.jsdelivr.net/npm/@upscalerjs/esrgan-slim@0.0.1-beta.10/dist/umd/4x.min.js'
  };

  // ── State ─────────────────────────────────────────────────
  var loadPromise = null;       // shared promise for the base stack (tfjs + upscaler)
  var loadedModels = {};        // { '2x': promise, '4x': promise }
  var upscalerInstances = {};   // { '2x': Upscaler instance, '4x': ... }

  var TIMEOUT_MS = 90000;       // overall upscale timeout
  var SCRIPT_LOAD_TIMEOUT = 30000;

  // ── Helpers ───────────────────────────────────────────────

  /**
   * Dynamically inject a <script> tag and resolve when loaded.
   */
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      // Already loaded check
      var existing = document.querySelector('script[src="' + url + '"]');
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', function () { reject(new Error('Script load failed: ' + url)); });
        return;
      }

      var script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.dataset.dynamicUpscaler = '1';

      var timer = setTimeout(function () {
        reject(new Error('Script load timeout: ' + url));
      }, SCRIPT_LOAD_TIMEOUT);

      script.onload = function () {
        clearTimeout(timer);
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = function () {
        clearTimeout(timer);
        reject(new Error('Script load failed: ' + url));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Load the base stack: TensorFlow.js + UpscalerJS core.
   * Cached as a single promise so it only runs once.
   */
  function ensureBaseLoaded() {
    if (loadPromise) return loadPromise;
    loadPromise = loadScript(CDN.tfjs).then(function () {
      return loadScript(CDN.upscaler);
    }).catch(function (err) {
      loadPromise = null; // allow retry
      throw err;
    });
    return loadPromise;
  }

  /**
   * Load a specific ESRGAN model (2x or 4x).
   * @param {string} scale - '2x' or '4x'
   */
  function ensureModelLoaded(scale) {
    if (loadedModels[scale]) return loadedModels[scale];
    var url = (scale === '4x') ? CDN.model4x : CDN.model2x;

    loadedModels[scale] = ensureBaseLoaded().then(function () {
      return loadScript(url);
    }).then(function () {
      var modelGlobal = (scale === '4x') ? global.ESRGANSlim4x : global.ESRGANSlim2x;
      if (!modelGlobal) throw new Error('ESRGAN ' + scale + ' model global not found');
      if (!global.Upscaler) throw new Error('UpscalerJS global not found');
      upscalerInstances[scale] = new global.Upscaler({ model: modelGlobal });
      return upscalerInstances[scale];
    }).catch(function (err) {
      loadedModels[scale] = null; // allow retry
      throw err;
    });
    return loadedModels[scale];
  }

  /**
   * Check WebGL availability for TF.js.
   */
  function isWebGLAvailable() {
    try {
      var canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch (e) {
      return false;
    }
  }

  // ── Canvas helpers ────────────────────────────────────────

  /**
   * Load an image from a data URL.
   */
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Image decode failed')); };
      img.src = src;
    });
  }

  /**
   * Resize an image data URL to exact target dimensions using high-quality Canvas.
   */
  function canvasResize(dataUrl, targetWidth, targetHeight) {
    return loadImage(dataUrl).then(function (img) {
      var canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      return canvas.toDataURL('image/png');
    });
  }

  /**
   * Canvas fallback: bicubic upscale + simple unsharp mask sharpening.
   * Used when AI upscaling is unavailable or fails.
   */
  function canvasFallbackUpscale(dataUrl, targetWidth, targetHeight) {
    return loadImage(dataUrl).then(function (img) {
      // Step 1: upscale via canvas with high-quality smoothing
      var canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // Step 2: simple sharpen using convolution
      try {
        var imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        var sharpened = applyUnsharpMask(imageData, 0.6);
        ctx.putImageData(sharpened, 0, 0);
      } catch (e) {
        // If sharpening fails (e.g. tainted canvas), return the unsharpened result
      }

      return canvas.toDataURL('image/png');
    });
  }

  /**
   * Simple unsharp mask: sharpen = original + amount * (original - blurred)
   * Uses a fast 3x3 box blur as the "blurred" version.
   */
  function applyUnsharpMask(imageData, amount) {
    var w = imageData.width;
    var h = imageData.height;
    var src = imageData.data;
    var blurred = new Uint8ClampedArray(src.length);

    // 3x3 box blur
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;
        var r = 0, g = 0, b = 0, count = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            var nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              var nidx = (ny * w + nx) * 4;
              r += src[nidx];
              g += src[nidx + 1];
              b += src[nidx + 2];
              count++;
            }
          }
        }
        blurred[idx]     = r / count;
        blurred[idx + 1] = g / count;
        blurred[idx + 2] = b / count;
        blurred[idx + 3] = src[idx + 3];
      }
    }

    // Unsharp: out = src + amount * (src - blurred)
    var result = new Uint8ClampedArray(src.length);
    for (var i = 0; i < src.length; i += 4) {
      result[i]     = clamp8(src[i]     + amount * (src[i]     - blurred[i]));
      result[i + 1] = clamp8(src[i + 1] + amount * (src[i + 1] - blurred[i + 1]));
      result[i + 2] = clamp8(src[i + 2] + amount * (src[i + 2] - blurred[i + 2]));
      result[i + 3] = src[i + 3];
    }

    return new ImageData(result, w, h);
  }

  function clamp8(v) {
    return v < 0 ? 0 : (v > 255 ? 255 : v);
  }

  /**
   * Convert a base64 string (no prefix) to a data URL.
   */
  function toDataUrl(base64, mime) {
    if (!base64) return '';
    if (String(base64).startsWith('data:')) return base64;
    return 'data:' + (mime || 'image/png') + ';base64,' + base64;
  }

  // ── Core API ──────────────────────────────────────────────

  /**
   * Detect whether the result image needs upscaling.
   * @param {Object} result - result object with sourceWidth/sourceHeight
   * @param {string} resolution - '1K' | '2K' | '4K' (or variants like '1080P')
   * @param {string} aspect - aspect ratio string
   * @returns {{ needed: boolean, targetWidth?: number, targetHeight?: number, scale?: number }}
   */
  function detectUpscaleNeed(result, resolution, aspect) {
    var sourceLongSide = Math.max(result.sourceWidth || 0, result.sourceHeight || 0);
    if (!sourceLongSide) return { needed: false };

    var ImageRatio = global.ImageRatio;
    if (!ImageRatio) return { needed: false };

    var normalizedResolution = ImageRatio.normalizeResolution(resolution, '1K');
    var resolutionMap = ImageRatio.RESOLUTION_LONG_SIDE || { '1K': 1024, '2K': 2048, '4K': 3840 };
    var targetLongSide = resolutionMap[normalizedResolution] || 1024;

    // 5% tolerance: only trigger if actual < 95% of target
    if (sourceLongSide >= targetLongSide * 0.95) return { needed: false };

    // Calculate exact target dimensions
    var targetSize = ImageRatio.resolveImageSize({ aspect: aspect, resolution: normalizedResolution });
    var targetWidth, targetHeight;

    if (targetSize && String(targetSize).indexOf('x') !== -1) {
      var parts = String(targetSize).split('x');
      targetWidth = parseInt(parts[0], 10) || targetLongSide;
      targetHeight = parseInt(parts[1], 10) || targetLongSide;
    } else {
      // auto aspect: scale proportionally by long side
      var scale = targetLongSide / sourceLongSide;
      targetWidth = Math.round((result.sourceWidth || targetLongSide) * scale);
      targetHeight = Math.round((result.sourceHeight || targetLongSide) * scale);
    }

    var overallScale = targetLongSide / sourceLongSide;
    return { needed: true, targetWidth: targetWidth, targetHeight: targetHeight, scale: overallScale };
  }

  /**
   * Execute AI upscaling.
   * @param {string} dataUrl - source image as data URL
   * @param {string} scale - '2x' or '4x'
   * @returns {Promise<string>} - upscaled image as data URL
   */
  function aiUpscale(dataUrl, scale) {
    return ensureModelLoaded(scale).then(function (upscaler) {
      return upscaler.upscale(dataUrl, {
        output: 'base64',
        patchSize: 64,
        padding: 4
      });
    }).then(function (result) {
      // UpscalerJS returns a base64 string (no prefix) when output='base64'
      if (typeof result === 'string') {
        return toDataUrl(result, 'image/png');
      }
      // Some versions return { data: string } or tensor
      if (result && typeof result.data === 'string') {
        return toDataUrl(result.data, 'image/png');
      }
      throw new Error('Unexpected upscaler output format');
    });
  }

  /**
   * Add a timeout wrapper to any promise.
   */
  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error('Operation timed out after ' + ms + 'ms'));
      }, ms);
      promise.then(function (val) {
        clearTimeout(timer);
        resolve(val);
      }, function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  /**
   * Main upscale entry point.
   * @param {string} dataUrl - source image as data URL
   * @param {number} targetWidth - desired output width
   * @param {number} targetHeight - desired output height
   * @param {Object} options - { onProgress: function(msg) }
   * @returns {Promise<{ dataUrl: string, width: number, height: number, method: string, error?: string }>}
   */
  function upscale(dataUrl, targetWidth, targetHeight, options) {
    options = options || {};
    var onProgress = options.onProgress || function () {};
    var width = Math.max(1, Math.round(targetWidth));
    var height = Math.max(1, Math.round(targetHeight));

    // If target is same or smaller, no upscaling needed — just resize
    onProgress('正在准备超分...');

    // Try AI path first
    return tryAiUpscale(dataUrl, width, height, onProgress)
      .catch(function (err) {
        console.warn('[ImageUpscaler] AI upscale failed, falling back to Canvas:', err.message || err);
        onProgress('AI不可用，使用高速缩放...');
        return canvasFallbackUpscale(dataUrl, width, height).then(function (resultDataUrl) {
          return {
            dataUrl: resultDataUrl,
            width: width,
            height: height,
            method: 'canvas'
          };
        });
      });
  }

  /**
   * Attempt AI upscaling with proper model selection and timeout.
   */
  function tryAiUpscale(dataUrl, targetWidth, targetHeight, onProgress) {
    // Check WebGL support first
    if (!isWebGLAvailable()) {
      return Promise.reject(new Error('WebGL not available'));
    }

    // Determine which model scale to use based on the upscale ratio needed
    // We need to measure source dimensions to pick 2x vs 4x
    return loadImage(dataUrl).then(function (img) {
      var srcW = img.naturalWidth || img.width;
      var srcH = img.naturalHeight || img.height;
      var longSide = Math.max(srcW, srcH);
      var targetLongSide = Math.max(targetWidth, targetHeight);
      var ratio = targetLongSide / longSide;

      // Pick model: 2x for ratio <= 2.5, 4x for larger
      var modelScale = (ratio <= 2.5) ? '2x' : '4x';

      onProgress('正在加载AI超分模型（首次较慢）...');

      return withTimeout(ensureModelLoaded(modelScale), TIMEOUT_MS).then(function () {
        onProgress('AI超分处理中...');
        return withTimeout(aiUpscale(dataUrl, modelScale), TIMEOUT_MS);
      }).then(function (aiDataUrl) {
        onProgress('正在校正尺寸...');
        // AI model outputs fixed 2x/4x, resize to exact target
        return canvasResize(aiDataUrl, targetWidth, targetHeight);
      }).then(function (finalDataUrl) {
        return {
          dataUrl: finalDataUrl,
          width: targetWidth,
          height: targetHeight,
          method: 'ai'
        };
      });
    });
  }

  /**
   * Preload the base stack and 2x model (optional, for warming up).
   */
  function preload(scale) {
    var s = scale || '2x';
    return ensureModelLoaded(s).then(function () {
      return true;
    }).catch(function () {
      return false;
    });
  }

  /**
   * Check if the upscaler is ready (base stack loaded).
   */
  function isReady() {
    return !!(global.tf && global.Upscaler && (global.ESRGANSlim2x || global.ESRGANSlim4x));
  }

  // ── Export ────────────────────────────────────────────────
  global.ImageUpscaler = {
    detectUpscaleNeed: detectUpscaleNeed,
    upscale: upscale,
    preload: preload,
    isReady: isReady
  };
})(typeof window !== 'undefined' ? window : globalThis);
