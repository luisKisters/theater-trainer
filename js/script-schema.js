const SCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    author: { type: 'string' },
    language: { type: 'string' },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['id', 'name'],
      },
    },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          character_id: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['character_id', 'text'],
      },
    },
  },
  required: ['title', 'language', 'characters', 'lines'],
};

const INGEST_PROMPT = `You are a script parser. Extract all spoken dialogue from the provided theatrical script.
Return JSON with:
- title: the play or script title
- author: playwright name, or empty string if unknown
- language: ISO 639-1 code (e.g. "en", "de")
- characters: array of every speaking character, each with id (snake_case, stable identifier) and name
- lines: every dialogue line in order, each with character_id and the exact spoken text

Omit stage directions. Keep dialogue exactly as written.`;

function buildIngestParts({ text, files }) {
  const parts = [{ text: INGEST_PROMPT }];
  if (text && text.trim()) {
    parts.push({ text: `Script text:\n${text}` });
  }
  for (const f of (files || [])) {
    parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
  }
  return parts;
}

function validateScript(script) {
  if (!script || typeof script !== 'object') return false;
  if (typeof script.title !== 'string' || !script.title.trim()) return false;
  if (typeof script.language !== 'string' || !script.language.trim()) return false;
  if (!Array.isArray(script.characters) || script.characters.length === 0) return false;
  if (!Array.isArray(script.lines) || script.lines.length === 0) return false;
  return true;
}

export { SCRIPT_SCHEMA, INGEST_PROMPT, buildIngestParts, validateScript };
