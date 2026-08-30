import { copyFile, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "dist");
const files = [
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "sw.js",
  "src/core.mjs",
  "src/game.js",
  "assets/liminal-key-art.webp",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon-maskable-512.png",
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

let totalBytes = 0;
for (const relativePath of files) {
  const source = join(root, relativePath);
  const destination = join(output, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  totalBytes += (await stat(destination)).size;
}

console.log("BUILD production shell: " + files.length + " files");
console.log("BUILD output: dist/");
console.log("BUILD bytes: " + totalBytes);
