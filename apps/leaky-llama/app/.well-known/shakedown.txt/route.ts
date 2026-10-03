/** Proves to Shakedown that whoever runs it also runs this store. */
export function GET() {
  const token = process.env.SHAKEDOWN_VERIFICATION_TOKEN
  if (!token) return new Response('Not configured.', { status: 404 })
  return new Response(token, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
