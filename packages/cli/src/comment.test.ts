import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { COMMENT_MARKER, REPORT_SCHEMA, type ShakedownReport } from '@shakedown/reporters'
import { describe, expect, it } from 'vitest'
import { type CommentIo, commentCommand } from './comment'
import { EXIT } from './exit-codes'

const TOKEN = 'ghs_test_token_never_printed'

function setup(event: object, existing: object[] = []) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'shakedown-comment-'))
  mkdirSync(path.join(cwd, '.shakedown'))
  const report: ShakedownReport = {
    schema: REPORT_SCHEMA,
    tool: { name: '@shakedown-dev/cli', version: '0.1.0' },
    campaign: {
      id: 'CMP-1',
      seed: 1,
      target: 'http://localhost:3100',
      startedAt: '',
      finishedAt: '',
    },
    totals: {
      merchantLeakCents: 0,
      customerHarmCents: 0,
      leaks: 0,
      sealed: 3,
      inconclusive: 0,
      skipped: 0,
      personasTested: 1,
      personasLeaking: 0,
    },
    personas: [],
  }
  writeFileSync(path.join(cwd, '.shakedown', 'report.json'), JSON.stringify(report))
  writeFileSync(path.join(cwd, 'event.json'), JSON.stringify(event))

  const calls: { method: string; url: string; body?: string; auth?: string }[] = []
  const lines: string[] = []
  const io: CommentIo = {
    cwd,
    env: {
      GITHUB_TOKEN: TOKEN,
      GITHUB_REPOSITORY: 'shakedown-dev/shakedown',
      GITHUB_EVENT_PATH: path.join(cwd, 'event.json'),
      GITHUB_API_URL: 'https://api.github.test',
    },
    log: (line) => void lines.push(line),
    fetch: async (url, init) => {
      const headers = init?.headers as Record<string, string>
      calls.push({
        method: init?.method ?? 'GET',
        url: String(url),
        body: init?.body as string,
        auth: headers.authorization,
      })
      const body = init?.method === 'GET' ? existing : {}
      return new Response(JSON.stringify(body), { status: 200 })
    },
  }
  return { io, calls, lines }
}

describe('comment', () => {
  it('posts one comment on the pull request', async () => {
    const { io, calls } = setup({ pull_request: { number: 7 } })
    expect(await commentCommand({}, io)).toBe(EXIT.pass)
    const post = calls.find((call) => call.method === 'POST')
    expect(post?.url).toBe(
      'https://api.github.test/repos/shakedown-dev/shakedown/issues/7/comments',
    )
    expect(JSON.parse(post?.body ?? '{}').body).toMatch(new RegExp(`^${COMMENT_MARKER}`))
    expect(post?.auth).toBe(`Bearer ${TOKEN}`)
  })

  it('updates its own earlier comment instead of adding another', async () => {
    const { io, calls } = setup({ pull_request: { number: 7 } }, [
      { id: 1, body: `${COMMENT_MARKER} copied by a person`, user: { type: 'User' } },
      { id: 2, body: `${COMMENT_MARKER} old scoreboard`, user: { type: 'Bot' } },
    ])
    await commentCommand({}, io)
    expect(
      calls.map((call) => `${call.method} ${call.url.replace('https://api.github.test', '')}`),
    ).toEqual([
      'GET /repos/shakedown-dev/shakedown/issues/7/comments?per_page=100&page=1',
      'PATCH /repos/shakedown-dev/shakedown/issues/comments/2',
    ])
  })

  it('does nothing outside a pull request, and never prints the token', async () => {
    const { io, calls, lines } = setup({ ref: 'refs/heads/main' })
    expect(await commentCommand({}, io)).toBe(EXIT.pass)
    expect(calls).toEqual([])
    expect(lines.join('\n')).not.toContain(TOKEN)
  })

  it('needs the GitHub Actions environment', async () => {
    const { io } = setup({ pull_request: { number: 7 } })
    expect(await commentCommand({}, { ...io, env: {} })).toBe(EXIT.config)
  })
})
