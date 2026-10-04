'use client'

import type { PersonaId } from '@shakedown/core/cast'
import type { ImpState } from '@shakedown/ui'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

/**
 * What the landing page's sections share: the last demo run's result for each customer (the
 * cast cards show it), and a way for the hero's "Run it live" to start the demo.
 */
export interface PersonaResult {
  state: ImpState
  amountCents?: number
}

interface DemoContextValue {
  results: Partial<Record<PersonaId, PersonaResult>>
  setResults: (results: Partial<Record<PersonaId, PersonaResult>>) => void
  /** Bumped each time something asks for a live run; the demo starts one when it changes. */
  runRequests: number
  requestRun: () => void
}

const DemoContext = createContext<DemoContextValue | null>(null)

export function DemoProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<DemoContextValue['results']>({})
  const [runRequests, setRunRequests] = useState(0)
  const requestRun = useCallback(() => {
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setRunRequests((n) => n + 1)
  }, [])
  const value = useMemo(
    () => ({ results, setResults, runRequests, requestRun }),
    [results, runRequests, requestRun],
  )
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext)
  if (!value) throw new Error('useDemo needs a DemoProvider.')
  return value
}
