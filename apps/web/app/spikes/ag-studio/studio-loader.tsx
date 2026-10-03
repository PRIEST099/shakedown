'use client'

import dynamic from 'next/dynamic'

// AG Studio is browser-only, so it is loaded on the client.
export const StudioLoader = dynamic(() => import('./studio-client').then((m) => m.StudioClient), {
  ssr: false,
  loading: () => <p style={{ padding: 16 }}>Loading AG Studio…</p>,
})
