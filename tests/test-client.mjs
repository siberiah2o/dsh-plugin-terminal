
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const CACHE = "C:/Users/Administrator/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules";
const require2 = createRequire(CACHE + "/");
const react = require2("react");
const reactDomServer = require2("react-dom/server");

// minimal browser shims
const registrations = [];
const loader = { load: (entry) => registrations.push(entry) };
globalThis.window = { __ModuleLoader__: loader };
globalThis.document = {
  createElement: () => ({ style: {}, set id(v){}, set textContent(v){}, set className(v){} }),
  head: { appendChild(){} },
  getElementById: () => null,
};

const src = readFileSync(new URL("./lib/client.js", import.meta.url), "utf8");
new Function(src)(); // registers via window.__ModuleLoader__.load

console.log("registered bundles:", registrations.map(r => r.id));
const entry = registrations.find(r => r.id === "dsh-plugin-terminal");
if (!entry) throw new Error("bundle did not register");
const requireShim = (id) => {
  if (id === "react") return react;
  throw new Error("unexpected require: " + id);
};
const exports = entry.factory(requireShim);
console.log("exports keys:", Object.keys(exports));
console.log("inject:", JSON.stringify(exports.inject));

// fake cordis ctx
const injected = [];
const registered = [];
const fakeCtx = {
  slots: {
    inject: (name, fn) => { injected.push(name); registered.push(fn()); },
    register: (opts, Comp) => ({ opts, Comp }),
  },
};
exports.apply(fakeCtx);
console.log("slot target:", JSON.stringify(injected));
const reg = registered[0];
console.log("register opts:", JSON.stringify(reg.opts));
console.log("component is function:", typeof reg.Comp === "function");

const markup = reactDomServer.renderToStaticMarkup(react.createElement(reg.Comp));
console.log("initial markup bytes:", markup.length);
console.log("has dock bar:", markup.includes("dshTermBar"));
console.log("has title:", markup.includes("Terminal"));
console.log("closed initially:", !markup.includes("dshTermPanel"));
console.log("ALL-OK");
