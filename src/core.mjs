export const SAVE_VERSION = 3;

export const DIFFICULTIES = Object.freeze({
  exploration: {
    id: "exploration",
    label: "Exploration",
    threatSpeed: 0.82,
    damage: 0.72,
    batteryDrain: 0.72,
    resourceMultiplier: 1.35,
    scoreMultiplier: 0.8,
  },
  survival: {
    id: "survival",
    label: "Survie",
    threatSpeed: 1,
    damage: 1,
    batteryDrain: 1,
    resourceMultiplier: 1,
    scoreMultiplier: 1,
  },
  nightmare: {
    id: "nightmare",
    label: "Cauchemar",
    threatSpeed: 1.2,
    damage: 1.28,
    batteryDrain: 1.18,
    resourceMultiplier: 0.72,
    scoreMultiplier: 1.35,
  },
});

export const ZONE_DEFS = Object.freeze([
  {
    id: "offices",
    name: "NIVEAU 0 — LES BUREAUX SANS SORTIE",
    shortName: "Bureaux jaunes",
    subtitle: "Les néons bourdonnent avec une seconde de retard.",
    objectiveName: "relais fluorescents",
    requiredCount: 2,
    threatName: "Le Plafonnier",
    noteTitle: "Note 01 — Plan d’évacuation",
    noteText: "Les flèches du plan pointent vers la pièce que vous venez de quitter.",
    palette: {
      void: "#080704",
      floor: "#796f38",
      floorAlt: "#6c632f",
      wall: "#b7a957",
      wallEdge: "#ded07a",
      fog: "rgba(13, 11, 4, .93)",
      accent: "#f5e98d",
      danger: "#d44837",
    },
  },
  {
    id: "station",
    name: "NIVEAU 37 — LES QUAIS NOYÉS",
    shortName: "Station inondée",
    subtitle: "L’eau reflète des panneaux qui n’existent pas.",
    objectiveName: "vannes de coupure",
    requiredCount: 2,
    threatName: "Le Contrôleur noyé",
    noteTitle: "Note 02 — Dernière rame",
    noteText: "La rame sans numéro ne s’arrête que si personne ne la regarde entrer.",
    palette: {
      void: "#02090d",
      floor: "#244653",
      floorAlt: "#1e3b47",
      wall: "#527785",
      wallEdge: "#82afbc",
      fog: "rgba(2, 14, 20, .94)",
      accent: "#78dcff",
      danger: "#ff6b62",
    },
  },
  {
    id: "hotel",
    name: "NIVEAU 188 — L’HÔTEL RENVERSÉ",
    shortName: "Hôtel rouge",
    subtitle: "Chaque porte porte le numéro de votre chambre.",
    objectiveName: "sceaux d’ascenseur",
    requiredCount: 3,
    threatName: "Le Résident permanent",
    noteTitle: "Note 03 — Chambre 808",
    noteText: "La clé n’ouvre aucune porte. Elle ferme ce qui vous suit.",
    palette: {
      void: "#0d0205",
      floor: "#4a1720",
      floorAlt: "#3e1219",
      wall: "#843443",
      wallEdge: "#c35c6b",
      fog: "rgba(22, 2, 6, .95)",
      accent: "#ff8798",
      danger: "#ff284f",
    },
  },
]);

