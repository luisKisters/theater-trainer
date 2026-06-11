// REAL GEMINI LIVE API IS VERIFIED ONLY VIA THE MANUAL BROWSER SMOKE TEST.
// Automated tests use MockLiveBackend exclusively via the window.__TT_BACKENDS__ seam.

import { GoogleGenAI } from '@google/genai';

class EventEmitter {
  constructor() { this._h = {}; }
  on(e, fn) { (this._h[e] = this._h[e] || []).push(fn); return this; }
  off(e, fn) { this._h[e] = (this._h[e] || []).filter(h => h !== fn); }
  _emit(e, data) { (this._h[e] || []).slice().forEach(h => h(data)); }
}

/**
 * Build the system prompt that turns Gemini into an expressive scene partner.
 * The AI plays every character except userRoleId and never corrects the user.
 */
export function buildSystemPrompt(script, userRoleId, options = {}) {
  const userChar = script.characters.find(c => c.id === userRoleId);
  const otherChars = script.characters.filter(c => c.id !== userRoleId);
  const startLineIndex = Math.max(0, options.startLineIndex || 0);
  const scriptText = script.lines
    .slice(startLineIndex)
    .map(l => {
      const name = script.characters.find(c => c.id === l.character_id)?.name || l.character_id;
      return `${name}: ${l.text}`;
    })
    .join('\n');

  return `You are a theater rehearsal partner helping a human actor rehearse their lines.

Script: "${script.title}"${script.author ? ` by ${script.author}` : ''}

The human plays ${userChar?.name || userRoleId}. You perform all other characters: ${otherChars.map(c => c.name).join(', ')}.
${startLineIndex > 0 ? `\nEarlier lines have been compacted and should not be spoken. Start from script line ${startLineIndex + 1}.` : ''}
${options.summary ? `\nCompact context: ${options.summary}` : ''}

Script from the rehearsal start:
${scriptText}

Rules:
- Speak ONLY the lines belonging to your characters (never ${userChar?.name || userRoleId}'s lines).
- Wait for the human actor to finish their lines before speaking yours.
- NEVER correct the human verbally — even if they say something wrong, continue with your next line.
- Be expressive and theatrical. Follow the script exactly; do not improvise.`;
}

/**
 * Real Gemini Live API backend.
 * VERIFIED ONLY VIA THE MANUAL BROWSER SMOKE TEST.
 *
 * Events emitted:
 *   connected, disconnected, error(err)
 *   inputTranscription({text})  — user speech transcript chunk
 *   outputTranscription({text}) — AI speech transcript chunk
 *   audio({data})               — AI audio PCM base64 chunk (24 kHz)
 *   turnComplete                — AI finished its turn
 *   interrupted                 — AI response was interrupted
 */
export class GeminiLiveBackend extends EventEmitter {
  constructor(apiKey, model) {
    super();
    this._ai = new GoogleGenAI({ apiKey });
    this._model = model;
    this._session = null;
  }

  async connect({ voice, vadConfig, systemPrompt }) {
    this._session = await this._ai.live.connect({
      model: this._model,
      config: {
        responseModalities: ['AUDIO'],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        systemInstruction: { parts: [{ text: systemPrompt }] },
        realtimeInputConfig: {
          automaticActivityDetection: { disabled: false, ...vadConfig },
        },
      },
      callbacks: {
        onmessage: (msg) => this._handleMsg(msg),
        onerror: (err) => this._emit('error', err),
        onclose: () => this._emit('disconnected'),
      },
    });
    this._emit('connected');
  }

  _handleMsg(msg) {
    const sc = msg.serverContent;
    if (!sc) return;
    if (sc.inputTranscription?.text) {
      this._emit('inputTranscription', { text: sc.inputTranscription.text });
    }
    if (sc.outputTranscription?.text) {
      this._emit('outputTranscription', { text: sc.outputTranscription.text });
    }
    if (sc.modelTurn?.parts) {
      for (const p of sc.modelTurn.parts) {
        if (p.inlineData?.data) this._emit('audio', { data: p.inlineData.data });
      }
    }
    if (sc.interrupted) this._emit('interrupted');
    if (sc.turnComplete) this._emit('turnComplete');
  }

  sendAudio(base64) {
    this._session?.sendRealtimeInput({ audio: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
  }

  sendText(text) {
    this._session?.sendClientContent({
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete: true,
    });
  }

  disconnect() {
    try { this._session?.close(); } catch (_) {}
    this._session = null;
  }
}

/**
 * Mock Live backend for automated tests.
 * Inject via window.__TT_BACKENDS__.liveBackend before page load.
 * After Start is clicked, call trigger methods from page.evaluate() to drive the rehearsal.
 */
export class MockLiveBackend extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
  }

  async connect() {
    this.connected = true;
    this._emit('connected');
  }

  disconnect() {
    this.connected = false;
    this._emit('disconnected');
  }

  sendAudio() {}

  sendText(text) { this._emit('clientText', { text }); }

  triggerInputTranscription(text) { this._emit('inputTranscription', { text }); }
  triggerOutputTranscription(text) { this._emit('outputTranscription', { text }); }
  triggerAudio(data = 'AAAA') { this._emit('audio', { data }); }
  triggerTurnComplete() { this._emit('turnComplete'); }
  triggerInterrupted() { this._emit('interrupted'); }
}
