// Regression test for issue #1: WebSocket upgrade routes must enforce the
// same Origin policy as the HTTP routes. A cross-origin page must not be able
// to attach to a session (or even probe that an id exists); same-origin and
// Origin-less (curl-style) handshakes keep working.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as pathJoin } from 'node:path'
import { createServer } from 'node:http'
import WebSocket from 'ws'
import { apply } from '../lib/index.js'

const PREFIX = '/terminal-panel'

/* --- minimal fake ctx: route tables + effect, mirroring how
 * dsh-host-webserver dispatches (pathname lookup, no global origin gate) --- */
const upgrades = new Map()
const routes = []
const ctx = {
  webServer: {
    register(route) { routes.push(route); return () => {} },
    registerUpgrade(route) {
      upgrades.set(route.path, route)
      return () => upgrades.delete(route.path)
    },
  },
  get: () => undefined,
  effect: () => () => {},
}
const dataDir = mkdtempSync(pathJoin(tmpdir(), 'dsh-term-test-'))
process.env.DSH_PLUGIN_TERMINAL_DATA = dataDir
apply(ctx)

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://x').pathname
  for (const route of routes) {
    if (route.kind === 'prefix' && pathname.startsWith(route.path)) {
      route.handler(req, res).catch(() => { res.destroy() })
      return
    }
  }
  res.writeHead(404); res.end()
})
server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url ?? '/', 'http://x').pathname
  const route = upgrades.get(pathname)
  if (route === undefined) { socket.destroy(); return }
  Promise.resolve(route.handler(req, socket, head)).catch(() => socket.destroy())
})
await new Promise((res) => server.listen(0, '127.0.0.1', res))
const port = server.address().port
const base = `http://127.0.0.1:${port}`

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`)
  if (!ok) failures++
}

/* 1. create a session through the HTTP route (browser-like origin header) */
const created = await fetch(base + PREFIX + '/sessions', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: '{}',
}).then((r) => r.json())
check('HTTP POST /sessions (same-origin) creates session', typeof created.id === 'string' && created.id.length > 0, JSON.stringify(created))
const id = created.id

/* 2. session ids must be unpredictable (not counter+timestamp) */
check('session id is not the old predictable format', !/^t\d+-[0-9a-z]{1,10}$/.test(id), id)

const tryWs = (origin, targetId = id) =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${PREFIX}/ws/${targetId}`, {
      headers: origin === undefined ? {} : { origin },
    })
    ws.on('open', () => { ws.close(); resolve('open') })
    ws.on('error', () => resolve('error'))
    ws.on('unexpected-response', () => resolve('unexpected-response'))
  })

/* 3. cross-origin handshake must be destroyed before upgrade */
const cross = await tryWs('http://evil.example')
check('cross-origin WS handshake rejected', cross !== 'open', cross)

/* 4. same-origin handshake must succeed */
const same = await tryWs(base)
check('same-origin WS handshake accepted', same === 'open', same)

/* 5. Origin-less handshake (curl / non-browser) must succeed, like HTTP */
const noOrigin = await tryWs(undefined)
check('Origin-less WS handshake accepted', noOrigin === 'open', noOrigin)

/* 6. cross-origin caller must not learn whether an id exists: same rejection
 *    path for a bogus id */
const bogus = await tryWs('http://evil.example', 't999-nope')
check('cross-origin bogus id rejected identically', bogus !== 'open', bogus)

/* 7. HTTP cross-origin 403 still intact (regression guard) */
const httpCross = await fetch(base + PREFIX + '/sessions', {
  headers: { origin: 'http://evil.example' },
})
check('HTTP cross-origin still 403', httpCross.status === 403, String(httpCross.status))

/* cleanup */
server.close()
try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* keep */ }
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
