import {
  createCanvasConfigNode,
  createCanvasEdge,
  createCanvasGroupNode,
  createCanvasMediaNode,
  createCanvasNoteNode,
  createCanvasProject,
  createCanvasTextNode,
  normalizeCanvasProject
} from './canvas-model.js?v=20260808-1';

function createDemoImageDataUri(title, accent = '#7c3aed', background = '#0f172a') {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${background}" />
          <stop offset="100%" stop-color="#1e293b" />
        </linearGradient>
      </defs>
      <rect width="960" height="640" fill="url(#bg)" rx="36" />
      <circle cx="200" cy="170" r="92" fill="${accent}" fill-opacity="0.22" />
      <circle cx="758" cy="480" r="150" fill="#38bdf8" fill-opacity="0.12" />
      <rect x="132" y="120" width="696" height="400" rx="28" fill="#0f172a" fill-opacity="0.68" stroke="#ffffff" stroke-opacity="0.18" />
      <text x="480" y="292" text-anchor="middle" font-family="Arial, sans-serif" font-size="46" font-weight="700" fill="#f8fafc">${title}</text>
      <text x="480" y="350" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#cbd5e1">示例画布素材</text>
      <text x="480" y="408" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#94a3b8">可拖动、可连线、可替换为真实历史图</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

export function createCanvasSampleProject() {
  const project = createCanvasProject('教学示例：历史图 -> 编排节点 -> 结果图');
  const group = createCanvasGroupNode({
    title: '三步生图流程',
    x: 30,
    y: 40,
    width: 1120,
    height: 610,
    zIndex: 0
  });
  const note = createCanvasNoteNode({
    title: '第 1 步：放入历史图',
    text: '来源有三种：\n1. 点「示例填入历史」直接用最新历史图\n2. 导入媒体后点「替换历史图」\n3. 选中参考图后点「智能接线」\n\n目标是让真实图片进入右边的「历史图」节点。',
    x: 70,
    y: 100,
    width: 260,
    height: 220,
    zIndex: 1
  });
  const text = createCanvasTextNode({
    title: '第 2 步：补充编排信息',
    text: '把你想新增的画面要求写清楚：\n- 主体：延续历史图角色\n- 场景：城市夜景\n- 风格：赛博霓虹\n- 镜头：中景，侧逆光\n- 目标：生成一张新的结果图',
    x: 360,
    y: 100,
    width: 320,
    height: 220,
    zIndex: 2
  });
  const historyImage = createCanvasMediaNode({
    title: '历史图（参考输入）',
    kind: 'image',
    x: 730,
    y: 110,
    width: 280,
    height: 210,
    zIndex: 2,
    canvasRole: 'reference',
    resourceSrc: createDemoImageDataUri('历史图', '#38bdf8', '#111827'),
    thumbnailSrc: createDemoImageDataUri('历史图', '#38bdf8', '#111827'),
    posterSrc: '',
    mimeType: 'image/svg+xml'
  });
  const output = createCanvasMediaNode({
    title: '结果图（自动回写）',
    kind: 'image',
    x: 730,
    y: 400,
    width: 280,
    height: 210,
    zIndex: 2,
    canvasRole: 'target',
    resourceSrc: createDemoImageDataUri('结果图', '#22c55e', '#0f172a'),
    thumbnailSrc: createDemoImageDataUri('结果图', '#22c55e', '#0f172a'),
    posterSrc: '',
    mimeType: 'image/svg+xml'
  });
  const config = createCanvasConfigNode({
    title: '第 3 步：编排节点（生成规则）',
    composerContent: `请参考 @[node:${historyImage.id}] 的角色特征。\n保留人物身份与主要外观。\n再结合左侧的提示词骨架，生成一张新的城市夜景结果图。`,
    promptText: '请延续历史图角色形象，结合新的场景和风格要求，生成一张统一风格的结果图。',
    targetNodeId: output.id,
    generationKind: 'image',
    x: 360,
    y: 390,
    width: 330,
    height: 230,
    zIndex: 3,
    references: [historyImage.id]
  });
  const helper = createCanvasNoteNode({
    title: '执行生成时会发生什么',
    text: '1. 用「示例填入历史 / 替换历史图」放好参考\n2. 点「智能接线」整理连线\n3. 选中编排节点后「执行生成」\n4. 结果会闪动并定位到「结果图」',
    x: 1030,
    y: 180,
    width: 150,
    height: 240,
    zIndex: 1
  });

  project.backgroundMode = 'dots';
  project.nodeOrder = [group.id, note.id, text.id, historyImage.id, config.id, output.id, helper.id];
  project.nodes = {
    [group.id]: group,
    [note.id]: note,
    [text.id]: text,
    [historyImage.id]: historyImage,
    [config.id]: config,
    [output.id]: output,
    [helper.id]: helper
  };
  project.edges = Object.fromEntries([
    createCanvasEdge({ fromNodeId: note.id, toNodeId: historyImage.id, label: '导入参考图' }),
    createCanvasEdge({ fromNodeId: text.id, toNodeId: config.id, label: '补充提示词' }),
    createCanvasEdge({ fromNodeId: historyImage.id, toNodeId: config.id, label: '历史图参考' }),
    createCanvasEdge({ fromNodeId: config.id, toNodeId: output.id, label: '执行生成并回写' }),
    createCanvasEdge({ fromNodeId: config.id, toNodeId: helper.id, label: '查看流程说明' })
  ].map(edge => [edge.id, edge]));
  return normalizeCanvasProject(project);
}

export function isCanvasSampleProject(project = {}) {
  const title = String(project?.title || '');
  return title.includes('示例画布') || title.includes('教学示例');
}

export function upgradeCanvasSampleProject(project = {}) {
  if (!isCanvasSampleProject(project)) return normalizeCanvasProject(project);
  const next = createCanvasSampleProject();
  return normalizeCanvasProject({
    ...next,
    id: project.id || next.id,
    createdAt: project.createdAt || next.createdAt,
    updatedAt: Date.now(),
    viewport: project.viewport || next.viewport
  });
}
