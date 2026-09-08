/** Exact replacements for nonexistent core icon paths used by older exports. */
export const ICON_REPAIRS = {
  "icons/containers/boxes/chest-wooden-ironbound-brown.webp": "icons/containers/chest/chest-simple-oak-steel-brown.webp",
  "icons/skills/wounds/skull-blood-trail-red.webp": "icons/commodities/bones/skull-hollow-brown-red.webp",
  "icons/sundries/survival/backpack-worn-leather-brown.webp": "icons/containers/bags/pack-leather-brown.webp",
  "icons/skills/wounds/injury-bleeding-body-red.webp": "icons/skills/wounds/injury-pain-body-orange.webp",
  "icons/skills/melee/unarmed-claws-beast.webp": "icons/weapons/fist/claw-grey-black.webp",
  "icons/weapons/swords/sword-broad-silver.webp": "icons/weapons/swords/sword-broad-worn.webp",
  "icons/magic/perception/eye-glowing-green.webp": "icons/magic/perception/eye-ringed-green.webp",
  "icons/consumables/food/bowl-stew-steaming-brown.webp": "icons/consumables/food/bowl-stew-brown.webp",
  "icons/tools/instruments/lockpicks-steel.webp": "icons/skills/trades/security-lockpicking-chest-blue.webp",
  "icons/consumables/potions/bottle-stoppered-empty.webp": "icons/consumables/potions/bottle-corked-empty.webp",
  "icons/skills/ranged/arrow-flying-target.webp": "icons/skills/ranged/arrows-flying-triple-gray.webp",
  "icons/skills/ranged/arrows-triple-glow-blue.webp": "icons/skills/ranged/arrows-flying-triple-blue.webp",
  "icons/magic/unholy/skull-energy-purple.webp": "icons/magic/death/skull-energy-light-purple.webp",
  "icons/skills/movement/feet-fall-down-orange.webp": "icons/svg/falling.svg",
  "icons/equipment/back/quiver-brown.webp": "icons/containers/ammunition/quiver-simple-brown.webp",
  "icons/magic/fire/target-strike-fire-ball.webp": "icons/magic/fire/projectile-fireball-orange.webp",
  "icons/skills/melee/parry-block-blade-blue.webp": "icons/skills/melee/swords-parry-block-blue.webp",
  "icons/consumables/potions/bottles-vials-assorted-corked.webp": "icons/tools/laboratory/vials-blue-pink.webp",
  "icons/weapons/bows/longbow-recurve-leather.webp": "icons/weapons/bows/longbow-recurve-leather-brown.webp",
  "icons/weapons/ammunition/arrows-quiver-leather.webp": "icons/containers/ammunition/arrows-quiver-brown.webp",
  "icons/skills/targeting/crosshair-target-green.webp": "icons/skills/targeting/crosshair-ringed-gray.webp",
  "icons/equipment/waist/belt-buckle-leather-brown.webp": "icons/equipment/waist/belt-buckle-square-leather-brown.webp",
  "icons/skills/ranged/target-bullseye-arrow-blood.webp": "icons/skills/ranged/target-bullseye-arrow-blue.webp",
  "icons/commodities/materials/cauldron-empty-iron.webp": "icons/tools/laboratory/cauldron-empty-black.webp",
  "icons/skills/targeting/crosshair-pointed-arrow.webp": "icons/skills/targeting/crosshair-pointed-orange.webp",
  "icons/skills/ranged/arrows-flight-multiple.webp": "icons/skills/ranged/arrows-flying-triple-gray.webp",
  "icons/consumables/potions/bottle-conical-fuming-green.webp": "icons/consumables/potions/bottle-conical-fumes-green.webp",
  "icons/magic/perception/shadow-cloak-gray.webp": "icons/magic/perception/shadow-stealth-eyes-purple.webp"
};
export function repairImportIcons(data) {
  if (!data || typeof data !== "object") return data;
  if (ICON_REPAIRS[data.img]) data.img = ICON_REPAIRS[data.img];
  if (Array.isArray(data)) data.forEach(repairImportIcons);
  else if (Array.isArray(data.items)) data.items.forEach(repairImportIcons);
  return data;
}

export async function repairWorldIcons() {
  if (game.users.activeGM?.id !== game.user.id) return;
  const actors = new Map(game.actors.map(actor => [actor.uuid, actor]));
  for (const scene of game.scenes) for (const token of scene.tokens) {
    if (!token.actorLink && token.actor) actors.set(token.actor.uuid, token.actor);
  }
  const items = game.items.filter(item => ICON_REPAIRS[item.img]);
  if (items.length) await Item.updateDocuments(items.map(item => ({ _id: item.id, img: ICON_REPAIRS[item.img] })));
  for (const actor of actors.values()) {
    const updates = actor.items.filter(item => ICON_REPAIRS[item.img])
      .map(item => ({ _id: item.id, img: ICON_REPAIRS[item.img] }));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  }
}
