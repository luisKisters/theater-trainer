import { load, save } from './store.js';
import { loadScripts, addScript, deleteScript, updateScript } from './scripts-store.js';
import { validateScript } from './script-schema.js';
import { fileToBase64 } from './script-processor.js';
import { createTeleprompter } from './teleprompter.js';
import { buildVadConfig } from './turn-config.js';

const VIEWS = ['library', 'add', 'rehearse', 'settings'];
let _rehearseCleanup = null;
const DYNAMIC_VIEWS = new Set(['library', 'rehearse', 'settings']);

const VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Perseus'];

function getView() {
  const hash = location.hash.slice(1);
  return VIEWS.includes(hash) ? hash : 'library';
}

function renderLibrary(el) {
  const scripts = loadScripts();

  if (scripts.length === 0) {
    el.innerHTML = `
      <h1>Script Library</h1>
      <div class="empty-state">
        <div class="icon">📄</div>
        <p>No scripts yet. Add one to get started.</p>
        <button class="btn accent" onclick="location.hash='add'">Add Script</button>
      </div>
    `;
    return;
  }

  const cards = scripts.map(s => {
    const lineCount = s.lines?.length || 0;
    const roleName = s.characters?.find(c => c.id === s.selectedRole)?.name || 'No role selected';
    return `
      <div class="script-card">
        <div class="info">
          <div class="title">${escHtml(s.title)}</div>
          <div class="meta">${escHtml(s.author || 'Unknown')} · ${lineCount} lines · ${escHtml(s.language || '')} · ${escHtml(roleName)}</div>
        </div>
        <button class="btn accent btn-open-script" data-script-id="${escHtml(s.id)}">Open</button>
        <button class="btn btn-delete-script" data-script-id="${escHtml(s.id)}">Delete</button>
      </div>
    `;
  }).join('');

  el.innerHTML = `
    <h1>Script Library</h1>
    <div id="library-list">${cards}</div>
    <div id="role-picker-dialog" class="dialog hidden" role="dialog" aria-modal="true" aria-label="Pick Your Role">
      <div class="dialog-content">
        <h2>Pick Your Role</h2>
        <div id="role-picker-list"></div>
        <button class="btn" id="btn-close-role-picker">Cancel</button>
      </div>
    </div>
  `;

  el.addEventListener('click', e => {
    const openBtn = e.target.closest('.btn-open-script');
    if (openBtn) {
      showRolePicker(el, openBtn.dataset.scriptId);
      return;
    }

    const delBtn = e.target.closest('.btn-delete-script');
    if (delBtn) {
      if (confirm('Delete this script?')) {
        deleteScript(delBtn.dataset.scriptId);
        renderLibrary(el);
      }
    }
  });

  const pendingRolePickId = globalThis.sessionStorage?.getItem('tt_pending_role_pick');
  if (pendingRolePickId && scripts.some(s => s.id === pendingRolePickId)) {
    globalThis.sessionStorage?.removeItem('tt_pending_role_pick');
    setTimeout(() => showRolePicker(el, pendingRolePickId), 0);
  }
}

