import { nanoid } from "nanoid";
import { uploadImage } from "@/services/image-storage";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { migrateLegacyProjects } from "./legacy-migration";
import { embeddedInHost, onHostEvent, requestHost, signalHostReady } from "./host-client";

type HostOption = { value: string; label: string };
type HostConfig = {
    image: { model: string; aspect: string; resolution: string; quality: string; modelOptions: HostOption[] };
    video: { model: string; duration: string; modelOptions: HostOption[] };
    text: { available: boolean; message?: string };
};
type Source = { src: string; label?: string; kind?: string };

function emit(method: string, payload?: unknown) {
    window.parent.postMessage({ canvasBridge: 1, type: "event", method, payload }, window.location.origin);
}

function applyHostConfig(snapshot: HostConfig) {
    const imageModels = [...new Set([snapshot.image.model, ...snapshot.image.modelOptions.map((item) => item.value)].filter(Boolean))];
    const videoModels = [...new Set([snapshot.video.model, ...snapshot.video.modelOptions.map((item) => item.value)].filter(Boolean))];
    const imageModel = imageModels[0] || "";
    const videoModel = videoModels[0] || "";
    useConfigStore.setState((state) => ({
        config: {
            ...state.config,
            model: `host-image::${imageModel}`,
            imageModel: `host-image::${imageModel}`,
            videoModel: `host-video::${videoModel}`,
            models: [...imageModels.map((model) => `host-image::${model}`), ...videoModels.map((model) => `host-video::${model}`)],
            channels: [
                { id: "host-image", name: "当前站点图片", baseUrl: "", apiKey: "", apiFormat: "openai", models: imageModels.map((name) => ({ name, capability: "image" as const })) },
                { id: "host-video", name: "当前站点视频", baseUrl: "", apiKey: "", apiFormat: "openai", models: videoModels.map((name) => ({ name, capability: "video" as const })) },
            ],
            size: snapshot.image.aspect || "1:1",
            quality: snapshot.image.quality || "auto",
            vquality: snapshot.image.resolution || state.config.vquality,
            videoSeconds: snapshot.video.duration || "6",
        } satisfies AiConfig,
    }));
}

function currentProjectId() {
    return decodeURIComponent(window.location.hash.match(/^#\/canvas\/([^?]+)/)?.[1] || "");
}

async function addSources(sources: Source[], requestedProjectId?: string) {
    const list = sources.filter((source) => source?.src);
    if (!list.length) return;
    const store = useCanvasStore.getState();
    const projectId = requestedProjectId && store.projects.some((project) => project.id === requestedProjectId)
        ? requestedProjectId : currentProjectId() && store.projects.some((project) => project.id === currentProjectId())
            ? currentProjectId() : store.createProject("从主站导入");
    const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
    if (!project) throw new Error("画布项目不可用");
    const offset = project.nodes.length;
    const nodes: CanvasNodeData[] = [];
    for (let index = 0; index < list.length; index += 1) {
        const source = list[index];
        const image = await uploadImage(source.src);
        nodes.push({
            id: nanoid(), type: CanvasNodeType.Image, title: source.label || `图片 ${offset + index + 1}`,
            position: { x: 100 + ((offset + index) % 4) * 300, y: 100 + Math.floor((offset + index) / 4) * 300 },
            width: 260, height: 220,
            metadata: { content: image.url, storageKey: image.storageKey, naturalWidth: image.width, naturalHeight: image.height, mimeType: image.mimeType },
        });
    }
    useCanvasStore.getState().updateProject(projectId, { nodes: [...project.nodes, ...nodes] });
    if (currentProjectId() === projectId) window.dispatchEvent(new CustomEvent("image-app:canvas-nodes-imported", { detail: { projectId, nodes } }));
    else window.location.hash = `#/canvas/${encodeURIComponent(projectId)}`;
    emit("activeProject", { id: projectId });
}

async function addPrompt(entry: Record<string, unknown>, requestedProjectId?: string) {
    const store = useCanvasStore.getState();
    const projectId = requestedProjectId && store.projects.some((project) => project.id === requestedProjectId)
        ? requestedProjectId : currentProjectId() && store.projects.some((project) => project.id === currentProjectId())
            ? currentProjectId() : store.createProject("提示词画布");
    const project = useCanvasStore.getState().projects.find((item) => item.id === projectId);
    if (!project) throw new Error("画布项目不可用");
    const node: CanvasNodeData = {
        id: nanoid(), type: CanvasNodeType.Text, title: String(entry.title || "提示词"),
        position: { x: 120, y: 120 }, width: 320, height: 220,
        metadata: { content: String(entry.content || entry.prompt || "") },
    };
    useCanvasStore.getState().updateProject(projectId, { nodes: [...project.nodes, node] });
    if (currentProjectId() === projectId) window.dispatchEvent(new CustomEvent("image-app:canvas-nodes-imported", { detail: { projectId, nodes: [node] } }));
    else window.location.hash = `#/canvas/${encodeURIComponent(projectId)}`;
    emit("activeProject", { id: projectId });
}

export function initializeHostIntegration() {
    if (!embeddedInHost) return;
    let bootstrap: Promise<void> = Promise.resolve();
    onHostEvent((method, payload) => {
        if (method === "importSources") {
            const data = payload as { sources: Source[]; projectId?: string };
            void bootstrap.then(() => addSources(data.sources || [], data.projectId)).catch((error) => emit("status", { message: String(error?.message || error), tone: "danger" }));
        }
        if (method === "importPrompt") {
            const data = payload as { entry: Record<string, unknown>; projectId?: string };
            void bootstrap.then(() => addPrompt(data.entry || {}, data.projectId)).catch((error) => emit("status", { message: String(error?.message || error), tone: "danger" }));
        }
        if (method === "refreshConfig") void requestHost<HostConfig>("config").then(applyHostConfig);
    });
    const publishProjects = () => emit("projects", useCanvasStore.getState().projects.map((project) => ({ id: project.id, title: project.title, updatedAt: project.updatedAt })));
    useCanvasStore.subscribe(publishProjects);
    window.addEventListener("hashchange", () => emit("activeProject", { id: currentProjectId() }));
    bootstrap = (async () => {
        applyHostConfig(await requestHost<HostConfig>("config"));
        try {
            const result = await migrateLegacyProjects();
            if (result.imported) emit("status", { message: `已迁移 ${result.imported} 个旧画布项目`, tone: "success" });
        } catch (error) {
            emit("migrationError", { message: String(error instanceof Error ? error.message : error) });
        }
        publishProjects();
        emit("activeProject", { id: currentProjectId() });
    })().catch((error) => emit("status", { message: String(error?.message || error), tone: "danger" }));
    signalHostReady();
}
