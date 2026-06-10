import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVadConfig } from '../../js/turn-config.js';

test('min value (1500ms) produces correct config', () => {
  const cfg = buildVadConfig(1500);
  assert.equal(cfg.silenceDurationMs, 1500);
  assert.equal(cfg.prefixPaddingMs, 300);
  assert.ok(cfg.endOfSpeechSensitivity, 'endOfSpeechSensitivity must be set');
  assert.ok(cfg.startOfSpeechSensitivity, 'startOfSpeechSensitivity must be set');
});

test('mid/default value (3500ms) passes through unchanged', () => {
  const cfg = buildVadConfig(3500);
  assert.equal(cfg.silenceDurationMs, 3500);
});

test('max value (6000ms) produces correct config', () => {
  const cfg = buildVadConfig(6000);
  assert.equal(cfg.silenceDurationMs, 6000);
});

test('value below min clamps to 1500', () => {
  const cfg = buildVadConfig(500);
  assert.equal(cfg.silenceDurationMs, 1500);
});

test('value above max clamps to 6000', () => {
  const cfg = buildVadConfig(9999);
  assert.equal(cfg.silenceDurationMs, 6000);
});

test('sensitivity strings match expected LOW constants', () => {
  const cfg = buildVadConfig(3500);
  assert.equal(cfg.endOfSpeechSensitivity, 'END_SENSITIVITY_LOW');
  assert.equal(cfg.startOfSpeechSensitivity, 'START_SENSITIVITY_LOW');
});

test('prefixPaddingMs is always 300', () => {
  assert.equal(buildVadConfig(1500).prefixPaddingMs, 300);
  assert.equal(buildVadConfig(3500).prefixPaddingMs, 300);
  assert.equal(buildVadConfig(6000).prefixPaddingMs, 300);
});
