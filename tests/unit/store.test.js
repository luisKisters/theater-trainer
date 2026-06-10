import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

class MockStorage {
  constructor() { this._data = {}; }
  getItem(key) { return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null; }
  setItem(key, val) { this._data[key] = String(val); }
  removeItem(key) { delete this._data[key]; }
  clear() { this._data = {}; }
}

// Set up mock before static import runs (only function bodies access it)
globalThis.localStorage = new MockStorage();

const { DEFAULTS, load, save, getDefaults } = await import('../../js/store.js');

beforeEach(() => {
  globalThis.localStorage = new MockStorage();
});

test('DEFAULTS has all required keys with correct types', () => {
  assert.equal(typeof DEFAULTS.apiKey, 'string');
  assert.equal(DEFAULTS.apiKey, '');
  assert.equal(DEFAULTS.liveModel, 'gemini-3.1-flash-live-preview');
  assert.equal(DEFAULTS.textModel, 'gemini-flash-latest');
  assert.equal(DEFAULTS.voice, 'Puck');
  assert.equal(DEFAULTS.waitMs, 3500);
  assert.equal(DEFAULTS.showCorrections, true);
});

test('load returns defaults when storage is empty', () => {
  const state = load();
  assert.deepEqual(state, DEFAULTS);
});

test('save and load roundtrip preserves all fields', () => {
  const toSave = { ...DEFAULTS, apiKey: 'test-key', waitMs: 4000, voice: 'Kore', showCorrections: false };
  save(toSave);
  const loaded = load();
  assert.equal(loaded.apiKey, 'test-key');
  assert.equal(loaded.waitMs, 4000);
  assert.equal(loaded.voice, 'Kore');
  assert.equal(loaded.showCorrections, false);
  assert.equal(loaded.liveModel, DEFAULTS.liveModel);
  assert.equal(loaded.textModel, DEFAULTS.textModel);
});

test('forward-compatible merge: new keys get defaults when loading old saved state', () => {
  // Simulate saved state that is missing newer keys
  globalThis.localStorage.setItem('tt_state', JSON.stringify({ apiKey: 'old-key', waitMs: 5000 }));
  const state = load();
  assert.equal(state.apiKey, 'old-key');
  assert.equal(state.waitMs, 5000);
  assert.equal(state.liveModel, DEFAULTS.liveModel);
  assert.equal(state.textModel, DEFAULTS.textModel);
  assert.equal(state.voice, DEFAULTS.voice);
  assert.equal(state.showCorrections, DEFAULTS.showCorrections);
});

test('load handles corrupt JSON gracefully and returns defaults', () => {
  globalThis.localStorage.setItem('tt_state', 'not-valid-json!!!');
  const state = load();
  assert.deepEqual(state, DEFAULTS);
});

test('getDefaults returns an independent copy (mutations do not affect DEFAULTS)', () => {
  const d1 = getDefaults();
  d1.apiKey = 'mutated';
  const d2 = getDefaults();
  assert.equal(d2.apiKey, '');
  assert.equal(DEFAULTS.apiKey, '');
});

test('load without any localStorage returns defaults gracefully', () => {
  globalThis.localStorage = undefined;
  const state = load();
  assert.deepEqual(state, DEFAULTS);
  // Restore for other tests
  globalThis.localStorage = new MockStorage();
});
