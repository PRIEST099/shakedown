import { getPersona, type PersonaId } from '@shakedown/core/cast'
import { formatCents, PersonaCard } from '@shakedown/ui'
import type { ReactNode } from 'react'
import { AbsoluteFill, Freeze, Sequence, useCurrentFrame } from 'remotion'
import runs from './data/runs.json'
import { type CameraKey, Footage, Highlight, useTake } from './footage'
import { Callout, Line, Mark, Placeholder, Swipe, Voiceover, Wordmark } from './kit'
import {
  framesOf,
  LEAKS,
  money,
  POLICY_EXCESS,
  phraseAt,
  SCENES,
  type SceneId,
  sentenceAt,
  TOTAL,
  WORST,
} from './script'
import { C, FONT, presence, ramp, Stage } from './theme'
import {
  anchorsFor,
  type Box,
  CLOSE_CARD,
  FIX_HOLD,
  fixCut,
  hookCut,
  leaksOf,
  lengthOf,
  linesOf,
  liveCut,
  markAt,
  markOf,
  type Placed,
  PROOF_DASHBOARD,
  storeCut,
  type Take,
  type TakeName,
} from './timeline'

const FPS = 30
const s = (seconds: number) => Math.round(seconds * FPS)
const scene = (id: SceneId) => SCENES.find((x) => x.id === id) ?? SCENES[0]

// ---------- the split layout: plain words on ink at left, the live receipt at right ----------

const PANEL = 900
const RIGHT_TAG = { left: PANEL + 36, top: 36 }
const RECEIPT_SCALE = 1.75
/** The receipt, zoomed, its left edge just clear of the panel so nothing beside it peeks out. */
const receiptView = (box: Box): Omit<CameraKey, 'at'> => ({
  box,
  scale: RECEIPT_SCALE,
  center: { x: PANEL + 40 + (box.width * RECEIPT_SCALE) / 2, y: 545 },
})

/** The middle of the frame right of the panel, where split-layout footage centres what it shows. */
const RIGHT = { x: PANEL + (1920 - PANEL) / 2, y: 540 }

/** The smallest box holding both. */
const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

/** The ink panel of the split layout, sliding in from the left at frame `at`. */
function Panel({ at = 0, children }: { at?: number; children: ReactNode }) {
  const frame = useCurrentFrame()
  const t = at <= 0 ? 1 : ramp(frame, at, at + 18)
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: PANEL,
        boxSizing: 'border-box',
        padding: '120px 64px 0 88px',
        background: C.ink,
        color: C.paper,
        transform: `translateX(${((t - 1) * PANEL).toFixed(1)}px)`,
      }}
    >
      {children}
    </div>
  )
}

/** A small mono label on the ink panel. */
const Eyebrow = ({ children, color = C.mutedOnInk }: { children: ReactNode; color?: string }) => (
  <div
    style={{
      font: `600 20px ${FONT.mono}`,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color,
    }}
  >
    {children}
  </div>
)

/** A speed-ramped clip: consecutive segments of one take, each tagged with its own speed. */
function Ramped({
  take,
  cut,
  camera = [],
  tag,
  tagAt,
  veil,
  cursor,
  children,
}: {
  take: TakeName
  cut: readonly Placed[]
  camera?: readonly CameraKey[]
  tag: string
  tagAt?: (segment: Placed) => { left: number; top: number } | undefined
  veil?: (segment: Placed) => number | undefined
  cursor?: boolean
  children?: (ms: number) => ReactNode
}) {
  return (
    <>
      {cut.map((segment) => (
        <Sequence key={segment.start} from={segment.start} durationInFrames={segment.frames}>
          <Footage
            take={take}
            from={segment.from}
            to={segment.to}
            rate={segment.rate}
            tag={tag}
            tagAt={tagAt?.(segment)}
            veil={veil?.(segment)}
            cursor={cursor}
            camera={camera.map((key) => ({ ...key, at: key.at - segment.start }))}
          >
            {children}
          </Footage>
        </Sequence>
      ))}
    </>
  )
}

/** A frame of a take held still, the camera already where it was going. */
function Held({
  take,
  at,
  view,
  tag,
  tagAt,
  veil,
}: {
  take: TakeName
  at: number
  view?: Omit<CameraKey, 'at'>
  tag: string
  tagAt?: { left: number; top: number }
  veil?: number
}) {
  return (
    <Freeze frame={0}>
      <Footage
        take={take}
        from={at}
        to={at + 1}
        tag={tag}
        tagAt={tagAt}
        veil={veil}
        cursor={false}
        camera={view ? [{ ...view, at: 0, frames: 0 }] : []}
      />
    </Freeze>
  )
}

/** What each broken check means, in a few plain words: what the panel says beside the receipt. */
const BROKE: Record<string, string> = {
  'One checkout is charged once, however often Pay is pressed': 'Pressed Pay twice: charged twice',
  'A retried capture never ships twice': 'Retried the payment: shipped twice',
  'Goods shipped are never worth more than PayPal captured': 'Shipped more than PayPal captured',
  'An unverified webhook never releases goods': 'An unsigned “paid” event released the goods',
  'The same event ID is acted on exactly once': 'The same payment event, acted on twice',
  'A late event never reverses a newer one': 'A late payment event undid the refund',
  'A declined card never ships anything': 'A declined card, and the order shipped',
}

