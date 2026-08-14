const sleep = (ms) => new Promise(r => setTimeout(r, ms));
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
  await send("Page.navigate", { url: "http://127.0.0.1:3081/" });
  await sleep(6000);
  for (let i = 0; i < 30; i++) {
    if (await ev("!!document.querySelector('.dshTermHeader')")) break;
    await sleep(500);
  }
  if (!(await ev("!!document.querySelector('.dshTermTabs')"))) { await ev("document.querySelector('.dshTermHeader').click()"); await sleep(3000); }
  await sleep(1000);
  console.log("AUDIT:", await ev("(() => { const gs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : 'MISSING'; }; return JSON.stringify({ cardBg: gs('.dshTermCard','backgroundColor'), cardRadius: gs('.dshTermCard','borderRadius'), headerH: gs('.dshTermHeader','height'), titleFont: gs('.dshTermTitle','fontSize') + '/' + gs('.dshTermTitle','fontWeight'), titleColor: gs('.dshTermTitle','color'), tabH: gs('.dshTermTab','height'), tabRadius: gs('.dshTermTab','borderRadius'), tabActiveBg: gs('.dshTermTab.isActive','backgroundColor'), tabActiveColor: gs('.dshTermTab.isActive','color'), tabIdleColor: gs('.dshTermTab:not(.isActive)','color'), tabsCount: document.querySelectorAll('.dshTermTab').length, bodyH: gs('.dshTermBody','height'), xtermCursor: gs('.xterm-cursor','backgroundColor') !== 'MISSING' ? 'present' : 'none', xtermRows: document.querySelectorAll('.dshTermPane.isActive .xterm-rows > div').length, fgColor: gs('.dshTermPane.isActive .xterm-rows','color') }); })()"));
  console.log("DOCK POS:", await ev("(() => { const d = document.querySelector('.dshTermDock'); if (!d) return 'MISSING'; const r = d.getBoundingClientRect(); return JSON.stringify({ w: Math.round(r.width), x: Math.round(r.x), bottom: Math.round(r.bottom), innerH: window.innerHeight }); })()"));
}
main().catch(e => { console.log("FATAL:", e.message); process.exit(1); });