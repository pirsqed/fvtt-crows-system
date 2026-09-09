# Crows 0.2.0 release verification — Foundry 14

This is the active checklist, refreshed 2026-09-09. The previous results and bug notes remain in [the historical checklist](0.2.0-RELEASE-TEST-CHECKLIST.md). Those results are useful history, not passes for this candidate. Release version **0.2.0** is intentional; the old **v1.2.0** tag is incorrectly numbered.

## How to use this checklist

Do the three passes in order. Each checkbox is one scenario; check it only when every part passes. Unchecked means **NOT TESTED** unless a linked issue says **FAIL** or **BLOCKED**. Record defects in the issue log instead of turning the steps into a growing collection of bug notes.

Test against a named candidate: a commit plus any local changes, or an identified ZIP. If code changes during testing, record the new candidate and repeat the affected scenarios and their immediate dependencies. Preserve unrelated passes with the candidate on which they passed. After the last fix, perform the final packaged-install pass.

Do not keep rolling to obtain rare die results. Automated tests cover numeric tier boundaries, crit/doom, and replay guards; record that evidence separately. A live check still needs a live result. A controlled test fixture can exercise rare UI outcomes when needed.

Minor cosmetic issues and documented manual rules can ship. Lost/duplicated possessions, incorrect resource updates, unauthorized changes, failed persistence, and inability to complete ordinary play block release. New feature requests go into a later backlog.

## Test record

- Tester / dates:
- Candidate commit or ZIP identifier:
- Local changes included:
- Foundry **14**, exact build:
- Server OS / GM browser / player browser:
- Playtest 2 packet edition:
- Test world:
- Automated test command, candidate, date, and results:
- Content integration test run with freshly generated packs? Yes / No:

Use a separate fresh test world without modules. Connect a GM and a separate player session. Give the player ownership of a Crow and pet. Keep the console available. Set up a scene with a container and two **unlinked copies of the same NPC**, plus a second scene for target checks. Use a copy of an older test world only for the upgrade checks.

## Pass 1 — A group gets ready and plays

### A. Build and import

- [ ] A1. Follow the README to build from the Playtest 2 packet. The default `pdfs/` path works, output counts/log are useful, and all required packs (including backgrounds and connections) are generated.
- [ ] A2. Import as GM. Equipment/spellbooks, loot, traits, and bestiary entries appear; sample descriptions, stats, and images match the packet. The importer is readable in the theme being tested.
- [ ] A3. Import again: no duplicates. Edit one imported entry and re-import: the edit is preserved and reported. A locked destination produces a clear error.

Candidate / results / issue IDs:

### B. Create a Crow and a village

- [ ] B1. Create a Crow through the wizard: background and gold rolls post to chat; characteristics, starting Stamina, expertise pools, trait, item quantities, and gold match the reviewed choices. Check one kit containing a pet and one containing spellcasting gear.
- [ ] B2. Go back and change choices before saving, then finish. The resulting Crow reflects the final review. Cancel a separate creation: no Crow or pets are created.
- [ ] B3. A player with Create Actors permission can finish and owns the resulting Crow and pet. Without that permission, creation is clearly blocked. Opening the linked pet works.
- [ ] B4. Create two villages. Add starting institutions, an independent NPC, a quest, treasury/prosperity values, and notes to one. They remain separate from the other village; linked actor sheets open.
- [ ] B5. Choose a home village during creation or add the Crow afterward. Membership and the NPC connection are recorded as permitted. Re-adding does not duplicate/overwrite edited records. A player without village ownership cannot edit it.
- [ ] B6. Edit institution levels and pending availability, advance the recorded cycle, and apply a due change manually. Roll a village event and record its result. Saved records and prosperity-based sale values display correctly.

Candidate / results / issue IDs:

### C. Prepare equipment and resources

