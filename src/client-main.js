/**
 * dsh-plugin-terminal - client half (xterm.js, multi-tab, DSH-native styling).
 * Each tab owns an independent PTY session + xterm instance + WebSocket;
 * switching tabs only swaps the visible pane - processes and scrollback stay.
 * Refresh restores every live session as its own tab. Visual language copied
 * from the official QueueDock (tokens, 36px header, 28px round actions).
 */
import React from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const PREFIX = "/terminal-panel";

/* xterm stylesheet served by the host plugin */
const XTERM_CSS_TAG = "dsh-plugin-terminal-xterm-css";
if (typeof document !== "undefined" && document.getElementById(XTERM_CSS_TAG) === null) {
  const link = document.createElement("link");
  link.id = XTERM_CSS_TAG;
  link.rel = "stylesheet";
  link.href = PREFIX + "/xterm.css";
  document.head.appendChild(link);
}

/* panel skin - design tokens identical to QueueDock.module.css */
const STYLE_TAG = "dsh-plugin-terminal-styles";
const PANEL_CSS = ".dshTermDock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto calc(0px - var(--dsh-composer-stack-gap) - 3px);padding:0 var(--dsh-composer-dock-inset);flex:none}\n.dshTermCard{background:var(--dsw-specific-tip);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:12px 12px 0 0;width:100%;padding:2px 0 0;position:relative;overflow:hidden}\n.dshTermCard:after{border:1px solid var(--dsw-alias-border-l1);border-radius:inherit;content:'';pointer-events:none;border-bottom:none;position:absolute;inset:0}\n.dshTermHeader{box-sizing:border-box;width:100%;height:36px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:none;align-items:center;gap:10px;padding:4px 12px;display:flex}\n.dshTermHeader:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}\n.dshTermLead{color:var(--dsw-alias-label-tertiary);flex:none;place-items:center;display:grid}\n.dshTermTitle{min-width:0;font-family:Inter,var(--dsw-font-family);flex:none;font-size:13px;font-weight:500;line-height:24px}\n.dshTermState{min-width:0;flex:auto;color:var(--dsw-alias-label-tertiary);font-family:Inter,var(--dsw-font-family);font-size:12px;line-height:24px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.dshTermActions{flex:none;align-items:center;gap:2px;display:flex;margin:0 2px 0 -6px}\n.dshTermAction{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:999px;flex:none;place-items:center;padding:0;display:grid}\n.dshTermAction:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}\n.dshTermAction:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}\n.dshTermAction:disabled{cursor:default;opacity:.45}\n.dshTermChevron{width:14px;height:14px;color:var(--dsw-alias-label-tertiary);flex:none;place-items:center;display:grid}\n.dshTermTabs{display:flex;align-items:center;gap:2px;padding:0 10px 6px;overflow-x:auto;flex:none;scrollbar-width:none}\n.dshTermTab{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 6px 0 10px;border-radius:8px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);font-family:Inter,var(--dsw-font-family);font-size:12px;font-weight:500;cursor:pointer;flex:none;max-width:180px}\n.dshTermTab:hover{background:var(--dsw-alias-interactive-bg-hover)}\n.dshTermTab.isActive{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}\n.dshTermTab.isActive:focus-visible,.dshTermTab:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}\n.dshTermTab.isExited{opacity:.5}\n.dshTermTab.isExited .dshTermTabLabel{text-decoration:line-through;text-decoration-thickness:1px}\n.dshTermTabLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.dshTermTabLead{display:grid;place-items:center;flex:none;opacity:.7}\n.dshTermTabClose{width:20px;height:20px;border:none;background:transparent;color:inherit;border-radius:6px;display:grid;place-items:center;cursor:pointer;padding:0;opacity:0;flex:none}\n.dshTermTab:hover .dshTermTabClose,.dshTermTab.isActive .dshTermTabClose{opacity:.65}\n.dshTermTabClose:hover{opacity:1;background:var(--dsw-alias-interactive-bg-hover)}\n.dshTermNew{width:28px;height:28px;flex:none;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);border-radius:999px;display:grid;place-items:center;cursor:pointer;padding:0}\n.dshTermNew:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}\n.dshTermNew:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px}\n.dshTermBody{position:relative;height:clamp(180px,32vh,420px);box-shadow:inset 0 1px 0 var(--dsw-alias-border-l1)}\n.dshTermPane{position:absolute;inset:0;display:none;padding:4px 10px 8px}\n.dshTermPane.isActive{display:block}\n.dshTermEmpty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:10px;color:var(--dsw-alias-label-tertiary);font-family:Inter,var(--dsw-font-family);font-size:12px}\n.dshTermEmptyBtn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:8px;border:none;background:transparent;color:var(--dsw-alias-label-primary);font-family:Inter,var(--dsw-font-family);font-size:12px;font-weight:500;cursor:pointer}\n.dshTermEmptyBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}";
if (typeof document !== "undefined" && document.getElementById(STYLE_TAG) === null) {
  const tag = document.createElement("style");
  tag.id = STYLE_TAG;
  tag.textContent = PANEL_CSS;
  document.head.appendChild(tag);
}

