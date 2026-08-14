// Integration test: POST /sessions/:id/restart respawns the shell and
// inherits the previous scrollback; tab history survives the restart.
// Run: node tests/restart-inherit.mjs
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATA = mkdtempSync(join(tmpdir(), "dsh-term-restart-"));
process.env.DSH_PLUGIN_TERMINAL_DATA = DATA;
const { apply } = await import("../lib/index.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeCtx() {
  let handler = null;
  let disposer = null;
  const ctx = {
    webServer: {
      register: ({ handler: h }) => {
        handler = h;
        return () => {};
      },
      registerUpgrade: () => () => {},
    },
    effect: (fn) => { disposer = fn(); },
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
  const res = { status: 0, body: "", writeHead(s) { this.status = s; }, end(b) { this.body = b ?? ""; }, write(c) { this.body += c; } };
  return res;
}
async function call(h, method, url, body) {
  const res = fakeRes();
  await h(fakeReq(method, url, body), res);
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

let failures = 0;
const ok = (cond, label) => { console.log((cond ? "PASS" : "FAIL") + ": " + label); if (!cond) failures++; };

const boot = makeCtx();
apply(boot.ctx);
const h = boot.getHandler();

const created = await call(h, "POST", "/terminal-panel/sessions", {});
const sid = created.json.id;
await call(h, "POST", "/terminal-panel/sessions/" + sid + "/input", { data: "echo before-restart-marker-456\r" });
await sleep(1500);

const restarted = await call(h, "POST", "/terminal-panel/sessions/" + sid + "/restart", {});
ok(restarted.status === 200 && !!restarted.json?.id, "restart returns new session id");
ok(restarted.json.id !== sid, "new id differs from old");

const snap = await call(h, "GET", "/terminal-panel/sessions/" + restarted.json.id + "/snapshot");
ok(snap.status === 200 && (snap.json?.buffer ?? "").includes("before-restart-marker-456"), "scrollback inherited after restart");

const list = await call(h, "GET", "/terminal-panel/sessions");
const ids = (list.json?.sessions ?? []).map((s) => s.id);
ok(!ids.includes(sid), "old session removed from list");
ok(ids.includes(restarted.json.id), "new session present");

// new session still writes to ITS OWN log; old log file is gone
await call(h, "POST", "/terminal-panel/sessions/" + restarted.json.id + "/input", { data: "echo after-restart-marker-789\r" });
await sleep(1200);
const logs = readdirSync(join(DATA, "logs"));
ok(logs.length === 1 && logs[0] === restarted.json.id + ".log", "only the new session log remains");
const logText = readFileSync(join(DATA, "logs", logs[0]), "utf8");
ok(logText.includes("before-restart-marker-456") && logText.includes("after-restart-marker-789"), "log contains history + new output");

// cleanup
await call(h, "DELETE", "/terminal-panel/sessions/" + restarted.json.id);
boot.getDisposer()?.();
rmSync(DATA, { recursive: true, force: true });
console.log(failures === 0 ? "ALL PASS" : failures + " FAILURES");
process.exit(failures === 0 ? 0 : 1);
