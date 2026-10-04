'use client'

import { useState } from 'react'
import type { Exhibit } from '../../lib/golden-run'

const AI = [
  'What to say to your support assistant',
  'How to rephrase when it says no',
  'Which money paths your policy and code expose',
  'The first plain-words draft of a finding',
]

const CODE = [
  'Whether money moved: only sandbox captures, refunds and accepted webhooks count',
  'The dollar amount on every line',
  'Leak or sealed, the same on every re-run with the same seed',
  'Whether CI goes red',
]

/** The split the whole product rests on: the AI plays the customer, the ledger keeps the score. */
export function AiVsCode({ exhibit }: { exhibit: Exhibit }) {
  const [linked, setLinked] = useState(false)
  const on = () => setLinked(true)
  const off = () => setLinked(false)

  return (
    <section id="how-it-decides" className="section" aria-labelledby="split-title">
      <p className="label">Trust</p>
      <h2 id="split-title" className="display-l section__title">
        The AI plays the customer. The ledger keeps the score.
      </h2>
      <div className="split">
        <div className="split__side">
          <h3 className="split__heading">AI decides</h3>
          <ul className="split__list">
            {AI.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="exhibit__label">Exhibit A: the conversation</p>
          <div className="chat">
            <p className="chat__bubble chat__bubble--customer">
              <span className="sd-sr-only">Customer: </span>
              {exhibit.conversation.customer}
            </p>
            <p
              className={
                linked
                  ? 'chat__bubble chat__bubble--bot is-linked'
                  : 'chat__bubble chat__bubble--bot'
              }
            >
              <span className="sd-sr-only">Support assistant: </span>
              {exhibit.conversation.assistant}
            </p>
            <p className="chat__tools">Tools it called: {exhibit.conversation.tools.join(', ')}</p>
          </div>
        </div>
        <div className="split__tear" aria-hidden="true" />
        <div className="split__side">
          <h3 className="split__heading">Code decides</h3>
          <ul className="split__list">
            {CODE.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="exhibit__label">Exhibit B: the ledger</p>
          <ul className="ledger-lines">
            {exhibit.ledger.map((line) => (
              <li key={line.id}>
                <button
                  type="button"
                  className={linked ? 'ledger-line is-linked' : 'ledger-line'}
                  onMouseEnter={on}
                  onMouseLeave={off}
                  onFocus={on}
                  onBlur={off}
                >
                  <span>{line.label}</span>
                  <code>{line.id}</code>
                  <span className="num">{line.amount}</span>
                  <span>{line.status}</span>
                </button>
              </li>
            ))}
            <li className="ledger-verdict">
              <span className="ledger-verdict__word">▼ LEAK</span> {exhibit.verdict.title}:{' '}
              <span className="num">−{exhibit.verdict.atRisk}</span> would have leaked.{' '}
              {exhibit.verdict.why}
            </li>
          </ul>
        </div>
      </div>
      <p className="section__close">
        The model never decides whether money leaked. Every number comes from the sandbox record it
        cites. Recorded from the demo store’s support assistant, holding PayPal’s refund tool.
      </p>
    </section>
  )
}
