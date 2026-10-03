import Anthropic from '@anthropic-ai/sdk'

/** Lulu needs Claude credentials; the store still works without them, just with no Lulu. */
export const claudeConfigured = () =>
  Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim())

const holder = globalThis as unknown as { __leakyLlamaAnthropic?: Anthropic }

export function getAnthropic(): Anthropic {
  // Reads ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) from the environment.
  holder.__leakyLlamaAnthropic ??= new Anthropic()
  return holder.__leakyLlamaAnthropic
}
