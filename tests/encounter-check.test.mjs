import { test } from "node:test";
import assert from "node:assert/strict";
import { rollEncounterCheck } from "../module/encounter-check.mjs";

test("shared roller keeps dungeon wording and uses travel timing without rolling a table", async () => {
  let result = 8;
  const messages = [];
  globalThis.Roll = class {
    constructor(formula) { assert.equal(formula, "1d10"); }
    async evaluate() { this.total = result; }
    async toMessage(message) { messages.push(message); }
  };
  await rollEncounterCheck(8);
  assert.match(messages.at(-1).content, /next Dungeon Turn/);
  await rollEncounterCheck(8, { travel: true });
  assert.match(messages.at(-1).content, /ENCOUNTER WARNING/);
  assert.match(messages.at(-1).content, /Ref decides when/);
  assert.doesNotMatch(messages.at(-1).content, /Dungeon/);
  await rollEncounterCheck(8, {rest:true});
  assert.match(messages.at(-1).content, /Rest Encounter Check/);
  assert.match(messages.at(-1).content, /during the rest/);
  assert.doesNotMatch(messages.at(-1).content, /travel day|Dungeon Turn/);
  result = 7; await rollEncounterCheck(8, { travel: true });
  assert.match(messages.at(-1).content, /ALL QUIET/);
  result = 10; await rollEncounterCheck(10, { travel: true });
  assert.match(messages.at(-1).content, /IMMEDIATE ENCOUNTER/);
  assert.doesNotMatch(messages.at(-1).content, /Monsters|ambush/);
  assert.deepEqual(await rollEncounterCheck(11, { travel: true }), {result: 10, en: 11});
  assert.match(messages.at(-1).content, /ALL QUIET/);
  await assert.rejects(rollEncounterCheck(-1), /whole number/);
});
