# Plan: Script-Aware Turn Taking For Theater Trainer

## Overview

Implement a rehearsal experience where the AI partner cannot speak until the app
has finalized the actor's current line. Turn completion must be controlled by
script-aware transcript matching plus a manual Done button, not by Gemini voice
activity detection alone.

This plan is Ralphex-compatible Markdown:

- task headers use `### Task N:` exactly
- checkboxes appear only inside `### Task N:` sections
- validation commands are listed in `## Validation Commands`

## Execution Rules

Work from latest `origin/main`. If Ralphex creates a task branch, keep `main` as
the base and push or merge the completed result back to `main`.

Do not commit API keys, local browser storage, Playwright reports, `test-results`,
screenshots, audio recordings, or generated temporary files.

Use a real Gemini API key only as a local runtime secret during manual
agent-browser verification. Do not write the key into files, docs, tests, commit
messages, browser automation logs, or console output.

After every task, run `bash scripts/local-validate.sh`, fix failures, commit the
task result, and push.

## Validation Commands

- `bash scripts/local-validate.sh`
- `npx playwright test tests/e2e/rehearse.spec.js`
- `npx playwright test tests/e2e/teleprompter.spec.js`
- `npx playwright test tests/e2e/library.spec.js`
- Agent-browser manual verification with a real Gemini API key supplied locally

## Locked Product Decisions

The actor's current line is finalized only when the actor clicks Done or when the
transcript matcher detects a confident line ending and then waits 2000 ms without
meaningful new matched progress.

Gemini partner output is accepted only after the app finalizes the actor's line.

If Gemini emits partner text/audio before finalization, ignore partner transcript
output, flush or ignore partner audio, do not advance the teleprompter, and keep
the actor on the same line.

Voice activity detection may stay enabled in Gemini Live for microphone mechanics,
but VAD must not independently decide that the actor is done.

Do not add another LLM call for turn detection in this implementation. Use
deterministic local matching first.

Primary user-turn controls are Reveal, Done, and Pause. Secondary controls are
previous line, next line, and Library.

Remove Compact to cue from the rehearsal toolbar. Move the concept into
post-parse setup using plain language.

Auto-continue defaults:

- enabled by default
- delay after confident ending: 2000 ms
- manual-only mode available in Settings

Matching thresholds:

- `matchedRatio >= 0.85` and final 3 expected words matched for lines with 6 or
  more words
- final 2 expected words matched for shorter lines
- or final expected word matched and `matchedRatio >= 0.90`

Filler words ignored for progress and final corrections:

`um`, `uh`, `äh`, `ähm`, `hm`, `hmm`, `wait`, `sorry`, `let`, `me`, `think`,
`nochmal`, `warte`, `entschuldigung`

## Real Verification Script Fixture

Use this text for real browser ingestion and rehearsal verification:

