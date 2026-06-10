# Theater Trainer

A progressive web app for rehearsing theatre lines with an AI scene partner.

Give it a script (paste text, a PDF, or photos of the pages) and it extracts the
roles and lines. Pick your role and rehearse out loud: the AI performs every other
character with voice in real time, your spoken words appear on screen as you say
them, and anything you got wrong is marked with a deterministic strike-through +
the correct word — no AI nagging, ever.

Built on the **Gemini Live API** (`gemini-3.1-flash-live-preview`) for real-time
speech-in / speech-out, plus Gemini structured output for script ingestion. Fully
client-side — no backend, no login, no data leaves your browser except to Google's
Gemini API.

---

## Setup

### 1. Get a Gemini API key

1. Go to https://aistudio.google.com/apikey and create a key.
2. Enable billing (pay-as-you-go) on the associated Google Cloud project. The Live
   API (`gemini-3.1-flash-live-preview`) and structured-output calls both require
   a billing-enabled project. Usage costs are low for personal rehearsal use.

### 2. Run locally

```
npm install
npm run serve
```

Open http://localhost:8080 in Chrome or Edge (recommended for AudioWorklet support).

### 3. Enter your key

Open **Settings** (gear icon) and paste your API key. It is stored only in your
browser's `localStorage` and is never sent anywhere except directly to the Gemini
API from your browser.

---

## Deploying to a static host

The app is entirely static files (HTML + CSS + ES modules). No build step required.

### GitHub Pages

1. Push the repo to GitHub.
2. In the repository Settings → Pages, set the source to the `main` branch root.
3. The app is live at `https://<username>.github.io/<repo-name>/`.

### Any static host (Netlify, Vercel, Cloudflare Pages, etc.)

Drop the repo root (all files except `node_modules`, `tests`, `docs`, `scripts`,
`mockups`) into your host's deploy directory. The `sw.js` service worker and
`manifest.webmanifest` handle offline caching and PWA install automatically.

No environment variables or server-side config needed.

---

## Running tests

```
bash scripts/local-validate.sh
```

This installs npm deps and Playwright/Chromium idempotently, then runs:
- **Node unit tests** (`node --test`) — pure-logic modules, no network/mic.
- **Playwright E2E** — headless Chromium with mocked backends (no real API key or
  microphone needed).

CI runs the same script on every push via `.github/workflows/ci.yml`.

---

## Current limitations

- **No backend / no OCR.** Script ingestion sends PDF/image bytes directly to
  Gemini as `inlineData`. Very large PDFs (>20 MB) may hit the API payload limit;
  split them or paste the text instead.
- **Chrome/Edge required for mic input.** AudioWorklet + MediaDevices with 16 kHz
  resampling is tested on Chromium-based browsers. Firefox may work but is untested.
- **Real-time voice requires billing.** The Live API (`gemini-3.1-flash-live-preview`)
  is not available on the free tier. Script ingestion uses `gemini-flash-latest`
  which has a free quota.
- **Single active session.** The app manages one Live API session at a time.
  Closing and reopening the Rehearse view reconnects.
- **No multi-user / no cloud sync.** Scripts are stored in localStorage and do not
  sync across devices.
- **VAD is always on.** The app relies on Gemini's automatic voice-activity detection
  for turn-taking; manual push-to-talk is not implemented. Use the "How long it waits
  before replying" slider in Settings to tune the silence threshold (1.5 s – 6 s).

---

## Manual smoke test

Features that require a real browser, API key, and microphone cannot run in CI.
See [docs/manual-smoke-test.md](docs/manual-smoke-test.md) for the full step-by-step
verification guide, including which features are covered by automated tests and which
require the manual path.

---

## Project structure

```
index.html              App entry point with import map
styles.css              Global styles (teleprompter aesthetic)
manifest.webmanifest    PWA manifest
sw.js                   Service worker (offline app-shell cache)
js/
  app.js                Router + view wiring
  store.js              localStorage state (key, settings, scripts)
  match.js              LCS word-alignment (deterministic corrections)
  audio-dsp.js          Pure DSP: resample, base64 encode
  audio.js              MicCapture + PcmPlayer (AudioWorklet); MockAudioIO
  script-schema.js      Gemini response schema + validateScript()
  script-processor.js   ScriptProcessor interface
  gemini-processor.js   GeminiProcessor (real) + MockProcessor
  live-backend.js       GeminiLiveBackend (real) + MockLiveBackend
  teleprompter.js       Scrolling teleprompter renderer
  turn-config.js        waitMs -> VAD realtimeInputConfig
  scripts-store.js      Script CRUD on top of store.js
tests/
  unit/                 Node --test unit tests (pure logic, no network)
  e2e/                  Playwright specs (mocked backends)
scripts/
  local-validate.sh     Idempotent local gate (unit + E2E)
  ci-gate.sh            Push + wait for GitHub Actions
docs/
  manual-smoke-test.md  Manual verification guide (real key + mic)
  plans/                Implementation plan
mockups/                Design mockups (reference only)
```
