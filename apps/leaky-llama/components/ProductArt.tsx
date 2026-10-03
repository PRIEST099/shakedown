import type { Product } from '@/lib/catalog'

/** Flat product illustrations, so the shop needs no photography. */
export function ProductArt({ art, className = '' }: { art: Product['art']; className?: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} aria-hidden="true">
      <rect width="200" height="150" fill="#efe7d6" />
      <ellipse cx="100" cy="132" rx="62" ry="7" fill="#e2d7c0" />
      {art === 'socks' && (
        <g>
          <path d="M70 28h26v52l18 22c5 6 2 14-6 15l-22 3c-7 1-13-3-15-9l-1-6z" fill="#a94f2c" />
          <path d="M70 40h26M70 50h26" stroke="#f6f1e7" strokeWidth="4" />
          <path d="M104 34h26v52l18 22c5 6 2 14-6 15l-22 3c-7 1-13-3-15-9l-1-6z" fill="#2f5d3a" />
          <path d="M104 46h26M104 56h26" stroke="#f6f1e7" strokeWidth="4" />
        </g>
      )}
      {art === 'bottle' && (
        <g>
          <rect x="84" y="18" width="32" height="14" rx="4" fill="#1d241f" />
          <rect x="78" y="30" width="44" height="98" rx="14" fill="#2f5d3a" />
          <rect x="78" y="70" width="44" height="18" fill="#a94f2c" />
          <rect x="88" y="40" width="6" height="24" rx="3" fill="#f6f1e7" opacity="0.35" />
        </g>
      )}
      {art === 'panniers' && (
        <g>
          <path
            d="M60 36c0-8 18-14 40-14s40 6 40 14"
            stroke="#1d241f"
            strokeWidth="5"
            fill="none"
          />
          <rect x="44" y="40" width="50" height="78" rx="10" fill="#8a6a3e" />
          <rect x="106" y="40" width="50" height="78" rx="10" fill="#8a6a3e" />
          <path d="M44 62h50M106 62h50" stroke="#6e5230" strokeWidth="4" />
          <rect x="62" y="70" width="14" height="10" rx="2" fill="#d9b25a" />
          <rect x="124" y="70" width="14" height="10" rx="2" fill="#d9b25a" />
        </g>
      )}
      {art === 'guide' && (
        <g>
          <rect x="62" y="22" width="80" height="104" rx="4" fill="#2f5d3a" />
          <rect x="62" y="22" width="10" height="104" fill="#234a2d" />
          <rect x="82" y="36" width="48" height="6" rx="2" fill="#f6f1e7" />
          <rect x="82" y="46" width="34" height="4" rx="2" fill="#f6f1e7" opacity="0.6" />
          <path
            d="M105 66l1 3c.6-.4 1.3-.5 2-.4l-.3-2.4 1.4 2.7c1.1.7 1.7 2 1.5 3.3l-.4 1.7-2.4.2-.6 6.9c1.8.4 2.9 1.8 2.9 3.6V94h-2.2v-2.5c0-.7-.5-1.3-1.2-1.3l-4.4-.4-1.3 4.2h-2.2l1.1-4.6c-1.7-.6-2.8-2.2-2.8-4 0-2.4 2-4.3 4.3-4.3h2.1l.4-4.6-1.3-1.2z"
            fill="#f6f1e7"
            transform="translate(-60 -40) scale(1.6)"
          />
        </g>
      )}
    </svg>
  )
}