```text
mMOBtIvs: Der Entdecker des Eisler-Effekts ? x
EINSTEIN: Der.
NEWTON: Neunzehnhundertfiinfzig verschollen.
EINSTEIN: Freiwillig.
Newton halt plétzlich einen Revolver in der Hand.
NEWTON: Darf ich bitten, Eisler, sich mit dem Gesicht gegen
die Wand zu stellen?
EINSTEIN: Aber natiirlich.
Er schlendert gemdachlich zum Kamin, legt seine Geige auf das
Kaminsims, kehrt sich dann plotzlich um, einen Revolver in der
Hand.
EINSTEIN: Mein bester Kilton. Da wir beide, wie ich vermute,
mit Waffen tiichtig umzugehen wissen, wollen wir doch ein
Duell méglichst vermeiden, finden Sie nicht? Ich lege meinen
Browning gern zur Seite, falls Sie auch Ihren Colt -
NEWTON: Einverstanden.
EINSTEIN: Hinter das Kamingitter zum Kognak. Im Falle, es
kamen plotzlich die Pfleger.
NEWTON: Schon.
Beide legen ihre Revolver hinter das Kamingitter.
EINSTEIN: Sie brachten meine Pline durcheinander, Kilton,
Sie hielt ich wirklich ftir verriickt.
NEWTON: Trosten Sie sich: Ich Sie auch.
EINSTEIN: Uberhaupt ging manches schief. Die Sache mit der
Schwester Irene zum Beispiel heute nachmittag. Sie hatte Ver-
dacht geschdpft, und damit war ihr Todesurteil gefallt. Der
Vorfall tut mir auBerordentlich leid.
MOBIUs: Verstehe.
EINSTEIN: Befehl ist Befehl.
MOBIUS: Selbstverstindlich.
EINSTEIN: Ich konnte nicht anders handeln.
MOBIUS: Natiirlich nicht.
56
EINSTEIN: Auch meine Mission stand in Frage, das geheimste
Unternehmen auch meines Geheimdienstes. Setzen wir uns?
NEWTON: Setzen wir uns.
Er setzt sich links an den Tisch, Einstein rechts.
MOBIUS: Ich nehme an, Eisler, auch Sie wollen mich nun
zwingen —
EINSTEIN: Aber Mobius.
MOBIUS: — bewegen, Ihr Land aufzusuchen.
EINSTEIN: Auch wir halten Sie schlieBlich fiir den grd8ten
aller Physiker. Aber nun bin ich auf das Abendessen gespannt.
Die reinste Henkersmahlzeit.
Er schépft sich Suppe.
EINSTEIN: Immer noch keinen Appetit, Mobius?
MOBIUS: Doch. Plotzlich. Jetzt, wo ihr dahintergekommen seid.
Er setzt sich zwischen die beiden an den Tisch, schépft sich eben-
falls Suppe.
NEWTON: Burgunder, Mobius?
MOBIUS: Schenken Sie ein.
Newton schenkt ein.
NEWTON: Ich nehme das Cordon bleu in Angriff.
MOBIUS: Tun Sie sich keinen Zwang an.
NEWTON: Mahlzeit.
```

## Architecture

Add `js/line-progress.js` with:

```js
normalizeToken(token)
filterFillerTokens(tokens)
analyzeLineProgress(expectedText, transcriptText)
```

`analyzeLineProgress` returns:

```js
{
  expectedWords,
  transcriptWords,
  aligned,
  matchedCount,
  matchedRatio,
  lastMatchedIndex,
  finalWordsMatched,
  isLikelyDone
}
```

Extend `js/teleprompter.js` controller with:

```js
updateLiveTranscript(text)
finalizeCurrentUserLine({ force } = {})
getTurnState()
canPartnerSpeak()
getCurrentLine()
```

Turn phases:

```js
user_idle
user_speaking
user_likely_done
user_done
partner_speaking
```

New UI element ids:

```text
#live-transcript
#btn-done
#turn-state-label
```

New store defaults:

```js
autoContinue: true,
autoContinueDelayMs: 2000,
manualTurnMode: false
```

Optional scene-ready schema extension:

```js
{
  title,
  author,
  language,
  characters,
  lines,
  scenes: [
    {
      id,
      title,
      summary,
      startLine,
      endLine
    }
  ]
}
```

## Agent-Browser Verification Protocol

Use agent-browser only after automated tests pass for the relevant task.

Local setup:

```bash
pnpm install
pnpm dev
```

Open the served localhost URL.

Use the local Gemini API key only in the app Settings UI or as a local runtime
secret. Never write it into files.

Manual verification flow:

