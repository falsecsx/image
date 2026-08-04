import { marked } from '../../vendor/marked.esm.js';
import DOMPurify from '../../vendor/purify.es.js';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

const renderer = new marked.Renderer();
renderer.html = token => escapeHtml(token?.text || token?.raw || '');

export function renderSafeMarkdown(markdown) {
  const parsed = marked.parse(String(markdown || ''), {
    renderer,
    gfm: true,
    breaks: true,
    async: false
  });
  const clean = DOMPurify.sanitize(parsed, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'hr'
    ],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false
  });
  const template = document.createElement('template');
  template.innerHTML = clean;
  for (const link of template.content.querySelectorAll('a[href]')) {
    try {
      const url = new URL(link.getAttribute('href'), location.href);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } catch {
      link.replaceWith(...link.childNodes);
    }
  }
  for (const link of template.content.querySelectorAll('a:not([href])')) {
    link.replaceWith(...link.childNodes);
  }
  return template.innerHTML;
}
