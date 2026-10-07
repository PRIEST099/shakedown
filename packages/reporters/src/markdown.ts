import { money, type ShakedownReport } from './report'

/** The marker CI looks for, so it updates one comment instead of adding a new one each push. */
export const COMMENT_MARKER = '<!-- shakedown:report -->'

/** Store replies end up in evidence, so plain text is escaped rather than trusted as markup. */
const text = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const cell = (value: string) => text(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
const code = (value: string) => `\`${value.replace(/`/g, "'").replace(/\n/g, ' ')}\``

/** A pull-request comment: the headline, one row per persona, and every leak in detail. */
export function markdownComment(report: ShakedownReport): string {
  const { totals, campaign } = report
  const headline =
    totals.leaks === 0 && totals.sealed === 0
      ? `**Shakedown: inconclusive.** No check could be judged: see why below.`
      : totals.leaks === 0
        ? `**Shakedown: sealed.** None of the ${totals.personasTested} customers from hell got through.`
        : `**Shakedown: ${totals.personasLeaking} of ${totals.personasTested} customers from hell got through.** ${money(totals.merchantLeakCents)} at risk for the merchant, ${money(totals.customerHarmCents)} for customers.`

  const rows = report.personas.map((persona) => {
    const checks = persona.scenarios.flatMap((scenario) => scenario.checks)
    const leaks = checks.filter((check) => check.verdict === 'leak')
    const merchant = leaks.reduce((sum, check) => sum + check.merchantLeakCents, 0)
    const customer = leaks.reduce((sum, check) => sum + check.customerHarmCents, 0)
    const result = persona.scenarios.every((scenario) => scenario.skipped)
      ? 'Skipped'
      : leaks.length
        ? `🔴 ${leaks.length} ${leaks.length === 1 ? 'leak' : 'leaks'}`
        : checks.some((check) => check.verdict === 'sealed')
          ? '🟢 Sealed'
          : // Nothing leaked, nothing held: none of its checks could be judged.
            '⚪ Inconclusive'
    const risk = leaks.length
      ? [merchant && `${money(merchant)} merchant`, customer && `${money(customer)} customer`]
          .filter(Boolean)
          .join(', ') || '$0.00'
      : '—'
    return `| ${persona.number}. ${cell(persona.name)} | ${cell(persona.tests)} | ${result} | ${risk} |`
  })

  const details = report.personas.flatMap((persona) =>
    persona.scenarios.flatMap((scenario) =>
      scenario.checks
        .filter((check) => check.verdict === 'leak')
        .map(
          (check) => `<details>
<summary>${text(persona.name)}: ${text(check.title)}</summary>

${text(check.detail)}

${check.evidence.map((item) => `- **${cell(item.label)}:** ${code(item.value)}`).join('\n')}

**Fix:** ${text(check.fix ?? '')}
</details>`,
        ),
    ),
  )

  // When nothing could be judged, say why, check by check.
  const unjudged =
    totals.leaks === 0 && totals.sealed === 0
      ? report.personas.flatMap((persona) =>
          persona.scenarios.flatMap((scenario) =>
            scenario.checks
              .filter((check) => check.verdict === 'inconclusive')
              .map(
                (check) =>
                  `- **${cell(persona.name)}: ${text(check.title)}.** ${text(check.detail)}`,
              ),
          ),
        )
      : []
  if (unjudged.length) details.push(unjudged.join('\n'))

  return `${COMMENT_MARKER}
${headline}

| Customer | Tests | Result | At risk |
|---|---|---|---|
${rows.join('\n')}

${details.join('\n\n')}

<sub>Campaign \`${campaign.id}\` · seed ${campaign.seed} · ${totals.sealed} sealed, ${totals.inconclusive} inconclusive, ${totals.skipped} skipped. Measured in the PayPal sandbox; no real money moved.</sub>
`
}
