// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// The Access cookie can be sent on cross-site requests, so a browser on another
// site could otherwise send mail or change settings as the signed-in user.
// WebSocket upgrades are GETs, but the agent socket can read mail, so they are
// checked too. Non-browser clients (MCP tools, service tokens) send neither
// header and pass.
export function isCrossSiteWrite(request: Request): boolean {
	const isWebSocket = request.headers.get("upgrade")?.toLowerCase() === "websocket";
	if (SAFE_METHODS.has(request.method) && !isWebSocket) return false;
	const site = request.headers.get("sec-fetch-site");
	if (site) return site !== "same-origin";
	const origin = request.headers.get("origin");
	return !!origin && origin !== new URL(request.url).origin;
}
