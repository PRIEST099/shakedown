import type { PersonaId } from '@shakedown/core/cast'
import type { ReactNode } from 'react'
import { type Arm, BODY_PATH, type ImpState } from './geometry'

export interface CostumeContext {
  state: ImpState
  /** Ambient clock in ms. */
  t: number
}

export interface Costume {
  arms?: readonly [Arm, Arm]
  /** Drawn behind the imp. */
  back?: (ctx: CostumeContext) => ReactNode
  /** Drawn on the face, inside the breathing group. */
  face?: (ctx: CostumeContext) => ReactNode
  /** Drawn in front of everything. */
  front?: (ctx: CostumeContext) => ReactNode
}

function Receipt({ x, y, accent }: { x: number; y: number; accent?: boolean }) {
  const d = `M${x} ${y} L${x + 26} ${y} L${x + 26} ${y + 30} L${x + 22} ${y + 34} L${x + 18} ${y + 30} L${x + 13} ${y + 34} L${x + 8} ${y + 30} L${x + 4} ${y + 34} L${x} ${y + 30} Z`
  return (
    <g>
      <path className={accent ? 'sd-imp__accent' : 'sd-imp__paper'} d={d} />
      <path
        className="sd-imp__thin"
        d={`M${x + 5} ${y + 8} L${x + 21} ${y + 8} M${x + 5} ${y + 15} L${x + 18} ${y + 15} M${x + 5} ${y + 22} L${x + 21} ${y + 22}`}
      />
    </g>
  )
}

