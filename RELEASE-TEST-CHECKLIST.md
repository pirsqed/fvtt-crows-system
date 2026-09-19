# Crows v0.2.1 release verification — Foundry 14

This checklist is for the system release paired with Crows PDF Importer v0.1.0. The [v0.2.0 checklist](0.2.0-RELEASE-TEST-CHECKLIST.md) records the earlier release; its results do not count as checks for this candidate. Record Foundry build, system and module commits, packet version, test worlds, and any failures before publishing.

## Package and installation

- [ ] The manifest says v0.2.1, supports Foundry 14, and points to the matching release ZIP. The ZIP contains the PDF-import settings entry, Start Here guide, character creator, runtime scripts, and current docs. It contains no packet PDFs, extracted game content, or monster artwork.
- [ ] Install the system ZIP and compatible importer module in a clean Foundry 14 setup. Enable the module and reload the world. Verify the settings entry opens the importer. With the module missing, disabled, or unavailable, verify that the settings entry explains the next step.
- [ ] Follow the README and Start Here guide in a fresh GM session. Verify the same steps and labels appear in the live UI. A player can read the guide but cannot import.

## PDF extraction and reviewed import

- [ ] As the active GM, choose the complete packet folder with subfolders. Also verify Individual PDFs and a renamed book assigned manually. Skip a duplicate or unrelated PDF. Confirm extraction errors identify the file or page, and extraction alone saves nothing in the world.
- [ ] Select a small subset with search, category filter, and visible-selection controls. Confirm the total selection count includes hidden selections. Review create/update/unchanged/preserve outcomes before saving.
- [ ] Import the complete supported packet. Check equipment, dungeon loot, traits, and creatures in four world compendiums against sampled source pages. Confirm backgrounds, NPC connections, starting kits, and spellbooks are available to Create a Crow when character-creation publishing is enabled.
- [ ] Re-import without force and verify no duplicates. Edit an imported Item and creature inventory, then review again: local edits and custom artwork are preserved. In a disposable world, verify force overwrite reports and replaces only the intended imported fields and creature embedded Items.
- [ ] Change a selection or import option after review and confirm another review is required. Lock a target pack and confirm an actionable error. Cancel or interrupt an import and verify the report distinguishes completed from remaining changes before retrying.

## Gameplay and upgrade

- [ ] Drag a weapon, spellbook, monster attack, and reference item to hotbar slots. Verify the expected dialogs and icon; repeat a drop and verify macro reuse. Test as an owning player and with an unlinked token. Put a weapon/book in a backpack, belt, ground, or stash, or disable Equipped, and verify the shortcut warns without rolling. Also move/delete it or revoke ownership while its dialog is open; confirm the roll is blocked. Check a depleted spellbook and a deleted-item shortcut.

- [ ] Create a Crow and starting pet from imported content as GM and as a player with Create Actors permission. Check starting trait, kit quantities, expertise, purse, and NPC connection; confirm incomplete creator data produces an actionable error.
- [ ] Spot-check inventory transfers, map loot with a logged-in GM, attacks, wounds, spellcasting reminders, dungeon timer, and villages in the candidate system. Use [the play guide](MANUAL-PLAY.md) to check which steps remain manual.
- [ ] Update a copy of a v0.2.0 world to v0.2.1 with the module enabled. Confirm owned actors and existing world compendiums remain usable; review/import the packet again to update source content without replacing local edits by default. Record any migration or installation issues.

## Release decision

- [ ] Automated system and module tests pass for the candidate. Record skipped private-PDF or live-Foundry checks separately.
- [ ] README, in-world guide, manifest, release notes, and package all describe the paired v0.2.1 system and importer workflow. Publish only after the module release is available to users.
