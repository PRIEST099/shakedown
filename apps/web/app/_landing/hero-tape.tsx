'use client'

import { formatCents, HERO_TIMING, heroFrame, type RunFixture, Tape } from '@shakedown/ui'
import type { CSSProperties } from 'react'
import { usePlayhead } from '../../lib/use-playhead'
import { useDemo } from './demo-context'

/**
 * The hero receipt: a recorded sandbox run prints line by line, the total ticks, the tape tears,
 * the re-run prints sealed, the total rolls to $0.00 and the stamp lands. Under five seconds, then
 * it stops (DESIGN_SPEC §3.1). It is labelled as a recording, because it is one. Only this part of
 * the hero re-renders on each frame.
 */
export function HeroTape({ run }: { run: RunFixture & { recordedOn: string } }) {
  const hero = usePlayhead(HERO_TIMING.endMs)
  const { requestRun } = useDemo()
  const frame = heroFrame(run, hero.t)
  const meta = `Sandbox · ${run.store} · run ${run.runId}`
  const leaked = run.before.reduce((sum, line) => sum + line.amountCents, 0)

  return (
    <div className="hero__tape">
      {hero.reducedMotion ? (
        <div className="hero__static">
          <div className="hero__static-before">
            <Tape
              meta={meta}
              lines={run.before}
              total={{ fromCents: 0, toCents: leaked, progress: 1 }}
              tone="leak"
            />
          </div>
          <div>
            <Tape
              meta={meta}
              lines={run.after}
              total={{ fromCents: leaked, toCents: 0, progress: 1 }}
              tone="sealed"
              stamp={{ text: 'SEALED', progress: 1 }}
            />
            <p className="hero__was">Was {formatCents(leaked)} before the fixes.</p>
          </div>
        </div>
      ) : (
        <div className="hero__stack">
          {frame.afterVisible ? (
            <Tape
              meta={meta}
              lines={run.after}
              lineFrames={frame.after.lines}
              total={frame.after.total}
              tone="sealed"
              shakePx={frame.after.shakePx}
              stamp={{ text: 'SEALED', progress: frame.stamp }}
            />
          ) : null}
          {frame.before.tear < 1 ? (
            <Tape
              meta={meta}
              lines={run.before}
              lineFrames={frame.before.lines}
              total={frame.before.total}
              tone="leak"
              tear={frame.before.tear}
              action={
                <button
                  type="button"
                  className="seal-chip"
                  style={{ '--sweep': frame.before.emphasis.toFixed(3) } as CSSProperties}
                  onClick={() => hero.playFrom(HERO_TIMING.tearAt)}
                >
                  Seal it →
                </button>
              }
            />
          ) : null}
        </div>
      )}
      <p className="hero__caption">
        <span>
          {run.label} · {run.store}
        </span>
        <span className="hero__caption-actions">
          {/* With reduced motion there is nothing to replay: the tapes are already static. */}
          {hero.reducedMotion ? null : (
            <button type="button" className="link-btn" onClick={() => hero.playFrom(0)}>
              Replay ↺
            </button>
          )}
          <button type="button" className="link-btn" onClick={requestRun}>
            Run it live →
          </button>
        </span>
      </p>
      {/* Announce the result once, not every tick. */}
      <p className="sd-sr-only" aria-live="polite">
        {hero.done
          ? `Recorded run: ${formatCents(leaked)} would have leaked across ${run.before.length} customers. After the fixes: $0.00.`
          : ''}
      </p>
    </div>
  )
}

/** The hero's primary call to action: scroll to the demo and start a live run. */
export function RunDemoButton() {
  const { requestRun } = useDemo()
  return (
    <button type="button" className="btn btn-primary btn-lg" onClick={requestRun}>
      Run the demo shakedown
    </button>
  )
}
