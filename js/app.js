import { load, save } from './store.js';

const VIEWS = ['library', 'add', 'rehearse', 'settings'];
// These views depend on runtime state and must re-render on every navigation.
const DYNAMIC_VIEWS = new Set(['rehearse', 'settings']);

const VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Perseus'];

function getView() {
  const hash = location.hash.slice(1);
  return VIEWS.includes(hash) ? hash : 'library';
}

function renderLibrary(el) {
  el.innerHTML = `
    <h1>Script Library</h1>
    <div id="library-list"></div>
  `;
}

function renderAdd(el) {
  el.innerHTML = `
    <h1>Add Script</h1>
    <div class="form-group">
      <label class="form-label" for="paste-input">Paste script text</label>
      <textarea class="form-input" id="paste-input" rows="8" placeholder="Paste your script here…"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label" for="file-input">Or upload PDF / images</label>
      <input class="form-input" type="file" id="file-input" accept=".pdf,image/*" multiple />
    </div>
    <div class="form-group">
      <label class="form-label" for="camera-input">Or capture with camera</label>
      <input class="form-input" type="file" id="camera-input" accept="image/*" capture="environment" />
    </div>
    <button class="btn primary" id="btn-process">Process Script</button>
    <div id="add-status"></div>
  `;
}

function renderRehearse(el) {
  const state = load();
  if (!state.apiKey) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔑</div>
        <p>A Gemini API key is required to rehearse.</p>
        <button class="btn accent" onclick="location.hash='settings'">Add API Key in Settings</button>
      </div>
    `;
    return;
  }
  el.innerHTML = `
    <div class="empty-state">
      <div class="icon">🎭</div>
      <p>No script selected. Go to Library to pick one.</p>
      <button class="btn accent" onclick="location.hash='library'">Go to Library</button>
    </div>
  `;
}

function renderSettings(el) {
  const state = load();
  const voiceOptions = VOICES
    .map(v => `<option value="${v}"${v === state.voice ? ' selected' : ''}>${v}</option>`)
    .join('');
  const waitSec = (state.waitMs / 1000).toFixed(1);

  el.innerHTML = `
    <h1>Settings</h1>

    <div class="form-group">
      <label class="form-label" for="api-key-input">Gemini API Key</label>
      <input class="form-input" type="password" id="api-key-input" placeholder="AIza…" autocomplete="off" />
      <p class="form-note">Stored only in this browser. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a key at aistudio.google.com</a></p>
    </div>

    <div class="form-group">
      <label class="form-label" for="voice-picker">Partner Voice</label>
      <select class="form-input" id="voice-picker">${voiceOptions}</select>
    </div>

    <div class="form-group">
      <label class="form-label" for="live-model">Live Model</label>
      <input class="form-input" type="text" id="live-model" value="${escHtml(state.liveModel)}" />
    </div>

    <div class="form-group">
      <label class="form-label" for="text-model">Ingestion Model</label>
      <input class="form-input" type="text" id="text-model" value="${escHtml(state.textModel)}" />
    </div>

    <div class="form-group">
      <label class="form-label" for="slider-wait">How long it waits before replying</label>
      <div class="slider-row">
        <input type="range" id="slider-wait" min="1500" max="6000" step="100" value="${state.waitMs}" />
        <span class="slider-val" id="wait-display">${waitSec}s</span>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" style="display:flex;align-items:center;gap:10px;text-transform:none;letter-spacing:0;font-size:14px;">
        <input type="checkbox" id="show-corrections"${state.showCorrections ? ' checked' : ''} />
        Show word-by-word corrections
      </label>
    </div>

    <button class="btn primary" id="btn-save-settings">Save Settings</button>
    <div id="settings-status"></div>
  `;

  const keyInput = el.querySelector('#api-key-input');
  if (state.apiKey) keyInput.value = state.apiKey;

  const waitSlider = el.querySelector('#slider-wait');
  const waitDisplay = el.querySelector('#wait-display');
  waitSlider.addEventListener('input', () => {
    waitDisplay.textContent = (parseInt(waitSlider.value) / 1000).toFixed(1) + 's';
  });

  el.querySelector('#btn-save-settings').addEventListener('click', () => {
    const newState = {
      ...state,
      apiKey: keyInput.value.trim(),
      voice: el.querySelector('#voice-picker').value,
      liveModel: el.querySelector('#live-model').value.trim(),
      textModel: el.querySelector('#text-model').value.trim(),
      waitMs: parseInt(waitSlider.value, 10),
      showCorrections: el.querySelector('#show-corrections').checked,
    };
    save(newState);
    showToast('Settings saved', 'ok');
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function navigate(view) {
  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    const tab = document.querySelector(`.nav-tab[data-view="${v}"]`);
    if (v === view) {
      el.classList.add('active');
      tab && tab.classList.add('active');
    } else {
      el.classList.remove('active');
      tab && tab.classList.remove('active');
    }
  });

  const el = document.getElementById(`view-${view}`);
  if (!el._rendered || DYNAMIC_VIEWS.has(view)) {
    const renderers = { library: renderLibrary, add: renderAdd, rehearse: renderRehearse, settings: renderSettings };
    renderers[view]?.(el);
    if (!DYNAMIC_VIEWS.has(view)) el._rendered = true;
  }
}

function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// Nav tab clicks
document.getElementById('nav-tabs').addEventListener('click', e => {
  const tab = e.target.closest('.nav-tab');
  if (!tab) return;
  location.hash = tab.dataset.view;
});

// Hash-based routing
window.addEventListener('hashchange', () => navigate(getView()));

// Service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Initial render
navigate(getView());
