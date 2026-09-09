import { test } from "node:test";
import assert from "node:assert/strict";
import { salePercentage, startingInstitutions, newVillageEntry, addCrowToVillage, validateVillageEntry, rollVillageEvent } from "../module/village.mjs";

function collection() { const map = new Map(); map[Symbol.iterator] = function* () { yield* this.values(); }; return map; }
function village(id = "village1") {
  return { id, type: "village", name: "Test <village>", isOwner: true, items: collection(), system: { prosperity: 0, cycle: 1 },
    async createEmbeddedDocuments(type, docs, options) { assert.equal(type, "Item"); assert.equal(options.keepId, true);
      for (const data of docs) this.items.set(data._id, { ...structuredClone(data), id: data._id }); return docs; } };
}
const crow = () => ({ id: "crow1", type: "crow", name: "Test Crow", visible: true, flags: { "fvtt-crows-system": {
  homeVillageId: "village1", creation: { connection: { name: "NPC", relationship: "Friend\nNeighbour", benefit: "Benefit", description: "Details" } } } } });

test("prosperity sale percentages include all boundaries and reject invalid values", () => {
  assert.deepEqual(Array.from({length:21}, (_, i) => salePercentage(i-10)), [30,40,40,40,40,45,45,45,45,50,50,50,55,55,55,55,60,60,60,60,70]);
  for (const value of [-11,11,0.5,NaN,"0"]) assert.throws(() => salePercentage(value));
});
test("starting institutions preserve existing names, levels and custom records", () => {
  const existing = [{...newVillageEntry("institution", "Smithy"), system: {kind:"institution",category:"Blacksmith",level:3}}, newVillageEntry("npc","Inn")];
  const before = structuredClone(existing);
  const added = startingInstitutions(existing);
  assert.deepEqual(added.map(i=>i.name), ["Crypt","General Store","Inn","Temple"]);
  assert.deepEqual(existing,before);
  assert.equal(startingInstitutions([...existing,...added]).length,0);
});
test("home village copies a connection; other villages and independent NPCs remain separate", async () => {
  const home = village(), other = village("village2"), actor = crow();
  await addCrowToVillage(home,actor); await addCrowToVillage(other,actor);
  assert.equal(home.items.get(actor.id).system.npcName,"NPC");
  assert.equal(other.items.get(actor.id).system.npcName,"");
  home.items.get(actor.id).system.relationship="Edited locally";
  await addCrowToVillage(home,actor);
  assert.equal(home.items.size,1);
  assert.equal(home.items.get(actor.id).system.relationship,"Edited locally");
  assert.equal(actor.flags["fvtt-crows-system"].creation.connection.relationship,"Friend\nNeighbour");
  assert.equal(newVillageEntry("npc").system.status,"resident");
});
test("linking requires ownership and visible Crows and rejects record ID collisions", async () => {
  const v=village(), c=crow(); v.isOwner=false;
  await assert.rejects(addCrowToVillage(v,c),/permission/); v.isOwner=true;
  await assert.rejects(addCrowToVillage(v,{...c,visible:false}),/view/);
  await assert.rejects(addCrowToVillage(v,{...c,type:"monster"}),/Crow/);
  v.items.set(c.id,newVillageEntry("npc")); await assert.rejects(addCrowToVillage(v,c),/already in use/);
});
test("institution validation rejects impossible levels and undated pending changes", () => {
  const data={kind:"institution",status:"active",level:2,maxLevel:4,pendingLevel:3,readyCycle:2};
  assert.doesNotThrow(()=>validateVillageEntry(data));
  for (const patch of [{level:5},{pendingLevel:5},{maxLevel:7},{readyCycle:0},{level:1.5},{status:"completed"}]) assert.throws(()=>validateVillageEntry({...data,...patch}));
});
test("village events use the native Foundry Roll message and current prosperity", async () => {
  const calls=[];
  globalThis.Roll=class { constructor(formula){this.formula=formula;calls.push(this);} async evaluate(){this.evaluated=true;return this;} async toMessage(data,options){this.message=data;this.options=options;return data;} };
  const v=village(); v.system.prosperity=-3;
  await rollVillageEvent(v);
  assert.equal(calls[0].formula,"1d10 - 3"); assert.equal(calls[0].evaluated,true);
  assert.match(calls[0].message.flavor,/Test &lt;village&gt;/); assert.equal(calls[0].options,undefined);
  v.isOwner=false; await assert.rejects(rollVillageEvent(v),/permission/); assert.equal(calls.length,1);
});