/* theme sampling: match the DSH card in dark & light */
function sampleTheme() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;visibility:hidden;background:var(--dsw-specific-tip)";
  document.body.appendChild(probe);
  const bg = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const nums = (bg.match(/[\d.]+/g) ?? []).map(Number);
  let dark = true;
  if (nums.length >= 3 && (nums.length < 4 || nums[3] !== 0)) {
    dark = (0.2126 * nums[0] + 0.7152 * nums[1] + 0.0722 * nums[2]) / 255 < 0.5;
  }
  return {
    background: "#00000000",
    foreground: dark ? "#d7dae0" : "#24292f",
    cursor: dark ? "#d7dae0" : "#24292f",
    cursorAccent: dark ? "#1b1d22" : "#ffffff",
    selectionBackground: dark ? "#3b4252aa" : "#c9d4e3aa",
  };
}

/* host API */
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
const del = (path) => api(path, { method: "DELETE" }).catch(() => {});
const prettyShell = (s) => (s ?? "shell").replace(/\.exe$/i, "");
/* server titles look like "pwsh.exe #3" - show "pwsh 3" */
function tabLabel(tab) {
  const m = /#(\d+)$/.exec(tab.title ?? "");
  const base = prettyShell(tab.shell);
  return m === null ? base : base + " " + m[1];
}

