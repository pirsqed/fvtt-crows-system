export async function rollEncounterCheck(en = 9, { travel = false, rest = false } = {}) {
  if (!Number.isInteger(en) || en < 0) throw new Error("EN must be a whole number of 0 or more.");
  const heading = rest ? "Rest Encounter Check" : travel ? "Travel Encounter Check" : "Dungeon Encounter Check";
  const roll = new Roll("1d10");
  await roll.evaluate();
  const result = roll.total;

  let outcomeHtml = "";
  if (result === 10 && result >= en) {
    outcomeHtml = `<div class="outcome doom"><i class="fas fa-skull-crossbones"></i> IMMEDIATE ENCOUNTER! (Rolled 10)</div>
                   <p class="flavor-sub">An encounter occurs immediately. The Ref determines its nature.</p>`;
  } else if (result >= en) {
    outcomeHtml = `<div class="outcome mixed"><i class="fas fa-exclamation-triangle"></i> ENCOUNTER WARNING (Rolled ${result} &ge; EN ${en})</div>
                   <p class="flavor-sub">The party detects signs/sounds of a coming encounter. ${rest ? "The Ref decides when the encounter occurs during the rest." : travel ? "The Ref decides when the encounter occurs during the travel day." : "The encounter occurs during the next Dungeon Turn."}</p>`;
  } else {
    outcomeHtml = `<div class="outcome success"><i class="fas fa-shield-alt"></i> ALL QUIET (Rolled ${result} &lt; EN ${en})</div>
                   <p class="flavor-sub">${rest ? "No rest encounter on this check." : travel ? "No travel encounter on this check." : "No encounter this turn."}</p>`;
  }

  const content = `
    <div class="crows-roll-card">
      <div class="card-header danger">
        <i class="fas fa-dungeon"></i> ${heading} (EN ${en})
      </div>
      <div class="card-body">
        <div class="dice-roll-total">D10 Check: <strong>${result}</strong> vs EN ${en}</div>
        ${outcomeHtml}
      </div>
    </div>
  `;

  await roll.toMessage({
    flavor: `${heading} (EN ${en})`,
    content: content
  });
  return { result, en };
}
