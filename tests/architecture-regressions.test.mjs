import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateDamage, weaponDamage } from "../module/damage.mjs";
import { fits, validAnchor, spanFor } from "../module/inventory.mjs";
import { CrowsLoot } from "../module/loot.mjs";
import { CrowsChatActions } from "../module/chat-actions.mjs";
import { requestUsageDice } from "../module/sheets/inventory-actions.mjs";
import { damageSnapshot } from "../module/chat-state.mjs";

test("damage allocation conserves damage across reordered, excluded, and exhausted defenses", () => {
  const sources = [{ id: "shield", name: "Shield", ad: 3, maxAD: 3, active: true, enabled: true },
    { id: "armor", name: "Armor", ad: 5, maxAD: 5, active: true, enabled: true }];
  const original = structuredClone(sources);
  for (let amount = 0; amount <= 20; amount++) {
    const result = calculateDamage({ damageTotal: amount, tempAD: 2, stamina: 4, sources });
    assert.equal(result.tempADAbsorbed + result.itemAllocations.reduce((n, a) => n + a.absorbed, 0)
      + result.staminaDamage + result.woundsCount, amount);
    assert.ok(result.itemAllocations.every(a => a.newDefense >= 0));
  }
  assert.deepEqual(sources, original);
  const result = calculateDamage({ damageTotal: 6, tempAD: 5, useTempAD: false, stamina: 2,
    sources: [{ ...sources[1], enabled: false }, sources[0]] });
  assert.equal(result.tempADAbsorbed, 0);
  assert.equal(result.itemAllocations[0].itemId, "shield");
  assert.equal(result.staminaDamage, 2);
  assert.equal(result.woundsCount, 1);
  assert.throws(() => calculateDamage({ damageTotal: NaN }), /whole/);
});

test("weapon damage displays and applies the same selected characteristic, preserving manual prose", () => {
  const chars = { strength: 3, agility: 1, mind: -2 };
  for (const [text, selected, amount] of [["4 + S", "strength", 7], ["4 + A or S", "agility", 5],
    ["4 + A or S", "mind", 7], ["1 + M", "mind", 0], ["6 damage (Bleed)", "strength", 6]]) {
    const result = weaponDamage(text, chars, selected);
    assert.equal(result.amount, amount);
    assert.match(result.display, new RegExp(`<strong>${amount} Damage</strong>`));
  }
  assert.deepEqual(weaponDamage("Push 2 spaces", chars), { amount: 0, display: "Push 2 spaces" });
  assert.equal(weaponDamage("6 damage (Bleed)", chars).display, "<strong>6 Damage</strong> (Bleed)");
});

test("placement rejects unknown, zero, overflow, and oversized magic anchors consistently", () => {
  const actor = { type: "crow", items: [], system: {} };
  for (const [location, count] of [["chest-anything", 1], ["backpack0", 1], ["backpack10", 2],
    ["belt4", 2], ["ring", 2], ["hand2", 2], ["backpack1", -1]]) {
    assert.equal(validAnchor(actor, location, count), false);
    assert.equal(fits(actor, location, count), false);
  }
  actor.items.push({ id: "large", type: "equipment", system: { location: "backpack2", slots: 3 } });
  assert.equal(fits(actor, "backpack1", 2), false);
  assert.equal(fits(actor, "backpack5", 2), true);
  assert.deepEqual(spanFor("backpack2", 3), ["backpack2", "backpack3", "backpack4"]);
});

function world() {
  const gm = { id: "gm", isGM: true }, player = { id: "player", isGM: false }, stranger = { id: "stranger" };
  const docs = new Map(), tokens = [];
  const actor = { uuid: "Actor.crow", type: "crow", name: "Crow", isOwner: true,
    system: { stamina: { value: 10 } }, testUserPermission: user => user.id === "player",
    toObject() { return { system: structuredClone(this.system) }; } };
  const items = new Map();
  actor.items = items;
  Object.defineProperty(items, "contents", { get: () => [...items.values()] });
  docs.set(actor.uuid, actor);
  const scene = { id: "scene", grid: { size: 100 } };
  globalThis.fromUuid = async uuid => docs.get(uuid);
  globalThis.game = { user: gm, users: { activeGM: gm, get: id => ({ gm, player, stranger })[id] },
    scenes: new Map([[scene.id, scene]]), settings: { get: () => false } };
  globalThis.ui = { notifications: { warn() {} } };
  globalThis.ChatMessage = { getSpeaker: () => ({}) };
  const addItem = (id, location = "backpack1") => {
    const item = { id, uuid: `${actor.uuid}.Item.${id}`, type: "equipment", name: id, parent: actor,
      system: { location, consumable: { currentUD: 3, maxUD: 3 } },
      toObject() { return { name: id, system: structuredClone(this.system) }; },
      async update(data) { this.system.consumable.currentUD = data['system.consumable.currentUD']; },
      async delete() { docs.delete(this.uuid); items.delete(id); } };
    docs.set(item.uuid, item); items.set(id, item); return item;
  };
  return { actor, docs, addItem, scene, tokens };
}

