const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 45000;
const EMPTY_RESPONSE_MESSAGE = '上游只返回了思考过程，没有返回最终答复或生成方案。请检查当前模型或中转站是否支持 Responses API 工具调用。';

export function buildResponsesUrl(baseUrl) {
  let b = String(baseUrl || '').replace(/\/+$/, '');
  if (/\/v1($|\/)/.test(b)) return `${b}/responses`;
  return `${b}/v1/responses`;
}

export function parseProposalArguments(raw) {
  if (!raw || !String(raw).trim()) return null;
  try {
    const o = JSON.parse(raw);
    if (typeof o.prompt !== 'string' || !o.prompt.trim()) return null;
    const toInt = (value) => {
      const num = typeof value === 'string' ? Number.parseInt(value, 10) : value;
      return Number.isFinite(num) ? num : undefined;
    };
    const action = o.action === 'edit' ? 'edit' : 'generate';
    const mediaType = o.media_type === 'video' ? 'video' : 'image';
    const ids = Array.isArray(o.referenced_image_ids) ? o.referenced_image_ids.filter(x => typeof x === 'string') : [];
    return {
      action,
      media_type: mediaType,
      prompt: o.prompt,
      reason: typeof o.reason === 'string' ? o.reason : '',
      referenced_image_ids: ids,
      requested_aspect_ratio: typeof o.requested_aspect_ratio === 'string' ? o.requested_aspect_ratio : undefined,
      suggested_aspect_ratio: typeof o.suggested_aspect_ratio === 'string' ? o.suggested_aspect_ratio : undefined,
      parallel_count: toInt(o.parallel_count),
      video_duration: toInt(o.video_duration),
      video_style: typeof o.video_style === 'string' ? o.video_style : undefined,
      video_motion: typeof o.video_motion === 'string' ? o.video_motion : undefined,
      gpt_image_quality: typeof o.gpt_image_quality === 'string' ? o.gpt_image_quality : undefined,
      gpt_image_style: typeof o.gpt_image_style === 'string' ? o.gpt_image_style : undefined,
      gpt_image_background: typeof o.gpt_image_background === 'string' ? o.gpt_image_background : undefined,
      requested_output_size: typeof o.requested_output_size === 'string' ? o.requested_output_size : undefined
    };
  } catch { return null; }
}

export function isRetryableAgentError(err) {
  if (!err) return false;
  const code = String(err.code || '').toUpperCase();
  if (['AGENT_TIMEOUT', 'AGENT_EMPTY_RESPONSE', 'AGENT_STREAM_INCOMPLETE'].includes(code)) return true;
  const m = String(err.message || '').toLowerCase();
  return ['timeout','timed out','超时','超过','network','failed to fetch','load failed','econnreset','terminated','rate limit','temporarily','overloaded','408','409','425','429','500','502','503','504'].some(k => m.includes(k));
}

