import { canEquip } from "../equipment-rules.mjs";
import { showSpellcastDialog } from "../spellcasting.mjs";
import { canStack, goldStack, restoreUsageDice } from "../inventory.mjs";
import { createRollState, rollFlags, renderRollState } from "../chat-state.mjs";
import { showWeaponAttackDialog } from "../attacks.mjs";
import { rollPowerRoll } from "../power-roll.mjs";
import { CrowsLoot } from "../loot.mjs";

export const EXPERTISES_CONFIG = {
  general: [
    { key: "alchemy", label: "Alchemy", hint: "Make and know about potions, poisons, and bombs" },
    { key: "athletics", label: "Athletics", hint: "Climb, jump, and swim" },
    { key: "blacksmithing", label: "Blacksmithing", hint: "Make and know about metal tools, armor, and weapons" },
    { key: "enchanting", label: "Enchanting", hint: "Make and know about magic items" },
    { key: "endurance", label: "Endurance", hint: "Remain engaged in strenuous physical or mental activity for a long time period" },
    { key: "gymnastics", label: "Gymnastics", hint: "Move across unsteady or narrow surfaces; tumble" },
    { key: "handlePet", label: "Handle Pet", hint: "Interact with pets" },
    { key: "historicalLore", label: "Historical Lore", hint: "Know about significant past events" },
    { key: "lift", label: "Lift", hint: "Pick up, carry, and throw heavy objects" },
    { key: "magicLore", label: "Magic Lore", hint: "Know about magical places, spells, items, and phenomena" },
    { key: "monsterLore", label: "Monster Lore", hint: "Know monster ecology, strengths, and weaknesses" },
    { key: "natureLore", label: "Nature Lore", hint: "Know about natural flora, fauna, and weather" },
    { key: "navigate", label: "Navigate", hint: "Travel without getting lost" },
    { key: "pickLock", label: "Pick Lock", hint: "Open a lock without the key" },
    { key: "religiousLore", label: "Religious Lore", hint: "Know about religious mythology and practices" },
    { key: "search", label: "Search", hint: "Search an environment for important details and items" },
    { key: "stealth", label: "Stealth", hint: "Hide and sneak" },
    { key: "thievery", label: "Thievery", hint: "Disable mechanical devices, open locks, pick pockets, and general sleight of hand" }
  ],
  spellcasting: [
    { key: "alteration", label: "Alteration", hint: "Cast alteration spells" },
    { key: "benefaction", label: "Benefaction", hint: "Cast benefaction spells" },
    { key: "conjuration", label: "Conjuration", hint: "Cast conjuration spells" },
    { key: "elemental", label: "Elemental", hint: "Cast elemental spells" },
    { key: "illusion", label: "Illusion", hint: "Cast illusion spells" },
    { key: "necromancy", label: "Necromancy", hint: "Cast necromancy spells" }
  ],
  weapon: [
    { key: "bashing", label: "Bashing", hint: "Attack with bashing weapons" },
    { key: "bow", label: "Bow", hint: "Attack with bow weapons" },
    { key: "chopping", label: "Chopping", hint: "Attack with chopping weapons" },
    { key: "slashing", label: "Slashing", hint: "Attack with slashing weapons" },
    { key: "stabbing", label: "Stabbing", hint: "Attack with stabbing weapons" },
    { key: "unarmed", label: "Unarmed", hint: "Attack with natural weapons" }
  ]
};

export const MIASMA_EFFECTS_TABLE = [
  {
    min: 1, max: 2,
    title: "Despondent",
    firstEffect: "You become despondent. You only speak if spoken to first and give one-word responses until you exit the Miasma.",
    secondEffect: "You have an edge on tests made to sneak or hide."
  },
  {
    min: 3, max: 4,
    title: "Ravenous and Greedy",
    firstEffect: "You become ravenous and greedy. You must eat at least 2 rations during a rest to get the benefits of a rest until you are out of the Miasma.",
    secondEffect: "Your ravenous nature makes you good at finding food. You gain a +2 bonus on tests made related to the forage role."
  },
  {
    min: 5, max: 6,
    title: "Destructive Rage",
    firstEffect: "You enter a destructive rage and destroy one mundane item randomly chosen by the Ref from your backpack.",
    secondEffect: "Destroying something makes you feel good. You regain 3 Stamina or, if your Stamina is full, lose 1 wound."
  },
  {
    min: 7, max: 8,
    title: "Deceitful",
    firstEffect: "You become deceitful for the sake of it. You only communicate in lies and try to get away with it until you are out of the Miasma.",
    secondEffect: "You lie even to yourself. Choose an expertise you do not have. You gain that expertise."
  },
  {
    min: 9, max: 10,
    title: "Lazy",
    firstEffect: "You become lazy. You refuse to have any travel role until you are out of the Miasma.",
    secondEffect: "When you rest, you recover 2 wounds instead of 1."
  },
  {
    min: 11, max: 12,
    title: "Relish Violence",
    firstEffect: "You relish violence. In combat, you must keep pursuing and fighting your foes until you can no longer sense them. This effect ends when you no longer have cruelty.",
    secondEffect: "Your relish in violence gives you a +1 damage bonus on weapon attacks."
  },
  {
    min: 13, max: 999,
    title: "Full Corruption (NPC)",
    firstEffect: "All of your other Miasma effects end and all your levels of cruelty disappear. You can't suffer any new Miasma effects and are permanently selfish and cruel. You become an NPC controlled by the Ref.",
    secondEffect: "Finishing a rest in the Miasma regains the uses of your expertises."
  }
];

