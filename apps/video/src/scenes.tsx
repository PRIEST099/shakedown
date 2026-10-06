import { getPersona, type PersonaId } from '@shakedown/core/cast'
import { formatCents, PersonaCard } from '@shakedown/ui'
import type { ReactNode } from 'react'
import { AbsoluteFill, Freeze, Sequence, useCurrentFrame } from 'remotion'
import runs from './data/runs.json'
import { type CameraKey, Footage, Highlight, useTake } from './footage'
import { Callout, Line, Mark, Placeholder, Swipe, Voiceover, Wordmark } from './kit'
import {
  CUSTOMER,
  EVAL,
  framesOf,
  LEAKS,
  MERCHANT,
  money,
  OWN_PRICE,
  POLICY,
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
  type Box,
  CLOSE_CARD,
  fixCut,
  hookCut,
  leaksOf,
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

/**
 * The film's scenes. The narration carries every fact on its own, so someone who only listens can
 * follow; the pictures show what it says as it says it. Each cut is timed from the voice
 * (sentenceAt, phraseAt), so the picture follows whoever reads the script.
 */

const FPS = 30
const s = (seconds: number) => Math.round(seconds * FPS)
const scene = (id: SceneId) => SCENES.find((x) => x.id === id) ?? SCENES[0]
const said = (id: SceneId, sentence: number, phrase: string) =>
  phraseAt(scene(id), sentence, phrase)
const saying = (id: SceneId, sentence: number) => sentenceAt(scene(id), sentence)

// ---------- the split layout: plain words on ink at left, the live picture at right ----------

const PANEL = 900
const RIGHT_TAG = { left: PANEL + 36, top: 36 }
/** Below a page's own header, where the tag would otherwise cover its name. */
const LOWERED_TAG = { left: 40, top: 128 }
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
        padding: '110px 64px 0 88px',
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

/** A small grey tag beside a plain word, giving the technical name for it. */
const Term = ({ children }: { children: ReactNode }) => (
  <span
    style={{
      marginLeft: 14,
      padding: '3px 10px',
      borderRadius: 999,
      border: `1.5px solid ${C.mutedOnInk}`,
      font: `500 18px ${FONT.mono}`,
      color: C.mutedOnInk,
      verticalAlign: 'middle',
    }}
  >
    {children}
  </span>
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

const nameOf = (persona: string) => getPersona(persona as PersonaId).name

/** The Cart Shuffler's two leaks, as the receipt and the panels name them. */
const OWN_PRICE_LEAK = `Set its own price: ${OWN_PRICE.paid} for ${OWN_PRICE.shipped} saddlebags`
const SWAPPED_LEAK = 'Approved socks, shipped saddlebags'

/** What each broken check means, in a few plain words: what the panel says beside the receipt. */
const BROKE: Record<string, string> = {
  'One checkout is charged once, however often Pay is pressed': 'Pressed Pay twice: charged twice',
  'A retried capture never ships twice': 'A retried payment shipped twice',
  'An unverified webhook never releases goods': 'An unsigned “paid” message released goods',
  'The same event ID is acted on exactly once': 'The same message, acted on twice',
  'A late event never reverses a newer one': 'A late message undid a refund',
  'A declined card never ships anything': 'Declined card, order shipped anyway',
}
const brokeOf = (leak: { persona: string; check: string; amountCents: number }) =>
  leak.persona === 'cart-shuffler'
    ? -leak.amountCents === OWN_PRICE.leakCents
      ? OWN_PRICE_LEAK
      : SWAPPED_LEAK
    : (BROKE[leak.check] ?? leak.check)

/** Each customer's fix, in plain words (packages/core/src/personas has the full text). */
const FIXED: { persona: PersonaId; fix: string }[] = [
  { persona: 'double-clicker', fix: 'One payment key per order' },
  { persona: 'cart-shuffler', fix: 'Ship only what PayPal collected' },
  { persona: 'echo', fix: 'Act only on PayPal-signed messages, once, in order' },
  { persona: 'bouncer', fix: 'Ship only once PayPal completes the payment' },
]

// ---------- the cold open ----------

/** The receipt printing red at speed, each leak a chime; the total; who it is for. */
export function Hook() {
  const take = useTake('live-run')
  // Frames wait for the take (delayRender), so nothing is captured before it loads.
  if (!take) return <Stage tone="ink" />
  const { cut, land, settled } = hookCut(take, true)
  const tape = markOf(take, 'run-done')?.box
  const view = tape ? receiptView(tape) : undefined
  const hook = scene('hook')
  const second = saying('hook', 1)
  const third = saying('hook', 2)
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
          <Line from={4} to={second - 3} size={96} color={C.paper}>
            Each chime is a{' '}
            <Swipe at={18} tone="ink">
              leak.
            </Swipe>
          </Line>
          <Line from={said('hook', 0, 'money')} to={second - 3} size={44} color={C.mutedOnInk}>
            <div style={{ marginTop: 28, font: `500 44px/1.2 ${FONT.ui}` }}>
              money a bug would lose
            </div>
          </Line>
        </div>
        <div style={{ position: 'absolute', left: 88, right: 64, top: 300 }}>
          <Line from={second} to={land - 3} size={72} color={C.paper}>
            One sandbox test run
            <div style={{ marginTop: 18, font: `600 44px ${FONT.mono}`, color: C.leakOnInk }}>
              {LEAKS} leaks
            </div>
          </Line>
        </div>
        <div style={{ position: 'absolute', left: 88, right: 64, top: 300 }}>
          <Line from={land} to={third - 3} size={40} color={C.paper}>
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
              would have leaked, in {LEAKS} leaks.
            </div>
          </Line>
        </div>
        <div style={{ position: 'absolute', left: 88, right: 64, top: 300 }}>
          <Line from={third} to={framesOf(hook) + 4} size={56} color={C.paper}>
            <Wordmark size={120} color={C.paper} />
            <div style={{ marginTop: 34 }}>Finds them first,</div>
            <div style={{ marginTop: 10, font: `500 40px/1.25 ${FONT.ui}`, color: C.mutedOnInk }}>
              for developers with PayPal checkouts.
            </div>
          </Line>
        </div>
      </Panel>
      <Voiceover scene={hook} />
    </Stage>
  )
}

// ---------- the store, and how a PayPal payment works ----------

/** One step of a PayPal payment, appearing as the voice names it. */
function Step({
  at,
  n,
  children,
  term,
}: {
  at: number
  n: string
  children: ReactNode
  term?: string
}) {
  const frame = useCurrentFrame()
  return (
    <div
      style={{
        marginTop: 26,
        display: 'flex',
        alignItems: 'baseline',
        gap: 22,
        ...presence(frame, at, Number.POSITIVE_INFINITY, 8),
      }}
    >
      <span style={{ flex: 'none', width: 34, font: `600 28px ${FONT.mono}`, color: C.mutedOnInk }}>
        {n}
      </span>
      <span style={{ font: `600 38px/1.25 ${FONT.ui}` }}>
        {children}
        {term ? <Term>{term}</Term> : null}
      </span>
    </div>
  )
}

/** The panel beside the checkout: a PayPal payment in four steps, then what a skipped check costs. */
function PaySteps() {
  const frame = useCurrentFrame()
  const skip = saying('store', 3)
  const signed = said('store', 2, 'signed')
  return (
    <>
      <Eyebrow>How a PayPal payment works</Eyebrow>
      <Step at={said('store', 1, 'approves')} n="1">
        The customer approves a payment
      </Step>
      <Step at={said('store', 1, 'collects')} n="2" term="capture">
        PayPal collects the money
      </Step>
      <Step at={said('store', 1, 'ships')} n="3">
        My shop ships the order
      </Step>
      <Step at={said('store', 2, 'paid')} n="+" term="webhook">
        PayPal sends a “paid” message
      </Step>
      <div
        style={{
          marginTop: 10,
          marginLeft: 56,
          font: `600 24px ${FONT.mono}`,
          color: C.sealedOnInk,
          ...presence(frame, signed, Number.POSITIVE_INFINITY, 8),
        }}
      >
        ✓ signed by PayPal, to prove it’s real
      </div>
      <div style={{ marginTop: 56, ...presence(frame, skip, Number.POSITIVE_INFINITY, 8) }}>
        <Eyebrow color={C.leakOnInk}>Skip one check, and…</Eyebrow>
      </div>
      {[
        { at: said('store', 3, 'unpaid'), text: 'Goods ship unpaid' },
        { at: said('store', 3, 'twice'), text: 'Someone pays twice' },
      ].map((row) => (
        <div
          key={row.text}
          style={{
            marginTop: 14,
            font: `600 38px ${FONT.ui}`,
            color: C.leakOnInk,
            ...presence(frame, row.at, Number.POSITIVE_INFINITY, 8),
          }}
        >
          ✕ {row.text}
        </div>
      ))}
    </>
  )
}

/**
 * My demo shop: its shelf, then its checkout beside a payment in four plain steps, then its leak
 * switches opening, all set to leaky. The sixth switch's customer isn't built, so it says so.
 */
export function Store() {
  const take = useTake('store')
  if (!take) return <Stage />
  const store = scene('store')
  const { cut, checkout, switches } = storeCut(take)
  const panelAt = saying('store', 1) - 4
  const pay = markOf(take, 'pay')?.box
  const opened = (take.events.filter((e) => e.type === 'click').at(-1)?.t ?? 0) / 1000
  const camera: CameraKey[] = [
    // The whole shelf, with the shop's own strip: DEMO STORE · PAYPAL SANDBOX · NO REAL MONEY.
    { at: 0, frames: 0, box: { x: 192, y: 0, width: 1536, height: 862 }, scale: 1.25 },
    // Then, right of the panel, the cart's total and PayPal's button.
    ...(pay
      ? [
          {
            at: checkout,
            frames: 0,
            box: { x: 760, y: pay.y, width: 752, height: 420 },
            scale: 1.3,
            center: RIGHT,
          },
        ]
      : []),
    {
      at: switches + 4,
      frames: 26,
      box: { x: 408, y: 0, width: 1104, height: 380 },
      scale: 0.96,
      center: RIGHT,
    },
  ]
  const tag = 'LIVE · Leaky Llama, my demo shop'
  const right = (segment: Placed) => segment.start + segment.frames > panelAt
  return (
    <Stage>
      <Ramped
        take="store"
        cut={cut}
        camera={camera}
        tag={tag}
        tagAt={(segment) => (right(segment) ? RIGHT_TAG : LOWERED_TAG)}
        veil={(segment) => (right(segment) ? PANEL : undefined)}
      >
        {(ms) =>
          ms >= opened * 1000 + 400 ? (
            // The sixth switch belongs to a customer that arrives in a later version.
            <div
              style={{
                position: 'absolute',
                left: 1152,
                top: 168,
                width: 360,
                height: 111,
                borderRadius: 8,
                background: 'rgb(18 16 13 / 0.82)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                font: `600 20px ${FONT.mono}`,
                color: C.mutedOnInk,
                letterSpacing: '0.08em',
              }}
            >
              NOT BUILT YET
            </div>
          ) : null
        }
      </Ramped>
      <Panel at={panelAt}>
        <PaySteps />
      </Panel>
      <Voiceover scene={store} />
    </Stage>
  )
}

// ---------- the sandbox, and the cast ----------

/** The plain rule each customer checks. */
const CAST: { id: PersonaId; rule: string }[] = [
  { id: 'double-clicker', rule: 'Charged once?' },
  { id: 'cart-shuffler', rule: 'Ships only what was paid?' },
  { id: 'echo', rule: 'Only signed messages, once?' },
  { id: 'bouncer', rule: 'Declined card, nothing ships?' },
  { id: 'policy-lawyer', rule: 'Refunds kept to policy?' },
]

/** A bracket under a run of cards, naming what they test. */
function Bracket({ at, x, width, text }: { at: number; x: number; width: number; text: string }) {
  const frame = useCurrentFrame()
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: 850,
        width,
        textAlign: 'center',
        ...presence(frame, at, Number.POSITIVE_INFINITY, 8),
      }}
    >
      <div
        style={{
          height: 18,
          borderLeft: `3px solid ${C.ink}`,
          borderRight: `3px solid ${C.ink}`,
          borderBottom: `3px solid ${C.ink}`,
        }}
      />
      <div style={{ marginTop: 12, font: `600 24px ${FONT.mono}`, letterSpacing: '0.06em' }}>
        {text}
      </div>
    </div>
  )
}

