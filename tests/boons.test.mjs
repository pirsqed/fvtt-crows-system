import { test } from "node:test";
import assert from "node:assert/strict";
import { claimBoon } from "../module/boons.mjs";

function setup() {
  const grave = { id: "grave12345678901", type: "villageEntry", name: "Old Friend", system: {
    kind: "grave", cryptBoon: "My custom boon", description: "First line\n<script>unsafe</script>", boonUses: 12
  } };
  const village = { uuid: "Actor.village", type: "village", name: "Home", visible: true, items: new Map([[grave.id, grave]]) };
  const items = new Map(); items[Symbol.iterator] = function* () { yield* this.values(); };
  const crow = { name: "My Crow", type: "crow", isOwner: true, items, async createEmbeddedDocuments(type, docs, options) {
    assert.equal(type, "Item"); assert.equal(options.keepId, true);
    const data = structuredClone(docs[0]); items.set(data._id, data); return [data];
  }, async updateEmbeddedDocuments(type, docs) {
    return docs.map(data => { const old = items.get(data._id); Object.assign(old, structuredClone(data)); return old; });
  }, async deleteEmbeddedDocuments(type, ids) { ids.forEach(id => items.delete(id)); } };
  return { grave, village, crow };
}

test("claim copies custom text and uses to an independent boon without altering grave or biography", async () => {
  const { grave, village, crow } = setup();
  const before = structuredClone(grave);
  crow.system = { biography: "Keep this" };
  const boon = await claimBoon(village, grave.id, crow);
  assert.equal(boon.type, "boon"); assert.equal(boon.name, "My custom boon");
  assert.equal(boon.system.uses, 12);
  assert.equal(boon.system.description, "First line<br>&lt;script&gt;unsafe&lt;/script&gt;");
  assert.equal(boon.system.sourceName, "Old Friend — Home");
  assert.deepEqual(grave, before); assert.equal(crow.system.biography, "Keep this");
});

test("cancel preserves the existing boon, including edits and uses", async () => {
  const { grave, village, crow } = setup();
  const boon = await claimBoon(village, grave.id, crow);
  boon.system.uses = 2; boon.system.description = "Player edits";
  const before = structuredClone(boon);
  assert.equal(await claimBoon(village, grave.id, crow, { confirm: async options => {
    assert.equal(options.defaultYes, false); assert.match(options.content, /My custom boon/); return false;
  } }), null);
  assert.deepEqual(boon, before); assert.equal(crow.items.size, 1);
});

test("confirmed claims replace one entry in place, including reclaims and other villages", async () => {
  const { grave, village, crow } = setup();
  const boon = await claimBoon(village, grave.id, crow);
  boon.system.uses = 1;
  let confirmations = 0;
  const confirm = async () => { confirmations++; return true; };
  await claimBoon(village, grave.id, crow, { confirm });
  assert.equal(boon.system.uses, 12);
  village.uuid = "Actor.other"; grave.system.cryptBoon = "Different custom boon";
  await claimBoon(village, grave.id, crow, { confirm });
  assert.equal(confirmations, 2); assert.equal(crow.items.size, 1);
  assert.equal(boon.name, "Different custom boon");
  assert.equal(boon.system.sourceUuid, `Actor.other.Item.${grave.id}`);
});

test("confirmation consolidates old multiple entries and preserves unrelated items", async () => {
  const { grave, village, crow } = setup();
  const boon = await claimBoon(village, grave.id, crow);
  crow.items.set("old", { ...structuredClone(boon), _id: "old", name: "Old second boon" });
  crow.items.set("trait", { _id: "trait", type: "trait", name: "Keep" });
  await claimBoon(village, grave.id, crow, { confirm: async options => {
    assert.match(options.content, /Old second boon/); return true;
  } });
  assert.equal(crow.items.size, 2); assert.equal(crow.items.has("old"), false);
  assert.equal(crow.items.get("trait").name, "Keep");
});

test("changes during confirmation abort replacement; concurrent claims are rejected", async () => {
  const { grave, village, crow } = setup();
  const boon = await claimBoon(village, grave.id, crow);
  await assert.rejects(claimBoon(village, grave.id, crow, { confirm: async () => {
    await assert.rejects(claimBoon(village, grave.id, crow), /already in progress/);
    boon.system.uses = 5; return true;
  } }), /boon changed/);
  assert.equal(boon.system.uses, 5);
  await claimBoon(village, grave.id, crow, { confirm: async () => true });
  assert.equal(boon.system.uses, 12);
});

test("claims require village visibility and Crow ownership, but no village edit permission", async () => {
  const { grave, village, crow } = setup();
  village.visible = false; await assert.rejects(claimBoon(village, grave.id, crow), /view/);
  village.visible = true; crow.isOwner = false; await assert.rejects(claimBoon(village, grave.id, crow), /own/);
  crow.isOwner = true; crow.isToken = true; await assert.rejects(claimBoon(village, grave.id, crow), /directory/);
  crow.isToken = false; await assert.rejects(claimBoon(village, "missing", crow), /unavailable/);
  grave.system.cryptBoon = "  "; await assert.rejects(claimBoon(village, grave.id, crow), /name/);
  assert.equal(crow.items.size, 0);
});

test("an unrelated item ID collision never overwrites Crow data", async () => {
  const { grave, village, crow } = setup();
  crow.items.set("cryptBoonSlot001", { type: "trait", name: "Keep me" });
  await assert.rejects(claimBoon(village, grave.id, crow), /occupied/);
  assert.equal(crow.items.get("cryptBoonSlot001").name, "Keep me");
});
