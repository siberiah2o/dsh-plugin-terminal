const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fs = await import("node:fs");
const URL_ = "http://127.0.0.1:3082/";
const OUT = "/Users/siberia/ai_completion/dsh-plugin-terminal/docs";
fs.mkdirSync(OUT, { recursive: true });
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = (expression) => send("Runtime.evaluate", { expression, returnByValue: true }).then(r => r.result?.result?.value);
  const shot = async (name) => fs.writeFileSync(OUT + "/" + name, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 2, mobile: false });
  await send("Page.navigate", { url: URL_ });
  await sleep(7000);
  let hasBar = false;
  for (let i = 0; i < 30; i++) {
    hasBar = await ev("!!document.querySelector('.dshTermBar')");
    if (hasBar) break;
    await sleep(500);
  }
  console.log("term bar:", hasBar);
  // if no session open, try clicking the first session row
  if (!hasBar) {
    const clicked = await ev("(() => { const rows = document.querySelectorAll('[role=listitem], .conversation-row, [class*=session][class*=row]'); if (rows.length) { rows[0].click(); return true; } return false; })()");
    console.log("clicked first session:", clicked);
    await sleep(4000);
    hasBar = await ev("!!document.querySelector('.dshTermBar')");
    console.log("term bar after click:", hasBar);
  }
  await sleep(1200);
  await shot("screenshot-collapsed.png");
  console.log("collapsed ok");
  await ev("document.querySelector('.dshTermBar').click()");
  await sleep(5000);
  console.log("tabs:", await ev("document.querySelectorAll('.dshTermTab').length"), "| pane:", await ev("!!document.querySelector('.dshTermPane.isActive .xterm-rows')"));
  await shot("screenshot-panel.png");
  console.log("panel ok");
  await ev("document.querySelector('.dshTermNew')?.click()");
  await sleep(3500);
  console.log("tabs2:", await ev("document.querySelectorAll('.dshTermTab').length"));
  await shot("screenshot-multitab.png");
  console.log("multitab ok");
  console.log("DONE");
}
main().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
