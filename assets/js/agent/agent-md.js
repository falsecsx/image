function escapeHeading(text) {
  return String(text || '').replace(/([#*_`~\[\]\\])/g, '\\$1');
}
function isoOrEmpty(ts) {
  if (!ts) return '';
  try { return new Date(ts).toISOString(); } catch { return ''; }
}
function formatProposalBlock(raw) {
  if (!raw) return '';
  const lines = ['[Propose]'];
  if (raw.media_type) lines.push(`media_type: ${raw.media_type}`);
  if (raw.prompt) lines.push(`prompt: ${raw.prompt}`);
  if (raw.reason) lines.push(`reason: ${raw.reason}`);
  if (raw.suggested_aspect_ratio) lines.push(`aspect: ${raw.suggested_aspect_ratio}`);
  if (raw.requested_aspect_ratio) lines.push(`requested_aspect: ${raw.requested_aspect_ratio}`);
  if (raw.parallel_count != null) lines.push(`parallel_count: ${raw.parallel_count}`);
  if (raw.video_duration != null) lines.push(`video_duration: ${raw.video_duration}`);
  if (raw.video_style) lines.push(`video_style: ${raw.video_style}`);
  if (raw.video_motion) lines.push(`video_motion: ${raw.video_motion}`);
  if (raw.gpt_image_quality) lines.push(`quality: ${raw.gpt_image_quality}`);
  if (raw.gpt_image_style) lines.push(`style: ${raw.gpt_image_style}`);
  if (raw.gpt_image_background) lines.push(`background: ${raw.gpt_image_background}`);
  return lines.join('\n');
}

export function buildAgentMarkdown(agent) {
  if (!agent) return '';
  const title = escapeHeading(agent.title || '未命名会话');
  const meta = [
    `createdAt: ${isoOrEmpty(agent.createdAt)}`,
    `updatedAt: ${isoOrEmpty(agent.updatedAt)}`,
    `messageCount: ${(agent.messages || []).length}`,
    `contextScope: ${agent.contextScope || 'minimal'}`,
    `contextTurns: ${Number.isFinite(Number(agent.contextTurns)) ? (Number(agent.contextTurns) <= 0 ? 'all' : Number(agent.contextTurns)) : 12}`,
    `webSearch: ${agent.webSearchEnabled === false ? 'off' : 'on'}`
  ].join('\n- ');
  const head = `# ${title}\n\n- ${meta}\n\n---`;

  const body = (agent.messages || []).map(m => {
    const ts = isoOrEmpty(m.createdAt);
    const role = m.role === 'user' ? 'User' : 'Assistant';
    let block = `\n\n## ${role} · ${ts}\n\n${m.text || ''}`;
    if (m.status && m.status !== 'completed') block += `\n\n[Status]\n${m.status}`;
    if (m.reasoning) block += `\n\n[Reasoning]\n${m.reasoning}`;
    const sources = (Array.isArray(m.sources) ? m.sources : []).filter(source => {
      try { return ['http:', 'https:'].includes(new URL(source?.url || '').protocol); } catch { return false; }
    });
    if (sources.length) {
      block += '\n\n[Sources]\n' + sources.map(source => `- [${source.title || source.url}](${source.url})`).join('\n');
    }
    if (m.proposalId && agent.proposals && agent.proposals[m.proposalId]) {
      block += `\n\n${formatProposalBlock(agent.proposals[m.proposalId].raw)}`;
    }
    return block;
  }).join('\n\n---\n');

  return head + body + '\n';
}

export function downloadAgentMarkdown(agent) {
  const md = buildAgentMarkdown(agent);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = agent.createdAt ? new Date(agent.createdAt) : new Date();
  const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const idShort = String(agent.id || 'agent').slice(0, 8);
  a.href = url;
  a.download = `agent-${yyyymmdd}-${idShort}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
