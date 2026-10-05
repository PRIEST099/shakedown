import { getPersona, type PersonaId } from '@shakedown/core/cast'
import { formatCents, PersonaCard } from '@shakedown/ui'
import type { ReactNode } from 'react'
import {
  AbsoluteFill,
  Freeze,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import runs from './data/runs.json'
import { type Box, formatRate, markOf, Tag, useTake } from './footage'
import { Wordmark } from './kit'
import { FPS, POLICY_EXCESS, TOTAL } from './script'
import { TeaserScore } from './sound'
import { C, FONT, presence, Stage } from './theme'
import { teaserCut } from './timeline'

export const TEASER_FRAMES = 40 * FPS

/** Where the receipt's centre sits in the vertical frame: below the type at the top. */
const RECEIPT_Y = 1175

/**
 * A 16:9 take, cropped to the receipt and fitted to the vertical frame's width. The margin is
 * tight enough that the customer list beside the receipt stays out of frame.
 */
function Crop({ box, from, to, rate = 1 }: { box?: Box; from: number; to: number; rate?: number }) {
  const { width, height } = useVideoConfig()
  const area = box ?? { x: 1030, y: 407, width: 482, height: 478 }
  const scale = width / (area.width + 48)
  return (
    <AbsoluteFill
      style={{
        background: C.paper,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 1920,
          height: 1080,
          position: 'relative',
          flex: 'none',
          transform: `translateY(${RECEIPT_Y - height / 2}px) scale(${scale}) translate(${960 - (area.x + area.width / 2)}px, ${540 - (area.y + area.height / 2)}px)`,
        }}
      >
        <OffthreadVideo
          src={staticFile('footage/live-run.mp4')}
          trimBefore={Math.round(from * FPS)}
          trimAfter={Math.round(to * FPS)}
          playbackRate={rate}
          muted
          style={{ width: 1920, height: 1080 }}
        />
      </div>
    </AbsoluteFill>
  )
}

/** Paper behind the type at the top, so it reads over the footage. */
const Veil = () => (
  <AbsoluteFill
    style={{
      background:
        'linear-gradient(180deg, rgb(244 239 230) 0%, rgb(244 239 230) 31%, transparent 34.5%)',
    }}
  />
)

/** Big type for the vertical cut, burned in: most people watch these with the sound off. */
function Say({
  from,
  to,
  children,
  color = C.ink,
  size = 92,
  top = 230,
}: {
  from: number
  to: number
  children: ReactNode
  color?: string
  size?: number
  top?: number
}) {
  const frame = useCurrentFrame()
  if (frame < from - 1 || frame > to + 1) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: 90,
        right: 90,
        top,
        font: `800 ${size}px/1.02 ${FONT.display}`,
        fontVariationSettings: '"wdth" 78',
        color,
        ...presence(frame, from, to),
      }}
    >
      {children}
    </div>
  )
}

const CAST: PersonaId[] = ['double-clicker', 'cart-shuffler', 'echo', 'bouncer', 'policy-lawyer']
const ASK: Record<string, string> = {
  'double-clicker': 'Paid twice?',
  'cart-shuffler': 'Cart changed after approval?',
  echo: 'Same payment event, twice?',
  bouncer: 'Declined card, still shipped?',
  'policy-lawyer': '“Just this once?”',
}
const LEAKED: Record<string, number> = {
  ...Object.fromEntries(runs.hero.before.map((line) => [line.personaId, line.amountCents])),
  'policy-lawyer': -Math.round(Number(POLICY_EXCESS.replace(/[^0-9.]/g, '')) * 100),
}

