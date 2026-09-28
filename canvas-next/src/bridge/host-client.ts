import { decodeChannelModel, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

type HostMessage = {
    canvasBridge: 1;
    type: "ready" | "request" | "response" | "cancel" | "event";
    id?: string;
    method?: string;
    payload?: unknown;
    error?: string;
};

const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();
const listeners = new Set<(method: string, payload: unknown) => void>();
let sequence = 0;

export const embeddedInHost = window.parent !== window;

function post(message: HostMessage) {
    window.parent.postMessage(message, window.location.origin);
}

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
    if (!embeddedInHost || event.origin !== window.location.origin || event.source !== window.parent) return;
    const message = event.data;
    if (message?.canvasBridge !== 1) return;
    if (message.type === "response" && message.id) {
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error));
        else request.resolve(message.payload);
    }
    if (message.type === "event" && message.method) {
        listeners.forEach((listener) => listener(message.method!, message.payload));
    }
});

export function onHostEvent(listener: (method: string, payload: unknown) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function signalHostReady() {
    if (embeddedInHost) post({ canvasBridge: 1, type: "ready" });
}

export function requestHost<T>(method: string, payload?: unknown, signal?: AbortSignal): Promise<T> {
    if (!embeddedInHost) return Promise.reject(new Error("主站画布通信不可用"));
    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    const id = `canvas-${++sequence}`;
    return new Promise<T>((resolve, reject) => {
        const abort = () => {
            pending.delete(id);
            post({ canvasBridge: 1, type: "cancel", id });
            reject(new DOMException("Aborted", "AbortError"));
        };
        pending.set(id, {
            resolve: (value) => { signal?.removeEventListener("abort", abort); resolve(value); },
            reject: (error) => { signal?.removeEventListener("abort", abort); reject(error); },
        });
        signal?.addEventListener("abort", abort, { once: true });
        post({ canvasBridge: 1, type: "request", id, method, payload });
    });
}

export function hostGenerationOptions(config: AiConfig) {
    return {
        model: decodeChannelModel(config.model)?.model || config.model,
        aspect: config.size,
        resolution: config.vquality,
        quality: config.quality,
        videoDuration: config.videoSeconds,
        count: Number(config.count) || 1,
    };
}

export async function generateWithHost(kind: "image" | "video", config: AiConfig, prompt: string, references: ReferenceImage[], signal?: AbortSignal) {
    const images = references.map((image) => ({ dataUrl: image.dataUrl, name: image.name, type: image.type }));
    const response = await requestHost<{ result: Record<string, string> }>("generate", {
        kind, prompt, images, options: hostGenerationOptions(config),
    }, signal);
    return response.result;
}

export function imageResultDataUrl(result: Record<string, string>) {
    if (result.imageBase64) return result.imageBase64.startsWith("data:")
        ? result.imageBase64 : `data:${result.mime || "image/png"};base64,${result.imageBase64}`;
    return result.imageUrl || "";
}
