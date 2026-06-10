// Four-view SPA router for Theater Trainer
const VIEWS = ['library', 'add', 'rehearse', 'settings'];

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
  el.innerHTML = `
    <div class="empty-state">
      <div class="icon">🎭</div>
      <p>No script selected. Go to Library to pick one.</p>
      <button class="btn accent" onclick="location.hash='library'">Go to Library</button>
    </div>
  `;
}

function renderSettings(el) {
  el.innerHTML = `
    <h1>Settings</h1>
    <div class="form-group">
      <label class="form-label" for="api-key-input">Gemini API Key</label>
      <input class="form-input" type="password" id="api-key-input" placeholder="AIza…" autocomplete="off" />
      <p class="form-note">Stored only in this browser. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a key at aistudio.google.com</a></p>
    </div>
    <button class="btn primary" id="btn-save-settings">Save Settings</button>
    <div id="settings-status"></div>
  `;

  const keyInput = document.getElementById('api-key-input');
  const savedKey = localStorage.getItem('tt_api_key') || '';
  if (savedKey) keyInput.value = savedKey;

  document.getElementById('btn-save-settings').addEventListener('click', () => {
    const key = keyInput.value.trim();
    localStorage.setItem('tt_api_key', key);
    showToast('Settings saved', 'ok');
  });
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
  if (!el._rendered) {
    const renderers = { library: renderLibrary, add: renderAdd, rehearse: renderRehearse, settings: renderSettings };
    renderers[view]?.(el);
    el._rendered = true;
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
