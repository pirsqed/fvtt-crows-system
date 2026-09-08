import { rollPowerRoll } from "../power-roll.mjs";
import { CrowsLoot } from "../loot.mjs";

/**
 * Loot container sheet: usable by players (observers) to take items, coins, or attempt a lock,
 * and by the GM to stock, lock, and scatter the container.
 */
export class CrowsLootSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["crows", "sheet", "actor", "loot"],
      template: "systems/fvtt-crows-system/templates/loot-sheet.html",
      width: 580,
      height: 520,
      dragDrop: [{ dragSelector: ".item", dropSelector: null }]
    });
  }

  /** Observers may drag items out of and drop items into containers; the transfer engine enforces the rest. */
  _canDragStart() { return true; }
  _canDragDrop() { return true; }

  /**
   * FormApplication disables every button on a sheet the viewer can't edit. Players only ever observe
   * loot, so re-enable the buttons that act through the transfer engine (Take, coins, lock tests).
   */
  _disableFields(form) {
    super._disableFields(form);
    for (const btn of form.querySelectorAll("button.player-action")) {
      btn.disabled = btn.dataset.stayDisabled === "true";
    }
  }

  async getData() {
    const context = await super.getData();
    const actorData = this.actor.toObject(false);
    context.system = actorData.system;
    context.owner = this.actor.isOwner;
    context.editable = this.isEditable;
    context.isGM = game.user.isGM;
    context.items = this.actor.items.map(item => {
      const iObj = item.toObject();
      iObj.greedTier = item.greedTier;
      iObj.greedTierLabel = item.greedTierLabel;
      iObj.greedBonusGc = item.greedBonusGc;
      iObj.effectiveCost = item.effectiveCost;
      return iObj;
    });
    context.enrichedDescription = await TextEditor.enrichHTML(this.actor.system.description || "", { async: true });
    const type = actorData.system.containerType;
    context.typeLabel = { chest: "Chest", corpse: "Corpse", dropped_pack: "Dropped Pack", stash: "Stash", generic: "Ground Loot" }[type] || "Container";
    context.isLocked = !!actorData.system.locked;
    context.lockedForViewer = context.isLocked && !game.user.isGM;
    context.hasCoins = (Number(actorData.system.coins) || 0) > 0;
    context.isEmpty = context.items.length === 0 && !context.hasCoins;
    const acting = CrowsLoot.actingActor();
    context.actingName = acting?.name ?? null;
    context.inReach = acting ? CrowsLoot.withinReach(acting, this.actor) : true;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Available to anyone who can see the sheet
    html.find(".item-take").click(this._onTakeItem.bind(this));
    html.find(".btn-take-all").click(this._onTakeAll.bind(this));
    html.find(".btn-take-coins").click(this._onTakeCoins.bind(this));
    html.find(".btn-pick-lock").click(ev => this._onLockTest(ev, "agility", "Pick the Lock"));
    html.find(".btn-force-open").click(ev => this._onLockTest(ev, "strength", "Force It Open"));
    html.find(".btn-toggle-lock").click(async ev => {
      ev.preventDefault();
      await CrowsLoot.setLocked(this.actor, !this.actor.system.locked);
    });

    if (!this.isEditable) return;

    html.find(".btn-scatter").click(this._onScatterOntoMap.bind(this));
    html.find(".item-greed-sticker").click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const item = this.actor.items.get($(ev.currentTarget).closest(".item").data("itemId"));
      if (item?.cycleGreedBonus) await item.cycleGreedBonus();
    });
    html.find(".item-edit").click(ev => {
      const item = this.actor.items.get($(ev.currentTarget).closest(".item").data("itemId"));
      if (item) item.sheet.render(true);
    });
    html.find(".item-delete").click(ev => {
      const itemId = $(ev.currentTarget).closest(".item").data("itemId");
      if (itemId) this.actor.deleteEmbeddedDocuments("Item", [itemId]);
    });
    html.find(".item-create").click(this._onItemCreate.bind(this));
  }

  _target() {
    const actor = CrowsLoot.actingActor();
    if (!actor) ui.notifications.warn("Select your character's token (or assign a character to your user) before taking loot.");
    return actor;
  }

  async _onItemCreate(event) {
    event.preventDefault();
    return Item.create({ name: "New Item", type: "equipment", system: { location: "ground" } }, { parent: this.actor });
  }

  async _onTakeItem(event) {
    event.preventDefault();
    const item = this.actor.items.get($(event.currentTarget).closest(".item").data("itemId"));
    const target = this._target();
    if (!item || !target) return;
    await CrowsLoot.transfer(item, target);
  }

  async _onTakeAll(event) {
    event.preventDefault();
    const target = this._target();
    if (!target) return;
    if (this.actor.system.locked && !game.user.isGM) return ui.notifications.warn(`${this.actor.name} is locked.`);
    for (const item of Array.from(this.actor.items)) {
      await CrowsLoot.transfer(item, target);
    }
    if ((Number(this.actor.system.coins) || 0) > 0) await CrowsLoot.takeCoins(this.actor, target);
  }

  async _onTakeCoins(event) {
    event.preventDefault();
    const target = this._target();
    if (!target) return;
    await CrowsLoot.takeCoins(this.actor, target);
  }

  /** Roll the acting crow's Agility (pick) or Strength (force) test against the lock. */
  async _onLockTest(event, charKey, label) {
    event.preventDefault();
    const actor = this._target();
    if (!actor) return;
    if (!CrowsLoot.withinReach(actor, this.actor)) return ui.notifications.warn(`${actor.name} is too far from ${this.actor.name}.`);
    const bonus = Number(actor.system.characteristics?.[charKey]) || 0;
    const content = `
      <form class="crows-dialog-form">
        <div class="form-group circumstance-group">
          <label class="group-label"><i class="fas fa-balance-scale"></i> Circumstance</label>
          <div class="radio-list">
            <label class="radio-option opt-double-edge"><input type="radio" name="circumstance" value="double-edge" /><span class="opt-title">Double Edge</span><span class="opt-desc">+1 Outcome Tier</span></label>
            <label class="radio-option opt-edge"><input type="radio" name="circumstance" value="edge" /><span class="opt-title">Edge</span><span class="opt-desc">+2 to roll</span></label>
            <label class="radio-option opt-standard"><input type="radio" name="circumstance" value="standard" checked /><span class="opt-title">Standard Roll</span><span class="opt-desc">Normal (2d10)</span></label>
            <label class="radio-option opt-bane"><input type="radio" name="circumstance" value="bane" /><span class="opt-title">Bane</span><span class="opt-desc">-2 to roll (e.g. no lockpicks)</span></label>
            <label class="radio-option opt-double-bane"><input type="radio" name="circumstance" value="double-bane" /><span class="opt-title">Double Bane</span><span class="opt-desc">-1 Outcome Tier</span></label>
          </div>
        </div>
        <div class="form-group">
          <label for="lock-mod"><i class="fas fa-sliders-h"></i> Modifier (lockpicks, tools)</label>
          <input type="number" id="lock-mod" value="0" />
        </div>
      </form>`;
    new Dialog({
      title: `${label}: ${this.actor.name} (${charKey.capitalize()})`,
      content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>', label: "Roll",
          callback: async (dHtml) => {
            const circumstance = dHtml.find('input[name="circumstance"]:checked').val() || "standard";
            const mod = parseInt(dHtml.find("#lock-mod").val(), 10) || 0;
            const { roll, tier, isCrit, isDoom } =
              await rollPowerRoll({ modifier: bonus + mod, circumstance });
            let outcome, cls;
            if (tier === 3) {
              outcome = `${this.actor.name} opens.`; cls = "crit";
              await CrowsLoot.setLocked(this.actor, false);
            } else if (tier === 2) {
              outcome = "Partial success: the Ref decides whether it opens at a cost (noise, broken tools, time).";
              cls = "success";
            } else {
              outcome = isDoom ? "Doom! Something goes badly wrong with the lock." : "The lock holds. Circumstances must change before trying again.";
              cls = isDoom ? "doom" : "failure";
            }
            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor }),
              flavor: `${actor.name}: ${label}`,
              content: `
                <div class="crows-roll-card">
                  <div class="card-header"><i class="fas fa-lock"></i> ${label} (${charKey.capitalize()})</div>
                  <div class="card-body">
                    <div class="dice-roll-total">Result: <strong>${roll.total}</strong> <span class="formula">(${roll.result})</span></div>
                    <div class="outcome ${cls}">Tier ${tier}${isCrit ? " (Crit)" : ""}${isDoom ? " (Doom)" : ""}</div>
                    <div class="damage-block">${outcome}</div>
                  </div>
                </div>`
            });
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "roll"
    }).render(true);
  }

  async _onScatterOntoMap(event) {
    event.preventDefault();
    const items = this.actor.items.map(i => i.toObject());
    if (!items.length) return ui.notifications.info("Nothing inside to scatter.");
    const token = this.actor.token || this.actor.getActiveTokens()[0];
    const pos = token ? { x: token.x, y: token.y } : { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y };
    await CrowsLoot.scatterItemsOnCanvas(items, { x: pos.x, y: pos.y, scene: canvas.scene });
    await this.actor.deleteEmbeddedDocuments("Item", this.actor.items.map(i => i.id));
    await CrowsLoot.cleanupIfEmpty(this.actor);
  }

  /** Drops onto the container: stow an item from another actor. */
  async _onDropItem(event, data) {
    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;
    if (item.parent?.uuid === this.actor.uuid) return false;
    if (item.parent) return CrowsLoot.transfer(item, this.actor);
    if (!this.isEditable) return false;
    return this._onDropItemCreate(item.toObject());
  }
}
