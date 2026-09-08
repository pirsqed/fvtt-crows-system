import { test } from "node:test";
import assert from "node:assert/strict";
import { powerRollFormula, resolvePowerRoll, rollPowerRoll, shiftTier } from "../module/power-roll.mjs";

test("tier boundaries use modified totals", () => {
  for (const [total, tier] of [[-5, 1], [11, 1], [12, 2], [16, 2], [17, 3], [40, 3]]) {
    assert.equal(resolvePowerRoll({ natural: 10, total }).tier, tier);
  }
});

test("single circumstances change the bonus; double circumstances change only the tier", () => {
  assert.equal(powerRollFormula(3, "edge"), "2d10 + 5");
  assert.equal(powerRollFormula(-3, "bane"), "2d10 - 5");
  assert.equal(powerRollFormula(3, "double-edge"), "2d10 + 3");
  assert.equal(powerRollFormula(-3, "double-bane"), "2d10 - 3");
  assert.equal(powerRollFormula(0, "normal"), "2d10 + 0");
  assert.throws(() => powerRollFormula(NaN), /finite number/);
});

test("all die pairs preserve existing outcomes across modifiers and circumstances", () => {
  for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) {
    for (let modifier = -10; modifier <= 10; modifier++) {
      for (const circumstance of ["standard", "normal", "edge", "bane", "double-edge", "double-bane"]) {
        const natural = a + b;
        const total = natural + modifier + (circumstance === "edge" ? 2 : circumstance === "bane" ? -2 : 0);
        let expected = total < 12 ? 1 : total < 17 ? 2 : 3;
        if (circumstance === "double-edge" && expected < 3) expected++;
        if (circumstance === "double-bane" && expected > 1) expected--;
        if (natural >= 19) expected = 3;
        if (natural <= 3) expected = 1;
        const result = resolvePowerRoll({ natural, total, circumstance });
        assert.equal(result.tier, expected);
        assert.equal(result.canApplyExpertise, expected < 3 && natural > 3);
      }
    }
  }
});

test("crit and doom override adverse totals and tier shifts", () => {
  assert.equal(resolvePowerRoll({ natural: 19, total: -20, circumstance: "double-bane" }).tier, 3);
  assert.equal(resolvePowerRoll({ natural: 3, total: 40, circumstance: "double-edge" }).tier, 1);
  assert.equal(resolvePowerRoll({ natural: 10, total: 19 }).isCrit, false);
  assert.equal(resolvePowerRoll({ natural: 10, total: 3 }).isDoom, false);
  assert.equal(shiftTier(3, 1), 3);
  assert.equal(shiftTier(1, -1), 1);
});

test("Foundry adapter evaluates once and returns the original roll for chat", async () => {
  let evaluations = 0;
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; }
    async evaluate() {
      evaluations++;
      this.dice = [{ results: [{ result: 9 }, { result: 10 }] }];
      this.total = 14;
    }
  };
  try {
    const result = await rollPowerRoll({ modifier: -5, circumstance: "double-bane" });
    assert.equal(evaluations, 1);
    assert.equal(result.roll.formula, "2d10 - 5");
    assert.equal(result.natural, 19);
    assert.equal(result.total, 14);
    assert.equal(result.isCrit, true);
    assert.equal(result.tier, 3);
    assert.equal(result.roll instanceof Roll, true);
    const attack = await rollPowerRoll({ formula: "2d10 + 2 + 1" });
    assert.equal(attack.roll.formula, "2d10 + 2 + 1");
  } finally { delete globalThis.Roll; }
});
