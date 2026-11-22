---
name: speckit-router
description: Reuse existing GitHub Spec Kit specification, planning, task and implementation workflows without duplicating a project's current .specify setup.
---
# Spec Kit — shared readiness router

Source: https://github.com/github/spec-kit (MIT). This adapter complements—not replaces—any real `speckit-*` skills, official CLI or existing `.specify/` installation.

1. Read `AGENTS.md` and `.ai-tools/README.md` (if present) for the project's verified Spec Kit integration and revisions. Look for `.specify/`, `.agents/skills/speckit-*/SKILL.md`, `.claude/commands/` and existing specs, plans and tasks.
2. When corresponding project skills and `.specify/` exist, use the actual `speckit-specify`, `speckit-plan`, `speckit-tasks` and `speckit-implement` workflows in order **only as needed**. Do not substitute this router for their complete commands or run commands unavailable in the current client.
3. If not installed, first use `python3 .ai-tools/setup.py doctor` only where that script exists. Follow the project's documented Spec Kit preparation/review procedure rather than writing an incomplete `.specify/` or claiming installation.
4. Reuse and update existing work instead of duplicating specifications. Respect project conventions, scope and past decisions. For small fixes, follow the existing development workflow without forcing a lengthy spec process.
5. Combine with CodeGraph for dependency context, Superpowers for design/debug/QA and other domain skills where relevant; builds and tests remain required.

No command package, plugin or runtime is installed by this text file alone.
