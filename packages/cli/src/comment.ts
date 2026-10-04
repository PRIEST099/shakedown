import { readFileSync } from 'node:fs'
import { COMMENT_MARKER, markdownComment } from '@shakedown/reporters'
import { EXIT } from './exit-codes'
import { readLastReport } from './report'

export interface CommentIo {
  cwd: string
  env: Record<string, string | undefined>
  log: (line: string) => void
  fetch?: typeof fetch
}

interface IssueComment {
  id: number
  body?: string
  user?: { type?: string }
}

/**
 * Post the last run's scoreboard on the pull request a GitHub Actions run is checking, and update
 * that same comment on every later push. It uses only the workflow's GITHUB_TOKEN and GitHub's
 * REST API, so no third-party action ever holds the token.
 */
export async function commentCommand(
  flags: { config?: string; out?: string },
  io: CommentIo,
): Promise<number> {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, GITHUB_EVENT_PATH: eventPath } = io.env
  if (!token || !repo || !eventPath) {
    io.log(
      'comment runs in GitHub Actions: it needs GITHUB_TOKEN, GITHUB_REPOSITORY and GITHUB_EVENT_PATH.',
    )
    return EXIT.config
  }
  const event = JSON.parse(readFileSync(eventPath, 'utf8')) as {
    pull_request?: { number?: number }
  }
  const pull = event.pull_request?.number
  if (!pull) {
    io.log('This run is not for a pull request, so there is nothing to comment on.')
    return EXIT.pass
  }
  const last = await readLastReport(flags, io)
  if (typeof last === 'number') return last
  const body = markdownComment(last.report)

  const api = io.env.GITHUB_API_URL ?? 'https://api.github.com'
  const call = async <T>(method: string, route: string, payload?: object): Promise<T> => {
    const res = await (io.fetch ?? fetch)(`${api}${route}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: payload ? JSON.stringify(payload) : undefined,
    })
    if (!res.ok)
      throw new Error(`GitHub answered HTTP ${res.status} to ${method} ${route.split('?')[0]}`)
    return (await res.json()) as T
  }

  try {
    let mine: IssueComment | undefined
    for (let page = 1; page <= 10 && !mine; page++) {
      const comments = await call<IssueComment[]>(
        'GET',
        `/repos/${repo}/issues/${pull}/comments?per_page=100&page=${page}`,
      )
      mine = comments.find(
        (comment) => comment.user?.type === 'Bot' && comment.body?.startsWith(COMMENT_MARKER),
      )
      if (comments.length < 100) break
    }
    if (mine) await call('PATCH', `/repos/${repo}/issues/comments/${mine.id}`, { body })
    else await call('POST', `/repos/${repo}/issues/${pull}/comments`, { body })
    io.log(`${mine ? 'Updated' : 'Posted'} the Shakedown comment on pull request #${pull}.`)
    return EXIT.pass
  } catch (error) {
    io.log(`Could not comment on the pull request: ${(error as Error).message}`)
    return EXIT.config
  }
}
