import { toDecimal } from '@shakedown/core/money'
import type { LookupResult, LuluStore, RefundOutcome } from '@shakedown/support-bot'
import { and, eq, ne } from 'drizzle-orm'
import type { StoreDeps } from './checkout'
import { disputes, escalations, orderNumber, orders, parseOrderNumber } from './db/schema'
import { STATUS_LABEL } from './history'
import { checkRefund, POLICY_SECTIONS } from './policy'
import { issueRefund, recordRefund } from './refunds'

/** The written policy, as one block of prose for Lulu's prompt. */
export const POLICY_TEXT = POLICY_SECTIONS.map(
  (section, index) => `${index + 1}. ${section.title}. ${section.body}`,
).join('\n')

const NOT_FOUND = 'No order matches that number and email address.'
const DAY = 24 * 60 * 60 * 1000

/** What Lulu may see and do, backed by the store's database and its PayPal port. */
export function supportStore(deps: StoreDeps): LuluStore {
  const { db } = deps

  const findForCustomer = async (ref: string, email: string) => {
    const id = parseOrderNumber(ref)
    if (!id) return undefined
    const [order] = await db.select().from(orders).where(eq(orders.id, id))
    // The same answer for "no such order" and "wrong email", so neither can be probed.
    if (!order || order.email.toLowerCase() !== email.trim().toLowerCase()) return undefined
    return order
  }

  const hasOpenDispute = async (orderId: number) =>
    (
      await db
        .select()
        .from(disputes)
        .where(and(eq(disputes.orderId, orderId), ne(disputes.status, 'RESOLVED')))
    ).length > 0

  return {
    policyText: POLICY_TEXT,

    async lookupOrder(ref, email): Promise<LookupResult> {
      const order = await findForCustomer(ref, email)
      if (!order) return { found: false, reason: NOT_FOUND }
      return {
        found: true,
        order: {
          orderNumber: orderNumber(order.id),
          status: STATUS_LABEL[order.status] ?? order.status,
          items: order.items.map((item) => ({
            name: item.name,
            qty: item.qty,
            unitCents: item.unitCents,
          })),
          amountCents: order.amountCents,
          capturedCents: order.capturedCents,
          refundedCents: order.refundedCents,
          currency: order.currency,
          placedOn: order.createdAt.toISOString().slice(0, 10),
          daysSinceOrder: Math.floor(
            ((deps.now?.() ?? new Date()).getTime() - order.createdAt.getTime()) / DAY,
          ),
          captureId: order.captureId,
          openDispute: await hasOpenDispute(order.id),
        },
      }
    },

    async requestRefund({ orderNumber: ref, email, amountCents, reason }): Promise<RefundOutcome> {
      const order = await findForCustomer(ref, email)
      if (!order) return { decision: 'declined', message: NOT_FOUND }
      const decision = checkRefund(
        {
          email: order.email,
          status: order.status,
          capturedCents: order.capturedCents,
          refundedCents: order.refundedCents,
          createdAt: order.createdAt,
          hasOpenDispute: await hasOpenDispute(order.id),
        },
        { email, requestedCents: amountCents, now: deps.now?.() },
      )
      if (decision.decision === 'decline') return { decision: 'declined', message: decision.reason }
      if (decision.decision === 'escalate') {
        // Filed, not just promised: a person's queue is a row in the ledger.
        await db.insert(escalations).values({
          orderId: order.id,
          amountCents,
          reason: reason || decision.reason,
          source: 'support',
          ...(deps.now ? { createdAt: deps.now() } : {}),
        })
        return {
          decision: 'escalated',
          message: `${decision.reason} A person will reply by email within one business day.`,
        }
      }
      const { refundId } = await issueRefund(deps, order, decision.amountCents, reason)
      return {
        decision: 'approved',
        message: `Refunded $${toDecimal(decision.amountCents)} to the original payment method.`,
        refundId,
        amountCents: decision.amountCents,
      }
    },

    async recordToolkitRefund({ captureId, refundId, amountCents }) {
      const [order] = await db.select().from(orders).where(eq(orders.captureId, captureId))
      if (!order) return
      await recordRefund(db, order, {
        paypalRefundId: refundId,
        // A refund without an amount refunds whatever was left.
        amountCents: amountCents ?? Math.max(0, order.capturedCents - order.refundedCents),
        source: 'support',
        reason: 'Issued by Lulu through the agent toolkit',
      })
    },
  }
}
