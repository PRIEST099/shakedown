import { type RunLine, Tape } from '@shakedown/ui'
import { AbsoluteFill } from 'remotion'
import runs from './data/runs.json'
import { Wordmark } from './kit'
import { TOTAL } from './script'
import { C, FONT, Stage } from './theme'

/** The YouTube thumbnail and Devpost cover: the total, the hook, the receipt. Legible at 320 px. */
export function Thumbnail() {
  const leaked = runs.hero.before.reduce((sum, line) => sum + line.amountCents, 0)
  return (
    <Stage>
      <AbsoluteFill style={{ padding: '96px 0 90px 110px', justifyContent: 'space-between' }}>
        <Wordmark size={84} />
        <div>
          <div
            style={{
              font: `600 216px/0.9 ${FONT.mono}`,
              color: C.leak,
              letterSpacing: '-0.04em',
            }}
          >
            {TOTAL}
          </div>
          <div
            style={{
              marginTop: 34,
              font: `800 118px/0.95 ${FONT.display}`,
              fontVariationSettings: '"wdth" 78',
            }}
          >
            <span style={{ background: C.highlighter, padding: '0 14px' }}>
              customers from hell
            </span>
          </div>
        </div>
        <div style={{ font: `600 38px ${FONT.mono}`, color: C.muted }}>
          PayPal sandbox · test your own checkout
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          right: 96,
          top: 150,
          width: 440,
          transform: 'rotate(4deg) scale(1.3)',
          transformOrigin: 'top right',
        }}
      >
        <Tape
          meta={`Sandbox · ${runs.hero.store}`}
          lines={runs.hero.before as RunLine[]}
          total={{ fromCents: 0, toCents: leaked, progress: 1 }}
          tone="leak"
        />
      </div>
    </Stage>
  )
}
