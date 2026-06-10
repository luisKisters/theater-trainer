// Pure audio DSP utilities — no DOM, no SDK imports. Safe to unit-test in Node.

/**
 * Downsample a Float32Array from sourceSampleRate to 16 kHz,
 * convert to Int16 PCM, and return as a base64 string.
 */
function floatTo16kBase64(float32Array, sourceSampleRate) {
  const targetRate = 16000;
  const ratio = sourceSampleRate / targetRate;
  const outLen = Math.floor(float32Array.length / ratio);
  const int16 = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const sample = float32Array[Math.floor(i * ratio)];
    int16[i] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
  }
  return bytesToBase64(new Uint8Array(int16.buffer));
}

/**
 * Encode a Uint8Array to a base64 string.
 */
function bytesToBase64(uint8Array) {
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return globalThis.btoa(binary);
}

/**
 * Decode a base64 string to a Uint8Array.
 */
function base64ToBytes(base64) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Compute monotonically-increasing start times for a queue of audio chunks.
 * Each chunk's duration is chunk.byteLength / (bytesPerSample * sampleRate).
 *
 * @param {Array<{byteLength: number}>} chunks
 * @param {number} currentTime - AudioContext.currentTime to start from
 * @param {number} sampleRate - PCM sample rate (e.g. 24000)
 * @param {number} [bytesPerSample=2] - 2 for Int16
 * @returns {number[]} - start time for each chunk
 */
function scheduleChunkTimes(chunks, currentTime, sampleRate, bytesPerSample = 2) {
  const times = [];
  let t = currentTime;
  for (const chunk of chunks) {
    times.push(t);
    t += chunk.byteLength / (bytesPerSample * sampleRate);
  }
  return times;
}

export { floatTo16kBase64, bytesToBase64, base64ToBytes, scheduleChunkTimes };
