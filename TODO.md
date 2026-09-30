# Release backlog

These are plans, not features you can use yet. For the current behavior, see [Playing the playtest](MANUAL-PLAY.md).

## Next major release

- [ ] Refine the travel helper after more table play.
  - Smooth the Ref and player flows, reducing repeated entry, unnecessary clicks, and disruptive refreshes.
  - Review step layout, references, and journal previews against actual session feedback.
  - Playtest shared editing and journal visibility with multiple connected players.
  - Keep outcomes Ref-controlled and avoid adding task-specific automation while the rules are in playtest.

- [ ] Complete the internal `monster` → `npc` rename (the visible sheet is already labeled NPC).
  - Rename the saved actor type, data model, sheet class/files, templates, CSS selectors, and internal APIs together.
  - Migrate existing world actors, unlinked scene-token data, and compendium actors without changing document IDs or breaking references.
  - Preserve or migrate saved sheet selections and world sheet defaults.
  - Update the PDF importer, pet creation, equipment/attack/loot rules, token attributes, macros, and tests; support older imported/exported actor data.
  - Make migration versioned and safe to rerun, with backup/recovery guidance and checks for existing worlds and fresh imports.

- [x] Add a travel journal with a saved entry for each day, populated from the travel helper’s results, adjustments, notes, and encounters before its daily reset.

- [ ] Add a hireling marker to the NPC sheet so hirelings can be identified in traveler selection.


- [ ] Add drag-and-drop merging of compatible item stacks.
  - Respect maximum stack sizes and leave any remainder in the source stack (for example, 8 onto 7 with a maximum of 10 leaves source 5, destination 10).
  - Reject full destinations and incompatible item properties, including different greed bonuses or usage dice; keep supply holders separate.
  - Support merging within an inventory, between owned actors, and with unlocked loot, with permission checks and no lost or duplicated items.
  - Verify GM and player behavior before documenting stack merging as supported.

- [ ] Add item-driven lighting for torches, lanterns, and other light sources.
  - Provide a Light / Extinguish toggle on light-producing items.
  - Configure illumination range, color, and animation per item, using the playtest rules for ranges and fuel.
  - Update the carrying token's illumination when a light is lit or extinguished.
  - Connect usage-die fuel depletion to extinguishing the light.
  - Keep dropped lit items illuminating their ground location; transfer the light when picked up.
  - Support magical light sources with appropriate appearance and duration.

Logged 2026-09-12. Scope and implementation details to be refined before development.
