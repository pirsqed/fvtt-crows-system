import test from "node:test";
import assert from "node:assert/strict";

globalThis.FormApplication = class {
  render(force) { this.rendered = force; return this; }
  activateListeners() {}
};
const { CrowsPDFImporter } = await import("../module/apps/pdf-importer.mjs");
const { CrowsSetupGuide } = await import("../module/apps/setup-guide.mjs");

function setup(module, isGM = true) {
  const warnings = [];
  globalThis.game = { user: { isGM }, modules: new Map(module ? [["fvtt-crows-pdf-importer", module]] : []) };
  globalThis.ui = { notifications: { warn: text => warnings.push(text) } };
  // Opening the PDF entry point must not read the old generated pack files.
  globalThis.fetch = () => { throw new Error("Unexpected legacy file access"); };
  return warnings;
}

test("settings entry opens the enabled PDF module without rendering the legacy importer", () => {
  let opened = 0;
  const module = { active: true, api: { open() { assert.equal(this, module.api); opened++; } } };
  setup(module);
  const app = new CrowsPDFImporter();
  assert.equal(app.render(true), app);
  assert.equal(opened, 1);
  assert.equal(app.rendered, undefined);
});

test("missing, disabled, and incompatible modules show distinct setup states", () => {
  for (const [module, state] of [[null, "missing"], [{ active: false, api: { open() { throw new Error("Disabled module opened"); } } }, "disabled"], [{ active: true, api: {} }, "unavailable"]]) {
    setup(module);
    const app = new CrowsPDFImporter().render(true);
    assert.equal(app.rendered, true);
    assert.deepEqual(app.getData(), { missing: state === "missing", disabled: state === "disabled", unavailable: state === "unavailable", isGM: true });
  }
});

test("players cannot launch the importer even through a direct application call", () => {
  const warnings = setup({ active: true, api: { open() { throw new Error("Player opened importer"); } } }, false);
  const app = new CrowsPDFImporter().render(true);
  assert.equal(app.rendered, undefined);
  assert.equal(warnings.length, 1);
});

test("setup guide opens the same PDF entry point and guards player clicks", () => {
  let opened = 0;
  setup({ active: true, api: { open() { opened++; } } });
  const handlers = new Map();
  new CrowsSetupGuide().activateListeners({ find: selector => ({ click: handler => handlers.set(selector, handler) }) });
  const event = { preventDefault() {} };
  handlers.get(".open-importer")(event);
  assert.equal(opened, 1);
  game.user.isGM = false;
  handlers.get(".open-importer")(event);
  assert.equal(opened, 1);
});
