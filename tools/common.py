"""Shared paths for the Crows playtest extraction tools."""
import os, sys
from pathlib import Path

SYSTEM = Path(__file__).resolve().parent.parent          # fvtt-crows-system/
OUT = Path(os.environ.get("CROWS_BUILD_OUT", SYSTEM / "tools" / "out"))
PACKS = SYSTEM / "packs"                                  # generated compendium JSON (git-ignored)
ASSETS = Path(os.environ.get("CROWS_BUILD_ASSETS", SYSTEM / "assets"))


def packet_dir():
    """Folder holding the MCDM playtest packet (books, Inventory Cards, Monster Illustrations).

    Resolution order: --packet <dir> argument, CROWS_PACKET environment variable,
    then pdfs/ inside the system folder.
    """
    if "--packet" in sys.argv:
        index = sys.argv.index("--packet") + 1
        if index >= len(sys.argv) or sys.argv[index].startswith("--"):
            sys.exit('--packet needs a folder path, e.g. --packet "C:/Crows Playtest"')
        p = Path(sys.argv[index])
    elif os.environ.get("CROWS_PACKET"):
        p = Path(os.environ["CROWS_PACKET"])
    else:
        p = SYSTEM / "pdfs"
    p = p.expanduser().resolve()
    if not p.is_dir():
        sys.exit(f"Playtest packet folder not found: {p}\n"
                 f"Pass --packet <folder> or set CROWS_PACKET to the folder containing the playtest PDFs.")
    return p


def find_pdf(packet, include=(), exclude=()):
    """Find the PDF in the packet whose filename contains every `include` fragment and no `exclude` fragment."""
    matches = []
    for f in sorted(packet.rglob("*")):
        if not f.is_file() or f.suffix.lower() != ".pdf":
            continue
        name = f.name.lower()
        if all(n.lower() in name for n in include) and not any(n.lower() in name for n in exclude):
            matches.append(f)
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        sys.exit(f"Multiple PDFs match {include}. Use a folder with one copy of each book:\n"
                 + "\n".join(str(path) for path in matches))
    sys.exit(f"Could not find a PDF containing {include} (and not {exclude}) under {packet}")
