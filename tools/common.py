"""Shared paths for the Crows playtest extraction tools."""
import os, sys
from pathlib import Path

SYSTEM = Path(__file__).resolve().parent.parent          # fvtt-crows-system/
OUT = SYSTEM / "tools" / "out"                            # intermediate output (git-ignored)
PACKS = SYSTEM / "packs"                                  # generated compendium JSON (git-ignored)
ASSETS = SYSTEM / "assets"                                # generated art (git-ignored)


def packet_dir():
    """Folder holding the MCDM playtest packet (books, Inventory Cards, Monster Illustrations).

    Resolution order: --packet <dir> argument, CROWS_PACKET environment variable,
    then ../playtest2_pdfs next to the system folder.
    """
    if "--packet" in sys.argv:
        p = Path(sys.argv[sys.argv.index("--packet") + 1])
    elif os.environ.get("CROWS_PACKET"):
        p = Path(os.environ["CROWS_PACKET"])
    else:
        p = SYSTEM.parent / "playtest2_pdfs"
    p = p.expanduser().resolve()
    if not p.is_dir():
        sys.exit(f"Playtest packet folder not found: {p}\n"
                 f"Pass --packet <folder> or set CROWS_PACKET to the folder containing the playtest PDFs.")
    return p


def find_pdf(packet, include=(), exclude=()):
    """Find the PDF in the packet whose filename contains every `include` fragment and no `exclude` fragment."""
    for f in sorted(packet.rglob("*.pdf")):
        name = f.name.lower()
        if all(n.lower() in name for n in include) and not any(n.lower() in name for n in exclude):
            return f
    sys.exit(f"Could not find a PDF containing {include} (and not {exclude}) under {packet}")
