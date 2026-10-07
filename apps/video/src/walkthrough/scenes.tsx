import type { ReactNode } from 'react'
import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { type CameraKey, Footage, Highlight, markAt, markOf, useTake } from '../footage'
import { Mark, Voiceover } from '../kit'
import { framesOf } from '../script'
import { C, FONT, presence, ramp, Stage } from '../theme'
import { type Box, follow, type Placed, type Take, type TakeName } from '../timeline'
import {
  Arrive,
  BrowserWindow,
  Chip,
  Desk,
  Note,
  TERMINAL,
  TerminalWindow,
  type TermLine,
} from './chrome'
import { LEAKY, plain, SEALED_RUN, type Seg } from './cli'
import { ECHO_ITEM, type WSceneId, wScene } from './script'
import {
  cliTimes,
  doubleCut,
  echoCut,
  endOf,
  fixTimes,
  flowCut,
  introCut,
  meetCut,
  receiptTimes,
  said,
} from './timeline'

const RECORDED = 'Recorded Oct 7, 2026 · PayPal sandbox'
const RUN_NOTE = 'Recorded sandbox run, Oct 4, 2026 · sped up'
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** A cut of one take: consecutive segments, each at its own speed, in the browser window. */
function Played({
  take,
  cut,
  camera = [],
  children,
}: {
  take: TakeName
  cut: readonly Placed[]
  camera?: readonly CameraKey[]
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
            camera={camera.map((key) => ({ ...key, at: key.at - segment.start }))}
          >
            {children}
          </Footage>
        </Sequence>
      ))}
    </>
  )
}

const boxOf = (take: Take | undefined, label: string): Box =>
  markOf(take, label)?.box ?? { x: 0, y: 0, width: 1920, height: 1080 }

function Scene({ id, children }: { id: WSceneId; children: ReactNode }) {
  return (
    <Stage>
      <Desk>{children}</Desk>
      <Voiceover scene={wScene(id)} />
    </Stage>
  )
}

/** Part of a take lit by the highlighter, from a frame of the scene on (`at` is the frame now). */
function Lit({ box, from, at }: { box: Box; from: number; at: number }) {
  return <Highlight box={box} t={ramp(at, from, from + 10)} />
}

// ---------- 1. The shop ----------

export function WIntro() {
  const store = useTake('w-store')
  const frame = useCurrentFrame()
  if (!store) return null
  const cut = introCut(store)
  const banner = boxOf(store, 'banner')
  const zoomAt = said('w-intro', 2, 'sandbox') - 8
  return (
    <Scene id="w-intro">
      <BrowserWindow url="localhost:3100" note={RECORDED} rate={rateAt(cut, frame)}>
        <Played
          take="w-store"
          cut={cut}
          camera={[
            { at: 0, frames: 0, box: { x: 0, y: 0, width: 1920, height: 1080 }, scale: 1 },
            { at: zoomAt, frames: 22, box: banner, scale: 2.1, center: { x: 960, y: 260 } },
            { at: endOf('w-intro', 2) - 4, frames: 20, scale: 1 },
          ]}
        >
          {() => <Lit box={banner} from={said('w-intro', 2, 'pretend') - 4} at={frame} />}
        </Played>
      </BrowserWindow>
    </Scene>
  )
}

function rateAt(cut: readonly Placed[], frame: number) {
  return cut.find((s) => frame >= s.start && frame < s.start + s.frames)?.rate ?? 1
}

// ---------- 2. What happens when someone buys ----------

const STEPS = [
  { at: () => said('w-flow', 1), text: 'The customer approves the payment' },
  { at: () => said('w-flow', 2), text: 'PayPal collects the money' },
  { at: () => said('w-flow', 3), text: 'My shop’s own code decides what to ship' },
]

