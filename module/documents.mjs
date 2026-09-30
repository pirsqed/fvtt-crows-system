import { weaponDamage, calculateDamage } from "./damage.mjs";
import { openDamageAllocationDialog } from "./apps/damage-dialog.mjs";
import { CrowsChatActions } from "./chat-actions.mjs";
import { damageSnapshot } from "./chat-state.mjs";
import { supplyUpdate } from "./supplies.mjs";
import { activeDefense, canEquip, woundCapacity, woundMap, woundUpdate, woundStats } from "./equipment-rules.mjs";
import { spanFor, beltCapacity, canChangeTraitBelt, traitBeltCount, goldTotal } from "./inventory.mjs";

export class CrowsActor extends Actor {
  /** Scene loot has a public exterior without sharing its prepared world actor. */
  getUserLevel(user) {
    const level = super.getUserLevel(user);
    if (this.type === "loot" && this.isToken && this.token && !this.token.hidden) {
      const access = CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
      return Math.max(level, access);
    }
    return level;
  }

  async _preUpdate(changes, options, user) {
    const result = await super._preUpdate(changes, options, user);
    if (this.type === "loot" && !user.isGM) return false;
    // Follow ordinary actor renames until the Ref chooses a distinct prototype name.
    if (this.type === "loot" && !this.isToken && changes.name && this.prototypeToken?.name === this.name
      && !("prototypeToken.name" in changes) && !("name" in (changes.prototypeToken ?? {}))) {
      changes["prototypeToken.name"] = changes.name;
    }
    return result;
  }
  prepareDerivedData() {
    super.prepareDerivedData();

    const system = this.system;

    // Bound stamina
    if (system.stamina) {
      system.stamina.value = Math.clamp(system.stamina.value, 0, system.stamina.max);
    }

    // Coin encumbrance (250 gc per slot)
    const coins = Number(system.coins) || 0;
    system.coinSlots = Math.ceil(coins / 250);
    if (this.type === "crow") system.carriedGold = goldTotal(this.items);

    // Armor Defense (AD) calculation from all active sources:
    // 1. Temporary Magic / Buff AD (system.tempAD)
    // 2. Worn/Equipped Items with Has AD (isArmor && isEquipped && location !== 'ground' && location !== 'stash')
    let totalAD = Number(system.tempAD) || 0;
    const adSources = [];

    if (system.tempAD > 0) {
      adSources.push({
        type: "temp",
        name: "Temporary / Magic AD",
        ad: system.tempAD,
        maxAD: system.tempAD,
        active: true
      });
    }

    // Check for Worn/Equipped Items with AD
    for (const item of this.items) {
      if (item.system?.isArmor) {
        const isEquipped = item.system.isEquipped !== false;
        const loc = item.system.location || "backpack1";
        const isStowed = loc === "ground" || loc === "stash";
        const currentAD = Number(item.system.armor?.defense) || 0;
        const maxAD = Number(item.system.armor?.maxDefense) || currentAD;
        const isActive = activeDefense(item);

        if (isActive) {
          totalAD += currentAD;
        }

        adSources.push({
          type: "armor",
          id: item.id,
          name: item.name,
          ad: currentAD,
          maxAD: maxAD,
          active: isActive,
          isEquipped: isEquipped,
          isStowed: isStowed
        });
      }
    }

    system.totalAD = totalAD;
    system.adSources = adSources;
    if (this.type === "monster") {
      Object.assign(system, woundStats(this));
      // Keep the source's multiple movement modes and units intact.
      system.derivedSpeed = String(system.speed ?? "5").replace(/\d+/g,
        value => String(Math.max(0, Number(value) - system.speedPenalty)));
    }


    if (this.type === "crow") {
      Object.assign(system, woundStats(this));
      system.derivedSpeed = Math.max(0, Number(system.speed ?? 5) - system.speedPenalty);
      system.availableXP = Math.max(0, (system.totalXP || 0) - (system.spentXP || 0));
      system.xpOverspent = (system.spentXP || 0) > (system.totalXP || 0);

      // Ensure expertises values are bounded
      if (system.expertises) {
        for (const [key, exp] of Object.entries(system.expertises)) {
          if (exp && typeof exp === "object") {
            if (typeof exp.value !== "number") exp.value = 0;
            if (typeof exp.max !== "number") exp.max = 0;
            if (exp.max > 0) {
              exp.value = Math.clamp(exp.value, 0, exp.max);
            } else {
              exp.value = Math.max(0, exp.value);
            }
          }
        }
      }
    }
  }

