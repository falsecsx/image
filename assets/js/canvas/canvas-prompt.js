import {
  createCanvasConfigNode,
  createCanvasEdge,
  createCanvasMediaNode,
  createCanvasMediaNodeFromResource,
  createId
} from './canvas-model.js?v=20260803-4';
import { createCanvasResourceRecord, createEmbeddedResourceId } from './canvas-resources.js?v=20260803-4';

function text(value) {
  return String(value ?? '').trim();
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function entryAttributions(entry = {}) {
  const attributions = Array.isArray(entry.attributions) && entry.attributions.length
    ? entry.attributions
    : [{
      sourceId: text(entry.sourceId),
      sourceUrl: text(entry.sourceUrl),
      author: text(entry.author),
      title: text(entry.title)
    }];
  return attributions.filter(item => item && (item.sourceUrl || item.author || item.sourceId));
}

function resourceMetadata(entry, role) {
  return {
    promptId: text(entry.id),
    promptTitle: text(entry.title),
    sourceId: text(entry.sourceId),
    sourceUrl: text(entry.sourceUrl),
    author: text(entry.author),
    attributions: entryAttributions(entry),
    promptRole: role
  };
}

function nextBranchOrigin(project, point = null) {
  if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) {
    return { x: Number(point.x), y: Number(point.y) };
  }
  const nodes = Object.values(project?.nodes || {}).filter(Boolean);
  if (!nodes.length) return { x: 80, y: 80 };
  const right = Math.max(...nodes.map(node => finite(node.x) + Math.max(120, finite(node.width, 240))));
  const top = Math.min(...nodes.map(node => finite(node.y)));
  return { x: right + 96, y: Math.max(60, top) };
}

function addNode(project, node) {
  project.nodes = project.nodes && typeof project.nodes === 'object' ? project.nodes : {};
  project.nodeOrder = Array.isArray(project.nodeOrder) ? project.nodeOrder : [];
  project.nodes[node.id] = node;
  if (!project.nodeOrder.includes(node.id)) project.nodeOrder.push(node.id);
  return node;
}

function addEdge(project, fromNodeId, toNodeId, label = '') {
  if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) return null;
  project.edges = project.edges && typeof project.edges === 'object' ? project.edges : {};
  const edge = createCanvasEdge({
    id: createId('edge'),
    fromNodeId,
    toNodeId,
    label,
    kind: 'relation'
  });
  project.edges[edge.id] = edge;
  return edge;
}

