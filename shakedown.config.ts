import { defineConfig } from '@shakedown-dev/cli'

// Shakedown's own CI: the four customers that need no AI, against Leaky Llama as it ships
// (apps/leaky-llama/lib/shipped-mode.ts). Credentials come from .env.local, never from here.
export default defineConfig({
  target: { url: 'http://localhost:3100' },
  cast: ['double-clicker', 'cart-shuffler', 'echo', 'bouncer'],
  seed: 2026,
  budget: { minutes: 10 },
})
