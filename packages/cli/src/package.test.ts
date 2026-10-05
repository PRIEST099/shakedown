import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// What npm shows for the package: its README and the links from package.json.
const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  repository: { url: string }
  homepage: string
  bin: Record<string, string>
}
const readme = readFileSync(path.join(root, 'README.md'), 'utf8')
// git+https://github.com/<owner>/shakedown.git → https://github.com/<owner>/shakedown
const repo = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')

describe('the npm package', () => {
  it('links only into its own repository, at files that exist', () => {
    const links = readme.match(/https:\/\/github\.com\/[^\s)]+/g) ?? []
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.startsWith(`${repo}/`), link).toBe(true)
      const file = link.slice(repo.length).replace(/^\/(tree|blob)\/main\//, '')
      expect(existsSync(path.join(root, '../..', file)), link).toBe(true)
    }
  })

  it('sends the homepage to the same repository', () => {
    expect(pkg.homepage.startsWith(repo)).toBe(true)
  })

  it('keeps its command: npm drops a bin path that starts with ./', () => {
    expect(pkg.bin.shakedown).toBe('dist/index.js')
  })
})
