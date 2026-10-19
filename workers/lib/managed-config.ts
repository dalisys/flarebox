import type { Env } from "../types";

const KEY = "config/managed-mail.json";
const operationKey = (address: string) => `config/mailbox-operations/${address}.json`;

export type MailboxOperation = { mode: "export" } | { mode: "move"; target: string };

export async function getMailboxOperation(env: Env, address: string): Promise<MailboxOperation | null> {
	const object = await env.BUCKET.get(operationKey(address));
	return object ? object.json<MailboxOperation>() : null;
}

export async function saveMailboxOperation(env: Env, address: string, operation: MailboxOperation): Promise<void> {
	await env.BUCKET.put(operationKey(address), JSON.stringify(operation));
}

export async function clearMailboxOperation(env: Env, address: string): Promise<void> {
	await env.BUCKET.delete(operationKey(address));
}

interface ManagedConfig {
	domains: string[];
	emailAddresses: string[];
	retiredDomains?: string[];
	retiredAddresses?: string[];
}

async function readSavedConfig(env: Env): Promise<ManagedConfig> {
	const saved = await env.BUCKET.get(KEY);
	return saved ? saved.json<ManagedConfig>() : { domains: [], emailAddresses: [], retiredAddresses: [] };
}

export async function getManagedConfig(env: Env): Promise<ManagedConfig> {
	const config = await readSavedConfig(env);
	const retired = new Set(config.retiredAddresses ?? []);
	const removedDomains = new Set(config.retiredDomains ?? []);
	const domains = [...new Set([...(env.DOMAINS || "").split(","), ...config.domains].map((value) => value.trim().toLowerCase()).filter((value) => value && !removedDomains.has(value)))];
	return {
		domains,
		emailAddresses: [...new Set([...(env.EMAIL_ADDRESSES ?? []), ...config.emailAddresses].map((value) => value.trim().toLowerCase()).filter((value) => value && !retired.has(value) && domains.includes(value.split("@")[1])))],
	};
}

export async function isRetiredAddress(env: Env, address: string): Promise<boolean> {
	return (await readSavedConfig(env)).retiredAddresses?.includes(address) ?? false;
}

export async function retireManagedAddress(env: Env, address: string): Promise<void> {
	const config = await readSavedConfig(env);
	config.retiredAddresses = [...new Set([...(config.retiredAddresses ?? []), address])];
	await env.BUCKET.put(KEY, JSON.stringify(config));
}

export async function addManagedDomain(env: Env, domain: string): Promise<ManagedConfig> {
	const config = await readSavedConfig(env);
	if (!config.domains.includes(domain)) config.domains.push(domain);
	config.retiredDomains = (config.retiredDomains ?? []).filter((value) => value !== domain);
	await env.BUCKET.put(KEY, JSON.stringify(config));
	return config;
}

export async function removeManagedDomain(env: Env, domain: string): Promise<void> {
	const config = await readSavedConfig(env);
	config.retiredDomains = [...new Set([...(config.retiredDomains ?? []), domain])];
	config.domains = config.domains.filter((value) => value !== domain);
	await env.BUCKET.put(KEY, JSON.stringify(config));
}

export async function addManagedAddress(env: Env, address: string): Promise<ManagedConfig> {
	const config = await readSavedConfig(env);
	if (!config.emailAddresses.includes(address)) config.emailAddresses.push(address);
	config.retiredAddresses = (config.retiredAddresses ?? []).filter((value) => value !== address);
	await env.BUCKET.put(KEY, JSON.stringify(config));
	return config;
}
