'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type { RecordedRun } from './demo-runner'

const DemoRunner = dynamic(() => import('./demo-runner').then((m) => m.DemoRunner), {
  ssr: false,
  loading: () => <div className="demo demo--placeholder" />,
})

/** The demo's code loads only when its section comes near the screen, to keep the page light. */
export function LazyDemo({ recorded }: { recorded: RecordedRun }) {
  const anchor = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const element = anchor.current
    if (!element || near) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true)
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [near])
  return (
    <div ref={anchor}>
      {near ? <DemoRunner recorded={recorded} /> : <div className="demo demo--placeholder" />}
    </div>
  )
}
