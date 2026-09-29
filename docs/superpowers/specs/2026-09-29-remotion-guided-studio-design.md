# Remotion guided studio design

**Status:** Approved direction on 2026-09-29.

## Goal

Make the local Clipflow Remotion interface as clear and usable as its finished videos. An operator should be able to assemble a mixed-brand batch, review each story and its actual visual treatment, produce voice, approve, render, and export without deciphering a CSV or losing the video preview while editing.

## Product flow

1. **Create:** A new batch opens in a guided 10-row brief builder. Each row has a brand, concept, hook, and key message; an expanded row adds proof, CTA, format, duration, and post copy. Operators can add rows up to 20 and remove down to 10. CSV paste/import remains an alternate mode for bulk work. The guided mode sends `briefs` and CSV mode sends `csv` to the existing batch API.
2. **Review:** The batch page opens with a compact title, counts, and a single contextual production action. A readable left queue lists clips by brand, hook, and state. The selected clip opens alongside a 9:16 preview and a focused inspector. The preview and its scene strip remain visible while the inspector scrolls.
3. **Edit:** The inspector has Story, Visuals, Voice, and Publish tabs. Story edits hook, message, proof, and CTA. Visuals shows the current template, each scene's media/background and editable on-screen copy, plus the motion style. Voice holds the narration, voice choice, generation control, and playback. Publish holds post copy, download links, save, and approval.
4. **Produce:** The next action is derived from clip and batch state: finish review, generate missing voiceovers, render approved clips, or export completed clips. Disabled actions explain what is missing. Queue progress and errors remain visible without dominating the page.

## Architecture and constraints

- Keep the current Next.js app, filesystem-backed batch API, Remotion compositions, render worker, and clip schema. The redesign must not alter already rendered videos or silently change approved clips.
- Structured entry uses the existing validated `briefs` request shape. Invalid rows are identified before submission; server errors remain visible.
- Inspector edits continue through the existing clip PUT and review routes. Scene copy is edited as individual fields but saved as the existing `sceneCopy` array. The current media treatment is inspectable; replacing media and a full timeline editor are outside this pass.
- A dirty inspector draft must remain intact while the user switches tabs. Switching clips with unsaved changes requires a choice to save or discard. Save errors preserve the draft. Preview changes track the draft before saving; rendering still uses saved approved data.
- Use Clipflow black and lime for studio navigation and actions; let brand color identify individual clips. Text, controls, and statuses must be legible at 1130px desktop and 390px mobile. Keyboard focus, labels, reduced-motion behavior, and error/status announcements remain usable.

## Verification

- Existing batch and clip APIs, render queue, output format, and prior batch data still work.
- Unit tests cover guided-row validation. The Remotion test suite and production build pass.
- Browser smoke checks cover guided entry, review at laptop and mobile widths, tabbed edits, unsaved-change handling, and export visibility on the existing ten-clip batch.
