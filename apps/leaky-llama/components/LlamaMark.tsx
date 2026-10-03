/** The shop's mark: a pack llama in profile. Decorative; the name is always set in text beside it. */
export function LlamaMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="23" fill="#2f5d3a" />
      <path
        d="M27 9l1.6 4.2c.9-.6 1.9-.8 2.9-.6l-.4-3.4 2 3.9c1.6 1 2.4 2.8 2.1 4.7l-.5 2.5-3.4.2-.9 9.8c2.6.6 4.1 2.6 4.1 5.2V40h-3.2v-3.6c0-1-.7-1.8-1.7-1.9l-6.3-.6-1.9 6.1h-3.2l1.6-6.6c-2.4-.9-4-3.1-4-5.7 0-3.4 2.8-6.1 6.2-6.1h3l.6-6.6-1.8-1.7z"
        fill="#f6f1e7"
      />
      <circle cx="31.2" cy="16.2" r="0.9" fill="#2f5d3a" />
    </svg>
  )
}
