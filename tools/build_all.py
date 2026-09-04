"""
One-shot build: extract everything from the MCDM Crows playtest packet and
install the generated compendium JSON + art into this system folder.

    python tools/build_all.py --packet "C:/path/to/playtest packet"

Afterwards, in Foundry (as GM) run the macro:  game.crows.importPlaytestItems()

Steps:  extract_cards -> build_packs (equipment, dungeon loot, backgrounds)
        extract_traits (trait trees)   extract_monsters (bestiary + monster art)
        extract_backgrounds (starting kits from the Characters book)
"""
import shutil, subprocess, sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
from common import OUT, PACKS, packet_dir  # noqa: E402

STEPS = ["extract_cards.py", "extract_backgrounds.py", "build_packs.py", "extract_traits.py", "extract_monsters.py"]
INSTALL = {  # tools/out -> packs/
    "equipment.new.json": "equipment.json",
    "dungeon-loot.new.json": "dungeon-loot.json",
    "traits.new.json": "traits.json",
    "monsters.new.json": "monsters.json",
    "backgrounds.json": "backgrounds.json",
}


def main():
    packet = packet_dir()
    print(f"Playtest packet: {packet}")
    OUT.mkdir(parents=True, exist_ok=True)
    PACKS.mkdir(parents=True, exist_ok=True)
    extra = ["--packet", str(packet)]
    for step in STEPS:
        print(f"\n== {step} ==")
        r = subprocess.run([sys.executable, str(TOOLS / step), *extra], cwd=str(TOOLS))
        if r.returncode != 0:
            sys.exit(f"{step} failed (exit {r.returncode})")
    print("\n== install ==")
    for src, dst in INSTALL.items():
        s = OUT / src
        if not s.exists():
            sys.exit(f"missing build output: {s}")
        shutil.copyfile(s, PACKS / dst)
        print(f"  {dst}")
    print("\nDone. In Foundry, as GM, run:  game.crows.importPlaytestItems()")


if __name__ == "__main__":
    main()
