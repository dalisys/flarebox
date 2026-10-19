// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface RspamdConfig {
	RSPAMD_CHECK_URL?: string;
	RSPAMD_API_KEY?: string;
	RSPAMD_BEARER_TOKEN?: string;
	RSPAMD_ACCESS_CLIENT_ID?: string;
	RSPAMD_ACCESS_CLIENT_SECRET?: string;
}

export type RspamdAction = "no action" | "greylist" | "add header" | "rewrite subject" | "soft reject" | "reject" | "quarantine" | "discard";

export interface RspamdVerdict {
	action: RspamdAction;
	score: number;
	/** Top-scoring symbols, for logs. */
	symbols: { name: string; score: number }[];
	/** Every symbol name, including negative ones such as DMARC_POLICY_ALLOW. */
	symbolNames: string[];
}

const actions = new Set<RspamdAction>(["no action", "greylist", "add header", "rewrite subject", "soft reject", "reject", "quarantine", "discard"]);

export async function scanWithRspamd(
	rawEmail: Uint8Array<ArrayBuffer>,
	metadata: { from?: string; recipient: string },
	config: RspamdConfig,
	fetcher: typeof fetch = fetch,
): Promise<RspamdVerdict> {
	if (!config.RSPAMD_CHECK_URL) throw new Error("Rspamd URL is missing");
	const url = new URL(config.RSPAMD_CHECK_URL);
	if (url.protocol !== "https:" || !url.pathname.endsWith("/checkv2") || url.username || url.password || url.search || url.hash) {
		throw new Error("Rspamd URL must be an HTTPS /checkv2 endpoint without credentials or query parameters");
	}

	const hasAccessId = Boolean(config.RSPAMD_ACCESS_CLIENT_ID);
	const hasAccessSecret = Boolean(config.RSPAMD_ACCESS_CLIENT_SECRET);
	if (hasAccessId !== hasAccessSecret) throw new Error("Both Rspamd Access service token fields are required");
	const authenticationMethods = Number(hasAccessId) + Number(Boolean(config.RSPAMD_API_KEY)) + Number(Boolean(config.RSPAMD_BEARER_TOKEN));
	if (authenticationMethods !== 1) throw new Error("Choose exactly one Rspamd endpoint authentication method");

	const headers = new Headers({
		"Accept": "application/json",
		"Content-Type": "message/rfc822",
		"Rcpt": metadata.recipient,
		"Deliver-To": metadata.recipient,
	});
	if (metadata.from) headers.set("From", metadata.from);
	if (config.RSPAMD_API_KEY) headers.set("Authorization", `Basic ${btoa(`worker:${config.RSPAMD_API_KEY}`)}`);
	if (config.RSPAMD_BEARER_TOKEN) headers.set("Authorization", `Bearer ${config.RSPAMD_BEARER_TOKEN}`);
	if (hasAccessId) {
		headers.set("CF-Access-Client-Id", config.RSPAMD_ACCESS_CLIENT_ID!);
		headers.set("CF-Access-Client-Secret", config.RSPAMD_ACCESS_CLIENT_SECRET!);
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10_000);
	try {
		const response = await fetcher(url.toString(), {
			method: "POST",
			headers,
			body: rawEmail.buffer,
			signal: controller.signal,
			redirect: "manual",
		});
		if (!response.ok) throw new Error(`Rspamd returned HTTP ${response.status}`);
		const result: unknown = await response.json();
		if (!result || typeof result !== "object") throw new Error("Invalid Rspamd response");
		const verdict = result as Record<string, unknown>;
		if (verdict.is_skipped === true || !actions.has(verdict.action as RspamdAction) || typeof verdict.score !== "number" || !Number.isFinite(verdict.score)) {
			throw new Error("Invalid or skipped Rspamd verdict");
		}
		const symbolMap = verdict.symbols && typeof verdict.symbols === "object" && !Array.isArray(verdict.symbols) ? verdict.symbols : undefined;
		const symbols = symbolMap
			? Object.entries(symbolMap).flatMap(([name, value]) => {
				if (!value || typeof value !== "object" || typeof (value as { score?: unknown }).score !== "number") return [];
				return [{ name, score: (value as { score: number }).score }];
			}).sort((a, b) => b.score - a.score).slice(0, 8)
			: [];
		return { action: verdict.action as RspamdAction, score: verdict.score, symbols, symbolNames: symbolMap ? Object.keys(symbolMap) : [] };
	} finally {
		clearTimeout(timeout);
	}
}
