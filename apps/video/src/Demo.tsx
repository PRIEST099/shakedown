import { Series } from 'remotion'
import { CaptionsOn } from './kit'
import { AiVsCode, Cast, Close, Fix, Hook, Live, Meet, Problem, Proof, Store } from './scenes'
import { framesOf, SCENES, type SceneId } from './script'
import { Score } from './sound'

const BY_ID: Record<SceneId, () => React.JSX.Element> = {
  hook: Hook,
  problem: Problem,
  meet: Meet,
  cast: Cast,
  store: Store,
  live: Live,
  proof: Proof,
  'ai-vs-code': AiVsCode,
  fix: Fix,
  close: Close,
}

// A type rather than an interface: Remotion wants props it can treat as a plain record.
export type DemoProps = {
  /** Burn the voiceover in as captions: on for the animatic, off for the final cut. */
  captions: boolean
}

/** The hackathon video, 16:9: the scenes of script.ts, in order, over the score. */
export function Demo({ captions }: DemoProps) {
  return (
    <CaptionsOn.Provider value={captions}>
      <Series>
        {SCENES.map((scene) => {
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
