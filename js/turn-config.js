const END_SENSITIVITY_LOW = 'END_SENSITIVITY_LOW';
const START_SENSITIVITY_LOW = 'START_SENSITIVITY_LOW';
const PREFIX_PADDING_MS = 300;

function buildVadConfig(waitMs) {
  const silenceDurationMs = Math.round(Math.max(1500, Math.min(6000, waitMs)));
  return {
    silenceDurationMs,
    endOfSpeechSensitivity: END_SENSITIVITY_LOW,
    startOfSpeechSensitivity: START_SENSITIVITY_LOW,
    prefixPaddingMs: PREFIX_PADDING_MS,
  };
}

export { buildVadConfig };
