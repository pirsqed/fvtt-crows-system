/** Shared power-roll rules. Action-specific effects and chat text belong to callers. */
export function shiftTier(tier, amount) {
  return Math.max(1, Math.min(3, tier + amount));
}

export function resolvePowerRoll({ natural, total, circumstance = "standard" }) {
  const baseTier = total >= 17 ? 3 : total >= 12 ? 2 : 1;
  const isCrit = natural === 19 || natural === 20;
  const isDoom = natural === 2 || natural === 3;
  const shift = circumstance === "double-edge" ? 1 : circumstance === "double-bane" ? -1 : 0;
  const tier = isCrit ? 3 : isDoom ? 1 : shiftTier(baseTier, shift);
  return { natural, total, baseTier, tier, isCrit, isDoom, canApplyExpertise: tier < 3 && !isDoom };
}

export function powerRollFormula(modifier = 0, circumstance = "standard") {
  const bonus = Number(modifier) + (circumstance === "edge" ? 2 : circumstance === "bane" ? -2 : 0);
  if (!Number.isFinite(bonus)) throw new Error("Power roll modifier must be a finite number.");
  return `2d10 ${bonus >= 0 ? "+" : "-"} ${Math.abs(bonus)}`;
}

/** Evaluate once, retaining the Foundry Roll for dice display and chat publication. */
export async function rollPowerRoll({ modifier = 0, circumstance = "standard", formula } = {}) {
  // Stat-block attack bonuses historically allow Foundry formula expressions.
  const roll = new Roll(formula ?? powerRollFormula(modifier, circumstance));
  await roll.evaluate();
  const natural = roll.dice[0].results.filter(result => result.active !== false)
    .slice(0, 2).reduce((sum, result) => sum + result.result, 0);
  return { roll, ...resolvePowerRoll({ natural, total: roll.total, circumstance }) };
}
