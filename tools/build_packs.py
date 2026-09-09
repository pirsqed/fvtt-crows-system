"""
Build Foundry compendium JSON for the Crows system from the extracted card data.

Input : tools/out/cards_raw.json           (from extract_cards.py)
        fvtt-crows-system/packs/*.json     (current packs, used for icon reuse + diff)
Output: tools/out/equipment.new.json       (core cards)
        tools/out/dungeon-loot.new.json    (POI/dungeon-only cards)
        tools/out/backgrounds.json         (starting kits per background)
        tools/out/pack_diff.md             (what changed vs the current packs)

Nothing under fvtt-crows-system/ is modified.
"""
import json, re, html, collections
from pathlib import Path
from common import OUT, PACKS

DATA = Path(__file__).parent / "data"

NAME_ALIASES = {  # card name -> name used in the existing pack / preferred name
    "Quiver of 20 Arrows": "Quiver of Arrows",
    "Case of 20 Crossbow Bolts": "Case of Crossbow Bolts",
    "Strong Poison": "Strong Poison Vial",
    "Miner's Pick": "Miner's Pick",
}
DEFAULT_IMG = {
    "book": "icons/sundries/books/book-worn-brown.webp",
    "weapon": "icons/svg/sword.svg",
    "armor": "icons/svg/shield.svg",
    "default": "icons/svg/item-bag.svg",
}


def load(path, default=None):
    path = Path(path)
    if not path.exists():
        return [] if default is None else default
    return json.loads(path.read_text(encoding="utf-8"))


