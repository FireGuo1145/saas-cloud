import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
const client = "/dashboard-client.js";
export default defineConfig({ root: path.resolve(__dirname, "frontend"), plugins: [tailwindcss(), react()], resolve: { alias: [
  { find: "@mirelia/dashboard/frontend", replacement: client },
  { find: "react/jsx-runtime", replacement: client }, { find: "react/jsx-dev-runtime", replacement: client }, { find: "react-dom/client", replacement: client }, { find: "react-dom", replacement: client }, { find: "react", replacement: client },
  { find: "@", replacement: path.resolve(__dirname, "frontend") },
] }, build: { outDir: path.resolve(__dirname, "dist/web"), emptyOutDir: true, rollupOptions: { input: path.resolve(__dirname, "frontend/index.html"), external: [client] } } });