- [ ] C1. Edit characteristics, Stamina, multiline background, biography, and base speed. With base speed 8, an occupied wounded backpack slot shows adjusted speed 7; clearing/moving the wound restores it. Base speed 0 stays 0.
- [ ] C2. Move equipment among hands, belt, backpack, and magic slots. Check a two-handed item, a multi-slot item crossing a row, and displacement onto occupied slots. Every item remains accessible; use map loot/containers for external storage.
- [ ] C3. Quantity controls work on stackable items at quantity 1. Merge 8 onto 7 with maximum 10: source 5, destination 10. Full stacks and different greed/usage-die properties do not merge.
- [ ] C4. Create and move Gold Coins items. The Crow's gc display equals carried gold, and gold occupies slots. A stack cannot exceed 250 gc; moving gold out changes the displayed total.
- [ ] C5. Equip a shield in a hand, then move it to backpack/belt or external storage. It supplies no AD there and cannot be enabled in damage allocation. Return it to a hand and equip it again. Check a renamed shield with Shield enabled; ordinary armor still works.
- [ ] C6. Enter TXP 18 and spent XP 6: available XP is 12 and TXP stays 18. Spent XP 19 produces the warning; correct it before continuing.
- [ ] C7. Roll usage dice on Crow and companion gear. Depletion persists at zero and warns when rolled; canceling restoration changes nothing, confirming restores maximum UD. Greed tags and adjusted values remain readable at each tier.

Candidate / results / issue IDs:

### D. Fight, cast, and take wounds

- [ ] D1. Roll a Crow characteristic, equipment attack with a chosen characteristic/modifier/circumstance, and NPC stat-block attack. Results/effects and weapon qualities are readable, without literal HTML markup. Apply expertise: one use is spent and the tier/effect updates.
- [ ] D2. Attack one of the two unlinked NPC tokens. Cancel allocation once, then apply with temporary AD, equipment AD, and Stamina. Only the intended token changes. Adjust damage manually for a quality and confirm the amount is applied and recorded.
- [ ] D3. Enable Spellbook on owned equipment. Cast from its item sheet and inventory; Mind/modifier and tier effects are correct. Apply expertise before resolving consequences: the reminder follows the new tier. Casting does not automatically consume UD; the separate UD roll works.
- [ ] D4. Deal overflow damage to a Crow, a Human, and an Animal. First available slots receive wounds up to their respective capacity. Relocating wounds changes occupied-slot speed penalties; all slots wounded means death. An ordinary monster without wound support is defeated at zero Stamina.
- [ ] D5. Check a companion with more than 10 configured slots: wounds beyond slot 10 can be marked and cleared. Wound controls and inventory highlighting agree.

Candidate / results / issue IDs:

### E. Loot and explore

- [ ] E1. Drop an owned item onto the map, then pick it up via its icon onto a sheet and onto an owned token. There is exactly one copy throughout. Cancel a pickup over empty map space: the original remains.
- [ ] E2. Transfer equipment through NPC/container tokens. Taking the final loose item removes its token; an empty chest remains. GM Shift-drag repositions loose loot and double-click opens it.
- [ ] E3. Start/pause the hourglass as GM. The player sees the same timing. Background/reload a running client: it catches up. Changing EN does not reset time; Reset pauses at the configured duration.
- [ ] E4. Expiry stops at zero. End Turn posts one encounter check and advances to a fresh paused turn. Miasma resistance shows the appropriate consequence; expertise updates available actions; cruelty gain/purge persists.

Candidate / results / issue IDs:

## Pass 2 — Targeted failure and permission checks

These protect shared state and possessions. They are intentionally separate from normal play.

