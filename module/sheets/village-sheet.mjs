import { VILLAGE_ENTRY_TYPE, VILLAGE_LABELS, VILLAGE_STATUSES, escapeVillageText, newVillageEntry,
  startingInstitutions, villageEntries, salePercentage, addCrowToVillage, rollVillageEvent, crowVillageEntry } from "../village.mjs";

const enrich = text => TextEditor.enrichHTML(escapeVillageText(text).replace(/\r?\n/g, "<br>"), { async: true });

export class CrowsVillageSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["crows-village"], template: "systems/fvtt-crows-system/templates/village-sheet.html",
      width: 960, height: 780, resizable: true, closeOnSubmit: false, submitOnChange: true,
      tabs: [{ navSelector: ".village-tabs", contentSelector: ".village-body", initial: "overview" }],
      dragDrop: [{ dragSelector: null, dropSelector: ".village-form" }]
    });
  }

  async getData() {
    const context = await super.getData();
    const system = this.actor.toObject(false).system;
    const groups = villageEntries(this.actor.items);
    const view = async item => {
      const data = item.toObject(false), s = data.system;
      const linked = s.actorId ? game.actors.get(s.actorId) : null;
      return { ...data, id: item.id, displayName: s.kind === "crow" && linked?.visible ? linked.name : item.name,
        statusLabel: VILLAGE_STATUSES[s.kind]?.[s.status] ?? s.status,
        canOpenActor: !!linked?.visible, missingActor: !!s.actorId && !linked?.visible,
        isHome: linked?.visible && linked.flags?.["fvtt-crows-system"]?.homeVillageId === this.actor.id,
        canSetHome: linked?.isOwner && linked.flags?.["fvtt-crows-system"]?.homeVillageId !== this.actor.id,
        descriptionHTML: await enrich(s.description), servicesHTML: await enrich(s.services),
        relationshipHTML: await enrich(s.relationship), benefitHTML: await enrich(s.benefitDescription),
        ready: !!s.pendingLevel && s.readyCycle > 0 && s.readyCycle <= system.cycle };
    };
    const institutions = await Promise.all(groups.institution.map(view));
    const crows = await Promise.all(groups.crow.map(view));
    const npcs = await Promise.all(groups.npc.map(view));
    const connections = crows.filter(c => c.system.npcName.trim()).map(c => ({ ...c, crowName: c.displayName,
      displayName: c.system.npcName, isConnection: true }));
    const people = [...npcs, ...connections].sort((a, b) => a.displayName.localeCompare(b.displayName));
    const quests = await Promise.all(groups.quest.map(view));
    const personNames = new Map(people.map(npc => [npc.id, npc.displayName]));
    for (const institution of institutions) institution.stewardName = personNames.get(institution.system.npcId)
      ?? (institution.system.npcId ? "Linked NPC unavailable" : institution.system.steward);
    for (const quest of quests) quest.issuerName = personNames.get(quest.system.npcId)
      ?? (quest.system.npcId ? "Linked NPC unavailable" : "");
    return { ...context, actor: this.actor, system, editable: this.isEditable, institutions, crows, people, quests,
      salePercent: salePercentage(system.prosperity), prosperityLabel: system.prosperity > 0 ? `+${system.prosperity}` : String(system.prosperity),
      activeQuests: quests.filter(q => ["open", "active"].includes(q.system.status)).length,
      descriptionHTML: await enrich(system.description), notesHTML: await enrich(system.notes), eventNotesHTML: await enrich(system.eventNotes),
      hasStarterInstitutions: startingInstitutions(this.actor.items).length > 0 };
  }

  _canDragDrop() { return this.isEditable; }
  _canDragStart() { return false; }

  _disableFields(form) {
    super._disableFields(form);
    for (const button of form.querySelectorAll("button.village-view-action")) button.disabled = false;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("[data-village-action]").on("click", event => {
      event.preventDefault();
      this._handleAction(event.currentTarget.dataset).catch(error => ui.notifications.error(error.message));
    });
  }

  async _handleAction({ villageAction: action, kind, entryId }) {
    const item = entryId ? this.actor.items.get(entryId) : null;
    if (action === "open-actor") {
      const linked = item?.system.actorId ? game.actors.get(item.system.actorId) : null;
      if (linked?.visible) return linked.sheet.render(true);
      return ui.notifications.warn("The linked actor is unavailable.");
    }
    if (action === "view" && item?.type === VILLAGE_ENTRY_TYPE) return item.sheet.render(true);
    if (!this.isEditable || !this.actor.isOwner) throw new Error("You do not have permission to edit this village.");
    if (this._busy) return;
    this._busy = true;
    try {
      await this.submit({ preventClose: true });
      if (action === "add") {
        if (kind === "crow") return await this._chooseCrow();
        const [created] = await this.actor.createEmbeddedDocuments("Item", [newVillageEntry(kind)]);
        created?.sheet.render(true);
      } else if (action === "set-home" && item?.system.kind === "crow") {
        const crow = game.actors.get(item.system.actorId);
        if (!crow?.isOwner) throw new Error("You must own the Crow to change its home village.");
        if (!await Dialog.confirm({ title: "Set home village", content: `<p>Set ${escapeVillageText(this.actor.name)} as ${escapeVillageText(crow.name)}'s home village? Existing records in other villages are kept.</p>` })) return;
        await crow.setFlag("fvtt-crows-system", "homeVillageId", this.actor.id);
        if (!item.system.npcName) {
          const s = crowVillageEntry(crow).system;
          await item.update({ "system.npcName": s.npcName, "system.relationship": s.relationship,
            "system.benefit": s.benefit, "system.benefitDescription": s.benefitDescription });
        }
        this.render(false);
      } else if (action === "starting") {
        const entries = startingInstitutions(this.actor.items);
        if (entries.length) await this.actor.createEmbeddedDocuments("Item", entries);
      } else if (action === "delete" && item?.type === VILLAGE_ENTRY_TYPE) {
        if (!await Dialog.confirm({ title: "Remove village record",
          content: `<p>Remove <strong>${escapeVillageText(item.name)}</strong> from this village? Linked actors are kept.</p>` })) return;
        await this.actor.deleteEmbeddedDocuments("Item", [item.id]);
      } else if (action === "apply-level" && item?.system.kind === "institution") {
        const s = item.system;
        if (!s.pendingLevel || !s.readyCycle || s.readyCycle > this.actor.system.cycle) throw new Error("This level change is not due yet.");
        await item.update({ "system.level": s.pendingLevel, "system.pendingLevel": 0, "system.readyCycle": 0,
          ...(s.status === "planned" ? { "system.status": "active" } : {}) });
      } else if (action === "event") await rollVillageEvent(this.actor);
    } finally { this._busy = false; }
  }

  async _chooseCrow() {
    const linked = new Set(villageEntries(this.actor.items).crow.map(item => item.system.actorId));
    const crows = game.actors.filter(actor => actor.type === "crow" && actor.visible && !linked.has(actor.id));
    if (!crows.length) return ui.notifications.info("No unlinked Crows are available. Create a Crow first, or drag one onto this sheet.");
    return Dialog.prompt({ title: "Add Crow to village", label: "Add Crow",
      content: `<form><label>Crow <select name="crowId">${crows.map(crow => `<option value="${escapeVillageText(crow.id)}">${escapeVillageText(crow.name)}</option>`).join("")}</select></label>
        <p>The NPC connection is copied only when this is the Crow's home village. After adding a Crow, use Set as home to choose this village.</p></form>`,
      callback: async html => {
        const crow = game.actors.get(html.find("[name=crowId]").val());
        return addCrowToVillage(this.actor, crow);
      }
    });
  }

  async _onDrop(event) {
    event.preventDefault();
    if (!this.isEditable || this._busy) return;
    this._busy = true;
    try {
      const data = TextEditor.getDragEventData(event);
      if (data.type !== "Actor") return ui.notifications.warn("Drop a Crow actor to add it to this village.");
      const crow = await Actor.fromDropData(data);
      if (!crow || crow.isToken || !game.actors.get(crow.id)) throw new Error("Use a Crow from the Actors directory.");
      await this.submit({ preventClose: true });
      await addCrowToVillage(this.actor, crow);
    } catch (error) { ui.notifications.error(error.message); }
    finally { this._busy = false; }
  }
}
