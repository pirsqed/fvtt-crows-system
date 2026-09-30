/** Called by the coordinator after resolving the current item and checking ownership. */
export async function rollUsageDice(actor, item) {
    const currentUD = item.system.consumable?.currentUD ?? item.system.consumable?.maxUD ?? 0;
    if (currentUD <= 0) {
      ui.notifications.warn(`${item.name} has no usage dice remaining!`);
      return;
    }

    const roll = new Roll(`${currentUD}d6`);
    await roll.evaluate();

    let depletedCount = 0;
    const diceResults = roll.dice[0].results.map(r => {
      const isDepleted = r.result === 1 || r.result === 2;
      if (isDepleted) depletedCount++;
      return `<span class="ud-die ${isDepleted ? 'depleted' : 'safe'}">${r.result}</span>`;
    }).join(" ");

    const remainingUD = Math.max(0, currentUD - depletedCount);
    await item.update({ "system.consumable.currentUD": remainingUD });

    let statusText = "";
    if (remainingUD === 0) {
      statusText = `<div class="outcome failure"><i class="fas fa-exclamation-triangle"></i> Fully Depleted! (${item.system.consumable?.udTrigger || "Useless"})</div>`;
    } else if (depletedCount > 0) {
      statusText = `<div class="outcome warning">Lost ${depletedCount} Usage Die (${remainingUD} remaining)</div>`;
    } else {
      statusText = `<div class="outcome success">All dice held! (${remainingUD} remaining)</div>`;
    }

    const content = `
      <div class="crows-roll-card">
        <div class="card-header">
          <i class="fas fa-hourglass-half"></i> Usage Dice Check: ${item.name}
        </div>
        <div class="card-body">
          <div class="ud-dice-pool">${diceResults}</div>
          ${statusText}
        </div>
      </div>
    `;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: actor }),
      flavor: `Usage Dice for ${item.name}`,
      content: content
    });
}