test("backpack failure creates no item loss, and a partial scatter preserves total inventory", async () => {
  for (const failedAt of [0, 1]) {
    const { actor, addItem, scene, tokens } = world();
    const first = addItem("a"), second = addItem("b");
    const original = CrowsLoot.createLootToken;
    let attempts = 0;
    CrowsLoot.createLootToken = async ({ items }) => {
      if (attempts++ === failedAt) return null;
      const token = { name: items[0].name, delete: async () => tokens.splice(tokens.indexOf(token), 1) };
      tokens.push(token); return token;
    };
    try {
      await assert.rejects(CrowsLoot._execute("dropBackpack", { actorUuid: actor.uuid,
        itemUuids: [first.uuid, second.uuid], x: 0, y: 0, sceneId: scene.id }, "player"), /Scattering stopped/);
      assert.equal(actor.items.size + tokens.length, 2);
      assert.equal(tokens.length, failedAt);
      if (failedAt) await assert.rejects(CrowsLoot._execute("dropBackpack", { actorUuid: actor.uuid,
        itemUuids: [first.uuid, second.uuid], x: 0, y: 0, sceneId: scene.id }, "player"), /backpack changed/);
    } finally { CrowsLoot.createLootToken = original; }
  }
});

test("backpack deletion failure rolls back that item's token and competing scatters cannot copy it twice", async () => {
  const { actor, addItem, scene, tokens } = world();
  const item = addItem("a"), original = CrowsLoot.createLootToken;
  CrowsLoot.createLootToken = async () => {
    const token = { delete: async () => tokens.splice(tokens.indexOf(token), 1) }; tokens.push(token); return token;
  };
  const request = { actorUuid: actor.uuid, itemUuids: [item.uuid], x: 0, y: 0, sceneId: scene.id };
  try {
    const remove = item.delete;
    item.delete = async () => { throw new Error("delete failed"); };
    await assert.rejects(CrowsLoot._execute("dropBackpack", request, "player"), /delete failed/);
    assert.equal(tokens.length, 0); assert.equal(actor.items.size, 1);
    item.delete = remove;
    const results = await Promise.allSettled([CrowsLoot._execute("dropBackpack", request, "player"), CrowsLoot._execute("dropBackpack", request, "player")]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(tokens.length, 1); assert.equal(actor.items.size, 0);
  } finally { CrowsLoot.createLootToken = original; }
});

test("usage checks coordinate competing clients and suppress overlapping local clicks", async () => {
  const { actor, addItem } = world(), item = addItem("torch");
  let rolls = 0;
  globalThis.Roll = class {
    constructor() { rolls++; this.dice = [{ results: [{ result: 1 }, { result: 4 }, { result: 5 }] }]; }
    async evaluate() { await Promise.resolve(); }
    async toMessage() {}
  };
  const request = { action: "usage-dice", itemUuid: item.uuid, expected: 3 };
  await assert.rejects(CrowsChatActions.execute(request, "stranger"), /permission/);
  const results = await Promise.allSettled([CrowsChatActions.execute(request, "player"), CrowsChatActions.execute(request, "player")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(item.system.consumable.currentUD, 2); assert.equal(rolls, 1);
  const event = { preventDefault() {}, currentTarget: { dataset: { itemId: item.id } } };
  await Promise.all([requestUsageDice(actor, event), requestUsageDice(actor, event)]);
  assert.equal(rolls, 2);
  assert.equal(item.system.consumable.currentUD, 1);
});

test("sheet damage requests reject stale snapshots and only one competing allocation applies", async () => {
  const { actor } = world();
  actor.applyAllocatedDamage = async allocation => { actor.system.stamina.value -= allocation.damageTotal; return allocation; };
  const request = { action: "allocate-damage", actorUuid: actor.uuid, snapshot: damageSnapshot(actor), allocation: { damageTotal: 2 } };
  await assert.rejects(CrowsChatActions.execute(request, "stranger"), /permission/);
  const results = await Promise.allSettled([CrowsChatActions.execute(request, "player"), CrowsChatActions.execute(request, "player")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(actor.system.stamina.value, 8);
  await assert.rejects(CrowsChatActions.execute(request, "player"), /target changed/);
});

test("coordinated damage recomputes armor balances instead of trusting submitted totals", async () => {
  const { actor, addItem } = world();
  const armor = addItem("armor");
  Object.assign(armor.system, { isArmor: true, isEquipped: true, armor: { defense: 3, maxDefense: 3 } });
  let applied;
  actor.applyAllocatedDamage = async allocation => { applied = allocation; return allocation; };
  const request = { action: "allocate-damage", actorUuid: actor.uuid, snapshot: damageSnapshot(actor),
    allocation: { damageTotal: 5, staminaDamage: 999, woundsCount: 999,
      itemAllocations: [{ itemId: armor.id, absorbed: -20, newDefense: 999 }] } };
  await CrowsChatActions.execute(request, "player");
  assert.equal(applied.itemAllocations[0].newDefense, 0);
  assert.equal(applied.staminaDamage, 2);
  assert.equal(applied.woundsCount, 0);
  await assert.rejects(CrowsChatActions.execute({ ...request, allocation: { damageTotal: -1 } }, "player"), /positive whole/);
});
