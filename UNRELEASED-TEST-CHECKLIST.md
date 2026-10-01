# Next release verification — Foundry 14

Scope: changes since `v0.2.2`, including the merged travel helper, session fixes, resource-action refactor, and descending wound placement. Release candidate: system v0.2.3 with importer v0.1.2. The older [release checklist](RELEASE-TEST-CHECKLIST.md) remains available for broader importer and gameplay coverage.

Leave boxes unchecked until verified on this candidate. Record failures and retest after fixes. Automated tests do not replace the live multiplayer checks below.

## Test setup and evidence

- Candidate commit (and any uncommitted changes):
- Foundry build / importer version / playtest packet:
- Test date / testers / browsers:
- Fresh world / backed-up copy of an existing world:
- Failure log: check name, user role, reproduction steps, expected/actual result, console error, fix and retest result.

Use a Ref, an ordinary Player, and a Trusted Player in separate sessions. Give players different owned Crows; also include a dead Crow, Human/Animal NPCs with different slot capacities, another NPC type, and an unlinked scene token. Use disposable actors for damage, transfers, and failure recovery.

## 1. Upgrade and opening smoke test

- [ ] Open a copy of an existing v0.2.2 world and a fresh world. No startup errors; existing actors, inventories, expertise values, wounds, journals, macros, and ownership survive reload.
- [ ] Open Crow, NPC, item, loot, and village sheets; open damage, character creation, travel, and the dungeon timer. Controls remain readable at the usual window size, and scrolling does not hide required actions.
- [ ] With the compatible PDF importer enabled, open Start Here and import a small content sample. Repeat without the module enabled: the guide explains how to install/enable it. Existing imported content remains usable.

## 2. Travel: roster, roles, and Ref control

- [ ] Open Travel from Actors and settings; reopen and reload during a day. Everyone sees saved progress, and only the Ref can start/advance the day or edit Ref-only totals.
- [ ] Living Crows appear first, then the actor-free traveler input, then collapsed other actors. Dead actors are excluded. Add/remove an NPC and a named traveler; ordinary players cannot control someone else's actor or the Ref-controlled named traveler.
- [ ] Choose pace, including player votes. Roles appear on Choose roles, not Choose pace. Assign/reassign roles: rows stay sorted by character name. Owners can edit their records; the Ref can override assignments and leave roles vacant.
- [ ] Apply and reverse each participant's hex, travel EN, and rest EN adjustment. Both their recorded contribution and the overview change once. Direct overview edits remain independent. Changing pace updates untouched defaults while preserving manual totals.
- [ ] Enter freeform result/outcome text, then revisit later steps. Text remains available and does not automatically change totals. Remove an adjusted traveler: totals remain for the Ref to arbitrate rather than silently reversing a ruling.
- [ ] Toggle lost status, edit notes, and set a Ref override outside the usual EN range. Overview and later journal preview reflect the saved values without forcing a by-the-book outcome.

## 3. Travel: references, checks, and ending a day

- [ ] Open and roll both Minor and Major Interesting Things from imported Ref Tables with no world copies. Add a matching world table: the reference uses that override. Missing tables show useful guidance without blocking travel.
- [ ] Confirm page references against the current packet. Role references are relevant to roles; travel/rest provide the world-table picker and import reminder; other steps do not repeat the picker.
- [ ] Roll travel and rest EN checks with different thresholds. Each uses its own EN, posts the correct chat label, and adds a separate record. A qualifying 10 reports an immediate encounter without deciding monsters or other consequences.
- [ ] Add, edit, and delete encounter records. Only the intended helper record changes; earlier chat rolls remain intact. With two Ref windows open, a stale deletion cannot remove a different entry.
- [ ] At Explore destination, continue to rest or conclude without resting. On the final page, both Next day and Finish Travel work. Finishing after rest is possible; the removed dungeon-timer button is absent.
- [ ] Rest/Miasma reminders remain useful without automatically healing, consuming supplies, or resolving Miasma. Character-sheet Miasma controls still work. Cancel is easy to find and does not save a completed-day journal entry.

## 4. Travel journal and multiplayer persistence

- [ ] Preview a day with mixed roles, positive/negative modifiers, direct Ref adjustments, lost status, travel/rest checks, role outcomes, and multiline notes. The preview accounts for base values, role contributions, other adjustments, and final totals; hex allowance is not presented as actual distance traveled.
- [ ] Click Next day: exactly one page saves before the daily reset. Party/progress for the next day are sensible. Finish Travel also saves exactly once, including the latest notes typed immediately before clicking.
- [ ] Reopen/reload after saving and start another trip. Previous pages and player edits remain unchanged; days of one trip stay in its titled journal, and a new trip gets its own journal starting at Day 1. Verify title, starting location, goals, and notes appear on the opening page. In a disposable world, simulate a journal-save failure: the day remains recoverable, and retry does not duplicate its page.
- [ ] By default, ordinary and Trusted Players can read and edit the journal. Switch to Trusted Player editing: ordinary players retain read access but cannot edit; Trusted Players retain editing access. Check existing pages, newly saved pages, a newly added user, and a changed user role after reconnect/reload. Switching back restores ordinary-player editing access. Live travel notes remain shared, not private Ref notes.
- [ ] Edit from owner and Ref sessions, close/reopen the helper, and reconnect a player. Updates arrive without dropping saved records. With the active Ref disconnected, requests fail clearly without pretending to save; reconnect permits recovery.

