import { describe, expect, it } from 'vitest'
import { lines } from '../script'
import { W_FRAMES, W_SCENES } from './script'

describe('the walkthrough', () => {
  it('runs as long as the first cut, inside the hackathon’s three minutes', () => {
    expect(W_FRAMES / 30).toBeLessThanOrEqual(176)
  })

  it('has every line recorded, so the cut is timed from real speech', () => {
    for (const scene of W_SCENES) {
      expect(
        lines(scene).every((line) => line.recorded),
        `${scene.id}: run pnpm voice --film=walkthrough`,
      ).toBe(true)
    }
  })

  it('fits every scene’s voiceover inside the scene, with a breath at the end', () => {
    for (const scene of W_SCENES) {
      const last = lines(scene).at(-1)
      expect((last?.start ?? 0) + (last?.seconds ?? 0), scene.id).toBeLessThanOrEqual(
        scene.seconds - 0.4,
      )
    }
  })

  it('uses its own scene ids, so its takes never mix with the first cut’s', () => {
    for (const scene of W_SCENES) expect(scene.id.startsWith('w-')).toBe(true)
  })
})
