import type { PersonaId } from './cast'
import type { Finding } from './finding'

/** Progress events emitted while a campaign runs. The web app streams these over SSE. */
export type RunEvent =
  | { type: 'campaign:started'; campaignId: string; seed: number; cast: PersonaId[] }
  | { type: 'scenario:started'; persona: PersonaId; scenario: string }
  | { type: 'scenario:step'; persona: PersonaId; detail: string }
  | { type: 'scenario:finished'; persona: PersonaId; findings: number }
  | { type: 'finding'; finding: Finding }
  | { type: 'campaign:finished'; campaignId: string; findings: number; leakCents: number }
  | { type: 'campaign:failed'; campaignId: string; reason: string }

export type Listener = (event: RunEvent) => void

/** A tiny synchronous event bus. A throwing listener never breaks the run. */
export class EventBus {
  readonly #listeners = new Set<Listener>()

  on(listener: Listener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  emit(event: RunEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event)
      } catch {
        // A listener is an observer; it must never affect the run.
      }
    }
  }
}
