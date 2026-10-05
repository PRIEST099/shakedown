import type { PersonaId } from '@shakedown/core/cast'
import { Imp } from '@shakedown/ui'
import { AbsoluteFill } from 'remotion'
import runs from './data/runs.json'
import { Wordmark } from './kit'
import { money, TOTAL } from './script'
import { C, FONT, Stage } from './theme'

/** Where each imp stands: a loose crowd, not a grid. */
const POSE: Partial<Record<PersonaId, { x: number; size: number; tilt: number }>> = {
  'double-clicker': { x: 236, size: 450, tilt: -4 },
  'cart-shuffler': { x: 574, size: 480, tilt: 2 },
  echo: { x: 926, size: 450, tilt: -2 },
  bouncer: { x: 1258, size: 460, tilt: 4 },
}
/** The receipt's torn top edge, where the imps stand. */
const EDGE = 770

/** The Devpost cover, 3:2: the customers from hell themselves, what each one cost, the total. */
export function DevpostThumbnail() {
  const lines = runs.hero.before as { personaId: PersonaId; amountCents: number }[]
  return (
    <Stage>
      <AbsoluteFill style={{ padding: '58px 72px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Wordmark size={58} />
          <div style={{ font: `600 26px ${FONT.mono}`, color: C.muted }}>
            PayPal sandbox · sandbox only
          </div>
        </div>
        <div
          style={{
            marginTop: 34,
            font: `800 196px/0.9 ${FONT.display}`,
            fontVariationSettings: '"wdth" 78',
            letterSpacing: '-0.01em',
          }}
        >
          <span style={{ background: C.highlighter, padding: '0 16px' }}>customers from hell</span>
        </div>
      </AbsoluteFill>

      {/* The bottom of the receipt they ran up, torn off: its total. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          top: EDGE,
          background: C.surface,
          filter: 'drop-shadow(0 -6px 14px rgb(18 16 13 / 0.12))',
          WebkitMask:
            'conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 50% / 28px 100%',
          mask: 'conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 50% / 28px 100%',
        }}
      >
        {lines.map((line) => (
          <div
            key={line.personaId}
            style={{
              position: 'absolute',
              top: 44,
              left: POSE[line.personaId]?.x ?? 0,
              transform: 'translateX(-50%)',
              font: `600 40px ${FONT.mono}`,
              color: C.leak,
              whiteSpace: 'nowrap',
            }}
          >
            ▼ {money(line.amountCents)}
          </div>
        ))}
        <div
          style={{
            position: 'absolute',
            left: 72,
            right: 72,
            top: 108,
            borderTop: `5px double ${C.ink}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 72,
            right: 72,
            bottom: 22,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ font: `600 30px ${FONT.mono}`, letterSpacing: '0.1em' }}>
            WOULD HAVE LEAKED
          </div>
          <div style={{ font: `600 88px/1 ${FONT.mono}`, color: C.leak, letterSpacing: '-0.03em' }}>
            {TOTAL}
          </div>
        </div>
      </div>

      {lines.map((line) => {
        const pose = POSE[line.personaId] ?? { x: 0, size: 410, tilt: 0 }
        // The imp's feet sit at 89% of its artboard: put them on the edge.
        return (
          <div
            key={line.personaId}
            style={{
              position: 'absolute',
              left: pose.x - pose.size / 2,
              top: EDGE + 14 - pose.size * 0.89,
              width: pose.size,
              height: pose.size,
              transform: `rotate(${pose.tilt}deg)`,
              transformOrigin: '50% 89%',
            }}
          >
            <Imp persona={line.personaId} state="leak" />
          </div>
        )
      })}
    </Stage>
  )
}
