"""Package the system while keeping locally generated game content out of releases."""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

SYSTEM = Path(__file__).resolve().parent.parent
PDF_NOTE = "pdfs/ADD_PDFS_HERE.txt"


def include_in_release(path):
    """Paths are relative to the system root, with POSIX separators."""
    parts = Path(path).parts
    if any(part in {".git", ".github", "__pycache__"} for part in parts):
        return False
    if path.startswith("pdfs/"):
        return path == PDF_NOTE
    if path.startswith(("tools/out/", "tools/.venv/", "assets/monsters/")):
        return False
    if path.startswith("packs/") and path.lower().endswith(".json"):
        return False
    if path.lower().endswith((".pdf", ".zip", ".pyc")):
        return False
    return not path.endswith("RELEASE-TEST-CHECKLIST.md")


def build_release(root, output):
    root, output = Path(root).resolve(), Path(output).resolve()
    note = root / PDF_NOTE
    if not note.is_file() or not note.read_text(encoding="utf-8").strip():
        raise ValueError(f"Release requires the PDF setup note: {PDF_NOTE}")
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for source in sorted(root.rglob("*")):
            if not source.is_file() or source.resolve() == output:
                continue
            relative = source.relative_to(root).as_posix()
            if include_in_release(relative):
                archive.write(source, relative)
    with ZipFile(output) as archive:
        names = archive.namelist()
        assert PDF_NOTE in names, "PDF setup note missing from archive"
        assert all(include_in_release(name) for name in names), "Excluded content in archive"
    return names


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=SYSTEM / "fvtt-crows-system.zip")
    args = parser.parse_args()
    files = build_release(SYSTEM, args.output)
    print(f"Built {args.output}: {len(files)} files, including {PDF_NOTE}; no PDFs or generated packs.")
