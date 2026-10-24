// Production server: serves dist/ and POST /api/roadmap.
// The roadmap AI key is read from the server environment only (never VITE_*),
// used for the outbound provider call, and never included in a response.
// Idea generation is served by the Supabase Edge Function `generate-ideas`.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { handleRoadmapRequest } from "../server/roadmap.mjs";
import { loadServerEnv } from "../server/env.mjs";

loadServerEnv();

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const distDir = resolve(process.cwd(), "dist");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function serveFile(req, res, filePath, { immutable = false } = {}) {
  const stats = statSync(filePath);
  const extension = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Content-Length": stats.size,
    "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

if (!existsSync(distDir)) {
  console.error("dist/ is missing. Run `npm run build` first.");
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (url.pathname === "/api/roadmap") {
    handleRoadmapRequest(req, res).catch((error) => {
      console.error("[roadmap] Unhandled request error:", error?.name || "error");
      if (!res.headersSent) {
        sendJson(res, 500, { error: "The roadmap service is unavailable right now. Try again." });
      } else {
        res.end();
      }
    });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(res, 400, { error: "Bad request." });
    return;
  }

  const target = resolve(distDir, `.${pathname}`);
  if (target !== distDir && !target.startsWith(distDir + sep)) {
    sendJson(res, 403, { error: "Forbidden." });
    return;
  }

  let filePath = target;
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    if (extname(pathname)) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }
    filePath = join(distDir, "index.html");
  }

  try {
    serveFile(req, res, filePath, { immutable: pathname.startsWith("/assets/") });
  } catch (error) {
    console.error("[server] Could not serve file:", error?.code || "error");
    if (!res.headersSent) sendJson(res, 500, { error: "Could not load this page." });
    else res.end();
  }
});

server.listen(port, host, () => {
  console.log(`HackMate server on http://localhost:${port} (serving dist/)`);
});