/** Each costume is a prop layer on the shared rig. No masks, crowbars, money bags or logos. */
export const COSTUMES: Record<PersonaId, Costume> = {
  // 01 · An oversized cursor and a ghosted duplicate of itself.
  'double-clicker': {
    arms: [
      { d: 'M74 142 C60 148 54 160 52 170', hand: [51, 174] },
      { d: 'M166 138 C181 128 187 114 186 100', hand: [186, 96], flip: true },
    ],
    back: () => <path className="sd-imp__ghost" d={BODY_PATH} transform="translate(13 -9)" />,
    front: ({ state, t }) => {
      const tap = state === 'running' && Math.sin(t / 90) > 0.6
      return (
        <g>
          <path
            className="sd-imp__accent"
            d="M176 44 L176 82 L185 74 L191 88 L197 85 L191 71 L203 71 Z"
            transform={tap ? 'translate(1 2)' : undefined}
          />
          <path className="sd-imp__line" d="M168 40 L162 34 M176 35 L176 27 M184 40 L190 34" />
        </g>
      )
    },
  },

  // 02 · A tiny cart and two boxes caught mid-swap.
  'cart-shuffler': {
    arms: [
      { d: 'M74 144 C62 152 58 162 58 172', hand: [58, 176] },
      { d: 'M166 146 C178 152 186 158 192 160', hand: [195, 161], flip: true },
    ],
    front: ({ state, t }) => {
      const swap = state === 'running' ? (Math.sin(t / 260) + 1) / 2 : 0
      const lift = Math.sin(swap * Math.PI) * 10
      return (
        <g>
          <path className="sd-imp__line" d="M195 161 L208 157" />
          <path className="sd-imp__paper" d="M152 166 L214 166 L206 196 L160 196 Z" />
          <path
            className="sd-imp__thin"
            d="M157 176 L211 176 M160 186 L208 186 M176 166 L178 196 M191 166 L191 196 M204 166 L201 196"
          />
          <circle className="sd-imp__paper" cx="168" cy="205" r="5" />
          <circle className="sd-imp__paper" cx="198" cy="205" r="5" />
          <rect
            className="sd-imp__accent"
            x={160 + 28 * swap}
            y={132 - 8 * swap - lift}
            width="20"
            height="20"
            rx="2"
          />
          <rect
            className="sd-imp__paper"
            x={188 - 28 * swap}
            y={124 + 8 * swap - lift}
            width="20"
            height="20"
            rx="2"
          />
          <path className="sd-imp__line" d="M168 116 Q184 100 200 110" />
          <path className="sd-imp__line" d="M194 104 L200 110 L192 113" />
        </g>
      )
    },
  },

  // 03 · A megaphone and three late "paid" bubbles.
  echo: {
    arms: [
      { d: 'M74 142 C60 148 54 160 52 170', hand: [51, 174] },
      { d: 'M166 136 C180 130 186 120 186 110', hand: [186, 106], flip: true },
    ],
    front: ({ state, t }) => {
      const bubbles = [
        { key: 'a', x: 168, y: 34, w: 42, s: 1, delay: 0 },
        { key: 'b', x: 196, y: 58, w: 36, s: 0.85, delay: 300 },
        { key: 'c', x: 148, y: 12, w: 34, s: 0.7, delay: 600 },
      ]
      return (
        <g>
          <path className="sd-imp__paper" d="M180 103 L206 88 L210 122 L184 114 Z" />
          <ellipse className="sd-imp__paper" cx="208" cy="105" rx="5" ry="17" />
          {bubbles.map((b, i) => {
            const pop = state === 'running' ? ((t + b.delay) % 1200) / 1200 : 1
            const scale = b.s * (0.85 + 0.15 * Math.min(1, pop * 3))
            return (
              <g key={b.key} transform={`translate(${b.x} ${b.y}) scale(${scale.toFixed(3)})`}>
                <rect
                  className={i === 0 ? 'sd-imp__accent' : 'sd-imp__paper'}
                  width={b.w}
                  height="18"
                  rx="9"
                />
                <text className="sd-imp__text" x={b.w / 2} y="12.5" textAnchor="middle">
                  paid
                </text>
              </g>
            )
          })}
        </g>
      )
    },
  },

  // 04 · A blank card balanced on a bouncy ball.
  bouncer: {
    arms: [
      { d: 'M76 136 C62 124 58 110 60 98', hand: [60, 94] },
      { d: 'M164 136 C178 124 182 110 180 98', hand: [180, 94], flip: true },
    ],
    front: ({ state, t }) => {
      const bounce = state === 'running' ? Math.abs(Math.sin(t / 220)) * 10 : 0
      return (
        <g transform={`translate(0 ${(-bounce).toFixed(2)})`}>
          <circle className="sd-imp__accent" cx="196" cy="196" r="18" />
          <path className="sd-imp__thin" d="M179 192 Q196 184 213 192" />
          <g transform="rotate(-12 196 168)">
            <rect className="sd-imp__paper" x="178" y="158" width="36" height="23" rx="3" />
            <path className="sd-imp__thin" d="M178 165 L214 165" />
          </g>
        </g>
      )
    },
  },

  // 05 · Round glasses, a very long scroll and a highlighter.
  'policy-lawyer': {
    arms: [
      { d: 'M74 144 C64 154 68 162 80 166', hand: [83, 166] },
      { d: 'M166 144 C176 154 172 162 160 166', hand: [157, 166], flip: true },
    ],
    face: () => (
      <g>
        <circle className="sd-imp__lens" cx="104" cy="126" r="15" />
        <circle className="sd-imp__lens" cx="136" cy="126" r="15" />
        <path className="sd-imp__line" d="M119 125 Q120 121 121 125" />
      </g>
    ),
    front: () => (
      <g>
        <path className="sd-imp__paper" d="M88 168 L152 168 L149 228 L91 228 Z" />
        <rect className="sd-imp__swipe" x="95" y="193" width="44" height="9" rx="1" />
        <path className="sd-imp__thin" d="M97 182 L143 182 M97 198 L141 198 M97 214 L139 214" />
        <rect className="sd-imp__paper" x="80" y="160" width="80" height="12" rx="6" />
        <g transform="rotate(35 172 150)">
          <rect className="sd-imp__accent" x="166" y="132" width="10" height="30" rx="2" />
          <path className="sd-imp__thin" d="M166 141 L176 141" />
        </g>
      </g>
    ),
  },

  // 06 · A doctor's head mirror (the pun) and two identical receipts.
  'second-opinion': {
    arms: [
      { d: 'M76 140 C62 130 58 118 60 106', hand: [60, 102] },
      { d: 'M164 140 C178 130 182 118 180 106', hand: [180, 102], flip: true },
    ],
    face: () => (
      <g>
        <path className="sd-imp__band" d="M78 100 Q120 76 162 100" />
        <circle className="sd-imp__paper" cx="120" cy="84" r="12" />
        <circle className="sd-imp__thin" cx="120" cy="84" r="6" />
        <path className="sd-imp__shine" d="M113 80 Q116 75 122 76" />
      </g>
    ),
    front: () => (
      <g>
        <Receipt x={40} y={60} />
        <Receipt x={172} y={60} accent />
      </g>
    ),
  },
}
