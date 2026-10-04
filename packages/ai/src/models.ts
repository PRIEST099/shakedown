/**
 * Which model does which job. The account behind this project's key holds $5, so every job
 * defaults to Claude Haiku 4.5 ($1 / $5 per million tokens). The approved plan routes
 * high-volume turns to Haiku already; planning can be raised to Sonnet 5 per environment.
 */
export const MODELS = {
  /** Conversation turns, such as Lulu's replies. */
  turns: () => process.env.SHAKEDOWN_MODEL_TURNS?.trim() || 'claude-haiku-4-5',
  /** One-off structured work: policy compilation, recon, explanations. */
  planning: () => process.env.SHAKEDOWN_MODEL_PLANNING?.trim() || 'claude-haiku-4-5',
} as const
