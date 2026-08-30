import test from "node:test";
import assert from "node:assert/strict";
import {
  ZONE_DEFS,
  createRun,
  distanceMap,
  findPath,
  generateZone,
  isWalkable,
  sanitizeRun,
  scoreRun,
  unlockedFinalEndings,
} from "../src/core.mjs";

test("zone generation is deterministic for the same seed and difficulty", () => {
  const first = generateZone(123456, 1, "survival");
  const second = generateZone(123456, 1, "survival");
  assert.deepEqual(first, second);
});

test("all generated objectives, resources, exits and threats are reachable", () => {
  for (const seed of [1, 42, 987654321]) {
    ZONE_DEFS.forEach((definition, zoneIndex) => {
      const zone = generateZone(seed, zoneIndex, "nightmare");
      const start = { x: Math.floor(zone.start.x), y: Math.floor(zone.start.y) };
      const distances = distanceMap(zone.grid, start);
      const reachable = (x, y) => distances[Math.floor(y)][Math.floor(x)] >= 0;
      assert.equal(reachable(zone.exit.x, zone.exit.y), true, definition.id + " exit");
      zone.items.forEach((item) => assert.equal(reachable(item.x, item.y), true, definition.id + " item " + item.id));
      zone.threats.forEach((threat) => {
        assert.equal(isWalkable(zone.grid, threat.x, threat.y), true, definition.id + " threat spawn");
        assert.equal(reachable(threat.x, threat.y), true, definition.id + " threat path");
      });
    });
  }
});

test("pathfinding reaches every zone exit without crossing a wall", () => {
  const run = createRun(776655, "survival", 1000);
  run.zones.forEach((zone) => {
    const path = findPath(zone.grid, zone.start, zone.exit);
    assert.ok(path.length > 1);
    path.forEach((point) => assert.equal(isWalkable(zone.grid, point.x, point.y), true));
    assert.deepEqual(path.at(-1), { x: Math.floor(zone.exit.x), y: Math.floor(zone.exit.y) });
  });
});

test("run snapshots survive JSON storage and reject incompatible data", () => {
  const run = createRun(112233, "exploration", 1000);
  run.zoneIndex = 1;
  run.player.health = 63;
  run.player.inventory.medkit = 2;
  const restored = sanitizeRun(JSON.parse(JSON.stringify(run)));
  assert.equal(restored.zoneIndex, 1);
  assert.equal(restored.player.health, 63);
  assert.equal(restored.player.inventory.medkit, 2);
  assert.equal(sanitizeRun(null), null);
  assert.equal(sanitizeRun({ version: 2, zones: [] }), null);
  assert.equal(sanitizeRun({ version: 3, zones: [] }), null);
  assert.equal(sanitizeRun({ version: 3, zoneIndex: 0, zones: [{}, {}, {}], player: {}, stats: {} }), null);
  const missingThreats = JSON.parse(JSON.stringify(run));
  delete missingThreats.zones[0].threats;
  assert.equal(sanitizeRun(missingThreats), null);
  const invalidGrid = JSON.parse(JSON.stringify(run));
  invalidGrid.zones[1].grid[0] = "#";
  assert.equal(sanitizeRun(invalidGrid), null);
  const playerInsideWall = JSON.parse(JSON.stringify(run));
  playerInsideWall.player.x = 0;
  playerInsideWall.player.y = 0;
  assert.equal(sanitizeRun(playerInsideWall), null);
});

test("final choices unlock from notes and stealth without hiding the standard exit", () => {
  const run = createRun(443322, "survival", 1000);
  assert.deepEqual(unlockedFinalEndings(run), ["escape", "silent"]);
  run.stats.notes = 3;
  run.stats.encounters = 2;
  assert.deepEqual(unlockedFinalEndings(run), ["escape", "cartographer"]);
  run.stats.encounters = 0;
  assert.deepEqual(unlockedFinalEndings(run), ["escape", "cartographer", "silent"]);
});

test("difficulty changes score while keeping it non-negative", () => {
  const exploration = createRun(7788, "exploration", 1000);
  const nightmare = createRun(7788, "nightmare", 1000);
  exploration.stats.objectives = 7;
  nightmare.stats.objectives = 7;
  exploration.stats.notes = 3;
  nightmare.stats.notes = 3;
  assert.ok(scoreRun(nightmare) > scoreRun(exploration));
  nightmare.stats.elapsed = 999999;
  assert.ok(scoreRun(nightmare) >= 0);
});
