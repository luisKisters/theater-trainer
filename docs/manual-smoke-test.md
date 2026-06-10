# Manual Smoke Test — Theater Trainer

This document covers every feature that requires a real browser, a real Gemini API
key, and a working microphone. Automated tests (Node unit + Playwright with mocked
backends) cannot cover these paths — they must be verified here.

## Prerequisites

- A modern browser (Chrome/Edge recommended for AudioWorklet + MediaDevices support)
- A Gemini API key with billing enabled (PAYG or active credits)
  — get one at https://aistudio.google.com/apikey
- A working microphone
- The app running locally (`npm run serve`) or deployed to a static host

---

## 1. API key setup

1. Open the app and navigate to **Settings** (gear icon, bottom nav).
2. Paste your Gemini API key into the "API Key" field.
3. Verify the "(stored only in this browser)" note is visible below the field.
4. Click **Save**. Confirm "Saved" status feedback appears.
5. Reload the page. Re-open Settings and confirm the key is still present.

Expected: key persists across reloads via localStorage; never sent to any server.

---

## 2. Script ingestion — paste text

1. Navigate to **Add** (+ icon).
2. Paste a short scene (2–3 characters, 10–15 lines). Example:

   ```
   HAMLET: To be, or not to be, that is the question.
   HORATIO: My lord, I came to see your father's funeral.
   HAMLET: I prithee do not mock me, fellow student.
   ```

3. Click **Process Script**.
4. Confirm a spinner or "Processing…" state appears.
5. Confirm the script title and character list appear in the result.
6. Confirm the script lands in the **Library** (book icon).

Expected: script appears in Library with correct title, character count, and line count.

---

## 3. Script ingestion — PDF upload

1. Navigate to **Add**.
2. Click the file upload area and select a PDF (a short play excerpt or any text PDF).
3. Click **Process Script**.
4. Confirm the script is extracted and saved to Library.

Expected: Gemini reads the PDF bytes directly (no client-side OCR); characters and
lines are extracted correctly.

---

## 4. Role picker and Rehearse entry

1. In Library, tap/click a saved script.
2. Confirm a **role picker dialog** appears listing all characters.
3. Select a role that is NOT the first character (to confirm the AI takes the first line).
4. Confirm the Rehearse view loads with the script displayed in teleprompter style.

Expected: selected role is highlighted; non-user lines render in gray; user lines
start hidden (dim dashes).

---

## 5. Live rehearsal — Start and voice

1. On the Rehearse view, click **Start**.
2. Confirm the browser prompts for microphone permission.
3. Grant permission.
4. Confirm the AI partner begins speaking its first line within 2–3 seconds.
5. Confirm the partner's spoken words stream as text below their character name.
6. Confirm audio plays through your speakers/headphones.

Expected: partner speaks expressively and waits for your line. The AI never says
anything outside the script character dialogue.

---

## 6. User speaks their line — word reveal and correction

1. Wait for your cue (your character's dim-dash line).
2. Press **Space** to reveal the first word as a gray hint.
3. Speak your line aloud, correctly.
4. Confirm each spoken word turns white as you say it.
5. Confirm the current word has an amber underline.
6. Now rehearse another line and deliberately say one word wrong (substitute a word).
7. After your turn ends, confirm:
   - The wrong word renders with a red strike-through.
   - The correct word appears next to it in a green box.
   - No AI voice correction plays — the partner simply continues with the next line.

Expected: corrections are purely visual and deterministic (LCS alignment); the AI
never verbally corrects you.

---

## 7. Thinking pause — lengthened VAD silence threshold

1. During your line, pause mid-sentence for 2–3 seconds as if thinking.
2. Confirm the AI does NOT start replying during this pause.
3. Resume speaking and finish your line.
4. Confirm the AI waits until you are done, then replies.

Expected: the default silence threshold (3500 ms) prevents premature turn-end.
The AI waits even during thinking pauses.

To test the VAD slider:
1. Go to **Settings** and move the "How long it waits before replying" slider to
   its minimum (~1.5 s).
2. Return to Rehearse and pause mid-line for 2 seconds.
3. Confirm the AI now cuts in sooner.
4. Reset the slider to the middle position.

---

## 8. Pause and resume

1. While the AI partner is speaking, click **Pause**.
2. Confirm audio stops immediately.
3. Confirm the AI does not respond to any mic input while paused.
4. Click **Start** again.
5. Confirm mic and AI responses resume normally.

Expected: Pause cleanly stops streaming audio to the Live API; Resume reconnects.

---

## 9. Line navigation (prev/next resync)

1. During rehearsal, click the **previous line** arrow.
2. Confirm the teleprompter jumps back one line.
3. Click the **next line** arrow.
4. Confirm it advances.
5. Click **Restart** (if present) to return to the top of the scene.

Expected: line pointer changes immediately; the AI adjusts its next utterance to
match the resynced position.

---

## 10. PWA install

1. Open the app in Chrome.
2. Look for the install icon in the address bar (or open the browser menu and
   find "Install Theater Trainer" / "Add to Home Screen").
3. Install the app.
4. Launch it from the installed shortcut.
5. Confirm it opens in standalone mode (no browser chrome).
6. Confirm the app shell loads even when offline (disconnect from the network,
   reload — Settings and Library should load from cache).

Expected: manifest is valid, service worker caches the app shell, standalone mode works.

---

## 11. Error states (manual)

- **Bad API key:** In Settings enter an invalid key. Navigate to Rehearse → Start.
  Confirm an error toast appears (not a blank screen).
- **Microphone denied:** When the browser prompts for mic permission, deny it.
  Confirm a clear error message appears explaining the mic is needed.
- **Dropped connection:** Start a session, then disable your network connection.
  Confirm a reconnect prompt appears rather than a silent hang.

---

## Test coverage summary

| Feature | Automated (CI) | Manual (this doc) |
|---|---|---|
| store.js defaults, load, save, merge | Unit tests | — |
| turn-config VAD mapping | Unit tests | — |
| match.js LCS alignment (all word states) | Unit tests | — |
| audio-dsp.js resample, base64 | Unit tests | — |
| script-schema validation, parts builder | Unit tests | — |
| App shell loads + nav | Playwright (smoke) | — |
| Service worker registers | Playwright (smoke) | — |
| Settings persist (key + slider) | Playwright | Section 1 above |
| Rehearse blocked without key | Playwright | — |
| Script ingestion (MockProcessor) | Playwright | Sections 2–3 above |
| Library → role picker → Rehearse | Playwright | Section 4 above |
| Teleprompter word states via fixtures | Playwright | Section 6 above |
| MockLiveBackend E2E (wrong word, partner) | Playwright | — |
| Pause stops AI responses | Playwright (mock) | Section 8 above |
| Mobile bottom sheet visible | Playwright | — |
| Error toasts (mocked) | Playwright | Section 11 above |
| **Real Gemini Live API voice round-trip** | **NOT in CI** | **Section 5** |
| **Real microphone capture** | **NOT in CI** | **Sections 5–9** |
| **Real PDF ingestion** | **NOT in CI** | **Section 3** |
| **VAD silence threshold behavior** | **NOT in CI** | **Section 7** |
| **PWA install + offline shell** | **NOT in CI** | **Section 10** |
| **Dropped-connection reconnect** | **NOT in CI** | **Section 11** |
