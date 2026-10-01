import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.ActorSheet = class { async getData() { return {}; } };
globalThis.TextEditor = { enrichHTML: async text => text };
const { CrowsMonsterSheet } = await import("../module/sheets/monster-sheet.mjs");

function fixture(type = "Animal") {
  const sheet = new CrowsMonsterSheet();
  sheet.isEditable = true;
  const item = { type: "equipment", system: { location: "backpack2", slots: 2 } };
  sheet.actor = {
    type: "monster", isOwner: true,
    system: { type, slots: 4, woundSlots: [3] },
    items: [{ ...item, toObject: () => structuredClone(item) }],
    toObject() { return { system: structuredClone(this.system) }; },
    async update(data) { this.system.woundSlots = data["system.woundSlots"]; }
  };
  return sheet;
}

test("NPC inventory exposes wound controls for empty slots and every slot under a large item", async () => {
  const data = await fixture().getData();
  assert.deepEqual(data.inventorySlots.map(slot => slot.slotsCovered), [
    [{ slotNum: 1, isWounded: false }],
    [{ slotNum: 2, isWounded: false }, { slotNum: 3, isWounded: true }],
    [{ slotNum: 4, isWounded: false }]
  ]);
  assert.equal(data.inventorySlots[1].isWounded, true);
  const unsupported = await fixture("Undead").getData();
  assert.equal(unsupported.hasWounds, false);
  assert.ok(unsupported.inventorySlots.every(slot => slot.slotsCovered.length === 0));
});

test("slot wound toggles preserve other wounds and reject invalid or unauthorized changes", async () => {
  const sheet = fixture();
  const toggle = slotNum => sheet._onToggleWound({ preventDefault() {}, stopPropagation() {}, currentTarget: { dataset: { slotNum } } });
  await toggle("2");
  assert.deepEqual(sheet.actor.system.woundSlots, [2, 3]);
  await toggle("3");
  assert.deepEqual(sheet.actor.system.woundSlots, [2]);
  for (const invalid of ["0", "5", "1.5", "bad"]) await toggle(invalid);
  sheet.isEditable = false;
  await toggle("2");
  sheet.isEditable = true;
  sheet.actor.isOwner = false;
  await toggle("2");
  assert.deepEqual(sheet.actor.system.woundSlots, [2]);
});
