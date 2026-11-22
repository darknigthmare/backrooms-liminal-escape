---
name: gamedev-router
description: Route game-development tasks to a minimal set of engine, discipline, genre and QA skills; complement CodeGraph, 3Dviz, Spec Kit, Superpowers and existing project guidance.
---
# Game-dev skills router — shared adapter

Upstream: https://github.com/gamedev-skills/awesome-gamedev-agent-skills (Apache-2.0).
Pinned revision: `19d93f97c9c1ea0f8b306e77aa81e0d3e352d3e9`.

## Read the source of truth

- Prefer an already-installed `.agents/skills/router/SKILL.md` if this project includes its own curated game-dev suite (for example, The Horde); do not replace that suite.
- Otherwise read `.ai-tools/upstream/awesome-gamedev-agent-skills/router/SKILL.md` and its references, from the pinned submodule. If absent and permitted, run from project root: `git submodule update --init .ai-tools/upstream/awesome-gamedev-agent-skills`.
- After reading the router, select only the relevant original `SKILL.md` files under the upstream `skills/` hierarchy. Do not guess names or load every skill. Resolve their references from their real folders.
- If the full source isn't installed or accessible, this adapter offers only routing guidance; do not claim the full library was loaded.

## Route only when the task concerns games

1. Identify the *actual* engine (e.g., Godot, Unity, Unreal, Phaser, PixiJS, three.js, Canvas/DOM custom engine) from project files; don't impose an engine because a vendor folder exists.
2. Pick the smallest relevant discipline: gameplay/AI, game feel, physics/input, level design, performance, UI/UX, sprites/assets/VFX, audio, saves, online or testing. Add a genre guide only when relevant.
3. Preserve the current engine, source-of-truth gameplay files, lore, visual proportions, existing plans and saved-game schemas. Apply project-specific skills and instructions first.
4. Use CodeGraph to map dependencies, Spec Kit to specify substantial changes, Superpowers for debugging/tests and 3Dviz when spatial design matters. Verify assets *in-game*, not just by listing/generated filenames.

For non-game repositories, ignore this skill unless developing a genuine game component or interactive simulation.
