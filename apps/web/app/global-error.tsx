'use client'

/** The last resort: the root layout itself failed, so this page brings its own html and styles. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#f4efe6',
          color: '#12100d',
          font: '16px/1.5 system-ui, sans-serif',
        }}
      >
        <main style={{ maxWidth: 480, padding: 24 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>Shakedown didn’t load.</h1>
          <p>Something went wrong on Shakedown’s side. Try again in a moment.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: '0 18px',
              border: 0,
              borderRadius: 6,
              background: '#12100d',
              color: '#f4efe6',
              font: 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
