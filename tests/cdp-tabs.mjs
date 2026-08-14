const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fs = await import("node:fs");
async function main() {
  const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === "Runtime.consoleAPICalled" && ["error","warning"].includes(msg.params.type)) errors.push(msg.params.args.map(a => a.value ?? a.description ?? "").join(" "));
    else if (msg.method === "Runtime.exceptionThrown") errors.push("EXC " + (msg.params.exceptionDetails?.exception?.description || "?"));
  };
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
  await sleep(600);
  fs.writeFileSync("E:/gogame/dsh-plugin-terminal/shots/collapsed.png", Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  // open panel
  await ev("document.querySelector('.dshTermHeader').click()");
  await sleep(3500);
  console.log("tabs after open:", await ev("document.querySelectorAll('.dshTermTab').length"));
  // create 2nd tab
  await ev("document.querySelector('.dshTermNew').click()");
  await sleep(2500);
  console.log("tabs after +:", await ev("document.querySelectorAll('.dshTermTab').length"));
  console.log("active label:", await ev("document.querySelector('.dshTermTab.isActive .dshTermTabLabel')?.textContent"));
  // type in tab 2 (active)
  await ev("document.querySelector('.xterm-helper-textarea')?.focus()");
  await send("Input.insertText", { text: "echo TAB-TWO" });
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(2500);
  // switch to tab 1
  await ev("document.querySelectorAll('.dshTermTab')[0].click()");
  await sleep(1500);
  console.log("active after switch:", await ev("document.querySelector('.dshTermTab.isActive .dshTermTabLabel')?.textContent"));
  await send("Input.insertText", { text: "echo TAB-ONE" });
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(2500);
  // verify visible pane shows TAB-ONE, hidden pane 2 exists with its own xterm
  const visible = await ev("document.querySelector('.dshTermPane.isActive .xterm-rows')?.textContent ?? ''");
  console.log("visible has TAB-ONE:", visible.includes("TAB-ONE"), "| has TAB-TWO (should be false):", visible.includes("TAB-TWO"));
  console.log("panes total:", await ev("document.querySelectorAll('.dshTermPane').length"));
  // screenshot with 2 tabs
  fs.writeFileSync("E:/gogame/dsh-plugin-terminal/shots/multitab.png", Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
  // switch back to tab2 and confirm scrollback preserved
  await ev("document.querySelectorAll('.dshTermTab')[1].click()");
  await sleep(1200);
  const t2 = await ev("document.querySelector('.dshTermPane.isActive .xterm-rows')?.textContent ?? ''");
  console.log("tab2 back - has TAB-TWO:", t2.includes("TAB-TWO"));
  // server sees 2 sessions
  const s = await (await fetch("http://127.0.0.1:3081/terminal-panel/sessions")).json();
  console.log("server sessions:", s.sessions.length, s.sessions.map(x => x.title).join(" | "));
  console.log("console errors:", errors.length ? errors.join(" ;; ").slice(0, 500) : "(none)");
}
main().catch(e => { console.log("FATAL:", e.message); process.exit(1); });