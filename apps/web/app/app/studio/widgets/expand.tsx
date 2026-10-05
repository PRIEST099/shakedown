'use client'

import type { AgWidgetParams } from 'ag-studio'
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * Expand: a widget's toolbar button that opens it large, over the console. It replaces Studio's
 * Duplicate on Shakedown's widgets, whose icon read as "zoom" and dropped a copy at the bottom of
 * the page instead.
 */
export const EXPAND = { id: 'expand', type: 'button', label: 'Expand', icon: 'maximize' } as const

type Fill = 'fill' | 'zoom'

/**
 * Wraps a widget so its Expand button opens a second copy of it in a dialog. A chart passes 'fill'
 * and lays itself out for the bigger box; text widgets pass 'zoom' and are drawn larger.
 */
export function expandable(Widget: ComponentType<AgWidgetParams>, label: string, fill: Fill) {
  function Expandable(params: AgWidgetParams) {
    const [open, setOpen] = useState(false)
    const close = useCallback(() => setOpen(false), [])
    useEffect(() => {
      const api = params.widgetApi
      api.addEventListener('toolbarAction', (event) => {
        if (event.id === EXPAND.id) setOpen(true)
      })
      return () => api.removeEventListener('toolbarAction')
    }, [params.widgetApi])
    const format = (params.config as { format?: { title?: { text?: string } } }).format
    return (
      <>
        <Widget {...params} />
        {open ? (
          <Expanded title={format?.title?.text || label} fill={fill} onClose={close}>
            <Widget {...params} />
          </Expanded>
        ) : null}
      </>
    )
  }
  Expandable.displayName = `Expandable(${label})`
  return Expandable
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

function Expanded({
  title,
  fill,
  onClose,
  children,
}: {
  title: string
  fill: Fill
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      // Keep Tab inside the dialog while it is open.
      if (event.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      before?.focus?.()
    }
  }, [onClose])

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: a click on the backdrop closes it; Esc and the Close button do too.
    <div
      className="sd-expanded"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        className="sd-expanded__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="sd-expanded__bar">
          <h2 id={titleId} className="sd-expanded__title">
            {title}
          </h2>
          <button ref={closeButton} type="button" className="sd-expanded__close" onClick={onClose}>
            Close
          </button>
        </header>
        <div className={`sd-expanded__body sd-expanded__body--${fill}`}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
