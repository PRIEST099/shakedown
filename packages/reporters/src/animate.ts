/**
 * Print the receipt line by line, like a till printing it. Only for a person watching: CI, a
 * pipe, NO_COLOR or SHAKEDOWN_NO_ANIMATION get it all at once.
 */
export function shouldAnimate(options: { ci?: boolean } = {}): boolean {
  return (
    !options.ci &&
    process.stdout.isTTY === true &&
    !process.env.CI &&
    !process.env.NO_COLOR &&
    !process.env.SHAKEDOWN_NO_ANIMATION
  )
}

export async function printReceipt(text: string, options: { animate: boolean; delayMs?: number }) {
  if (!options.animate) {
    process.stdout.write(`${text}\n`)
    return
  }
  const delay = options.delayMs ?? 14
  for (const line of text.split('\n')) {
    process.stdout.write(`${line}\n`)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}
