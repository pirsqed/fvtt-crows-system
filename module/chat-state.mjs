export const CHAT_SCOPE = "fvtt-crows-system";
export const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g,
  char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

/** Preserve only the formatting emitted by weapon damage evaluation. */
export function formatDamage(value) {
  return String(value ?? "").split(/(<\/?strong>|<span class="formula"(?: style="font-size: 0\.85em; opacity: 0\.85;")?>|<\/span>)/g)
    .map((part, index) => index % 2
      ? (part.startsWith("<span") ? '<span class="formula">' : part)
      : escapeHTML(part)).join("");
}

export function createRollState(actor, data) {
  return { version: 1, actorUuid: actor.uuid, actorName: actor.name,
    expertiseAllowed: actor.type === "crow", revision: 0, actions: {},
    targets: Array.from(game.user.targets ?? []).filter(t => t.actor).map(t => ({
      uuid: t.document?.uuid ?? t.uuid, name: t.name
    })), ...data };
}

export function rollFlags(state) { return { [CHAT_SCOPE]: { rollState: state } }; }
export function getRollState(message) { return message.getFlag(CHAT_SCOPE, "rollState"); }

export function renderUndoExpertise(state) {
  if (!state?.expertise || state.actions?.expertise?.status !== "applied"
    || Object.values(state.actions).some(action => ["pending", "needs review"].includes(action.status))) return "";
  return '<button type="button" class="crows-state-action crows-action-expertise" data-action="undo-expertise" title="Restore the original tier and refund one expertise use">Undo Expertise (Ref/GM)</button>';
}

/** Render from persisted data; HTML is never read back to determine a roll's result. */
export function renderRollState(state) {
  const outcome = state.special && !state.expertise ? state.special : state.outcomes[state.tier];
  const busy = Object.values(state.actions).some(action => action.status !== "cancelled");
  let actions = "";
  if (state.kind !== "miasma" && state.expertiseAllowed && !state.isDoom && state.tier < 3 && !state.expertise && !busy) {
    actions += '<button type="button" class="crows-state-action crows-action-expertise" data-action="expertise">Apply Expertise (+1 Tier)</button>';
  }
  if (outcome.numericDamage > 0) {
    for (const [index, target] of (state.targets.length ? state.targets : [null]).entries()) {
      const applied = target && state.actions[`damage:${target.uuid}`];
      actions += `<button type="button" class="crows-state-action crows-action-damage" data-action="damage" data-target-index="${target ? index : -1}" ${applied ? "disabled" : ""}>
        ${applied ? escapeHTML(`${applied.status}${applied.damageTotal != null ? ` (${applied.damageTotal} damage)` : ""}`) : `Apply ${outcome.numericDamage} Damage to ${escapeHTML(target?.name ?? "Target")}`}</button>`;
    }
  }
  actions += renderUndoExpertise(state);
  if (state.kind === "miasma" && !state.actions.miasma) {
    if (state.tier === 1) actions += '<button type="button" class="crows-state-action crows-action-miasma crows-action-gain" data-action="gain">Gain +1 Cruelty & Roll Miasma Effect</button>';
    if (state.tier === 3) actions += '<button type="button" class="crows-state-action crows-action-miasma crows-action-purge" data-action="clear">Purge All Cruelty</button>';
  }
  const spellReminder = state.kind !== "spell" ? "" : state.isDoom
    ? "Roll 1d100 + spell rank for a backlash instead of the spell, then roll spellbook usage dice."
    : state.isCrit ? "Resolve the tier 3 effect. Do not roll spellbook usage dice on a critical casting."
    : state.tier === 1 ? "After expertise: if this is still tier 1, roll 1d6 for chaos. On 1, roll 1d100 + spell rank for a backlash instead of the spell. Roll spellbook usage dice after resolving the casting."
    : "Resolve the spell's effect, then roll spellbook usage dice. Effect duration dice are separate.";
  return `<div class="crows-roll-card"><div class="card-header">${escapeHTML(state.title)}</div>
    <div class="card-body"><div class="dice-roll-total">Roll: <strong>${state.total}</strong> <span class="formula">(${escapeHTML(state.formula)})</span></div>
    <div class="outcome ${escapeHTML(outcome.tierClass ?? "success")}">${escapeHTML(outcome.tierTitle)}</div>
    ${outcome.damageDesc ? `<div class="damage-block">${formatDamage(outcome.damageDesc)}</div>` : ""}
    ${spellReminder ? `<p class="spell-reminder">${escapeHTML(spellReminder)}</p>` : ""}
    ${state.meta ? `<div class="weapon-meta">${escapeHTML(state.meta)}</div>` : ""}
    ${state.expertise ? `<div class="expertise-applied-tag">${escapeHTML(state.expertise.label)} applied (+1 Tier)</div>` : ""}
    ${state.expertiseUndone && Object.entries(state.actions).some(([key, action]) => key.startsWith("damage:") && action.status === "applied")
      ? '<p>Expertise was undone. Previously applied damage is unchanged; the Ref/GM must check and correct it manually.</p>' : ""}
    ${Object.values(state.actions).some(action => action.status === "needs review" || action.status === "pending")
      ? '<p>A document update is pending or needs GM review. Do not repeat it manually without checking the actor.</p>' : ""}
    <div class="crows-chat-actions flexcol">${actions}</div></div></div>`;
}

/** A token UUID must never fall back to its base world actor if the token was deleted. */
export async function resolveActor(uuid) {
  const document = await fromUuid(uuid);
  return document?.documentName === "Token" ? document.actor : document;
}

export function damageSnapshot(actor) {
  return JSON.stringify({ system: actor.toObject().system,
    items: actor.items.contents.map(item => item.toObject()).sort((a, b) => a._id.localeCompare(b._id)) });
}
