import { beltCapacity } from "./inventory.mjs";
import { supplyPreset } from "./supplies.mjs";
/** Pure creation rules. Game content is loaded from the user's generated packs. */
export const CHARACTERISTICS = ["agility", "mind", "strength"];
export const CREATOR_SCOPE = "fvtt-crows-system";
export const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g,
  char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const clone = value => JSON.parse(JSON.stringify(value));
export const expertiseKey = name => name.slice(0, 1).toLowerCase() + name.slice(1).replace(/\s/g, "");

export function primaryChoices(background) {
  return background.characteristicAt2.includes("Any") ? [...CHARACTERISTICS]
    : background.characteristicAt2.map(value => value.toLowerCase());
}

export function assignCharacteristics(background, primary, spread, secondary) {
  if (!primaryChoices(background).includes(primary)) throw new Error("Choose a permitted characteristic for the background's 2.");
  if (!["balanced", "focused"].includes(spread)) throw new Error("Choose a characteristic spread.");
  const remaining = CHARACTERISTICS.filter(key => key !== primary);
  if (!remaining.includes(secondary)) throw new Error("Choose which remaining characteristic receives the higher value.");
  return { [primary]: 2, [secondary]: spread === "balanced" ? 1 : 2,
    [remaining.find(key => key !== secondary)]: spread === "balanced" ? 0 : -1 };
}

export function backgroundFromDice(backgrounds, dice) {
  if (dice.length !== 2 || dice.some(n => !Number.isInteger(n) || n < 1 || n > 6)) throw new Error("Background rolls require two d6 results.");
  const background = backgrounds.find(entry => entry.roll === dice.join("-"));
  if (!background) throw new Error("This background roll is missing from the generated content.");
  return background;
}

export function validateBackgrounds(data) {
  if (!Array.isArray(data) || data.length !== 36) throw new Error("Rebuild playtest content: expected 36 backgrounds.");
  const rolls = new Set();
  for (const background of data) {
    if (!background.name || !/^[1-6]-[1-6]$/.test(background.roll) || rolls.has(background.roll)
      || !Array.isArray(background.characteristicAt2) || !primaryChoices(background).length
      || primaryChoices(background).some(key => !CHARACTERISTICS.includes(key))
      || !Number.isInteger(background.stamina) || background.stamina < 1
      || !background.trait?.name || !background.trait?.tree
      || !Array.isArray(background.startingKit) || !background.startingKit.length
      || background.startingKit.some(item => !item.name || !Number.isInteger(item.quantity) || item.quantity < 1)
      || !Array.isArray(background.expertises) || background.expertises.some(e => !e.name || !Number.isInteger(e.uses) || e.uses < 1 || e.uses > 2)
      || !Array.isArray(background.pets) || !Number.isInteger(background.extraGold) || background.extraGold < 0) {
      throw new Error(`Invalid background data: ${background.name ?? "unnamed"}. Rebuild playtest content.`);
    }
    rolls.add(background.roll);
  }
  return data;
}

function uniqueEntry(entries, name, type, tree) {
  const matches = entries.filter(entry => entry.name === name && entry.type === type && (!tree || entry.system?.tree === tree));
  if (matches.length !== 1) throw new Error(`${matches.length ? "Ambiguous" : "Missing"} ${type}: ${name}. Rebuild playtest content.`);
  return clone(matches[0]);
}

function cleanDocument(data) {
  delete data._id; delete data._stats; delete data.folder; delete data.ownership;
  if (data.items) data.items.forEach(cleanDocument);
  return data;
}

/** Plan non-overlapping slots. Overflow is retained in home storage, never discarded. */
export function arrangeEquipment(items) {
  const used = new Set();
  const reserve = (item, prefix, limit) => {
    const width = Math.max(1, item.system.slots || 1);
    // The current inventory represents hands by slots, so leave cumbersome items stowed.
    if (prefix === "hand" && /cumbersome/i.test(item.system.traits ?? "")) return false;
    for (let start = 1; start <= limit - width + 1; start++) {
      const slots = Array.from({ length: width }, (_, offset) => `${prefix}${start + offset}`);
      if (slots.some(slot => used.has(slot))) continue;
      slots.forEach(slot => used.add(slot));
      item.system.location = slots[0];
      item.system.isEquipped = prefix === "hand" || (prefix === "backpack" && isSuit(item));
      return true;
    }
    return false;
  };
  const isSuit = item => item.system.isArmor && /^(Light|Medium|Heavy) Armor$/.test(item.name);
  // Armor needs contiguous backpack slots; the largest main weapon goes in the hands.
  const equipment = items.filter(item => item.type === "equipment");
  const ordered = [...equipment].sort((a, b) => Number(isSuit(b)) - Number(isSuit(a))
    || Number(b.system.isWeapon) - Number(a.system.isWeapon) || (b.system.slots || 1) - (a.system.slots || 1));
  for (const item of ordered) {
    item.system.location = "stash"; item.system.isEquipped = false;
    if (isSuit(item)) { reserve(item, "backpack", 10); continue; }
    if ((item.system.isWeapon || item.name === "Shield") && reserve(item, "hand", 2)) continue;
    if (reserve(item, "belt", beltCapacity({ type: "crow", items }))) continue;
    reserve(item, "backpack", 10);
  }
  return equipment.filter(item => item.system.location === "stash").map(item => item.name);
}

