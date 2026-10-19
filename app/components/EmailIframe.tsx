// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import DOMPurify from "dompurify";
import { useCallback, useEffect, useRef, useState } from "react";

interface EmailIframeProps {
	body: string;
	/** When true, iframe auto-sizes to content height instead of filling parent */
	autoSize?: boolean;
}

/**
 * Renders email HTML inside a sandboxed iframe.
 *
 * Security model:
 * - DOMPurify sanitises the HTML before injection.
 * - The iframe sandbox does NOT include `allow-same-origin`, so even if
 *   DOMPurify has a bypass the attacker's code runs in an opaque origin
 *   with no access to the parent page's cookies, DOM, or API.
 * - Because the iframe is cross-origin we cannot read `contentDocument`
 *   for auto-sizing. Instead, the injected HTML includes a tiny inline
 *   script that posts its body height to the parent via `postMessage`.
 *   The `allow-scripts` flag is required for this, but scripts inside
 *   the opaque-origin sandbox cannot access anything useful.
 * - A strict CSP meta tag blocks external resource loads inside the
 *   iframe as a defense-in-depth layer.
 */
export default function EmailIframe({ body, autoSize }: EmailIframeProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	// Mount the frame only after sanitizing its first document; an initial empty
	// srcdoc can leave its first navigation racing the content update.
	const [srcDoc, setSrcDoc] = useState("");
	const [isDark, setIsDark] = useState(() => typeof document !== "undefined" && document.documentElement.dataset.mode === "dark");
	useEffect(() => {
		const update = () => setIsDark(document.documentElement.dataset.mode === "dark");
		update();
		const observer = new MutationObserver(update);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
		return () => observer.disconnect();
	}, []);
	const [height, setHeight] = useState(autoSize ? 100 : 0);

	// Listen for height reports from the sandboxed iframe
	const handleMessage = useCallback(
		(event: MessageEvent) => {
			if (event.source !== iframeRef.current?.contentWindow) return;
			if (event.data?.__emailSwipe && ["next", "previous"].includes(event.data.direction)) {
				iframeRef.current?.dispatchEvent(new CustomEvent("email-swipe", { bubbles: true, detail: event.data.direction }));
				return;
			}
			if (!autoSize) return;
			// Only accept messages from our own iframe
			if (event.source !== iframeRef.current?.contentWindow) return;
			if (
				event.data &&
				typeof event.data === "object" &&
				event.data.__emailIframeHeight &&
				typeof event.data.height === "number" &&
				event.data.height > 0
			) {
				setHeight(event.data.height);
			}
		},
		[autoSize],
	);

	useEffect(() => {
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [handleMessage]);

	useEffect(() => {
		const cleanBody = DOMPurify.sanitize(body, {
			USE_PROFILES: { html: true },
			FORBID_TAGS: ["style"],
			ADD_ATTR: ["target"],
			FORCE_BODY: true,
		});

		// Plain messages inherit the reader theme. Authored email backgrounds keep
		// their original light canvas to preserve the sender's text contrast.
		const darkCanvas = isDark && !/(?:bgcolor\s*=|(?:background(?:-color)?|color)\s*:|\bcolor\s*=)/i.test(cleanBody);
		const canvas = darkCanvas ? "#11141c" : "#ffffff";
		const foreground = darkCanvas ? "#e3e3e9" : "#1a1a1a";
		const padding = "20px";

		// Height-reporting script: sends body.scrollHeight to the parent.
		// Runs inside the opaque-origin sandbox so it has zero access to
		// the parent page — it can only postMessage.
		const heightScript = `<script>
			var content = document.getElementById("email-body");
			var zoom = 1;
			function fit() {
				content.style.transform = "";
				content.style.width = "";
				var available = document.documentElement.clientWidth;
				var width = Math.max(available, content.scrollWidth);
				var scale = Math.min(1, available / width) * zoom;
				if (scale !== 1) {
					content.style.width = width + "px";
					content.style.transform = "scale(" + scale + ")";
				}
				var height = Math.ceil(content.getBoundingClientRect().height);
				document.body.style.height = height + "px";
				parent.postMessage({ __emailIframeHeight: true, height: height }, "*");
			}
			var start = null;
			document.addEventListener("touchstart", function(e) {
				start = zoom === 1 && e.touches.length === 1 && !e.target.closest("a, button, input, textarea, select, pre")
					? { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() } : null;
			}, { passive: true });
			document.addEventListener("touchmove", function(e) { if (e.touches.length !== 1) start = null; }, { passive: true });
			document.addEventListener("touchcancel", function() { start = null; });
			document.addEventListener("touchend", function(e) {
				if (!start || e.touches.length || !e.changedTouches.length) return;
				var dx = e.changedTouches[0].clientX - start.x;
				var dy = e.changedTouches[0].clientY - start.y;
				if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2 && Date.now() - start.time < 700)
					parent.postMessage({ __emailSwipe: true, direction: dx < 0 ? "next" : "previous" }, "*");
				start = null;
			}, { passive: true });
			window.addEventListener("message", function(e) {
				if (e.source !== parent || !e.data || !["in", "out", "fit"].includes(e.data.__emailZoom)) return;
				zoom = e.data.__emailZoom === "fit" ? 1 : Math.max(1, Math.min(3, zoom + (e.data.__emailZoom === "in" ? 0.25 : -0.25)));
				document.body.style.overflowX = zoom > 1 ? "auto" : "hidden";
				fit();
			});
			window.addEventListener("resize", fit);
			document.querySelectorAll("img").forEach(function(img) { img.addEventListener("load", fit); });
			new ResizeObserver(fit).observe(content);
			fit();
		<\/script>`;

		// Use srcdoc so the iframe is truly sandboxed (no same-origin access).
		// We can't use doc.write() because that requires allow-same-origin.
		setSrcDoc(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: cid: https:; script-src 'unsafe-inline';">
<style>
* { box-sizing: border-box; }
html {
	background: ${canvas};
	color-scheme: ${darkCanvas ? "dark" : "light"};
}
body { overflow-x: hidden; position: relative; margin: 0; }
#email-body {
	position: absolute;
	width: 100%;
	transform-origin: top left;
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
	font-size: 14px;
	line-height: 1.6;
	color: ${foreground};
	background: ${canvas};
	padding: ${padding};
	margin: 0;
	word-wrap: break-word;
	overflow-wrap: break-word;
	${autoSize ? "overflow: hidden;" : ""}
}
[style*="position: fixed"], [style*="position:fixed"], [style*="position: absolute"], [style*="position:absolute"] {
	position: relative !important;
}
a { color: ${darkCanvas ? "#a8c7fa" : "#2563eb"}; }
img { max-width: 100%; height: auto; }
blockquote {
	border-left: 3px solid #d1d5db;
	padding-left: 1em;
	margin-left: 0;
	color: ${darkCanvas ? "#aeb2bf" : "#6b7280"};
}
pre {
	background: ${darkCanvas ? "#272b36" : "#f3f4f6"};
	padding: 12px;
	border-radius: 6px;
	overflow-x: auto;
	font-size: 13px;
}
table { border-collapse: collapse; max-width: 100%; }
td, th { padding: 4px 8px; }
p { margin: 4px 0; }
h1, h2, h3 { margin: 8px 0 4px; }
ul, ol { padding-left: 20px; margin: 4px 0; }
</style>
</head>
<body><div id="email-body">${cleanBody}</div>${heightScript}</body>
</html>`);
	}, [body, autoSize, isDark]);

	return (
		<div className={autoSize ? "min-w-0" : "flex h-full min-h-0 min-w-0 flex-col"}>
		{srcDoc && <iframe
			ref={iframeRef}
			srcDoc={srcDoc}
			className="block min-h-0 w-full flex-1 border-0"
			style={autoSize ? { height: `${height}px` } : { height: "100%" }}
			sandbox="allow-scripts allow-popups allow-top-navigation-by-user-activation"
			title="Email content"
		/>}
			<details className="mail-zoom-controls md:hidden"><summary>Display options</summary><div className="flex justify-end gap-2">{([ ["out", "−", "Zoom out"], ["fit", "Fit width", "Fit email to screen width"], ["in", "+", "Zoom in"] ] as const).map(([action, label, title]) => <button key={action} type="button" aria-label={title} onClick={() => iframeRef.current?.contentWindow?.postMessage({ __emailZoom: action }, "*")}>{label}</button>)}</div></details>
		</div>
	);
}
