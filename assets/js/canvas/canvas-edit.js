// Pure client-side pixel operations for canvas media nodes.
// No generation dependency; only canvas drawImage math.
// ponytail: no super-sampling ESRGAN — upscale is canvas interpolation only. Add real model upscaling in app.js when available.

export const MAX_UPSCALE_LONG_EDGE = 4096;

/**
 * Crop an image by a normalized rect (0..1) and return a PNG data URL.
 * @param {string} src - image source (data URL / blob URL / http URL)
 * @param {{x:number,y:number,w:number,h:number}} rect - normalized 0..1
 * @returns {Promise<string>} PNG data URL
 */
export function cropImage(src, rect = { x: 0, y: 0, w: 1, h: 1 }) {
  return loadImage(src).then(image => {
    const sx = Math.max(0, Math.floor(clamp01(rect.x) * image.width));
    const sy = Math.max(0, Math.floor(clamp01(rect.y) * image.height));
    const sw = Math.max(1, Math.min(image.width - sx, Math.ceil(clamp01(rect.w) * image.width)));
    const sh = Math.max(1, Math.min(image.height - sy, Math.ceil(clamp01(rect.h) * image.height)));
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return image.src;
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/png');
  });
}

/**
 * Upscale an image so its long edge hits targetLongEdge.
 * @param {string} src
 * @param {number} targetLongEdge
 * @param {'nearest'|'bilinear'|'high'} algorithm
 * @returns {Promise<string>}
 */
export function upscaleImage(src, targetLongEdge, algorithm = 'high') {
  return loadImage(src).then(image => {
    const size = resolveUpscaleSize(image.width, image.height, targetLongEdge);
    if (algorithm === 'high') return drawStepUpscale(image, size.width, size.height);
    return drawResize(image, image.width, image.height, size.width, size.height, algorithm);
  });
}

/**
 * Read natural dimensions of an image source.
 * @param {string} src
 * @returns {Promise<{width:number,height:number}>}
 */
export function readImageSize(src) {
  return loadImage(src).then(image => ({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height }));
}

export function resolveUpscaleSize(width, height, targetLongEdge) {
  const longEdge = Math.max(1, width, height);
  const target = Math.min(MAX_UPSCALE_LONG_EDGE, Math.max(1, Math.round(targetLongEdge)));
  const scale = target / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale
  };
}

/**
 * Paint a mask layer over a base image. Returns a PNG where opaque = repaint, transparent = keep.
 * @param {string} src - base image (used only for dimensions)
 * @param {{x:number,y:number,w:number,h:number}[]} strokes - normalized brush strokes to fill
 * @returns {Promise<string>} PNG data URL of the mask
 */
export function buildMaskFromStrokes(src, strokes = []) {
  return loadImage(src).then(image => {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (const stroke of strokes) {
      const x = Math.floor(clamp01(stroke.x) * image.width);
      const y = Math.floor(clamp01(stroke.y) * image.height);
      const w = Math.max(1, Math.ceil(clamp01(stroke.w) * image.width));
      const h = Math.max(1, Math.ceil(clamp01(stroke.h) * image.height));
      ctx.fillRect(x, y, w, h);
    }
    return canvas.toDataURL('image/png');
  });
}

/**
 * Compose an outpaint canvas: original image placed on an expanded canvas, empty area transparent.
 * Returns the composed image data URL. Call buildOutpaintMask for the matching mask.
 * @param {string} src
 * @param {{top:number,right:number,bottom:number,left:number}} pad - padding in normalized fractions of each side
 * @returns {Promise<string>}
 */
export function composeOutpaint(src, pad = { top: 0, right: 0, bottom: 0, left: 0 }) {
  return loadImage(src).then(image => {
    const leftPx = Math.max(0, Math.round(pad.left * image.width));
    const rightPx = Math.max(0, Math.round(pad.right * image.width));
    const topPx = Math.max(0, Math.round(pad.top * image.height));
    const bottomPx = Math.max(0, Math.round(pad.bottom * image.height));
    const canvas = document.createElement('canvas');
    canvas.width = image.width + leftPx + rightPx;
    canvas.height = image.height + topPx + bottomPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return image.src;
    ctx.drawImage(image, leftPx, topPx);
    return canvas.toDataURL('image/png');
  });
}

/**
 * Mask matching composeOutpaint: opaque only on the padding border, transparent over the original image region.
 * @param {string} src
 * @param {{top:number,right:number,bottom:number,left:number}} pad
 * @returns {Promise<string>}
 */
export function composeOutpaintMask(src, pad = { top: 0, right: 0, bottom: 0, left: 0 }) {
  return loadImage(src).then(image => {
    const leftPx = Math.max(0, Math.round(pad.left * image.width));
    const rightPx = Math.max(0, Math.round(pad.right * image.width));
    const topPx = Math.max(0, Math.round(pad.top * image.height));
    const bottomPx = Math.max(0, Math.round(pad.bottom * image.height));
    const canvas = document.createElement('canvas');
    canvas.width = image.width + leftPx + rightPx;
    canvas.height = image.height + topPx + bottomPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    if (topPx) ctx.fillRect(0, 0, canvas.width, topPx);
    if (bottomPx) ctx.fillRect(0, canvas.height - bottomPx, canvas.width, bottomPx);
    if (leftPx) ctx.fillRect(0, 0, leftPx, canvas.height);
    if (rightPx) ctx.fillRect(canvas.width - rightPx, 0, rightPx, canvas.height);
    return canvas.toDataURL('image/png');
  });
}

function drawStepUpscale(image, width, height) {
  let source = image;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  while (sourceWidth * 2 < width && sourceHeight * 2 < height) {
    const nextWidth = sourceWidth * 2;
    const nextHeight = sourceHeight * 2;
    source = drawResizeCanvas(source, sourceWidth, sourceHeight, nextWidth, nextHeight, 'high');
    sourceWidth = nextWidth;
    sourceHeight = nextHeight;
  }
  return drawResize(source, sourceWidth, sourceHeight, width, height, 'high');
}

function drawResize(source, sourceWidth, sourceHeight, width, height, algorithm) {
  return drawResizeCanvas(source, sourceWidth, sourceHeight, width, height, algorithm).toDataURL('image/png');
}

function drawResizeCanvas(source, sourceWidth, sourceHeight, width, height, algorithm) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = algorithm !== 'nearest';
  ctx.imageSmoothingQuality = algorithm === 'bilinear' ? 'medium' : 'high';
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
  return canvas;
}

function clamp01(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.min(1, next));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = src;
  });
}
