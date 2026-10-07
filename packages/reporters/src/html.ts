import { money, type ReportCheck, type ShakedownReport } from './report'

/**
 * A single-file HTML report: no external assets, light and dark, readable on a phone, and the
 * JSON report embedded for anything that wants to read it back.
 */

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const evidenceTable = (check: ReportCheck) =>
  check.evidence.length
    ? `<dl class="evidence">${check.evidence
        .map((item) => `<dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd>`)
        .join('')}</dl>`
    : ''

function checkHtml(check: ReportCheck): string {
  if (check.verdict === 'leak') {
    const risk = [
      check.merchantLeakCents > 0 && `${money(check.merchantLeakCents)} merchant`,
      check.customerHarmCents > 0 && `${money(check.customerHarmCents)} customer`,
    ].filter(Boolean)
    return `<article class="check leak">
  <h4><span class="mark" aria-hidden="true">✗</span> ${esc(check.title)} <span class="chip leak">Leak${check.severity ? ` · ${esc(check.severity)}` : ''}</span></h4>
  <p>${esc(check.detail)}</p>
  ${check.explanation ? `<p class="plain"><strong>In plain words</strong> (written by the AI layer): ${esc(check.explanation.explanation)}</p>` : ''}
  ${evidenceTable(check)}
  <p class="risk">At risk: <strong>${risk.length ? esc(risk.join(' · ')) : '$0.00 this time'}</strong></p>
  ${check.fix ? `<p class="fix"><mark>Fix</mark> ${esc(check.fix)}</p>` : ''}
</article>`
  }
  const label = check.verdict === 'sealed' ? 'Sealed' : 'Inconclusive'
  return `<details class="check ${check.verdict}">
  <summary><span class="mark" aria-hidden="true">${check.verdict === 'sealed' ? '✓' : '·'}</span> ${esc(check.title)} <span class="chip ${check.verdict}">${label}</span></summary>
  <p>${esc(check.detail)}</p>
  ${evidenceTable(check)}
</details>`
}

