import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { ConfigError, type configSchema, DEFAULT_CAST, loadConfig, validateConfig } from './config'
import type { ShakedownConfig } from './define'
import { resolveSettings } from './settings'

const dir = (files: Record<string, string>) => {
  const root = mkdtempSync(path.join(tmpdir(), 'shakedown-config-'))
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(root, name), content)
  return root
}

describe('loading a config', () => {
  it('reads TypeScript, JSON and YAML', async () => {
    const ts = dir({
      'shakedown.config.ts': `const seed: number = 7\nexport default { target: { url: 'http://localhost:3100' }, seed }\n`,
    })
    const json = dir({
      'shakedown.config.json': '{"target":{"url":"http://localhost:3100"},"strict":true}',
    })
    const yaml = dir({
      'shakedown.config.yml': 'target:\n  url: http://localhost:3100\ncast: [echo]\n',
    })

    expect((await loadConfig({ cwd: ts }))?.config.seed).toBe(7)
    expect((await loadConfig({ cwd: json }))?.config.strict).toBe(true)
    expect((await loadConfig({ cwd: yaml }))?.config.cast).toEqual(['echo'])
  })

  it('takes the first file in order, and --config over any of them', async () => {
    const root = dir({
      'shakedown.config.ts': `export default { target: { url: 'http://localhost:1' } }`,
      'shakedown.config.json': '{"target":{"url":"http://localhost:2"}}',
      'other.yaml': 'target: { url: "http://localhost:3" }',
    })
    expect((await loadConfig({ cwd: root }))?.config.target.url).toBe('http://localhost:1')
    expect((await loadConfig({ cwd: root, file: 'other.yaml' }))?.config.target.url).toBe(
      'http://localhost:3',
    )
  })

  it('finds nothing in an empty folder, and says so for a missing --config', async () => {
    expect(await loadConfig({ cwd: dir({}) })).toBeUndefined()
    await expect(loadConfig({ cwd: dir({}), file: 'nope.ts' })).rejects.toThrow(ConfigError)
  })

  it('reports a broken file as a config error', async () => {
    const root = dir({ 'shakedown.config.json': '{ nope' })
    await expect(loadConfig({ cwd: root })).rejects.toThrow(/Could not parse shakedown.config.json/)
  })
})

describe('validating a config', () => {
  const valid = { target: { url: 'http://localhost:3100' } }

  it('names the setting that is wrong', () => {
    expect(() => validateConfig({ target: { url: 'ftp://x' } }, 'x.json')).toThrow(/target.url/)
    expect(() => validateConfig({ ...valid, cast: ['nobody'] }, 'x.json')).toThrow(
      /Unknown customer "nobody"/,
    )
    expect(() => validateConfig({ ...valid, cast: ['second-opinion'] }, 'x.json')).toThrow(
      /not in this version yet/,
    )
  })

  it('refuses unknown keys, and points secrets at the environment', () => {
    expect(() => validateConfig({ ...valid, probeSecret: 'x' }, 'x.json')).toThrow(
      /Secrets belong in the environment/,
    )
    expect(() => validateConfig({ ...valid, sede: 1 }, 'x.json')).toThrow(/sede/)
  })

  it('never echoes a value in its messages', () => {
    const secret = 'sk-this-should-never-print-1234'
    try {
      validateConfig({ target: { url: secret }, apiKey: secret }, 'x.json')
      expect.unreachable()
    } catch (error) {
      expect((error as Error).message).not.toContain(secret)
    }
  })

  it('matches the published config type both ways', () => {
    const fromType: z.input<typeof configSchema> = {} as ShakedownConfig
    const toType: ShakedownConfig = {} as z.output<typeof configSchema>
    expect([fromType, toType]).toHaveLength(2)
  })
})

describe('settings for a run', () => {
  const file: ShakedownConfig = {
    target: { url: 'http://localhost:3100', allowHosts: ['shop.example'] },
    seed: 7,
    cast: ['echo'],
    budget: { minutes: 3 },
  }

  it('sends the four customers that need no AI by default, for free', () => {
    const settings = resolveSettings({ target: { url: 'http://localhost:3100' } }, {})
    expect(settings.cast).toEqual(DEFAULT_CAST)
    expect(settings.aiHeadroomUsd).toBe(0)
    expect(settings.outDir).toBe('.shakedown')
  })

  it('lets flags win over the file', () => {
    const settings = resolveSettings(file, {
      cast: 'bouncer, echo',
      seed: '9',
      budget: '0.02',
      switches: 'sealed',
      strict: true,
    })
    expect(settings.cast).toEqual(['echo', 'bouncer'])
    expect(settings.seed).toBe(9)
    expect(settings.aiHeadroomUsd).toBe(0.02)
    expect(settings.minutes).toBe(3)
    expect(settings.allowHosts).toEqual(['shop.example'])
    expect(settings.switches?.echo).toBe('sealed')
    expect(settings.strict).toBe(true)
  })

  it('runs from flags alone, and needs a target from somewhere', () => {
    expect(resolveSettings(undefined, { target: 'http://localhost:9' }).targetUrl).toBe(
      'http://localhost:9',
    )
    expect(() => resolveSettings(undefined, {})).toThrow(/No target/)
    expect(() => resolveSettings(file, { seed: 'soon' })).toThrow(/--seed must be a number/)
    expect(() => resolveSettings(file, { budget: '-1' })).toThrow(/budget.aiUsd/)
    expect(() => resolveSettings(file, { switches: 'half' })).toThrow(/switches/)
  })
})
