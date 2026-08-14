// Smoke test: spawn a real PTY with buildSessionEnv() and verify the child
// sees TERM/COLORTERM/LANG etc. Run: node tests/smoke-env.mjs
import { spawn } from "node-pty";
import { buildSessionEnv } from "../lib/index.js";

const env = buildSessionEnv();
const pty = spawn("/bin/bash", ["-c", "echo TERM=$TERM COLORTERM=$COLORTERM LANG=$LANG LC_ALL=$LC_ALL PYTHONIOENCODING=$PYTHONIOENCODING"], {
  name: "xterm-256color",
  cols: 80,
  rows: 24,
  env,
});
let out = "";
pty.onData((d) => { out += d; });
pty.onExit(() => {
  const got = out.trim();
  console.log("child says:", got);
  const want = ["TERM=xterm-256color", "COLORTERM=truecolor", "PYTHONIOENCODING=utf-8", "LC_ALL=en_US.UTF-8"];
  const missing = want.filter((w) => !got.includes(w));
  const hasLANG = /LANG=[^ ]+/.test(got); // LANG may be user-set; just ensure present
  if (missing.length === 0 && hasLANG) {
    console.log("PASS: PTY child env tuned");
    process.exit(0);
  } else {
    console.error("FAIL: missing", missing, "LANG-ok", hasLANG);
    process.exit(1);
  }
});
