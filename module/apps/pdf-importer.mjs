const MODULE_ID = "fvtt-crows-pdf-importer";

/** Settings-menu entry point for the companion PDF importer. */
export class CrowsPDFImporter extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "crows-pdf-importer", title: "Crows: Import Playtest Content",
      template: "systems/fvtt-crows-system/templates/pdf-importer.html",
      classes: ["crows", "crows-setup-guide"], width: 600, height: "auto",
      closeOnSubmit: false
    });
  }

  render(force, options) {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can import playtest content.");
      return this;
    }
    const module = game.modules?.get(MODULE_ID);
    if (module?.active && typeof module.api?.open === "function") {
      module.api.open();
      return this;
    }
    return super.render(force, options);
  }

  getData() {
    const module = game.modules?.get(MODULE_ID);
    return { missing: !module, disabled: Boolean(module && !module.active),
      unavailable: Boolean(module?.active), isGM: game.user.isGM };
  }

  async _updateObject() { /* buttons only */ }
}
