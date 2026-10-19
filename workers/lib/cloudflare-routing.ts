import type { Env } from "../types";

interface ApiResponse<T> { success: boolean; result: T; errors?: { message: string }[] }
interface Zone { id: string; name: string; status: string; account: { id: string } }
interface DestinationAddress { id: string; email: string; verified: string | null }
interface DnsRecord { type: string; name: string; content: string; priority?: number }
interface RoutingSettings { enabled: boolean; status?: string }
interface RoutingRule {
	id: string;
	enabled: boolean;
	matchers: { type: string; field?: string; value?: string }[];
	actions: { type: string; value?: string[] }[];
}
interface CatchAllRule {
	enabled?: boolean;
	name?: string;
	actions?: { type: "drop" | "forward" | "worker"; value?: string[] }[];
	matchers?: { type: "all" }[];
	source?: "api" | "wrangler";
}

async function cloudflare<T>(env: Env, path: string, init: RequestInit = {}): Promise<T> {
	if (!env.CLOUDFLARE_API_TOKEN) throw new Error("Cloudflare API token is not configured");
	const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
		...init,
		headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
	});
	const body = await response.json<ApiResponse<T>>();
	if (!response.ok || !body.success) throw new Error(body.errors?.map((error) => error.message).join("; ") || `Cloudflare API error ${response.status}`);
	return body.result;
}

async function zoneForDomain(env: Env, domain: string): Promise<Zone | undefined> {
	// Prefer the closest active zone, including separately delegated subdomains.
	const labels = domain.split(".");
	for (let offset = 0; offset < labels.length - 1; offset++) {
		const name = labels.slice(offset).join(".");
		const zones = await cloudflare<Zone[]>(env, `/zones?name=${encodeURIComponent(name)}&status=active`);
		const zone = zones.find((candidate) => candidate.name.toLowerCase() === name);
		if (zone) return zone;
	}
	return undefined;
}

async function routingRules(env: Env, zoneId: string): Promise<RoutingRule[]> {
	const rules: RoutingRule[] = [];
	for (let page = 1; ; page++) {
		const current = await cloudflare<RoutingRule[]>(env, `/zones/${zoneId}/email/routing/rules?per_page=100&page=${page}`);
		rules.push(...current);
		if (current.length < 100) return rules;
	}
}

export async function inspectCatchAll(env: Env, domain: string) {
	if (!env.CLOUDFLARE_API_TOKEN) return { available: false, reason: "Add a Cloudflare API token to manage the catch-all rule." } as const;
	const zone = await zoneForDomain(env, domain);
	if (!zone) return { available: false, reason: "No active Cloudflare zone was found for this domain." } as const;
	if (domain !== zone.name.toLowerCase()) return { available: false, reason: `Catch-all applies only to ${zone.name}. Subdomain addresses need individual routing rules.` } as const;
	const rule = await cloudflare<CatchAllRule>(env, `/zones/${zone.id}/email/routing/rules/catch_all`);
	return { available: true, enabled: rule.enabled === true, name: rule.name, zoneName: zone.name } as const;
}

export async function disableCatchAll(env: Env, domain: string) {
	const zone = await zoneForDomain(env, domain);
	if (!zone) throw new Error("No active Cloudflare zone was found for this domain.");
	if (domain !== zone.name.toLowerCase()) throw new Error(`Manage catch-all from ${zone.name}. Subdomain addresses need individual routing rules.`);
	const rule = await cloudflare<CatchAllRule>(env, `/zones/${zone.id}/email/routing/rules/catch_all`);
	if (!rule.enabled) return { available: true, enabled: false, zoneName: zone.name } as const;
	await cloudflare(env, `/zones/${zone.id}/email/routing/rules/catch_all`, {
		method: "PUT",
		body: JSON.stringify({
			enabled: false,
			actions: rule.actions?.length ? rule.actions : [{ type: "drop" }],
			matchers: rule.matchers?.length ? rule.matchers : [{ type: "all" }],
			name: rule.name || "Catch-all",
		}),
	});
	return { available: true, enabled: false, zoneName: zone.name } as const;
}

