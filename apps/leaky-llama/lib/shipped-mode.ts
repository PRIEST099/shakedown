import type { StoreMode } from '@shakedown/core/mode'

/**
 * The switches this build of the store ships with. They apply to any request that carries no
 * campaign token and no toggle cookie. Shakedown's own CI tests the store as shipped, so a pull
 * request that flips a switch here is a pull request that applies that fix.
 */
export const SHIPPED_MODE: Readonly<StoreMode> = {
  'double-clicker': 'leaky',
  'cart-shuffler': 'leaky',
  echo: 'leaky',
  bouncer: 'leaky',
  'policy-lawyer': 'leaky',
  'second-opinion': 'leaky',
}
