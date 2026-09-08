# Crows prerelease test checklist

Check a box when a test passes. Leave failed or untested checks unchecked and record the result in the section notes. Use **FAIL**, **BLOCKED**, or **NOT TESTED** so an unchecked box is unambiguous.

## Test setup

- Date:
- Tester:
- System version / release:
- Foundry version and build:
- Server OS:
- GM browser:
- Player browser:
- Playtest packet version:
- World name:

- [ ] Use a fresh world in the separate test data folder, with no modules enabled.
- [ ] Connect a second browser session as a player.
- [ ] Keep the browser console available to capture errors.

Prioritize **importing**, **damage and exact targets**, and **map loot and containers** first.

## 1. Fresh installation and importing

- [ ] The system loads and creates a world without errors.
- [ ] The packaged Windows/Linux builder finds the PDFs and completes all exports.
- [ ] The importer shows the generated files and entry counts.
- [ ] Import all content; equipment, dungeon loot, traits, and monsters appear.
- [ ] Open several imported entries and check text, images, and stats against the PDFs.
- [ ] Import again: no duplicates, missing entries, or broken links.
- [ ] Edit an imported item, then re-import: the edit is preserved and reported.
- [ ] Lock a compendium and try importing: a clear error appears.

### Notes

-

## 2. Character sheet and inventory

- [ ] Create a Crow; enter characteristics, Stamina, coins, and biography.
- [ ] Close/reopen the sheet and reload Foundry: changes persist.
- [ ] Drag equipment into hands, belt, backpack, magic slots, ground, and stash.
- [ ] Move a multi-slot item across the backpack's row boundary.
- [ ] Move an item onto occupied slots: displaced items remain accessible.
- [ ] Equip a two-handed item: both hands display correctly.
- [ ] Adjust quantities and confirm they persist.
- [ ] Set base speed to **8**; it displays correctly.
- [ ] Add a wound to an occupied backpack slot: speed drops by one.
- [ ] A wound in an empty slot doesn't impose that item-and-wound penalty.
- [ ] Speed never falls below zero.

### Notes

-

## 3. Usage dice and greed

- [ ] Roll usage dice on both Crow and monster equipment.
- [ ] Dice are depleted according to the rolled results.
- [ ] Set remaining dice to **0**: rolling warns instead of refilling.
- [ ] Reopen and reload: depleted items remain depleted.
- [ ] Cycle greed through **0 → 10 → 20 → 30 → 0**.
- [ ] Bronze, silver, and gold tags show the correct percentage and adjusted value.
- [ ] Tags stay clear of close, edit, and delete buttons on each sheet.

### Notes

-

## 4. Rolls, attacks, and expertise

- [ ] Characteristic tests work for Crows and monsters.
- [ ] Weapon attacks use the selected characteristic and modifier.
- [ ] Edge/bane changes the modifier by **+2/−2**; double edge/bane changes the tier.
- [ ] Results around **11/12** and **16/17** select the correct tier.
- [ ] Natural **19–20** produces a critical result; **2–3** produces doom.
- [ ] Monster stat-block attacks display their correct damage and effects.
- [ ] Expertise spends one use and upgrades the tier and damage together.
- [ ] Expertise is unavailable for doom, Tier 3, and already-upgraded rolls.
- [ ] Open two expertise dialogs for the same roll: applying both spends only once.
- [ ] Reload chat: the upgraded result remains correct.

For rare roll outcomes, record **NOT TESTED** rather than repeatedly rolling until they happen.

### Notes

-

## 5. Damage and exact targets

Create **two unlinked copies of the same monster** for this section.

- [ ] Attack one copy and apply damage: only that copy changes.
- [ ] Its sibling and the base actor in the Actors directory stay unchanged.
- [ ] Armor allocation correctly uses temporary AD, equipment AD, Stamina, and wounds.
- [ ] Cancel the allocation dialog: nothing changes.
- [ ] Apply the same hit twice: the second application is rejected.
- [ ] Change the target's defenses while a damage dialog is open: committing the stale dialog is rejected.
- [ ] Upgrade an attack while its damage dialog is open: reopen the dialog to use the new damage.
- [ ] Change scenes before using a saved targeted attack: it still resolves the original target.
- [ ] Delete the original target: the action fails clearly instead of damaging another actor.
- [ ] A player cannot apply damage to an actor they don't own; the GM can.

### Notes

-

## 6. Map loot and containers

- [ ] Drop an owned item onto empty canvas space: one ground item appears and leaves the inventory.
- [ ] Drag its map icon directly onto an open character sheet.
- [ ] Drag it onto a character, NPC, and container token with appropriate permissions.
- [ ] Cancelling a pickup over empty space leaves the original item intact.
- [ ] Two players attempt to pick up the same item: only one receives it.
- [ ] Picking up the last item removes its empty loose-loot token.
- [ ] Empty chests remain on the map.
- [ ] Locked containers reject taking and stowing items.
- [ ] Nearby and out-of-reach interactions respect the reach setting.
- [ ] Coins transfer correctly, including an attempted competing pickup.
- [ ] With no GM connected, unsupported transfers give a clear warning.
- [ ] GM **Shift-drag** repositions loose loot; double-click still opens its sheet.

### Notes

-

## 7. Hourglass and Miasma

- [ ] GM starts/pauses the hourglass; the player sees matching sand movement.
- [ ] Background a browser tab, then return: the timer catches up.
- [ ] Reload while running: time remains correct.
- [ ] Changing EN doesn't reset the countdown.
- [ ] Reset restores the selected duration and pauses.
- [ ] Expiry stops at zero without automatically advancing the turn.
- [ ] End Turn produces one encounter check and advances once, even with a quick double-click.
- [ ] If using two GMs, only the active GM controls shared timer changes.
- [ ] Miasma resistance displays the correct tier consequence.
- [ ] Upgrading a Miasma result removes actions that no longer apply.
- [ ] Cruelty gain/purge actions persist and cannot be applied twice from the same new card.

### Notes

-

## 8. Final persistence check

- [ ] Shut down and restart Foundry.
- [ ] Reconnect both GM and player.
- [ ] Inventory, wounds, usage dice, greed, containers, timer state, and chat results remain correct.
- [ ] Both users can still open sheets and perform their permitted actions.

### Notes

-

## Bug report template

Copy this block for each issue.

### Issue: [short title]

- Related checklist section/check:
- Status: FAIL / BLOCKED / NOT TESTED
- Acting user: GM / player
- Actor/item/token involved:
- Reproducible: always / sometimes / once

**Steps to reproduce**

1.
2.
3.

**Expected result**


**Actual result**


**Console error / screenshot location**

```text
Paste any console error here.
```

**Retest notes**

- Version/commit tested:
- Result:

## Test summary

- Release blockers:
- Other bugs:
- Visual/usability notes:
- Untested or blocked checks:
- Ready for wider testing? Yes / No / With known issues
