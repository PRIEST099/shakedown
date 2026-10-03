import type { PersonaId } from './cast'
import type { PersonaModule } from './persona'
import { echo } from './personas/echo'

/** The personas that are wired up. The rest of the cast lands in Phase 4. */
export const PERSONA_MODULES: Partial<Record<PersonaId, PersonaModule>> = {
  echo,
}

export const implementedPersonas = (
  modules: Partial<Record<PersonaId, PersonaModule>> = PERSONA_MODULES,
): PersonaId[] =>
  Object.keys(modules).filter((id): id is PersonaId => modules[id as PersonaId] !== undefined)