/** Each customer's fix, condensed from its findings' `fix` text (packages/core/src/personas). */
const FIXED: Record<string, string> = {
  'double-clicker': 'One PayPal-Request-Id per order and per capture',
  'cart-shuffler': 'Price on the server; check the capture before shipping',
  echo: 'Verify signatures; act on each event once, in order',
  bouncer: 'Ship only once the capture is COMPLETED',
}

const nameOf = (persona: string) => getPersona(persona as PersonaId).name

// ---------- S1 ----------

/** S1, the cold open: the receipt printing red at speed, then what it adds up to. */
export function Hook() {
  const take = useTake('live-run')
  // Frames wait for the take (delayRender), so nothing is captured before it loads.
  if (!take) return <Stage tone="ink" />
  const { cut, land, settled } = hookCut(take)
  const tape = markOf(take, 'run-done')?.box
  const view = tape ? receiptView(tape) : undefined
  const hook = scene('hook')
  const second = sentenceAt(hook, 1)
  return (
    <Stage tone="ink">
      <Sequence durationInFrames={land}>
        <Ramped
          take="live-run"
          cut={cut}
          camera={view ? [{ ...view, at: 0, frames: 0 }] : []}
          tag="LIVE · PayPal sandbox"
          tagAt={() => RIGHT_TAG}
          veil={() => PANEL}
          cursor={false}
        />
      </Sequence>
      <Sequence from={land}>
        <Held
          take="live-run"
          at={settled}
          view={view}
          tag="LIVE · PayPal sandbox"
          tagAt={RIGHT_TAG}
          veil={PANEL}
        />
      </Sequence>
      <Panel>
        <div style={{ position: 'absolute', left: 88, right: 64, top: 300 }}>
          <Line from={4} to={second - 3} size={92} color={C.paper}>
            Every happy-path test passes.
          </Line>
        </div>
        <div style={{ position: 'absolute', left: 88, right: 64, top: 300 }}>
          <Line from={second} to={land - 4} size={92} color={C.paper}>
            Then the{' '}
            <Swipe at={second + 16} tone="ink">
              customers from hell
            </Swipe>{' '}
            show up.
          </Line>
        </div>
        <div style={{ position: 'absolute', left: 88, right: 64, top: 330 }}>
          <Line from={land} to={framesOf(hook) + 4} size={40} color={C.paper}>
            <div
              style={{
                font: `600 150px/1 ${FONT.mono}`,
                color: C.leakOnInk,
                letterSpacing: '-0.03em',
              }}
            >
              {TOTAL}
            </div>
            <div style={{ marginTop: 26, font: `500 44px/1.2 ${FONT.ui}` }}>
              would have leaked in one sandbox run.
            </div>
          </Line>
        </div>
      </Panel>
      <Voiceover scene={hook} />
    </Stage>
  )
}

// ---------- S2 ----------

function Glyph({ kind }: { kind: 'double' | 'cart' | 'echo' | 'chat' }) {
  const stroke = {
    fill: 'none',
    stroke: C.paper,
    strokeWidth: 2.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const
  return (
    <svg viewBox="0 0 48 48" width={84} height={84}>
      <title>{kind}</title>
      {kind === 'double' ? (
        <>
          <path d="M10 8 L10 30 L16 25 L20 35 L24 33 L20 23 L28 23 Z" {...stroke} />
          <path d="M22 4 L22 26 L28 21 L32 31 L36 29 L32 19 L40 19 Z" {...stroke} opacity={0.55} />
        </>
      ) : kind === 'cart' ? (
        <>
          <path d="M6 10 H12 L17 32 H38 L42 16 H14" {...stroke} />
          <circle cx="20" cy="39" r="3" {...stroke} />
          <circle cx="35" cy="39" r="3" {...stroke} />
          <path d="M24 4 H36 L33 1 M36 4 L33 7" {...stroke} />
        </>
      ) : kind === 'echo' ? (
        <>
          <circle cx="24" cy="24" r="4" {...stroke} />
          <circle cx="24" cy="24" r="11" {...stroke} opacity={0.7} />
          <circle cx="24" cy="24" r="18" {...stroke} opacity={0.4} />
        </>
      ) : (
        <>
          <path d="M6 10 H30 V26 H16 L10 32 V26 H6 Z" {...stroke} />
          <path d="M20 20 H42 V36 H38 V42 L32 36 H20 Z" {...stroke} opacity={0.7} />
        </>
      )}
    </svg>
  )
}

/** S2, the problem: the customers nobody's happy path is written for, one per sentence. */
export function Problem() {
  const frame = useCurrentFrame()
  const problem = scene('problem')
  const at = (i: number) => sentenceAt(problem, i)
  const lines: { kind: 'double' | 'cart' | 'echo' | 'chat'; text: string; at: number }[] = [
    { kind: 'double', text: 'Real customers double-click.', at: at(0) },
    { kind: 'cart', text: 'They change the cart after approving it.', at: at(1) },
    { kind: 'echo', text: 'Payment events arrive twice, late, or unsigned.', at: at(2) },
    { kind: 'chat', text: 'They argue with your AI support agent.', at: at(3) },
  ]
  const verdict = at(4)
  return (
    <Stage tone="ink">
      <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 170, gap: 34 }}>
        {lines.map((line) => (
          <div
            key={line.text}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 34,
              ...presence(frame, line.at, verdict - 4),
            }}
          >
            <Glyph kind={line.kind} />
            <span
              style={{ font: `800 66px/1 ${FONT.display}`, fontVariationSettings: '"wdth" 82' }}
            >
              {line.text}
            </span>
          </div>
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Line from={verdict} to={framesOf(problem) + 4} size={104} color={C.paper}>
          Happy-path tests{' '}
          <Swipe at={verdict + 14} tone="ink">
            never meet them.
          </Swipe>
        </Line>
      </AbsoluteFill>
      <Voiceover scene={problem} tone="paper" />
    </Stage>
  )
}

