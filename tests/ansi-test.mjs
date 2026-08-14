
const ANSI_RE = /(?:\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]|\x07)/g;
const clean = (raw) => raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(ANSI_RE, "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
const sample = "\u001b[?9001h\u001b[?1004h\u001b[?25l\u001b[2J\u001b[m\u001b[H\u001b]0;powershell\u0007\u001b[?25h\u001b[K\u001b[H(base) PS E:\\gogame> ";
const out = clean(sample);
console.log("clean result:", JSON.stringify(out));
console.log("leftover escape:", /\u001b/.test(out));
