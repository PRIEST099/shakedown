import { getPersona } from '@shakedown/core/cast'
import { Imp } from '@shakedown/ui'
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion'
import { CAST, type Crop, SLIDES, type Slide } from './gallery-slides'
import { Wordmark } from './kit'
import { C, FONT, Stage } from './theme'

const WIDTH = 1372
const SHOT_WIDTH = 1440
const BAR = 40
const MAX_HEIGHT = 650

function Browser({ shot, url, crop }: { shot: string; url: string; crop: Crop }) {
  // The site's content sits in a centred column, so most crops trim its margins and grow.
  const scale = Math.min(WIDTH / crop.width, (MAX_HEIGHT - BAR) / crop.height)
  const width = crop.width * scale
  return (
    <div
      style={{
        width,
        margin: '0 auto',
        borderRadius: 16,
        overflow: 'hidden',
        border: `2px solid ${C.rule}`,
        background: C.surface,
        boxShadow: '0 18px 40px rgb(18 16 13 / 0.14)',
      }}
    >
      <div
        style={{
          height: BAR,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 16px',
          borderBottom: `2px solid ${C.rule}`,
        }}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 12, height: 12, borderRadius: 6, background: C.rule }} />
        ))}
        <span
          style={{
            marginLeft: 14,
            padding: '3px 14px',
            borderRadius: 8,
            background: C.paper,
            font: `400 17px ${FONT.mono}`,
            color: C.muted,
          }}
        >
          {url}
        </span>
      </div>
      <div style={{ height: crop.height * scale, overflow: 'hidden', position: 'relative' }}>
        <Img
          src={staticFile(`gallery/raw/${shot}.png`)}
          style={{
            position: 'absolute',
            left: -crop.x * scale,
            top: -crop.y * scale,
            width: SHOT_WIDTH * scale,
          }}
        />
      </div>
    </div>
  )
}

function Cast() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      {CAST.map(({ id, does, checks }) => (
        <div key={id} style={{ width: 266, textAlign: 'center' }}>
          <div style={{ width: 270, height: 270, margin: '0 auto' }}>
            <Imp persona={id} state="leak" />
          </div>
          <div style={{ marginTop: 8, font: `600 21px ${FONT.mono}`, letterSpacing: '0.04em' }}>
            {getPersona(id).name.toUpperCase()}
          </div>
          <div style={{ marginTop: 12, font: `600 27px/1.25 ${FONT.ui}` }}>{does}</div>
          <div style={{ marginTop: 14, font: `400 20px/1.35 ${FONT.mono}`, color: C.sealed }}>
            ✓ {checks}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Gallery() {
  const index = Math.min(useCurrentFrame(), SLIDES.length - 1)
  const slide = SLIDES[index] as Slide
  return (
    <Stage>
      <AbsoluteFill style={{ padding: '52px 64px 44px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Wordmark size={30} />
          <div style={{ font: `600 20px ${FONT.mono}`, color: C.muted }}>
            {index + 1} / {SLIDES.length}
          </div>
        </div>
        <div
          style={{
            marginTop: 24,
            font: `800 68px/1 ${FONT.display}`,
            fontVariationSettings: '"wdth" 80',
            letterSpacing: '-0.01em',
          }}
        >
          {slide.headline}
        </div>
        <div
          style={{
            marginTop: 14,
            maxWidth: 1260,
            font: `400 27px/1.38 ${FONT.ui}`,
            color: C.muted,
          }}
        >
          {slide.caption}
        </div>
        {/* The picture fills what the words leave, centred in it. */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            marginTop: 24,
          }}
        >
          {'cast' in slide ? (
            <Cast />
          ) : (
            <Browser shot={slide.shot} url={slide.url} crop={slide.crop} />
          )}
        </div>
      </AbsoluteFill>
    </Stage>
  )
}
