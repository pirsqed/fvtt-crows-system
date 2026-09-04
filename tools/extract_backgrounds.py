"""
Extract the 36 backgrounds (starting characteristic, Stamina, trait,
expertises, equipment, pets, extra gold) from the Crows Characters book.

Layout: two text columns per page; each background is a display-font heading,
an italic blurb, then bold "Label:" lines with wrapped continuation lines.

Output: tools/out/backgrounds_raw.json
"""
import fitz, json, re
from pathlib import Path
from common import packet_dir, find_pdf, OUT

BOOK = find_pdf(packet_dir(), include=["characters"])
LABELS = ("Characteristic at 2", "Stamina", "Trait", "Expertises", "Equipment")
TREE_FIX = {"Smithing": "Blacksmithing"}
EXPERTISE_FIX = {"Blacksmith": "Blacksmithing"}
TRAIT_FIX = {"Sieze the Advantage": "Seize the Advantage"}
# equipment phrases -> inventory-card names
ITEM_ALIASES = {
    "extra knife": "Knife", "knife": "Knife", "gluepot": "Glue Pot", "glue pot": "Glue Pot",
    "quill and ink pot": "Quill & Inkpot", "quill and inkpot": "Quill & Inkpot",
    "quiver of arrows": "Quiver of Arrows", "case of bolts": "Case of Crossbow Bolts",
    "alchemist's tools": "Alchemist's Tools", "blacksmith's tools": "Blacksmith's Tools",
    "cook's utensils": "Cook's Utensils", "merchant's scales": "Merchant's Scales",
    "11-foot pole": "11-Foot Pole", "lore book": "Lore Book", "musical instrument": "Musical Instrument",
}
PET_ALIASES = {"riding horse": "Horse, Riding", "draft horse": "Horse, Draft", "war horse": "Horse, War",
               "goat": "Goat", "dog": "Dog", "mule": "Mule", "donkey": "Donkey"}
COMMON_KIT = [{"name": "Coin Purse", "quantity": 1}, {"name": "Knife", "quantity": 1},
              {"name": "Rope", "quantity": 1}, {"name": "Ration", "quantity": 6}]
STARTING_GOLD = "3d6"


def norm(s):
    return re.sub(r"\s+", " ", s.replace("’", "'").replace("‘", "'").replace("–", "-")).strip()


def segment_spells(phrase, ranks):
    """Split 'jaunt, animal form, repair take, shape' into known spell names (the book has a stray comma)."""
    words = [w for w in re.split(r"[,\s]+", phrase.lower().rstrip(".")) if w]
    out, i = [], 0
    while i < len(words):
        hit = None
        for n in (3, 2, 1):
            cand = " ".join(words[i:i + n])
            if cand in ranks:
                hit = cand
                i += n
                break
        if hit is None:
            hit = words[i]
            i += 1
        out.append(hit)
    return out


def title_case(s):
    words = s.split(" ")
    small = {"of", "the", "and", "&"}
    out = []
    for i, w in enumerate(words):
        if i and w.lower() in small:
            out.append(w.lower())
        else:
            out.append(w[:1].upper() + w[1:])
    return " ".join(out)


def spell_ranks():
    """spell name -> rank, from the card extraction if it has run (else everything is rank 0)."""
    p = OUT / "cards_raw.json"
    ranks = {}
    if p.exists():
        for c in json.loads(p.read_text(encoding="utf-8")):
            if c.get("spell") and c["name"].endswith(" Book"):
                ranks[c["name"][:-5].lower()] = c["spell"].get("rank") or 0
    return ranks


def page_lines(page):
    lines = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            spans = [s for s in l["spans"] if s["text"].strip()]
            if not spans:
                continue
            s0 = spans[0]
            bb = l["bbox"]
            lines.append({"x": bb[0], "y": bb[1], "text": norm("".join(s["text"] for s in spans)),
                          "size": s0["size"], "bold": bool(s0["flags"] & 16), "italic": bool(s0["flags"] & 2)})
    left = sorted([l for l in lines if l["x"] < 200 and l["size"] >= 8.5], key=lambda l: l["y"])
    right = sorted([l for l in lines if l["x"] >= 200 and l["size"] >= 8.5], key=lambda l: l["y"])
    return left + right


def parse_expertises(text):
    out = []
    for part in re.split(r",\s*", text):
        part = norm(part)
        if not part:
            continue
        m = re.match(r"^(.*?)\s*\((\d+) uses?\)$", part)
        name, uses = (m.group(1), int(m.group(2))) if m else (part, 1)
        name = EXPERTISE_FIX.get(name, name)
        out.append({"name": name, "uses": uses})
    return out


