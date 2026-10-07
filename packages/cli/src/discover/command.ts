import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CONFIG_FILES } from '../config'
import { EXIT } from '../exit-codes'
import { configText, discover, report } from './index'

/**
 * `discover [folder]`: read the store's source code and print the routes its checkout uses, with
 * the line of code behind each. `--write` saves the route map as `shakedown.config.ts` in that
 * folder, or beside an existing config as `shakedown.config.discovered.ts`, never over one.
 */
export function discoverCommand(
  folder: string,
  flags: { target?: string; write?: boolean },
  io: { log: (text: string) => void; today?: string } = { log: (text) => console.log(text) },
): number {
  const root = path.resolve(folder)
  if (!existsSync(root)) {
    io.log(`No folder at ${root}.`)
    return EXIT.config
  }
  const found = discover(root)
  io.log(report(found, folder))
  const text = configText(
    found,
    flags.target ?? found.url,
    io.today ?? new Date().toISOString().slice(0, 10),
  )
  if (flags.write) {
    const existing = CONFIG_FILES.find((name) => existsSync(path.join(root, name)))
    const name = existing ? 'shakedown.config.discovered.ts' : 'shakedown.config.ts'
    writeFileSync(path.join(root, name), text)
    io.log(
      existing
        ? `  Your ${existing} was left as it is. The route map is in ${name}: copy what you need.`
        : `  Wrote ${name}. Check it, then run npx @shakedown-dev/cli preflight.`,
    )
  } else {
    io.log('  The config this would write (run with --write to save it):\n')
    io.log(text)
  }
  const usable = Boolean(found.picks.best.createOrder && found.picks.best.capture)
  return usable ? EXIT.pass : EXIT.preflight
}
