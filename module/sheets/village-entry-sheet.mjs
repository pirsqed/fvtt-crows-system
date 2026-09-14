import { VILLAGE_ENTRY_TYPE, VILLAGE_LABELS, VILLAGE_STATUSES, validateVillageEntry } from "../village.mjs";

export class CrowsVillageEntrySheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["crows-village", "village-entry-window"], template: "systems/fvtt-crows-system/templates/village-entry-sheet.html",
      width: 580, height: 650, resizable: true, submitOnChange: false, closeOnSubmit: true
    });
  }

  async getData() {
    const context = await super.getData();
    const system = this.item.toObject(false).system;
    const people = Array.from(this.item.parent?.items ?? []).filter(i => i.type === VILLAGE_ENTRY_TYPE
      && (i.system.kind === "npc" || i.system.kind === "crow" && i.system.npcName));
    const npcOptions = people.map(i => ({ id: i.id, name: i.system.kind === "crow" ? i.system.npcName : i.name, selected: i.id === system.npcId }));
    if (system.npcId && !people.some(i => i.id === system.npcId)) npcOptions.push({ id: system.npcId, name: "Linked NPC unavailable", selected: true });
    const actors = game.actors.filter(a => a.visible && a.type !== "village");
    const actorOptions = actors.map(a => ({ id: a.id, name: a.name, selected: a.id === system.actorId }));
    if (system.actorId && !actors.some(a => a.id === system.actorId)) actorOptions.push({ id: system.actorId, name: "Linked actor unavailable", selected: true });
    return { ...context, item: this.item, system, editable: this.isEditable,
      kindLabel: VILLAGE_LABELS[system.kind], institution: system.kind === "institution", npc: system.kind === "npc",
      quest: system.kind === "quest", crow: system.kind === "crow", grave: system.kind === "grave", npcOptions, actorOptions,
      statuses: Object.entries(VILLAGE_STATUSES[system.kind] ?? {}).map(([key, name]) => ({ key, name, selected: key === system.status })) };
  }

  async _updateObject(event, formData) {
    if (!this.isEditable || !this.item.isOwner) throw new Error("You do not have permission to edit this record.");
    // Kind and linked Crow identity are fixed after creation; NPC links may be edited.
    delete formData["system.kind"];
    if (this.item.system.kind === "crow") delete formData["system.actorId"];
    const changes = foundry.utils.expandObject(formData);
    validateVillageEntry({ ...this.item.toObject(false).system, ...changes.system });
    return super._updateObject(event, formData);
  }
}
