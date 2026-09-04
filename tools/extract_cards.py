"""
Crows inventory-card extractor.

Reads the playtest inventory-card PDFs (Word-table layouts) and produces a
structured JSON record per card.

Segmentation: tall vertical table borders define columns. Within a column,
a new card starts at a "header" line: a bold name whose card has a bold
"Stack" token on the same line or within the next two lines. (Horizontal
borders can't be used because tier tables inside cards are full-width.)

Field parsing uses font semantics: bold labels, italic ranges/qualities,
7.5pt footer for crafting + base price, 11pt bold "Fine (x gc):" variants.

Usage: python extract_cards.py [--out out/cards_raw.json]
"""
import fitz, json, re, sys, collections
from pathlib import Path
from common import packet_dir, find_pdf, OUT

PACKET = packet_dir()
SOURCES = {  # the three inventory-card PDFs, located by filename fragments
    "core": find_pdf(PACKET, include=["cards"], exclude=["profession", "poi", "annotated", "sheet"]),
    "profession": find_pdf(PACKET, include=["cards", "profession"]),
    "poi": find_pdf(PACKET, include=["cards", "poi"]),
}

WEAPON_QUALITIES = ["Bashing", "Bow", "Chopping", "Slashing", "Stabbing", "Unarmed",
                    "Light", "Pummeling", "Dismember", "Disengage", "Brutal", "Cumbersome", "Parry",
                    "Reload", "Exploding", "Vicious", "Absorbing", "Dancing", "Defending",
                    "Flaming", "Frosty", "Gashing", "Hewing", "Hungry", "Impact", "Infinity",
                    "Lightning", "Poisoning", "Raging", "Returning", "Slaying", "Sworn Foe",
                    "Teleporting", "Weakening", "Steel", "Yew"]
FOOTER_SIZE = 7.6  # crafting line + base price are always 7.5pt; body text is 8pt or larger
# bold words that begin body lines but are never card names
LABEL_WORDS = {"Maneuver:", "Maneuver", "Action:", "Action", "Reaction:", "Reaction", "Duration:", "Dur.",
               "Target", "UD", "UD:", "Slot", "Slot:", "Fine", "Masterwork", "Attack", "Stack", "Armor",
               "12-16", "17+", "≤", "≤11", "<=11", "Book"}


# ---------------------------------------------------------------- geometry
def drawing_lines(page):
    vs = []
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                p1, p2 = it[1], it[2]
                if abs(p1.x - p2.x) < 0.5 and abs(p1.y - p2.y) > 1:
                    vs.append((p1.x, min(p1.y, p2.y), max(p1.y, p2.y)))
            elif it[0] == "re":
                r = it[1]
                if r.width < 1.5 and r.height > 1:
                    vs.append((r.x0, r.y0, r.y1))
    return vs


def cluster(vals, tol=3.0):
    out = []
    for v in sorted(vals):
        if out and abs(v - out[-1][-1]) <= tol:
            out[-1].append(v)
        else:
            out.append([v])
    return [sum(c) / len(c) for c in out]


def short_verticals(page):
    """Inner table borders (tier tables): vertical lines shorter than a card."""
    return [v for v in drawing_lines(page) if 4 <= v[2] - v[1] < 100]


def detect_columns(page):
    """Column rectangles from tall vertical borders, grouped by y-band."""
    tall = [v for v in drawing_lines(page) if v[2] - v[1] >= 100]
    bands = {}
    for x, y0, y1 in tall:
        key = next((k for k in bands if abs(k[0] - y0) <= 3 and abs(k[1] - y1) <= 3), None)
        if key is None:
            key = (y0, y1)
            bands[key] = []
        bands[key].append(x)
    cols = []
    for (y0, y1), xs in sorted(bands.items()):
        xs = cluster(xs)
        for a, b in zip(xs, xs[1:]):
            if b - a >= 60:
                cols.append(fitz.Rect(a, y0, b, y1))
    cols.sort(key=lambda r: (round(r.y0 / 50), r.x0))
    return cols


