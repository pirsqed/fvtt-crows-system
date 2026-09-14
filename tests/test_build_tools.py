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
from common import find_pdf, packet_dir
import common


class BuildTests(unittest.TestCase):
    def test_first_run_prompts_before_checking_missing_default_folder(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            packet = root / "My extracted packet"
            packet.mkdir()
            with patch.object(build_all, "SYSTEM", root), patch.dict(build_all.os.environ, {}, clear=True), \
                 patch("builtins.input", return_value=f'"{packet}"') as prompt, \
                 patch.object(build_all, "check_packet") as check, \
                 patch.object(build_all, "setup_environment", return_value=0) as setup, \
                 contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(build_all.main(["--interactive", "--setup"]), 0)
                prompt.assert_called_once()
                check.assert_called_once_with(packet.resolve())
                self.assertEqual(setup.call_args.args[1], packet.resolve())
                self.assertFalse((root / "pdfs").exists())

    def test_missing_default_without_prompt_reports_actionable_error(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(build_all, "SYSTEM", Path(folder)), patch.dict(build_all.os.environ, {}, clear=True), \
                 contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()) as errors:
                self.assertEqual(build_all.main(["--check"]), 1)
                self.assertIn("Packet folder does not exist", errors.getvalue())

    def test_spellbook_and_shield_flags_are_exported(self):
        from build_packs import to_item
        book = to_item({"name": "Flame", "spell": {"rank": 1, "discipline": "Elemental"}}, {})
        shield = to_item({"name": "Wooden Shield", "armor_ad": 2}, {})
        sword = to_item({"name": "Sword"}, {})
        self.assertTrue(book["system"]["isSpellbook"])
        self.assertTrue(shield["system"]["isShield"])
        self.assertFalse(sword["system"]["isShield"])
        self.assertFalse(sword["system"]["isSpellbook"])

    def test_supply_maximum_is_separate_from_stack_limit(self):
        from build_packs import to_item
        purse = to_item({"name": "Coin Purse"}, {})
        quiver = to_item({"name": "Quiver of 20 Arrows"}, {})
        quiver_direct = to_item({"name": "Quiver of Arrows"}, {})
        bolts_alias = to_item({"name": "Case of 20 Crossbow Bolts"}, {})
        bolts_case = to_item({"name": "Case of Bolts"}, {})
        bolts_direct = to_item({"name": "Case of Crossbow Bolts"}, {})
        sword = to_item({"name": "Sword", "stack": 1}, {})

        self.assertEqual(purse["system"]["maxStack"], 1)
        self.assertEqual(purse["system"]["contentsMax"], 500)
        self.assertEqual(purse["system"]["contentsQuantity"], 0)
        self.assertEqual(quiver["system"]["contentsQuantity"], 20)
        self.assertEqual(quiver["system"]["maxStack"], 1)
        self.assertEqual(quiver["system"]["contentsMax"], 20)
        self.assertEqual(quiver_direct["system"]["maxStack"], 1)
        self.assertEqual(quiver_direct["system"]["contentsMax"], 20)
        self.assertEqual(bolts_alias["system"]["maxStack"], 1)
        self.assertEqual(bolts_alias["system"]["contentsMax"], 20)
        self.assertEqual(bolts_case["system"]["maxStack"], 1)
        self.assertEqual(bolts_case["system"]["contentsMax"], 20)
        self.assertEqual(bolts_direct["system"]["maxStack"], 1)
        self.assertEqual(bolts_direct["system"]["contentsMax"], 20)
        self.assertEqual(sword["system"]["maxStack"], 1)

    def test_default_packet_is_system_pdfs_independent_of_working_directory(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "pdfs").mkdir()
            with patch.object(common, "SYSTEM", root), patch.object(sys, "argv", ["exporter.py"]), \
                 patch.dict(common.os.environ, {}, clear=True):
                self.assertEqual(packet_dir(), (root / "pdfs").resolve())

    def test_packet_dir_discovers_subfolder_when_no_pdfs_in_root(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            pdfs_dir = root / "pdfs"
            pdfs_dir.mkdir()
            # Readme only in root of pdfs/
            (pdfs_dir / "ADD_PDFS_HERE.txt").write_text("readme")
            # Subfolder created by extracting a zip
            sub = pdfs_dir / "Crows Playtest 2"
            sub.mkdir()
            (sub / "01 Characters.pdf").touch()
            (sub / "02 Ref Book.pdf").touch()

            with patch.object(common, "SYSTEM", root), patch.object(sys, "argv", ["exporter.py"]), \
                 patch.dict(common.os.environ, {}, clear=True):
                self.assertEqual(packet_dir(), sub.resolve())

    def test_packet_dir_prefers_root_when_pdfs_exist_directly(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            pdfs_dir = root / "pdfs"
            pdfs_dir.mkdir()
            (pdfs_dir / "01 Characters.pdf").touch()
            # Even if an old subfolder exists
            sub = pdfs_dir / "Old Playtest"
            sub.mkdir()
            (sub / "01 Characters.pdf").touch()

            with patch.object(common, "SYSTEM", root), patch.object(sys, "argv", ["exporter.py"]), \
                 patch.dict(common.os.environ, {}, clear=True):
                self.assertEqual(packet_dir(), pdfs_dir.resolve())

    def test_packet_dir_discovers_nested_subfolder(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            nested = root / "pdfs" / "Crows Playtest" / "Packet"
            nested.mkdir(parents=True)
            (nested / "01 Characters.pdf").touch()

            with patch.object(common, "SYSTEM", root), patch.object(sys, "argv", ["exporter.py"]), \
                 patch.dict(common.os.environ, {}, clear=True):
                self.assertEqual(packet_dir(), nested.resolve())

    def test_pdf_discovery_ignores_macosx_and_hidden_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "Books").mkdir()
            pdf = root / "Books" / "Characters.pdf"
            pdf.touch()
            # Fake macOS dot-underscore and __MACOSX files
            macosx = root / "__MACOSX" / "Books"
            macosx.mkdir(parents=True)
            (macosx / "._Characters.pdf").touch()
            (root / "Books" / "._Characters.pdf").touch()

            self.assertEqual(find_pdf(root, ["characters"]), pdf)

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
            self.assertEqual(len(build_all.validate_outputs(root)), len(build_all.INSTALL))
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
