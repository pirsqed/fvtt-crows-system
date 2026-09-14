/** Counts carried by a single item, independent of stack quantity. */
export const SUPPLY_PRESETS = {
  "coin purse": { type: "gold", max: 500, quantity: 0 },
  "quiver of arrows": { type: "arrows", max: 20, quantity: 20 },
  "quiver of 20 arrows": { type: "arrows", max: 20, quantity: 20 },
  "case of bolts": { type: "bolts", max: 20, quantity: 20 },
  "case of crossbow bolts": { type: "bolts", max: 20, quantity: 20 },
  "case of 20 crossbow bolts": { type: "bolts", max: 20, quantity: 20 }
};
export function supplyPreset(data) {
  const preset = SUPPLY_PRESETS[data.name?.trim().toLowerCase()];
  if (data.type === "equipment" && preset) {
    Object.assign(data.system, { quantity: 1, maxStack: 1 });
    data.system.contentsType ??= preset.type;
    data.system.contentsMax ??= preset.max;
    data.system.contentsQuantity ??= preset.quantity;
  }
  return data;
}
export function supplyUpdate(system, update) {
  const type = update.contentsType ?? system.contentsType;
  const result = {};
  if (type !== system.contentsType) result.contentsQuantity = 0;
  if (type) Object.assign(result, { quantity: 1, maxStack: 1, isGold: false, useQtyPlusMinus: false });
  const count = result.contentsQuantity ?? update.contentsQuantity ?? system.contentsQuantity ?? 0;
  const maximum = update.contentsMax ?? system.contentsMax ?? 0;
  if (!Number.isInteger(count) || count < 0 || !Number.isInteger(maximum) || maximum < 0) throw new Error("Supply quantities and maximums must be whole numbers of zero or more.");
  if (count > maximum && count > (system.contentsQuantity ?? 0)) throw new Error("That exceeds this item's contents maximum.");
  return result;
}
export function bindSupplyControls(html, actor) {
  const itemFor = event => actor.items.get(event.currentTarget.closest('[data-item-id]')?.dataset.itemId);
  html.find('.supply-step').on('click', async event => {
    event.preventDefault(); event.stopPropagation();
    if (!actor.isOwner) return;
    const item = itemFor(event);
    if (!item?.system.contentsType) return;
    const quantity = item.system.contentsQuantity + Number(event.currentTarget.dataset.delta);
    if (quantity < 0 || quantity > Math.max(item.system.contentsMax, item.system.contentsQuantity)) return;
    await item.update({ 'system.contentsQuantity': quantity });
  });
  html.find('.supply-count').on('change', async event => {
    event.preventDefault(); event.stopPropagation();
    if (!actor.isOwner) return;
    const item = itemFor(event);
    if (!item?.system.contentsType) return;
    const value = Number(event.currentTarget.value);
    try {
      supplyUpdate(item.system, { contentsQuantity: value });
      await item.update({ 'system.contentsQuantity': value });
    } catch (error) { event.currentTarget.value = item.system.contentsQuantity; ui.notifications.warn(error.message); }
  });
}
