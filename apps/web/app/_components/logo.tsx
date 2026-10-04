/** The horned receipt (DESIGN_SPEC §2.5): a receipt with two small horns and a red total line. */
export function Mark({ size = 28, solid = false }: { size?: number; solid?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M5.5 5.5 L4.6 1.8 L8.6 5 Z M18.5 5.5 L19.4 1.8 L15.4 5 Z" fill="currentColor" />
      <path
        d="M5 5 H19 V20 L17 22 L15 20 L13 22 L11 20 L9 22 L7 20 L5 22 Z"
        fill={solid ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {solid ? null : (
        <>
          <path
            d="M8 9 H16 M8 12 H13.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path d="M8 16 H16" stroke="var(--sd-leak)" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="wordmark inline-flex items-center gap-2">
      <Mark size={size} />
      shakedown
    </span>
  )
}
