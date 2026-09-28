import localforage from "localforage";
import { localForageStorage } from "@/lib/localforage-storage";
import { getImageBlob, setImageBlob } from "@/services/image-storage";
import { getMediaBlob, setMediaBlob } from "@/services/file-storage";
import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasConnection } from "@/types/canvas";
import { requestHost } from "./host-client";

type LegacyNode = Record<string, any>;
type LegacyResource = { record: Record<string, any>; blob?: Blob | null };
type LegacyPayload = { project: Record<string, any>; resources: LegacyResource[] };
type LegacySummary = { id: string; title: string; updatedAt: number };

const migrationStore = localforage.createInstance({ name: "image-app-canvas-v2", storeName: "migration" });
const MIGRATION_VERSION = 1;

function iso(value: unknown) {
    const date = new Date(typeof value === "number" && value > 0 ? value : Date.now());
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function legacyText(node: LegacyNode) {
    if (node.type === "loop") return `旧版循环节点（只读）\n${node.basePrompt || ""}\n${(node.variations || []).join("\n")}`.trim();
    if (node.type === "llm") return `旧版 LLM 节点（只读）\n${node.llmInput || node.text || ""}`.trim();
    if (node.kind === "subtitle") return `旧版字幕（只读）\n${node.text || ""}`.trim();
    return String(node.text || node.content || "");
}

async function verifyBlob(expected: Blob, stored: Blob | null) {
    if (!stored || stored.size !== expected.size) throw new Error("旧画布媒体复制不完整；旧数据未被修改");
    const digest = async (blob: Blob) => new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
    const [left, right] = await Promise.all([digest(expected), digest(stored)]);
    if (left.some((byte, index) => byte !== right[index])) throw new Error("旧画布媒体校验失败；旧数据未被修改");
}

async function convertNode(node: LegacyNode, projectId: string, resource?: LegacyResource): Promise<CanvasNodeData> {
    const mediaKind = node.type === "media" ? node.kind || "image" : "";
    const known = ["media", "text", "note", "config", "group"].includes(node.type) && mediaKind !== "subtitle";
    const type = node.type === "media"
        ? mediaKind === "video" ? CanvasNodeType.Video : mediaKind === "audio" ? CanvasNodeType.Audio : mediaKind === "subtitle" ? CanvasNodeType.Text : CanvasNodeType.Image
        : node.type === "config" ? CanvasNodeType.Config : node.type === "group" ? CanvasNodeType.Group : CanvasNodeType.Text;
    const source = resource?.record?.source || {};
    let content = String(source.src || node.resourceSrc || node.text || "");
    let storageKey = "";
    let blob = resource?.blob;
    if (!blob && /^data:/i.test(content)) {
        try { blob = await (await fetch(content)).blob(); } catch { /* Retain the original URL. */ }
    }
    if (node.type === "media" && blob) {
        storageKey = `${type === CanvasNodeType.Image ? "image" : "media"}:legacy:${projectId}:${node.id}`;
        content = type === CanvasNodeType.Image
            ? await setImageBlob(storageKey, blob)
            : await setMediaBlob(storageKey, blob);
        await verifyBlob(blob, type === CanvasNodeType.Image ? await getImageBlob(storageKey) : await getMediaBlob(storageKey));
    }
    if (type === CanvasNodeType.Text) content = legacyText(node);
    if (type === CanvasNodeType.Config) content = String(node.composerContent || node.promptText || "");
    const generation = node.genConfig || {};
    return {
        id: String(node.id),
        type,
        title: String(node.title || (known ? "未命名节点" : "旧版只读节点")),
        position: { x: Number(node.x) || 0, y: Number(node.y) || 0 },
        width: Math.max(80, Number(node.width) || 260),
        height: Math.max(60, Number(node.height) || 180),
        metadata: {
            content,
            composerContent: type === CanvasNodeType.Config ? content : undefined,
            prompt: type === CanvasNodeType.Config ? String(node.promptText || content) : undefined,
            generationMode: generation.kind === "video" || node.generationKind === "video" ? "video" : "image",
            model: String(generation.model || ""),
            quality: String(generation.quality || ""),
            size: String(generation.aspect || ""),
            count: Number(generation.count) || 1,
            storageKey: storageKey || undefined,
            mimeType: String(source.mimeType || node.mimeType || ""),
            naturalWidth: Number(source.width) || undefined,
            naturalHeight: Number(source.height) || undefined,
            durationMs: Number(source.durationMs || node.durationMs) || undefined,
            groupId: String(node.groupId || "") || undefined,
            legacyReadOnly: !known,
            legacySourceId: String(node.id),
            legacyKind: String(node.type || ""),
        },
    };
}

export async function convertLegacyProject(payload: LegacyPayload): Promise<CanvasProject> {
    const project = payload.project;
    const resources = new Map(payload.resources.map((item) => [item.record?.id, item]));
    const oldNodes = project.nodes || {};
    const order = [...(Array.isArray(project.nodeOrder) ? project.nodeOrder : []), ...Object.keys(oldNodes)];
    const ids = [...new Set(order)].filter((id) => oldNodes[id]);
    const nodes = await Promise.all(ids.map((id) => convertNode(oldNodes[id], String(project.id), resources.get(oldNodes[id].resourceId))));
    const validIds = new Set(nodes.map((node) => node.id));
    const connections: CanvasConnection[] = Object.values(project.edges || {})
        .filter((edge: any) => validIds.has(edge.fromNodeId) && validIds.has(edge.toNodeId))
        .map((edge: any) => ({ id: String(edge.id), fromNodeId: String(edge.fromNodeId), toNodeId: String(edge.toNodeId) }));
    const viewport = project.viewport || {};
    return {
        id: `legacy:${project.id}`,
        title: String(project.title || "旧画布项目"),
        createdAt: iso(project.createdAt),
        updatedAt: iso(project.updatedAt),
        nodes,
        connections,
        chatSessions: [],
        activeChatId: null,
        backgroundMode: project.backgroundMode === "dots" || project.backgroundMode === "blank" ? project.backgroundMode : "lines",
        showImageInfo: false,
        viewport: { x: Number(viewport.x) || 0, y: Number(viewport.y) || 0, k: Number(viewport.scale) || 1 },
    };
}

function waitForHydration() {
    if (useCanvasStore.getState().hydrated) return Promise.resolve();
    return new Promise<void>((resolve) => {
        const unsubscribe = useCanvasStore.subscribe((state) => {
            if (!state.hydrated) return;
            unsubscribe();
            resolve();
        });
    });
}

async function verifyPersisted(projectId: string) {
    for (let attempt = 0; attempt < 15; attempt += 1) {
        const value = await localForageStorage.getItem("image_app:canvas_v2");
        if (value && JSON.parse(value).state?.projects?.some((project: CanvasProject) => project.id === projectId)) return;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("新画布项目未能写入存储；旧项目仍保留，可重试迁移");
}

export async function migrateLegacyProjects() {
    await waitForHydration();
    const summaries = await requestHost<LegacySummary[]>("legacyList");
    let imported = 0;
    for (const summary of summaries) {
        const key = `v${MIGRATION_VERSION}:${summary.id}`;
        const projectId = `legacy:${summary.id}`;
        const state = useCanvasStore.getState();
        if (state.deletedProjects.some((project) => project.id === projectId)) continue;
        const existing = state.projects.find((project) => project.id === projectId);
        if (existing) {
            await migrationStore.setItem(key, { projectId: existing.id, updatedAt: summary.updatedAt });
            continue;
        }
        const payload = await requestHost<LegacyPayload>("legacyProject", { id: summary.id });
        const converted = await convertLegacyProject(payload);
        useCanvasStore.setState((state) => ({ projects: [converted, ...state.projects] }));
        await verifyPersisted(converted.id);
        await migrationStore.setItem(key, { projectId: converted.id, updatedAt: summary.updatedAt });
        imported += 1;
    }
    return { imported, total: summaries.length };
}
