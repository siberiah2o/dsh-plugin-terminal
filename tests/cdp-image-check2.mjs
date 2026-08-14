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
  // check if the composer shows image attachment UI
  const hasAttachment = await ev("!!document.querySelector('input[type=file]')");
  console.log("file input exists:", hasAttachment);
  // check drop overlay labels (would show if images supported)
  const drop = await ev("document.querySelector('[data-drop-overlay]')?.textContent || 'no overlay'");
  console.log("drop overlay:", drop);
}
main().catch(e => { console.log("FATAL:", e.message); process.exit(1); });