def spans_in(page, rect):
    words = page.get_text("words")  # x0, y0, x1, y1, word, block, line, wordno
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                t = s["text"]
                if not t.strip():
                    continue
                bx = fitz.Rect(s["bbox"])
                c = fitz.Point((bx.x0 + bx.x1) / 2, (bx.y0 + bx.y1) / 2)
                if rect.contains(c):
                    fl = s["flags"]
                    sw = [(w[0], w[2], w[4]) for w in words
                          if bx.x0 - 1 <= (w[0] + w[2]) / 2 <= bx.x1 + 1 and bx.y0 - 1 <= (w[1] + w[3]) / 2 <= bx.y1 + 1]
                    out.append({"y": bx.y0, "x": bx.x0, "x1": bx.x1, "yc": (bx.y0 + bx.y1) / 2,
                                "size": round(s["size"], 1), "bold": bool(fl & 16),
                                "italic": bool(fl & 2), "text": t, "words": sw})
    out.sort(key=lambda s: (s["y"], s["x"]))
    return out


def group_lines(spans, tol=3.5):
    lines = []
    for s in spans:
        if lines and abs(s["yc"] - lines[-1]["yc"]) <= tol:
            lines[-1]["spans"].append(s)
            lines[-1]["yc"] = (lines[-1]["yc"] + s["yc"]) / 2
        else:
            lines.append({"yc": s["yc"], "spans": [s]})
    for ln in lines:
        ln["spans"].sort(key=lambda s: s["x"])
        text = ""
        prev_x1 = None
        for s in ln["spans"]:
            if prev_x1 is not None and s["x"] - prev_x1 > 0.8 and not text.endswith(" ") and not s["text"].startswith(" "):
                text += " "
            text += s["text"]
            prev_x1 = s["x1"]
        ln["text"] = text
        ln["size"] = max(s["size"] for s in ln["spans"])
        ln["x0"] = min(s["x"] for s in ln["spans"])
        ln["x1"] = max(s["x1"] for s in ln["spans"])
    return lines


def is_header(lines, i):
    """Does line i start a new card?"""
    l = lines[i]
    first = l["spans"][0]
    if not (first["bold"] or (first["italic"] and first["size"] >= 9)) or first["size"] <= FOOTER_SIZE:
        return False
    w = first["text"].strip().split(" ")[0] if first["text"].strip() else ""
    if w in LABEL_WORDS or first["text"].strip() in LABEL_WORDS:
        return False
    t = l["text"]
    if "12-16" in t or "17+" in t or "≤" in t:
        return False
    if re.search(r"Stack\s*\d", t):
        return True
    for j in (i + 1, i + 2):
        if j < len(lines):
            nt = lines[j]["text"]
            if re.match(r"^\s*Stack\s*\d", nt) and any(s["bold"] for s in lines[j]["spans"]):
                return True
    return False


def split_cards(lines):
    starts = [i for i in range(len(lines)) if is_header(lines, i)]
    if not starts:
        return []
    cards = []
    for a, b in zip(starts, starts[1:] + [len(lines)]):
        cards.append(lines[a:b])
    return cards


# ---------------------------------------------------------------- parsing helpers
def norm(s):
    return re.sub(r"\s+", " ", s.replace("’", "'").replace("‘", "'").replace("–", "-")).strip()


def line_html(line):
    parts = []
    for s in line["spans"]:
        t = s["text"]
        if s["bold"] and s["italic"]:
            parts.append(f"<b><i>{t}</i></b>")
        elif s["bold"]:
            parts.append(f"<b>{t}</b>")
        elif s["italic"]:
            parts.append(f"<i>{t}</i>")
        else:
            parts.append(t)
    return "".join(parts)


def parse_price(text):
    m = re.search(r"([\d,]+)\s*gc", text)
    return int(m.group(1).replace(",", "")) if m else None


WRAP_FIXES = {"weaken ed": "weakened", "movemen t": "movement", "monster par ": "monster part "}


def fix_wraps(text):
    for a, b in WRAP_FIXES.items():
        text = text.replace(a, b)
    return text


def split_qualities(text):
    toks = [norm(t) for t in re.split(r",", text) if norm(t)]
    out = []
    for t in toks:
        buf = []
        for w in t.split():
            if w in WEAPON_QUALITIES and buf and buf[-1] not in ("Parry", "Sworn"):
                out.append(" ".join(buf))
                buf = []
            buf.append(w)
        if buf:
            out.append(" ".join(buf))
    return out


