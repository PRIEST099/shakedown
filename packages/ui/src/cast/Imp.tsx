import { getPersona, type PersonaId } from '@shakedown/core/cast'
import { motion } from '@shakedown/tokens'
import { useId } from 'react'
import { ease, seededRandom, springAt, windowProgress } from '../timeline'
import { COSTUMES } from './costumes'
import {
  BODY_PATH,
  DEFAULT_ARMS,
  HORN_LEFT,
  HORN_RIGHT,
  type ImpState,
  LEGS,
  TAIL_PATH,
  TAIL_TIP,
} from './geometry'
import { CardPattern } from './patterns'

export interface ImpProps {
  persona: PersonaId
  state?: ImpState
  /** Ambient clock in ms: breathing, blinking, the tail, signature moves. */
  t?: number
  /** Ms since the state last changed: the horn pop (leak) or droop (sealed). */
  stateT?: number
  /** Draw the persona's trading-card pattern behind the imp. */
  background?: boolean
  className?: string
}

type Mood = 'smirk' | 'grin' | 'sulk' | 'unsure'

const MOOD: Record<ImpState, Mood> = {
  idle: 'smirk',
  running: 'smirk',
  leak: 'grin',
  sealed: 'sulk',
  inconclusive: 'unsure',
}

const BROWS: Record<Mood, readonly [string, string]> = {
  smirk: ['M93 106 Q103 101 113 106', 'M127 104 Q137 97 147 101'],
  grin: ['M92 102 Q103 95 114 101', 'M126 101 Q137 95 148 102'],
  sulk: ['M93 103 Q103 108 113 110', 'M127 110 Q137 108 147 103'],
  unsure: ['M94 106 L113 106', 'M127 102 Q137 96 147 101'],
}

function Mouth({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'grin':
      return <path className="sd-imp__ink" d="M100 146 Q120 174 140 146 Q120 156 100 146 Z" />
    case 'sulk':
      return <path className="sd-imp__line" d="M107 161 Q120 151 133 161" />
    case 'unsure':
      return <path className="sd-imp__line" d="M108 156 L133 153" />
    default:
      return <path className="sd-imp__line" d="M106 151 Q121 160 136 146" />
  }
}

function Mitten({ x, y, flip }: { x: number; y: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}`}>
      <circle className="sd-imp__glove" cx="-7" cy="-5" r="4" />
      <circle className="sd-imp__glove" r="9" />
    </g>
  )
}

/** Deterministic blink, roughly every 3–5 s for 120 ms, seeded per persona. */
function isBlinking(t: number, seed: number): boolean {
  const rand = seededRandom(seed * 7919)
  let start = 1200 + rand() * 2000
  while (start <= t) {
    if (t < start + 120) return true
    start += 3000 + rand() * 2000
  }
  return false
}

/** The imp rig. Fully controlled: render it at any `t` and get the same frame (web or video). */
export function Imp({
  persona,
  state = 'idle',
  t = 0,
  stateT = 10_000,
  background = false,
  className,
}: ImpProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const { number } = getPersona(persona)
  const costume = COSTUMES[persona]
  const arms = costume.arms ?? DEFAULT_ARMS
  const mood = MOOD[state]
  const ctx = { state, t }

  const breathe = 1 + 0.02 * Math.sin((2 * Math.PI * t) / 2400 + number)
  const tailSway = 4 * Math.sin((2 * Math.PI * t) / 3100 + number * 1.7)
  const blinking = isBlinking(t, number)
  const hornScale = state === 'leak' ? 0.7 + 0.3 * springAt(stateT, motion.spring.stamp) : 1
  const droop = state === 'sealed' ? ease.standard(windowProgress(stateT, 0, motion.ms.md)) : 0
  const hornTone = state === 'leak' ? 'leak' : state === 'sealed' ? 'sealed' : 'idle'
  const eyeRy = blinking ? 1.6 : 11.5
  const [browLeft, browRight] = BROWS[mood]
  const [armLeft, armRight] = arms

  const horn = (d: string, cx: number, angle: number) => (
    <g
      transform={`rotate(${angle.toFixed(2)} ${cx} 84) translate(${cx} 84) scale(${hornScale.toFixed(4)}) translate(${-cx} -84)`}
    >
      <path className={`sd-imp__horn sd-imp__horn--${hornTone}`} d={d} />
    </g>
  )

  return (
    <svg
      viewBox="0 0 240 240"
      className={['sd-imp', `sd-imp--${state}`, className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <defs>
        <pattern id={`${uid}-dots`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle className="sd-imp__ink" cx="3" cy="3" r="1.15" />
        </pattern>
        <clipPath id={`${uid}-body`}>
          <path d={BODY_PATH} />
        </clipPath>
      </defs>

      {background ? <CardPattern persona={persona} /> : null}
      <ellipse className="sd-imp__ground" cx="120" cy="214" rx="54" ry="7" />
      {costume.back?.(ctx)}

      <g transform={`rotate(${tailSway.toFixed(2)} 164 170)`}>
        <path className="sd-imp__line" d={TAIL_PATH} />
        <path className="sd-imp__ink" d={TAIL_TIP} />
      </g>

      {LEGS.map((d) => (
        <path key={d} className="sd-imp__line" d={d} />
      ))}
      <ellipse className="sd-imp__shoe" cx="93" cy="209" rx="11" ry="6.5" />
      <ellipse className="sd-imp__shoe" cx="147" cy="209" rx="11" ry="6.5" />

      <g transform={`translate(120 192) scale(1 ${breathe.toFixed(4)}) translate(-120 -192)`}>
        {horn(HORN_LEFT, 104, -28 * droop)}
        {horn(HORN_RIGHT, 136, 28 * droop)}
        <path className="sd-imp__body" d={BODY_PATH} />
        <g clipPath={`url(#${uid}-body)`}>
          <ellipse
            className="sd-imp__shade"
            cx="162"
            cy="152"
            rx="42"
            ry="58"
            fill={`url(#${uid}-dots)`}
          />
        </g>
        <path className="sd-imp__outline" d={BODY_PATH} />

        <ellipse className="sd-imp__ink" cx="104" cy="126" rx="8.5" ry={eyeRy} />
        <ellipse className="sd-imp__ink" cx="136" cy="126" rx="8.5" ry={eyeRy} />
        {blinking ? null : (
          <>
            <circle className="sd-imp__catchlight" cx="106.5" cy="121" r="2.6" />
            <circle className="sd-imp__catchlight" cx="138.5" cy="121" r="2.6" />
          </>
        )}
        <path className="sd-imp__line" d={browLeft} />
        <path className="sd-imp__line" d={browRight} />
        <Mouth mood={mood} />
        {costume.face?.(ctx)}
      </g>

      <path className="sd-imp__line" d={armLeft.d} />
      <path className="sd-imp__line" d={armRight.d} />
      <Mitten x={armLeft.hand[0]} y={armLeft.hand[1]} flip={armLeft.flip} />
      <Mitten x={armRight.hand[0]} y={armRight.hand[1]} flip={armRight.flip} />
      {costume.front?.(ctx)}
    </svg>
  )
}
