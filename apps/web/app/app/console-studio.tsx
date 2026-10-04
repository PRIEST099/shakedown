'use client'

import {
  type AgAiTelemetryObserver,
  AgStudioAiModule,
  type AgStudioApi,
  enableStudioDevValidations,
} from 'ag-studio'
import { AgStudio, AgStudioProvider } from 'ag-studio-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { ConsoleTables } from '../../lib/console/rows'
import { dataSources } from './studio/data'
import { INITIAL_STATE } from './studio/layout'
import { consoleTheme, type DAY, type NIGHT } from './studio/theme'
import { triageHarness } from './studio/triage'
import { shakedownWidgets } from './studio/widgets'

if (process.env.NODE_ENV !== 'production') enableStudioDevValidations()

/** Removes the watermark once the trial licence arrives; until then Studio shows one. */
const LICENSE = process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY?.trim() || undefined
const MODULES = [AgStudioAiModule]

/** Studio leaves page navigation to the host application. Pages an agent adds appear here too. */
const PAGE_LABELS: Record<string, string> = { run: 'Run', ledger: 'Ledger', trend: 'Across runs' }
const HIDDEN = { visibility: 'hidden' } as const

export interface ConsoleStudioProps {
  tables: ConsoleTables
  shift: typeof DAY | typeof NIGHT
  aiReady: boolean
  observer: AgAiTelemetryObserver
}

export function ConsoleStudio({ tables, shift, aiReady, observer }: ConsoleStudioProps) {
  // Triage's summary tool reads the tables as they are now, live rows included.
  const current = useRef(tables)
  current.current = tables
  const data = useMemo(() => dataSources(tables), [tables])
  const ai = useMemo(
    () => (aiReady ? triageHarness(() => current.current, observer) : undefined),
    [aiReady, observer],
  )
  const style = useMemo(() => ({ height: '100%', width: '100%' }), [])
  const [api, setApi] = useState<AgStudioApi>()
  const [page, setPage] = useState<string>(INITIAL_STATE.selectedPageId)
  const [pages, setPages] = useState<string[]>(INITIAL_STATE.pages.map((p) => p.id))
  const onApiReady = useCallback((event: { api: AgStudioApi }) => setApi(event.api), [])
  const onStateUpdated = useCallback(
    (event: { state: { selectedPageId: string; pages: { id: string }[] } }) => {
      setPage(event.state.selectedPageId)
      setPages(event.state.pages.map((p) => p.id))
    },
    [],
  )
  const show = useCallback(
    (id: string) => {
      if (!api) return
      api.setState({ ...api.getState(), selectedPageId: id })
      setPage(id)
    },
    [api],
  )

  return (
    <div className="ag-theme-mode sd-console__studio" data-ag-theme-mode={shift}>
      <nav className="sd-console__pages" aria-label="Console pages">
        {pages.map((id, index) => (
          <button
            key={id}
            type="button"
            className="sd-console__page"
            aria-current={page === id ? 'page' : undefined}
            disabled={!api}
            onClick={() => show(id)}
          >
            {PAGE_LABELS[id] ?? `Page ${index + 1}`}
          </button>
        ))}
      </nav>
      {api ? null : <p className="sd-console__laying">Laying out the console…</p>}
      {/* Studio sizes its panels after it mounts; keep that out of sight so nothing jumps. */}
      <div className="sd-console__canvas" style={api ? undefined : HIDDEN}>
        <AgStudioProvider modules={MODULES} licenseKey={LICENSE}>
          <AgStudio
            style={style}
            theme={consoleTheme}
            data={data}
            initialState={INITIAL_STATE}
            widgets={shakedownWidgets}
            mode="edit"
            ai={ai}
            onApiReady={onApiReady}
            onStateUpdated={onStateUpdated}
          />
        </AgStudioProvider>
      </div>
    </div>
  )
}
