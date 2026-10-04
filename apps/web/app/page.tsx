import type { Metadata } from 'next'
import { exhibit, goldenRun } from '../lib/golden-run'
import { landingSnippets } from '../lib/landing-snippets'
import { AiVsCode } from './_landing/ai-vs-code'
import { CastSection } from './_landing/cast-section'
import { CliSection } from './_landing/cli-section'
import { DemoProvider } from './_landing/demo-context'
import { DemoSection } from './_landing/demo-section'
import { Hero } from './_landing/hero'
import { HowItWorks } from './_landing/how-it-works'
import { Judges } from './_landing/judges'
import { Problem } from './_landing/problem'
import { ResponsibleUse } from './_landing/responsible-use'
import { SiteFooter } from './_landing/site-footer'
import { SiteHeader } from './_landing/site-header'
import './_components/site.css'
import './_landing/landing.css'

const DESCRIPTION =
  'Six test customers run your own PayPal sandbox checkout. You get a receipt for every dollar that would have leaked, plus the fix.'

export const metadata: Metadata = {
  title: 'Shakedown: customers from hell for your PayPal sandbox',
  description: DESCRIPTION,
  openGraph: {
    title: 'Shakedown: customers from hell. Sandbox only.',
    description: DESCRIPTION,
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'A Shakedown receipt: $491.00 would have leaked, then $0.00, stamped SEALED.',
      },
    ],
  },
  twitter: { card: 'summary_large_image' },
}

// Built once: every number on the page comes from recorded runs committed with the code.
export const dynamic = 'force-static'

export default function Home() {
  const run = goldenRun()
  return (
    <DemoProvider>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Hero run={run} />
        <Problem />
        <CastSection />
        <HowItWorks />
        <DemoSection recorded={run} />
        <CliSection snippets={landingSnippets()} />
        <AiVsCode exhibit={exhibit()} />
        <ResponsibleUse />
        <Judges />
      </main>
      <SiteFooter />
    </DemoProvider>
  )
}
