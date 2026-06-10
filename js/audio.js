// Browser-only audio I/O — requires Web Audio API and getUserMedia.
// REAL MIC CAPTURE AND PLAYBACK ARE VERIFIED ONLY VIA THE MANUAL BROWSER SMOKE TEST.
// No audio device exists in CI; automated tests use MockAudioIO exclusively.

import { floatTo16kBase64, base64ToBytes } from './audio-dsp.js';

// AudioWorklet processor source string (instantiated via Blob URL).
// Runs inside the AudioWorkletGlobalScope — Float32 frames are buffered
// into fixed-size chunks and posted back to the main thread.
const WORKLET_SRC = `
class ChunkProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._chunkSize = 4800; // 0.1 s at 48 kHz
  }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);
    while (this._buf.length >= this._chunkSize) {
      this.port.postMessage(new Float32Array(this._buf.splice(0, this._chunkSize)));
    }
    return true;
  }
}
registerProcessor('tt-chunk-processor', ChunkProcessor);
`;

// ---------------------------------------------------------------------------
// MicCapture — captures mic audio via AudioWorklet, emits 16 kHz Int16 base64
// ---------------------------------------------------------------------------
export class MicCapture {
  constructor() {
    this._ctx = null;
    this._source = null;
    this._node = null;
    this._stream = null;
  }

  // BROWSER ONLY. Calls onChunk(base64string) for each ~0.1s PCM chunk.
  async start(onChunk) {
    this._stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this._ctx = new AudioContext();
    const blob = new Blob([WORKLET_SRC], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    await this._ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    this._source = this._ctx.createMediaStreamSource(this._stream);
    this._node = new AudioWorkletNode(this._ctx, 'tt-chunk-processor');
    this._node.port.onmessage = e => {
      onChunk(floatTo16kBase64(e.data, this._ctx.sampleRate));
    };
    this._source.connect(this._node);
    // Connect to destination to keep the graph alive (audio not audible — input only)
    this._node.connect(this._ctx.destination);
  }

  stop() {
    try { this._node?.disconnect(); } catch (_) {}
    try { this._source?.disconnect(); } catch (_) {}
    this._stream?.getTracks().forEach(t => t.stop());
    this._ctx?.close();
    this._ctx = null;
    this._stream = null;
    this._node = null;
    this._source = null;
  }
}

// ---------------------------------------------------------------------------
// PcmPlayer — gapless playback of 24 kHz Int16 base64 chunks
// ---------------------------------------------------------------------------
export class PcmPlayer {
  constructor(sampleRate = 24000) {
    this._sampleRate = sampleRate;
    this._ctx = null;
    this._nextTime = 0;
  }

  _ctx_() {
    if (!this._ctx || this._ctx.state === 'closed') {
      this._ctx = new AudioContext({ sampleRate: this._sampleRate });
      this._nextTime = this._ctx.currentTime;
    }
    return this._ctx;
  }

  // BROWSER ONLY. Schedules a base64-encoded Int16 PCM chunk for gapless playback.
  play(base64) {
    const ctx = this._ctx_();
    const bytes = base64ToBytes(base64);
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
    const buf = ctx.createBuffer(1, float32.length, this._sampleRate);
    buf.copyToChannel(float32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const startAt = Math.max(this._nextTime, ctx.currentTime);
    src.start(startAt);
    this._nextTime = startAt + buf.duration;
  }

  // Immediately stop all queued audio (used on interruption).
  flush() {
    this._ctx?.close();
    this._ctx = null;
    this._nextTime = 0;
  }
}

// ---------------------------------------------------------------------------
// AudioIO — unified interface combining MicCapture + PcmPlayer (real browser)
// ---------------------------------------------------------------------------
export class AudioIO {
  constructor() {
    this._mic = new MicCapture();
    this._player = new PcmPlayer(24000);
  }

  async startMic(onChunk) { await this._mic.start(onChunk); }
  stopMic() { this._mic.stop(); }
  play(base64) { this._player.play(base64); }
  flush() { this._player.flush(); }
  stop() { this._mic.stop(); this._player.flush(); }
}

// ---------------------------------------------------------------------------
// MockAudioIO — no Web Audio, no mic; drives automated tests via test seam
// ---------------------------------------------------------------------------
export class MockAudioIO {
  constructor() {
    this._micCb = null;
    this._played = [];
    this._flushed = false;
    this._micStarted = false;
  }

  async startMic(onChunk) {
    this._micCb = onChunk;
    this._micStarted = true;
  }

  stopMic() {
    this._micCb = null;
    this._micStarted = false;
  }

  /** Feed a base64 chunk as if the mic captured it (test helper). */
  injectMicChunk(b64) { this._micCb?.(b64); }

  play(base64) { this._played.push(base64); }

  flush() {
    this._flushed = true;
    this._played = [];
  }

  stop() { this.stopMic(); this.flush(); }

  get playedChunks() { return [...this._played]; }
  get wasFlushed() { return this._flushed; }
  get micStarted() { return this._micStarted; }
}
