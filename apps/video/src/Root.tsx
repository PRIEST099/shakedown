import { HERO_TIMING } from '@shakedown/ui'
import { Composition } from 'remotion'
import { TapeSpike } from './TapeSpike'

const FPS = 30

export function Root() {
  return (
    <Composition
      id="TapeSpike"
      component={TapeSpike}
      durationInFrames={Math.ceil((HERO_TIMING.endMs / 1000) * FPS) + FPS}
      fps={FPS}
      width={1920}
      height={1080}
    />
  )
}
