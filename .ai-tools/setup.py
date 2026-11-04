#!/usr/bin/env python3
"""Prepare pinned AI tooling outside a repository, then add collision-free files.

Standard library only. Preparation downloads tools; doctor and apply are offline.
Nothing enables hooks, replaces project instructions, or changes existing files.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).absolute().parent.parent
REPOSITORIES = {
    "spec_kit": "https://github.com/github/spec-kit",
    "claude_game_studios": "https://github.com/Donchitos/Claude-Code-Game-Studios",
}
STUDIO_DIRS = (".claude/agents/", ".claude/skills/", ".claude/docs/",
               ".claude/scripts/", ".claude/hooks/", "docs/engine-reference/", "studio-tests/")
STUDIO_FILES = ("docs/COLLABORATIVE-DESIGN-PRINCIPLE.md", "docs/WORKFLOW-GUIDE.md",
                "docs/skill-flow-diagrams.md", "docs/migration-guide-v1.1.md")
LICENSE = ".ai-tools/licenses/CCGS-MIT.txt"
SPEC_LICENSE = ".ai-tools/licenses/SPEC-KIT-MIT.txt"
# Exact upstream LICENSE at Spec Kit 34a0d388eac671d656eb05b125ad3ed6056168ed.
SPEC_LICENSE_TEXT = '''MIT License

Copyright GitHub, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
'''


def checked(path):
    """Reject symlinks in the complete path, including existing parent dirs."""
    path = Path(os.path.abspath(path))
    for item in (*reversed(path.parents), path):
        if item.is_symlink():
            raise ValueError(f"Symlink not allowed: {item}")
    return path


def relative(name):
    if (not isinstance(name, str) or not name or "\\" in name or ":" in name
            or any(ord(c) < 32 for c in name)):
        raise ValueError(f"Invalid relative path: {name!r}")
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts or path.as_posix() != name:
        raise ValueError(f"Path traversal or noncanonical path: {name!r}")
    return path


def allowed(tool, name):
    relative(name)
    if tool == "spec_kit":
        parts = PurePosixPath(name).parts
        return (name == SPEC_LICENSE or name.startswith(".specify/") or
                (len(parts) >= 4 and parts[0] in (".agents", ".claude")
                 and parts[1] == "skills" and parts[2].startswith("speckit-")))
    return tool == "claude_game_studios" and (name == LICENSE or name in STUDIO_FILES or name.startswith(STUDIO_DIRS))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source(root, tool):
    manifest = checked(root / ".ai-tools/sources.json")
    entry = json.loads(manifest.read_text(encoding="utf-8"))["tools"][tool]
    repository, commit = entry["repository"].rstrip("/"), entry["commit"]
    if repository != REPOSITORIES[tool] or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError(f"Invalid source pin for {tool}")
    return {"tool": tool, "repository": repository, "commit": commit}


def files_in(directory):
    directory = checked(directory)
    if not directory.is_dir():
        raise ValueError(f"Missing directory: {directory}")
    result = {}
    for base, dirs, names in os.walk(directory, followlinks=False):
        for name in sorted(dirs + names):
            path = checked(Path(base) / name)
            if path.is_dir():
                continue
            if not stat.S_ISREG(path.stat().st_mode):
                raise ValueError(f"Not a regular file: {path}")
            result[path.relative_to(directory).as_posix()] = path
    return result


def stage_path(root, stage, new=False):
    root, stage = checked(root), checked(stage)
    if stage == root or root in stage.parents:
        raise ValueError("Preparation directory must be outside the repository")
    if new and stage.exists():
        raise ValueError(f"Preparation directory already exists: {stage}")
    return stage


def write_stage(stage, metadata, contents):
    records = []
    for name, (data, mode) in sorted(contents.items()):
        if not allowed(metadata["tool"], name):
            raise ValueError(f"Disallowed prepared file: {name}")
        records.append({"path": name, "sha256": digest(data), "mode": mode})
    if not records:
        raise ValueError("Preparation produced no files")
    stage.mkdir(parents=True, exist_ok=False)
    try:
        for record in records:
            dest = stage / "files" / record["path"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(contents[record["path"]][0])
            dest.chmod(record["mode"])
        (stage / "stage.json").write_text(json.dumps(
            {"schema": 1, **metadata, "files": records}, indent=2) + "\n", encoding="utf-8")
    except Exception:
        shutil.rmtree(stage)
        raise
    return {"prepared": str(stage), "files": len(records), "project_changed": False}


def run(command, cwd):
    return subprocess.run(command, cwd=cwd, check=True, stdin=subprocess.DEVNULL,
                          stdout=subprocess.PIPE, timeout=600).stdout


def prepare_spec(root, stage):
    if sys.version_info < (3, 11):
        raise ValueError("Spec Kit requires Python 3.11 or newer")
    if checked(root / ".specify").exists():
        raise ValueError("Existing .specify preserved. Run `specify integration status --json`; "
                         "manage missing integrations with `specify integration install <key>`.")
    stage = stage_path(root, stage, new=True)
    metadata = source(root, "spec_kit")
    if not shutil.which("uvx"):
        raise ValueError("Install uv (which provides uvx), then retry preparation")
    command = ["uvx", "--from", f"git+{metadata['repository']}.git@{metadata['commit']}", "specify"]
    with tempfile.TemporaryDirectory(prefix="ai-tools-spec-") as work:
        project = Path(work) / "project"
        # v1.3.0 has no --no-git flag; git is an uninstalled optional extension.
        run(command + ["init", str(project), "--integration", "codex", "--script", "py",
                       "--non-interactive", "--ignore-agent-tools",
                       "--integration-options=--events false"], Path(work))
        run(command + ["integration", "install", "claude", "--script", "py",
                       "--integration-options=--events false"], project)
        contents = {}
        for name, path in files_in(project).items():
            if not allowed("spec_kit", name):
                raise ValueError(f"Unexpected Spec Kit output; review manually: {name}")
            contents[name] = (path.read_bytes(), 0o755 if path.stat().st_mode & 0o111 else 0o644)
        contents[SPEC_LICENSE] = (SPEC_LICENSE_TEXT.encode("utf-8"), 0o644)
        return write_stage(stage, metadata, contents)


def studio_contents(archive):
    contents = {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as tar:
        for member in tar.getmembers():
            name = member.name.rstrip("/")
            relative(name)
            if member.isdir():
                continue
            dest = LICENSE if name == "LICENSE" else name
            if not allowed("claude_game_studios", dest):
                continue
            if not member.isfile():
                raise ValueError(f"Archive link or special file not allowed: {name}")
            if dest in contents:
                raise ValueError(f"Duplicate archive path: {name}")
            contents[dest] = (tar.extractfile(member).read(), 0o755 if member.mode & 0o111 else 0o644)
    if LICENSE not in contents or ".claude/skills/adopt/SKILL.md" not in contents:
        raise ValueError("Upstream archive lacks the license or adopt skill")
    return contents


def prepare_studio(root, stage):
    stage = stage_path(root, stage, new=True)
    metadata = source(root, "claude_game_studios")
    if not shutil.which("git"):
        raise ValueError("Install Git, then retry preparation")
    with tempfile.TemporaryDirectory(prefix="ai-tools-studio-") as work:
        work = Path(work)
        hooks = work / "empty-hooks"
        hooks.mkdir()
        git = ["git", "-c", f"core.hooksPath={hooks}", "-c", "maintenance.auto=false"]
        run(git + ["init", "--quiet", "source"], work)
        checkout = work / "source"
        run(git + ["remote", "add", "origin", metadata["repository"] + ".git"], checkout)
        run(git + ["fetch", "--quiet", "--depth=1", "origin", metadata["commit"]], checkout)
        actual = run(git + ["rev-parse", "FETCH_HEAD"], checkout).decode().strip()
        if actual != metadata["commit"]:
            raise ValueError("Fetched commit does not match sources.json")
        # git archive reads tracked files without checking out or running upstream hooks.
        contents = studio_contents(run(git + ["archive", "--format=tar", actual], checkout))
        return write_stage(stage, metadata, contents)


def apply_stage(root, stage):
    root, stage = checked(root), stage_path(root, stage)
    metadata = json.loads(checked(stage / "stage.json").read_text(encoding="utf-8"))
    if metadata.get("schema") != 1 or metadata.get("tool") not in REPOSITORIES:
        raise ValueError("Unsupported stage manifest")
    expected = source(root, metadata["tool"])
    if any(metadata.get(key) != value for key, value in expected.items()):
        raise ValueError("Stage source does not match this repository's sources.json")
    staged = files_in(stage / "files")
    pending, seen = [], set()
    for record in metadata["files"]:
        name = record["path"]
        if not allowed(metadata["tool"], name) or name in seen or name not in staged:
            raise ValueError(f"Invalid or duplicate staged path: {name}")
        seen.add(name)
        data, mode = staged[name].read_bytes(), record["mode"]
        if digest(data) != record["sha256"] or mode not in (0o644, 0o755):
            raise ValueError(f"Invalid file hash or mode: {name}")
        target = checked(root / name)
        for parent in target.parents:
            if parent == root:
                break
            if parent.exists() and not parent.is_dir():
                raise ValueError(f"Parent path is not a directory: {parent}")
        if target.exists():
            if not target.is_file() or target.read_bytes() != data:
                raise ValueError(f"Collision; no files applied: {name}")
        else:
            pending.append((target, data, mode))
    if not seen or seen != set(staged):
        raise ValueError("Manifest must describe every staged file exactly once")
    created_files, created_dirs = [], []
    try:
        for target, data, mode in pending:
            checked(target)
            for parent in reversed(target.parents):
                if parent != root and root in parent.parents and not parent.exists():
                    parent.mkdir()
                    created_dirs.append(parent)
            checked(target)
            with target.open("xb") as stream:
                created_files.append(target)
                stream.write(data)
            target.chmod(mode)
    except Exception:
        for target in reversed(created_files):
            target.unlink(missing_ok=True)
        for directory in reversed(created_dirs):
            try:
                directory.rmdir()
            except OSError:
                pass
        raise
    return {"added": len(pending), "identical_preserved": len(seen) - len(pending),
            "hooks_enabled": False, "runtime_verified": False}


def doctor(root):
    """Report evidence of local files, never label presence as verified installation."""
    def present(name):
        try:
            return checked(root / name).is_file()
        except ValueError:
            return False
    return {
        "repository": str(root), "read_only": True, "runtime_verified": False,
        "executables_found": {name: shutil.which(name) is not None for name in ("git", "uvx", "codex", "claude")},
        "spec_kit": {"integration_state_present": present(".specify/integration.json"),
                     "codex_entry_present": present(".agents/skills/speckit-specify/SKILL.md"),
                     "claude_entry_present": present(".claude/skills/speckit-specify/SKILL.md")},
        "claude_game_studios": {"adopt_entry_present": present(".claude/skills/adopt/SKILL.md"),
                                "config_present": present("project.yaml")},
        "superpowers": {"repository_skill_entry_present": present(".agents/skills/superpowers/using-superpowers/SKILL.md"),
                        "note": "Global agent plugins and symlinked user skills are not verified here."},
        "note": "File presence does not verify completeness or agent discovery. Preparation/apply are explicit steps.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="command", required=True)
    subs.add_parser("doctor", help="Read-only local availability report; no downloads")
    for name in ("spec-kit", "claude-studio"):
        subs.add_parser(name, help="Prepare pinned files outside this repository").add_argument("--prepare", required=True, type=Path)
    subs.add_parser("apply", help="Add reviewed files only after complete collision preflight").add_argument("--from", dest="stage", required=True, type=Path)
    args = parser.parse_args()
    try:
        root = checked(ROOT)
        if args.command == "doctor":
            result = doctor(root)
        elif args.command == "apply":
            result = apply_stage(root, args.stage)
        else:
            result = (prepare_spec if args.command == "spec-kit" else prepare_studio)(root, args.prepare)
        print(json.dumps(result, indent=2))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print(f"AI tooling: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
