import { rollPowerRoll } from "./power-roll.mjs";
import { createRollState, rollFlags, renderRollState, escapeHTML } from "./chat-state.mjs";

export async function castSpell(actor, item, { circumstance = "standard", modifier = 0 } = {}) {
  if (!actor?.isOwner) throw new Error("You must own the caster.");
  if (!item?.system.isSpellbook || item.parent?.uuid !== actor.uuid) throw new Error("Choose this caster's spellbook.");
  if (Number(item.system.consumable?.maxUD) > 0 && Number(item.system.consumable.currentUD) <= 0)
    throw new Error("This spellbook is depleted. Restore its usage dice after resting, or resolve a trait exception manually.");
  const { roll, tier, isCrit, isDoom } = await rollPowerRoll({
    modifier: Number(actor.system.characteristics?.mind ?? 0) + Number(modifier), circumstance
  });
  const effects = item.system.consumable ?? {};
  const outcomes = Object.fromEntries([1, 2, 3].map(t => [t, {
    tierTitle: `Tier ${t}`, tierClass: t === 1 ? "failure" : t === 2 ? "success" : "crit",
    damageDesc: effects[`tier${t}Effect`] || "Consult the spellbook for this tier's effect.", numericDamage: 0
  }]));
  const state = createRollState(actor, { kind: "spell", itemUuid: item.uuid, charKey: "mind", tier, isCrit, isDoom,
    title: `${actor.name}: Cast ${item.name}`, total: roll.total, formula: roll.result,
    meta: item.system.traits, outcomes,
    special: isDoom ? { tierTitle: "DOOM! Magical backlash", tierClass: "doom",
      damageDesc: "The backlash replaces the intended spell.", numericDamage: 0 }
      : isCrit ? { ...outcomes[3], tierTitle: "CRITICAL CAST! (Tier 3)" } : null
  });
  return roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Casting ${item.name}`,
    flags: rollFlags(state), content: renderRollState(state) });
}

export function showSpellcastDialog(actor, item) {
  if (!actor?.isOwner || !item?.system.isSpellbook) return;
  let busy = false;
  return new Dialog({ title: `Cast: ${item.name}`,
    content: `<form class="crows-dialog-form"><p>Mind test. Have the spellbook in hand, or use an applicable trait.</p>
      <div class="form-group"><label>Circumstance</label><select name="circumstance">
      ${[["standard", "Standard"], ["edge", "Edge (+2)"], ["double-edge", "Double edge (+1 tier)"],
        ["bane", "Bane (-2)"], ["double-bane", "Double bane (-1 tier)"]].map(([value, label]) =>
        `<option value="${value}">${escapeHTML(label)}</option>`).join("")}</select></div>
      <div class="form-group"><label>Situational modifier</label><input name="modifier" type="number" value="0" /></div>
      <p>Apply expertise before resolving effects, chaos, and usage dice. These remain manual.</p></form>`,
    buttons: { cast: { label: "Cast", callback: async html => {
      if (busy) return;
      busy = true;
      try { await castSpell(actor, item, { circumstance: html.find('[name="circumstance"]').val(),
        modifier: Number(html.find('[name="modifier"]').val()) || 0 }); }
      catch (error) { ui.notifications.warn(error.message); }
    } }, cancel: { label: "Cancel" } }, default: "cast"
  }, { classes: ["crows", "dialog", "crows-dialog"] }).render(true);
}