export function htmlReport(report: ShakedownReport): string {
  const { campaign, totals } = report
  const verdict =
    totals.leaks > 0
      ? `<p class="stamp leak">${totals.leaks} ${totals.leaks === 1 ? 'leak' : 'leaks'}</p>`
      : totals.sealed > 0
        ? '<p class="stamp sealed">Sealed</p>'
        : '<p class="stamp">Inconclusive</p>'
  const personas = report.personas
    .map(
      (persona) => `<section class="persona">
  <h2><span class="num">${persona.number}</span> ${esc(persona.name)} <small>${esc(persona.tests)} · ${esc(persona.channel)}</small></h2>
  ${persona.scenarios
    .map((scenario) =>
      scenario.skipped
        ? `<p class="skipped">– ${esc(scenario.title)} <span class="chip">Skipped</span> ${esc(scenario.skipped)}</p>`
        : `<div class="scenario"><h3>${esc(scenario.title)}</h3>${scenario.checks.map(checkHtml).join('\n')}${
            scenario.error ? `<p class="error">${esc(scenario.error)}</p>` : ''
          }</div>`,
    )
    .join('\n')}
</section>`,
    )
    .join('\n')
  const json = JSON.stringify(report).replace(/</g, '\\u003c')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shakedown report · ${esc(campaign.id)}</title>
<style>
:root{--paper:#f4efe6;--ink:#12100d;--muted:#5d574d;--rule:rgba(18,16,13,.14);--leak:#b42318;--seal:#08706a;--mark:#ffe14d;--card:#fbf8f2}
@media (prefers-color-scheme:dark){:root{--paper:#12100d;--ink:#f4efe6;--muted:#a59e92;--rule:rgba(244,239,230,.16);--leak:#ff6b5e;--seal:#4fd1c5;--mark:#ffe14d;--card:#1b1814}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px 16px}
main{max-width:780px;margin:0 auto}
.receipt{background:var(--card);border:1px solid var(--rule);border-radius:14px;padding:24px}
h1{font-size:28px;letter-spacing:.08em;margin:0}
.sub{color:var(--muted);margin:2px 0 16px}
.meta{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;font:13px/1.5 ui-monospace,"SF Mono",Menlo,monospace;border-block:1px dashed var(--rule);padding:12px 0;margin:0}
.meta dt{color:var(--muted)}.meta dd{margin:0;word-break:break-all}
.totals{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0 8px}
.total{border:1px solid var(--rule);border-radius:10px;padding:12px}
.total b{display:block;font:600 26px/1.2 ui-monospace,"SF Mono",Menlo,monospace}
.total span{color:var(--muted);font-size:13px}
.total.bad b{color:var(--leak)}.total.good b{color:var(--seal)}
.stamp{display:inline-block;border:3px solid currentColor;border-radius:8px;padding:4px 14px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;transform:rotate(-2deg);margin:8px 0}
.stamp.leak{color:var(--leak)}.stamp.sealed{color:var(--seal)}
.persona{margin-top:28px}
h2{font-size:20px;margin:0 0 8px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
h2 small{color:var(--muted);font-weight:400;font-size:14px}
.num{font-family:ui-monospace,Menlo,monospace;color:var(--muted)}
h3{font-size:15px;margin:16px 0 6px;color:var(--muted);font-weight:600}
.check{border-left:3px solid var(--rule);padding:6px 0 6px 12px;margin:6px 0}
.check.leak{border-color:var(--leak);background:color-mix(in srgb,var(--leak) 7%,transparent);border-radius:0 8px 8px 0;padding:10px 12px}
.check.sealed{border-color:var(--seal)}
h4{margin:0 0 6px;font-size:16px}
summary{cursor:pointer}
.mark{font-family:ui-monospace,Menlo,monospace;font-weight:700}
.leak .mark{color:var(--leak)}.sealed .mark{color:var(--seal)}.inconclusive .mark{color:var(--muted)}
.chip{font:600 11px/1 ui-monospace,Menlo,monospace;text-transform:uppercase;letter-spacing:.06em;border:1px solid currentColor;border-radius:999px;padding:3px 7px;vertical-align:middle;color:var(--muted);white-space:nowrap}
.chip.leak{color:var(--leak)}.chip.sealed{color:var(--seal)}
.evidence{display:grid;grid-template-columns:minmax(120px,max-content) 1fr;gap:2px 14px;font:13px/1.5 ui-monospace,"SF Mono",Menlo,monospace;margin:8px 0}
.evidence dt{color:var(--muted)}.evidence dd{margin:0;word-break:break-word}
.plain{border-left:3px solid var(--mark);padding-left:10px}
.fix mark{background:var(--mark);color:#12100d;padding:0 4px;border-radius:3px;font-weight:700}
.skipped,.error{color:var(--muted)}
footer{color:var(--muted);font-size:13px;margin-top:24px;text-align:center}
@media (max-width:520px){.receipt{padding:16px}.totals{grid-template-columns:1fr}.evidence{grid-template-columns:1fr}.evidence dt{margin-top:6px}}
@media print{body{background:#fff;color:#000}.receipt{border:0}}
</style>
</head>
<body>
<main>
<div class="receipt">
<h1>SHAKEDOWN</h1>
<p class="sub">The returns desk · PayPal sandbox only</p>
<dl class="meta">
<dt>Target</dt><dd>${esc(campaign.target)}</dd>
<dt>Campaign</dt><dd>${esc(campaign.id)}</dd>
<dt>Seed</dt><dd>${campaign.seed}</dd>
<dt>Run</dt><dd>${esc(campaign.startedAt)}</dd>
</dl>
<div class="totals">
<div class="total ${totals.merchantLeakCents ? 'bad' : 'good'}"><b>${money(totals.merchantLeakCents)}</b><span>Merchant leak: goods or money out, nothing in</span></div>
<div class="total ${totals.customerHarmCents ? 'bad' : 'good'}"><b>${money(totals.customerHarmCents)}</b><span>Customer harm: customers charged for nothing</span></div>
</div>
${verdict}
<p class="sub">${totals.personasLeaking} of ${totals.personasTested} customers from hell got through · ${totals.sealed} sealed · ${totals.inconclusive} inconclusive · ${totals.skipped} skipped${report.ai ? ` · Claude spend $${report.ai.spentUsd.toFixed(4)}` : ''}</p>
${campaign.stoppedEarly ? `<p class="error">Stopped early: ${esc(campaign.stoppedEarly)}</p>` : ''}
${personas}
</div>
<footer>Every leak was measured in the PayPal sandbox; no real money moved. ${esc(report.tool.name)} ${esc(report.tool.version)} · ${esc(report.schema)}</footer>
</main>
<script type="application/json" id="shakedown-report">${json}</script>
</body>
</html>
`
}
