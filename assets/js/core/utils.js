/**
 * Shared pure helpers used by the studio app.
 * Loaded before app.js; attaches to window.AppUtils.
 */
(function (global) {
  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return month + '-' + day + ' ' + hour + ':' + minute;
  }

  function formatDurationMs(durationMs) {
    const ms = Number(durationMs);
    if (!Number.isFinite(ms) || ms <= 0) return '--';
    return (ms / 1000).toFixed(2) + 's';
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

  function getPromptTitle(content, fallback) {
    const fb = fallback == null ? '未命名提示词' : fallback;
    const normalized = String(content || '').replace(/\s+/g, ' ').trim();
    return normalized ? normalized.substring(0, 24) + (normalized.length > 24 ? '...' : '') : fb;
  }

  function guessMimeFromUrl(url) {
    if (!url) return '';
    const lower = String(url).toLowerCase().split('?')[0];
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.mov')) return 'video/quicktime';
    return '';
  }

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

  function readFileAsDataUrl(file) {
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

  global.AppUtils = {
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    formatDurationMs: formatDurationMs,
    copyTextToClipboard: copyTextToClipboard,
    getPromptTitle: getPromptTitle,
    guessMimeFromUrl: guessMimeFromUrl,
    getExtensionFromMime: getExtensionFromMime,
    readFileAsDataUrl: readFileAsDataUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);
