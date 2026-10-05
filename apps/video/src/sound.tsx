import { Audio, staticFile } from 'remotion'

/** The film's score from scripts/compose.ts: original, composed in code, normalised for the mix. */
export function Score() {
  return <Audio src={staticFile('audio/score.wav')} />
}

/** The teaser's own 40-second score, cut to the teaser's beats. */
export function TeaserScore() {
  return <Audio src={staticFile('audio/teaser.wav')} />
}
