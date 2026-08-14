const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fs = await import("node:fs");
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = (expression) => send("Runtime.evaluate", { expression, returnByValue: true }).then(r => r.result?.result?.value);
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
  await send("Page.navigate", { url: "http://127.0.0.1:3081/" });
  await sleep(6000);
  for (let i = 0; i < 30; i++) { if (await ev("!!document.querySelector('.dshTermHeader')")) break; await sleep(500); }
  await ev("document.querySelector('.dshTermHeader').click()");
  for (let i = 0; i < 12; i++) { await sleep(1000); if (await ev("!!document.querySelector('.dshTermPane.isActive .xterm-rows')")) break; }
  await sleep(2000);
  await ev("document.querySelector('.xterm-helper-textarea')?.focus()");
  // build ANSI test string in page: E = ESC char
  const typed = "Write-Host ([char]27 + '[32mGREEN' + [char]27 + '[0m ' + [char]27 + '[33mYELLOW' + [char]27 + '[0m ' + [char]27 + '[34mBLUE' + [char]27 + '[0m ' + [char]27 + '[90mGRAY' + [char]27 + '[0m') -NoNewline";
  await send("Input.insertText", { text: typed });
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(3000);
  console.log("COLORS:", await ev("(() => { const pane = document.querySelector('.dshTermPane.isActive'); if (!pane) return 'NO PANE'; const spans = [...pane.querySelectorAll('.xterm-rows span')]; const lum = (rgb) => { const m = rgb.match(/\\d+(?:\\.\\d+)?/g).map(Number).slice(0,3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; }; const bgc = getComputedStyle(pane).backgroundColor; const ratio = (c) => { const l1 = Math.max(lum(c), lum(bgc)), l2 = Math.min(lum(c), lum(bgc)); return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 10) / 10; }; const byClass = {}; for (const s of spans) { for (const c of s.classList) { if (c.startsWith('xterm-fg-') || c.startsWith('xterm-bg-')) byClass[c] = { color: getComputedStyle(s).color, contrastVsPane: ratio(getComputedStyle(s).color) }; } } return JSON.stringify({ classes: byClass, text: pane.querySelector('.xterm-rows').textContent.slice(-100) }); })()"));
  fs.writeFileSync("E:/gogame/dsh-plugin-terminal/shots/colors.png", Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  console.log("shot saved");
}
main().catch(e => { console.log("FATAL:", e.message); process.exit(1); });