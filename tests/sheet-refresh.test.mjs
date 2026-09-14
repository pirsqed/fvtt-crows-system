import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CrowsLoot } from "../module/loot.mjs";
import { withPersistentScroll } from "../module/sheets/persistent-scroll.mjs";

let hooks;
beforeEach(() => {
  hooks = new Map();
  globalThis.Hooks = { on: (name, fn) => {
    const handlers = hooks.get(name) ?? []; handlers.push(fn); hooks.set(name, handlers);
  } };
  globalThis.game = { user: { id: "player", isGM: false }, actors: [],
    users: { activeGM: { id: "ref" } }, system: { socket: true }, socket: { on() {} } };
  globalThis.ui = { windows: {}, notifications: { warn() {} } };
  CrowsLoot.activateSocket();
});

function remoteUpdate(name, ...args) {
  for (const handler of hooks.get(name) ?? []) handler(...args);
}

class FoundryRenderStub {
  constructor(document, carried = false) {
    this.document = document;
    if (carried) this.item = { type: "equipment" };
    else this.actor = document;
    this.rendered = true;
    this.draws = [];
  }
  render(force, options) { this.pending = this._render(force, options); return this; }
  async _render(force, options) {
    if (this.closed || this.busy) return;
    this.busy = true;
    this.rendered = false;
    const visible = this.document.system.testValue;
    if (this.pause) { const pause = this.pause; this.pause = null; await pause; }
    this.draws.push({ visible, force, focus: options.focus });
    this.busy = false;
    this.rendered = !this.closed;
  }
}
const Sheet = withPersistentScroll(FoundryRenderStub);

for (const carried of [false, true]) {
  test(`remote document changes refresh an already-open ${carried ? "carried item" : "scene item"}`, async () => {
    const document = { type: "loot", system: { testValue: false } };
    const sheet = new Sheet(document, carried);
    ui.windows.item = sheet;
    document.system.testValue = true;
    remoteUpdate("updateActor", document);
    await sheet.pending;
    assert.equal(sheet.draws.at(-1).visible, true);
    document.system.testValue = false;
    remoteUpdate("updateActor", document);
    await sheet.pending;
    assert.equal(sheet.draws.at(-1).visible, false);
    assert.ok(sheet.draws.every(draw => draw.force === false && draw.focus === false));
  });
}

for (const visible of [true, false]) {
  test(`a ${visible ? "reveal" : "conceal"} arriving during rendering is not dropped`, async () => {
    const document = { type: "loot", system: { testValue: !visible } };
    const sheet = new Sheet(document);
    ui.windows.item = sheet;
    let finish;
    sheet.pause = new Promise(resolve => { finish = resolve; });
    sheet.render(false, { focus: false });
    assert.equal(sheet.rendered, false);
    document.system.testValue = visible;
    // Foundry may dispatch several related document hooks for one operation.
    for (let i = 0; i < 3; i++) remoteUpdate("updateActor", document);
    finish();
    await sheet.pending;
    assert.deepEqual(sheet.draws.map(draw => draw.visible), [!visible, visible]);
  });
}

test("token delta changes refresh player windows and movement refresh player windows", async () => {
  const document = { type: "loot", system: { testValue: true } };
  const sheet = new Sheet(document);
  ui.windows.item = sheet;
  remoteUpdate("updateToken", { actor: document }, { delta: { system: { testValue: true } } });
  await sheet.pending;
  assert.equal(sheet.draws.length, 1);
  remoteUpdate("updateToken", { actor: document }, { x: 100 });
  await sheet.pending;
  assert.equal(sheet.draws.length, 2);
});

test("newly available document also refreshes an already-open carried item", async () => {
  const document = { type: "loot", system: { testValue: true } };
  const sheet = new Sheet(document, true);
  ui.windows.item = sheet;
  remoteUpdate("createActor", document);
  await sheet.pending;
  assert.equal(sheet.draws.at(-1).visible, true);
});

test("a queued refresh does not reopen a window closed during rendering", async () => {
  const document = { type: "loot", system: { testValue: false } };
  const sheet = new Sheet(document);
  ui.windows.item = sheet;
  let finish;
  sheet.pause = new Promise(resolve => { finish = resolve; });
  sheet.render(false, {});
  remoteUpdate("updateActor", document);
  sheet.closed = true;
  delete ui.windows.item;
  finish();
  await sheet.pending;
  assert.equal(sheet.draws.length, 1);
  assert.equal(sheet.rendered, false);
});
