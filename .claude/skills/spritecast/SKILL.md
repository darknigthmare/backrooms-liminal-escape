---
name: spritecast
description: Use the upstream SpriteCast Claude Code plugin for game props, camera-consistent isometric or top-down sprites, pixel-art, 8-direction characters, walk/action animations, seating and baked shadows when the full plugin is available.
---

# SpriteCast — shared integration guide

Source: https://github.com/Sunghwan0112/spritecast (MIT, Sunghwan Baek).
Upstream plugin metadata checked on 2026-11-23: `spritecast` v0.26.0.

**This is a skill adapter, not SpriteCast itself.** It does not include the Python scripts, data, models, image generation or plugin hooks. Merely adding this file to a repository does not install SpriteCast or make generation work. The upstream `skills/spritecast/SKILL.md`, its sibling `scripts/` and `reference/` files are the source of truth. Resolve all upstream-relative paths from that real installation, **not** from this adapter.

## Activate only for a relevant art task

1. Read the repository's `AGENTS.md`, `CLAUDE.md`, existing art and game-dev skills, camera, engine, naming rules, licensed references and sprite/atlas conventions. Preserve existing assets and tools (Sand3D, 3dviz-pro-max, CodeGraph, Spec Kit, etc.).
2. In Claude Code, install the official plugin in the developer's environment (do not run installation automatically simply because this adapter is present):

   ```bash
   claude plugin marketplace add Sunghwan0112/spritecast
   claude plugin install spritecast@spritecast
   ```

   After installation, open and follow the full original SpriteCast skill shipped with the plugin. Configure sensitive keys using the plugin's settings (`/plugin`) or environment variables, never Git-tracked files.
3. In another agent or terminal, only when authorized, obtain the full upstream checkout separately and read `skills/spritecast/SKILL.md` there. Run `python <actual-upstream-skill-dir>/scripts/doctor.py` and follow its setup guidance before trying any pipeline. This adapter alone is insufficient; never execute a nonexistent `./scripts/` path or claim the original skill is loaded.
4. If SpriteCast isn't installed, give exact setup steps and continue with the project's available asset workflow without inventing outputs.

## Production workflow

- Identify **source art, visual canon, scale, target camera, sprite resolution, directions, animation list, lighting and asset format** before generating. Match the project's actual side view, top-down or 2.5D projection; do not force an isometric camera on a side-scrolling fighting game.
- For props, follow the upstream spec guide to build and inspect the free 3D guide first, then render, draw, finish and visually review the cut-out, footprint, shadows and anchor.
- For characters, use the original character pipeline and its real scripts: choose 4 or 8 facings, verify a neutral turnaround, inspect the 3D rig and action poses, then draw frames with consistent handedness, equipment and silhouettes. In combat projects, validate pose-to-pose continuity, hitbox/anchor conventions, visual scale and complete actions rather than only the preview sheet.
- For pixel-art/HD output, preserve the game's established palette, resolution, pose counts and alpha/background rules. Check every generated direction and frame against approved visual references: generative output is **not automatically 1:1 canon fidelity**. Keep source provenance and manually review deviations.
- Export only the requested and verified assets (sprite frames, atlases, metadata, shadows) into existing project directories. Never treat a successful command as proof that the assets are correct or already integrated into the game.

## Cost, keys and safety

- The official plugin offers a no-key sample/try workflow. OpenAI image drawing and optional Tripo/Meshy modelling can incur charges; estimate the relevant step and obtain explicit approval **before each paid action or redraw**. Do not preauthorize spending.
- Never log, paste, commit or expose `OPENAI_API_KEY`, `TRIPO_API_KEY` or `MESHY_API_KEY`. Never add API keys, 3D model downloads, local caches or unapproved large binaries to Git.
- Browser/Playwright installation, model downloads and paid API calls require a suitable environment and permission. Do not add production dependencies or CI jobs automatically.
- Respect copyright, original asset licenses and the project's existing documentation and other skills.

The original implementation and its setup, command syntax and compatibility caveats are maintained at https://github.com/Sunghwan0112/spritecast. When versions diverge, read the installed upstream docs instead of guessing commands.
