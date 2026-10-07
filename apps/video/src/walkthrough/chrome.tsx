import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { Footage, type FootageProps, formatRate } from '../footage'
import { C, FONT, presence, ramp } from '../theme'
import type { Seg } from './cli'

/**
 * The walkthrough is a screen recording: a desk, and on it a browser window and a terminal, the
 * way a person shares their screen. The footage plays inside the browser window, with its own
 * camera, so a zoom reads as the recording app zooming in.
 */

export const DESK = '#e7e1d6'

/** Where the browser window sits, and the page inside it (16:9, so the takes fit exactly). */
export const BROWSER = { x: 72, y: 26, width: 1776, bar: 48 }
const PAGE_HEIGHT = (BROWSER.width * 9) / 16
export const PAGE_SCALE = BROWSER.width / 1920

export function Desk({ children }: { children?: ReactNode }) {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 35%, #f1ece3 0%, ${DESK} 70%)`,
      }}
    >
      {children}
    </AbsoluteFill>
  )
}

function Dots() {
  return (
    <div style={{ display: 'flex', gap: 9 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 14, height: 14, borderRadius: 99, background: '#d9d2c6' }} />
      ))}
    </div>
  )
}

/** A plain browser window: three dots, the address, and what the recording is, in words. */
export function BrowserWindow({
  url,
  note,
  rate,
  children,
  style,
}: {
  url: string
  /** What this footage is, e.g. "Recorded Oct 7, 2026 · PayPal sandbox". */
  note?: string
  /** The footage's playback rate, said in the bar when it is sped up. */
  rate?: number
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: BROWSER.x,
        top: BROWSER.y,
        width: BROWSER.width,
        height: BROWSER.bar + PAGE_HEIGHT,
        borderRadius: 14,
        overflow: 'hidden',
        background: C.surface,
        boxShadow: '0 30px 70px -30px rgb(18 16 13 / 0.45), 0 0 0 1px rgb(18 16 13 / 0.08)',
        ...style,
      }}
    >
      <div
        style={{
          height: BROWSER.bar,
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          padding: '0 20px',
          background: '#f3efe7',
          borderBottom: '1px solid #e0d9cc',
        }}
      >
        <Dots />
        <div
          style={{
            flex: 'none',
            width: 720,
            padding: '6px 18px',
            borderRadius: 999,
            background: C.surface,
            border: '1px solid #e0d9cc',
            font: `500 21px ${FONT.ui}`,
            color: C.muted,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {url}
        </div>
        <div style={{ flex: 1 }} />
        {note ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              font: `600 18px ${FONT.mono}`,
              color: C.muted,
              letterSpacing: '0.02em',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 99, background: C.leak }} />
            {rate && rate > 1.05 ? `${note} · ${formatRate(rate)} speed` : note}
          </div>
        ) : null}
      </div>
      <div style={{ position: 'relative', height: PAGE_HEIGHT, overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 1920,
            height: 1080,
            transform: `scale(${PAGE_SCALE})`,
            transformOrigin: '0 0',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/** A take, playing in the browser window. Its tag is the window's note, so it has none of its own. */
export function Page(props: Omit<FootageProps, 'tag' | 'tagAt'>) {
  return <Footage {...props} />
}

// ---------- the terminal ----------

export const TERMINAL = { x: 230, y: 70, width: 1460, height: 900, bar: 48 }
const TERM_FONT = 25
export const TERM_LINE = 36
const TERM_PAD = 30
/** How many lines fit before a terminal of this height scrolls. */
export const rowsOf = (height: number) =>
  Math.floor((height - TERMINAL.bar - TERM_PAD * 2) / TERM_LINE)

const INK = {
  bg: '#191714',
  text: '#ebe5da',
  leak: '#ff6b5e',
  sealed: '#4fd1c5',
  mark: '#ffe14d',
  dim: 'rgb(235 229 218 / 0.5)',
  prompt: '#8fc9a3',
}

export type TermLine =
  | { kind: 'prompt'; text: string; typed: number }
  | { kind: 'out'; segs: Seg[] }

/** One line of output: its coloured runs, and the receipt's badges drawn as the terminal does. */
function Out({ segs, lit }: { segs: Seg[]; lit?: boolean }) {
  const text = segs.map(([t]) => t).join('')
  const badge = /^\s+(\d+ LEAKS?|SEALED)\s+$/.exec(segs.map(([t]) => t).join(''))
  return (
    <div
      style={{
        height: TERM_LINE,
        whiteSpace: 'pre',
        background: lit ? 'rgb(255 225 77 / 0.16)' : undefined,
        boxShadow: lit ? `inset 4px 0 0 ${INK.mark}` : undefined,
      }}
    >
      {badge
        ? [
            <span key="pad">{text.slice(0, text.indexOf(badge[1] ?? '') - 2)}</span>,
            <span
              key="badge"
              style={{
                background: segs.some(([, tone]) => tone === 'sealed') ? INK.sealed : INK.leak,
                color: INK.bg,
                fontWeight: 600,
                padding: '0 0.6em',
              }}
            >
              {badge[1]}
            </span>,
          ]
        : segs.map(([t, tone], i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: runs of one line never reorder
              key={i}
              style={{
                color:
                  tone === 'leak'
                    ? INK.leak
                    : tone === 'sealed'
                      ? INK.sealed
                      : tone === 'mark'
                        ? INK.mark
                        : tone === 'dim'
                          ? INK.dim
                          : INK.text,
                fontWeight: tone === 'bold' ? 600 : 400,
              }}
            >
              {t}
            </span>
          ))}
    </div>
  )
}

/**
 * A terminal window. `lines` are what has printed so far; it scrolls to keep the last of them in
 * view, the way a terminal does, unless `scrollTo` pins a line to the top. `lit` marks lines with
 * the highlighter.
 */
export function TerminalWindow({
  title,
  note,
  lines,
  lit = [],
  scrollTo,
  cursor = true,
  box = TERMINAL,
  style,
}: {
  title: string
  note?: string
  lines: TermLine[]
  lit?: number[]
  scrollTo?: number
  cursor?: boolean
  /** Where the window sits, when not in the middle of the desk. */
  box?: { x: number; y: number; width: number; height: number }
  style?: CSSProperties
}) {
  const frame = useCurrentFrame()
  const top = scrollTo ?? Math.max(0, lines.length - rowsOf(box.height))
  const blink = Math.floor(frame / 16) % 2 === 0
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        borderRadius: 14,
        overflow: 'hidden',
        background: INK.bg,
        boxShadow: '0 30px 80px -30px rgb(18 16 13 / 0.6), 0 0 0 1px rgb(18 16 13 / 0.3)',
        ...style,
      }}
    >
      <div
        style={{
          height: TERMINAL.bar,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 22,
          background: '#262320',
          color: 'rgb(235 229 218 / 0.7)',
          font: `500 20px ${FONT.ui}`,
        }}
      >
        <div style={{ display: 'flex', gap: 9 }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{ width: 14, height: 14, borderRadius: 99, background: '#4a4540' }}
            />
          ))}
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>{title}</div>
        {note ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              font: `600 18px ${FONT.mono}`,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 99, background: INK.leak }} />
            {note}
          </div>
        ) : null}
      </div>
      <div
        style={{
          padding: TERM_PAD,
          font: `400 ${TERM_FONT}px/${TERM_LINE}px ${FONT.mono}`,
          color: INK.text,
          height: box.height - TERMINAL.bar,
          overflow: 'hidden',
        }}
      >
        <div style={{ transform: `translateY(${-top * TERM_LINE}px)` }}>
          {lines.map((line, i) => {
            const last = i === lines.length - 1
            if (line.kind === 'prompt') {
              const shown = line.text.slice(0, Math.max(0, Math.round(line.typed)))
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines only ever append
                <div key={i} style={{ height: TERM_LINE, whiteSpace: 'pre' }}>
                  <span style={{ color: INK.prompt }}>~/leaky-llama</span>
                  <span style={{ color: INK.dim }}> $ </span>
                  {shown}
                  {last && cursor ? (
                    <span
                      style={{
                        display: 'inline-block',
                        width: '0.6em',
                        height: '1.1em',
                        verticalAlign: '-0.2em',
                        background: blink ? INK.text : 'transparent',
                      }}
                    />
                  ) : null}
                </div>
              )
            }
            // biome-ignore lint/suspicious/noArrayIndexKey: lines only ever append
            return <Out key={i} segs={line.segs} lit={lit.includes(i)} />
          })}
        </div>
      </div>
    </div>
  )
}

