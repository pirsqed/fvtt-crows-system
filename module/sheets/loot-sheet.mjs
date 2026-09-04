import { CrowsLoot } from "../loot.mjs";

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

  async getData() {
    const context = await super.getData();
    const actorData = this.actor.toObject(false);
    context.system = actorData.system;
    context.owner = this.actor.isOwner;
    context.editable = this.isEditable;
    
    // Map items with greed bonus derived properties
    context.items = this.actor.items.map(item => {
      const iObj = item.toObject();
      iObj.greedTier = item.greedTier;
      iObj.greedTierLabel = item.greedTierLabel;
      iObj.greedBonusGc = item.greedBonusGc;
      iObj.effectiveCost = item.effectiveCost;
      return iObj;
    });

    context.enrichedDescription = await TextEditor.enrichHTML(this.actor.system.description || "", {async: true});
    
    context.isChest = actorData.system.containerType === "chest";
    context.isCorpse = actorData.system.containerType === "corpse";
    context.isDroppedPack = actorData.system.containerType === "dropped_pack";

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Take Single Item
    html.find('.item-take').click(this._onTakeItem.bind(this));

    // Scatter onto Map
    html.find('.btn-scatter').click(this._onScatterOntoMap.bind(this));

    // Take All Items
    html.find('.btn-take-all').click(this._onTakeAll.bind(this));

    // Quick-cycle Greed Bonus on click
    html.find('.item-greed-sticker').click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = $(ev.currentTarget).closest(".item");
      const item = this.actor.items.get(li.data("itemId") || $(ev.currentTarget).data("itemId"));
      if (item && item.cycleGreedBonus) {
        await item.cycleGreedBonus();
      }
    });

    // Item CRUD
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).closest(".item");
      const item = this.actor.items.get(li.data("itemId"));
      if (item) item.sheet.render(true);
    });

    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).closest(".item");
      const itemId = li.data("itemId");
      if (itemId) this.actor.deleteEmbeddedDocuments("Item", [itemId]);
    });

    html.find('.item-create').click(this._onItemCreate.bind(this));
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const data = {
      name: "New Item",
      type: "equipment",
      system: {
        location: "backpack1"
      }
    };
    return await Item.create(data, { parent: this.actor });
  }

  async _onTakeItem(event) {
    event.preventDefault();
    const li = $(event.currentTarget).closest(".item");
    const item = this.actor.items.get(li.data("itemId"));
    if (!item) return;

    // Determine target actor (controlled token, or primary user character)
    const targetActor = canvas.tokens?.controlled[0]?.actor || game.user.character;
    if (!targetActor) {
      ui.notifications.warn("Please select your character token before taking an item.");
      return;
    }

    const itemData = item.toObject();
    
    // Find first available slot in Hand -> Belt -> Backpack
    const occupied = targetActor.items.map(i => i.system?.location);
    const freeBelt = ["belt1", "belt2", "belt3", "belt4"].find(s => !occupied.includes(s));
    const freeHand = ["hand1", "hand2"].find(s => !occupied.includes(s));
    const freeBP = [1,2,3,4,5,6,7,8,9,10].map(n => `backpack${n}`).find(s => !occupied.includes(s));

    foundry.utils.setProperty(itemData, "system.location", freeBelt || freeHand || freeBP || "ground");

    await Item.create(itemData, { parent: targetActor });
    await item.delete();

    ui.notifications.info(`${targetActor.name} took ${item.name}.`);

    // If this loot actor has no more items and was an unlinked single-item token, delete the token
    if (this.actor.items.size === 0 && this.actor.isToken) {
      await this.actor.token.delete();
      this.close();
    }
  }

  async _onTakeAll(event) {
    event.preventDefault();
    const targetActor = canvas.tokens?.controlled[0]?.actor || game.user.character;
    if (!targetActor) {
      ui.notifications.warn("Please select your character token before looting.");
      return;
    }

    const items = this.actor.items.map(i => i.toObject());
    if (items.length === 0 && (!this.actor.system.coins || this.actor.system.coins === 0)) {
      ui.notifications.info("This container is empty!");
      return;
    }

    // Transfer coins
    if (this.actor.system.coins > 0) {
      const currentCoins = targetActor.system.coins || 0;
      await targetActor.update({ "system.coins": currentCoins + this.actor.system.coins });
      await this.actor.update({ "system.coins": 0 });
    }

    // Transfer items
    const occupied = targetActor.items.map(i => i.system?.location);
    const slots = [
      "belt1", "belt2", "belt3", "belt4",
      "hand1", "hand2",
      "backpack1", "backpack2", "backpack3", "backpack4", "backpack5",
      "backpack6", "backpack7", "backpack8", "backpack9", "backpack10"
    ];

    for (const itemData of items) {
      const freeSlot = slots.find(s => !occupied.includes(s));
      if (freeSlot) {
        occupied.push(freeSlot);
        foundry.utils.setProperty(itemData, "system.location", freeSlot);
      } else {
        foundry.utils.setProperty(itemData, "system.location", "ground");
      }
    }

    await Item.createDocuments(items, { parent: targetActor });
    await this.actor.deleteEmbeddedDocuments("Item", this.actor.items.map(i => i.id));

    ui.notifications.info(`${targetActor.name} looted everything from ${this.actor.name}!`);

    // Close and remove token if unlinked
    if (this.actor.isToken) {
      await this.actor.token.delete();
      this.close();
    }
  }

  async _onScatterOntoMap(event) {
    event.preventDefault();
    const items = this.actor.items.map(i => i.toObject());
    if (items.length === 0) {
      ui.notifications.info("No items inside to scatter!");
      return;
    }

    // Find container token position on scene
    const token = this.actor.token || this.actor.getActiveTokens()[0];
    const pos = token ? { x: token.x, y: token.y } : { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y };

    await CrowsLoot.scatterItemsOnCanvas(items, {
      x: pos.x,
      y: pos.y,
      scene: canvas.scene
    });

    // Delete items from container
    await this.actor.deleteEmbeddedDocuments("Item", this.actor.items.map(i => i.id));

    ChatMessage.create({
      content: `
        <div class="crows-roll-card">
          <div class="card-header weapon">
            <i class="fas fa-sparkles"></i> Loot Scattered!
          </div>
          <div class="card-body">
            <strong>${this.actor.name}</strong> was opened and scattered <strong>${items.length} items</strong> across the floor!
          </div>
        </div>
      `
    });

    // If it was a dropped pack or single token, delete container token
    if (this.actor.isToken) {
      await this.actor.token.delete();
      this.close();
    }
  }
}