- [ ] F1. Fill an inventory, then attempt a pickup and a rearrangement that cannot fit displaced gear. Both fail without lost, duplicated, or hidden items. An incompatible/full stack does not consume its source.
- [ ] F2. Two players compete for one loose item: only one receives it. Repeat with container coins (501 gc becomes 250 + 250 + 1). Insufficient capacity leaves the container balance intact.
- [ ] F3. Locked containers and out-of-reach interactions reject transfers. An unowned destination cannot be changed without permission. With no GM connected, transfers that require one fail clearly without moving anything.
- [ ] F4. Try applying the same hit twice, including manually adjusted damage. Only one application occurs. Competing expertise clicks spend one use. Reloaded chat retains the applied result.
- [ ] F5. Change defenses while damage allocation is open, then separately upgrade the roll while allocation is open. Each stale allocation is rejected; reopening uses the current data.
- [ ] F6. Change scenes before applying a saved targeted attack: the original token receives it. Delete that token: the action fails without changing its sibling or base actor. A player cannot damage an unowned actor; GM can.
- [ ] F7. Double-click End Turn: one check and one advance. Repeat a cruelty action: it applies once. If two GMs will be supported, verify only the active GM persists shared timer changes.
- [ ] F8. Missing generated creator data gives an actionable error, with no partial Crow created. Failed PDF preflight leaves existing generated content intact. Record the files deliberately withheld in the test copy.

Candidate / results / issue IDs:

### Existing tester world — run on a copy

- [ ] U1. Load older actors, items, chat, and villages if present. Existing content opens and remains usable. Enable Spellbook manually on an older owned book and verify casting.
- [ ] U2. Old loose Crow coin balances convert once to coin items. A full inventory leaves a visible pending balance; free space and reload to complete it. Another reload creates no duplicate gold.
- [ ] U3. Known broken icon paths are repaired, custom paths remain unchanged, and re-import preserves local edits and owned inventories.

Candidate / source world version / results / issue IDs:

## Pass 3 — The package we will actually release

Do this after the last code fix. Use the exact candidate ZIP, not a development-folder copy.

- [ ] R1. Automated tests and template validation pass on the candidate. Run local content integration tests with freshly rebuilt packs; distinguish any skipped tests. Inspect the ZIP: required scripts, templates, styles, docs, and launchers are present; PDFs, generated game content/art, virtual environments, and caches are absent.
- [ ] R2. Install the ZIP into a clean Foundry 14 test setup. Follow the published instructions to build/import content and create a Crow. Record the platform/launcher actually tested; do not infer a Linux/macOS pass from Windows.
- [ ] R3. Briefly play as GM and player using the installed package: open Crow/pet/village sheets, move an item, cast, attack/apply damage, and use map loot and the timer. No new blocking errors appear.
- [ ] R4. Shut down/restart Foundry and reconnect both users. Inventory/gold, wounds, XP, UD, greed, village records, containers, chat results, and timer state persist correctly; permissions still work.
- [ ] R5. On a copied older installation, test the documented update/reinstall path for the intentional version reset to 0.2.0. Confirm what happens to generated packs/art and that rebuilding/re-importing restores access without overwriting owned content.
- [ ] R6. Manifest/version/compatibility and release notes agree: 0.2.0, Foundry 14. Release download identifies the matching ZIP. Installation, content generation, manual-play limits, known issues, and bug-report link are documented.
- [ ] R7. After publication, install using the public manifest URL and repeat world creation/opening. This is a post-publication check; leave it untested while preparing the release.

Candidate / results / issue IDs:

## Issue log

Use a short entry per finding. Link the relevant scenario ID so fixes have a clear retest target.

| ID | Scenario | Candidate | Steps / expected / actual | Severity | Status / retest candidate |
| --- | --- | --- | --- | --- | --- |
| | | | | Blocker / minor / future feature | |

Attach console errors or screenshots where useful. A fixed issue remains **awaiting retest** until verified; never silently convert an old failure into a current pass.

## Release decision

- Candidate approved for publication:
- Unresolved blockers:
- Accepted minor issues / documented workarounds:
- Untested checks and explicit disposition:
- Tested platforms / Foundry 14 build:
- Reviewer / date:
- Public installation check (R7), after publishing:

Ready means passes 1–3 are accounted for, no blockers remain, and any untested optional/platform checks or accepted minor issues are recorded. R7 follows publication. Freeze new features during this pass; reopen only affected checks for subsequent fixes.
