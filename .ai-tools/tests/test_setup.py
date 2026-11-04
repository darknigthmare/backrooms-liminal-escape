"""Safety and behavior tests for the repository-local optional setup helper."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import tarfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).parents[1] / "setup.py"
spec = importlib.util.spec_from_file_location("ai_tool_setup", SCRIPT)
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
SPEC_SHA = "34a0d388eac671d656eb05b125ad3ed6056168ed"
STUDIO_SHA = "05ad7c8a5b8aa2aa86bbd3439ae7cf7295cac418"


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "repo"
        (self.root / ".ai-tools").mkdir(parents=True)
        (self.root / ".ai-tools/sources.json").write_text(json.dumps({"tools": {
            key: {"repository": url, "commit": SPEC_SHA if key == "spec_kit" else STUDIO_SHA}
            for key, url in setup.REPOSITORIES.items()}}))

    def stage(self, contents, tool="claude_game_studios"):
        stage = self.base / "stage"
        setup.write_stage(stage, setup.source(self.root, tool), {name: (data, 0o644) for name, data in contents.items()})
        return stage

    def snapshot(self):
        return {p.relative_to(self.root).as_posix(): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}

    def test_collision_preflight_is_atomic(self):
        existing = self.root / ".claude/skills/z-existing/SKILL.md"
        existing.parent.mkdir(parents=True)
        existing.write_text("custom content")
        stage = self.stage({".claude/skills/a-new/SKILL.md": b"new", ".claude/skills/z-existing/SKILL.md": b"different"})
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "Collision"):
            setup.apply_stage(self.root, stage)
        self.assertEqual(before, self.snapshot())
        self.assertFalse((self.root / ".claude/skills/a-new").exists())

    def test_identical_existing_file_is_preserved(self):
        existing = self.root / ".claude/skills/adopt/SKILL.md"
        existing.parent.mkdir(parents=True)
        existing.write_bytes(b"same")
        stamp = existing.stat().st_mtime_ns
        stage = self.stage({".claude/skills/adopt/SKILL.md": b"same", ".claude/docs/helper.md": b"new"})
        result = setup.apply_stage(self.root, stage)
        self.assertEqual(result["identical_preserved"], 1)
        self.assertEqual(result["added"], 1)
        self.assertEqual(existing.stat().st_mtime_ns, stamp)
        self.assertEqual(setup.apply_stage(self.root, stage)["added"], 0)

    def test_disallowed_settings_and_traversal_are_rejected(self):
        bad = ("../outside", "/absolute", ".claude/skills/../../settings.json", ".claude\\settings.json",
               ".claude/settings.json", ".github/workflows/install.yml", "CLAUDE.md", ".claude/rules/rules.md",
               "project.yaml", ".claude/project.yaml", ".codex" + "/config.toml", ".claude/./skills/a/SKILL.md")
        for name in bad:
            with self.subTest(name=name), self.assertRaises(ValueError):
                setup.write_stage(self.base / "bad-stage", setup.source(self.root, "claude_game_studios"), {name: (b"bad", 0o644)})
        self.assertFalse((self.base / "bad-stage").exists())

    def test_tampered_hash_aborts_before_writes(self):
        stage = self.stage({".claude/skills/adopt/SKILL.md": b"safe"})
        (stage / "files/.claude/skills/adopt/SKILL.md").write_bytes(b"tampered")
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "hash"):
            setup.apply_stage(self.root, stage)
        self.assertEqual(before, self.snapshot())

    def test_unlisted_file_and_manifest_escape_are_rejected(self):
        stage = self.stage({".claude/skills/adopt/SKILL.md": b"safe"})
        (stage / "files/.claude/settings.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "every staged file"):
            setup.apply_stage(self.root, stage)
        (stage / "files/.claude/settings.json").unlink()
        manifest = json.loads((stage / "stage.json").read_text())
        manifest["files"][0]["path"] = "../outside"
        (stage / "stage.json").write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "traversal"):
            setup.apply_stage(self.root, stage)

    def test_symlink_source_and_target_are_rejected(self):
        stage = self.stage({".claude/skills/adopt/SKILL.md": b"safe"})
        outside = self.base / "outside"
        outside.mkdir()
        try:
            (self.root / ".claude").symlink_to(outside, target_is_directory=True)
        except OSError:
            self.skipTest("Creating symlinks is not permitted on this system")
        with self.assertRaisesRegex(ValueError, "Symlink"):
            setup.apply_stage(self.root, stage)
        self.assertEqual(list(outside.iterdir()), [])
        (self.root / ".claude").unlink()
        source = stage / "files/.claude/skills/adopt/SKILL.md"
        source.unlink()
        source.symlink_to(outside / "missing")
        with self.assertRaisesRegex(ValueError, "Symlink"):
            setup.apply_stage(self.root, stage)

    def test_existing_spec_project_refuses_preparation(self):
        (self.root / ".specify").mkdir()
        before = self.snapshot()
        with patch.object(setup, "run") as run, self.assertRaisesRegex(ValueError, "Existing .specify"):
            setup.prepare_spec(self.root, self.base / "new-stage")
        run.assert_not_called()
        self.assertEqual(before, self.snapshot())

    def test_doctor_is_read_only_and_does_not_claim_installation(self):
        before = self.snapshot()
        with patch.object(setup, "run") as run:
            report = setup.doctor(self.root)
        run.assert_not_called()
        self.assertEqual(before, self.snapshot())
        self.assertFalse(report["runtime_verified"])
        self.assertFalse(report["spec_kit"]["codex_entry_present"])
        self.assertNotIn("installed", report)

    def test_doctor_uses_root_studio_project_configuration(self):
        (self.root / "project.yaml").write_text("studio:\n  mode: minimal\n")
        self.assertTrue(setup.doctor(self.root)["claude_game_studios"]["config_present"])

    def test_preparation_must_be_outside_repository(self):
        with self.assertRaisesRegex(ValueError, "outside"):
            setup.stage_path(self.root, self.root / "stage", new=True)

    def test_spec_preparation_is_pinned_without_live_root_init(self):
        commands = []
        def fake_run(command, cwd):
            commands.append((command, cwd))
            if "init" in command:
                project = Path(command[command.index("init") + 1])
                (project / ".specify").mkdir(parents=True)
                (project / ".specify/integration.json").write_text("{}")
                target = project / ".agents/skills/speckit-specify/SKILL.md"
            else:
                target = cwd / ".claude/skills/speckit-specify/SKILL.md"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("skill")
            return b""
        before = self.snapshot()
        with patch.object(setup, "run", side_effect=fake_run), patch.object(setup.shutil, "which", return_value="uvx"):
            result = setup.prepare_spec(self.root, self.base / "new-stage")
        self.assertEqual(before, self.snapshot())
        self.assertFalse(result["project_changed"])
        self.assertEqual((self.base / "new-stage/files" / setup.SPEC_LICENSE).read_text(), setup.SPEC_LICENSE_TEXT)
        for command, cwd in commands:
            self.assertIn("git+https://github.com/github/spec-kit.git@" + SPEC_SHA, command)
            self.assertIn("--integration-options=--events false", command)
            self.assertNotEqual(cwd, self.root)
            self.assertNotIn("--force", command)
            self.assertNotIn("--no-git", command)

    def test_studio_archive_excludes_activation_and_preserves_support_files(self):
        archive = io.BytesIO()
        names = ["LICENSE", ".claude/skills/adopt/SKILL.md", ".claude/hooks/yaml-helper.sh",
                 ".claude/scripts/resolve-config.sh", "docs/engine-reference/index.md", ".claude/settings.json",
                 ".claude/project.yaml", ".claude/rules/testing.md", "CLAUDE.md", ".github/workflows/ci.yml"]
        support = [*setup.STUDIO_FILES, "studio-tests/fixtures/minimal/project.yaml"]
        with tarfile.open(fileobj=archive, mode="w") as tar:
            for name in names + support:
                record = tarfile.TarInfo(name)
                record.size = 4
                tar.addfile(record, io.BytesIO(b"test"))
        contents = setup.studio_contents(archive.getvalue())
        self.assertEqual(set(contents), {setup.LICENSE, *names[1:5], *support})

    def test_archive_link_is_rejected(self):
        archive = io.BytesIO()
        with tarfile.open(fileobj=archive, mode="w") as tar:
            record = tarfile.TarInfo(".claude/skills/escape")
            record.type = tarfile.SYMTYPE
            record.linkname = "../../outside"
            tar.addfile(record)
        with self.assertRaisesRegex(ValueError, "link"):
            setup.studio_contents(archive.getvalue())


if __name__ == "__main__":
    unittest.main()
