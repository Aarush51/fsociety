import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api is served by scripts/api-server.mjs in development (and by
// scripts/serve-dist.mjs in production); never put AI credentials in VITE_*.
const apiProxy = {
  "/api": {
    target: `http://127.0.0.1:${process.env.API_PORT || 8787}`,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
});
