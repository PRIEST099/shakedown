/**
 * The Returns Desk palette, as far as a terminal can carry it. Colour goes to a terminal and to
 * GitHub Actions logs, never into a file or a pipe. Honours NO_COLOR and FORCE_COLOR.
 */
const enabled = () => {
  if (process.env.NO_COLOR) return false
  const force = process.env.FORCE_COLOR
  if (force !== undefined && force !== '') return force !== '0'
  return process.stdout.isTTY === true || process.env.GITHUB_ACTIONS === 'true'
}

const wrap = (open: string) => (text: string) =>
  enabled() ? `\u001B[${open}m${text}\u001B[0m` : text

export const ink = {
  /** Red Ink: a leak. */
  leak: wrap('38;5;203'),
  /** Seal: teal, not green, so it stays distinguishable for colour-blind readers. */
  sealed: wrap('38;5;43'),
  /** Highlighter. */
  mark: wrap('38;5;227'),
  dim: wrap('2'),
  bold: wrap('1'),
  invert: wrap('7'),
}