def parse_card(lines, source, pageno, idx, col_x0=None, verticals=()):
    spans = [s for l in lines for s in l["spans"]]
    if col_x0 is None:
        col_x0 = min(l["x0"] for l in lines)
    big = [s["size"] for s in spans if s["size"] > FOOTER_SIZE]
    body_size = max(big) if big else 11
    small = FOOTER_SIZE  # footer/crafting threshold

    card = {"source": source, "page": pageno + 1, "card_index": idx,
            "name": None, "rank": None, "stack": None, "slots": 1,
            "price": None, "variants": {}, "crafting": None,
            "weapon": None, "qualities": [], "armor_ad": None, "ud": None, "magic_slot": None,
            "spell": None, "tiers": None, "body_html": "",
            "raw_lines": [norm(l["text"]) for l in lines]}

    # ---- header: name / stack / slots / rank
    header = lines[0]
    htext = norm(header["text"])
    name_parts = []
    for s in header["spans"]:
        t = s["text"]
        if "Stack" in t:
            before = t.split("Stack", 1)[0]
            if before.strip():
                name_parts.append(before)
            break
        name_parts.append(t)
    name = norm("".join(name_parts))
    consumed = {0}
    m = re.match(r"^(.*?)\s*Book\s*R\s*(\d)$", name)
    if m:
        name = f"{m.group(1).strip()} Book"
        card["rank"] = int(m.group(2))
    m = re.search(r"\(Occupies\s+(\d+)\s+Slots?\)", htext, re.I)
    if m:
        card["slots"] = int(m.group(1))
        name = norm(re.sub(r"\(Occupies\s+\d+\s+Slots?\)", "", name, flags=re.I))
    name = re.sub(r"\s*R\d$", "", name).strip()
    card["name"] = name
    m = re.search(r"Stack\s*(\d+)", htext)
    if m:
        card["stack"] = int(m.group(1))
    if card["stack"] is None:
        for j in (1, 2):
            if j < len(lines):
                m = re.search(r"Stack\s*(\d+)", norm(lines[j]["text"]))
                if m:
                    card["stack"] = int(m.group(1))
                    if re.fullmatch(r"Stack\s*\d+", norm(lines[j]["text"])):
                        consumed.add(j)
                    break

    # ---- footer (small font): crafting + price
    footer = [i for i, l in enumerate(lines) if l["size"] <= small and i not in consumed]
    price_line = None
    price_tail = None  # text of the price line minus the price (shared crafting/price lines)
    for i in reversed(footer):
        t = norm(lines[i]["text"])
        m = re.search(r"([\d,]+)\s*gc\s*$", t)
        if m and not re.search(r"gc\s*\|", t):
            card["price"] = int(m.group(1).replace(",", ""))
            price_line = i
            price_tail = norm(t[:m.start()])
            break

    def is_craft_line(l):
        t = norm(l["text"])
        return bool(re.search(r"(Alchemy|Blacksmithing|Enchanting)\s*[\d/]", t) or "|" in t
                    or re.fullmatch(r"[\d/ ,]+", t) or re.search(r"gc\s*\|?\s*$", t))

    craft_lines = [i for i in footer if i != price_line and is_craft_line(lines[i])]
    if price_tail and ("|" in price_tail or re.match(r"^(Alchemy|Blacksmithing|Enchanting)", price_tail)):
        craft_lines.append(price_line)
    if craft_lines:
        craft_txt = norm(" ".join((price_tail if i == price_line else norm(lines[i]["text"])) for i in sorted(craft_lines)))
        craft_txt = fix_wraps(craft_txt)
        card["crafting"] = {"raw": craft_txt}
        m = re.match(r"^(Alchemy|Blacksmithing|Enchanting)\s*([\d/]+)\s*\|\s*(.*?)\s*\|\s*([\d/ ,]+)\s*$", craft_txt)
        if m:
            card["crafting"].update({"expertise": m.group(1), "uses": m.group(2),
                                     "materials": norm(m.group(3)), "goal": norm(m.group(4))})
        consumed.update(craft_lines)
    if price_line is not None:
        consumed.add(price_line)

    # ---- tier table
    tiers = None
    tbl_idx = next((i for i, l in enumerate(lines)
                    if i not in consumed and "12-16" in l["text"] and "17+" in l["text"]
                    and any(s["bold"] for s in l["spans"])), None)
    if tbl_idx is not None:
        hl = lines[tbl_idx]
        cols = []
        pending = None
        for s in hl["spans"]:
            t = s["text"].strip()
            if t in ("≤", "<="):
                pending = s
                continue
            if pending is not None and t.startswith("11"):
                cols.append(("t1", (pending["x"] + s["x1"]) / 2))
                pending = None
                continue
            if t.startswith("≤11") or t.startswith("<=11"):
                cols.append(("t1", (s["x"] + s["x1"]) / 2))
            elif t.startswith("12-16"):
                cols.append(("t2", (s["x"] + s["x1"]) / 2))
            elif t.startswith("17+"):
                cols.append(("t3", (s["x"] + s["x1"]) / 2))
        cells = {k: [] for k, _ in cols}
        consumed.add(tbl_idx)
        # the tier table's own vertical borders give its bottom edge exactly
        tv = [v for v in verticals if v[1] - 2 <= hl["yc"] <= v[2] + 2 and hl["x0"] - 6 <= v[0] <= hl["x1"] + 6]
        table_bottom = max((v[2] for v in tv), default=None)
        j = tbl_idx + 1
        last_y = hl["yc"]
        while j < len(lines):
            l = lines[j]
            if j in consumed:
                break
            if table_bottom is not None:
                if l["yc"] > table_bottom + 1:
                    break
            else:
                if l["yc"] - last_y > body_size * 1.9:
                    break
                if any(s["italic"] for s in l["spans"]) and l["size"] >= body_size:
                    break
                if any(s["bold"] for s in l["spans"]) and l["size"] >= body_size:
                    break
            for s in l["spans"]:
                pieces = s["words"] if s.get("words") else [(s["x"], s["x1"], s["text"].strip())]
                for wx0, wx1, wt in pieces:
                    xc = (wx0 + wx1) / 2
                    k = min(cols, key=lambda c: abs(c[1] - xc))[0]
                    cells[k].append(wt.strip())
            consumed.add(j)
            last_y = l["yc"]
            j += 1
        tiers = {k: fix_wraps(norm(" ".join(v))) for k, v in cells.items()}
        card["tiers"] = tiers

    # ---- weapon / armor stat lines
    for i, l in enumerate(lines):
        if i in consumed:
            continue
        t = norm(l["text"])
        has_attack_label = any(s["bold"] and s["text"].strip() == "Attack" for s in l["spans"])
        m = re.fullmatch(r"(Melee \d+(?:/Ranged \d+)?|Ranged \d+)(?:\s+Attack\s+(.+))?", t, re.I)
        if m and (m.group(2) is None or has_attack_label):
            card["weapon"] = card["weapon"] or {}
            card["weapon"]["range"] = m.group(1)
            if m.group(2):
                card["weapon"]["attack"] = norm(m.group(2))
            consumed.add(i)
        elif t.startswith("Attack ") and has_attack_label:
            card["weapon"] = card["weapon"] or {}
            card["weapon"]["attack"] = norm(t[len("Attack "):])
            consumed.add(i)
        elif re.fullmatch(r"Armor\s+AD:?\s*(\d+)", t):
            card["armor_ad"] = int(re.search(r"(\d+)", t).group(1))
            consumed.add(i)
    if card["weapon"] and tiers:
        card["weapon"]["tier2"] = tiers.get("t2")
        card["weapon"]["tier3"] = tiers.get("t3")

    # ---- qualities: italic lines right after the tier table (weapons)
    if card["weapon"] and tbl_idx is not None:
        j = tbl_idx + 1
        while j < len(lines) and j in consumed:
            j += 1
        q = []
        while (j < len(lines) and j not in consumed
               and all(s["italic"] for s in lines[j]["spans"]) and lines[j]["size"] >= body_size - 1):
            q.append(norm(lines[j]["text"]))
            consumed.add(j)
            j += 1
        if q:
            card["qualities"] = split_qualities(" ".join(q))

    # ---- spellbook meta
    if card["rank"] is not None or name.endswith(" Book"):
        sp = {"rank": card["rank"]}
        for i, l in enumerate(lines):
            if i in consumed and i != 1:
                continue
            t = norm(l["text"])
            m = re.search(r"(Alteration|Benefaction|Conjuration|Elemental|Illusion|Necromancy)\s+(Attk\.|Man\.|Act\.|React\.|OOC\.?)", t)
            if m:
                sp["discipline"] = m.group(1)
                sp["cast"] = {"Attk.": "Attack", "Man.": "Maneuver", "Act.": "Action",
                              "React.": "Reaction"}.get(m.group(2), m.group(2))
                consumed.add(i)
                continue
            bold_words = {s["text"].strip() for s in l["spans"] if s["bold"]}
            has_target = any(w.startswith("Target") for w in bold_words)
            m = re.match(r"^(Self|Melee \d+|Ranged \d+|Line .+?|Aura \d+|Cube \d+)\s*(?:Target\s*(.*))?$", t)
            if m and (m.group(2) is None or has_target):
                sp["range"] = norm(m.group(1))
                if m.group(2):
                    sp["target"] = norm(m.group(2))
                consumed.add(i)
                continue
            m = re.match(r"^Target\s+(.*)$", t)
            if m and has_target:
                sp["target"] = norm(m.group(1))
                consumed.add(i)
                continue
            m = re.match(r"^Dur\.?\s*(.*)$", t)
            if m and any(w.startswith("Dur") for w in bold_words):
                sp["duration"] = norm(m.group(1))
                consumed.add(i)
        if card["weapon"] and not sp.get("range") and card["weapon"].get("range"):
            sp["range"] = card["weapon"]["range"]
        if card["weapon"] and not card["weapon"].get("attack"):
            card["weapon"] = None
        if sp.get("rank") is not None or sp.get("discipline"):
            card["spell"] = sp

    # ---- remaining lines: UD / Slot labels and prose body
    body = []
    for i, l in enumerate(lines):
        if i in consumed:
            continue
        t = norm(l["text"])
        m = re.match(r"^UD:?\s*(\d+)\s*\(([^)]*)\)", t)
        if m:
            card["ud"] = {"max": int(m.group(1)), "flags": [norm(x) for x in m.group(2).split(";")]}
            consumed.add(i)
            continue
        m = re.match(r"^Slot:?\s*([A-Za-z]+)\s*$", t)
        if m:
            card["magic_slot"] = m.group(1)
            consumed.add(i)
            continue
        body.append(l)
    html = re.sub(r"\s+", " ", " ".join(line_html(l) for l in body)).strip()
    card["body_html"] = html
    plain = norm(re.sub(r"<[^>]+>", "", html))
    seen_fine = 0
    for m in re.finditer(r"(Fine|Masterwork)\s*\(([\d,]+)\s*gc\):\s*(.*?)(?=(?:Fine|Masterwork)\s*\([\d,]+\s*gc\):|$)", plain):
        kind = m.group(1).lower()
        if kind == "fine":
            seen_fine += 1
            if seen_fine == 2:
                kind = "masterwork"
        card["variants"][kind] = {"price": int(m.group(2).replace(",", "")), "text": norm(m.group(3))}
    if card["stack"] is None:
        card["stack"] = 1
    return card