  /**
   * Spends 1 use of the specified expertise
   * @param {string} key - Expertise key (e.g., 'alchemy', 'athletics')
   * @returns {Promise<{success: boolean, remaining: number, max: number}>}
   */
  async spendExpertise(key) {
    if (this.type !== "crow") return { success: false, remaining: 0, max: 0 };
    const exp = this.system.expertises?.[key];
    if (!exp) return { success: false, remaining: 0, max: 0 };

    if (exp.value <= 0) {
      ui.notifications.warn(`No uses remaining for ${key.capitalize()}!`);
      return { success: false, remaining: 0, max: exp.max };
    }

    const newValue = exp.value - 1;
    await this.update({ [`system.expertises.${key}.value`]: newValue });
    return { success: true, remaining: newValue, max: exp.max };
  }

  /**
   * Recovers all uses of all expertises back to their maximums (Rest action)
   * @returns {Promise<void>}
   */
  async recoverAllExpertises() {
    if (this.type !== "crow") return;
    const updates = {};
    const expertises = this.system.expertises || {};
    for (const [key, exp] of Object.entries(expertises)) {
      if (exp && typeof exp === "object" && exp.max > 0) {
        updates[`system.expertises.${key}.value`] = exp.max;
      }
    }
    if (Object.keys(updates).length > 0) {
      await this.update(updates);
    }
  }

  /**
   * Evaluates weapon damage strings like "7 + S", "4 + A", "2 + A or S", "5 + M", "6", etc.
   * @param {string} rawDamage - Raw formula string e.g. "4 + S"
   * @param {string} [charKey] - Selected characteristic key ("strength", "agility", "mind")
   * @returns {string} - Evaluated damage string with breakdown e.g. "6 Damage (4 + S)"
   */
  evaluateWeaponDamage(rawDamage, charKey = "strength") {
    return weaponDamage(rawDamage, this.system.characteristics, charKey).display;
  }

  /**
   * Adjusts the actor's cruelty level (minimum 0)
   * @param {number} delta - Positive or negative integer
   */
  async adjustCruelty(delta) {
    if (this.type !== "crow") return;
    const current = Number(this.system.cruelty) || 0;
    const nextVal = Math.max(0, current + delta);
    await this.update({ "system.cruelty": nextVal });
    return nextVal;
  }

  /**
   * Clears all levels of cruelty (Rest in non-Miasma location)
   */
  async clearCruelty() {
    if (this.type !== "crow") return;
    await this.update({ "system.cruelty": 0 });
  }

  /**
   * Adds a Miasma Effect to the character
   * @param {object} effectData - { title, firstEffect, secondEffect, rollTotal }
   */
  async addMiasmaEffect(effectData) {
    if (this.type !== "crow") return;
    const currentEffects = foundry.utils.duplicate(this.system.miasmaEffects || []);
    const newEffect = {
      id: foundry.utils.randomID(),
      title: effectData.title || "Miasma Corruption",
      firstEffect: effectData.firstEffect || "",
      secondEffect: effectData.secondEffect || "",
      rollTotal: Number(effectData.rollTotal) || 1
    };
    currentEffects.push(newEffect);
    await this.update({ "system.miasmaEffects": currentEffects });
    return newEffect;
  }

  /**
   * Removes a specific Miasma effect by ID
   * @param {string} effectId
   */
  async removeMiasmaEffect(effectId) {
    if (this.type !== "crow") return;
    const currentEffects = (this.system.miasmaEffects || []).filter(e => e.id !== effectId);
    await this.update({ "system.miasmaEffects": currentEffects });
  }

  /**
   * Extracts clean numeric damage integer from raw formula string or evaluated text.
   * @param {string} rawDamage - e.g. "4 + S", "2 + A", "6 dam", "8", etc.
   * @param {string} [charKey] - "strength", "agility", "mind"
   * @returns {number}
   */
  extractDamageNumber(rawDamage, charKey = "strength") {
    return weaponDamage(rawDamage, this.system.characteristics, charKey).amount;
  }

