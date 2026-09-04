export class CrowsItemSheet extends ItemSheet {
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
    context.editable = this.isEditable;
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

  activateListeners(html) {
    super.activateListeners(html);

    html.find('.greed-tier-btn').click(async (ev) => {
      ev.preventDefault();
      const val = parseInt(ev.currentTarget.dataset.greed, 10) || 0;
      await this.item.update({ "system.greedBonus": val });
    });
  }
}
