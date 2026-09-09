import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.FormApplication = class {
  static get defaultOptions() { return {}; }
  constructor() { this.element = { find: () => ({ prop() {} }) }; }
  render() { this.renders = (this.renders ?? 0) + 1; }
  async close() { this.closed = true; }
};
globalThis.foundry = { utils: { mergeObject: (a, b) => ({ ...a, ...b }), randomID: () => "test-id" } };
const { CrowsCharacterCreator } = await import("../module/apps/character-creator.mjs");

function setup() {
  globalThis.game = { user: { id: "user", can: () => true } };
  globalThis.ui = { notifications: { info() {} } };
  const creator = new CrowsCharacterCreator();
  creator.content = { backgrounds: [{ name: "Test", roll: "1-1", characteristicAt2: ["Any"], stamina: 5,
    trait: { tree: "General", name: "Trait" }, expertises: [], pets: [], extraGold: 0, equipment: [],
    startingKit: [{ name: "Kit", quantity: 1 }] }], equipment: [{ name: "Kit", type: "equipment", system: { slots: 1, maxStack: 1 } }],
    traits: [{ name: "Trait", type: "trait", system: { tree: "General" } }], connections: [{ name: "Benefit", description: "Text" }] };
  creator.selectBackground("1-1");
  Object.assign(creator.draft, { name: "Test crow", feature: "Feature", connectionName: "NPC", relationship: "Friend", connection: "Benefit", gold: 10 });
  creator.step = 3;
  return creator;
}

test("creation rejects deleted or hidden home villages before saving actors", async () => {
  for (const selected of [undefined, {type:"village",visible:false}, {type:"crow",visible:true}]) {
    const creator=setup(); creator.draft.homeVillageId="village";
    game.actors={get:()=>selected};
    await assert.rejects(creator.action("create"), /home village is unavailable/);
    assert.ok(!creator._attempted);
  }
});

test("a player's home choice is saved without requiring village edit permission", async () => {
  const creator=setup(); creator.draft.homeVillageId="village";
  game.actors={get:()=>({id:"village",name:"Village",type:"village",visible:true,isOwner:false})};
  let saved;
  globalThis.Actor=class {
    validate(){return true;}
    static async createDocuments(data){saved=data[0];return [{...saved,id:saved._id,sheet:{render(){}}}];}
  };
  await creator.action("create");
  assert.equal(saved.flags["fvtt-crows-system"].homeVillageId,"village");
  assert.ok(creator.closed);
});

test("permission is checked immediately before actor creation", async () => {
  const creator = setup();
  game.user.can = () => false;
  await assert.rejects(creator.action("create"), /cannot create actors/);
  assert.ok(!creator._attempted);
});

test("double clicks and an uncertain server failure cannot replay actor creation", async () => {
  const creator = setup();
  let reject, calls = 0;
  globalThis.Actor = class {
    validate() { return true; }
    static async createDocuments() { calls++; return new Promise((_, fail) => { reject = fail; }); }
  };
  const pending = creator.action("create");
  await creator.action("create");
  assert.equal(calls, 1);
  reject(new Error("connection lost")); await pending;
  assert.match(creator.error, /Check the Actors directory/);
  await creator.action("create");
  assert.equal(calls, 1);
  assert.equal(creator._busy, false);
});

test("back navigation retains names and gold, changing background clears trait choices", async () => {
  const creator = setup();
  await creator.action("back");
  assert.equal(creator.step, 2);
  assert.equal(creator.draft.name, "Test crow");
  assert.equal(creator.draft.gold, 10);
  creator.draft.traitChoice = "Old merchant";
  creator.content.backgrounds.push({ ...creator.background, roll: "1-2", characteristicAt2: ["Mind"] });
  creator.selectBackground("1-2");
  assert.equal(creator.draft.primary, "mind");
  assert.notEqual(creator.draft.secondary, "mind");
  assert.equal(creator.draft.traitChoice, "");
});

function mockRoll({ dice, total, post = async () => ({ id: "chat-message" }) }) {
  const calls = [];
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; calls.push(this); }
    async evaluate() {
      this.evaluations = (this.evaluations ?? 0) + 1;
      this.dice = dice.map(result => ({ results: [{ result, active: true }] }));
      this.total = total;
      return this;
    }
    async toMessage(data, options) { this.message = data; this.messageOptions = options; return post(this); }
  };
  return calls;
}

test("background roll posts the original Foundry Roll with d66 total and table result", async () => {
  for (const dice of [[4, 1], [1, 4]]) {
    const creator = setup();
    game.user.name = "Player";
    creator.content.backgrounds.push({ ...creator.background, roll: dice.join("-"), name: 'Background <test>' });
    const calls = mockRoll({ dice, total: dice[0] * 10 + dice[1] });
    await creator.action("roll-background");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].formula, "1d6 * 10 + 1d6");
    assert.equal(calls[0].evaluations, 1);
    assert.equal(calls[0].messageOptions, undefined, "let Foundry apply the current roll visibility");
    assert.equal(calls[0].message.content, undefined, "use the standard Foundry roll card");
    assert.equal(calls[0].message.flavor, `Character Creation — Background (d66): ${dice.join("")} — Background &lt;test&gt;`);
    assert.deepEqual(calls[0].message.speaker, { alias: "Player" });
    assert.equal(creator.draft.background, dice.join("-"));
    assert.equal(creator.rolls.length, 1);
  }
});

test("gold rolls post the native total with background bonus and store only the dice portion", async () => {
  for (const bonus of [0, 50]) {
    const creator = setup();
    creator.background.extraGold = bonus;
    const calls = mockRoll({ dice: [3, 4, 5], total: 12 + bonus });
    await creator.action("roll-gold");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].formula, bonus ? "3d6 + 50" : "3d6");
    assert.equal(calls[0].evaluations, 1);
    assert.match(calls[0].message.flavor, new RegExp(`${12 + bonus} gc`));
    assert.equal(calls[0].messageOptions, undefined);
    assert.equal(creator.draft.gold, 12, "do not count background gold twice");
  }
});

test("chat posting blocks duplicate clicks and only applies the background after success", async () => {
  const creator = setup();
  creator.content.backgrounds.push({ ...creator.background, roll: "4-1", name: "New background" });
  let resolve;
  const calls = mockRoll({ dice: [4, 1], total: 41, post: () => new Promise(done => { resolve = done; }) });
  const pending = creator.action("roll-background");
  await Promise.resolve();
  await creator.action("roll-background");
  assert.equal(calls.length, 1);
  assert.equal(creator.draft.background, "1-1");
  resolve({ id: "posted" }); await pending;
  assert.equal(creator.draft.background, "4-1");
  assert.equal(creator._busy, false);
});

test("failed or cancelled chat creation does not silently change creator results", async () => {
  for (const post of [async () => { throw new Error("chat unavailable"); }, async () => undefined]) {
    const creator = setup();
    const calls = mockRoll({ dice: [1, 2, 3], total: 6, post });
    await assert.rejects(creator.action("roll-gold"), /chat/);
    assert.equal(calls.length, 1);
    assert.equal(creator.draft.gold, 10);
    assert.equal(creator._busy, false);
  }
});
