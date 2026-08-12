import {
  buildCanvasNodeLabel,
  ensureCanvasProjectTimeline,
  getProjectTimelineClips
} from './canvas-model.js?v=20260808-1';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '';
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function renderCanvasGrid(container, mode = 'lines') {
  if (!container) return container;
  container.dataset.gridMode = mode || 'lines';
  container.style.backgroundImage = mode === 'dots'
    ? 'radial-gradient(circle, rgba(148, 163, 184, 0.45) 1px, transparent 1px)'
    : 'linear-gradient(rgba(148, 163, 184, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.2) 1px, transparent 1px)';
  container.style.backgroundSize = '24px 24px';
  return container;
}

export function buildCanvasNodeRenderSignature(node = {}, nodeId = '') {
  const id = node?.id || nodeId || '';
  const genStatus = String(node?.generationStatus || node?.loopStatus || node?.llmStatus || '').trim();
  return [
    id,
    node?.type || 'note',
    node?.kind || '',
    node?.canvasRole || '',
    node?.title || '',
    node?.text || '',
    node?.lod || 'full',
    node?.locked ? 1 : 0,
    node?.selected ? 1 : 0,
    node?.isActive ? 1 : 0,
    node?.isFocusFlash ? 1 : 0,
    node?.isEdgeEndpoint ? 1 : 0,
    node?.isEdgeSource ? 1 : 0,
    node?.isEdgeTarget ? 1 : 0,
    genStatus,
    node?.generationError || '',
    Number(node?.x) || 0,
    Number(node?.y) || 0,
    Number.isFinite(node?.width) ? node.width : '',
    Number.isFinite(node?.height) ? node.height : '',
    Number(node?.rotation) || 0,
    node?.freeResize ? 1 : 0,
    Number.isFinite(node?.zIndex) ? node.zIndex : 0,
    node?.groupId || '',
    node?.memberCount || 0,
    node?.resourceId || '',
    node?.resourceSrc || '',
    node?.thumbnailSrc || '',
    node?.posterSrc || '',
    node?.model || '',
    node?.prompt || '',
    node?.targetNodeId || '',
    node?.hidden ? 1 : 0
  ].join('|');
}

export function buildCanvasNodeMarkup(nodeId, rawNode, options = {}) {
  if (!rawNode || rawNode.hidden) return '';
  const memberCountByGroup = options.memberCountByGroup || {};
  const node = rawNode.type === 'group'
    ? { ...rawNode, memberCount: memberCountByGroup[rawNode.id || nodeId] || rawNode.memberCount || 0 }
    : rawNode;
  const width = Number.isFinite(node.width) ? node.width : 160;
  const height = Number.isFinite(node.height) ? node.height : 96;
  const type = node.type || 'note';
  const selected = node.selected ? ' is-selected' : '';
  const active = node.isActive ? ' is-active' : '';
  const locked = node.locked ? ' is-locked' : '';
  const focusFlash = node.isFocusFlash ? ' is-focus-flash' : '';
  const edgeEndpoint = node.isEdgeEndpoint ? ' is-edge-endpoint' : '';
  const edgeSource = node.isEdgeSource ? ' is-edge-source' : '';
  const edgeTarget = node.isEdgeTarget ? ' is-edge-target' : '';
  const genStatus = String(node.generationStatus || node.loopStatus || node.llmStatus || '').trim();
  const genStatusClass = (genStatus === 'running' || genStatus === 'queued' || genStatus === 'success' || genStatus === 'error' || genStatus === 'partial')
    ? ` is-gen-${genStatus}`
    : '';
  const kind = escapeHtml(node.kind || '');
  const role = escapeHtml(node.canvasRole || '');
  const roleClass = role ? ` canvas-role-${role}` : '';
  const zIndex = Number.isFinite(node.zIndex) ? node.zIndex : 0;
  const rotation = Number(node.rotation) || 0;
  const transform = `translate(${Number(node.x) || 0}px, ${Number(node.y) || 0}px) rotate(${rotation}deg)`;
  const statusTitle = node.generationError
    ? escapeHtml(String(node.generationError))
    : (genStatus ? escapeHtml(resolveGenerationStatusLabel(genStatus)) : '');
  const id = escapeHtml(node.id || nodeId);
  const lod = node.lod === 'lite' ? 'lite' : 'full';
  const lodClass = lod === 'lite' ? ' is-lod-lite' : '';
  const bodyMarkup = lod === 'lite'
    ? renderCanvasNodeBodyLite(node)
    : renderCanvasNodeBody(node);
  const handleMarkup = lod === 'lite' && !node.selected
    ? ''
    : `
        <button type="button" class="canvas-node-handle canvas-node-handle-left" data-connect-handle="in" data-node-id="${id}" title="输入连接点" aria-label="输入连接点"></button>
        <button type="button" class="canvas-node-handle canvas-node-handle-right" data-connect-handle="out" data-node-id="${id}" title="输出连接点（拖出连线）" aria-label="输出连接点"></button>
      `;

  return `
      <article
        class="canvas-node canvas-node-${escapeHtml(type)}${selected}${active}${locked}${focusFlash}${edgeEndpoint}${edgeSource}${edgeTarget}${roleClass}${genStatusClass}${lodClass}"
        data-node-id="${id}"
        data-node-type="${escapeHtml(type)}"
        data-node-kind="${kind}"
        data-node-role="${role}"
        data-gen-status="${escapeHtml(genStatus)}"
        data-lod="${lod}"
        data-render-sig="${escapeHtml(buildCanvasNodeRenderSignature(node, nodeId))}"
        title="${statusTitle}"
        style="position:absolute;transform:${transform};width:${width}px;height:${height}px;z-index:${zIndex};"
      >
        ${handleMarkup}
        ${bodyMarkup}
        ${node.selected && !node.locked ? `
          <button type="button" class="canvas-node-resize canvas-node-resize-nw" data-resize-handle="nw" data-node-id="${id}" title="从左上角调整大小" aria-label="从左上角调整大小"></button>
          <button type="button" class="canvas-node-resize canvas-node-resize-ne" data-resize-handle="ne" data-node-id="${id}" title="从右上角调整大小" aria-label="从右上角调整大小"></button>
          <button type="button" class="canvas-node-resize canvas-node-resize-sw" data-resize-handle="sw" data-node-id="${id}" title="从左下角调整大小" aria-label="从左下角调整大小"></button>
          <button type="button" class="canvas-node-resize canvas-node-resize-se" data-resize-handle="se" data-node-id="${id}" title="拖动调整大小（Shift 保持比例）" aria-label="调整大小"></button>
          <button type="button" class="canvas-node-rotate" data-rotate-handle="true" data-node-id="${id}" title="拖动旋转（Shift 吸附 15°）" aria-label="旋转节点"></button>
        ` : ''}
      </article>
    `;
}

