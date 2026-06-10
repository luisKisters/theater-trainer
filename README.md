# Theater Trainer

A progressive web app for rehearsing theatre lines with an AI scene partner.

Give it a script (paste text, a PDF, or photos of the pages) and it extracts the
roles and lines. Pick your role and rehearse out loud: the AI performs every other
character with voice, your spoken words appear on screen, and anything you got wrong
is marked with a deterministic strike-through + the correct word — no AI nagging.

Built on the **Gemini Live API** (`gemini-3.1-flash-live-preview`) for real-time
speech-in / speech-out, plus Gemini structured output for script ingestion.

## Status: design phase

This repo currently holds **UI mockups and an interactive demo** — implementation
follows once the design is locked.

- `mockups/index.html` — gallery of theme directions
- `mockups/demo.html` — **interactive demo** of the rehearsal flow (no mic; partner
  lines auto-play, your lines reveal word-by-word, wrong words are corrected inline)
- `mockups/theme-*.html` — four visual directions (Manuscript, Teleprompter,
  Editorial, Stage Noir) and teleprompter layout variations

Open `mockups/index.html` in a browser to browse.
