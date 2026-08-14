
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const port = process.env.TP_PORT || "3081";
  const page = targets.find(t => t.type === "page" && t.url.includes(":" + port));
  if (!page) { console.log("NO PAGE"); return; }
  console.log("page found:", page.url);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === "Runtime.consoleAPICalled") {
      logs.push("[console] " + (msg.params.args || []).map(a => a.value ?? a.description ?? "").join(" "));
    } else if (msg.method === "Runtime.exceptionThrown") {
      logs.push("[EXC] " + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || "?"));
    }
  };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Runtime.enable");
  await send("Page.enable");
  await sleep(2500);

  let found = false;
  for (let i = 0; i < 24; i++) {
    const r = await send("Runtime.evaluate", { expression: "!!document.querySelector('.dshTermBar')", returnByValue: true });
    if (r.result?.result?.value === true) { found = true; break; }
    await sleep(500);
  }
  console.log("dock bar found:", found);
  if (!found) { console.log("LOGS:\n" + logs.join("\n")); return; }

  await send("Runtime.evaluate", { expression: "document.querySelector('.dshTermBar').click()" });
  await sleep(2500);

  const st = await send("Runtime.evaluate", {
    expression: "JSON.stringify({panel: !!document.querySelector('.dshTermPanel'), input: !!document.querySelector('.dshTermIn'), state: document.querySelector('.dshTermBarState')?.textContent, out: (document.querySelector('.dshTermOut')?.textContent || '').slice(0, 200)})",
    returnByValue: true
  });
  console.log("panel state:", st.result?.result?.value);

  await send("Runtime.evaluate", {
    expression: "(() => { const el = document.querySelector('.dshTermIn'); el.focus(); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(el, 'echo CDP-TEST'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()"
  });
  await sleep(3500);

  const out2 = await send("Runtime.evaluate", { expression: "document.querySelector('.dshTermOut')?.textContent || ''", returnByValue: true });
  const text = out2.result?.result?.value || "";
  console.log("output bytes:", text.length, "| has CDP-TEST:", text.includes("CDP-TEST"));
  console.log("output tail:", text.slice(-300));
  console.log("LOGS:\n" + logs.join("\n"));
}
main().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