export async function inspectRouting(env: Env, domain: string) {
	if (!env.CLOUDFLARE_API_TOKEN) return { available: false, reason: "Add a Cloudflare API token to enable automatic routing." } as const;
	const zone = await zoneForDomain(env, domain);
	if (!zone) return { available: false, reason: "No active Cloudflare zone was found for this domain." } as const;
	const [settings, records, txtRecords] = await Promise.all([
		cloudflare<RoutingSettings>(env, `/zones/${zone.id}/email/routing`),
		cloudflare<DnsRecord[]>(env, `/zones/${zone.id}/dns_records?type=MX&name=${encodeURIComponent(domain)}&per_page=100`),
		cloudflare<DnsRecord[]>(env, `/zones/${zone.id}/dns_records?type=TXT&name=${encodeURIComponent(domain)}&per_page=100`),
	]);
	const mxRecords = records.filter((record) => record.type === "MX" && record.name.toLowerCase() === domain)
		.map(({ content, priority }) => ({ content, priority }));
	const spfRecords = txtRecords.filter((record) => record.type === "TXT" && record.name.toLowerCase() === domain && record.content.replace(/^"|"$/g, "").startsWith("v=spf1"))
		.map((record) => record.content);
	// Zone settings describe the apex; a subdomain needs its own routing DNS.
	const isSubdomain = domain !== zone.name.toLowerCase();
	const cloudflareMx = (content: string) => /(?:^|\.)mx\.cloudflare\.net\.?$/i.test(content);
	const cloudflareSpf = (content: string) => /^v=spf1\s+include:_spf\.mx\.cloudflare\.net\s+[~?-]all$/i.test(content.replace(/^"|"$/g, ""));
	const dnsReady = mxRecords.length > 0 && mxRecords.every((record) => cloudflareMx(record.content)) && spfRecords.some((record) => /(?:^|\s)include:_spf\.mx\.cloudflare\.net(?:\s|$)/i.test(record.replace(/^"|"$/g, "")));
	const enabled = dnsReady && (isSubdomain || (settings.enabled && (!settings.status || settings.status === "ready")));
	const hasOtherMailService = mxRecords.some((record) => !cloudflareMx(record.content)) || spfRecords.some((record) => !cloudflareSpf(record));
	return { available: true, enabled, status: isSubdomain ? enabled ? "ready" : "unconfigured" : settings.status, zoneName: zone.name, mxRecords, spfRecords, canEnable: !hasOtherMailService } as const;
}

export async function enableRouting(env: Env, domain: string) {
	const status = await inspectRouting(env, domain);
	if (!status.available) throw new Error(status.reason);
	if (status.enabled) return status;
	if (!status.canEnable) throw new Error("This domain already has MX or SPF records. Review its current mail service before changing routing.");
	const zone = (await zoneForDomain(env, domain))!;
	await cloudflare(env, `/zones/${zone.id}/email/routing/dns`, { method: "POST", body: JSON.stringify(domain === zone.name.toLowerCase() ? {} : { name: domain }) });
	return inspectRouting(env, domain);
}

export async function ensureWorkerRule(env: Env, address: string): Promise<"active" | "manual"> {
	const domain = address.split("@")[1];
	const status = await inspectRouting(env, domain);
	if (!status.available || !status.enabled || (status.status && status.status !== "ready")) return "manual";
	const zone = (await zoneForDomain(env, domain))!;
	const rules = await routingRules(env, zone.id);
	const matching = rules.find((rule) => rule.matchers.some((matcher) => matcher.type === "literal" && matcher.field === "to" && matcher.value?.toLowerCase() === address));
	if (matching) {
		if (matching.enabled && matching.actions.some((action) => action.type === "worker" && action.value?.includes(env.CLOUDFLARE_EMAIL_WORKER || "flarebox"))) return "active";
		throw new Error("An Email Routing rule already exists for this address. Review it in Cloudflare before continuing.");
	}
	await cloudflare(env, `/zones/${zone.id}/email/routing/rules`, {
		method: "POST",
		body: JSON.stringify({
			name: `Flarebox: ${address}`,
			enabled: true,
			matchers: [{ type: "literal", field: "to", value: address }],
			actions: [{ type: "worker", value: [env.CLOUDFLARE_EMAIL_WORKER || "flarebox"] }],
		}),
	});
	return "active";
}

