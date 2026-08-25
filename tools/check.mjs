import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const expectedSourceBytes = 129619;
const expectedSourceSha256 = "eb0be8b6cae730acc0fabe669d7719c41ddea51bbb8f87f3212e944460988d2b";

const [source, html] = await Promise.all([
  readFile(new URL("../source/restored-collection-index.html", import.meta.url)),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
]);

const sourceSha256 = createHash("sha256").update(source).digest("hex");
const assertions = [
  [source.byteLength === expectedSourceBytes, `source size is ${expectedSourceBytes} bytes`],
  [sourceSha256 === expectedSourceSha256, `source SHA-256 is ${expectedSourceSha256}`],
  [html.includes('|| "liminal-escape";'), "root defaults to the Liminal Escape route"],
  [html.includes('rawRoute === "index.html" ? "liminal-escape"'), "direct index.html defaults to the game"],
  [html.includes("class LiminalEscapeGame extends BaseGame"), "Liminal Escape game class is present"],
  [html.includes('"liminal-escape": LiminalEscapeGame'), "Liminal Escape is registered"],
  [!/<script\b[^>]*\bsrc\s*=/i.test(html), "there are no remote script dependencies"],
  [!/<link\b[^>]*rel=["']stylesheet["']/i.test(html), "there are no stylesheet dependencies"],
  [!/(^|[^.])\bfetch\s*\(/m.test(html), "there are no runtime fetch dependencies"],
];

const inlineScript = html.match(/<script>([\s\S]*)<\/script>/i)?.[1];
assertions.push([Boolean(inlineScript), "the inline game script is present"]);
if (inlineScript) {
  try {
    new Function(inlineScript);
    assertions.push([true, "inline JavaScript compiles"]);
  } catch (error) {
    assertions.push([false, `inline JavaScript compiles (${error.message})`]);
  }
}

const failures = assertions.filter(([ok]) => !ok);
for (const [ok, message] of assertions) {
  console.log(`${ok ? "PASS" : "FAIL"} ${message}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`PASS ${assertions.length}/${assertions.length} checks`);
}
