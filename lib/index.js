/**
 * dsh-plugin-terminal — host half.
 *
 * Owns node-pty sessions and exposes them to the Web GUI through named
 * routes on ctx.webServer (same-origin, loopback-server model of DSH).
 *
 * Why node-pty directly: the built-in ctx.subprocess.spawnTerminal() has no
 * process inspector on Windows and throws there. node-pty ships prebuilt
 * ConPTY binaries for win32, so this plugin gives every platform a real
 * interactive terminal while the upstream seam catches up.
 */
import { execSync } from 'node:child_process'
import { spawn as ptySpawn } from 'node-pty'

/** Route namespace; the client half must agree. */
const PREFIX = '/terminal-panel'
/** Max chars of scrollback kept per session (ring buffer). */
const SCROLLBACK_CHARS = 200_000
/** Pick a real interactive shell for the current platform. */
function resolveShell() {
  if (process.platform !== 'win32') return process.env.SHELL || '/bin/bash'
  for (const candidate of ['pwsh.exe', 'powershell.exe']) {
    try {
      execSync(`where ${candidate}`, { shell: 'cmd.exe', stdio: 'ignore' })
      return candidate
    } catch {
      /* try next */
    }
  }
  return 'cmd.exe'
}

let sessionCounter = 0

export const name = 'dsh-plugin-terminal'
export const inject = ['webServer']

export function apply(ctx) {
  const webServer = ctx.webServer

  /** id -> session record */
  const sessions = new Map()

  const makeId = () => `t${++sessionCounter}-${Date.now().toString(36)}`

  function createSession({ cols = 80, rows = 24, cwd, shell } = {}) {
    const file = shell && shell.length > 0 ? shell : resolveShell()
    const argv = file.endsWith('cmd.exe') ? [file] : [file, process.platform === 'win32' ? '-NoLogo' : '-i']
    const id = makeId()
    const pty = ptySpawn(file, argv.slice(1), {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd && cwd.length > 0 ? cwd : process.cwd(),
      env: process.env,
    })
    /** session record */
    const record = {
      id,
      pty,
      shell: file,
      title: `${file} #${sessionCounter}`,
      buffer: '',
      exited: false,
      exitDetail: null,
      /** SSE response objects currently subscribed */
      subscribers: new Set(),
      bornAt: Date.now(),
    }
    sessions.set(id, record)
    pty.onData((data) => {
      record.buffer = (record.buffer + data).slice(-SCROLLBACK_CHARS)
      for (const res of record.subscribers) {
        res.write(`event: data\ndata: ${JSON.stringify(data)}\n\n`)
      }
    })
    pty.onExit(({ exitCode }) => {
      record.exited = true
      record.exitDetail = exitCode
      for (const res of record.subscribers) {
        res.write(`event: exit\ndata: ${JSON.stringify({ exitCode })}\n\n`)
        res.end()
      }
      record.subscribers.clear()
      // let any final SSE frame flush, then reap the record so the map cannot grow
      setTimeout(() => sessions.delete(id), 30_000)
    })
    return record
  }

  function killSession(id, reason = 'panel request') {
    const record = sessions.get(id)
    if (record === undefined) return false
    try {
      record.pty.kill()
    } catch {
      /* already gone */
    }
    return true
  }

  /** Reject cross-origin requests: the DSH webserver has no auth by design,
   *  so at minimum never let another origin drive the terminal. */
  function sameOrigin(req, res) {
    const origin = req.headers.origin
    if (origin === undefined) return true // non-browser clients (curl) and same-origin GETs
    try {
      const host = req.headers.host ?? ''
      return new URL(origin).host === host
    } catch {
      return false
    }
  }

  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }
  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let text = ''
      req.on('data', (chunk) => {
        text += chunk
        if (text.length > 1_000_000) reject(new Error('body too large'))
      })
      req.on('end', () => {
        try {
          resolve(text.length === 0 ? {} : JSON.parse(text))
        } catch (err) {
          reject(err)
        }
      })
      req.on('error', reject)
    })

  const disposeRoute = webServer.register({
    kind: 'prefix',
    path: PREFIX,
    async handler(req, res) {
      if (!sameOrigin(req, res)) {
        json(res, 403, { error: 'cross-origin rejected' })
        return
      }
      const url = new URL(req.url ?? '/', 'http://x')
      const path = url.pathname
      const rest = path.slice(PREFIX.length)
      const method = req.method ?? 'GET'

      try {
        // GET /sessions — list live sessions
        if (rest === '/sessions' && method === 'GET') {
          json(res, 200, {
            sessions: [...sessions.values()].map((s) => ({
              id: s.id,
              title: s.title,
              shell: s.shell,
              exited: s.exited,
              bornAt: s.bornAt,
            })),
          })
          return
        }

        // POST /sessions — create
        if (rest === '/sessions' && method === 'POST') {
          const body = await readBody(req)
          const record = createSession({
            cols: clampInt(body.cols, 20, 500, 80),
            rows: clampInt(body.rows, 5, 200, 24),
            cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
            shell: typeof body.shell === 'string' ? body.shell : undefined,
          })
          json(res, 200, { id: record.id, title: record.title, shell: record.shell })
          return
        }

        const match = rest.match(/^\/sessions\/([^/]+)(?:\/(.*))?$/)
        if (match === null) {
          json(res, 404, { error: 'not found' })
          return
        }
        const id = match[1]
        const action = match[2] ?? ''
        const record = sessions.get(id)
        if (record === undefined) {
          json(res, 404, { error: 'no such session' })
          return
        }

        // GET /sessions/:id/stream — SSE output stream
        if (action === 'stream' && method === 'GET') {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          res.write(`event: snapshot\ndata: ${JSON.stringify({ buffer: record.buffer, exited: record.exited, exitCode: record.exitDetail, title: record.title, shell: record.shell })}\n\n`)
          if (record.exited) {
            res.write(`event: exit\ndata: ${JSON.stringify({ exitCode: record.exitDetail })}\n\n`)
            res.end()
            return
          }
          record.subscribers.add(res)
          const kick = setInterval(() => res.write(':ka\n\n'), 20_000)
          req.on('close', () => {
            clearInterval(kick)
            record.subscribers.delete(res)
          })
          return
        }

        // POST /sessions/:id/input — write to the pty
        if (action === 'input' && method === 'POST') {
          const body = await readBody(req)
          if (record.exited) {
            json(res, 409, { error: 'session exited' })
            return
          }
          if (typeof body.data !== 'string') {
            json(res, 400, { error: 'data must be a string' })
            return
          }
          record.pty.write(body.data)
          json(res, 200, { ok: true })
          return
        }

        // POST /sessions/:id/resize
        if (action === 'resize' && method === 'POST') {
          const body = await readBody(req)
          const cols = clampInt(body.cols, 10, 500, 80)
          const rows = clampInt(body.rows, 4, 200, 24)
          if (!record.exited) record.pty.resize(cols, rows)
          json(res, 200, { ok: true })
          return
        }

        // DELETE /sessions/:id — kill
        if (action === '' && method === 'DELETE') {
          killSession(id)
          json(res, 200, { ok: true })
          return
        }

        json(res, 404, { error: 'not found' })
      } catch (err) {
        json(res, 500, { error: String(err?.message ?? err) })
      }
    },
  })

  ctx.effect(() => {
    return () => {
      disposeRoute()
      for (const id of [...sessions.keys()]) killSession(id, 'plugin dispose')
    }
  })

  console.log('[dsh-plugin-terminal] host half active; routes under', PREFIX)
}

function clampInt(value, min, max, fallback) {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, n))
}
