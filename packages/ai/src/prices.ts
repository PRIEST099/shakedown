/**
 * What each model costs, in US dollars per million tokens (Claude API list prices). A model
 * missing from this table is refused rather than guessed at: a call that can't be priced can't
 * be budgeted.
 */
export interface ModelPrice {
  input: number
  output: number
  /** Writing a 5-minute prompt-cache entry. */
  cacheWrite: number
  cacheRead: number
}

export const PRICES: Readonly<Record<string, ModelPrice>> = {
  'claude-haiku-4-5': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-fable-5-1': { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
}

export interface Usage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export function priceOf(model: string): ModelPrice | undefined {
  return PRICES[model]
}

/** The exact cost of one response, from the usage the API reported. */
export function costOf(model: string, usage: Usage): number {
  const price = priceOf(model)
  if (!price) throw new Error(`No price for ${model}. Add it to PRICES before using it.`)
  const dollars =
    (usage.input_tokens ?? 0) * price.input +
    (usage.output_tokens ?? 0) * price.output +
    (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite +
    (usage.cache_read_input_tokens ?? 0) * price.cacheRead
  return dollars / 1_000_000
}

/**
 * The most a request could cost before it is sent: input estimated at three characters per
 * token (generous; English runs nearer four) plus every output token it is allowed.
 */
export function worstCaseCost(model: string, requestChars: number, maxTokens: number): number {
  const price = priceOf(model)
  if (!price) throw new Error(`No price for ${model}. Add it to PRICES before using it.`)
  return (Math.ceil(requestChars / 3) * price.input + maxTokens * price.output) / 1_000_000
}
