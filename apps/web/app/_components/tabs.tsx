'use client'

import { type KeyboardEvent, type ReactNode, useEffect, useId, useState } from 'react'

export interface Tab {
  id: string
  label: string
  content: ReactNode
}

/** Accessible tabs (WAI-ARIA tabs pattern). The last choice is remembered on this device. */
export function Tabs({ tabs, storageKey }: { tabs: readonly Tab[]; storageKey?: string }) {
  const base = useId()
  const [active, setActive] = useState(tabs[0]?.id ?? '')

  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved && tabs.some((tab) => tab.id === saved)) setActive(saved)
    } catch {
      // Storage can be unavailable; the first tab is a fine default.
    }
  }, [storageKey, tabs])

  const choose = (id: string) => {
    setActive(id)
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, id)
    } catch {
      // Ignore: the choice just won't be remembered.
    }
  }

  // Arrows move along the row and wrap; Home and End jump to either end (WAI-ARIA tabs pattern).
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target =
      event.key === 'ArrowRight'
        ? index + 1
        : event.key === 'ArrowLeft'
          ? index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : undefined
    if (target === undefined) return
    event.preventDefault()
    const next = tabs[(target + tabs.length) % tabs.length]
    if (!next) return
    choose(next.id)
    document.getElementById(`${base}-tab-${next.id}`)?.focus()
  }

  return (
    <div className="tabs">
      <div role="tablist" className="tabs__list">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`${base}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            aria-controls={`${base}-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            className="tabs__tab"
            onClick={() => choose(tab.id)}
            onKeyDown={(event) => onKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${base}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${tab.id}`}
          hidden={active !== tab.id}
          className="tabs__panel"
        >
          {tab.content}
        </div>
      ))}
    </div>
  )
}