/** The five customers, scripts every one, dealt as the voice introduces them. */
function Cast({ from }: { from: number }) {
  const frame = useCurrentFrame() + from
  const deal = saying('meet', 1)
  const width = 300
  const gap = 34
  const left = (1920 - (CAST.length * width + (CAST.length - 1) * gap)) / 2
  return (
    <Stage>
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 96 }}>
        <div style={{ font: `600 26px ${FONT.mono}`, letterSpacing: '0.12em', color: C.muted }}>
          THE CAST · {CAST.length} SCRIPTED CUSTOMERS · NO AI
        </div>
      </AbsoluteFill>
      {CAST.map((member, i) => {
        const at = deal + i * 15
        const t = ramp(frame, at - 6, at + 12)
        return (
          <div
            key={member.id}
            style={{
              position: 'absolute',
              left: left + i * (width + gap),
              top: 170,
              width,
              opacity: t,
              transform: `translateY(${(1 - t) * 60}px) rotate(${(1 - t) * (i % 2 ? 4 : -4)}deg)`,
            }}
          >
            <PersonaCard
              persona={member.id}
              state="idle"
              of={CAST.length}
              t={(frame / FPS) * 1000}
            />
            <div
              style={{
                marginTop: 18,
                textAlign: 'center',
                font: `600 28px/1.25 ${FONT.ui}`,
                ...presence(frame, at + 10, Number.POSITIVE_INFINITY, 8),
              }}
            >
              {member.rule}
            </div>
          </div>
        )
      })}
      <Sequence from={-from}>
        <Bracket
          at={said('meet', 2, 'payments')}
          x={left}
          width={4 * width + 3 * gap}
          text="PAYMENTS · CHECKOUT AND “PAID” MESSAGES"
        />
        <Bracket
          at={said('meet', 2, 'Lulu')}
          x={left + 4 * (width + gap)}
          width={width}
          text="SUPPORT · LULU"
        />
      </Sequence>
    </Stage>
  )
}