def key(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


def display_name(card):
    n = NAME_ALIASES.get(card["name"], card["name"])
    if card.get("spell") and card["spell"].get("rank") is not None and n.endswith(" Book"):
        n = f"{n} R{card['spell']['rank']}"
    return n


def ud_trigger(flags):
    f = [x.lower() for x in flags]
    if any("dt" in x for x in f):
        return "DT"
    if any("rest" in x for x in f):
        return "Rest"
    if any("useless" in x for x in f):
        return "Useless"
    return "Activate"


def esc(s):
    return html.escape(s or "", quote=False)


def card_html(card, relic=False):
    """Description HTML in the same style as the existing packs (crows-item-card)."""
    badges = []
    if relic:
        badges.append("<span class='badge' style='background:rgba(220,38,38,0.25);color:#fca5a5;border:1px solid #dc2626;'>Dungeon Relic</span>")
    sp = card.get("spell")
    if sp:
        badges.append(f"<span class='badge magic'>{esc(sp.get('discipline', 'Spell'))}</span>")
        if sp.get("cast"):
            badges.append(f"<span class='badge'>{esc(sp['cast'])}</span>")
        badges.append(f"<span class='badge'>Rank {sp.get('rank', 0)}</span>")
    if card.get("weapon"):
        badges.append("<span class='badge weapon'>Weapon</span>")
        badges.append(f"<span class='badge range'>{esc(card['weapon'].get('range', ''))}</span>")
    if card.get("armor_ad") is not None:
        badges.append(f"<span class='badge armor'>AD {card['armor_ad']}</span>")
    if card.get("ud"):
        badges.append(f"<span class='badge ud'>UD {card['ud']['max']} ({'; '.join(card['ud']['flags'])})</span>")
    if card.get("magic_slot"):
        badges.append(f"<span class='badge slot'>Slot: {esc(card['magic_slot'])}</span>")
    if card.get("slots", 1) > 1:
        badges.append(f"<span class='badge slots'>{card['slots']} Slots</span>")
    if card.get("stack", 1) > 1:
        badges.append(f"<span class='badge stack'>Stack {card['stack']}</span>")

    parts = ["<div class='crows-item-card'>"]
    if badges:
        parts.append(f"<div class='card-badges'>{' '.join(badges)}</div>")
    if sp:
        meta = []
        if sp.get("range"):
            meta.append(f"<b>Range:</b> {esc(sp['range'])}")
        if sp.get("target"):
            meta.append(f"<b>Target:</b> {esc(sp['target'])}")
        if sp.get("duration"):
            meta.append(f"<b>Duration:</b> {esc(sp['duration'])}")
        if meta:
            parts.append(f"<div class='spell-meta'>{' &bull; '.join(meta)}</div>")
    if card.get("weapon") and card["weapon"].get("attack"):
        parts.append(f"<div class='atk-formula'><strong>Attack:</strong> {esc(card['weapon']['attack'])}</div>")
    body = card.get("body_html") or ""
    if card.get("variants"):
        cut = re.search(r"<b>\s*(Fine|Masterwork)\s*\(", body)
        if cut:
            body = body[:cut.start()].strip()
    if body:
        parts.append(f"<p class='card-prose'>{body}</p>")
    tiers = card.get("tiers")
    if tiers and any(tiers.values()):
        cols = [k for k in ("t1", "t2", "t3") if k in tiers]
        head = {"t1": "&le;11 (Tier 1)", "t2": "12&ndash;16 (Tier 2)", "t3": "17+ (Tier 3)"}
        cls = "weapon" if card.get("weapon") else "effect"
        parts.append(f"<table class='crows-tier-table {cls}'><thead><tr>"
                     + "".join(f"<th class='tier-{k[1]}'>{head[k]}</th>" for k in cols)
                     + "</tr></thead><tbody><tr>"
                     + "".join(f"<td>{esc(tiers[k])}</td>" for k in cols)
                     + "</tr></tbody></table>")
    if card.get("qualities"):
        parts.append("<div class='traits-block'><strong>Traits:</strong> "
                     + " ".join(f"<span class='trait-tag'>{esc(q)}</span>" for q in card["qualities"]) + "</div>")
    var = card.get("variants") or {}
    if var:
        vparts = []
        for k in ("fine", "masterwork"):
            if k in var:
                vparts.append(f"<div><b>{k.capitalize()} ({var[k]['price']:,} gc):</b> {esc(var[k]['text'])}</div>")
        parts.append(f"<div class='variants-block'>{''.join(vparts)}</div>")
    footer = []
    if card.get("crafting"):
        footer.append(f"<span class='crafting-tag'><i class='fas fa-hammer'></i> {esc(card['crafting']['raw'])}</span>")
    if card.get("price") is not None:
        footer.append(f"<span class='cost-tag'>{card['price']:,} gc</span>")
    if footer:
        parts.append(f"<div class='card-footer-meta'>{''.join(footer)}</div>")
    parts.append("</div>")
    return "\n".join(parts)


def improvised_weapon(card):
    """Consumables that say 'make a ranged 5 attack with it using Agility' (acid vials) act as weapons."""
    tiers = card.get("tiers") or {}
    body = re.sub(r"<[^>]+>", "", card.get("body_html") or "")
    m = re.search(r"make an? (ranged|melee) (\d+) attack", body, re.I)
    if m and tiers.get("t2") and tiers.get("t3"):
        char = "A" if "agility" in body.lower() else "S"
        return {"range": f"{m.group(1).capitalize()} {m.group(2)}", "attack": f"2d10 + {char}",
                "tier2": tiers["t2"], "tier3": tiers["t3"]}
    return None


def to_item(card, img_lookup, relic=False):
    name = display_name(card)
    sp = card.get("spell")
    w = card.get("weapon") or improvised_weapon(card)
    ud = card.get("ud")
    tiers = card.get("tiers") or {}
    is_consumable = bool(ud or sp or (tiers and not card.get("weapon")))

    traits = list(card.get("qualities") or [])
    if sp:
        traits = [sp.get("discipline", ""), f"Rank {sp.get('rank', 0)}", sp.get("cast", "")] + traits
    traits = [t for t in traits if t]

    img = img_lookup.get(key(name)) or img_lookup.get(key(card["name"]))
    if not img:
        img = DEFAULT_IMG["book" if sp else "weapon" if w else "armor" if card.get("armor_ad") is not None else "default"]

    system = {
        "description": card_html(card, relic=relic),
        "shortDescription": card.get("shortDescription") or card.get("short_description") or "",
        "location": "backpack1",
        "slots": card.get("slots", 1),
        "quantity": 1,
        "cost": card.get("price") or 0,
        "crafting": (card.get("crafting") or {}).get("raw", ""),
        "traits": ", ".join(traits),
        "maxStack": card.get("stack", 1) or 1,
        "isEquipped": True,
        "greedBonus": 0,
        "isShield": bool(re.search(r"\bshield\b", name, re.I)),
        "isSpellbook": bool(sp),
        "isWeapon": bool(w),
        "weapon": {
            "range": (w or {}).get("range", ""),
            "attackFormula": (w or {}).get("attack") or "2d10 + S",
            "tier2Damage": (w or {}).get("tier2", "") or "",
            "tier3Damage": (w or {}).get("tier3", "") or "",
        },
        "isArmor": card.get("armor_ad") is not None,
        "armor": {"defense": card.get("armor_ad") or 0, "maxDefense": card.get("armor_ad") or 0},
        "isConsumable": is_consumable,
        "consumable": {
            "usageDice": f"UD {ud['max']} ({'; '.join(ud['flags'])})" if ud else "",
            "currentUD": ud["max"] if ud else 0,
            "maxUD": ud["max"] if ud else 0,
            "udTrigger": ud_trigger(ud["flags"]) if ud else "DT",
            "actionText": f"<p>{card['body_html']}</p>" if card.get("body_html") and is_consumable else "",
            "tier1Effect": tiers.get("t1", "") if not card.get("weapon") else "",
            "tier2Effect": tiers.get("t2", "") if not card.get("weapon") else "",
            "tier3Effect": tiers.get("t3", "") if not card.get("weapon") else "",
        },
    }
    return {"name": name, "type": "equipment", "img": img, "system": system}


def main():
    cards = load(OUT / "cards_raw.json")
    old_eq = load(PACKS / "equipment.json")
    old_loot = load(PACKS / "dungeon-loot.json")
    # icon choices: the curated map shipped with the tools, then whatever packs already exist locally
    img_lookup = {key(n): img for n, img in load(DATA / "icons.json", {}).get("items", {}).items()}
    for e in old_loot + old_eq:  # equipment wins on conflicts
        img_lookup[key(e["name"])] = e["img"]

    # ---- core equipment: first occurrence per name in the core PDF
    core = collections.OrderedDict()
    for c in cards:
        if c["source"] == "core" and c["name"] not in core:
            core[c["name"]] = c
    equipment = [to_item(c, img_lookup) for c in core.values()]

    # ---- dungeon loot: POI cards, unique by name; relic styling
    loot = collections.OrderedDict()
    for c in cards:
        if c["source"] == "poi" and c["name"] not in loot:
            loot[c["name"]] = c
    dungeon_loot = [to_item(c, img_lookup, relic=True) for c in loot.values()]

    # ---- backgrounds: the Characters book (extract_backgrounds.py) is authoritative; the profession PDF is a cross-check
    book = load(OUT / "backgrounds_raw.json", None) or load(DATA / "backgrounds_book.json", None)
    if not book:
        raise SystemExit("No background data: run extract_backgrounds.py first.")
    common = {e["name"]: e["quantity"] for e in book["_common"]["equipment"]}
    backgrounds = []
    for b in book["backgrounds"]:
        full = collections.Counter(common)
        for e in b["equipment"]:
            full[e["name"]] += e["quantity"]
        rec = dict(b)
        rec["startingKit"] = [{"name": n, "quantity": q} for n, q in full.items()]
        rec["startingGold"] = book["_common"]["startingGold"]
        backgrounds.append(rec)

    pdf_kits = collections.OrderedDict()
    for c in cards:
        if c["source"] != "profession":
            continue
        title = (c.get("page_title") or "").replace(" Inventory Cards", "").strip()
        pdf_kits.setdefault(title, collections.Counter())[display_name(c)] += 1
    page_images = {}
    pi_path = OUT / "page_images.json"
    if pi_path.exists():
        for p in load(pi_path):
            if p["source"] == "profession":
                page_images[(p.get("title") or "").replace(" Inventory Cards", "").strip()] = len(p["images"])
    kit_notes = []
    for rec in backgrounds:
        want = collections.Counter({e["name"]: e["quantity"] for e in rec["startingKit"]})
        got = pdf_kits.get(rec["name"], collections.Counter())
        missing = {n: q - got.get(n, 0) for n, q in want.items() if got.get(n, 0) < q}
        extra = {n: q - want.get(n, 0) for n, q in got.items() if q > want.get(n, 0)}
        if missing or extra:
            note = f"- **{rec['name']}**: "
            if missing:
                note += "PDF lacks " + ", ".join(f"{n} x{q}" for n, q in missing.items())
            if extra:
                note += ("; " if missing else "") + "PDF has extra " + ", ".join(f"{n} x{q}" for n, q in extra.items())
            if page_images.get(rec["name"]):
                note += f" (page has {page_images[rec['name']]} embedded image(s): pet stat block and/or cards exported as pictures)"
            kit_notes.append(note)

    (OUT / "equipment.new.json").write_text(json.dumps(equipment, indent=2, ensure_ascii=False), encoding="utf-8")
    (OUT / "dungeon-loot.new.json").write_text(json.dumps(dungeon_loot, indent=2, ensure_ascii=False), encoding="utf-8")
    (OUT / "backgrounds.json").write_text(json.dumps(backgrounds, indent=2, ensure_ascii=False), encoding="utf-8")

    # ---- diff report vs current packs
    lines = ["# Pack rebuild report", "",
             f"New equipment: {len(equipment)} items (current pack: {len(old_eq)})",
             f"New dungeon loot: {len(dungeon_loot)} items (current pack: {len(old_loot)})",
             f"Backgrounds with kits: {len(backgrounds)}", ""]
    old_by = {key(e["name"]): e for e in old_eq}
    new_by = {key(e["name"]): e for e in equipment}
    lines += ["## Names only in the current pack (not produced by the new export)"]
    lines += [f"- {old_by[k]['name']}" for k in old_by if k not in new_by] or ["- none"]
    lines += ["", "## Names only in the new export"]
    lines += [f"- {new_by[k]['name']}" for k in new_by if k not in old_by] or ["- none"]
    lines += ["", "## Background kits: Characters book vs profession-card PDF"]
    lines += kit_notes or ["- all 36 kits match"]
    lines += ["", "## Field changes on shared items", "",
              "| Item | Field | Current | New |", "|---|---|---|---|"]
    fields = [("cost", "system.cost"), ("slots", "system.slots"), ("maxStack", "system.maxStack"),
              ("isWeapon", "system.isWeapon"), ("range", "system.weapon.range"),
              ("attack", "system.weapon.attackFormula"), ("tier2", "system.weapon.tier2Damage"),
              ("tier3", "system.weapon.tier3Damage"), ("isArmor", "system.isArmor"),
              ("AD", "system.armor.maxDefense"), ("isConsumable", "system.isConsumable"),
              ("UD", "system.consumable.maxUD"), ("udTrigger", "system.consumable.udTrigger"),
              ("t1", "system.consumable.tier1Effect"), ("t2", "system.consumable.tier2Effect"),
              ("t3", "system.consumable.tier3Effect"), ("traits", "system.traits"),
              ("crafting", "system.crafting")]

    def get(d, path):
        for p in path.split("."):
            d = d.get(p, {}) if isinstance(d, dict) else {}
        return d if d != {} else ""

    changes = 0
    for k in new_by:
        if k not in old_by:
            continue
        for label, path in fields:
            a, b = get(old_by[k], path), get(new_by[k], path)
            if str(a).strip() != str(b).strip():
                changes += 1
                lines.append(f"| {new_by[k]['name']} | {label} | {str(a)[:40]} | {str(b)[:40]} |")
    lines.insert(5, f"Field changes on shared items: {changes}")
    (OUT / "pack_diff.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"equipment {len(equipment)}, dungeon loot {len(dungeon_loot)}, backgrounds {len(backgrounds)}, field changes {changes}")


if __name__ == "__main__":
    main()