  /**
   * Applies custom allocated damage with specific item priorities and wounds spillover
   * @param {object} allocationData
   * @returns {Promise<object>}
   */
  async applyAllocatedDamage(allocationData) {
    const {
      damageTotal = 0,
      tempADAbsorbed = 0,
      itemAllocations = [], // [{ itemId, absorbed, newDefense }]
      staminaDamage = 0,
      woundsCount = 0,
      breakdown = []
    } = allocationData;

    const actorUpdates = {};
    const itemUpdates = [];

    // 1. Temp AD
    if (tempADAbsorbed > 0) {
      const currentTemp = Number(this.system?.tempAD) || 0;
      actorUpdates["system.tempAD"] = Math.max(0, currentTemp - tempADAbsorbed);
    }

    // 2. Items
    for (const alloc of itemAllocations) {
      const item = this.items.get(alloc.itemId);
      if (item) {
        itemUpdates.push({ item, defense: alloc.newDefense });
      }
    }

    // 3. Stamina
    if (staminaDamage > 0) {
      const currentStamina = Number(this.system?.stamina?.value) ?? 10;
      actorUpdates["system.stamina.value"] = Math.max(0, currentStamina - staminaDamage);
    }

    // 4. Backpack Wounds (for Crows)
    const woundedSlotNames = [];
    if (woundCapacity(this) > 0 && woundsCount > 0) {
      const woundedSlots = woundMap(this);
      let remainingWoundsToApply = woundsCount;

      for (let i = 1; i <= woundCapacity(this) && remainingWoundsToApply > 0; i++) {
        const key = `slot${i}`;
        if (!woundedSlots[key]) {
          woundedSlots[key] = true;
          woundedSlotNames.push(`Slot ${i}`);
          remainingWoundsToApply--;
        }
      }
      Object.assign(actorUpdates, woundUpdate(this, woundedSlots));
    }

    // Execute item updates
    for (const u of itemUpdates) {
      await u.item.update({ "system.armor.defense": u.defense });
    }

    // Execute actor updates
    if (Object.keys(actorUpdates).length > 0) {
      await this.update(actorUpdates);
    }

    return {
      damageTotal,
      tempADAbsorbed,
      staminaDamage,
      woundsCount,
      woundedSlotNames,
      breakdown
    };
  }

  /**
   * Interactive Damage Allocation Dialog with Orderable AD Sources, Live Preview & Wound Spillover
   * @param {number} [initialDamage=1]
   */
  openDamageAllocationDialog(initialDamage = 1, options = {}) {
    return openDamageAllocationDialog.call(this, initialDamage, options);
  }


  /**
   * Applies incoming damage through active AD sources (Temp AD -> Equipped AD Items -> Stamina)
   * @param {number} damageAmount - Incoming damage integer
   * @returns {Promise<{damageTotal: number, absorbedByAD: number, leftoverToStamina: number, breakdown: Array}>}
   */
  async applyDamage(damageAmount) {
    if (!(Number(damageAmount) > 0)) return null;
    const allocation = calculateDamage({ damageTotal: Number(damageAmount),
      tempAD: this.system.tempAD, stamina: this.system.stamina?.value,
      staminaMax: this.system.stamina?.max, hasWounds: woundCapacity(this) > 0,
      sources: this.items.filter(item => activeDefense(item)).map(item => ({
        id: item.id, name: item.name, ad: item.system.armor.defense,
        maxAD: item.system.armor.maxDefense, active: true, enabled: true
      })) });
    const result = await CrowsChatActions.request({ action: "allocate-damage", actorUuid: this.uuid,
      snapshot: damageSnapshot(this), allocation });
    return { ...result, absorbedByAD: allocation.tempADAbsorbed + allocation.itemAllocations.reduce((n, item) => n + item.absorbed, 0),
      leftoverToStamina: allocation.staminaDamage + allocation.woundsCount };
  }

  /**
   * Repairs an armor item's defense by a specific amount or to full
   * @param {string} itemId
   * @param {number} [amount]
   */
  async repairArmor(itemId, amount) {
    const item = this.items.get(itemId);
    if (!item || !item.system?.isArmor) return;
    const current = Number(item.system.armor?.defense) || 0;
    const max = Number(item.system.armor?.maxDefense) || current;
    const nextVal = amount !== undefined ? Math.min(max, current + amount) : max;
    await item.update({ "system.armor.defense": nextVal });
    return nextVal;
  }

  /**
   * Restores all armor & shields to maximum defense
   */
  async repairAllArmor() {
    for (const item of this.items) {
      if (item.system?.isArmor) {
        const max = Number(item.system.armor?.maxDefense) || 0;
        await item.update({ "system.armor.defense": max });
      }
    }
  }
}

export class CrowsItem extends Item {
  async _preDelete(options, user) {
    const result = await super._preDelete(options, user);
    if (result === false) return false;
    if (this.type === "trait" && !canChangeTraitBelt(this, 0)) {
      ui.notifications.warn("Move items out of this trait's belt slots and later belt slots before removing it.");
      return false;
    }
    return result;
  }

  async _preCreate(data, options, user) {
    const result = await super._preCreate(data, options, user);
    if (result === false || !this.system.contentsType) return result;
    this.updateSource({ "system.quantity": 1, "system.maxStack": 1, "system.useQtyPlusMinus": false, "system.isGold": false });
    return result;
  }