def parse_equipment(text, ranks):
    equipment, pets, extra_gold = [], [], 0
    books = ""
    if "spellbooks:" in text:
        text, books = text.split("spellbooks:", 1)
    for part in re.split(r",\s*", norm(text)):
        part = norm(part).rstrip(".")
        if not part:
            continue
        m = re.match(r"^(\d+)\s*(?:extra\s+)?gold coins?$", part)
        if m:
            extra_gold += int(m.group(1))
            continue
        m = re.match(r"^(.*?)\s*\((.*?)\)$", part)
        base, paren = (m.group(1), m.group(2)) if m else (part, "")
        low = base.lower()
        if paren.lower() == "pet":
            pets.append(PET_ALIASES.get(low, title_case(base)))
            continue
        qty = int(paren) if paren.isdigit() else 1
        name = ITEM_ALIASES.get(low, title_case(base))
        entry = {"name": name, "quantity": qty}
        if paren and not paren.isdigit():
            entry["note"] = paren
        # "lore book (Monster Lore), lore book (Nature Lore)" -> merge
        prev = next((e for e in equipment if e["name"] == name and "note" in e and "note" in entry), None)
        if prev:
            prev["quantity"] += qty
            prev["note"] += ", " + entry["note"]
        else:
            equipment.append(entry)
    spells = segment_spells(norm(books), ranks) if ranks else [norm(s).lower() for s in re.split(r",\s*", norm(books)) if norm(s)]
    for spell in spells:
        equipment.append({"name": f"{title_case(spell)} Book R{ranks.get(spell, 0)}", "quantity": 1})
    return equipment, pets, extra_gold


def main():
    doc = fitz.open(str(BOOK))
    ranks = spell_ranks()
    rolls = {}
    for page in doc:
        for m in re.finditer(r"^\s*(\d)\s+(\d)\s+([A-Z][A-Za-z' ]+?)\s*$", page.get_text(), re.M):
            rolls[m.group(3).strip()] = f"{m.group(1)}-{m.group(2)}"
        if rolls:
            break
    backgrounds = []
    cur = None
    for page in doc:
        if "Characteristic at 2:" not in page.get_text():
            continue
        for l in page_lines(page):
            if l["bold"] and l["size"] >= 11.5:
                cur = {"name": l["text"], "blurb": "", "fields": {}, "_label": None}
                backgrounds.append(cur)
                continue
            if cur is None:
                continue
            m = re.match(r"^(" + "|".join(LABELS) + r"):\s*(.*)$", l["text"])
            if m and l["bold"]:
                cur["_label"] = m.group(1)
                cur["fields"][m.group(1)] = m.group(2)
            elif cur["_label"] is None:
                cur["blurb"] = norm(cur["blurb"] + " " + l["text"])
            else:
                cur["fields"][cur["_label"]] = norm(cur["fields"][cur["_label"]] + " " + l["text"])
    out = []
    for b in backgrounds:
        f = b["fields"]
        if "Stamina" not in f:
            continue
        tree, _, tname = f.get("Trait", "").partition(": ")
        equipment, pets, gold = parse_equipment(f.get("Equipment", ""), ranks)
        out.append({
            "name": b["name"], "roll": rolls.get(b["name"], ""), "blurb": b["blurb"],
            "characteristicAt2": [c.strip() for c in re.split(r"\s+or\s+", f.get("Characteristic at 2", ""))],
            "stamina": int(re.search(r"\d+", f["Stamina"]).group(0)),
            "trait": {"tree": TREE_FIX.get(tree, tree), "name": TRAIT_FIX.get(tname, tname)},
            "expertises": parse_expertises(f.get("Expertises", "")),
            "equipment": equipment, "pets": pets, "extraGold": gold,
        })
    data = {"_source": str(BOOK.name), "_common": {"equipment": COMMON_KIT, "startingGold": STARTING_GOLD, "speed": 5},
            "backgrounds": out}
    OUT.mkdir(exist_ok=True)
    (OUT / "backgrounds_raw.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{len(out)} backgrounds -> {OUT / 'backgrounds_raw.json'}")
    missing_roll = [b["name"] for b in out if not b["roll"]]
    if missing_roll:
        print("no table roll found for:", missing_roll)


if __name__ == "__main__":
    main()