/** Shakedown in the sandbox, from its own site; then its five customers, all of them scripts. */
export function Meet() {
  const frame = useCurrentFrame()
  const landing = useTake('landing')
  const meet = scene('meet')
  const cardsAt = saying('meet', 1) - 8
  const hero = { x: 360, y: 90, width: 1200, height: 640 }
  // From the moment the page has loaded.
  const loaded = Math.max(0, markAt(landing, 'hero') - 0.1)
  return (
    <Stage>
      <Sequence durationInFrames={cardsAt}>
        <Footage
          take="landing"
          from={loaded}
          to={loaded + cardsAt / FPS}
          tag="LIVE · the Shakedown site"
          cursor={false}
          camera={[{ at: 0, frames: 0, box: hero, scale: 1.3 }]}
        />
        <AbsoluteFill
          style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 190 }}
        >
          <div
            style={{
              padding: '14px 28px',
              borderRadius: 999,
              background: C.ink,
              color: C.paper,
              font: `600 30px ${FONT.mono}`,
              ...presence(frame, 10, cardsAt, 8),
            }}
          >
            PayPal sandbox · pretend money · nothing really ships
          </div>
        </AbsoluteFill>
      </Sequence>
      <Sequence from={cardsAt}>
        <Cast from={cardsAt} />
      </Sequence>
      <Voiceover scene={meet} />
    </Stage>
  )
}

// ---------- the live run ----------

/** When the voice names each customer, and lights its group on the panel. */
const GROUP: Record<string, number> = {
  'double-clicker': 1,
  'cart-shuffler': 3,
  echo: 4,
  bouncer: 6,
}