export function WFlow() {
  const store = useTake('w-store')
  const frame = useCurrentFrame()
  if (!store) return null
  const { cut, cart } = flowCut(store)
  const leaks = said('w-flow', 4)
  const pay = boxOf(store, 'pay')
  // Each part of the page as it is used: the guide's button, the cart link, the Pay section
  // while the email is typed, then the whole checkout, then PayPal's button.
  const camera: CameraKey[] = [
    { at: 0, frames: 0, box: boxOf(store, 'guide'), scale: 1.6, center: { x: 1150, y: 560 } },
    {
      at: cart - 16,
      frames: 16,
      box: boxOf(store, 'cart-link'),
      scale: 2.1,
      center: { x: 1250, y: 300 },
    },
    { at: said('w-flow', 1) - 12, frames: 18, box: pay, scale: 1.55, center: { x: 1230, y: 560 } },
    { at: said('w-flow', 3) - 6, frames: 22, scale: 1 },
    {
      at: said('w-flow', 4) + 12,
      frames: 22,
      box: boxOf(store, 'paypal'),
      scale: 1.7,
      center: { x: 1230, y: 470 },
    },
  ]
  return (
    <Scene id="w-flow">
      <BrowserWindow
        url={frame < cart + 4 ? 'localhost:3100' : 'localhost:3100/cart'}
        note={RECORDED}
        rate={rateAt(cut, frame)}
      >
        <Played take="w-store" cut={cut} camera={camera} />
      </BrowserWindow>
      <Note from={said('w-flow', 1) - 6} x={96} y={250} width={360} label="When someone buys">
        {STEPS.map((step, i) => {
          const at = step.at()
          const last = i === STEPS.length - 1
          const red = last && frame >= leaks
          return (
            <div
              key={step.text}
              style={{
                display: 'flex',
                gap: 14,
                marginTop: i ? 18 : 0,
                font: `600 27px/1.25 ${FONT.ui}`,
                color: red ? C.leakOnInk : C.surface,
                ...presence(frame, at, Number.POSITIVE_INFINITY, 8),
              }}
            >
              <span
                style={{ font: `600 24px ${FONT.mono}`, color: red ? C.leakOnInk : C.highlighter }}
              >
                {i + 1}
              </span>
              <span>{step.text}</span>
            </div>
          )
        })}
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: `1px solid rgb(255 253 248 / 0.2)`,
            font: `500 23px/1.3 ${FONT.ui}`,
            color: C.leakOnInk,
            ...presence(frame, leaks, Number.POSITIVE_INFINITY, 8),
          }}
        >
          ▲ Money leaks in my shop’s own code, where PayPal can’t see it.
        </div>
      </Note>
    </Scene>
  )
}

// ---------- 3. Leak one: the double click: drawn, then the order list it left ----------

function Box3({
  from,
  x,
  y,
  width,
  children,
  tone = 'paper',
}: {
  from: number
  x: number
  y: number
  width: number
  children: ReactNode
  tone?: 'paper' | 'leak' | 'ink'
}) {
  const frame = useCurrentFrame()
  if (frame < from) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        padding: '18px 22px',
        borderRadius: 12,
        background: tone === 'ink' ? C.ink : C.surface,
        color: tone === 'ink' ? C.surface : C.ink,
        border: `2px solid ${tone === 'leak' ? C.leak : tone === 'ink' ? C.ink : C.rule}`,
        boxShadow: '0 16px 36px -20px rgb(18 16 13 / 0.45)',
        ...presence(frame, from, Number.POSITIVE_INFINITY, 8),
      }}
    >
      {children}
    </div>
  )
}

function Arrow({ from, x, y, length }: { from: number; x: number; y: number; length: number }) {
  const frame = useCurrentFrame()
  const t = ramp(frame, from, from + 10)
  if (t <= 0) return null
  return (
    <svg
      width={length + 20}
      height={30}
      style={{ position: 'absolute', left: x, top: y - 15, overflow: 'visible' }}
    >
      <title>arrow</title>
      <line x1={0} y1={15} x2={length * t} y2={15} stroke={C.ink} strokeWidth={4} />
      {t > 0.9 ? (
        <path d={`M ${length - 4} 5 L ${length + 12} 15 L ${length - 4} 25 Z`} fill={C.ink} />
      ) : null}
    </svg>
  )
}

/** Where the drawing's Pay button is, so the cursor and its click land on it. */
const PAY_AT = { x: 351, y: 449 }

