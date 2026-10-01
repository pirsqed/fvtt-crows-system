import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location("prepare_release", Path(__file__).resolve().parents[1] / "tools/prepare_release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class PrepareReleaseTests(unittest.TestCase):
    def test_notes_select_exact_version_and_keep_nested_headings(self):
        text = "# Changelog\n\n## Unreleased\nFuture\n## 0.2.3 — prepared\nCurrent\n### Upgrade\nInstructions\n## 0.2.30\nOther\n## 0.2.2\nOld\n"
        self.assertEqual(release.release_notes(text, "0.2.3"), "## 0.2.3\n\nCurrent\n### Upgrade\nInstructions\n")

    def test_missing_empty_and_duplicate_notes_fail(self):
        for text in ("## 0.2.2\nOld", "## 0.2.3\n", "## 0.2.3\nFirst\n## 0.2.3\nSecond"):
            with self.assertRaises(ValueError):
                release.release_notes(text, "0.2.3")

    def test_assets_notes_checksums_and_release_guardrails(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            out = root / "dist"
            out.mkdir()
            manifest = dict(id="example", version="0.2.3", download="https://github.com/owner/repo/releases/download/v0.2.3/example.zip", esmodules=["main.mjs"], readme="README.md", license="LICENSE")
            (root / "CHANGELOG.md").write_text("## 0.2.3 — prepared\nCurrent release\n## 0.2.2\nOld", encoding="utf-8")
            def assets(missing=False):
                data = json.dumps(manifest).encode()
                (out / "system.json").write_bytes(data)
                with ZipFile(out / "example.zip", "w") as archive:
                    archive.writestr("system.json", data)
                    for name in ["README.md", "LICENSE"] + ([] if missing else ["main.mjs"]):
                        archive.writestr(name, "Example")
            assets()
            release.prepare(root, out, "system.json", "owner/repo", "v0.2.3")
            self.assertEqual((out / "RELEASE-NOTES.md").read_text(), "## 0.2.3\n\nCurrent release\n")
            self.assertEqual(len((out / "SHA256SUMS.txt").read_text().splitlines()), 2)
            with self.assertRaisesRegex(ValueError, "Tag"):
                release.prepare(root, out, "system.json", "owner/repo", "v0.2.4")
            with self.assertRaisesRegex(ValueError, "download"):
                release.prepare(root, out, "system.json", "other/repo", "v0.2.3")
            assets(missing=True)
            with self.assertRaisesRegex(ValueError, "Unpackaged"):
                release.prepare(root, out, "system.json", "owner/repo", "v0.2.3")
            assets()
            manifest["description"] = "changed after packaging"
            (out / "system.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "manifests"):
                release.prepare(root, out, "system.json", "owner/repo", "v0.2.3")
            (root / "package.json").write_text('{"version":"0.2.2"}')
            with self.assertRaisesRegex(ValueError, "Package"):
                release.prepare(root, out, "system.json", "owner/repo", "v0.2.3")


if __name__ == "__main__":
    unittest.main()
