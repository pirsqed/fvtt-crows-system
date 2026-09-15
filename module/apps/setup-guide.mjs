import { CrowsPDFImporter } from "./pdf-importer.mjs";

const SYSTEM = "fvtt-crows-system";

/** A bundled readme, available without a network connection or journal ownership. */
export class CrowsSetupGuide extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "crows-setup-guide", title: "Crows: Start Here",
      template: "systems/fvtt-crows-system/templates/setup-guide.html",
      classes: ["crows", "crows-setup-guide"], width: 720, height: 740,
      resizable: true, closeOnSubmit: false
    });
  }

  getData() { return { isGM: game.user.isGM }; }

  static showOnFirstVisit() {
    if (game.user.isGM && !game.user.getFlag(SYSTEM, "setupGuideSeen")) {
      return new CrowsSetupGuide().render(true);
    }
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(".open-importer").click(event => {
      event.preventDefault();
      if (game.user.isGM) new CrowsPDFImporter().render(true);
    });
    html.find(".close-guide").click(event => { event.preventDefault(); this.close(); });
  }

  async close(options) {
    if (game.user.isGM && !game.user.getFlag(SYSTEM, "setupGuideSeen")) {
      try { await game.user.setFlag(SYSTEM, "setupGuideSeen", true); }
      catch (error) { console.warn("Crows | Could not save setup guide dismissal", error); }
    }
    return super.close(options);
  }

  async _updateObject() { /* Readme with buttons only. */ }
}