export function WDouble() {
  const store = useTake('w-store')
  const frame = useCurrentFrame()
  if (!store) return null
  const d = doubleCut(store)
  const press1 = said('w-double', 1, 'presses')
  const press2 = said('w-double', 1, 'again')
  const second = said('w-double', 2, 'second')
  const charged = said('w-double', 2, 'charged')
  const both = said('w-double', 2, 'both')
  const ring = (at: number) => {
    const age = frame - at
    if (age < 0 || age > 14) return null
    return (
      <div
        style={{
          position: 'absolute',
          left: PAY_AT.x - 30,
          top: PAY_AT.y - 30,
          width: 60,
          height: 60,
          borderRadius: 99,
          border: `4px solid ${C.ink}`,
          opacity: 1 - age / 14,
          transform: `scale(${0.4 + age / 10})`,
        }}
      />
    )
  }
  const slow = frame >= press1 + 4 && frame < second
  const drawing = frame < d.listAt + 8
  const fade = 1 - ramp(frame, d.listAt - 6, d.listAt + 6)
  const captures = (d.charged.captures ?? '').split(', ').filter(Boolean)
  const orders = (d.charged.orders ?? '').split(', ')
  const list = boxOf(store, 'orders')
  return (
    <Scene id="w-double">
      {frame < d.listAt ? (
        <BrowserWindow url="localhost:3100/cart" note="Illustration of what the double press does">
          <Footage take="w-store" from={d.still} to={d.still} rate={0} />
          <AbsoluteFill
            style={{ background: 'rgb(231 225 214 / 0.86)', opacity: ramp(frame, 0, 10) }}
          />
        </BrowserWindow>
      ) : (
        <BrowserWindow
          url="localhost:3100/orders"
          note="Recorded Oct 7, 2026 · one checkout submitted twice, as the Double-Clicker does"
        >
          <Sequence from={d.listAt}>
            <Played
              take="w-store"
              cut={d.cut}
              camera={[{ at: 4, frames: 20, box: list, scale: 1.45, center: { x: 960, y: 420 } }]}
            >
              {() => (
                <>
                  <Lit
                    box={boxOf(store, 'row:0')}
                    from={said('w-double', 3, '$') - d.listAt}
                    at={frame - d.listAt}
                  />
                  <Lit
                    box={boxOf(store, 'row:1')}
                    from={said('w-double', 3, 'each') - d.listAt}
                    at={frame - d.listAt}
                  />
                </>
              )}
            </Played>
          </Sequence>
        </BrowserWindow>
      )}
      <Chip from={said('w-double', 0) - 4} to={d.listAt} x={150} y={110}>
        Leak 1 · the double click
      </Chip>
      {drawing ? (
        <AbsoluteFill style={{ opacity: fade }}>
          {/* The customer's side: a Pay button, pressed twice. */}
          <div
            style={{
              position: 'absolute',
              left: 150,
              top: 300,
              font: `600 22px ${FONT.mono}`,
              letterSpacing: '0.1em',
              color: C.muted,
              ...presence(frame, press1 - 10, Number.POSITIVE_INFINITY, 8),
            }}
          >
            THE CUSTOMER
          </div>
          <Box3 from={press1 - 10} x={150} y={350} width={400}>
            <div style={{ font: `600 26px ${FONT.ui}` }}>Field guide · $24.00</div>
            <div
              style={{
                marginTop: 16,
                padding: '16px 0',
                borderRadius: 999,
                textAlign: 'center',
                background: C.highlighter,
                font: `700 28px ${FONT.ui}`,
              }}
            >
              {slow ? 'Pay…  (the page is slow)' : 'Pay'}
            </div>
            <div style={{ marginTop: 14, font: `500 22px ${FONT.ui}`, color: C.muted }}>
              {frame >= press2 ? 'Pressed twice' : frame >= press1 ? 'Pressed once' : ' '}
            </div>
          </Box3>
          {ring(press1)}
          {ring(press2)}
          {frame >= press1 - 12 && frame < second ? (
            // The arrow's tip sits on the button: the path starts at (3, 2) of its 28×34 box.
            <svg
              width="34"
              height="40"
              viewBox="0 0 28 34"
              style={{
                position: 'absolute',
                left: PAY_AT.x - 3.6,
                top: PAY_AT.y - 2.4,
                overflow: 'visible',
              }}
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
          ) : null}
          {/* My shop: one order per press. */}
          <div
            style={{
              position: 'absolute',
              left: 720,
              top: 300,
              font: `600 22px ${FONT.mono}`,
              letterSpacing: '0.1em',
              color: C.muted,
              ...presence(frame, press1 + 6, Number.POSITIVE_INFINITY, 8),
            }}
          >
            MY SHOP
          </div>
          <Arrow from={press1 + 4} x={570} y={430} length={130} />
          <Box3 from={press1 + 8} x={720} y={350} width={430}>
            <div style={{ font: `600 26px ${FONT.ui}` }}>Order 1 · $24.00</div>
          </Box3>
          <Arrow from={press2 + 4} x={570} y={560} length={130} />
          <Box3
            from={press2 + 8}
            x={720}
            y={500}
            width={430}
            tone={frame >= second ? 'leak' : 'paper'}
          >
            <div style={{ font: `600 26px ${FONT.ui}` }}>Order 2 · $24.00</div>
            <div
              style={{
                marginTop: 6,
                font: `500 21px ${FONT.ui}`,
                color: C.leak,
                ...presence(frame, second, Number.POSITIVE_INFINITY, 8),
              }}
            >
              A second order, for the same checkout
            </div>
          </Box3>
          {/* PayPal: both charged. */}
          <div
            style={{
              position: 'absolute',
              left: 1320,
              top: 300,
              font: `600 22px ${FONT.mono}`,
              letterSpacing: '0.1em',
              color: C.muted,
              ...presence(frame, charged - 6, Number.POSITIVE_INFINITY, 8),
            }}
          >
            PAYPAL
          </div>
          {[0, 1].map((i) => (
            <div key={i}>
              <Arrow from={charged + i * 10} x={1170} y={i ? 560 : 410} length={130} />
              <Box3 from={charged + 4 + i * 10} x={1320} y={i ? 500 : 350} width={450} tone="ink">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    font: `600 26px ${FONT.ui}`,
                  }}
                >
                  <span>Charged</span>
                  <span style={{ fontFamily: FONT.mono, color: C.leakOnInk }}>$24.00</span>
                </div>
              </Box3>
            </div>
          ))}
          <Box3 from={both} x={720} y={700} width={1050} tone="leak">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                font: `700 34px ${FONT.ui}`,
              }}
            >
              <span>One $24.00 checkout, charged twice</span>
              <span style={{ fontFamily: FONT.mono, color: C.leak }}>$48.00</span>
            </div>
          </Box3>
        </AbsoluteFill>
      ) : null}
      <Note
        from={said('w-double', 4) - 4}
        x={1060}
        y={600}
        width={760}
        label={`PayPal’s own record · ${orders.join(' and ')}`}
      >
        {captures.map((capture) => (
          <div key={capture} style={{ font: `500 25px/1.45 ${FONT.mono}`, color: C.sealedOnInk }}>
            ✓ {capture}
          </div>
        ))}
        <div style={{ marginTop: 10, font: `600 28px/1.35 ${FONT.ui}`, color: C.leakOnInk }}>
          Two good payments, for one checkout: $48.00 charged.
        </div>
      </Note>
    </Scene>
  )
}

