/** Lulu needs Claude credentials; the store still works without them, just with no Lulu. */
export const claudeConfigured = () =>
  Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim())