## 5. Damage, wounds, and coordinated resources

- [ ] Apply chat damage through temporary AD, multiple armor sources in a chosen order, Stamina, and wounds. Preview, actor values, and chat outcome agree. Repeat via the sheet damage control and with an unlinked token.
- [ ] On a Crow, apply three wounds with slot 9 already wounded: new wounds go to 10, 8, then 7. On a Human/Animal NPC, placement starts at its configured highest slot. Already wounded slots are skipped and excess wounds do not create invalid slots.
- [ ] Move a wound manually after damage. An occupied wounded slot affects speed correctly; clearing/moving it updates the result. Death state still follows capacity. Other NPC types do not acquire Crow-style backpack wounds.
- [ ] Change AD/Stamina or ownership while a damage dialog is open: confirmation rejects stale or unauthorized changes and requires a fresh review. Two clients applying the same chat damage do not spend resources twice.
- [ ] Run usage checks from Crow and NPC inventories; compare rolled pool, remaining dice, depletion, and chat. Rapid double clicks and competing clients do not spend the same stale pool twice. Restore dice and retry normally.
- [ ] Apply/undo Crow expertise around an eligible attack or casting roll. Uses, tier, and effect text stay consistent; doom/top-tier/resolved-action restrictions and Ref-only undo still apply.
- [ ] In a disposable world, exercise pending/uncertain chat-action recovery. Only the Ref can reconcile, acknowledgement is required, and the review note is retained. Record Applied/Cancelled changes the card without reapplying, healing, spending, or refunding resources; check actor values before and after.

## 6. Inventory and shared-sheet regression checks

- [ ] Scatter a backpack with several items and worn armor. Each eligible item moves once; worn armor stays. Test as owning player with an active Ref. In a disposable world, interrupt a transfer: moved items remain on the map, remaining items stay in the backpack, and retrying the old list cannot duplicate them.
- [ ] Move single- and multi-slot items between valid locations on Crow/NPC sheets. Invalid anchors, insufficient space, and lack of ownership are rejected without losing items. NPC slot ranges, quantity controls, usage controls, and reference-to-chat controls display and work correctly.
- [ ] Add, rename, annotate, spend, recover, and delete NPC custom expertises; edit current/max values and reload. Values remain bounded and persist; non-owners cannot edit. Apply standard and custom NPC expertises from new characteristic-test and attack chat cards; check duplicate-click protection and Ref undo. Older cards retain their original controls.
- [ ] Create a Crow from imported content, including a starting kit that grants extra belt slots. Verify kit placement and overflow, quantities, pet, and expertise. Step changes/errors reveal the relevant content; ordinary edits retain scroll/focus without jumping around.
- [ ] Roll attacks with numeric and formula damage, plus reference prose containing numbers. Formulas resolve correctly; prose remains reference text rather than accidentally becoming damage. Smoke-test existing hotbar weapon/book/NPC attack shortcuts.
- [ ] Use Miasma chat controls with the actor sheet closed, then reopen it. Cruelty/effect results remain correct. Cast a spell and run Chaos: reminders and results still appear after the shared-code refactor.
- [ ] Keep affected sheets open in two clients while updating items/resources. Both refresh to current values without repeated disruptive rerenders or lost input.

## 7. Release preparation and final sign-off

- [ ] Run `node --test tests/*.test.mjs` and `python -m unittest discover -s tests -p test_release_package.py` on the final candidate. Record totals, explain any skips, and resolve failures.
- [ ] Update Unreleased notes to include travel/journaling, NPC expertise/session fixes, and descending wounds. Clarify the manual's wound-order description and link the travel guide from the user-facing docs. Keep deferred hireling/NPC/refinement work in TODO, not in the supported-feature claims.
- [ ] Commit the wound fix and release documentation, review the complete diff, and select the release version. Align manifest version, download URL, changelog, and eventual tag; confirm Foundry/importer compatibility.
- [ ] Build the ZIP with `python tools/build_release.py`. Inspect it for the new modules, templates, styles, and docs, and for absence of private PDFs/extracted content/artwork. Install that ZIP in a clean setup and repeat opening, damage, and one travel-day/journal smoke test.
- [ ] Record unresolved issues and decide which block release. Confirm the exact tested commit is the one tagged/published; verify the published manifest and download after publication.

Visual refinement and hireling markers may remain deferred. Lost or duplicated resources, unauthorized edits/journal access, unsaved travel days, broken existing worlds, or a broken packaged install should block release.