/** A window sliding up into place, and away again. */
export function Arrive({
  from,
  to = Number.POSITIVE_INFINITY,
  children,
}: {
  from: number
  to?: number
  children: ReactNode
}) {
  const frame = useCurrentFrame()
  const inT = ramp(frame, from, from + 14)
  const outT = Number.isFinite(to) ? ramp(frame, to - 12, to) : 0
  if (frame < from || frame > to) return null
  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(inT, 1 - outT),
        transform: `translateY(${(1 - inT) * 60 + outT * 40}px) scale(${interpolate(inT, [0, 1], [0.97, 1])})`,
      }}
    >
      {children}
    </AbsoluteFill>
  )
}

/**
 * The presenter's note: a card that sits beside what is on screen and says it in words, a line at
 * a time, as the voice says it.
 */
export function Note({
  from,
  to = Number.POSITIVE_INFINITY,
  x,
  y,
  width,
  label,
  children,
}: {
  from: number
  to?: number
  x: number
  y: number
  width: number
  label?: string
  children: ReactNode
}) {
  const frame = useCurrentFrame()
  if (frame < from - 1 || frame > to + 1) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        padding: '22px 26px 24px',
        borderRadius: 14,
        background: C.ink,
        color: C.surface,
        boxShadow: '0 24px 50px -24px rgb(18 16 13 / 0.6)',
        ...presence(frame, from, to, 8),
      }}
    >
      {label ? (
        <div
          style={{
            font: `600 19px ${FONT.mono}`,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: C.mutedOnInk,
            marginBottom: 12,
          }}
        >
          {label}
        </div>
      ) : null}
      {children}
    </div>
  )
}

/** A chip that names what is coming, e.g. "Leak 1 · the double click". */
export function Chip({
  from,
  to = Number.POSITIVE_INFINITY,
  x,
  y,
  tone = 'leak',
  children,
}: {
  from: number
  to?: number
  x: number
  y: number
  tone?: 'leak' | 'ink'
  children: ReactNode
}) {
  const frame = useCurrentFrame()
  if (frame < from - 1 || frame > to + 1) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        padding: '12px 24px',
        borderRadius: 999,
        background: tone === 'leak' ? C.leak : C.ink,
        color: C.surface,
        font: `700 30px ${FONT.ui}`,
        letterSpacing: '0.01em',
        boxShadow: '0 16px 40px -18px rgb(18 16 13 / 0.6)',
        ...presence(frame, from, to, 8),
      }}
    >
      {children}
    </div>
  )
}
