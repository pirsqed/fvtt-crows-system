import { canEquip, woundCapacity, woundMap, woundUpdate } from "../equipment-rules.mjs";
import { showSpellcastDialog } from "../spellcasting.mjs";
import { canStack, goldStack, restoreUsageDice } from "../inventory.mjs";
import { showWeaponAttackDialog, rollStatBlockAttack } from "../attacks.mjs";
import { rollPowerRoll } from "../power-roll.mjs";
import { CrowsLoot } from "../loot.mjs";

export class CrowsMonsterSheet extends ActorSheet {
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

    // 1. Hands (Wielded / Active)
    const hand1Item = equipmentItems.find(i => i.system.location === "hand1");
    const hand2Item = equipmentItems.find(i => i.system.location === "hand2");
    const isHand1TwoHanded = hand1Item && ((hand1Item.system.slots || 1) >= 2);

    if (isHand1TwoHanded) {
      context.handSlots = [
        {
          id: "hand1",
          label: "Equipped in Both Hands (2-Handed)",
          item: hand1Item,
          isTwoHanded: true,
          colSpan: 2,
          slots: hand1Item.system.slots || 2
        }
      ];
    } else {
      context.handSlots = [
        { id: "hand1", label: "Hand 1", item: hand1Item, isTwoHanded: false, colSpan: 1 },
        { id: "hand2", label: "Hand 2", item: hand2Item, isTwoHanded: false, colSpan: 1 }
      ];
    }

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
      stash: equipmentItems.filter(i => i.system.location === 'stash' || (!i.system.location?.startsWith('backpack') && !i.system.location?.startsWith('slot') && !i.system.location?.startsWith('hand')))
    };

    // 4. Derived stats
    context.coinSlots = Math.ceil((Number(this.actor.system.coins) || 0) / 250);
    context.totalAD = this.actor.system.totalAD || 0;

    context.enrichedDescription = await TextEditor.enrichHTML(this.actor.system.description || "", {async: true});

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

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

  async _onQuantityAdjust(delta, event) {
    event.preventDefault();
    event.stopPropagation();
    const currentTarget = event.currentTarget;
    const target = typeof $ === "function" ? $(currentTarget) : null;
    const itemId = currentTarget?.dataset?.itemId
      || target?.data("itemId")
      || target?.closest("[data-item-id]")?.data("itemId")
      || target?.closest(".item")?.data("itemId");
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const currentQty = item.system.quantity ?? 1;
    if (currentQty === 0 && delta < 0) return;

    const maxStack = Number(item.system.maxStack) || 1;
    const newQty = Math.max(0, currentQty + delta);

    if (delta > 0 && maxStack > 1 && newQty > maxStack) {
      ui.notifications.warn(`Quantity cannot exceed maximum stack size of ${maxStack}.`);
      return;
    }

    if (newQty === 0) {
      const confirmed = await Dialog.confirm({
        title: "Delete Item?",
        content: `<p>You have 0 remaining. Would you like to remove <strong>${item.name}</strong> from your inventory?</p>`,
        defaultYes: false
      });
      if (confirmed) {
        return item.delete();
      }
      return item.update({ "system.quantity": 0 });
    }

    await item.update({ "system.quantity": newQty });
  }

  async _onQuantityInput(event) {
    event.preventDefault();
    event.stopPropagation();
    const input = event.currentTarget;
    const itemId = input.dataset.itemId || $(input).closest("[data-item-id]").data("itemId");
    const item = itemId ? this.actor.items.get(itemId) : null;
    if (!item) return;

    const maxStack = Math.max(1, Number(input.dataset.maxStack) || Number(item.system.maxStack) || 1);
    const parsedVal = parseInt(input.value, 10);

    if (isNaN(parsedVal)) {
      input.value = item.system.quantity ?? 1;
      return;
    }

    if (maxStack > 1 && parsedVal > maxStack) {
      ui.notifications.warn(`Quantity cannot exceed maximum stack size of ${maxStack}.`);
      input.value = item.system.quantity ?? 1;
      return;
    }

    if (parsedVal <= 0) {
      input.value = item.system.quantity ?? 1;
      const confirmed = await Dialog.confirm({
        title: "Delete Item?",
        content: `<p>Setting quantity to 0 will delete <strong>${item.name}</strong>. Are you sure?</p>`,
        defaultYes: false
      });
      if (confirmed) {
        await item.delete();
      } else {
        await item.update({ "system.quantity": 0 });
      }
      return;
    }

    await item.update({ "system.quantity": parsedVal });
  }

  async _onToggleArmorEquip(event) {
    event.preventDefault();
    event.stopPropagation();
    const btn = $(event.currentTarget);
    const itemId = btn.data("itemId") || btn.closest("[data-item-id]").data("itemId");
    const item = this.actor.items.get(itemId);
    if (!item) return;

    if (!this.actor.isOwner) return;
    if (!canEquip(item)) { ui.notifications.warn("Move the shield into a hand slot before equipping it."); return; }
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
        <div class="form-group circumstance-group">
          <label class="group-label"><i class="fas fa-balance-scale"></i> Circumstance</label>
          <div class="radio-list">
            <label class="radio-option opt-double-edge">
              <input type="radio" name="circumstance" value="double-edge" />
              <span class="opt-title">Double Edge</span>
              <span class="opt-desc">+1 Outcome Tier</span>
            </label>
            <label class="radio-option opt-edge">
              <input type="radio" name="circumstance" value="edge" />
              <span class="opt-title">Edge</span>
              <span class="opt-desc">+2 to roll</span>
            </label>
            <label class="radio-option opt-standard">
              <input type="radio" name="circumstance" value="standard" checked />
              <span class="opt-title">Standard Roll</span>
              <span class="opt-desc">Normal (2d10)</span>
            </label>
            <label class="radio-option opt-bane">
              <input type="radio" name="circumstance" value="bane" />
              <span class="opt-title">Bane</span>
              <span class="opt-desc">-2 to roll</span>
            </label>
            <label class="radio-option opt-double-bane">
              <input type="radio" name="circumstance" value="double-bane" />
              <span class="opt-title">Double Bane</span>
              <span class="opt-desc">-1 Outcome Tier</span>
            </label>
          </div>
        </div>
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

  async _onRollUsageDice(event) {
    event.preventDefault();
    const btn = event.currentTarget;
    const itemId = btn.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const currentUD = item.system.consumable?.currentUD ?? item.system.consumable?.maxUD ?? 0;
    if (currentUD <= 0) {
      ui.notifications.warn(`${item.name} has no usage dice remaining!`);
      return;
    }

    const roll = new Roll(`${currentUD}d6`);
    await roll.evaluate();

    let depletedCount = 0;
    const diceResults = roll.dice[0].results.map(r => {
      const isDepleted = r.result === 1 || r.result === 2;
      if (isDepleted) depletedCount++;
      return `<span class="ud-die ${isDepleted ? 'depleted' : 'safe'}">${r.result}</span>`;
    }).join(" ");

    const remainingUD = Math.max(0, currentUD - depletedCount);
    await item.update({ "system.consumable.currentUD": remainingUD });

    let statusText = "";
    if (remainingUD === 0) {
      statusText = `<div class="outcome failure"><i class="fas fa-exclamation-triangle"></i> Fully Depleted! (${item.system.consumable?.udTrigger || "Useless"})</div>`;
    } else if (depletedCount > 0) {
      statusText = `<div class="outcome warning">Lost ${depletedCount} Usage Die (${remainingUD} remaining)</div>`;
    } else {
      statusText = `<div class="outcome success">All dice held! (${remainingUD} remaining)</div>`;
    }

    const content = `
      <div class="crows-roll-card">
        <div class="card-header">
          <i class="fas fa-hourglass-half"></i> Usage Dice Check: ${item.name}
        </div>
        <div class="card-body">
          <div class="ud-dice-pool">${diceResults}</div>
          ${statusText}
        </div>
      </div>
    `;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `Usage Dice for ${item.name}`,
      content: content
    });
  }

  async _onPostTraitToChat(event) {
    event.preventDefault();
    event.stopPropagation();
    const btn = $(event.currentTarget);
    const itemId = btn.data("itemId") || btn.closest("[data-item-id]").data("itemId");
    if (!itemId) return;
    const trait = this.actor.items.get(itemId);
    if (!trait) return;

    const tree = trait.system.tree || "General";
    const tier = trait.system.tier || "Starting";
    const cost = trait.system.cost ?? 0;
    const prereqs = trait.system.prerequisites || "";
    const description = trait.system.description || "<em>No description provided.</em>";

    const cardHtml = `
      <div class="crows-item-card trait-card">
        <div class="card-header trait-header flexrow" style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <img src="${trait.img}" alt="${trait.name}" style="width:34px; height:34px; border-radius:4px; border:1px solid rgba(147, 51, 234, 0.4); object-fit:cover;" />
          <div style="flex:1;">
            <h3 style="margin:0; font-size:1.05rem; font-weight:700; color:#f3e8ff; letter-spacing:0.3px;">${trait.name}</h3>
            <div style="font-size:0.75rem; color:#c084fc; text-transform:uppercase; letter-spacing:0.5px; font-weight:600;"><i class="fas fa-sitemap"></i> ${tree} Trait Tree</div>
          </div>
        </div>
        <div class="card-badges" style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:8px;">
          <span class="badge" style="background:#581c87; color:#f3e8ff; border:1px solid #9333ea;"><i class="fas fa-layer-group"></i> ${tier}</span>
          ${cost > 0 ? `<span class="badge" style="background:rgba(245,158,11,0.2); color:#fbbf24; border:1px solid #f59e0b;"><i class="fas fa-coins"></i> ${cost} XP</span>` : ''}
          ${prereqs ? `<span class="badge" style="background:rgba(59,130,246,0.2); color:#93c5fd; border:1px solid #3b82f6;"><i class="fas fa-link"></i> Req: ${prereqs}</span>` : ""}
        </div>
        <div class="trait-description" style="font-size:0.85rem; line-height:1.45; color:#e5e7eb; border-top:1px solid rgba(255,255,255,0.08); padding-top:6px;">
          ${description}
        </div>
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${this.actor.name} shared the <strong>${trait.name}</strong> trait`,
      content: cardHtml
    });
  }

  async _onRollAttack(event) {
    event.preventDefault();
    const itemId = $(event.currentTarget).parents(".item").data("itemId");
    return rollStatBlockAttack(this.actor, this.actor.items.get(itemId));
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
