import { POLICY_TEXT } from '@/lib/support'

/** The written refund policy as plain text, exactly as Lulu's prompt carries it. */
export function GET() {
  return new Response(POLICY_TEXT, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
