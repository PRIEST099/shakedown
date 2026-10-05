import { type ReactNode, useEffect, useState } from 'react'
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { C, FONT, ramp } from './theme'
import type { Box, Take, TakeEvent, TakeName } from './timeline'

/**
 * Real footage (the LIVE layer). Each take was captured by scripts/capture.ts and conformed by
 * scripts/conform.ts into public/footage/<take>.mp4, beside its event log: the cursor's path,
 * its clicks, and marks with the boxes of things worth pointing at.
 */
export type { Box, Mark, Take, TakeName } from './timeline'
export { leaksOf, linesOf, markAt, markOf } from './timeline'

const takes = new Map<TakeName, Promise<Take>>()

/** A take's event log, loaded before the frame renders. */
export function useTake(name: TakeName): Take | undefined {
  const [take, setTake] = useState<Take>()
  const [handle] = useState(() => delayRender(`Loading the ${name} take`))
  useEffect(() => {
    if (!takes.has(name)) {
      takes.set(
        name,
        fetch(staticFile(`footage/${name}.json`)).then((res) => {
          if (!res.ok) throw new Error(`No footage for ${name}: run capture, then conform.`)
          return res.json() as Promise<Take>
        }),
      )
    }
    takes
      .get(name)
      ?.then(setTake)
      .catch((error) => console.error(error))
      .finally(() => continueRender(handle))
  }, [name, handle])
  return take
}

/** Where the cursor was at a moment of the take, between the logged points either side. */
function cursorAt(take: Take, ms: number) {
  const moves = take.events.filter((e) => e.type === 'move' || e.type === 'click') as Extract<
    TakeEvent,
    { type: 'move' | 'click' }
  >[]
  let last = moves[0]
  for (const move of moves) {
    if (move.t > ms) break
    last = move
  }
  const click = moves.find((m) => m.type === 'click' && ms >= m.t && ms - m.t < 450)
  return last ? { x: last.x, y: last.y, clickAge: click ? ms - click.t : undefined } : undefined
}

/**
 * One move of the camera over a take. It starts at frame `at` of the clip and eases over `frames`
 * (0 cuts straight to it, which is what a frozen frame needs).
 */
export interface CameraKey {
  at: number
  frames?: number
  /** The part of the take to frame; without one, the whole take. */
  box?: Box
  /** How far in; by default as far as fits the box with a margin, up to 1.9×. */
  scale?: number
  /** Where on screen the box's centre ends up; by default the centre of the frame. */
  center?: { x: number; y: number }
}

interface View {
  fx: number
  fy: number
  px: number
  py: number
  s: number
}

/** Where the camera is at a frame: each key eases from the view the keys before it left. */
export function viewAt(keys: readonly CameraKey[], frame: number, width: number, height: number) {
  let view: View = { fx: width / 2, fy: height / 2, px: width / 2, py: height / 2, s: 1 }
  for (const key of keys) {
    const frames = key.frames ?? 24
    const t = frames <= 0 ? (frame >= key.at ? 1 : 0) : ramp(frame, key.at, key.at + frames)
    if (t <= 0) continue
    const box = key.box ?? { x: 0, y: 0, width, height }
    const target: View = {
      fx: box.x + box.width / 2,
      fy: box.y + box.height / 2,
      px: key.center?.x ?? width / 2,
      py: key.center?.y ?? height / 2,
      s: key.scale ?? Math.min(1.9, (width * 0.82) / box.width, (height * 0.82) / box.height),
    }
    view = {
      fx: view.fx + (target.fx - view.fx) * t,
      fy: view.fy + (target.fy - view.fy) * t,
      px: view.px + (target.px - view.px) * t,
      py: view.py + (target.py - view.py) * t,
      s: view.s + (target.s - view.s) * t,
    }
  }
  return view
}

export interface FootageProps {
  take: TakeName
  /** Seconds into the take where this clip starts and stops. */
  from: number
  to: number
  /** Above 1, time is compressed; the tag says so. */
  rate?: number
  /** Moves over the take; none shows it whole. */
  camera?: readonly CameraKey[]
  tag?: string
  /** Where the tag sits, when something else covers the top-left corner. */
  tagAt?: { left: number; top: number }
  /** Fade the top of the frame to paper, right of this x, so cropped text above stays out. */
  veil?: number
  cursor?: boolean
  /** Drawn over the footage in the take's own coordinates, so it moves with the camera. */
  children?: (ms: number) => ReactNode
}