export const ENDINGS = Object.freeze({
  escape: {
    id: "escape",
    kind: "victory",
    rank: "FIN A",
    title: "SORTIE DE SERVICE",
    text: "L’ascenseur s’ouvre sur un parking familier. Six secondes se sont écoulées dehors, mais vos chaussures sont encore humides.",
  },
  cartographer: {
    id: "cartographer",
    kind: "victory",
    rank: "FIN S",
    title: "LE PLAN IMPOSSIBLE",
    text: "Les trois notes superposées dessinent un quatrième niveau. Vous revenez avec un itinéraire que le lieu ne pourra plus effacer.",
  },
  silent: {
    id: "silent",
    kind: "victory",
    rank: "FIN Ω",
    title: "AUCUNE TRACE",
    text: "Vous coupez le dernier néon et traversez dans le noir. Derrière vous, les couloirs oublient jusqu’au bruit de vos pas.",
  },
  consumed: {
    id: "consumed",
    kind: "failure",
    rank: "ÉCHEC",
    title: "OCCUPANT SUPPLÉMENTAIRE",
    text: "La lumière tombe. Quelque chose apprend votre démarche puis repart vers l’entrée en portant votre souffle.",
  },
  lost: {
    id: "lost",
    kind: "failure",
    rank: "ÉCHEC",
    title: "DISSOCIATION",
    text: "Les murs cessent d’être des murs. Vous continuez de marcher, certain d’être déjà rentré.",
  },
});

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function hashSeed(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledDirections(rng) {
  const directions = [[2, 0], [-2, 0], [0, 2], [0, -2]];
  for (let index = directions.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    const temp = directions[index];
    directions[index] = directions[other];
    directions[other] = temp;
  }
  return directions;
}

export function isWalkable(grid, x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  return Boolean(grid[iy] && grid[iy][ix] && grid[iy][ix] !== "#");
}

export function distanceMap(grid, start) {
  const height = grid.length;
  const width = grid[0].length;
  const values = Array.from({ length: height }, () => Array(width).fill(-1));
  const queue = [{ x: start.x, y: start.y }];
  values[start.y][start.x] = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    const nextDistance = values[current.y][current.x] + 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = current.x + dx;
      const y = current.y + dy;
      if (y < 0 || y >= height || x < 0 || x >= width) continue;
      if (grid[y][x] === "#" || values[y][x] !== -1) continue;
      values[y][x] = nextDistance;
      queue.push({ x, y });
    }
  }
  return values;
}

export function findPath(grid, start, goal, maxNodes = 1800) {
  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const gx = Math.floor(goal.x);
  const gy = Math.floor(goal.y);
  if (!isWalkable(grid, sx, sy) || !isWalkable(grid, gx, gy)) return [];
  if (sx === gx && sy === gy) return [{ x: sx, y: sy }];
  const width = grid[0].length;
  const height = grid.length;
  const key = (x, y) => y * width + x;
  const queue = [{ x: sx, y: sy }];
  const parents = new Map();
  parents.set(key(sx, sy), null);
  let found = null;
  for (let cursor = 0; cursor < queue.length && cursor < maxNodes; cursor += 1) {
    const current = queue[cursor];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = current.x + dx;
      const y = current.y + dy;
      const nodeKey = key(x, y);
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (grid[y][x] === "#" || parents.has(nodeKey)) continue;
      parents.set(nodeKey, current);
      if (x === gx && y === gy) {
        found = { x, y };
        cursor = queue.length;
        break;
      }
      queue.push({ x, y });
    }
  }
  if (!found) return [];
  const path = [found];
  let cursor = parents.get(key(found.x, found.y));
  while (cursor) {
    path.push(cursor);
    cursor = parents.get(key(cursor.x, cursor.y));
  }
  return path.reverse();
}

export function hasLineOfSight(grid, from, to) {
  const span = distance(from.x, from.y, to.x, to.y);
  const steps = Math.max(2, Math.ceil(span * 4));
  for (let index = 1; index < steps; index += 1) {
    const amount = index / steps;
    const x = from.x + (to.x - from.x) * amount;
    const y = from.y + (to.y - from.y) * amount;
    if (!isWalkable(grid, x, y)) return false;
  }
  return true;
}

function carveRoom(grid, center, rng) {
  const width = 3 + Math.floor(rng() * 3) * 2;
  const height = 3 + Math.floor(rng() * 2) * 2;
  const left = Math.max(1, center.x - Math.floor(width / 2));
  const right = Math.min(grid[0].length - 2, center.x + Math.floor(width / 2));
  const top = Math.max(1, center.y - Math.floor(height / 2));
  const bottom = Math.min(grid.length - 2, center.y + Math.floor(height / 2));
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) grid[y][x] = ".";
  }
}

