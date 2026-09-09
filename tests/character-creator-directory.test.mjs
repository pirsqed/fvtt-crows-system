import { test } from "node:test";
import assert from "node:assert/strict";

let opened = 0;
globalThis.FormApplication = class { render() { opened++; } };
globalThis.foundry = { utils: { randomID: () => "creator-test" } };
const { addCharacterCreatorButton, addCharacterCreatorToDocumentDirectory, refreshCharacterCreatorButtons,
  canCreateCrow } = await import("../module/apps/character-creator.mjs");

// Small DOM fixture; both jQuery-wrapped V1 roots and DOM V2 roots use these methods.
class Element {
  constructor() { this.children = []; this.className = ""; this.ownerDocument = { createElement: () => new Element() }; }
  matches(selector) { return this.className.split(" ").includes(selector.slice(1)); }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const nested = child.querySelector(selector); if (nested) return nested;
    }
    return null;
  }
  append(child) { child.parent = this; this.children.push(child); }
  prepend(child) { child.parent = this; this.children.unshift(child); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  addEventListener(type, callback) { this[type] = callback; }
}

function setup({ allowed = true, header = true } = {}) {
  opened = 0;
  globalThis.game = { user: { id: "player", isGM: false, role: 2, allowed, can: () => false } };
  globalThis.CONFIG = { Actor: { documentClass: { canUserCreate: user => user.allowed } } };
  globalThis.ui = { notifications: { warn() {} } };
  const root = new Element();
  if (header) {
    const heading = new Element(); heading.className = "directory-header"; root.append(heading);
    const nativeActions = new Element(); nativeActions.className = "header-actions"; heading.append(nativeActions);
  }
  return root;
}

test("trusted player uses the same permission check as Foundry Actor creation", () => {
  const root = setup();
  assert.equal(canCreateCrow(), true);
  addCharacterCreatorButton({}, root);
  const button = root.querySelector(".crows-create-crow");
  assert.ok(button);
  assert.equal(button.parent.parent.className, "directory-header");
  assert.equal(root.querySelector(".header-actions").children.length, 0);
  button.click(); assert.equal(opened, 1);
});

test("V1, V2, missing headers, and repeated directory hooks produce one button", () => {
  for (const header of [true, false]) {
    const root = setup({ header });
    addCharacterCreatorButton({}, [root]);
    const original = root.querySelector(".crows-create-crow");
    addCharacterCreatorToDocumentDirectory({ documentName: "Actor" }, root);
    assert.equal(root.querySelector(".crows-create-crow"), original);
    assert.equal(original.parent.children.length, 1);
    original.parent.remove(); // Simulate replacement of the rendered directory header.
    addCharacterCreatorToDocumentDirectory({ tabName: "actors" }, root);
    assert.ok(root.querySelector(".crows-create-crow"));
  }
});

test("other document directories do not receive the creator button", () => {
  const root = setup();
  addCharacterCreatorToDocumentDirectory({ documentName: "Item", tabName: "items" }, root);
  assert.equal(root.querySelector(".crows-create-crow"), null);
});

test("permission grants and revocations refresh both sidebar and popout", () => {
  const root = setup({ allowed: false }), popout = new Element();
  ui.actors = { element: [root], popout: { element: popout } };
  refreshCharacterCreatorButtons(); assert.equal(root.querySelector(".crows-create-crow"), null);
  game.user.allowed = true; refreshCharacterCreatorButtons();
  const button = root.querySelector(".crows-create-crow");
  assert.ok(button); assert.ok(popout.querySelector(".crows-create-crow"));
  game.user.allowed = false;
  button.click(); assert.equal(opened, 0);
  refreshCharacterCreatorButtons();
  assert.equal(root.querySelector(".crows-create-crow"), null);
  assert.equal(popout.querySelector(".crows-create-crow"), null);
});

test("legacy permission fallback remains available before document configuration", () => {
  setup(); delete CONFIG.Actor;
  game.user.can = permission => permission === "ACTOR_CREATE";
  assert.equal(canCreateCrow(), true);
});
