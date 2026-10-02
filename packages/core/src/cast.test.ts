import { describe, expect, it } from 'vitest'
import { CAST, getPersona, PERSONA_IDS } from './cast'

describe('the cast', () => {
  it('has six personas in order, one per id', () => {
    expect(CAST.map((p) => p.id)).toEqual([...PERSONA_IDS])
    expect(CAST.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('gives every persona a property and a fix', () => {
    for (const persona of CAST) {
      expect(persona.tests.length).toBeGreaterThan(0)
      expect(persona.fix.length).toBeGreaterThan(20)
    }
  })

  it('looks personas up by id', () => {
    expect(getPersona('echo').channel).toBe('webhooks')
  })
})
