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
import { appendFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join as pathJoin } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn as ptySpawn } from 'node-pty'
import { WebSocketServer } from 'ws'

/**
 * Child environment for PTY sessions, tuned for TUI agents (codex / claude
 * code) and CJK output:
 * - TERM: node-pty also writes the name option into env.TERM; keep it explicit
 * - COLORTERM=truecolor: xterm.js renders truecolor; without it the CLIs fall
 *   back to 256-color and drop gradients/background fills
 * - LANG/LC_ALL/PYTHONIOENCODING: guard against non-UTF-8 hosts so CJK output
 *   from shells/python never turns into mojibake
 * Existing non-empty user values win; only missing/empty slots get defaults.
 */
export function buildSessionEnv(base = process.env) {
  const pick = (key, fallback) => {
    const v = base[key]
    return v === undefined || v === '' ? fallback : v
  }
  return {
    ...base,
    TERM: 'xterm-256color',
    COLORTERM: pick('COLORTERM', 'truecolor'),
    PYTHONIOENCODING: pick('PYTHONIOENCODING', 'utf-8'),
    ...(process.platform === 'win32'
      ? {}
      : {
          LANG: pick('LANG', 'en_US.UTF-8'),
          LC_ALL: pick('LC_ALL', 'en_US.UTF-8'),
        }),
  }
}

/** Route namespace; the client half must agree. */
const PREFIX = '/terminal-panel'
/** Max chars of scrollback kept per session (ring buffer).
 *  500k chars ~ 8-10k terminal lines: long agent sessions (codex/claude
 *  code) stream a lot of tool output, and this buffer is also the replay
 *  source on reconnect, so it must cover the client scrollback. */
