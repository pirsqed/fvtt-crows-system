import { test } from "node:test";
import assert from "node:assert/strict";
import { npcMovement, formatNpcSpeed, validateNpcMovement } from "../module/npc-speeds.mjs";

test("legacy movement is parsed without mutating source and preserves unrecognized details", () => {
  const system = { speed: "6, climb 6 (U), swim 4; special movement in mist" };
  const original = structuredClone(system);
  assert.deepEqual(npcMovement(system), {
    base: 6, modes: [{ name: "climb", value: 6 }, { name: "swim", value: 4 }],
    notes: "climb: (U); special movement in mist"
  });
  assert.deepEqual(system, original);
  assert.deepEqual(npcMovement({ speed: "0, fly 8" }), { base: 0, modes: [{ name: "fly", value: 8 }], notes: "" });
});

test("all structured speeds are reduced by wounds without changing base values or notes", () => {
  const system = { movement: { base: 5, modes: [{ name: "Fly", value: 8 }, { name: "Burrow", value: 1 }], notes: "2 rounds only" } };
  assert.equal(formatNpcSpeed(system, 2), "3 · Fly 6 · Burrow 0 (2 rounds only)");
  assert.equal(formatNpcSpeed(system), "5 · Fly 8 · Burrow 1 (2 rounds only)");
  const draft = npcMovement(system);
  draft.modes[0].value = 12;
  assert.equal(system.movement.modes[0].value, 8);
});

test("legacy speeds preserve annotations and avoid subtracting wounds from unrelated numbers", () => {
  assert.equal(formatNpcSpeed({ speed: "6, climb 6 (U), fly 8 for 2 rounds" }, 2), "4, climb 4 (U), fly 6 for 2 rounds");
  assert.equal(formatNpcSpeed({ speed: "0, swim 1" }, 2), "0, swim 0");
});

test("the editor rejects invalid values and accepts custom movement names", () => {
  for (const value of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => validateNpcMovement({ base: value, modes: [] }));
    assert.throws(() => validateNpcMovement({ base: 5, modes: [{ name: "Fly", value }] }));
  }
  assert.throws(() => validateNpcMovement({ base: 5, modes: [{ name: " ", value: 2 }] }));
  assert.doesNotThrow(() => validateNpcMovement({ base: 0, modes: [{ name: "Phase", value: 3 }] }));
});
