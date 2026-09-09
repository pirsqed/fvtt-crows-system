import { test } from "node:test";
import assert from "node:assert/strict";
import { activeDefense, canEquip, woundCapacity, woundStats } from "../module/equipment-rules.mjs";
import { castSpell } from "../module/spellcasting.mjs";
import { CHAT_SCOPE, renderRollState } from "../module/chat-state.mjs";
import { fingerprint } from "../module/import-content.mjs";

globalThis.Actor = class { prepareDerivedData() {} };
globalThis.Item = class {};
Math.clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const { CrowsActor } = await import("../module/documents.mjs");
function actor(type, system, items = []) {
  const a = new CrowsActor();
  Object.assign(a, { type, system, items });
  items.get = id => items.find(i => i.id === id);
  a.update = async updates => {
    for (const [path, value] of Object.entries(updates)) {
      const keys = path.split('.'); let obj = a;
      for (const key of keys.slice(0, -1)) obj = obj[key];
      obj[keys.at(-1)] = value;
    }
    a.prepareDerivedData();
  };
  return a;
}

test("shields require hands, while ordinary equipped armor still works", () => {
  const shield = { name: "Wooden Shield", system: { isArmor: true, isEquipped: true, location: "hand1" } };
  assert.equal(activeDefense(shield), true);
  shield.system.location = "backpack1";
  assert.equal(activeDefense(shield), false);
  assert.equal(canEquip(shield), false);
  shield.name = "Grandfather's Protector"; shield.system.isShield = true;
  assert.equal(canEquip(shield), false);
  shield.system.location = "hand2";
  assert.equal(activeDefense(shield), true);
  shield.system.isEquipped = false;
  assert.equal(activeDefense(shield), false);
  assert.equal(activeDefense({ system: { isArmor: true, location: "backpack1" } }), true);
});

test("companion wounds use actual slot capacity and occupied wounds slow movement", async () => {
  const a = actor("monster", { type: "Animal", slots: 2, speed: "7, climb 4", stamina: { value: 2, max: 2 }, woundSlots: [] },
    [{ type: "equipment", system: { location: "backpack1" } }]);
  await a.applyAllocatedDamage({ damageTotal: 3, staminaDamage: 2, woundsCount: 1 });
  assert.deepEqual(a.system.woundSlots, [1]);
  assert.equal(a.system.derivedSpeed, "6, climb 3");
  assert.equal(a.system.isDead, false);
  await a.update({ "system.woundSlots": [2] });
  assert.equal(a.system.derivedSpeed, "7, climb 4");
  await a.applyAllocatedDamage({ woundsCount: 3 });
  assert.deepEqual(a.system.woundSlots, [1, 2]);
  assert.equal(a.system.isDead, true);
  const large = actor("monster", { type: "Animal", slots: 15, woundSlots: [], stamina: { value: 0, max: 2 } });
  await large.applyAllocatedDamage({ woundsCount: 12 });
  assert.equal(large.system.totalWounds, 12);
  assert.equal(large.system.isDead, false);
  assert.equal(woundCapacity({ type: "monster", system: { type: "Human", slots: 10 } }), 10);
  assert.equal(woundCapacity({ type: "monster", system: { type: "Blood", slots: 10 } }), 0);
  assert.equal(woundStats({ type: "monster", system: { type: "Blood", stamina: { value: 0 } }, items: [] }).isDead, true);
});

test("spending XP preserves total earned XP and flags overspending", () => {
  const a = actor("crow", { totalXP: 18, spentXP: 6, woundedSlots: {}, speed: 5 });
  a.prepareDerivedData();
  assert.equal(a.system.availableXP, 12);
  assert.equal(a.system.totalXP, 18);
  a.system.spentXP = 19; a.prepareDerivedData();
  assert.equal(a.system.xpOverspent, true);
  assert.equal(a.system.availableXP, 0);
});

test("new default fields do not make imported items look locally edited", () => {
  const item = { name: "Book", type: "equipment", system: { slots: 1 } };
  assert.equal(fingerprint(item), fingerprint({ ...item, system: { ...item.system, isShield: false, isSpellbook: false } }));
});

test("casting rolls Mind, updates reminders after expertise, and leaves usage dice manual", async () => {
  let natural = 8, formula;
  globalThis.game = { user: { targets: new Set() } };
  globalThis.ChatMessage = { getSpeaker: () => ({}) };
  globalThis.Roll = class {
    constructor(f) { formula = f; this.total = natural + 3; this.result = f; this.dice = [{ results: [{ result: natural / 2 }, { result: natural / 2 }] }]; }
    async evaluate() { return this; }
    async toMessage(data) { return data; }
  };
  const a = { uuid: "Actor.caster", name: "Crow", type: "crow", isOwner: true, system: { characteristics: { mind: 2 } } };
  const book = { parent: a, uuid: "Actor.caster.Item.book", name: "Flame", system: { isSpellbook: true, consumable: { currentUD: 2, maxUD: 2, tier1Effect: "Sparks" } } };
  const result = await castSpell(a, book, { modifier: 1 });
  assert.equal(formula, "2d10 + 3");
  assert.match(result.content, /Sparks/);
  assert.match(result.content, /1d6 for chaos/);
  const state = result.flags[CHAT_SCOPE].rollState;
  state.tier = 2; state.expertise = { label: "Arcana" };
  assert.doesNotMatch(renderRollState(state), /1d6 for chaos/);
  natural = 19;
  assert.match((await castSpell(a, book)).content, /Do not roll spellbook usage dice/);
  natural = 2;
  assert.match((await castSpell(a, book)).content, /backlash instead of the spell/);
  assert.equal(book.system.consumable.currentUD, 2);
  book.system.consumable.currentUD = 0;
  await assert.rejects(castSpell(a, book), /depleted/);
  a.isOwner = false;
  await assert.rejects(castSpell(a, book), /own the caster/);
});