1. Open Settings.
2. Paste local Gemini API key.
3. Save Settings.
4. Open Add Script.
5. Paste the German script fixture from this plan.
6. Process Script.
7. Select role Einstein.
8. Choose role-focused setup with 2 cue lines when that setup exists.
9. Start rehearsal.
10. Verify partner-first lines still start.
11. On an Einstein line, speak only part of the line.
12. Wait more than 6 seconds.
13. Verify the AI does not respond early.
14. Say the last few words.
15. Wait about 2 seconds.
16. Verify the AI responds.
17. On another Einstein line, click Reveal, then continue speaking.
18. Verify the next reveal advances from spoken progress.
19. Say filler such as "um, let me think".
20. Verify filler is not marked as a final mistake.
21. Click Done.
22. Verify the partner continues.
23. Click Pause.
24. Verify mic and partner output stop.
25. Refresh.
26. Verify no stale service-worker UI and no console errors.

## Task Completion Signal

At the end of the final task, after validation and push to main, output exactly:

`<<<RALPHEX:ALL_TASKS_DONE>>>`

### Task 1: Add Pure Line Progress Matching

- [x] Create `js/line-progress.js` with `normalizeToken`, `filterFillerTokens`, and `analyzeLineProgress`.
- [x] Reuse current matching behavior from `js/match.js` where practical without breaking existing `alignWords` callers.
- [x] Implement punctuation, case, umlaut, and small edit-distance tolerance.
- [x] Implement filler filtering using the locked filler word list.
- [x] Implement `matchedRatio`, `lastMatchedIndex`, `finalWordsMatched`, and `isLikelyDone`.
- [x] Add `tests/unit/line-progress.test.js`.
- [x] Test exact German line matching.
- [x] Test punctuation-insensitive matching.
- [x] Test umlaut and `ß` normalization.
- [x] Test filler words are ignored.
- [x] Test "let me think" does not create script mistakes.
- [x] Test 85 percent coverage plus final words returns likely done.
- [x] Test high coverage without final words does not return likely done.
- [x] Test final word plus 90 percent coverage returns likely done.
- [x] Test repeated earlier words do not regress progress.
- [x] Test wrong final words do not complete the line.
- [x] Run `npm run test:unit`.
- [x] Run `bash scripts/local-validate.sh`.

Acceptance criteria:

`line-progress` is DOM-free and SDK-free. All existing `match.js` tests still
pass. New unit tests cover positive and negative likely-done cases. No
Playwright test is required in this task.

### Task 2: Render Live Transcript And Word-Length Blanks

- [ ] Update `js/teleprompter.js` to render `#live-transcript` below the active user line.
- [ ] Add `updateLiveTranscript(text)` to the teleprompter controller.
- [ ] Use `analyzeLineProgress` to fill matched words live.
- [ ] Keep wrong words hidden during live speaking; show final corrections only after finalization.
- [ ] Replace generic future placeholders with one blank span per real script word.
- [ ] Make each blank length match its actual script word length with a minimum width of 2 characters.
- [ ] Preserve current partner-line streaming behavior.
- [ ] Preserve current context-line correction rendering.
- [ ] Update `tests/e2e/teleprompter.spec.js`.
- [ ] Test active user line shows one blank per actual word.
- [ ] Test blank lengths correspond to actual script word lengths.
- [ ] Test live transcript fills matched words before finalization.
- [ ] Test `Heard:` text updates as transcript changes.
- [ ] Test filler transcript does not fill script words.
- [ ] Test wrong live words do not show red correction before finalization.
- [ ] Run `npx playwright test tests/e2e/teleprompter.spec.js`.
- [ ] Run `bash scripts/local-validate.sh`.

Acceptance criteria:

The actor sees live transcript while speaking. Hidden words visually correspond
to the actual line text. No final correction styling appears until the line is
finalized. Existing teleprompter tests remain green.

### Task 3: Drive Reveal From Matched Progress

