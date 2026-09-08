import { test } from "node:test";
import assert from "node:assert/strict";
import { CrowsChatActions } from "../module/chat-actions.mjs";
import { CHAT_SCOPE, damageSnapshot, renderRollState, resolveActor } from "../module/chat-state.mjs";

function fixture() {
  const player = { id: "player", isGM: false };
  const other = { id: "other", isGM: false };
  const actor = { uuid: "Scene.old.Token.crow.Actor.base", type: "crow", items: { contents: [] },
    system: { stamina: { value: 10 }, expertises: { athletics: { value: 1, max: 1 } } },
    testUserPermission: user => user.id === "player",
    toObject() { return { system: structuredClone(this.system) }; },
    async spendExpertise() { this.system.expertises.athletics.value--; return { success: true, remaining: 0 }; },
    async applyAllocatedDamage(alloc) { this.system.stamina.value -= alloc.damageTotal; return { damageTotal: alloc.damageTotal }; }
  };
  const state = { version: 1, actorUuid: actor.uuid, expertiseAllowed: true, kind: "weapon", tier: 1,
    isDoom: false, revision: 0, actions: {}, targets: [{ uuid: "Scene.old.Token.target", name: "Goblin" }],
    outcomes: { 1: { tierTitle: "Miss", numericDamage: 0 }, 2: { tierTitle: "Hit", numericDamage: 2 }, 3: { tierTitle: "Strong hit", numericDamage: 5 } } };
  const message = { id: "message", author: player, whisper: [], state,
    getFlag() { return this.state; },
    async update(data) { this.state = structuredClone(data[`flags.${CHAT_SCOPE}.rollState`]); this.content = data.content; } };
  const docs = new Map([[actor.uuid, actor], ["Scene.old.Token.target", { documentName: "Token", actor }]]);
  const messages = new Map([[message.id, message]]);
  globalThis.fromUuid = async uuid => docs.get(uuid);
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  globalThis.game = { messages, users: { get: id => id === player.id ? player : other } };
  return { actor, message, docs, messages };
}

test("token resolution uses the saved scene and never substitutes a world actor", async () => {
  const { actor, docs } = fixture();
  assert.equal(await resolveActor("Scene.old.Token.target"), actor);
  docs.delete("Scene.old.Token.target");
  docs.set("Actor.base", { name: "Wrong actor" });
  assert.equal(await resolveActor("Scene.old.Token.target"), undefined);
});

test("two expertise clicks spend one use and persist one tier upgrade", async () => {
  const { actor, message } = fixture();
  const request = { messageId: message.id, action: "expertise", key: "athletics" };
  const results = await Promise.allSettled([CrowsChatActions.execute(request, "player"), CrowsChatActions.execute(request, "player")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(actor.system.expertises.athletics.value, 0);
  assert.equal(message.state.tier, 2);
  assert.equal(message.state.revision, 1);
  assert.doesNotMatch(message.content, /data-action="expertise"/);
  assert.match(message.content, /Apply 2 Damage/);
});

test("competing rolls cannot spend the same final expertise use", async () => {
  const { message, messages } = fixture();
  const second = { ...message, id: "second", state: structuredClone(message.state) };
  messages.set(second.id, second);
  const results = await Promise.allSettled([message, second].map(m => CrowsChatActions.execute({
    messageId: m.id, action: "expertise", key: "athletics"
  }, "player")));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
});

test("damage applies once; replay, stale snapshots and permissions are rejected", async () => {
  const { actor, message } = fixture();
  message.state.tier = 2;
  const request = { messageId: message.id, action: "damage", targetUuid: "Scene.old.Token.target",
    snapshot: damageSnapshot(actor), revision: 0, allocation: { damageTotal: 2 } };
  await assert.rejects(CrowsChatActions.execute(request, "other"), /permission/);
  await assert.rejects(CrowsChatActions.execute({ ...request, snapshot: "stale" }, "player"), /target changed/);
  await assert.rejects(CrowsChatActions.execute({ ...request, revision: 1 }, "player"), /roll changed/);
  await CrowsChatActions.execute(request, "player");
  await assert.rejects(CrowsChatActions.execute({ ...request, snapshot: damageSnapshot(actor) }, "player"), /already/);
  assert.equal(actor.system.stamina.value, 8);
  assert.equal(message.state.actions["damage:Scene.old.Token.target"].status, "applied");
});

test("damage cannot be redirected to a different token, and doom cannot be upgraded", async () => {
  const { actor, message, docs } = fixture();
  docs.set("Scene.other.Token.target", { documentName: "Token", actor });
  await assert.rejects(CrowsChatActions.execute({ messageId: message.id, action: "damage",
    targetUuid: "Scene.other.Token.target" }, "player"), /not a target/);
  message.state.isDoom = true;
  await assert.rejects(CrowsChatActions.execute({ messageId: message.id, action: "expertise", key: "athletics" }, "player"), /no longer/);
});

test("partial failures remain marked for review and do not spend again", async () => {
  const { actor, message } = fixture();
  let calls = 0;
  actor.spendExpertise = async () => { calls++; throw new Error("write failed"); };
  const request = { messageId: message.id, action: "expertise", key: "athletics" };
  await assert.rejects(CrowsChatActions.execute(request, "player"), /write failed/);
  await assert.rejects(CrowsChatActions.execute(request, "player"), /no longer/);
  assert.equal(calls, 1);
  assert.equal(message.state.actions.expertise.status, "needs review");
});

test("upgrading Miasma replaces consequences and available actions", () => {
  const { message } = fixture();
  const state = { ...message.state, kind: "miasma" };
  assert.match(renderRollState(state), /data-action="gain"/);
  state.tier = 2; state.expertise = { label: "Athletics" };
  assert.doesNotMatch(renderRollState(state), /data-action="gain"|data-action="clear"|data-action="expertise"/);
  state.tier = 3;
  assert.match(renderRollState(state), /data-action="clear"/);
});
