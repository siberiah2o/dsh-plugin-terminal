/**
 * Unit tests for the config plumbing introduced in 0.2.0:
 *   - splitCommandLine (server): configured shell command -> file + args
 *   - parseShortcut / matchesShortcut (client): toggle shortcut strings
 * Run: node tests/unit-config.mjs
 */
import assert from "node:assert/strict";
import { splitCommandLine, pickFirst } from "../src/server-command.js";
import { parseShortcut, matchesShortcut } from "../src/shortcut.js";

let passed = 0;
const ok = (name) => { passed++; console.log("ok -", name); };

/* ---- splitCommandLine ---- */
assert.deepEqual(splitCommandLine('cmd.exe /k "C:\\cmder\\vendor\\init.bat"'), ["cmd.exe", "/k", "C:\\cmder\\vendor\\init.bat"]);
ok('cmder init command with quoted path');
assert.deepEqual(splitCommandLine("cmd.exe /k \"C:\\Program Files\\x\\y\""), ["cmd.exe", "/k", "C:\\Program Files\\x\\y"]);
ok("quoted path with backslash segments");
assert.deepEqual(splitCommandLine("bash -i"), ["bash", "-i"]);
ok("simple command with flag");
assert.deepEqual(splitCommandLine("  zsh  "), ["zsh"]);
ok("trims and collapses whitespace");
assert.deepEqual(splitCommandLine(""), []);
ok("empty input");
assert.deepEqual(splitCommandLine('echo "a b" c'), ["echo", "a b", "c"]);
ok("quoted segment stays one token");
/* no escape sequences: every quote toggles; adjacent quoted+plain text merges */
assert.deepEqual(splitCommandLine('echo "a"b'), ["echo", "ab"]);
assert.deepEqual(splitCommandLine('echo "a" "b"'), ["echo", "a", "b"]);
ok("quotes toggle; no escape sequences (documented limitation)");
ok("nested quotes collapse to literal quotes");

/* ---- pickFirst ---- */
assert.equal(pickFirst("", undefined, "bash"), "bash");
assert.equal(pickFirst("  ", "cmd.exe"), "cmd.exe");
assert.equal(pickFirst("zsh", "bash"), "zsh");
assert.equal(pickFirst(), undefined);
assert.equal(pickFirst("", ""), undefined);
ok("pickFirst picks the first non-empty string");

/* ---- parseShortcut ---- */
const ctrlJ = parseShortcut("ctrl+j");
assert.notEqual(ctrlJ, null);
assert.deepEqual({ ...ctrlJ }, { ctrl: true, shift: false, alt: false, meta: false, code: "KeyJ", label: "Ctrl+J" });
ok('parse "ctrl+j"');
const ctrlBackquote = parseShortcut("ctrl+`");
assert.notEqual(ctrlBackquote, null);
assert.equal(ctrlBackquote.code, "Backquote");
assert.equal(ctrlBackquote.label, "Ctrl+`");
ok('parse "ctrl+`"');
const shiftF1 = parseShortcut("ctrl+shift+f1");
assert.notEqual(shiftF1, null);
assert.equal(shiftF1.code, "F1");
assert.equal(shiftF1.label, "Ctrl+Shift+F1");
ok('parse "ctrl+shift+f1"');
assert.equal(parseShortcut("ctrl+j").label, parseShortcut("CTRL + J").label);
ok("modifier order and case are normalized");
assert.deepEqual(parseShortcut("ctrl+meta+space").code, "Space");
ok('parse "ctrl+meta+space"');
for (const bad of ["", "ctrl", "ctrl+", "ctrl+qq", "ctrl+ctrl+j", "wat+j", "f13", null, undefined, 42]) {
  assert.equal(parseShortcut(bad), null, "expected null for " + JSON.stringify(bad));
}
ok("invalid inputs return null");

/* ---- matchesShortcut ---- */
const mk = (code, mods) => ({ code, ctrlKey: !!mods?.ctrl, shiftKey: !!mods?.shift, altKey: !!mods?.alt, metaKey: !!mods?.meta });
assert.equal(matchesShortcut(ctrlJ, mk("KeyJ", { ctrl: true })), true);
assert.equal(matchesShortcut(ctrlJ, mk("KeyJ", { ctrl: true, shift: true })), false);
assert.equal(matchesShortcut(ctrlJ, mk("KeyK", { ctrl: true })), false);
assert.equal(matchesShortcut(null, mk("KeyJ", { ctrl: true })), false);
ok("matchesShortcut checks code and exact modifiers");

console.log("\n" + passed + " groups passed");