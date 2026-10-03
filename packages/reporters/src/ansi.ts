/** The Returns Desk palette, as far as a terminal can carry it. Honours NO_COLOR. */
const enabled = () => !process.env.NO_COLOR && process.stdout.isTTY !== false

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