function takeSpaced(candidates, used, rng, minDistance = 4) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const candidate = candidates[Math.floor(rng() * candidates.length)];
    if (!candidate) break;
    if (used.every((point) => distance(point.x, point.y, candidate.x, candidate.y) >= minDistance)) {
      used.push(candidate);
      return candidate;
    }
  }
  const fallback = candidates.find((candidate) => !used.some((point) => point.x === candidate.x && point.y === candidate.y));
  if (fallback) used.push(fallback);
  return fallback || candidates[0];
}

export function generateZone(seed, zoneIndex = 0, difficultyId = "survival") {
  const width = 41;
  const height = 27;
  const rng = createRng(String(seed) + ":" + zoneIndex);
  const grid = Array.from({ length: height }, () => Array(width).fill("#"));
  const start = { x: 1, y: 1 };
  const stack = [start];
  grid[start.y][start.x] = ".";

  while (stack.length) {
    const current = stack[stack.length - 1];
    const options = shuffledDirections(rng).filter(([dx, dy]) => {
      const x = current.x + dx;
      const y = current.y + dy;
      return x > 0 && x < width - 1 && y > 0 && y < height - 1 && grid[y][x] === "#";
    });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = options[0];
    grid[current.y + dy / 2][current.x + dx / 2] = ".";
    grid[current.y + dy][current.x + dx] = ".";
    stack.push({ x: current.x + dx, y: current.y + dy });
  }

  const openCells = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (grid[y][x] === ".") openCells.push({ x, y });
    }
  }
  for (let index = 0; index < 5 + zoneIndex; index += 1) {
    carveRoom(grid, openCells[Math.floor(rng() * openCells.length)], rng);
  }
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (grid[y][x] !== "#" || rng() > 0.055 + zoneIndex * 0.012) continue;
      const horizontal = grid[y][x - 1] === "." && grid[y][x + 1] === ".";
      const vertical = grid[y - 1][x] === "." && grid[y + 1][x] === ".";
      if (horizontal !== vertical) grid[y][x] = ".";
    }
  }

  const distances = distanceMap(grid, start);
  const candidates = [];
  let exit = { x: width - 2, y: height - 2 };
  let maxDistance = -1;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const value = distances[y][x];
      if (value < 0) continue;
      if (value > maxDistance) {
        maxDistance = value;
        exit = { x, y };
      }
      if (value > 8) candidates.push({ x, y, distance: value });
    }
  }

  const definition = ZONE_DEFS[zoneIndex];
  const difficulty = DIFFICULTIES[difficultyId] || DIFFICULTIES.survival;
  const used = [start, exit];
  const items = [];
  for (let index = 0; index < definition.requiredCount; index += 1) {
    const point = takeSpaced(candidates, used, rng, 7);
    items.push({
      id: "objective-" + zoneIndex + "-" + index,
      type: "objective",
      x: point.x,
      y: point.y,
      label: definition.objectiveName,
      collected: false,
    });
  }
  const notePoint = takeSpaced(candidates, used, rng, 7);
  items.push({
    id: "note-" + zoneIndex,
    type: "note",
    x: notePoint.x,
    y: notePoint.y,
    label: definition.noteTitle,
    text: definition.noteText,
    collected: false,
  });

  const batteryCount = Math.max(1, Math.round(3 * difficulty.resourceMultiplier));
  const resourcePlan = [
    ...Array.from({ length: batteryCount }, () => "battery"),
    "medkit",
    ...(difficulty.resourceMultiplier >= 1 ? ["stabilizer"] : []),
  ];
  resourcePlan.forEach((type, index) => {
    const point = takeSpaced(candidates, used, rng, 4);
    items.push({
      id: type + "-" + zoneIndex + "-" + index,
      type,
      x: point.x,
      y: point.y,
      label: type,
      collected: false,
    });
  });

  const hidingSpots = Array.from({ length: 2 + zoneIndex }, (_, index) => {
    const point = takeSpaced(candidates, used, rng, 4);
    return { id: "hide-" + zoneIndex + "-" + index, x: point.x, y: point.y };
  });
  const hazards = Array.from({ length: 5 + zoneIndex * 2 }, (_, index) => {
    const point = takeSpaced(candidates, used, rng, 2);
    return { id: "hazard-" + zoneIndex + "-" + index, x: point.x, y: point.y };
  });
  const landmarks = Array.from({ length: 4 }, (_, index) => {
    const point = takeSpaced(candidates, used, rng, 5);
    return { id: "landmark-" + zoneIndex + "-" + index, x: point.x, y: point.y, variant: index };
  });

  const threatCount = zoneIndex === 2 && difficultyId !== "exploration" ? 2 : 1;
  const threatCandidates = candidates
    .filter((point) => point.distance > maxDistance * 0.56)
    .sort((a, b) => b.distance - a.distance);
  const threats = Array.from({ length: threatCount }, (_, index) => {
    const point = takeSpaced(threatCandidates, used, rng, 9);
    return {
      id: "threat-" + zoneIndex + "-" + index,
      x: point.x + 0.5,
      y: point.y + 0.5,
      state: "patrol",
      stun: 2.5 + index,
      cooldown: 0,
      alert: 0,
      pathTimer: 0,
      path: [],
      target: null,
      lastKnown: null,
    };
  });

  return {
    id: definition.id,
    seed: hashSeed(String(seed) + ":" + zoneIndex),
    grid: grid.map((row) => row.join("")),
    start: { x: start.x + 0.5, y: start.y + 0.5 },
    exit: { x: exit.x + 0.5, y: exit.y + 0.5 },
    maxDistance,
    items,
    hidingSpots,
    hazards,
    landmarks,
    threats,
    requiredCount: definition.requiredCount,
    objectivesFound: 0,
    explored: [],
    completed: false,
  };
}

