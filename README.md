# Crows (Unofficial) for Foundry VTT

Greetings, Crows and Refs! This is an unofficial Foundry system for **Crows**, MCDM's survival-horror dungeon crawler. It was built to make running the playtest easier, especially all that item management. :)

**Foundry 14 is required.** You'll need your own MCDM playtest packet to build the item, trait, and bestiary compendiums. Those compendiums and the PDF artwork aren't bundled with the system. Sheet labels, some rule reminders, and a few fixed tables are included; this isn't a replacement for the books.

Crows is © MCDM Productions LLC. This project is not affiliated with or endorsed by MCDM.

## Start here

Install through Foundry's **Game Systems → Install System** using this manifest URL:

```text
https://raw.githubusercontent.com/pirsqed/fvtt-crows-system/main/system.json
```

Create a world using **Crows (Unofficial)** and join as the GM. The **Start Here** guide opens on your first visit. Reopen it anytime through **Settings → Configure Settings → Crows (Unofficial) → Start Here**. It walks through Python, the PDF folder, and importing. Players can read it too; only the Ref or host needs to build and import content.

- [Importing the playtest content](#importing-the-playtest-content)
- [Player permissions and loot setup](#gm-setup-player-permissions)
- [Creating a Crow](#creating-a-crow)
- [Playing the playtest: automated and manual steps](MANUAL-PLAY.md)
- [Purses, ammunition, and usage dice](SUPPLIES.md)
- [Villages and shared inventory](#villages)

## What Foundry handles

The system helps with rolls, item movement, and resource tracking. It doesn't enforce every rule. **Most changes happen when you click the relevant button**, rather than automatically as time passes.

| Feature            | What the system does                                                                                                    | What you handle at the table                                                                                                                                                                                                                               |
| --------------------| -------------------------------------------------------------------------------------------------------------------------| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Character creation | Builds a new Crow, starting kit, expertise pools, purse, and any starting pets.                                         | Ref-approved choices, checking the loadout, later advancement, and conditional trait benefits.                                                                                                                                                             |
| Inventory          | Places items in slots, checks space, moves equipment between owned inventories, and supports map pickups.               | When moving an item is allowed, retrieval decisions, and item-specific restrictions. Most item qualities (like Cumbersome) are not yet automated. You'll need to swap that item from 1 to 2 slots depending on where it's at :)                            |
| Traits             | Stores descriptions                                                                                                     | Purchases, prerequisites, XP spending, and other trait effects. There is an option to add a belt slot, but this will have to be manually done for now.                                                                                                     |
| Rolls and attacks  | Rolls 2d10, resolves the chosen circumstance, shows tiers/crit/doom, and offers damage or expertise options in chat.    | Choosing circumstances and relevant expertise; weapon qualities, reach, targets, conditions, and special effects.                                                                                                                                          |
| Damage and wounds  | Applies the allocation you confirm to AD, Stamina, and supported wound slots; calculates wound-related speed penalties. | Reviewing the allocation, special damage rules, healing, and moving wounds. Since wounds just fill from the first slot, you'll need to go back and put them where you want them after damage is dealt! (This is on the short list of things to add/fix :)) |
| Spellcasting       | Rolls Mind, shows the configured tier text, and updates reminders after expertise.                                      | Spell effects, chaos/backlash rolls, usage checks, duration, and trait exceptions.                                                                                                                                                                         |
| Dungeon Turns      | Runs a shared timer; End Turn rolls an encounter check and advances the counter.                                        | Encounters, UD rolls, condition removal, and setting item greed bonuses.                                                                                                                                                                                   |
| Villages           | Keeps records and shared loot, displays sale percentage, rolls events, and copies custom crypt boons.                   | Costs, services, time, event results, boon eligibility, and boon effects.                                                                                                                                                                                  |

See [Playing the playtest](MANUAL-PLAY.md) for the details. If a rule isn't explicitly handled, resolve it with your Ref and update the sheet yourself.

## Importing the playtest content

There are two parts: **build files from your PDFs outside Foundry**, then **import those files inside your world**. I know this is a little complicated, and I am planning on better tools in the future. This is also the most fragile part of the system, as changes to the PDFs are quite likely to break my importing scripts! So, check for updates on Github if there are new PDFs.

### 1. Install Python and unpack the packet

Install **Python 3.10 or newer** on the computer where you'll run the builder. The [Python download page](https://www.python.org/downloads/) has the installers. Linux also needs Python's `venv` support. The first build downloads helper libraries, so you'll need an internet connection for setup.

Find Foundry's **User Data folder**, then open `Data/systems/fvtt-crows-system`. On Foundry's Setup screen, **Application Configuration** shows the User Data Path. A hosting service may provide its own file manager.

Extract the playtest ZIP into the included **pdfs** folder. Its **ADD_PDFS_HERE.txt** note has the short instructions. Keep the original filenames and subfolders, including Inventory Cards. The builder needs the Characters book, Ref book, Inventory cards, Profession cards, and POI cards. Keep one copy of each PDF; store older packets elsewhere.

Want to keep the packet somewhere else? On Windows, open its folder in File Explorer, press **Ctrl+L**, and copy the full path. Paste that into the builder's prompt. Choose the extracted folder, not the ZIP or an individual PDF. Quotes from **Copy as path** are okay.

### 2. Run the builder

**Windows:** double-click **build_playtest_content.cmd** in the system folder. Press Enter to use `pdfs`, or paste another packet folder. The launcher installs the helper libraries on its first run and leaves the window open so you can read the result.

**Linux / macOS:** open a terminal in the system folder and run:

```sh
sh build_playtest_content.sh --setup --interactive
```

Press Enter for `pdfs`, or enter your packet folder. On later runs, you can omit `--setup`.

For a server or an explicit path:

```sh
sh build_playtest_content.sh --setup --packet "/srv/crows/playtest packet"
```

Replace that example with your actual path. A folder on your desktop isn't a folder on your server! If your host can't run Python, build using a local copy of this system, then upload **packs/*.json** and **assets/monsters/** to the matching locations in the hosted system. Don't upload `tools/.venv`.

The build prints progress and saves extraction output to `tools/out/build.log`. If it stops, read the error before moving on. Missing PDFs usually mean the ZIP wasn't extracted, the folder is wrong, or a required part of the packet is missing.

### 3. Import in Foundry

Join as the active GM and open **Settings → Configure Settings → Crows (Unofficial) → Import Playtest Content**. Click **Re-check files**, then **Import everything found**.

You'll get four world compendiums:

- **Crows Equipment & Spellbooks**
- **Crows Dungeon Loot & Relics**
- **Crows Traits**
- **Crows Bestiary**

Backgrounds and NPC connections are also generated, for the character creator. They aren't separate compendiums.

### Rebuilding and updating

Re-importing adds missing entries and updates unedited entries tracked by this importer. It preserves local edits and older, untracked entries for review. It doesn't delete entries or replace actors and items you've already copied into your world. Existing bestiary actors are also preserved for review.

Unlock the destination compendiums before importing. Missing generated files are skipped; invalid files stop validation before importing begins. If a later write fails, earlier changes can remain. Read the report before retrying.

Keep your original packet and back up your Foundry data before updating. The installed system folder can be replaced by an update, so you may need to rebuild the generated files. Only `pdfs/ADD_PDFS_HERE.txt` ships with the system; your extracted packet is ignored by Git and excluded from release ZIPs.

<details>
<summary>Extra build options and developer tools</summary>

The shell launcher accepts `--check` to check the packet and dependencies without exporting, `--interactive` to ask for the path, and `--help` for the full list. Use `--setup` when dependencies need installing. `--packet` overrides `CROWS_PACKET`; otherwise the default is the system's `pdfs` folder.

You can also call the builder directly from the system folder:

```sh
python tools/build_all.py --setup --packet "C:/path/to/Crows Playtest"
```

Use `python3` if that's your Python command. Setup creates `tools/.venv`; later direct runs can use `tools/.venv/Scripts/python.exe` on Windows or `tools/.venv/bin/python` on Linux/macOS.

The builder runs the card, background, pack, trait, and monster exporters. Failed extraction leaves installed generated content alone. Installation replaces files individually; fix an installation error and rerun if it stops partway through. These extractors depend on the current playtest layout, so a future packet may need updated tools.

Script macros can use `game.crows.importPlaytestItems()`, or the individual `importEquipment()`, `importDungeonLoot()`, `importTraits()`, and `importMonsters()` helpers on `game.crows`.

Maintainers can check bundled icon paths with `python tools/check_icons.py "C:/Program Files/Foundry Virtual Tabletop/resources/app/public"` and build the release with `python tools/build_release.py`. The release builder includes the PDF setup note but excludes PDF files, ZIP archives, generated packs, and extracted monster art.

</details>

## GM setup: player permissions

Give each player **Owner** access to their Crow and any companions they control. Use the actor's **Configure Ownership** menu. Foundry role permissions are separate: open **User Management → Configure User Permissions** to change them.

| To do this | Access needed |
| --- | --- |
| Finish **Create a Crow**, including pets | **Create Actors** permission. Without it, players can preview through Settings and ask the GM to create the Crow. |
| Edit an owned Crow, its equipment, or its supply counts | **Owner** on that actor. No separate Create Items permission is needed for embedded equipment. |
| Drop carried equipment onto the map | Own the source actor, have a scene open, and keep a GM logged in. Players don't need Create Tokens for this action. |
| Pick up map loot | Own the receiving character and have its token within **Loot pickup distance** in the same scene. Keep a GM logged in. |
| Transfer directly between characters | Own both actors, or ask the GM. Otherwise, drop the item on the map for the other player to pick up. |
| Deposit or withdraw village equipment | Own the village and the other actor involved. Village ownership also allows editing its records. |
| Apply damage from chat | Own the target, or be the GM. Players don't get control of an enemy just by targeting it. |
| Apply expertise from chat | Own the rolling Crow and keep a GM logged in. Agree on the expertise with the Ref. |
| Read a village and claim a custom crypt boon | Be able to view the village and own the receiving Crow. Editing the grave itself requires village ownership. |
| Import content or control the shared timer | The active GM. |

**Create Tokens** is only needed if players should place their own character tokens through Foundry's normal tools. **Create Items** controls standalone world Items. Give players viewing access to compendiums if they should browse or drag from them; the character creator reads the generated files directly.

### Loot setup and troubleshooting

Set **Loot pickup distance** in the Crows settings. It uses scene units, measures between token centers, and includes elevation. Its initial value comes from the system's grid distance; adjust it to suit your scenes. GMs bypass distance checks.

For a pickup button, select the owned character token that should receive the item. With no owned token selected, the system tries the user's assigned character. Dragging onto a token or sheet specifies the recipient directly. Hide loot tokens that players shouldn't see. There is no lock or reveal-contents control in this release.

Keep a GM **logged into the world** for map drops, shared pickups, and chat actions. Running the server alone isn't enough. Transfers between actors the player owns can work without a GM. If a request times out, check the inventories before trying again.

If a pickup fails, check ownership, distance, the selected/assigned character, and free inventory space. A socket warning calls for restarting the Foundry server and reconnecting, not just refreshing a browser.

## Creating a Crow

After building the content, click **Create a Crow** in the Actors directory, or open **Character Creator** in the Crows settings. A macro can use `game.crows.createCrow()` too. Importing compendiums isn't required for the wizard; the generated files are. Players will need the 'Create Actors' permission to create their own crows through the creator.

Choose or roll a background, assign characteristics, add your name and feature, roll or enter starting gold, and record your NPC connection. Background and gold rolls post to chat using Foundry's current roll visibility. Manual choices don't post rolls. The last step previews your equipment and its locations before saving.

The creator adds the starting trait and expertise uses, keeps kit quantities and lore-book subjects, and creates separately owned pets with links from the Crow. **Starting gold, including the background bonus, goes into one purse.** Quivers and bolt cases use their starting supply counts. A starting Reputation trait asks for its merchant choice.

Choose an optional home village on the connection step. If you own it, the creator also adds the Crow and connection there. Otherwise it saves the home choice for the Ref to finish later.

Review your loadout: cumbersome weapons start stowed. The preview flags overflow as **Home storage**; this remains on the new actor and isn't automatically deposited in a village. The current Crow sheet has no general home-storage tray, so resolve overflow with the Ref before play.

New Crows start at **0 XP**. Replacement-character advancement, retirement bonuses, purchases, and conditional trait or connection benefits are manual. If creation reports an incomplete save, check the Actors directory for the Crow and pets before starting again; some may already have been saved.

## Inventory and gold

Drag item cards between hands, belt, backpack, and magic-item slots. Multi-slot equipment reserves consecutive slots. A full inventory refuses pickups or moves that can't make room for displaced gear.

Merging item stacks is not currently supported. Supply holders such as purses and quivers don't stack.

The **gc** display totals loose Gold Coins and gold held in the Crow's supply items. The adjacent **+** creates a loose stack; it doesn't fill a purse. Adjust purse contents on its card or item sheet. Moving money between purses, loose stacks, and the village treasury is manual. See [Supply items](SUPPLIES.md).

### Extra belt slots

On a trait's **Trait Details**, set **Extra belt slots** and **Slot restrictions**, such as `1` and `Alchemy items only`. Owning that trait adds labelled belt slots automatically; multiple grants add together. You configure the fields manually, and the restriction is a reminder rather than an enforced item filter. Other trait effects aren't automatically applied.

Move equipment out of the affected slots and later belt slots before changing a trait's slot count or deleting it. This prevents occupied slots from disappearing or getting a different trait's label.

### Moving loot on the map

Drag carried equipment onto empty map space to create a scene item. Drag its icon onto a character token or sheet to pick it up. A sheet slot gives you a preferred destination; if it can't fit there, a transfer can use another free slot. Double-clicking scene loot opens its public item view and pickup button.

Quantities and supply counts travel with the item. Directory/compendium drops create copies; transfers from actor inventories move the owned item. Only GMs can place new directory/compendium items on the map through this workflow.

Prototype token settings are respected: linked placements share an item, while unlinked placements have independent copies. It's my intention to add containers in future releases. (Once I figure out how I want that to work... hah!)

## Villages

Create a **village** actor. It keeps institutions, NPCs, quests, Crows, graves, shared inventory, prosperity, treasury, and cycle/day counters. Notes are shared with anyone who can view the village.

**Add starting institutions** adds missing standard institution types at level 1. You'll need to add the group's extra choice manually. Record services, stewards, maximum levels, and pending upgrades. When a pending change is due, its **Apply** control sets the level; advancing the cycle doesn't apply it automatically (yet!). Construction costs, prosperity changes, services, and time remain manual.

The sale percentage display follows prosperity. **Roll village event** rolls with the current prosperity, but the Ref consults the table and records what happens. Neither button handles purchases, sales, or treasury payments.

### Shared inventory

Use **Inventory → Add loot** for custom equipment, or drag equipment in from a Crow/compendium. Drag it back to an owned Crow to withdraw it. Compendium make copies; drops from another actor transfer that item. Storage has no enforced capacity or travel check. Stored coins stay items, separate from the treasury field.

### Crows and connections

Use **Add Crow** or drag a Crow from the Actors directory. Each Crow can have one home village. **Set as home** changes it when you own the Crow; a home membership can copy the creator's NPC connection. Other memberships don't copy that connection automatically.

Village records are independent copies. Editing one doesn't rewrite the Crow's biography or another village. Re-adding a Crow preserves existing records. Changing home keeps old memberships for the Ref to review; deleting a membership doesn't delete the actor.

### Crypt boons

Add a grave and enter its custom boon name, notes, and uses. **Claim boon** copies these to an owned Crow's **Lore & Notes → Crypt Boon**. Each Crow has one crypt boon; claiming another asks before replacing the existing name, notes, uses, and source.

This is a recordkeeping feature. The Ref decides eligibility, timing, effects, and any limits from the rules. Claiming doesn't update the grave's holder/cycle tracking, spend its uses, check institution benefits, or change the Crow's statistics. Edit the grave and the Crow's remaining uses separately.

## Getting help

This is playtest software for a playtest game. If something goes wrong, [open an issue](https://github.com/pirsqed/fvtt-crows-system/issues) with your Foundry/system versions, the steps you took, and any error message. [Planned work](TODO.md) is listed separately from shipped features.

Fortune, or death!
