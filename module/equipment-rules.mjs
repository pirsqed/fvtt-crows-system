/** Shared equipment and wound rules used by sheets and damage application. */
export function requiresHand(item) {
  return !!(item.system?.isShield || (item.system?.isArmor && /\bshield\b/i.test(item.name)));
}

export function canEquip(item, location = item.system?.location) {
  return !requiresHand(item) || /^hand[12]$/.test(location ?? "");
}

export function activeDefense(item) {
  return item.system?.isArmor && item.system.isEquipped !== false
    && !["ground", "stash"].includes(item.system.location) && canEquip(item);
}

export function woundCapacity(actor) {
  if (actor.type === "crow") return 10;
  return actor.type === "monster" && /^(human|animal)$/i.test(actor.system.type?.trim() ?? "")
    ? Math.max(0, Number(actor.system.slots) || 0) : 0;
}

export function woundMap(actor) {
  return actor.type === "crow" ? { ...actor.system.woundedSlots }
    : Object.fromEntries((actor.system.woundSlots ?? []).map(n => [`slot${n}`, true]));
}

export function woundUpdate(actor, map) {
  return actor.type === "crow" ? { "system.woundedSlots": map }
    : { "system.woundSlots": Object.keys(map).filter(key => map[key]).map(key => Number(key.slice(4))).sort((a, b) => a - b) };
}

export function woundStats(actor) {
  const capacity = woundCapacity(actor), map = woundMap(actor), occupied = new Set();
  for (const item of actor.items) {
    if (item.type !== "equipment") continue;
    for (const slot of item.getOccupiedSlots?.() ?? [item.system.location]) {
      const match = /^(?:backpack|slot)(\d+)$/.exec(slot ?? "");
      if (match) occupied.add(Number(match[1]));
    }
  }
  let totalWounds = 0, speedPenalty = 0;
  for (let n = 1; n <= capacity; n++) {
    if (!map[`slot${n}`]) continue;
    totalWounds++;
    if (occupied.has(n)) speedPenalty++;
  }
  return { totalWounds, speedPenalty, woundCapacity: capacity,
    isDead: capacity > 0 ? totalWounds >= capacity : actor.system.stamina?.value === 0 };
}
