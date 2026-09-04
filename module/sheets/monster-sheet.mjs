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
    context.owner = this.actor.isOwner;
    context.editable = this.isEditable;
    
    // Pass attacks and traits specifically
    const items = this.actor.items.map(item => {
      const iObj = item.toObject();
      iObj.greedTier = item.greedTier;
      iObj.greedTierLabel = item.greedTierLabel;
      iObj.greedBonusGc = item.greedBonusGc;
      iObj.effectiveCost = item.effectiveCost;
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
    const target = $(event.currentTarget);
    const itemId = target.data("itemId") || target.closest("[data-item-id]").data("itemId");
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const newQty = Math.max(0, (item.system.quantity || 1) + delta);
    if (newQty === 0) {
      return item.delete();
    }
    await item.update({ "system.quantity": newQty });
  }

  async _onToggleArmorEquip(event) {
    event.preventDefault();
    event.stopPropagation();
    const btn = $(event.currentTarget);
    const itemId = btn.data("itemId") || btn.closest("[data-item-id]").data("itemId");
    const item = this.actor.items.get(itemId);
    if (!item) return;

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

            let formula = "2d10";
            let rollBonus = charBonus + flatMod;
            if (circumstance === "edge") rollBonus += 2;
            else if (circumstance === "bane") rollBonus -= 2;

            if (rollBonus >= 0) formula += ` + ${rollBonus}`;
            else formula += ` - ${Math.abs(rollBonus)}`;

            const roll = new Roll(formula);
            await roll.evaluate();

            const natural = (roll.dice[0]?.results[0]?.result || 0) + (roll.dice[0]?.results[1]?.result || 0);
            const total = roll.total;

            let baseTier = 1;
            if (total >= 17) baseTier = 3;
            else if (total >= 12) baseTier = 2;
            else baseTier = 1;

            let finalTier = baseTier;
            if (circumstance === "double-edge") finalTier = Math.min(3, finalTier + 1);
            else if (circumstance === "double-bane") finalTier = Math.max(1, finalTier - 1);

            let isCrit = natural === 19 || natural === 20;
            let isDoom = natural === 2 || natural === 3;

            let tierTitle = `Tier ${finalTier}`;
            let tierClass = "failure";

            if (isCrit) {
              finalTier = 3;
              tierTitle = "CRITICAL SUCCESS! (Tier 3)";
              tierClass = "crit";
            } else if (isDoom) {
              finalTier = 1;
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
    }).render(true);
  }

  async _onRollWeaponAttack(event) {
    event.preventDefault();
    const btn = event.currentTarget;
    const itemId = btn.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item || !item.system.isWeapon) return;

    const chars = this.actor.system.characteristics || { agility: 0, mind: 0, strength: 0 };
    const content = `
      <form class="crows-dialog-form">
        <div class="form-group">
          <label for="attack-char"><i class="fas fa-bullseye"></i> Characteristic</label>
          <select id="attack-char">
            <option value="strength">Strength (${chars.strength >= 0 ? '+' : ''}${chars.strength})</option>
            <option value="agility">Agility (${chars.agility >= 0 ? '+' : ''}${chars.agility})</option>
            <option value="mind">Mind (${chars.mind >= 0 ? '+' : ''}${chars.mind})</option>
          </select>
        </div>
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
          <label for="attack-mod"><i class="fas fa-sliders-h"></i> Situational Modifier</label>
          <input type="number" id="attack-mod" value="0" />
        </div>
      </form>
    `;

    new Dialog({
      title: `${this.actor.name}: Attack with ${item.name}`,
      content: content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-swords"></i>',
          label: "Attack",
          callback: async (html) => {
            const charKey = html.find("#attack-char").val();
            const charBonus = chars[charKey] || 0;
            const circumstance = html.find('input[name="circumstance"]:checked').val() || "standard";
            const sitMod = parseInt(html.find("#attack-mod").val(), 10) || 0;

            let formula = "2d10";
            let rollBonus = charBonus + sitMod;
            if (circumstance === "edge") rollBonus += 2;
            else if (circumstance === "bane") rollBonus -= 2;

            if (rollBonus >= 0) formula += ` + ${rollBonus}`;
            else formula += ` - ${Math.abs(rollBonus)}`;

            const roll = new Roll(formula);
            await roll.evaluate();

            const natural = (roll.dice[0]?.results[0]?.result || 0) + (roll.dice[0]?.results[1]?.result || 0);
            const total = roll.total;

            let baseTier = 1;
            if (total >= 17) baseTier = 3;
            else if (total >= 12) baseTier = 2;
            else baseTier = 1;

            let tier = baseTier;
            if (circumstance === "double-edge") tier = Math.min(3, tier + 1);
            else if (circumstance === "double-bane") tier = Math.max(1, tier - 1);

            let isCrit = natural === 19 || natural === 20;
            let isDoom = natural === 2 || natural === 3;

            let tierTitle = `Tier ${tier}`;
            let tierClass = "failure";
            let damageDesc = "No Damage";

            if (isCrit) {
              tier = 3;
              tierTitle = "CRITICAL HIT! (Tier 3)";
              tierClass = "crit";
              damageDesc = this.actor.evaluateWeaponDamage(item.system.weapon?.tier3Damage, charKey) || "Full Damage";
            } else if (isDoom) {
              tier = 1;
              tierTitle = "DOOM! (Critical Failure)";
              tierClass = "doom";
              damageDesc = "Disaster strikes!";
            } else if (tier === 3) {
              tierTitle = "Tier 3 (Strong Hit)";
              tierClass = "crit";
              damageDesc = this.actor.evaluateWeaponDamage(item.system.weapon?.tier3Damage, charKey) || "Tier 3 Damage";
            } else if (tier === 2) {
              tierTitle = "Tier 2 (Mixed Hit)";
              tierClass = "success";
              damageDesc = this.actor.evaluateWeaponDamage(item.system.weapon?.tier2Damage, charKey) || "Tier 2 Damage";
            } else {
              tierTitle = "Tier 1 (Miss / Setback)";
              tierClass = "failure";
              damageDesc = "No Damage";
            }

            // Target Detection & Damage calculation for chat card
            let numericDamage = 0;
            if (tier >= 2 && !isDoom) {
              const rawDmg = (tier === 3 || isCrit)
                ? (item.system.weapon?.tier3Damage || "")
                : (item.system.weapon?.tier2Damage || "");
              numericDamage = this.actor.extractDamageNumber(rawDmg, charKey);
            }

            const targets = Array.from(game.user.targets || []);
            let targetDamageButtons = "";
            if (numericDamage > 0) {
              if (targets.length > 0) {
                targetDamageButtons = targets.map(t => `
                  <button type="button" class="crows-apply-damage-btn btn-chat-damage" data-target-actor-id="${t.actor?.id || ''}" data-target-token-id="${t.id}" data-damage-amount="${numericDamage}">
                    <i class="fas fa-shield-virus"></i> Apply ${numericDamage} Damage to ${t.name}
                  </button>
                `).join("");
              } else {
                targetDamageButtons = `
                  <button type="button" class="crows-apply-damage-btn btn-chat-damage" data-damage-amount="${numericDamage}">
                    <i class="fas fa-shield-virus"></i> Apply ${numericDamage} Damage to Target
                  </button>
                `;
              }
            }

            const cardHtml = `
              <div class="crows-roll-card">
                <div class="card-header weapon">
                  <i class="fas fa-crosshairs"></i> ${this.actor.name}: ${item.name} (${charKey.capitalize()})
                </div>
                <div class="card-body">
                  <div class="dice-roll-total">Roll: <strong>${total}</strong> <span class="formula">(${roll.result})</span></div>
                  <div class="outcome ${tierClass}">${tierTitle}</div>
                  <div class="damage-block">
                    <strong>Damage / Effect:</strong> ${damageDesc}
                  </div>
                  <div class="weapon-meta">
                    <span><b>Range:</b> ${item.system.weapon?.range || "Melee 1"}</span>
                    ${item.system.traits ? `<span><b>Traits:</b> ${item.system.traits}</span>` : ""}
                  </div>
                  ${targetDamageButtons ? `
                  <div class="crows-chat-actions flexcol" style="margin-top: 8px; gap: 4px;">
                    ${targetDamageButtons}
                  </div>
                  ` : ''}
                </div>
              </div>
            `;

            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              flavor: `${this.actor.name} attacked with ${item.name}`,
              content: cardHtml
            });
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "roll"
    }).render(true);
  }

  async _onRollUsageDice(event) {
    event.preventDefault();
    const btn = event.currentTarget;
    const itemId = btn.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const currentUD = item.system.consumable?.currentUD || item.system.consumable?.maxUD || 1;
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
    const element = event.currentTarget;
    const itemId = $(element).parents(".item").data("itemId");
    const attack = this.actor.items.get(itemId);
    
    // Bonus string like "+2" or "-1"
    let bonusStr = attack.system.bonus || "+0";
    
    const rollFormula = `2d10 ${bonusStr}`;
    const roll = new Roll(rollFormula);
    await roll.evaluate();
    
    const naturalRoll = (roll.dice[0]?.results[0]?.result || 0) + (roll.dice[0]?.results[1]?.result || 0);
    const total = roll.total;
    
    let tier = 1;
    let tierLabel = "Failure";
    let damageText = "Miss";
    
    if (total >= 12 && total <= 16) {
        tier = 2;
        tierLabel = "Partial / Mixed";
        damageText = attack.system.tier2Damage;
    } else if (total >= 17) {
        tier = 3;
        tierLabel = "Good";
        damageText = attack.system.tier3Damage;
    }
    
    let special = "";
    if (naturalRoll === 19 || naturalRoll === 20) {
        special = '<div style="color: #27ae60; font-weight: bold; font-size: 1.1em; text-transform: uppercase;">Critical Hit!</div>';
        tier = 3;
        tierLabel = "Critical Success";
        damageText = attack.system.tier3Damage;
    } else if (naturalRoll === 2 || naturalRoll === 3) {
        special = '<div style="color: #c0392b; font-weight: bold; font-size: 1.1em; text-transform: uppercase;">Doom!</div>';
        tier = 1;
        tierLabel = "Automatic Failure";
        damageText = "Miss";
    }

    // Extract numeric damage for target application
    let numericDamage = 0;
    if (tier >= 2 && damageText !== "Miss") {
      numericDamage = this.actor.extractDamageNumber(damageText);
    }

    const targets = Array.from(game.user.targets || []);
    let targetDamageButtons = "";
    if (numericDamage > 0) {
      if (targets.length > 0) {
        targetDamageButtons = targets.map(t => `
          <button type="button" class="crows-apply-damage-btn btn-chat-damage" data-target-actor-id="${t.actor?.id || ''}" data-target-token-id="${t.id}" data-damage-amount="${numericDamage}" style="margin-top: 6px; width: 100%;">
            <i class="fas fa-shield-virus"></i> Apply ${numericDamage} Damage to ${t.name}
          </button>
        `).join("");
      } else {
        targetDamageButtons = `
          <button type="button" class="crows-apply-damage-btn btn-chat-damage" data-damage-amount="${numericDamage}" style="margin-top: 6px; width: 100%;">
            <i class="fas fa-shield-virus"></i> Apply ${numericDamage} Damage to Target
          </button>
        `;
      }
    }

    const flavorHtml = `
      <div class="crows-roll">
        <h3>${this.actor.name} uses ${attack.name}</h3>
        <div style="font-size: 1.2em; padding-bottom: 5px;"><strong>Tier ${tier}</strong>: ${tierLabel}</div>
        ${special}
        <div style="margin-top: 5px; padding: 5px; background: rgba(0,0,0,0.1); border-left: 3px solid #c0392b;">
            <strong>Effect:</strong> ${damageText}
        </div>
        ${targetDamageButtons ? `
        <div class="crows-chat-actions flexcol" style="margin-top: 8px;">
          ${targetDamageButtons}
        </div>
        ` : ''}
      </div>
    `;
    
    roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: flavorHtml
    });
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
    const itemData = item.toObject();
    const sourceActor = item.actor;

    // Find drop destination slot
    const slotElement = event.target.closest('[data-slot]');
    let targetSlot = null;
    if (slotElement) {
      targetSlot = slotElement.dataset.slot;
    } else {
      const listElement = event.target.closest('[data-list]');
      if (listElement) {
        targetSlot = listElement.dataset.list;
      }
    }

    if (!targetSlot) {
      // Default to backpack1 or ground if no slot specified
      targetSlot = (this.actor.system.slots > 0) ? "backpack1" : "ground";
    }

    const maxSlots = Math.max(0, parseInt(this.actor.system.slots, 10) || 0);
    const slotCount = Math.max(1, parseInt(item.system?.slots ?? itemData.system?.slots, 10) || 1);

    // If dropping into backpack/slot, ensure multi-slot item fits within configured slots
    if (targetSlot.startsWith("backpack") || targetSlot.startsWith("slot")) {
      const startNum = parseInt(targetSlot.replace(/^(?:backpack|slot)/, ""), 10);
      if (maxSlots > 0 && (startNum + slotCount - 1 > maxSlots)) {
        ui.notifications.warn(`"${item.name}" takes ${slotCount} slots and will not fit starting at Slot ${startNum} (max Slot ${maxSlots}).`);
        return false;
      }
    }

    // If item belongs to the same actor
    if (this.actor.uuid === item.parent?.uuid) {
      if (item.system?.location !== targetSlot) {
        const updates = [];

        // If target slot is already occupied (and not a list like ground/stash), swap them
        if (targetSlot !== 'ground' && targetSlot !== 'stash') {
          const existingItem = this.actor.items.find(i => i.system.location === targetSlot);
          if (existingItem && existingItem.id !== item.id) {
            updates.push({ _id: existingItem.id, "system.location": item.system.location });
          }
        }

        updates.push({ _id: item.id, "system.location": targetSlot });
        return this.actor.updateEmbeddedDocuments("Item", updates);
      }
      return super._onDropItem(event, data);
    }

    // Dropped from external actor or loot container / floor token
    foundry.utils.setProperty(itemData, "system.location", targetSlot);
    const created = await this._onDropItemCreate(itemData);

    // If taken from a loot actor or token on the map, remove it from the source
    if (sourceActor && sourceActor.type === "loot") {
      await item.delete();
      if (sourceActor.items.size === 0 && sourceActor.isToken) {
        await sourceActor.token.delete();
      }
    }

    return created;
  }
}
