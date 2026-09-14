import { test } from "node:test";
import assert from "node:assert/strict";
import { showWeaponAttackDialog, showStatBlockAttackDialog } from "../module/attacks.mjs";
import { showSpellcastDialog } from "../module/spellcasting.mjs";

globalThis.ActorSheet = class {};
const { CrowsActorSheet } = await import("../module/sheets/actor-sheet.mjs");
const { CrowsMonsterSheet } = await import("../module/sheets/monster-sheet.mjs");

test("every power-roll dialog offers all circumstances and applies the checked option", async () => {
  let dialog, formula, message, rolledTotal;
  globalThis.Dialog = class { constructor(data) { dialog = data; } render() { return this; } };
  globalThis.Roll = class {
    constructor(value) { formula = value; }
    async evaluate() {
      this.total = 12 + [...formula.slice(4).matchAll(/[+-]\s*\d+/g)]
        .reduce((sum, match) => sum + Number(match[0].replaceAll(" ", "")), 0);
      rolledTotal = this.total;
      this.result = formula;
      this.dice = [{ results: [{ result: 6 }, { result: 6 }] }];
    }
    async toMessage(value) { message = value; }
  };
  globalThis.ChatMessage = { getSpeaker: () => ({}) };
  globalThis.game = { user: { targets: new Set() } };
  String.prototype.capitalize = function () { return this[0].toUpperCase() + this.slice(1); };
  const actor = { id: "crow", uuid: "Actor.crow", name: "Crow", type: "crow", isOwner: true,
    system: { characteristics: { mind: 2 }, cruelty: 1 },
    evaluateWeaponDamage: text => text, extractDamageNumber: () => 0 };
  const event = { preventDefault() {}, currentTarget: { dataset: { char: "mind" } } };
  const paths = [
    [() => showWeaponAttackDialog(actor, { name: "Sword", system: { isWeapon: true } }), 2],
    [() => CrowsActorSheet.prototype._onRollCharacteristic.call({ actor }, event), 2],
    [() => CrowsMonsterSheet.prototype._onRollCharacteristic.call({ actor }, event), 2],
    [() => CrowsActorSheet.prototype._onRollMiasmaTest.call({ actor }, event), 1],
    [() => showSpellcastDialog(actor, { name: "Spell", parent: actor, system: { isSpellbook: true } }), 2],
    [() => showStatBlockAttackDialog(actor, { name: "Bite", system: { bonus: "+ 1 + 1" } }), 2]
  ];
  try {
    for (const [open, base] of paths) {
      for (const circumstance of ["double-edge", "edge", "standard", "bane", "double-bane"]) {
        await open();
        assert.equal((dialog.content.match(/type="radio"/g) || []).length, 5);
        assert.match(dialog.content, /class="radio-list"/);
        assert.match(dialog.content, /value="standard" checked/);
        const html = { find: selector => ({ val: () => {
          if (selector === 'input[name="circumstance"]:checked') return circumstance;
          if (selector === "#attack-char") return "mind";
          if (/modifier|mod/.test(selector)) return "-1";
          assert.fail(`Unexpected selector: ${selector}`);
        } }) };
        await (dialog.buttons.roll || dialog.buttons.cast).callback(html);
        const total = 12 + base - 1 + (circumstance === "edge" ? 2 : circumstance === "bane" ? -2 : 0);
        assert.equal(rolledTotal, total);
        const state = message.flags?.["fvtt-crows-system"]?.rollState;
        if (state) {
          const baseTier = total >= 17 ? 3 : total >= 12 ? 2 : 1;
          assert.equal(state.tier, Math.max(1, Math.min(3, baseTier +
            (circumstance === "double-edge" ? 1 : circumstance === "double-bane" ? -1 : 0))));
        }
      }
    }
  } finally {
    for (const key of ["Dialog", "Roll", "ChatMessage", "game", "ActorSheet"]) delete globalThis[key];
    delete String.prototype.capitalize;
  }
});