// ---------- S3 ----------

/** S3, meet Shakedown: the name, the promise, then the real site. */
export function Meet() {
  const frame = useCurrentFrame()
  const meet = scene('meet')
  const site = sentenceAt(meet, 1) - 6
  const mark = ramp(frame, 30, 60)
  return (
    <Stage>
      <Sequence durationInFrames={site}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 40 }}>
          <div style={{ font: `500 34px ${FONT.ui}`, color: C.muted, ...presence(frame, 4, site) }}>
            A shakedown cruise is a ship’s test voyage before passengers board.
          </div>
          <div style={{ opacity: mark, transform: `scale(${0.92 + 0.08 * mark})` }}>
            <Wordmark size={170} />
          </div>
          <div
            style={{
              padding: '14px 26px',
              borderRadius: 999,
              border: `2px solid ${C.ink}`,
              font: `600 30px ${FONT.mono}`,
              ...presence(frame, 90, site),
            }}
          >
            Sandbox only · your own integration
          </div>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={site}>
        <Footage
          take="landing"
          from={0.4}
          to={7.2}
          tag="LIVE · the Shakedown site"
          cursor={false}
        />
      </Sequence>
      <Voiceover scene={meet} />
    </Stage>
  )
}

// ---------- S4 ----------

const CAST: { id: PersonaId; line: string; amountCents: number }[] = [
  {
    id: 'double-clicker',
    line: 'Presses Pay twice. Charged once?',
    amountCents: runs.hero.before[0]?.amountCents ?? 0,
  },
  {
    id: 'cart-shuffler',
    line: 'Changes the cart after approval. Shipped what was paid?',
    amountCents: runs.hero.before[1]?.amountCents ?? 0,
  },
  {
    id: 'echo',
    line: 'Replays payment events. Acted on once, and only if signed?',
    amountCents: runs.hero.before[2]?.amountCents ?? 0,
  },
  {
    id: 'bouncer',
    line: 'Pays with a card that bounces. Nothing shipped?',
    amountCents: runs.hero.before[3]?.amountCents ?? 0,
  },
  {
    id: 'policy-lawyer',
    line: 'Argues your refund policy with your AI agent. Policy held?',
    amountCents: -Math.round(Number(POLICY_EXCESS.replace(/[^0-9.]/g, '')) * 100),
  },
]

/** S4, the cast: five customers from hell, each dealt as the voiceover names them. */
export function Cast() {
  const frame = useCurrentFrame()
  const cast = scene('cast')
  const deal = CAST.map((_, i) => sentenceAt(cast, i))
  let current = 0
  for (const [i, at] of deal.entries()) if (frame >= at) current = i
  const until = deal[current + 1] ?? framesOf(cast)
  return (
    <Stage>
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 110 }}>
        <div style={{ font: `600 26px ${FONT.mono}`, letterSpacing: '0.12em', color: C.muted }}>
          THE CAST · {CAST.length} ON DUTY
        </div>
        <div style={{ display: 'flex', gap: 34, marginTop: 40 }}>
          {CAST.map((member, i) => {
            const at = deal[i] ?? 0
            const t = ramp(frame, at - 6, at + 12)
            const found = frame >= at + 40
            return (
              <div
                key={member.id}
                style={{
                  width: 300,
                  opacity: t,
                  transform: `translateY(${(1 - t) * 60}px) rotate(${(1 - t) * (i % 2 ? 4 : -4)}deg)`,
                  outline: i === current ? `4px solid ${C.highlighter}` : 'none',
                  outlineOffset: 6,
                  borderRadius: 12,
                }}
              >
                <PersonaCard
                  persona={member.id}
                  state={found ? 'leak' : 'idle'}
                  amountCents={member.amountCents}
                  t={(frame / FPS) * 1000}
                  stateT={found ? ((frame - at - 40) / FPS) * 1000 : 0}
                />
              </div>
            )
          })}
        </div>
        <div
          style={{
            marginTop: 48,
            height: 60,
            font: `600 44px ${FONT.ui}`,
            ...presence(frame, deal[current] ?? 0, until - 2, 6),
          }}
        >
          {CAST[current]?.line}
        </div>
      </AbsoluteFill>
      <Voiceover scene={cast} />
    </Stage>
  )
}

// ---------- S4½ ----------