/** The 40-second vertical teaser: the receipt, the total, the cast, the seal, the name. */
export function Teaser() {
  const take = useTake('live-run')
  const frame = useCurrentFrame()
  if (!take) return <Stage />
  const cut = teaserCut(take)
  const hook = cut.hook.cut[0]
  const tape = markOf(take, 'run-done')?.box
  const sealedTape = markOf(take, 'rerun-sealed')?.box ?? tape
  const sealed = cut.seal.reduce((sum, segment) => sum + segment.frames, 0)
  const sealIn = cut.sealedFrame - cut.sealAt
  return (
    <Stage>
      <Sequence durationInFrames={cut.totalAt}>
        {hook ? <Crop box={tape} from={hook.from} to={hook.to} rate={hook.rate} /> : null}
        <Veil />
        <Tag text={`LIVE · PayPal sandbox · ${formatRate(hook?.rate ?? 1)} speed`} />
        <Say from={4} to={64}>
          Every test passed.
        </Say>
        <Say from={64} to={cut.totalAt}>
          Then the customers from hell showed up.
        </Say>
      </Sequence>
      <Sequence from={cut.totalAt} durationInFrames={cut.castAt - cut.totalAt}>
        <Freeze frame={0}>
          <Crop box={tape} from={cut.hook.settled} to={cut.hook.settled + 1} />
        </Freeze>
        <Veil />
        <Tag text="LIVE · PayPal sandbox" />
        <Say from={0} to={cut.castAt - cut.totalAt} color={C.leak}>
          <span style={{ font: `600 176px/1 ${FONT.mono}`, letterSpacing: '-0.04em' }}>
            {TOTAL}
          </span>
        </Say>
      </Sequence>
      <Sequence from={cut.castAt} durationInFrames={cut.sealAt - cut.castAt}>
        <AbsoluteFill style={{ background: C.ink }} />
        {CAST.map((id, i) => (
          <Sequence key={id} from={i * cut.card} durationInFrames={cut.card}>
            <AbsoluteFill style={{ alignItems: 'center', paddingTop: 470 }}>
              <div
                style={{
                  width: 700,
                  ...presence(frame - cut.castAt - i * cut.card, 0, cut.card, 6),
                }}
              >
                <PersonaCard
                  persona={id}
                  state="leak"
                  amountCents={LEAKED[id] ?? 0}
                  t={(frame / FPS) * 1000}
                  stateT={1200}
                />
              </div>
              <div
                style={{
                  marginTop: 46,
                  textAlign: 'center',
                  ...presence(frame - cut.castAt - i * cut.card, 10, cut.card, 6),
                }}
              >
                <div style={{ font: `600 120px/1 ${FONT.mono}`, color: C.leakOnInk }}>
                  {formatCents(LEAKED[id] ?? 0)}
                </div>
                <div style={{ marginTop: 14, font: `500 40px ${FONT.ui}`, color: C.paper }}>
                  {id === 'policy-lawyer' ? 'past the written policy' : 'would have leaked'}
                </div>
              </div>
            </AbsoluteFill>
            <Say from={2} to={cut.card - 2} color={C.paper} size={80} top={250}>
              {getPersona(id).name}: {ASK[id]}
            </Say>
          </Sequence>
        ))}
      </Sequence>
      {cut.seal.map((segment) => (
        <Sequence
          key={segment.start}
          from={cut.sealAt + segment.start}
          durationInFrames={segment.frames}
        >
          <Crop box={sealedTape} from={segment.from} to={segment.to} rate={segment.rate} />
          <Veil />
          <Tag
            text={
              segment.rate > 1
                ? `LIVE · PayPal sandbox · ${formatRate(segment.rate)} speed`
                : 'LIVE · PayPal sandbox'
            }
          />
        </Sequence>
      ))}
      <Sequence from={cut.sealAt + sealed} durationInFrames={cut.endAt - cut.sealAt - sealed}>
        <Freeze frame={0}>
          <Crop box={sealedTape} from={cut.sealSettled} to={cut.sealSettled + 1} />
        </Freeze>
        <Veil />
        <Tag text="LIVE · PayPal sandbox" />
      </Sequence>
      <Sequence from={cut.sealAt} durationInFrames={cut.endAt - cut.sealAt}>
        <Say from={2} to={sealIn}>
          Fix. Re-run, same seed.
        </Say>
        <Say from={sealIn} to={cut.endAt - cut.sealAt} color={C.sealed}>
          Sealed at {formatCents(0)}.
        </Say>
      </Sequence>
      <Sequence from={cut.endAt}>
        <AbsoluteFill
          style={{
            background: C.ink,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 44,
            padding: '0 90px',
            textAlign: 'center',
          }}
        >
          <Wordmark size={130} color={C.paper} />
          <div
            style={{
              color: C.paper,
              font: `800 84px/1.05 ${FONT.display}`,
              fontVariationSettings: '"wdth" 80',
            }}
          >
            Let the customers from hell find your leaks first.
          </div>
          <div style={{ color: C.sealedOnInk, font: `600 40px ${FONT.mono}` }}>
            PayPal sandbox only
          </div>
        </AbsoluteFill>
      </Sequence>
      <TeaserScore />
    </Stage>
  )
}
