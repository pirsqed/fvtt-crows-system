"""
Extract every stat block from the Crows Ref Book (animals, humans, monsters,
uniques) into Foundry Actor documents for the system's `monster` type.

Each block is a filled grey box. Inside: name, three columns of bold
"Label: value" stats, an Attack table, then features (bold title + text).

Output: tools/out/monsters.new.json   (Actor documents with embedded items)
        fvtt-crows-system/assets/monsters/*.webp (downscaled MCDM illustrations)
"""
import fitz, json, re, collections
from pathlib import Path
from common import packet_dir, find_pdf, OUT, ASSETS as ASSET_ROOT

PACKET = packet_dir()
BOOK = find_pdf(PACKET, include=["ref book"])
ART = PACKET  # monster illustrations are found anywhere under the packet by filename
ASSETS = ASSET_ROOT / "monsters"
FOUNDRY_ICONS = Path("C:/Program Files/Foundry Virtual Tabletop/resources/app/public/icons")

STAT_LABELS = ["Size", "Power", "Type", "Stamina", "Speed", "Slots", "Reactions",
               "Agility", "Mind", "Strength", "AD", "Expertises", "Equipment"]
TOKEN_SIZE = {"Tiny": 1, "Small": 1, "Medium": 1, "Large": 1, "Huge": 2, "Holy Shit": 3, "Holy Shit!": 3}
NAME_FIX = {}  # applied after "Undead Creature X" -> "Undead X"
ANIMAL_ICON = {
    "Ape": "icons/creatures/magical/humanoid-giant-forest-blue.webp",
    "Bear": "icons/creatures/abilities/bear-roar-bite-brown.webp",
    "Bear, Cave": "icons/creatures/abilities/bear-roar-bite-brown-green.webp",
    "Camel": "icons/creatures/mammals/ox-buffalo-horned-green.webp",
    "Cat": "icons/creatures/mammals/cat-hunched-glowing-red.webp",
    "Cat, Big": "icons/creatures/mammals/cat-hunched-glowing-red.webp",
    "Wildcat": "icons/creatures/mammals/cat-hunched-glowing-red.webp",
    "Chicken": "icons/creatures/birds/chicken-hen-white.webp",
    "Crocodile": "icons/creatures/reptiles/lizard-mouth-glowing-red.webp",
    "Crow": "icons/creatures/birds/birds-flock-fly-yellow.webp",
    "Crow, Giant": "icons/creatures/birds/birds-flock-fly-yellow.webp",
    "Deer": "icons/creatures/mammals/deer-antlers-green.webp",
    "Dog": "icons/creatures/mammals/dog-husky-white-blue.webp",
    "Donkey": "icons/creatures/mammals/goat-horned-blue.webp",
    "Elephant": "icons/creatures/mammals/elk-moose-marked-green.webp",
    "Goat": "icons/creatures/mammals/goat-horned-blue.webp",
    "Hawk": "icons/creatures/birds/raptor-hawk-flying.webp",
    "Horse, Draft": "icons/creatures/mammals/ox-bull-horned-glowing-orange.webp",
    "Horse, Riding": "icons/creatures/mammals/deer-movement-leap-green.webp",
    "Horse, War": "icons/creatures/mammals/bull-horned-blue.webp",
    "Monitor Lizard": "icons/creatures/reptiles/lizard-iguana-green.webp",
    "Mule": "icons/creatures/mammals/goat-horned-blue.webp",
    "Ox": "icons/creatures/mammals/ox-buffalo-horned-green.webp",
    "Rat": "icons/creatures/mammals/rodent-rat-green.webp",
    "Scorpion, Giant": "icons/creatures/invertebrates/scorpion-yellow.webp",
    "Snake, Constrictor": "icons/creatures/reptiles/snake-poised-white.webp",
    "Snake, Venomous": "icons/creatures/reptiles/snake-fangs-bite-green.webp",
    "Snake, Venomous Giant": "icons/creatures/reptiles/snake-fangs-bite-green-yellow.webp",
    "Spider": "icons/creatures/invertebrates/spider-dotted-green.webp",
    "Spider, Giant": "icons/creatures/invertebrates/spider-large-white-green.webp",
    "Wolf": "icons/creatures/mammals/wolf-howl-moon-gray.webp",
    "Wolf, Dire": "icons/creatures/mammals/wolf-shadow-black.webp",
}
HUMAN_ICON = "icons/svg/mystery-man.svg"
UNIQUE_ICON = "icons/creatures/magical/humanoid-silhouette-glowing-pink.webp"
FALLBACK_ICON = "icons/svg/mystery-man.svg"


