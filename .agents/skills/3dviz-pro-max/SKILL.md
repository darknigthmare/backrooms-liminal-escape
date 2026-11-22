---
name: 3dviz-pro-max
description: Use the pinned 3Dviz Pro Max skill for 3D geometry, dimensions, perspective, camera, lighting, materials and rendering checks, alongside existing project skills.
---
# 3Dviz Pro Max — shared skill adapter

Upstream: https://github.com/viettranx/3dviz-pro-max (MIT).
Pinned revision: `d077e0e68915c25be8e71d74684d3144fd1c2aca`.

## Locate full resources before using them

1. If `.ai-tools/3dviz-pro-max/skill/SKILL.md` exists, use that project's full pre-existing installation and its adjacent resources.
2. Otherwise use `.ai-tools/upstream/3dviz-pro-max/skills/3dviz-pro-max/SKILL.md`. If absent, the pinned Git submodule has not been checked out. From project root, if allowed: `git submodule update --init .ai-tools/upstream/3dviz-pro-max`.
3. Read the selected original `SKILL.md` **before** starting specialized work. Resolve all referenced scripts, data, templates and kits relative to its actual directory, not this adapter. Consult its license and supporting docs.
4. If full resources are unavailable, continue with existing project tools and state that the full upstream skill was not loaded; do not claim its catalogs, scripts or checks were used.

Use for 3D, 2.5D, spatial interaction, perspective, models, environments and materials **when relevant**. Detect and preserve the project's actual engine, visual direction, controls and artistic constraints. Pair with CodeGraph for code paths, Spec Kit for plans, Superpowers for implementation/QA, gamedev-router for game-specific workflows and Obscura for web rendering if installed. Do not add Three.js, Blender or other dependencies without an actual need. Verify the rendered scene and interactions: a build or script passing is not visual proof.
