import { existsSync } from "node:fs";

// Server-only environment loading. Values stay in this process; nothing here is
// ever sent to the browser or embedded in the Vite bundle.
export function loadServerEnv(files = [".env.local", ".env"]) {
  for (const file of files) {
    if (!existsSync(file)) continue;
    try {
      process.loadEnvFile(file);
    } catch (error) {
      console.warn(`[server] Could not read ${file}: ${error.code || "unknown error"}`);
    }
  }
}
