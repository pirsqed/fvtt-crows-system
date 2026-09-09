/** Village records are embedded Items, so editing one record cannot replace another. */
export const VILLAGE_ENTRY_TYPE = "villageEntry";
export const VILLAGE_KINDS = ["institution", "npc", "quest", "crow"];
export const VILLAGE_STATUSES = {
  institution: { active: "Active", planned: "Planned", damaged: "Damaged", closed: "Closed" },
  npc: { resident: "Resident", visiting: "Visiting", missing: "Missing", departed: "Departed", deceased: "Deceased" },
  quest: { open: "Open", active: "In progress", completed: "Completed", failed: "Failed", abandoned: "Abandoned" },
  crow: { resident: "Resident", away: "Away", retired: "Retired", deceased: "Deceased" }
};
export const VILLAGE_LABELS = { institution: "Institution", npc: "NPC", quest: "Quest", crow: "Crow & NPC connection" };
export const escapeVillageText = value => String(value ?? "").replace(/[&<>"']/g,
  char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function salePercentage(prosperity) {
  if (!Number.isInteger(prosperity) || prosperity < -10 || prosperity > 10) throw new Error("Prosperity must be an integer from -10 to 10.");
  if (prosperity === -10) return 30;
  if (prosperity <= -6) return 40;
  if (prosperity <= -2) return 45;
  if (prosperity <= 1) return 50;
  if (prosperity <= 5) return 55;
  if (prosperity <= 9) return 60;
  return 70;
}

export function newVillageEntry(kind, name) {
  if (!VILLAGE_KINDS.includes(kind)) throw new Error("Unknown village record type.");
  return { name: name ?? `New ${VILLAGE_LABELS[kind]}`, type: VILLAGE_ENTRY_TYPE,
    img: { institution: "icons/svg/house.svg", npc: "icons/svg/mystery-man.svg", quest: "icons/svg/book.svg", crow: "icons/svg/cowled.svg" }[kind],
    system: { kind, status: Object.keys(VILLAGE_STATUSES[kind])[0] } };
}

export function startingInstitutions(existing = []) {
  const names = new Set(Array.from(existing).filter(i => i.type === VILLAGE_ENTRY_TYPE && i.system.kind === "institution")
    .map(i => (i.system.category || i.name).trim().toLowerCase()));
  return [["Blacksmith", 4], ["Crypt", 5], ["General Store", 3], ["Inn", 5], ["Temple", 5]]
    .filter(([name]) => !names.has(name.toLowerCase()))
    .map(([name, maxLevel]) => {
      const data = newVillageEntry("institution", name);
      Object.assign(data.system, { category: name, level: 1, maxLevel });
      return data;
    });
}

export function crowVillageEntry(crow, { copyConnection = true } = {}) {
  if (crow.type !== "crow") throw new Error("Choose a Crow actor.");
  const connection = copyConnection ? crow.flags?.["fvtt-crows-system"]?.creation?.connection : null;
  const data = newVillageEntry("crow", crow.name);
  // One stable record per Crow per village; Foundry enforces embedded document ID uniqueness.
  data._id = crow.id;
  Object.assign(data.system, { actorId: crow.id, npcName: connection?.name ?? "",
    relationship: connection?.relationship ?? "", benefit: connection?.benefit ?? "",
    benefitDescription: connection?.description ?? "" });
  return data;
}

export function villageEntries(items) {
  const groups = Object.fromEntries(VILLAGE_KINDS.map(kind => [kind, []]));
  for (const item of items) if (item.type === VILLAGE_ENTRY_TYPE && groups[item.system.kind]) groups[item.system.kind].push(item);
  return groups;
}

export function validateVillageEntry(data) {
  const { kind, status } = data;
  if (!VILLAGE_KINDS.includes(kind) || !Object.hasOwn(VILLAGE_STATUSES[kind], status)) throw new Error("Choose a valid record status.");
  if (kind === "institution") {
    const level = Number(data.level), max = Number(data.maxLevel), pending = Number(data.pendingLevel || 0);
    if (![level, max, pending].every(Number.isInteger) || level < 1 || max > 6 || level > max || pending < 0 || pending > max) {
      throw new Error("Institution levels must be between 1 and the maximum (up to 6). Pending level may be 0 for none.");
    }
    if (pending && (!Number.isInteger(Number(data.readyCycle)) || Number(data.readyCycle) < 1)) throw new Error("Set the cycle when the pending level becomes available.");
  }
}

function requireVillageOwner(village) {
  if (village?.type !== "village" || !village.isOwner) throw new Error("You do not have permission to edit this village.");
}

export async function addCrowToVillage(village, crow, { copyConnection = crow?.flags?.["fvtt-crows-system"]?.homeVillageId === village?.id } = {}) {
  requireVillageOwner(village);
  if (!crow?.visible || crow.type !== "crow") throw new Error("Choose a Crow actor you can view.");
  const old = Array.from(village.items).find(item => item.type === VILLAGE_ENTRY_TYPE && item.system.kind === "crow" && item.system.actorId === crow.id);
  if (old) return old;
  if (village.items.get(crow.id)) throw new Error("This record ID is already in use in the village.");
  const [created] = await village.createEmbeddedDocuments("Item", [crowVillageEntry(crow, { copyConnection })], { keepId: true });
  return created;
}

export async function rollVillageEvent(village) {
  requireVillageOwner(village);
  const prosperity = village.system.prosperity;
  salePercentage(prosperity); // Validate before rolling.
  const roll = await new Roll(`1d10 ${prosperity < 0 ? "-" : "+"} ${Math.abs(prosperity)}`).evaluate();
  return roll.toMessage({ speaker: { alias: village.name },
    flavor: `Village Event — ${escapeVillageText(village.name)} — Cycle ${village.system.cycle}, Prosperity ${prosperity}. Resolve using the Village Event table.` });
}
