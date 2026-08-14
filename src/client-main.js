/**
 * dsh-plugin-terminal — client half (xterm.js edition).
 *
 * A bottom dock panel for the DSH Web GUI hosting a full VT terminal
 * (xterm.js 6): colors, cursor, alternate screen buffer, Unicode width.
 * Transport is a WebSocket to the host's /terminal-panel/ws endpoint
 * (fallback: SSE + POST for browsers without WebSocket support).
 *
 * This file is bundled by build.mjs into the __ModuleLoader__.load factory.
 */
import React from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const PREFIX = "/terminal-panel";

/* xterm.css is injected as a <style> tag at boot (self-contained bundle). */
const XTERM_CSS_TAG = "dsh-plugin-terminal-xterm-css";
if (typeof document !== "undefined" && document.getElementById(XTERM_CSS_TAG) === null) {
  const cssUrl = PREFIX + "/xterm.css";
  const link = document.createElement("link");
  link.id = XTERM_CSS_TAG;
  link.rel = "stylesheet";
  link.href = cssUrl;
  document.head.appendChild(link);
}

/* ── host API (HTTP, used for session control + WS fallback) ───────────── */
async function api(path, opts) {
  const res = await fetch(PREFIX + path, opts);
  if (!res.ok) throw new Error("terminal-panel " + res.status);
  return res.json();
}
const post = (path, body) =>
  api(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

/* ── WebSocket session bridge ──────────────────────────────────────────── */
function connectWS(sid, onOpen, onData, onClose) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(proto + "//" + location.host + PREFIX + "/ws/" + sid);
  ws.onopen = onOpen;
  ws.onmessage = (ev) => onData(ev.data);
  ws.onclose = () => onClose();
  ws.onerror = () => ws.close();
  return ws;
}

/* ── the panel ─────────────────────────────────────────────────────────── */
function TerminalPanel() {
  const { useEffect, useRef, useState, useCallback } = React;
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [exited, setExited] = useState(false);
  const [shellName, setShellName] = useState("");
  const [busy, setBusy] = useState(false);
  const hostRef = useRef(null);      // container div for xterm
  const termRef = useRef(null);      // Terminal instance
  const fitRef = useRef(null);       // FitAddon
  const wsRef = useRef(null);        // active WebSocket
  const bufRef = useRef("");         // scrollback accumulator (for reconnect snapshot)

  /* boot: create/reuse session, open WS, render xterm */
  const boot = useCallback(async (forceNew) => {
    setBusy(true);
    try {
      let s = null;
      if (!forceNew) {
        const list = await api("/sessions");
        const live = (list.sessions ?? []).filter((x) => !x.exited);
        s = live.length > 0 ? live[live.length - 1] : null;
      }
      if (s === null) s = await post("/sessions", {});
      setSessionId(s.id);
      setShellName(s.shell ?? "");
      setExited(false);

      // (re)create xterm on the container
      const host = hostRef.current;
      if (host === null) return;
      if (termRef.current !== null) termRef.current.dispose();
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: "ui-monospace, SFMono-Regular, Consolas, 'Courier New', monospace",
        fontSize: 12,
        scrollback: 5000,
        convertEol: false,
        allowProposedApi: false,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();
      termRef.current = term;
      fitRef.current = fit;

      // WS transport
      const ws = connectWS(
        s.id,
        () => {
          // on open: nothing extra needed; snapshot arrives via HTTP fetch below
        },
        (data) => {
          if (typeof data === "string") {
            term.write(data);
            bufRef.current = (bufRef.current + data).slice(-200_000);
          }
        },
        () => {
          setExited((v) => v);
          wsRef.current = null;
        },
      );
      wsRef.current = ws;
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      });
      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      });
      // initial scrollback via snapshot
      try {
        const snap = await fetch(PREFIX + "/sessions/" + s.id + "/snapshot").then((r) => r.json());
        if (typeof snap.buffer === "string" && snap.buffer.length > 0) {
          term.write(snap.buffer);
          bufRef.current = snap.buffer.slice(-200_000);
        }
      } catch {
        /* snapshot optional */
      }
    } catch (err) {
      setExited(true);
      console.error("[dsh-plugin-terminal] boot failed:", err);
    } finally {
      setBusy(false);
    }
  }, []);

  const restart = useCallback(async () => {
    if (sessionId !== null) {
      await api("/sessions/" + sessionId, { method: "DELETE" }).catch(() => {});
    }
    wsRef.current?.close();
    setSessionId(null);
    setExited(false);
    bufRef.current = "";
    await boot(true);
  }, [boot, sessionId]);

  /* layout effect: mount xterm when panel opens */
  useEffect(() => {
    if (open && sessionId === null && !busy) boot(false);
  }, [open, sessionId, busy, boot]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      termRef.current?.dispose();
    };
  }, []);

  /* fit on container resize */
  useEffect(() => {
    if (!open || termRef.current === null) return;
    const host = hostRef.current;
    if (host === null) return;
    const ro = new ResizeObserver(() => {
      try {
        fitRef.current?.fit();
      } catch {
        /* not mounted yet */
      }
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [open]);

  const stateLabel = exited ? "exited" : sessionId === null ? (busy ? "starting…" : "idle") : shellName || "shell";

  return React.createElement(
    "div",
    { className: "dshTermDock" },
    React.createElement(
      "div",
      {
        className: "dshTermBar",
        role: "button",
        tabIndex: 0,
        onClick: () => setOpen((v) => !v),
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        },
      },
      React.createElement("span", { className: "dshTermBarLead" }, Chevron(open)),
      React.createElement("span", { className: "dshTermBarLead" }, TerminalIcon()),
      React.createElement("span", { className: "dshTermBarTitle" }, "终端 Terminal"),
      React.createElement("span", { className: "dshTermBarState" }, stateLabel),
      React.createElement(
        "span",
        { className: "dshTermBarActions", onClick: (e) => e.stopPropagation() },
        open && sessionId !== null && !exited
          ? React.createElement("button", { className: "dshTermBtn", title: "restart", onClick: restart }, "⟳")
          : null,
        open && sessionId !== null
          ? React.createElement(
              "button",
              {
                title: "close session",
                onClick: async () => {
                  wsRef.current?.close();
                  await api("/sessions/" + sessionId, { method: "DELETE" }).catch(() => {});
                  setSessionId(null);
                },
              },
              "✕",
            )
          : null,
      ),
    ),
    open
      ? React.createElement("div", { className: "dshTermPanel", ref: hostRef, style: { padding: "6px 0 0 6px" } })
      : null,
  );
}

/* icons */
function Chevron(open) {
  return React.createElement(
    "svg",
    { width: 14, height: 14, viewBox: "0 0 16 16", fill: "currentColor", style: { transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" } },
    React.createElement("path", { d: "M6 3.5L10.5 8L6 12.5z" }),
  );
}
function TerminalIcon() {
  return React.createElement(
    "svg",
    { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4 },
    React.createElement("rect", { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2 }),
    React.createElement("path", { d: "M4.5 6.5l2 2-2 2M8 10.5h3.5" }),
  );
}

export { TerminalPanel };
