
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const CACHE = "C:/Users/Administrator/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules";
const rq = createRequire(CACHE + "/");
const react = rq("react");
const reactDomServer = rq("react-dom/server");

// simulate the real shell: module table with react as seed, cordis-like slot system
const registrations = [];
globalThis.window = { __ModuleLoader__: { load: (e) => registrations.push(e) } };
globalThis.document = {
  createElement: () => ({ style: {}, set textContent(v){}, set id(v){}, appendChild(){}, remove(){}, getBoundingClientRect: () => ({width: 144}), }),
  head: { appendChild(){} },
  getElementById: () => null,
};
new Function(readFileSync(new URL("../lib/client.js", import.meta.url), "utf8"))();

const entry = registrations.find(r => r.id === "dsh-plugin-terminal");
const exports = entry.factory((id) => {
  if (id === "react") return react;
  throw new Error('require missed module table: "' + id + '"');
});
console.log("bundle exports ok:", typeof exports.apply === "function");

// --- simulate slot inject + register + render WITH dock props like the real one ---
const slotEntries = [];
const fakeCtx = {
  slots: {
    inject: (name, fn) => slotEntries.push({ name, dispose: fn() }),
    register: (opts, Comp) => {
      console.log("register called:", JSON.stringify(opts));
      // registration returns a disposer per cordis slots API
      return () => {};
    },
  },
};
exports.apply(fakeCtx);
console.log("slot injected:", slotEntries.map(s => s.name).join(","));

// The dock list slot renders each occupant component with standard props.
// Render TerminalPanel with representative dock props to catch runtime errors.
const Panel = react.createElement; // alias
// find the component we registered — capture via monkeypatched register
let Captured;
const fakeCtx2 = {
  slots: {
    inject: (name, fn) => fn(),
    register: (opts, Comp) => { Captured = Comp; return () => {}; },
  },
};
exports.apply(fakeCtx2);
console.log("component captured:", typeof Captured);

// EventSource shim (panel opens it on boot)
class FakeES {
  constructor(url) { this.url = url; FakeES.opened.push(url); }
  addEventListener() {} close() {}
}
FakeES.opened = [];
globalThis.EventSource = FakeES;
globalThis.fetch = async (url, opts) => {
  FakeES.calls.push(String(url));
  if (String(url).endsWith("/sessions")) {
    return { ok: true, json: async () => ({ sessions: [] }) };
  }
  return { ok: true, json: async () => ({}) };
};
FakeES.calls = [];

const el = Panel(Captured, { useSession: (sel) => undefined, t: (k) => k });
const markup = reactDomServer.renderToStaticMarkup(el);
console.log("render with dock props ok, bytes:", markup.length);
console.log("fetch called on render:", FakeES.calls.length > 0);
console.log("ALL-OK");
