'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

/** Plays from `start.ms` to `durationMs` once on requestAnimationFrame, then stops. */
export function usePlayhead(durationMs: number) {
  const reducedMotion = usePrefersReducedMotion()
  const [t, setT] = useState(0)
  const [start, setStart] = useState({ ms: 0, nonce: 0 })

  useEffect(() => {
    if (reducedMotion) {
      setT(durationMs)
      return
    }
    let raf = 0
    const origin = performance.now() - start.ms
    const tick = (now: number) => {
      const next = Math.min(durationMs, now - origin)
      setT(next)
      if (next < durationMs) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [durationMs, reducedMotion, start])

  const playFrom = useCallback((ms = 0) => setStart((s) => ({ ms, nonce: s.nonce + 1 })), [])
  return { t, reducedMotion, playFrom, done: t >= durationMs }
}

/** A continuous clock for idle loops. Pausable, so motion can always be stopped (WCAG 2.2.2). */
export function useAmbientClock(enabled: boolean): number {
  const [t, setT] = useState(0)
  const last = useRef(0)
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    const origin = performance.now() - last.current
    const tick = (now: number) => {
      last.current = now - origin
      setT(last.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [enabled])
  return t
}
