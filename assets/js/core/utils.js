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

  function normalizeMediaUrl(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text || !/^http:\/\//i.test(text)) return text;

    try {
      const url = new URL(text);
      const host = url.hostname.toLowerCase();
      const securePage = global.location?.protocol === 'https:';
      const googleMediaHost = host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com');
      if (securePage || googleMediaHost) url.protocol = 'https:';
      return url.href;
    } catch {
      return text;
    }
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

  const stylesheetPromises = new Map();
  const dialogStack = [];
  const dialogIsolation = new Map();
  const dialogFocusableSelector = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    'object',
    'embed',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function getDocument() {
    return global.document || (typeof document !== 'undefined' ? document : null);
  }

  function getFocusable(container) {
    if (!container || typeof container.querySelectorAll !== 'function') return [];
    return [...container.querySelectorAll(dialogFocusableSelector)].filter(element => {
      if (element.hidden || element.closest('[hidden]') || element.getAttribute('aria-hidden') === 'true') return false;
      if (element.inert || element.closest('[inert]')) return false;
      const closedDetails = element.closest('details:not([open])');
      if (closedDetails && !element.matches('summary')) return false;
      if (typeof global.getComputedStyle === 'function') {
        const style = global.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    });
  }

  function setElementInert(element, inert) {
    if (!element || element === getDocument()?.body) return;
    if ('inert' in element) element.inert = !!inert;
    if (inert) element.setAttribute('inert', '');
    else element.removeAttribute('inert');
  }

  function clearDialogIsolation() {
    dialogIsolation.forEach((previous, element) => {
      if (!element || !element.isConnected) return;
      if ('inert' in element) element.inert = previous.property;
      if (previous.attribute) element.setAttribute('inert', '');
      else element.removeAttribute('inert');
    });
    dialogIsolation.clear();
  }

  function isolateDialogSibling(element) {
    if (!element || element === getDocument()?.body || dialogIsolation.has(element)) return;
    dialogIsolation.set(element, {
      property: 'inert' in element ? element.inert : element.hasAttribute('inert'),
      attribute: element.hasAttribute('inert')
    });
    setElementInert(element, true);
  }

  function getWorkspaceTargets(doc) {
    return [
      { id: 'studio', element: doc.querySelector('.app.studio-layout') },
      { id: 'prompts', element: doc.getElementById('prompt-library-root') },
      { id: 'canvas', element: doc.getElementById('canvas-workspace-root') },
      ...[...doc.querySelectorAll('.agent-workspace')].map(element => ({ id: 'agent', element }))
    ].filter(target => target.element);
  }

  function blurFocusedDescendant(element, doc = getDocument()) {
    const focused = doc?.activeElement;
    if (!element || !focused || focused === doc.body || !element.contains(focused)) return;
    focused.blur?.();
    if (element.contains(doc.activeElement)) {
      const root = doc.documentElement;
      const hadTabIndex = root.hasAttribute('tabindex');
      if (!hadTabIndex) root.tabIndex = -1;
      root.focus?.({ preventScroll: true });
      if (!hadTabIndex) root.removeAttribute('tabindex');
    }
  }

  function getWorkspaceFocusTarget(doc, workspace) {
    const target = getWorkspaceTargets(doc).find(item => item.id === workspace);
    if (!target?.element || target.element.hidden) return null;
    const preferredSelectors = {
      prompts: '[data-action="close"], .prompt-library-back, [data-role="search"]',
      canvas: '[data-action="close-canvas"], .canvas-editor-toolbar button, button',
      agent: '.agent-close, .agent-input, button',
      studio: '#prompt, [data-workspace-nav="studio"], button'
    }[workspace] || 'button, input, textarea, select';
    const preferred = target.element.querySelector(preferredSelectors);
    if (preferred && !preferred.hidden && !preferred.closest('[hidden], [aria-hidden="true"], [inert]')) {
      return preferred;
    }
    const focusable = getFocusable(target.element);
    if (focusable.length) return focusable[0];
    if (!target.element.hasAttribute('tabindex')) target.element.tabIndex = -1;
    return target.element;
  }

  function focusWorkspaceAfterChange(doc, workspace, options = {}) {
    if (options.initial || options.restoreFocus === false) return;
    const schedule = global.setTimeout || setTimeout;
    schedule(() => {
      const target = getWorkspaceTargets(doc).find(item => item.id === workspace)?.element;
      const focused = doc.activeElement;
      if (!target || target.hidden || (focused && focused !== doc.body && target.contains(focused))) return;
      const focusTarget = getWorkspaceFocusTarget(doc, workspace);
      if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
    }, 0);
  }

  function applyWorkspaceVisibility(doc, activeWorkspace) {
    getWorkspaceTargets(doc).forEach(target => {
      const active = target.id === activeWorkspace;
      if (!active) {
        setElementInert(target.element, true);
        blurFocusedDescendant(target.element, doc);
      }
      if (target.id === 'studio' || target.id === 'prompts' || target.id === 'canvas') {
        target.element.hidden = !active;
      }
      setElementInert(target.element, !active);
      if (active) {
        target.element.removeAttribute('aria-hidden');
        target.element.setAttribute('data-workspace-active', 'true');
      } else {
        target.element.setAttribute('aria-hidden', 'true');
        target.element.setAttribute('data-workspace-active', 'false');
      }
    });
  }

  function syncDialogBackground() {
    const doc = getDocument();
    const top = dialogStack[dialogStack.length - 1];
    if (!doc || !top) return;
    clearDialogIsolation();
    const activeWorkspace = doc.body?.dataset.activeWorkspace || 'studio';
    getWorkspaceTargets(doc).forEach(({ id, element }) => {
      const insideDialog = element === top.surface || element.contains(top.surface) || top.surface.contains(element);
      setElementInert(element, id !== activeWorkspace || !insideDialog);
    });
    let child = top.container;
    let parent = child?.parentElement;
    while (parent && parent !== doc.body) {
      [...parent.children].forEach(sibling => {
        if (sibling !== child && !sibling.contains(top.surface)) isolateDialogSibling(sibling);
      });
      child = parent;
      parent = parent.parentElement;
    }
    dialogStack.forEach(record => {
      const containsTopSurface = record.container === top.surface
        || record.container.contains?.(top.surface)
        || top.surface.contains?.(record.container);
      setElementInert(record.container, record !== top && !containsTopSurface);
    });
  }

  function restoreDialogBackground() {
    const doc = getDocument();
    if (!doc) return;
    clearDialogIsolation();
    applyWorkspaceVisibility(doc, doc.body?.dataset.activeWorkspace || 'studio');
    doc.querySelectorAll('.app-dialog-overlay[inert]').forEach(element => setElementInert(element, false));
  }

  function ensureDialogLabel(surface, options = {}) {
    if (!surface) return;
    const doc = getDocument();
    const title = options.title || surface.querySelector('[data-dialog-title], .dialog-title, h1, h2, h3')?.textContent?.trim();
    if (title && !surface.getAttribute('aria-label') && !surface.getAttribute('aria-labelledby')) {
      let titleElement = surface.querySelector('[data-dialog-title], .dialog-title, h1, h2, h3');
      if (!titleElement && doc) {
        titleElement = doc.createElement('h2');
        titleElement.textContent = title;
        titleElement.className = 'app-dialog-generated-title';
        surface.prepend(titleElement);
      }
      if (titleElement) {
        if (!titleElement.id) titleElement.id = `app-dialog-title-${Math.random().toString(36).slice(2, 9)}`;
        surface.setAttribute('aria-labelledby', titleElement.id);
      }
    }
    if (!surface.getAttribute('aria-label') && !surface.getAttribute('aria-labelledby')) {
      surface.setAttribute('aria-label', options.label || '对话框');
    }
  }

  function createDialogRecord(options = {}) {
    const doc = getDocument();
    if (!doc) return null;
    const surface = options.element || options.dialog || options.surface;
    if (!surface || typeof surface.querySelectorAll !== 'function') return null;
    const container = options.container || surface;
    const previousFocus = options.trigger || doc.activeElement;
    const record = {
      surface,
      container,
      previousFocus,
      options,
      closed: false,
      keydown: null,
      click: null,
      close: null,
      previousBodyOverflow: doc.body?.style.overflow || '',
      previousBodyPaddingRight: doc.body?.style.paddingRight || ''
    };
    return record;
  }

  function dialogOpen(options = {}) {
    const doc = getDocument();
    const record = createDialogRecord(options);
    if (!doc || !record) return { close() {}, element: null };
    const { surface, container } = record;
    const openClass = options.openClass || 'is-open';
    const closeClass = options.closeClass || openClass;
    const wasHidden = container.hidden;
    record.close = function closeDialog(reason = 'programmatic', closeOptions = {}) {
      if (record.closed) return;
      const topIndex = dialogStack.lastIndexOf(record);
      if (topIndex === -1) return;
      record.closed = true;
      dialogStack.splice(topIndex, 1);
      doc.removeEventListener('keydown', record.keydown, true);
      container.removeEventListener('click', record.click, true);
      setElementInert(container, true);
      blurFocusedDescendant(container, doc);
      if (container !== surface) {
        container.classList.remove(closeClass);
        if (options.hideOnClose !== false && (wasHidden || options.forceHidden)) container.hidden = true;
        container.setAttribute('aria-hidden', 'true');
      } else {
        surface.classList.remove(closeClass);
        if (options.hideOnClose !== false) surface.hidden = true;
        surface.setAttribute('aria-hidden', 'true');
      }
      surface.setAttribute('aria-hidden', 'true');
      options.onClose?.(reason, record);
      const next = dialogStack[dialogStack.length - 1];
      if (next) {
        syncDialogBackground();
        window.setTimeout(() => {
          const focusTarget = getFocusable(next.surface)[0] || next.surface;
          focusTarget?.focus?.({ preventScroll: true });
        }, 0);
      } else {
        restoreDialogBackground();
        if (doc.body) {
          doc.body.style.overflow = record.previousBodyOverflow;
          doc.body.style.paddingRight = record.previousBodyPaddingRight;
          doc.body.classList.remove('has-app-dialog');
        }
        if (closeOptions.restoreFocus !== false && options.restoreFocus !== false) {
          const target = options.restoreFocusTo || record.previousFocus;
          const blockedByAncestor = target?.closest?.('[hidden], [aria-hidden="true"], [inert]');
          if (target && target !== doc.body && doc.contains(target) && !target.hidden && !target.inert && !blockedByAncestor) {
            window.setTimeout(() => target.focus?.({ preventScroll: true }), 0);
          }
        }
      }
      return true;
    };

    surface.setAttribute('role', options.role || surface.getAttribute('role') || 'dialog');
    surface.setAttribute('aria-modal', 'true');
    surface.setAttribute('aria-hidden', 'false');
    surface.tabIndex = surface.tabIndex < 0 ? surface.tabIndex : -1;
    ensureDialogLabel(surface, options);
    if (container !== surface) {
      container.hidden = false;
      container.setAttribute('aria-hidden', 'false');
      container.classList.add(openClass);
      surface.hidden = false;
      surface.setAttribute('aria-hidden', 'false');
    } else {
      surface.hidden = false;
      surface.classList.add(openClass);
    }
    setElementInert(container, false);
    if (doc.body) {
      if (dialogStack.length === 0) {
        const scrollbarGap = Math.max(0, window.innerWidth - doc.documentElement.clientWidth);
        doc.body.style.overflow = 'hidden';
        if (scrollbarGap) doc.body.style.paddingRight = `${scrollbarGap}px`;
      }
      doc.body.classList.add('has-app-dialog');
    }

    record.keydown = event => {
      const current = dialogStack[dialogStack.length - 1];
      if (current !== record) return;
      if (event.key === 'Escape' && options.closeOnEscape !== false) {
        event.preventDefault();
        event.stopPropagation();
        record.close('escape');
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable(surface);
      if (!focusable.length) {
        event.preventDefault();
        surface.focus?.();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    record.click = event => {
      if (options.closeOnBackdrop === false || event.target !== container) return;
      record.close('backdrop');
    };
    dialogStack.push(record);
    doc.addEventListener('keydown', record.keydown, true);
    container.addEventListener('click', record.click, true);
    syncDialogBackground();
    options.onOpen?.(record);
    const initialFocus = typeof options.initialFocus === 'function'
      ? options.initialFocus(record)
      : options.initialFocus;
    const focusTarget = initialFocus || getFocusable(surface)[0] || surface;
    window.setTimeout(() => focusTarget?.focus?.({ preventScroll: true }), 0);
    return { close: record.close, element: surface, container, record };
  }

  function dialogConfirm(options = {}) {
    const doc = getDocument();
    if (!doc?.body) return Promise.resolve(false);
    const overlay = doc.createElement('div');
    overlay.className = 'app-dialog-overlay';
    overlay.dataset.appDialog = 'confirm';
    const surface = doc.createElement('section');
    surface.className = `app-dialog app-confirm-dialog${options.danger ? ' is-danger' : ''}`;
    const title = String(options.title || '确认操作');
    const message = String(options.message || options.description || '确定继续吗？');
    const confirmLabel = String(options.confirmLabel || '确定');
    const cancelLabel = String(options.cancelLabel || '取消');
    surface.innerHTML = [
      `<h2 class="app-dialog-title">${escapeHtml(title)}</h2>`,
      `<p class="app-dialog-message">${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
      '<div class="app-dialog-actions">',
      `<button type="button" class="btn app-dialog-cancel">${escapeHtml(cancelLabel)}</button>`,
      `<button type="button" class="btn ${options.danger ? 'btn-danger' : 'btn-primary'} app-dialog-confirm">${escapeHtml(confirmLabel)}</button>`,
      '</div>'
    ].join('');
    overlay.appendChild(surface);
    doc.body.appendChild(overlay);
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        handle.close(value ? 'confirm' : 'cancel');
        window.setTimeout(() => overlay.remove(), 0);
        resolve(!!value);
      };
      const handle = dialogOpen({
        element: surface,
        container: overlay,
        role: options.alert ? 'alertdialog' : 'dialog',
        title,
        trigger: options.trigger,
        openClass: 'is-open',
        closeClass: 'is-open',
        onClose: reason => {
          if (!settled) {
            settled = true;
            resolve(reason === 'confirm');
          }
          window.setTimeout(() => overlay.remove(), 0);
        }
      });
      surface.querySelector('.app-dialog-cancel')?.addEventListener('click', () => finish(false));
      surface.querySelector('.app-dialog-confirm')?.addEventListener('click', () => finish(true));
    });
  }

  function ensureStylesheet(key, href) {
    const doc = getDocument();
    if (!doc || !href) return Promise.resolve(null);
    const cacheKey = String(key || href);
    if (stylesheetPromises.has(cacheKey)) return stylesheetPromises.get(cacheKey);
    const promise = new Promise((resolve, reject) => {
      let link = [...doc.querySelectorAll('link[rel="stylesheet"]')].find(item => item.dataset.appStylesheet === cacheKey || item.getAttribute('href') === href);
      if (!link) {
        link = doc.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.dataset.appStylesheet = cacheKey;
        doc.head.appendChild(link);
      } else {
        link.dataset.appStylesheet = cacheKey;
      }
      if (link.sheet) {
        resolve(link);
        return;
      }
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => reject(new Error(`样式加载失败：${href}`)), { once: true });
      window.setTimeout(() => {
        if (link.sheet) resolve(link);
      }, 0);
    }).catch(error => {
      stylesheetPromises.delete(cacheKey);
      throw error;
    });
    stylesheetPromises.set(cacheKey, promise);
    return promise;
  }

  function setActiveWorkspace(workspace, options = {}) {
    const doc = getDocument();
    const value = String(workspace || 'studio');
    if (!doc) return value;
    doc.querySelectorAll('[data-workspace-nav]').forEach(button => {
      const active = button.dataset.workspaceNav === value;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    doc.body?.setAttribute('data-active-workspace', value);
    applyWorkspaceVisibility(doc, value);
    if (dialogStack.length) syncDialogBackground();
    focusWorkspaceAfterChange(doc, value, options);
    try { doc.dispatchEvent(new CustomEvent('app-workspace-change', { detail: { id: value, options } })); } catch {}
    return value;
  }

  global.AppUtils = {
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    formatDurationMs: formatDurationMs,
    copyTextToClipboard: copyTextToClipboard,
    getPromptTitle: getPromptTitle,
    guessMimeFromUrl: guessMimeFromUrl,
    normalizeMediaUrl: normalizeMediaUrl,
    getExtensionFromMime: getExtensionFromMime,
    readFileAsDataUrl: readFileAsDataUrl,
    setActiveWorkspace: setActiveWorkspace,
    ensureStylesheet: ensureStylesheet,
    dialog: {
      open: dialogOpen,
      confirm: dialogConfirm,
      get stack() { return dialogStack.slice(); }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