  async _preUpdate(changes, options, user) {
    const result = await super._preUpdate(changes, options, user);
    if (result === false) return false;
    const extra = changes["system.extraBeltSlots"] ?? changes.system?.extraBeltSlots;
    if (this.type === "trait" && extra !== undefined
      && !canChangeTraitBelt(this, traitBeltCount({ type: "trait", system: { extraBeltSlots: extra } }))) {
      ui.notifications.warn("Move items out of this trait's belt slots and later belt slots before changing its slot count.");
      return false;
    }
    if (this.type !== "equipment") return result;
    const update = foundry.utils.expandObject(changes).system ?? {};
    try {
      const normalized = supplyUpdate(this.system, update);
      for (const [key, value] of Object.entries(normalized)) {
        changes[`system.${key}`] = value;
        if (changes.system) changes.system[key] = value;
      }
    } catch (error) { ui.notifications.warn(error.message); return false; }
    const nextItem = { parent: this.parent, name: changes.name ?? this.name, system: { ...this.system, ...update } };
    if (!canEquip(nextItem)) {
      changes["system.isEquipped"] = false;
      if (changes.system) changes.system.isEquipped = false;
    }
    if ("use_qty_plus_minus" in update && !("useQtyPlusMinus" in update)) {
      changes["system.useQtyPlusMinus"] = Boolean(update.use_qty_plus_minus);
      if (changes.system) changes.system.useQtyPlusMinus = Boolean(update.use_qty_plus_minus);
    }
    const isGold = !(update.contentsType ?? this.system.contentsType) && (update.isGold ?? this.system.isGold);
    const quantity = update.quantity ?? this.system.quantity;
    const maxStack = isGold ? 250 : update.maxStack ?? this.system.maxStack;
    if (("quantity" in update || "maxStack" in update || "isGold" in update) && maxStack > 1 && quantity > maxStack) {
      ui.notifications.warn(`This item holds at most ${maxStack}. Use another stack for the remainder.`);
      return false;
    }
    if (isGold) {
      changes["system.maxStack"] = 250;
      changes["system.slots"] = 1;
      changes["system.cost"] = 1;
    }
    return result;
  }

  /**
   * Returns an array of slot identifiers occupied by this item based on location and slot count.
   * e.g. location "backpack1" with slots 4 -> ["backpack1", "backpack2", "backpack3", "backpack4"]
   * e.g. location "hand1" with slots 2 (two-handed) -> ["hand1", "hand2"]
   * @returns {string[]}
   */
  getOccupiedSlots() {
    return this.type === "equipment" ? spanFor(this.system.location || "backpack1", this.system.slots || 1) : [];
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    if (this.type === "village") return;

    if (this.type === "equipment") {
      if (!canEquip(this)) this.system.isEquipped = false;
      this.occupiedSlots = this.getOccupiedSlots();
      const qty = this.system.quantity != null ? Math.max(0, Number(this.system.quantity)) : 1;
      const maxStack = Math.max(1, Number(this.system.maxStack) || 1);
      this.stackPercent = Math.min(100, Math.max(0, Math.round((qty / maxStack) * 100)));

      const consumable = this.system.consumable;
      if (consumable?.usageDice && !consumable.maxUD) {
        const match = consumable.usageDice.match(/\d+/);
        if (match) {
          const udNum = parseInt(match[0], 10);
          consumable.maxUD = udNum;
          if (consumable.currentUD == null) consumable.currentUD = udNum;
        }
      }

      // Greed Bonus calculations & tiers
      const greed = Number(this.system.greedBonus) || 0;
      if (greed >= 30) {
        this.greedTier = "gold";
        this.greedTierLabel = "Gold";
      } else if (greed >= 20) {
        this.greedTier = "silver";
        this.greedTierLabel = "Silver";
      } else if (greed >= 10) {
        this.greedTier = "bronze";
        this.greedTierLabel = "Bronze";
      } else {
        this.greedTier = null;
        this.greedTierLabel = "";
      }

      const baseCost = Number(this.system.cost) || 0;
      if (baseCost > 0 && greed > 0) {
        this.greedBonusGc = Math.round(baseCost * (greed / 100));
        this.effectiveCost = baseCost + this.greedBonusGc;
      } else {
        this.greedBonusGc = 0;
        this.effectiveCost = baseCost;
      }
    }
  }

  /**
   * Quick-cycles the greed bonus on this item: 0 -> 10% (Bronze) -> 20% (Silver) -> 30% (Gold) -> 0
   */
  async cycleGreedBonus() {
    if (this.type !== "equipment") return;
    const current = Number(this.system.greedBonus) || 0;
    let next = 0;
    if (current === 0) next = 10;
    else if (current === 10) next = 20;
    else if (current === 20 || current === 15) next = 30;
    else next = 0;

    await this.update({ "system.greedBonus": next });
    return next;
  }
}