export function createRun(seed, difficultyId = "survival", now = Date.now()) {
  const difficulty = DIFFICULTIES[difficultyId] || DIFFICULTIES.survival;
  const normalizedSeed = hashSeed(seed);
  const zones = ZONE_DEFS.map((definition, index) => generateZone(normalizedSeed, index, difficulty.id));
  return {
    version: SAVE_VERSION,
    id: "run-" + now + "-" + normalizedSeed.toString(16),
    seed: normalizedSeed,
    difficulty: difficulty.id,
    status: "playing",
    startedAt: now,
    updatedAt: now,
    zoneIndex: 0,
    player: {
      x: zones[0].start.x,
      y: zones[0].start.y,
      health: 100,
      battery: 100,
      stamina: 100,
      composure: 100,
      pulse: 45,
      flashlight: true,
      crouching: false,
      hidden: false,
      inventory: { battery: 1, medkit: 0, stabilizer: 0 },
    },
    stats: {
      elapsed: 0,
      steps: 0,
      encounters: 0,
      notes: 0,
      objectives: 0,
      resources: 0,
      damageTaken: 0,
      pulseUses: 0,
      retries: 0,
    },
    zoneEnteredAt: now,
    zones,
  };
}

function hasFinitePoint(value) {
  return Boolean(value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)));
}

