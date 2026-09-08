export const CHAT_SCOPE = "fvtt-crows-system";
export const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g,
  char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function createRollState(actor, data) {
  return { version: 1, actorUuid: actor.uuid, actorName: actor.name,
    expertiseAllowed: actor.type === "crow", revision: 0, actions: {},
    targets: Array.from(game.user.targets ?? []).filter(t => t.actor).map(t => ({
      uuid: t.document?.uuid ?? t.uuid, name: t.name
    })), ...data };
}

export function rollFlags(state) { return { [CHAT_SCOPE]: { rollState: state } }; }
export function getRollState(message) { return message.getFlag(CHAT_SCOPE, "rollState"); }

/** Render from persisted data; HTML is never read back to determine a roll's result. */
export function renderRollState(state) {
  const outcome = state.special && !state.expertise ? state.special : state.outcomes[state.tier];
  const busy = Object.values(state.actions).some(action => action.status !== "cancelled");
  let actions = "";
  if (state.expertiseAllowed && !state.isDoom && state.tier < 3 && !state.expertise && !busy) {
    actions += '<button type="button" class="crows-state-action" data-action="expertise">Apply Expertise (+1 Tier)</button>';
  }
  if (outcome.numericDamage > 0) {
    for (const [index, target] of (state.targets.length ? state.targets : [null]).entries()) {
      const applied = target && state.actions[`damage:${target.uuid}`];
      actions += `<button type="button" class="crows-state-action" data-action="damage" data-target-index="${target ? index : -1}" ${applied ? "disabled" : ""}>
        ${applied ? escapeHTML(applied.status) : `Apply ${outcome.numericDamage} Damage to ${escapeHTML(target?.name ?? "Target")}`}</button>`;
    }
  }
  if (state.kind === "miasma" && !state.actions.miasma) {
    if (state.tier === 1) actions += '<button type="button" class="crows-state-action" data-action="gain">Gain +1 Cruelty & Roll Miasma Effect</button>';
    if (state.tier === 3) actions += '<button type="button" class="crows-state-action" data-action="clear">Purge All Cruelty</button>';
  }
  return `<div class="crows-roll-card"><div class="card-header">${escapeHTML(state.title)}</div>
    <div class="card-body"><div class="dice-roll-total">Roll: <strong>${state.total}</strong> <span class="formula">(${escapeHTML(state.formula)})</span></div>
    <div class="outcome ${escapeHTML(outcome.tierClass ?? "success")}">${escapeHTML(outcome.tierTitle)}</div>
    ${outcome.damageDesc ? `<div class="damage-block">${escapeHTML(outcome.damageDesc)}</div>` : ""}
    ${state.meta ? `<div class="weapon-meta">${escapeHTML(state.meta)}</div>` : ""}
    ${state.expertise ? `<div class="expertise-applied-tag">${escapeHTML(state.expertise.label)} applied (+1 Tier)</div>` : ""}
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
