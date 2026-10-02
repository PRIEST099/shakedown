import type { Metadata } from 'next'
import { PreviewClient } from './preview-client'

export const metadata: Metadata = {
  title: 'Design preview · Shakedown',
  robots: { index: false },
}

export default function PreviewPage() {
  return <PreviewClient />
}