function createAbortError(message = 'Agent request aborted') {
  const error = new Error(message);
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

function createTimeoutError(timeoutMs) {
  const error = new Error(`Agent 请求超过 ${Math.round(timeoutMs / 1000)} 秒仍未完成，请检查接口地址、模型能力或中转站流式支持。`);
  error.name = 'TimeoutError';
  error.code = 'AGENT_TIMEOUT';
  return error;
}

function createIncompleteResponseError() {
  const error = new Error(EMPTY_RESPONSE_MESSAGE);
  error.code = 'AGENT_EMPTY_RESPONSE';
  return error;
}

function createStreamIncompleteError() {
  const error = new Error('Agent 流式响应未正常结束，请检查中转站是否完整转发 Responses API 事件。');
  error.code = 'AGENT_STREAM_INCOMPLETE';
  return error;
}

function normalizeStreamError(err, attempts) {
  const m = String(err?.message || err || '').toLowerCase();
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) {
    return new Error(`网络连接失败，已自动重试 ${attempts} 次仍未成功`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

function toErrorText(status, statusText, raw) {
  const detail = String(raw || '').trim();
  return detail ? `${status} ${statusText}: ${detail}` : `${status} ${statusText}`;
}

function shouldFallbackToChat(url, status, raw) {
  const lower = String(raw || '').toLowerCase();
  return /\/v1\/responses(\?|$)/i.test(String(url || ''))
    && [400, 404, 405].includes(Number(status))
    && (
      lower.includes('invalid url')
      || lower.includes('invalid schema')
      || lower.includes('schema for function')
      || lower.includes('tool')
      || lower.includes('reasoning')
      || lower.includes('unrecognized')
      || lower.includes('unexpected')
      || lower.includes('/v1/responses')
      || lower.includes('not found')
      || lower.includes('unsupported')
      || lower.includes('unknown')
    );
}

function normalizeChatTool(tool) {
  if (!tool || typeof tool !== 'object') return null;
  if (tool.type !== 'function') return tool;
  if (tool.function && typeof tool.function === 'object') return tool;
  return {
    type: 'function',
    function: {
      name: tool.name || 'tool',
      description: tool.description || '',
      parameters: tool.parameters && typeof tool.parameters === 'object'
        ? tool.parameters
        : { type: 'object', properties: {}, additionalProperties: false }
    }
  };
}

function toChatTools(tools) {
  return (Array.isArray(tools) ? tools : [])
    .filter(tool => tool?.type === 'function')
    .map(normalizeChatTool)
    .filter(Boolean);
}

export function normalizeAgentSources(values) {
  const seen = new Set();
  const sources = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    const type = String(value.type || '').toLowerCase();
    const candidate = value.url_citation && typeof value.url_citation === 'object'
      ? value.url_citation
      : value;
    const rawUrl = candidate.url || candidate.uri || candidate.href;
    if (rawUrl && (!type || type.includes('citation') || type.includes('source') || value.url_citation)) {
      try {
        const url = new URL(String(rawUrl));
        if (['http:', 'https:'].includes(url.protocol) && !seen.has(url.href)) {
          seen.add(url.href);
          sources.push({
            title: String(candidate.title || candidate.name || url.hostname || url.href).trim().slice(0, 240),
            url: url.href
          });
        }
      } catch {}
    }
    for (const key of ['annotation', 'annotations', 'sources', 'citations', 'content', 'output', 'item', 'response']) {
      if (value[key]) visit(value[key]);
    }
  };
  visit(values);
  return sources;
}

function containsWebSearchCall(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (String(value.type || '').toLowerCase().includes('web_search')) return true;
  return Object.values(value).some(item => Array.isArray(item)
    ? item.some(child => containsWebSearchCall(child, seen))
    : containsWebSearchCall(item, seen));
}

function toChatMessages(input) {
  const messages = [];
  if (input.instructions) {
    messages.push({ role: 'system', content: input.instructions });
  }

  for (const item of (input.history || [])) {
    if (!item || !item.role) continue;
    if (item.role === 'user') {
      const content = [];
      for (const part of (item.content || [])) {
        if (part?.type === 'input_text' && typeof part.text === 'string' && part.text) {
          content.push({ type: 'text', text: part.text });
        } else if (part?.type === 'input_image' && typeof part.image_url === 'string' && part.image_url) {
          content.push({ type: 'image_url', image_url: { url: part.image_url } });
        }
      }
      if (content.length === 1 && content[0].type === 'text') {
        messages.push({ role: 'user', content: content[0].text });
      } else if (content.length) {
        messages.push({ role: 'user', content });
      }
    } else if (item.role === 'assistant') {
      const text = Array.isArray(item.content)
        ? item.content
          .map(part => part?.text || part?.content || part?.output_text || '')
          .filter(Boolean)
          .join('')
        : '';
      messages.push({ role: 'assistant', content: text });
    }
  }

  return messages;
}

async function readSSE(body, signal, onEvent) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let shouldStop = false;
  let failed = false;
  const consume = async (flush = false) => {
    while (!shouldStop) {
      const boundary = /\r?\n\r?\n/.exec(buf);
      if (!boundary) break;
      const event = buf.slice(0, boundary.index);
      buf = buf.slice(boundary.index + boundary[0].length);
      const result = await dispatchSSEEvent(event, onEvent);
      if (result === false) {
        shouldStop = true;
        break;
      }
    }

    // Some relays close the connection without writing the final blank line.
    if (flush && !shouldStop && buf.trim()) {
      const result = await dispatchSSEEvent(buf, onEvent);
      buf = '';
      if (result === false) shouldStop = true;
    }
  };
  const cancelReader = () => {
    try { void reader.cancel(); } catch {}
  };
  const onAbort = () => cancelReader();

  if (signal?.aborted) throw createAbortError();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    while (!shouldStop) {
      if (signal?.aborted) throw createAbortError();
      const { value, done } = await reader.read();
      if (done) {
        if (signal?.aborted) throw createAbortError();
        buf += dec.decode();
        await consume(true);
        break;
      }
      buf += dec.decode(value, { stream: true });
      await consume();
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (shouldStop || failed || signal?.aborted) cancelReader();
  }
}

async function dispatchSSEEvent(event, onEvent) {
  const dataLines = [];
  for (const rawLine of String(event || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    else if (dataLines.length && !/^[a-zA-Z-]+:/.test(line)) dataLines.push(line);
  }
  if (!dataLines.length) return undefined;
  return onEvent(dataLines.join('\n'));
}

async function runResponses(input, callbacks, signal) {
  const body = {
    model: input.model || 'gpt-5.4-mini',
    stream: true,
    reasoning: { effort: 'medium', summary: 'detailed' },
    instructions: input.instructions || '',
    tools: input.tools || [],
    tool_choice: 'auto',
    input: input.history || []
  };
  const url = input.endpoint || buildResponsesUrl(input.baseUrl);
  try { console.info('[agent] responses request', { url, model: body.model, stream: body.stream }); } catch {}
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}`, Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const raw = await res.text();
    const err = new Error(toErrorText(res.status, res.statusText, raw));
    err.status = res.status;
    err.raw = raw;
    err.url = url;
    throw err;
  }
  if (!res.body) throw new Error('no response body');

  let accText = '';
  let accReason = '';
  let toolArgs = '';
  const sourcesByUrl = new Map();
  let searchUsed = false;
  let fired = false;
  const collectMetadata = (value) => {
    for (const source of normalizeAgentSources(value)) sourcesByUrl.set(source.url, source);
    if (containsWebSearchCall(value)) searchUsed = true;
  };
  const fireDone = (streamEndedUnexpectedly = false) => {
    if (fired) return; fired = true;
    const proposal = parseProposalArguments(toolArgs);
    if (!accText.trim() && !proposal) {
      throw streamEndedUnexpectedly ? createStreamIncompleteError() : createIncompleteResponseError();
    }
    callbacks.onDone(accText, proposal, { sources: [...sourcesByUrl.values()], searchUsed });
  };

  await readSSE(res.body, signal, (data) => {
    if (data === '[DONE]') { fireDone(); return false; }
    let env; try { env = JSON.parse(data); } catch { return; }
    collectMetadata(env);
    const t = env.type || '';
    if (t === 'response.reasoning_summary_text.delta') {
      const d = typeof env.delta === 'string' ? env.delta : ''; accReason += d; callbacks.onReasoning?.(d);
    } else if (t === 'response.reasoning_summary_part.added') {
      callbacks.onReasoning?.('\n');
    } else if (t === 'response.output_text.delta') {
      const d = typeof env.delta === 'string' ? env.delta : ''; accText += d; callbacks.onDelta(d);
    } else if (t === 'response.output_text.done') {
      if (typeof env.text === 'string' && env.text.length > accText.length) {
        const tail = env.text.slice(accText.length); accText = env.text; callbacks.onDelta(tail);
      }
    } else if (t === 'response.function_call_arguments.delta') {
      if (typeof env.delta === 'string') toolArgs += env.delta;
    } else if (t === 'response.function_call_arguments.done') {
      if (typeof env.arguments === 'string' && env.arguments) toolArgs = env.arguments;
    } else if (t === 'response.output_item.done') {
      if (env.item?.type === 'function_call' && typeof env.item.arguments === 'string' && env.item.arguments) {
        toolArgs = env.item.arguments;
      }
    } else if (t === 'response.completed') {
      collectMetadata(env.response);
      const out = env.response?.output_text;
      if (typeof out === 'string' && out.length > accText.length) {
        const tail = out.slice(accText.length); accText = out; callbacks.onDelta(tail);
      }
      const fc = (env.response?.output || []).find(i => i.type === 'function_call' && typeof i.arguments === 'string');
      if (fc?.arguments && !toolArgs.trim()) toolArgs = fc.arguments;
      fireDone();
      return false;
    } else if (t === 'response.failed' || t === 'response.incomplete' || t === 'response.cancelled' || t === 'response.canceled') {
      const detail = env.error?.message || env.response?.error?.message || env.response?.incomplete_details?.reason || env.message;
      const error = new Error(detail || `Agent response ended with ${t}.`);
      error.code = t === 'response.incomplete' ? 'AGENT_STREAM_INCOMPLETE' : 'AGENT_RESPONSE_FAILED';
      throw error;
    } else if (t === 'error' || t === 'response.error') {
      throw new Error(env.error?.message || env.message || 'model error');
    }
  });
  fireDone(true);
}

async function runChatCompletions(input, callbacks, signal) {
  const base = String(input.baseUrl || '').replace(/\/+$/, '');
  const url = input.chatEndpoint || (base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`);
  const body = {
    model: input.model || 'gpt-5.4-mini',
    stream: true,
    messages: toChatMessages(input),
    tools: toChatTools(input.tools || []),
    tool_choice: 'auto'
  };
  try { console.info('[agent] chat.completions fallback request', { url, model: body.model, stream: body.stream }); } catch {}
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}`, Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok) {
    const raw = await res.text();
    const err = new Error(toErrorText(res.status, res.statusText, raw));
    err.status = res.status;
    err.raw = raw;
    err.url = url;
    throw err;
  }
  if (!res.body) throw new Error('no response body');

  let accText = '';
  let toolArgs = '';
  let fired = false;
  const fireDone = (streamEndedUnexpectedly = false) => {
    if (fired) return; fired = true;
    const proposal = parseProposalArguments(toolArgs);
    if (!accText.trim() && !proposal) {
      throw streamEndedUnexpectedly ? createStreamIncompleteError() : createIncompleteResponseError();
    }
    callbacks.onDone(accText, proposal, { sources: [], searchUsed: false });
  };

  await readSSE(res.body, signal, (data) => {
    if (data === '[DONE]') { fireDone(); return false; }
    let env; try { env = JSON.parse(data); } catch { return; }
    const choice = env?.choices?.[0];
    if (!choice) {
      const msg = env?.error?.message || env?.message;
      if (msg) throw new Error(msg);
      return;
    }

    const delta = choice.delta || {};
    if (typeof delta.content === 'string' && delta.content) {
      accText += delta.content;
      callbacks.onDelta(delta.content);
    } else if (Array.isArray(delta.content)) {
      for (const item of delta.content) {
        const text = item?.text || item?.content || '';
        if (!text) continue;
        accText += text;
        callbacks.onDelta(text);
      }
    }

    const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
    for (const call of toolCalls) {
      const args = call?.function?.arguments;
      if (typeof args === 'string' && args) toolArgs += args;
    }

    const finalMessage = choice.message || {};
    if (typeof finalMessage.content === 'string' && finalMessage.content.length > accText.length) {
      const tail = finalMessage.content.slice(accText.length);
      accText = finalMessage.content;
      callbacks.onDelta(tail);
    }
    const finalToolCalls = Array.isArray(finalMessage.tool_calls) ? finalMessage.tool_calls : [];
    for (const call of finalToolCalls) {
      const args = call?.function?.arguments;
      if (typeof args === 'string' && args && !toolArgs.trim()) toolArgs = args;
    }

    if (choice.finish_reason) {
      fireDone();
      return false;
    }
  });
  fireDone(true);
}

async function runAttempt(input, callbacks, parentSignal) {
  const attemptCtrl = new AbortController();
  const timeoutMs = Number.isFinite(input?.timeoutMs) && input.timeoutMs > 0
    ? input.timeoutMs
    : ATTEMPT_TIMEOUT_MS;
  let timedOut = false;
  let timeoutError = null;
  const propagateAbort = () => {
    try { attemptCtrl.abort(parentSignal?.reason); } catch { attemptCtrl.abort(); }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    timeoutError = createTimeoutError(timeoutMs);
    try { attemptCtrl.abort(timeoutError); } catch { attemptCtrl.abort(); }
  }, timeoutMs);

  if (parentSignal?.aborted) propagateAbort();
  else parentSignal?.addEventListener('abort', propagateAbort, { once: true });

  try {
    await runOne(input, callbacks, attemptCtrl.signal);
  } catch (error) {
    if (timedOut) throw timeoutError || createTimeoutError(timeoutMs);
    if (parentSignal?.aborted) throw createAbortError();
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', propagateAbort);
  }
}

export function streamAgentChat(input, callbacks) {
  const ctrl = new AbortController();
  const externalSignal = input?.signal;
  const propagateExternalAbort = () => {
    try { ctrl.abort(externalSignal?.reason); } catch { ctrl.abort(); }
  };
  if (externalSignal?.aborted) propagateExternalAbort();
  else externalSignal?.addEventListener('abort', propagateExternalAbort, { once: true });

  const promise = (async () => {
    let lastErr = null;
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (ctrl.signal.aborted) return;
        try {
          await runAttempt(input, callbacks, ctrl.signal);
          return;
        } catch (err) {
          if (ctrl.signal.aborted) return;
          lastErr = err;
          if (attempt >= MAX_ATTEMPTS || !isRetryableAgentError(err)) throw normalizeStreamError(err, attempt);
          callbacks.onRetry?.(attempt + 1, MAX_ATTEMPTS, normalizeStreamError(err, attempt));
        }
      }
      throw lastErr || new Error('agent request failed');
    } finally {
      externalSignal?.removeEventListener('abort', propagateExternalAbort);
    }
  })();
  return { abort: () => ctrl.abort(createAbortError()), promise };
}

async function runOne(input, callbacks, signal) {
  try {
    await runResponses(input, callbacks, signal);
  } catch (err) {
    const streamFallback = ['AGENT_EMPTY_RESPONSE', 'AGENT_STREAM_INCOMPLETE'].includes(String(err?.code || '').toUpperCase());
    if (!shouldFallbackToChat(err?.url, err?.status, err?.raw) && !streamFallback) throw err;
    callbacks.onReasoning?.(streamFallback
      ? '\n[agent] Responses 流未返回最终答复，已自动切换到 /v1/chat/completions。\n'
      : '\n[agent] 当前上游不支持 /v1/responses，已自动切换到 /v1/chat/completions。\n');
    await runChatCompletions(input, callbacks, signal);
  }
}
