# Legacy playtest-content importer

For new imports, follow the [PDF importer walkthrough](README.md#importing-the-playtest-content). This reference covers the original Python builder and generated-file importer.

### Legacy generated-file workflow

The original Python tools remain available during integration. Open **Start Here → Legacy Python-generated content → Open legacy importer** to import their output.

<details>
<summary>Legacy builder instructions</summary>

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

Join as the active GM and open **Start Here → Legacy Python-generated content → Open legacy importer**. Click **Re-check files**, then **Import everything found**.

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

</details>

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

