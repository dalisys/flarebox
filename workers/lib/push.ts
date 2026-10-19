import { importJWK, SignJWT } from "jose";
import type { Env } from "../types";

// Web Push (RFC 8291 payload encryption + RFC 8292 VAPID) with WebCrypto only.
// The push service (Apple/Google/Mozilla) delivers to the device, so Cloudflare Access is not in that path.

const VAPID_KEY = "config/push-vapid.json";
const SUBS_KEY = "config/push-subscriptions.json";

// Only real browser push services, so a saved endpoint cannot point the Worker at other hosts.
const PUSH_HOSTS = ["fcm.googleapis.com", "push.apple.com", "push.services.mozilla.com", "notify.windows.com"];
export function isPushEndpoint(endpoint: string): boolean {
	try {
		const url = new URL(endpoint);
		const host = url.hostname.toLowerCase();
		return url.protocol === "https:" && PUSH_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
	} catch { return false; }
}

export interface PushSubscriptionJSON { endpoint: string; keys: { p256dh: string; auth: string } }
interface VapidKeys { privateJwk: JsonWebKey; publicKey: string }

type Bytes = Uint8Array<ArrayBuffer>;
const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (value: string): Bytes => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]): Bytes => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let offset = 0;
	for (const p of parts) { out.set(p, offset); offset += p.length; }
	return out;
};

// Keys are made once and kept in the private R2 bucket, so no secret setup is needed.
export async function getVapidKeys(env: Env): Promise<VapidKeys> {
	const saved = await env.BUCKET.get(VAPID_KEY);
	if (saved) return saved.json<VapidKeys>();
	const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
	const keys: VapidKeys = {
		privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey) as JsonWebKey,
		publicKey: b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey) as ArrayBuffer)),
	};
	await env.BUCKET.put(VAPID_KEY, JSON.stringify(keys));
	return keys;
}

async function readSubscriptions(env: Env): Promise<PushSubscriptionJSON[]> {
	const saved = await env.BUCKET.get(SUBS_KEY);
	return saved ? saved.json<PushSubscriptionJSON[]>() : [];
}

// ponytail: one JSON file in R2, fine for a few devices; move to the DO if concurrent writes ever matter.
export async function saveSubscription(env: Env, sub: PushSubscriptionJSON): Promise<void> {
	const subs = (await readSubscriptions(env)).filter((s) => s.endpoint !== sub.endpoint);
	await env.BUCKET.put(SUBS_KEY, JSON.stringify([...subs, sub]));
}

export async function removeSubscription(env: Env, endpoint: string): Promise<void> {
	const subs = await readSubscriptions(env);
	await env.BUCKET.put(SUBS_KEY, JSON.stringify(subs.filter((s) => s.endpoint !== endpoint)));
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
	const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
	return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

export async function encryptPayload(sub: PushSubscriptionJSON, payload: Bytes): Promise<Bytes> {
	const uaPublic = unb64url(sub.keys.p256dh);
	const authSecret = unb64url(sub.keys.auth);
	const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
	const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey) as ArrayBuffer);
	const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
	const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

	const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
	const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

	const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
	const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, concat(payload, new Uint8Array([2]))));
	const header = new Uint8Array(21);
	header.set(salt);
	new DataView(header.buffer).setUint32(16, 4096);
	header[20] = asPublic.length;
	return concat(header, asPublic, cipher);
}

async function sendOne(env: Env, vapid: VapidKeys, sub: PushSubscriptionJSON, body: Bytes): Promise<void> {
	if (!isPushEndpoint(sub.endpoint)) return removeSubscription(env, sub.endpoint);
	const jwt = await new SignJWT({})
		.setProtectedHeader({ alg: "ES256", typ: "JWT" })
		.setAudience(new URL(sub.endpoint).origin)
		.setExpirationTime("12h")
		.setSubject("mailto:admin@localhost")
		.sign(await importJWK(vapid.privateJwk, "ES256"));
	const res = await fetch(sub.endpoint, {
		method: "POST",
		headers: {
			Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
			"Content-Encoding": "aes128gcm",
			"Content-Type": "application/octet-stream",
			TTL: "86400",
			Urgency: "high",
		},
		body: await encryptPayload(sub, body),
		redirect: "manual",
	});
	// 404/410 = the device unsubscribed or the browser was reset.
	if (res.status === 404 || res.status === 410) await removeSubscription(env, sub.endpoint);
	else if (!res.ok) console.error("Push failed:", res.status, await res.text());
}

export async function notifyNewEmail(env: Env, email: { mailboxId: string; emailId: string; sender: string; subject: string }): Promise<void> {
	const subs = await readSubscriptions(env);
	if (!subs.length) return;
	const vapid = await getVapidKeys(env);
	const body = enc.encode(JSON.stringify({
		title: email.sender || "New email",
		body: email.subject || "(no subject)",
		tag: email.emailId,
		url: `/mailbox/${encodeURIComponent(email.mailboxId)}/emails/inbox?open=${encodeURIComponent(email.emailId)}`,
	}));
	await Promise.all(subs.map((sub) => sendOne(env, vapid, sub, body).catch((e) => console.error("Push error:", (e as Error).message))));
}
