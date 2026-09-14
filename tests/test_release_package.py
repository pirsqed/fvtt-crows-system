from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from build_release import build_release, PDF_NOTE


class ReleaseTests(unittest.TestCase):
    def test_archive_ships_note_and_tools_but_no_local_packet_or_generated_content(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            keep = [PDF_NOTE, "system.json", "build_playtest_content.cmd", "build_playtest_content.sh",
                    "templates/setup-guide.html", "tools/build_all.py", "tools/data/icons.json"]
            exclude = ["pdfs/packet.zip", "pdfs/README-secret.pdf", "pdfs/Packet/Characters.PDF",
                       "pdfs/Packet/Inventory Cards/cards.pdf", "pdfs/README-from-packet.txt",
                       "packs/traits.json", "assets/monsters/crow.webp", "tools/out/build.log",
                       "tools/.venv/bin/python", "tools/__pycache__/common.pyc",
                       ".git/config", ".github/workflows/release.yml", "backup.PDF",
                       "old-release.zip", "RELEASE-TEST-CHECKLIST.md"]
            for name in keep + exclude:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("Example", encoding="utf-8")
            output = root / "fvtt-crows-system.zip"
            for _ in range(2):  # A rebuild must not include its previous ZIP.
                self.assertEqual(set(build_release(root, output)), set(keep))
            with ZipFile(output) as archive:
                self.assertEqual(archive.read(PDF_NOTE), b"Example")

    def test_missing_note_stops_release(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with self.assertRaisesRegex(ValueError, "PDF setup note"):
                build_release(root, root / "release.zip")
            self.assertFalse((root / "release.zip").exists())

    def test_gitignore_allows_only_the_pdf_setup_note(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as folder:
            temporary = Path(folder)
            subprocess.run(["git", "init", "--quiet", folder], check=True)
            (temporary / ".gitignore").write_bytes((root / ".gitignore").read_bytes())
            for name, ignored in [(PDF_NOTE, False), ("pdfs/README-secret.pdf", True),
                                  ("pdfs/packet.zip", True), ("pdfs/Packet/book.pdf", True)]:
                result = subprocess.run(["git", "check-ignore", "--quiet", name], cwd=temporary)
                self.assertEqual(result.returncode, 1 if not ignored else 0, name)


if __name__ == "__main__":
    unittest.main()
