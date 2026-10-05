import { Audio, interpolate, staticFile } from 'remotion'
import { useTake } from './footage'
import { voiceSpans } from './timeline'

/** How far the music dips under the voice (VIDEO_PIPELINE §4.5: 10 to 12 dB), and how fast. */
const DUCK = 10 ** (-10 / 20)
const RAMP = 6

/**
 * The film's score from scripts/compose.ts: original, composed in code, normalised for the mix.
 * It dips under every recorded voiceover line, easing down and back up over six frames.
 */
export function Score() {
  const take = useTake('live-run')
  const spans = voiceSpans(take)
  const volume = (frame: number) => {
    let under = 0
    for (const span of spans) {
      if (frame < span.from - RAMP || frame > span.to + RAMP) continue
      under = Math.max(
        under,
        interpolate(frame, [span.from - RAMP, span.from, span.to, span.to + RAMP], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
      )
    }
    return 1 - (1 - DUCK) * under
  }
  return <Audio src={staticFile('audio/score.wav')} volume={volume} />
}

/** The teaser's own 40-second score, cut to the teaser's beats. */
export function TeaserScore() {
  return <Audio src={staticFile('audio/teaser.wav')} />
}
