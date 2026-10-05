import { describe, expect, it } from 'vitest'
import { cues, DEMO_FRAMES, FPS, framesOf, SCENES, sentences, spokenSeconds } from './script'

describe('the script', () => {
  it('stays under the hackathon’s three minutes, with room to spare', () => {
    expect(DEMO_FRAMES / FPS).toBeLessThanOrEqual(175)
  })

  it('gives every scene time to say its words at a natural pace', () => {
    for (const scene of SCENES) {
      expect(spokenSeconds(scene) + 0.4, scene.id).toBeLessThanOrEqual(scene.seconds)
    }
  })
})

describe('caption cues', () => {
  it('say every word of the voiceover, in order', () => {
    for (const scene of SCENES) {
      const said = cues(scene)
        .map((cue) => cue.text)
        .join(' ')
      expect(said, scene.id).toBe(scene.vo.split(/\s+/).join(' '))
    }
  })

  it('are at most two lines of about 42 characters', () => {
    for (const scene of SCENES) {
      for (const cue of cues(scene)) {
        expect(cue.lines.length, cue.text).toBeLessThanOrEqual(2)
        for (const line of cue.lines) expect(line.length, line).toBeLessThanOrEqual(46)
      }
    }
  })

  it('never overlap, and stay inside their scene', () => {
    for (const scene of SCENES) {
      const all = cues(scene)
      for (const [i, cue] of all.entries()) {
        expect(cue.from, scene.id).toBeGreaterThanOrEqual(0)
        expect(cue.to, scene.id).toBeGreaterThan(cue.from)
        expect(cue.to, scene.id).toBeLessThanOrEqual(framesOf(scene))
        const next = all[i + 1]
        if (next) expect(cue.to, scene.id).toBeLessThanOrEqual(next.from)
      }
    }
  })

  it('hold a sentence back until its anchor, and keep the words in order after it', () => {
    const scene = SCENES.find((s) => s.id === 'live') ?? SCENES[0]
    const anchored = cues(scene, { anchors: { 3: 20 } })
    const third = anchored.find((cue) => cue.sentence === 3)
    expect(third?.from).toBe(20 * FPS)
    for (const [i, cue] of anchored.entries()) {
      const next = anchored[i + 1]
      if (next) expect(cue.to).toBeLessThanOrEqual(next.from)
    }
  })

  it('split sentences after their full stops, closing quotes included', () => {
    expect(sentences('It says “All set.” The ledger says $34.00 went.')).toEqual([
      'It says “All set.”',
      'The ledger says $34.00 went.',
    ])
  })
})
