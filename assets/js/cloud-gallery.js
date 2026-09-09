/**
 * Cloud Gallery - Cloud image storage UI component
 * Depends on: window.AuthGate
 */
(function () {
  window.CloudGallery = window.CloudGallery || {};

  let currentPage = 1;
  let totalPages = 1;
  let perPage = 24;
  let isLoading = false;
  let isInitialized = false;

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : '';
  }

  function csrfToken() {
    return getCookie('csrf_token');
  }

  async function apiCall(path, options) {
    options = options || {};
    const method = options.method || 'GET';
    const opts = {
      method: method,
      headers: {},
      credentials: 'same-origin',
    };
    if (method !== 'GET') {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['X-CSRF-Token'] = csrfToken();
    }
    if (options.body) opts.body = JSON.stringify(options.body);
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('请求失败（HTTP ' + res.status + '）'));
    return data;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
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

  async function copyPromptFromElement(el) {
    const originalText = String(el.textContent || '').trim();
    if (!originalText || originalText === '✓ 已复制' || originalText === '复制失败') return;
    try {
      await copyTextToClipboard(originalText);
      el.textContent = '✓ 已复制';
      el.classList.add('is-copied');
      el.classList.remove('is-copy-error');
      setTimeout(() => {
        el.textContent = originalText;
        el.classList.remove('is-copied');
      }, 1500);
    } catch (err) {
      console.error('复制失败:', err);
      el.textContent = '复制失败';
      el.classList.add('is-copy-error');
      el.classList.remove('is-copied');
      setTimeout(() => {
        el.textContent = originalText;
        el.classList.remove('is-copy-error');
      }, 1500);
    }
  }

  function formatSize(bytes) {
    bytes = Number(bytes) || 0;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  function formatCloudParams(params) {
    if (!params || typeof params !== 'object') return '';
    const labels = {
      aspect: '比例',
      resolution: '清晰度',
      quality: '质量',
      model: '模型',
      protocol: '协议',
      videoDuration: '时长',
      runtimeMs: '耗时'
    };
    return Object.keys(labels)
      .map(key => {
        const value = params[key];
        return value != null && String(value).trim() !== '' ? labels[key] + ' ' + String(value).trim() : '';
      })
      .filter(Boolean)
      .join(' · ');
  }

  function buildCloudDownloadUrl(imageUrl, filename, storagePath) {
    if (/^https?:/i.test(imageUrl || '')) {
      const key = String(storagePath || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
      if (key) return '/cloud-images/' + key + '?download=1';
    }
    return imageUrl || '';
  }

  function getCloudImageUrl(image) {
    const direct = String(image?.url || '').trim();
    if (/^(?:https?:)?\/\//i.test(direct) || direct.startsWith('/')) return direct;
    const storagePath = String(image?.storage_path || '').trim();
    if (!storagePath) return '';
    return '/cloud-images/' + storagePath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  function showCloudMessage(message, type = 'danger') {
    const text = String(message || '操作失败');
    const dialog = window.AppUtils?.dialog;
    if (dialog?.alert) {
      void dialog.alert({ title: type === 'danger' ? '云端图库' : '提示', message: text });
      return;
    }
    const container = document.getElementById('cloud-gallery-content');
    if (!container) return;
    let notice = container.querySelector('.cloud-gallery-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'cloud-gallery-notice';
      notice.setAttribute('role', type === 'danger' ? 'alert' : 'status');
      notice.setAttribute('aria-live', type === 'danger' ? 'assertive' : 'polite');
      container.prepend(notice);
    }
    notice.className = 'cloud-gallery-notice is-' + type;
    notice.textContent = text;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
  }

  function isWarrantyActive(warrantyExpiresAt) {
    return warrantyExpiresAt > Math.floor(Date.now() / 1000);
  }

  // ===== Render =====

  function renderLoginHint() {
    const container = document.getElementById('cloud-gallery-content');
    if (!container) return;
    container.innerHTML =
      '<div class="cloud-gallery-login-hint">' +
      '<p>登录后可使用云端图库功能，保存图片到云端，随时查看和下载。</p>' +
      '</div>';
  }

  async function renderGallery() {
    const container = document.getElementById('cloud-gallery-content');
    if (!container) return;

    if (!window.AuthGate?.isAuthenticated?.()) {
      renderLoginHint();
      return;
    }

    container.innerHTML =
      '<div class="cloud-gallery-header">' +
      '<div class="cloud-gallery-stats" id="cloud-stats"></div>' +
      '<button class="cloud-refresh-btn" id="cloud-refresh-btn" type="button">刷新</button>' +
      '</div>' +
      '<div class="cloud-gallery-grid" id="cloud-grid">' +
      '<div class="cloud-loading">加载中...</div>' +
      '</div>' +
      '<div class="cloud-gallery-pagination" id="cloud-pagination"></div>';

    document.getElementById('cloud-refresh-btn')?.addEventListener('click', () => {
      currentPage = 1;
      loadImages();
      loadStats();
    });

    await loadImages();
    loadStats();
  }

  async function loadImages() {
    if (isLoading) return;
    isLoading = true;
    const grid = document.getElementById('cloud-grid');
    if (grid) grid.innerHTML = '<div class="cloud-loading">加载中...</div>';

    try {
      const data = await apiCall('/api/cloud/list?page=' + currentPage + '&per_page=' + perPage);
      if (data.images && data.images.length > 0) {
        renderImages(data.images);
        totalPages = data.total_pages || 1;
        renderPagination();
      } else {
        if (grid) grid.innerHTML = '<div class="cloud-empty">暂无云端图片</div>';
        totalPages = 1;
        renderPagination();
      }
    } catch (e) {
      if (grid) grid.innerHTML = '<div class="cloud-error">加载失败: ' + escapeHtml(e.message) + '</div>';
    }
    isLoading = false;
  }

  async function loadStats() {
    const statsEl = document.getElementById('cloud-stats');
    if (!statsEl) return;
    try {
      const stats = await apiCall('/api/cloud/stats');
      const quota = window.AuthGate?.getQuotaStatus?.();
      const sizeLimit = quota?.storage?.size_limit_mb || 0;
      const totalSize = Number(stats.size_bytes ?? stats.total_size) || ((Number(stats.size_mb) || 0) * 1048576);
      const warrantyCount = Number(stats.in_warranty ?? stats.warranty_active_count) || 0;
      statsEl.innerHTML =
        '<span class="cloud-stat-item">' + formatSize(totalSize) + '/' + (sizeLimit > 0 ? sizeLimit + 'MB' : '∞') + '</span>' +
        '<span class="cloud-stat-item">质保: ' + warrantyCount + ' 有效</span>';
    } catch (e) {
      statsEl.innerHTML = '';
    }
  }

  function renderImages(images) {
    const grid = document.getElementById('cloud-grid');
    if (!grid) return;

    grid.innerHTML = images.map(function (img) {
      var warrantyActive = isWarrantyActive(img.warranty_expires_at);
      var warrantyClass = warrantyActive ? 'warranty-active' : 'warranty-expired';
      var warrantyText = warrantyActive
        ? '质保至 ' + formatDate(img.warranty_expires_at)
        : '质保已过期';
      var promptText = String(img.source_prompt || '').trim();
      var paramsText = formatCloudParams(img.params);
      var imageUrl = getCloudImageUrl(img);
      var imageMarkup = imageUrl
        ? '<img src="' + escapeHtml(imageUrl) + '" loading="lazy" decoding="async" alt="' + escapeHtml(img.filename) + '">'
        : '<span class="cloud-image-placeholder">暂无预览</span>';

      return '<div class="cloud-image-card" data-id="' + escapeHtml(img.id) + '">' +
        '<div class="cloud-image-thumb">' +
        imageMarkup +
        '</div>' +
        '<div class="cloud-image-info">' +
        '<div class="cloud-image-name" title="' + escapeHtml(img.filename) + '">' + escapeHtml(img.filename) + '</div>' +
        (promptText ? '<button type="button" class="cloud-image-prompt" title="点击复制提示词" aria-label="复制提示词">' + escapeHtml(promptText) + '</button>' : '<div class="cloud-image-prompt is-empty">无提示词</div>') +
        '<div class="cloud-image-params' + (paramsText ? '' : ' is-empty') + '" title="' + (paramsText ? '生成参数：' + escapeHtml(paramsText) : '暂无生成参数') + '">' + (paramsText ? escapeHtml(paramsText) : '暂无生成参数') + '</div>' +
        '<div class="cloud-image-meta">' +
        '<span class="cloud-image-size" title="文件大小">' + formatSize(img.file_size) + '</span>' +
        '<span class="cloud-image-date ' + warrantyClass + '">' + warrantyText + '</span>' +
        '</div>' +
        '<div class="cloud-image-actions">' +
        (imageUrl ? '<a class="cloud-action-btn cloud-download-btn" href="' + escapeHtml(buildCloudDownloadUrl(imageUrl, img.filename, img.storage_path)) + '" download="' + escapeHtml(img.filename) + '" title="下载">下载</a>' : '') +
        '<button class="cloud-action-btn cloud-delete-btn" data-id="' + escapeHtml(img.id) + '" title="删除" aria-label="删除 ' + escapeHtml(img.filename) + '">删除</button>' +
        '</div>' +
        '</div>' +
        '</div>';
    }).join('');

    // Bind action buttons
    grid.querySelectorAll('.cloud-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { handleDelete(parseInt(btn.dataset.id)); });
    });

    // Click prompt to copy
    grid.querySelectorAll('.cloud-image-prompt:not(.is-empty)').forEach(function (el) {
      el.addEventListener('click', function () {
        copyPromptFromElement(el);
      });
    });
  }

  function renderPagination() {
    const pagEl = document.getElementById('cloud-pagination');
    if (!pagEl) return;
    if (totalPages <= 1) {
      pagEl.innerHTML = '';
      return;
    }
    var html = '';
    if (currentPage > 1) {
      html += '<button class="cloud-page-btn" data-page="' + (currentPage - 1) + '">上一页</button>';
    }
    html += '<span class="cloud-page-info">' + currentPage + ' / ' + totalPages + '</span>';
    if (currentPage < totalPages) {
      html += '<button class="cloud-page-btn" data-page="' + (currentPage + 1) + '">下一页</button>';
    }
    pagEl.innerHTML = html;
    pagEl.querySelectorAll('.cloud-page-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentPage = parseInt(btn.dataset.page);
        loadImages();
      });
    });
  }

  // ===== Actions =====

  async function handleDelete(imageId) {
    const confirmed = await (window.AppUtils?.dialog?.confirm?.({
      title: '删除云端图片',
      message: '确定删除这张图片吗？此操作不可恢复。',
      confirmLabel: '删除',
      danger: true
    }) ?? false);
    if (!confirmed) return;
    try {
      const res = await apiCall('/api/cloud/image/' + imageId, { method: 'DELETE' });
      if (res.success) {
        loadImages();
        loadStats();
      } else {
        showCloudMessage(res.error || '删除失败');
      }
    } catch (e) {
      showCloudMessage('网络错误：' + e.message);
    }
  }



  // ===== Upload from external (called by app.js) =====

  window.CloudGallery.uploadImage = async function (base64Data, filename, prompt, originalUrl, params) {
    if (!window.AuthGate?.isAuthenticated?.()) {
      return { success: false, error: '请先登录' };
    }
    try {
      const res = await apiCall('/api/cloud/upload', {
        method: 'POST',
        body: {
          image: base64Data,
          filename: filename || 'image.png',
          prompt: prompt || '',
          original_url: originalUrl || '',
          params: params && typeof params === 'object' ? params : null
        }
      });
      return res;
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  // ===== Tab activation =====

  function onTabActivated() {
    if (!isInitialized) {
      isInitialized = true;
    }
    renderGallery();
  }

  function bindTabEvents() {
    var tab = document.getElementById('settings-tab-cloud');
    if (tab) {
      tab.addEventListener('click', function () {
        setTimeout(onTabActivated, 100);
      });
    }
  }

  // ===== Auth state listener =====

  document.addEventListener('auth:state-changed', function (e) {
    if (!window.AuthGate?.isAuthenticated?.()) {
      renderLoginHint();
    }
  });

  // ===== Init =====

  function start() {
    bindTabEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
