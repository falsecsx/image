import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    base: "/assets/canvas-app/",
    plugins: [react()],
    resolve: { alias: { "@": resolve(__dirname, "src") } },
    define: {
        __APP_VERSION__: JSON.stringify("20260928-1"),
        __APP_RELEASES__: JSON.stringify([]),
    },
    build: { outDir: "../assets/canvas-app", emptyOutDir: true },
});
