# Plan: Build Theater Trainer — AI Scene-Partner Rehearsal PWA

## Overview

Build a **client-only progressive web app** for rehearsing theatre lines with an AI
scene partner.

The user gives it a script (pasted text, a PDF, or photos of the pages); the app
extracts roles and lines into a structured schema. The user picks a role and
rehearses out loud: the AI performs **all other characters** with voice in real time
via the **Gemini Live API**, the spoken dialogue (theirs and the AI's) streams onto
the screen as text, and anything the user said wrong is marked with a
**deterministic, locally-computed** strike-through + the correct word — never an AI
"you got that wrong" interruption.

There is **no backend**. The app is static files; the user supplies their own Gemini
API key, stored in `localStorage`. It is installable as a PWA and deployable to any
static host (GitHub Pages).

Every task represents one vertical product slice. Each task must include UI,
underlying logic, and tests where applicable.

Do not proceed to the next task until:

1. local Linux-compatible tests pass (`bash scripts/local-validate.sh`);
2. the current branch is pushed to GitHub;
3. the GitHub Actions workflow passes;
4. any CI failures have been investigated and repaired.

## Autonomy & Environment (unattended execution — READ FIRST)

This plan is executed UNATTENDED by ralphex inside a Linux Docker container
(Debian-like, non-root user; **Node ≥ 20, git, and `gh` are available**; there is no
browser GUI and no audio device). Follow these rules at all times:

- **Work fully autonomously.** Never pause for confirmation or human input — make a
  reasonable decision and proceed. Use non-interactive flags everywhere; never leave
  a command waiting on an interactive prompt.
- **Install everything that is missing, yourself.** Use `npm` for tooling. For
  browser/E2E tests use **Playwright with Chromium** (`npx playwright install
  --with-deps chromium`); `scripts/local-validate.sh` must install/bootstrap
  dependencies idempotently (only if missing) so it works from a clean container on
  every run.
- **No secrets in CI, ever.** A real Gemini API key, a real microphone, and the live
  WebSocket cannot run in CI. Do **not** commit any key. Everything that touches the
  network/mic/Live API must sit behind an interface with a **mock implementation**
  used by automated tests (see Architecture). CI exercises pure logic + mocked
  integration only.
- **The real Live path's source of truth is the manual browser smoke test.** Where a
  feature genuinely needs a real key, a real mic, or audio output, implement it
  behind the adapter, mark it clearly as "verified only via the manual browser smoke
  test", and keep going. Never claim the real voice/mic path works from CI alone.
- **Keep the local gate Linux-safe.** `scripts/local-validate.sh` must run only the
  Linux-runnable subset (Node unit tests + headless Chromium E2E with mocked
  backends) and must not fail merely because no real key/mic exists.
- **Commit and push after each task.**

## Design decisions (LOCKED — do not re-derive)

- **Visual direction:** the *Teleprompter* look from `mockups/demo.html` (pure black,
  large type, amber accent). Lift its styling and interaction model directly.
- **Word states:** context/other lines are gray; the user's line starts hidden
  (dim dashes); pressing **space** reveals the next word as a gray *hint* (it does not
  count as said); a word turns **white** only when the user actually says it; a wrong
  word renders as `<s>spoken</s>` (red strike-through) followed by the correct word in
  a green box. The current word gets an amber underline.
- **Corrections are deterministic and local.** Computed by our own LCS word-alignment
  (`match.js`) between the user's input transcription and the scripted line, run when
  the user's turn ends. The model is **never** asked to judge correctness and must
  **never** verbally correct the user.
- **"Wait for me while I think" = lengthened VAD silence threshold.** Keep the Live
  API's automatic voice-activity detection ENABLED, but configure a long end-of-speech
  silence window and low end-of-speech sensitivity so a thinking pause does not end
  the turn. Defaults: `silenceDurationMs: 3500`, `endOfSpeechSensitivity: LOW`,
  `startOfSpeechSensitivity: LOW`, `prefixPaddingMs: 300` — **all configurable in
  Settings** (a "How long it waits before replying" slider, ~1.5s–6s). Do NOT
  implement manual turn-taking.
- **Controls:** `Start` (connect + open mic) and `Pause` (stop streaming audio so the
  partner cannot reply) — not "auto-play". Plus line resync (prev/next) and restart.
- **Models:** Live voice = `gemini-3.1-flash-live-preview` (responseModalities AUDIO,
  input + output transcription on). Script ingestion = a Gemini Flash text model
  (`gemini-flash-latest`) via structured output. Both via `@google/genai`.
- **No bundler / no framework.** Native ES modules in the browser with an import map;
  `@google/genai` loaded from CDN (esm.run). Keep all pure-logic modules **free of any
  SDK/DOM import** so Node can unit-test them directly without network access.

## Architecture (interfaces + mockable backends)

Pure-logic modules (SDK-free, DOM-free → unit-tested in Node with `node --test`):
- `js/store.js` — localStorage state (key, settings, scripts), defaults, migrations.
- `js/match.js` — tokenize + LCS `alignWords(expected, spoken)` → per-word
  `{word, matched}`, plus `matchedRatio`; tolerant to punctuation, umlauts, minor
  transcription drift.
- `js/audio-dsp.js` — pure resampling/encoding math: float→16 kHz Int16, base64
  round-trip, playback scheduling math. (The Web Audio wiring that *uses* these lives
  in `js/audio.js` and is browser-only.)
- `js/script-schema.js` — the response schema + a `validateScript()` guard + the
  prompt-parts builder for ingestion (no SDK call here).
- `js/turn-config.js` — maps a Settings "wait" value to the realtimeInputConfig VAD
  object.

Interface + adapter pairs (real impl is browser/network-only; mock impl drives tests):
- `ScriptProcessor`: `GeminiProcessor` (real `generateContent` + inlineData) /
  `MockProcessor` (returns fixture script).
- `AudioIO`: real `MicCapture` + `PcmPlayer` (AudioWorklet / Web Audio) / `MockAudioIO`.
- `LiveBackend`: `GeminiLiveBackend` (`ai.live.connect`, VAD config, transcripts,
  audio) / `MockLiveBackend` (emits scripted input/output transcription + fake audio
  events on cue).

**Test seam:** at startup the app uses real backends unless `window.__TT_BACKENDS__`
is set, in which case it uses the injected backends. Playwright sets this before page
load to run the full UI deterministically with zero network/mic/secrets.

## Validation Commands

- `bash scripts/local-validate.sh` — idempotently install deps + Chromium, run Node
  unit tests (`node --test`) and Playwright E2E (headless, mocked backends). Linux-safe.
- `bash scripts/ci-gate.sh` — commit dirty files, push the current branch, wait for
  the matching GitHub Actions run, print failed logs, exit non-zero when CI fails.

---

### Task 1: Bootstrap the repo, app shell, and CI feedback loop

- [x] Add `package.json` with dev deps (`@playwright/test`, a tiny static server such
  as `sirv-cli` or use `python3 -m http.server`) and scripts: `test:unit`, `test:e2e`,
  `serve`.
- [x] Create the static app shell: `index.html` with an import map for `@google/genai`,
  `styles.css` (tokens + teleprompter aesthetic lifted from `mockups/demo.html`), and
  `js/app.js` routing between four views: **Library, Add, Rehearse, Settings**.
- [x] Add PWA basics: `manifest.webmanifest`, `sw.js` (offline app-shell cache),
  `icons/icon.svg`, and registration in `app.js`.
- [x] Add `scripts/local-validate.sh` (idempotent install of npm deps + `npx playwright
  install --with-deps chromium`, then run unit + E2E).
- [x] Add `scripts/ci-gate.sh` (commit dirty, push branch, poll `gh run` for the matching
  workflow, print failed logs, exit non-zero on failure).
- [x] Add `.github/workflows/ci.yml` running on every branch push on `ubuntu-latest`:
  install Node, deps, Chromium, run `scripts/local-validate.sh`.
- [x] Add a trivial Node unit test and a Playwright smoke test (app loads, nav switches
  views, service worker registers).
- [x] Run the local validation and CI gate until both pass.

### Task 2: Settings and persistence

- [x] Build `js/store.js`: load/save state, defaults (empty apiKey; live + text models;
  voice; `waitMs` VAD value; show-corrections toggle), forward-compatible merge.
- [x] Build the Settings view: API-key input (password field, "stored only in this
  browser" note + link to aistudio.google.com/apikey), voice picker, live/text model
  fields, a **"How long it waits before replying" slider** (1.5s–6s → `waitMs`), and
  a show-word-coloring toggle. Save + status feedback.
- [x] Build `js/turn-config.js` mapping `waitMs` → realtimeInputConfig VAD object.
- [x] Unit tests: store defaults/load/save/merge; `turn-config` mapping at min/mid/max.
- [x] Playwright: enter a key + change the slider, reload, assert persistence; assert
  Rehearse is blocked with a clear prompt when no key is set.
- [x] Run the local validation and CI gate until both pass.

### Task 3: Script ingestion and library

- [ ] Build `js/script-schema.js`: response schema, `buildIngestParts({text, files})`,
  `validateScript()` (requires title, language, characters, ≥1 line).
- [ ] Define the `ScriptProcessor` interface; implement `MockProcessor` (fixture) and
  `GeminiProcessor` (`generateContent` with `responseMimeType: application/json` +
  `responseSchema`, files as `inlineData`; PDFs/images read natively, no client OCR).
- [ ] Build the Add view: paste textarea, file upload (PDF/images), camera capture
  (`capture="environment"`), a processing state, and error handling.
- [ ] Build the Library view: list saved scripts (title, author/source, role, line
  count), open, delete (with confirm), and a **role picker** dialog.
- [ ] Unit tests: schema parts builder, `validateScript` accept/reject, `fileToBase64`,
  `MockProcessor` output validates.
- [ ] Playwright (MockProcessor via test seam): paste text → process → script appears in
  Library → pick a role → land on Rehearse.
- [ ] Run the local validation and CI gate until both pass.

### Task 4: Audio I/O

- [ ] Build `js/audio-dsp.js` (pure): `floatTo16kBase64`, `base64<->bytes`, and the
  playback scheduling helper. Build `js/audio.js`: `MicCapture` (AudioWorklet →
  downsample → 16 kHz Int16 base64 chunks) and `PcmPlayer` (gapless 24 kHz queue with
  `flush()` for interruptions), behind an `AudioIO` interface; add `MockAudioIO`.
- [ ] Unit tests for `audio-dsp.js`: resample length/scaling, base64 round-trip,
  schedule-time monotonicity.
- [ ] Mark real mic capture + playback as "verified only via the manual browser smoke
  test" (no audio device in CI).
- [ ] Run the local validation and CI gate until both pass.

### Task 5: Deterministic matching + teleprompter renderer

- [ ] Finalize `js/match.js` (LCS alignment, tolerance for punctuation/umlauts/≤1 edit
  on long words).
- [ ] Build `js/teleprompter.js`: render the scrolling scene — gray context lines, the
  active partner line streaming in, the user's line hidden→hint→white per word, the
  current-word underline, and strike-through + boxed corrections; auto-scroll the
  active line into view. Reuse the demo's word-state CSS.
- [ ] Unit tests for `match.js`: exact match, missing word, extra word, substitution,
  reordering, punctuation/umlaut tolerance, empty input.
- [ ] Playwright: drive the renderer from fixtures (no Live) through hidden → space-peek
  → said → wrong-word states and assert the DOM/classes.
- [ ] Run the local validation and CI gate until both pass.

### Task 6: Live rehearsal engine

- [ ] Define the `LiveBackend` interface; implement `GeminiLiveBackend`
  (`ai.live.connect`: `responseModalities:[AUDIO]`, `inputAudioTranscription`,
  `outputAudioTranscription`, `realtimeInputConfig` from `turn-config.js`, speech
  voice, and a system prompt that makes Gemini perform every *other* role expressively
  and **never** correct the user verbally) and `MockLiveBackend` (emits scripted input
  transcription incl. a deliberate error, output transcription, audio + turnComplete).
- [ ] Wire the Rehearse view: `Start` (connect + mic via `AudioIO`), `Pause`, line
  prev/next resync, restart. On turn end, run `match.js` over the buffered input
  transcription vs the scripted line and render via `teleprompter.js`; stream the
  partner's output transcription; play audio; handle `interrupted` (flush playback).
- [ ] Playwright E2E (MockLiveBackend + MockAudioIO): Start → mock user line with one
  wrong word → assert the deterministic strike+box → mock partner line streams in and
  advances the pointer; Pause stops responses.
- [ ] Mark the real Live API + mic round-trip as "verified only via the manual browser
  smoke test."
- [ ] Run the local validation and CI gate until both pass.

### Task 7: Polish, mobile, and error states

- [ ] Mobile: controls render as a bottom sheet (rounded top, grab handle, **Reveal
  next word** as the prominent action) per `mockups/demo.html`; responsive scene type.
- [ ] Error/empty states: invalid/missing API key, microphone permission denied,
  dropped/closed socket (offer reconnect), ingestion failure, empty Library.
- [ ] Keyboard: space = reveal next word; prev/next line navigation.
- [ ] Playwright: manifest + offline shell load; mobile-viewport bottom sheet present;
  error toasts render for denied mic and bad key (mocked).
- [ ] Run the local validation and CI gate until both pass.

### Task 8: Manual smoke test doc + README

- [ ] Create `docs/manual-smoke-test.md`: exact browser steps with a real key — paste
  key, ingest a short scene (text + a PDF), pick a role, Start, confirm the partner
  speaks and streams text, confirm a thinking pause does **not** trigger a reply
  (lengthened VAD), confirm wrong words get the strike+box correction, confirm
  Pause/resume and PWA install.
- [ ] Clearly list which features are covered by automated tests vs. which require a
  real browser + key + mic.
- [ ] Update `README.md` with setup, the API-key/PAYG note, deploy-to-static-host
  instructions, and current limitations.
- [ ] Run the local validation and CI gate until both pass.

### Task 9: Final review and cleanup

- [ ] Run all Node unit tests and Playwright E2E.
- [ ] Push the branch and wait for the complete CI workflow; fix every failure and
  actionable warning.
- [ ] Confirm no backend/server, no login flow, and no secret/API key were added; the
  app remains static + client-only with the key in `localStorage`.
- [ ] Confirm every real Live-API/mic claim is marked as requiring the manual browser
  smoke test.
- [ ] Write a concise completion report in `docs/agent-progress.md`.
