import { test } from "node:test";
import assert from "node:assert/strict";
import { canStack, stackAmount, goldStack, goldTotal, restoreUsageDice } from "../module/inventory.mjs";
import { CrowsLoot } from "../module/loot.mjs";
import { formatDamage } from "../module/chat-state.mjs";
import { repairImportIcons } from "../module/icon-repairs.mjs";
import { fingerprint } from "../module/import-content.mjs";

const gm = { id: "gm", isGM: true };
globalThis.game = { user: gm, users: { activeGM: gm, get: () => gm }, actors: [], scenes: [] };
globalThis.ui = { notifications: { warn() {} } };
globalThis.foundry = { utils: { setProperty: (o, key, value) => { o.system.location = value; } } };
const documents = new Map();
globalThis.fromUuid = async uuid => documents.get(uuid);
function actor(uuid, type = "crow") {
  const a = { uuid, name: uuid, type, system: { coins: 0 }, items: [], isOwner: true, testUserPermission: () => true };
  a.createEmbeddedDocuments = async (_, data) => data.map(raw => item(a, raw));
  a.updateEmbeddedDocuments = async (_, updates) => {
    for (const update of updates) await a.items.find(i => i.id === update._id).update(update);
  };
  a.update = async data => { if ("system.coins" in data) a.system.coins = data["system.coins"]; };
  documents.set(uuid, a);
  return a;
}
let nextId = 0;
function item(a, raw = goldStack(1)) {
  const i = { ...structuredClone(raw), id: String(++nextId), parent: a };
  i.uuid = `${a.uuid}.Item.${i.id}`;
  i.toObject = () => ({ name: i.name, type: i.type, system: structuredClone(i.system) });
  i.update = async data => {
    for (const [key, value] of Object.entries(data)) if (key.startsWith("system.")) i.system[key.slice(7)] = value;
  };
  i.delete = async () => { a.items.splice(a.items.indexOf(i), 1); documents.delete(i.uuid); };
  i.getFlag = (scope, key) => i.flags?.[scope]?.[key];
  a.items.push(i); documents.set(i.uuid, i);
  return i;
}
CrowsLoot._announce = CrowsLoot.cleanupIfEmpty = async () => {};