// ---------- 4. Leak two: the echo, for real ----------

/** The command as it ran: curl, PayPal's event shape, and no signature headers at all. */
function curlLines(url: string, request: string): string[] {
  const event = JSON.parse(request) as Record<string, unknown> & {
    resource: Record<string, unknown> & { amount: Record<string, unknown> }
  }
  const j = (value: unknown) => JSON.stringify(value)
  const { amount, ...resource } = event.resource
  return [
    `curl -s -X POST ${url} \\`,
    `    -H 'content-type: application/json' \\`,
    `    -d '{"id": ${j(event.id)},`,
    `         "event_type": ${j(event.event_type)},`,
    `         "create_time": ${j(event.create_time)},`,
    `         "resource": {${Object.entries(resource)
      .slice(0, 2)
      .map(([k, v]) => `${j(k)}: ${j(v)}`)
      .join(', ')},`,
    `                      ${Object.entries(resource)
      .slice(2)
      .map(([k, v]) => `${j(k)}: ${j(v)}`)
      .join(', ')},`,
    `                      "amount": ${j(amount).replace(/,/g, ', ').replace(/:/g, ': ')}}}'`,
  ]
}

/** Lines of a command typed (or pasted) so far: the first after the prompt, the rest after it. */
function typed(command: string[], chars: number): TermLine[] {
  const out: TermLine[] = []
  let left = Math.max(0, Math.floor(chars))
  for (const [i, line] of command.entries()) {
    if (i > 0 && left <= 0) break
    const shown = line.slice(0, left)
    out.push(
      i === 0 ? { kind: 'prompt', text: line, typed: left } : { kind: 'out', segs: [[shown]] },
    )
    left -= line.length
  }
  return out
}

