"""
Extract the 23 trait trees (276 traits) from the Crows Characters book.

Each tree page holds 12 filled boxes (3 columns x 4 rows) and thick connector
lines. Prerequisites come from the connectors: every box touched by one
connected run of thick lines is linked to the others (the rules only require
"a trait connected by a line to another trait you already have").

Output: tools/out/traits.new.json (Foundry trait items) + a console summary.
"""
import fitz, json, re, collections
from pathlib import Path
from common import packet_dir, find_pdf, OUT, PACKS

BOOK = find_pdf(packet_dir(), include=["characters"])

TREE_FIX = {"Blackmsithing": "Blacksmithing"}
NAME_FIX = {"Sieze the Advantage": "Seize the Advantage"}
TIER_BY_ROW = {0: "Starting", 1: "Tier 2", 2: "Tier 3", 3: "Tier 4"}
# fallback icon per tree, taken from equipment icons already verified in the packs
TREE_ICON = {
    "Alchemy": "Alchemist's Tools", "Alteration": "Take Shape Book R0", "Archery": "Longbow",
    "Armor": "Shield", "Bashing": "Mace", "Benefaction": "Minor Healing Book R0",
    "Blacksmithing": "Blacksmith's Tools", "Camping": "Tent", "Chopping": "Axe",
    "Conjuration": "Jaunt Book R0", "Elemental": "Spark Book R0", "Enchantment": "Enchanter's Tools",
    "Illusion": "Light Book R0", "Knowledge": "Lore Book", "Leverage": "Crowbar",
    "Necromancy": "Minor Curse Book R0", "Pets": "Animal Feed", "Reputation": "Coin Purse",
    "Slashing": "Sword", "Stabbing": "Spear", "Thievery": "Lockpick Set", "Travel": "Compass",
    "Unarmed": "Rage Potion",
}


def norm(s):
    return re.sub(r"\s+", " ", s.replace("’", "'").replace("‘", "'").replace("–", "-")).strip()


def load(p):
    p = Path(p)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else []


def page_boxes(page):
    boxes = []
    for d in page.get_drawings():
        if not d.get("fill"):
            continue
        for it in d["items"]:
            if it[0] == "re" and it[1].width > 80 and it[1].height > 60:
                boxes.append(it[1])
    boxes.sort(key=lambda r: (round(r.y0 / 20), r.x0))
    return boxes


def page_connectors(page):
    segs = []
    for d in page.get_drawings():
        if (d.get("width") or 0) < 3:
            continue
        for it in d["items"]:
            if it[0] == "l":
                segs.append((it[1], it[2]))
    return segs


def touches(pt, rect, tol=3.0):
    r = fitz.Rect(rect.x0 - tol, rect.y0 - tol, rect.x1 + tol, rect.y1 + tol)
    return r.contains(pt)


def connected_groups(segs, boxes):
    """Union-find over segments (touching endpoints) -> set of box indices per component."""
    n = len(segs)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def near(p, q):
        return abs(p.x - q.x) <= 3 and abs(p.y - q.y) <= 3

    def on_segment(p, s):
        a, b = s
        if abs(a.x - b.x) < 1:  # vertical
            return abs(p.x - a.x) <= 3 and min(a.y, b.y) - 3 <= p.y <= max(a.y, b.y) + 3
        return abs(p.y - a.y) <= 3 and min(a.x, b.x) - 3 <= p.x <= max(a.x, b.x) + 3

    for i in range(n):
        for j in range(i + 1, n):
            (a, b), (c, d) = segs[i], segs[j]
            if any(near(p, q) for p in (a, b) for q in (c, d)) or on_segment(a, segs[j]) or on_segment(b, segs[j]) \
                    or on_segment(c, segs[i]) or on_segment(d, segs[i]):
                parent[find(i)] = find(j)
    groups = collections.defaultdict(set)
    for i, (a, b) in enumerate(segs):
        for bi, box in enumerate(boxes):
            if touches(a, box) or touches(b, box):
                groups[find(i)].add(bi)
    return [g for g in groups.values() if len(g) > 1]


