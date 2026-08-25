import {
  CANVAS_EXPORT_VERSION,
  cloneCanvasProject,
  normalizeCanvasProject
} from './canvas-model.js?v=20260813-4';
import { prepareCanvasResourceRecord } from './canvas-resources.js?v=20260813-4';

function createDownload(name, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitizeFileBaseName(value) {
  return String(value || 'canvas-projects')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'canvas-projects';
}

export async function exportCanvasProjectsToJson(projects, resourceStore, options = {}) {
  const normalizedProjects = (Array.isArray(projects) ? projects : [])
    .filter(Boolean)
    .map(project => cloneCanvasProject(normalizeCanvasProject(project)));
  const resourceIds = new Set();

  normalizedProjects.forEach(project => {
    Object.values(project.nodes || {}).forEach(node => {
      if (node?.resourceId) resourceIds.add(node.resourceId);
    });
  });

  const allResources = resourceStore ? await resourceStore.list() : [];
  const resources = [];
  for (const record of allResources.filter(item => resourceIds.has(item.id))) {
    resources.push(await prepareCanvasResourceRecord(record, { maxDimension: 320 }));
  }
  const payload = {
    app: 'image-app-canvas',
    version: CANVAS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    projects: normalizedProjects,
    resources
  };

  if (options.download !== false) {
    const fileName = `${sanitizeFileBaseName(options.fileName || normalizedProjects[0]?.title || 'canvas-projects')}.json`;
    createDownload(fileName, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  }

  return payload;
}

export async function importCanvasProjectsFromFile(file) {
  if (!file) return { projects: [], resources: [] };
  const text = await file.text();
  const payload = JSON.parse(text);
  const projects = (Array.isArray(payload?.projects) ? payload.projects : [])
    .map(project => normalizeCanvasProject(project));
  const resources = Array.isArray(payload?.resources) ? payload.resources.filter(Boolean) : [];
  return { projects, resources, payload };
}
