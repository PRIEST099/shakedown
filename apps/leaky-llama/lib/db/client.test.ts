import { describe, expect, it } from 'vitest'
import { ensureDatabase } from './client'

describe('the store’s own database', () => {
  it('takes only a plain lowercase name, never anything SQL could misread', async () => {
    for (const name of ['Store', 'store; drop table orders', '"store"', '9lives', '']) {
      await expect(ensureDatabase('postgres://u@localhost:1/shakedown', name)).rejects.toThrow(
        /plain name/,
      )
    }
  })

  it('uses the URL as it is when it already names that database, without connecting', async () => {
    const url = 'postgres://u@localhost:1/leaky_llama'
    await expect(ensureDatabase(url, 'leaky_llama')).resolves.toBe(url)
  })
})
