/** Inventory rules shared by sheets and document updates. */
export const isGold = item => item.type === "equipment" && item.system?.isGold === true;
export function goldTotal(items) {
  return Array.from(items).reduce((total, item) => total
    + (item.system?.contentsType === "gold" ? Math.max(0, Number(item.system.contentsQuantity) || 0)
      : isGold(item) ? Math.max(0, Number(item.system.quantity) || 0) : 0), 0);
}

export function goldStack(quantity, location = "backpack1") {
  return { name: "Gold Coins", type: "equipment", img: "icons/commodities/currency/coins-plain-pouch-gold.webp",
    system: { isGold: true, quantity, maxStack: 250, slots: 1, cost: 1, location } };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  return value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
}

/** Matching names alone are insufficient: modified gear and depleted supplies stay distinct. */
export function canStack(a, b) {
  if (a?.system?.contentsType || b?.system?.contentsType) return false;
  if (!a || !b || a.uuid && a.uuid === b.uuid || a.type !== "equipment" || b.type !== "equipment") return false;
  if (Math.min(a.system.maxStack || 1, b.system.maxStack || 1) <= 1) return false;
  const signature = item => {
    const system = { ...(item.toObject?.().system ?? item.system) };
    delete system.quantity; delete system.location;
    return JSON.stringify(stable({ name: item.name, system }));
  };
  return signature(a) === signature(b);
}

export function stackAmount(source, target) {
  if (!canStack(source, target)) return 0;
  return Math.max(0, Math.min(Number(source.system.quantity) || 0,
    target.system.maxStack - (Number(target.system.quantity) || 0)));
}

export async function restoreUsageDice(actor, event) {
  event.preventDefault(); event.stopPropagation();
  const item = actor.items.get(event.currentTarget.dataset.itemId);
  const max = item?.system.consumable?.maxUD ?? 0;
  if (!actor.isOwner || max <= 0) return;
  if (!await Dialog.confirm({ title: "Restore usage dice",
    content: "<p>Have you completed the required rest, refill, or other replenishment? This restores all usage dice.</p>" })) return;
  return item.update({ "system.consumable.currentUD": max });
}

/** Traits contribute labelled belt slots in embedded item order. */
export function traitBeltCount(trait) {
  const value = Number(trait.system?.extraBeltSlots);
  return trait.type === "trait" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function beltSlotGrants(actor) {
  if (actor?.type !== "crow") return [];
  const slots = Array.from({ length: 4 }, () => ({ source: "", restriction: "" }));
  for (const trait of actor.items ?? []) {
    for (let n = 0; n < traitBeltCount(trait); n++) {
      slots.push({ source: trait.name, restriction: trait.system.beltSlotNotes ?? "" });
    }
  }
  return slots;
}

export function beltCapacity(actor) {
  return beltSlotGrants(actor).length;
}

/** Count changes shift subsequent grants: require those slots to be empty. */
export function canChangeTraitBelt(trait, nextCount) {
  const actor = trait.parent;
  if (actor?.type !== "crow" || nextCount === traitBeltCount(trait)) return true;
  let first = 5;
  for (const other of actor.items) {
    if (other === trait || (trait.id && other.id === trait.id)) break;
    first += traitBeltCount(other);
  }
  return occupiedBeltEnd(actor.items) < first;
}

/** Highest belt slot currently occupied, including multi-slot equipment. */
export function occupiedBeltEnd(items) {
  return Array.from(items ?? []).reduce((end, item) => {
    const match = item.type === "equipment" && /^belt([1-9]\d*)$/.exec(item.system?.location ?? "");
    return match ? Math.max(end, Number(match[1]) + Math.max(1, parseInt(item.system.slots, 10) || 1) - 1) : end;
  }, 0);
}

export const MAGIC_SLOTS = ["head", "neck", "waist", "gloves", "ring", "boots"];

export function spanFor(location, count = 1) {
    count = Math.max(1, count);
    const m = location?.match(/^(backpack|slot|belt)(\d+)$/);
    if (m) return Array.from({ length: count }, (_, i) => `${m[1]}${Number(m[2]) + i}`);
    if (location === "hand1" && count >= 2) return ["hand1", "hand2"];
    return [location];
  }

export function occupancy(actor, excludeId = null) {
    const map = {};
    for (const item of actor.items) {
      if (item.type !== "equipment" || item.id === excludeId) continue;
      const slots = item.getOccupiedSlots ? item.getOccupiedSlots() : spanFor(item.system.location, item.system.slots);
      for (const s of slots) if (s && !s.startsWith("ground") && s !== "stash") map[s] = item;
    }
    return map;
  }

export function maxBackpack(actor) {
    return actor.type === "crow" ? 10 : Math.max(0, Number(actor.system?.slots) || 0);
  }

export function fits(actor, location, count = 1, excludeId = null) {
  if (!validAnchor(actor, location, count)) return false;
  if (location === "ground" || location === "stash") return true;
  const occupied = occupancy(actor, excludeId);
  return spanFor(location, count).every(slot => !occupied[slot]);
}

export function findFreeSlot(actor, count = 1, excludeId = null) {
    const bp = Array.from({ length: maxBackpack(actor) }, (_, i) => `backpack${i + 1}`);
    const order = actor.type === "crow" ? [...Array.from({ length: beltCapacity(actor) }, (_, i) => `belt${i + 1}`), "hand1", "hand2", ...bp] : bp;
    for (const loc of order) if (fits(actor, loc, count, excludeId)) return loc;
    return actor.type === "crow" ? null : "ground";
  }

/** Only recognized anchors are valid; the same bounds apply to fit checks and placement. */
export function validAnchor(actor, location, count = 1) {
  if (!Number.isSafeInteger(count) || count < 1 || !location) return false;
  if (location === "ground" || location === "stash") return actor.type !== "crow";
  if (MAGIC_SLOTS.includes(location)) return count === 1;
  if (/^hand[12]$/.test(location)) return actor.type === "crow" && (location === "hand1" || count === 1);
  const match = /^(backpack|slot|belt)([1-9]\d*)$/.exec(location);
  if (!match) return false;
  const limit = match[1] === "belt" ? beltCapacity(actor) : maxBackpack(actor);
  return Number(match[2]) + count - 1 <= limit;
}
