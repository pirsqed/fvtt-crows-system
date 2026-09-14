import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.FormApplication = class {
  render(force) { this.rendered = force; return this; }
  async close() { this.closed = true; }
};
const { CrowsSetupGuide } = await import("../module/apps/setup-guide.mjs");

function user(isGM, seen = false) {
  return { isGM, getFlag: () => seen, async setFlag(scope, key, value) {
    assert.equal(scope, "fvtt-crows-system"); assert.equal(key, "setupGuideSeen"); seen = value;
  } };
}

test("first GM visit opens guide, dismissal persists, and a second GM has their own welcome", async () => {
  globalThis.game = { user: user(true) };
  const guide = CrowsSetupGuide.showOnFirstVisit();
  assert.equal(guide.rendered, true);
  await guide.close();
  assert.equal(guide.closed, true);
  assert.equal(CrowsSetupGuide.showOnFirstVisit(), undefined);
  assert.equal(new CrowsSetupGuide().render(true).rendered, true);
  game.user = user(true);
  assert.equal(CrowsSetupGuide.showOnFirstVisit().rendered, true);
});

test("players have manual read access without an automatic welcome or import action", () => {
  globalThis.game = { user: user(false) };
  assert.equal(CrowsSetupGuide.showOnFirstVisit(), undefined);
  assert.equal(new CrowsSetupGuide().getData().isGM, false);
});