export function WEcho() {
  const echo = useTake('w-echo')
  const frame = useCurrentFrame()
  if (!echo) return null
  const e = echoCut(echo)
  const command = curlLines(e.url, e.request)
  const pasteFrom = said('w-echo', 5) + 6
  const chars = (frame - pasteFrom) * 9
  const answered = frame >= e.enter
  const lines: TermLine[] = [
    ...typed(command, chars),
    ...(answered ? [{ kind: 'out' as const, segs: [[e.response, 'mark']] as Seg[] }] : []),
    ...(answered ? [{ kind: 'prompt' as const, text: '', typed: 0 }] : []),
  ]
  const explain = said('w-echo', 1)
  const watch = said('w-echo', 3)
  const items = boxOf(echo, 'items')
  const payment = boxOf(echo, 'payment')
  const status = boxOf(echo, 'status')
  const shipments = boxOf(echo, 'shipments')
  const statusAfter = boxOf(echo, 'status-after')
  const shipmentsAfter = boxOf(echo, 'shipments-after')
  const paymentAfter = boxOf(echo, 'payment-after')
  const top = { x: 408, y: 154, width: 1104, height: 440 }
  const never = said('w-echo', 7)
  return (
    <Scene id="w-echo">
      <BrowserWindow
        url={`localhost:3100/orders/${e.order.orderNumber ?? ''}`}
        note={`${RECORDED} · on my machine`}
        rate={rateAt(e.cut, frame)}
      >
        <Played
          take="w-echo"
          cut={e.cut}
          camera={[
            {
              at: watch - 6,
              frames: 22,
              box: { ...items, width: payment.x + payment.width - items.x },
              scale: 1.45,
            },
            {
              at: said('w-echo', 4, 'awaiting') - 8,
              frames: 20,
              box: status,
              scale: 2.2,
              center: { x: 1300, y: 300 },
            },
            { at: said('w-echo', 4, 'nothing') - 8, frames: 20, box: shipments, scale: 1.5 },
            { at: said('w-echo', 5) - 4, frames: 22, scale: 1 },
            { at: e.shipped + 4, frames: 22, box: top, scale: 1.55 },
            { at: never - 6, frames: 22, scale: 1 },
          ]}
        >
          {() => (
            <>
              <Lit box={items} from={watch + 6} at={frame} />
              {frame < e.shipped ? (
                <>
                  <Lit box={status} from={said('w-echo', 4, 'awaiting')} at={frame} />
                  <Lit box={shipments} from={said('w-echo', 4, 'nothing')} at={frame} />
                </>
              ) : (
                <>
                  <Lit box={statusAfter} from={e.shipped + 8} at={frame} />
                  <Lit box={shipmentsAfter} from={e.shipped + 18} at={frame} />
                  <Lit box={paymentAfter} from={never} at={frame} />
                </>
              )}
            </>
          )}
        </Played>
        <AbsoluteFill
          style={{
            background: 'rgb(231 225 214 / 0.86)',
            opacity: 1 - ramp(frame, watch - 10, watch + 4),
          }}
        />
      </BrowserWindow>
      <Chip from={said('w-echo', 0) - 4} to={watch} x={150} y={110}>
        Leak 2 · the echo
      </Chip>
      <Note from={explain} to={watch - 2} x={560} y={330} width={800} label="After a payment">
        <div style={{ font: `600 34px/1.3 ${FONT.ui}` }}>
          PayPal → my shop: “this order is paid”
        </div>
        <div
          style={{
            marginTop: 14,
            font: `500 28px/1.35 ${FONT.ui}`,
            color: C.sealedOnInk,
            ...presence(frame, said('w-echo', 1, 'signed'), Number.POSITIVE_INFINITY, 8),
          }}
        >
          ✓ Signed, to prove it came from PayPal
        </div>
        <div
          style={{
            marginTop: 14,
            font: `600 28px/1.35 ${FONT.ui}`,
            color: C.leakOnInk,
            ...presence(frame, said('w-echo', 2), Number.POSITIVE_INFINITY, 8),
          }}
        >
          ✗ My shop never checks the signature
        </div>
      </Note>
      <Arrive from={said('w-echo', 5) - 2} to={e.shipped + 2}>
        <TerminalWindow
          title="zsh — ~/leaky-llama"
          note="Sent by hand · no signature"
          lines={lines}
          box={{ x: 640, y: 380, width: 1230, height: 560 }}
        />
      </Arrive>
      <Note
        from={never}
        x={1110}
        y={560}
        width={720}
        label={`PayPal’s own record · order ${e.paypal.status ? e.order.paypalOrderId : ''}`}
      >
        <div style={{ font: `600 30px/1.35 ${FONT.ui}` }}>
          Status: {e.paypal.status} (never approved)
        </div>
        <div style={{ marginTop: 8, font: `600 30px/1.35 ${FONT.ui}`, color: C.leakOnInk }}>
          Collected: nothing. My shop shipped a {usd(ECHO_ITEM.cents)} bottle.
        </div>
      </Note>
    </Scene>
  )
}

