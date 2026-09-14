import { test } from "node:test";
import assert from "node:assert/strict";
import { CrowsLoot } from "../module/loot.mjs";

const player = { id: "player", isGM: false };
const gm = { id: "gm", isGM: true };
globalThis.game = { user: player, users: { get: id => id === "gm" ? gm : player } };
globalThis.foundry = { utils: { setProperty: (obj, path, value) => { obj.system.location = value; } } };
const actor = (uuid, type, owned = false) => ({
  uuid, type, system: {}, items: [],
  testUserPermission: (user, level) => user.isGM || owned || (type === "loot" && ["OBSERVER", "LIMITED"].includes(level))
});

function sceneFor(loot, crow, { linked = true, x = 100 } = {}) {
  const source = { actor: loot, actorLink: linked, x, y: 0, width: 1, height: 1, elevation: 0, hidden: false };
  const receiver = { actor: crow, x: 0, y: 0, width: 1, height: 1, elevation: 0, hidden: false };
  const scene = { tokens: [source, receiver], grid: { sizeX: 100, sizeY: 100,
    measurePath: ([a, b]) => ({ distance: Math.hypot(a.x - b.x, a.y - b.y) / 100 }) } };
  game.scenes = { active: scene, get: id => id === "viewed" ? scene : null };
  game.settings = { get: () => 1 };
  return { scene, source, receiver };
}

for (const linked of [true, false]) test(`${linked ? "linked" : "unlinked"} ground loot follows distance and recipient ownership without actor permissions`, () => {
  const loot = actor("loot", "loot");
  loot.testUserPermission = () => false;
  const crow = actor("crow", "crow", true);
  const { source, receiver, scene } = sceneFor(loot, crow, { linked });
  assert.equal(CrowsLoot.canTransfer(loot, crow, player), true);
  source.x = 101;
  assert.equal(CrowsLoot.canTransfer(loot, crow, player), false);
  game.settings.get = () => 2;
  assert.equal(CrowsLoot.canTransfer(loot, crow, player), true);
  source.hidden = true;
  assert.equal(CrowsLoot.canTransfer(loot, crow, player), false);
  source.hidden = false;
  source.elevation = 3;
  assert.equal(CrowsLoot.canTransfer(loot, crow, player), false);
  source.elevation = 0;
  assert.equal(CrowsLoot.canTransfer(loot, actor("remote", "crow", true), player), false);
  assert.equal(CrowsLoot.canTransfer(loot, actor("npc", "monster"), player), false);
  scene.tokens = [source];
  assert.equal(CrowsLoot.canPickUp(loot, player), false);
  scene.tokens = [receiver];
  assert.equal(CrowsLoot.canPickUp(loot, player), false);
  assert.equal(CrowsLoot.canTransfer(loot, crow, gm), true);
  assert.equal(CrowsLoot.canTransfer(crow, loot, player), false);
});

test("pickup uses the requesting player's viewed scene, not the GM canvas", () => {
  const loot = actor("loot", "loot"), crow = actor("crow", "crow", true);
  sceneFor(loot, crow);
  globalThis.canvas = { scene: { tokens: [] } };
  try { assert.equal(CrowsLoot.canTransfer(loot, crow, { ...player, viewedScene: "viewed" }), true); }
  finally { delete globalThis.canvas; }
});

test("only nearby single-item loot exposes a drag handle", () => {
  const loot = actor("loot", "loot");
  const { source } = sceneFor(loot, actor("crow", "crow", true));
  const item = { type: "equipment" };
  loot.items = { size: 1, contents: [item] };
  assert.equal(CrowsLoot.looseItem({ actor: loot }), item);
  source.x = 200;
  assert.equal(CrowsLoot.looseItem({ actor: loot }), null);
  source.x = 100;
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
