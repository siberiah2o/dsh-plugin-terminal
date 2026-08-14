
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find(t => t.type === "page" && (t.url.includes("3081") || t.url.includes("3080")));
  if (!page) { console.log("NO PAGE"); return; }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === "Runtime.consoleAPICalled") logs.push("[console] " + (msg.params.args || []).map(a => a.value ?? a.description ?? "").join(" "));
    else if (msg.method === "Runtime.exceptionThrown") logs.push("[EXC] " + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || "?"));
  };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:3080/" });
  await sleep(5000);

  let found = false;
  for (let i = 0; i < 24; i++) {
    const r = await send("Runtime.evaluate", { expression: "!!document.querySelector('.dshTermBar')", returnByValue: true });
    if (r.result?.result?.value === true) { found = true; break; }
    await sleep(500);
  }
  console.log("dock bar found on 3080:", found);
  if (!found) { console.log("LOGS:\n" + logs.join("\n")); return; }

  await send("Runtime.evaluate", { expression: "document.querySelector('.dshTermBar').click()" });
  await sleep(3000);
  const st = await send("Runtime.evaluate", {
    expression: "JSON.stringify({panel: !!document.querySelector('.dshTermPanel'), input: !!document.querySelector('.dshTermIn'), state: document.querySelector('.dshTermBarState')?.textContent, out: (document.querySelector('.dshTermOut')?.textContent || '').slice(0, 200)})",
    returnByValue: true
  });
  console.log("panel state on 3080:", st.result?.result?.value);

  await send("Runtime.evaluate", {
    expression: "(() => { const el = document.querySelector('.dshTermIn'); el.focus(); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(el, 'echo CDP-3080'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()"
  });
  await sleep(4000);
  const out2 = await send("Runtime.evaluate", { expression: "document.querySelector('.dshTermOut')?.textContent || ''", returnByValue: true });
  const text = out2.result?.result?.value || "";
  console.log("output bytes:", text.length, "| has CDP-3080:", text.includes("CDP-3080"));
  console.log("output has raw escape:", /\\u001b/.test(text));
  console.log("output tail:", text.slice(-300));
  console.log("LOGS:\n" + logs.join("\n"));
}
main().catch(e => { console.log("FATAL:", e.message); process.exit(1); });