/**
 * The store under test, for anyone who hasn't seen it: Leaky Llama's shelf, socks in a cart at
 * PayPal's button, and the leak switches opening above it, all six set to leaky.
 */
export function Store() {
  const take = useTake('store')
  if (!take) return <Stage />
  const { cut, switches } = storeCut(take)
  const checkout = cut[1]?.start ?? s(3)
  const end = lengthOf(cut)
  // The shelf keeps the store's own strip in frame: DEMO STORE · PAYPAL SANDBOX · NO REAL MONEY.
  const shelf = { x: 192, y: 0, width: 1536, height: 862 }
  const cart = markOf(take, 'cart')?.box
  const pay = markOf(take, 'pay')?.box
  const camera: CameraKey[] = [
    { at: 0, frames: 0, box: shelf, scale: 1.25 },
    ...(cart && pay ? [{ at: checkout, frames: 0, box: union(cart, pay), scale: 1.3 }] : []),
    { at: switches + 4, frames: 26, box: { x: 408, y: 0, width: 1104, height: 720 }, scale: 1.5 },
  ]
  const tag = 'LIVE · Leaky Llama, my demo store'
  // Below the store's header, which the tag would cover where it usually sits, until the dark
  // switch panel opens and leaves room for it there.
  const lowered = { left: 40, top: 128 }
  return (
    <Stage>
      <Sequence durationInFrames={end}>
        <Ramped
          take="store"
          cut={cut}
          camera={camera}
          tag={tag}
          tagAt={(segment) => (segment.start < (cut[2]?.start ?? end) ? lowered : undefined)}
        />
      </Sequence>
      <Sequence from={end}>
        <Held take="store" at={take.durationMs / 1000 - 0.1} view={camera.at(-1)} tag={tag} />
      </Sequence>
      <Voiceover scene={scene('store')} />
    </Stage>
  )
}

// ---------- S5 ----------

