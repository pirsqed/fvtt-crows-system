# Crows (Unofficial) for Foundry VTT

An unofficial Foundry Virtual Tabletop system for **Crows**, the survival-horror dungeon-crawling RPG by MCDM Productions, built against the public playtest.

**This system ships with no game content.** No item cards, traits, spells, monsters, or art are included. Everything comes from the playtest packet you download from MCDM yourself. A set of Python tools in `tools/` reads those PDFs and generates the compendium data locally, and the system imports it into your world.

Crows is © MCDM Productions LLC. This project is not affiliated with or endorsed by MCDM.

## What the system does

- Crow (player character) sheets with the slot-based inventory (hands, belt, numbered backpack, magic item slots), wounds that occupy backpack slots, speed penalties, expertise use pools, Miasma and cruelty tracking.
- A four-step character creator with background and gold rolls, characteristic choices, starting kits and traits, NPC connections, and linked starting pets.
- The 2d10 tiered test with edges, banes, double edges and banes, crits and dooms, and post-roll expertise upgrades from chat.
- Weapon attacks with tier damage, targeted damage application, and an armor defense allocation dialog.
- Usage dice rolling on equipment and spellbooks.
- Monster sheets with attack items and features, plus a loot container actor type and canvas ground loot.
- A synchronized real-time Dungeon Turn hourglass with encounter checks and greed bonus tracking.

## Importing the playtest content

You need Python 3.10 or newer and the playtest packet from MCDM (the books, the Inventory Cards folder, and optionally the Monster Illustrations folder), extracted somewhere on disk. Keep one copy of each PDF in that folder; subfolders are fine. The default is `pdfs/` inside the system folder (create it if needed). `--packet` and `CROWS_PACKET` override this location. Press Enter at the launcher prompt to use the default. This folder is ignored by Git and excluded from releases.

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
| `extract_backgrounds.py` | Characters book | starting characteristics, Stamina, trait, expertises, kits per background, and NPC connection benefits |
| `extract_monsters.py` | Ref book | every stat block as an actor with attacks and features, plus downscaled monster art |

The tools use the PDFs' own structure (table borders, fonts, filled boxes) rather than guessing from raw text, so they are specific to the current playtest layout. Expect to adjust them when a new packet changes the layout.

`tools/data/icons.json` maps item and trait names to Foundry's bundled icons and is the one piece of hand-curated data; it contains no game text.

Maintainers can verify those paths and runtime core icons against a Foundry installation with `python tools/check_icons.py "C:/Program Files/Foundry Virtual Tabletop/resources/app/public"` (use the corresponding installation path on Linux).

## GM setup: player permissions

For Foundry 14, open **User Management** from Settings and use **Configure User Permissions**. Grant permissions to the role your players actually use (for example, Player); the role name alone does not guarantee a particular permission. Document ownership is separate: use an Actor's **Configure Ownership** menu to grant a player **Owner** access to their Crow and any companions they control.

### Required access by action

| Action | Player access / setup required |
| --- | --- |
| Finish **Create a Crow**, including starting pets | **Create Actors** for the player's role. Generated content must already be built. The creator grants its user ownership of the resulting Crow and pets. |
| Preview the creator without Create Actors | Open it through **Settings → System Settings → Character Creator**. Finishing is blocked; the GM can create the Crow and assign ownership of both Crow and pets afterward. |
| Edit a character, manage its inventory, or cast from its equipment | **Owner** access to that actor. **Create Items** is not required for equipment embedded in an owned actor. |
| Drop owned equipment onto empty map space | Own the source actor, have a scene open, and keep a **GM connected**. The GM's client creates the ground-loot token; the player does **not** need Create Tokens, Create Actors, or Create Items for this action. |
| Pick up ground loot or take container items/coins | **Observer** access to the unlocked loot actor and **Owner** access to the receiving Crow/NPC. Normally requires a connected GM because players do not own the loot actor. Inventory space and the loot reach setting also apply. |
| Put equipment into a container | Own the source actor; have **Observer** access to the unlocked destination loot actor. Keep a GM connected for shared containers; reach and capacity rules still apply. |
| Transfer directly to another Crow or NPC | The acting player must own both non-loot actors. A connected GM does not waive that restriction. Ask the GM to transfer it, or use unlocked shared loot so the recipient can pick it up. |
| Place new loot from a world Item or compendium directly onto the map or a map token | **GM only** through the Crows map-drop workflow. This differs from dropping equipment already carried by an owned actor. |
| Edit a village or automatically add a new Crow's connection to it | **Owner** access to the village. A visible village can be selected as home without ownership; the home choice is saved and the Ref can add the membership/connection afterward. |
| Apply expertise or damage from chat | Own the actor being changed and keep a GM connected. Players cannot apply damage to an unowned enemy; the GM applies it. |
| Import generated content or control the shared Dungeon Turn timer | The **active GM** handles imports and shared timer changes. Import destinations must be unlocked. |

**Create Tokens** is only needed if you want players to place their own character tokens through Foundry's normal actor-to-scene workflow; the GM can place those instead. It is not needed to drag a Crows loose-item icon into inventory. **Create Items** governs standalone world Items, not normal equipment management on an owned actor. Players do not need a GM role for character creation or ordinary looting.

The creator reads generated packs directly, so it does not require access to the imported compendiums. If players should browse or drag entries from those compendiums themselves, give them appropriate viewing access to those packs as well.

### Loot setup and troubleshooting

