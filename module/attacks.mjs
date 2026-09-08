import { createRollState, rollFlags, renderRollState } from "./chat-state.mjs";
import { rollPowerRoll } from "./power-roll.mjs";

/** Damage comes from the item text, never from a fallback label such as "Tier 2 Damage". */
export function prepareWeaponAttack(actor, item, { tier, isCrit = false, isDoom = false }, charKey = "strength") {
  const tierClass = isDoom ? "doom" : tier === 3 ? "crit" : tier === 2 ? "success" : "failure";
  const tierTitle = isCrit ? "CRITICAL HIT! (Tier 3)" : isDoom ? "DOOM! (Critical Failure)"
    : tier === 3 ? "Tier 3 (Strong Hit)" : tier === 2 ? "Tier 2 (Mixed Hit)" : "Tier 1 (Miss / Setback)";
  if (isDoom || tier === 1) return { tierTitle, tierClass,
    damageDesc: isDoom ? "Disaster strikes!" : "No Damage", numericDamage: 0 };
  const rawDamage = item.system.weapon?.[tier === 3 ? "tier3Damage" : "tier2Damage"] || "";
  return { tierTitle, tierClass,
    damageDesc: actor.evaluateWeaponDamage(rawDamage, charKey) || (isCrit ? "Full Damage" : `Tier ${tier} Damage`),
    numericDamage: actor.extractDamageNumber(rawDamage, charKey) };
}

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g,
  char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

/** Shared button markup for initial attacks and expertise upgrades. */
export function renderDamageButtons(amount, targets = []) {
  if (!(amount > 0)) return "";
  const selected = Array.from(targets ?? []);
  return (selected.length ? selected : [null]).map(target => `
    <button type="button" class="crows-apply-damage-btn btn-chat-damage" ${target
      ? `data-target-actor-id="${escapeHTML(target.actor?.id)}" data-target-token-id="${escapeHTML(target.id)}"` : ""}
      data-damage-amount="${escapeHTML(amount)}">
      <i class="fas fa-shield-virus"></i> Apply ${escapeHTML(amount)} Damage to ${target ? escapeHTML(target.name) : "Target"}
    </button>`).join("");
}

/** Shared weapon dialog and chat publication for Crow and monster equipment. */
export function showWeaponAttackDialog(actor, item) {
  if (!item?.system.isWeapon) return;
  const chars = actor.system.characteristics || { strength: 0, agility: 0, mind: 0 };
  const content = `
    <form class="crows-dialog-form">
      <div class="form-group">
        <label for="attack-char"><i class="fas fa-bullseye"></i> Characteristic</label>
        <select id="attack-char">
          <option value="strength">Strength (${chars.strength >= 0 ? '+' : ''}${chars.strength})</option>
          <option value="agility">Agility (${chars.agility >= 0 ? '+' : ''}${chars.agility})</option>
          <option value="mind">Mind (${chars.mind >= 0 ? '+' : ''}${chars.mind})</option>
        </select>
      </div>
      <div class="form-group circumstance-group">
        <label class="group-label"><i class="fas fa-balance-scale"></i> Circumstance</label>
        <div class="radio-list">
          <label class="radio-option opt-double-edge">
            <input type="radio" name="circumstance" value="double-edge" />
            <span class="opt-title">Double Edge</span>
            <span class="opt-desc">+1 Outcome Tier</span>
          </label>
          <label class="radio-option opt-edge">
            <input type="radio" name="circumstance" value="edge" />
            <span class="opt-title">Edge</span>
            <span class="opt-desc">+2 to roll</span>
          </label>
          <label class="radio-option opt-standard">
            <input type="radio" name="circumstance" value="standard" checked />
            <span class="opt-title">Standard Roll</span>
            <span class="opt-desc">Normal (2d10)</span>
          </label>
          <label class="radio-option opt-bane">
            <input type="radio" name="circumstance" value="bane" />
            <span class="opt-title">Bane</span>
            <span class="opt-desc">-2 to roll</span>
          </label>
          <label class="radio-option opt-double-bane">
            <input type="radio" name="circumstance" value="double-bane" />
            <span class="opt-title">Double Bane</span>
            <span class="opt-desc">-1 Outcome Tier</span>
          </label>
        </div>
      </div>
      <div class="form-group">
        <label for="attack-mod"><i class="fas fa-sliders-h"></i> Situational Modifier</label>
        <input type="number" id="attack-mod" value="0" />
      </div>
    </form>
  `;

  return new Dialog({
    title: actor.type === "monster" ? `${actor.name}: Attack with ${item.name}` : `Attack: ${item.name}`,
    content: content,
    buttons: {
      roll: {
        icon: '<i class="fas fa-swords"></i>',
        label: "Attack",
        callback: async (html) => {
          const charKey = html.find("#attack-char").val();
          const charBonus = chars[charKey] || 0;
          const circumstance = html.find('input[name="circumstance"]:checked').val() || "standard";
          const sitMod = parseInt(html.find("#attack-mod").val(), 10) || 0;

          const { roll, total, tier, isCrit, isDoom } =
            await rollPowerRoll({ modifier: charBonus + sitMod, circumstance });

          const state = createRollState(actor, {
            kind: "weapon", itemUuid: item.uuid, charKey, tier, isDoom,
            title: `${actor.name}: ${item.name} (${charKey})`, total, formula: roll.result,
            meta: `Range: ${item.system.weapon?.range || "Melee 1"}${item.system.traits ? ` | Traits: ${item.system.traits}` : ""}`,
            outcomes: Object.fromEntries([1, 2, 3].map(t => [t, prepareWeaponAttack(actor, item, { tier: t }, charKey)])),
            special: isCrit || isDoom ? prepareWeaponAttack(actor, item, { tier, isCrit, isDoom }, charKey) : null
          });

          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: actor.type === "monster" ? `${actor.name} attacked with ${item.name}` : `Attacking with ${item.name}`,
            flags: rollFlags(state),
            content: renderRollState(state)
          });
        }
      },
      cancel: {
        label: "Cancel"
      }
    },
    default: "roll"
  }, { classes: ["crows", "dialog", "crows-dialog"] }).render(true);
}

/** Stat-block attacks keep their fixed bonus and effect text, without a weapon dialog. */
export async function rollStatBlockAttack(actor, attack) {
  if (!attack) return;
  // Bonus string like "+2" or "-1"
  const bonusStr = attack.system.bonus || "+0";

  const { roll, tier, isCrit, isDoom } = await rollPowerRoll({ formula: `2d10 ${bonusStr}` });
  const outcomes = Object.fromEntries([1, 2, 3].map(t => {
    const text = t === 3 ? attack.system.tier3Damage : t === 2 ? attack.system.tier2Damage : "Miss";
    return [t, { tierTitle: `Tier ${t}`, tierClass: t === 3 ? "crit" : t === 2 ? "success" : "failure",
      damageDesc: text, numericDamage: t >= 2 ? actor.extractDamageNumber(text) : 0 }];
  }));
  const state = createRollState(actor, { kind: "attack", itemUuid: attack.uuid, expertiseAllowed: false,
    title: `${actor.name} uses ${attack.name}`, tier, isDoom, total: roll.total, formula: roll.result, outcomes,
    special: isCrit || isDoom ? { ...outcomes[tier], tierTitle: isCrit ? "Critical Hit!" : "Doom!" } : null });

  return roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${actor.name} uses ${attack.name}`,
    flags: rollFlags(state),
    content: renderRollState(state)
  });
}
