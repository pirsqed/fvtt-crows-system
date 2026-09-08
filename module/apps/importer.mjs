import { IMPORT_PACKS, readImport, CrowsContentImport } from "../import-content.mjs";
/**
 * CrowsImporter
 * GM-facing dialog (Settings > System Settings > Import Playtest Content) that checks which
 * generated pack files are present in packs/ and imports them into world compendiums.
 */
export class CrowsImporter extends FormApplication {
  static PACKS = IMPORT_PACKS;

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
    const packs = await Promise.all(CrowsImporter.PACKS.map(async pack => {
      try {
        const input = await readImport(pack);
        return { ...pack, found: !input.missing, count: input.data?.length,
          status: input.missing ? "Not built" : `${input.data.length} valid entries` };
      } catch (err) { return { ...pack, found: false, status: err.message }; }
    }));
    return { packs, anyFound: packs.some(p => p.found), isGM: game.user.isGM,
      report: this._report, error: this._error, busy: this._busy };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const run = async packs => {
      if (this._busy) return;
      this._busy = true; this._error = null; this._report = null;
      html.find("button").prop("disabled", true);
      try { this._report = await CrowsContentImport.run(packs, { onProgress: text => html.find(".import-progress").text(text) }); }
      catch (err) { this._error = err.message; }
      finally { this._busy = false; this.render(); }
    };
    html.find(".btn-import-all").click(event => { event.preventDefault(); run(IMPORT_PACKS); });
    html.find(".btn-import-one").click(event => {
      event.preventDefault();
      const pack = IMPORT_PACKS.find(pack => pack.fn === event.currentTarget.dataset.fn);
      if (pack) run([pack]);
    });
    html.find(".btn-refresh").click(event => { event.preventDefault(); this.render(); });
  }

  async _updateObject() { /* buttons only */ }
}