// ---------- 5. So I built Shakedown ----------

export function WMeet() {
  const site = useTake('w-site')
  const frame = useCurrentFrame()
  if (!site) return null
  const cut = meetCut(site)
  const problem = boxOf(site, 'problem')
  const names = said('w-meet', 3)
  return (
    <Scene id="w-meet">
      <BrowserWindow
        url="shakedown-web.onrender.com"
        note="Recorded Oct 7, 2026 · Shakedown’s site"
        rate={rateAt(cut, frame)}
      >
        <Played
          take="w-site"
          cut={cut}
          camera={[
            { at: 0, frames: 0, box: problem, scale: 1.7 },
            { at: said('w-meet', 1) - 6, frames: 26, scale: 1 },
            { at: names - 8, frames: 22, box: boxOf(site, 'ticker'), scale: 1.85 },
          ]}
        >
          {() => (
            <>
              {frame < said('w-meet', 2) ? (
                <Lit box={problem} from={said('w-meet', 0, 'test')} at={frame} />
              ) : null}
              <Lit
                box={boxOf(site, 'chip:Double-Clicker')}
                from={said('w-meet', 3, 'Double-Clicker')}
                at={frame}
              />
              <Lit box={boxOf(site, 'chip:Echo')} from={said('w-meet', 3, 'Echo')} at={frame} />
              <Lit
                box={boxOf(site, 'chip:Policy Lawyer')}
                from={said('w-meet', 3, 'AI')}
                at={frame}
              />
            </>
          )}
        </Played>
      </BrowserWindow>
    </Scene>
  )
}

// ---------- 6. One command ----------

/** The leaky run in the terminal, as far as it has printed at this frame of the film. */
function leakyLines(frame: number) {
  const t = cliTimes()
  const lines: TermLine[] = [
    { kind: 'prompt', text: LEAKY.command, typed: Math.max(0, (frame - t.typeFrom) * 2.2) },
  ]
  if (frame >= t.header)
    lines.push(
      { kind: 'out', segs: [] },
      { kind: 'out', segs: [[LEAKY.header]] },
      { kind: 'out', segs: [] },
    )
  for (const [i, at] of t.progress.entries())
    if (frame >= at) lines.push({ kind: 'out', segs: LEAKY.progress[i] ?? [] })
  return lines
}

export function WCli() {
  const frame = useCurrentFrame()
  const lines = leakyLines(frame)
  const npm = said('w-cli', 0)
  return (
    <Scene id="w-cli">
      <Arrive from={0}>
        <TerminalWindow
          title="zsh — ~/leaky-llama"
          note={RUN_NOTE}
          lines={lines}
          box={{ ...TERMINAL, y: 120, height: 860 }}
        />
      </Arrive>
      <Chip from={npm} x={230} y={36} tone="ink">
        npm · @shakedown-dev/cli
      </Chip>
      <Note
        from={said('w-cli', 3, 'checks')}
        x={1090}
        y={590}
        width={640}
        label="After each customer"
      >
        <div style={{ font: `600 30px/1.35 ${FONT.ui}` }}>What my shop did</div>
        <div style={{ font: `500 24px ${FONT.mono}`, color: C.mutedOnInk, margin: '4px 0' }}>
          checked against
        </div>
        <div style={{ font: `600 30px/1.35 ${FONT.ui}` }}>what really happened</div>
        <div style={{ marginTop: 6, font: `500 23px/1.35 ${FONT.ui}`, color: C.mutedOnInk }}>
          from PayPal’s own records, wherever money moved
        </div>
      </Note>
    </Scene>
  )
}

