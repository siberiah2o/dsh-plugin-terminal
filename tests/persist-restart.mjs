// Integration test: sessions survive a simulated dsh web restart.
// Flow: apply() -> create session -> write output -> dispose (kills PTY,
// flushes log) -> re-apply() on a fresh ctx (restart) -> session is back as
// exited history with its scrollback; DELETE removes it from disk.
// Run: node tests/persist-restart.mjs
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DATA = mkdtempSync(join(tmpdir(), "dsh-term-persist-"));
process.env.DSH_PLUGIN_TERMINAL_DATA = DATA;
const { apply } = await import("../lib/index.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeCtx() {
  let handler = null;
  let disposer = null;
  const upgrades = new Map();
  const ctx = {
    webServer: {
      register: ({ path, handler: h }) => {
        handler = h;
        return () => {};
      },
      registerUpgrade: ({ path, handler: h }) => {
        upgrades.set(path, h);
        return () => upgrades.delete(path);
      },
    },
    effect: (fn) => {
      disposer = fn();
    },
  };
  return { ctx, getHandler: () => handler, getDisposer: () => disposer };
}

function fakeReq(method, url, body) {
  const req = {
    method,
    url,
    headers: {},
    on(ev, cb) {
      if (ev === "data" && body !== undefined) cb(JSON.stringify(body));
      if (ev === "end") cb();
    },
  };
  return req;
}
function fakeRes() {
  const res = {
    status: 0,
    body: "",
    headers: {},
    writeHead(s, h) {
      this.status = s;
      this.headers = h ?? {};
    },
    end(b) {
      this.body = b ?? "";
    },
    write(c) {
      this.body += c;
    },
  };
  return res;
}
async function call(h, method, url, body) {
  const res = fakeRes();
  await h(fakeReq(method, url, body), res);
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

let failures = 0;
const ok = (cond, label) => {
  console.log((cond ? "PASS" : "FAIL") + ": " + label);
  if (!cond) failures++;
};

// ---- first boot ----
const boot1 = makeCtx();
apply(boot1.ctx);
const h1 = boot1.getHandler();

const created = await call(h1, "POST", "/terminal-panel/sessions", {});
ok(created.status === 200 && created.json?.id, "session created on first boot");
const sid = created.json.id;

await call(h1, "POST", "/terminal-panel/sessions/" + sid + "/input", { data: "echo persisted-marker-123\r" });
await sleep(1600); // shell output + 250ms log coalescing
await call(h1, "POST", "/terminal-panel/sessions/" + sid + "/input", { data: "exit\r" });
await sleep(1200); // exit -> flush + persistMeta

// shutdown (simulates dsh web restart)
boot1.getDisposer()?.();
await sleep(400);

ok(existsSync(join(DATA, "sessions.json")), "sessions.json persisted");
const logs = readdirSync(join(DATA, "logs"));
ok(logs.length === 1 && logs[0] === sid + ".log", "session log persisted");

// ---- second boot (restart) ----
const boot2 = makeCtx();
apply(boot2.ctx);
const h2 = boot2.getHandler();

const list = await call(h2, "GET", "/terminal-panel/sessions");
const found = (list.json?.sessions ?? []).find((s) => s.id === sid);
ok(!!found, "session restored after restart");
ok(found?.exited === true, "restored session marked exited");

const snap = await call(h2, "GET", "/terminal-panel/sessions/" + sid + "/snapshot");
ok(snap.status === 200 && (snap.json?.buffer ?? "").includes("persisted-marker-123"), "scrollback history restored");

// explicit close removes from disk
await call(h2, "DELETE", "/terminal-panel/sessions/" + sid);
const meta = readFileSync(join(DATA, "sessions.json"), "utf8");
ok(!meta.includes(sid), "DELETE removes session from persistence");

// cleanup
boot2.getDisposer()?.();
rmSync(DATA, { recursive: true, force: true });
console.log(failures === 0 ? "ALL PASS" : failures + " FAILURES");
process.exit(failures === 0 ? 0 : 1);
