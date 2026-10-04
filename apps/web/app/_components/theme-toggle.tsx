'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

const KEY = 'sd-theme'
const LABEL: Record<Theme, string> = { light: 'Day shift', dark: 'Night shift', system: 'System' }

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved === 'light' || saved === 'dark') setTheme(saved)
    } catch {
      // Storage can be unavailable (private mode); the system theme still works.
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // Ignore: the choice just won't persist.
    }
  }, [theme])

  return (
    <fieldset className="seg">
      <legend className="sd-sr-only">Theme</legend>
      {(['light', 'dark', 'system'] as const).map((value) => (
        <button
          key={value}
          type="button"
          className="seg-btn"
          aria-pressed={theme === value}
          onClick={() => setTheme(value)}
        >
          {LABEL[value]}
        </button>
      ))}
    </fieldset>
  )
}
