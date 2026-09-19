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
