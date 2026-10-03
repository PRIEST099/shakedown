import { describe, expect, it, vi } from 'vitest'
import { EventBus } from './events'

describe('EventBus', () => {
  it('delivers to every listener and unsubscribes cleanly', () => {
    const bus = new EventBus()
    const seen: string[] = []
    const off = bus.on((event) => seen.push(event.type))
    bus.on((event) => seen.push(`second:${event.type}`))
    bus.emit({ type: 'campaign:started', campaignId: 'CMP-1', seed: 1, cast: ['echo'] })
    off()
    bus.emit({ type: 'scenario:step', persona: 'echo', detail: 'x' })
    expect(seen).toEqual(['campaign:started', 'second:campaign:started', 'second:scenario:step'])
  })

  it('never lets a broken listener affect the run', () => {
    const bus = new EventBus()
    const good = vi.fn()
    bus.on(() => {
      throw new Error('listener exploded')
    })
    bus.on(good)
    expect(() =>
      bus.emit({ type: 'scenario:step', persona: 'echo', detail: 'still fine' }),
    ).not.toThrow()
    expect(good).toHaveBeenCalledOnce()
  })
})
