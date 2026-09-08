import { test } from "node:test";
import assert from "node:assert/strict";
import { CrowsLoot } from "../module/loot.mjs";

const player = { id: "player", isGM: false };
const gm = { id: "gm", isGM: true };
globalThis.game = { user: player, users: { get: id => id === "gm" ? gm : player } };
globalThis.foundry = { utils: { setProperty: (obj, path, value) => { obj.system.location = value; } } };
const actor = (uuid, type, owned = false, locked = false) => ({
  uuid, type, system: { containerType: "generic", locked, coins: 0 },
  testUserPermission: (user, level) => user.isGM || owned || (type === "loot" && level === "OBSERVER")
});

test("pickup and stow permissions reject unowned recipients and locked containers", () => {
  const sword = actor("sword", "loot");
  const crow = actor("crow", "crow", true);
  const npc = actor("npc", "monster");
  const chest = actor("chest", "loot");
  assert.equal(CrowsLoot.canTransfer(sword, crow, player), true);
  assert.equal(CrowsLoot.canTransfer(sword, npc, player), false);
  assert.equal(CrowsLoot.canTransfer(crow, chest, player), true);
  chest.system.locked = true;
  assert.equal(CrowsLoot.canTransfer(crow, chest, player), false);
  assert.equal(CrowsLoot.canTransfer(chest, crow, player), false);
  assert.equal(CrowsLoot.canTransfer(sword, npc, gm), true);
  assert.equal(CrowsLoot.canTransfer(crow, crow, gm), false);
});

test("only single-item generic loot exposes a drag handle", () => {
  const loot = actor("loot", "loot");
  const item = { type: "equipment" };
  loot.items = { size: 1, contents: [item] };
  assert.equal(CrowsLoot.looseItem({ actor: loot }), item);
  loot.system.coins = 1;
  assert.equal(CrowsLoot.looseItem({ actor: loot }), null);
  loot.system.coins = 0;
  loot.system.containerType = "chest";
  assert.equal(CrowsLoot.looseItem({ actor: loot }), null);
  loot.system.containerType = "generic";
  loot.items.size = 2;
  assert.equal(CrowsLoot.looseItem({ actor: loot }), null);
});

test("map hit testing ignores hidden tokens and uses unsnapped coordinates", () => {
  const visible = { actor: { type: "crow" }, visible: true, isVisible: true, document: { x: 100, y: 100 }, w: 80, h: 80 };
  const hidden = { ...visible, isVisible: false };
  const canvas = { tokens: { placeables: [visible, hidden] } };
  assert.equal(CrowsLoot.tokenAt(canvas, 179, 179), visible);
  assert.equal(CrowsLoot.tokenAt(canvas, 180, 180), undefined);
});

test("map drops transfer to the synthetic actor and empty-space drops cancel", async () => {
  const source = actor("source", "loot");
  const target = actor("Scene.scene.Token.token.Actor.base", "crow", true);
  const item = { parent: source };
  globalThis.Item = { implementation: { fromDropData: async () => item } };
  const token = { actor: target, visible: true, isVisible: true, document: { x: 100, y: 100 }, w: 80, h: 80 };
  const canvas = { tokens: { placeables: [token] } };
  const original = CrowsLoot.transfer;
  let transfers = 0;
  CrowsLoot.transfer = async (actual, recipient) => {
    assert.equal(actual, item); assert.equal(recipient, target); transfers++;
  };
  try {
    await CrowsLoot.onDropCanvasData(canvas, { type: "Item", x: 120, y: 120, crowsMapItem: true });
    await CrowsLoot.onDropCanvasData(canvas, { type: "Item", x: 300, y: 300, crowsMapItem: true });
    assert.equal(transfers, 1);
  } finally { CrowsLoot.transfer = original; }
});

test("simultaneous pickups of one item create only one destination item", async () => {
  const source = actor("source", "loot");
  const target = actor("target", "loot");
  let copies = 0;
  let exists = true;
  target.createEmbeddedDocuments = async () => { copies++; return [{}]; };
  const item = { parent: source, name: "Sword", toObject: () => ({ system: {} }), delete: async () => { exists = false; } };
  globalThis.fromUuid = async uuid => uuid === "target" ? target : exists ? item : null;
  const announce = CrowsLoot._announce;
  const cleanup = CrowsLoot.cleanupIfEmpty;
  CrowsLoot._announce = CrowsLoot.cleanupIfEmpty = async () => {};
  try {
    await Promise.all([1, 2].map(() => CrowsLoot._doTransfer({ itemUuid: "item", targetUuid: "target" }, "gm")));
    assert.equal(copies, 1);
    assert.equal(exists, false);
  } finally { CrowsLoot._announce = announce; CrowsLoot.cleanupIfEmpty = cleanup; }
});