- [ ] Change Reveal behavior to use the latest live `lastMatchedIndex`.
- [ ] Keep manually revealed words as hints, not said words.
- [ ] If transcript progress moves beyond manually revealed words, next reveal starts after transcript progress.
- [ ] If transcript regresses or repeats, do not move reveal backwards.
- [ ] Update keyboard Space behavior to use the same reveal path.
- [ ] Add or update Playwright tests in `tests/e2e/teleprompter.spec.js`.
- [ ] Test reveal after 3 manual hints then 10 spoken words reveals the next unmatched word after spoken progress.
- [ ] Test Space and button click behave identically.
- [ ] Test reveal does nothing on partner turns.
- [ ] Run `npx playwright test tests/e2e/teleprompter.spec.js`.
- [ ] Run `bash scripts/local-validate.sh`.

Acceptance criteria:

Reveal no longer gets stuck at the last manually revealed word. Reveal follows
what the transcript matcher already heard. Existing correction behavior remains
intact.

### Task 4: Add Done Button And Clearer Rehearsal Controls

- [ ] Add Done button with id `#btn-done`.
- [ ] Add `#turn-state-label` for the current turn state.
- [ ] Make primary controls during user turn: Reveal, Done, Pause.
- [ ] Move previous line, next line, and Library to secondary visual styling.
- [ ] Remove Compact to cue from the rehearsal toolbar.
- [ ] Keep underlying compact logic available for later setup flow work.
- [ ] Add `finalizeCurrentUserLine({ force })` to teleprompter controller.
- [ ] Wire Done to forced finalization.
- [ ] Ensure Done works with empty, partial, and complete transcripts.
- [ ] Update `tests/e2e/rehearse.spec.js`.
- [ ] Test Done is visible and enabled on user turns after Start.
- [ ] Test Done finalizes and advances to partner line.
- [ ] Test Done with no transcript does not crash.
- [ ] Test partial transcript finalization shows missing or wrong corrections.
- [ ] Test Compact to cue is no longer visible in the rehearsal toolbar.
- [ ] Run `npx playwright test tests/e2e/rehearse.spec.js`.
- [ ] Run `bash scripts/local-validate.sh`.

Acceptance criteria:

The actor always has a reliable manual way to continue. Rehearsal controls are
clearer and less crowded. Removing toolbar compaction does not remove compact
functionality internally.

### Task 5: Gate Partner Output Until User Finalization

- [ ] Update `js/app.js` live rehearsal engine so `inputTranscription` calls `tp.updateLiveTranscript(inputBuf)`.
- [ ] Remove behavior where `outputTranscription` finalizes the user line.
- [ ] Remove behavior where `turnComplete` finalizes the user line.
- [ ] Add `canPartnerSpeak()` checks before accepting partner transcript.
- [ ] Add `canPartnerSpeak()` checks before playing partner audio.
- [ ] If partner text arrives early, ignore it and keep current user line active.
- [ ] If partner audio arrives early, call `audioIO.flush()` and do not play it.
- [ ] If `turnComplete` arrives early, do not advance.
- [ ] Keep partner-first start cue behavior from the current implementation.
- [ ] Update `tests/e2e/rehearse.spec.js`.
- [ ] Test early `outputTranscription` during unfinished user line is ignored.
- [ ] Test early audio during unfinished user line is flushed or ignored.
- [ ] Test early `turnComplete` does not advance.
- [ ] Test partial transcript does not allow partner output.
- [ ] Test partner-first scenes still send initial cue.
- [ ] Run `npx playwright test tests/e2e/rehearse.spec.js`.
- [ ] Run `bash scripts/local-validate.sh`.

Acceptance criteria:

Gemini cannot visually or audibly speak over the actor before finalization. App
state, not VAD, controls partner output. Partner-first scenes still work.

### Task 6: Implement Match-Based Auto Continue

