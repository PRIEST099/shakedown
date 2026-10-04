import { runCampaign } from '@shakedown/core'
import type { FixtureTarget } from '@shakedown/core/testing'
import { LEAKY, SEALED, startFixtureTarget } from '@shakedown/core/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { htmlReport } from './html'
import { junitReport } from './junit'
import { COMMENT_MARKER, markdownComment } from './markdown'
import { buildReport, parseReport, REPORT_SCHEMA, type ShakedownReport } from './report'

let fixture: FixtureTarget

beforeAll(async () => {
  fixture = await startFixtureTarget({ flags: LEAKY })
})

afterAll(() => fixture.close())

beforeEach(() => fixture.reset())

const report = async (flags: typeof LEAKY): Promise<ShakedownReport> => {
  fixture.setFlags(flags)
  const result = await runCampaign({
    target: fixture.adapter,
    cast: ['echo', 'bouncer'],
    seed: 2026,
  })
  return buildReport(result)
}

const hostile = '</script><script>alert(1)</script> & <b>bold</b> | `tick`'

function withHostileDetail(source: ShakedownReport): ShakedownReport {
  const copy = structuredClone(source)
  const leak = copy.personas
    .flatMap((p) => p.scenarios.flatMap((s) => s.checks))
    .find((c) => c.verdict === 'leak')
  if (!leak) throw new Error('expected a leak')
  leak.detail = hostile
  leak.evidence.push({ label: 'Reply', value: hostile })
  return copy
}

describe('the JSON report', () => {
  it('adds up to the campaign it came from and reads back', async () => {
    fixture.setFlags(LEAKY)
    const result = await runCampaign({
      target: fixture.adapter,
      cast: ['echo', 'bouncer'],
      seed: 2026,
    })
    const built = buildReport(result, { aiSpentUsd: 0 })

    expect(built.schema).toBe(REPORT_SCHEMA)
    expect(built.totals.leaks).toBe(result.findings.length)
    expect(built.totals.merchantLeakCents).toBe(result.merchantLeakCents)
    expect(built.totals.skipped).toBe(1)
    expect(built.totals.personasTested).toBe(1)
    expect(parseReport(JSON.stringify(built))).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it('refuses a file that is not a report of this version', () => {
    expect(() => parseReport('{"schema":"shakedown.report/v0"}')).toThrow(
      /Not a shakedown\.report\/v1/,
    )
  })
})

describe('JUnit', () => {
  it('fails one test case per leak and skips what could not be tested', async () => {
    const built = await report(LEAKY)
    const xml = junitReport(built)

    expect(xml.match(/<failure /g)).toHaveLength(built.totals.leaks)
    expect(xml.match(/<skipped /g)).toHaveLength(built.totals.skipped + built.totals.inconclusive)
    expect(xml).toContain(`failures="${built.totals.leaks}"`)
    expect(xml).toContain('type="LEAK"')
  })

  it('passes everything on a sealed store', async () => {
    const xml = junitReport(await report(SEALED))
    expect(xml).not.toContain('<failure')
    expect(xml).toMatch(/<testsuites [^>]*failures="0"/)
  })

  it('escapes whatever the store said', async () => {
    const xml = junitReport(withHostileDetail(await report(LEAKY)))
    expect(xml).not.toContain('<script>')
    expect(xml).toContain('&lt;/script&gt;')
  })
})

describe('the PR comment', () => {
  it('leads with the money and lists every leak', async () => {
    const built = await report(LEAKY)
    const md = markdownComment(built)

    expect(md.startsWith(COMMENT_MARKER)).toBe(true)
    expect(md).toContain('1 of 1 customers from hell got through')
    expect(md).toContain('| 3. The Echo |')
    expect(md.match(/<details>/g)).toHaveLength(built.totals.leaks)
    expect(md).toContain('no real money moved')
  })

  it('says sealed when nothing got through', async () => {
    expect(markdownComment(await report(SEALED))).toContain('**Shakedown: sealed.**')
  })

  it('never lets a store reply turn into markup', async () => {
    const md = markdownComment(withHostileDetail(await report(LEAKY)))
    const outsideCode = md.replace(/`[^`]*`/g, '')
    expect(outsideCode).not.toContain('<script>')
    expect(outsideCode).not.toContain('<b>')
    expect(outsideCode).toContain('&lt;/script&gt;')
    expect(md).toContain("`</script><script>alert(1)</script> & <b>bold</b> | 'tick'`")
  })
})

describe('the HTML report', () => {
  it('is one file with nothing loaded from elsewhere', async () => {
    const html = htmlReport(await report(LEAKY))
    expect(html).not.toMatch(/<link|<script src|@import|url\(/)
    expect(html).toContain('prefers-color-scheme:dark')
    expect(html).toContain('name="viewport"')
  })

  it('embeds the JSON report so it can be read back', async () => {
    const built = await report(LEAKY)
    const html = htmlReport(built)
    const json = html.match(
      /<script type="application\/json" id="shakedown-report">(.*)<\/script>/s,
    )?.[1]
    expect(parseReport(json ?? '')).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it('escapes whatever the store said, in the page and in the embedded JSON', async () => {
    const html = htmlReport(withHostileDetail(await report(LEAKY)))
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<b>bold')
    expect(html).toContain(
      '&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;',
    )
    expect(html).toContain('The Echo')
    expect(html.match(/<\/script>/g)).toHaveLength(1)
  })
})