function hasValidZoneShape(zone, zoneIndex) {
  if (!zone || typeof zone !== "object" || zone.id !== ZONE_DEFS[zoneIndex].id) return false;
  if (!Array.isArray(zone.grid) || zone.grid.length < 3) return false;
  const width = typeof zone.grid[0] === "string" ? zone.grid[0].length : 0;
  if (width < 3 || !zone.grid.every((row) => typeof row === "string" && row.length === width && /^[#.]+$/.test(row))) return false;
  const validWalkablePoint = (point) => hasFinitePoint(point) && isWalkable(zone.grid, Number(point.x), Number(point.y));
  if (!validWalkablePoint(zone.start) || !validWalkablePoint(zone.exit)) return false;
  for (const collection of ["items", "hidingSpots", "hazards", "landmarks", "threats"]) {
    if (!Array.isArray(zone[collection]) || !zone[collection].every((entry) => entry && typeof entry === "object" && validWalkablePoint(entry))) return false;
  }
  if (!Array.isArray(zone.explored)) return false;
  return zone.threats.length > 0 && Number.isFinite(Number(zone.requiredCount));
}

export function sanitizeRun(raw) {
  if (!raw || typeof raw !== "object" || raw.version !== SAVE_VERSION) return null;
  if (!Array.isArray(raw.zones) || raw.zones.length !== ZONE_DEFS.length) return null;
  if (!raw.zones.every((zone, index) => hasValidZoneShape(zone, index))) return null;
  if (!raw.player || typeof raw.player !== "object" || !raw.stats || typeof raw.stats !== "object") return null;
  if (!Number.isInteger(raw.zoneIndex) || raw.zoneIndex < 0 || raw.zoneIndex >= ZONE_DEFS.length) return null;
  if (!hasFinitePoint(raw.player) || !isWalkable(raw.zones[raw.zoneIndex].grid, Number(raw.player.x), Number(raw.player.y))) return null;
  const run = structuredClone(raw);
  run.difficulty = DIFFICULTIES[run.difficulty] ? run.difficulty : "survival";
  run.player.x = Number(run.player.x);
  run.player.y = Number(run.player.y);
  for (const key of ["health", "battery", "stamina", "composure", "pulse"]) {
    run.player[key] = clamp(Number(run.player[key]) || 0, 0, 100);
  }
  run.player.inventory = {
    battery: Math.max(0, Math.floor(Number(run.player.inventory && run.player.inventory.battery) || 0)),
    medkit: Math.max(0, Math.floor(Number(run.player.inventory && run.player.inventory.medkit) || 0)),
    stabilizer: Math.max(0, Math.floor(Number(run.player.inventory && run.player.inventory.stabilizer) || 0)),
  };
  for (const key of ["elapsed", "steps", "encounters", "notes", "objectives", "resources", "damageTaken", "pulseUses", "retries"]) {
    run.stats[key] = Math.max(0, Number(run.stats[key]) || 0);
  }
  run.zones.forEach((zone, index) => {
    zone.requiredCount = ZONE_DEFS[index].requiredCount;
    zone.objectivesFound = clamp(Math.floor(Number(zone.objectivesFound) || 0), 0, zone.requiredCount);
    zone.completed = Boolean(zone.completed);
    zone.explored = zone.explored.filter((entry) => typeof entry === "string" && /^\d+,\d+$/.test(entry));
  });
  run.status = run.status === "playing" ? "playing" : "playing";
  return run;
}

export function unlockedFinalEndings(run) {
  const endings = ["escape"];
  if ((run.stats.notes || 0) >= ZONE_DEFS.length) endings.push("cartographer");
  if ((run.stats.encounters || 0) === 0 && run.player.health >= 80) endings.push("silent");
  return endings;
}

export function scoreRun(run) {
  const difficulty = DIFFICULTIES[run.difficulty] || DIFFICULTIES.survival;
  const base = 2500;
  const objectives = (run.stats.objectives || 0) * 650;
  const notes = (run.stats.notes || 0) * 900;
  const survival = Math.round(run.player.health * 12 + run.player.composure * 8);
  const stealth = Math.max(0, 1600 - (run.stats.encounters || 0) * 320);
  const timePenalty = Math.min(1800, Math.round((run.stats.elapsed || 0) * 2.1));
  return Math.max(0, Math.round((base + objectives + notes + survival + stealth - timePenalty) * difficulty.scoreMultiplier));
}
