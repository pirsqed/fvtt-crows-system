import { escapeVillageText, VILLAGE_ENTRY_TYPE } from "./village.mjs";

const claimsInProgress = new WeakSet();
const boonItems = crow => Array.from(crow.items).filter(i => i.type === "boon");
const snapshot = items => JSON.stringify(items.map(i => ({ id: i.id ?? i._id, name: i.name,
  system: i.toObject ? i.toObject(false).system : i.system })).sort((a, b) => a.id.localeCompare(b.id)));

/** Claim a single player-authored crypt boon, confirming before replacing it. */
export async function claimBoon(village, graveId, crow, { confirm = options => Dialog.confirm(options) } = {}) {
  if (village?.type !== "village" || !village.visible) throw new Error("You cannot view this village.");
  if (crow?.type !== "crow" || !crow.isOwner || crow.isToken) throw new Error("Choose a Crow you own from the Actors directory.");
  if (claimsInProgress.has(crow)) throw new Error("A boon claim is already in progress for this Crow.");
  claimsInProgress.add(crow);
  try {
    const grave = village.items.get(graveId);
    if (grave?.type !== VILLAGE_ENTRY_TYPE || grave.system.kind !== "grave") throw new Error("This grave is unavailable.");
    const name = grave.system.cryptBoon?.trim();
    if (!name) throw new Error("Enter a boon name in the grave record first.");
    const data = { name, type: "boon", img: "icons/svg/book.svg", system: {
      description: escapeVillageText(grave.system.description).replace(/\r?\n/g, "<br>"),
      uses: Math.max(0, Number(grave.system.boonUses) || 0),
      sourceName: `${grave.name} — ${village.name}`, sourceUuid: `${village.uuid}.Item.${grave.id}`
    } };
    const existing = boonItems(crow), before = snapshot(existing);
    if (existing.length && !await confirm({ title: "Replace crypt boon?", defaultYes: false,
      content: `<p>Replace <strong>${escapeVillageText(existing.map(i => i.name).join(", "))}</strong> on <strong>${escapeVillageText(crow.name)}</strong> with <strong>${escapeVillageText(name)}</strong>?</p><p>The current boon notes and remaining uses will be replaced. This Crow will have one crypt boon.</p>`
    })) return null;
    if (!crow.isOwner || !village.visible) throw new Error("Your access changed. Reopen the sheet before claiming.");
    if (snapshot(boonItems(crow)) !== before) throw new Error("This Crow's boon changed. Claim again to review the current boon.");
    if (existing.length) {
      const id = existing[0].id ?? existing[0]._id;
      const [updated] = await crow.updateEmbeddedDocuments("Item", [{ _id: id, name: data.name, img: data.img, system: data.system }]);
      if (!updated) throw new Error("The boon was not updated. Check the Crow's Notes tab before retrying.");
      // Consolidate copies made by the earlier multi-boon implementation only after confirmation and a successful update.
      if (existing.length > 1) await crow.deleteEmbeddedDocuments("Item", existing.slice(1).map(i => i.id ?? i._id));
      return updated;
    }
    // A shared slot ID also prevents simultaneous first claims from creating separate entries.
    const id = "cryptBoonSlot001";
    if (crow.items.get(id)) throw new Error("The crypt boon slot is occupied by another record.");
    const [created] = await crow.createEmbeddedDocuments("Item", [{ _id: id, ...data }], { keepId: true });
    if (!created) throw new Error("The boon was not created. Check the Crow's Notes tab before retrying.");
    return created;
  } finally { claimsInProgress.delete(crow); }
}
