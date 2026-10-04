import type { Metadata } from 'next'
import { consoleTables } from '../../lib/console/rows'
import { getConsoleDb, loadCampaigns } from '../../lib/console/store'
import { ConsoleShell } from './console-shell'
import './console.css'

export const metadata: Metadata = {
  title: 'Console · Shakedown',
  description: 'Every Shakedown run, graded from PayPal sandbox ledger reads. Sandbox only.',
  robots: { index: false },
}

export const dynamic = 'force-dynamic'

export default async function ConsolePage() {
  const tables = consoleTables(await loadCampaigns(await getConsoleDb()))
  return (
    <ConsoleShell
      initial={tables}
      aiReady={Boolean(process.env.ANTHROPIC_API_KEY?.trim())}
      liveReady={process.env.SHAKEDOWN_CONSOLE_LIVE !== '0'}
    />
  )
}