export class CrowsActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["crows", "sheet", "actor"],
      template: "systems/fvtt-crows-system/templates/actor-sheet.html",
      width: 1100,
      height: 750,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "inventory" }],
      dragDrop: [{ dragSelector: ".item, .slot-card.occupied, .storage-item", dropSelector: null }]
    });
  }

  async getData() {
    const context = await super.getData();
    context.system = this.actor.system;
    context.owner = this.actor.isOwner;
    context.editable = this.isEditable;
    context.enrichedBiography = await TextEditor.enrichHTML(this.actor.system.biography || "", {async: true});
    
    const items = (context.items || []).map(item => {
      const document = this.actor.items.get(item._id);
      const rawQty = document?.system?.quantity ?? item.system.quantity;
      const qty = rawQty != null ? Math.max(0, Number(rawQty)) : 1;
      const maxStack = Math.max(1, Number(document?.system?.maxStack ?? item.system.maxStack) || 1);
      const stackPercent = Math.min(100, Math.max(0, Math.round((qty / maxStack) * 100)));
      return { ...item, system: document?.toObject?.(false).system ?? item.system, greedTier: document?.greedTier, greedTierLabel: document?.greedTierLabel,
        greedBonusGc: document?.greedBonusGc, effectiveCost: document?.effectiveCost, stackPercent: stackPercent };
    });
    context.items = items;
    const woundedSlots = this.actor.system.woundedSlots || {};

    // 1. Hands (Wielded / Active)
    const hand1Item = items.find(i => i.system.location === "hand1");
    const hand2Item = items.find(i => i.system.location === "hand2");
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

    // 2. Belt Slots (4 Quick Access Slots with Merged Spans for Multi-Slot Items)
    const anchorItemsByBelt = {};
    for (const item of items) {
      const loc = item.system.location;
      if (loc && loc.startsWith("belt")) {
        const match = loc.match(/^belt(\d+)$/);
        if (match) {
          anchorItemsByBelt[parseInt(match[1], 10)] = item;
        }
      }
    }

    context.beltSlots = [];
    let b = 1;
    while (b <= 4) {
      const slotId = `belt${b}`;
      const item = anchorItemsByBelt[b];
      if (item) {
        const slotsCount = Math.max(1, parseInt(item.system.slots, 10) || 1);
        const endNum = Math.min(4, b + slotsCount - 1);
        const spanCount = endNum - b + 1;

        context.beltSlots.push({
          id: slotId,
          slotNum: b,
          label: "Belt",
          item: item,
          colSpan: spanCount,
          isMergedSpan: spanCount > 1,
          spanStart: b,
          spanEnd: endNum,
          spanTotal: slotsCount
        });
        b = endNum + 1;
      } else {
        context.beltSlots.push({
          id: slotId,
          slotNum: b,
          label: "Belt",
          item: null,
          colSpan: 1,
          isMergedSpan: false
        });
        b++;
      }
    }

    // 3. Backpack Slots (1 to 10 with True CSS Grid Spans & Row Wrap Handling)
    const anchorItemsBySlot = {};
    for (const item of items) {
      const loc = item.system.location;
      if (loc && loc.startsWith("backpack")) {
        const match = loc.match(/^backpack(\d+)$/);
        if (match) {
          const slotNum = parseInt(match[1], 10);
          anchorItemsBySlot[slotNum] = item;
        }
      }
    }

    context.backpackSlots = [];
    let i = 1;
    while (i <= 10) {
      const slotId = `backpack${i}`;
      const item = anchorItemsBySlot[i];

      if (item) {
        const slotsCount = Math.max(1, parseInt(item.system.slots, 10) || 1);
        const endNum = Math.min(10, i + slotsCount - 1);
        const startRow = i <= 5 ? 1 : 2;
        const endRow = endNum <= 5 ? 1 : 2;

        if (startRow === endRow) {
          // Fits within the same row! Merge slots into a single spanned grid card
          const slotsCovered = [];
          let totalSpeedPenalty = 0;
          for (let s = i; s <= endNum; s++) {
            const isWounded = !!woundedSlots[`slot${s}`];
            if (isWounded) totalSpeedPenalty++;
            slotsCovered.push({
              slotNum: s,
              isWounded: isWounded
            });
          }

          context.backpackSlots.push({
            id: slotId,
            slotNum: i,
            label: slotsCount > 1 ? `Slots ${i}–${endNum}` : `Slot ${i}`,
            item: item,
            colSpan: slotsCount,
            isMergedSpan: slotsCount > 1,
            slotsCovered: slotsCovered,
            spanStart: i,
            spanEnd: endNum,
            spanTotal: slotsCount,
            hasSpeedPenalty: totalSpeedPenalty > 0,
            totalSpeedPenalty: totalSpeedPenalty
          });

          i = endNum + 1;
        } else {
          // Crosses the 5-6 row boundary: Row 1 head + Row 2 continuation
          const row1Span = 5 - i + 1;
          const slotsCoveredRow1 = [];
          let totalSpeedPenaltyRow1 = 0;
          for (let s = i; s <= 5; s++) {
            const isWounded = !!woundedSlots[`slot${s}`];
            if (isWounded) totalSpeedPenaltyRow1++;
            slotsCoveredRow1.push({
              slotNum: s,
              isWounded: isWounded
            });
          }

          context.backpackSlots.push({
            id: slotId,
            slotNum: i,
            label: `Slots ${i}–5 (Row 1)`,
            item: item,
            colSpan: row1Span,
            isMergedSpan: row1Span > 1,
            isRowWrapHead: true,
            slotsCovered: slotsCoveredRow1,
            spanStart: i,
            spanEnd: endNum,
            spanTotal: slotsCount,
            hasSpeedPenalty: totalSpeedPenaltyRow1 > 0,
            totalSpeedPenalty: totalSpeedPenaltyRow1
          });

          // Row 2 tail continuation (Slots 6..endNum)
          const row2Span = endNum - 6 + 1;
          const slotsCoveredRow2 = [];
          let totalSpeedPenaltyRow2 = 0;
          for (let s = 6; s <= endNum; s++) {
            const isWounded = !!woundedSlots[`slot${s}`];
            if (isWounded) totalSpeedPenaltyRow2++;
            slotsCoveredRow2.push({
              slotNum: s,
              isWounded: isWounded
            });
          }

          context.backpackSlots.push({
            id: `backpack6`,
            slotNum: 6,
            label: `Slots 6–${endNum} (Row 2)`,
            item: null,
            isSpanChild: true,
            parentItem: item,
            colSpan: row2Span,
            isMergedSpan: row2Span > 1,
            slotsCovered: slotsCoveredRow2,
            spanStart: i,
            spanEnd: endNum,
            spanTotal: slotsCount,
            hasSpeedPenalty: totalSpeedPenaltyRow2 > 0,
            totalSpeedPenalty: totalSpeedPenaltyRow2
          });

          i = endNum + 1;
        }
      } else {
        // Empty Single Slot
        const isWounded = !!woundedSlots[`slot${i}`];
        context.backpackSlots.push({
          id: slotId,
          slotNum: i,
          label: `Slot ${i}`,
          item: null,
          colSpan: 1,
          isMergedSpan: false,
          isWounded: isWounded,
          hasSpeedPenalty: false,
          slotsCovered: [{ slotNum: i, isWounded: isWounded }]
        });
        i++;
      }
    }

    // 4. Magic Attunement Doll Slots
    context.magicSlots = [
      { id: "head", label: "Head", icon: "fas fa-hat-wizard", item: items.find(i => i.system.location === "head") },
      { id: "neck", label: "Neck", icon: "fas fa-gem", item: items.find(i => i.system.location === "neck") },
      { id: "waist", label: "Waist", icon: "fas fa-ring", item: items.find(i => i.system.location === "waist") },
      { id: "gloves", label: "Arms / Hands", icon: "fas fa-mitten", item: items.find(i => i.system.location === "gloves") },
      { id: "ring", label: "Finger", icon: "fas fa-ring", item: items.find(i => i.system.location === "ring") },
      { id: "boots", label: "Feet", icon: "fas fa-shoe-prints", item: items.find(i => i.system.location === "boots") }
    ];

    // 5. Ground & Stash Lists
    context.inventoryList = {
      ground: items.filter(i => i.system.location === 'ground'),
      stash: items.filter(i => i.system.location === 'stash')
    };

    // 6. Expertises categorized (General, Spellcasting, Weapon)
    const expertisesData = this.actor.system.expertises || {};
    const legacySkills = this.actor.system.skills || {};

    const mapCategory = (list) => list.map(item => {
      let exp = expertisesData[item.key];
      if (!exp && legacySkills[item.key] !== undefined) {
        const legacyVal = Number(legacySkills[item.key]) || 0;
        exp = { value: legacyVal, max: legacyVal };
      }
      const val = exp ? Number(exp.value) || 0 : 0;
      const max = exp ? Number(exp.max) || 0 : 0;
      return {
        ...item,
        value: val,
        max: max,
        hasUses: max > 0,
        canSpend: val > 0
      };
    });

    context.expertisesList = {
      general: mapCategory(EXPERTISES_CONFIG.general),
      spellcasting: mapCategory(EXPERTISES_CONFIG.spellcasting),
      weapon: mapCategory(EXPERTISES_CONFIG.weapon)
    };

    // 7. Traits grouped by Tree
    const traitItems = items.filter(i => i.type === "trait");
    context.traitsCount = traitItems.length;

    const treeGroupsMap = {};
    for (const trait of traitItems) {
      const treeName = trait.system.tree || "General";
      if (!treeGroupsMap[treeName]) {
        treeGroupsMap[treeName] = {
          tree: treeName,
          traits: []
        };
      }
      treeGroupsMap[treeName].traits.push(trait);
    }
    context.traitsByTree = Object.values(treeGroupsMap).sort((a, b) => a.tree.localeCompare(b.tree));

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Roll handlers
    html.find('.rollable-characteristic').click(this._onRollCharacteristic.bind(this));
    html.find('.item-attack').click(this._onRollAttack.bind(this));
    html.find('.item-retrieve').click(this._onRetrieveItem.bind(this));
    html.find('.item-ud-roll').click(this._onRollUsageDice.bind(this));
    html.find('.item-ud-restore').click(event => restoreUsageDice(this.actor, event));
    html.find('.item-cast').click(event => {
      event.preventDefault(); event.stopPropagation();
      showSpellcastDialog(this.actor, this.actor.items.get(event.currentTarget.dataset.itemId));
    });

    // AD Manager Modal
    html.find('.armor-ad, .open-ad-manager').click(this._onOpenADManagerDialog.bind(this));
    html.find('.armor-equip-toggle').click(this._onToggleArmorEquip.bind(this));
    html.find('.armor-ad-plus').click(this._onAdjustArmorAD.bind(this, 1));
    html.find('.armor-ad-minus').click(this._onAdjustArmorAD.bind(this, -1));

    // Trait chat sharing
    html.find('.trait-post-chat').click(this._onPostTraitToChat.bind(this));

    // Miasma & Cruelty handlers
    html.find('.roll-miasma-test').click(this._onRollMiasmaTest.bind(this));
    html.find('.roll-miasma-effect').click(this._onRollMiasmaEffect.bind(this));
    html.find('.cruelty-qty-plus').click(this._onCrueltyAdjust.bind(this, 1));
    html.find('.cruelty-qty-minus').click(this._onCrueltyAdjust.bind(this, -1));
    html.find('.miasma-effect-delete').click(this._onDeleteMiasmaEffect.bind(this));
    html.find('.miasma-clear-cruelty').click(this._onClearCruelty.bind(this));
    html.find('.miasma-add-custom').click(this._onAddCustomMiasmaEffect.bind(this));

    // Expertise handlers
    html.find('.expertise-spend').click(this._onSpendExpertise.bind(this));
    html.find('.expertises-recover-all').click(this._onRecoverAllExpertises.bind(this));
    html.find('.expertise-qty-plus').click(this._onExpertiseQtyAdjust.bind(this, 1));
    html.find('.expertise-qty-minus').click(this._onExpertiseQtyAdjust.bind(this, -1));
    
    if (!this.isEditable) return;

    // Interactive Wound Toggle on Backpack Slots
    html.find('.wound-toggle').click(this._onToggleWound.bind(this));

    // Panic Button: Dump Backpack to Ground / Map
    html.find('.dump-backpack').click(this._onDumpBackpack.bind(this));

    // Quantity adjustments
    html.find('.item-qty-plus').click(this._onQuantityAdjust.bind(this, 1));
    html.find('.item-qty-minus').click(this._onQuantityAdjust.bind(this, -1));
    html.find('.item-qty-input').on('change', this._onQuantityInput.bind(this));
    html.find('.item-qty-input').on('keydown', ev => { if (ev.key === 'Enter') ev.target.blur(); });

    // Standard Item CRUD & Inspection
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

    html.find('.item-create').click(this._onItemCreate.bind(this));
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
    const cost = trait.system.cost ?? 500;
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
          <span class="badge" style="background:rgba(245,158,11,0.2); color:#fbbf24; border:1px solid #f59e0b;"><i class="fas fa-coins"></i> ${cost} XP</span>
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

  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    const type = header.dataset.type || "equipment";
    const location = type === "trait" ? "traits" : header.dataset.location || CrowsLoot.findFreeSlot(this.actor);
    if (!location) { ui.notifications.warn("Free an inventory slot first."); return; }
    if (header.dataset.gold) {
      const [item] = await this.actor.createEmbeddedDocuments("Item", [goldStack(1, location)]);
      return item.sheet.render(true);
    }
    const data = {
      name: `New ${type.capitalize()}`,
      type: type,
      img: type === "trait" ? "icons/skills/trades/academics-study-reading-book.webp" : "icons/svg/item-bag.svg",
      system: type === "trait" ? {
        tree: "General",
        tier: "Starting",
        cost: 500,
        prerequisites: "Starting Trait",
        description: "<p>Trait description and rules effect.</p>"
      } : {
        location: location
      }
    };
    return await Item.create(data, {parent: this.actor});
  }

  async _onToggleWound(event) {
    event.preventDefault();
    const slotNum = event.currentTarget.dataset.slotNum;
    if (!slotNum) return;

    const currentWounds = foundry.utils.duplicate(this.actor.system.woundedSlots || {});
    const key = `slot${slotNum}`;
    currentWounds[key] = !currentWounds[key];

    await this.actor.update({ "system.woundedSlots": currentWounds });
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
    const itemId = input.dataset.itemId;
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

  async _onDumpBackpack(event) {
    event.preventDefault();
    const backpackItems = this.actor.items.filter(i => i.system.location?.startsWith("backpack"));
    if (backpackItems.length === 0) {
      ui.notifications.info("Your backpack is already empty!");
      return;
    }

    const token = this.actor.token || this.actor.getActiveTokens()[0];

    // If on an active canvas with a token, offer to physically scatter on the map!
    if (token && canvas.scene) {
      const content = `
        <div style="margin-bottom: 10px;">
          <p>Choose how to dump your backpack:</p>
        </div>
      `;

      new Dialog({
        title: "Dump Backpack Maneuver",
        content: content,
        buttons: {
          scatter: {
            icon: '<i class="fas fa-meteor"></i>',
            label: "Scatter on Map Floor",
            callback: async () => {
              const rawItems = backpackItems.map(i => i.toObject());
              await CrowsLoot.scatterItemsOnCanvas(rawItems, {
                x: token.x,
                y: token.y,
                scene: canvas.scene
              });
              await this.actor.deleteEmbeddedDocuments("Item", backpackItems.map(i => i.id));
              
              ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: `
                  <div class="crows-roll-card">
                    <div class="card-header danger">
                      <i class="fas fa-meteor"></i> Backpack Scattered on the Map!
                    </div>
                    <div class="card-body">
                      <strong>${this.actor.name}</strong> dumped their backpack, scattering <strong>${rawItems.length} items</strong> across the dungeon floor!
                    </div>
                  </div>
                `
              });
            }
          },
          droppedPack: {
            icon: '<i class="fas fa-box-open"></i>',
            label: "Drop as Single Sack Token",
            callback: async () => {
              const rawItems = backpackItems.map(i => i.toObject());
              await CrowsLoot.createContainerToken({
                name: `Dropped Backpack (${this.actor.name})`,
                containerType: "dropped_pack",
                items: rawItems,
                x: token.x,
                y: token.y,
                scene: canvas.scene
              });
              await this.actor.deleteEmbeddedDocuments("Item", backpackItems.map(i => i.id));

              ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                content: `
                  <div class="crows-roll-card">
                    <div class="card-header danger">
                      <i class="fas fa-box-open"></i> Dropped Pack Token Created
                    </div>
                    <div class="card-body">
                      <strong>${this.actor.name}</strong> slipped off their backpack, leaving a dropped pack at their feet.
                    </div>
                  </div>
                `
              });
            }
          },
          sheetGround: {
            icon: '<i class="fas fa-list"></i>',
            label: "Dump to Sheet Ground Tray",
            callback: async () => {
              const updates = backpackItems.map(i => ({ _id: i.id, "system.location": "ground" }));
              await this.actor.updateEmbeddedDocuments("Item", updates);
            }
          }
        },
        default: "scatter"
      }, { classes: ["crows", "dialog", "crows-dialog"] }).render(true);
      return;
    }

    // Fallback: move items to ground location in sheet
    const updates = backpackItems.map(i => ({ _id: i.id, "system.location": "ground" }));
    await this.actor.updateEmbeddedDocuments("Item", updates);

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `
        <div class="crows-roll-card">
          <div class="card-header danger">
            <i class="fas fa-box-open"></i> Dump Backpack Maneuver
          </div>
          <div class="card-body">
            <strong>${this.actor.name}</strong> frantically dumped all backpack items onto the ground to lighten their load!
          </div>
        </div>
      `
    });
  }

  async _onRetrieveItem(event) {
    event.preventDefault();
    const btn = event.currentTarget;
    const slotNumber = parseInt(btn.dataset.slotNum, 10);
    const itemId = btn.dataset.itemId;
    const item = itemId ? this.actor.items.get(itemId) : null;
    const itemName = item ? item.name : `Item in Slot ${slotNumber}`;

    if (isNaN(slotNumber)) return;

    const roll = new Roll("1d10");
    await roll.evaluate();
    const result = roll.total;
    const success = result >= slotNumber;

    const outcomeHtml = success
      ? `<div class="outcome success"><i class="fas fa-check-circle"></i> Success (Rolled ${result} &ge; ${slotNumber})</div>
         <p class="flavor-sub">You retrieve <b>${itemName}</b> and can freely swap it with items in your hand slots.</p>`
      : `<div class="outcome failure"><i class="fas fa-times-circle"></i> Failure (Rolled ${result} &lt; ${slotNumber})</div>
         <p class="flavor-sub">You can only rearrange your backpack, but cannot draw the item out this turn.</p>`;

    const content = `
      <div class="crows-roll-card">
        <div class="card-header">
          <i class="fas fa-hand-sparkles"></i> Backpack Retrieval (Slot ${slotNumber})
        </div>
        <div class="card-body">
          <div class="dice-roll-total">Result: <strong>${result}</strong> vs DC ${slotNumber}</div>
          ${outcomeHtml}
        </div>
      </div>
    `;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `Retrieving ${itemName} from Backpack Slot ${slotNumber}`,
      content: content
    });
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

  async _onRollAttack(event) {
    event.preventDefault();
    return showWeaponAttackDialog(this.actor, this.actor.items.get(event.currentTarget.dataset.itemId));
  }

  async _onRollCharacteristic(event) {
    event.preventDefault();
    const charKey = event.currentTarget.dataset.char;
    if (!charKey) return;
    const charBonus = this.actor.system.characteristics[charKey] || 0;
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
          <label for="char-flat-mod"><i class="fas fa-sliders-h"></i> Flat Modifier</label>
          <input type="number" id="char-flat-mod" value="0" />
        </div>
      </form>
    `;

    new Dialog({
      title: `${charLabel} Test`,
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
              tierTitle = "Tier 2: Partial / Cost Success";
              tierClass = "success";
            } else {
              tierTitle = "Tier 1: Failure / Setback";
              tierClass = "failure";
            }

            const state = createRollState(this.actor, { kind: "test", title: `${charLabel} Test (${circumstance})`,
              tier: finalTier, isDoom, total, formula: roll.result,
              outcomes: Object.fromEntries([1, 2, 3].map(t => [t, { tierTitle: ["", "Tier 1: Failure / Setback", "Tier 2: Partial / Cost Success", "Tier 3: Superior Success"][t],
                tierClass: t === 3 ? "crit" : t === 2 ? "success" : "failure" }])),
              special: isCrit || isDoom ? { tierTitle, tierClass } : null });

            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              flavor: `Testing ${charLabel}`,
              flags: rollFlags(state),
              content: renderRollState(state)
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

  async _onSpendExpertise(event) {
    event.preventDefault();
    event.stopPropagation();
    const key = event.currentTarget.dataset.expertise;
    if (!key) return;

    const allExp = [...EXPERTISES_CONFIG.general, ...EXPERTISES_CONFIG.spellcasting, ...EXPERTISES_CONFIG.weapon];
    const expMeta = allExp.find(e => e.key === key) || { label: key.capitalize(), hint: "" };
    
    const result = await this.actor.spendExpertise(key);
    if (!result.success) return;

    const cardHtml = `
      <div class="crows-roll-card expertise-spend-card">
        <div class="card-header">
          <i class="fas fa-feather-alt"></i> Expertise Used: ${expMeta.label}
        </div>
        <div class="card-body">
          <div class="expertise-tier-bump">
            <i class="fas fa-arrow-alt-circle-up"></i> Improves Test Outcome by <strong>+1 Tier</strong> (max Tier 3)
          </div>
          ${expMeta.hint ? `<div class="expertise-hint"><em>${expMeta.hint}</em></div>` : ''}
          <div class="expertise-remaining-badge">
            Uses Remaining: <strong>${result.remaining} / ${result.max}</strong>
          </div>
        </div>
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${this.actor.name} applied ${expMeta.label} Expertise`,
      content: cardHtml
    });
  }

  async _onRecoverAllExpertises(event) {
    event.preventDefault();
    new Dialog({
      title: "Rest & Regain Expertises",
      content: `<div class="crows-dialog-form"><p>Regain all uses for all trained Expertises? (Rest activity per Page 8)</p></div>`,
      buttons: {
        confirm: {
          icon: '<i class="fas fa-bed"></i>',
          label: "Rest & Regain",
          callback: async () => {
            await this.actor.recoverAllExpertises();
            ui.notifications.info(`${this.actor.name} regained all expertise uses.`);
            
            const cardHtml = `
              <div class="crows-roll-card rest-card">
                <div class="card-header">
                  <i class="fas fa-campgrounds"></i> Rest Completed
                </div>
                <div class="card-body">
                  <p><strong>${this.actor.name}</strong> finished a rest and regained all uses of their trained Expertises!</p>
                </div>
              </div>
            `;
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              flavor: `Rest: Regained Expertises`,
              content: cardHtml
            });
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "confirm"
    }, { classes: ["crows", "dialog", "crows-dialog"] }).render(true);
  }

  async _onExpertiseQtyAdjust(amount, event) {
    event.preventDefault();
    event.stopPropagation();
    const key = event.currentTarget.dataset.expertise;
    if (!key) return;
    const exp = this.actor.system.expertises?.[key];
    const currentVal = exp ? Number(exp.value) || 0 : 0;
    const maxVal = exp ? Number(exp.max) || 0 : 0;
    let newVal = currentVal + amount;
    if (maxVal > 0) newVal = Math.clamp(newVal, 0, maxVal);
    else newVal = Math.max(0, newVal);

    await this.actor.update({ [`system.expertises.${key}.value`]: newVal });
  }

  async _onCrueltyAdjust(amount, event) {
    event.preventDefault();
    event.stopPropagation();
    await this.actor.adjustCruelty(amount);
  }

  async _onClearCruelty(event) {
    event.preventDefault();
    new Dialog({
      title: "Rest Outside Miasma",
      content: `<div class="crows-dialog-form"><p>Purge all levels of Cruelty? (Finishing a rest in a location with no Miasma per Page 27)</p></div>`,
      buttons: {
        confirm: {
          icon: '<i class="fas fa-sun"></i>',
          label: "Purge Cruelty",
          callback: async () => {
            await this.actor.clearCruelty();
            ui.notifications.info(`${this.actor.name} purged all levels of cruelty.`);
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "confirm"
    }, { classes: ["crows", "dialog", "crows-dialog"] }).render(true);
  }

  async _onDeleteMiasmaEffect(event) {
    event.preventDefault();
    event.stopPropagation();
    const effectId = event.currentTarget.dataset.effectId;
    if (effectId) {
      await this.actor.removeMiasmaEffect(effectId);
    }
  }

  async _onAddCustomMiasmaEffect(event) {
    event.preventDefault();
    new Dialog({
      title: "Add Miasma Corruption Effect",
      content: `
        <form class="crows-dialog-form">
          <div class="form-group">
            <label>Effect Title:</label>
            <input type="text" name="title" placeholder="e.g. Paranoia, Despondent..." required />
          </div>
          <div class="form-group">
            <label>1st Effect (Harmful / Flaw):</label>
            <textarea name="firstEffect" rows="2" placeholder="Rules effect..."></textarea>
          </div>
          <div class="form-group">
            <label>2nd Effect (Sympathetic / Silver Lining):</label>
            <textarea name="secondEffect" rows="2" placeholder="Rules benefit..."></textarea>
          </div>
          <div class="form-group">
            <label>Roll Total (d10 + Cruelty):</label>
            <input type="number" name="rollTotal" value="1" min="1" />
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-plus"></i>',
          label: "Add Effect",
          callback: async (html) => {
            const title = html.find('input[name="title"]').val() || "Custom Miasma Effect";
            const firstEffect = html.find('textarea[name="firstEffect"]').val() || "";
            const secondEffect = html.find('textarea[name="secondEffect"]').val() || "";
            const rollTotal = parseInt(html.find('input[name="rollTotal"]').val(), 10) || 1;
            await this.actor.addMiasmaEffect({ title, firstEffect, secondEffect, rollTotal });
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "save"
    }, { classes: ["crows", "dialog", "crows-dialog"] }).render(true);
  }

  async _onRollMiasmaTest(event) {
    event.preventDefault();
    const mindBonus = Number(this.actor.system.characteristics?.mind) || 0;
    const cruelty = Number(this.actor.system.cruelty) || 0;

    const content = `
      <form class="crows-dialog-form">
        <div class="form-group" style="margin-bottom: 10px; font-size: 0.85rem; color: #cbd5e1;">
          <p>At the end of a rest in the Miasma, make a <strong>Mind RR</strong> to resist corruption.</p>
          <div style="background: rgba(88,28,135,0.25); border: 1px solid rgba(147,51,234,0.4); padding: 6px 10px; border-radius: 4px; margin-top: 4px; display: flex; justify-content: space-between;">
            <span><strong>Mind Characteristic:</strong> +${mindBonus}</span>
            <span><strong>Cruelty Penalty:</strong> -${cruelty}</span>
          </div>
        </div>
        <div class="form-group circumstance-group">
          <label>Circumstance:</label>
          <div class="radio-options circumstance-options">
            <label class="radio-option opt-double-edge">
              <input type="radio" name="circumstance" value="double-edge" />
              <div class="opt-text">
                <span class="opt-title"><i class="fas fa-angle-double-up"></i> Double Edge</span>
                <span class="opt-desc">+1 Tier bump</span>
              </div>
            </label>
            <label class="radio-option opt-normal">
              <input type="radio" name="circumstance" value="normal" checked />
              <div class="opt-text">
                <span class="opt-title">Normal Roll</span>
                <span class="opt-desc">Standard 2d10</span>
              </div>
            </label>
            <label class="radio-option opt-double-bane">
              <input type="radio" name="circumstance" value="double-bane" />
              <div class="opt-text">
                <span class="opt-title"><i class="fas fa-angle-double-down"></i> Double Bane</span>
                <span class="opt-desc">-1 Tier penalty</span>
              </div>
            </label>
          </div>
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <label>Situational Modifier:</label>
          <input type="number" name="modifier" value="0" placeholder="e.g. +1 or -1" />
        </div>
      </form>
    `;

    new Dialog({
      title: "Miasma Resistance Test (2d10 + Mind - Cruelty)",
      content: content,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Resist Miasma",
          callback: async (html) => {
            const circumstance = html.find('input[name="circumstance"]:checked').val() || "normal";
            const modifier = parseInt(html.find('input[name="modifier"]').val(), 10) || 0;
            const netMod = mindBonus - cruelty + modifier;

            const { roll, total, tier, isCrit, isDoom } =
              await rollPowerRoll({ modifier: netMod, circumstance });

            let tierTitle = `Tier ${tier}`;
            let tierClass = "failure";
            let outcomeText = "";

            if (isCrit) {
              tierTitle = "CRITICAL RESISTANCE! (Tier 3)";
              tierClass = "crit";
            } else if (isDoom) {
              tierTitle = "DOOM! (Critical Failure)";
              tierClass = "doom";
            } else if (tier === 3) {
              tierTitle = "Tier 3: Purged / Aided";
              tierClass = "crit";
            } else if (tier === 2) {
              tierTitle = "Tier 2: Withstood";
              tierClass = "success";
            } else {
              tierTitle = "Tier 1: Corrupted";
              tierClass = "failure";
            }

            if (tier === 3) {
              outcomeText = "You remove all levels of cruelty you have, OR improve the test result of one other human who rested with you by a tier.";
            } else if (tier === 2) {
              outcomeText = "You withstand the creeping corruption. No effect.";
            } else {
              outcomeText = "You gain 1 level of cruelty and must roll on the Miasma Effects table.";
            }

            const state = createRollState(this.actor, { kind: "miasma", title: "Miasma Resistance Test (Mind)",
              tier, isDoom, total, formula: roll.result, meta: `Mind: ${mindBonus} | Cruelty: ${cruelty}`,
              outcomes: {
                1: { tierTitle: "Tier 1: Corrupted", tierClass: "failure", damageDesc: "You gain 1 level of cruelty and must roll on the Miasma Effects table." },
                2: { tierTitle: "Tier 2: Withstood", tierClass: "success", damageDesc: "You withstand the creeping corruption. No effect." },
                3: { tierTitle: "Tier 3: Purged / Aided", tierClass: "crit", damageDesc: "Remove all cruelty, OR improve the test result of one other human who rested with you by a tier." }
              }, special: isCrit || isDoom ? { tierTitle, tierClass, damageDesc: outcomeText } : null });

            await roll.toMessage({
              speaker: ChatMessage.getSpeaker({ actor: this.actor }),
              flavor: `${this.actor.name} made a Miasma Resistance Test`,
              flags: rollFlags(state),
              content: renderRollState(state)
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

  async _onRollMiasmaEffect(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const cruelty = Number(this.actor.system.cruelty) || 0;
    const formula = `1d10 + ${cruelty}`;
    const roll = new Roll(formula);
    await roll.evaluate();

    const total = roll.total;
    let matched = MIASMA_EFFECTS_TABLE.find(entry => total >= entry.min && total <= entry.max);
    if (!matched) matched = MIASMA_EFFECTS_TABLE[MIASMA_EFFECTS_TABLE.length - 1];

    const isFullCorruption = total >= 13;

    const cardHtml = `
      <div class="crows-item-card miasma-effect-card" style="background: linear-gradient(135deg, #1e112a 0%, #100a18 100%); border: 1px solid rgba(168, 85, 247, 0.45); border-radius: 6px; padding: 10px 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);">
        <div class="card-header flexrow" style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(168, 85, 247, 0.3); padding-bottom:6px; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <i class="fas fa-skull-crossbones" style="color:#c084fc; font-size:1.2rem;"></i>
            <div>
              <h3 style="margin:0; font-size:1.05rem; font-weight:700; color:#f3e8ff;">Miasma Effect: ${matched.title}</h3>
              <div style="font-size:0.75rem; color:#d8b4fe;">Roll: <strong>${total}</strong> <span style="opacity:0.8;">(1d10 + ${cruelty} Cruelty)</span></div>
            </div>
          </div>
          <span class="badge" style="background:${isFullCorruption ? '#7f1d1d' : '#581c87'}; color:#f3e8ff; border:1px solid ${isFullCorruption ? '#ef4444' : '#9333ea'};">
            ${isFullCorruption ? 'CORRUPTED' : 'Miasma Roll'}
          </span>
        </div>
        <div class="miasma-effects-body" style="font-size:0.85rem; line-height:1.45; color:#e2e8f0; display:flex; flex-direction:column; gap:8px;">
          <div class="effect-box primary-effect" style="background:rgba(0,0,0,0.3); border-left:3px solid #c084fc; padding:6px 10px; border-radius:0 4px 4px 0;">
            <strong style="color:#e9d5ff;"><i class="fas fa-exclamation-triangle"></i> 1st Effect:</strong>
            <p style="margin:4px 0 0 0;">${matched.firstEffect}</p>
          </div>
          <div class="effect-box secondary-effect" style="background:rgba(0,0,0,0.3); border-left:3px solid #38bdf8; padding:6px 10px; border-radius:0 4px 4px 0;">
            <strong style="color:#bae6fd;"><i class="fas fa-shield-alt"></i> 2nd Effect:</strong>
            <p style="margin:4px 0 0 0;">${matched.secondEffect}</p>
          </div>
        </div>
        ${!isFullCorruption ? `
          <div class="crows-chat-actions" style="margin-top: 10px;">
            <button type="button" class="crows-miasma-apply-effect-btn" data-actor-id="${this.actor.id}" data-roll="${total}" data-title="${matched.title}" data-first="${encodeURIComponent(matched.firstEffect)}" data-second="${encodeURIComponent(matched.secondEffect)}" style="background: linear-gradient(135deg, #7e22ce, #6b21a8); border: 1px solid #a855f7; color: #f3e8ff; width: 100%; padding: 6px; border-radius: 4px; font-weight: 700; cursor: pointer;">
              <i class="fas fa-plus-circle"></i> Add Effect to Character Sheet
            </button>
          </div>
        ` : `
          <div style="margin-top:8px; padding:6px 10px; background:rgba(220,38,38,0.2); border:1px solid #dc2626; border-radius:4px; font-size:0.8rem; color:#fca5a5; text-align:center;">
            <strong>Critical Soul Corruption:</strong> This Crow becomes an NPC controlled by the Ref!
          </div>
        `}
      </div>
    `;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${this.actor.name} rolled on the Miasma Effects table`,
      content: cardHtml
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
    if (!item) return false;

    // Drop destination: a slot card, a tray (ground/stash), or nothing in particular
    const slotElement = event.target.closest("[data-slot]");
    const listElement = event.target.closest("[data-list]");
    const targetSlot = slotElement?.dataset.slot ?? listElement?.dataset.list ?? null;
    const targetItem = this.actor.items.get(event.target.closest("[data-item-id]")?.dataset.itemId);
    if (item.parent && canStack(item, targetItem)) return CrowsLoot.stack(item, targetItem);

    // Rearranging within this sheet: move the item and relocate anything it displaces
    if (item.parent?.uuid === this.actor.uuid) {
      if (!targetSlot || item.type !== "equipment" || item.system.location === targetSlot) return false;
      return CrowsLoot.placeItem(this.actor, item, targetSlot);
    }

    // From another actor, loot token, or container: a transfer (create here, delete there)
    if (item.parent) {
      if (item.type !== "equipment") return this._onDropItemCreate(item.toObject());
      return CrowsLoot.transfer(item, this.actor, { location: targetSlot });
    }

    // From a compendium or the sidebar: a fresh copy in the first slot that fits
    const itemData = item.toObject();
    if (item.type === "equipment") {
      const count = Math.max(1, Number(itemData.system?.slots) || 1);
      const loc = (targetSlot && CrowsLoot.fits(this.actor, targetSlot, count)) ? targetSlot : CrowsLoot.findFreeSlot(this.actor, count);
      if (!loc) { ui.notifications.warn("No free inventory slot. Drop an item on the map or into a container first."); return false; }
      foundry.utils.setProperty(itemData, "system.location", loc);
    }
    return this._onDropItemCreate(itemData);
  }

  async _onOpenADManagerDialog(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    return this.actor.openDamageAllocationDialog(1);
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
    ui.notifications.info(`${item.name} is now ${newEquipped ? 'Worn / Equipped' : 'Stowed in Pack'}.`);
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
}
