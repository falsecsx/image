import { strToU8, zipSync } from "fflate";
import { requestHost } from "./host-client";

type LegacySummary = { id: string; title: string };
type LegacyResource = { record: Record<string, any>; blob?: Blob | null };
type LegacyPayload = { project: Record<string, any>; resources: LegacyResource[] };

function safeName(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "_") || "project";
}

export async function exportLegacyArchive() {
    const summaries = await requestHost<LegacySummary[]>("legacyList");
    if (!summaries.length) throw new Error("没有旧版画布项目");
    const entries: Record<string, Uint8Array> = {};
    const manifest = { format: "image-app-canvas-legacy-archive", version: 1, exportedAt: new Date().toISOString(), projects: [] as Array<{ id: string; title: string; resources: number }> };
    for (const summary of summaries) {
        const { project, resources } = await requestHost<LegacyPayload>("legacyProject", { id: summary.id });
        const folder = safeName(summary.id);
        entries[`${folder}/project.json`] = strToU8(JSON.stringify(project, null, 2));
        const index: Array<{ id: string; record: Record<string, any>; blobPath: string | null }> = [];
        for (let position = 0; position < resources.length; position += 1) {
            const item = resources[position];
            const blobPath = item.blob ? `resources/${position}.bin` : null;
            if (blobPath && item.blob) entries[`${folder}/${blobPath}`] = new Uint8Array(await item.blob.arrayBuffer());
            index.push({ id: String(item.record.id), record: item.record, blobPath });
        }
        entries[`${folder}/resources.json`] = strToU8(JSON.stringify(index, null, 2));
        manifest.projects.push({ id: summary.id, title: summary.title, resources: resources.length });
    }
    entries["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
    const archive = new Blob([zipSync(entries, { level: 0 })], { type: "application/zip" });
    const url = URL.createObjectURL(archive);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `canvas-legacy-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return manifest.projects.length;
}
