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

You need Python 3.10 or newer and the playtest packet from MCDM (the books, the Inventory Cards folder, and optionally the Monster Illustrations folder), extracted somewhere on disk. Keep one copy of each PDF in that folder; subfolders are fine.

**Windows:** double-click **Build Playtest Content.cmd** in the system folder. Paste the extracted packet folder when prompted. On the first run it creates a local Python environment and installs the required libraries; this needs internet access. It then runs every exporter for you. The window stays open so you can read the result.

**Linux / remote server (SSH):** use the shell launcher. Python 3.10 or newer with `venv` support must be installed. First run:

```sh
sh build-playtest-content.sh --setup --packet "/srv/crows/playtest packet"
```

Later builds reuse the local environment without reinstalling dependencies:

```sh
sh build-playtest-content.sh --packet "/srv/crows/playtest packet"
```

The launcher accepts the same options as the Python builder, including `--check` and `--help`. It works from another directory when invoked with its full path, preserves relative packet paths relative to your current directory, and passes failures back as a nonzero exit status. With no arguments it prompts only when attached to a terminal; unattended runs can use `--packet` or `CROWS_PACKET`. Setup downloads dependencies; regular builds need no network access.

Run it as the account that owns the Foundry system files, with write access to this system folder. The packet path is on the remote server, not your desktop. If the server cannot run Python, build on your own machine and upload the generated `packs/*.json` and `assets/monsters/` files to the same locations in the server's system folder. Then use the Foundry import menu. Do not copy `tools/.venv` between machines.

**Windows, macOS, or Linux command line:** run the following from the system folder (use `python3` if that is your Python command):

```bash
python tools/build_all.py --setup --packet "C:/path/to/Crows Playtest"
```

`--setup` installs dependencies in `tools/.venv`, leaving your global Python packages alone. On Windows you can reuse the double-click launcher for later builds. To rebuild without dependency setup from a terminal, use `tools/.venv/Scripts/python.exe` on Windows or `tools/.venv/bin/python` on macOS/Linux in place of `python`, and omit `--setup`.

Add `--check` to check PDF discovery and dependencies without exporting content. `--interactive` prompts for the packet folder, and `--help` lists the options. Individual exporters remain available for development.

The builder runs all five steps in order, shows progress and entry counts, and saves a log to `tools/out/build.log`. It checks all required PDFs before starting and validates the generated JSON before installing it into `packs/` and `assets/`. Failed extraction leaves the installed content alone. Installation replaces files individually; if an installation fails because of permissions or disk space, fix the error and rerun the build.

Then, in Foundry as the active GM, open **Settings → System Settings → Import Playtest Content**. Alternatively, run this from a script macro or the console:

```js
game.crows.importPlaytestItems()
```

That creates four world compendiums: **Crows Equipment & Spellbooks**, **Crows Dungeon Loot & Relics**, **Crows Trait Trees**, and **Crows Bestiary**. Re-running the import adds missing entries and updates unedited items previously tracked by this importer, preserving their document IDs. It never empties a compendium or deletes entries removed from a generated file.

Entries from the older importer, locally edited entries, and changed bestiary actors are preserved and listed for review. Actor inventories are not automatically replaced. Duplicate an entry before making a manual replacement if you want to retain your changes. Importing does not alter actors or items already copied into your world.

The Settings importer validates all selected files before writing, skips files that have not been built, and reports additions, updates, unchanged entries, and preserved entries. Malformed files stop the import before any writes. A write failure stops further packs and reports completed work; the operation is not a transaction, so completed changes remain. Run imports as the active GM and unlock destination compendiums first.

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

## Moving loot on the map

Drag a loose item's map icon onto an open inventory sheet or onto a Crow, NPC, or
container token to transfer it. Dropping onto empty map space cancels the pickup.
Items dragged from inventory sheets onto empty space still create ground loot.
Dropping onto a token uses its inventory; sheet slots allow more precise placement.

Players can pick up unlocked loot into actors they own and put items into unlocked
containers, subject to the loot reach setting. A GM must be connected for transfers
involving inventories the player does not own. GMs can also give items to NPCs.

Direct icon dragging applies to generic loot containing one equipment item and no
coins. Chests, corpses, and piles with multiple items retain their container sheets.
Double-click a loose item to open its sheet; as GM, hold Shift to reposition its
underlying token normally.

## Status

### Dungeon Turn hourglass

The running hourglass follows a saved deadline using Foundry's synchronized server
clock. It continues through background tabs, reloads, and disconnections; pause it
before taking a break. Every client animates locally, and only the active GM changes
the shared timer. Expiry stops at zero; End Turn still performs the encounter check
and advances to a fresh, paused turn.

If publishing a turn resolution fails, check chat before using Reset to clear its
pending status. This prevents repeated encounter rolls after an uncertain write.

### Chat actions

New attack, character-test, and Miasma-resistance cards save their roll context in
message flags. Targets retain their scene and token identities; expertise uses the
original damage outcomes and updates the card's consequences and actions together.
Apply expertise before applying damage. Each attack can apply damage once per target.

Damage still opens the allocation dialog. If the roll or target changes before
committing, reopen the dialog to get a fresh allocation. Multiplayer chat actions
require a connected GM to serialize updates. The requester must own the actor being
changed (or be a GM); rolling an attack does not grant control of its target.

Failed or interrupted writes remain marked pending or needing GM review to prevent
duplicate changes. Check the actor and message before making a manual correction.
Historical cards retain their text and damage buttons, but need a new roll to use
the new expertise flow; their old damage buttons do not have replay protection.

This is playtest software tracking a playtest game. Rules will change and so will this system. Issues and pull requests are welcome.
