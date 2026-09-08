import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.Actor = class { prepareDerivedData() {} };
globalThis.Item = class { prepareDerivedData() {} };
globalThis.ActorSheet = class { async getData() { return structuredClone(this.context); } };
globalThis.TextEditor = { enrichHTML: async text => text };
Math.clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const { CrowsActor, CrowsItem } = await import("../module/documents.mjs");
const { CrowsActorSheet } = await import("../module/sheets/actor-sheet.mjs");
const { CrowsMonsterSheet } = await import("../module/sheets/monster-sheet.mjs");

test("custom speed uses occupied wound penalties and honors zero", () => {
  const actor = new CrowsActor();
  actor.type = "crow";
  actor.system = { speed: 8, woundedSlots: { slot1: true, slot2: true, slot3: true } };
  actor.items = [{ type: "equipment", system: {}, getOccupiedSlots: () => ["backpack1", "backpack2"] }];
  actor.prepareDerivedData();
  assert.equal(actor.system.derivedSpeed, 6);
  assert.equal(actor.system.speed, 8);
  actor.system.speed = 0;
  actor.prepareDerivedData();
  assert.equal(actor.system.derivedSpeed, 0);
  delete actor.system.speed;
  actor.prepareDerivedData();
  assert.equal(actor.system.derivedSpeed, 3);
});

test("inferring maximum usage dice never refills an explicitly depleted item", () => {
  const item = new CrowsItem();
  item.type = "equipment";
  item.system = { consumable: { usageDice: "3d6", maxUD: 0, currentUD: 0 } };
  item.prepareDerivedData(); item.prepareDerivedData();
  assert.equal(item.system.consumable.maxUD, 3);
  assert.equal(item.system.consumable.currentUD, 0);
});

test("both sheets refuse to roll depleted usage dice", async () => {
  let warnings = 0;
  globalThis.ui = { notifications: { warn: () => warnings++ } };
  globalThis.Roll = class { constructor() { throw new Error("Depleted item must not roll"); } };
  for (const Sheet of [CrowsActorSheet, CrowsMonsterSheet]) {
    const sheet = new Sheet();
    sheet.actor = { items: new Map([["item", { name: "Torch", system: { consumable: { currentUD: 0, maxUD: 3 } } }]]) };
    await sheet._onRollUsageDice({ preventDefault() {}, currentTarget: { dataset: { itemId: "item" } } });
  }
  assert.equal(warnings, 2);
});

test("greed tiers reach character inventory and storage templates", async () => {
  const items = [10, 20, 30].map((greedBonus, index) => {
    const item = new CrowsItem();
    item.type = "equipment";
    item.system = { greedBonus, cost: 100, location: ["hand1", "backpack1", "stash"][index] };
    item.prepareDerivedData();
    return [String(index), item];
  });
  const sheet = new CrowsActorSheet();
  sheet.actor = { system: {}, items: new Map(items) };
  sheet.context = { items: items.map(([id, item]) => ({ _id: id, type: item.type, system: item.system })) };
  const data = await sheet.getData();
  assert.equal(data.handSlots[0].item.greedTier, "bronze");
  assert.equal(data.backpackSlots[0].item.greedTier, "silver");
  assert.equal(data.inventoryList.stash[0].greedTier, "gold");
  assert.equal(data.inventoryList.stash[0].effectiveCost, 130);
});
