import { EXPERTISES_CONFIG } from "./expertises.mjs";
const { ArrayField, BooleanField, HTMLField, NumberField, SchemaField, StringField } = foundry.data.fields;

export class CrowDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      characteristics: new SchemaField({
        agility: new NumberField({ required: true, integer: true, initial: 0 }),
        mind: new NumberField({ required: true, integer: true, initial: 0 }),
        strength: new NumberField({ required: true, integer: true, initial: 0 })
      }),
      totalXP: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      spentXP: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      background: new StringField({ required: true, blank: true, initial: "" }),
      stamina: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
        max: new NumberField({ required: true, integer: true, min: 0, initial: 10 })
      }),
      wounds: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      woundedSlots: new SchemaField({
        slot1: new BooleanField({ initial: false }),
        slot2: new BooleanField({ initial: false }),
        slot3: new BooleanField({ initial: false }),
        slot4: new BooleanField({ initial: false }),
        slot5: new BooleanField({ initial: false }),
        slot6: new BooleanField({ initial: false }),
        slot7: new BooleanField({ initial: false }),
        slot8: new BooleanField({ initial: false }),
        slot9: new BooleanField({ initial: false }),
        slot10: new BooleanField({ initial: false })
      }),
      coins: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      speed: new NumberField({ required: true, integer: true, min: 0, initial: 5 }),
      cruelty: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      tempAD: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      miasmaEffects: new ArrayField(new SchemaField({
        id: new StringField({ required: true, initial: () => foundry.utils.randomID() }),
        title: new StringField({ required: true, initial: "" }),
        firstEffect: new StringField({ required: true, initial: "" }),
        secondEffect: new StringField({ required: true, initial: "" }),
        rollTotal: new NumberField({ required: true, integer: true, initial: 1 })
      }), { initial: [] }),
      expertises: new SchemaField(Object.fromEntries(Object.values(EXPERTISES_CONFIG).flat().map(({ key }) => [key,
        new SchemaField({ value: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
          max: new NumberField({ required: true, integer: true, min: 0, initial: 0 }) })
      ]))),
      biography: new HTMLField({ required: true, blank: true })
    };
  }
}

export class EquipmentDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      contentsType: new StringField({ initial: "", blank: true, choices: ["", "gold", "arrows", "bolts"] }),
      contentsQuantity: new NumberField({ integer: true, min: 0, initial: 0 }),
      contentsMax: new NumberField({ integer: true, min: 0, initial: 0 }),
      description: new HTMLField({ required: true, blank: true }),
      shortDescription: new StringField({ required: true, blank: true, initial: "" }),
      location: new StringField({ 
        required: true, 
        blank: false, 
        initial: "backpack1" 
      }),
      slots: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      quantity: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
      useQtyPlusMinus: new BooleanField({ required: true, initial: false }),
      isGold: new BooleanField({ initial: false }),
      cost: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      crafting: new StringField({ required: true, blank: true, initial: "" }),
      traits: new StringField({ required: true, blank: true, initial: "" }),
      maxStack: new NumberField({ required: true, integer: true, min: 1, initial: 1 }),
      isEquipped: new BooleanField({ required: true, initial: true }),
      greedBonus: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      
      // Weapon details
      isShield: new BooleanField({ initial: false }),
      isSpellbook: new BooleanField({ initial: false }),
      isWeapon: new BooleanField({ required: true, initial: false }),
      weapon: new SchemaField({
        range: new StringField({ required: true, blank: true, initial: "Melee 1" }),
        attackFormula: new StringField({ required: true, blank: true, initial: "2d10 + S" }),
        tier2Damage: new StringField({ required: true, blank: true, initial: "" }),
        tier3Damage: new StringField({ required: true, blank: true, initial: "" })
      }),
      
      // Armor details
      isArmor: new BooleanField({ required: true, initial: false }),
      armor: new SchemaField({
        defense: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        maxDefense: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
      }),
      
      // Consumable/Book/Maneuver details
      isConsumable: new BooleanField({ required: true, initial: false }),
      consumable: new SchemaField({
        usageDice: new StringField({ required: true, blank: true, initial: "" }),
        currentUD: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        maxUD: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
        udTrigger: new StringField({ required: true, blank: true, initial: "DT" }), // DT, Rest, Activate, Useless
        actionText: new HTMLField({ required: true, blank: true }),
        tier1Effect: new StringField({ required: true, blank: true, initial: "" }),
        tier2Effect: new StringField({ required: true, blank: true, initial: "" }),
        tier3Effect: new StringField({ required: true, blank: true, initial: "" })
      })
    };
  }

  static migrateData(source) {
    if ("use_qty_plus_minus" in source && !("useQtyPlusMinus" in source)) {
      source.useQtyPlusMinus = Boolean(source.use_qty_plus_minus);
    }
    return super.migrateData(source);
  }

  get use_qty_plus_minus() {
    return this.useQtyPlusMinus;
  }

  set use_qty_plus_minus(value) {
    this.useQtyPlusMinus = Boolean(value);
  }
}

