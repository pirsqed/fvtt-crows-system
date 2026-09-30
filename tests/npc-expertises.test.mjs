import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.ActorSheet = class {};
globalThis.foundry = { utils: { randomID: () => "custom-id" } };
const { CrowsMonsterSheet } = await import("../module/sheets/monster-sheet.mjs");

function fixture(entries = []) {
  const sheet = new CrowsMonsterSheet();
  sheet.isEditable = true;
  sheet.actor = {
    isOwner: true,
    system: { customExpertises: entries },
    async update(data) { this.system.customExpertises = data["system.customExpertises"]; }
  };
  const act = (dataset, value) => sheet._onExpertiseAction({
    preventDefault() {}, stopPropagation() {}, currentTarget: { dataset, value }
  });
  return { sheet, act, entries: () => sheet.actor.system.customExpertises };
}

test("NPC can add, rename, annotate, and delete an arbitrary expertise", async () => {
  const { act, entries } = fixture();
  await act({ npcExpertiseAction: "add" });
  await act({ expertiseId: "custom-id", npcExpertiseField: "name" }, "Crow Whispering");
  await act({ expertiseId: "custom-id", npcExpertiseField: "notes" }, "Communicate with corvids.");
  assert.deepEqual(entries(), [{ id: "custom-id", name: "Crow Whispering", notes: "Communicate with corvids.", value: 1, max: 1 }]);
  await act({ expertiseId: "custom-id", npcExpertiseAction: "delete" });
  assert.deepEqual(entries(), []);
});

test("NPC use counts stay bounded when spent, edited, or recovered", async () => {
  const { act, entries } = fixture([{ id: "a", name: "Custom", notes: "", value: 2, max: 3 }]);
  for (let i = 0; i < 3; i++) await act({ expertiseId: "a", npcExpertiseAction: "spend" });
  assert.equal(entries()[0].value, 0);
  await act({ npcExpertiseAction: "recover" });
  assert.equal(entries()[0].value, 3);
  await act({ expertiseId: "a", npcExpertiseField: "max" }, "1");
  assert.equal(entries()[0].value, 1);
  await act({ expertiseId: "a", npcExpertiseField: "value" }, "20");
  assert.equal(entries()[0].value, 1);
  await act({ expertiseId: "a", npcExpertiseField: "value" }, "-2");
  assert.equal(entries()[0].value, 0);
});

test("stale controls and observers cannot change NPC expertises", async () => {
  const { sheet, act, entries } = fixture();
  await act({ expertiseId: "missing", npcExpertiseField: "name" }, "Ghost");
  sheet.isEditable = false;
  await act({ npcExpertiseAction: "add" });
  sheet.isEditable = true;
  sheet.actor.isOwner = false;
  await act({ npcExpertiseAction: "add" });
  assert.deepEqual(entries(), []);
});