- [ ] Add auto-continue timer state in `js/app.js`.
- [ ] When `analyzeLineProgress().isLikelyDone` becomes true, set turn phase to `user_likely_done`.
- [ ] Start a 2000 ms timer after likely-done.
- [ ] Restart timer if meaningful matched progress changes before the timer fires.
- [ ] On timer fire, call the same finalization path as Done.
- [ ] If `manualTurnMode` is true, do not start the auto timer.
- [ ] Make Done bypass the timer.
- [ ] Update visible turn state text during `user_likely_done`.
- [ ] Update `tests/e2e/rehearse.spec.js`.
- [ ] Use deterministic mocked transcript events.
- [ ] Test final words start likely-done timer.
- [ ] Test line finalizes after 2000 ms.
- [ ] Test additional matched transcript before 2000 ms restarts timer.
- [ ] Test manual mode prevents auto finalization.
- [ ] Test Done works in manual mode.
- [ ] Run `npx playwright test tests/e2e/rehearse.spec.js`.
- [ ] Run `bash scripts/local-validate.sh`.

Acceptance criteria:

Auto-continue happens only after confident script ending. Silence alone cannot
finish the user's line. Done remains the reliable fallback.

### Task 7: Update Settings For Script-Aware Turn Taking

- [ ] Add store defaults `autoContinue`, `autoContinueDelayMs`, and `manualTurnMode`.
- [ ] Update `js/store.js` migration behavior for older saved states.
- [ ] Update Settings UI to show Auto-continue after matched ending.
- [ ] Add delay selector with values 1000 ms, 2000 ms, 3000 ms; default 2000 ms.
- [ ] Add Manual only setting.
- [ ] Demote or rename old VAD wait slider so it is not presented as reply timing.
- [ ] Update `js/turn-config.js` so VAD remains conservative and is not treated as primary turn completion.
- [ ] Update `tests/unit/store.test.js`.
- [ ] Update `tests/unit/turn-config.test.js`.
- [ ] Update `tests/e2e/settings.spec.js`.
- [ ] Test new defaults.
- [ ] Test migration from old localStorage state.
- [ ] Test settings persist after reload.
- [ ] Test manual mode blocks auto-continue but not Done.
- [ ] Run `bash scripts/local-validate.sh`.

Acceptance criteria:

Settings accurately describe script-aware turn behavior. Old saved user settings
do not break. User can choose manual-only mode.

### Task 8: Move Role And Cue Setup After Parsing

- [ ] Replace immediate post-parse Library role picker with a setup dialog/page.
- [ ] Setup must require role selection.
- [ ] Setup must offer start mode Full script.
- [ ] Setup must offer start mode Start near my first line.
- [ ] Setup must offer start mode Role-focused with cue lines.
- [ ] Setup must offer cue line count with default 2.
- [ ] Setup must offer Summarize skipped sections checkbox.
- [ ] Rename compaction language to Skip ahead to my next cue.
- [ ] Store setup fields on script as `selectedRole`, `rehearsalMode`, `cueLineCount`, and `summarizeSkipped`.
- [ ] For this task, summaries must be deterministic and local: `Skipped N lines from Character A, Character B`.
- [ ] Move existing compact behavior into setup/start behavior.
- [ ] Ensure old saved scripts without setup fields still open.
- [ ] Update `tests/e2e/library.spec.js`.
- [ ] Test setup appears after processing.
- [ ] Test Einstein can be selected.
- [ ] Test full script mode starts at line 0.
- [ ] Test role-focused mode starts two cue lines before the first Einstein line.
- [ ] Test deterministic skipped summary appears.
- [ ] Test setup choices persist in Library metadata.
- [ ] Run `npx playwright test tests/e2e/library.spec.js tests/e2e/rehearse.spec.js`.
- [ ] Run `bash scripts/local-validate.sh`.

Acceptance criteria:

Role selection and cue behavior happen before rehearsal. No unclear Compact to
cue button exists in rehearsal controls. Existing library flows remain usable.

### Task 9: Prepare Optional Scene Schema For Long Documents

