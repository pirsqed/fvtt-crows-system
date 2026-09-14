import { supplyUpdate } from "./supplies.mjs";
import { activeDefense, canEquip, woundCapacity, woundMap, woundUpdate, woundStats } from "./equipment-rules.mjs";
import { beltCapacity, canChangeTraitBelt, traitBeltCount, goldTotal } from "./inventory.mjs";

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
    if (!rawDamage || typeof rawDamage !== "string") return rawDamage || "No Damage";
    
    const chars = this.system?.characteristics || { strength: 0, agility: 0, mind: 0 };
    const charValues = {
      s: chars.strength ?? 0,
      str: chars.strength ?? 0,
      strength: chars.strength ?? 0,
      a: chars.agility ?? 0,
      agi: chars.agility ?? 0,
      agility: chars.agility ?? 0,
      m: chars.mind ?? 0,
      mnd: chars.mind ?? 0,
      mind: chars.mind ?? 0
    };

    // Regex to detect pattern like "7 + S", "4 + A", "2 + A or S", "3 + Strength", etc.
    const regex = /(\d+)\s*\+\s*(a\s+or\s+s|s\s+or\s+a|strength|agility|mind|str|agi|mnd|[samSAM])\b/i;
    const match = rawDamage.match(regex);

    if (match) {
      const baseNum = parseInt(match[1], 10);
      const charRef = match[2].toLowerCase().trim();
      let bonus = 0;

      if (charRef === "a or s" || charRef === "s or a") {
        if (charKey === "agility" || charKey === "strength") {
          bonus = chars[charKey] ?? 0;
        } else {
          bonus = Math.max(chars.agility ?? 0, chars.strength ?? 0);
        }
      } else {
        bonus = charValues[charRef] ?? (chars[charKey] ?? 0);
      }

      const totalDmg = Math.max(0, baseNum + bonus);
      const remainder = rawDamage.replace(match[0], "").replace(/\b(dam|damage)\b/i, "").trim();
      const cleanRemainder = remainder ? ` ${remainder}` : "";

      return `<strong>${totalDmg} Damage</strong>${cleanRemainder} <span class="formula" style="font-size: 0.85em; opacity: 0.85;">(${match[0].trim()})</span>`;
    }

    // Check for flat number damage e.g. "6" or "6 dam" or "4 (Bleed)"
    const flatMatch = rawDamage.match(/^(\d+)(\s*dam|\s*damage)?(.*)$/i);
    if (flatMatch) {
      const totalDmg = flatMatch[1];
      const rest = flatMatch[3].trim();
      const cleanRest = rest ? ` ${rest}` : "";
      return `<strong>${totalDmg} Damage</strong>${cleanRest}`;
    }

    return rawDamage;
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
    if (!rawDamage) return 0;
    if (typeof rawDamage === "number") return rawDamage;
    const str = String(rawDamage);

    const chars = this.system?.characteristics || { strength: 0, agility: 0, mind: 0 };
    const charValues = {
      s: chars.strength ?? 0,
      str: chars.strength ?? 0,
      strength: chars.strength ?? 0,
      a: chars.agility ?? 0,
      agi: chars.agility ?? 0,
      agility: chars.agility ?? 0,
      m: chars.mind ?? 0,
      mnd: chars.mind ?? 0,
      mind: chars.mind ?? 0
    };

    const regex = /(\d+)\s*\+\s*(a\s+or\s+s|s\s+or\s+a|strength|agility|mind|str|agi|mnd|[samSAM])\b/i;
    const match = str.match(regex);
    if (match) {
      const baseNum = parseInt(match[1], 10) || 0;
      const charRef = match[2].toLowerCase().trim();
      let bonus = 0;
      if (charRef === "a or s" || charRef === "s or a") {
        if (charKey === "agility" || charKey === "strength") {
          bonus = chars[charKey] ?? 0;
        } else {
          bonus = Math.max(chars.agility ?? 0, chars.strength ?? 0);
        }
      } else {
        bonus = charValues[charRef] ?? (chars[charKey] ?? 0);
      }
      return Math.max(0, baseNum + bonus);
    }

    const flatMatch = str.match(/\b(\d+)\b/);
    if (flatMatch) {
      return parseInt(flatMatch[1], 10) || 0;
    }

    return 0;
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
  async openDamageAllocationDialog(initialDamage = 1, { commit } = {}) {
    const isCrow = this.type === "crow";
    const hasWounds = woundCapacity(this) > 0;
    const system = this.system;
    let initialDmg = Math.max(1, parseInt(initialDamage, 10) || 1);

    // Collect available active AD items
    let orderedItemSources = [];
    for (const item of this.items) {
      if (item.system?.isArmor) {
        const isEquipped = item.system.isEquipped !== false;
        const loc = item.system.location || "backpack1";
        const isStowed = loc === "ground" || loc === "stash";
        const currentAD = Number(item.system.armor?.defense) || 0;
        const maxAD = Number(item.system.armor?.maxDefense) || currentAD;
        const isActive = activeDefense(item);

        orderedItemSources.push({
          id: item.id,
          name: item.name,
          ad: currentAD,
          maxAD: maxAD,
          active: isActive,
          enabled: isActive && currentAD > 0
        });
      }
    }

    let useTempAD = (Number(system.tempAD) || 0) > 0;

    const renderDialogContent = () => {
      const curTempAD = Number(this.system?.tempAD) || 0;
      const curStamina = Number(this.system?.stamina?.value) ?? 10;
      const maxStamina = Number(this.system?.stamina?.max) ?? 10;
      const totalAD = this.system?.totalAD || 0;
      const totalWounds = this.system?.totalWounds || 0;

      let sourcesListHtml = "";
      if (orderedItemSources.length === 0 && curTempAD === 0) {
        sourcesListHtml = `<div class="ad-empty-msg"><em>No active AD sources available (no equipped armor, shields, or weapons with AD). Damage will apply directly to Stamina.</em></div>`;
      } else {
        sourcesListHtml = orderedItemSources.map((s, idx) => {
          return `
            <div class="ad-source-row flexrow ${s.enabled ? 'active' : 'inactive'}" data-item-id="${s.id}" data-index="${idx}">
              <div class="ad-order-controls flexcol">
                <button type="button" class="btn-reorder btn-move-up" data-index="${idx}" ${idx === 0 ? 'disabled' : ''} title="Move Up (Absorb earlier)">▲</button>
                <button type="button" class="btn-reorder btn-move-down" data-index="${idx}" ${idx === orderedItemSources.length - 1 ? 'disabled' : ''} title="Move Down (Absorb later)">▼</button>
              </div>
              <label class="toggle-source-chk-lbl" title="Include/Exclude this item from absorbing damage">
                <input type="checkbox" class="chk-toggle-source" data-index="${idx}" ${s.enabled ? 'checked' : ''} ${s.active ? "" : "disabled"} />
              </label>
              <div class="ad-source-main flexcol">
                <div class="ad-source-title flexrow">
                  <strong>${s.name}</strong>
                  <span class="badge armor ${s.active ? 'worn' : 'stowed'}">${s.active ? 'Equipped' : 'Stowed'}</span>
                </div>
                <div class="ad-source-bar-wrapper flexrow">
                  <span class="ad-source-val">AD: <strong>${s.ad}</strong> / ${s.maxAD}</span>
                  <div class="ad-meter"><div class="ad-meter-fill" style="width: ${s.maxAD > 0 ? (s.ad / s.maxAD) * 100 : 0}%"></div></div>
                </div>
              </div>
              <div class="ad-single-repair-box">
                <button type="button" class="btn-repair-single-modal" data-item-id="${s.id}" title="Restore this item to full (${s.maxAD} AD)">
                  <i class="fas fa-hammer"></i> Full Repair
                </button>
              </div>
            </div>
          `;
        }).join("");
      }

      return `
        <form class="crows-dialog-form ad-manager-dialog flexcol">
          <div class="ad-manager-header flexrow">
            <div class="ad-stat-box flexcol">
              <span class="stat-lbl"><i class="fas fa-shield-alt"></i> Total Active AD</span>
              <span class="stat-num ad-total-display">${totalAD}</span>
            </div>
            <div class="ad-stat-box flexcol stamina">
              <span class="stat-lbl"><i class="fas fa-heart"></i> Stamina</span>
              <span class="stat-num">${curStamina} / ${maxStamina}</span>
            </div>
            ${hasWounds ? `
            <div class="ad-stat-box flexcol wounds ${totalWounds >= woundCapacity(this) - 2 ? 'critical' : ''}">
              <span class="stat-lbl"><i class="fas fa-skull"></i> Wounds</span>
              <span class="stat-num">${totalWounds} / ${woundCapacity(this)}</span>
            </div>
            ` : ''}
          </div>

          <!-- Reorderable AD Priority List -->
          <div class="ad-section-title flexrow">
            <h4><i class="fas fa-layer-group"></i> AD Absorption Priority (Use ▲ / ▼ to Reorder)</h4>
          </div>

          ${curTempAD > 0 ? `
          <div class="temp-ad-source-bar flexrow ${useTempAD ? 'active' : 'inactive'}">
            <label class="toggle-source-chk-lbl" title="Absorb with Temporary Magic AD first">
              <input type="checkbox" id="chk-use-temp-ad" ${useTempAD ? 'checked' : ''} />
            </label>
            <div class="flexcol" style="flex:1;">
              <div class="flexrow" style="justify-content:space-between; align-items:center;">
                <strong><i class="fas fa-sparkles"></i> Temporary / Magic AD</strong>
                <span class="badge temp">Temp AD: <b>${curTempAD}</b></span>
              </div>
            </div>
            <button type="button" class="btn-clear-temp-modal" title="Clear Temp AD"><i class="fas fa-times"></i> Clear</button>
          </div>
          ` : ''}

          <div class="ad-sources-list flexcol">
            ${sourcesListHtml}
          </div>

          <div class="temp-ad-setter flexrow" style="gap:6px; align-items:center; margin-top:4px; font-size:0.85rem;">
            <label><i class="fas fa-wand-magic-sparkles"></i> Set Temp Magic AD:</label>
            <input type="number" id="dialog-temp-ad-input" value="${curTempAD}" min="0" style="width:55px; text-align:center;" />
            <button type="button" id="dialog-save-temp-btn" class="btn-dialog-small"><i class="fas fa-save"></i> Set</button>
          </div>

          <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 8px 0;" />

          <!-- Damage Allocator Calculator -->
          <div class="damage-allocation-box flexcol">
            <div class="allocation-title flexrow">
              <h4><i class="fas fa-swords"></i> Allocate Incoming Damage</h4>
              <span class="alloc-hint">Temp AD ➔ Reordered AD Items ➔ Stamina ➔ Wounds</span>
            </div>
            
            <div class="alloc-input-row flexrow">
              <label for="incoming-dmg-val">Incoming Damage:</label>
              <input type="number" id="incoming-dmg-val" value="${initialDmg}" min="1" style="width: 75px; font-weight: bold; font-size: 1.15rem; text-align: center;" />
              <button type="button" id="btn-apply-damage-alloc" class="btn-danger-action">
                <i class="fas fa-shield-virus"></i> Absorb & Apply Damage
              </button>
            </div>

            <div id="damage-preview-breakdown" class="damage-preview-breakdown">
              <!-- Dynamic live calculation preview rendered here -->
            </div>
          </div>
        </form>
      `;
    };

    const dialog = new Dialog({
      title: `Armor Defense (AD) & Damage Allocation: ${this.name}`,
      content: renderDialogContent(),
      buttons: {
        restoreAll: {
          icon: '<i class="fas fa-hammer"></i>',
          label: "Repair All Items",
          callback: async () => {
            await this.repairAllArmor();
            ui.notifications.info(`Restored all ${this.name}'s items with AD to full!`);
            if (this.sheet) this.sheet.render(false);
          }
        },
        close: {
          label: "Close"
        }
      },
      default: "close",
      render: (html) => {
        const $html = html instanceof jQuery ? html : $(html);

        const calculateAllocation = () => {
          const dmg = parseInt($html.find("#incoming-dmg-val").val(), 10) || 0;
          let remaining = dmg;
          const breakdown = [];
          let tempAbsorbed = 0;
          const itemAllocs = [];

          // 1. Temp AD
          const curTemp = Number(this.system?.tempAD) || 0;
          if (useTempAD && curTemp > 0 && remaining > 0) {
            tempAbsorbed = Math.min(curTemp, remaining);
            remaining -= tempAbsorbed;
            breakdown.push({
              source: "Temporary Magic AD",
              absorbed: tempAbsorbed,
              remainingAD: curTemp - tempAbsorbed,
              type: "temp"
            });
          }

          // 2. Ordered Items
          for (const s of orderedItemSources) {
            if (s.active && s.enabled && s.ad > 0 && remaining > 0) {
              const abs = Math.min(s.ad, remaining);
              remaining -= abs;
              const newDef = s.ad - abs;
              itemAllocs.push({
                itemId: s.id,
                name: s.name,
                absorbed: abs,
                newDefense: newDef,
                maxAD: s.maxAD
              });
              breakdown.push({
                source: s.name,
                absorbed: abs,
                remainingAD: newDef,
                maxAD: s.maxAD,
                type: "item"
              });
            }
          }

          // 3. Stamina
          const curStamina = Number(this.system?.stamina?.value) ?? 10;
          let staminaDmg = 0;
          let woundsCount = 0;

          if (remaining > 0) {
            staminaDmg = Math.min(curStamina, remaining);
            const remainingAfterStamina = remaining - staminaDmg;
            const newStam = curStamina - staminaDmg;

            breakdown.push({
              source: "Stamina",
              absorbed: staminaDmg,
              remainingAD: newStam,
              maxAD: Number(this.system?.stamina?.max) ?? 10,
              type: "stamina"
            });

            // 4. Wounds
            if (remainingAfterStamina > 0) {
              woundsCount = remainingAfterStamina;
              breakdown.push({
                source: hasWounds ? "Backpack Wounds" : "Excess Damage (Dead/Defeated)",
                absorbed: remainingAfterStamina,
                woundsCount: woundsCount,
                type: "wounds"
              });
            }
          }

          return {
            damageTotal: dmg,
            tempADAbsorbed: tempAbsorbed,
            itemAllocations: itemAllocs,
            staminaDamage: staminaDmg,
            woundsCount: woundsCount,
            breakdown: breakdown,
            unabsorbedDamage: remaining
          };
        };

        const updatePreviewUI = () => {
          const alloc = calculateAllocation();
          const lines = [];

          if (alloc.damageTotal <= 0) {
            $html.find("#damage-preview-breakdown").html(`<span class="preview-line">Enter damage amount above to preview absorption.</span>`);
            return;
          }

          for (const b of alloc.breakdown) {
            if (b.type === "temp") {
              lines.push(`<span class="preview-step"><i class="fas fa-sparkles"></i> Temp AD absorbs <b>${b.absorbed}</b> (remains ${b.remainingAD})</span>`);
            } else if (b.type === "item") {
              lines.push(`<span class="preview-step"><i class="fas fa-shield-alt"></i> ${b.source} absorbs <b>${b.absorbed}</b> (becomes ${b.remainingAD}/${b.maxAD})</span>`);
            } else if (b.type === "stamina") {
              lines.push(`<span class="preview-step danger"><i class="fas fa-heart-crack"></i> Stamina takes <b>${b.absorbed} damage</b> (${this.system.stamina.value} ➔ ${b.remainingAD})</span>`);
            } else if (b.type === "wounds") {
              if (hasWounds) {
                lines.push(`<span class="preview-step critical"><i class="fas fa-skull"></i> <b>${b.woundsCount} Excess Damage</b> inflicts <b>+${b.woundsCount} Backpack Wounds!</b></span>`);
              } else {
                lines.push(`<span class="preview-step critical"><i class="fas fa-skull"></i> <b>${b.woundsCount} Excess Damage</b> &bull; Target Defeated!</span>`);
              }
            }
          }

          if (alloc.staminaDamage === 0 && alloc.woundsCount === 0) {
            lines.push(`<span class="preview-step success"><i class="fas fa-check-circle"></i> All <b>${alloc.damageTotal} damage</b> completely absorbed by AD! (0 to Stamina)</span>`);
          }

          $html.find("#damage-preview-breakdown").html(lines.join(""));
        };

        const bindEvents = () => {
          $html.find("#incoming-dmg-val").on("input change", updatePreviewUI);

          // Temp AD toggle
          $html.find("#chk-use-temp-ad").change((ev) => {
            useTempAD = $(ev.currentTarget).is(":checked");
            updatePreviewUI();
          });

          // Source toggle
          $html.find(".chk-toggle-source").change((ev) => {
            const idx = parseInt($(ev.currentTarget).data("index"), 10);
            if (orderedItemSources[idx]) {
              orderedItemSources[idx].enabled = $(ev.currentTarget).is(":checked");
              const row = $html.find(`.ad-source-row[data-index="${idx}"]`);
              row.toggleClass("active", orderedItemSources[idx].enabled);
              row.toggleClass("inactive", !orderedItemSources[idx].enabled);
              updatePreviewUI();
            }
          });

          // Move Up
          $html.find(".btn-move-up").click((ev) => {
            ev.preventDefault();
            const idx = parseInt($(ev.currentTarget).data("index"), 10);
            if (idx > 0) {
              const temp = orderedItemSources[idx];
              orderedItemSources[idx] = orderedItemSources[idx - 1];
              orderedItemSources[idx - 1] = temp;
              initialDmg = parseInt($html.find("#incoming-dmg-val").val(), 10) || 1;
              $html.find(".ad-manager-dialog").replaceWith(renderDialogContent());
              bindEvents();
              updatePreviewUI();
            }
          });

          // Move Down
          $html.find(".btn-move-down").click((ev) => {
            ev.preventDefault();
            const idx = parseInt($(ev.currentTarget).data("index"), 10);
            if (idx < orderedItemSources.length - 1) {
              const temp = orderedItemSources[idx];
              orderedItemSources[idx] = orderedItemSources[idx + 1];
              orderedItemSources[idx + 1] = temp;
              initialDmg = parseInt($html.find("#incoming-dmg-val").val(), 10) || 1;
              $html.find(".ad-manager-dialog").replaceWith(renderDialogContent());
              bindEvents();
              updatePreviewUI();
            }
          });

          // Single Item Repair
          $html.find(".btn-repair-single-modal").click(async (ev) => {
            ev.preventDefault();
            const itemId = $(ev.currentTarget).data("itemId");
            await this.repairArmor(itemId);
            ui.notifications.info("Repaired item to full AD.");
            const itemObj = orderedItemSources.find(i => i.id === itemId);
            if (itemObj) {
              itemObj.ad = itemObj.maxAD;
              itemObj.enabled = true;
            }
            $html.find(".ad-manager-dialog").replaceWith(renderDialogContent());
            bindEvents();
            updatePreviewUI();
          });

          // Set Temp AD
          $html.find("#dialog-save-temp-btn").click(async (ev) => {
            ev.preventDefault();
            const val = parseInt($html.find("#dialog-temp-ad-input").val(), 10) || 0;
            await this.update({ "system.tempAD": Math.max(0, val) });
            useTempAD = val > 0;
            ui.notifications.info(`Set Temporary Magic AD to ${val}.`);
            $html.find(".ad-manager-dialog").replaceWith(renderDialogContent());
            bindEvents();
            updatePreviewUI();
          });

          // Clear Temp AD
          $html.find(".btn-clear-temp-modal").click(async (ev) => {
            ev.preventDefault();
            await this.update({ "system.tempAD": 0 });
            useTempAD = false;
            ui.notifications.info("Cleared Temporary Magic AD.");
            $html.find(".ad-manager-dialog").replaceWith(renderDialogContent());
            bindEvents();
            updatePreviewUI();
          });

          // Absorb & Apply Damage
          $html.find("#btn-apply-damage-alloc").click(async (ev) => {
            ev.preventDefault();
            const alloc = calculateAllocation();
            if (alloc.damageTotal <= 0) return;

            const button = ev.currentTarget;
            if (button.disabled) return;
            button.disabled = true;
            let result;
            try { result = await (commit ? commit(alloc) : this.applyAllocatedDamage(alloc)); }
            catch (err) { button.disabled = false; ui.notifications.warn(err.message); return; }
            if (!result) { button.disabled = false; return; }

            let breakdownHtml = result.breakdown.map(b => {
              if (b.type === "wounds") {
                return `
                  <div class="alloc-row" style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:0.85rem; color:#fca5a5;">
                    <span><strong><i class="fas fa-skull"></i> ${b.source}:</strong> +${b.woundsCount} Wounds</span>
                    <span>${result.woundedSlotNames?.length ? result.woundedSlotNames.join(", ") : ""}</span>
                  </div>
                `;
              }
              return `
                <div class="alloc-row" style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:0.85rem;">
                  <span><strong>${b.source}:</strong> Absorbed <b>${b.absorbed}</b></span>
                  <span style="color:#94a3b8;">Remaining: ${b.remainingAD}${b.maxAD !== undefined ? `/${b.maxAD}` : ''}</span>
                </div>
              `;
            }).join("");

            let outcomeClass = "success";
            let outcomeText = `<i class="fas fa-shield-alt"></i> All damage fully absorbed by AD!`;
            if (result.woundsCount > 0) {
              outcomeClass = "failure";
              outcomeText = `<i class="fas fa-skull"></i> Stamina Broken! Took ${result.woundsCount} Wound(s) (${result.woundedSlotNames.join(", ")})`;
            } else if (result.staminaDamage > 0) {
              outcomeClass = "failure";
              outcomeText = `<i class="fas fa-heart-crack"></i> ${result.staminaDamage} damage punched through to Stamina!`;
            }

            let cardHtml = "";
            if (isCrow) {
              // Detailed breakdown for player characters (Crows)
              cardHtml = `
                <div class="crows-roll-card damage-card">
                  <div class="card-header danger">
                    <i class="fas fa-shield-virus"></i> Damage Absorbed (${alloc.damageTotal} Total Damage)
                  </div>
                  <div class="card-body">
                    <div style="margin-bottom:8px;">
                      <strong>${this.name}</strong> took <strong>${alloc.damageTotal} damage</strong>:
                    </div>
                    <div style="background:rgba(0,0,0,0.35); padding:8px; border-radius:4px; border:1px solid rgba(255,255,255,0.08); margin-bottom:8px;">
                      ${breakdownHtml}
                    </div>
                    <div class="outcome ${outcomeClass}">
                      ${outcomeText}
                    </div>
                  </div>
                </div>
              `;
            } else {
              // Minimal card for monsters to prevent stat and death spoilers for players
              cardHtml = `
                <div class="crows-roll-card damage-card">
                  <div class="card-header danger">
                    <i class="fas fa-shield-virus"></i> Damage Dealt
                  </div>
                  <div class="card-body">
                    <div style="font-size: 1.05rem; margin-bottom: 2px;">
                      <strong>${this.name}</strong> took <span style="color:#f87171; font-weight: bold;">${alloc.damageTotal} damage</span>.
                    </div>
                  </div>
                </div>
              `;
            }

            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: this }),
              flavor: `Damage on ${this.name}`,
              content: cardHtml
            });

            // If it's a monster, whisper internal stamina & defeat status to GMs only
            if (!isCrow) {
              const gmUsers = game.users.filter(u => u.isGM).map(u => u.id);
              if (gmUsers.length > 0) {
                const curStam = Number(this.system?.stamina?.value) ?? 0;
                const maxStam = Number(this.system?.stamina?.max) ?? 10;
                const isDefeated = hasWounds ? this.system.isDead : curStam <= 0;
                const gmContent = `
                  <div style="font-size: 0.85rem; color: #cbd5e1; background: rgba(15, 23, 42, 0.7); padding: 8px; border-radius: 4px; border: 1px solid rgba(239, 68, 68, 0.3);">
                    <div style="font-weight: bold; margin-bottom: 4px;"><i class="fas fa-eye"></i> [GM Info] ${this.name}</div>
                    <div>Took <strong>${alloc.damageTotal} damage</strong> &bull; Remaining Stamina: <b>${curStam} / ${maxStam}</b></div>
                    ${isDefeated ? `<div style="color: #ef4444; font-weight: bold; margin-top: 4px;"><i class="fas fa-skull"></i> ${hasWounds ? "All inventory slots wounded" : "Stamina reached 0"} (${this.name} defeated / dead)!</div>` : ''}
                  </div>
                `;
                await ChatMessage.create({
                  whisper: gmUsers,
                  speaker: ChatMessage.getSpeaker({ actor: this }),
                  flavor: `GM Damage Log: ${this.name}`,
                  content: gmContent
                });
              }
            }

            dialog.close();
            if (this.sheet) this.sheet.render(false);
          });
        };

        bindEvents();
        updatePreviewUI();
      }
    }, { width: 540, classes: ["crows", "dialog", "crows-dialog", "ad-manager"] });

    dialog.render(true);
  }

  /**
   * Applies incoming damage through active AD sources (Temp AD -> Equipped AD Items -> Stamina)
   * @param {number} damageAmount - Incoming damage integer
   * @returns {Promise<{damageTotal: number, absorbedByAD: number, leftoverToStamina: number, breakdown: Array}>}
   */
  async applyDamage(damageAmount) {
    const dmg = Number(damageAmount);
    if (!dmg || dmg <= 0) return null;

    let remainingDamage = dmg;
    const breakdown = [];
    const itemUpdates = [];
    const actorUpdates = {};

    // 1. Temporary AD
    const currentTemp = Number(this.system?.tempAD) || 0;
    if (currentTemp > 0 && remainingDamage > 0) {
      const absorbed = Math.min(currentTemp, remainingDamage);
      remainingDamage -= absorbed;
      const newTemp = currentTemp - absorbed;
      actorUpdates["system.tempAD"] = newTemp;
      breakdown.push({
        source: "Temporary / Magic AD",
        absorbed: absorbed,
        remainingAD: newTemp
      });
    }

    // 2. Equipped Items with AD (Armor, Shields, Parry Weapons)
    for (const source of (this.system?.adSources || [])) {
      if (source.type === "armor" && source.active && remainingDamage > 0) {
        const item = this.items.get(source.id);
        if (item) {
          const itemAD = Number(item.system?.armor?.defense) || 0;
          if (itemAD > 0) {
            const absorbed = Math.min(itemAD, remainingDamage);
            remainingDamage -= absorbed;
            const newDefense = Math.max(0, itemAD - absorbed);
            const maxAD = Number(item.system?.armor?.maxDefense) || itemAD;
            itemUpdates.push({
              item: item,
              defense: newDefense
            });
            breakdown.push({
              source: item.name,
              absorbed: absorbed,
              remainingAD: newDefense,
              maxAD: maxAD
            });
          }
        }
      }
    }

    // 3. Remaining Damage to Stamina
    let woundsCount = 0;
    const woundedSlotNames = [];
    if (remainingDamage > 0) {
      const currentStamina = Number(this.system?.stamina?.value) ?? 10;
      const staminaDamage = Math.min(currentStamina, remainingDamage);
      const newStamina = currentStamina - staminaDamage;
      actorUpdates["system.stamina.value"] = newStamina;

      breakdown.push({
        source: "Stamina",
        absorbed: staminaDamage,
        remainingAD: newStamina,
        maxAD: Number(this.system?.stamina?.max) ?? 10
      });

      const excess = remainingDamage - staminaDamage;
      if (excess > 0 && woundCapacity(this) > 0) {
        woundsCount = excess;
        const woundedSlots = woundMap(this);
        let rem = excess;
        for (let i = 1; i <= woundCapacity(this) && rem > 0; i++) {
          const key = `slot${i}`;
          if (!woundedSlots[key]) {
            woundedSlots[key] = true;
            woundedSlotNames.push(`Slot ${i}`);
            rem--;
          }
        }
        Object.assign(actorUpdates, woundUpdate(this, woundedSlots));
        breakdown.push({
          source: "Backpack Wounds",
          absorbed: excess,
          woundsCount: woundsCount
        });
      }
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
      damageTotal: dmg,
      absorbedByAD: dmg - remainingDamage,
      leftoverToStamina: remainingDamage,
      woundsCount: woundsCount,
      woundedSlotNames: woundedSlotNames,
      breakdown: breakdown
    };
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
    if (this.type !== "equipment") return [];
    const location = this.system?.location || "backpack1";
    const slotCount = Math.max(1, parseInt(this.system?.slots, 10) || 1);

    if (location.startsWith("backpack") || location.startsWith("slot") || location.startsWith("belt")) {
      const match = location.match(/^(backpack|slot|belt)(\d+)$/);
      if (match) {
        const prefix = match[1];
        const startNum = parseInt(match[2], 10);
        const maxSlots = prefix === "belt" ? beltCapacity(this.actor) : Math.max(10, Number(this.actor?.system?.slots) || 10);
        const slots = [];
        for (let i = 0; i < slotCount; i++) {
          const num = startNum + i;
          if (num <= maxSlots) {
            slots.push(`${prefix}${num}`);
          }
        }
        return slots.length > 0 ? slots : [location];
      }
    } else if (location === "hand1" && slotCount >= 2) {
      return ["hand1", "hand2"];
    }

    return [location];
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