export function renderCanvasNodes(container, project, options = {}) {
  if (!container) return container;

  const nodes = project?.nodes && typeof project.nodes === 'object' ? project.nodes : {};
  const nodeIds = Array.isArray(project?.nodeOrder) && project.nodeOrder.length
    ? project.nodeOrder
    : Object.keys(nodes);

  const memberCountByGroup = {};
  Object.values(nodes).forEach(entry => {
    const gid = entry && entry.groupId ? String(entry.groupId) : '';
    if (!gid) return;
    memberCountByGroup[gid] = (memberCountByGroup[gid] || 0) + 1;
  });

  const visibleIds = nodeIds.filter(nodeId => {
    const rawNode = nodes[nodeId];
    return rawNode && !rawNode.hidden;
  });

  // Incremental patch: reuse unchanged node DOM when signatures match.
  if (options.incremental && container.childElementCount > 0) {
    const existing = new Map();
    [...container.children].forEach(el => {
      const id = el.getAttribute('data-node-id');
      if (id) existing.set(id, el);
    });
    const nextSigs = new Map();
    const fragment = document.createDocumentFragment();
    let reused = 0;
    let rebuilt = 0;
    visibleIds.forEach(nodeId => {
      const rawNode = nodes[nodeId];
      const node = rawNode.type === 'group'
        ? { ...rawNode, memberCount: memberCountByGroup[rawNode.id || nodeId] || 0 }
        : rawNode;
      const sig = buildCanvasNodeRenderSignature(node, nodeId);
      nextSigs.set(nodeId, sig);
      const prev = existing.get(nodeId);
      if (prev && prev.getAttribute('data-render-sig') === sig) {
        fragment.appendChild(prev);
        existing.delete(nodeId);
        reused += 1;
        return;
      }
      const wrap = document.createElement('div');
      wrap.innerHTML = buildCanvasNodeMarkup(nodeId, rawNode, { memberCountByGroup }).trim();
      const el = wrap.firstElementChild;
      if (el) {
        fragment.appendChild(el);
        rebuilt += 1;
      }
    });
    container.replaceChildren(fragment);
    container.dataset.renderMode = 'incremental';
    container.dataset.renderReused = String(reused);
    container.dataset.renderRebuilt = String(rebuilt);
    container.dataset.renderVisible = String(visibleIds.length);
    return container;
  }

  container.innerHTML = visibleIds.map(nodeId => (
    buildCanvasNodeMarkup(nodeId, nodes[nodeId], { memberCountByGroup })
  )).join('');
  container.dataset.renderMode = 'full';
  container.dataset.renderReused = '0';
  container.dataset.renderRebuilt = String(visibleIds.length);
  container.dataset.renderVisible = String(visibleIds.length);
  return container;
}

export function buildCanvasEdgePath(input = {}) {
  const geometry = resolveCanvasEdgeGeometry(input);
  return geometry.d;
}

export function resolveCanvasEdgeGeometry(input = {}) {
  const x1 = Number(input.x1);
  const y1 = Number(input.y1);
  const x2 = Number(input.x2);
  const y2 = Number(input.y2);
  const startX = Number.isFinite(x1) ? x1 : 0;
  const startY = Number.isFinite(y1) ? y1 : 0;
  const endX = Number.isFinite(x2) ? x2 : 0;
  const endY = Number.isFinite(y2) ? y2 : 0;
  const fromSide = normalizeEdgeSide(input.fromSide, 'right');
  const toSide = normalizeEdgeSide(input.toSide, 'left');
  const laneOffset = Number.isFinite(Number(input.laneOffset)) ? Number(input.laneOffset) : 0;
  const preferStraight = input.preferStraight === true;
  const round = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 100) / 100;
  };
  if (preferStraight) {
    return {
      x1: startX,
      y1: startY,
      x2: endX,
      y2: endY,
      fromSide,
      toSide,
      laneOffset: 0,
      c1x: startX,
      c1y: startY,
      c2x: endX,
      c2y: endY,
      labelX: (startX + endX) / 2,
      labelY: (startY + endY) / 2,
      d: `M ${round(startX)} ${round(startY)} L ${round(endX)} ${round(endY)}`
    };
  }
  const distance = Math.hypot(endX - startX, endY - startY);
  const offset = Math.max(36, Math.min(160, distance * 0.45));
  const c1 = offsetPointFromSide(startX, startY, fromSide, offset);
  const c2 = offsetPointFromSide(endX, endY, toSide, offset);
  if (laneOffset) {
    const shift = perpendicularUnit(startX, startY, endX, endY, laneOffset);
    c1.x += shift.x;
    c1.y += shift.y;
    c2.x += shift.x;
    c2.y += shift.y;
  }
  const labelX = (
    (startX * 0.125)
    + (c1.x * 0.375)
    + (c2.x * 0.375)
    + (endX * 0.125)
  );
  const labelY = (
    (startY * 0.125)
    + (c1.y * 0.375)
    + (c2.y * 0.375)
    + (endY * 0.125)
  );
  return {
    x1: startX,
    y1: startY,
    x2: endX,
    y2: endY,
    fromSide,
    toSide,
    laneOffset,
    c1x: c1.x,
    c1y: c1.y,
    c2x: c2.x,
    c2y: c2.y,
    labelX,
    labelY,
    d: `M ${round(startX)} ${round(startY)} C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(endX)} ${round(endY)}`
  };
}

