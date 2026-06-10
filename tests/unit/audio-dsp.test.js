import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floatTo16kBase64, bytesToBase64, base64ToBytes, scheduleChunkTimes } from '../../js/audio-dsp.js';

// ---------------------------------------------------------------------------
// Resample length
// ---------------------------------------------------------------------------

test('floatTo16kBase64: output sample count equals floor(inputLen * 16000 / sourceRate)', () => {
  const sourceSampleRate = 48000;
  const inputSamples = 4800; // 0.1 s at 48 kHz → 1600 samples at 16 kHz
  const b64 = floatTo16kBase64(new Float32Array(inputSamples).fill(0), sourceSampleRate);
  const bytes = base64ToBytes(b64);
  const expectedSamples = Math.floor(inputSamples * 16000 / sourceSampleRate);
  assert.equal(bytes.byteLength, expectedSamples * 2, 'each sample is 2 bytes (Int16)');
});

test('floatTo16kBase64: source rate equal to target (16 kHz) preserves length', () => {
  const samples = 800;
  const b64 = floatTo16kBase64(new Float32Array(samples).fill(0.1), 16000);
  const bytes = base64ToBytes(b64);
  assert.equal(bytes.byteLength, samples * 2);
});

test('floatTo16kBase64: empty input produces empty output', () => {
  const b64 = floatTo16kBase64(new Float32Array(0), 48000);
  const bytes = base64ToBytes(b64);
  assert.equal(bytes.byteLength, 0);
});

// ---------------------------------------------------------------------------
// Scaling / clamping
// ---------------------------------------------------------------------------

test('floatTo16kBase64: silence (0.0) maps to Int16 zero', () => {
  const b64 = floatTo16kBase64(new Float32Array([0.0]), 16000);
  const int16 = new Int16Array(base64ToBytes(b64).buffer);
  assert.equal(int16[0], 0);
});

test('floatTo16kBase64: full-scale positive (1.0) maps to 32767', () => {
  const b64 = floatTo16kBase64(new Float32Array([1.0]), 16000);
  const int16 = new Int16Array(base64ToBytes(b64).buffer);
  assert.equal(int16[0], 32767);
});

test('floatTo16kBase64: full-scale negative (-1.0) maps to -32767', () => {
  const b64 = floatTo16kBase64(new Float32Array([-1.0]), 16000);
  const int16 = new Int16Array(base64ToBytes(b64).buffer);
  assert.equal(int16[0], -32767);
});

test('floatTo16kBase64: overflow positive (2.0) clamps to 32767', () => {
  const b64 = floatTo16kBase64(new Float32Array([2.0]), 16000);
  const int16 = new Int16Array(base64ToBytes(b64).buffer);
  assert.equal(int16[0], 32767);
});

test('floatTo16kBase64: overflow negative (-2.0) clamps to -32768', () => {
  const b64 = floatTo16kBase64(new Float32Array([-2.0]), 16000);
  const int16 = new Int16Array(base64ToBytes(b64).buffer);
  assert.equal(int16[0], -32768);
});

// ---------------------------------------------------------------------------
// Base64 round-trip
// ---------------------------------------------------------------------------

test('bytesToBase64 + base64ToBytes: round-trip preserves all bytes', () => {
  const original = new Uint8Array([0, 1, 2, 64, 128, 200, 254, 255]);
  const recovered = base64ToBytes(bytesToBase64(original));
  assert.deepEqual(recovered, original);
});

test('bytesToBase64 + base64ToBytes: empty array round-trips correctly', () => {
  const recovered = base64ToBytes(bytesToBase64(new Uint8Array(0)));
  assert.equal(recovered.byteLength, 0);
});

test('bytesToBase64 + base64ToBytes: 256-byte range round-trips correctly', () => {
  const original = new Uint8Array(256);
  for (let i = 0; i < 256; i++) original[i] = i;
  const recovered = base64ToBytes(bytesToBase64(original));
  assert.deepEqual(recovered, original);
});

test('floatTo16kBase64 + base64ToBytes: round-trip preserves Int16 values', () => {
  const input = new Float32Array([0.5, -0.5, 0.25, -0.25]);
  const b64 = floatTo16kBase64(input, 16000);
  const bytes = base64ToBytes(b64);
  const int16 = new Int16Array(bytes.buffer);
  assert.equal(int16.length, 4);
  assert.ok(int16[0] > 0, 'positive sample → positive Int16');
  assert.ok(int16[1] < 0, 'negative sample → negative Int16');
});

// ---------------------------------------------------------------------------
// Schedule-time monotonicity
// ---------------------------------------------------------------------------

test('scheduleChunkTimes: returns empty array for empty input', () => {
  assert.deepEqual(scheduleChunkTimes([], 0, 24000), []);
});

test('scheduleChunkTimes: single chunk first time equals currentTime', () => {
  const times = scheduleChunkTimes([{ byteLength: 48000 }], 1.5, 24000);
  assert.equal(times[0], 1.5);
});

test('scheduleChunkTimes: times are strictly monotonically increasing', () => {
  const chunks = [
    { byteLength: 48000 }, // 1 s at 24 kHz Int16
    { byteLength: 24000 }, // 0.5 s
    { byteLength: 12000 }, // 0.25 s
  ];
  const times = scheduleChunkTimes(chunks, 0.5, 24000);
  assert.equal(times.length, 3);
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] > times[i - 1], `time[${i}] must be > time[${i - 1}]`);
  }
});

test('scheduleChunkTimes: duration of 1-second chunk is 1 second', () => {
  const sampleRate = 24000;
  const bytesPerSample = 2;
  const chunks = [
    { byteLength: sampleRate * bytesPerSample }, // exactly 1 second
    { byteLength: sampleRate * bytesPerSample },
  ];
  const times = scheduleChunkTimes(chunks, 0, sampleRate);
  assert.equal(times[0], 0);
  assert.ok(Math.abs(times[1] - 1.0) < 1e-9, 'second chunk starts at t=1');
});

test('scheduleChunkTimes: custom bytesPerSample is respected', () => {
  // 4 bytes per sample (Float32)
  const chunks = [{ byteLength: 24000 * 4 }]; // 1 s at 24 kHz Float32
  const times = scheduleChunkTimes(chunks, 0, 24000, 4);
  assert.equal(times.length, 1);
  assert.equal(times[0], 0);
  // Next chunk would start at t=1 — verify by passing two chunks
  const t2 = scheduleChunkTimes(
    [{ byteLength: 24000 * 4 }, { byteLength: 24000 * 4 }],
    0, 24000, 4
  );
  assert.ok(Math.abs(t2[1] - 1.0) < 1e-9);
});
