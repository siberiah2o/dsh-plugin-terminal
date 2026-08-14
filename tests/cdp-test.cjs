
const http = require("node:http");
const WS = globalThis.WebSocket;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getTargets() {
  return new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9222/json", (res) => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

(async () => {
  const targets = await getTargets();
  const page = targets.find(t => t.type === "page" && t.url.includes("3081"));
  if (!page) { console.log("no page target:", targets.map(t => t.type + ":" + t.url).join(" | ")); process.exit(1); }
  const ws = new WS(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) events.push(msg);
  };
  await new Promise(res => ws.onopen = res);
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Runtime.enable");
  await send("Page.enable");
  await sleep(3000);

  // capture console + exceptions
  const consoleLogs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === "Runtime.consoleAPICalled") {
      consoleLogs.push("[console." + msg.params.type + "] " + (msg.params.args || []).map(a => a.value ?? a.description ?? "").join(" "));
    }
    if (msg.method === "Runtime.exceptionThrown") {
      consoleLogs.push("[EXCEPTION] " + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || "?"));
    }
  };

  // wait for dock bar to appear
  let found = false;
  for (let i = 0; i < 20; i++) {
    const r = await send("Runtime.evaluate", { expression: `document.querySelector(".dshTermBar") !== null`, returnByValue: true });
    if (r.result?.result?.value === true) { found = true; break; }
    await sleep(500);
  }
  console.log("dock bar found:", found);
  if (!found) { console.log("console logs:", consoleLogs.slice(0, 30).join("\n")); process.exit(1); }

  // click it
  await send("Runtime.evaluate", { expression: `document.querySelector(".dshTermBar").click()` });
  await sleep(2500);

  // check panel + session state
  const st = await send("Runtime.evaluate", {
    expression: `JSON.stringify({ panel: !!document.querySelector(".dshTermPanel"), input: !!document.querySelector(".dshTermIn"), out: (document.querySelector(".dshTermOut")?.textContent || "").slice(0, 300), state: document.querySelector(".dshTermBarState")?.textContent })`,
    returnByValue: true
  });
  console.log("panel state:", st.result?.result?.value);

  // type a command
  await send("Runtime.evaluate", {
    expression: `(() => { const el = document.querySelector(".dshTermIn"); el.focus(); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(el, "echo CDP-TEST"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()`
  });
  await sleep(3000);

  const out2 = await send("Runtime.evaluate", {
    expression: `document.querySelector(".dshTermOut")?.textContent || ""`,
    returnByValue: true
  });
  const text = out2.result?.result?.value || "";
  console.log("output after command, bytes:", text.length);
  console.log("contains CDP-TEST:", text.includes("CDP-TEST"));
  console.log("output tail:", text.slice(-400));

  console.log("--- console logs ---");
  console.log(consoleLogs.slice(0, 40).join("\n"));
  process.exit(0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
