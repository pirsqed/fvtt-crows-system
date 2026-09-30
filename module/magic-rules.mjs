/** Playtest casting follow-ups and chaos policy, independent of sheet and chat layout. */
export function spellReminderFor(state) {
  return state.kind !== "spell" ? "" : state.isDoom
    ? "Roll 1d100 + spell rank for a backlash instead of the spell, then roll spellbook usage dice."
    : state.isCrit ? "Resolve the tier 3 effect. Do not roll spellbook usage dice on a critical casting."
    : state.tier === 1 ? "After expertise: if this is still tier 1, roll 1d6 for chaos. On 1, roll 1d100 + spell rank for a backlash instead of the spell. Roll spellbook usage dice after resolving the casting."
    : "Resolve the spell's effect, then roll spellbook usage dice. Effect duration dice are separate.";
}

export async function rollChaos() {
      const roll = new Roll("1d6");
      await roll.evaluate();
      const result = roll.total;

      let outcomeHtml = "";
      if (result === 1) {
        outcomeHtml = `<div class="outcome doom"><i class="fas fa-bolt"></i> MAGICAL BACKLASH! (Rolled 1)</div>
                       <p class="flavor-sub">Roll 1d100 + Spell Rank on the Backlash Table in The Rules Book!</p>`;
      } else {
        outcomeHtml = `<div class="outcome success"><i class="fas fa-check-circle"></i> SAFE (Rolled ${result})</div>
                       <p class="flavor-sub">The chaos recedes without triggering a backlash.</p>`;
      }

      const content = `
        <div class="crows-roll-card">
          <div class="card-header">
            <i class="fas fa-magic"></i> Chaos Roll (1d6)
          </div>
          <div class="card-body">
            <div class="dice-roll-total">Result: <strong>${result}</strong></div>
            ${outcomeHtml}
          </div>
        </div>
      `;

      await roll.toMessage({
        flavor: `Chaos Roll (1d6)`,
        content: content
      });
}
