import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CHARACTERISTICS, CREATOR_SCOPE, assignCharacteristics, backgroundFromDice, primaryChoices,
  validateBackgrounds, buildCrowPlan, persistCrowPlan } from "../module/character-creation.mjs";

const background = { name: "Test background", roll: "1-1", blurb: "", characteristicAt2: ["Mind"], stamina: 7,
  trait: { tree: "General", name: "Test trait" }, expertises: [{ name: "Handle Pet", uses: 2 }],
  equipment: [{ name: "Lore Book", quantity: 2, note: "Subject A, Subject B" }], pets: ["Test pet"], extraGold: 50,
  startingKit: [{ name: "Ration", quantity: 6 }, { name: "Knife", quantity: 2 }, { name: "Lore Book", quantity: 2 }] };
const draft = { name: "Crow", feature: "A scar", connectionName: "Friend", relationship: "Mentor",
  connection: "Test benefit", primary: "mind", secondary: "agility", spread: "balanced", gold: 11, traitChoice: "" };
const fixtures = () => ({ background: structuredClone(background), draft: { ...draft }, userId: "user",
  equipment: [ { name: "Ration", type: "equipment", system: { slots: 1, maxStack: 3 } },
    { name: "Knife", type: "equipment", system: { slots: 1, maxStack: 2, isWeapon: true } },
    { name: "Lore Book", type: "equipment", system: { slots: 1, maxStack: 1 } } ],
  traits: [{ name: "Test trait", type: "trait", system: { tree: "General", description: "Test text" } }],
  monsters: [{ _id: "source-pet", name: "Test pet", type: "monster", system: {}, items: [{ _id: "source-attack", name: "Attack", type: "attack", system: {} }] }],
  connections: [{ name: "Test benefit", description: "Benefit text" }] });

test("ordered d6 lookup distinguishes 1,2 from 2,1 and rejects impossible dice", () => {
  const first = { roll: "1-2" }, second = { roll: "2-1" };
  assert.equal(backgroundFromDice([first, second], [1, 2]), first);
  assert.equal(backgroundFromDice([first, second], [2, 1]), second);
  assert.throws(() => backgroundFromDice([], [0, 7]));
});

test("all allowed characteristic assignments have the correct spread and preserve the background's 2", () => {
  for (const allowed of [["Mind"], ["Agility", "Strength"], ["Any"]]) {
    const b = { characteristicAt2: allowed };
    for (const primary of primaryChoices(b)) for (const secondary of CHARACTERISTICS.filter(key => key !== primary)) {
      for (const spread of ["balanced", "focused"]) {
        const stats = assignCharacteristics(b, primary, spread, secondary);
        assert.equal(stats[primary], 2);
        assert.deepEqual(Object.values(stats).sort((a, b) => a - b), spread === "balanced" ? [0, 1, 2] : [-1, 2, 2]);
      }
    }
  }
  assert.throws(() => assignCharacteristics(background, "strength", "balanced", "agility"));
  assert.throws(() => assignCharacteristics(background, "mind", "focused", "mind"));
});

test("starting kit retains quantities, distinct lore subjects, expertise pools, and background gold", () => {
  const input = fixtures(), original = structuredClone(input), plan = buildCrowPlan(input);
  assert.deepEqual(input, original, "planning must not mutate source packs");
  assert.equal(plan.gold, 61);
  assert.equal(plan.crow.system.coins, 0, "gold is represented once in equipment");
  assert.deepEqual(plan.crow.system.expertises.handlePet, { value: 2, max: 2 });
  assert.equal(plan.crow.items.filter(i => i.name === "Ration").length, 2);
  assert.equal(plan.crow.items.find(i => i.name === "Knife").system.quantity, 2);
  assert.deepEqual(plan.crow.items.filter(i => i.name === "Lore Book").map(i => i.flags[CREATOR_SCOPE].kitNote), ["Subject A", "Subject B"]);
  assert.equal(plan.pets[0]._id, undefined);
  assert.equal(plan.pets[0].items[0]._id, undefined);
});

test("invalid choices and missing content cannot produce a partial crow plan", () => {
  for (const gold of [null, 2, 19, 3.5, NaN]) assert.throws(() => buildCrowPlan({ ...fixtures(), draft: { ...draft, gold } }), /gold/);
  assert.throws(() => buildCrowPlan({ ...fixtures(), traits: [] }), /Missing trait/);
  assert.throws(() => buildCrowPlan({ ...fixtures(), monsters: [] }), /Missing monster/);
  assert.throws(() => buildCrowPlan({ ...fixtures(), equipment: [] }), /Missing equipment/);
  assert.throws(() => buildCrowPlan({ ...fixtures(), draft: { ...draft, connection: "unknown" } }), /benefit/);
  assert.throws(() => buildCrowPlan({ ...fixtures(), draft: { ...draft, name: " " } }), /name/);
});

