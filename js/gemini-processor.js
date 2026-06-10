import { GoogleGenAI } from '@google/genai';
import { SCRIPT_SCHEMA, buildIngestParts } from './script-schema.js';

class GeminiProcessor {
  constructor(apiKey, model) {
    this._ai = new GoogleGenAI({ apiKey });
    this._model = model;
  }

  async process({ text, files }) {
    const parts = buildIngestParts({ text, files });
    const response = await this._ai.models.generateContent({
      model: this._model,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: SCRIPT_SCHEMA,
      },
    });
    return JSON.parse(response.text());
  }
}

export { GeminiProcessor };
