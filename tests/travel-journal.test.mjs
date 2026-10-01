import { test } from "node:test";
import assert from "node:assert/strict";
import { journeyJournalHTML, travelJournalHTML, travelJournalOwnership, saveTravelJournalDay, refreshTravelJournalAccess } from "../module/travel-journal.mjs";
import { CrowsTravel } from "../module/travel.mjs";
import { initialTravelState } from "../module/travel-state.mjs";

const scope = "fvtt-crows-system";
const users = [{id:"ref",isGM:true,active:true,role:4},{id:"player",active:true,role:1},{id:"trusted",active:true,role:2}];
function fixture() {
  let state = {...initialTravelState(), session:"day-one",day:1,step:"complete",pace:"normal",roster:["a","guest"],guests:{guest:"Wren"},roles:{a:"scout"},records:{a:{restEN:1,result:"Tier 2",notes:"Found shelter"}},hexes:3,travelEN:7,restEN:8,notes:"Arrived"};
  let autoSave = true;
  let audience = "all", failSettings = false, failPage = false;
  const entries = [];
  let creates = 0;
  const document = data => ({...data,getFlag:(namespace,key) => data.flags?.[namespace]?.[key],async update(update){Object.assign(this,update);}});
  globalThis.game = {user:users[0],users:{contents:users,activeGM:users[0],get:id=>users.find(user=>user.id===id)},actors:{contents:[{id:"a",name:"Mara",type:"crow"}]},journal:{contents:entries},settings:{
    get:(_scope,key)=>key==="travelState"?structuredClone(state):key==="travelJournalAutoSave"?autoSave:audience,
    set:async (_scope,key,value)=>{assert.equal(key,"travelState");if(failSettings)throw new Error("Settings unavailable");state=structuredClone(value);}
  }};
  globalThis.foundry={utils:{randomID:()=>"new-session"}};
  globalThis.JournalEntry={create:async data=>{
    const entry = document(data);entry.pages={contents:[]};
    entry.createEmbeddedDocuments=async (type,pages)=>{
      assert.equal(type,"JournalEntryPage");if(failPage)throw new Error("Page unavailable");
      for(const page of pages){entry.pages.contents.push(document({...page,id:`p${++creates}`}));}
      return entry.pages.contents;
    };
    entries.push(entry);return entry;
  }};
  CrowsTravel.queue=Promise.resolve();
  return {setAutoSave:value=>autoSave=value,state:()=>state,entries,creates:()=>creates,setAudience:value=>audience=value,failSettings:value=>failSettings=value,failPage:value=>failPage=value};
}

test("preview records totals, adjustments, party, lost status, encounters, and escapes freeform HTML",()=>{
  const f=fixture();const state=f.state();state.lost=true;state.notes='<img src=x onerror=alert(1)>\nSecond line';
  state.encounters=[{kind:"Rest",en:8,result:"9",notes:"Visitors"}];
  const html=travelJournalHTML(state,game.actors.contents);
  for(const text of ["Mara","Wren","scout","Found shelter","Tier 2","Lost","Rest check","Visitors","Other adjustments"]) assert.ok(html.includes(text));
  assert.ok(html.includes("&lt;img"));assert.ok(!html.includes("<img"));assert.ok(html.includes("<br>Second line"));
  assert.match(html, /<td>Hex allowance<\/td><td>2<\/td><td>\+0<\/td><td>\+1<\/td><td>3<\/td>/);
});

test("automatic journal setting is world-scoped and enabled by default", () => {
  fixture();
  const registrations = new Map();
  game.settings.register = (_scope,key,config) => registrations.set(key,config);
  globalThis.Hooks = {on(){}};
  CrowsTravel.register(() => {});
  const setting = registrations.get("travelJournalAutoSave");
  assert.equal(setting.default,true);
  assert.equal(setting.scope,"world");
  assert.equal(setting.type,Boolean);
});

test("disabled journal saving permits finish and next day without creating pages or changing existing ones", async () => {
  for (const action of ["finish","start"]) {
    const f = fixture();
    await saveTravelJournalDay({...f.state(),session:"earlier-day"});
    const before = JSON.stringify(f.entries);
    f.setAutoSave(false);
    f.failPage(true);
    await CrowsTravel.execute({action,session:"day-one"},"ref");
    assert.equal(JSON.stringify(f.entries),before);
    assert.equal(f.state().day,action === "start" ? 2 : 1);
    assert.equal(f.state().session,action === "start" ? "new-session" : null);
  }
  const fresh = fixture();
  fresh.setAutoSave(false);
  await CrowsTravel.execute({action:"finish",session:"day-one"},"ref");
  assert.equal(fresh.entries.length,0);
});