// Read-only: which addresses have an enabled rule that sends mail to this Worker.
export async function inspectWorkerRules(env: Env, domain: string, addresses: string[]): Promise<Record<string, "active" | "inactive">> {
	const status = await inspectRouting(env, domain);
	const result: Record<string, "active" | "inactive"> = Object.fromEntries(addresses.map((address) => [address, "inactive"]));
	if (!status.available || !status.enabled || (status.status && status.status !== "ready")) return result;
	const zone = (await zoneForDomain(env, domain))!;
	for (const rule of await routingRules(env, zone.id)) {
		if (!rule.enabled || !rule.actions.some((action) => action.type === "worker" && action.value?.includes(env.CLOUDFLARE_EMAIL_WORKER || "flarebox"))) continue;
		for (const matcher of rule.matchers) {
			const address = matcher.type === "literal" && matcher.field === "to" ? matcher.value?.toLowerCase() : undefined;
			if (address && address in result) result[address] = "active";
		}
	}
	return result;
}

export async function removeWorkerRule(env: Env, address: string): Promise<"removed" | "manual"> {
	if (!env.CLOUDFLARE_API_TOKEN) return "manual";
	const domain = address.split("@")[1];
	const zone = await zoneForDomain(env, domain);
	if (!zone) return "manual";
	const rules = await routingRules(env, zone.id);
	const matching = rules.find((rule) => rule.matchers.some((matcher) => matcher.type === "literal" && matcher.field === "to" && matcher.value?.toLowerCase() === address));
	if (!matching) return "removed";
	if (!matching.actions.some((action) => action.type === "worker" && action.value?.includes(env.CLOUDFLARE_EMAIL_WORKER || "flarebox"))) {
		return "manual";
	}
	await cloudflare(env, `/zones/${zone.id}/email/routing/rules/${matching.id}`, { method: "DELETE" });
	return "removed";
}

// Forwarding targets are account-level Destination addresses. Cloudflare emails each one a
// verification link, and Worker forward() only delivers to verified ones.
async function accountForDomain(env: Env, domain: string): Promise<string> {
	const zone = await zoneForDomain(env, domain);
	if (!zone) throw new Error("No active Cloudflare zone was found for this domain.");
	return zone.account.id;
}

async function destinations(env: Env, accountId: string): Promise<DestinationAddress[]> {
	const list: DestinationAddress[] = [];
	for (let page = 1; ; page++) {
		const current = await cloudflare<DestinationAddress[]>(env, `/accounts/${accountId}/email/routing/addresses?per_page=50&page=${page}`);
		list.push(...current);
		if (current.length < 50) return list;
	}
}

export async function listDestinations(env: Env, domain: string) {
	const list = await destinations(env, await accountForDomain(env, domain));
	return list.map((address) => ({ email: address.email.toLowerCase(), verified: !!address.verified }));
}

/** Adds the address, or re-adds an unverified one so Cloudflare sends a new verification email. */
export async function verifyDestination(env: Env, domain: string, email: string) {
	const accountId = await accountForDomain(env, domain);
	const existing = (await destinations(env, accountId)).find((address) => address.email.toLowerCase() === email);
	if (existing?.verified) return listDestinations(env, domain);
	if (existing) await cloudflare(env, `/accounts/${accountId}/email/routing/addresses/${existing.id}`, { method: "DELETE" });
	await cloudflare(env, `/accounts/${accountId}/email/routing/addresses`, { method: "POST", body: JSON.stringify({ email }) });
	return listDestinations(env, domain);
}
