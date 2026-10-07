# @shakedown/video

The hackathon video, its vertical teaser and its thumbnails, made in [Remotion](https://remotion.dev)
from real footage of the product and the same components the site uses. The plan, the research
and the scene list are in `docs/video/VIDEO_PIPELINE.md` (in the workspace, beside the repo).

| Output | Composition | Command |
|---|---|---|
| `out/shakedown-animatic.mp4`: the 16:9 cut with the voiceover as captions | `Demo` | `pnpm animatic` |
| `out/shakedown-walkthrough.mp4`: the second 16:9 cut, problem first, as a screen walkthrough in a male scratch voice | `Walkthrough` | `pnpm walkthrough` |
| `out/shakedown-teaser.mp4`: 40 s, 1080×1920, loops | `Teaser` | `pnpm teaser` |
| `out/shakedown-thumbnail.png`: 3840×2160, for YouTube | `Thumbnail` | `pnpm thumbnail` |
| `out/shakedown-devpost-thumbnail.png`: 3000×2000 (3:2), for Devpost | `DevpostThumbnail` | `pnpm thumbnail:devpost` |
| `out/gallery/NN-<name>.png`: Devpost's image gallery, 3000×2000 each | `Gallery` | `pnpm gallery:shots`, then `pnpm gallery` |

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
   only, no Claude), and the store take tours Leaky Llama itself: its shelf, socks in a cart at
   PayPal's button (it never pays), and its leak switches. Start a production build of the site and
   the store first, or point both at the hosted ones:

   ```bash
   SITE_URL=http://localhost:3200 STORE_URL=http://localhost:3100 \
     pnpm --filter @shakedown/video capture [take …] [--scale=2]
   ```

   `--scale=2` asks for 4K frames, which stay sharp when the camera zooms in, but headless Chrome
   sends its screencast at 1080p whatever the scale: only a real window gives 4K, as the
   `dashboard` take below does. `conform` says when a take came in smaller than asked.

   The `dashboard` take records PayPal's own transaction details, so it needs a sandbox sign-in.
   Open Chrome with a throwaway profile and a local debugging port, sign in to the sandbox
   business account there yourself, then point the script at that window:

   ```bash
   open -n -a "Google Chrome" --args --user-data-dir=/tmp/paypal-sandbox --remote-debugging-port=9223 https://www.sandbox.paypal.com/signin
   pnpm --filter @shakedown/video capture dashboard --cdp=http://127.0.0.1:9223 --scale=2
   ```

   Quit that window and delete its profile afterwards.
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

## The walkthrough

A second cut, kept beside the first so the two can be compared. It starts from nothing: Leaky
Llama, what happens when someone pays (a test email typed at the checkout), the double click (drawn,
then the customer's own order list after one checkout was submitted twice), and the echo for real (`w-echo`: an unpaid order, a "paid" message sent by hand with
`curl`, the order shipping, PayPal's record of it read afterwards). Then Shakedown, the CLI run
in a terminal (`pnpm cli-output` renders it with the CLI's own code from the recorded runs), the
report, the fixed shop and CI.

    pnpm capture w-store w-echo report        # the store running on localhost:3100
    SITE_URL=https://shakedown-web.onrender.com pnpm capture w-site
    pnpm conform w-store w-echo w-site report
    pnpm cli-output
    pnpm voice --film=walkthrough             # the male scratch voice (am_fenrir), each scene in one pass
    pnpm vo-sheet --film=walkthrough          # VOICEOVER-walkthrough.md
    pnpm compose
    pnpm walkthrough

Its scenes are `w-*` in `src/walkthrough/script.ts`, each sized from its recorded takes plus the
pauses a speaker would leave; the cuts are in `src/walkthrough/timeline.ts`.

## Honesty rules

- **Real footage says so.** Every LIVE shot carries a `LIVE · …` tag, with its speed whenever time
  is compressed, segment by segment.
- **Numbers are real.** Amounts and IDs come from `runs.json` or from the footage itself.
- **No third-party logos.** PayPal and Claude are named in text only.
- **Every file is in the [asset ledger](ASSETS.md).** Footage, audio and renders are generated, so
  they are not committed.

## Still to come

- Your own voice, recorded from [VOICEOVER.md](VOICEOVER.md), in place of the scratch takes.
- 4K takes of the site, the store and the console, recorded in a real window.
- Closed captions from the final voiceover.
