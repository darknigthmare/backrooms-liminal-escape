import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};

function safePath(pathname) {
  const decoded = decodeURIComponent(pathname).replaceAll("\\", "/");
  const relative = decoded.replace(/^\/+/, "");
  const candidate = resolve(root, relative);
  return candidate === root || candidate.startsWith(root + sep) ? candidate : null;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const requestUrl = new URL(request.url, "http://" + (request.headers.host || host));
  if (requestUrl.pathname === "/healthz") {
    const body = JSON.stringify({ status: "ok", game: "backrooms-liminal-escape", version: 3 });
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : body);
    return;
  }

  let pathname = requestUrl.pathname;
  if (pathname === "/" || pathname === "/liminal-escape" || pathname.startsWith("/liminal-escape/")) pathname = "/index.html";
  let filePath = safePath(pathname);
  try {
    if (!filePath || !(await stat(filePath)).isFile()) throw new Error("not found");
  } catch {
    const acceptsHtml = String(request.headers.accept || "").includes("text/html");
    if (acceptsHtml) filePath = resolve(root, "index.html");
    else {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
  }

  try {
    const body = await readFile(filePath);
    const extension = extname(filePath).toLowerCase();
    const headers = {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Content-Length": body.byteLength,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (filePath.endsWith("sw.js")) headers["Service-Worker-Allowed"] = "/";
    response.writeHead(200, headers);
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Unable to serve the game: " + error.message);
  }
});

server.listen(port, host, () => {
  console.log("Backrooms — Liminal Escape: http://" + host + ":" + server.address().port);
});
