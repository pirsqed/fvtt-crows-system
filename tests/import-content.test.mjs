import { test } from "node:test";
import assert from "node:assert/strict";
import { CrowsContentImport, IMPORT_PACKS, validateImport, repairImportEquipment } from "../module/import-content.mjs";

function setup() {
  const docs = [];
  globalThis.CONFIG = { Item: { dataModels: { equipment: {}, trait: {} } }, Actor: { dataModels: { monster: {} } } };
  globalThis.Item = globalThis.Actor = class { constructor(data) { this.data = data; } validate() { return true; } };
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  const makeDoc = data => ({ id: String(docs.length + 1), ...structuredClone(data),
    toObject() { const { toObject, getFlag, update, setFlag, id, ...data } = this; return structuredClone(data); },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(data) { Object.assign(this, structuredClone(data)); return this; },
    async setFlag(scope, key, value) { this.flags ??= {}; this.flags[scope] ??= {}; this.flags[scope][key] = value; }
  });
  const pack = { documentName: "Item", collection: "world.crows-equipment", locked: false,
    getDocuments: async () => [...docs], documentClass: { createDocuments: async entries => {
      const created = entries.map(makeDoc); docs.push(...created); return created;
    } } };
  globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, packs: new Map([[pack.collection, pack]]) };
  const entry = { name: "Sword", type: "equipment", system: { cost: 10 } };
  globalThis.fetch = async () => ({ ok: true, json: async () => [entry] });
  return { pack, docs, entry, makeDoc };
}

test("validation rejects empty or duplicate input but permits same trait name in different trees", () => {
  setup();
  assert.throws(() => validateImport([], IMPORT_PACKS[0]), /non-empty/);
  const trait = { name: "Connection", type: "trait", system: { tree: "Illusion" } };
  assert.throws(() => validateImport([trait, trait], IMPORT_PACKS[2]), /duplicate/);
  assert.equal(validateImport([trait, { ...trait, system: { tree: "Conjuration" } }], IMPORT_PACKS[2]).length, 2);
});

test("re-import keeps IDs, skips unchanged entries and updates unedited tracked items", async () => {
  const { docs, entry } = setup();
  assert.equal((await CrowsContentImport.run([IMPORT_PACKS[0]]))[0].created, 1);
  const id = docs[0].id;
  assert.equal((await CrowsContentImport.run([IMPORT_PACKS[0]]))[0].unchanged, 1);
  entry.system.cost = 20;
  assert.equal((await CrowsContentImport.run([IMPORT_PACKS[0]]))[0].updated, 1);
  assert.equal(docs[0].system.cost, 20); assert.equal(docs[0].id, id); assert.equal(docs.length, 1);
});

test("local edits and pre-existing untracked entries are preserved", async () => {
  const { docs, entry, makeDoc } = setup();
  await CrowsContentImport.run([IMPORT_PACKS[0]]);
  docs[0].system.cost = 99; entry.system.cost = 20;
  assert.equal((await CrowsContentImport.run([IMPORT_PACKS[0]]))[0].preserved.length, 1);
  assert.equal(docs[0].system.cost, 99);
  docs.splice(0); docs.push(makeDoc(entry));
  assert.match((await CrowsContentImport.run([IMPORT_PACKS[0]]))[0].preserved[0], /untracked/);
});

test("invalid selected file aborts preflight before any pack is changed", async () => {
  const { docs, entry } = setup();
  globalThis.fetch = async url => ({ ok: true, json: async () => url.includes("traits") ? {} : [entry] });
  await assert.rejects(CrowsContentImport.run([IMPORT_PACKS[0], IMPORT_PACKS[2]]), /non-empty/);
  assert.equal(docs.length, 0);
  assert.equal(CrowsContentImport.busy, false);
});

test("missing files are skipped and locked compendiums are not unlocked or emptied", async () => {
  const { pack, docs } = setup();
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  assert.equal((await CrowsContentImport.run())[0].missing, true);
  globalThis.fetch = async () => ({ ok: true, json: async () => [{ name: "Sword", type: "equipment", system: {} }] });
  pack.locked = true;
  assert.match((await CrowsContentImport.run([IMPORT_PACKS[0]]))[0].error, /locked/);
  assert.equal(docs.length, 0); assert.equal(pack.locked, true);
});

test("write failures report partial progress and stop subsequent packs", async () => {
  const { pack, docs } = setup();
  globalThis.fetch = async () => ({ ok: true, json: async () => ["Sword", "Axe"].map(name => ({ name, type: "equipment", system: {} })) });
  const create = pack.documentClass.createDocuments;
  pack.documentClass.createDocuments = async entries => { if (entries[0].name === "Axe") throw new Error("write failed"); return create(entries); };
  const report = await CrowsContentImport.run([IMPORT_PACKS[0], IMPORT_PACKS[1]]);
  assert.equal(report.length, 1); assert.equal(report[0].created, 1); assert.match(report[0].error, /write failed/);
  assert.equal(docs.length, 1);
});

test("import sets higher stack limits for container items (Coin Purse, Quiver of Arrows, Case of Bolts)", () => {
  const items = [
    { name: "Coin Purse", type: "equipment", system: { maxStack: 1 } },
    { name: "Quiver of Arrows", type: "equipment", system: { maxStack: 1 } },
    { name: "Quiver of 20 Arrows", type: "equipment", system: { maxStack: 1 } },
    { name: "Case of Bolts", type: "equipment", system: { maxStack: 1 } },
    { name: "Case of Crossbow Bolts", type: "equipment", system: { maxStack: 1 } },
    { name: "Sword", type: "equipment", system: { maxStack: 1 } }
  ];
  repairImportEquipment(items);
  assert.equal(items[0].system.maxStack, 500);
  assert.equal(items[1].system.maxStack, 20);
  assert.equal(items[2].system.maxStack, 20);
  assert.equal(items[3].system.maxStack, 20);
  assert.equal(items[4].system.maxStack, 20);
  assert.equal(items[5].system.maxStack, 1);
});

