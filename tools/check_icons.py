"""Audit core icon references against a locally installed Foundry public folder."""
import argparse
import json
from pathlib import Path
import re

SYSTEM = Path(__file__).resolve().parent.parent


def references(root=SYSTEM):
    files = [root / "tools/data/icons.json", root / "crows.mjs",
             *sorted((root / "module").rglob("*.mjs")), *sorted((root / "tools").glob("*.py"))]
    icons = set()
    for file in files:
        if file.name == "icon-repairs.mjs":
            # The keys intentionally name broken icons; validate only their replacements.
            text = file.read_text(encoding="utf-8").split("export const ICON_REPAIRS = ", 1)[1].split(";", 1)[0]
            icons.update(json.loads(text).values())
        else:
            icons.update(re.findall(r"icons/[\w/.-]+\.(?:webp|svg|png)", file.read_text(encoding="utf-8")))
    return icons


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("foundry_public", type=Path, help="Foundry resources/app/public folder containing icons/")
    args = parser.parse_args()
    if not (args.foundry_public / "icons").is_dir():
        parser.error("Choose the Foundry public folder containing icons/.")
    icons = references()
    missing = sorted(icon for icon in icons if not (args.foundry_public / icon).is_file())
    for icon in missing:
        print(f"MISSING: {icon}")
    print(f"Checked {len(icons)} core icons; {len(missing)} missing.")
    return bool(missing)


if __name__ == "__main__":
    raise SystemExit(main())