/* icons on the official 14/16px grids */
function TerminalGlyph14() {
  return React.createElement(
    "svg",
    { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
    React.createElement("rect", { x: 1.35, y: 1.35, width: 11.3, height: 11.3, rx: 2.4, stroke: "currentColor", strokeWidth: 1.05 }),
    React.createElement("path", { d: "M4.75 4.9L7.05 7L4.75 9.1", stroke: "currentColor", strokeWidth: 1.05, strokeLinecap: "round", strokeLinejoin: "round" }),
    React.createElement("path", { d: "M7.75 9.1H10.05", stroke: "currentColor", strokeWidth: 1.05, strokeLinecap: "round" }),
  );
}
function TerminalGlyph12() {
  return React.createElement(
    "svg",
    { width: 12, height: 12, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
    React.createElement("rect", { x: 1.35, y: 1.35, width: 11.3, height: 11.3, rx: 2.4, stroke: "currentColor", strokeWidth: 1.1 }),
    React.createElement("path", { d: "M4.75 4.9L7.05 7L4.75 9.1", stroke: "currentColor", strokeWidth: 1.1, strokeLinecap: "round", strokeLinejoin: "round" }),
    React.createElement("path", { d: "M7.75 9.1H10.05", stroke: "currentColor", strokeWidth: 1.1, strokeLinecap: "round" }),
  );
}
function ChevronDown14() {
  return React.createElement(
    "svg",
    { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
    React.createElement("path", { d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z", fill: "currentColor" }),
  );
}
function ChevronRight14() {
  return React.createElement(
    "svg",
    { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
    React.createElement("path", { d: "M5.5 2.15137L5.92383 2.57617L8.65137 5.30273C8.90706 5.55843 9.13382 5.78438 9.29785 5.98828C9.46883 6.20088 9.61756 6.44405 9.66602 6.75C9.69222 6.91565 9.69222 7.08435 9.66602 7.25C9.61756 7.55595 9.46883 7.79912 9.29785 8.01172C9.13382 8.21561 8.90706 8.44157 8.65137 8.69727L5.92383 11.4238L5.5 11.8486L4.65137 11L5.07617 10.5762L7.80273 7.84863C8.07732 7.57405 8.24849 7.40124 8.3623 7.25977C8.46904 7.12709 8.47813 7.07728 8.48047 7.0625C8.48703 7.02105 8.48703 6.97895 8.48047 6.9375C8.47813 6.92272 8.46904 6.87291 8.3623 6.74023C8.24849 6.59876 8.07732 6.42595 7.80273 6.15137L5.07617 3.42383L4.65137 3L5.5 2.15137Z", fill: "currentColor" }),
  );
}
function Refresh14() {
  return React.createElement(
    "svg",
    { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
    React.createElement("path", { d: "M1.272 6.21348C1.70645 3.08888 4.59169 0.908064 7.71634 1.34239C8.95495 1.51469 10.0438 2.07331 10.8814 2.87755L11.9458 1.81407C12.1347 1.6255 12.4572 1.75911 12.4575 2.02598V5.08751C12.4574 5.25303 12.3233 5.38731 12.1577 5.38731H9.0972C8.82993 5.38731 8.69629 5.06361 8.88528 4.87462L10.0327 3.72618C9.3732 3.09994 8.52006 2.66569 7.5513 2.53087C5.08313 2.18779 2.80376 3.91044 2.46048 6.37852C2.11747 8.84665 3.84009 11.1261 6.30814 11.4693C8.77612 11.8121 11.0557 10.0896 11.399 7.62148L12.728 7.80531C12.2935 10.9299 9.4083 13.1107 6.28366 12.6764C3.159 12.2421 0.977243 9.35731 1.272 6.21348Z", fill: "currentColor" }),
  );
}
function Close14() {
  return React.createElement(
    "svg",
    { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
    React.createElement("path", { d: "M10.6074 4.40278L8.00975 6.99973L10.6074 9.59739L9.59736 10.6074L6.9997 8.00978L4.40274 10.6074L3.3927 9.59739L5.98966 6.99973L3.3927 4.40278L4.40274 3.39273L6.9997 5.98969L9.59736 3.39273L10.6074 4.40278Z", fill: "currentColor" }),
  );
}
function Plus12() {
  return React.createElement(
    "svg",
    { width: 12, height: 12, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
    React.createElement("path", { d: "M8.64453 1.5V7.34961H14.5V8.65039H8.64453V14.5H7.34473V8.65039H1.5V7.34961H7.34473V1.5H8.64453Z", fill: "currentColor" }),
  );
}

/* one terminal pane: its own xterm + WS to one PTY session */
function TermPane({ tab, active, onExit }) {
  const { useEffect, useRef } = React;
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);

  /* mount: create terminal, connect WS */
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, 'Cascadia Mono', Consolas, Menlo, monospace",
      fontSize: 12.5,
      lineHeight: 1.25,
      scrollback: 5000,
      allowTransparency: true,
      theme: sampleTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch { /* zero-size guard */ }
    });
    termRef.current = term;
    fitRef.current = fit;

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(proto + "//" + location.host + PREFIX + "/ws/" + tab.id);
    ws.onmessage = (ev) => term.write(ev.data);
    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
        onExit(tab.id);
      }
    };
    ws.onerror = () => ws.close();
    wsRef.current = ws;
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    return () => {
      ws.onclose = null;
      ws.close();
      term.dispose();
      termRef.current = null;
      wsRef.current = null;
    };
  }, [tab.id]);

  /* re-theme when DSH switches dark/light */
  useEffect(() => {
    const apply = () => {
      if (termRef.current !== null) termRef.current.options.theme = sampleTheme();
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    return () => mo.disconnect();
  }, [tab.id]);

  /* activate: fit (dimensions may have settled) + focus */
  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit();
      } catch { /* not mounted */ }
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [active]);

  /* resize with the panel (only the visible pane can fit) */
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (!active) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
        } catch { /* not mounted */ }
      });
    });
    ro.observe(host);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active]);

  return React.createElement("div", {
    className: "dshTermPane" + (active ? " isActive" : ""),
    ref: hostRef,
    onMouseDown: () => {
      if (active) termRef.current?.focus();
    },
  });
}

