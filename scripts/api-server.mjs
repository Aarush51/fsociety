// Development API server for /api/roadmap.
// `npm run dev` (Vite) proxies /api here; the AI key stays in this process.
// Idea generation lives in the Supabase Edge Function `generate-ideas`.
import { createServer } from "node:http";
import { handleRoadmapRequest } from "../server/roadmap.mjs";
import { loadServerEnv } from "../server/env.mjs";

loadServerEnv();

const port = Number(process.env.API_PORT || 8787);
const configured = Boolean((process.env.AI_API_KEY || "").trim());

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (url.pathname === "/api/roadmap") {
    handleRoadmapRequest(req, res).catch((error) => {
      console.error("[roadmap] Unhandled request error:", error?.name || "error");
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "The roadmap service is unavailable right now. Try again." }));
      } else {
        res.end();
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ error: "Not found." }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`HackMate roadmap API on http://127.0.0.1:${port} (AI provider configured: ${configured ? "yes" : "no"})`);
});
