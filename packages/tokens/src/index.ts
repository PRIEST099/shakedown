/**
 * Shakedown design tokens: "The Returns Desk".
 * Rule: only money gets color. Red Ink = would have leaked, Seal = sealed, Highlighter = look here.
 * These names are a contract shared by apps/web, the console and apps/video.
 */
export const color = {
  ink: '#12100D',
  inkPanel: '#1C1915',
  inkRaised: '#26221C',
  inkLine: '#3A342C',
  dusk: '#7A7266',
  chalk3: '#958C80',
  chalk2: '#B9B0A3',
  paper: '#F4EFE6',
  counter: '#FFFDF8',
  carbon: '#EAE3D6',
  perforation: '#D9D1C3',
  smudge: '#8A8277',
  graphite: '#6B645B',
  pencil: '#57514A',
  receiptDim: '#ECE5D8',
  red600: '#B42318',
  red400: '#FF6B5E',
  red300: '#FF8A7E',
  redTintDay: '#FBE3DF',
  redTintNight: '#3A1612',
  seal600: '#08706A',
  seal400: '#4FD1C5',
  seal300: '#7FE3DA',
  sealTintDay: '#D9EFEA',
  sealTintNight: '#0F2A28',
  highlighter: '#FFE14D',
  hlTintDay: '#FFF3B0',
  hlTintNight: '#3A3317',
} as const

export const font = {
  display: 'Bricolage Grotesque',
  ui: 'Public Sans',
  mono: 'IBM Plex Mono',
} as const

export const radius = { xs: 2, sm: 6, md: 10, lg: 16, pill: 999 } as const

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
  24: 96,
  32: 128,
} as const

export type CubicBezier = readonly [number, number, number, number]

export interface SpringConfig {
  damping: number
  stiffness: number
  mass: number
}

export const motion = {
  fps: 30,
  /** Durations in frames at 30 fps (video). */
  dur: { xs: 4, sm: 8, md: 12, lg: 18, xl: 30 },
  /** The same durations in milliseconds (web). */
  ms: { xs: 133, sm: 267, md: 400, lg: 600, xl: 1000 },
  ease: {
    standard: [0.2, 0, 0, 1],
    exit: [0.4, 0, 1, 1],
    overshoot: [0.34, 1.56, 0.64, 1],
    print: [0.3, 0, 0.1, 1],
    tear: [0.7, 0, 0.84, 0],
  } satisfies Record<string, CubicBezier>,
  spring: {
    stamp: { damping: 12, stiffness: 180, mass: 0.6 },
    card: { damping: 18, stiffness: 260, mass: 0.8 },
    camera: { damping: 20, stiffness: 120, mass: 1 },
  } satisfies Record<string, SpringConfig>,
  /** Stagger in milliseconds. */
  staggerMs: { line: 100, card: 67 },
  shake: { px: 2, cycles: 2, ms: 200 },
  /** WCAG 2.3.1: never flash or tick more than 3 times per second. */
  leakTickMaxPerSec: 3,
} as const