test("biography escapes text supplied by players", () => {
  const plan = buildCrowPlan({ ...fixtures(), draft: { ...draft, feature: '<img src=x onerror="alert(1)">' } });
  assert.ok(!plan.crow.system.biography.includes("<img"));
  assert.ok(plan.crow.system.biography.includes("&lt;img"));
});

test("creation needs no village name and preserves multiline NPC relationships", () => {
  const plan = buildCrowPlan({ ...fixtures(), draft: { ...draft, relationship: 'Mentor\nHelped me <learn>.' } });
  assert.ok(plan.crow.system.biography.includes('Mentor<br>Helped me &lt;learn&gt;.'));
  assert.ok(!plan.crow.system.biography.includes('Home:'));
  assert.ok(!('village' in plan.crow.flags[CREATOR_SCOPE].creation));
});

test("batch creation links pets and preserves ownership without copying source IDs", async () => {
  let call, count = 0;
  class FakeActor {
    constructor(data) { this.data = data; }
    validate() { return true; }
    static async createDocuments(data, options) { call = { data, options }; return data.map(d => ({ ...d, id: d._id })); }
  }
  const actor = await persistCrowPlan(buildCrowPlan(fixtures()), { ActorClass: FakeActor, randomID: () => `id${++count}`, userId: "user", creationId: "attempt" });
  assert.equal(actor.id, "id1");
  assert.equal(call.data.length, 2);
  assert.equal(call.data[1].flags[CREATOR_SCOPE].crowId, actor.id);
  assert.deepEqual(actor.flags[CREATOR_SCOPE].creation.petIds, ["id2"]);
  assert.equal(call.data[1].ownership.user, 3);
  assert.deepEqual(call.options, { keepId: true });
});

test("validation stops writes, while incomplete batches report an uncertain result", async () => {
  let writes = 0;
  class FakeActor {
    constructor() {}
    validate() { throw new Error("invalid actor"); }
    static async createDocuments() { writes++; return []; }
  }
  const options = { ActorClass: FakeActor, randomID: () => "id", userId: "user", creationId: "attempt" };
  await assert.rejects(persistCrowPlan(buildCrowPlan(fixtures()), options), /invalid actor/);
  assert.equal(writes, 0);
  FakeActor.prototype.validate = () => true;
  await assert.rejects(persistCrowPlan(buildCrowPlan(fixtures()), options), /incomplete result/);
  assert.equal(writes, 1);
});

test("every locally generated background resolves all grants and occupies valid, non-overlapping slots", async t => {
  let packs;
  try {
    packs = await Promise.all(["backgrounds", "equipment", "traits", "monsters", "connections"].map(async name =>
      JSON.parse(await readFile(new URL(`../packs/${name}.json`, import.meta.url), "utf8"))));
  } catch (error) { if (error.code === "ENOENT") return t.skip("Build local playtest content to run this integration check."); throw error; }
  const [backgrounds, equipment, traits, monsters, connections] = packs;
  validateBackgrounds(backgrounds);
  for (const b of backgrounds) {
    const primary = primaryChoices(b)[0];
    const plan = buildCrowPlan({ background: b, equipment, traits, monsters, connections, userId: "user",
      draft: { ...draft, primary, secondary: CHARACTERISTICS.find(key => key !== primary), connection: connections[0].name, traitChoice: "Merchant" } });
    const occupied = new Set();
    for (const item of plan.crow.items.filter(item => item.type === "equipment")) {
      assert.ok(item.system.quantity <= item.system.maxStack, `${b.name}: stack overflow`);
      if (item.system.location === "stash") continue;
      const [, prefix, start] = item.system.location.match(/^(backpack|belt|hand)(\d+)$/);
      for (let i = 0; i < Math.max(1, item.system.slots); i++) {
        const n = Number(start) + i, slot = `${prefix}${n}`;
        assert.ok(n <= ({ backpack: 10, belt: 4, hand: 2 })[prefix], `${b.name}: out of bounds`);
        assert.ok(!occupied.has(slot), `${b.name}: overlapping ${slot}`);
        occupied.add(slot);
      }
    }
    for (const grant of b.startingKit) assert.equal(plan.crow.items.filter(item => item.type === "equipment" && item.name === grant.name)
      .reduce((n, item) => n + item.system.quantity, 0), grant.quantity, `${b.name}: ${grant.name}`);
    assert.equal(plan.crow.items.filter(i => i.type === "trait").length, 1);
    assert.equal(plan.pets.length, b.pets.length);
  }
});
