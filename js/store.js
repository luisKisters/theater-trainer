const STORE_KEY = 'tt_state';

const DEFAULTS = {
  apiKey: '',
  liveModel: 'gemini-3.1-flash-live-preview',
  textModel: 'gemini-flash-latest',
  voice: 'Puck',
  waitMs: 3500,
  showCorrections: true,
  currentScriptId: null,
};

function load() {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw);
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(state) {
  globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(state));
}

function getDefaults() {
  return { ...DEFAULTS };
}

export { DEFAULTS, load, save, getDefaults };