/* the dock panel: tab strip + panes */
function TerminalPanel() {
  const { useEffect, useRef, useState, useCallback } = React;
  const [open, setOpen] = useState(false);
  /** tabs: [{id, title, shell, exited}] in strip order */
  const [tabs, setTabs] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [busy, setBusy] = useState(false);
  const bootOnce = useRef(false);

  const active = tabs.find((t) => t.id === activeId) ?? null;

  /* attach live sessions as tabs on first open (refresh restore) */
  useEffect(() => {
    if (!open || bootOnce.current) return;
    bootOnce.current = true;
    (async () => {
      setBusy(true);
      try {
        const list = await api("/sessions");
        const live = (list.sessions ?? []).filter((x) => !x.exited);
        if (live.length === 0) {
          const s = await post("/sessions", {});
          setTabs([{ id: s.id, title: s.title, shell: s.shell, exited: false }]);
          setActiveId(s.id);
        } else {
          setTabs(live.map((x) => ({ id: x.id, title: x.title, shell: x.shell, exited: false })));
          setActiveId(live[live.length - 1].id);
        }
      } catch (err) {
        console.error("[dsh-plugin-terminal] boot failed:", err);
      } finally {
        setBusy(false);
      }
    })();
  }, [open]);

  const onExit = useCallback((id) => {
    setTabs((cur) => cur.map((t) => (t.id === id ? { ...t, exited: true } : t)));
  }, []);

  /* + button: new session in a new tab */
  const newTab = useCallback(async () => {
    setBusy(true);
    try {
      const s = await post("/sessions", {});
      setTabs((cur) => [...cur, { id: s.id, title: s.title, shell: s.shell, exited: false }]);
      setActiveId(s.id);
    } catch (err) {
      console.error("[dsh-plugin-terminal] new tab failed:", err);
    } finally {
      setBusy(false);
    }
  }, []);

  /* x on a tab: delete session, drop tab, activate a neighbor */
  const closeTab = useCallback(async (id) => {
    setTabs((cur) => {
      const idx = cur.findIndex((t) => t.id === id);
      if (idx === -1) return cur;
      const next = cur.filter((t) => t.id !== id);
      setActiveId((act) => {
        if (act !== id) return act;
        if (next.length === 0) return null;
        return (next[Math.min(idx, next.length - 1)] ?? next[0]).id;
      });
      return next;
    });
    await del("/sessions/" + id);
  }, []);

  /* header ⟳: restart the active tab in place (keep strip position) */
  const restartActive = useCallback(async () => {
    if (active === null) return;
    setBusy(true);
    try {
      await del("/sessions/" + active.id);
      const s = await post("/sessions", {});
      setTabs((cur) => cur.map((t) => (t.id === active.id ? { id: s.id, title: s.title, shell: s.shell, exited: false } : t)));
      setActiveId(s.id);
    } catch (err) {
      console.error("[dsh-plugin-terminal] restart failed:", err);
    } finally {
      setBusy(false);
    }
  }, [active]);

  const stateLabel = busy
    ? "启动中…"
    : active === null
      ? tabs.length === 0 ? "无会话" : "空闲"
      : active.exited ? tabLabel(active) + " 已退出，点 ⟳ 重启" : tabLabel(active);

  return React.createElement(
    "div",
    { className: "dshTermDock" },
    React.createElement(
      "div",
      { className: "dshTermCard" },
      React.createElement(
        "div",
        {
          className: "dshTermHeader",
          role: "button",
          tabIndex: 0,
          "aria-expanded": open,
          onClick: () => setOpen((v) => !v),
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((v) => !v);
            }
          },
        },
        React.createElement("span", { className: "dshTermLead", "aria-hidden": true }, TerminalGlyph14()),
        React.createElement("span", { className: "dshTermTitle" }, "终端" + (tabs.length > 1 ? " · " + tabs.length : "")),
        React.createElement("span", { className: "dshTermState" }, stateLabel),
        React.createElement(
          "span",
          { className: "dshTermActions", onClick: (e) => e.stopPropagation() },
          active !== null && !active.exited
            ? React.createElement(
                "button",
                { className: "dshTermAction", title: "重启当前会话", disabled: busy, onClick: restartActive },
                Refresh14(),
              )
            : null,
        ),
        React.createElement(
          "span",
          { className: "dshTermChevron", "aria-hidden": true },
          open ? ChevronDown14() : ChevronRight14(),
        ),
      ),
      open
        ? React.createElement(
            "div",
            { className: "dshTermTabs", role: "tablist" },
            ...tabs.map((t) =>
              React.createElement(
                "button",
                {
                  key: t.id,
                  role: "tab",
                  "aria-selected": t.id === activeId,
                  className: "dshTermTab" + (t.id === activeId ? " isActive" : "") + (t.exited ? " isExited" : ""),
                  title: t.exited ? tabLabel(t) + " (已退出)" : tabLabel(t),
                  onClick: () => setActiveId(t.id),
                },
                React.createElement("span", { className: "dshTermTabLead", "aria-hidden": true }, TerminalGlyph12()),
                React.createElement("span", { className: "dshTermTabLabel" }, tabLabel(t)),
                React.createElement(
                  "span",
                  {
                    className: "dshTermTabClose",
                    role: "button",
                    title: "关闭 " + tabLabel(t),
                    onClick: (e) => {
                      e.stopPropagation();
                      closeTab(t.id);
                    },
                  },
                  Close14(),
                ),
              ),
            ),
            React.createElement(
              "button",
              {
                className: "dshTermNew",
                title: "新建终端",
                "aria-label": "新建终端",
                disabled: busy,
                onClick: newTab,
              },
              Plus12(),
            ),
          )
        : null,
      open
        ? React.createElement(
            "div",
            { className: "dshTermBody" },
            ...tabs.map((t) =>
              React.createElement(TermPane, {
                key: t.id,
                tab: t,
                active: t.id === activeId,
                onExit,
              }),
            ),
            tabs.length === 0
              ? React.createElement(
                  "div",
                  { className: "dshTermEmpty" },
                  "没有终端会话",
                  React.createElement(
                    "button",
                    { className: "dshTermEmptyBtn", onClick: newTab },
                    Plus12(),
                    "新建终端",
                  ),
                )
              : null,
          )
        : null,
    ),
  );
}

export { TerminalPanel };