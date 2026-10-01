import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTravelAction, initialTravelState, roleWarnings } from "../module/travel-state.mjs";
import { CrowsTravel } from "../module/travel.mjs";

const ref = { id: "ref", isGM: true, active: true };
const alice = { id: "alice", isGM: false, active: true };
const bob = { id: "bob", isGM: false, active: true };
const outsider = { id: "outsider", isGM: false, active: true };
const users = [ref, alice, bob, outsider];
const crow = (id, owner = "alice") => ({ id, type: "crow", testUserPermission: user => user.id === owner });
const actors = [crow("a"), crow("b", "bob"), crow("c"), crow("d"), crow("e"), { id: "monster", type: "monster" }];
const apply = (state, action, user = ref, extra = {}) => applyTravelAction(state, { session: state.session, ...action }, {
  user, actors, users, sessionId: `day-${state.day + 1}`, ...extra
});
const start = () => apply(initialTravelState(), { action: "start" });
const roles = () => ({ ...start(), step: "roles", pace: "normal" });

test("cancel travel ends the journey from party selection and retains travelers", () => {
  assert.throws(() => apply(start(),{action:"cancel-travel"}), /Cancel the current day/);
  const selection = apply({...start(),day:9,journey:{title:"Old trip"},lost:true},{action:"cancel"});
  assert.throws(() => apply(selection,{action:"cancel-travel"},alice), /Only the Ref/);
  const cancelled = apply(selection,{action:"cancel-travel"});
  assert.equal(cancelled.journeyId,null);
  assert.equal(cancelled.journey.title,"");
  assert.equal(cancelled.day,0);
  assert.equal(cancelled.lost,false);
  assert.deepEqual(cancelled.roster,selection.roster);
  assert.equal(apply(cancelled,{action:"start"}).day,1);
});

test("journey details are Ref-controlled and survive days and cancellation but not a finished trip", () => {
  let state = initialTravelState();
  assert.throws(() => apply(state,{action:"journey",field:"title",value:"Trip"},alice), /Only the Ref/);
  state = apply(state,{action:"journey",field:"title",value:"To the coast"});
  state = apply(state,{action:"start",journey:{origin:"Ash",goals:"Find shelter",notes:"Bring food"}});
  assert.equal(state.journey.title,"To the coast");
  assert.equal(state.journey.origin,"Ash");
  assert.throws(() => apply(state,{action:"journey",field:"title",value:"Changed"}), /before starting/);
  const next = apply({...state,step:"complete"},{action:"start"});
  assert.equal(next.journeyId,state.journeyId);
  assert.deepEqual(next.journey,state.journey);
  const cancelled = apply(next,{action:"cancel"});
  assert.equal(cancelled.journeyId,state.journeyId);
  assert.equal(apply(cancelled,{action:"start"}).day,2);
  const finished = apply({...next,step:"complete"},{action:"finish"});
  const fresh = apply(finished,{action:"start"},ref,{sessionId:"fresh-trip"});
  assert.equal(fresh.day,1);
  assert.equal(fresh.journeyId,"fresh-trip");
  assert.equal(fresh.journey.title,"");
});

test("cancel returns to party selection, clears daily choices, and restarts the same day", () => {
  const old = { ...roles(), day: 3, roster: ["a", "b"], roles: { a: "guide" }, votes: { alice: "slow" } };
  assert.throws(() => apply(old, { action: "cancel" }, alice), /Only the Ref/);
  const cancelled = apply(old, { action: "cancel" });
  assert.equal(cancelled.session, null);
  assert.equal(cancelled.day, 2);
  assert.equal(cancelled.pace, null);
  assert.deepEqual(cancelled.roles, {});
  assert.deepEqual(cancelled.votes, {});
  assert.deepEqual(cancelled.roster, ["a", "b"]);
  assert.throws(() => apply(cancelled, { action: "role", actorId: "a", role: "guide", session: old.session }, alice), /day changed/);
  const edited = apply(cancelled, { action: "roster", actorId: "b", included: false });
  const restarted = apply(edited, { action: "start" }, ref, { sessionId: "replacement-day" });
  assert.equal(restarted.day, 3);
  assert.deepEqual(restarted.roster, ["a"]);
  assert.throws(() => apply(restarted, { action: "cancel", session: old.session }), /day changed/);
});

