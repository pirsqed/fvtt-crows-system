import { supplyPreset } from "./supplies.mjs";
import { repairImportIcons } from "./icon-repairs.mjs";
const SCOPE = "fvtt-crows-system";
export const IMPORT_PACKS = [
  { file: "equipment.json", name: "crows-equipment", label: "Equipment & Spellbooks", fn: "importEquipment", type: "Item" },
  { file: "dungeon-loot.json", name: "crows-dungeon-loot", label: "Dungeon Loot & Relics", fn: "importDungeonLoot", type: "Item" },
  { file: "traits.json", name: "crows-traits", label: "Traits", fn: "importTraits", type: "Item" },
  { file: "monsters.json", name: "crows-bestiary", label: "Bestiary", fn: "importMonsters", type: "Actor" }
];

/** Compare content independently of Foundry IDs, document bookkeeping and object-key order. */
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().filter(key => !["_id", "_stats", "folder", "ownership", "sort"].includes(key)
    // Adding the default gold field to older equipment is not a local content edit.
    && !(["isGold", "isShield", "isSpellbook", "useQtyPlusMinus", "use_qty_plus_minus"].includes(key) && value[key] === false)
    && !(key === "woundSlots" && Array.isArray(value[key]) && !value[key].length))
    .map(key => [key, key === "flags" ? canonical(Object.fromEntries(Object.entries(value.flags ?? {})
      .map(([scope, flags]) => [scope, scope === SCOPE
        ? Object.fromEntries(Object.entries(flags).filter(([flag]) => flag !== "importSource")) : flags])
      .filter(([, flags]) => Object.keys(flags).length))) : canonical(value[key])]));
}
export const fingerprint = value => JSON.stringify(canonical(value));
export const sourceKey = data => `${data.type}:${data.name.trim().toLowerCase()}${data.type === "trait" ? `:${String(data.system.tree ?? "").trim().toLowerCase()}` : ""}`;

export function validateImport(data, pack) {
  if (!Array.isArray(data) || !data.length) throw new Error(`${pack.file}: expected a non-empty array.`);
  const keys = new Set();
  const DocumentClass = pack.type === "Actor" ? Actor : Item;
  for (const entry of data) {
    if (!entry || typeof entry.name !== "string" || !entry.name.trim() || !entry.system
      || !CONFIG[pack.type].dataModels[entry.type]) throw new Error(`${pack.file}: invalid document name, type, or system data.`);
    const key = sourceKey(entry);
    if (keys.has(key)) throw new Error(`${pack.file}: duplicate entry ${entry.name}.`);
    keys.add(key);
    const doc = new DocumentClass(entry, { strict: true });
    if (doc.validate({ strict: true }) === false) throw new Error(`${entry.name}: document validation failed.`);
  }
  return data;
}

export function repairImportEquipment(data) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    data.forEach(repairImportEquipment);
    return data;
  }
  if (data.type === "equipment" && data.name && data.system) {
    supplyPreset(data);
  }
  if (Array.isArray(data.items)) {
    data.items.forEach(repairImportEquipment);
  }
  return data;
}

export async function readImport(pack) {
  const response = await fetch(`systems/${SCOPE}/packs/${pack.file}`, { cache: "no-store" });
  if (response.status === 404) return { pack, missing: true };
  if (!response.ok) throw new Error(`${pack.file}: could not read file (HTTP ${response.status}).`);
  const raw = await response.json();
  return { pack, data: validateImport(repairImportEquipment(repairImportIcons(raw)), pack) };
}

export class CrowsContentImport {
  static busy = false;

  static async run(packs = IMPORT_PACKS, { onProgress = () => { } } = {}) {
    if (!game.user.isGM) throw new Error("Only the GM can import content.");
    if (game.users.activeGM?.id !== game.user.id) throw new Error("Run the importer as the active GM.");
    if (this.busy) throw new Error("An import is already running.");
    this.busy = true;
    const report = [];
    try {
      // Read and validate every selected file before writing to any compendium.
      const inputs = await Promise.all(packs.map(readImport));
      for (const input of inputs) {
        if (input.missing) { report.push({ label: input.pack.label, missing: true }); continue; }
        const result = { label: input.pack.label, created: 0, updated: 0, unchanged: 0, preserved: [] };
        report.push(result);
        try { await this.importPack(input.pack, input.data, result, onProgress); }
        catch (err) { result.error = err.message; break; }
      }
      return report;
    } finally { this.busy = false; }
  }

  static async importPack(config, data, result, onProgress = () => { }) {
    let pack = game.packs.get(`world.${config.name}`);
    if (pack && pack.documentName !== config.type) throw new Error("Existing compendium has the wrong document type.");
    if (pack?.locked) throw new Error("Compendium is locked. Unlock it before importing.");
    if (!pack) pack = await CompendiumCollection.createCompendium({ name: config.name, label: `Crows ${config.label}`, type: config.type });
    const existing = await pack.getDocuments();
    for (const [index, raw] of data.entries()) {
      onProgress(`${config.label}: ${index + 1} / ${data.length}`);
      const key = sourceKey(raw);
      const matches = existing.filter(doc => doc.getFlag(SCOPE, "importSource")?.key === key || sourceKey(doc) === key);
      if (matches.length > 1) { result.preserved.push(`${raw.name} (ambiguous match)`); continue; }
      const old = matches[0];
      const meta = old?.getFlag(SCOPE, "importSource");
      if (old && !meta) { result.preserved.push(`${raw.name} (existing untracked entry)`); continue; }
      if (old && fingerprint(old.toObject()) !== meta.baseline) {
        result.preserved.push(`${raw.name} (locally edited)`); continue;
      }
      const source = fingerprint(raw);
      if (old && meta.source === source) { result.unchanged++; continue; }
      // Embedded-document replacement is deliberately not automatic: actor inventories may be linked externally.
      if (old && config.type === "Actor") { result.preserved.push(`${raw.name} (updated source; review actor inventory)`); continue; }
      const payload = foundry.utils.deepClone(raw);
      delete payload._id;
      const metadata = { key, source, baseline: null };
      payload.flags = { ...payload.flags, [SCOPE]: { ...payload.flags?.[SCOPE], importSource: metadata } };
      let doc;
      if (old) {
        // Existing IDs, folders, ownership and unrelated flags remain intact.
        delete payload.folder; delete payload.ownership;
        doc = await old.update(payload);
        result.updated++;
      } else {
        [doc] = await pack.documentClass.createDocuments([payload], { pack: pack.collection });
        if (!doc) throw new Error(`${raw.name}: creation returned no document.`);
        existing.push(doc);
        result.created++;
      }
      await doc.setFlag(SCOPE, "importSource", { ...metadata, baseline: fingerprint(doc.toObject()) });
    }
  }

  static describe(report) {
    return report.map(row => row.missing ? `${row.label}: file not built.` :
      `${row.label}: ${row.created} added, ${row.updated} updated, ${row.unchanged} unchanged, ${row.preserved.length} preserved.${row.error ? ` Stopped: ${row.error}` : ""}`).join("\n");
  }
}
