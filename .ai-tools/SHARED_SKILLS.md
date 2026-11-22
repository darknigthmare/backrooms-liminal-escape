# Shared AI skills — pinned opt-in integration

This repository keeps its existing skills, prompts, AGENTS.md and build conventions. Additional reusable adapters are exposed for **Codex** (`.agents/skills/`) and **Claude Code** (`.claude/skills/`).

| Skill | Where to start | Canonical upstream | Local availability |
| --- | --- | --- | --- |
| 3Dviz Pro Max | `.agents/skills/3dviz-pro-max/SKILL.md` | [viettranx/3dviz-pro-max](https://github.com/viettranx/3dviz-pro-max) (MIT, `d077e0e68915c25be8e71d74684d3144fd1c2aca`) | Use the existing `.ai-tools/3dviz-pro-max/skill/` install or the pinned Git submodule |
| Game-dev router | `.agents/skills/gamedev-router/SKILL.md` | [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) (Apache-2.0, `19d93f97c9c1ea0f8b306e77aa81e0d3e352d3e9`) | Prefer local project game-dev skills; otherwise pinned Git submodule |
| Spec Kit readiness | `.agents/skills/speckit-router/SKILL.md` | [github/spec-kit](https://github.com/github/spec-kit) (MIT) | Follow the project's existing `.ai-tools/README.md` and real `.specify/` setup |

To fetch the **two full external skill catalogs** after cloning (the remote packages are *not* vendored into this repository's Git history):

```sh
git submodule update --init .ai-tools/upstream/3dviz-pro-max .ai-tools/upstream/awesome-gamedev-agent-skills
```

Check that their `SKILL.md` files exist at the paths described in each adapter before using them. These submodules are pinned to immutable commits, do not run on CI merely by being declared and should not be upgraded silently. If the Git client did not fetch submodules, the adapters remain discoverable but the **full upstream library is not available**. Never claim it was loaded without reading the files.

The project-local packages (Obscura and any game-specific, 3Dviz, Spec Kit, CCGS or CodeGraph tools) are retained. Git submodules and skill descriptions alone do not install MCP servers, IDE plugins or build dependencies. Route tasks according to relevance; non-game projects are not obliged to use game-development guidance.
