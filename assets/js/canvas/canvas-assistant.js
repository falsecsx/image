import { streamAgentChat } from '../agent/agent-client.js';

export function createCanvasAssistantSession(title = '新会话') {
  const now = Date.now();
  return {
    id: createId('canvas-chat'),
    title: String(title || '新会话'),
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

export function normalizeCanvasAssistantSessions(value) {
  return (Array.isArray(value) ? value : []).map(session => ({
    id: String(session?.id || createId('canvas-chat')),
    title: String(session?.title || '新会话'),
    createdAt: Number(session?.createdAt) || Date.now(),
    updatedAt: Number(session?.updatedAt) || Date.now(),
    messages: (Array.isArray(session?.messages) ? session.messages : []).map(message => ({
      id: String(message?.id || createId('canvas-message')),
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      text: String(message?.text || ''),
      createdAt: Number(message?.createdAt) || Date.now()
    }))
  }));
}

export function collectCanvasAssistantContext(project, selectedIds = []) {
  const nodes = project?.nodes || {};
  const edges = Object.values(project?.edges || {});
  const selected = [...new Set((Array.isArray(selectedIds) ? selectedIds : []).filter(id => nodes[id]))];
  const included = new Set(selected);
  const queue = [...selected];
  while (queue.length) {
    const targetId = queue.shift();
    edges.forEach(edge => {
      if (edge?.toNodeId !== targetId || !nodes[edge.fromNodeId] || included.has(edge.fromNodeId)) return;
      included.add(edge.fromNodeId);
      queue.push(edge.fromNodeId);
    });
  }
  return [...included].map(id => serializeNode(nodes[id])).filter(Boolean);
}

export function buildCanvasAssistantInstructions(context = []) {
  const catalog = context.length
    ? context.map((node, index) => `${index + 1}. [${node.id}] ${node.title} (${node.type})\n${node.text}`).join('\n\n')
    : '当前没有选中节点。';
  return [
    '你是画布内的 AI 创作助手。回答要直接、可执行，并使用中文。',
    '你会收到当前选中节点及其上游节点摘要。不要声称看到了未提供的内容。',
    '当用户要求生成图片或视频时，先给出可直接生成的提示词；画布会提供单独的生成按钮。',
    `画布上下文：\n${catalog}`
  ].join('\n\n');
}

export function mountCanvasAssistant(root, options = {}) {
  if (!root) return null;
  const getProject = options.getProject;
  const getSelectedIds = options.getSelectedIds;
  const persist = options.persist;
  const agentBridge = options.agentBridge || globalThis.AgentBridge;
  let request = null;
  let currentSessionId = '';
  let promptLibraryItems = null;
  let promptLibraryRequest = null;

  const sessionSelect = root.querySelector('[data-role="canvas-assistant-session"]');
  const messagesEl = root.querySelector('[data-role="canvas-assistant-messages"]');
  const input = root.querySelector('[data-role="canvas-assistant-input"]');
  const promptLibrary = root.querySelector('[data-role="canvas-assistant-prompt-library"]');
  const sendButton = root.querySelector('[data-action="canvas-assistant-send"]');
  const stopButton = root.querySelector('[data-action="canvas-assistant-stop"]');
  const status = root.querySelector('[data-role="canvas-assistant-status"]');

  function ensureSession() {
    const project = getProject?.();
    if (!project) return null;
    project.assistantSessions = normalizeCanvasAssistantSessions(project.assistantSessions);
    let session = project.assistantSessions.find(item => item.id === (project.activeAssistantSessionId || currentSessionId));
    if (!session) {
      session = createCanvasAssistantSession();
      project.assistantSessions.push(session);
    }
    currentSessionId = session.id;
    project.activeAssistantSessionId = session.id;
    return session;
  }

  function render() {
    const project = getProject?.();
    const session = ensureSession();
    if (!project || !session) return;
    if (sessionSelect) {
      sessionSelect.innerHTML = project.assistantSessions.map(item => (
        `<option value="${escapeHtml(item.id)}"${item.id === session.id ? ' selected' : ''}>${escapeHtml(item.title)}</option>`
      )).join('');
    }
    if (messagesEl) {
      messagesEl.innerHTML = session.messages.length
        ? session.messages.map(message => `<article class="canvas-assistant-message is-${message.role}"><strong>${message.role === 'assistant' ? '助手' : '你'}</strong><div>${escapeHtml(message.text).replace(/\n/g, '<br>')}</div></article>`).join('')
        : '<div class="canvas-assistant-empty">选择画布节点后，可以围绕它及其上游内容继续创作。</div>';
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    syncPromptLibrary();
  }

  function syncPromptLibrary() {
    if (!promptLibrary || promptLibraryItems) {
      if (promptLibrary && promptLibraryItems) renderPromptLibraryOptions();
      return;
    }
    if (promptLibraryRequest || typeof agentBridge?.getPromptLibraryTitles !== 'function') return;
    promptLibraryRequest = Promise.resolve(agentBridge.getPromptLibraryTitles())
      .then(items => {
        promptLibraryItems = Array.isArray(items) ? items.map(String).filter(Boolean) : [];
        renderPromptLibraryOptions();
      })
      .catch(() => { promptLibraryItems = []; })
      .finally(() => { promptLibraryRequest = null; });
  }

  function renderPromptLibraryOptions() {
    if (!promptLibrary) return;
    promptLibrary.innerHTML = '<option value="">提示词库</option>' + (promptLibraryItems || [])
      .map(title => `<option value="${escapeHtml(title)}">${escapeHtml(title)}</option>`)
      .join('');
  }

  function setBusy(busy, text = '') {
    if (sendButton) sendButton.hidden = busy;
    if (stopButton) stopButton.hidden = !busy;
    if (input) input.disabled = busy;
    if (status && (text || busy)) status.textContent = text || '正在思考';
  }

  async function send() {
    const text = String(input?.value || '').trim();
    if (!text || request) return;
    const project = getProject?.();
    const session = ensureSession();
    if (!project || !session) return;
    if (!agentBridge?.getApiKey?.()) {
      if (status) status.textContent = '请先配置 API Key';
      return;
    }
    input.value = '';
    const userMessage = { id: createId('canvas-message'), role: 'user', text, createdAt: Date.now() };
    const assistantMessage = { id: createId('canvas-message'), role: 'assistant', text: '', createdAt: Date.now() };
    session.messages.push(userMessage, assistantMessage);
    session.title = session.messages.filter(item => item.role === 'user')[0]?.text.slice(0, 24) || session.title;
    session.updatedAt = Date.now();
    persist?.();
    render();
    setBusy(true);

    const context = collectCanvasAssistantContext(project, getSelectedIds?.() || []);
    const history = buildCanvasAssistantHistory(session.messages.slice(0, -1), context);
    let accumulated = '';
    request = streamAgentChat({
      apiKey: agentBridge.getApiKey(),
      model: agentBridge.getTextModel?.() || 'gpt-5.4-mini',
      baseUrl: agentBridge.getBaseUrl?.() || '',
      endpoint: agentBridge.buildApiUrl?.('/v1/responses'),
      chatEndpoint: agentBridge.buildApiUrl?.('/v1/chat/completions'),
      instructions: buildCanvasAssistantInstructions(context),
      history
    }, {
      onDelta(delta) {
        accumulated += delta;
        assistantMessage.text = accumulated;
        render();
      },
      onDone(fullText) {
        assistantMessage.text = String(fullText || accumulated || '');
      },
      onRetry(attempt, max) {
        if (status) status.textContent = `正在重试 ${attempt}/${max}`;
      },
      onError(error) {
        assistantMessage.text = `请求失败：${error?.message || error}`;
      }
    });
    try {
      await request.promise;
    } finally {
      request = null;
      session.updatedAt = Date.now();
      persist?.();
      setBusy(false, assistantMessage.text ? '就绪' : '请求已中止');
      render();
    }
  }

  root.addEventListener('click', event => {
    const action = event.target instanceof Element ? event.target.closest('[data-action]')?.getAttribute('data-action') : '';
    if (action === 'canvas-assistant-send') void send();
    if (action === 'canvas-assistant-stop') request?.abort?.();
    if (action === 'canvas-assistant-new') {
      const project = getProject?.();
      if (!project) return;
      const session = createCanvasAssistantSession();
      project.assistantSessions = normalizeCanvasAssistantSessions(project.assistantSessions);
      project.assistantSessions.push(session);
      project.activeAssistantSessionId = session.id;
      currentSessionId = session.id;
      persist?.();
      render();
    }
    if (action === 'canvas-assistant-delete') {
      const project = getProject?.();
      if (!project) return;
      project.assistantSessions = normalizeCanvasAssistantSessions(project.assistantSessions).filter(item => item.id !== currentSessionId);
      project.activeAssistantSessionId = project.assistantSessions[0]?.id || '';
      currentSessionId = project.activeAssistantSessionId;
      persist?.();
      render();
    }
    if (action === 'canvas-assistant-generate-image' || action === 'canvas-assistant-generate-video') {
      const prompt = String(input?.value || '').trim();
      if (!prompt) {
        if (status) status.textContent = '请先输入生成提示词';
        return;
      }
      const kind = action.endsWith('video') ? 'video' : 'image';
      setBusy(true, kind === 'video' ? '正在生成视频' : '正在生成图片');
      Promise.resolve(options.onGenerate?.(kind, prompt))
        .then(() => {
          if (status) status.textContent = '结果已加入画布';
        })
        .catch(error => {
          if (status) status.textContent = `生成失败：${error?.message || error}`;
        })
        .finally(() => {
          if (sendButton) sendButton.hidden = false;
          if (stopButton) stopButton.hidden = true;
          if (input) input.disabled = false;
        });
    }
  });
  input?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  });
  sessionSelect?.addEventListener('change', () => {
    const project = getProject?.();
    if (!project) return;
    currentSessionId = sessionSelect.value;
    project.activeAssistantSessionId = currentSessionId;
    persist?.();
    render();
  });
  promptLibrary?.addEventListener('change', () => {
    if (!input || !promptLibrary.value) return;
    input.value = input.value ? `${input.value}\n${promptLibrary.value}` : promptLibrary.value;
    promptLibrary.value = '';
    input.focus();
  });

  render();
  return {
    render,
    abort() { request?.abort?.(); },
    destroy() { request?.abort?.(); request = null; }
  };
}

function serializeNode(node) {
  if (!node) return null;
  const source = node.text || node.promptText || node.composerContent || node.basePrompt || node.prompt || '';
  const media = node.type === 'media' ? `${node.kind || 'media'} ${node.resourceSrc || node.resourceId || ''}` : '';
  return {
    id: String(node.id || ''),
    type: node.type === 'media' ? `${node.type}:${node.kind || 'image'}` : String(node.type || 'node'),
    title: String(node.title || '未命名节点'),
    text: String(source || media || '').slice(0, 6000),
    mediaSrc: node.type === 'media' ? String(node.resourceSrc || node.thumbnailSrc || node.posterSrc || '') : '',
    mediaKind: node.type === 'media' ? String(node.kind || 'image') : ''
  };
}

export function buildCanvasAssistantHistory(messages = [], context = []) {
  const imageById = new Map((Array.isArray(context) ? context : [])
    .filter(node => node?.mediaKind === 'image' && node.mediaSrc)
    .map(node => [String(node.id), node.mediaSrc]));
  const lastUserIndex = messages.map(message => message?.role).lastIndexOf('user');
  return messages.map((message, index) => {
    const role = message?.role === 'assistant' ? 'assistant' : 'user';
    const content = [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: String(message?.text || '') }];
    if (role === 'user' && index === lastUserIndex) {
      const explicitIds = [...String(message?.text || '').matchAll(/@(?:\[node:([^\]]+)\]|([\w-]+))/g)]
        .map(match => match[1] || match[2])
        .filter(Boolean);
      const candidates = explicitIds.length ? explicitIds : [...imageById.keys()];
      [...new Set(candidates)].slice(0, 4).forEach(id => {
        const imageUrl = imageById.get(id);
        if (imageUrl) content.push({ type: 'input_image', image_url: imageUrl });
      });
    }
    return { role, content };
  });
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
