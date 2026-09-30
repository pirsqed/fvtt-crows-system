import { test } from "node:test";
import assert from "node:assert/strict";
import { initialTravelState } from "../module/travel-state.mjs";
import { CrowsTravel } from "../module/travel.mjs";

globalThis.FormApplication = class {
  render() { this.rendered = true; this.renderCount = (this.renderCount ?? 0) + 1; return this; }
};
const { CrowsTravelHelper } = await import("../module/apps/travel-helper.mjs");

test("saving a roster edit preserves the open drawer, including after a rejected update", async () => {
  setup();
  const helper = new CrowsTravelHelper();
  helper.element = { find: selector => selector === ".travel-roster-drawer" ? [{ open: true }] : { prop() {} } };
  const original = CrowsTravel.request;
  try {
    CrowsTravel.request = async () => {};
    await helper.send({ action: "roster", actorId: "a", included: false });
    assert.equal(helper.getData().rosterOpen, true);
    CrowsTravel.request = async () => { throw new Error("Ref disconnected"); };
    await helper.send({ action: "roster", actorId: "a", included: false });
    assert.equal(helper.getData().rosterOpen, true);
    assert.equal(helper.busy, false);
    assert.equal(helper.error, "Ref disconnected");
  } finally { CrowsTravel.request = original; }
});

function setup(state = { ...initialTravelState(), session: "one", day: 1, roster: ["a", "b"], step: "roles", pace: "normal" }) {
  const actors = [{ id: "a", type: "crow", name: "Alice's crow", isOwner: true, visible: true },
    { id: "b", type: "crow", name: "Bob's crow", isOwner: false, visible: true }];
  globalThis.game = { user: { id: "alice", isGM: false },
    users: { activeGM: { id: "ref" } },
    actors: { get: id => actors.find(actor => actor.id === id), filter: fn => actors.filter(fn) },
    settings: { get: () => state }, tables: { contents: [] }
  };
  CrowsTravelHelper.instance = null;
  CrowsTravelHelper.seenSession = null;
  return { state, actors };
}

test("players see shared assignments but can edit only their own during role selection", () => {
  const { state } = setup();
  state.roles.b = "guide";
  const helper = new CrowsTravelHelper();
  let data = helper.getData();
  assert.equal(data.members[0].canAssign, true);
  assert.equal(data.members[1].canAssign, false);
  assert.equal(data.members[1].role, "Guide");
  assert.match(data.members[0].roles.find(role => role.id === "guide").label, /1\/1/);
  assert.deepEqual(data.candidates, []);
  state.step = "rest";
  data = helper.getData();
  assert.ok(data.members.every(member => !member.canAssign));
  assert.equal(data.voting, false);
});

test("GM has roster and override controls while imported tables remain optional", () => {
  setup(); game.user.isGM = true;
  const data = new CrowsTravelHelper().getData();
  assert.equal(data.candidates.length, 2);
  assert.ok(data.members.every(member => member.canAssign));
  assert.deepEqual(data.tables, []);
});

test("auto-open once per day, refresh open windows, and respect closing until the next day", () => {
  const { state } = setup();
  CrowsTravelHelper.sync();
  const helper = CrowsTravelHelper.instance;
  assert.equal(helper.renderCount, 1);
  CrowsTravelHelper.sync();
  assert.equal(helper.renderCount, 2);
  helper.rendered = false;
  CrowsTravelHelper.sync();
  assert.equal(helper.rendered, false);
  state.session = "two";
  CrowsTravelHelper.sync();
  assert.equal(helper.rendered, true);
});

test("nonparticipants are not summoned; newly added owners are; menu-created windows receive updates", () => {
  const { state } = setup();
  state.roster = ["b"];
  CrowsTravelHelper.sync();
  assert.equal(CrowsTravelHelper.instance, null);
  state.roster.push("a");
  CrowsTravelHelper.sync();
  assert.equal(CrowsTravelHelper.instance.rendered, true);
  const fromMenu = new CrowsTravelHelper().render(true);
  CrowsTravelHelper.sync();
  assert.equal(fromMenu.renderCount, 2);
});

