import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const indexUrl = new URL("../index.html", import.meta.url);

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  if (new URL(request.url, `http://${request.headers.host || host}`).pathname === "/healthz") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(request.method === "HEAD" ? undefined : JSON.stringify({ status: "ok" }));
    return;
  }

  try {
    const html = await readFile(indexUrl);
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": html.byteLength,
    });
    response.end(request.method === "HEAD" ? undefined : html);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(`Unable to serve the game: ${error.message}`);
  }
});

server.listen(port, host, () => {
  console.log(`Backrooms — Liminal Escape: http://${host}:${port}`);
});
