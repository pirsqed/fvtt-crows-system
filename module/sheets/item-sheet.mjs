import { beltCapacity } from "../inventory.mjs";
import { showSpellcastDialog } from "../spellcasting.mjs";
import { withPersistentScroll } from "./persistent-scroll.mjs";

export class CrowsItemSheet extends withPersistentScroll(ItemSheet) {
  get template() {
    const type = this.item.type === 'equipment' ? 'item' : this.item.type;
    return `systems/fvtt-crows-system/templates/${type}-sheet.html`;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["crows", "sheet", "item"],
      width: 520,
      height: 600,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "details" }]
    });
  }

  async getData() {
    const context = await super.getData();
    const itemData = this.item.toObject(false);
    context.system = itemData.system;
    context.owner = this.item.isOwner;
    context.hasCaster = !!this.item.parent;
    context.locationReport = this._locationReport();
    context.editable = this.isEditable;
    context.isGM = game.user.isGM;
    if (this.item.type === 'attack') {
      context.enrichedNotes = await TextEditor.enrichHTML(this.item.system.notes || "", {async: true});
    } else {
      context.enrichedDescription = await TextEditor.enrichHTML(this.item.system.description || "", {async: true});
      context.enrichedActionText = await TextEditor.enrichHTML(this.item.system.consumable?.actionText || "", {async: true});
    }

    context.greedTier = this.item.greedTier;
    context.greedTierLabel = this.item.greedTierLabel;
    context.greedBonusGc = this.item.greedBonusGc;
    context.effectiveCost = this.item.effectiveCost;

    return context;
  }

  _locationReport() {
    const actor = this.item.parent;
    if (!actor || this.item.type !== "equipment") return "";
    if (!["crow", "monster"].includes(actor.type)) return "";
    const location = this.item.system.location;
    const size = Math.max(1, parseInt(this.item.system.slots, 10) || 1);
    let label = "";
    if (location === "hand1") label = size >= 2 ? "Both hands" : "Hand 1";
    else if (location === "hand2") label = "Hand 2";
    else {
      const match = /^(belt|backpack|slot)([1-9]\d*)$/.exec(location ?? "");
      if (match) {
        const [, area, number] = match;
        const start = Number(number);
        const limit = actor.type === "monster" ? (area === "belt" ? 0 : Number(actor.system.slots) || 0)
          : area === "belt" ? beltCapacity(actor) : area === "backpack" ? 10 : 0;
        if (start > limit) return "";
        const end = Math.min(limit, start + size - 1);
        const prefix = actor.type === "monster" ? "Inventory" : area === "belt" ? "Belt" : "Backpack";
        label = start === end ? `${prefix} slot ${start}` : `${prefix} slots ${start}–${end}`;
      } else if (actor.type === "crow") {
        label = { head: "Head", neck: "Neck", waist: "Waist", gloves: "Arms / Hands",
          ring: "Finger / Ring", boots: "Feet / Boots" }[location] ?? "";
      }
    }
    return label ? `${actor.name}: ${label}` : "";
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('.item-cast').click(event => {
      event.preventDefault();
      showSpellcastDialog(this.item.parent, this.item);
    });
    html.find('.greed-tier-btn').click(async (ev) => {
      ev.preventDefault();
      const val = parseInt(ev.currentTarget.dataset.greed, 10) || 0;
      await this.item.update({ "system.greedBonus": val });
    });
  }

}
