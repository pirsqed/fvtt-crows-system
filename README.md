# Crows (Unofficial) for Foundry VTT

An unofficial Foundry Virtual Tabletop system for **Crows**, the survival-horror dungeon-crawling RPG by MCDM Productions, built against the public playtest.

**This system ships with no game content.** No item cards, traits, spells, monsters, or art are included. Everything comes from the playtest packet you download from MCDM yourself. A set of Python tools in `tools/` reads those PDFs and generates the compendium data locally, and the system imports it into your world.

Crows is © MCDM Productions LLC. This project is not affiliated with or endorsed by MCDM.

## What the system does

- Crow (player character) sheets with the slot-based inventory (hands, belt, numbered backpack, magic item slots), wounds that occupy backpack slots, speed penalties, expertise use pools, Miasma and cruelty tracking.
- The 2d10 tiered test with edges, banes, double edges and banes, crits and dooms, and post-roll expertise upgrades from chat.
- Weapon attacks with tier damage, targeted damage application, and an armor defense allocation dialog.
- Usage dice rolling on equipment and spellbooks.
- Monster sheets with attack items and features, plus a loot container actor type and canvas ground loot.
- A synchronized real-time Dungeon Turn hourglass with encounter checks and greed bonus tracking.

## Importing the playtest content

You need Python 3.10 or newer and the playtest packet from MCDM (the books, the Inventory Cards folder, and optionally the Monster Illustrations folder), extracted somewhere on disk.

```bash
pip install -r tools/requirements.txt
python tools/build_all.py --packet "C:/path/to/Crows Playtest"
```

The build reads the PDFs, validates what it finds, and writes the generated data into this system's `packs/` and `assets/` folders. Then, in Foundry, as the GM, run this from a script macro or the console:

```js
game.crows.importPlaytestItems()
```

That creates four world compendiums: **Crows Equipment & Spellbooks**, **Crows Dungeon Loot & Relics**, **Crows Trait Trees**, and **Crows Bestiary**. Re-running the import replaces their contents, so you can rebuild whenever the packet changes.

Individual imports are also available: `importEquipment()`, `importDungeonLoot()`, `importTraits()`, and `importMonsters()` on `game.crows`.

### What the tools extract

| Tool | Source | Produces |
|---|---|---|
| `extract_cards.py` + `build_packs.py` | Inventory Cards PDFs | equipment, dungeon loot, and a report comparing kits with the Characters book |
| `extract_traits.py` | Characters book | all trait trees, with prerequisites derived from the diagram connectors |
| `extract_backgrounds.py` | Characters book | starting characteristics, Stamina, trait, expertises, and kits per background |
| `extract_monsters.py` | Ref book | every stat block as an actor with attacks and features, plus downscaled monster art |

The tools use the PDFs' own structure (table borders, fonts, filled boxes) rather than guessing from raw text, so they are specific to the current playtest layout. Expect to adjust them when a new packet changes the layout.

`tools/data/icons.json` maps item and trait names to Foundry's bundled icons and is the one piece of hand-curated data; it contains no game text.

## Status

This is playtest software tracking a playtest game. Rules will change and so will this system. Issues and pull requests are welcome.