/** The receipt in plain words: each customer's leaks as they print, and the total at the end. */
function Tally({ leaks, total }: { leaks: ReturnType<typeof liveCut>['leaks']; total: number }) {
  const frame = useCurrentFrame()
  const shown = leaks.filter((leak) => frame >= leak.frame)
  const groups: { persona: string; rows: typeof shown }[] = []
  for (const leak of shown) {
    const group = groups.find((g) => g.persona === leak.persona)
    if (group) group.rows.push(leak)
    else groups.push({ persona: leak.persona, rows: [leak] })
  }
  const latest = shown[shown.length - 1]?.persona
  const done = frame >= total
  return (
    <>
      <Eyebrow>The receipt, line by line</Eyebrow>
      <div style={{ marginTop: 10, font: `500 26px ${FONT.ui}`, color: C.mutedOnInk }}>
        Four customers, one after another, in PayPal’s sandbox
      </div>
      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {groups.map((group) => (
          <div key={group.persona} style={{ opacity: done || group.persona === latest ? 1 : 0.5 }}>
            <Eyebrow color={C.leakOnInk}>▼ {nameOf(group.persona)}</Eyebrow>
            {group.rows.map((row) => (
              <div
                key={row.t}
                style={{
                  marginTop: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 24,
                  ...presence(frame, row.frame, Number.POSITIVE_INFINITY, 6),
                }}
              >
                <span style={{ font: `500 30px/1.25 ${FONT.ui}` }}>
                  {BROKE[row.check] ?? row.check}
                </span>
                <span
                  style={{
                    flex: 'none',
                    font: `600 30px ${FONT.mono}`,
                    color: C.leakOnInk,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatCents(row.amountCents)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {done ? (
        <div
          style={{
            position: 'absolute',
            left: 88,
            right: 64,
            bottom: 140,
            paddingTop: 18,
            borderTop: `2px solid ${C.paper}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            ...presence(frame, total, Number.POSITIVE_INFINITY, 8),
          }}
        >
          <span style={{ font: `600 30px ${FONT.mono}`, letterSpacing: '0.06em' }}>
            {LEAKS} LEAKS
          </span>
          <span style={{ font: `600 88px/1 ${FONT.mono}`, color: C.leakOnInk }}>{TOTAL}</span>
        </div>
      ) : null}
    </>
  )
}

/** S5, a live run on the site: the click, then every leak as PayPal's sandbox confirms it. */
export function Live() {
  const take = useTake('live-run')
  if (!take) return <Stage />
  const { cut, end, settled, leaks } = liveCut(take)
  const tape = markOf(take, 'run-done')?.box
  const view = tape ? receiptView(tape) : undefined
  const split = cut[1]?.start ?? s(4)
  const camera: CameraKey[] = view ? [{ ...view, at: split, frames: 22 }] : []
  const live = scene('live')
  const allLeaks = leaksOf(take)
  return (
    <Stage>
      <Sequence durationInFrames={end}>
        <Ramped
          take="live-run"
          cut={cut}
          camera={camera}
          tag="LIVE · PayPal sandbox"
          tagAt={(segment) => (segment.start >= split ? RIGHT_TAG : undefined)}
          veil={(segment) => (segment.start >= split ? PANEL : undefined)}
        >
          {(ms) => {
            // The line that printed last, swiped as the panel names it.
            const latest = allLeaks.filter((leak) => leak.t * 1000 <= ms).pop()
            return latest?.box ? (
              <Highlight box={latest.box} t={(ms - latest.t * 1000) / 260} />
            ) : null
          }}
        </Ramped>
      </Sequence>
      <Sequence from={end}>
        <Held
          take="live-run"
          at={settled}
          view={view}
          tag="LIVE · PayPal sandbox"
          tagAt={RIGHT_TAG}
          veil={PANEL}
        />
      </Sequence>
      <Sequence from={split}>
        <Panel at={1}>
          <Tally
            leaks={leaks.map((leak) => ({ ...leak, frame: leak.frame - split }))}
            total={end - split}
          />
        </Panel>
      </Sequence>
      <Voiceover scene={live} anchors={anchorsFor('live', take)} />
    </Stage>
  )
}

// ---------- S6 ----------

/** When S6 says each fact of the leak it follows, in frames of the scene. */
interface Said {
  approved: number
  swapped: number
  captured: number
  shipped: number
  leaked: number
}

/**
 * S6, one leak followed for someone new: what the Cart Shuffler did, what PayPal captured and
 * what the store shipped, worked out in plain words beside the console's own evidence, then
 * PayPal's own record of the same capture.
 */
export function Proof() {
  const take = useTake('console')
  const dashboard = useTake('dashboard')
  if (!take) return <Stage />
  const proof = scene('proof')
  const anchors = anchorsFor('proof')
  const say = (sentence: number, phrase: string) => phraseAt(proof, sentence, phrase, { anchors })
  const said: Said = {
    approved: say(1, 'of socks'),
    swapped: say(1, 'panniers'),
    captured: say(2, 'PayPal captured'),
    shipped: say(2, 'the store shipped'),
    leaked: say(2, 'leaked'),
  }
  // From just before the click on the leak, so the console opens on the receipt line it was.
  const from = Math.max(0, markAt(take, 'leak') - 1.2)
  const to = take.durationMs / 1000 - 0.1
  const leak = markOf(take, 'leak')?.box
  const detail = markOf(take, 'detail')?.box
  const evidence = markOf(take, 'evidence')?.box
  const finding = detail && evidence ? union(detail, evidence) : evidence
  const camera: CameraKey[] = [
    ...(leak ? [{ at: 0, frames: 0, box: leak, scale: 1.9, center: RIGHT }] : []),
    ...(finding
      ? [
          {
            at: sentenceAt(proof, 1, { anchors }) - 8,
            frames: 26,
            box: finding,
            scale: 2.3,
            center: RIGHT,
          },
        ]
      : []),
  ]
  // One line of the finding lit at a time, as the voiceover reaches what it says.
  const lit: [number, string][] = [
    [said.approved, 'cart-at-checkout'],
    [said.swapped, 'cart-at-capture'],
    [said.captured, 'captured'],
    [said.shipped, 'shipped'],
    [said.leaked, 'detail'],
  ]
  return (
    <Stage>
      <Sequence durationInFrames={PROOF_DASHBOARD}>
        <Footage
          take="console"
          from={from}
          to={to}
          tag="LIVE · the Shakedown console"
          tagAt={RIGHT_TAG}
          veil={PANEL}
          camera={camera}
        >
          {(ms) => {
            const frame = (ms / 1000 - from) * FPS
            const [at, label] = lit.filter(([start]) => frame >= start).at(-1) ?? []
            const box = label ? markOf(take, label)?.box : undefined
            return box && at !== undefined ? <Highlight box={box} t={(frame - at) / 8} /> : null
          }}
        </Footage>
        <Panel>
          <Followed said={said} />
        </Panel>
      </Sequence>
      <Sequence from={PROOF_DASHBOARD}>
        {dashboard ? (
          <PayPalRecord take={dashboard} same={say(3, WORST.captured) - PROOF_DASHBOARD} />
        ) : (
          <Placeholder
            title="The same order in your PayPal sandbox dashboard"
            detail={`You sign in and record this (VIDEO_PIPELINE §3.5): PayPal order ${WORST.order}, the ${WORST.captured} capture ${WORST.captureId}, as in the finding.`}
          />
        )}
      </Sequence>
      <Voiceover scene={proof} anchors={anchors} />
    </Stage>
  )
}

/** A fact of the followed leak: what it is, the amount, and where the amount came from. */
function Fact({
  at,
  lit,
  label,
  amount,
  from,
}: {
  at: number
  lit: number
  label: string
  amount: string
  from: string
}) {
  const frame = useCurrentFrame()
  return (
    <div style={{ marginTop: 40, ...presence(frame, at, Number.POSITIVE_INFINITY, 8) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ font: `600 40px ${FONT.ui}` }}>
          <Swipe at={lit} tone="ink">
            {label}
          </Swipe>
        </span>
        <span style={{ font: `600 44px ${FONT.mono}`, fontVariantNumeric: 'tabular-nums' }}>
          {amount}
        </span>
      </div>
      <div style={{ marginTop: 8, font: `500 26px/1.3 ${FONT.ui}`, color: C.mutedOnInk }}>
        {from}
      </div>
    </div>
  )
}

/** S6's panel: the receipt line it follows, then that leak worked out, a fact at a time. */
function Followed({ said }: { said: Said }) {
  const frame = useCurrentFrame()
  const { approved, swapped } = WORST
  return (
    <>
      <Eyebrow>One leak, followed</Eyebrow>
      <div style={{ marginTop: 22 }}>
        <Eyebrow color={C.leakOnInk}>▼ {nameOf('cart-shuffler')}</Eyebrow>
      </div>
      <div
        style={{
          marginTop: 6,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          font: `500 30px/1.25 ${FONT.ui}`,
        }}
      >
        <span>{BROKE['Goods shipped are never worth more than PayPal captured']}</span>
        <span style={{ font: `600 30px ${FONT.mono}`, color: C.leakOnInk }}>
          {money(-WORST.leakCents)}
        </span>
      </div>
      <div style={{ height: 24 }} />
      <Fact
        at={said.approved}
        lit={said.captured}
        label="PayPal captured"
        amount={WORST.captured}
        from={`${approved.qty} × ${approved.name}: the cart it approved`}
      />
      <Fact
        at={said.swapped}
        lit={said.shipped}
        label="The store shipped"
        amount={WORST.shipped}
        from={`${swapped.qty} × ${swapped.name}: the cart it sent after approving`}
      />
      <div
        style={{
          marginTop: 34,
          paddingTop: 20,
          borderTop: `2px solid ${C.paper}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          ...presence(frame, said.leaked, Number.POSITIVE_INFINITY, 8),
        }}
      >
        <span style={{ font: `600 30px ${FONT.mono}`, letterSpacing: '0.06em' }}>LEAKED</span>
        <span style={{ font: `600 88px/1 ${FONT.mono}`, color: C.leakOnInk }}>
          {money(-WORST.leakCents)}
        </span>
      </div>
      <div
        style={{
          marginTop: 10,
          textAlign: 'right',
          font: `500 26px ${FONT.mono}`,
          color: C.mutedOnInk,
          ...presence(frame, said.leaked + 6, Number.POSITIVE_INFINITY, 8),
        }}
      >
        {WORST.shipped} − {WORST.captured}
      </div>
    </>
  )
}

/**
 * PayPal's own record of the same capture: the sandbox account's transaction details, recorded in
 * a window you signed in to (capture.ts, take `dashboard`). As the cursor reaches the transaction
 * ID, the camera comes in on the ID and the amount together; the amount is lit as the voiceover
 * says it (`same`, a frame of this clip), and a callout keeps the sum in view.
 */
function PayPalRecord({ take, same }: { take: Take; same: number }) {
  const from = Math.max(0, markAt(take, 'heading') - 0.4)
  const to = take.durationMs / 1000 - 0.1
  const id = markOf(take, 'transaction-id')
  const amount = markOf(take, 'amount')
  const facts = id?.box && amount?.box ? union(id.box, amount.box) : undefined
  // The take marks the page, then takes 0.9 s to bring the cursor to the ID.
  const zoomAt = s(markAt(take, 'transaction-id') - from + 0.9)
  return (
    <>
      <Footage
        take="dashboard"
        from={from}
        to={to}
        tag="LIVE · PayPal’s sandbox dashboard"
        // The take's cursor rests on the transaction ID; the highlight does the pointing here.
        cursor={false}
        camera={[
          // Open just below PayPal's top bar, which this signed-in page leaves half-loaded.
          { at: 0, frames: 0, box: { x: 0, y: 58, width: 1920, height: 1000 }, scale: 1.08 },
          ...(facts ? [{ at: zoomAt, frames: 26, box: facts, scale: 1.7 }] : []),
        ]}
      >
        {(ms) => {
          const frame = (ms / 1000 - from) * FPS
          return amount?.box ? <Highlight box={amount.box} t={(frame - same) / 8} /> : null
        }}
      </Footage>
      <Callout
        from={s(0.6)}
        to={Number.POSITIVE_INFINITY}
        who={nameOf('cart-shuffler')}
        what={`PayPal captured ${WORST.captured}. The store shipped ${WORST.shipped}.`}
        amount={money(-WORST.leakCents)}
        x={440}
        y={736}
        width={1040}
      />
    </>
  )
}

// ---------- S7 ----------

/** S7, AI decides vs code decides: what the assistant said, then what the ledger recorded. */
export function AiVsCode() {
  const take = useTake('exhibit')
  if (!take) return <Stage />
  const length = Math.min(take.durationMs / 1000 - 0.1, 10.4)
  const vo = scene('ai-vs-code')
  const ask = sentenceAt(vo, 2)
  const ledgerAt = sentenceAt(vo, 3)
  const whole = markOf(take, 'exhibit')?.box
  const chat = markOf(take, 'chat')?.box
  const ledger = markOf(take, 'ledger')?.box
  const camera: CameraKey[] = [
    ...(whole ? [{ at: 0, frames: 0, box: whole, scale: 1.2 }] : []),
    ...(chat ? [{ at: ask - 8, frames: 26, box: chat, scale: 1.8 }] : []),
    ...(ledger ? [{ at: ledgerAt - 8, frames: 26, box: ledger, scale: 1.8 }] : []),
  ]
  const end = s(length)
  return (
    <Stage>
      <Sequence durationInFrames={end}>
        <Footage
          take="exhibit"
          from={0}
          to={length}
          tag="LIVE · the Shakedown site"
          camera={camera}
          cursor={false}
        />
      </Sequence>
      <Sequence from={end}>
        <Held
          take="exhibit"
          at={length - 0.1}
          view={ledger ? { box: ledger, scale: 1.8 } : undefined}
          tag="LIVE · the Shakedown site"
        />
      </Sequence>
      <Callout
        from={ledgerAt + s(1.6)}
        to={framesOf(vo) + 4}
        who={nameOf('policy-lawyer')}
        what={runs.exhibit.verdict.why}
        amount={`−${POLICY_EXCESS}`}
        x={440}
        y={736}
        width={1040}
      />
      <Voiceover scene={vo} />
    </Stage>
  )
}

// ---------- S8 ----------

/** How the re-run came back, customer by customer, from the receipt the take printed. */
function rerunOf(take: Take) {
  const started = markAt(take, 'rerun-started')
  return new Map(
    linesOf(take)
      .filter((line) => line.t / 1000 > started)
      .map((line) => [line.data?.persona ?? '', line.data ?? {}]),
  )
}

/** The fixes, one line per customer; each turns to its re-run verdict as the receipt seals. */
function Fixes({ sealed, results }: { sealed: number; results: ReturnType<typeof rerunOf> }) {
  const frame = useCurrentFrame()
  const rows = Object.entries(FIXED)
  return (
    <>
      <Eyebrow>The fixes, applied</Eyebrow>
      <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 30 }}>
        {rows.map(([persona, fix], i) => {
          const result = results.get(persona)
          const done = frame >= sealed
          const verdict = done ? (result?.verdict ?? 'sealed') : 'leak'
          const color =
            verdict === 'sealed' ? C.sealedOnInk : verdict === 'leak' ? C.leakOnInk : C.paper
          const word =
            verdict === 'sealed' ? '✓ Sealed' : verdict === 'leak' ? '▼ Leaked' : '? Inconclusive'
          return (
            <div key={persona} style={presence(frame, 8 + i * 9, Number.POSITIVE_INFINITY, 8)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                <Eyebrow color={C.paper}>{nameOf(persona)}</Eyebrow>
                <Eyebrow color={color}>{word}</Eyebrow>
              </div>
              <div style={{ marginTop: 6, font: `500 30px/1.25 ${FONT.ui}` }}>{fix}</div>
              {done && verdict === 'inconclusive' ? (
                <div style={{ marginTop: 4, font: `500 22px ${FONT.mono}`, color: C.mutedOnInk }}>
                  {result?.evidence}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </>
  )
}

/** S8, the fix: apply it, re-run the same seed, watch it seal; then the gate in CI. */
export function Fix() {
  const take = useTake('live-run')
  const ci = useTake('ci')
  if (!take || !ci) return <Stage />
  const { cut, end, sealed, settled } = fixCut(take)
  const tape = markOf(take, 'rerun-sealed')?.box ?? markOf(take, 'run-done')?.box
  const view = tape ? receiptView(tape) : undefined
  const split = cut[1]?.start ?? s(1.9)
  const hold = FIX_HOLD
  const ciAt = end + hold
  const ciFrom = 1.0
  const terminal = markOf(ci, 'terminal')?.box
  const comment = markOf(ci, 'comment')?.box
  const clicked = (ci.events.find((e) => e.type === 'click')?.t ?? 3700) / 1000
  const ciCamera: CameraKey[] = [
    ...(terminal ? [{ at: 0, frames: 0, box: terminal, scale: 1.45 }] : []),
    ...(comment ? [{ at: s(clicked - ciFrom) + 14, frames: 24, box: comment, scale: 1.75 }] : []),
  ]
  const ciLength = s(Math.min(ci.durationMs / 1000 - 0.1, 8.4) - ciFrom)
  const fix = scene('fix')
  return (
    <Stage>
      <Sequence durationInFrames={end}>
        <Ramped
          take="live-run"
          cut={cut}
          camera={view ? [{ ...view, at: split, frames: 22 }] : []}
          tag="LIVE · PayPal sandbox"
          tagAt={(segment) => (segment.start >= split ? RIGHT_TAG : undefined)}
          veil={(segment) => (segment.start >= split ? PANEL : undefined)}
        />
      </Sequence>
      <Sequence from={end} durationInFrames={hold}>
        <Held
          take="live-run"
          at={settled}
          view={view}
          tag="LIVE · PayPal sandbox"
          tagAt={RIGHT_TAG}
          veil={PANEL}
        />
      </Sequence>
      <Sequence from={split} durationInFrames={ciAt - split}>
        <Panel at={1}>
          <Fixes sealed={sealed - split} results={rerunOf(take)} />
        </Panel>
      </Sequence>
      <Sequence from={ciAt} durationInFrames={ciLength}>
        <Footage
          take="ci"
          from={ciFrom}
          to={ciFrom + ciLength / FPS}
          tag="LIVE · the Shakedown site"
          camera={ciCamera}
        />
      </Sequence>
      <Sequence from={ciAt + ciLength}>
        <Held
          take="ci"
          at={ciFrom + ciLength / FPS - 0.05}
          view={comment ? { box: comment, scale: 1.75 } : undefined}
          tag="LIVE · the Shakedown site"
        />
      </Sequence>
      <Voiceover scene={fix} anchors={anchorsFor('fix', take)} />
    </Stage>
  )
}

// ---------- S9 ----------

const NODES = [
  { label: 'The cast', sub: 'Claude plays the customers', who: 'AI' },
  { label: 'Your store', sub: 'checkout, webhooks, AI support' },
  { label: 'PayPal sandbox', sub: 'Orders v2 · Payments v2 · Webhooks' },
  { label: 'The graders', sub: 'plain code reads the ledger', who: 'Code' },
  { label: 'The receipt', sub: 'fix, re-run, CI gate' },
]

/** S9: how it works, in one drawing, then the end card. */
export function Close() {
  const frame = useCurrentFrame()
  const close = scene('close')
  const card = CLOSE_CARD
  const width = 300
  const gap = 56
  const left = (1920 - (NODES.length * width + (NODES.length - 1) * gap)) / 2
  return (
    <Stage>
      <Sequence durationInFrames={card}>
        <AbsoluteFill>
          <div
            style={{
              position: 'absolute',
              top: 150,
              width: '100%',
              textAlign: 'center',
              font: `800 72px ${FONT.display}`,
              fontVariationSettings: '"wdth" 80',
              ...presence(frame, 4, card),
            }}
          >
            AI plays the customers. <Swipe at={40}>Code keeps the score.</Swipe>
          </div>
          {NODES.map((node, i) => {
            const at = 24 + i * 22
            const x = left + i * (width + gap)
            const ink = node.who === 'Code'
            return (
              <div key={node.label}>
                {i > 0 ? (
                  <svg
                    width={gap}
                    height={30}
                    viewBox={`0 0 ${gap} 30`}
                    style={{
                      position: 'absolute',
                      left: x - gap,
                      top: 455,
                      ...presence(frame, at - 6, card),
                    }}
                  >
                    <title>then</title>
                    <path
                      d={`M6 15 H${gap - 10} M${gap - 18} 7 L${gap - 8} 15 L${gap - 18} 23`}
                      fill="none"
                      stroke={C.ink}
                      strokeWidth={3.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
                <div
                  style={{
                    position: 'absolute',
                    left: x,
                    top: 380,
                    width,
                    height: 204,
                    boxSizing: 'border-box',
                    padding: '26px 24px',
                    borderRadius: 14,
                    border: `3px solid ${C.ink}`,
                    background: ink ? C.ink : C.surface,
                    color: ink ? C.surface : C.ink,
                    ...presence(frame, at, card),
                  }}
                >
                  <div
                    style={{
                      font: `800 40px/1 ${FONT.display}`,
                      fontVariationSettings: '"wdth" 82',
                    }}
                  >
                    {node.label}
                  </div>
                  <div style={{ marginTop: 14, font: `500 25px/1.3 ${FONT.ui}`, opacity: 0.85 }}>
                    {node.sub}
                  </div>
                </div>
                {node.who ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: x + width / 2 - 260,
                      top: 620,
                      width: 520,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      ...presence(frame, 150 + (ink ? 24 : 0), card),
                    }}
                  >
                    <div
                      style={{
                        margin: '0 auto 14px',
                        width: 3,
                        height: 34,
                        background: C.ink,
                      }}
                    />
                    <span
                      style={{
                        padding: '8px 18px',
                        borderRadius: 999,
                        background: ink ? C.ink : C.highlighter,
                        color: ink ? C.surface : C.ink,
                        font: `600 24px ${FONT.mono}`,
                      }}
                    >
                      {ink ? 'Code decides: did money move?' : 'AI decides: what to say'}
                    </span>
                  </div>
                ) : null}
              </div>
            )
          })}
          <div
            style={{
              position: 'absolute',
              top: 820,
              width: '100%',
              textAlign: 'center',
              font: `500 28px ${FONT.mono}`,
              color: C.muted,
              ...presence(frame, 200, card),
            }}
          >
            Sandbox only · point it at your own integration
          </div>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={card}>
        <AbsoluteFill
          style={{
            background: C.ink,
            color: C.paper,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 34,
          }}
        >
          <Wordmark size={150} color={C.paper} />
          <div style={{ font: `800 64px ${FONT.display}`, fontVariationSettings: '"wdth" 80' }}>
            Let the customers from hell find your leaks first.
          </div>
          <div style={{ font: `600 28px ${FONT.mono}`, color: C.sealedOnInk }}>
            Sandbox only · test your own integration
          </div>
          <div style={{ marginTop: 30, font: `500 26px ${FONT.ui}`, opacity: 0.75 }}>
            Built for the PayPal AI Hackathon 2026 · demo and code linked below
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              opacity: 0.5,
            }}
          >
            <Mark size={28} color={C.paper} />
            <span style={{ font: `500 20px ${FONT.mono}` }}>
              Every number in this video comes from a recorded sandbox run.
            </span>
          </div>
        </AbsoluteFill>
      </Sequence>
      <Voiceover scene={close} anchors={anchorsFor('close')} />
    </Stage>
  )
}