function showRolePicker(el, scriptId) {
  const script = loadScripts().find(s => s.id === scriptId);
  if (!script) return;

  const dialog = el.querySelector('#role-picker-dialog');
  const list = el.querySelector('#role-picker-list');

  list.innerHTML = script.characters.map(c => `
    <button class="btn role-btn" data-role-id="${escHtml(c.id)}" data-script-id="${escHtml(scriptId)}">
      ${escHtml(c.name)}
    </button>
  `).join('');

  dialog.classList.remove('hidden');

  list.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      updateScript(btn.dataset.scriptId, { selectedRole: btn.dataset.roleId });
      save({ ...load(), currentScriptId: btn.dataset.scriptId });
      dialog.classList.add('hidden');
      location.hash = 'rehearse';
    });
  });

  dialog.querySelector('#btn-close-role-picker')?.addEventListener('click', () => {
    dialog.classList.add('hidden');
  });
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
    <div id="add-status" class="add-status"></div>
  `;

  const btn = el.querySelector('#btn-process');
  const statusEl = el.querySelector('#add-status');

  btn.addEventListener('click', async () => {
    const text = el.querySelector('#paste-input').value.trim();
    const fileInput = el.querySelector('#file-input');
    const cameraInput = el.querySelector('#camera-input');
    const allFiles = [
      ...Array.from(fileInput.files || []),
      ...Array.from(cameraInput.files || []),
    ];

    if (!text && allFiles.length === 0) {
      setStatus(statusEl, 'Please paste text or upload a file.', 'error');
      return;
    }

    let processor;
    let usesInjectedProcessor = false;
    if (window.__TT_BACKENDS__?.scriptProcessor) {
      processor = window.__TT_BACKENDS__.scriptProcessor;
      usesInjectedProcessor = true;
    } else {
      const state = load();
      if (!state.apiKey) {
        setStatus(statusEl, 'An API key is required. Add one in Settings.', 'error');
        return;
      }
      const { GeminiProcessor } = await import('./gemini-processor.js');
      processor = new GeminiProcessor(state.apiKey, state.textModel);
    }

    btn.disabled = true;
    setStatus(statusEl, 'Processing script…', 'processing');

    try {
      const files = await Promise.all(
        allFiles.map(async f => ({ mimeType: f.type, data: await fileToBase64(f) }))
      );

      const result = await processor.process({ text, files });

      if (!validateScript(result)) {
        throw new Error('Invalid script structure returned by processor');
      }

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      addScript({ id, ...result, selectedRole: null, addedAt: new Date().toISOString() });
      if (!usesInjectedProcessor) {
        globalThis.sessionStorage?.setItem('tt_pending_role_pick', id);
      }

      setStatus(statusEl, 'Script added!', 'ok');
      setTimeout(() => { location.hash = 'library'; }, 600);
    } catch (err) {
      setStatus(statusEl, `Error: ${err.message}`, 'error');
      btn.disabled = false;
    }
  });
}

function setStatus(el, msg, type) {
  el.textContent = msg;
  el.className = `add-status ${type}`;
}

function renderRehearse(el) {
  if (_rehearseCleanup) { _rehearseCleanup(); _rehearseCleanup = null; }

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

  if (!state.currentScriptId) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="icon">🎭</div>
        <p>No script selected. Go to Library to pick one.</p>
        <button class="btn accent" onclick="location.hash='library'">Go to Library</button>
      </div>
    `;
    return;
  }

  const scripts = loadScripts();
  const script = scripts.find(s => s.id === state.currentScriptId);
  if (!script || !script.selectedRole) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="icon">🎭</div>
        <p>Script not found or no role selected.</p>
        <button class="btn accent" onclick="location.hash='library'">Back to Library</button>
      </div>
    `;
    return;
  }

  const role = script.characters.find(c => c.id === script.selectedRole);
  el.innerHTML = `
    <div class="rehearse-header">
      <h1>${escHtml(script.title)}</h1>
      <p class="rehearse-role">You are playing <strong class="rehearse-role-name">${escHtml(role?.name || script.selectedRole)}</strong></p>
      <div class="script-progress" aria-label="Script progress">
        <div class="script-progress-track">
          <div class="script-progress-fill" id="script-progress-fill"></div>
        </div>
        <div class="script-progress-label" id="script-progress-label">0%</div>
      </div>
    </div>
    <div class="scene" id="scene">
      <div class="scene-inner" id="scene-inner"></div>
    </div>
    <div class="controls">
      <div class="handle"></div>
      <div class="controls-inner">
        <button class="btn primary" id="btn-reveal-word" disabled><span class="k">space</span> Reveal next word</button>
        <button class="btn accent" id="btn-start">▶ Start</button>
        <button class="btn" id="btn-pause" disabled>⏸ Pause</button>
        <button class="btn" id="btn-compact">Compact to cue</button>
        <button class="btn" id="btn-prev-line">← Prev</button>
        <button class="btn" id="btn-next-line">Next →</button>
        <div class="spacer"></div>
        <button class="btn" onclick="location.hash='library'">← Library</button>
      </div>
    </div>
  `;

  const sceneInner = el.querySelector('#scene-inner');
  const progressFill = el.querySelector('#script-progress-fill');
  const progressLabel = el.querySelector('#script-progress-label');
  const updateProgress = (state) => {
    const pct = Math.max(0, Math.min(100, Math.round((state?.progress || 0) * 100)));
    progressFill.style.width = `${pct}%`;
    progressLabel.textContent = `${pct}%`;
  };
  const tp = createTeleprompter(sceneInner, script, script.selectedRole, { onStateChange: updateProgress });
  let compactState = null;

  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      tp.peek();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      tp.prevLine();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      tp.nextLine();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  el.querySelector('#btn-reveal-word').addEventListener('click', () => tp.peek());
  el.querySelector('#btn-compact').addEventListener('click', () => {
    if (backendReady) {
      showToast('Compact before starting the session.', 'err');
      return;
    }
    const result = tp.compactToNextUserTurn(2);
    if (!result) {
      showToast('No earlier partner lines to compact before your next cue.', 'err');
      return;
    }
    compactState = result;
    showToast(result.summary, 'ok');
  });
  el.querySelector('#btn-prev-line').addEventListener('click', () => tp.prevLine());
  el.querySelector('#btn-next-line').addEventListener('click', () => tp.nextLine());

  // ── Live rehearsal engine ──────────────────────────────────────────────────
  let backend = null;
  let audioIO = null;
  let inputBuf = '';   // accumulated user speech transcript
  let backendReady = false;

  const startBtn = el.querySelector('#btn-start');
  const pauseBtn = el.querySelector('#btn-pause');
  const revealBtn = el.querySelector('#btn-reveal-word');

  const noopAudio = {
    async startMic() {},
    stopMic() {},
    play() {},
    flush() {},
    stop() {},
  };

  async function connectBackend() {
    if (backendReady) return;

    if (window.__TT_BACKENDS__?.liveBackend) {
      backend = window.__TT_BACKENDS__.liveBackend;
      audioIO = window.__TT_BACKENDS__.audioIO || noopAudio;
      await backend.connect();
    } else {
      const [lbMod, audioMod] = await Promise.all([
        import('./live-backend.js'),
        import('./audio.js'),
      ]);
      backend = new lbMod.GeminiLiveBackend(state.apiKey, state.liveModel);
      audioIO = new audioMod.AudioIO();
      const systemPrompt = lbMod.buildSystemPrompt(script, script.selectedRole, {
        startLineIndex: tp.getState().lineIndex,
        summary: compactState?.summary || '',
      });
      const vadConfig = buildVadConfig(state.waitMs);
      await backend.connect({ voice: state.voice, vadConfig, systemPrompt });
    }

    // User speech transcript — buffer chunks until turn ends
    backend.on('inputTranscription', ({ text }) => {
      inputBuf += (inputBuf ? ' ' : '') + text;
    });

    // AI response starts: user turn ended → finalize + advance; stream partner words
    backend.on('outputTranscription', ({ text }) => {
      if (inputBuf && tp.isUserTurn()) {
        tp.finalizeTurn(inputBuf);
        inputBuf = '';
        tp.nextLine();
      }
      tp.streamPartnerText(text);
    });

    backend.on('audio', ({ data }) => audioIO.play(data));

    // AI turn complete: flush any pending user buffer, mark partner done, advance
    backend.on('turnComplete', () => {
      if (inputBuf && tp.isUserTurn()) {
        tp.finalizeTurn(inputBuf);
        inputBuf = '';
      }
      if (!tp.isUserTurn() && !tp.isDone()) {
        tp.partnerTurnComplete();
      }
      if (!tp.isDone()) {
        tp.nextLine();
        while (!tp.isDone() && !tp.isUserTurn()) tp.nextLine();
      }
    });

    backend.on('interrupted', () => audioIO.flush());

    backend.on('disconnected', () => {
      if (!backendReady) return;
      backendReady = false;
      audioIO?.stopMic?.();
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      revealBtn.disabled = true;
      el.querySelector('#btn-compact').disabled = false;
      showToast('Session disconnected. Click Start to reconnect.', 'err');
    });

    backend.on('error', (err) => {
      showToast(`Backend error: ${err?.message || String(err)}`, 'err');
    });

    backendReady = true;
  }

  startBtn.addEventListener('click', async () => {
    try {
      await connectBackend();
      await audioIO.startMic((chunk) => backend.sendAudio(chunk));
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      revealBtn.disabled = false;
      el.querySelector('#btn-compact').disabled = true;
    } catch (err) {
      let msg;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Microphone permission denied. Allow access in your browser and try again.';
      } else {
        msg = `Connection error: ${err.message}`;
      }
      showToast(msg, 'err');
    }
  });

  pauseBtn.addEventListener('click', () => {
    audioIO?.stopMic();
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    revealBtn.disabled = true;
    el.querySelector('#btn-compact').disabled = false;
  });

  // ── Test seam ──────────────────────────────────────────────────────────────
  window.__TT_TEST__ = {
    tp,
    finalizeTurn: (text) => tp.finalizeTurn(text),
    restart: () => tp.restart(),
    nextLine: () => tp.nextLine(),
    prevLine: () => tp.prevLine(),
    getState: () => tp.getState(),
    streamPartnerWord: () => tp.streamPartnerWord(),
    streamPartnerText: (text) => tp.streamPartnerText(text),
    compactToNextUserTurn: (promptLines) => tp.compactToNextUserTurn(promptLines),
  };

  _rehearseCleanup = () => {
    document.removeEventListener('keydown', onKeyDown);
    if (backendReady) {
      audioIO?.stop?.();
      backend?.disconnect();
    }
    window.__TT_TEST__ = null;
  };
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

document.getElementById('nav-tabs').addEventListener('click', e => {
  const tab = e.target.closest('.nav-tab');
  if (!tab) return;
  location.hash = tab.dataset.view;
});

window.addEventListener('hashchange', () => navigate(getView()));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

navigate(getView());