test("deleted and hidden actors are omitted from the player view", () => {
  const { actors, state } = setup();
  actors[1].visible = false;
  state.roster.push("deleted");
  const data = new CrowsTravelHelper().getData();
  assert.deepEqual(data.members.map(actor => actor.id), ["a"]);
});

test("all steps offer custom and imported tables", () => {
  const { state } = setup(); game.user.isGM = true;
  game.tables.contents = [
    { id: "travel", name: "Travel Encounters" },
    { id: "weather", name: "Bad Weather" },
    { id: "dungeon", name: "Dungeon Encounters" },
    { id: "renamed", name: "Our travel table", flags: { "fvtt-crows-system": { importSource: { key: "undefined:travel encounters" } } } }
  ];
  state.step = "travel";
  assert.deepEqual(new CrowsTravelHelper().getData().tables.map(t => t.id).sort(), ["dungeon", "renamed", "travel", "weather"]);
  state.step = "rest";
  assert.equal(new CrowsTravelHelper().getData().tables.length, 4);
});

test("travel check uses the timer roller with the saved EN and rejects players and stale days", async () => {
  const { state } = setup(); game.user.isGM = true;
  state.step = "travel"; state.travelEN = 8;
  const calls = [];
  game.crows = { rollEncounterCheck: async (...args) => calls.push(args) };
  const helper = new CrowsTravelHelper(); helper.getData();
  helper.element = { find: () => ({ prop() {} }) };
  await helper.rollEncounter();
  assert.deepEqual(calls, [[8, { travel: true }]]);
  game.user.isGM = false; await helper.rollEncounter();
  game.user.isGM = true; state.session = "changed"; await helper.rollEncounter();
  assert.equal(calls.length, 1);
  helper.getData(); state.travelEN = null; await helper.rollEncounter();
  assert.match(helper.error, /Set the travel EN/);
  assert.equal(calls.length, 1);
});


test("rolled checks are saved with their original EN and session", async () => {
  const {state} = setup(); game.user.isGM = true;
  state.step = "travel"; state.travelEN = 9;
  const saved = [];
  game.crows = {rollEncounterCheck: async () => ({result:8,en:9})};
  const helper = new CrowsTravelHelper(); helper.getData();
  helper.element = {find: () => ({prop(){}})};
  const original = CrowsTravel.request;
  try {
    CrowsTravel.request = async request => saved.push(request);
    await helper.rollEncounter();
    assert.deepEqual(saved, [{action:"encounter",session:"one",result:"8",en:9}]);
  } finally { CrowsTravel.request = original; }
});

test("drafts survive failed writes and clear after successful save or a new day", async () => {
  const {state} = setup();
  const helper = new CrowsTravelHelper(); helper.getData();
  helper.element = {find: () => ({prop(){}})};
  helper.drafts.set("record:a:notes", "Ref ruling");
  const original = CrowsTravel.request;
  try {
    CrowsTravel.request = async () => {throw new Error("Offline");};
    await helper.send({action:"record",actorId:"a",field:"notes",value:"Ref ruling"});
    assert.equal(helper.drafts.get("record:a:notes"), "Ref ruling");
    CrowsTravel.request = async () => {};
    await helper.send({action:"record",actorId:"a",field:"notes",value:"Ref ruling"});
    assert.equal(helper.drafts.size, 0);
    helper.drafts.set("overview:notes", "Unfinished");
    state.session = "next"; helper.getData();
    assert.equal(helper.drafts.size, 0);
  } finally { CrowsTravel.request = original; }
});

test("table source pages and named travelers appear without actor-sheet links", () => {
  const {state} = setup(); game.user.isGM = true;
  state.guests = {guest:"Wren"}; state.roster.push("guest");
  game.tables.contents = [{id:"minor",name:"Minor Interesting Things",flags:{"fvtt-crows-pdf-importer":{source:{set:"ref",pages:[12,13]}}}}];
  const data = new CrowsTravelHelper().getData();
  assert.equal(data.members.find(member => member.id === "guest").canOpen, false);
  assert.equal(data.members.find(member => member.id === "guest").canRecord, true);
  assert.equal(data.tables[0].reference, "Ref Book, pp. 12, 13");
});


