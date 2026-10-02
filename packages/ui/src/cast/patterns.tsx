import type { PersonaId } from '@shakedown/core/cast'

const range = (count: number, step: number, start = 0) =>
  Array.from({ length: count }, (_, i) => start + i * step)

/** Trading-card background pattern per persona, drawn in the decorative rule color. */
export function CardPattern({ persona }: { persona: PersonaId }) {
  switch (persona) {
    case 'double-clicker':
      return (
        <g className="sd-pattern">
          <rect x="14" y="22" width="200" height="200" rx="18" />
          <rect x="26" y="12" width="200" height="200" rx="18" />
        </g>
      )
    case 'cart-shuffler':
      return (
        <g className="sd-pattern">
          {range(13, 20).map((v) => (
            <path key={`g${v}`} d={`M${v} 0 L${v} 240 M0 ${v} L240 ${v}`} />
          ))}
        </g>
      )
    case 'echo':
      return (
        <g className="sd-pattern">
          {range(5, 34, 30).map((r) => (
            <circle key={`r${r}`} cx="196" cy="60" r={r} />
          ))}
        </g>
      )
    case 'bouncer':
      return (
        <g className="sd-pattern">
          <path d="M0 230 Q30 150 60 230 Q90 170 120 230 Q150 190 180 230 Q210 205 240 230" />
          <path d="M0 200 Q40 100 80 200 Q120 130 160 200 Q200 160 240 200" />
        </g>
      )
    case 'policy-lawyer':
      return (
        <g className="sd-pattern">
          {range(13, 18, 12).map((y) => (
            <path key={`l${y}`} d={`M0 ${y} L240 ${y}`} />
          ))}
          <path className="sd-pattern__margin" d="M36 0 L36 240" />
        </g>
      )
    case 'second-opinion':
      return (
        <g className="sd-pattern">
          {range(11, 22, 14).map((y) => (
            <g key={`c${y}`}>
              <path d={`M14 ${y} L226 ${y}`} strokeDasharray="10 6" />
              <path d={`M20 ${y + 5} L232 ${y + 5}`} strokeDasharray="10 6" opacity="0.6" />
            </g>
          ))}
        </g>
      )
  }
}