test("damage formatting preserves generated emphasis while escaping arbitrary HTML", () => {
  assert.equal(formatDamage('<strong>5 Damage</strong> <span class="formula" style="font-size: 0.85em; opacity: 0.85;">(4 + S)</span>'),
    '<strong>5 Damage</strong> <span class="formula">(4 + S)</span>');
  assert.equal(formatDamage('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.match(formatDamage('<strong onclick="bad()">oops</strong>'), /&lt;strong onclick=/);
  assert.match(formatDamage('<span class="formula" onclick="bad()">oops</span>'), /&lt;span class=.*oops/);
});

test("stacks ignore location and quantity but respect changed gear properties", () => {
  const a = actor("matching"), one = item(a, goldStack(30, "belt1")), two = item(a, goldStack(240, "backpack1"));
  assert.equal(canStack(one, two), true);
  assert.equal(stackAmount(one, two), 10);
  two.system.greedBonus = 10;
  assert.equal(canStack(one, two), false);
  delete two.system.greedBonus;
  two.system.consumable = { currentUD: 0, maxUD: 3 };
  assert.equal(canStack(one, two), false);
});

test("partial and competing merges conserve quantities and remove an exhausted source", async () => {
  const a = actor("merge"), source = item(a, goldStack(30)), target = item(a, goldStack(240, "belt1"));
  const payload = { itemUuid: source.uuid, targetItemUuid: target.uuid };
  await Promise.all([CrowsLoot._doStack(payload, "gm"), CrowsLoot._doStack(payload, "gm")]);
  assert.equal(source.system.quantity, 20);
  assert.equal(target.system.quantity, 250);
  assert.equal(goldTotal(a.items), 270);
  const third = item(a, goldStack(10, "belt2"));
  await CrowsLoot._doStack({ itemUuid: source.uuid, targetItemUuid: third.uuid }, "gm");
  assert.equal(documents.has(source.uuid), false);
  assert.equal(third.system.quantity, 30);
  assert.equal(goldTotal(a.items), 280);
});

test("gold planning reserves distinct slots and rejects insufficient space", () => {
  const a = actor("gold-plan");
  const plan = CrowsLoot.planGold(a, 601);
  assert.deepEqual(plan.map(i => i.system.quantity), [250, 250, 101]);
  assert.equal(new Set(plan.map(i => i.system.location)).size, 3);
  for (const location of ["belt1", "belt2", "belt3", "belt4", "hand1", "hand2", ...Array.from({ length: 10 }, (_, i) => `backpack${i + 1}`)]) item(a, goldStack(1, location));
  assert.equal(CrowsLoot.planGold(a, 1), null);
  assert.equal(CrowsLoot.findFreeSlot(a), null);
  assert.equal(CrowsLoot.fits(a, "ground"), false);
});

test("a full Crow inventory refuses pickups and displaced items without changing documents", async () => {
  const a = actor("full"), source = actor("floor", "loot");
  for (const location of ["belt1", "belt2", "belt3", "belt4", "hand1", "hand2", ...Array.from({ length: 10 }, (_, i) => `backpack${i + 1}`)]) item(a, goldStack(1, location));
  const incoming = item(source, goldStack(20));
  await CrowsLoot._doTransfer({ itemUuid: incoming.uuid, targetUuid: a.uuid }, "gm");
  assert.equal(documents.has(incoming.uuid), true);
  assert.equal(a.items.length, 16);
  // A two-slot item displacing two one-slot items cannot put both into its old magic slot.
  const large = item(a, { type: "equipment", name: "Large item", system: { slots: 2, location: "head" } });
  const before = a.items.map(i => i.system.location);
  await CrowsLoot.placeItem(a, large, "backpack1");
  assert.deepEqual(a.items.map(i => i.system.location), before);
});

test("adding the default gold field does not misclassify old imports as local edits", () => {
  const old = { type: "equipment", system: { quantity: 1 } };
  const upgraded = structuredClone(old);
  upgraded.system.isGold = false;
  assert.equal(fingerprint(old), fingerprint(upgraded));
  upgraded.system.isGold = true;
  assert.notEqual(fingerprint(old), fingerprint(upgraded));
});

test("interrupted balance conversion can retry without duplicating gold", async () => {
  const a = actor("legacy");
  a.system.coins = 300;
  game.actors = [a];
  const update = a.update;
  a.update = async () => { throw new Error("interrupted"); };
  await assert.rejects(CrowsLoot.migrateGold(), /interrupted/);
  assert.equal(goldTotal(a.items), 300);
  a.update = update;
  await CrowsLoot.migrateGold();
  await CrowsLoot.migrateGold();
  assert.equal(goldTotal(a.items), 300);
  assert.equal(a.system.coins, 0);
});

test("usage restoration requires ownership and completion confirmation", async () => {
  const a = actor("supplies"), i = item(a, { type: "equipment", name: "Lantern", system: { consumable: { currentUD: 0, maxUD: 3 } } });
  a.items.get = id => a.items.find(i => i.id === id);
  let changes = 0;
  i.update = async data => { assert.equal(data["system.consumable.currentUD"], 3); changes++; };
  const event = { preventDefault() {}, stopPropagation() {}, currentTarget: { dataset: { itemId: i.id } } };
  globalThis.Dialog = { confirm: async () => false };
  await restoreUsageDice(a, event);
  assert.equal(changes, 0);
  Dialog.confirm = async () => true;
  await restoreUsageDice(a, event);
  assert.equal(changes, 1);
  a.isOwner = false;
  await restoreUsageDice(a, event);
  assert.equal(changes, 1);
});

test("old generated icons are repaired recursively and custom icons are preserved", () => {
  const data = [{ img: "custom/my-icon.webp", items: [{ img: "icons/magic/unholy/skull-energy-purple.webp" }] }];
  repairImportIcons(data);
  assert.equal(data[0].img, "custom/my-icon.webp");
  assert.equal(data[0].items[0].img, "icons/magic/death/skull-energy-light-purple.webp");
});

test("multi-slot items can occupy belt slots and respect belt boundaries", async () => {
  const a = actor("belt-multi");
  assert.equal(CrowsLoot.fits(a, "belt1", 2), true);
  assert.equal(CrowsLoot.fits(a, "belt3", 2), true);
  assert.equal(CrowsLoot.fits(a, "belt4", 2), false);
  assert.equal(CrowsLoot.validAnchor(a, "belt4", 2), false);
  assert.deepEqual(CrowsLoot.spanFor("belt1", 2), ["belt1", "belt2"]);
  assert.deepEqual(CrowsLoot.spanFor("belt2", 3), ["belt2", "belt3", "belt4"]);

  const greatsword = item(a, { type: "equipment", name: "Greatsword", system: { slots: 2, location: "ground" } });
  await CrowsLoot.placeItem(a, greatsword, "belt1");
  assert.equal(greatsword.system.location, "belt1");
  assert.deepEqual(CrowsLoot.occupancy(a)["belt1"], greatsword);
  assert.deepEqual(CrowsLoot.occupancy(a)["belt2"], greatsword);
  assert.equal(CrowsLoot.fits(a, "belt2", 1), false);
  assert.equal(CrowsLoot.fits(a, "belt3", 1), true);
});

test("equipment items support shortDescription without crashing or length limit", () => {
  const a = actor("short-desc-test");
  const torch = item(a, {
    type: "equipment",
    name: "Torch",
    system: {
      slots: 1,
      shortDescription: "Sheds bright light in a 4-square radius for 1 hour."
    }
  });
  assert.equal(torch.system.shortDescription, "Sheds bright light in a 4-square radius for 1 hour.");
});



test('depleted supply counts and custom maximums survive transfer and drop-to-scene data', async () => {
  const source = actor('supply-source'), target = actor('supply-target');
  const quiver = item(source, { name: 'Fine Quiver', type: 'equipment', system: { quantity: 1, maxStack: 1, slots: 1, contentsType: 'arrows', contentsQuantity: 7, contentsMax: 40 } });
  const announce = CrowsLoot._announce;
  CrowsLoot._announce = async () => {};
  try {
    const moved = await CrowsLoot._doTransfer({ itemUuid: quiver.uuid, targetUuid: target.uuid }, 'gm');
    assert.equal(moved.system.contentsQuantity, 7);
    assert.equal(moved.system.contentsMax, 40);
    assert.equal(source.items.length, 0);
    const create = CrowsLoot.createLootToken;
    let placed;
    game.scenes = new Map([['scene', { id: 'scene' }]]);
    CrowsLoot.createLootToken = async ({ items }) => { placed = structuredClone(items[0]); return { delete: async () => {} }; };
    game.settings = { get: () => false };
    try { await CrowsLoot._dropToGroundQueued({ itemUuid: moved.uuid, sceneId: 'scene', x: 1, y: 1 }, 'gm'); }
    finally { CrowsLoot.createLootToken = create; }
    assert.equal(placed.system.contentsQuantity, 7);
    assert.equal(placed.system.contentsMax, 40);
    assert.equal(target.items.length, 0);
  } finally { CrowsLoot._announce = announce; }
});


test("extra belt slots support placement, automatic storage, and capacity boundaries", async () => {
  const a = actor("expanded-belt");
  item(a, { name: "Belt trait", type: "trait", system: { extraBeltSlots: 2, beltSlotNotes: "Tools only" } });
  for (let n = 1; n <= 4; n++) item(a, goldStack(1, `belt${n}`));
  assert.equal(CrowsLoot.findFreeSlot(a, 2), "belt5");
  assert.equal(CrowsLoot.fits(a, "belt5", 2), true);
  assert.equal(CrowsLoot.validAnchor(a, "belt6", 2), false);
  assert.equal(CrowsLoot.fits(a, "belt7", 1), false);
  const gear = item(a, { name: "Large tool", type: "equipment", system: { slots: 2, location: "backpack1" } });
  await CrowsLoot.placeItem(a, gear, "belt5");
  assert.equal(gear.system.location, "belt5");
  assert.equal(CrowsLoot.occupancy(a).belt6, gear);
  assert.equal(CrowsLoot.findFreeSlot(a), "hand1");
});

test("belt capacity defaults and occupied extent support safe shrinking", async () => {
  const { beltCapacity, occupiedBeltEnd } = await import("../module/inventory.mjs");
  assert.equal(beltCapacity(actor("default-belt")), 4);
  assert.equal(beltCapacity({ type: "crow", system: { extraBeltSlots: -1 } }), 4);
  assert.equal(beltCapacity({ type: "monster", system: { extraBeltSlots: 2 } }), 0);
  assert.equal(occupiedBeltEnd([
    { type: "equipment", system: { location: "belt5", slots: 2 } },
    { type: "equipment", system: { location: "backpack10", slots: 1 } }
  ]), 6);
});


test("trait updates and deletion protect occupied and subsequent belt grants", async () => {
  globalThis.Actor = class {};
  globalThis.Item = class { async _preUpdate() {} async _preDelete() {} };
  const { CrowsItem } = await import("../module/documents.mjs");
  const a = actor("trait-belt");
  const trait = new CrowsItem();
  Object.assign(trait, { id: "trait", name: "Alchemy Belt", type: "trait", parent: a,
    system: { extraBeltSlots: 1, beltSlotNotes: "Alchemy only" } });
  a.items.push(trait);
  item(a, { name: "Weapon belt", type: "trait", system: { extraBeltSlots: 1, beltSlotNotes: "Bashing only" } });
  const gear = item(a, { name: "Tool", type: "equipment", system: { location: "belt6", slots: 1 } });
  assert.equal(await trait._preUpdate({ "system.extraBeltSlots": 2 }, {}, gm), false);
  assert.equal(await trait._preUpdate({ system: { extraBeltSlots: 0 } }, {}, gm), false);
  assert.equal(await trait._preDelete({}, gm), false);
  assert.notEqual(await trait._preUpdate({ system: { extraBeltSlots: 1, beltSlotNotes: "Potions only" } }, {}, gm), false);
  gear.system.location = "backpack1";
  assert.notEqual(await trait._preUpdate({ "system.extraBeltSlots": 0 }, {}, gm), false);
  assert.notEqual(await trait._preDelete({}, gm), false);
  const occupied = new CrowsItem();
  Object.assign(occupied, { type: "equipment", actor: a, system: { location: "belt5", slots: 2 } });
  assert.deepEqual(occupied.getOccupiedSlots(), ["belt5", "belt6"]);
});

test("owned traits add labelled slots and ordinary traits leave capacity unchanged", async () => {
  const { beltSlotGrants, beltCapacity } = await import("../module/inventory.mjs");
  const a = actor("grants");
  item(a, { name: "Ordinary trait", type: "trait", system: {} });
  item(a, { name: "Alchemy Belt", type: "trait", system: { extraBeltSlots: 1, beltSlotNotes: "Alchemy items only" } });
  item(a, { name: "Weapon Belt", type: "trait", system: { extraBeltSlots: 2, beltSlotNotes: "Slashing weapons only" } });
  assert.equal(beltCapacity(a), 7);
  assert.deepEqual(beltSlotGrants(a).slice(4), [
    { source: "Alchemy Belt", restriction: "Alchemy items only" },
    { source: "Weapon Belt", restriction: "Slashing weapons only" },
    { source: "Weapon Belt", restriction: "Slashing weapons only" }
  ]);
  a.items.splice(1, 1);
  assert.equal(beltCapacity(a), 6);
  assert.equal(beltSlotGrants(a)[4].source, "Weapon Belt");
});