/** The receipt in plain words: each customer as the voice names it, its leaks as they print. */
function Tally({
  leaks,
  total,
  offset,
}: {
  leaks: ReturnType<typeof liveCut>['leaks']
  total: number
  offset: number
}) {
  const frame = useCurrentFrame() + offset
  const live = scene('live')
  const named = Object.entries(GROUP)
    .map(([persona, sentence]) => ({ persona, at: sentenceAt(live, sentence) }))
    .filter((group) => frame >= group.at)
  const current = named.at(-1)?.persona
  const done = frame >= total
  const echoChips = [
    { at: said('live', 4, 'unsigned'), text: 'unsigned' },
    { at: said('live', 4, 'once'), text: 'once' },
    { at: said('live', 4, 'twice'), text: 'twice' },
    { at: said('live', 4, 'late'), text: 'late' },
  ]
  return (
    <>
      <Eyebrow>The receipt, line by line</Eyebrow>
      <div style={{ marginTop: 10, font: `500 24px ${FONT.ui}`, color: C.mutedOnInk }}>
        Four scripted customers, one after another, in PayPal’s sandbox
      </div>
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {named.map((group) => {
          const rows = leaks.filter((leak) => leak.persona === group.persona && frame >= leak.frame)
          return (
            <div
              key={group.persona}
              style={{
                ...presence(frame, group.at, Number.POSITIVE_INFINITY, 6),
                // The group being told is bright; the others step back until the total.
                opacity:
                  presence(frame, group.at, Number.POSITIVE_INFINITY, 6).opacity *
                  (done || group.persona === current ? 1 : 0.5),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                <Eyebrow color={C.leakOnInk}>▼ {nameOf(group.persona)}</Eyebrow>
                {group.persona === 'echo'
                  ? echoChips
                      .filter((chip) => frame >= chip.at)
                      .map((chip) => <Term key={chip.text}>{chip.text}</Term>)
                  : null}
              </div>
              {rows.map((row) => (
                <div
                  key={row.t}
                  style={{
                    marginTop: 5,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 24,
                    ...presence(frame, row.frame, Number.POSITIVE_INFINITY, 6),
                  }}
                >
                  <span style={{ font: `500 28px/1.25 ${FONT.ui}` }}>{brokeOf(row)}</span>
                  <span
                    style={{
                      flex: 'none',
                      font: `600 28px ${FONT.mono}`,
                      color: C.leakOnInk,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatCents(row.amountCents)}
                  </span>
                </div>
              ))}
              {group.persona === 'echo' && rows.length > 0 ? (
                <div style={{ marginTop: 4, font: `500 18px ${FONT.mono}`, color: C.mutedOnInk }}>
                  judged from my shop’s own records
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {done ? (
        <div
          style={{
            position: 'absolute',
            left: 88,
            right: 64,
            bottom: 150,
            paddingTop: 16,
            borderTop: `2px solid ${C.paper}`,
            ...presence(frame, total, Number.POSITIVE_INFINITY, 8),
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ font: `600 30px ${FONT.mono}`, letterSpacing: '0.06em' }}>
              {LEAKS} LEAKS
            </span>
            <span style={{ font: `600 84px/1 ${FONT.mono}`, color: C.leakOnInk }}>{TOTAL}</span>
          </div>
          <div
            style={{
              marginTop: 12,
              textAlign: 'right',
              font: `500 22px ${FONT.mono}`,
              color: C.mutedOnInk,
              ...presence(frame, total + 15, Number.POSITIVE_INFINITY, 8),
            }}
          >
            {MERCHANT} my shop would lose · {CUSTOMER} a customer overpaid
          </div>
        </div>
      ) : null}
    </>
  )
}

/** A live run on the site: the click, then each leak as the voice names it. */
export function Live() {
  const take = useTake('live-run')
  if (!take) return <Stage />
  const { cut, end, leaks, split } = liveCut(take)
  const tape = markOf(take, 'run-done')?.box
  const view = tape ? receiptView(tape) : undefined
  const camera: CameraKey[] = view ? [{ ...view, at: split, frames: 22 }] : []
  const live = scene('live')
  const allLeaks = leaksOf(take)
  const settled = leaks.at(-1)?.frame ?? end
  const total = said('live', 7, '$')
  const right = (segment: Placed) => segment.start + segment.frames > split
  return (
    <Stage>
      <Ramped
        take="live-run"
        cut={cut}
        camera={camera}
        tag="LIVE · PayPal sandbox"
        tagAt={(segment) => (right(segment) ? RIGHT_TAG : undefined)}
        veil={(segment) => (right(segment) ? PANEL : undefined)}
      >
        {(ms) => {
          // The line that printed last, swiped as the panel names it.
          const latest = allLeaks.filter((leak) => leak.t * 1000 <= ms).pop()
          return latest?.box ? (
            <Highlight box={latest.box} t={(ms - latest.t * 1000) / 260} />
          ) : null
        }}
      </Ramped>
      <Sequence from={split}>
        <Panel at={1}>
          <Tally leaks={leaks} total={Math.max(total, settled)} offset={split} />
        </Panel>
      </Sequence>
      <Voiceover scene={live} />
    </Stage>
  )
}

// ---------- one leak, followed to PayPal ----------

/** When the proof scene says each fact of the leak it follows, in frames of the scene. */
interface Said {
  approved: number
  swapped: number
  captured: number
  shipped: number
  leaked: number
}

/**
 * One leak, followed: the console's evidence lit line by line as the voice says it, the sum worked
 * out beside it, then PayPal's own record of the same payment, and the Cart Shuffler's other leak.
 */
export function Proof() {
  const take = useTake('console')
  const dashboard = useTake('dashboard')
  if (!take) return <Stage />
  const proof = scene('proof')
  const facts: Said = {
    approved: said('proof', 0, 'approved'),
    swapped: said('proof', 1, 'saddlebags'),
    captured: said('proof', 2, 'collected'),
    shipped: said('proof', 3, 'shipped'),
    leaked: said('proof', 4, 'unpaid'),
  }
  // From just before the click on the leak, so the console opens on the receipt line it was.
  const from = Math.max(0, markAt(take, 'leak') - 0.4)
  // The click on the leak line; the camera leaves the filtered scoreboard as it lands.
  const clicked = (take.events.find((e) => e.type === 'click' && e.t / 1000 > from)?.t ?? 0) / 1000
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
            at: s(clicked - from) + 3,
            frames: 20,
            box: finding,
            scale: 2.3,
            center: RIGHT,
          },
        ]
      : []),
  ]
  // One line of the finding lit at a time, as the voice reaches what it says.
  const lit: [number, string][] = [
    [facts.approved, 'cart-at-checkout'],
    [facts.swapped, 'cart-at-capture'],
    [facts.captured, 'captured'],
    [facts.shipped, 'shipped'],
    [facts.leaked, 'detail'],
  ]
  return (
    <Stage>
      <Sequence durationInFrames={PROOF_DASHBOARD}>
        <Footage
          take="console"
          from={from}
          to={to}
          tag="LIVE · my console, built on AG Studio"
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
          <Followed said={facts} />
        </Panel>
      </Sequence>
      <Sequence from={PROOF_DASHBOARD}>
        {dashboard ? (
          <PayPalRecord
            take={dashboard}
            from={PROOF_DASHBOARD}
            panelAt={saying('proof', 6) - 4 - PROOF_DASHBOARD}
          />
        ) : (
          <Placeholder
            title="The same order in your PayPal sandbox dashboard"
            detail={`You sign in and record this (VIDEO_PIPELINE §3.5): PayPal order ${WORST.order}, the ${WORST.captured} capture ${WORST.captureId}, as in the finding.`}
          />
        )}
      </Sequence>
      <Sequence from={saying('proof', 6) - 4}>
        <Panel at={1}>
          <TwoLeaks />
        </Panel>
      </Sequence>
      <Voiceover scene={proof} />
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

/** The panel beside the console: the receipt line it follows, then that leak worked out. */
function Followed({ said: at }: { said: Said }) {
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
        <span>{SWAPPED_LEAK}</span>
        <span style={{ font: `600 30px ${FONT.mono}`, color: C.leakOnInk }}>
          {money(-WORST.leakCents)}
        </span>
      </div>
      <div style={{ height: 24 }} />
      <Fact
        at={at.approved}
        lit={at.captured}
        label="PayPal collected"
        amount={WORST.captured}
        from={`for ${approved.qty} × ${approved.name}: the cart it approved`}
      />
      <Fact
        at={at.swapped}
        lit={at.shipped}
        label="My shop shipped"
        amount={WORST.shipped}
        from={`${swapped.qty} × ${swapped.name} (saddlebags): the cart it sent after`}
      />
      <div
        style={{
          marginTop: 34,
          paddingTop: 20,
          borderTop: `2px solid ${C.paper}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          ...presence(frame, at.leaked, Number.POSITIVE_INFINITY, 8),
        }}
      >
        <span style={{ font: `600 30px ${FONT.mono}`, letterSpacing: '0.06em' }}>UNPAID</span>
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
          ...presence(frame, at.leaked + 6, Number.POSITIVE_INFINITY, 8),
        }}
      >
        {WORST.shipped} − {WORST.captured}
      </div>
    </>
  )
}

/** The Cart Shuffler's two leaks as one bar: the followed one, then the price it set itself. */
function TwoLeaks() {
  const frame = useCurrentFrame()
  const start = saying('proof', 6) - 4
  const ownAt = said('proof', 6, '$') - start
  const totalAt = said('proof', 6, 'paid') - start
  const swappedCents = WORST.leakCents
  const ownCents = OWN_PRICE.leakCents
  const width = PANEL - 88 - 64
  const part = (cents: number) => (width * cents) / (swappedCents + ownCents)
  const line = runs.hero.before.find((b) => b.personaId === 'cart-shuffler')
  return (
    <>
      <Eyebrow color={C.leakOnInk}>▼ {nameOf('cart-shuffler')} · two leaks</Eyebrow>
      <div style={{ marginTop: 40, display: 'flex', height: 64, gap: 4 }}>
        <div style={{ width: part(swappedCents), background: C.leakOnInk, borderRadius: 6 }} />
        <div
          style={{
            width: part(ownCents),
            background: C.leakOnInk,
            borderRadius: 6,
            opacity: 0.25 + 0.75 * ramp(frame, ownAt, ownAt + 10),
          }}
        />
      </div>
      {[
        { at: 0, cents: swappedCents, text: SWAPPED_LEAK },
        { at: ownAt, cents: ownCents, text: OWN_PRICE_LEAK },
      ].map((row) => (
        <div
          key={row.text}
          style={{
            marginTop: 22,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 20,
            ...presence(frame, row.at, Number.POSITIVE_INFINITY, 8),
          }}
        >
          <span style={{ font: `500 30px/1.25 ${FONT.ui}` }}>{row.text}</span>
          <span style={{ flex: 'none', font: `600 32px ${FONT.mono}`, color: C.leakOnInk }}>
            {money(-row.cents)}
          </span>
        </div>
      ))}
      <div
        style={{
          marginTop: 34,
          paddingTop: 18,
          borderTop: `2px solid ${C.paper}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          ...presence(frame, totalAt, Number.POSITIVE_INFINITY, 8),
        }}
      >
        <span style={{ font: `600 30px ${FONT.mono}`, letterSpacing: '0.06em' }}>
          ITS RECEIPT LINE
        </span>
        <span style={{ font: `600 72px/1 ${FONT.mono}`, color: C.leakOnInk }}>
          {formatCents(line?.amountCents ?? -(swappedCents + ownCents))}
        </span>
      </div>
    </>
  )
}

/** The order-details row on PayPal's transaction page ("Alpaca-blend trail socks"), measured. */
const ORDER_ROW: Box = { x: 280, y: 868, width: 1380, height: 50 }

/**
 * PayPal's own record of the same payment: the sandbox account's transaction details, recorded in
 * a window you signed in to (capture.ts, take `dashboard`). The amount is lit as the voice says
 * it, then the order's one line, the socks; a callout keeps the sum in view.
 */
function PayPalRecord({
  take,
  from: sceneFrom,
  panelAt,
}: {
  take: Take
  from: number
  /** When the two-leak panel slides in over the left of the frame, in frames of this clip. */
  panelAt: number
}) {
  const from = Math.max(0, markAt(take, 'heading') - 0.4)
  const to = take.durationMs / 1000 - 0.1
  const amount = markOf(take, 'amount')
  const amountAt = said('proof', 5, '$') - sceneFrom
  const socksAt = said('proof', 5, 'socks') - sceneFrom
  return (
    <>
      <Footage
        take="dashboard"
        from={from}
        to={to}
        tag="LIVE · PayPal’s sandbox dashboard"
        // The take's cursor rests on the transaction ID; the highlights do the pointing here.
        cursor={false}
        camera={[
          // From PayPal's "Payment received" down to the order's line items.
          { at: 0, frames: 0, box: { x: 280, y: 300, width: 1380, height: 600 }, scale: 1.15 },
          // Then right of the panel: the amount, and the socks line's own $18.00.
          {
            at: panelAt,
            frames: 22,
            box: { x: 1100, y: 300, width: 600, height: 620 },
            scale: 1.25,
            center: RIGHT,
          },
        ]}
      >
        {(ms) => {
          const frame = (ms / 1000 - from) * FPS
          return (
            <>
              {amount?.box ? <Highlight box={amount.box} t={(frame - amountAt) / 8} /> : null}
              <Highlight box={ORDER_ROW} t={(frame - socksAt) / 8} />
            </>
          )
        }}
      </Footage>
      <Callout
        from={s(0.6)}
        to={panelAt + 6}
        who={nameOf('cart-shuffler')}
        label="PayPal’s record"
        what={`PayPal collected ${WORST.captured}, for socks. My shop shipped ${WORST.shipped}.`}
        amount={money(-WORST.leakCents)}
        x={440}
        y={560}
        width={1040}
      />
    </>
  )
}

// ---------- what the AI said vs what the money did ----------

/**
 * The Policy Lawyer's recorded run: my written policy, the scripted request, Lulu's reply (Lulu is
 * Claude, the AI being tested), then PayPal's refunds read by plain code, and the verdict.
 */
export function AiVsCode() {
  const frame = useCurrentFrame()
  const take = useTake('exhibit')
  if (!take) return <Stage />
  const vo = scene('ai-vs-code')
  // From the moment the page has loaded.
  const from = Math.max(0, markAt(take, 'exhibit') - 0.5)
  const length = Math.min(take.durationMs / 1000 - 0.1 - from, 10.4)
  const chat = markOf(take, 'chat')?.box
  const ledger = markOf(take, 'ledger')?.box
  const reply = saying('ai-vs-code', 2)
  const ledgerAt = saying('ai-vs-code', 3)
  const asked = saying('ai-vs-code', 1)
  const camera: CameraKey[] = [
    ...(chat ? [{ at: 0, frames: 0, box: chat, scale: 1.6 }] : []),
    ...(chat ? [{ at: reply - 8, frames: 24, box: chat, scale: 1.9 }] : []),
    ...(ledger ? [{ at: ledgerAt - 8, frames: 26, box: ledger, scale: 1.8 }] : []),
  ]
  const end = s(length)
  const recorded = /· (\w+ \d+),/.exec(runs.hero.label)?.[1] ?? ''
  const tag = `LIVE · the Shakedown site · recorded run${recorded ? `, ${recorded}` : ''}`
  const why = runs.exhibit.verdict.why
  return (
    <Stage>
      <Sequence durationInFrames={end}>
        <Footage
          take="exhibit"
          from={from}
          to={from + length}
          tag={tag}
          camera={camera}
          cursor={false}
        />
      </Sequence>
      <Sequence from={end}>
        <Held
          take="exhibit"
          at={from + length - 0.1}
          view={ledger ? { box: ledger, scale: 1.8 } : undefined}
          tag={tag}
        />
      </Sequence>
      {/* My written policy, said first, then kept in the corner. */}
      <div
        style={{
          position: 'absolute',
          right: 40,
          top: frame < asked ? 120 : 36,
          width: frame < asked ? 620 : 470,
          padding: frame < asked ? '22px 28px' : '12px 18px',
          borderRadius: 12,
          background: C.surface,
          border: `3px solid ${C.ink}`,
          ...presence(frame, 4, Number.POSITIVE_INFINITY, 8),
        }}
      >
        <div style={{ font: `600 20px ${FONT.mono}`, letterSpacing: '0.1em', color: C.muted }}>
          MY WRITTEN POLICY
        </div>
        <div style={{ marginTop: 6, font: `600 ${frame < asked ? 34 : 24}px/1.25 ${FONT.ui}` }}>
          Over {POLICY.limit} an order, a person decides.
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 40,
          bottom: 150,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          ...presence(frame, asked, ledgerAt - 4, 8),
        }}
      >
        {['Policy Lawyer · scripted lines', 'Lulu · Claude, the AI being tested'].map((label) => (
          <span
            key={label}
            style={{
              alignSelf: 'flex-start',
              padding: '8px 18px',
              borderRadius: 999,
              background: C.ink,
              color: C.surface,
              font: `600 22px ${FONT.mono}`,
            }}
          >
            {label}
          </span>
        ))}
      </div>
      <Callout
        from={said('ai-vs-code', 3, 'second')}
        to={framesOf(vo) + 4}
        who={nameOf('policy-lawyer')}
        what={`Refund 2 broke my policy. ${why}`}
        amount={`−${POLICY_EXCESS}`}
        x={440}
        y={736}
        width={1040}
      />
      <Voiceover scene={vo} />
    </Stage>
  )
}

// ---------- the fix, the same test again, and CI ----------

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
  const lit = said('fix', 0, 'shipping')
  return (
    <>
      <Eyebrow>Every leak, its fix</Eyebrow>
      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {FIXED.map(({ persona, fix }, i) => {
          const result = results.get(persona)
          const done = frame >= sealed
          const verdict = done ? (result?.verdict ?? 'sealed') : 'leak'
          const color =
            verdict === 'sealed' ? C.sealedOnInk : verdict === 'leak' ? C.leakOnInk : C.paper
          const word =
            verdict === 'sealed' ? '✓ Sealed' : verdict === 'leak' ? '▼ Leaked' : '? Unproven'
          return (
            <div key={persona} style={presence(frame, 8 + i * 9, Number.POSITIVE_INFINITY, 8)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
                <Eyebrow color={C.paper}>{nameOf(persona)}</Eyebrow>
                <Eyebrow color={color}>{word}</Eyebrow>
              </div>
              <div style={{ marginTop: 6, font: `500 30px/1.25 ${FONT.ui}` }}>
                {persona === 'cart-shuffler' ? (
                  <Swipe at={lit} tone="ink">
                    {fix}
                  </Swipe>
                ) : (
                  fix
                )}
              </div>
              {done && verdict === 'inconclusive' ? (
                <div style={{ marginTop: 4, font: `500 22px ${FONT.mono}`, color: C.mutedOnInk }}>
                  Only PayPal can sign those messages
                </div>
              ) : null}
            </div>
          )
        })}
        <div style={presence(frame, 8 + FIXED.length * 9, Number.POSITIVE_INFINITY, 8)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
            <Eyebrow color={C.paper}>{nameOf('policy-lawyer')}</Eyebrow>
            <Eyebrow>Tested separately</Eyebrow>
          </div>
          <div style={{ marginTop: 6, font: `500 30px/1.25 ${FONT.ui}` }}>
            Over {POLICY.limit} an order, a person decides
          </div>
        </div>
      </div>
    </>
  )
}

/** The fix: name one, switch them on, the same test again at $0; then the check in CI. */
export function Fix() {
  const take = useTake('live-run')
  const ci = useTake('ci')
  if (!take || !ci) return <Stage />
  const { cut, end, sealed } = fixCut(take)
  const tape = markOf(take, 'rerun-sealed')?.box ?? markOf(take, 'run-done')?.box
  const view = tape ? receiptView(tape) : undefined
  const ciFrom = 1.0
  const terminal = markOf(ci, 'terminal')?.box
  const comment = markOf(ci, 'comment')?.box
  const clicked = (ci.events.find((e) => e.type === 'click')?.t ?? 3700) / 1000
  const ciCamera: CameraKey[] = [
    ...(terminal ? [{ at: 0, frames: 0, box: terminal, scale: 1.45 }] : []),
    ...(comment ? [{ at: s(clicked - ciFrom) + 14, frames: 24, box: comment, scale: 1.75 }] : []),
  ]
  const fix = scene('fix')
  const ciLength = Math.min(
    s(Math.min(ci.durationMs / 1000 - 0.1, 8.4) - ciFrom),
    framesOf(fix) - end,
  )
  return (
    <Stage>
      <Sequence durationInFrames={end}>
        <Ramped
          take="live-run"
          cut={cut}
          camera={view ? [{ ...view, at: 0, frames: 0 }] : []}
          tag="LIVE · PayPal sandbox"
          tagAt={() => RIGHT_TAG}
          veil={() => PANEL}
        />
        <Panel at={1}>
          <Fixes sealed={sealed} results={rerunOf(take)} />
        </Panel>
      </Sequence>
      <Sequence from={end} durationInFrames={ciLength}>
        <Footage
          take="ci"
          from={ciFrom}
          to={ciFrom + ciLength / FPS}
          tag="LIVE · the Shakedown site"
          camera={ciCamera}
        />
      </Sequence>
      <Sequence from={end + ciLength}>
        <Held
          take="ci"
          at={ciFrom + ciLength / FPS - 0.05}
          view={comment ? { box: comment, scale: 1.75 } : undefined}
          tag="LIVE · the Shakedown site"
        />
      </Sequence>
      <Callout
        from={said('fix', 5, 'fails')}
        to={framesOf(fix) + 4}
        who="every pull request"
        label="The check"
        what="A leak that comes back fails the check."
        amount="exit 1"
        x={440}
        y={736}
        width={1040}
      />
      <Voiceover scene={fix} />
    </Stage>
  )
}

// ---------- the close ----------

const NODES = [
  { label: 'Scripted customers', sub: 'fixed, seeded scripts · no AI' },
  { label: 'Your store', sub: 'checkout, “paid” messages, AI assistant', who: 'AI' },
  { label: 'PayPal sandbox', sub: 'Orders v2 · Payments v2 · webhook signatures' },
  { label: 'Plain-code checks', sub: 'PayPal’s records vs the store’s', who: 'Code' },
  { label: 'The receipt', sub: 'each leak, and its fix' },
]

/** The tester tested; how it decides, in one drawing; the fix sent upstream; the end card. */
export function Close() {
  const frame = useCurrentFrame()
  const close = scene('close')
  const card = CLOSE_CARD
  const drawing = saying('close', 1)
  const upstream = saying('close', 2)
  const width = 300
  const gap = 56
  const left = (1920 - (NODES.length * width + (NODES.length - 1) * gap)) / 2
  return (
    <Stage>
      <Sequence durationInFrames={drawing}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 40 }}>
          <div
            style={{
              font: `600 28px ${FONT.mono}`,
              letterSpacing: '0.12em',
              color: C.muted,
              ...presence(frame, 4, drawing, 8),
            }}
          >
            THE TESTER, TESTED
          </div>
          {[
            `${EVAL.leakyCases} cases with a bug on: all ${EVAL.caught} caught`,
            `${EVAL.sealedCases} cases with it fixed: ${EVAL.falseAlarms} false alarms`,
          ].map((text, i) => (
            <div
              key={text}
              style={{
                font: `800 76px ${FONT.display}`,
                fontVariationSettings: '"wdth" 80',
                ...presence(frame, 10 + i * 30, drawing, 8),
              }}
            >
              {text}
            </div>
          ))}
        </AbsoluteFill>
      </Sequence>
      <Sequence from={drawing} durationInFrames={card - drawing}>
        <CloseDrawing
          left={left}
          width={width}
          gap={gap}
          upstream={upstream - drawing}
          from={drawing}
        />
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
            Sandbox only · test your own store
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
      <Voiceover scene={close} />
    </Stage>
  )
}

/** How it decides, in one drawing: Claude explains, plain code decides; then the fix upstream. */
function CloseDrawing({
  left,
  width,
  gap,
  upstream,
  from,
}: {
  left: number
  width: number
  gap: number
  upstream: number
  from: number
}) {
  const frame = useCurrentFrame()
  const claude = said('close', 1, 'Claude') - from
  const code = said('close', 1, 'plain') - from
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: 130,
          width: '100%',
          textAlign: 'center',
          font: `800 72px ${FONT.display}`,
          fontVariationSettings: '"wdth" 80',
          ...presence(frame, 2, Number.POSITIVE_INFINITY),
        }}
      >
        Claude explains. <Swipe at={code}>Plain code decides.</Swipe>
      </div>
      {NODES.map((node, i) => {
        const at = 6 + i * 10
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
                  top: 405,
                  ...presence(frame, at - 4, Number.POSITIVE_INFINITY),
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
                top: 320,
                width,
                height: 204,
                boxSizing: 'border-box',
                padding: '26px 24px',
                borderRadius: 14,
                border: `3px solid ${C.ink}`,
                background: ink ? C.ink : C.surface,
                color: ink ? C.surface : C.ink,
                ...presence(frame, at, Number.POSITIVE_INFINITY),
              }}
            >
              <div
                style={{ font: `800 38px/1 ${FONT.display}`, fontVariationSettings: '"wdth" 82' }}
              >
                {node.label}
              </div>
              <div style={{ marginTop: 14, font: `500 24px/1.3 ${FONT.ui}`, opacity: 0.85 }}>
                {node.sub}
              </div>
            </div>
            {node.who ? (
              <div
                style={{
                  position: 'absolute',
                  left: x + width / 2 - 330,
                  top: 560,
                  width: 660,
                  textAlign: 'center',
                  ...presence(frame, ink ? code : claude, Number.POSITIVE_INFINITY),
                }}
              >
                <div style={{ margin: '0 auto 14px', width: 3, height: 34, background: C.ink }} />
                <span
                  style={{
                    padding: '8px 18px',
                    borderRadius: 999,
                    background: ink ? C.ink : C.highlighter,
                    color: ink ? C.surface : C.ink,
                    font: `600 22px ${FONT.mono}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ink
                    ? 'Code: every verdict, from the records'
                    : 'Claude: runs Lulu · reads your policy · explains'}
                </span>
              </div>
            ) : null}
          </div>
        )
      })}
      <div
        style={{
          position: 'absolute',
          left: 360,
          right: 360,
          top: 720,
          padding: '18px 30px',
          borderRadius: 12,
          background: C.surface,
          border: `3px solid ${C.ink}`,
          textAlign: 'center',
          ...presence(frame, upstream, Number.POSITIVE_INFINITY, 8),
        }}
      >
        <div style={{ font: `600 20px ${FONT.mono}`, letterSpacing: '0.1em', color: C.muted }}>
          FIX SENT UPSTREAM · {runs.upstream.status.toUpperCase()}
        </div>
        <div style={{ marginTop: 6, font: `600 30px ${FONT.ui}` }}>
          {runs.upstream.project}: {runs.upstream.what}
        </div>
      </div>
    </AbsoluteFill>
  )
}
