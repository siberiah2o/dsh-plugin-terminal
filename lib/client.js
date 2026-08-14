/**
 * dsh-plugin-terminal — client half.
 *
 * A bottom dock panel for the DSH Web GUI: toggle bar + collapsible terminal
 * that streams host PTY output over SSE and sends keystrokes back over JSON.
 *
 * Bundle format: window.__ModuleLoader__.load CJS factory (same shape as the
 * shipped client packages). Registers into "conversation.input.dock" (the
 * list slot where the todo/queue docks live) following the todoDockEntry
 * registrant posture.
 */
window.__ModuleLoader__.load({
	id: "dsh-plugin-terminal",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const React = require("react");

		const PREFIX = "/terminal-panel";
		const MAX_BUFFER = 120_000;

		/* ── minimal ANSI handling ──────────────────────────────────────────── */
		const ANSI_RE =
			/(?:\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]|\x07)/g;
		function cleanChunk(raw) {
			return raw
				.replace(/\r\n/g, "\n")
				.replace(/\r/g, "\n")
				.replace(ANSI_RE, "")
				.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
		}

		/* ── host API ───────────────────────────────────────────────────────── */
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

		/* ── styles ────────────────────────────────────────────────────────── */
		const CSS = [
			".dshTermDock{box-sizing:border-box;width:100%;max-width:var(--dsh-composer-card-max-width,840px);margin:0 auto;padding:0 4px;flex:none}",
			".dshTermBar{box-sizing:border-box;width:100%;height:32px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:var(--dsw-specific-tip);border:none;border-radius:8px;align-items:center;gap:10px;padding:4px 12px;display:flex;font:var(--dsw-font-xs-13,13px/20px Inter,sans-serif)}",
			".dshTermBar:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".dshTermBarLead{color:var(--dsw-alias-label-tertiary);flex:none;display:grid;place-items:center}",
			".dshTermBarTitle{flex:auto;min-width:0;font-weight:500}",
			".dshTermBarState{color:var(--dsw-alias-label-tertiary);font-size:12px;max-width:30%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dshTermBarActions{display:flex;gap:4px}",
			".dshTermBtn{color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:6px;padding:4px 6px;display:flex;align-items:center;font-size:12px;font-family:inherit}",
			".dshTermBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
			".dshTermPanel{background:var(--dsw-specific-tip,#1e1e1e);border:1px solid var(--dsw-alias-border-l1);border-radius:12px 12px 0 0;overflow:hidden;display:flex;flex-direction:column;max-height:340px}",
			".dshTermOut{flex:1;min-height:120px;overflow-y:auto;padding:10px 12px;margin:0;white-space:pre-wrap;word-break:break-all;font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,'Courier New',monospace;color:var(--dsw-alias-label-primary)}",
			".dshTermIn{box-sizing:border-box;width:100%;background:0 0;border:none;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);padding:8px 12px;font:12px/1.4 ui-monospace,SFMono-Regular,Consolas,'Courier New',monospace;outline:none}",
			".dshTermIn::placeholder{color:var(--dsw-alias-label-tertiary)}",
		].join("\n");
		const STYLE_ID = "dsh-plugin-terminal-styles";
		if (typeof document !== "undefined" && document.getElementById(STYLE_ID) === null) {
			const tag = document.createElement("style");
			tag.id = STYLE_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		/* ── icons (inline SVG, 14px) ──────────────────────────────────────── */
		const Chevron = (open) =>
			React.createElement(
				"svg",
				{ width: 14, height: 14, viewBox: "0 0 16 16", fill: "currentColor", style: { transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" } },
				React.createElement("path", { d: "M6 3.5L10.5 8L6 12.5z" }),
			);
		const TerminalIcon = () =>
			React.createElement(
				"svg",
				{ width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4 },
				React.createElement("rect", { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2 }),
				React.createElement("path", { d: "M4.5 6.5l2 2-2 2M8 10.5h3.5" }),
			);

		/* ── the panel ─────────────────────────────────────────────────────── */
		function TerminalPanel() {
			const [open, setOpen] = React.useState(false);
			const [sessionId, setSessionId] = React.useState(null);
			const [buffer, setBuffer] = React.useState("");
			const [exited, setExited] = React.useState(false);
			const [shellName, setShellName] = React.useState("");
			const [draft, setDraft] = React.useState("");
			const [busy, setBusy] = React.useState(false);
			const outRef = React.useRef(null);
			const wrapRef = React.useRef(null);
			const charW = React.useRef(7.2);
			const esRef = React.useRef(null);

			const measureChar = React.useCallback(() => {
				const el = outRef.current;
				if (el === null) return;
				const span = document.createElement("span");
				span.textContent = "X".repeat(20);
				span.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:12px/1 ui-monospace,Consolas,monospace";
				el.appendChild(span);
				const w = span.getBoundingClientRect().width / 20;
				el.removeChild(span);
				if (w > 2) charW.current = w;
			}, []);

			const sendResize = React.useCallback(
				(id) => {
					const el = outRef.current;
					if (el === null || id === null) return;
					const cols = Math.max(20, Math.min(300, Math.floor(el.clientWidth / charW.current) - 1));
					const rows = Math.max(6, Math.min(120, Math.floor(el.clientHeight / 18)));
					post("/sessions/" + id + "/resize", { cols, rows }).catch(() => {});
				},
				[],
			);

			const attach = React.useCallback((id) => {
				const es = new EventSource(PREFIX + "/sessions/" + id + "/stream");
				es.addEventListener("snapshot", (ev) => {
					const snap = JSON.parse(ev.data);
					setBuffer(String(snap.buffer ?? "").slice(-MAX_BUFFER));
					setExited(Boolean(snap.exited));
				});
				es.addEventListener("data", (ev) => {
					const text = cleanChunk(JSON.parse(ev.data));
					if (text.length === 0) return;
					setBuffer((b) => (b + text).slice(-MAX_BUFFER));
				});
				es.addEventListener("exit", () => {
					setExited(true);
				es.close();
				});
				esRef.current = es;
			}, []);

			const boot = React.useCallback(async () => {
				setBusy(true);
				try {
					// reconnect to the newest live session when one exists
				const list = await api("/sessions");
				const live = (list.sessions ?? []).filter((s) => !s.exited);
				const existing = live.length > 0 ? live[live.length - 1] : null;
				const s = existing ?? (await post("/sessions", {}));
				setSessionId(s.id);
					setShellName(s.shell ?? "");
					setBuffer("");
					setExited(false);
					attach(s.id);
					setTimeout(() => sendResize(s.id), 80);
				} catch {
					setBuffer("terminal panel: cannot reach the host route (" + PREFIX + "). Is the plugin's host half loaded?\n");
				} finally {
					setBusy(false);
				}
			}, [attach, sendResize]);

			const restart = React.useCallback(async () => {
				esRef.current?.close();
				setSessionId(null);
				setBuffer("");
				await boot();
			}, [boot]);

			// lifecycle: open => boot, close => keep session alive (host-owned)
			React.useEffect(() => {
				if (open && sessionId === null && !busy) boot();
			}, [open, sessionId, busy, boot]);
			React.useEffect(() => {
				return () => esRef.current?.close();
			}, []);
			// auto-scroll
			React.useEffect(() => {
				const el = outRef.current;
				if (el !== null) el.scrollTop = el.scrollHeight;
			}, [buffer]);
			// resize observer
			React.useEffect(() => {
				if (!open || sessionId === null) return;
				const el = wrapRef.current;
				if (el === null) return;
				measureChar();
				let t = 0;
				const ro = new ResizeObserver(() => {
					clearTimeout(t);
					t = setTimeout(() => sendResize(sessionId), 120);
				});
				ro.observe(el);
				return () => {
					clearTimeout(t);
				ro.disconnect();
				};
			}, [open, sessionId, measureChar, sendResize]);

			const send = (data) => {
				if (sessionId !== null && !exited) post("/sessions/" + sessionId + "/input", { data }).catch(() => {});
			};

			const onKeyDown = (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					send(draft + "\r");
					setDraft("");
				} else if (e.key === "Tab") {
					e.preventDefault();
					send("\t");
				} else if (e.key === "ArrowUp" && draft === "") {
					e.preventDefault();
					send("\x1b[A");
				} else if (e.key === "ArrowDown" && draft === "") {
					e.preventDefault();
					send("\x1b[B");
				} else if (e.key === "c" && e.ctrlKey && e.target.selectionStart === e.target.selectionEnd) {
					e.preventDefault();
					send("\x03");
				}
			};

			const stateLabel = exited
				? "exited"
				: sessionId === null
					? busy ? "starting…" : "idle"
					: shellName || "shell";

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
						onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") setOpen((v) => !v); },
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
											esRef.current?.close();
											await api("/sessions/" + sessionId, { method: "DELETE" }).catch(() => {});
											setSessionId(null);
											setBuffer("");
										},
									},
										"✕",
									)
							: null,
					),
				),
				open
					? React.createElement(
							"div",
							{ className: "dshTermPanel", ref: wrapRef },
						React.createElement("pre", { className: "dshTermOut", ref: outRef }, buffer),
						React.createElement("input", {
								className: "dshTermIn",
								value: draft,
								placeholder: exited ? "session exited — press ⟳ to restart" : sessionId === null ? "starting…" : "type a command… (Tab completes, Ctrl+C interrupts)",
								disabled: sessionId === null || exited,
								onChange: (e) => setDraft(e.target.value),
								onKeyDown,
								autoComplete: "off",
								spellCheck: false,
							}),
					  )
					: null,
			);
		}

		/* ── plugin (todoDockEntry posture) ────────────────────────────────── */
		const inject = ["slots"];
		function apply(ctx) {
			ctx.slots.inject("conversation.input.dock", () =>
				ctx.slots.register(
					{ name: "conversation.input.dock", id: "terminal", order: 10 },
					TerminalPanel,
				),
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