test("cancel preserves completed day count and cannot subtract a day twice", () => {
  const cancelled = apply({ ...roles(), day: 3, step: "complete" }, { action: "cancel" });
  assert.equal(apply(cancelled, { action: "start" }).day, 4);
  assert.throws(() => apply(cancelled, { action: "cancel" }), /start a travel day/);
  assert.equal(apply(apply(start(), { action: "cancel" }), { action: "start" }).day, 1);
});

test("first travel defaults to all crows; later days remember the roster and reset daily choices", () => {
  let state = start();
  assert.deepEqual(state.roster, ["a", "b", "c", "d", "e"]);
  state = apply(state, { action: "roster", actorId: "b", included: false });
  state = apply(state, { action: "vote", pace: "fast" }, alice);
  state = apply(state, { action: "pace", pace: "slow" });
  state = apply(state, { action: "role", actorId: "a", role: "guide" });
  state = apply(state, { action: "step", step: "complete" });
  state = apply(state, { action: "start" });
  assert.equal(state.day, 2);
  assert.equal(state.step, "pace");
  assert.equal(state.pace, null);
  assert.deepEqual(state.votes, {});
  assert.deepEqual(state.roles, {});
  assert.deepEqual(state.roster, ["a", "c", "d", "e"]);
  assert.throws(() => apply(state, { action: "start" }), /already underway/);
});

test("an intentionally empty roster stays empty next day, including after reload", () => {
  const state = { ...start(), roster: [], step: "complete" };
  assert.deepEqual(apply(structuredClone(state), { action: "start" }).roster, []);
});

test("Ref can exclude and restore crows before the first day, and starting preserves that selection", () => {
  let state = initialTravelState();
  assert.throws(() => apply(state, { action: "roster", actorId: "b", included: false }, alice), /Only the Ref/);
  state = apply(state, { action: "roster", actorId: "b", included: false });
  assert.equal(state.session, null);
  assert.deepEqual(state.roster, ["a", "c", "d", "e"]);
  state = apply(state, { action: "roster", actorId: "b", included: true });
  assert.ok(state.roster.includes("b"));
  state = apply(state, { action: "roster", actorId: "b", included: false });
  assert.deepEqual(apply(state, { action: "start" }).roster, ["a", "c", "d", "e"]);
});

