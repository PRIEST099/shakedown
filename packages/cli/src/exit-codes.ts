/** CLI exit codes. Stable: CI pipelines depend on them. */
export const EXIT = {
  pass: 0,
  leaks: 1,
  inconclusive: 2,
  safetyLock: 3,
  config: 4,
  preflight: 5,
} as const
