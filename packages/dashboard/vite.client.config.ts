import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
const root = path.resolve(__dirname, "frontend");
export default defineConfig({ define: { "process.env.NODE_ENV": JSON.stringify("production") }, root, plugins: [tailwindcss(), react()], resolve: { alias: { "@": root } }, build: { outDir: path.resolve(__dirname, "dist/web"), emptyOutDir: false, lib: { entry: path.join(root, "public.ts"), formats: ["es"], fileName: () => "dashboard-client.js" } } });
