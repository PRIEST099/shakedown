import { Composition, Still } from 'remotion'
import { Demo } from './Demo'
import { DevpostThumbnail } from './DevpostThumbnail'
import { DEMO_FRAMES, FPS } from './script'
import { TEASER_FRAMES, Teaser } from './Teaser'
import { Thumbnail } from './Thumbnail'

export function Root() {
  return (
    <>
      {/* The hackathon video: 1920×1080 at 30 fps; final renders use --scale=2 for 4K. */}
      <Composition
        id="Demo"
        component={Demo}
        durationInFrames={DEMO_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ captions: true }}
      />
      {/* The 40-second vertical cut for Shorts, Reels and TikTok. */}
      <Composition
        id="Teaser"
        component={Teaser}
        durationInFrames={TEASER_FRAMES}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Still id="Thumbnail" component={Thumbnail} width={1920} height={1080} />
      {/* Devpost's project thumbnail: 3:2, as its form asks. */}
      <Still id="DevpostThumbnail" component={DevpostThumbnail} width={1500} height={1000} />
    </>
  )
}
