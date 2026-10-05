import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

/**
 * The Render Blueprints are configuration nobody runs until deploy day, so they are checked here:
 * the judges' copy matches the dev one, every secret is typed into the Dashboard rather than
 * committed, and each service gets the settings its code reads.
 */

interface EnvVar {
  key?: string
  value?: string | number
  sync?: boolean
  generateValue?: boolean
  fromGroup?: string
  fromDatabase?: { name: string; property: string }
  fromService?: { name: string; type: string; property?: string }
}
interface Service {
  type: string
  name: string
  branch?: string
  autoDeployTrigger?: string
  startCommand: string
  buildCommand: string
  disk?: { mountPath: string }
  envVars: EnvVar[]
}
interface Blueprint {
  envVarGroups: { name: string; envVars: EnvVar[] }[]
  services: Service[]
  databases: { name: string; ipAllowList?: unknown[]; diskSizeGB?: number }[]
}

const root = path.resolve(import.meta.dirname, '../../..')
const read = (file: string) => parse(readFileSync(path.join(root, file), 'utf8')) as Blueprint
const dev = read('render.yaml')
const judge = read('render.judge.yaml')

const service = (blueprint: Blueprint, suffix: string) => {
  const found = blueprint.services.find((s) => s.name.endsWith(suffix))
  if (!found) throw new Error(`No service ending in ${suffix}`)
  return found
}
/** Every variable a service ends up with, its group's included. */
const envOf = (blueprint: Blueprint, s: Service): EnvVar[] =>
  s.envVars.flatMap((entry) =>
    entry.fromGroup
      ? (blueprint.envVarGroups.find((group) => group.name === entry.fromGroup)?.envVars ?? [])
      : [entry],
  )
const keysOf = (blueprint: Blueprint, s: Service) => envOf(blueprint, s).map((e) => e.key)

describe('the Render Blueprints', () => {
  it('give the judges the dev setup under its own names, frozen on the judge branch', () => {
    const renamed = JSON.parse(
      JSON.stringify(dev)
        .replaceAll('shakedown-sandbox', 'shakedown-judge-sandbox')
        .replace(/"shakedown-(web|store|runs|db)"/g, '"shakedown-judge-$1"')
        .replaceAll('"branch":"main"', '"branch":"judge"')
        .replaceAll('"autoDeployTrigger":"commit"', '"autoDeployTrigger":"off"'),
    )
    expect(judge).toEqual(renamed)
    for (const s of judge.services) {
      expect(s.branch).toBe('judge')
      expect(s.autoDeployTrigger).toBe('off')
    }
  })

  it('never commit a secret: each one is typed into the Dashboard or generated there', () => {
    for (const blueprint of [dev, judge]) {
      const all = [
        ...blueprint.envVarGroups.flatMap((group) => group.envVars),
        ...blueprint.services.flatMap((s) => s.envVars),
      ]
      for (const env of all.filter((e) =>
        /SECRET|API_KEY|TOKEN|PASSWORD|LICENSE|CLIENT_ID/.test(e.key ?? ''),
      )) {
        expect(env.value, env.key).toBeUndefined()
        expect(env.sync === false || env.generateValue === true, env.key).toBe(true)
      }
    }
  })

  it('put every typed-in secret where Render will ask for it: on a service, never in a group', () => {
    // Render ignores `sync: false` inside an environment group, so it would never prompt for it.
    for (const blueprint of [dev, judge]) {
      for (const group of blueprint.envVarGroups) {
        expect(
          group.envVars.filter((e) => e.sync === false).map((e) => e.key),
          group.name,
        ).toEqual([])
      }
    }
  })

  it('build with the pinned pnpm, never a global install, and only the service’s own slice', () => {
    // Render's Node image keeps its global packages on a read-only file system (EROFS).
    for (const blueprint of [dev, judge]) {
      for (const s of blueprint.services) {
        expect(s.buildCommand, s.name).not.toMatch(/install (-g|--global)/)
        expect(s.buildCommand, s.name).toMatch(
          /^npx --yes pnpm@\d+\.\d+\.\d+ install --frozen-lockfile --filter /,
        )
      }
    }
  })

  it('size the database at 1 GB, not the 15 GB a Basic plan defaults to', () => {
    for (const blueprint of [dev, judge]) {
      for (const db of blueprint.databases) expect(db.diskSizeGB, db.name).toBe(1)
    }
  })

  it('keep everything on the PayPal sandbox, and the database off the internet', () => {
    for (const blueprint of [dev, judge]) {
      for (const s of blueprint.services) {
        expect(envOf(blueprint, s).find((e) => e.key === 'PAYPAL_ENV')?.value, s.name).toBe(
          'sandbox',
        )
      }
      for (const db of blueprint.databases) expect(db.ipAllowList).toEqual([])
    }
  })

  it('give each service what its code reads', () => {
    const web = service(dev, '-web')
    const store = service(dev, '-store')
    const runs = service(dev, '-runs')
    const shared = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'SHAKEDOWN_PROBE_SECRET']
    for (const s of [web, store, runs])
      expect(keysOf(dev, s)).toEqual(expect.arrayContaining(shared))
    expect(keysOf(dev, web)).toEqual(
      expect.arrayContaining([
        'CONSOLE_DATABASE_URL',
        'LEAKY_LLAMA_HOSTPORT',
        'SHAKEDOWN_WORKFLOW',
        'RENDER_API_KEY',
        'SHAKEDOWN_JUDGE_MODE',
      ]),
    )
    // Both public services run with the tighter limits.
    for (const s of [web, store]) {
      expect(envOf(dev, s).find((e) => e.key === 'SHAKEDOWN_JUDGE_MODE')?.value, s.name).toBe('1')
    }
    // The store runs on Render Postgres, in its own database: PGlite needs more memory than a
    // Starter instance has.
    const storeDb = envOf(dev, store).find((e) => e.key === 'STORE_DATABASE_URL')
    expect(storeDb?.fromDatabase).toEqual({ name: 'shakedown-db', property: 'connectionString' })
    expect(envOf(dev, store).find((e) => e.key === 'STORE_DATABASE_NAME')?.value).toBe(
      'leaky_llama',
    )
    expect(keysOf(dev, runs)).toEqual(
      expect.arrayContaining(['CONSOLE_DATABASE_URL', 'LEAKY_LLAMA_HOSTPORT']),
    )
    // The web app learns the workflow's real slug from Render rather than guessing it.
    expect(envOf(dev, web).find((e) => e.key === 'SHAKEDOWN_WORKFLOW')?.fromService).toEqual({
      name: runs.name,
      type: 'workflow',
      property: 'slug',
    })
    // Lulu's spend log lives on the store's disk, so it survives a deploy; the orders are in
    // Postgres, so nothing points the in-process database at the disk any more.
    const mount = store.disk?.mountPath ?? '(no disk)'
    expect(String(envOf(dev, store).find((e) => e.key === 'SHAKEDOWN_DATA_DIR')?.value)).toMatch(
      new RegExp(`^${mount}/`),
    )
    expect(keysOf(dev, store)).not.toContain('STORE_DATA_DIR')
  })

  it('start the workflow from the bundle tsup writes', () => {
    expect(service(dev, '-runs').startCommand).toBe('node apps/workflows/dist/index.js')
    const tsup = readFileSync(path.join(root, 'apps/workflows/tsup.config.ts'), 'utf8')
    expect(tsup).toContain("entry: { index: 'src/index.ts' }")
  })
})