// ---------- 7. The receipt, and the report ----------

export function WReceipt() {
  const frame = useCurrentFrame()
  const report = useTake('report')
  const r = receiptTimes()
  const base = leakyLines(Number.POSITIVE_INFINITY)
  const printed = LEAKY.receipt.filter((_, i) => frame >= r.line(i))
  const lines: TermLine[] = [
    ...base,
    ...printed.map((segs) => ({ kind: 'out' as const, segs })),
    ...(frame >= r.done + 4
      ? [{ kind: 'out' as const, segs: [[LEAKY.reports, 'dim']] as Seg[] }]
      : []),
  ]
  const find = (text: string) =>
    lines.findIndex((line) => line.kind === 'out' && plain(line.segs).includes(text))
  const lit = [
    ...(frame >= said('w-receipt', 0) ? [find('LEAKS')] : []),
    ...(frame >= said('w-receipt', 1, '$') ? [find('MERCHANT LEAK')] : []),
    ...(frame >= said('w-receipt', 1, 'customer') ? [find('CUSTOMER HARM')] : []),
    ...(frame >= said('w-receipt', 2, 'report') ? [find('Reports:')] : []),
  ]
  const shown = r.report
  const double = boxOf(report, 'double')
  return (
    <Scene id="w-receipt">
      <TerminalWindow
        title="zsh — ~/leaky-llama"
        note={RUN_NOTE}
        lines={lines}
        lit={lit}
        box={{ ...TERMINAL, y: 120, height: 860 }}
      />
      {report ? (
        <Arrive from={shown}>
          <BrowserWindow
            url="file:///…/.shakedown/report.html"
            note="That run’s report, rendered by the CLI’s own code"
          >
            <Sequence from={shown}>
              <Played
                take="report"
                cut={follow(
                  [{ t: 1.3, at: 0 }],
                  framesOf(wScene('w-receipt')) - shown,
                  // Held on the double click's finding: the take scrolls on to the Echo after it.
                  markAt(report, 'double') + 2.5,
                )}
                camera={[
                  { at: 40, frames: 24, box: double, scale: 1.45 },
                  // Its fix, as the voice reads it: the last lines of the finding.
                  {
                    at: said('w-receipt', 3) - shown - 6,
                    frames: 22,
                    box: { ...double, y: double.y + double.height - 95, height: 95 },
                    scale: 1.9,
                  },
                ]}
              />
            </Sequence>
          </BrowserWindow>
        </Arrive>
      ) : null}
    </Scene>
  )
}

// ---------- 8. Fix it, and keep it fixed ----------

