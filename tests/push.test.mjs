import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const bundled = await build({ entryPoints: ["workers/lib/push.ts"], bundle: true, platform: "node", format: "esm", write: false });
const { encryptPayload } = await import(`data:text/javascript,${encodeURIComponent(bundled.outputFiles[0].text)}`);

const subtle = crypto.subtle;
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const hkdf = async (salt, ikm, info, bytes) => new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), bytes * 8));

test("push payload decrypts with the browser's keys (RFC 8291)", async () => {
	const ua = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
	const uaPublic = new Uint8Array(await subtle.exportKey("raw", ua.publicKey));
	const auth = crypto.getRandomValues(new Uint8Array(16));
	const message = JSON.stringify({ title: "Ada", body: "Hello" });

	const out = await encryptPayload({ endpoint: "https://push.example", keys: { p256dh: b64url(uaPublic), auth: b64url(auth) } }, new TextEncoder().encode(message));

	const salt = out.slice(0, 16);
	assert.equal(new DataView(out.buffer, out.byteOffset).getUint32(16), 4096);
	const asPublic = out.slice(21, 21 + out[20]);
	const asKey = await subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
	const secret = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: asKey }, ua.privateKey, 256));
	const enc = new TextEncoder();
	const ikm = await hkdf(auth, secret, new Uint8Array([...enc.encode("WebPush: info\0"), ...uaPublic, ...asPublic]), 32);
	const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
	const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
	const plain = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce }, await subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), out.slice(21 + out[20])));

	assert.equal(plain.at(-1), 2);
	assert.equal(new TextDecoder().decode(plain.slice(0, -1)), message);
});

test("only browser push services are accepted", async () => {
	const { isPushEndpoint } = await import(`data:text/javascript,${encodeURIComponent(bundled.outputFiles[0].text)}`);
	assert.ok(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"));
	assert.ok(isPushEndpoint("https://web.push.apple.com/QK"));
	assert.ok(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"));
	assert.ok(!isPushEndpoint("https://evilpush.apple.com.attacker.dev/x"));
	assert.ok(!isPushEndpoint("http://fcm.googleapis.com/x"));
	assert.ok(!isPushEndpoint("https://169.254.169.254/"));
});
