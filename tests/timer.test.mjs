import { test } from "node:test";
import assert from "node:assert/strict";
import { timerRemaining, updateTimer, timerDisplay } from "../module/timer-state.mjs";

const initial = () => ({ turn: 1, remainingSeconds: 1800, durationMinutes: 30, en: 9, isRunning: false, lastTick: 0 });

test("deadline survives skipped ticks, reloads, and elapsed offline time", () => {
  const running = updateTimer(initial(), { isRunning: true }, 1000);
  assert.equal(timerRemaining(running, 121000), 1680);
  assert.equal(timerRemaining(structuredClone(running), 1801000), 0);
  assert.equal(running.remainingSeconds, 1800);
});

test("pause, resume and unrelated settings preserve elapsed fractional seconds", () => {
  const running = updateTimer(initial(), { isRunning: true }, 1000);
  const edited = updateTimer(running, { en: 7 }, 2250);
  assert.equal(edited.endsAt, running.endsAt);
  const paused = updateTimer(edited, { isRunning: false }, 2500);
  assert.equal(timerRemaining(paused, 99999), 1798.5);
  const resumed = updateTimer(paused, { isRunning: true }, 100000);
  assert.equal(timerRemaining(resumed, 100500), 1798);
  assert.equal(timerDisplay(paused, 99999).formattedTime, "29:59");
});

test("old saved timers migrate using lastTick; reset and duration presets start fresh", () => {
  const old = { ...initial(), isRunning: true, lastTick: 1000 };
  assert.equal(timerRemaining(old, 11000), 1790);
  const preset = updateTimer(old, { durationMinutes: 20, remainingSeconds: 1200 }, 11000);
  assert.equal(preset.endsAt, 1211000);
  const reset = updateTimer(preset, { remainingSeconds: 1200, isRunning: false }, 21000);
  assert.equal(reset.endsAt, null);
  assert.equal(timerRemaining(reset, 999999), 1200);
});

test("sand and urgency reach the correct endpoints without a render", () => {
  const full = timerDisplay(initial(), 0);
  assert.equal(full.topSandY, "25.0");
  assert.equal(full.bottomSandY, "135.0");
  assert.equal(full.hasBottomSand, false);
  const empty = timerDisplay({ ...initial(), isRunning: true, endsAt: 1000 }, 2000);
  assert.equal(empty.formattedTime, "00:00");
  assert.equal(empty.topSandY, "76.0");
  assert.equal(empty.bottomSandY, "84.0");
  assert.equal(empty.isRunning, false);
  assert.equal(empty.isUrgent, true);
  assert.equal(empty.hasBottomSand, true);
});

globalThis.Application = class { static defaultOptions = {}; activateListeners() {} render() {} close() {} };
const { CrowsDungeonTimer } = await import("../module/apps/dungeon-timer.mjs");

function setup(state = initial()) {
  let saved = structuredClone(state), writes = 0;
  globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, time: { serverTime: 1000 },
    settings: { get: () => saved, set: async (_scope, _key, value) => { saved = structuredClone(value); writes++; } } };
  globalThis.ui = { notifications: { warn() {} } };
  const timer = new CrowsDungeonTimer();
  timer._updateDOM = () => {};
  let gongs = 0;
  timer._playGongSound = () => gongs++;
  return { timer, state: () => saved, writes: () => writes, gongs: () => gongs };
}

test("players tick locally; only active GM persists expiry and does so once", async () => {
  const f = setup({ ...initial(), remainingSeconds: 1, isRunning: true, endsAt: 1500 });
  game.user = { id: "player", isGM: false };
  game.time.serverTime = 2000;
  await f.timer._tick(); await f.timer._tick();
  assert.equal(f.writes(), 0); assert.equal(f.gongs(), 1);
  game.user = { id: "other-gm", isGM: true };
  await f.timer._tick(); assert.equal(f.writes(), 0);
  game.user.id = "gm";
  await Promise.all([f.timer._tick(), f.timer._tick()]);
  await f.timer._tick();
  assert.equal(f.writes(), 1); assert.equal(f.state().isRunning, false); assert.equal(f.gongs(), 1);
});

test("player listener setup starts the loop before the GM-only controls", () => {
  const f = setup(); game.user.isGM = false;
  let started = 0;
  f.timer._activateDraggable = () => {};
  f.timer._startLocalTimerLoop = () => started++;
  f.timer.activateListeners({ find: () => ({ click() {} }) });
  assert.equal(started, 1);
});

test("competing End Turn clicks roll once and advance once", async () => {
  const f = setup(); let rolls = 0, messages = 0;
  globalThis.Roll = class { async evaluate() { rolls++; this.total = 5; } async toMessage() { messages++; } };
  await Promise.all([f.timer.endTurn(), f.timer.endTurn()]);
  assert.equal(rolls, 1); assert.equal(messages, 1);
  assert.equal(f.state().turn, 2); assert.equal(f.state().remainingSeconds, 1800);
  assert.equal(f.state().isRunning, false);
});

test("failed turn publication retains a claim rather than repeating the encounter roll", async () => {
  const f = setup(); let rolls = 0;
  globalThis.Roll = class { async evaluate() { rolls++; this.total = 5; } async toMessage() { throw new Error("offline"); } };
  await assert.rejects(f.timer.endTurn(), /offline/);
  await f.timer.endTurn();
  assert.equal(rolls, 1); assert.equal(f.state().resolvingTurn, true);
});