# ---------------------------------------------------------------- main
PAGE_IMAGES = []  # pages with embedded raster images (cards exported as pictures can't be read)


def extract(sources=SOURCES):
    cards = []
    for key, fname in sources.items():
        doc = fitz.open(str(fname))
        for pageno, page in enumerate(doc):
            imgs = page.get_image_info()
            if imgs:
                PAGE_IMAGES.append({"source": key, "page": pageno + 1,
                                    "images": [[round(v) for v in i["bbox"]] for i in imgs]})
            title = None
            for b in page.get_text("dict")["blocks"]:
                for l in b.get("lines", []):
                    for s in l["spans"]:
                        if s["size"] >= 13 and s["text"].strip() and title is None:
                            title = norm(s["text"])
            idx = 0
            shorts = short_verticals(page)
            for col in detect_columns(page):
                lines = group_lines(spans_in(page, col))
                col_shorts = [v for v in shorts if col.x0 - 2 <= v[0] <= col.x1 + 2]
                for card_lines in split_cards(lines):
                    c = parse_card(card_lines, key, pageno, idx, col_x0=col.x0, verticals=col_shorts)
                    if c and c["name"]:
                        c["page_title"] = title
                        c["column"] = [round(v, 1) for v in col]
                        cards.append(c)
                        idx += 1
    return cards


if __name__ == "__main__":
    out = (Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv
           else OUT / "cards_raw.json")
    cards = extract()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(cards, indent=2, ensure_ascii=False), encoding="utf-8")
    for p in PAGE_IMAGES:
        p["title"] = next((c.get("page_title") for c in cards if c["source"] == p["source"] and c["page"] == p["page"]), None)
    (out.parent / "page_images.json").write_text(json.dumps(PAGE_IMAGES, indent=2), encoding="utf-8")
    by = collections.Counter(c["source"] for c in cards)
    print(f"Extracted {len(cards)} cards -> {out}  {dict(by)}")
