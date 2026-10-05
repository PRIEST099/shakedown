import { type CSSProperties, createContext, type ReactNode, useContext } from 'react'
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { type Cue, cues, FPS, lines, type Scene } from './script'
import { C, FONT, presence, ramp } from './theme'

/** The horned receipt, as on the site (DESIGN_SPEC §2.5). */
export function Mark({ size = 64, color = C.ink }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ color }}>
      <title>Shakedown</title>
      <path d="M5.5 5.5 L4.6 1.8 L8.6 5 Z M18.5 5.5 L19.4 1.8 L15.4 5 Z" fill="currentColor" />
      <path
        d="M5 5 H19 V20 L17 22 L15 20 L13 22 L11 20 L9 22 L7 20 L5 22 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 9 H16 M8 12 H13.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M8 16 H16" stroke={C.leak} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function Wordmark({ size = 120, color = C.ink }: { size?: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.22, color }}>
      <Mark size={size * 1.05} color={color} />
      <span
        style={{
          font: `800 ${size}px ${FONT.display}`,
          fontVariationSettings: '"wdth" 80',
          letterSpacing: '-0.02em',
        }}
      >
        shakedown
      </span>
    </div>
  )
}

/** A big display line that rises in and fades out between two frames. */
export function Line({
  from,
  to,
  size = 96,
  color,
  children,
  style,
}: {
  from: number
  to: number
  size?: number
  color?: string
  children: ReactNode
  style?: CSSProperties
}) {
  const frame = useCurrentFrame()
  if (frame < from - 1 || frame > to + 1) return null
  return (
    <div
      style={{
        font: `800 ${size}px/1 ${FONT.display}`,
        fontVariationSettings: '"wdth" 78',
        letterSpacing: '-0.02em',
        color,
        ...presence(frame, from, to),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/**
 * The site's one highlighter swipe, drawn left to right behind a phrase. On ink, as in the site's
 * Night shift, the type itself turns Highlighter, sweeping across in the same direction.
 */
export function Swipe({
  at,
  children,
  tone = 'paper',
}: {
  at: number
  children: ReactNode
  tone?: 'paper' | 'ink'
}) {
  const frame = useCurrentFrame()
  const t = ramp(frame, at, at + 12)
  if (tone === 'ink') {
    return (
      <span style={{ position: 'relative', whiteSpace: 'nowrap' }}>
        <span>{children}</span>
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            color: C.highlighter,
            clipPath: `inset(-0.2em ${((1 - t) * 100).toFixed(2)}% -0.2em 0)`,
          }}
        >
          {children}
        </span>
      </span>
    )
  }
  return (
    <span style={{ position: 'relative', whiteSpace: 'nowrap', color: C.ink }}>
      <span
        style={{
          position: 'absolute',
          left: '-0.08em',
          right: '-0.08em',
          top: '0.52em',
          height: '0.42em',
          background: C.highlighter,
          transformOrigin: '0 50%',
          transform: `scaleX(${t})`,
          zIndex: 0,
        }}
      />
      <span style={{ position: 'relative' }}>{children}</span>
    </span>
  )
}

/** A finding called out over the footage: who, what happened, what it cost. */
export function Callout({
  from,
  to,
  who,
  what,
  amount,
  x = 120,
  y = 760,
  width = 880,
  label = 'Leak',
}: {
  from: number
  to: number
  who: string
  what: string
  amount?: string
  x?: number
  y?: number
  width?: number
  label?: string
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
        padding: '16px 26px 18px',
        borderRadius: 10,
        background: C.ink,
        color: C.surface,
        boxShadow: '0 18px 40px -18px rgb(18 16 13 / 0.6)',
        ...presence(frame, from, to, 7),
      }}
    >
      <div
        style={{
          font: `600 20px ${FONT.mono}`,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: C.leakOnInk,
        }}
      >
        ▼ {label} · {who}
      </div>
      <div
        style={{
          marginTop: 6,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 28,
        }}
      >
        <div style={{ font: `600 34px/1.2 ${FONT.ui}` }}>{what}</div>
        {amount ? (
          <div
            style={{
              flex: 'none',
              font: `600 34px ${FONT.mono}`,
              color: C.leakOnInk,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {amount}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Whether the voiceover shows as captions. The animatic has no voiceover yet, so its captions
 * say it; the final cut turns them off and ships closed captions (an SRT file) instead.
 */
export const CaptionsOn = createContext(true)

/** The voiceover as a lower third, a cue at a time: one or two lines of about 42 characters. */
export function Captions({
  scene,
  tone = 'ink',
  anchors,
}: {
  scene: Scene
  tone?: 'ink' | 'paper'
  anchors?: Partial<Record<number, number>>
}) {
  const on = useContext(CaptionsOn)
  const frame = useCurrentFrame()
  if (!on) return null
  const cue: Cue | undefined = cues(scene, { anchors }).find((c) => frame >= c.from && frame < c.to)
  if (!cue) return null
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 44 }}>
      <div
        style={{
          padding: '10px 26px 12px',
          borderRadius: 8,
          background: tone === 'ink' ? 'rgb(18 16 13 / 0.92)' : 'rgb(255 253 248 / 0.95)',
          color: tone === 'ink' ? C.surface : C.ink,
          font: `500 36px/1.3 ${FONT.ui}`,
          textAlign: 'center',
        }}
      >
        {cue.lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </AbsoluteFill>
  )
}

/**
 * A scene's voiceover: each recorded line (public/audio/vo/<scene>/<n>.wav) played where its
 * sentence goes, with the captions over it. Lines not recorded yet show as captions only.
 */
export function Voiceover({
  scene,
  tone,
  anchors,
}: {
  scene: Scene
  tone?: 'ink' | 'paper'
  anchors?: Partial<Record<number, number>>
}) {
  return (
    <>
      {lines(scene, { anchors })
        .filter((line) => line.recorded)
        .map((line) => (
          <Sequence
            key={line.sentence}
            from={Math.round(line.start * FPS)}
            durationInFrames={Math.ceil(line.seconds * FPS) + 1}
            name={`Voice: ${line.text.slice(0, 32)}`}
          >
            <Audio src={staticFile(`audio/vo/${scene.id}/${line.sentence}.wav`)} />
          </Sequence>
        ))}
      <Captions scene={scene} tone={tone} anchors={anchors} />
    </>
  )
}

/** Stands in for footage that only you can record, and says what goes there. */
export function Placeholder({ title, detail }: { title: string; detail: string }) {
  return (
    <AbsoluteFill style={{ background: C.surface, alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 1180,
          padding: '48px 56px',
          border: `3px dashed ${C.muted}`,
          borderRadius: 16,
          textAlign: 'center',
        }}
      >
        <div style={{ font: `600 22px ${FONT.mono}`, letterSpacing: '0.1em', color: C.muted }}>
          PLACEHOLDER · FOOTAGE TO RECORD
        </div>
        <div
          style={{
            marginTop: 18,
            font: `800 64px/1.05 ${FONT.display}`,
            fontVariationSettings: '"wdth" 80',
          }}
        >
          {title}
        </div>
        <div style={{ marginTop: 18, font: `400 30px/1.4 ${FONT.ui}`, color: C.muted }}>
          {detail}
        </div>
      </div>
    </AbsoluteFill>
  )
}