export class MonsterDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      customExpertises: new ArrayField(new SchemaField({
        id: new StringField({ required: true, blank: false }),
        name: new StringField({ required: true, initial: "New Expertise" }),
        notes: new StringField({ required: true, blank: true, initial: "" }),
        value: new NumberField({ required: true, integer: true, min: 0, initial: 1 }),
        max: new NumberField({ required: true, integer: true, min: 0, initial: 1 })
      }), { initial: [] }),
      size: new StringField({ required: true, initial: "Medium" }),
      power: new NumberField({ required: true, integer: true, initial: 1 }),
      type: new StringField({ required: true, initial: "Animal" }),
      stamina: new SchemaField({
        value: new NumberField({ required: true, integer: true, min: 0, initial: 10 }),
        max: new NumberField({ required: true, integer: true, min: 0, initial: 10 })
      }),
      speed: new StringField({ required: true, initial: "5" }),
      movement: new SchemaField({
        base: new NumberField({ required: true, integer: true, min: 0, initial: 5 }),
        modes: new ArrayField(new SchemaField({
          name: new StringField({ required: true, blank: false }),
          value: new NumberField({ required: true, integer: true, min: 0, initial: 0 })
        }), { initial: [] }),
        notes: new StringField({ required: true, blank: true, initial: "" })
      }, { nullable: true, initial: null }),
      characteristics: new SchemaField({
        agility: new NumberField({ required: true, integer: true, initial: 0 }),
        mind: new NumberField({ required: true, integer: true, initial: 0 }),
        strength: new NumberField({ required: true, integer: true, initial: 0 })
      }),
      woundSlots: new ArrayField(new NumberField({ required: true, integer: true, min: 1 }), { initial: [] }),
      slots: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      coins: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      tempAD: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      description: new HTMLField({ required: true, blank: true })
    };
  }
}

export class LootDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new HTMLField({ required: true, blank: true })
    };
  }
}

export class AttackDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      bonus: new StringField({ required: true, initial: "+1" }),
      range: new StringField({ required: true, initial: "Melee 1" }),
      tier2Damage: new StringField({ required: true, initial: "1 dam" }),
      tier3Damage: new StringField({ required: true, initial: "2 dam" }),
      notes: new HTMLField({ required: true, blank: true })
    };
  }
}

export class TraitDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      extraBeltSlots: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      beltSlotNotes: new StringField({ required: true, blank: true, initial: "" }),
      description: new HTMLField({ required: true, blank: true }),
      tree: new StringField({ 
        required: true, 
        blank: false, 
        initial: "General",
        options: [
          "General", "Alchemy", "Alteration", "Archery", "Armor", "Bashing", "Benefaction",
          "Blacksmithing", "Camping", "Chopping", "Conjuration", "Elemental", "Enchantment",
          "Illusion", "Knowledge", "Leverage", "Necromancy", "Pets", "Reputation",
          "Slashing", "Stabbing", "Thievery", "Travel", "Unarmed"
        ]
      }),
      tier: new StringField({ required: true, blank: true, initial: "Starting" }),
      cost: new NumberField({ required: true, integer: true, min: 0, initial: 500 }),
      prerequisites: new StringField({ required: true, blank: true, initial: "" })
    };
  }
}