export function WFix() {
  const frame = useCurrentFrame()
  const ci = useTake('ci')
  const f = fixTimes()
  const printed = SEALED_RUN.receipt.filter((_, i) => frame >= f.line(i))
  const lines: TermLine[] = [
    { kind: 'prompt', text: SEALED_RUN.command, typed: Math.max(0, (frame - f.typeFrom) * 2.2) },
    ...(frame >= f.enter + 10
      ? [
          { kind: 'out' as const, segs: [] },
          { kind: 'out' as const, segs: [[SEALED_RUN.header]] as Seg[] },
          { kind: 'out' as const, segs: [] },
        ]
      : []),
    ...printed.map((segs) => ({ kind: 'out' as const, segs })),
  ]
  const find = (text: string) =>
    lines.findIndex((line) => line.kind === 'out' && plain(line.segs).includes(text))
  const lit = [
    ...(frame >= said('w-fix', 1) ? [find('MERCHANT LEAK'), find('SEALED')] : []),
    ...(frame >= said('w-fix', 1, 'where') ? [find('inconclusive')] : []),
  ].filter((i) => i >= 0)
  const workflow = boxOf(ci, 'workflow')
  const comment = boxOf(ci, 'comment')
  // The workflow and the pull-request comment, side by side.
  const both = {
    x: workflow.x,
    y: workflow.y,
    width: comment.x + comment.width - workflow.x,
    height: Math.max(workflow.height, comment.height),
  }
  const ciFrom = (markOf(ci, 'comment')?.t ?? 3000) / 1000 + 0.1
  const ciEnd = (ci?.durationMs ?? 12_000) / 1000 - 0.1
  return (
    <Scene id="w-fix">
      <TerminalWindow
        title="zsh — ~/leaky-llama"
        note="Recorded sandbox run, Oct 4, 2026 · the fixed shop"
        lines={lines}
        lit={lit}
        box={{ ...TERMINAL, y: 120, height: 860 }}
      />
      {ci ? (
        <Arrive from={f.ci}>
          <BrowserWindow
            url="shakedown-web.onrender.com/#cli"
            note="Shakedown’s site · the CI setup, and the leaky run’s comment"
          >
            <Sequence from={f.ci}>
              <Played
                take="ci"
                cut={follow([{ t: ciFrom, at: 0 }], framesOf(wScene('w-fix')) - f.ci, ciEnd)}
                camera={[{ at: 6, frames: 26, box: both, scale: 1.4 }]}
              />
            </Sequence>
          </BrowserWindow>
          <Note
            from={said('w-fix', 2, 'fails') - 4}
            x={1080}
            y={760}
            width={700}
            label="On every pull request"
          >
            <div style={{ font: `600 30px/1.35 ${FONT.ui}` }}>
              A leak comes back → <span style={{ color: C.leakOnInk }}>exit 1</span> → the check
              fails
            </div>
          </Note>
        </Arrive>
      ) : null}
    </Scene>
  )
}

// ---------- 9. Close ----------

/**
 * The wordmark as a cartoon title: the receipt mark pops in, then each letter of "shakedown"
 * drops into place one after another on a spring, overshooting and settling.
 */
function SpringWordmark({ from, size }: { from: number; size: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const bounce = (delay: number) =>
    spring({ frame: frame - from - delay, fps, config: { damping: 8, stiffness: 160, mass: 0.7 } })
  const mark = bounce(0)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.22, color: C.ink }}>
      <div style={{ transform: `scale(${mark}) rotate(${(1 - mark) * -25}deg)` }}>
        <Mark size={size * 1.05} />
      </div>
      <div
        style={{
          display: 'flex',
          font: `800 ${size}px ${FONT.display}`,
          fontVariationSettings: '"wdth" 80',
          letterSpacing: '-0.02em',
        }}
      >
        {[...'shakedown'].map((letter, i) => {
          const t = bounce(6 + i * 2.5)
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: the letters of one fixed word
              key={i}
              style={{
                display: 'inline-block',
                opacity: Math.min(1, t * 2),
                transform: `translateY(${(1 - t) * -90}px) scale(${0.5 + 0.5 * t}, ${0.4 + 0.6 * t})`,
                transformOrigin: '50% 100%',
              }}
            >
              {letter}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export function WClose() {
  const frame = useCurrentFrame()
  const line = said('w-close', 1)
  return (
    <Scene id="w-close">
      <AbsoluteFill
        style={{
          background: C.paper,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 34,
        }}
      >
        <SpringWordmark from={2} size={130} />
        <div
          style={{
            maxWidth: 1300,
            textAlign: 'center',
            font: `800 58px/1.12 ${FONT.display}`,
            fontVariationSettings: '"wdth" 80',
            ...presence(frame, line - 4, Number.POSITIVE_INFINITY, 10),
          }}
        >
          Let customers from hell find your leaks, before your real customers do.
        </div>
        <div
          style={{
            padding: '16px 30px',
            borderRadius: 12,
            background: '#191714',
            color: '#ebe5da',
            font: `500 32px ${FONT.mono}`,
            ...presence(frame, line + 30, Number.POSITIVE_INFINITY, 10),
          }}
        >
          <span style={{ color: '#8fc9a3' }}>$</span> npx @shakedown-dev/cli run --target &lt;your
          shop&gt;
        </div>
        <div
          style={{
            font: `500 26px ${FONT.ui}`,
            color: C.muted,
            ...presence(frame, line + 40, Number.POSITIVE_INFINITY, 10),
          }}
        >
          PayPal sandbox only · Open source · Built for the PayPal AI Hackathon 2026
        </div>
      </AbsoluteFill>
    </Scene>
  )
}