- [ ] Extend script schema to accept optional `scenes`.
- [ ] Keep flat `lines` required for backward compatibility.
- [ ] Validate scene `startLine` and `endLine` bounds when scenes exist.
- [ ] Update Gemini ingestion prompt to request scenes when obvious.
- [ ] Hide scene picker when scenes are absent.
- [ ] Show scene picker in setup when scenes are present.
- [ ] Selecting a scene starts rehearsal within scene bounds.
- [ ] Update `tests/unit/script-schema.test.js`.
- [ ] Update `tests/e2e/library.spec.js`.
- [ ] Test old flat schema still validates.
- [ ] Test schema with scenes validates.
- [ ] Test invalid scene bounds reject.
- [ ] Test setup hides scene picker without scenes.
- [ ] Test setup shows scene picker with scenes.
- [ ] Run `bash scripts/local-validate.sh`.

Acceptance criteria:

Current scripts continue working. The app is ready for future full-play/book
uploads with scene selection. Scene support does not require another LLM call
beyond ingestion.

### Task 10: Real Agent-Browser Verification With Gemini

- [ ] Ensure automated tests pass before starting real verification.
- [ ] Start local app with `pnpm dev`.
- [ ] Open local app with agent-browser.
- [ ] Enter Gemini API key in Settings without committing or printing it.
- [ ] Paste the German script fixture into Add Script.
- [ ] Process the script with the real Gemini processor.
- [ ] Select role Einstein.
- [ ] Choose role-focused setup with 2 cue lines.
- [ ] Start rehearsal.
- [ ] Verify partner-first line begins if the active line belongs to another role.
- [ ] On an Einstein line, speak only part of the line.
- [ ] Wait more than 6 seconds.
- [ ] Verify the AI does not respond early.
- [ ] Say the last few words.
- [ ] Wait about 2 seconds.
- [ ] Verify the AI responds.
- [ ] Use Reveal, continue speaking, and verify reveal follows spoken progress.
- [ ] Say filler such as "um, let me think".
- [ ] Verify filler is not marked as a final mistake.
- [ ] Click Done and verify the partner continues.
- [ ] Click Pause and verify output stops.
- [ ] Refresh and verify the UI is not stale.
- [ ] Check browser console for errors.
- [ ] Record verification result in `docs/manual-smoke-test.md` or `docs/agent-progress.md` without including the API key.
- [ ] Run `bash scripts/local-validate.sh`.

Acceptance criteria:

Real ingestion works with the German excerpt. Real rehearsal works with Einstein
selected. AI does not speak before finalization. Manual Done works as fallback.
No console errors appear. No secret is committed.

### Task 11: Update Documentation And Current Limitations

- [ ] Update `README.md`.
- [ ] Remove or rewrite text saying VAD is always the turn-taking mechanism.
- [ ] Document script-aware turn taking.
- [ ] Document live transcript display.
- [ ] Document Done button behavior.
- [ ] Document auto-continue thresholds.
- [ ] Document known transcription limitations.
- [ ] Update `docs/manual-smoke-test.md` with the agent-browser real-key flow.
- [ ] Update `docs/ideas.md` to mark implemented items or keep remaining future ideas clear.
- [ ] Update `docs/agent-progress.md` with completion notes.
- [ ] Run `bash scripts/local-validate.sh`.

Acceptance criteria:

Docs match the implemented behavior. Docs do not contain any raw API key. Manual
verification instructions are clear enough for another agent to repeat.

### Task 12: Final Cleanup And Push To Main

- [ ] Run `git status --short` and remove generated output directories such as `playwright-report/` and `test-results/`.
- [ ] Run `bash scripts/local-validate.sh`.
- [ ] Confirm no API key appears in tracked files using `rg` for obvious key patterns and the local key prefix only in the working tree.
- [ ] Confirm latest commits are pushed to main.
- [ ] Confirm `origin/main` points at the final commit.
- [ ] Output exactly `<<<RALPHEX:ALL_TASKS_DONE>>>`.

Acceptance criteria:

Worktree is clean. All tests pass. `main` contains the complete implementation.
No secrets are committed. Ralphex can mark all task checkboxes complete and move
the plan to `docs/plans/completed/`.