test("reference links recognize short names, whitespace, and renamed imported major tables", async () => {
  const {findTravelReferenceTable} = await import("../module/apps/travel-helper.mjs");
  for (const table of [
    {id:"major",name:"  Major   Interesting Things "},
    {id:"major",name:"Major Things"},
    {id:"major",name:"Renamed",flags:{"fvtt-crows-system":{importSource:{key:"undefined:major interesting things"}}}},
    {id:"major",name:"Renamed",flags:{"fvtt-crows-pdf-importer":{source:{set:"ref",pages:[14]}}}}
  ]) assert.equal(findTravelReferenceTable([table],"Major Interesting Things").id,"major");
  assert.equal(findTravelReferenceTable([],"Major Interesting Things"),null);
  const {state} = setup(); game.user.isGM = true;
  assert.equal(new CrowsTravelHelper().getData().showOtherTables,false);
  state.step = "travel";
  assert.equal(new CrowsTravelHelper().getData().showOtherTables,true);
});


test("reference resolution prefers world overrides without reading a compendium", async () => {
  const {resolveTravelReference} = await import("../module/apps/travel-helper.mjs");
  const world = {id:"custom",name:"Major Things"};
  assert.equal(await resolveTravelReference("Major Interesting Things",[world],{get(){throw new Error("Should not read pack");}}),world);
});

test("reference resolution reads the importer index and opens only the matching packed table", async () => {
  const {resolveTravelReference,readTravelCompendiumIndex} = await import("../module/apps/travel-helper.mjs");
  const document = {id:"major",sheet:{render(){}}};
  const calls = [];
  const pack = {documentName:"RollTable",locked:true,
    getIndex:async options => { calls.push(options); return {contents:[{_id:"major",name:"Major Interesting Things"}]}; },
    getDocument:async id => {assert.equal(id,"major");return document;}
  };
  const packs = new Map([["world.crows-ref-tables",pack]]);
  assert.equal(await resolveTravelReference("Major Interesting Things",[],packs),document);
  assert.ok(calls[0].fields.includes("flags.fvtt-crows-pdf-importer.source"));
  assert.equal(await resolveTravelReference("Minor Interesting Things",[],packs),null);
  assert.deepEqual(await readTravelCompendiumIndex(new Map()),[]);
});

test("reference button opens a compendium sheet without importing or rolling automatically", async () => {
  setup(); game.user.isGM = true;
  let opened = 0;
  game.packs = new Map([["world.crows-ref-tables", {documentName:"RollTable",
    getIndex:async () => ({contents:[{_id:"major",name:"Major Interesting Things"}]}),
    getDocument:async () => ({sheet:{render:force => {assert.equal(force,true);opened++;}}})
  }]]);
  const helper = new CrowsTravelHelper();
  await helper.openReference("Major Interesting Things");
  assert.equal(opened,1);
  game.user.isGM = false;
  await helper.openReference("Major Interesting Things");
  assert.equal(opened,1);
});


test("rest check uses rest EN, records rest context, and hides sheet buttons", async () => {
  const {state} = setup(); game.user.isGM = true;
  state.step = "rest"; state.travelEN = 6; state.restEN = 9;
  const calls = [], saved = [];
  game.crows = {rollEncounterCheck: async (...args) => {calls.push(args);return {result:8,en:9};}};
  const helper = new CrowsTravelHelper();
  assert.equal(helper.getData().showSheets,false);
  helper.element = {find: () => ({prop(){}})};
  const original = CrowsTravel.request;
  try {
    CrowsTravel.request = async request => saved.push(request);
    await helper.rollEncounter();
    assert.deepEqual(calls, [[9,{rest:true}]]);
    assert.equal(saved[0].kind,"Rest");
    assert.equal(saved[0].en,9);
    state.restEN = null;
    await helper.rollEncounter();
    assert.equal(calls.length,1);
    assert.match(helper.error,/Set the rest EN/);
  } finally {CrowsTravel.request = original;}
});
