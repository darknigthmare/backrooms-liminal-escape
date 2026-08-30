import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

test("local server exposes the app shell, PWA files, health and real 404s", async (context) => {
  const port = 44000 + (process.pid % 1000);
  const child = spawn(process.execPath, ["tools/serve.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  context.after(() => child.kill());

  await new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(() => rejectReady(new Error("server start timeout")), 5000);
    child.once("error", rejectReady);
    child.stdout.on("data", (chunk) => {
      if (!String(chunk).includes("http://")) return;
      clearTimeout(timeout);
      resolveReady();
    });
  });

  const base = "http://127.0.0.1:" + port;
  const rootResponse = await fetch(base + "/?qa=1");
  assert.equal(rootResponse.status, 200);
  assert.match(rootResponse.headers.get("content-type"), /text\/html/);
  assert.match(await rootResponse.text(), /Backrooms — Liminal Escape/);

  const styleResponse = await fetch(base + "/styles.css");
  assert.equal(styleResponse.status, 200);
  assert.match(styleResponse.headers.get("content-type"), /text\/css/);
  assert.equal(styleResponse.headers.get("cache-control"), "no-store");

  const gameResponse = await fetch(base + "/src/game.js");
  assert.equal(gameResponse.status, 200);
  assert.equal(gameResponse.headers.get("cache-control"), "no-store");

  const keyArtResponse = await fetch(base + "/assets/liminal-key-art.webp");
  assert.equal(keyArtResponse.status, 200);
  assert.match(keyArtResponse.headers.get("content-type"), /image\/webp/);

  const manifestResponse = await fetch(base + "/manifest.webmanifest");
  assert.equal(manifestResponse.status, 200);
  assert.equal((await manifestResponse.json()).display, "standalone");

  const healthResponse = await fetch(base + "/healthz");
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json()).version, 3);

  const missingResponse = await fetch(base + "/missing.bin", { headers: { Accept: "application/octet-stream" } });
  assert.equal(missingResponse.status, 404);
});
