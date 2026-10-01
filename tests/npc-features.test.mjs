import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.ActorSheet = class {};
globalThis.ItemSheet = class {};
String.prototype.capitalize ??= function () { return this[0].toUpperCase() + this.slice(1); };
const { CrowsMonsterSheet } = await import("../module/sheets/monster-sheet.mjs");
const { CrowsItemSheet } = await import("../module/sheets/item-sheet.mjs");
const { _onPostTraitToChat } = await import("../module/sheets/inventory-actions.mjs");

test("adding a feature creates a compatible embedded item and opens its editor", async () => {
  const sheet = new CrowsMonsterSheet();
  sheet.actor = { type: "monster", isOwner: true };
  sheet.isEditable = true;
  let created, opened = false;
  globalThis.Item = { async create(data, options) {
    created = data;
    assert.equal(options.parent, sheet.actor);
    return { sheet: { render(force) { opened = force; } } };
  } };
  const event = { preventDefault() {}, currentTarget: { dataset: { type: "trait" } } };
  await sheet._onItemCreate(event);
  assert.equal(created.name, "New Feature");
  assert.equal(created.type, "trait");
  assert.equal(created.system.cost, 0);
  assert.equal(opened, true);
  Item.create = () => assert.fail("Observer must not create items");
  sheet.isEditable = false;
  await sheet._onItemCreate(event);
});

test("existing NPC traits get the feature editor without changing their stored data", () => {
  const sheet = new CrowsItemSheet();
  sheet.item = { type: "trait", parent: { type: "monster" }, system: { tier: "Monster Feature", cost: 500 } };
  const original = structuredClone(sheet.item);
  assert.match(sheet.template, /feature-sheet.html$/);
  assert.deepEqual(sheet.item, original);
  sheet.item.parent.type = "crow";
  assert.match(sheet.template, /trait-sheet.html$/);
  delete sheet.item.parent;
  assert.match(sheet.template, /trait-sheet.html$/);
});

test("NPC chat sharing uses feature terminology while Crow traits retain advancement details", async () => {
  const item = { name: "Keen <Senses>", img: "icon.webp", system: { tree: "General", tier: "Starting", cost: 500, description: "<p>Notice movement.</p>" } };
  const actor = { name: "Watcher", type: "monster", items: { get: () => item } };
  globalThis.$ = () => ({ data: () => "feature-id" });
  let message;
  globalThis.ChatMessage = { getSpeaker: () => ({}), create: async data => { message = data; } };
  const event = { preventDefault() {}, stopPropagation() {}, currentTarget: {} };
  await _onPostTraitToChat.call({ actor }, event);
  assert.match(message.flavor, /feature$/);
  assert.match(message.content, /Keen &lt;Senses&gt;/);
  assert.match(message.content, /Notice movement/);
  assert.doesNotMatch(message.content, /Trait Tree|500 XP/);
  actor.type = "crow";
  await _onPostTraitToChat.call({ actor }, event);
  assert.match(message.flavor, /trait$/);
  assert.match(message.content, /500 XP/);
});