/** One clip of a take, at its own speed, with the logged cursor and the camera's moves. */
export function Footage({
  take: name,
  from,
  to,
  rate = 1,
  camera = [],
  tag,
  tagAt,
  veil,
  cursor = true,
  children,
}: FootageProps) {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const take = useTake(name)
  const ms = (from + (frame / fps) * rate) * 1000
  const pointer = take && cursor ? cursorAt(take, ms) : undefined
  // A point p of the take lands on screen at P + s·(p − F), F the focal point, P its place.
  const v = viewAt(camera, frame, width, height)
  const transform = `translate(${v.px - width / 2 - (v.fx - width / 2) * v.s}px, ${v.py - height / 2 - (v.fy - height / 2) * v.s}px) scale(${v.s})`

  if (!take || to <= from) return <AbsoluteFill style={{ background: C.paper }} />
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform, transformOrigin: '50% 50%' }}>
        <OffthreadVideo
          src={staticFile(`footage/${name}.mp4`)}
          trimBefore={Math.round(from * fps)}
          trimAfter={Math.round(to * fps)}
          playbackRate={rate}
          muted
          style={{ width: '100%', height: '100%' }}
        />
        {children?.(ms)}
        {pointer ? <Pointer x={pointer.x} y={pointer.y} clickAge={pointer.clickAge} /> : null}
      </AbsoluteFill>
      {veil !== undefined ? (
        <div
          style={{
            position: 'absolute',
            left: veil,
            right: 0,
            top: 0,
            height: 120,
            background: `linear-gradient(180deg, ${C.paper} 0%, ${C.paper} 62%, transparent 100%)`,
          }}
        />
      ) : null}
      {tag ? <Tag text={rate > 1 ? `${tag} · ${formatRate(rate)} speed` : tag} at={tagAt} /> : null}
    </AbsoluteFill>
  )
}

/** A highlighter pass over part of the take, e.g. a receipt line as it prints. */
export function Highlight({ box, t }: { box: Box; t: number }) {
  if (t <= 0) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x - 4,
        top: box.y - 2,
        width: (box.width + 8) * Math.min(1, t),
        height: box.height + 4,
        background: C.highlighter,
        mixBlendMode: 'multiply',
        opacity: 0.85,
        borderRadius: 3,
      }}
    />
  )
}

export const formatRate = (rate: number) => `${Number.isInteger(rate) ? rate : rate.toFixed(1)}×`

/** The cursor, drawn from the take's log: Playwright's own mouse never shows in a screencast. */
function Pointer({ x, y, clickAge }: { x: number; y: number; clickAge?: number }) {
  const ring = clickAge === undefined ? 0 : clickAge / 450
  return (
    <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none' }}>
      {clickAge !== undefined ? (
        <div
          style={{
            position: 'absolute',
            left: -22,
            top: -22,
            width: 44,
            height: 44,
            borderRadius: 999,
            border: `3px solid ${C.ink}`,
            opacity: 1 - ring,
            transform: `scale(${0.4 + ring})`,
          }}
        />
      ) : null}
      <svg
        width="28"
        height="34"
        viewBox="0 0 28 34"
        style={{ position: 'absolute', left: -3, top: -2 }}
      >
        <title>Cursor</title>
        <path
          d="M3 2 L3 26 L9.5 20 L14 31 L18.5 29 L14 18.5 L23 18.5 Z"
          fill={C.ink}
          stroke={C.surface}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

/** The honesty tag on every piece of real footage: what it is, and how fast it plays. */
export function Tag({ text, at }: { text: string; at?: { left: number; top: number } }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: at?.left ?? 40,
        top: at?.top ?? 36,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 18px',
        borderRadius: 999,
        background: C.ink,
        color: C.surface,
        font: `600 22px ${FONT.mono}`,
        letterSpacing: '0.02em',
      }}
    >
      <span style={{ width: 12, height: 12, borderRadius: 999, background: C.leakOnInk }} />
      {text}
    </div>
  )
}
