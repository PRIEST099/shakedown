import { Audio, interpolate, Series, staticFile } from 'remotion'
import { CaptionsOn } from '../kit'
import { framesOf } from '../script'
import { WCli, WClose, WDouble, WEcho, WFix, WFlow, WIntro, WMeet, WReceipt } from './scenes'
import { W_SCENES, type WSceneId } from './script'
import { wVoiceSpans } from './timeline'

const BY_ID: Record<WSceneId, () => React.JSX.Element | null> = {
  'w-intro': WIntro,
  'w-flow': WFlow,
  'w-double': WDouble,
  'w-echo': WEcho,
  'w-meet': WMeet,
  'w-cli': WCli,
  'w-receipt': WReceipt,
  'w-fix': WFix,
  'w-close': WClose,
}

export type WalkthroughProps = {
  /** Burn the voiceover in as captions: on for the animatic, off for the final cut. */
  captions: boolean
}

/** Music sits well under a person talking: down 14 dB under each line, easing over six frames. */
const DUCK = 10 ** (-14 / 20)
const RAMP = 6

function Score() {
  const spans = wVoiceSpans()
  const volume = (frame: number) => {
    let under = 0
    for (const span of spans) {
      if (frame < span.from - RAMP || frame > span.to + RAMP) continue
      under = Math.max(
        under,
        interpolate(frame, [span.from - RAMP, span.from, span.to, span.to + RAMP], [0, 1, 1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
      )
    }
    return 0.8 * (1 - (1 - DUCK) * under)
  }
  return <Audio src={staticFile('audio/walkthrough.wav')} volume={volume} />
}

/**
 * The walkthrough cut, 16:9: the problem first, on the demo shop, then Shakedown and how it is
 * used, told as a person shows their screen.
 */
export function Walkthrough({ captions }: WalkthroughProps) {
  return (
    <CaptionsOn.Provider value={captions}>
      <Series>
        {W_SCENES.map((scene) => {
          const Scene = BY_ID[scene.id]
          return (
            <Series.Sequence key={scene.id} durationInFrames={framesOf(scene)} name={scene.title}>
              <Scene />
            </Series.Sequence>
          )
        })}
      </Series>
      <Score />
    </CaptionsOn.Provider>
  )
}