def norm(s):
    s = re.sub(r"[ \t]+", " ", s.replace("’", "'").replace("‘", "'").replace("–", "-")).strip()
    return re.sub(r"\s+([,.;:!?])", r"\1", s)


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ---------------------------------------------------------------- geometry
def boxes_on(page):
    out = []
    for d in page.get_drawings():
        if not d.get("fill"):
            continue
        for it in d["items"]:
            if it[0] == "re" and it[1].width > 60 and it[1].height > 40:
                out.append(it[1])
    out.sort(key=lambda r: (r.x0 > 200, r.y0))
    return out


def rows_in(page, box):
    """Text rows inside a box: spans grouped by baseline, sorted top-down / left-right."""
    spans = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if not s["text"].strip():
                    continue
                bb = fitz.Rect(s["bbox"])
                if box.contains(fitz.Point((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2)):
                    spans.append({"y": bb.y0, "x": bb.x0, "text": s["text"], "bold": bool(s["flags"] & 16),
                                  "size": s["size"], "font": s["font"]})
    spans.sort(key=lambda s: (s["y"], s["x"]))
    rows = []
    for s in spans:
        if rows and abs(s["y"] - rows[-1]["y"]) <= 2.5:
            rows[-1]["spans"].append(s)
        else:
            rows.append({"y": s["y"], "spans": [s]})
    for r in rows:
        r["spans"].sort(key=lambda s: s["x"])
        r["text"] = norm(" ".join(s["text"] for s in r["spans"]))
        r["all_bold"] = all(s["bold"] for s in r["spans"])
        r["first_bold"] = r["spans"][0]["bold"]
        r["x0"] = r["spans"][0]["x"]
    return rows


# ---------------------------------------------------------------- parsing
def split_stats(text):
    """'Speed: 6, climb 6 Reactions: 3' -> {'Speed': '6, climb 6', 'Reactions': '3'}"""
    out = {}
    pat = r"(" + "|".join(STAT_LABELS) + r"):\s*"
    parts = re.split(pat, text)
    for i in range(1, len(parts) - 1, 2):
        out[parts[i]] = norm(parts[i + 1])
    return out


def parse_block(page, box):
    rows = rows_in(page, box)
    if not rows:
        return None
    name = rows[0]["text"]
    name = re.sub(r"^Undead Creature ([A-H])$", r"Undead \1", name)
    stats, feats, attacks = {}, [], []
    i = 1
    # ---- stat lines (until the Attack header)
    last_label = None
    while i < len(rows) and not re.match(r"^Attack\s+Range", rows[i]["text"]):
        r = rows[i]
        found = split_stats(r["text"])
        if found:
            stats.update(found)
            last_label = list(found)[-1]
        elif last_label in ("Expertises", "Equipment") and not r["first_bold"]:
            stats[last_label] = norm(stats[last_label] + " " + r["text"])
        i += 1
    # ---- attack table
    if i < len(rows):
        i += 1
        while i < len(rows):
            r = rows[i]
            m = re.match(r"^(.+?\(\+\d+\)\**)\s+(.+?)\s+(\d+ (?:P )?dam\**)\s+(\d+ (?:P )?dam\**)\s*$", r["text"])
            if not m:
                break
            attacks.append({"name": norm(m.group(1)), "range": norm(m.group(2)),
                            "t2": m.group(3), "t3": m.group(4)})
            i += 1
    # ---- features
    cur = None
    while i < len(rows):
        r = rows[i]
        is_title = r["all_bold"] and not re.match(r"^\d", r["text"]) and not re.match(r"^(≤11|12-16|17\+)", r["text"])
        if is_title:
            cur = {"title": r["text"], "lines": []}
            feats.append(cur)
        elif cur is not None:
            cur["lines"].append(r["text"])
        i += 1
    for f in feats:
        text = " ".join(f["lines"])
        # tier lists like "1 15 dam 2 7 dam 3 No effect" or a "≤11 12-16 17+" header + values row
        m = re.search(r"(?:^|\s)1 (.+?) 2 (.+?) 3 (.+)$", text)
        if m and re.search(r"RR\.?\s*(1 |$)", text + " 1 "):
            head = text[:m.start()].strip()
            f["html"] = f"<p>{esc(head)}</p><p><b>&le;11:</b> {esc(m.group(1))} &bull; <b>12-16:</b> {esc(m.group(2))} &bull; <b>17+:</b> {esc(m.group(3))}</p>"
        else:
            t = re.sub(r"≤11 12-16 17\+ (.+?) (\d+ dam) (\d+ dam)$", r"<b>&le;11:</b> \1 &bull; <b>12-16:</b> \2 &bull; <b>17+:</b> \3", text)
            f["html"] = f"<p>{t if '<b>' in t else esc(t)}</p>"
    return {"name": name, "stats": stats, "attacks": attacks, "features": feats, "page": page.number + 1}


# ---------------------------------------------------------------- assets
def prepare_art():
    """Downscale the MCDM illustrations to 512px webp tokens inside the system."""
    from PIL import Image
    ASSETS.mkdir(parents=True, exist_ok=True)
    mapping = {}
    for jpg in ART.rglob("*.jpg"):
        stem = jpg.stem
        m = re.match(r"^(Blood Creature|Undead) ([A-H])$", stem)
        if not m:
            continue
        key = f"{m.group(1)} {m.group(2)}" if m.group(1) == "Blood Creature" else f"Undead {m.group(2)}"
        fname = re.sub(r"[^a-z0-9]+", "-", key.lower()) + ".webp"
        dest = ASSETS / fname
        if not dest.exists():
            im = Image.open(jpg).convert("RGB")
            im.thumbnail((512, 512))
            im.save(dest, "WEBP", quality=82)
        mapping[key] = f"systems/fvtt-crows-system/assets/monsters/{fname}"
    return mapping


def pick_icon(name, ctype, art):
    if name in art:
        return art[name]
    if ctype == "Animal":
        return ANIMAL_ICON.get(name, FALLBACK_ICON)
    if ctype == "Human":
        return HUMAN_ICON
    if ctype == "Unique":
        return UNIQUE_ICON
    return FALLBACK_ICON


# ---------------------------------------------------------------- foundry docs
def to_actor(block, art):
    st = block["stats"]
    ctype = st.get("Type", "Monster")
    size = st.get("Size", "Medium")
    img = pick_icon(block["name"], ctype, art)

    def num(v, default=0):
        m = re.search(r"-?\d+", v or "")
        return int(m.group(0)) if m else default

    desc = []
    meta = []
    for k in ("Reactions", "AD", "Expertises", "Equipment"):
        if st.get(k):
            meta.append(f"<li><b>{k}:</b> {esc(st[k])}</li>")
    if meta:
        desc.append("<ul class='monster-meta'>" + "".join(meta) + "</ul>")
    if block["features"]:
        desc.append("<p><em>Features are listed as traits on this sheet.</em></p>")

    items = []
    # "*Vise Grip" belongs to the attack marked with one asterisk, "**Exploding Sword" to two, etc.
    star_feats = {len(f["title"]) - len(f["title"].lstrip("*")): f for f in block["features"] if f["title"].startswith("*")}
    for a in block["attacks"]:
        bonus = re.search(r"\(\+(\d+)\)", a["name"])
        aname = re.sub(r"\s*\(\+\d+\)\**", "", a["name"]).strip()
        stars = max(a["name"].count("*"), a["t2"].count("*"), a["t3"].count("*"))
        notes = ""
        if stars and stars in star_feats:
            f = star_feats[stars]
            notes = f"<p><b>{esc(f['title'].lstrip('*'))}.</b> {re.sub(r'^<p>|</p>$', '', f['html'])}</p>"
        items.append({"name": aname, "type": "attack", "img": "icons/svg/sword.svg",
                      "system": {"bonus": f"+{bonus.group(1)}" if bonus else "+0", "range": a["range"],
                                 "tier2Damage": a["t2"].replace("*", ""), "tier3Damage": a["t3"].replace("*", ""),
                                 "notes": notes}})
    for f in block["features"]:
        items.append({"name": f["title"].lstrip("*"), "type": "trait", "img": "icons/svg/book.svg",
                      "system": {"tree": "General", "tier": "Monster Feature", "cost": 0,
                                 "prerequisites": "", "description": f["html"]}})

    tsize = TOKEN_SIZE.get(size, 1)
    disposition = -1 if ctype not in ("Animal", "Human") else 0
    power = num(st.get("Power"), 1)
    m = re.search(r"\(Power (\d+)\)", block["name"])
    if m:
        power = int(m.group(1))  # the name is authoritative (Thief (Power 9) lists Power 6 in its stats)
    return {
        "name": block["name"], "type": "monster", "img": img,
        "system": {
            "size": size, "power": power, "type": ctype,
            "stamina": {"value": num(st.get("Stamina"), 10), "max": num(st.get("Stamina"), 10)},
            "speed": st.get("Speed", "5"),
            "characteristics": {"agility": num(st.get("Agility")), "mind": num(st.get("Mind")), "strength": num(st.get("Strength"))},
            "slots": num(st.get("Slots"), 0), "coins": 0, "tempAD": num(st.get("AD"), 0),
            "description": "".join(desc),
        },
        "items": items,
        "prototypeToken": {
            "name": block["name"], "displayName": 20, "displayBars": 20, "disposition": disposition,
            "width": tsize, "height": tsize, "texture": {"src": img},
            "bar1": {"attribute": "stamina"}, "actorLink": False,
        },
    }


def main():
    doc = fitz.open(str(BOOK))
    art = prepare_art()
    blocks = []
    for page in doc:
        if "Power:" not in page.get_text():
            continue
        for box in boxes_on(page):
            b = parse_block(page, box)
            if b and b["stats"].get("Power") is not None:
                blocks.append(b)
    actors = [to_actor(b, art) for b in blocks]
    OUT.mkdir(exist_ok=True)
    (OUT / "monsters.new.json").write_text(json.dumps(actors, indent=2, ensure_ascii=False), encoding="utf-8")
    by = collections.Counter(a["system"]["type"] for a in actors)
    print(f"{len(actors)} stat blocks -> {OUT / 'monsters.new.json'}  {dict(by)}")
    for a in actors:
        s = a["system"]
        print(f"  p{next(b['page'] for b in blocks if b['name'] == a['name']):<3} {a['name']:<26} {s['type']:<7} {s['size']:<7} P{s['power']:<3} St{s['stamina']['max']:<4} spd='{s['speed']}' A{s['characteristics']['agility']} M{s['characteristics']['mind']} S{s['characteristics']['strength']} slots={s['slots']} AD={s['tempAD']} atk={len([i for i in a['items'] if i['type']=='attack'])} feat={len([i for i in a['items'] if i['type']=='trait'])}")
    if FOUNDRY_ICONS.exists():
        missing = sorted({a["img"] for a in actors if a["img"].startswith("icons/") and not (FOUNDRY_ICONS / a["img"][6:]).exists()})
        print("icons not found in Foundry install:", missing or "none")


if __name__ == "__main__":
    main()
