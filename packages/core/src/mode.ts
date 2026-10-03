import type { PersonaId } from './cast'
import { PERSONA_IDS } from './cast'

/**
 * The demo store has one switch per property the cast tests. A switch is either the way most
 * integrations ship (leaky) or the documented fix (sealed). Only the demo store reads these;
 * Shakedown never changes how anyone else's integration behaves.
 */
export type Seal = 'leaky' | 'sealed'
export type StoreMode = Record<PersonaId, Seal>

const fill = (seal: Seal): StoreMode =>
  Object.fromEntries(PERSONA_IDS.map((id) => [id, seal])) as StoreMode

export const allLeaky = (): StoreMode => fill('leaky')
export const allSealed = (): StoreMode => fill('sealed')

/** Read a mode from untrusted input. Unknown keys are dropped; anything not 'sealed' is leaky. */
export function parseMode(input: unknown, base: StoreMode = allLeaky()): StoreMode {
  const mode = { ...base }
  if (!input || typeof input !== 'object') return mode
  for (const id of PERSONA_IDS) {
    const value = (input as Record<string, unknown>)[id]
    if (value === 'sealed' || value === 'leaky') mode[id] = value
  }
  return mode
}

export const sealedCount = (mode: StoreMode): number =>
  PERSONA_IDS.filter((id) => mode[id] === 'sealed').length
