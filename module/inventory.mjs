/** Inventory rules shared by sheets and document updates. */
export const isGold = item => item.type === "equipment" && item.system?.isGold === true;
export const goldTotal = items => Array.from(items).filter(isGold)
  .reduce((total, item) => total + Math.max(0, Number(item.system.quantity) || 0), 0);

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