export function createPromptBranch(project, entry = {}, options = {}) {
  if (!project || typeof project !== 'object') throw new Error('canvas project is required');
  const content = text(entry.content || entry.prompt);
  if (!content) throw new Error('prompt content is empty');

  const origin = nextBranchOrigin(project, options.point);
  const title = text(entry.title) || '提示词分支';
  const coverUrl = text(entry.coverUrl);
  const selectedReferences = Array.isArray(options.referenceUrls)
    ? [...new Set(options.referenceUrls.map(text).filter(Boolean))]
    : [];
  const coverAsReference = options.useCoverAsReference === true && Boolean(coverUrl);
  // The cover already has an example node. When explicitly enabled, reuse that
  // node as a reference input instead of creating a duplicate media node.
  const uniqueReferenceUrls = [...new Set(selectedReferences)];
  const resourceRecords = [];
  const nodeIds = [];
  const addResourceRecord = record => {
    if (!resourceRecords.some(item => item.id === record.id)) resourceRecords.push(record);
    return record;
  };

  let exampleNode = null;
  if (coverUrl) {
    const record = createCanvasResourceRecord({
      kind: 'image',
      src: coverUrl,
      label: `${title} 效果示例`,
      alt: `${title} 效果示例`,
      origin: 'prompt-library-example',
      mimeType: 'image/png',
      metadata: resourceMetadata(entry, 'example')
    }, { id: createEmbeddedResourceId(coverUrl) || undefined });
    addResourceRecord(record);
    exampleNode = addNode(project, createCanvasMediaNodeFromResource(record, {
      title: '效果示例',
      canvasRole: coverAsReference ? 'reference' : 'reference-prompt',
      x: origin.x,
      y: origin.y,
      width: 250,
      height: 190
    }));
    if (/^data:image\//i.test(coverUrl)) {
      exampleNode.resourceSrc = '';
      exampleNode.thumbnailSrc = '';
    }
    nodeIds.push(exampleNode.id);
  }

  const referenceNodes = [];
  uniqueReferenceUrls.forEach((src, index) => {
    const record = createCanvasResourceRecord({
      kind: 'image',
      src,
      label: `${title} 参考图 ${index + 1}`,
      alt: `${title} 参考图 ${index + 1}`,
      origin: 'prompt-library-reference',
      mimeType: 'image/png',
      metadata: resourceMetadata(entry, 'reference')
    }, { id: createEmbeddedResourceId(src) || undefined });
    addResourceRecord(record);
    const node = addNode(project, createCanvasMediaNodeFromResource(record, {
      title: `参考图 ${index + 1}`,
      canvasRole: 'reference',
      x: origin.x,
      y: origin.y + 215 + (index * 205),
      width: 250,
      height: 180
    }));
    if (/^data:image\//i.test(src)) {
      node.resourceSrc = '';
      node.thumbnailSrc = '';
    }
    referenceNodes.push(node);
    nodeIds.push(node.id);
  });

  const referenceIds = referenceNodes.map(node => node.id);
  if (coverAsReference && exampleNode?.id) referenceIds.unshift(exampleNode.id);

  const config = addNode(project, createCanvasConfigNode({
    id: createId('node'),
    title: title.length > 38 ? `${title.slice(0, 38)}...` : title,
    composerContent: content,
    promptText: content,
    generationKind: 'image',
    genConfig: { kind: 'image', model: '' },
    references: referenceIds,
    x: origin.x + 330,
    y: origin.y + 24,
    width: 360,
    height: 280,
    promptEntryId: text(entry.id),
    promptSourceUrl: text(entry.sourceUrl),
    promptAttributions: entryAttributions(entry)
  }));
  nodeIds.push(config.id);

  const target = addNode(project, createCanvasMediaNode({
    id: createId('node'),
    title: `${title.length > 28 ? `${title.slice(0, 28)}...` : title} 结果`,
    canvasRole: 'target',
    x: origin.x + 760,
    y: origin.y + 56,
    width: 280,
    height: 210,
    text: '生成结果会写到这里'
  }));
  nodeIds.push(target.id);
  config.targetNodeId = target.id;

  referenceIds.forEach(id => addEdge(project, id, config.id, '参考输入'));
  addEdge(project, config.id, target.id, '生成结果');
  project.updatedAt = Date.now();

  return {
    project,
    config,
    target,
    exampleNode,
    referenceNodes,
    resourceRecords,
    nodeIds,
    configId: config.id,
    targetId: target.id,
    referenceIds
  };
}

export function removePromptBranchResourceNodes(project, resourceId) {
  const id = text(resourceId);
  if (!id || !project?.nodes) return [];
  const removed = Object.values(project.nodes)
    .filter(node => node?.resourceId === id)
    .map(node => node.id)
    .filter(Boolean);
  if (!removed.length) return [];
  const removedSet = new Set(removed);
  removed.forEach(nodeId => delete project.nodes[nodeId]);
  project.nodeOrder = (project.nodeOrder || []).filter(nodeId => !removedSet.has(nodeId));
  Object.keys(project.edges || {}).forEach(edgeId => {
    const edge = project.edges[edgeId];
    if (removedSet.has(edge?.fromNodeId) || removedSet.has(edge?.toNodeId)) delete project.edges[edgeId];
  });
  Object.values(project.nodes).forEach(node => {
    if (!Array.isArray(node?.references)) return;
    node.references = node.references.filter(nodeId => !removedSet.has(nodeId));
  });
  return removed;
}