test("voting is per player, replaceable, advisory, and limited to party owners", () => {
  let state = apply(start(), { action: "vote", pace: "fast" }, alice);
  state = apply(state, { action: "vote", pace: "slow" }, alice);
  state = apply(state, { action: "vote", pace: "normal" }, bob);
  assert.deepEqual(state.votes, { alice: "slow", bob: "normal" });
  assert.equal(state.pace, null);
  assert.throws(() => apply(state, { action: "step", step: "roles" }), /Choose the group's pace/);
  assert.throws(() => apply(state, { action: "vote", pace: "slow" }, outsider), /own a crow/);
  assert.throws(() => apply(state, { action: "pace", pace: "slow" }, alice), /Only the Ref/);
  assert.throws(() => apply(state, { action: "vote", pace: "teleport" }, alice), /Choose a travel pace/);
  state = apply(state, { action: "pace", pace: "fast" });
  assert.equal(state.pace, "fast");
});

test("losing a guide race preserves the previous role; releasing the slot allows retry", () => {
  let state = apply(roles(), { action: "role", actorId: "b", role: "scout" }, bob);
  state = apply(state, { action: "role", actorId: "a", role: "guide" }, alice);
  assert.throws(() => apply(state, { action: "role", actorId: "b", role: "guide" }, bob), /Someone else/);
  assert.equal(state.roles.b, "scout");
  state = apply(state, { action: "role", actorId: "a", role: "" }, alice);
  state = apply(state, { action: "role", actorId: "b", role: "guide" }, bob);
  assert.deepEqual(state.roles, { b: "guide" });
});

test("role limits constrain players but Ref overrides only warn and never block progress", () => {
  let state = roles();
  for (const actorId of ["a", "c", "d"]) state = apply(state, { action: "role", actorId, role: "tracker" }, alice);
  assert.throws(() => apply(state, { action: "role", actorId: "e", role: "tracker" }, alice), /three travelers/);
  state = apply(state, { action: "role", actorId: "e", role: "tracker" });
  assert.equal(roleWarnings(state).length, 1);
  state = apply(state, { action: "step", step: "rest" });
  assert.equal(state.step, "rest");
  state = apply(state, { action: "role", actorId: "e", role: "guide" });
  assert.deepEqual(roleWarnings(state), []);
});

test("players cannot edit another crow, roster, procedure, or closed selections", () => {
  assert.throws(() => apply(roles(), { action: "role", actorId: "b", role: "guide" }, alice), /you own/);
  assert.throws(() => apply(roles(), { action: "roster", actorId: "a", included: false }, alice), /Only the Ref/);
  assert.throws(() => apply(roles(), { action: "step", step: "complete" }, alice), /Only the Ref/);
  assert.throws(() => apply(roles(), { action: "vote", pace: "slow" }, alice), /voting is closed/);
  assert.throws(() => apply(start(), { action: "role", actorId: "a", role: "guide" }, alice), /selection is closed/);
  assert.throws(() => apply(start(), { action: "vote", pace: "slow" }, { ...alice, active: false }), /no longer connected/);
});

test("removing a traveler clears roles and votes; deleted crows cannot occupy a slot", () => {
  let state = { ...roles(), roles: { b: "guide" }, votes: { bob: "normal", alice: "slow" } };
  state = apply(state, { action: "roster", actorId: "b", included: false });
  assert.deepEqual(state.roles, {});
  assert.deepEqual(state.votes, { alice: "slow" });
  state = apply({ ...roles(), roles: { b: "guide" } }, { action: "role", actorId: "a", role: "guide" }, alice,
    { actors: actors.filter(actor => actor.id !== "b") });
  assert.deepEqual(state.roles, { a: "guide" });
});

test("late requests from a prior day are rejected without changing the new day", () => {
  const old = start();
  const next = apply({ ...old, step: "complete" }, { action: "start" });
  assert.throws(() => apply(next, { action: "vote", pace: "fast", session: old.session }, alice), /day changed/);
  assert.deepEqual(next.votes, {});
});

function world(state = roles()) {
  let saved = structuredClone(state);
  globalThis.foundry = { utils: { randomID: () => "unique-session" } };
  globalThis.game = {
    user: ref, users: { activeGM: ref, get: id => users.find(user => user.id === id), contents: users },
    actors: { contents: actors }, settings: {
      get: () => structuredClone(saved),
      set: async (_scope, _key, value) => {
        await new Promise(resolve => setImmediate(resolve));
        saved = structuredClone(value);
      }
    }
  };
  CrowsTravel.queue = Promise.resolve();
  return () => saved;
}

test("concurrent requests serialize against persisted state and a rejected claim does not jam the queue", async () => {
  const saved = world();
  const session = saved().session;
  const outcomes = await Promise.allSettled([
    CrowsTravel.execute({ session, action: "role", actorId: "a", role: "guide" }, "alice"),
    CrowsTravel.execute({ session, action: "role", actorId: "b", role: "guide" }, "bob")
  ]);
  assert.deepEqual(outcomes.map(result => result.status), ["fulfilled", "rejected"]);
  assert.deepEqual(saved().roles, { a: "guide" });
  await CrowsTravel.execute({ session, action: "role", actorId: "b", role: "scout" }, "bob");
  assert.deepEqual(saved().roles, { a: "guide", b: "scout" });
});

test("concurrent roster changes are retained and repeated start cannot reset an active day", async () => {
  const saved = world();
  const session = saved().session;
  await Promise.all([
    CrowsTravel.execute({ session, action: "roster", actorId: "a", included: false }, "ref"),
    CrowsTravel.execute({ session, action: "roster", actorId: "b", included: false }, "ref")
  ]);
  assert.deepEqual(saved().roster, ["c", "d", "e"]);
  const initial = world(initialTravelState());
  const starts = await Promise.allSettled([1, 2].map(() => CrowsTravel.execute({ session: null, action: "start" }, "ref")));
  assert.deepEqual(starts.map(result => result.status), ["fulfilled", "rejected"]);
  assert.equal(initial().day, 1);
});

test("GM disconnect has a recoverable error and cannot leave a write queued on the old authority", async () => {
  const saved = world();
  game.users.activeGM = null;
  await assert.rejects(CrowsTravel.request({ session: saved().session, action: "vote", pace: "slow" }), /Ref must be connected/);
  await assert.rejects(CrowsTravel.execute({ session: saved().session, action: "pace", pace: "slow" }, "ref"), /active Ref changed/);
  game.users.activeGM = ref;
  await CrowsTravel.request({ session: saved().session, action: "pace", pace: "slow" });
  assert.equal(saved().pace, "slow");
});

test("player socket requests receive success and conflict replies without retaining pending requests", async () => {
  const saved = world();
  let receive;
  const packets = [];
  game.socket = { on: (_channel, handler) => { receive = handler; }, emit: (_channel, packet) => packets.push(packet) };
  CrowsTravel.activate();
  for (const [user, expectedError] of [[alice, false], [bob, true]]) {
    game.user = user;
    const pending = CrowsTravel.request({ session: saved().session, action: "role", actorId: user === alice ? "a" : "b", role: "guide" });
    const request = packets.shift();
    game.user = ref;
    await receive(request);
    const reply = packets.shift();
    assert.equal(reply.recipient, user.id);
    game.user = user;
    await receive(reply);
    if (expectedError) await assert.rejects(pending, /Someone else/);
    else await pending;
    assert.equal(CrowsTravel.pending.size, 0);
  }
  assert.deepEqual(saved().roles, { a: "guide" });
});

test("Ref sets travel EN explicitly; it survives pace edits and resets for a new day", () => {
  let state = roles();
  assert.equal(state.travelEN, null);
  assert.throws(() => apply(state, { action: "en", en: 8 }, alice), /Only the Ref/);
  for (const en of [null, "8", 0, 11, 7.5, NaN]) assert.throws(() => apply(state, { action: "en", en }), /whole number/);
  state = apply(state, { action: "en", en: 10 });
  state = apply(state, { action: "pace", pace: "fast" });
  assert.equal(state.travelEN, 10);
  assert.equal(apply({ ...state, step: "complete" }, { action: "start" }).travelEN, null);
  assert.equal(apply(state, { action: "cancel" }).travelEN, null);
});


test("named and actor hirelings participate; guests remain Ref-controlled", () => {
  let state = apply(initialTravelState(), {action:"guest", name:"Wren"}, ref, {sessionId:"wren"});
  state = apply(state, {action:"roster", actorId:"monster", included:true});
  state = apply(state, {action:"start"});
  state = apply(state, {action:"role", actorId:"guest-wren", role:"scout"});
  state = apply(state, {action:"role", actorId:"monster", role:"tracker"});
  assert.equal(state.roles["guest-wren"], "scout");
  assert.equal(state.roles.monster, "tracker");
  assert.throws(() => apply({...state, step:"roles"}, {action:"role", actorId:"guest-wren", role:"guide"}, alice), /you own/);
  assert.throws(() => apply(state, {action:"record", actorId:"guest-wren", field:"result", value:"Tier 3"}, alice), /you own/);
});

test("freeform role records never apply outcomes and respect ownership", () => {
  let state = roles();
  state = apply(state, {action:"record", actorId:"a", field:"result", value:"No roll needed"}, alice);
  state = apply(state, {action:"record", actorId:"a", field:"notes", value:"+2 hexes by Ref ruling"}, alice);
  assert.equal(state.hexes, null);
  assert.equal(state.records.a.result, "No roll needed");
  assert.throws(() => apply(state, {action:"record", actorId:"b", field:"notes", value:"changed"}, alice), /you own/);
  state = apply(state, {action:"record", actorId:"b", field:"notes", value:"Ref override"});
  state = apply(state, {action:"roster", actorId:"a", included:false});
  assert.equal(state.records.a, undefined);
});

test("pace updates only untouched totals; old manually set EN survives migration", () => {
  let state = apply(start(), {action:"pace", pace:"normal"});
  assert.deepEqual([state.hexes,state.travelEN,state.restEN], [2,7,7]);
  state = apply(state, {action:"overview", field:"travelEN", value:11});
  state = apply(state, {action:"overview", field:"hexes", delta:2});
  state = apply(state, {action:"pace", pace:"fast"});
  assert.deepEqual([state.hexes,state.travelEN,state.restEN], [4,11,6]);
  const old = {...roles(), travelEN:9}; delete old.adjusted;
  assert.equal(apply(old, {action:"pace", pace:"slow"}).travelEN, 9);
  assert.throws(() => apply(state,{action:"overview",field:"hexes",value:5},alice), /Only the Ref/);
});

test("next day keeps party and lost status but clears daily records", () => {
  let state = apply(roles(), {action:"overview",field:"lost",value:true});
  state = apply(state,{action:"overview",field:"notes",value:"River detour"});
  state = apply(state,{action:"encounter",result:"8",en:7});
  state = apply(state,{action:"encounter",index:0,field:"notes",value:"Friendly travelers"});
  assert.equal(state.encounters[0].notes,"Friendly travelers");
  const reloaded = JSON.parse(JSON.stringify(state));
  assert.equal(reloaded.encounters[0].result,"8");
  const next = apply({...reloaded,step:"complete"},{action:"start"});
  assert.equal(next.lost,true);
  assert.deepEqual(next.roster,state.roster);
  assert.deepEqual(next.encounters,[]);
  assert.equal(next.notes,"");
  assert.deepEqual(next.records,{});
});


test("participant adjustments update totals once, preserve notes, and allow reversal", () => {
  let state = apply(start(), {action:"pace",pace:"normal"});
  state = apply(state,{action:"record",actorId:"a",field:"notes",value:"Shortcut"});
  state = apply(state,{action:"role-adjust",actorId:"a",field:"hexes",delta:1});
  assert.equal(state.hexes,3);
  assert.equal(state.records.a.hexes,1);
  assert.equal(state.records.a.notes,"Shortcut");
  state = apply(state,{action:"role-adjust",actorId:"b",field:"travelEN",delta:-1});
  assert.equal(state.travelEN,6);
  assert.equal(state.restEN,7);
  state = apply(state,{action:"role-adjust",actorId:"a",field:"restEN",delta:1});
  assert.equal(state.restEN,8);
  assert.equal(state.records.a.restEN,1);
  assert.equal(state.travelEN,6);
  state = apply(state,{action:"role-adjust",actorId:"a",field:"restEN",delta:-1});
  assert.equal(state.restEN,7);
  assert.equal(state.records.a.restEN,0);
  state = apply(state,{action:"role-adjust",actorId:"a",field:"hexes",delta:-1});
  assert.equal(state.hexes,2);
  assert.equal(state.records.a.hexes,0);
  assert.throws(() => apply(state,{action:"role-adjust",actorId:"a",field:"hexes",delta:1},alice), /Only the Ref/);
  assert.throws(() => apply(state,{action:"role-adjust",actorId:"missing",field:"hexes",delta:1}), /no longer/);
  assert.throws(() => apply(state,{action:"role-adjust",actorId:"a",field:"notes",delta:1}), /Choose a travel/);
});


test("only the Ref can delete an encounter; stale deletes cannot remove another record", () => {
  let state = apply(roles(),{action:"encounter",result:"8",en:7});
  state = apply(state,{action:"encounter",result:"4",en:9});
  const request = {action:"delete-encounter",index:0,expected:JSON.stringify(state.encounters[0])};
  assert.throws(() => apply(state,request,alice), /Only the Ref/);
  const next = apply(state,request);
  assert.equal(next.encounters.length,1);
  assert.equal(next.encounters[0].result,"4");
  assert.throws(() => apply(next,request), /changed/);
  assert.throws(() => apply(next,{...request,index:9}), /no longer/);
});


test("finish travel ends a completed session without losing results or advancing the day", () => {
  let state = apply(roles(), {action:"record",actorId:"a",field:"notes",value:"Arrived and rested"});
  state = apply(state, {action:"step",step:"rest"});
  state = apply(state, {action:"step",step:"miasma"});
  state = apply(state, {action:"step",step:"complete"});
  assert.throws(() => apply(state,{action:"finish"},alice), /Only the Ref/);
  assert.throws(() => apply({...state,step:"rest"},{action:"finish"}), /Complete the travel day/);
  const finished = apply(state,{action:"finish"});
  assert.equal(finished.session,null);
  assert.equal(finished.day,state.day);
  assert.deepEqual(finished.roster,state.roster);
  assert.deepEqual(finished.records,state.records);
  assert.throws(() => apply(finished,{action:"finish",session:state.session}), /day changed/);
  const next = apply(finished,{action:"start"});
  assert.equal(next.day,1);
  assert.deepEqual(next.records,{});
  const destination = apply(roles(),{action:"step",step:"complete"});
  assert.equal(apply(destination,{action:"finish"}).session,null);
});
