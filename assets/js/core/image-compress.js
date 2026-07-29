/**
 * Image compression helpers.
 * Loaded before app.js; attaches to window.ImageCompress.
 * Optional logger: window.AppDebugLog(...args)
 */
(function (global) {
  function log() {
    const logger = global.AppDebugLog || global.debugLog;
    if (typeof logger === 'function') logger.apply(null, arguments);
  }

  function readFileAsDataUrl(file) {
    if (global.AppUtils && typeof global.AppUtils.readFileAsDataUrl === 'function') {
      return global.AppUtils.readFileAsDataUrl(file);
    }
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve({
          name: file.name,
          mime: file.type || 'image/png',
          dataUrl: reader.result
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

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
          log(
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
        log(`压缩级别总数: ${compressionLevels.length}`);

        // 尝试各级压缩，目标是找到 5-9MB 之间的结果
        for (let i = 0; i < compressionLevels.length; i++) {
          const [maxW, maxH, quality, mimeType] = compressionLevels[i];
          log(`尝试压缩级别 ${i + 1}/${compressionLevels.length}: ${mimeType}, 质量=${quality}, 尺寸=${maxW}x${maxH}`);

          result = compressImageOnce(img, maxW, maxH, quality, mimeType);
          finalLevel = i + 1;

          const resultSizeMB = (result.size / 1024 / 1024).toFixed(2);
          log(`  结果: ${resultSizeMB}MB (${result.width}x${result.height})`);

          // 如果结果在 5-9MB 之间，完美！
          if (result.size >= MIN_IMAGE_SIZE && result.size <= MAX_IMAGE_SIZE) {
            log(`  ✓ 在目标范围内，停止压缩`);
            break;
          }

          // 如果结果 < 5MB，检查是否在容忍范围内（4-9MB）
          if (result.size < MIN_IMAGE_SIZE) {
            const toleranceSize = 4 * 1024 * 1024; // 4MB容忍下限

            if (result.size >= toleranceSize) {
              // 在容忍范围内（4-5MB），接受这个结果
              log(`  ✓ 在容忍范围内 (4-5MB)，接受结果`);
              break;
            } else {
              // < 4MB，压缩过度
              log(`  ⚠ 压缩过度 (<4MB)`);

              // 如果有上一级结果，且上一级在合理范围内（<= 9MB），才回退
              if (previousResult && previousResult.size <= MAX_IMAGE_SIZE) {
                result = previousResult;
                finalLevel = i; // 回退到上一级
                log(`  → 回退到上一级`);
              } else if (previousResult) {
                // 上一级超出9MB，当前级虽然<4MB，但比超出范围的结果好
                log(`  → 上一级超出范围，保持当前结果`);
              }
              // 否则使用当前结果（第一级就 < 4MB 的情况）
              break;
            }
          }

          // 如果结果 > 9MB，继续尝试下一级
          log(`  → 继续尝试下一级`);
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

        log(
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

  // 处理并压缩图片（未走缓存）
  async function processAndCompressImageUncached(file) {
    const fileSizeBytes = file.size;
    const fileSizeKB = fileSizeBytes / 1024;
    const fileSizeMB = fileSizeKB / 1024;

    log(`处理图片: ${file.name}, 原始大小: ${fileSizeMB.toFixed(2)}MB`);

    // 如果图片已经小于 10MB，直接读取
    if (fileSizeKB <= 10240) {
      log(`图片较小，无需压缩: ${file.name}`);
      return await readFileAsDataUrl(file);
    }

    // 对于大于 10MB 的图片，进行压缩
    return await compressImageToLimit(file);
  }

  // ---- 参考图内容哈希缓存（借鉴 nova-image-studio upload-image-cache）----
  const REF_CACHE_DB = 'image-upload-cache';
  const REF_CACHE_STORE = 'images';
  const REF_CACHE_DB_VERSION = 1;
  const REF_MEMORY_LIMIT = 32;
  const REF_MEMORY_TTL_MS = 30 * 60 * 1000;
  const REF_IDB_MAX_BYTES = 4 * 1024 * 1024;
  const refMemoryCache = new Map(); // key -> { result, createdAt }
  const refInflight = new Map(); // key -> Promise

  function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  async function hashFileContent(file) {
    try {
      if (global.crypto && crypto.subtle && typeof crypto.subtle.digest === 'function' && file && typeof file.arrayBuffer === 'function') {
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        return bufferToHex(digest);
      }
    } catch (err) {
      log('参考图哈希失败，回退弱键:', err);
    }
    return `weak:${file && file.name || 'file'}:${file && file.size || 0}:${file && file.lastModified || 0}:${file && file.type || ''}`;
  }

  function clonePreparedResult(result, extras) {
    const next = Object.assign({}, result || {}, extras || {});
    return next;
  }

  function touchMemoryCache(key, entry) {
    if (refMemoryCache.has(key)) refMemoryCache.delete(key);
    refMemoryCache.set(key, entry);
    while (refMemoryCache.size > REF_MEMORY_LIMIT) {
      const oldest = refMemoryCache.keys().next().value;
      refMemoryCache.delete(oldest);
    }
  }

  function getMemoryCached(key) {
    const entry = refMemoryCache.get(key);
    if (!entry) return null;
    if ((Date.now() - (entry.createdAt || 0)) > REF_MEMORY_TTL_MS) {
      refMemoryCache.delete(key);
      return null;
    }
    touchMemoryCache(key, entry);
    return entry.result || null;
  }

  function openRefCacheDb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(REF_CACHE_DB, REF_CACHE_DB_VERSION);
        request.onerror = () => resolve(null);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(REF_CACHE_STORE)) {
            db.createObjectStore(REF_CACHE_STORE, { keyPath: 'key' });
          }
        };
        request.onsuccess = () => resolve(request.result);
      } catch (err) {
        resolve(null);
      }
    });
  }

  async function getIdbCached(key) {
    const db = await openRefCacheDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(REF_CACHE_STORE, 'readonly');
        const req = tx.objectStore(REF_CACHE_STORE).get(key);
        req.onsuccess = () => {
          const row = req.result;
          if (!row || !row.dataUrl) return resolve(null);
          resolve({
            name: row.name || 'image.png',
            mime: row.mime || row.mimeType || 'image/png',
            dataUrl: row.dataUrl,
            originalSize: row.originalSize || 0,
            compressedSize: row.compressedSize || row.processedSize || 0,
            width: row.width || 0,
            height: row.height || 0,
            contentHash: key
          });
        };
        req.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    });
  }

  async function saveIdbCached(key, result) {
    const size = Number(result && (result.compressedSize || result.processedSize) || 0);
    if (!result || !result.dataUrl || size > REF_IDB_MAX_BYTES) return;
    const db = await openRefCacheDb();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(REF_CACHE_STORE, 'readwrite');
        tx.objectStore(REF_CACHE_STORE).put({
          key,
          name: result.name || 'image.png',
          mime: result.mime || 'image/png',
          mimeType: result.mime || 'image/png',
          dataUrl: result.dataUrl,
          originalSize: result.originalSize || 0,
          compressedSize: result.compressedSize || 0,
          processedSize: result.compressedSize || 0,
          width: result.width || 0,
          height: result.height || 0,
          createdAt: Date.now()
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch (err) {
        resolve();
      }
    });
  }

  async function processAndCompressImage(file) {
    if (!file) throw new Error('图片文件为空');
    const key = await hashFileContent(file);

    const memHit = getMemoryCached(key);
    if (memHit) {
      log(`参考图内存缓存命中: ${file.name}`);
      return clonePreparedResult(memHit, {
        name: file.name || memHit.name,
        cacheHit: true,
        contentHash: key
      });
    }

    if (refInflight.has(key)) {
      const shared = await refInflight.get(key);
      return clonePreparedResult(shared, {
        name: file.name || shared.name,
        cacheHit: true,
        contentHash: key
      });
    }

    const work = (async () => {
      const idbHit = await getIdbCached(key);
      if (idbHit) {
        log(`参考图本地缓存命中: ${file.name}`);
        touchMemoryCache(key, { result: idbHit, createdAt: Date.now() });
        return clonePreparedResult(idbHit, { cacheHit: true, contentHash: key });
      }

      const processed = await processAndCompressImageUncached(file);
      const prepared = clonePreparedResult(processed, {
        cacheHit: false,
        contentHash: key
      });
      touchMemoryCache(key, { result: prepared, createdAt: Date.now() });
      // 异步落盘，不阻塞上传流程
      Promise.resolve().then(() => saveIdbCached(key, prepared)).catch(() => {});
      return prepared;
    })();

    refInflight.set(key, work);
    try {
      return await work;
    } finally {
      refInflight.delete(key);
    }
  }

  function clearReferenceImageCache() {
    refMemoryCache.clear();
    refInflight.clear();
    if (typeof indexedDB === 'undefined') return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const req = indexedDB.deleteDatabase(REF_CACHE_DB);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      } catch (err) {
        resolve();
      }
    });
  }

  global.ImageCompress = {
    MIN_IMAGE_SIZE: MIN_IMAGE_SIZE,
    MAX_IMAGE_SIZE: MAX_IMAGE_SIZE,
    compressImageOnce: compressImageOnce,
    compressImageToLimit: compressImageToLimit,
    processAndCompressImage: processAndCompressImage,
    processAndCompressImageUncached: processAndCompressImageUncached,
    hashFileContent: hashFileContent,
    clearReferenceImageCache: clearReferenceImageCache
  };
})(typeof window !== 'undefined' ? window : globalThis);
