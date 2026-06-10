import { test } from 'node:test';
import assert from 'node:assert/strict';

const { buildIngestParts, validateScript } = await import('../../js/script-schema.js');
const { fileToBase64, MockProcessor, FIXTURE_SCRIPT } = await import('../../js/script-processor.js');

// --- buildIngestParts ---

test('buildIngestParts includes system prompt as first part', () => {
  const parts = buildIngestParts({ text: 'hello', files: [] });
  assert.ok(parts.length >= 2);
  assert.equal(typeof parts[0].text, 'string');
  assert.ok(parts[0].text.length > 10);
});

test('buildIngestParts includes text part when text provided', () => {
  const parts = buildIngestParts({ text: 'ROMEO: Wherefore art thou', files: [] });
  const textPart = parts.find(p => p.text && p.text.includes('Script text:'));
  assert.ok(textPart, 'should have a script text part');
  assert.ok(textPart.text.includes('ROMEO: Wherefore art thou'));
});

test('buildIngestParts skips text part when text is empty', () => {
  const parts = buildIngestParts({ text: '', files: [] });
  assert.equal(parts.length, 1);
});

test('buildIngestParts skips text part when text is whitespace only', () => {
  const parts = buildIngestParts({ text: '   \n  ', files: [] });
  assert.equal(parts.length, 1);
});

test('buildIngestParts includes inlineData parts for files', () => {
  const files = [
    { mimeType: 'image/jpeg', data: 'base64data1' },
    { mimeType: 'application/pdf', data: 'base64data2' },
  ];
  const parts = buildIngestParts({ text: '', files });
  assert.equal(parts.length, 3);
  assert.deepEqual(parts[1].inlineData, { mimeType: 'image/jpeg', data: 'base64data1' });
  assert.deepEqual(parts[2].inlineData, { mimeType: 'application/pdf', data: 'base64data2' });
});

test('buildIngestParts handles missing files gracefully', () => {
  const parts = buildIngestParts({ text: 'some text' });
  assert.ok(parts.length >= 2);
});

// --- validateScript ---

test('validateScript accepts a valid script', () => {
  const script = {
    title: 'Romeo and Juliet',
    language: 'en',
    characters: [{ id: 'romeo', name: 'Romeo' }],
    lines: [{ character_id: 'romeo', text: 'But soft!' }],
  };
  assert.equal(validateScript(script), true);
});

test('validateScript accepts script with author field', () => {
  const script = {
    title: 'Hamlet',
    author: 'Shakespeare',
    language: 'en',
    characters: [{ id: 'hamlet', name: 'Hamlet' }],
    lines: [{ character_id: 'hamlet', text: 'To be or not to be.' }],
  };
  assert.equal(validateScript(script), true);
});

test('validateScript rejects null', () => {
  assert.equal(validateScript(null), false);
});

test('validateScript rejects missing title', () => {
  assert.equal(validateScript({ language: 'en', characters: [{ id: 'a', name: 'A' }], lines: [{ character_id: 'a', text: 'hi' }] }), false);
});

test('validateScript rejects empty title', () => {
  assert.equal(validateScript({ title: '', language: 'en', characters: [{ id: 'a', name: 'A' }], lines: [{ character_id: 'a', text: 'hi' }] }), false);
});

test('validateScript rejects whitespace-only title', () => {
  assert.equal(validateScript({ title: '   ', language: 'en', characters: [{ id: 'a', name: 'A' }], lines: [{ character_id: 'a', text: 'hi' }] }), false);
});

test('validateScript rejects missing language', () => {
  assert.equal(validateScript({ title: 'Play', characters: [{ id: 'a', name: 'A' }], lines: [{ character_id: 'a', text: 'hi' }] }), false);
});

test('validateScript rejects empty characters array', () => {
  assert.equal(validateScript({ title: 'Play', language: 'en', characters: [], lines: [{ character_id: 'a', text: 'hi' }] }), false);
});

test('validateScript rejects missing characters', () => {
  assert.equal(validateScript({ title: 'Play', language: 'en', lines: [{ character_id: 'a', text: 'hi' }] }), false);
});

test('validateScript rejects empty lines array', () => {
  assert.equal(validateScript({ title: 'Play', language: 'en', characters: [{ id: 'a', name: 'A' }], lines: [] }), false);
});

test('validateScript rejects missing lines', () => {
  assert.equal(validateScript({ title: 'Play', language: 'en', characters: [{ id: 'a', name: 'A' }] }), false);
});

// --- fileToBase64 ---

test('fileToBase64 converts bytes to correct base64', async () => {
  const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
  const blob = new Blob([bytes]);
  const result = await fileToBase64(blob);
  assert.equal(result, 'SGVsbG8=');
});

test('fileToBase64 handles empty file', async () => {
  const blob = new Blob([]);
  const result = await fileToBase64(blob);
  assert.equal(result, '');
});

test('fileToBase64 round-trips binary data', async () => {
  const original = new Uint8Array([0, 1, 127, 128, 255]);
  const blob = new Blob([original]);
  const b64 = await fileToBase64(blob);
  // Decode and compare
  const decoded = atob(b64);
  const back = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) back[i] = decoded.charCodeAt(i);
  assert.deepEqual(Array.from(back), Array.from(original));
});

// --- MockProcessor ---

test('MockProcessor.process returns a valid script', async () => {
  const processor = new MockProcessor();
  const result = await processor.process({ text: 'anything', files: [] });
  assert.equal(validateScript(result), true);
});

test('MockProcessor.process returns independent copies (no shared reference)', async () => {
  const processor = new MockProcessor();
  const r1 = await processor.process({});
  const r2 = await processor.process({});
  r1.title = 'mutated';
  assert.equal(r2.title, FIXTURE_SCRIPT.title);
});

test('MockProcessor fixture has at least 2 characters and 3 lines', () => {
  assert.ok(FIXTURE_SCRIPT.characters.length >= 2);
  assert.ok(FIXTURE_SCRIPT.lines.length >= 3);
});
