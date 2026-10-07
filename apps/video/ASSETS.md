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
| `public/audio/vo/<scene>/<n>.wav` | The **scratch** voiceover, for timing the animatics only: one take per sentence | Generated locally by `scripts/voice.ts` with [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) v1.0 (the ONNX build, [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), fp32), through [kokoro-js](https://github.com/hexgrad/kokoro) 1.2.1: voice `af_heart` for the first cut, `am_michael` (a male voice, at 0.94 speed) for the walkthrough (`w-*` scenes) | Apache-2.0 (model weights and library) | An AI voice: say so wherever a cut with it is shown. It is replaced by your own voice before anything is published. | 2026-10-05 |

The fonts' attributions are copied from each file's name table, which also carries the license URL.
The fonts are unmodified apart from the Bricolage instancing. OFL fonts may be embedded in and
used to make videos; the font files themselves are not sold or renamed.

## Made for this project

| Files | What they are | How they are made |
|---|---|---|
| `public/audio/score.wav`, `public/audio/teaser.wav`, `public/audio/walkthrough.wav` (and their `.raw.wav`) | The film's score, the teaser's and the walkthrough's | Synthesised by `scripts/compose.ts` from oscillators and seeded noise: no samples, no loops, nothing recorded. Original to this project, under the repository's license (Apache-2.0). |
| `public/footage/<take>.mp4`, `<take>.json` | The LIVE takes: landing, store, live-run, console, exhibit, ci, dashboard, and for the walkthrough w-store, w-echo, w-site, report | Captured by `scripts/capture.ts` from Shakedown's own site and console driving Leaky Llama, my own demo store, in the PayPal sandbox. `store` (Leaky Llama's own pages), `landing`, `live-run`, `console` and `exhibit` were recorded from the hosted site and store on October 6, 2026, at 1080p; `ci` was recorded again from the hosted site on October 7, 2026, after its AI heading was corrected. For the walkthrough, on October 7, 2026: `w-store` (Leaky Llama running on my machine, shelf to the PayPal button, never paid), `w-echo` (an order nobody paid, sent a "paid" message by hand with `curl` and no signature, shipping; PayPal's record of that order read afterwards: CREATED, no captures), `w-site` (Shakedown's hosted site and its cast) and `report` (the HTML report the CLI's own code renders for the recorded run, `scripts/cli-output.ts`). `dashboard` is PayPal's own transaction details for the capture the video follows to PayPal (scene 5), in my sandbox business account: recorded at 4K on October 6, 2026, in a Chrome window I signed in to (a throwaway profile, deleted afterwards). Every take shows sandbox test data only. Conformed by `scripts/conform.ts`. Each `.json` says what the take shows. |
| The persona illustrations | The cast's imps, on the cards | Drawn in code in `packages/ui/src/cast`, part of this repository. |
| The glyphs, the receipt mark, the diagram | Motion graphics | Drawn in code in `src/`. |
| `src/data/cli.json` | The walkthrough's terminal: the command, progress lines and receipt the CLI prints for the two recorded runs | Exported by `scripts/cli-output.ts`, which renders them with the CLI's own code (`@shakedown/core`, `@shakedown/reporters`) from `apps/web/fixtures/recorded`. |
| `src/data/runs.json` | Every number the video shows | Exported by `scripts/data.ts` from the recorded sandbox runs in `apps/web/fixtures/recorded`, with the demo store's catalog (the names and prices behind the SKUs the evidence quotes) from `apps/leaky-llama/lib/catalog.ts`. |

## Names and marks

PayPal is named in text where the video describes what Shakedown tests (the PayPal sandbox,
Orders v2, Payments v2, Webhooks) and in "Built for the PayPal AI Hackathon 2026". No PayPal
logo, or any other company's logo, appears in the video. Claude is named as the model behind the demo store's support assistant and Shakedown's plain-words explanations (the customers are scripts, not AI); no Anthropic logo appears either.

## Not in the video yet

| What | Plan | Terms to check before it goes in |
|---|---|---|
| Final voiceover | Your own voice, recorded to the script in `src/script.ts` | Yours. |
| Closed captions (`shakedown-demo.en.srt`) | whisper.cpp over the final voiceover stem, checked by hand | whisper.cpp is MIT; the model download needs approval. |
