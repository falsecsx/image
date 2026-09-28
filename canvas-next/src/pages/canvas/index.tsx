import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { App, Button, Dropdown, type MenuProps } from "antd";
import { Archive, Download, FileUp, MoreHorizontal, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { readZip } from "@/lib/zip";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import { CanvasDeleteProjectsDialog } from "@/components/canvas/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "@/components/canvas/canvas-project-card";
import type { CanvasExportFile } from "@/types/canvas-export";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { hasAgentUrlBootstrap } from "@/lib/agent/agent-url-bootstrap";
import { embeddedInHost, requestHost } from "@/bridge/host-client";
import { exportLegacyArchive } from "@/bridge/legacy-export";

export default function CanvasPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const inputRef = useRef<HTMLInputElement>(null);
    const [legacyCount, setLegacyCount] = useState(0);
    const autoOpenRef = useRef(false);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

    const mode = searchParams.get("mode");
    const agentMode = mode === "new" || mode === "recent" || mode === "choose";
    const agentQuery = agentMode ? `?${searchParams.toString()}` : "";
    useEffect(() => {
        if (embeddedInHost) void requestHost<Array<{ id: string }>>("legacyList").then((list) => setLegacyCount(list.length)).catch(() => undefined);
    }, []);
    const enterProject = (id: string) => {
        const agentHash = hasAgentUrlBootstrap(window.location.hash) ? window.location.hash : "";
        navigate(`/canvas/${id}${agentQuery}${agentHash}`, { replace: Boolean(agentHash) });
    };
    const createAndEnter = () => enterProject(createProject(t("canvas.defaultTitle", { count: projects.length + 1 })));
    const exportSelected = () => void exportCanvasProjects(projects.filter((project) => selectedIds.includes(project.id)), `${t("canvas.title")}-${selectedIds.length}`);
    const deleteSelected = () => setDeleteIds(selectedIds);
    const deleteAll = () => setDeleteIds(projects.map((project) => project.id));
    const importFile = () => inputRef.current?.click();
    const exportLegacy = () => void exportLegacyArchive().catch((error) => message.error(error instanceof Error ? error.message : String(error)));
    const libraryMenuItems: MenuProps["items"] = [
        legacyCount > 0 ? { key: "legacy", icon: <Archive className="size-4" />, label: "导出旧版原件", onClick: exportLegacy } : null,
        selectedIds.length ? { key: "export-selected", icon: <Download className="size-4" />, label: t("canvas.exportSelected"), onClick: exportSelected, disabled: !hydrated } : null,
        selectedIds.length ? { key: "delete-selected", label: t("canvas.deleteSelected"), onClick: deleteSelected, disabled: !hydrated } : null,
        projects.length ? { key: "delete-all", label: t("canvas.deleteAll"), onClick: deleteAll, disabled: !hydrated, danger: true } : null,
        { type: "divider" },
        { key: "import", icon: <FileUp className="size-4" />, label: t("canvas.import"), onClick: importFile, disabled: !hydrated },
    ].filter(Boolean) as MenuProps["items"];
    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
            await Promise.all(
                data.projects.flatMap((project) =>
                    project.files.map(async (item) => {
                        const blob = zip.get(item.path);
                        if (!blob) return;
                        const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
                        await (item.storageKey.startsWith("image:") ? setImageBlob(item.storageKey, typedBlob) : setMediaBlob(item.storageKey, typedBlob));
                    }),
                ),
            );
            data.projects.forEach((item) => importProject(item.project));
            message.success(t("canvas.imported", { count: data.projects.length }));
        } catch {
            message.error(t("canvas.importFailed"));
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    useEffect(() => {
        if (!hydrated || autoOpenRef.current || (mode !== "new" && mode !== "recent")) return;
        autoOpenRef.current = true;
        enterProject(mode === "new" ? createProject(t("canvas.defaultTitle", { count: projects.length + 1 })) : projects[0]?.id || createProject(t("canvas.defaultTitle", { count: projects.length + 1 })));
    }, [createProject, hydrated, mode, projects, t]);

    if (hydrated && (mode === "new" || mode === "recent")) return <main className="flex h-full items-center justify-center bg-background text-sm text-stone-500">{t("canvas.opening")}</main>;

    return (
        <main className="canvas-library-page h-full overflow-auto bg-background text-stone-950 dark:text-stone-100">
            <div className="canvas-library-container mx-auto flex w-full max-w-6xl flex-col gap-7 px-6 py-8 sm:gap-8 sm:py-10">
                <header className="canvas-library-header flex flex-wrap items-end justify-between gap-5 border-b border-stone-200 pb-6 dark:border-stone-800">
                    <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-stone-500">{t("canvas.library")}</p>
                        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{t("canvas.title")}</h1>
                        <p className="mt-3 max-w-xl text-sm leading-6 text-stone-500 dark:text-stone-400">{t("canvas.workspaceDescription")}</p>
                    </div>
                    <div className="canvas-library-actions flex min-w-0 items-center gap-2">
                        <div className="hidden flex-wrap items-center justify-end gap-2 sm:flex">
                        {legacyCount > 0 ? (
                            <Button icon={<Archive className="size-4" />} onClick={exportLegacy}>
                                导出旧版原件
                            </Button>
                        ) : null}
                        {selectedIds.length ? (
                            <>
                                <Button disabled={!hydrated} icon={<Download className="size-4" />} onClick={exportSelected}>
                                    {t("canvas.exportSelected")}
                                </Button>
                                <Button disabled={!hydrated} onClick={deleteSelected}>
                                    {t("canvas.deleteSelected")}
                                </Button>
                            </>
                        ) : null}
                        {projects.length ? (
                            <Button disabled={!hydrated} onClick={deleteAll}>
                                {t("canvas.deleteAll")}
                            </Button>
                        ) : null}
                        <Button disabled={!hydrated} icon={<FileUp className="size-4" />} onClick={importFile}>
                            {t("canvas.import")}
                        </Button>
                        </div>
                        <Dropdown menu={{ items: libraryMenuItems }} placement="bottomRight">
                            <Button className="canvas-library-mobile-more" disabled={!hydrated} icon={<MoreHorizontal className="size-4" />} aria-label={t("canvas.moreActions")} title={t("canvas.moreActions")} />
                        </Dropdown>
                        <Button disabled={!hydrated} type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            {t("canvas.create")}
                        </Button>
                    </div>
                </header>

                {!hydrated ? (
                    <section className="canvas-library-state flex min-h-[280px] items-center justify-center rounded-2xl border border-stone-200 bg-stone-50/60 text-sm text-stone-500 dark:border-stone-800 dark:bg-white/[0.025]">{t("canvas.loading")}</section>
                ) : projects.length ? (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                        {projects.map((project) => (
                            <CanvasProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                ) : (
                    <section className="canvas-library-empty flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50/50 px-6 text-center dark:border-stone-700 dark:bg-white/[0.025]">
                        <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-stone-200/70 text-stone-700 dark:bg-white/10 dark:text-stone-200"><span className="text-2xl leading-none">∞</span></div>
                        <h2 className="text-xl font-semibold tracking-[-0.02em]">{t("canvas.empty")}</h2>
                        <p className="mt-3 text-sm text-stone-500">{t("canvas.emptyDescription")}</p>
                        <Button type="primary" className="mt-6" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                            {t("canvas.create")}
                        </Button>
                    </section>
                )}
            </div>

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
            <CanvasDeleteProjectsDialog />
        </main>
    );
}
