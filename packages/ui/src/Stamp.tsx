export type StampText = 'SEALED' | 'LEAKED' | 'INCONCLUSIVE'

export interface StampProps {
  text?: StampText
  /** Spring value from `springAt` (0 → ~1, may overshoot). */
  progress: number
  className?: string
}

const TONE: Record<StampText, string> = {
  SEALED: 'sealed',
  LEAKED: 'leak',
  INCONCLUSIVE: 'neutral',
}

/** The verdict stamp. Lands with a spring: scale 1.6 → 1, rotate −14° → −8°. */
export function Stamp({ text = 'SEALED', progress, className }: StampProps) {
  if (progress <= 0) return null
  const scale = 1.6 - 0.6 * progress
  const rotate = -14 + 6 * progress
  const opacity = Math.min(0.92, Math.max(0, progress) * 0.92)
  return (
    <div
      className={['sd-stamp', `sd-stamp--${TONE[text]}`, className].filter(Boolean).join(' ')}
      style={{ transform: `rotate(${rotate}deg) scale(${scale})`, opacity }}
      aria-hidden="true"
    >
      {text}
    </div>
  )
}
