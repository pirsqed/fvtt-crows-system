/** Resolve NPC entries by stable ID; Crow pools retain their configured keys. */
export function expertisePools(actor) {
  return actor?.type === "monster"
    ? (actor.system.customExpertises ?? []).map(entry => [entry.id, entry])
    : Object.entries(actor?.system.expertises ?? {});
}

export function expertisePool(actor, key) {
  return expertisePools(actor).find(([id]) => id === key)?.[1];
}

export function expertiseLabel(actor, key, labels = {}) {
  return actor?.type === "monster" ? expertisePool(actor, key)?.name ?? key : labels[key] ?? key;
}

export async function setExpertiseUses(actor, key, value) {
  if (actor.type !== "monster") return actor.update({ [`system.expertises.${key}.value`]: value });
  if (!expertisePool(actor, key)) throw new Error("This expertise is no longer available.");
  const entries = actor.system.customExpertises.map(entry => ({ ...entry, ...(entry.id === key ? { value } : {}) }));
  return actor.update({ "system.customExpertises": entries });
}

export async function spendChatExpertise(actor, key) {
  if (actor.type !== "monster") return actor.spendExpertise(key);
  const entry = expertisePool(actor, key);
  if (!entry || !(entry.value > 0)) return { success: false };
  const remaining = entry.value - 1;
  await setExpertiseUses(actor, key, remaining);
  return { success: true, remaining, max: entry.max };
}