test("reenabling automatic journals saves the current day without backfilling skipped days", async () => {
  const f = fixture();
  f.setAutoSave(false);
  await CrowsTravel.execute({action:"start",session:"day-one"},"ref");
  await CrowsTravel.execute({action:"pace",session:"new-session",pace:"normal"},"ref");
  await CrowsTravel.execute({action:"step",session:"new-session",step:"complete"},"ref");
  f.setAutoSave(true);
  await CrowsTravel.execute({action:"finish",session:"new-session"},"ref");
  assert.deepEqual(f.entries[0].pages.contents.map(page=>page.name),["Day 2"]);
});

test("players can edit by default; trusted mode leaves ordinary players read-only",()=>{
  assert.deepEqual(travelJournalOwnership(users,"all"),{default:3});
  assert.deepEqual(travelJournalOwnership(users,"trusted"),{default:2,ref:3,player:2,trusted:3});
});

test("a day is saved once per session; saved HTML matches the preview",async()=>{
  const f=fixture();const state=f.state();
  const entry=await saveTravelJournalDay(state);
  assert.equal(entry.name,"Travel Journal");assert.deepEqual(entry.ownership,{default:3});
  assert.equal(entry.pages.contents[0].text.content,travelJournalHTML(state,game.actors.contents));
  assert.deepEqual(entry.pages.contents[0].ownership,{default:-1});
  await saveTravelJournalDay({...state,notes:"Updated"});
  assert.equal(f.creates(),1);assert.doesNotMatch(entry.pages.contents[0].text.content,/Updated/);
  await saveTravelJournalDay({...state,session:"day-two",day:2});
  assert.equal(f.creates(),2);
});

test("finish saves notes before ending; starting the next day saves before clearing records",async()=>{
  let f=fixture();await CrowsTravel.execute({action:"finish",session:"day-one",journalNotes:"New notes"},"ref");
  assert.equal(f.state().session,null);assert.equal(f.state().day,1);
  assert.match(f.entries[0].pages.contents[0].text.content,/New notes/);
  f=fixture();await CrowsTravel.execute({action:"start",session:"day-one"},"ref");
  assert.equal(f.state().day,2);assert.deepEqual(f.state().records,{});assert.equal(f.creates(),1);
});

test("failed journal save leaves day open; failed state write retries without duplicate pages",async()=>{
  const f=fixture();const request={action:"finish",session:"day-one"};
  f.failPage(true);await assert.rejects(CrowsTravel.execute(request,"ref"),/day is still open/);
  assert.equal(f.state().session,"day-one");
  f.failPage(false);f.failSettings(true);await assert.rejects(CrowsTravel.execute(request,"ref"),/Settings unavailable/);
  assert.equal(f.creates(),1);assert.equal(f.state().session,"day-one");
  f.failSettings(false);await CrowsTravel.execute(request,"ref");assert.equal(f.creates(),1);assert.equal(f.state().session,null);
});

test("permission changes update an existing journal, and players cannot save or advance",async()=>{
  const f=fixture();await saveTravelJournalDay(f.state());
  f.setAudience("trusted");await refreshTravelJournalAccess();
  assert.deepEqual(f.entries[0].ownership,{default:2,ref:3,player:2,trusted:3});
  f.setAudience("all");await refreshTravelJournalAccess();assert.deepEqual(f.entries[0].ownership,{default:3});
  await assert.rejects(CrowsTravel.execute({action:"finish",session:"day-one"},"player"),/Only the Ref/);
  assert.equal(f.state().session,"day-one");
  game.user=users[1];await assert.rejects(saveTravelJournalDay(f.state()),/active Ref/);
});

test("journeys have separate journals and preserve player edits when saving or retrying", async () => {
  const f = fixture();
  const state = {...f.state(), journeyId:"trip-one", journey:{title:"To the coast",origin:"Ash village",goals:"Find shelter",notes:"<b>Shared</b>\nBring food"}};
  const entry = await saveTravelJournalDay(state);
  assert.equal(entry.name,"To the coast");
  assert.equal(entry.pages.contents.length,2);
  assert.equal(entry.pages.contents[0].text.content,journeyJournalHTML(state.journey));
  assert.match(entry.pages.contents[0].text.content,/&lt;b&gt;Shared/);
  entry.pages.contents[0].text.content = "Player's journey notes";
  entry.pages.contents[1].text.content = "Player's day notes";
  await saveTravelJournalDay({...state,notes:"Retry"});
  await saveTravelJournalDay({...state,session:"day-two",day:2});
  assert.equal(entry.pages.contents.length,3);
  assert.equal(entry.pages.contents[0].text.content,"Player's journey notes");
  assert.equal(entry.pages.contents[1].text.content,"Player's day notes");
  await saveTravelJournalDay({...state,journeyId:"trip-two",session:"another-day",journey:{title:"Homeward"}});
  assert.equal(f.entries.length,2);
  assert.equal(f.entries[1].name,"Homeward");
  f.setAudience("trusted"); await refreshTravelJournalAccess();
  for (const journal of f.entries) assert.deepEqual(journal.ownership,{default:2,ref:3,player:2,trusted:3});
});
