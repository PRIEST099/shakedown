import { Composition, Still } from 'remotion'
import { Demo } from './Demo'
import { DevpostThumbnail } from './DevpostThumbnail'
import { Gallery } from './Gallery'
import { SLIDES } from './gallery-slides'
import { DEMO_FRAMES, FPS } from './script'
import { TEASER_FRAMES, Teaser } from './Teaser'
import { Thumbnail } from './Thumbnail'
import { W_FRAMES } from './walkthrough/script'
import { Walkthrough } from './walkthrough/Walkthrough'

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
      {/* The second cut: the problem first, then Shakedown and how it is used, as a walkthrough. */}
      <Composition
        id="Walkthrough"
        component={Walkthrough}
        durationInFrames={W_FRAMES}
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
      {/* Devpost's image gallery, 3:2: one frame per slide, rendered as an image sequence. */}
      <Composition
        id="Gallery"
        component={Gallery}
        durationInFrames={SLIDES.length}
        fps={FPS}
        width={1500}
        height={1000}
      />
    </>
  )
}
