/**
 * dsh-plugin-terminal - shortcut-string parsing for the panel toggle.
 *
 * Pure module (no DOM, no React) so the tests can load it in isolation.
 *
 * Accepted format: "mod1+mod2+key", e.g. "ctrl+`", "ctrl+j", "ctrl+shift+f1".
 * - modifiers: ctrl, shift, alt, meta (case-insensitive, any order; aliases
 *   control/option/cmd/win/command accepted)
 * - key: a letter, a digit, F1-F12, or one of the named keys below
 *
 * Matching is done on KeyboardEvent.code (layout-independent), so a German
 * layout's ctrl+j still matches KeyJ.
 */

const NAMED_KEYS = {
  "`": "Backquote", backquote: "Backquote", grave: "Backquote",
  "-": "Minus", "=": "Equal",
  "[": "BracketLeft", "]": "BracketRight", "\\": "Backslash",
  ";": "Semicolon", "'": "Quote",
  ",": "Comma", ".": "Period", "/": "Slash",
  space: "Space", enter: "Enter", return: "Enter",
  escape: "Escape", esc: "Escape", tab: "Tab",
  backspace: "Backspace", delete: "Delete",
  home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown",
  up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight",
};

const MODIFIERS = {
  ctrl: "ctrl", control: "ctrl",
  shift: "shift",
  alt: "alt", option: "alt",
  meta: "meta", cmd: "meta", win: "meta", command: "meta",
};

const MOD_LABEL = { ctrl: "Ctrl", shift: "Shift", alt: "Alt", meta: "Meta" };

/**
 * Parse a shortcut string into a matchable spec.
 * @param input - e.g. "ctrl+j" or "ctrl+shift+`".
 * @returns {ctrl, shift, alt, meta, code, label} | null when unparseable.
 */
export function parseShortcut(input) {
  if (typeof input !== "string") return null;
  const parts = input.split("+").map((p) => p.trim().toLowerCase()).filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  const spec = { ctrl: false, shift: false, alt: false, meta: false, code: null, label: null };
  const mods = [];
  while (parts.length > 1) {
    const mod = MODIFIERS[parts.shift()];
    if (mod === undefined || spec[mod]) return null;
    spec[mod] = true;
    mods.push(mod);
  }
  const keyToken = parts[0];
  if (keyToken === undefined) return null;
  let code = null;
  let keyLabel = null;
  if (/^[a-z]$/.test(keyToken)) {
    code = "Key" + keyToken.toUpperCase();
    keyLabel = keyToken.toUpperCase();
  } else if (/^[0-9]$/.test(keyToken)) {
    code = "Digit" + keyToken;
    keyLabel = keyToken;
  } else if (NAMED_KEYS[keyToken] !== undefined) {
    code = NAMED_KEYS[keyToken];
    keyLabel = code === "Backquote" ? "`" : code;
  } else if (/^f([1-9]|1[0-2])$/.test(keyToken)) {
    code = "F" + keyToken.slice(1);
    keyLabel = code;
  } else {
    return null;
  }
  spec.code = code;
  spec.label = [...mods.map((m) => MOD_LABEL[m]), keyLabel].join("+");
  return spec;
}

/**
 * Does a KeyboardEvent match the parsed spec?
 * @param spec - result of {@link parseShortcut}.
 * @param ev - the keydown event.
 * @returns true when every modifier and the key code line up.
 */
export function matchesShortcut(spec, ev) {
  if (spec === null) return false;
  if (spec.code !== null && ev.code !== spec.code) return false;
  return ev.ctrlKey === spec.ctrl
    && ev.shiftKey === spec.shift
    && ev.altKey === spec.alt
    && ev.metaKey === spec.meta;
}
