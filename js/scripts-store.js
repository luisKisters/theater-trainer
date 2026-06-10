const SCRIPTS_KEY = 'tt_scripts';

function loadScripts() {
  try {
    const raw = globalThis.localStorage?.getItem(SCRIPTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveScripts(scripts) {
  globalThis.localStorage?.setItem(SCRIPTS_KEY, JSON.stringify(scripts));
}

function addScript(script) {
  const scripts = loadScripts();
  scripts.push(script);
  saveScripts(scripts);
}

function deleteScript(id) {
  saveScripts(loadScripts().filter(s => s.id !== id));
}

function updateScript(id, updates) {
  saveScripts(loadScripts().map(s => s.id === id ? { ...s, ...updates } : s));
}

export { loadScripts, saveScripts, addScript, deleteScript, updateScript };
