import type { Metadata } from 'next'
import { StudioLoader } from './studio-loader'

export const metadata: Metadata = {
  title: 'Spike: AG Studio · Shakedown',
  robots: { index: false },
}

export default function AgStudioSpikePage() {
  return (
    <main style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <p className="label" style={{ padding: '12px 16px', margin: 0 }}>
        Spike S7a · AG Studio 3 · placeholder data
      </p>
      <div style={{ flex: 1, minHeight: 0 }}>
        <StudioLoader />
      </div>
    </main>
  )
}
