# Changelog

## Unreleased

- Route backpack scattering through ordinary coordinated transfers, retaining unmoved items if scattering stops.
- Coordinate usage-dice checks and sheet damage with chat actions; reject stale resource requests and overlapping local usage clicks.
- Add Ref reconciliation controls for pending or uncertain chat actions, including an audit note and explicit applied/cancelled outcomes. Reconciliation never reapplies resource changes.
- Share damage calculation, weapon damage parsing, slot validation, expertise definitions, and inventory controls. Separate the damage dialog and Miasma behavior from actor documents and sheets.
- Reject unknown inventory anchors and avoid interpreting numbers embedded in non-damage prose as damage. Preserve reference text for manual resolution.
- Refresh affected sheets once per document-hook burst, and run regression tests before packaging tagged releases.

## 0.2.2 — prepared

- Import Ref book RollTables with Crows PDF Importer v0.1.1, including reviewed updates and preservation of local edits.
- Drag owned weapons, spellbooks, monster attacks, and reference items to the hotbar. Shortcuts reuse existing macros and check ownership, equipment availability, and stale items before rolling.
- Keep item-card location and DC badges at the bottom-right corner.
- Refresh the user guide with sheet screenshots and separate legacy builder instructions. Clarify spellbook casting, separate usage checks, and the remaining manual steps.

Requires Foundry 14. Pair with Crows PDF Importer v0.1.1 for Ref table imports. Travel-branch features are deferred. No PDFs or extracted game content are bundled.

## 0.2.1 — prepared

This system release adds the integration needed by the companion Crows PDF Importer module. The Ref selects their own playtest PDFs in a browser, chooses entries, reviews the changes, and imports them into world compendiums. A successful complete import can publish backgrounds, NPC connections, and starting kits for Create a Crow.

- Start Here and Import Playtest Content guide the Ref to install and enable the companion module.
- Re-import reviews distinguish new, updated, unchanged, and preserved entries. Local edits and custom artwork are preserved by default; force overwrite is an explicit reviewed option.
- The character creator reads published module content, including backgrounds and starting kits.
- The documentation and release checklist cover the paired system/module workflow.

Requires Foundry 14, Crows PDF Importer v0.1.0, and the user's own supported playtest packet. The importer module must be available before this release is published. Neither the packet nor extracted game content ships with the system.
