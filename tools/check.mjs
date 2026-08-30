import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const expectedSourceBytes = 129619;
const expectedSourceSha256 = "eb0be8b6cae730acc0fabe669d7719c41ddea51bbb8f87f3212e944460988d2b";
const requiredFiles = [
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "sw.js",
  "src/core.mjs",
  "src/game.js",
  "assets/liminal-key-art.png",
  "assets/liminal-key-art.webp",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-maskable-512.png",
];
const assertions = [];
const assert = (condition, message) => assertions.push([Boolean(condition), message]);

for (const relativePath of requiredFiles) {
  try {
    const details = await stat(join(root, relativePath));
    assert(details.isFile() && details.size > 0, relativePath + " exists");
  } catch {
    assert(false, relativePath + " exists");
  }
}

const [source, html, styles, manifestText, serviceWorker, game, core, vercel] = await Promise.all([
  readFile(join(root, "source/restored-collection-index.html")),
  readFile(join(root, "index.html"), "utf8"),
  readFile(join(root, "styles.css"), "utf8"),
  readFile(join(root, "manifest.webmanifest"), "utf8"),
  readFile(join(root, "sw.js"), "utf8"),
  readFile(join(root, "src/game.js"), "utf8"),
  readFile(join(root, "src/core.mjs"), "utf8"),
  readFile(join(root, "vercel.json"), "utf8"),
]);

assert(source.byteLength === expectedSourceBytes, "historical source size is preserved");
assert(createHash("sha256").update(source).digest("hex") === expectedSourceSha256, "historical source SHA-256 is preserved");
assert(html.includes("<title>Backrooms — Liminal Escape</title>"), "dedicated game title is present");
assert(html.includes("Fan game indépendant et non officiel"), "fan-game status is visible");
assert(html.includes('rel="manifest"'), "manifest is linked");
assert(html.includes('role="dialog"') && html.includes('aria-live="assertive"'), "modal and live-region semantics are present");
assert(!/<script\b[^>]*\bsrc=["']https?:/i.test(html), "there are no remote script dependencies");
assert(!/<link\b[^>]*href=["']https?:/i.test(html), "there are no remote stylesheet dependencies");
assert(!/url\(["']?https?:/i.test(styles), "there are no remote CSS assets");
assert(!/\bfetch\s*\(\s*["']https?:/i.test(game), "there are no remote runtime fetches");
assert(!/ArcadeNullGame|KidzTvGame|ChordOfDreadGame|NocturneDeadFrequencyGame/.test(game), "unrelated game engines are absent");
assert(game.includes("CHECKPOINT_KEY") && game.includes("visibilitychange"), "checkpoint and lifecycle autosave exist");
assert(game.includes("const activeRun = this.store.loadRun()") && game.includes("const saved = activeRun || checkpoint"), "menu can resume a surviving checkpoint");
assert(game.includes("findPath") && game.includes("hasLineOfSight"), "pathfinding and perception are wired");
assert(game.includes('if (this.manualPaused || this.modalOpen || this.run.status !== "playing")'), "modal transitions stop the active simulation frame");
assert(game.includes("const originX = threat.x") && game.includes("const originY = threat.y"), "pulse knockback uses a stable origin");
assert(game.includes("clientWidth") && game.includes("deviceScale"), "canvas backing store adapts to mobile pixel density");
assert(html.includes('data-input="KeyC"') && html.includes("S’accroupir silencieusement"), "mobile controls include stealth crouching");
assert(core.includes("generateZone") && core.includes("unlockedFinalEndings"), "generation and endings core exist");

let manifest = null;
try {
  manifest = JSON.parse(manifestText);
  assert(true, "manifest JSON parses");
} catch {
  assert(false, "manifest JSON parses");
}
assert(manifest?.display === "standalone" && manifest?.start_url === "/", "manifest is installable at root");
assert(Array.isArray(manifest?.icons) && manifest.icons.some((icon) => icon.sizes === "192x192") && manifest.icons.some((icon) => icon.sizes === "512x512"), "manifest provides 192 and 512 icons");

for (const [file, expected] of [["assets/icon-192.png", 192], ["assets/icon-512.png", 512], ["assets/icon-maskable-512.png", 512]]) {
  const png = await readFile(join(root, file));
  const valid = png.subarray(1, 4).toString() === "PNG" && png.readUInt32BE(16) === expected && png.readUInt32BE(20) === expected;
  assert(valid, file + " has expected PNG dimensions");
}

const webp = await readFile(join(root, "assets/liminal-key-art.webp"));
assert(webp.subarray(0, 4).toString() === "RIFF" && webp.subarray(8, 12).toString() === "WEBP", "production key art is valid WebP");
assert(webp.byteLength < 300000, "production key art stays below 300 KB");

for (const shellPath of ["/index.html", "/styles.css", "/src/core.mjs", "/src/game.js", "/assets/liminal-key-art.webp"]) {
  assert(serviceWorker.includes('"' + shellPath + '"'), "service worker precaches " + shellPath);
}
assert(serviceWorker.includes("if (!response.ok) return response;"), "service worker does not cache failed navigations");
assert(vercel.includes('"outputDirectory": "dist"'), "Vercel serves the production build");
assert(vercel.includes("Content-Security-Policy"), "security headers are configured");

for (const relativePath of ["src/core.mjs", "src/game.js", "sw.js", "tools/serve.mjs", "tools/build.mjs"]) {
  const result = spawnSync(process.execPath, ["--check", join(root, relativePath)], { encoding: "utf8" });
  assert(result.status === 0, relativePath + " compiles" + (result.stderr ? " (" + result.stderr.trim() + ")" : ""));
}

const failures = assertions.filter(([ok]) => !ok);
assertions.forEach(([ok, message]) => console.log((ok ? "PASS " : "FAIL ") + message));
if (failures.length) process.exitCode = 1;
else console.log("PASS " + assertions.length + "/" + assertions.length + " checks");
