import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import build_all
from common import find_pdf


class BuildTests(unittest.TestCase):
    def test_pdf_discovery_handles_subfolders_and_uppercase_extensions(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "Books").mkdir()
            pdf = root / "Books" / "Characters.PDF"
            pdf.touch()
            self.assertEqual(find_pdf(root, ["characters"]), pdf)
            (root / "Characters copy.pdf").touch()
            with self.assertRaisesRegex(SystemExit, "Multiple PDFs"):
                find_pdf(root, ["characters"])

    def test_preflight_reports_all_missing_files(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError) as error:
                build_all.check_packet(Path(folder))
            for label, _, _ in build_all.REQUIRED:
                self.assertIn(label, str(error.exception))

    def test_missing_dependencies_explain_setup(self):
        with patch.object(build_all.importlib.util, "find_spec", return_value=None):
            with self.assertRaisesRegex(ValueError, "--setup"):
                build_all.check_dependencies()

    def test_check_mode_does_not_build(self):
        with patch.object(build_all, "check_packet"), patch.object(build_all, "check_dependencies"), \
             patch.object(build_all, "build") as build, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(build_all.main(["--check", "--packet", "."]), 0)
            build.assert_not_called()

    def test_outputs_must_all_be_valid_before_install(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in build_all.INSTALL:
                (root / name).write_text(json.dumps([{"name": "Entry"}]), encoding="utf-8")
            self.assertEqual(len(build_all.validate_outputs(root)), 5)
            (root / "monsters.new.json").write_text("[]", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "non-empty"):
                build_all.validate_outputs(root)

    def run_fake_build(self, fail=False):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "tools").mkdir()
            (root / "packs").mkdir()
            installed = root / "packs" / "equipment.json"
            installed.write_text("old content", encoding="utf-8")
            calls = []

            class Process:
                def __init__(self, command, **kwargs):
                    calls.append(Path(command[1]).name)
                    stage = Path(kwargs["env"]["CROWS_BUILD_OUT"])
                    for name in build_all.INSTALL:
                        (stage / name).write_text(json.dumps([{"name": "New entry"}]), encoding="utf-8")
                    art = Path(kwargs["env"]["CROWS_BUILD_ASSETS"]) / "monsters"
                    art.mkdir(parents=True, exist_ok=True)
                    (art / "test.webp").write_bytes(b"fake art")
                    self.stdout = io.StringIO("exporter output\n")
                def __enter__(self): return self
                def __exit__(self, *args): pass
                def wait(self): return 1 if fail else 0

            with patch.object(build_all, "SYSTEM", root), patch.object(build_all, "TOOLS", root / "tools"), \
                 patch.object(build_all.subprocess, "Popen", Process), contextlib.redirect_stdout(io.StringIO()):
                if fail:
                    with self.assertRaisesRegex(ValueError, "Installed files were not changed"):
                        build_all.build(root)
                    self.assertEqual(installed.read_text(), "old content")
                    self.assertFalse((root / "assets").exists())
                else:
                    build_all.build(root)
                    self.assertEqual(calls, build_all.STEPS)
                    self.assertEqual(json.loads(installed.read_text())[0]["name"], "New entry")
                    self.assertTrue((root / "assets/monsters/test.webp").exists())
            self.assertIn("exporter output", (root / "tools/out/build.log").read_text())

    def test_all_exporters_run_in_order_and_publish(self): self.run_fake_build()
    def test_failed_export_does_not_publish_json_or_art(self): self.run_fake_build(fail=True)


if __name__ == "__main__":
    unittest.main()
