import { showWeaponAttackDialog, showStatBlockAttackDialog } from "./attacks.mjs";
import { showSpellcastDialog } from "./spellcasting.mjs";

export function itemShortcutAction(item) {
  if (!["crow", "monster"].includes(item.parent?.type)) return "open";
  if (item.type === "attack") return "attack";
  if (item.type === "equipment" && item.system.isSpellbook) return "cast";
  if (item.type === "equipment" && item.system.isWeapon) return "weapon";
  return "open";
}

/** Resolve the original item each time, including items on unlinked tokens. */
export async function useItemShortcut(uuid) {
  try {
    const item = await fromUuid(uuid);
    if (item?.documentName !== "Item") throw new Error("This shortcut's item no longer exists.");
    const action = itemShortcutAction(item);
    if (action === "open") {
      if (!item.isOwner && !item.testUserPermission(game.user, "OBSERVER"))
        throw new Error("You do not have permission to view this item.");
      return item.sheet.render(true);
    }
    const actor = item.parent;
    const validate = () => {
      let message;
      if (!actor.isOwner) message = "You must own this actor to use this shortcut.";
      else if (actor.items.get(item.id) !== item) message = "This shortcut's item no longer exists.";
      else if (action !== "attack" && (item.system.isEquipped === false || !/^hand[12]$/.test(item.system.location)))
        message = `Equip ${item.name} in a hand before using it.`;
      else if (action !== "attack" && Number(item.system.quantity) === 0)
        message = `${item.name} has no quantity remaining.`;
      if (message) ui.notifications.warn(message);
      return !message;
    };
    if (!validate()) return;
    if (action === "cast") return showSpellcastDialog(actor, item, { validate });
    if (action === "weapon") return showWeaponAttackDialog(actor, item, { validate });
    return showStatBlockAttackDialog(actor, item, { validate });
  } catch (error) {
    ui.notifications.warn(error.message);
  }
}

export async function createItemShortcut(data, slot) {
  const item = await Item.implementation.fromDropData(data);
  if (item?.documentName !== "Item") throw new Error("Could not find the dropped item.");
  const action = itemShortcutAction(item);
  const label = { open: "Open", cast: "Cast", weapon: "Attack", attack: "Attack" }[action];
  const command = `await game.crows.useItemShortcut(${JSON.stringify(item.uuid)});`;
  let macro = game.macros.find(m => m.isOwner && m.type === "script" && m.command === command);
  if (!macro) macro = await Macro.create({ name: `${label}: ${item.name}`, type: "script", img: item.img, command });
  if (macro) await game.user.assignHotbarMacro(macro, slot);
  return macro;
}

// Hooks must cancel core handling synchronously, before macro creation finishes.
export function onHotbarDrop(_hotbar, data, slot) {
  if (data.type !== "Item") return;
  createItemShortcut(data, slot).catch(error => ui.notifications.error(error.message));
  return false;
}
