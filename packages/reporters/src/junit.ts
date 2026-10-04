import type { ShakedownReport } from './report'

/** JUnit XML for CI: SEALED passes, LEAK fails, INCONCLUSIVE and skipped scenarios are skipped. */

const xml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: XML 1.0 forbids these
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

export function junitReport(report: ShakedownReport): string {
  const seconds =
    Math.max(
      0,
      new Date(report.campaign.finishedAt).getTime() -
        new Date(report.campaign.startedAt).getTime(),
    ) / 1000
  const suites = report.personas.map((persona) => {
    const cases: string[] = []
    let failures = 0
    let skipped = 0
    for (const scenario of persona.scenarios) {
      if (scenario.skipped) {
        skipped += 1
        cases.push(
          `    <testcase classname="${xml(scenario.id)}" name="${xml(scenario.title)}"><skipped message="${xml(`SKIPPED: ${scenario.skipped}`)}"/></testcase>`,
        )
        continue
      }
      for (const check of scenario.checks) {
        const open = `    <testcase classname="${xml(scenario.id)}" name="${xml(check.title)}">`
        if (check.verdict === 'leak') {
          failures += 1
          const body = [
            check.detail,
            ...check.evidence.map((item) => `${item.label}: ${item.value}`),
            check.fix ? `Fix: ${check.fix}` : '',
          ]
            .filter(Boolean)
            .join('\n')
          cases.push(
            `${open}<failure type="LEAK" message="${xml(check.detail)}">${xml(body)}</failure></testcase>`,
          )
        } else if (check.verdict === 'inconclusive') {
          skipped += 1
          cases.push(
            `${open}<skipped message="${xml(`INCONCLUSIVE: ${check.detail}`)}"/></testcase>`,
          )
        } else {
          cases.push(`${open}</testcase>`)
        }
      }
    }
    return {
      xml: `  <testsuite name="${xml(persona.name)}" tests="${cases.length}" failures="${failures}" errors="0" skipped="${skipped}">\n${cases.join('\n')}\n  </testsuite>`,
      tests: cases.length,
      failures,
      skipped,
    }
  })
  const sum = (key: 'tests' | 'failures' | 'skipped') =>
    suites.reduce((total, suite) => total + suite[key], 0)
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="shakedown ${xml(report.campaign.id)}" tests="${sum('tests')}" failures="${sum('failures')}" errors="0" skipped="${sum('skipped')}" time="${seconds.toFixed(3)}">
${suites.map((suite) => suite.xml).join('\n')}
</testsuites>
`
}
