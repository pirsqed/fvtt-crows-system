/**
 * CrowsImporter
 * GM-facing dialog (Settings > System Settings > Import Playtest Content) that checks which
 * generated pack files are present in packs/ and imports them into world compendiums.
 */
export class CrowsImporter extends FormApplication {
  static PACKS = [
    { file: "equipment.json", label: "Equipment & Spellbooks", fn: "importEquipment", type: "Item" },
    { file: "dungeon-loot.json", label: "Dungeon Loot & Relics", fn: "importDungeonLoot", type: "Item" },
    { file: "traits.json", label: "Trait Trees", fn: "importTraits", type: "Item" },
    { file: "monsters.json", label: "Bestiary", fn: "importMonsters", type: "Actor" }
  ];

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "crows-importer",
      title: "Crows: Import Playtest Content",
      template: "systems/fvtt-crows-system/templates/importer.html",
      classes: ["crows", "sheet", "crows-importer"],
      width: 520,
      height: "auto",
      closeOnSubmit: false
    });
  }

  async getData() {
    const packs = [];
    for (const p of CrowsImporter.PACKS) {
      let count = null;
      try {
        const res = await fetch(`systems/fvtt-crows-system/packs/${p.file}`, { cache: "no-store" });
        if (res.ok) count = (await res.json()).length;
      } catch (e) { /* missing */ }
      packs.push({ ...p, found: count !== null, count });
    }
    return { packs, anyFound: packs.some(p => p.found), allFound: packs.every(p => p.found), isGM: game.user.isGM };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(".btn-import-all").click(async ev => {
      ev.preventDefault();
      await game.crows.importPlaytestItems();
      this.render();
    });
    html.find(".btn-import-one").click(async ev => {
      ev.preventDefault();
      const fn = ev.currentTarget.dataset.fn;
      if (game.crows?.[fn]) await game.crows[fn]();
      this.render();
    });
    html.find(".btn-refresh").click(ev => { ev.preventDefault(); this.render(); });
  }

  async _updateObject() { /* buttons only */ }
}
