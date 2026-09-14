import { CrowsLoot } from "../loot.mjs";
import { withPersistentScroll } from "./persistent-scroll.mjs";

/** A scene actor represents one ordinary item, never a separate inventory. */
export class CrowsLootSheet extends withPersistentScroll(ActorSheet) {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["crows", "sheet", "actor", "loot"], template: "systems/fvtt-crows-system/templates/loot-sheet.html",
      width: 450, height: 380, dragDrop: [{ dragSelector: ".scene-item", dropSelector: null }]
    });
  }
  get rootItem() { return this.actor.items.size === 1 ? this.actor.items.contents[0] : null; }
  async _render(force, options = {}) {
    if (options.token) this._inspectionToken = options.token;
    return super._render(force, options);
  }
  _canUserView(user) {
    return super._canUserView(user) || !!(this._inspectionToken?.actor === this.actor && CrowsLoot.canInspectToken(this._inspectionToken));
  }
  async close(options) { this._inspectionToken = null; return super.close(options); }
  async getData() {
    const context = await super.getData(), root = this.rootItem;
    return { ...context, isGM: game.user.isGM, root, system: this.actor.system,
      publicName: this.actor.name, publicImage: root?.img ?? this.actor.img,
      canPickup: !!root && CrowsLoot.canPickUp(this.actor),
      enrichedDescription: await TextEditor.enrichHTML(root?.system.description || this.actor.system.description || "", { async: true, secrets: false }) };
  }
  _canDragStart() { return !!this.rootItem && CrowsLoot.canPickUp(this.actor); }
  _canDragDrop() { return game.user.isGM; }
  _disableFields(form) {
    super._disableFields(form);
    for (const button of form.querySelectorAll('.player-action')) button.disabled = false;
  }
  activateListeners(html) {
    super.activateListeners(html);
    html.find('.pickup-object').on('click', async () => {
      const target = CrowsLoot.actingActor();
      if (!target) return ui.notifications.warn('Select your character first.');
      if (this.rootItem) await CrowsLoot.transfer(this.rootItem, target);
    });
    if (!game.user.isGM) return;
    html.find('.edit-object').on('click', () => this.rootItem?.sheet.render(true));
    html.find('.item-create').on('click', () => {
      if (!this.actor.items.size) return this.actor.createEmbeddedDocuments('Item', [{ name: this.actor.name, type: 'equipment', img: this.actor.img, system: { description: this.actor.system.description } }]);
    });
  }
  _onDragStart(event) {
    if (this._canDragStart()) event.dataTransfer.setData('text/plain', JSON.stringify(this.rootItem.toDragData()));
  }
  async _onDropItem(event, data) {
    if (!game.user.isGM || this.actor.items.size) return false;
    const item = await Item.implementation.fromDropData(data);
    if (item?.type !== 'equipment') return false;
    if (item.parent) return CrowsLoot.transfer(item, this.actor);
    const copy = item.toObject(); delete copy._id; copy.system.location = 'ground';
    return this.actor.createEmbeddedDocuments('Item', [copy]);
  }
  async _updateObject(event, data) { if (game.user.isGM) return super._updateObject(event, data); }
}
