import type { PersonaId } from './cast'
import { CAST } from './cast'
import type { PersonaModule } from './persona'
import { bouncer } from './personas/bouncer'
import { cartShuffler } from './personas/cart-shuffler'
import { doubleClicker } from './personas/double-clicker'
import { echo } from './personas/echo'
import { policyLawyer } from './personas/policy-lawyer'

/** The personas that are wired up. The Second Opinion lands in Phase 6. */
export const PERSONA_MODULES: Partial<Record<PersonaId, PersonaModule>> = {
  'double-clicker': doubleClicker,
  'cart-shuffler': cartShuffler,
  echo,
  bouncer,
  'policy-lawyer': policyLawyer,
}

/** Implemented personas, in cast order. */
export const implementedPersonas = (
  modules: Partial<Record<PersonaId, PersonaModule>> = PERSONA_MODULES,
): PersonaId[] => CAST.map((persona) => persona.id).filter((id) => modules[id] !== undefined)
