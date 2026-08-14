const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fs = await import("node:fs");
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find(t => t.type === "page");
  if (!page) { console.log("NO PAGE - launch edge first"); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(msg.params.args.map(a => a.value ?? a.description ?? "").join(" ")); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = (expression) => send("Runtime.evaluate", { expression, returnByValue: true }).then(r => r.result?.result?.value);
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
  await send("Page.navigate", { url: "http://127.0.0.1:3081/" });
  await sleep(6000);
  for (let i = 0; i < 30; i++) {
    if (await ev("!!document.querySelector('.dshTermHeader')")) break;
    await sleep(500);
  }
  if (!(await ev("!!document.querySelector('.dshTermTabs')"))) { await ev("document.querySelector('.dshTermHeader').click()"); }
  await sleep(3500);
  console.log("CONTRAST:", await ev("(() => { const gs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : 'MISSING'; }; const lum = (rgb) => { const m = rgb.match(/\\d+(?:\\.\\d+)?/g).map(Number).slice(0,3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; }; const ratio = (a, b) => { const l1 = Math.max(lum(a), lum(b)), l2 = Math.min(lum(a), lum(b)); return (l1 + 0.05) / (l2 + 0.05); }; const pane = document.querySelector('.dshTermPane.isActive'); if (!pane) return 'NO PANE'; const bgc = gs('.dshTermPane.isActive', 'backgroundColor'); const spans = [...pane.querySelectorAll('.xterm-rows span')]; const fg7 = spans.find(s => s.classList.contains('xterm-fg-7')); const fg8 = spans.find(s => s.classList.contains('xterm-fg-8')); const plain = spans.find(s => s.className === '' || s.classList.length === 0); const def = gs('.dshTermPane.isActive .xterm-rows', 'color'); return JSON.stringify({ paneBg: bgc, xtermScreenBg: gs('.dshTermPane.isActive .xterm', 'backgroundColor'), defaultFg: def, defaultContrast: Math.round(ratio(def, bgc) * 10) / 10, fg7Color: fg7 ? getComputedStyle(fg7).color : 'none-in-buffer', fg7Contrast: fg7 ? Math.round(ratio(getComputedStyle(fg7).color, bgc) * 10) / 10 : null, fg8Color: fg8 ? getComputedStyle(fg8).color : 'none', fg8Contrast: fg8 ? Math.round(ratio(getComputedStyle(fg8).color, bgc) * 10) / 10 : null, spanCount: spans.length, sampleText: pane.querySelector('.xterm-rows').textContent.slice(0, 60) }); })()"));
  await sleep(500);
  fs.writeFileSync("E:/gogame/dsh-plugin-terminal/shots/darktheme.png", Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  console.log("errors:", errors.length ? errors.join(";;").slice(0, 300) : "(none)");
}
main().catch(e => { console.log("FATAL:", e.message); process.exit(1); });