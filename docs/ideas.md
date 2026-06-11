# Theater Trainer Ideas

## Script-Aware Turn Taking

The rehearsal loop should not let Gemini decide that the actor is done just because
there was silence. Silence is a weak signal during rehearsal: the actor may be
thinking, looking for the next word, repeating a phrase, or waiting after a reveal.

The app should treat the script text as the source of truth for turn completion.
Voice activity detection can still exist as a short delay, but only after the app
already believes the actor has reached the end of the line.

### Goal

Gemini must not speak until one of these happens:

- The actor clicks `Done` / `Continue`.
- The last few words of the actor's current line are matched with high confidence,
  then a short delay, around 2 seconds, passes without meaningful new matched text.

VAD should not independently end the actor's turn.

## Proposed User-Turn State Machine

Each user line should move through explicit states:

- `waiting`: user has not started the current line.
- `speaking`: live transcript is arriving and matching against the expected line.
- `likely_done`: end-of-line confidence is high; start a short confirmation timer.
- `done`: finalize corrections and allow the AI partner to respond.
- `partner`: Gemini is allowed to speak partner lines.

Only `done` should allow partner output to be played or displayed.

If Gemini starts output before `done`, the app should flush/ignore that output and
stay on the actor's line.

## Live Transcript UX

The app should show what it hears while the actor is speaking.

Suggested display:

- Current script line remains the main focus.
- A smaller `Heard:` line appears below it with the live transcript.
- Matching words fill their script blanks as they are recognized.
- Non-script filler such as "um", "uh", "let me think", "wait", "sorry", or
  repeated hesitation should be ignored for progress and should not be marked as a
  script mistake.

This means corrections should be based on the final aligned script attempt, not on
every incidental thing the actor says while thinking.

## Matching Rules

Use deterministic matching first. Do not add another LLM call for the first version.

Recommended confidence rules:

- A word matches when normalized text matches.
- Long words can tolerate small transcription noise with edit distance.
- Umlauts and common OCR/transcription variants should normalize consistently.
- Filler words should be dropped before matching.
- Repeated already-matched words should not move progress backwards.

Mark the line `likely_done` when either:

- at least 85% of script words are matched and the final 2-4 expected words are
  matched, or
- the last 3 expected words are matched for short lines, or
- the final expected word is matched and total line coverage is above 90%.

After `likely_done`, wait about 2 seconds. If no meaningful new matched text arrives,
finalize the line.

The `Done` button should immediately finalize the line even if confidence is low.

## Reveal Behavior

Reveal should be based on current matching progress, not only on the last manually
revealed word.

Example:

1. User reveals the first 3 words.
2. User remembers and says the next 10 words.
3. The transcript matcher advances the internal word pointer.
4. The next reveal shows the next unmatched word after the spoken text, not word 4.

This requires the teleprompter to keep a live `matchedWordIndex` from transcript
alignment and use that as the baseline for reveal.

## Word Blank Rendering

Future and hidden words should use one blank per script word, with width based on
that word's actual length.

Instead of generic placeholder groups such as:

```text
____ ___ _____
```

render every hidden word from the real line:

```text
Der Entdecker des Eisler-Effekts ?
___ _________ ___ _______________ _
```

When a word is matched, its exact blank should fill with the recognized/script word.
Wrong words should be shown only after finalization, not while the actor is still
thinking through the line.

## Controls

The controls should be clearer and fewer.

Primary controls during the actor's turn:

- `Reveal`
- `Done`
- `Pause`

Secondary controls:

- Previous / Next line, visually quieter.
- Library / Settings outside the main turn controls.

Avoid unclear labels such as `Compact to cue` in the rehearsal controls. That concept
belongs in setup, before rehearsal begins.

## Parse And Setup Flow

After the script is parsed, before entering rehearsal, the app should ask for:

- role name / role selection
- whether to rehearse the whole parsed script or only scenes around that role
- whether to compact non-role material
- where to start

For uploaded books or long documents, the future schema should support scenes:

```json
{
  "title": "string",
  "characters": [],
  "scenes": [
    {
      "id": "string",
      "title": "string",
      "summary": "string",
      "lines": []
    }
  ]
}
```

This would allow:

- uploading a full play or book
- choosing scenes to rehearse
- skipping non-relevant material
- creating short summaries for non-role sections
- practicing only the user's role lines and cues

## Implementation Plan

1. Add live transcript display for the current user line.
2. Add filler-word filtering and live line matching.
3. Drive reveal pointer from matched progress.
4. Add `Done` / `Continue` as the reliable manual finalizer.
5. Gate partner output until the user line is finalized.
6. Change auto-turn completion from VAD-driven to match-driven with a short
   post-match delay.
7. Replace generic future placeholders with per-word blanks based on actual line text.
8. Move compaction into the post-parse setup flow and rename it to plain language.
9. Extend script schema later for scenes and long document uploads.

## Non-Goals For First Pass

- Do not add another LLM call for turn detection yet.
- Do not try to fully solve bad transcription.
- Do not use silence alone as proof that the actor is done.
- Do not mark filler thinking words as mistakes.