export function buildCrowPlan({ background, draft, equipment, traits, monsters = [], connections, userId }) {
  for (const field of ["name", "feature", "connectionName", "relationship"]) {
    if (typeof draft[field] !== "string" || !draft[field].trim()) throw new Error("Add your crow's name, feature, and NPC relationship before creating.");
  }
  const connection = connections.find(entry => entry.name === draft.connection);
  if (!connection) throw new Error("Choose an NPC connection benefit.");
  if (!Number.isInteger(draft.gold) || draft.gold < 3 || draft.gold > 18) throw new Error("Starting gold must be a 3d6 total, from 3 to 18.");
  const characteristics = assignCharacteristics(background, draft.primary, draft.spread, draft.secondary);
  const items = [];
  for (const entry of background.startingKit) {
    const source = supplyPreset(cleanDocument(uniqueEntry(equipment, entry.name, "equipment")));
    const limit = Math.max(1, source.system.maxStack || 1);
    const note = background.equipment?.find(item => item.name === entry.name)?.note;
    // The extractor combines lore books. Keep each subject on its own item.
    const subjects = note?.split(", ") ?? [];
    for (let left = entry.quantity, index = 0; left > 0; index++) {
      const item = clone(source);
      item.system.quantity = subjects.length ? 1 : Math.min(left, limit);
      left -= item.system.quantity;
      if (note) {
        item.system.description = `${item.system.description ?? ""}<p><strong>Starting kit:</strong> ${escapeHTML(subjects[index] ?? note)}</p>`;
        item.flags = { ...item.flags, [CREATOR_SCOPE]: { kitNote: subjects[index] ?? note } };
      }
      items.push(item);
    }
  }
  const gold = draft.gold + background.extraGold;
  let purse = items.find(item => item.system.contentsType === "gold");
  if (!purse) {
    purse = supplyPreset({ name: "Coin Purse", type: "equipment", img: "icons/containers/bags/pouch-leather-brown.webp", system: { slots: 1, cost: 0 } });
    items.push(purse);
  }
  purse.system.contentsQuantity = gold;
  const trait = cleanDocument(uniqueEntry(traits, background.trait.name, "trait", background.trait.tree));
  if (trait.system.tree === "Reputation" && !draft.traitChoice?.trim()) throw new Error("Name the village merchant for your starting Reputation trait.");
  items.push(trait);
  const overflow = arrangeEquipment(items);
  const expertises = Object.fromEntries(background.expertises.map(entry => [expertiseKey(entry.name), { value: entry.uses, max: entry.uses }]));
  const pets = background.pets.map(name => cleanDocument(uniqueEntry(monsters, name, "monster")));
  const biography = `<h2>${escapeHTML(draft.name.trim())}</h2><p>${escapeHTML(draft.feature.trim())}</p>`
    + `<h3>NPC connection: ${escapeHTML(draft.connectionName.trim())}</h3><p>${escapeHTML(draft.relationship.trim()).replace(/\r?\n/g, "<br>")}</p>`
    + `<p><strong>${escapeHTML(connection.name)}:</strong> ${escapeHTML(connection.description)}</p>`
    + (draft.traitChoice?.trim() ? `<p><strong>Starting trait choice:</strong> ${escapeHTML(draft.traitChoice.trim())}</p>` : "")
    + (pets.length ? `<p><strong>Starting pets:</strong> ${pets.map(pet => escapeHTML(pet.name)).join(", ")}</p>` : "");
  const crow = { name: draft.name.trim(), type: "crow", img: "icons/svg/cowled.svg", ownership: { [userId]: 3 },
    system: { background: background.name, characteristics, stamina: { value: background.stamina, max: background.stamina },
      speed: 5, coins: 0, expertises, biography }, items,
    flags: { [CREATOR_SCOPE]: { creation: { version: 1, backgroundRoll: background.roll, goldRoll: draft.gold,
      feature: draft.feature.trim(), connection: { ...connection, name: draft.connectionName.trim(), benefit: connection.name, relationship: draft.relationship.trim() },
      traitChoice: draft.traitChoice ?? "", totalXP: 0 } } } };
  return { crow, pets, overflow, gold, trait };
}

/** One batch with preallocated IDs: an uncertain failure must be reviewed, never blindly retried. */
export async function persistCrowPlan(plan, { ActorClass, randomID, userId, creationId }) {
  const crow = clone(plan.crow);
  crow._id = randomID();
  const pets = plan.pets.map(pet => ({ ...clone(pet), _id: randomID(), name: `${crow.name}'s ${pet.name}`,
    ownership: { [userId]: 3 }, flags: { ...pet.flags, [CREATOR_SCOPE]: { crowId: crow._id, creationId } } }));
  crow.flags[CREATOR_SCOPE].creation.id = creationId;
  crow.flags[CREATOR_SCOPE].creation.petIds = pets.map(pet => pet._id);
  if (pets.length) crow.system.biography += `<h3>Companions</h3><p>${pets.map(pet => `@UUID[Actor.${pet._id}]{${escapeHTML(pet.name)}}`).join("<br>")}</p>`;
  const payloads = [crow, ...pets];
  // Validate every document, including its embedded items, before starting a server write.
  for (const data of payloads) {
    if (new ActorClass(data, { strict: true }).validate({ strict: true }) === false) throw new Error("Actor validation failed.");
  }
  const created = await ActorClass.createDocuments(payloads, { keepId: true });
  if (created.length !== payloads.length) throw new Error("Creation returned an incomplete result. Check the Actors directory before trying again.");
  return created.find(actor => actor.id === crow._id) ?? created[0];
}
