import { _onQuantityAdjust, _onQuantityInput, _onPostTraitToChat } from "./inventory-actions.mjs";
import { requestUsageDice } from "./inventory-actions.mjs";
import { bindSupplyControls } from "../supplies.mjs";
import { renderCircumstanceSelector } from "../roll-dialog.mjs";
import { canEquip, woundCapacity, woundMap, woundUpdate } from "../equipment-rules.mjs";
import { showSpellcastDialog } from "../spellcasting.mjs";
import { canStack, goldStack, restoreUsageDice } from "../inventory.mjs";
import { showWeaponAttackDialog, showStatBlockAttackDialog } from "../attacks.mjs";
import { rollPowerRoll } from "../power-roll.mjs";
import { CrowsLoot } from "../loot.mjs";
import { withPersistentScroll } from "./persistent-scroll.mjs";

export class CrowsMonsterSheet extends withPersistentScroll(ActorSheet) {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["crows", "sheet", "actor", "monster"],
      template: "systems/fvtt-crows-system/templates/monster-sheet.html",
      width: 780,
      height: 680,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "attacks" }],
      dragDrop: [{ dragSelector: ".item, .slot-card.occupied, .storage-item", dropSelector: null }]
    });
  }

  async getData() {
    const context = await super.getData();
    const actorData = this.actor.toObject(false);
    context.system = actorData.system;
    for (const key of ["totalWounds", "woundCapacity", "derivedSpeed", "isDead"]) {
      context.system[key] = this.actor.system[key];
    }
    context.owner = this.actor.isOwner;
    context.editable = this.isEditable;
    
    // Pass attacks and traits specifically
    const items = this.actor.items.map(item => {
      const iObj = item.toObject(false);
      iObj.greedTier = item.greedTier;
      iObj.greedTierLabel = item.greedTierLabel;
      iObj.greedBonusGc = item.greedBonusGc;
      iObj.effectiveCost = item.effectiveCost;
      iObj.stackPercent = item.stackPercent;
      return iObj;
    });

    context.attacks = items.filter(i => i.type === 'attack');
    context.traits = items.filter(i => i.type === 'trait');
    
    const equipmentItems = items.filter(i => i.type === 'equipment');
    context.equipmentCount = equipmentItems.length;

    // 2. Dynamic Slots Grid (1 to system.slots)
    const maxSlots = Math.max(0, parseInt(this.actor.system.slots, 10) || 0);
    context.maxSlots = maxSlots;
    context.hasSlots = maxSlots > 0;
    context.hasWounds = woundCapacity(this.actor) > 0;
    const wounds = woundMap(this.actor);
    context.woundSlots = Array.from({ length: woundCapacity(this.actor) }, (_, i) => ({
      number: i + 1, wounded: !!wounds[`slot${i + 1}`]
    }));

    const anchorItemsBySlot = {};
    for (const item of equipmentItems) {
      const loc = item.system.location;
      if (loc && (loc.startsWith("backpack") || loc.startsWith("slot"))) {
        const match = loc.match(/^(?:backpack|slot)(\d+)$/);
        if (match) {
          const slotNum = parseInt(match[1], 10);
          anchorItemsBySlot[slotNum] = item;
        }
      }
    }

    context.inventorySlots = [];
    let usedSlotsCount = 0;
    let i = 1;
    while (i <= maxSlots) {
      const slotId = `backpack${i}`;
      const item = anchorItemsBySlot[i];

      if (item) {
        const slotsCount = Math.max(1, parseInt(item.system.slots, 10) || 1);
        const endNum = Math.min(maxSlots, i + slotsCount - 1);
        const actualSpan = Math.max(1, endNum - i + 1);

        usedSlotsCount += slotsCount;

        context.inventorySlots.push({
          id: slotId,
          slotNum: i,
          label: slotsCount > 1 ? `Slots ${i}–${endNum}` : `Slot ${i}`,
          item: item,
          colSpan: actualSpan,
          isMergedSpan: slotsCount > 1,
          spanStart: i,
          spanEnd: endNum,
          spanTotal: slotsCount
        });

        i = endNum + 1;
      } else {
        // Empty Slot
        context.inventorySlots.push({
          id: slotId,
          slotNum: i,
          label: `Slot ${i}`,
          item: null,
          colSpan: 1,
          isMergedSpan: false
        });
        i++;
      }
    }

    for (const slot of context.inventorySlots) {
      slot.isWounded = Array.from({ length: slot.colSpan }, (_, offset) => slot.slotNum + offset)
        .some(n => wounds[`slot${n}`]);
    }
    context.usedSlotsCount = usedSlotsCount;

    // 3. Ground & Unslotted / Storage Items
    context.inventoryList = {
      ground: equipmentItems.filter(i => i.system.location === 'ground'),
      stash: equipmentItems.filter(i => i.system.location === 'stash' || (!i.system.location?.startsWith('backpack') && !i.system.location?.startsWith('slot') && i.system.location !== 'ground'))
    };

    // 4. Derived stats
    context.coinSlots = Math.ceil((Number(this.actor.system.coins) || 0) / 250);
    context.totalAD = this.actor.system.totalAD || 0;

    context.enrichedDescription = await TextEditor.enrichHTML(this.actor.system.description || "", {async: true});

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    bindSupplyControls(html, this.actor);

    // Roll characteristic test (Agility, Mind, Strength)
    html.find('.rollable-characteristic').click(this._onRollCharacteristic.bind(this));

    // Roll attack (Monster attack item)
    html.find('.rollable-attack').click(this._onRollAttack.bind(this));

    // Roll weapon attack from equipment
    html.find('.item-attack').click(this._onRollWeaponAttack.bind(this));

    // Roll Usage Dice on consumable equipment
    html.find('.item-ud-roll').click(this._onRollUsageDice.bind(this));
    html.find('.item-ud-restore').click(event => restoreUsageDice(this.actor, event));
    html.find('.item-cast').click(event => {
      event.preventDefault(); event.stopPropagation();
      showSpellcastDialog(this.actor, this.actor.items.get(event.currentTarget.dataset.itemId));
    });

    // Trait chat sharing
    html.find('.trait-post-chat').click(this._onPostTraitToChat.bind(this));

    // AD Manager Modal & Stepper
    html.find('.armor-ad, .open-ad-manager').click(this._onOpenADManagerDialog.bind(this));
    html.find('.armor-equip-toggle').click(this._onToggleArmorEquip.bind(this));
    html.find('.armor-ad-plus').click(this._onAdjustArmorAD.bind(this, 1));
    html.find('.armor-ad-minus').click(this._onAdjustArmorAD.bind(this, -1));

    // Quick set slots buttons (when 0 slots)
    html.find('.btn-quick-slots').click(async ev => {
      ev.preventDefault();
      const slotsVal = parseInt($(ev.currentTarget).data("slots"), 10) || 0;
      await this.actor.update({ "system.slots": slotsVal });
    });

    if (!this.isEditable) return;

    html.find('[data-npc-expertise-action]').click(event => this._onExpertiseAction(event));
    html.find('[data-npc-expertise-field]').on('change', event => this._onExpertiseAction(event));

    html.find('.companion-wound-toggle').click(async event => {
      event.preventDefault();
      if (!this.actor.isOwner) return;
      const n = Number(event.currentTarget.dataset.slotNum);
      if (!Number.isInteger(n) || n < 1 || n > woundCapacity(this.actor)) return;
      const map = woundMap(this.actor);
      map[`slot${n}`] = !map[`slot${n}`];
      await this.actor.update(woundUpdate(this.actor, map));
    });

    // Item controls
    const resolveItemId = (ev) => {
      const target = $(ev.currentTarget);
      return target.data("itemId") 
        || target.closest("[data-item-id]").data("itemId")
        || target.closest(".slot-card").find("[data-item-id]").data("itemId")
        || target.closest(".slot-card").data("itemId")
        || target.closest(".storage-item").data("itemId")
        || target.closest(".item").data("itemId");
    };

    html.find('.item-edit').click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const itemId = resolveItemId(ev);
      const item = this.actor.items.get(itemId);
      if (item) item.sheet.render(true);
    });

    html.find('.item-delete').click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const itemId = resolveItemId(ev);
      if (itemId) {
        await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
      }
    });

    html.find('.item-greed-sticker').click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const itemId = resolveItemId(ev);
      const item = this.actor.items.get(itemId);
      if (item && item.cycleGreedBonus) {
        await item.cycleGreedBonus();
      }
    });

    html.find('.item-qty-plus').click(this._onQuantityAdjust.bind(this, 1));
    html.find('.item-qty-minus').click(this._onQuantityAdjust.bind(this, -1));
    html.find('.item-qty-input').on('change', this._onQuantityInput.bind(this));
    html.find('.item-qty-input').on('keydown', ev => { if (ev.key === 'Enter') ev.target.blur(); });

    html.find('.item-create').click(this._onItemCreate.bind(this));
  }

  async _onExpertiseAction(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isEditable || !this.actor.isOwner) return;
    const target = event.currentTarget;
    const { npcExpertiseAction: action, npcExpertiseField: field, expertiseId } = target.dataset;
    const expertises = (this.actor.system.customExpertises ?? []).map(entry => ({ ...entry }));
    const entry = expertises.find(entry => entry.id === expertiseId);
    if (action === "add") {
      expertises.push({ id: foundry.utils.randomID(), name: "New Expertise", notes: "", value: 1, max: 1 });
    } else if (action === "recover") {
      for (const expertise of expertises) expertise.value = expertise.max;
    } else if (!entry) {
      return;
    } else if (action === "delete") {
      expertises.splice(expertises.indexOf(entry), 1);
    } else if (action === "spend") {
      if (entry.value <= 0) return;
      entry.value -= 1;
    } else if (field === "name" || field === "notes") {
      entry[field] = target.value.trim() || (field === "name" ? "New Expertise" : "");
    } else if (field === "value" || field === "max") {
      const value = Number(target.value);
      if (!Number.isFinite(value)) return this.render(false);
      entry[field] = Math.max(0, Math.floor(value));
      entry.value = Math.min(entry.value, entry.max);
    } else {
      return;
    }
    await this.actor.update({ "system.customExpertises": expertises });
  }

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type || "attack";
    const location = header.dataset.location || "backpack1";
    
    let itemData = {
      name: `New ${type.capitalize()}`,
      type: type,
      system: {}
    };

    if (type === "equipment") {
      itemData.img = "icons/svg/item-bag.svg";
      itemData.system = { location: location };
    } else if (type === "trait") {
      itemData.img = "icons/skills/trades/academics-study-reading-book.webp";
      itemData.system = {
        tree: "General",
        tier: "Starting",
        cost: 0,
        description: "<p>Trait description and rules effect.</p>"
      };
    } else if (type === "attack") {
      itemData.img = "icons/svg/sword.svg";
      itemData.system = {
        bonus: "+1",
        range: "Melee 1",
        tier2Damage: "1 dam",
        tier3Damage: "2 dam"
      };
    }

    return await Item.create(itemData, { parent: this.actor });
  }

  _onQuantityAdjust(delta, event) { return _onQuantityAdjust.call(this, delta, event); }

  _onQuantityInput(event) { return _onQuantityInput.call(this, event); }

  async _onToggleArmorEquip(event) {
    event.preventDefault();
    event.stopPropagation();
    const btn = $(event.currentTarget);
    const itemId = btn.data("itemId") || btn.closest("[data-item-id]").data("itemId");
    const item = this.actor.items.get(itemId);
    if (!item) return;

    if (!this.actor.isOwner) return;
    if (!canEquip(item)) { ui.notifications.warn("Move the shield into a carried slot before equipping it."); return; }
    const newEquipped = !(item.system.isEquipped !== false);
    await item.update({ "system.isEquipped": newEquipped });
    ui.notifications.info(`${item.name} is now ${newEquipped ? 'Worn / Equipped' : 'Stowed'}.`);
    this.render(false);
  }

  async _onAdjustArmorAD(delta, event) {
    event.preventDefault();
    event.stopPropagation();
    const btn = $(event.currentTarget);
    const itemId = btn.data("itemId") || btn.closest("[data-item-id]").data("itemId");
    const item = this.actor.items.get(itemId);
    if (!item || !item.system?.isArmor) return;

    const currentAD = Number(item.system.armor?.defense) || 0;
    const maxAD = Number(item.system.armor?.maxDefense) || currentAD;
    const newAD = Math.clamp(currentAD + delta, 0, maxAD);
    await item.update({ "system.armor.defense": newAD });
    this.render(false);
  }

  async _onOpenADManagerDialog(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    return this.actor.openDamageAllocationDialog(1);
  }

  async _onRollCharacteristic(event) {
    event.preventDefault();
    const charKey = event.currentTarget.dataset.char;
    if (!charKey) return;
    const charBonus = Number(this.actor.system.characteristics?.[charKey]) || 0;
    const charLabel = charKey.capitalize();

    const content = `
      <form class="crows-dialog-form">
        ${renderCircumstanceSelector()}
        <div class="form-group">
          <label for="char-flat-mod"><i class="fas fa-sliders-h"></i> Situational Modifier</label>
          <input type="number" id="char-flat-mod" value="0" />
        </div>
      </form>
    `;

    new Dialog({
      title: `${this.actor.name}: ${charLabel} Test`,
      content: content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Roll Test",
          callback: async (html) => {
            const circumstance = html.find('input[name="circumstance"]:checked').val() || "standard";
            const flatMod = parseInt(html.find("#char-flat-mod").val(), 10) || 0;

            const { roll, total, tier: finalTier, isCrit, isDoom } =
              await rollPowerRoll({ modifier: charBonus + flatMod, circumstance });

            let tierTitle = `Tier ${finalTier}`;
            let tierClass = "failure";

            if (isCrit) {
              tierTitle = "CRITICAL SUCCESS! (Tier 3)";
              tierClass = "crit";
            } else if (isDoom) {
              tierTitle = "DOOM! (Automatic Tier 1 Failure)";
              tierClass = "doom";
            } else if (finalTier === 3) {
              tierTitle = "Tier 3: Superior Success";
              tierClass = "crit";
            } else if (finalTier === 2) {
              tierTitle = "Tier 2: Partial / Mixed Success";
              tierClass = "success";
            } else {
              tierTitle = "Tier 1: Failure / Setback";
              tierClass = "failure";
            }

            const cardHtml = `
              <div class="crows-roll-card">
                <div class="card-header">
                  <i class="fas fa-dice-d20"></i> ${this.actor.name}: ${charLabel} Test (${circumstance.toUpperCase()})
                </div>
                <div class="card-body">
                  <div class="dice-roll-total">Result: <strong>${total}</strong> <span class="formula">(${roll.result})</span></div>
                  <div class="outcome ${tierClass}">${tierTitle}</div>
                </div>
              </div>
            `;

            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              flavor: `${this.actor.name} tested ${charLabel}`,
              content: cardHtml
            });
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "roll"
    }, { classes: ["crows", "dialog", "crows-dialog"] }).render(true);
  }

  async _onRollWeaponAttack(event) {
    event.preventDefault();
    return showWeaponAttackDialog(this.actor, this.actor.items.get(event.currentTarget.dataset.itemId));
  }

  _onRollUsageDice(event) { return requestUsageDice(this.actor, event); }

  _onPostTraitToChat(event) { return _onPostTraitToChat.call(this, event); }

  async _onRollAttack(event) {
    event.preventDefault();
    const itemId = $(event.currentTarget).parents(".item").data("itemId");
    return showStatBlockAttackDialog(this.actor, this.actor.items.get(itemId));
  }

  _onDragStart(event) {
    const li = event.currentTarget;
    if (event.target.classList.contains("content-link")) return;

    // Resolve itemId from currentTarget or closest/child element with data-item-id
    const itemId = li.dataset?.itemId 
      || $(li).closest("[data-item-id]").data("itemId")
      || $(li).find("[data-item-id]").data("itemId")
      || $(event.target).closest("[data-item-id]").data("itemId");

    if (!itemId) return super._onDragStart(event);

    const item = this.actor.items.get(itemId);
    if (!item) return super._onDragStart(event);

    const dragData = item.toDragData();
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  }

  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;

    const slotElement = event.target.closest("[data-slot]");
    const listElement = event.target.closest("[data-list]");
    const targetSlot = slotElement?.dataset.slot ?? listElement?.dataset.list ?? null;
    const targetItem = this.actor.items.get(event.target.closest("[data-item-id]")?.dataset.itemId);
    if (item.parent && canStack(item, targetItem)) return CrowsLoot.stack(item, targetItem);

    // Rearranging within this sheet
    if (item.parent?.uuid === this.actor.uuid) {
      if (!targetSlot || item.type !== "equipment" || item.system.location === targetSlot) return false;
      return CrowsLoot.placeItem(this.actor, item, targetSlot);
    }

    // From another actor, loot token, or container: transfer
    if (item.parent) {
      if (item.type !== "equipment") return this._onDropItemCreate(item.toObject());
      return CrowsLoot.transfer(item, this.actor, { location: targetSlot });
    }

    // From a compendium or the sidebar: a fresh copy
    const itemData = item.toObject();
    if (item.type === "equipment") {
      const count = Math.max(1, Number(itemData.system?.slots) || 1);
      const loc = (targetSlot && CrowsLoot.fits(this.actor, targetSlot, count)) ? targetSlot : CrowsLoot.findFreeSlot(this.actor, count);
      foundry.utils.setProperty(itemData, "system.location", loc);
    }
    return this._onDropItemCreate(itemData);
  }
}
