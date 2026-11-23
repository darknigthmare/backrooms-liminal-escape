# AI skill unification

Adds **optional** developer skills, not application runtime dependencies. No existing skill, build script, engine, CI pipeline or game code is replaced.

- GameDev Agent Skills: upstream https://github.com/gamedev-skills/awesome-gamedev-agent-skills @ `c6ca6c41c839b68319ffc08430b99ab768debc32` (Apache-2.0), pinned at `.ai-tools/gamedev-skills/upstream/`.
- 3Dviz Pro Max: upstream https://github.com/viettranx/3dviz-pro-max @ `d077e0e68915c25be8e71d74684d3144fd1c2aca` (MIT), pinned at `.ai-tools/3dviz-pro-max/upstream/`.
- Spec Kit workflow: optional safe guidance. Invoke existing commands only when the project provides matching prerequisites.
- Obscura, CodeGraph, Sand3D and other project-specific skills are preserved; separate PRs remain independent.

The upstream repositories are Git submodules; initialize them **only on demand** with `git submodule update --init .ai-tools/gamedev-skills/upstream` or `git submodule update --init .ai-tools/3dviz-pro-max/upstream`. The presence of a Gitlink is not evidence of an installed or executed tool. Verify actual outputs for every task.
