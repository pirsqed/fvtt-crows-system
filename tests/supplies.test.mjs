import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supplyPreset, supplyUpdate } from '../module/supplies.mjs';
import { goldTotal, goldStack, canStack } from '../module/inventory.mjs';

test('standard ammunition starts full, ordinary purses empty, and supplied custom counts survive', () => {
  for (const name of ['Quiver of Arrows', 'Case of Bolts']) {
    const item = supplyPreset({ name, type: 'equipment', system: {} });
    assert.equal(item.system.contentsQuantity, 20);
    assert.equal(item.system.contentsMax, 20);
    assert.equal(item.system.quantity, 1);
    assert.equal(item.system.maxStack, 1);
  }
  const purse = supplyPreset({ name: 'Coin Purse', type: 'equipment', system: {} });
  assert.equal(purse.system.contentsQuantity, 0);
  assert.equal(purse.system.contentsMax, 500);
  const custom = supplyPreset({ name: 'Coin Purse', type: 'equipment', system: { contentsMax: 1000, contentsQuantity: 37 } });
  assert.equal(custom.system.contentsQuantity, 37);
  assert.equal(custom.system.contentsMax, 1000);
});
test('maximum changes preserve counts and type changes reset counts', () => {
  const system = { contentsType: 'arrows', contentsQuantity: 20, contentsMax: 20 };
  assert.equal(supplyUpdate(system, { contentsMax: 40 }).contentsQuantity, undefined);
  assert.equal(supplyUpdate(system, { contentsMax: 10 }).contentsQuantity, undefined);
  assert.equal(supplyUpdate(system, { contentsType: 'gold', contentsQuantity: 100 }).contentsQuantity, 0);
  assert.equal(supplyUpdate(system, { contentsType: '' }).contentsQuantity, 0);
  assert.throws(() => supplyUpdate(system, { contentsQuantity: 21 }), /maximum/);
  assert.throws(() => supplyUpdate(system, { contentsQuantity: -1 }), /whole numbers/);
  assert.throws(() => supplyUpdate(system, { contentsMax: 1.5 }), /whole numbers/);
  assert.equal(supplyUpdate({ ...system, contentsMax: 10 }, { contentsQuantity: 19 }).quantity, 1);
});
test('gold totals count purse contents and loose coins exactly once; holders never stack', () => {
  const purse = supplyPreset({ name: 'Coin Purse', type: 'equipment', system: { contentsQuantity: 37 } });
  assert.equal(goldTotal([purse, goldStack(5)]), 42);
  purse.system.contentsQuantity = 0;
  assert.equal(goldTotal([purse]), 0);
  assert.equal(purse.system.quantity, 1);
  const second = structuredClone(purse);
  purse.system.maxStack = second.system.maxStack = 10;
  assert.equal(canStack(purse, second), false);
});
