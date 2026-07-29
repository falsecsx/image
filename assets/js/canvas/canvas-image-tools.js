const QUICK_TOOL_STORAGE_KEY = 'image_app:canvas_image_quick_tools';

export const DEFAULT_IMAGE_QUICK_TOOLS = [
  'download',
  'favorite',
  'crop',
  'split',
  'upscale',
  'super-resolve',
  'inpaint',
  'outpaint',
  'angle'
];

export function normalizeImageQuickTools(value) {
  const allowed = new Set(DEFAULT_IMAGE_QUICK_TOOLS);
  const input = Array.isArray(value) ? value : DEFAULT_IMAGE_QUICK_TOOLS;
  const ids = [...new Set(input.map(item => String(item || '').trim()).filter(item => allowed.has(item)))];
  return ids.length ? ids : [...DEFAULT_IMAGE_QUICK_TOOLS];
}

export function loadImageQuickTools(storage = globalThis.localStorage) {
  try {
    return normalizeImageQuickTools(JSON.parse(storage?.getItem?.(QUICK_TOOL_STORAGE_KEY) || 'null'));
  } catch {
    return [...DEFAULT_IMAGE_QUICK_TOOLS];
  }
}

export function saveImageQuickTools(ids, storage = globalThis.localStorage) {
  const normalized = normalizeImageQuickTools(ids);
  try { storage?.setItem?.(QUICK_TOOL_STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  return normalized;
}

export async function splitImage(src, options = {}) {
  const rows = clampInt(options.rows, 1, 8, 2);
  const columns = clampInt(options.columns, 1, 8, 2);
  const image = await loadImage(src);
  const pieces = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sourceX = Math.round((column * image.naturalWidth) / columns);
      const sourceY = Math.round((row * image.naturalHeight) / rows);
      const sourceRight = Math.round(((column + 1) * image.naturalWidth) / columns);
      const sourceBottom = Math.round(((row + 1) * image.naturalHeight) / rows);
      const width = Math.max(1, sourceRight - sourceX);
      const height = Math.max(1, sourceBottom - sourceY);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法创建图片分割画布');
      context.drawImage(image, sourceX, sourceY, width, height, 0, 0, width, height);
      pieces.push({
        row,
        column,
        width,
        height,
        dataUrl: canvas.toDataURL('image/png')
      });
    }
  }
  return pieces;
}

export function buildAngleLabel(options = {}) {
  const azimuth = normalizeAngle(options.azimuth);
  const elevation = clampNumber(options.elevation, -90, 90, 0);
  const distance = clampNumber(options.distance, 0.5, 3, 1);
  return `${describeAzimuth(azimuth)} / ${describeElevation(elevation)} / ${distance.toFixed(1)}x`;
}

export function buildAnglePrompt(options = {}) {
  const azimuth = normalizeAngle(options.azimuth);
  const elevation = clampNumber(options.elevation, -90, 90, 0);
  const distance = clampNumber(options.distance, 0.5, 3, 1);
  return [
    '以参考图中的主体为唯一对象，保持主体身份、材质、颜色、服装、光线和背景一致。',
    `将相机调整为${describeAzimuth(azimuth)}，${describeElevation(elevation)}，镜头距离 ${distance.toFixed(1)}x。`,
    '生成自然、结构准确且细节连续的新视角图片，不要添加新的主体或文字。'
  ].join('');
}

function describeAzimuth(value) {
  if (value >= 337.5 || value < 22.5) return '正面视角';
  if (value < 67.5) return '右前方 45 度视角';
  if (value < 112.5) return '右侧视角';
  if (value < 157.5) return '右后方 45 度视角';
  if (value < 202.5) return '背面视角';
  if (value < 247.5) return '左后方 45 度视角';
  if (value < 292.5) return '左侧视角';
  return '左前方 45 度视角';
}

function describeElevation(value) {
  if (value >= 60) return '高位俯视';
  if (value >= 20) return '轻微俯视';
  if (value <= -60) return '低位仰视';
  if (value <= -20) return '轻微仰视';
  return '平视';
}

function normalizeAngle(value) {
  const number = Number(value) || 0;
  return ((number % 360) + 360) % 360;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function clampInt(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = String(src || '');
  });
}
