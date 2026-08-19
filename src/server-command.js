/**
 * dsh-plugin-terminal - pure command-line helpers for the host half.
 *
 * Kept free of harness imports so the tests can load it in isolation.
 */

/**
 * Split a shell command line into its file and argument tokens, honoring
 * double-quoted segments. This is what turns a configured command like
 *
 *   cmd.exe /k "C:\cmder\vendor\init.bat"
 *
 * into ['cmd.exe', '/k', 'C:\cmder\vendor\init.bat'] for node-pty.
 *
 * Quoting rules are deliberately simple: every double quote toggles a
 * quoted segment (no escape sequences, no single quotes) - enough for the
 * documented use cases like quoted paths with spaces.
 * @param input - the raw command line.
 * @returns the token list; empty string input yields [].
 */
export function splitCommandLine(input) {
  const tokens = []
  let current = ''
  let quoted = false
  for (const ch of String(input).trim()) {
    if (ch === '"') {
      quoted = !quoted
      continue
    }
    if ((ch === ' ' || ch === '\t') && !quoted) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += ch
  }
  if (current.length > 0) tokens.push(current)
  return tokens
}

/** First non-empty string among the arguments (allows unset env fallbacks). */
export function pickFirst(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return undefined
}
