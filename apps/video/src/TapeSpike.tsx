import '@shakedown/tokens/tokens.css'
import '@shakedown/ui/styles.css'
import { heroFrame, PLACEHOLDER_RUN, Tape } from '@shakedown/ui'
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'

const META = `Sandbox · ${PLACEHOLDER_RUN.store} · run #${PLACEHOLDER_RUN.runId}`

/** Spike S7b: the web's own Tape component, driven frame by frame instead of by requestAnimationFrame. */
export function TapeSpike() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const hero = heroFrame(PLACEHOLDER_RUN, (frame / fps) * 1000)

  return (
    <AbsoluteFill style={{ background: '#12100d', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'grid', width: 380, transform: 'scale(2)' }}>
        {hero.afterVisible ? (
          <div style={{ gridArea: '1 / 1' }}>
            <Tape
              meta={META}
              lines={PLACEHOLDER_RUN.after}
              lineFrames={hero.after.lines}
              total={hero.after.total}
              tone="sealed"
              shakePx={hero.after.shakePx}
              stamp={{ text: 'SEALED', progress: hero.stamp }}
            />
          </div>
        ) : null}
        {hero.before.tear < 1 ? (
          <div style={{ gridArea: '1 / 1' }}>
            <Tape
              meta={META}
              lines={PLACEHOLDER_RUN.before}
              lineFrames={hero.before.lines}
              total={hero.before.total}
              tone="leak"
              tear={hero.before.tear}
            />
          </div>
        ) : null}
      </div>
      <p
        style={{
          position: 'absolute',
          bottom: 48,
          color: '#958c80',
          fontFamily: 'monospace',
          fontSize: 22,
        }}
      >
        {PLACEHOLDER_RUN.label}
      </p>
    </AbsoluteFill>
  )
}
