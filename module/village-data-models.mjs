import { VILLAGE_KINDS, VILLAGE_STATUSES } from "./village.mjs";
const { NumberField, StringField } = foundry.data.fields;
const text = () => new StringField({ required: true, blank: true, initial: "" });
const number = (initial, min, max) => new NumberField({ required: true, integer: true, initial, min, ...(max === undefined ? {} : { max }) });

export class VillageDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    // Keep the legacy treasury key for saved-world compatibility; the sheet uses it for Prosperity progress.
    return { location: text(), description: text(), notes: text(), eventNotes: text(),
      prosperity: number(0, -10, 10), cycle: number(1, 1), day: number(1, 1, 10), treasury: number(0, 0) };
  }
}

export class VillageEntryDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: new StringField({ required: true, initial: "institution", choices: VILLAGE_KINDS }),
      status: new StringField({ required: true, initial: "active", choices: [...new Set(Object.values(VILLAGE_STATUSES).flatMap(Object.keys))] }),
      description: text(), category: text(), services: text(), steward: text(), npcId: text(),
      level: number(1, 1, 6), maxLevel: number(5, 1, 6), pendingLevel: number(0, 0, 6), readyCycle: number(0, 0),
      actorId: text(), role: text(), npcName: text(), relationship: text(), benefit: text(), benefitDescription: text(),
      reward: text(), due: text(),
      cryptBoon: text(),
      boonHolderId: text(), boonHolderName: text(), boonCycle: number(0, 0), boonUses: number(0, 0)
    };
  }
}