const SCROLLBACK_CHARS = 500_000
/** xterm.css shipped with this package (served at /terminal-panel/xterm.css). */
const XTERM_CSS_PATH = fileURLToPath(new URL('./client.css', import.meta.url))
let xtermCss = null
try {
  xtermCss = readFileSync(XTERM_CSS_PATH, 'utf8')
} catch {
  /* css absent — client degrades gracefully */
}
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
  /** id -> per-session WS upgrade route disposer */
  const upgradeDisposers = new Map()

  /* --- restart persistence: sessions survive a `dsh web` restart as exited
   * history (meta + scrollback log under $DSH_HOME). A live PTY cannot
   * outlive its host process by nature; replayable history + one-click
   * restart is the closest a same-process backend can get.
   * DSH_PLUGIN_TERMINAL_DATA overrides the dir (used by tests). */
  const DATA_DIR = process.env.DSH_PLUGIN_TERMINAL_DATA ?? pathJoin(process.env.DSH_HOME ?? pathJoin(homedir(), '.dsh'), 'plugin-data', 'terminal')
  const META_PATH = pathJoin(DATA_DIR, 'sessions.json')
  const LOG_DIR = pathJoin(DATA_DIR, 'logs')
  const logPath = (id) => pathJoin(LOG_DIR, id + '.log')

  /** rewrite sessions.json from the in-memory map (small N, full rewrite) */
  function persistMeta() {
    try {
      mkdirSync(DATA_DIR, { recursive: true })
      const meta = [...sessions.values()].map((s) => ({
        id: s.id,
        shell: s.shell,
        title: s.title,
        bornAt: s.bornAt,
        exited: s.exited,
        exitDetail: s.exitDetail ?? null,
      }))
      writeFileSync(META_PATH, JSON.stringify(meta))
    } catch (err) {
      console.error('[dsh-plugin-terminal] persist meta failed:', err)
    }
  }

  /** append output to the session log, coalesced at 250ms to keep IO cheap */
  function queueLog(record, data) {
    record.pending = (record.pending ?? '') + data
    if (record.flushTimer !== undefined && record.flushTimer !== null) return
    record.flushTimer = setTimeout(() => {
      record.flushTimer = null
      const chunk = record.pending ?? ''
      record.pending = ''
      if (chunk.length === 0) return
      try {
        mkdirSync(LOG_DIR, { recursive: true })
        appendFileSync(logPath(record.id), chunk)
      } catch (err) {
        console.error('[dsh-plugin-terminal] log write failed:', err)
      }
    }, 250)
  }

  /** flush any pending log chunk (call on exit / dispose) */
  function flushLog(record) {
    if (record.flushTimer !== undefined && record.flushTimer !== null) {
      clearTimeout(record.flushTimer)
      record.flushTimer = null
    }
    const chunk = record.pending ?? ''
    record.pending = ''
    if (chunk.length === 0) return
    try {
      mkdirSync(LOG_DIR, { recursive: true })
      appendFileSync(logPath(record.id), chunk)
    } catch (err) {
      console.error('[dsh-plugin-terminal] log flush failed:', err)
    }
  }

  /** drop a session from disk (explicit user close) */
  function forgetSession(id) {
    const record = sessions.get(id)
    // Clear any pending log chunks FIRST: pty.kill() above fires onExit
    // asynchronously, whose flushLog() would recreate the file we unlink.
    if (record !== undefined) {
      if (record.flushTimer !== undefined && record.flushTimer !== null) {
        clearTimeout(record.flushTimer)
        record.flushTimer = null
      }
      record.pending = ''
    }
    try {
      unlinkSync(logPath(id))
    } catch {
      /* no log */
    }
    sessions.delete(id)
    persistMeta()
  }

  /** restore persisted sessions as exited history after a restart */
  function loadPersisted() {
    let meta = []
    try {
      meta = JSON.parse(readFileSync(META_PATH, 'utf8'))
    } catch {
      return // nothing persisted yet
    }
    for (const m of meta) {
      if (sessions.has(m.id)) continue
      let buffer = ''
      try {
        buffer = readFileSync(logPath(m.id), 'utf8').slice(-SCROLLBACK_CHARS)
      } catch {
        /* no log - empty history */
      }
      const record = {
        id: m.id,
        pty: null,
        shell: m.shell ?? 'shell',
        title: m.title ?? 'restored session',
        buffer,
        exited: true,
        exitDetail: m.exitDetail ?? 0,
        subscribers: new Set(),
        wsClients: new Set(),
        bornAt: m.bornAt ?? Date.now(),
        pending: '',
        flushTimer: null,
      }
      sessions.set(m.id, record)
      registerSessionWs(m.id)
    }
  }

  /** per-session WS upgrade route: live sessions stream + accept input;
   *  exited (incl. restored) sessions replay the buffer then close. */
  function registerSessionWs(id) {
    upgradeDisposers.set(id, webServer.registerUpgrade({
      path: PREFIX + '/ws/' + id,
      handler(req, socket, head) {
        const current = sessions.get(id)
        if (current === undefined) {
          socket.destroy()
          return
        }
        const wss = new WebSocketServer({ noServer: true })
        wss.on('connection', (ws) => {
          current.wsClients.add(ws)
          if (current.buffer.length > 0) ws.send(current.buffer)
          if (current.exited) {
            ws.close(1000, 'session exited')
            return
          }
          ws.on('message', (data) => {
            if (current.exited || current.pty === null) return
            const text = String(data)
            if (text.startsWith('{"type":"resize"')) {
              try {
                const body = JSON.parse(text)
                if (typeof body.cols === 'number' && typeof body.rows === 'number') {
                  current.pty.resize(body.cols, body.rows)
                }
              } catch {
                /* ignore malformed resize */
              }
            } else {
              current.pty.write(text)
            }
          })
          ws.on('close', () => current.wsClients.delete(ws))
          ws.on('error', () => current.wsClients.delete(ws))
        })
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
      },
    }))
  }

  const makeId = () => `t${++sessionCounter}-${Date.now().toString(36)}`

  function createSession({ cols = 80, rows = 24, cwd, shell, seed = '' } = {}) {
    const file = shell && shell.length > 0 ? shell : resolveShell()
    const argv = file.endsWith('cmd.exe') ? [file] : [file, process.platform === 'win32' ? '-NoLogo' : '-i']
    const id = makeId()
    const pty = ptySpawn(file, argv.slice(1), {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd && cwd.length > 0 ? cwd : process.cwd(),
      env: buildSessionEnv(),
    })
    /** session record */
    const record = {
      id,
      pty,
      shell: file,
      title: `\${file} #\${sessionCounter}`,
      /* seed: inherited scrollback from a restart - replayed to WS clients
       * on connect and persisted to the new session log up front */
      buffer: seed.slice(-SCROLLBACK_CHARS),
      exited: false,
      exitDetail: null,
      /** SSE response objects currently subscribed */
      subscribers: new Set(),
      /** live WebSocket clients for this session */
      wsClients: new Set(),
      bornAt: Date.now(),
    }
    if (record.buffer.length > 0) {
      try {
        mkdirSync(LOG_DIR, { recursive: true })
        writeFileSync(logPath(id), record.buffer)
      } catch {
        /* best effort */
      }
    }
    sessions.set(id, record)
    registerSessionWs(id)
    persistMeta()
    pty.onData((data) => {
      if (record.dead) return // restarted: old pty may still emit a few frames
      record.buffer = (record.buffer + data).slice(-SCROLLBACK_CHARS)
      queueLog(record, data)
      for (const res of record.subscribers) {
        res.write(`event: data\ndata: ${JSON.stringify(data)}\n\n`)
      }
      for (const ws of record.wsClients) {
        if (ws.readyState === ws.OPEN) ws.send(data)
      }
    })
    pty.onExit(({ exitCode }) => {
      record.exited = true
      record.exitDetail = exitCode
      if (!record.dead) {
        flushLog(record)
        persistMeta()
      }
      for (const res of record.subscribers) {
        res.write(`event: exit\ndata: ${JSON.stringify({ exitCode })}\n\n`)
        res.end()
      }
      record.subscribers.clear()
      for (const ws of record.wsClients) {
        try {
          ws.close(1000, 'session exited')
        } catch {
          /* ignore */
        }
      }
      record.wsClients.clear()
      // keep the exited record as restartable/replayable history; removed
      // only by explicit DELETE or plugin dispose
    })
    return record
  }

  function killSession(id, reason = 'panel request') {
    const record = sessions.get(id)
    if (record === undefined) return false
    try {
      record.pty?.kill()
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

  // restore persisted sessions (exited history) before serving
  loadPersisted()

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

        // GET /xterm.css — xterm stylesheet for the client bundle
        if (rest === '/xterm.css' && method === 'GET') {
          if (xtermCss === null) {
            json(res, 404, { error: 'xterm.css not bundled' })
            return
          }
          res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' })
          res.end(xtermCss)
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

        // GET /sessions/:id/snapshot — raw buffer (xterm replay)
        if (action === 'snapshot' && method === 'GET') {
          json(res, 200, { buffer: record.buffer, exited: record.exited, exitCode: record.exitDetail })
          return
        }

        // GET /sessions/:id/stream — SSE output stream (fallback transport)
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

        // POST /sessions/:id/restart — respawn in place, INHERITING scrollback
        if (action === 'restart' && method === 'POST') {
          const old = record
          const seed = old.buffer
          const file = old.shell
          // detach old first: mark dead + clear pending so its async onExit /
          // late onData frames cannot resurrect the log we are about to unlink
          old.dead = true
          if (old.flushTimer !== undefined && old.flushTimer !== null) {
            clearTimeout(old.flushTimer)
            old.flushTimer = null
          }
          old.pending = ''
          try {
            old.pty?.kill()
          } catch {
            /* already gone */
          }
          upgradeDisposers.get(id)?.()
          upgradeDisposers.delete(id)
          sessions.delete(id)
          try {
            unlinkSync(logPath(id))
          } catch {
            /* no log */
          }
          const fresh = createSession({ shell: file, seed })
          json(res, 200, { id: fresh.id, title: fresh.title, shell: fresh.shell })
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

        // DELETE /sessions/:id — kill and drop from disk (user closed it)
        if (action === '' && method === 'DELETE') {
          killSession(id)
          forgetSession(id)
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
      for (const [id, dispose] of upgradeDisposers) dispose()
      upgradeDisposers.clear()
      for (const id of [...sessions.keys()]) killSession(id, 'plugin dispose')
    }
  })

  console.log('[dsh-plugin-terminal] host half active; routes under', PREFIX)
}

function clampInt(value, min, max, fallback) {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, n))
}
