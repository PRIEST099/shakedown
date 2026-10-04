import type { PersonaId, StoreMode } from '@shakedown/core'

/**
 * How the console names runs. No runtime imports, so the page can name a live run the moment it
 * starts, exactly as the stored run will be named when it finishes.
 */

export function describeSwitches(switches: Partial<StoreMode> | null | undefined): string {
  if (!switches) return 'as shipped'
  const values = Object.values(switches)
  if (values.length > 0 && values.every((seal) => seal === 'leaky')) return 'all leaky'
  if (values.length > 0 && values.every((seal) => seal === 'sealed')) return 'all sealed'
  return `${values.filter((seal) => seal === 'sealed').length} sealed`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 4, 15:46 · all leaky · 74A923AC": short enough for a chart axis, unique per run. */
export function runLabel(campaign: {
  id: string
  startedAt: string
  switches?: Partial<StoreMode> | null
}): string {
  const when = new Date(campaign.startedAt)
  const stamp = Number.isNaN(when.getTime())
    ? campaign.startedAt
    : `${MONTHS[when.getUTCMonth()]} ${when.getUTCDate()}, ${when.toISOString().slice(11, 16)}`
  const id = campaign.id.replace(/^CMP-/, '')
  const again = id.match(/-\d+$/)?.[0] ?? ''
  return `${stamp} · ${describeSwitches(campaign.switches)} · ${id.slice(0, 8)}${again}`
}

/** Who the console's live runs send: the four customers that need no AI. */
export const LIVE_CAST: readonly PersonaId[] = [
  'double-clicker',
  'cart-shuffler',
  'echo',
  'bouncer',
]
