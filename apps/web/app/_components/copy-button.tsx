'use client'

import { useState } from 'react'

/** Copies `text`, then says so for a moment. The label stays readable by screen readers. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="copy-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1800)
        } catch {
          // Clipboard access can be refused; the command is still on screen to select.
        }
      }}
    >
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </button>
  )
}
