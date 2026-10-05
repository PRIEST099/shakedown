# Evaluation: the checkout cast, switch by switch

Measured by `pnpm eval:checkout` on 2026-10-05, against Leaky Llama
and the PayPal sandbox, seed 2026. Nothing here is estimated, and nothing here uses Claude.

Leaky Llama has one switch per customer. Each row below is one run of the four checkout
customers with the switches set as named: a customer should report a leak when its own switch is
leaky, and only then.

**In the 8 cases where a customer’s switch was leaky, it reported the leak every time. In the 16 cases where its switch was sealed, it reported none.**

| Store switches | Double-Clicker | Cart Shuffler | The Echo | The Bouncer |
|---|---|---|---|---|
| All sealed | sealed | sealed | sealed · 2 inconclusive | sealed |
| Only Double-Clicker leaky | **2 leaks** | sealed | sealed · 2 inconclusive | sealed |
| Only Cart Shuffler leaky | sealed | **2 leaks** | sealed · 2 inconclusive | sealed |
| Only The Echo leaky | sealed | sealed | **3 leaks** | sealed |
| Only The Bouncer leaky | sealed | sealed | sealed · 2 inconclusive | **1 leak** |
| All leaky | **2 leaks** | **2 leaks** | **3 leaks** | **1 leak** |

Each cell counts the checks graded from PayPal’s sandbox records. The Echo’s two inconclusive
checks are honest: against a store that verifies signatures, only PayPal can sign, so a test
can show that unsigned copies were refused, not what the store does with genuine repeats.
