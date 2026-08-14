
const B = process.env.TP_BASE ?? "http://127.0.0.1:3081";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const created = await (await fetch(B + "/terminal-panel/sessions", { method: "POST", headers: {"content-type":"application/json"}, body: "{}" })).json();
  console.log("created:", created.id, created.shell);
  // open SSE first
  const chunks = [];
  const ctrl = new AbortController();
  const res = await fetch(B + "/terminal-panel/sessions/" + created.id + "/stream", { signal: ctrl.signal });
  (async () => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(dec.decode(value));
    }
  })().catch(() => {});
  await sleep(2500); // let the shell settle
  console.log("-- sending echo --");
  await fetch(B + "/terminal-panel/sessions/" + created.id + "/input", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ data: "echo hello-from-plugin\r" }) });
  await sleep(2500);
  ctrl.abort();
  const text = chunks.join("");
  console.log("-- stream captured bytes:", text.length);
  console.log("contains hello-from-plugin:", text.includes("hello-from-plugin"));
  // cleanup
  await fetch(B + "/terminal-panel/sessions/" + created.id, { method: "DELETE" });
  console.log("killed");
})().catch(e => { console.error("FAIL", e); process.exit(1); });
