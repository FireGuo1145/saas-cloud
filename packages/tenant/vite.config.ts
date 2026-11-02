import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [react()],
  build: {
    outDir: "dist/frontend",
    emptyOutDir: true,
    rollupOptions: {
      external: ["@mirelia/dashboard/frontend", "react", "react-dom"],
    },
  },
});
