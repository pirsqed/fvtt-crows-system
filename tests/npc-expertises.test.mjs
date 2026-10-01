import { test } from "node:test";
import assert from "node:assert/strict";
import { saveNpcExpertise, showNpcExpertiseDialog } from "../module/apps/npc-expertise-dialog.mjs";
import { EXPERTISES_CONFIG } from "../module/expertises.mjs";

globalThis.ActorSheet = class {};
globalThis.foundry = { utils: { randomID: () => "new-id" } };
const { CrowsMonsterSheet } = await import("../module/sheets/monster-sheet.mjs");
function actor(entries = []) {
  return { name: "NPC", isOwner: true, system: { customExpertises: entries },
    async update(data) { this.system.customExpertises = data["system.customExpertises"]; } };
}
const draft = { name: "Crow Whispering", notes: "Communicate with corvids.", value: 1, max: 2 };

test("add, edit, and delete preserve stable IDs and unrelated expertises", async () => {
  const npc = actor([{ id: "other", ...draft }]);
  await saveNpcExpertise(npc, undefined, draft);
  assert.equal(npc.system.customExpertises.length, 2);
  await saveNpcExpertise(npc, "new-id", { ...draft, name: "Alchemy", value: 0 });
  assert.equal(npc.system.customExpertises[1].name, "Alchemy");
  assert.equal(npc.system.customExpertises[0].name, draft.name);
  await saveNpcExpertise(npc, "new-id", null);
  assert.deepEqual(npc.system.customExpertises, [{ id: "other", ...draft }]);
});

test("invalid use counts, stale entries, and observers cannot write", async () => {
  const npc = actor();
  for (const invalid of [{ name: " " }, { value: -1 }, { value: 3 }, { max: -1 }, { value: NaN }, { max: 1.5 }]) {
    await assert.rejects(saveNpcExpertise(npc, undefined, { ...draft, ...invalid }));
  }
  await assert.rejects(saveNpcExpertise(npc, "deleted", draft), /removed/);
  npc.isOwner = false;
  await assert.rejects(saveNpcExpertise(npc, undefined, draft), /cannot edit/);
  assert.deepEqual(npc.system.customExpertises, []);
});

test("editor includes every Crow expertise and preserves custom names without writing on open", () => {
  let config;
  globalThis.Dialog = class { constructor(data) { config = data; } render() { return this; } };
  const npc = actor([{ id: "a", ...draft }]);
  npc.update = () => assert.fail("Opening or cancelling must not write");
  showNpcExpertiseDialog(npc, "a");
  for (const choice of Object.values(EXPERTISES_CONFIG).flat()) assert.ok(config.content.includes(`value="${choice.key}"`));
  assert.match(config.content, /value="custom" selected/);
  assert.ok(config.content.includes(draft.name));
  showNpcExpertiseDialog(npc);
  assert.ok(config.buttons.cancel);
  assert.doesNotMatch(config.content, /data-delete/);
});

test("Recover All still restores every expertise from the sheet", async () => {
  const sheet = new CrowsMonsterSheet();
  sheet.actor = actor([{ id: "a", ...draft, value: 0 }]);
  sheet.isEditable = true;
  await sheet._onExpertiseAction({ preventDefault() {}, stopPropagation() {}, currentTarget: { dataset: { npcExpertiseAction: "recover" } } });
  assert.equal(sheet.actor.system.customExpertises[0].value, 2);
});
