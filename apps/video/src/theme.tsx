import '@shakedown/tokens/tokens.css'
import '@shakedown/ui/styles.css'
import type { CSSProperties, ReactNode } from 'react'
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Easing,
  interpolate,
  staticFile,
} from 'remotion'

/** The Returns Desk, on screen: paper, ink, one red ink, one teal stamp, a highlighter. */
export const C = {
  paper: '#f4efe6',
  surface: '#fffdf8',
  ink: '#12100d',
  muted: '#57514a',
  /** Secondary type on ink: 6.8:1 against it. */
  mutedOnInk: '#a39a8c',
  rule: '#d9d1c3',
  leak: '#b42318',
  leakOnInk: '#ff6b5e',
  sealed: '#08706a',
  sealedOnInk: '#4fd1c5',
  highlighter: '#ffe14d',
}

export const FONT = {
  display: '"Bricolage Display", system-ui, sans-serif',
  ui: '"Public Sans", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
}

// The site's own fonts, from public/fonts (all SIL OFL; see ASSETS.md).
const FACES = [
  {
    family: 'Bricolage Display',
    file: 'fonts/bricolage-grotesque-display.woff2',
    weight: '800',
    stretch: '75% 100%',
  },
  { family: 'Public Sans', file: 'fonts/public-sans-latin.woff2', weight: '100 900' },
  { family: 'IBM Plex Mono', file: 'fonts/ibm-plex-mono-400-latin.woff2', weight: '400' },
  { family: 'IBM Plex Mono', file: 'fonts/ibm-plex-mono-600-latin.woff2', weight: '600' },
]

let fontsRequested = false
export function useFonts() {
  if (fontsRequested || typeof document === 'undefined') return
  fontsRequested = true
  const handle = delayRender('Loading the site’s fonts')
  Promise.all(
    FACES.map(async (face) => {
      const font = new FontFace(face.family, `url(${staticFile(face.file)})`, {
        weight: face.weight,
        stretch: face.stretch,
      })
      document.fonts.add(await font.load())
    }),
  )
    .then(() => continueRender(handle))
    .catch((error) => {
      console.error(error)
      continueRender(handle)
    })
}

/**
 * The tokens' font variables, pointed at the faces above, so shared components look like the site.
 * The `--sd-font-*` stacks are set here too: tokens.css builds them on :root from the `--font-*`
 * names, which only exist down here, so on :root they never resolve.
 */
const VARS = {
  '--font-bricolage': '"Bricolage Display"',
  '--font-public-sans': '"Public Sans"',
  '--font-plex-mono': '"IBM Plex Mono"',
  '--sd-font-display': FONT.display,
  '--sd-font-ui': FONT.ui,
  '--sd-font-mono': FONT.mono,
} as CSSProperties

export function Stage({
  children,
  tone = 'paper',
}: {
  children?: ReactNode
  tone?: 'paper' | 'ink'
}) {
  useFonts()
  return (
    <AbsoluteFill
      style={{
        ...VARS,
        background: tone === 'ink' ? C.ink : C.paper,
        color: tone === 'ink' ? C.paper : C.ink,
        fontFamily: FONT.ui,
      }}
    >
      {children}
    </AbsoluteFill>
  )
}

/** 0 → 1 over [from, to] frames, eased; clamped either side. */
export function ramp(frame: number, from: number, to: number, ease = Easing.bezier(0.2, 0, 0, 1)) {
  return interpolate(frame, [from, to], [0, 1], {
    easing: ease,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
}

/** In, hold, out: a fade-and-rise for a piece of type that comes and goes (or, to Infinity, stays). */
export function presence(frame: number, from: number, to: number, fade = 8) {
  const inT = ramp(frame, from, from + fade)
  const outT = Number.isFinite(to) ? 1 - ramp(frame, to - fade, to) : 1
  const t = Math.min(inT, outT)
  return { opacity: t, transform: `translateY(${(1 - inT) * 18}px)` }
}