- New loot actors default to **Observer** access for players; GM startup also repairs older loot actors whose default access is lower. Use the container's **Locked** state to restrict normal taking/stowing, and hide its token when it should not appear on the map. Players do not need Owner access to shared loot.
- For **Take**, **Take All**, and **Take Coins**, select the owned character token that should receive the loot. With no owned token selected, the system falls back to the user's assigned character. Assign that character and grant ownership separately. Dragging onto a sheet or token specifies the destination directly.
- **Loot interaction reach (squares)** defaults to 1; 0 disables the distance check. For normal map play, place the character and loot on the same scene and move the character next to the loot. Reach checks use active character tokens and do not enforce distance when there is no applicable token to measure. GMs bypass reach checks.
- Keep a GM logged into the world while players drop or move shared loot. Merely running the Foundry server is not enough. Transfers/stack merges between actors the player owns can work without a GM; ground drops still require one.
- If the system warns that its loot socket is disabled, restart the **Foundry server**, then reconnect the GM and players. Browser refresh alone does not reload the system manifest.
- If a pickup fails, check the receiving actor's ownership, loot Observer access, container lock, selected/assigned character, reach, and available slots before granting broader permissions.

## Creating a crow

Build the playtest content first (rebuild older exports to add `packs/connections.json`). In the **Actors** directory, click **Create a Crow**, or use **Settings → System Settings → Character Creator**. A script macro can also open it:

```js
game.crows.createCrow()
```

The creator reads the local generated packs directly; importing compendiums is not required. It shows an actionable error if a required file or grant is missing. Players need Foundry's **Create Actors** permission to finish; without it they can preview through Settings and ask the GM to create their crow.

Background rolls use Foundry's standard Roll chat messages: `1d6 * 10 + 1d6` displays the d66 result and the selected background. Starting gold also posts a standard roll, including any background gold bonus in the formula and total. Both use Foundry's current chat visibility setting. Manual entries do not post a roll.

Roll the two background dice separately, assign the permitted characteristics, name your crow and feature, roll or enter starting gold, and add your village connection. Background selection and rerolls are available for Ref-approved choices or physical dice. The review shows every starting item and its assigned location before creating a new actor. Going back keeps your choices. Existing actors are never replaced.

The creator preserves kit quantities, gives lore books their individual subjects, adds the starting trait, and fills all starting expertise pools. Pets become separately owned actors linked from the crow's biography. Connection details are saved in biography and creation flags. Choose an optional home village on the NPC connection step: if you own that village, the creator also adds the Crow and connection to its sheet. Otherwise the home choice is saved and the Ref can add the Crow from the village sheet. A starting Reputation trait also asks for its merchant choice.

Equipment is placed into available hands, belt, and backpack slots. Overflow remains in home storage and is called out before creation. Cumbersome weapons start stowed because the current sheet represents hand occupancy by slot count. Review your loadout on the sheet before adventuring. Gold uses the system's existing separate loose-coin stack, with the empty purse retained; purse capacity rules are not automated by the creator.

This version creates new crows at **0 XP**. Replacement-character advancement, retirement bonuses, shopping, and village construction are not part of the wizard. Trait and connection descriptions are references; conditional benefits are not automatically applied. If a save fails or returns an incomplete result, the creator blocks another save and displays a reference ID. Check the Actors directory for the crow and pets before opening a fresh creator; a server failure may have saved some documents.

## Villages

Create an Actor with type **village** in the Actors directory. Each village has its own institutions, NPCs, quests, notes, prosperity, treasury, and cycle/day counters. No Crows are required. Ownership controls who can view or edit the sheet; notes are shared with anyone who can view it.

Use **Add starting institutions** for the five standard level-1 institutions, then add the group's chosen sixth institution. This adds only missing types. Institutions can link to village NPCs as stewards and track services, current/maximum levels, and a pending level with its availability cycle. Apply due changes manually. Costs, prosperity adjustments, and cycle advancement remain the Ref's responsibility. Sale value updates from prosperity. **Roll village event** sends a standard Foundry roll to chat; consult the Village Event table and record the outcome in event notes.

Add NPCs independently, optionally linking their actor sheets. Quests track their issuer, status, reward, deadline, and notes. These records are embedded in their village, so editing one village does not alter another.

Use **Add Crow** or drag a Crow from the Actors directory to record them. Each Crow has one optional home village; **Set as home** changes that choice if you own the Crow. The character creator also offers visible villages as home choices. A home-village membership copies the Crow's NPC connection; other memberships do not. Copied connections can be edited independently in the village. Re-adding a Crow preserves existing edits. Changing home keeps old village records for the Ref to review or remove. Missing linked actors leave their records intact.

## Inventory and gold

The Crow's gc display totals equipment marked **Gold coins**. The adjacent + creates a gold stack: set its quantity on the item sheet, up to 250 gc in one slot. Gold moves, drops, and occupies wounded backpack slots like other equipment. Existing Crow coin balances convert on GM startup; if there is not enough room, the balance stays visible as pending. Free slots and reload to finish conversion.

Quantity controls appear on stackable items even at quantity 1. Drag an owned stack onto matching equipment to combine up to the destination's limit; any remainder stays at the source. Different properties, including greed and usage dice, prevent merging. A full inventory rejects new pickups and moves that cannot place displaced gear. Use map loot or container actors for external storage.

Depleted supplies remain visible on inventory cards. Use the restore control after completing the required rest or refill; it restores the item's maximum usage dice.

Known invalid core icon paths from older exports are corrected when importing. Exact matches on world items and actor inventories are repaired on active-GM startup. Re-import to update unedited compendium entries; locally edited compendium entries remain protected.

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

### At the table

See [Playing the playtest](MANUAL-PLAY.md) for spellcasting, XP, companion wounds, and the steps handled manually.
