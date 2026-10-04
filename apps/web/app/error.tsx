'use client'

import Link from 'next/link'
import './_components/site.css'
import './status-page.css'

/**
 * Something on a page failed on the server: most often the console's database not answering.
 * Says so plainly, offers another try, and keeps the error's reference for the server log.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main id="main" className="status-page">
      <div className="status-slip">
        <p className="status-slip__header">Shakedown · error</p>
        <p className="status-slip__meta">
          Something went wrong on our side{error.digest ? ` · ref ${error.digest}` : ''}
        </p>
        <hr />
        <h1 className="display-l">This page didn’t print.</h1>
        <p>
          Something behind it isn’t answering right now. Try again in a moment. The recorded runs on
          the home page don’t depend on it.
        </p>
        <div className="status-slip__links">
          <button type="button" className="btn btn-primary" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="btn btn-ghost">
            Back to the start
          </Link>
        </div>
      </div>
    </main>
  )
}
