import { activeDefense, woundCapacity } from "./equipment-rules.mjs";

/** One interpretation supplies both the displayed damage and its numeric application. */
export function weaponDamage(raw, characteristics = {}, selected = "strength") {
  if (!raw) return { amount: 0, display: raw || "No Damage" };
  if (typeof raw === "number") return { amount: raw, display: raw };
  const text = String(raw);
  const match = text.match(/(\d+)\s*\+\s*(a\s+or\s+s|s\s+or\s+a|strength|agility|mind|str|agi|mnd|[sam])\b/i);
  if (match) {
    const ref = match[2].toLowerCase().replace(/\s+/g, " ");
    const keys = { s: "strength", str: "strength", a: "agility", agi: "agility", m: "mind", mnd: "mind" };
    const bonus = ref.includes(" or ")
      ? ["agility", "strength"].includes(selected) ? characteristics[selected] ?? 0
        : Math.max(characteristics.agility ?? 0, characteristics.strength ?? 0)
      : characteristics[keys[ref] ?? ref] ?? 0;
    const amount = Math.max(0, Number(match[1]) + bonus);
    const rest = text.replace(match[0], "").replace(/\b(dam|damage)\b/i, "").trim();
    return { amount, display: `<strong>${amount} Damage</strong>${rest ? ` ${rest}` : ""} <span class="formula" style="font-size: 0.85em; opacity: 0.85;">(${match[0].trim()})</span>` };
  }
  const flat = text.match(/^(\d+)(\s*damage|\s*dam)?(.*)$/i);
  if (flat) return { amount: Number(flat[1]), display: `<strong>${flat[1]} Damage</strong>${flat[3].trim() ? ` ${flat[3].trim()}` : ""}` };
  // Preserve reference text; numbers embedded in prose are not damage formulas.
  return { amount: 0, display: text };
}

/** Pure allocation shared by previews and automatic damage. Sources are in Ref-selected order. */
export function calculateDamage({ damageTotal, tempAD = 0, useTempAD = true, sources = [], stamina = 0, staminaMax = 0, hasWounds = true }) {
  if (!Number.isSafeInteger(damageTotal) || damageTotal < 0) throw new Error("Enter a whole damage amount of zero or more.");
  let remaining = damageTotal;
  const breakdown = [], itemAllocations = [];
  const tempADAbsorbed = useTempAD ? Math.min(Math.max(0, Number(tempAD) || 0), remaining) : 0;
  remaining -= tempADAbsorbed;
  if (tempADAbsorbed) breakdown.push({ type: "temp", source: "Temporary / Magic AD", absorbed: tempADAbsorbed, remainingAD: tempAD - tempADAbsorbed });
  for (const source of sources) {
    if (!source.active || !source.enabled || !(source.ad > 0) || !remaining) continue;
    const absorbed = Math.min(source.ad, remaining), newDefense = source.ad - absorbed;
    remaining -= absorbed;
    itemAllocations.push({ itemId: source.id, name: source.name, absorbed, newDefense, maxAD: source.maxAD });
    breakdown.push({ type: "item", source: source.name, absorbed, remainingAD: newDefense, maxAD: source.maxAD });
  }
  const staminaDamage = Math.min(Math.max(0, Number(stamina) || 0), remaining);
  const woundsCount = remaining - staminaDamage;
  if (remaining) breakdown.push({ type: "stamina", source: "Stamina", absorbed: staminaDamage, remainingAD: stamina - staminaDamage, maxAD: staminaMax });
  if (woundsCount) breakdown.push({ type: "wounds", source: hasWounds ? "Backpack Wounds" : "Excess Damage (Dead/Defeated)", absorbed: woundsCount, woundsCount });
  return { damageTotal, tempADAbsorbed, itemAllocations, staminaDamage, woundsCount, breakdown, unabsorbedDamage: remaining };
}

/** Recompute from current documents and selected sources; clients never dictate armor balances. */
export function allocationForActor(actor, requested) {
  if (!Number.isSafeInteger(requested?.damageTotal) || requested.damageTotal < 1) throw new Error("Enter a positive whole damage amount.");
  const ids = (requested.itemAllocations ?? []).map(source => source.itemId);
  if (new Set(ids).size !== ids.length) throw new Error("An armor source was selected twice.");
  const sources = ids.map(id => {
    const item = actor.items.get(id);
    if (!item || !activeDefense(item)) throw new Error("An armor source changed. Reopen the damage dialog.");
    return { id, name: item.name, ad: item.system.armor.defense, maxAD: item.system.armor.maxDefense, active: true, enabled: true };
  });
  return calculateDamage({ damageTotal: requested.damageTotal, sources, tempAD: actor.system.tempAD,
    useTempAD: requested.tempADAbsorbed > 0, stamina: actor.system.stamina?.value,
    staminaMax: actor.system.stamina?.max, hasWounds: woundCapacity(actor) > 0 });
}
