import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareWeaponAttack, renderDamageButtons, showWeaponAttackDialog, rollStatBlockAttack } from "../module/attacks.mjs";

const weapon = { id: "sword", name: "Sword", system: { isWeapon: true,
  weapon: { tier2Damage: "2 dam", tier3Damage: "5 dam" } } };
const makeActor = type => ({ id: "actor", uuid: "Actor.actor", name: "Attacker", type,
  system: { characteristics: { strength: 2, agility: 1, mind: 0 } },
  evaluateWeaponDamage: text => text,
  extractDamageNumber: text => Number.parseInt(text) || 0 });

test("damage preparation handles hits, misses, doom and absent weapon text", () => {
  const actor = makeActor("crow");
  assert.equal(prepareWeaponAttack(actor, weapon, { tier: 2 }).numericDamage, 2);
  assert.equal(prepareWeaponAttack(actor, weapon, { tier: 3 }).numericDamage, 5);
  assert.equal(prepareWeaponAttack(actor, weapon, { tier: 1 }).numericDamage, 0);
  assert.equal(prepareWeaponAttack(actor, weapon, { tier: 1, isDoom: true }).damageDesc, "Disaster strikes!");
  assert.equal(prepareWeaponAttack(actor, weapon, { tier: 3, isCrit: true }).tierTitle, "CRITICAL HIT! (Tier 3)");
  const blank = { system: { weapon: {} } };
  const upgrade = prepareWeaponAttack(actor, blank, { tier: 2 });
  assert.equal(upgrade.damageDesc, "Tier 2 Damage");
  assert.equal(upgrade.numericDamage, 0);
});

test("selected characteristic is passed to both damage evaluators", () => {
  const calls = [];
  const actor = { evaluateWeaponDamage: (text, key) => { calls.push([text, key]); return text; },
    extractDamageNumber: (text, key) => { calls.push([text, key]); return 5; } };
  prepareWeaponAttack(actor, weapon, { tier: 3 }, "agility");
  assert.deepEqual(calls, [["5 dam", "agility"], ["5 dam", "agility"]]);
});

test("damage buttons retain target token identities, escape names and handle no target", () => {
  const buttons = renderDamageButtons(5, new Set([
    { id: "token1", actor: { id: "base" }, name: '<Goblin "A">' },
    { id: "token2", actor: { id: "base" }, name: "Goblin B" }
  ]));
  assert.match(buttons, /data-target-token-id="token1"/);
  assert.match(buttons, /data-target-token-id="token2"/);
  assert.match(buttons, /&lt;Goblin &quot;A&quot;&gt;/);
  assert.match(renderDamageButtons(2), /Damage to Target/);
  assert.equal(renderDamageButtons(0), "");
});

test("weapon dialog callback publishes Crow expertise and monster attacks through the same flow", async () => {
  let dialog;
  const messages = [];
  const formulas = [];
  globalThis.Dialog = class { constructor(data) { dialog = data; } render() { return this; } };
  globalThis.Roll = class {
    constructor(formula) { formulas.push(formula); }
    async evaluate() { this.total = 14; this.result = "6 + 6 + 2"; this.dice = [{ results: [{ result: 6 }, { result: 6 }] }]; }
    async toMessage(message) { messages.push(message); }
  };
  globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ actor: actor.id }) };
  globalThis.game = { user: { targets: new Set() } };
  const html = { find: selector => ({ val: () => selector === "#attack-char" ? "agility"
    : selector === "#attack-mod" ? "-1" : "edge" }) };
  try {
    for (const type of ["crow", "monster"]) {
      showWeaponAttackDialog(makeActor(type), weapon);
      assert.match(dialog.content, /attack-char/);
      await dialog.buttons.roll.callback(html);
    }
    assert.deepEqual(formulas, ["2d10 + 2", "2d10 + 2"]);
    assert.match(messages[0].content, /data-action="expertise"/);
    assert.doesNotMatch(messages[1].content, /data-action="expertise"/);
    for (const message of messages) {
      assert.match(message.content, /Apply 2 Damage/);
      assert.match(message.content, /Sword \(agility\)/);
      assert.equal(message.speaker.actor, "actor");
    }
    await rollStatBlockAttack(makeActor("monster"), { name: "Bite", system: {
      bonus: "+ 2 + 1", tier2Damage: "3 dam and grabbed", tier3Damage: "7 dam" } });
    assert.equal(formulas[2], "2d10 + 2 + 1");
    assert.match(messages[2].content, /3 dam and grabbed/);
    assert.match(messages[2].content, /Apply 3 Damage/);
  } finally {
    for (const key of ["Dialog", "Roll", "ChatMessage", "game"]) delete globalThis[key];
  }
});
