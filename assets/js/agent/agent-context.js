const SYSTEM_HEAD = `# Role
你是用户的 AI 媒体创作助手。理解用户意图后，在需要生成图片或视频时调用 propose_media_action 工具提出执行方案。

# Rules
1. 只在你已经判断用户要开始生成内容时调用工具；闲聊、问答、分析阶段不要调用。
2. tool_call.media_type 只能是 image 或 video。
3. tool_call.prompt 必须是完整、可直接执行的中文提示词。
4. 用户消息可能引用图片，格式为 [imgId]，请从“当前可用图片目录”获取描述并合理利用。
5. 正文只解释你为什么这样建议（reason），不要重复 prompt 全文。
6. 如果用户明确要做视频，请把 media_type 设为 video；如果是普通生图、改图、插画、海报等，请设为 image。`;

export function buildInstructions(_scope, catalog) {
  const catalogStr = (catalog && catalog.length)
    ? catalog.map(e => `[${e.imgId}] ${e.description}`).join('\n')
    : '（空）';
  return `${SYSTEM_HEAD}\n\n当前可用图片目录：（仅当前对话中明确引用的图片）\n${catalogStr}\n\n引用图时请使用 [imgId] 格式。不要引用当前对话之外的历史图、提示词库或外部上下文。`;
}

export async function buildInputMessages(history, imageResolver) {
  const out = [];
  for (const m of history) {
    if (!m || !m.text || !m.text.trim()) continue;
    if (m.role === 'user') {
      const content = [{ type: 'input_text', text: m.text }];
      if (Array.isArray(m.attachedImageIds)) {
        for (const id of m.attachedImageIds) {
          const img = await imageResolver(id);
          if (img?.dataUrl) content.push({ type: 'input_image', image_url: img.dataUrl });
        }
      }
      out.push({ role: 'user', content });
    } else if (m.role === 'assistant') {
      out.push({ role: 'assistant', content: [{ type: 'output_text', text: m.text }] });
    }
  }
  return out;
}
