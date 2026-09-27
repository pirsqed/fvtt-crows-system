import { test } from "node:test";
import assert from "node:assert/strict";
import { createItemShortcut, useItemShortcut, onHotbarDrop } from "../module/hotbar.mjs";

test("item shortcuts dispatch, validate live equipment, and retain exact item identity", async () => {
  const warnings = [], dialogs = [], macros = [], assignments = [];
  const actor = { type: "crow", isOwner: true, system: { characteristics: {} }, items: new Map() };
  const item = { id: "sword", uuid: "Scene.scene.Token.token.Actor.actor.Item.sword", documentName: "Item",
    name: 'Sword "One"', img: "sword.webp", type: "equipment", parent: actor,
    system: { isWeapon: true, isEquipped: true, location: "hand1", quantity: 1 },
    isOwner: true, sheet: { render: () => "opened" } };
  actor.items.set(item.id, item);
  let resolved = item;
  globalThis.fromUuid = async uuid => { assert.equal(uuid, item.uuid); return resolved; };
  globalThis.ui = { notifications: { warn: m => warnings.push(m), error: m => warnings.push(m) } };
  globalThis.Dialog = class { constructor(data) { dialogs.push(data); } render() { return this; } };
  globalThis.Item = { implementation: { fromDropData: async () => item } };
  globalThis.Macro = { create: async data => { const macro = { ...data, isOwner: true }; macros.push(macro); return macro; } };
  globalThis.game = { macros, user: { assignHotbarMacro: async (m, slot) => assignments.push([m, slot]) } };
  try {
    await createItemShortcut({ type: "Item", uuid: item.uuid }, 3);
    await createItemShortcut({ type: "Item", uuid: item.uuid }, 7);
    assert.equal(macros.length, 1);
    assert.equal(assignments[1][1], 7);
    assert.equal(macros[0].command, `await game.crows.useItemShortcut(${JSON.stringify(item.uuid)});`);
    assert.equal(onHotbarDrop(null, { type: "Macro" }, 1), undefined);
    assert.equal(onHotbarDrop(null, { type: "Item" }, 1), false);
    await useItemShortcut(item.uuid);
    assert.match(dialogs.at(-1).title, /Attack:/);
    const attackDialog = dialogs.at(-1);
    for (const location of ["backpack1", "belt1", "ground", "stash"]) {
      item.system.location = location;
      await useItemShortcut(item.uuid);
      assert.match(warnings.at(-1), /in a hand/);
    }
    assert.equal(dialogs.length, 1);
    // No Roll or HTML mock: this must return before reaching either.
    await attackDialog.buttons.roll.callback(null);
    assert.match(warnings.at(-1), /in a hand/);
    item.system.location = "hand2";
    item.system.isEquipped = false;
    await useItemShortcut(item.uuid);
    assert.equal(dialogs.length, 1);
    item.system.isEquipped = true;
    item.system.isSpellbook = true;
    await useItemShortcut(item.uuid);
    assert.match(dialogs.at(-1).title, /Cast:/);
    item.system.location = "stash";
    await dialogs.at(-1).buttons.cast.callback(null);
    assert.match(warnings.at(-1), /in a hand/);
    item.system.location = "hand1";
    actor.isOwner = false;
    await useItemShortcut(item.uuid);
    assert.match(warnings.at(-1), /must own/);
    actor.isOwner = true;
    actor.items.delete(item.id);
    await useItemShortcut(item.uuid);
    assert.match(warnings.at(-1), /no longer exists/);
    resolved = null;
    await useItemShortcut(item.uuid);
    assert.match(warnings.at(-1), /no longer exists/);
    resolved = item;
    actor.items.set(item.id, item);
    item.type = "attack";
    item.system.location = "backpack1";
    await useItemShortcut(item.uuid);
    assert.equal(dialogs.at(-1).buttons.roll.label, "Attack");
    item.type = "trait";
    assert.equal(await useItemShortcut(item.uuid), "opened");
    item.parent = null;
    item.type = "equipment";
    assert.equal(await useItemShortcut(item.uuid), "opened");
  } finally {
    for (const key of ["fromUuid", "ui", "Dialog", "Item", "Macro", "game"]) delete globalThis[key];
  }
});
