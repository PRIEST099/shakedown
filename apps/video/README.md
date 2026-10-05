# @shakedown/video

The hackathon video, its vertical teaser and its thumbnail, made in [Remotion](https://remotion.dev)
from real footage of the product and the same components the site uses. The plan, the research
and the scene list are in `docs/video/VIDEO_PIPELINE.md` (in the workspace, beside the repo).

| Output | Composition | Command |
|---|---|---|
| `out/shakedown-animatic.mp4`: the 16:9 cut with the voiceover as captions | `Demo` | `pnpm animatic` |
| `out/shakedown-teaser.mp4`: 40 s, 1080×1920, loops | `Teaser` | `pnpm teaser` |
| `out/shakedown-thumbnail.png`: 3840×2160 | `Thumbnail` | `pnpm thumbnail` |

Run them with `pnpm --filter @shakedown/video <command>`, or `pnpm studio` to scrub the timeline.
For the final 16:9 cut, render `Demo` with `--props='{"captions":false}' --scale=2`: the final ships
closed captions as an SRT file instead of burning them in.

## How it's made

1. **`pnpm data`** exports every number the video shows to `src/data/runs.json`, from the recorded
   sandbox runs the site itself uses. The video can't state a figure the product didn't measure.
2. **`pnpm capture`** drives the running site in Chrome with Playwright and saves its screencast
   frame by frame, with an event log on the same clock: the cursor's path, its clicks, and marks
   with the boxes of things worth pointing at. Each receipt line is marked as it prints, with its
   customer and amount. The live-run take goes to Leaky Llama in the PayPal sandbox (sandbox calls
   only, no Claude). Start a production build of the site and the store first:

   ```bash
   SITE_URL=http://localhost:3200 pnpm --filter @shakedown/video capture [take …] [--scale=2]
   ```

   Use `--scale=2` for the final cut: 4K frames stay sharp when the camera zooms in.
3. **`pnpm conform`** turns each take's frames into 30 fps video (`public/footage/<take>.mp4`)
   beside its event log.
4. **`pnpm voice`** records the scratch voiceover: each sentence of `src/script.ts` read by
   Kokoro-82M (Apache-2.0), run locally, never a macOS system voice. It writes one take per
   sentence to `public/audio/vo` and each take's length to `src/data/vo.json`, and the cut is timed
   from those lengths. `--scene=<id>` re-records one scene. The first run downloads the model
   (about 330 MB). **`pnpm vo-sheet`** then writes [VOICEOVER.md](VOICEOVER.md), the script to
   record your own voice from.
5. **`pnpm compose`** writes the score and the teaser's score (`public/audio`), synthesised in
   code. Their LEAK and SEALED sounds land on the frames where the footage prints and seals. In
   the film, the music dips 10 dB under every voiceover line.
6. **Render.** `pnpm animatic` and `pnpm teaser` end with **`pnpm master`**, which takes the
   render's sound to the platform level, −14 LUFS with true peaks under −1.5 dBTP, and copies the
   picture untouched. Remotion's ffmpeg has no limiter, so `scripts/loudness.ts` is one: a
   BS.1770-4 loudness meter and a look-ahead true-peak limiter. ffmpeg's own meter checks every
   master, and a file that misses the target is left as it was.
7. **Check** the result with **`pnpm sheet <video> <dir> <seconds…>`**, which makes contact sheets
   of stills (`--portrait` for the teaser).

`src/timeline.ts` works out every cut from the takes' event logs: the speed-ramped segments, the
frames where each leak prints and where the re-run seals. The scenes cut with it and the score is
timed from it, so picture and sound can't drift apart.

## Honesty rules

- **Real footage says so.** Every LIVE shot carries a `LIVE · …` tag, with its speed whenever time
  is compressed, segment by segment.
- **Numbers are real.** Amounts and IDs come from `runs.json` or from the footage itself.
- **No third-party logos.** PayPal and Claude are named in text only.
- **Every file is in the [asset ledger](ASSETS.md).** Footage, audio and renders are generated, so
  they are not committed.

## Still to come

- Your own voice, recorded from [VOICEOVER.md](VOICEOVER.md), in place of the scratch takes.
- The PayPal sandbox dashboard shot in scene 6, which only you can record.
- Closed captions from the final voiceover.
