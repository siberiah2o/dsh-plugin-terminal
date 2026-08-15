// Integration test: every session remembers its working directory and uses it
// after both an in-place restart and a full dsh web restart. A cwd supplied by
// the client (the current DSH workspace) also wins over the server launch dir.
// Run: node tests/cwd-persist.mjs
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATA = mkdtempSync(join(tmpdir(), "dsh-term-cwd-"));
const WORKSPACE = mkdtempSync(join(tmpdir(), "dsh-term-workspace-"));
process.env.DSH_PLUGIN_TERMINAL_DATA = DATA;
const { apply } = await import("../lib/index.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeCtx(workspacePathBySession) {
  let handler = null;
  let disposer = null;
  const ctx = {
    webServer: {
      register: ({ handler: h }) => { handler = h; return () => {}; },
      registerUpgrade: () => () => {},
    },
    effect: (fn) => { disposer = fn(); },
    get: (name) => name === "workspaceRegistry"
      ? { host: { sessionPath: (id) => workspacePathBySession?.[id] } }
      : undefined,
  };
  return { ctx, getHandler: () => handler, getDisposer: () => disposer };
}
function fakeReq(method, url, body) {
  return {
    method, url, headers: {},
    on(ev, cb) {
      if (ev === "data" && body !== undefined) cb(JSON.stringify(body));
      if (ev === "end") cb();
    },
  };
}
function fakeRes() {
  return { status: 0, body: "", writeHead(s) { this.status = s; }, end(b) { this.body = b ?? ""; }, write(c) { this.body += c; } };
}
async function call(h, method, url, body) {
  const res = fakeRes();
  await h(fakeReq(method, url, body), res);
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

let failures = 0;
const ok = (cond, label) => { console.log((cond ? "PASS" : "FAIL") + ": " + label); if (!cond) failures++; };

// ---- first boot ----
const boot1 = makeCtx();
apply(boot1.ctx);
const h1 = boot1.getHandler();

const created = await call(h1, "POST", "/terminal-panel/sessions", { cwd: WORKSPACE });
ok(created.status === 200 && created.json?.cwd === WORKSPACE, "POST /sessions accepts and echoes the workspace cwd");
const sid = created.json.id;

await call(h1, "POST", "/terminal-panel/sessions/" + sid + "/input", { data: "pwd\r" });
await sleep(900);
const snap = await call(h1, "GET", "/terminal-panel/sessions/" + sid + "/snapshot");
ok(snap.json?.buffer?.includes(WORKSPACE), "PTY is spawned in the supplied workspace");

// in-place restart with no cwd: server must reuse the persisted one
const restarted = await call(h1, "POST", "/terminal-panel/sessions/" + sid + "/restart", {});
ok(restarted.status === 200 && restarted.json?.cwd === WORKSPACE, "in-place restart inherits the persisted cwd");
await call(h1, "POST", "/terminal-panel/sessions/" + restarted.json.id + "/input", { data: "pwd\r" });
await sleep(900);
const snap2 = await call(h1, "GET", "/terminal-panel/sessions/" + restarted.json.id + "/snapshot");
ok(snap2.json?.buffer?.includes(WORKSPACE), "restarted PTY starts in the persisted workspace");

// shutdown + second boot (simulated dsh web restart)
boot1.getDisposer()?.();
await sleep(400);
const boot2 = makeCtx();
apply(boot2.ctx);
const h2 = boot2.getHandler();

const list = await call(h2, "GET", "/terminal-panel/sessions");
const restored = (list.json?.sessions ?? []).find((s) => s.id === restarted.json.id);
ok(restored?.cwd === WORKSPACE, "cwd survives the dsh web restart in sessions.json");

const again = await call(h2, "POST", "/terminal-panel/sessions/" + restarted.json.id + "/restart", {});
ok(again.status === 200 && again.json?.cwd === WORKSPACE, "restart after dsh web restart still uses the persisted cwd");

// explicit body cwd wins over the persisted value
const elsewhere = mkdtempSync(join(tmpdir(), "dsh-term-elsewhere-"));
const moved = await call(h2, "POST", "/terminal-panel/sessions/" + again.json.id + "/restart", { cwd: elsewhere });
ok(moved.status === 200 && moved.json?.cwd === elsewhere, "client-supplied cwd overrides the persisted cwd");

// --- workspace registry fallback: create with only the owning DSH sessionId ---
const registryBoot = makeCtx({ "session-ws-1": WORKSPACE });
apply(registryBoot.ctx);
const h3 = registryBoot.getHandler();
const wsCreated = await call(h3, "POST", "/terminal-panel/sessions", { sessionId: "session-ws-1" });
ok(wsCreated.status === 200 && wsCreated.json?.cwd === WORKSPACE, "sessionId-only create resolves the workspace path from the registry");
// a valid body cwd still wins over the registry lookup
const explicitWins = await call(h3, "POST", "/terminal-panel/sessions", { cwd: elsewhere, sessionId: "session-ws-1" });
ok(explicitWins.status === 200 && explicitWins.json?.cwd === elsewhere, "explicit cwd wins over the registry fallback");
// an unknown sessionId degrades to the process cwd without throwing
const unknown = await call(h3, "POST", "/terminal-panel/sessions", { sessionId: "session-nope" });
ok(unknown.status === 200 && unknown.json?.cwd === process.cwd(), "unknown sessionId degrades to the process cwd");
await call(h3, "DELETE", "/terminal-panel/sessions/" + wsCreated.json.id);
await call(h3, "DELETE", "/terminal-panel/sessions/" + explicitWins.json.id);
await call(h3, "DELETE", "/terminal-panel/sessions/" + unknown.json.id);
registryBoot.getDisposer()?.();

// cleanup
await call(h2, "DELETE", "/terminal-panel/sessions/" + moved.json.id);
boot2.getDisposer()?.();
rmSync(DATA, { recursive: true, force: true });
rmSync(WORKSPACE, { recursive: true, force: true });
rmSync(elsewhere, { recursive: true, force: true });
console.log(failures === 0 ? "ALL PASS" : failures + " FAILURES");
process.exit(failures === 0 ? 0 : 1);