def box_text(page, box):
    name, cost, starting, desc = None, None, False, []
    lines = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            bb = fitz.Rect(l["bbox"])
            c = fitz.Point((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2)
            if box.contains(c):
                lines.append((bb.y0, l))
    lines.sort(key=lambda t: t[0])
    for _, l in lines:
        spans = l["spans"]
        text = norm("".join(s["text"] for s in spans))
        if not text:
            continue
        if name is None and any("Bold" in s["font"] and round(s["size"]) == 10 for s in spans):
            name = text
            continue
        m = re.match(r"^XP Cost:\s*([\d,]+)\s*(\(Starting\))?", text)
        if m and cost is None:
            cost = int(m.group(1).replace(",", ""))
            starting = bool(m.group(2))
            continue
        desc.append(text)
    return name, cost, starting, " ".join(desc)


def main():
    doc = fitz.open(str(BOOK))
    old_traits = load(PACKS / "traits.json")
    equipment = load(PACKS / "equipment.json")
    icon_map = load(Path(__file__).parent / "data" / "icons.json") or {}
    old_icon = {n.lower(): img for n, img in icon_map.get("traits", {}).items()}
    old_icon.update({t["name"].lower(): t["img"] for t in old_traits})
    eq_icon = dict(icon_map.get("items", {}))
    eq_icon.update({e["name"]: e["img"] for e in equipment})

    traits = []
    summary = []
    for pi in range(len(doc)):
        page = doc[pi]
        if "XP Cost" not in page.get_text():
            continue
        title = next((norm(s["text"]) for b in page.get_text("dict")["blocks"] for l in b.get("lines", [])
                      for s in l["spans"] if s["size"] >= 11.5 and s["text"].strip()), None)
        tree = TREE_FIX.get(title, title)
        boxes = page_boxes(page)
        if len(boxes) != 12:
            print(f"WARNING page {pi + 1} {tree}: {len(boxes)} boxes")
        recs = []
        for bi, box in enumerate(boxes):
            name, cost, starting, desc = box_text(page, box)
            name = NAME_FIX.get(name, name)
            row = bi // 3
            recs.append({"box": bi, "row": row, "col": bi % 3, "name": name, "cost": cost,
                         "starting": starting, "desc": desc})
        groups = connected_groups(page_connectors(page), boxes)
        links = collections.defaultdict(set)
        for g in groups:
            for a in g:
                for b in g:
                    if a != b:
                        links[a].add(b)
        for r in recs:
            r["connected"] = sorted(recs[b]["name"] for b in links.get(r["box"], []))
            # prerequisites: connected traits that are cheaper or equal (you climb the tree, not down it)
            prereq = [recs[b]["name"] for b in sorted(links.get(r["box"], [])) if recs[b]["cost"] <= r["cost"] and b != r["box"]]
            r["prereq"] = "Starting Trait" if r["starting"] else (" | ".join(prereq) if prereq else "")
            icon = old_icon.get(r["name"].lower()) or eq_icon.get(TREE_ICON.get(tree, ""), "icons/sundries/books/book-worn-brown.webp")
            traits.append({
                "name": r["name"], "type": "trait", "img": icon,
                "system": {
                    "tree": tree,
                    "tier": TIER_BY_ROW[r["row"]],
                    "cost": r["cost"],
                    "prerequisites": r["prereq"],
                    "description": f"<p>{r['desc']}</p>",
                },
            })
        summary.append((tree, len(recs), sum(len(g) for g in groups), len(groups)))
    OUT.mkdir(exist_ok=True)
    (OUT / "traits.new.json").write_text(json.dumps(traits, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{len(traits)} traits across {len(summary)} trees -> {OUT / 'traits.new.json'}")
    for tree, n, linked, groups in summary:
        print(f"  {tree:<14} traits={n} connector groups={groups}")
    missing = [t["name"] for t in old_traits if t["name"].lower() not in {x["name"].lower() for x in traits}]
    print("names in current pack not found in export:", missing or "none")
    empty = [t["name"] for t in traits if not t["system"]["description"].strip("<p></p>") or not t["system"]["cost"]]
    print("traits with empty description/cost:", empty or "none")


if __name__ == "__main__":
    main()
