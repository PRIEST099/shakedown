# Asset ledger

Every file the video is made of, where it came from, and the terms it is used under
(VIDEO_PIPELINE §4.6, deliverable D5). A file that isn't listed here doesn't go in a render.

## Third-party files

| File | What it is | Source | License | Attribution | Obtained |
|---|---|---|---|---|---|
| `public/fonts/bricolage-grotesque-display.woff2` | Bricolage Grotesque, display instance (weight 800, optical size 96, width 75–100), Latin subset | Google Fonts Latin subset of [ateliertriay/bricolage](https://github.com/ateliertriay/bricolage), instanced with fontTools (see `apps/web/app/_fonts/README.md`) | [SIL OFL 1.1](https://openfontlicense.org) | Copyright 2022 The Bricolage Grotesque Project Authors; the notice is also in the font's name table | 2026-10-04 |
| `public/fonts/public-sans-latin.woff2` | Public Sans, variable weight, Latin subset | Google Fonts ([uswds/public-sans](https://github.com/uswds/public-sans)), the file `next/font/google` serves the site | SIL OFL 1.1 | Copyright 2015 The Public Sans Project Authors (https://github.com/uswds/public-sans) | 2026-10-05 |
| `public/fonts/ibm-plex-mono-400-latin.woff2` | IBM Plex Mono Regular, Latin subset | Google Fonts ([IBM/plex](https://github.com/IBM/plex)), via `next/font/google` | SIL OFL 1.1 | Copyright 2017 IBM Corp. All rights reserved. | 2026-10-05 |
| `public/fonts/ibm-plex-mono-600-latin.woff2` | IBM Plex Mono SemiBold, Latin subset | as above | SIL OFL 1.1 | as above | 2026-10-05 |
| `public/audio/vo/<scene>/<n>.wav` | The **scratch** voiceover, for timing the animatic only: one take per sentence | Generated locally by `scripts/voice.ts` with [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) v1.0 (the ONNX build, [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), fp32), voice `af_heart`, through [kokoro-js](https://github.com/hexgrad/kokoro) 1.2.1 | Apache-2.0 (model weights and library) | An AI voice: say so wherever a cut with it is shown. It is replaced by your own voice before anything is published. | 2026-10-05 |

The fonts' attributions are copied from each file's name table, which also carries the license URL.
The fonts are unmodified apart from the Bricolage instancing. OFL fonts may be embedded in and
used to make videos; the font files themselves are not sold or renamed.

## Made for this project

| Files | What they are | How they are made |
|---|---|---|
| `public/audio/score.wav`, `public/audio/teaser.wav` (and their `.raw.wav`) | The film's score and the teaser's | Synthesised by `scripts/compose.ts` from oscillators and seeded noise: no samples, no loops, nothing recorded. Original to this project, under the repository's license (Apache-2.0). |
| `public/footage/<take>.mp4`, `<take>.json` | The LIVE takes: landing, live-run, console, exhibit, ci | Captured by `scripts/capture.ts` from Shakedown's own site and console (a local production build) driving Leaky Llama, our own demo store, in the PayPal sandbox. Conformed by `scripts/conform.ts`. Each `.json` says what the take shows. |
| The persona illustrations | The cast's imps, on the cards | Drawn in code in `packages/ui/src/cast`, part of this repository. |
| The glyphs, the receipt mark, the diagram | Motion graphics | Drawn in code in `src/`. |
| `src/data/runs.json` | Every number the video shows | Exported by `scripts/data.ts` from the recorded sandbox runs in `apps/web/fixtures/recorded`. |

## Names and marks

PayPal is named in text where the video describes what Shakedown tests (the PayPal sandbox,
Orders v2, Payments v2, Webhooks) and in "Built for the PayPal AI Hackathon 2026". No PayPal
logo, or any other company's logo, appears in the video. Claude is named as the model that plays
the customers; no Anthropic logo appears either.

## Not in the video yet

| What | Plan | Terms to check before it goes in |
|---|---|---|
| Final voiceover | Your own voice, recorded to the script in `src/script.ts` | Yours. |
| Closed captions (`shakedown-demo.en.srt`) | whisper.cpp over the final voiceover stem, checked by hand | whisper.cpp is MIT; the model download needs approval. |
| PayPal sandbox dashboard footage (S6) | You sign in and record it (VIDEO_PIPELINE §3.5) | Your own sandbox account; check that nothing personal is on screen. |
