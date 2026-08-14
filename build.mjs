import { build } from "esbuild";
import { writeFileSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const entry = fileURLToPath(new URL("./src/client-main.js", import.meta.url));
const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["es2020"],
  write: false,
  minify: true,
  legalComments: "none",
  logLevel: "warning",
  external: ["react"],
  loader: { ".css": "css" },
});

const code = result.outputFiles[0].text;
const css = result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";

const factoryBody = [
  "var module = { exports: {} };",
  "var exports = module.exports;",
  code,
  "var __panel = module.exports.TerminalPanel ?? module.exports.default;",
  "return {",
  "  apply: function (ctx) {",
  "    ctx.slots.inject('conversation.input.dock', function () {",
  "      return ctx.slots.register(",
  "        { name: 'conversation.input.dock', id: 'terminal', order: 10 },",
  "        __panel",
  "      );",
  "    });",
  "  },",
  "  inject: ['slots'],",
  "};",
].join("\n");

const finalJs = [
  "/**",
  " * dsh-plugin-terminal - client bundle (xterm.js edition, self-contained).",
  " * Built by build.mjs from src/client-main.js. Do not edit by hand.",
  " */",
  "window.__ModuleLoader__.load({",
  "  id: 'dsh-plugin-terminal',",
  "  factory: (require) => {",
  "    " + factoryBody,
  "  },",
  "});",
].join("\n");

writeFileSync(new URL("./lib/client.js", import.meta.url), finalJs);
// ship xterm.css from the package into lib/client.css (served by the host)
const xtermCssPath = require.resolve("@xterm/xterm/css/xterm.css");
copyFileSync(xtermCssPath, new URL("./lib/client.css", import.meta.url));
console.log("client.js:", finalJs.length, "bytes; xterm.css copied:", existsSync(new URL("./lib/client.css", import.meta.url)));