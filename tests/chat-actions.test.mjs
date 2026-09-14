import { test } from "node:test";
import assert from "node:assert/strict";
import { CrowsChatActions } from "../module/chat-actions.mjs";
import { CHAT_SCOPE, damageSnapshot, renderRollState, resolveActor } from "../module/chat-state.mjs";

function fixture() {
  const player = { id: "player", isGM: false };
  const other = { id: "other", isGM: false };
  const gm = { id: "gm", isGM: true };
  const actor = { uuid: "Scene.old.Token.crow.Actor.base", type: "crow", items: { contents: [] },
    system: { stamina: { value: 10 }, expertises: { athletics: { value: 1, max: 1 } } },
    testUserPermission: user => user.id === "player",
    toObject() { return { system: structuredClone(this.system) }; },
    async spendExpertise() { this.system.expertises.athletics.value--; return { success: true, remaining: 0 }; },
    async update(data) {
      for (const [path, value] of Object.entries(data)) this.system.expertises[path.split(".")[2]].value = value;
    },
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
  globalThis.game = { messages, user: player, users: { get: id => ({ player, other, gm })[id] } };
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

test("manually adjusted damage is recorded and still cannot be applied twice", async () => {
  const { actor, message } = fixture();
  message.state.tier = 2;
  const request = { messageId: message.id, action: "damage", targetUuid: "Scene.old.Token.target",
    snapshot: damageSnapshot(actor), revision: 0, allocation: { damageTotal: 4 } };
  await CrowsChatActions.execute(request, "player");
  assert.equal(actor.system.stamina.value, 6);
  assert.equal(message.state.actions["damage:Scene.old.Token.target"].damageTotal, 4);
  assert.match(message.content, /4 damage/);
  await assert.rejects(CrowsChatActions.execute({ ...request, snapshot: damageSnapshot(actor) }, "player"), /already/);
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

test("only the GM can undo expertise, refunding once and allowing another choice", async () => {
  const { actor, message } = fixture();
  const apply = { messageId: message.id, action: "expertise", key: "athletics" };
  await CrowsChatActions.execute(apply, "player");
  assert.match(message.content, /data-action="undo-expertise"/);
  const undo = { messageId: message.id, action: "undo-expertise", revision: 1 };
  await assert.rejects(CrowsChatActions.execute(undo, "player"), /Only the Ref\/GM/);
  const results = await Promise.allSettled([
    CrowsChatActions.execute(undo, "gm"), CrowsChatActions.execute(undo, "gm")
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(actor.system.expertises.athletics.value, 1);
  assert.equal(message.state.tier, 1);
  assert.equal(message.state.revision, 2);
  assert.equal(message.state.expertise, null);
  assert.match(message.content, /data-action="expertise"/);
  assert.doesNotMatch(message.content, /data-action="undo-expertise"|Apply 2 Damage/);
  await CrowsChatActions.execute(apply, "player");
  await assert.rejects(CrowsChatActions.execute(undo, "gm"), /roll changed/);
  await CrowsChatActions.execute({ ...undo, revision: 3 }, "gm");
  assert.equal(actor.system.expertises.athletics.value, 1);
  assert.equal(message.state.tier, 1);
});

test("undo restores special outcomes and never refunds beyond the expertise maximum", async () => {
  const { actor, message } = fixture();
  message.state.special = { tierTitle: "Special original outcome", numericDamage: 1 };
  await CrowsChatActions.execute({ messageId: message.id, action: "expertise", key: "athletics" }, "player");
  actor.system.expertises.athletics.value = 1;
  await CrowsChatActions.execute({ messageId: message.id, action: "undo-expertise", revision: 1 }, "gm");
  assert.equal(actor.system.expertises.athletics.value, 1);
  assert.match(message.content, /Special original outcome/);
});

test("undo preserves applied damage and rejects damage dialogs opened before the undo", async () => {
  const { actor, message } = fixture();
  await CrowsChatActions.execute({ messageId: message.id, action: "expertise", key: "athletics" }, "player");
  const damage = { messageId: message.id, action: "damage", targetUuid: "Scene.old.Token.target",
    snapshot: damageSnapshot(actor), revision: 1, allocation: { damageTotal: 2 } };
  await CrowsChatActions.execute(damage, "player");
  await CrowsChatActions.execute({ messageId: message.id, action: "undo-expertise", revision: 1 }, "gm");
  assert.equal(actor.system.stamina.value, 8);
  assert.equal(message.state.actions["damage:Scene.old.Token.target"].status, "applied");
  assert.match(message.content, /Previously applied damage is unchanged/);
  await assert.rejects(CrowsChatActions.execute(damage, "player"), /roll changed/);
});

test("a failed refund is marked for review and cannot be retried", async () => {
  const { actor, message } = fixture();
  await CrowsChatActions.execute({ messageId: message.id, action: "expertise", key: "athletics" }, "player");
  let calls = 0;
  actor.update = async () => { calls++; throw new Error("refund failed"); };
  const undo = { messageId: message.id, action: "undo-expertise", revision: 1 };
  await assert.rejects(CrowsChatActions.execute(undo, "gm"), /refund failed/);
  await assert.rejects(CrowsChatActions.execute(undo, "gm"), /reviewed/);
  assert.equal(calls, 1);
  assert.equal(message.state.actions["undo-expertise"].status, "needs review");
  assert.equal(message.state.tier, 2);
  assert.doesNotMatch(message.content, /data-action="undo-expertise"/);
});

test("player chat rendering removes the GM undo control", () => {
  const { message } = fixture();
  const removed = [];
  const html = { find: selector => ({ remove: () => removed.push(selector), click() {} }) };
  CrowsChatActions.bind(message, html);
  assert.deepEqual(removed, ['[data-action="undo-expertise"]']);
  game.user = game.users.get("gm");
  removed.length = 0;
  CrowsChatActions.bind(message, html);
  assert.deepEqual(removed, []);
});

test("existing saved rolls receive the undo control when viewed by the GM", async () => {
  const { message } = fixture();
  await CrowsChatActions.execute({ messageId: message.id, action: "expertise", key: "athletics" }, "player");
  game.user = game.users.get("gm");
  const appended = [];
  const html = { find: () => ({ length: 0, append: content => appended.push(content), click() {} }) };
  CrowsChatActions.bind(message, html);
  assert.equal(appended.length, 1);
  assert.match(appended[0], /Undo Expertise \(Ref\/GM\)/);
});