export function buildCanvasEdgeLaneOffsets(edges = [], options = {}) {
  const spacing = Number.isFinite(Number(options.spacing)) ? Number(options.spacing) : 14;
  const list = Array.isArray(edges) ? edges.filter(Boolean) : [];
  const groups = new Map();
  list.forEach((edge, index) => {
    const fromId = String(edge?.fromNodeId || '');
    const toId = String(edge?.toNodeId || '');
    if (!fromId || !toId) return;
    const key = fromId < toId ? `${fromId}::${toId}` : `${toId}::${fromId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ edge, index });
  });

  const offsets = new Map();
  groups.forEach(entries => {
    entries.sort((a, b) => {
      const aId = String(a.edge?.id || '');
      const bId = String(b.edge?.id || '');
      if (aId && bId && aId !== bId) return aId.localeCompare(bId);
      return a.index - b.index;
    });
    const count = entries.length;
    entries.forEach((entry, laneIndex) => {
      const edgeId = String(entry.edge?.id || '');
      if (!edgeId) return;
      const centered = laneIndex - ((count - 1) / 2);
      const fromId = String(entry.edge?.fromNodeId || '');
      const toId = String(entry.edge?.toNodeId || '');
      // Keep A->B and B->A mirrored so opposing edges stay readable.
      const direction = fromId <= toId ? 1 : -1;
      offsets.set(edgeId, centered * spacing * direction);
    });
  });
  return offsets;
}

export function renderCanvasEdges(container, project, options = {}) {
  if (!container) return container;

  const nodes = project?.nodes && typeof project.nodes === 'object' ? project.nodes : {};
  const edges = project?.edges && typeof project.edges === 'object' ? Object.values(project.edges) : [];
  const width = Number(container?.dataset?.canvasWidth) || 320;
  const height = Number(container?.dataset?.canvasHeight) || 320;
  container.setAttribute('viewBox', `0 0 ${width} ${height}`);
  container.setAttribute('preserveAspectRatio', 'none');
  const simplifyEdges = options?.simplifyEdges === true;
  // Hit-paths/markers are independent of label simplification so idle large boards remain pickable.
  const skipHitPaths = options?.skipHitPaths === true;
  const skipMarkers = options?.skipMarkers === true;
  const preferStraightEdges = options?.preferStraightEdges === true;
  const maxVisibleEdges = Number.isFinite(Number(options?.maxVisibleEdges))
    ? Math.max(0, Number(options.maxVisibleEdges))
    : 0;
  const preview = options?.previewConnection;
  const previewValid = preview?.previewValid !== false;
  const previewSnapped = Boolean(preview?.snapped);
  const previewStateClass = preview?.previewTargetNodeId
    ? (previewValid ? ' is-valid' : ' is-invalid')
    : '';
  const previewSnapClass = previewSnapped && previewValid ? ' is-snapped' : '';
  const previewLaneOffset = Number.isFinite(Number(preview?.laneOffset)) ? Number(preview.laneOffset) : 0;
  const previewMarkup = preview?.startPoint && preview?.currentPoint ? (() => {
    const previewFromSide = normalizeEdgeSide(preview.fromSide, 'right');
    const previewToSide = normalizeEdgeSide(preview.toSide, 'left');
    const geometry = resolveCanvasEdgeGeometry({
      x1: preview.startPoint.x,
      y1: preview.startPoint.y,
      x2: preview.currentPoint.x,
      y2: preview.currentPoint.y,
      fromSide: previewFromSide,
      toSide: previewToSide,
      laneOffset: previewLaneOffset,
      preferStraight: preferStraightEdges
    });
    return `
    <path
      class="canvas-edge is-preview${previewStateClass}${previewSnapClass}"
      d="${geometry.d}"
      data-x1="${geometry.x1}"
      data-y1="${geometry.y1}"
      data-x2="${geometry.x2}"
      data-y2="${geometry.y2}"
      data-lane-offset="${geometry.laneOffset}"
      fill="none"
      stroke="currentColor"
      stroke-width="${previewSnapped && previewValid ? 3 : 2}"
    ></path>
  `;
  })() : '';

  const selectedEdgeId = options?.selectedEdgeId || '';
  // Lane offsets are expensive and mostly cosmetic; skip during interaction light mode.
  const laneOffsets = (simplifyEdges || preferStraightEdges)
    ? new Map()
    : buildCanvasEdgeLaneOffsets(edges, { spacing: options?.laneSpacing });
  let visibleEdges = edges.filter(edge => {
    const fromNode = nodes[edge?.fromNodeId];
    const toNode = nodes[edge?.toNodeId];
    // Keep edges that still have at least one endpoint present (missing target uses fallback anchors).
    if (!fromNode && !toNode) return false;
    // When both endpoints exist and both are viewport-culled/hidden, skip drawing.
    if (fromNode && toNode && fromNode.hidden && toNode.hidden) return false;
    return true;
  });
  // Prefer selected edge when capping dense boards during continuous interaction.
  if (maxVisibleEdges > 0 && visibleEdges.length > maxVisibleEdges) {
    const selected = selectedEdgeId
      ? visibleEdges.filter(edge => String(edge?.id || '') === String(selectedEdgeId))
      : [];
    const rest = visibleEdges.filter(edge => String(edge?.id || '') !== String(selectedEdgeId));
    visibleEdges = selected.concat(rest.slice(0, Math.max(0, maxVisibleEdges - selected.length)));
  }

  const edgeMarkup = visibleEdges.map(edge => {
    const edgeId = edge?.id || '';
    const selected = edgeId && edgeId === selectedEdgeId;
    const fromSide = resolveEdgeSide(nodes[edge?.fromNodeId], nodes[edge?.toNodeId], edge?.fromSide || 'right');
    const toSide = resolveEdgeSide(nodes[edge?.toNodeId], nodes[edge?.fromNodeId], edge?.toSide || 'left');
    const x1 = Number(resolveEdgePoint(nodes[edge?.fromNodeId], 'x', fromSide));
    const y1 = Number(resolveEdgePoint(nodes[edge?.fromNodeId], 'y', fromSide));
    const x2 = Number(resolveEdgePoint(nodes[edge?.toNodeId], 'x', toSide));
    const y2 = Number(resolveEdgePoint(nodes[edge?.toNodeId], 'y', toSide));
    const laneOffset = laneOffsets.get(String(edgeId)) || 0;
    const geometry = resolveCanvasEdgeGeometry({
      x1,
      y1,
      x2,
      y2,
      fromSide,
      toSide,
      laneOffset,
      preferStraight: preferStraightEdges && !selected
    });
    const markerMarkup = (!skipMarkers || selected)
      ? renderCanvasEdgeMarker(nodes[edge?.fromNodeId], nodes[edge?.toNodeId], edge?.fromSide, edge?.toSide)
      : '';
    const hitMarkup = (!skipHitPaths || selected) ? `
      <path
        class="canvas-edge-hit"
        data-edge-id="${escapeHtml(edgeId)}"
        data-x1="${geometry.x1}"
        data-y1="${geometry.y1}"
        data-x2="${geometry.x2}"
        data-y2="${geometry.y2}"
        data-lane-offset="${geometry.laneOffset}"
        d="${geometry.d}"
        fill="none"
      ></path>` : '';
    return `
    <g class="canvas-edge-group${selected ? ' is-selected' : ''}" data-edge-id="${escapeHtml(edgeId)}">
      ${markerMarkup}
      ${hitMarkup}
      <path
        class="canvas-edge${selected ? ' is-selected' : ''}"
        data-edge-id="${escapeHtml(edgeId)}"
        data-from-node-id="${escapeHtml(edge?.fromNodeId || '')}"
        data-to-node-id="${escapeHtml(edge?.toNodeId || '')}"
        data-from-side="${escapeHtml(fromSide)}"
        data-to-side="${escapeHtml(toSide)}"
        data-x1="${geometry.x1}"
        data-y1="${geometry.y1}"
        data-x2="${geometry.x2}"
        data-y2="${geometry.y2}"
        data-lane-offset="${geometry.laneOffset}"
        d="${geometry.d}"
        fill="none"
        stroke="currentColor"
        stroke-width="${selected ? 3 : 2}"
      ></path>
      ${(!simplifyEdges && edge?.label) ? `
        <text
          class="canvas-edge-label"
          x="${Math.round(geometry.labelX)}"
          y="${Math.round(geometry.labelY)}"
        >${escapeHtml(edge.label)}</text>
      ` : ''}
    </g>
  `;
  }).join('');

  container.innerHTML = edgeMarkup + previewMarkup;
  container.dataset.edgeVisible = String(visibleEdges.length);
  container.dataset.edgeTotal = String(edges.length);
  container.dataset.edgeSimplified = simplifyEdges ? '1' : '0';
  container.dataset.edgeStraight = preferStraightEdges ? '1' : '0';
  container.dataset.edgeSkipHit = skipHitPaths ? '1' : '0';
  container.dataset.edgeSkipMarkers = skipMarkers ? '1' : '0';

  return container;
}

export function renderCanvasTimeline(container, project, options = {}) {
  if (!container) return container;

  const timeline = ensureCanvasProjectTimeline(project);
  const clips = getProjectTimelineClips(project);
  const pixelsPerSecond = Number.isFinite(options.pixelsPerSecond) ? options.pixelsPerSecond : 36;
  const totalDurationMs = clips.reduce((max, item) => (
    Math.max(max, item.clip.startMs + item.clip.durationMs)
  ), Math.max(12000, timeline.currentTimeMs + 4000));
  const totalWidth = Math.max(760, Math.ceil((totalDurationMs / 1000) * pixelsPerSecond) + 96);
  const laneMetaWidth = 112;
  const halfSecondSteps = Math.max(8, Math.ceil(totalDurationMs / 500));
  const playheadLeft = Math.round((timeline.currentTimeMs / 1000) * pixelsPerSecond);

  const ruler = Array.from({ length: halfSecondSteps + 1 }, (_, step) => {
    const left = Math.round(step * (pixelsPerSecond / 2));
    const isSecond = step % 2 === 0;
    const secondValue = step / 2;
    const isMajor = isSecond && secondValue % 5 === 0;
    const showLabel = isMajor || step === 0;
    return `
      <span class="canvas-timeline-ruler-tick${isSecond ? ' is-second' : ' is-half'}${isMajor ? ' is-major' : ''}" style="left:${left}px">
        <span class="canvas-timeline-ruler-line" aria-hidden="true"></span>
        ${isSecond && showLabel ? `<span class="canvas-timeline-ruler-label">${secondValue}s</span>` : ''}
      </span>
    `;
  }).join('');

  const trackMarkup = timeline.tracks.map(track => {
    const trackClips = clips.filter(item => item.clip.trackId === track.id);
    const hasSelectedClip = trackClips.some(item => item.node?.selected);
    const hasActiveClip = trackClips.some(item => item.isActive);
    const clipMarkup = trackClips.map(item => {
      const left = Math.round((item.clip.startMs / 1000) * pixelsPerSecond);
      const width = Math.max(72, Math.round((item.clip.durationMs / 1000) * pixelsPerSecond));
      const selected = item.node?.selected ? ' is-selected' : '';
      const active = item.isActive ? ' is-active' : '';
      const toneClass = resolveTimelineToneClass(item.kind || track.kind);
      return `
        <button
          type="button"
          class="canvas-timeline-clip ${toneClass}${selected}${active}"
          data-node-id="${escapeHtml(item.nodeId)}"
          data-track-id="${escapeHtml(track.id)}"
          style="left:${left}px;width:${width}px;"
        >
          <span class="canvas-timeline-clip-body">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(resolveClipLabel(item))}</span>
          </span>
          <span class="canvas-timeline-clip-handle" data-role="clip-resize" aria-hidden="true"></span>
        </button>
      `;
    }).join('');

    const laneStateClass = `${resolveTimelineToneClass(track.kind)}${hasSelectedClip ? ' is-selected-track' : ''}${hasActiveClip ? ' is-active-track' : ''}`;
    return `
      <div class="canvas-timeline-lane ${laneStateClass}" data-track-id="${escapeHtml(track.id)}" data-track-kind="${escapeHtml(track.kind)}" style="--canvas-timeline-width:${totalWidth}px;--canvas-timeline-meta-width:${laneMetaWidth}px;">
        <div class="canvas-timeline-lane-meta">
          <strong>${escapeHtml(track.title)}</strong>
          <span>${escapeHtml(resolveTrackKindLabel(track.kind))}</span>
        </div>
        <div class="canvas-timeline-track" data-role="timeline-track-body" data-track-id="${escapeHtml(track.id)}">
          <span class="canvas-timeline-playhead" style="left:${playheadLeft}px;"></span>
          ${clipMarkup || '<span class="canvas-timeline-empty">将片段拖到这条轨道上</span>'}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="canvas-timeline-ruler" style="width:calc(${totalWidth}px + ${laneMetaWidth}px + 12px);padding-left:calc(${laneMetaWidth}px + 12px);">
      ${ruler}
    </div>
    <div class="canvas-timeline-stack">
      ${trackMarkup}
    </div>
  `;

  return container;
}

export function renderCanvasMiniMap(container, project, viewport) {
  if (!container) return container;
  const allNodes = Object.values(project?.nodes || {}).filter(node => node && !node.hidden);
  if (!allNodes.length) {
    container.innerHTML = '<div class="canvas-minimap-empty">暂无节点</div>';
    return container;
  }

  // Keep overview cheap on huge boards: sample non-selected nodes, always keep selected/group anchors.
  const maxDots = 180;
  let nodes = allNodes;
  if (allNodes.length > maxDots) {
    const important = [];
    const rest = [];
    allNodes.forEach(node => {
      if (node.selected || node.type === 'group' || node.canvasRole === 'target' || node.canvasRole === 'reference') important.push(node);
      else rest.push(node);
    });
    const budget = Math.max(0, maxDots - important.length);
    const step = Math.max(1, Math.ceil(rest.length / Math.max(1, budget)));
    const sampled = [];
    for (let i = 0; i < rest.length && sampled.length < budget; i += step) sampled.push(rest[i]);
    nodes = important.concat(sampled);
  }

  const bounds = computeWorldBounds(allNodes);
  const width = Math.max(200, container.clientWidth || 220);
  const height = Math.max(140, container.clientHeight || 160);
  const padding = 18;
  const scaleX = (width - padding * 2) / Math.max(bounds.width, 1);
  const scaleY = (height - padding * 2) / Math.max(bounds.height, 1);
  const scale = Math.min(scaleX, scaleY);
  const nodeMarkup = nodes.map(node => {
    const x = Math.round((node.x - bounds.minX) * scale) + padding;
    const y = Math.round((node.y - bounds.minY) * scale) + padding;
    const w = Math.max(6, Math.round((node.width || 40) * scale));
    const h = Math.max(5, Math.round((node.height || 30) * scale));
    return `<span class="canvas-minimap-node canvas-minimap-node-${escapeHtml(node.type || 'note')}${node.selected ? ' is-selected' : ''}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;"></span>`;
  }).join('');

  const viewportWidth = Math.round(((container.dataset.viewportWidth ? Number(container.dataset.viewportWidth) : 480) / Math.max(viewport.scale || 1, 0.1)) * scale);
  const viewportHeight = Math.round(((container.dataset.viewportHeight ? Number(container.dataset.viewportHeight) : 320) / Math.max(viewport.scale || 1, 0.1)) * scale);
  const viewportLeft = Math.round((((-Number(viewport.x || 0)) / Math.max(viewport.scale || 1, 0.1)) - bounds.minX) * scale) + padding;
  const viewportTop = Math.round((((-Number(viewport.y || 0)) / Math.max(viewport.scale || 1, 0.1)) - bounds.minY) * scale) + padding;

  container.dataset.mapMinX = String(bounds.minX);
  container.dataset.mapMinY = String(bounds.minY);
  container.dataset.mapScale = String(scale);
  container.dataset.mapPadding = String(padding);

  container.innerHTML = `
    <div class="canvas-minimap-surface">
      ${nodeMarkup}
      <span class="canvas-minimap-viewport" style="left:${viewportLeft}px;top:${viewportTop}px;width:${Math.max(14, viewportWidth)}px;height:${Math.max(10, viewportHeight)}px;"></span>
    </div>
  `;
  return container;
}

export function updateCanvasMiniMapViewport(container, viewport) {
  if (!container || !viewport) return false;
  const viewportEl = container.querySelector('.canvas-minimap-viewport');
  const scale = Number(container.dataset.mapScale);
  const minX = Number(container.dataset.mapMinX);
  const minY = Number(container.dataset.mapMinY);
  const padding = Number(container.dataset.mapPadding);
  if (!viewportEl || !Number.isFinite(scale) || !Number.isFinite(minX) || !Number.isFinite(minY)) return false;
  const safeViewportScale = Math.max(Number(viewport.scale) || 1, 0.1);
  const safePadding = Number.isFinite(padding) ? padding : 18;
  const viewportWidth = Math.round(((container.dataset.viewportWidth ? Number(container.dataset.viewportWidth) : 480) / safeViewportScale) * scale);
  const viewportHeight = Math.round(((container.dataset.viewportHeight ? Number(container.dataset.viewportHeight) : 320) / safeViewportScale) * scale);
  const viewportLeft = Math.round((((-Number(viewport.x || 0)) / safeViewportScale) - minX) * scale) + safePadding;
  const viewportTop = Math.round((((-Number(viewport.y || 0)) / safeViewportScale) - minY) * scale) + safePadding;
  viewportEl.style.left = `${viewportLeft}px`;
  viewportEl.style.top = `${viewportTop}px`;
  viewportEl.style.width = `${Math.max(14, viewportWidth)}px`;
  viewportEl.style.height = `${Math.max(10, viewportHeight)}px`;
  return true;
}

function computeWorldBounds(nodes) {
  const minX = Math.min(...nodes.map(node => Number(node.x) || 0));
  const minY = Math.min(...nodes.map(node => Number(node.y) || 0));
  const maxX = Math.max(...nodes.map(node => (Number(node.x) || 0) + (Number(node.width) || 0)));
  const maxY = Math.max(...nodes.map(node => (Number(node.y) || 0) + (Number(node.height) || 0)));
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function perpendicularUnit(x1, y1, x2, y2, amount = 0) {
  const dx = Number(x2) - Number(x1);
  const dy = Number(y2) - Number(y1);
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < 0.001) {
    return { x: 0, y: Number(amount) || 0 };
  }
  // Rotate direction 90deg and scale by lane amount.
  const ux = -dy / len;
  const uy = dx / len;
  return { x: ux * amount, y: uy * amount };
}

function normalizeEdgeSide(side, fallback = 'right') {
  const value = String(side || '').trim().toLowerCase();
  if (value === 'left' || value === 'right' || value === 'top' || value === 'bottom') return value;
  return fallback === 'left' ? 'left' : 'right';
}

function offsetPointFromSide(x, y, side, amount) {
  const offset = Number.isFinite(amount) ? amount : 0;
  if (side === 'left') return { x: x - offset, y };
  if (side === 'right') return { x: x + offset, y };
  if (side === 'top') return { x, y: y - offset };
  if (side === 'bottom') return { x, y: y + offset };
  return { x: x + offset, y };
}

function resolveEdgePoint(node, axis, side = 'middle') {
  if (!node) return '100';
  const origin = axis === 'x'
    ? (Number.isFinite(node.x) ? node.x : 0)
    : (Number.isFinite(node.y) ? node.y : 0);
  const size = axis === 'x'
    ? (Number.isFinite(node.width) ? node.width : 0)
    : (Number.isFinite(node.height) ? node.height : 0);
  if (axis === 'y') {
    return String(origin + (size / 2));
  }
  if (side === 'left') return String(origin);
  if (side === 'right') return String(origin + size);
  return String(origin + (size / 2));
}

function resolveEdgeLabelPoint(sourceNode, targetNode, axis) {
  const from = Number(resolveEdgePoint(sourceNode, axis));
  const to = Number(resolveEdgePoint(targetNode, axis));
  return String(Math.round((from + to) / 2));
}

function resolveEdgeSide(sourceNode, targetNode, preferredSide = 'right') {
  if (!sourceNode || !targetNode) return preferredSide === 'left' ? 'left' : 'right';
  const sourceCenterX = (Number(sourceNode.x) || 0) + ((Number(sourceNode.width) || 0) / 2);
  const targetCenterX = (Number(targetNode.x) || 0) + ((Number(targetNode.width) || 0) / 2);
  if (preferredSide === 'left') {
    return sourceCenterX <= targetCenterX ? 'left' : 'right';
  }
  if (preferredSide === 'right') {
    return sourceCenterX <= targetCenterX ? 'right' : 'left';
  }
  return sourceCenterX <= targetCenterX ? 'right' : 'left';
}

function renderCanvasEdgeMarker(fromNode, toNode, fromSide = 'right', toSide = 'left') {
  const startSide = resolveEdgeSide(fromNode, toNode, fromSide);
  const endSide = resolveEdgeSide(toNode, fromNode, toSide);
  const startX = Number(resolveEdgePoint(fromNode, 'x', startSide));
  const startY = Number(resolveEdgePoint(fromNode, 'y', startSide));
  const endX = Number(resolveEdgePoint(toNode, 'x', endSide));
  const endY = Number(resolveEdgePoint(toNode, 'y', endSide));
  return `
    <circle class="canvas-edge-anchor" cx="${startX}" cy="${startY}" r="3.5"></circle>
    <circle class="canvas-edge-anchor" cx="${endX}" cy="${endY}" r="3.5"></circle>
  `;
}

function renderCanvasNodeBodyLite(node) {
  const fullTitle = buildCanvasNodeLabel(node);
  const title = escapeHtml(abbreviateCanvasLabel(fullTitle, 8));
  const titleAttr = escapeHtml(fullTitle);
  const roleLabel = resolveCanvasRoleLabel(node.canvasRole);
  const role = roleLabel ? escapeHtml(roleLabel) : '';
  const typeLabel = escapeHtml(String(node.type || 'note'));
  return `
    <div class="canvas-node-head canvas-node-head-lite">
      <strong title="${titleAttr}">${title}</strong>
      <span class="canvas-node-lite-meta${roleLabel ? ` is-role-${escapeHtml(node.canvasRole)}` : ''}">${role || typeLabel}</span>
    </div>
  `;
}

function renderCanvasNodeBody(node) {
  const fullTitle = buildCanvasNodeLabel(node);
  const title = escapeHtml(abbreviateCanvasLabel(fullTitle, 6));
  const titleAttr = escapeHtml(fullTitle);
  const text = escapeHtml(node.text || '');
  const metaBadges = buildNodeBadges(node);

  if (node.type === 'text') {
    return `
      <div class="canvas-node-head">
        <strong title="${titleAttr}">${title}</strong>
        ${metaBadges}
      </div>
      <p>${text || '&nbsp;'}</p>
    `;
  }

  if (node.type === 'group') {
    const memberCount = Number.isFinite(node.memberCount) ? node.memberCount : 0;
    const memberLabel = memberCount > 0 ? `${memberCount} 个成员 · 拖动分组可整体移动` : '空分组 · 多选后点“分组”可归入';
    return `
      <div class="canvas-node-head">
        <strong title="${titleAttr}">${title}</strong>
        ${metaBadges}
      </div>
      <p class="canvas-node-group-meta">${escapeHtml(memberLabel)}</p>
    `;
  }

  if (node.type === 'loop') {
    const variations = Array.isArray(node.variations) ? node.variations.length : 0;
    const progress = Number.isFinite(node.loopProgress) ? Math.round(node.loopProgress * 100) : 0;
    const statusLabel = node.loopStatus === 'running' ? `循环中 ${progress}%` : node.loopStatus === 'success' ? '已完成' : node.loopStatus === 'partial' ? '部分成功' : node.loopStatus === 'error' ? '失败' : '空闲';
    return `
      <div class="canvas-node-head"><strong title="${titleAttr}">${title}</strong>${metaBadges}</div>
      <div class="canvas-node-config-meta"><span>${escapeHtml(statusLabel)}</span><span>${variations} 个变化项</span></div>
      <p class="canvas-node-config-text">${escapeHtml(node.basePrompt || '在此填写基础提示词，配合变化项批量生成。')}</p>
      ${variations ? `<ul class="canvas-loop-vars">${node.variations.slice(0, 4).map(v => `<li>${escapeHtml(String(v).slice(0, 32))}</li>`).join('')}${variations > 4 ? `<li>… 还有 ${variations - 4} 项</li>` : ''}</ul>` : ''}
    `;
  }

  if (node.type === 'llm') {
    const modeLabel = node.llmMode === 'describe' ? '图片描述' : '提示词优化';
    const statusLabel = node.llmStatus === 'running' ? '处理中' : node.llmStatus === 'success' ? '已完成' : node.llmStatus === 'error' ? '失败' : '空闲';
    const output = node.llmOutput ? `<p class="canvas-node-config-text">${escapeHtml(node.llmOutput)}</p>` : '';
    return `
      <div class="canvas-node-head"><strong title="${titleAttr}">${title}</strong>${metaBadges}</div>
      <div class="canvas-node-config-meta"><span>${escapeHtml(modeLabel)}</span><span>${escapeHtml(statusLabel)}</span></div>
      <p class="canvas-node-config-text">${escapeHtml(node.llmInput || '输入文本或选择图片后运行。')}</p>
      ${output}
    `;
  }

  if (node.type === 'config') {
    const prompt = escapeHtml(node.composerContent || node.promptText || '');
    const status = resolveGenerationStatusLabel(node.generationStatus);
    const model = escapeHtml(node?.genConfig?.model || '未指定模型');
    const referenceCount = Array.isArray(node.references) ? node.references.length : 0;
    const target = node.targetNodeId ? '已绑定结果节点' : '未绑定结果节点';
    const errorLine = node.generationStatus === 'error' && node.generationError
      ? `<div class="canvas-node-gen-error">${escapeHtml(String(node.generationError).slice(0, 80))}</div>`
      : '';
    const runningLine = node.generationStatus === 'running'
      ? '<div class="canvas-node-gen-progress" aria-hidden="true"><span></span></div>'
      : '';
    return `
      <div class="canvas-node-head">
        <strong title="${titleAttr}">${title}</strong>
        ${metaBadges}
      </div>
      <div class="canvas-node-subtitle">编排节点 · 生成规则</div>
      <div class="canvas-node-config-meta">
        <span class="canvas-node-status-chip is-${escapeHtml(node.generationStatus || 'idle')}">${escapeHtml(status)}</span>
        <span>${model}</span>
        <span>${referenceCount} 个引用</span>
      </div>
      ${runningLine}
      ${errorLine}
      <p class="canvas-node-config-text">${prompt || '在这里组合提示词、节点引用和生成设置。'}</p>
      <div class="canvas-node-config-target">${escapeHtml(target)}</div>
    `;
  }

  if (node.type === 'media') {
    const mediaLabel = escapeHtml(resolveMediaTypeLabel(node.kind || 'image'));
    const roleLabel = resolveCanvasRoleLabel(node.canvasRole);
    const roleChip = roleLabel
      ? `<span class="canvas-node-role-chip canvas-node-role-chip-${escapeHtml(node.canvasRole)}">${escapeHtml(roleLabel)}</span>`
      : '';
    const kindLabel = roleLabel ? `${escapeHtml(roleLabel)} · ${mediaLabel}` : mediaLabel;
    const preview = node.thumbnailSrc || node.posterSrc || node.resourceSrc;
    const duration = formatDuration(node.durationMs);
    const timelineStart = formatDuration(node?.clip?.startMs || 0);
    const timelineMeta = [];
    if (duration) timelineMeta.push(`<span>${duration}</span>`);
    if (timelineStart) timelineMeta.push(`<span>时间轴 ${timelineStart}</span>`);
    if (roleLabel) timelineMeta.unshift(`<span class="canvas-node-role-meta">${escapeHtml(roleLabel)}</span>`);
    return `
      <div class="canvas-node-media-head">
        <div>
          <strong title="${titleAttr}">${title}</strong>
          ${metaBadges}
        </div>
        <span class="canvas-node-media-kind">${kindLabel}</span>
      </div>
      ${roleChip}
      <div class="canvas-node-media-preview"${preview ? ` style="background-image:url('${escapeHtml(preview)}')"` : ''}>
        <span>${kindLabel}</span>
      </div>
      <div class="canvas-node-media-meta">${timelineMeta.join('<span class="canvas-node-media-divider" aria-hidden="true">·</span>') || `<span>${mediaLabel}</span>`}</div>
    `;
  }

  return `
    <div class="canvas-node-head">
      <strong title="${titleAttr}">${title}</strong>
      ${metaBadges}
    </div>
    <p>${text || '暂无说明内容'}</p>
  `;
}

function abbreviateCanvasLabel(value, maxChars = 8) {
  const text = String(value || '').trim();
  if (!text) return '';
  const chars = [...text];
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join('')}...` : text;
}

function resolveCanvasRoleLabel(role) {
  if (role === 'reference') return '历史图';
  if (role === 'target') return '结果图';
  if (role === 'reference-prompt') return '参考提示';
  return role || '';
}

function buildNodeBadges(node) {
  const badges = [];
  if (node.canvasRole) {
    const roleLabel = resolveCanvasRoleLabel(node.canvasRole);
    badges.push(`<span class="canvas-node-badge canvas-node-badge-role canvas-node-badge-${escapeHtml(node.canvasRole)}">${escapeHtml(roleLabel)}</span>`);
  }
  if (node.type === 'config') badges.push('<span class="canvas-node-badge canvas-node-badge-config">编排 · 生成规则</span>');
  if (node.locked) badges.push('<span class="canvas-node-badge">锁定</span>');
  if (node.generationStatus && node.generationStatus !== 'idle') badges.push(`<span class="canvas-node-badge canvas-node-badge-gen is-${escapeHtml(node.generationStatus)}">${escapeHtml(resolveGenerationStatusLabel(node.generationStatus))}</span>`);
  if (!badges.length) return '';
  return `<div class="canvas-node-badges">${badges.join('')}</div>`;
}

function resolveGenerationStatusLabel(status) {
  if (status === 'queued') return '排队中';
  if (status === 'running') return '生成中';
  if (status === 'success') return '已完成';
  if (status === 'error') return '失败';
  return '空闲';
}

function resolveMediaTypeLabel(kind) {
  if (kind === 'video') return '视频';
  if (kind === 'audio') return '音频';
  if (kind === 'subtitle') return '字幕';
  return '图片';
}

function resolveTrackKindLabel(kind) {
  if (kind === 'video') return '画面 / 图片 / 视频';
  if (kind === 'audio') return '音频 / 配乐 / 环境音';
  if (kind === 'subtitle') return '字幕 / 文本提示';
  return '混合轨道';
}

function resolveClipLabel(item) {
  const kind = resolveMediaTypeLabel(item.kind);
  const start = formatDuration(item.clip.startMs);
  const duration = formatDuration(item.clip.durationMs);
  return `${kind} · ${start} / ${duration}`;
}

function resolveTimelineToneClass(kind) {
  if (kind === 'audio') return 'is-kind-audio';
  if (kind === 'subtitle') return 'is-kind-subtitle';
  if (kind === 'image') return 'is-kind-image';
  return 'is-kind-video';
}
