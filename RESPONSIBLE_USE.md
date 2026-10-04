# Responsible use

Shakedown is a QA tool: test customers for **your own** PayPal sandbox integration. It is built so
that it can only be pointed at yourself, and only in the sandbox.

| Rule | How it is enforced |
|---|---|
| **Sandbox only** | Every PayPal call goes through the sandbox lock (`packages/paypal/src/sandbox-lock.ts`), which refuses every host except PayPal's sandbox API. `PAYPAL_ENV` must be `sandbox`; anything else stops the CLI with exit code 3 before a request is sent. There is no switch to turn this off. |
| **Your integration only** | A target must be on `localhost` or a private network, or be allow-listed **and** serve your verification token at `/.well-known/shakedown.txt`, before the first request (`packages/core/src/guards.ts`). |
| **Fictional customers** | The cast are scripted test characters. They pay with PayPal's published sandbox test cards, decline with PayPal's documented sandbox triggers, and use generated `example.com` addresses. No real people, cards or money. |
| **Bounded by design** | Each campaign has a request and wall-clock budget (`packages/core/src/budget.ts`). Every Claude call passes a spend gate with a hard cap that refuses before anything is sent (`packages/ai/src/gate.ts`). Every exchange is kept in an append-only ledger. |
| **Outcomes, not playbooks** | Findings report what would have leaked, the PayPal sandbox records that prove it, and the fix. They are not reusable scripts. |
| **Credentials stay local** | Secrets are read from the environment only, are never written to config files or reports, and are redacted from every message (`packages/core/src/redact.ts`). |

Please don't use Shakedown against integrations you don't own. To report a security problem with
Shakedown itself, see [SECURITY.md](SECURITY.md).

## About the name

A *shakedown cruise* is a ship's test voyage before it enters service. This one is for your
checkout.

Shakedown is an independent project and is not affiliated with or endorsed by PayPal.
