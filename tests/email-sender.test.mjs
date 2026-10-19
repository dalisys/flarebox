import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { buildResendRequest, sendEmail, sendProvider } from "../workers/email-sender.ts";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const reply = {
	from: { email: "me@example.com", name: "Me \"Boss\"" },
	to: "you@gmail.com",
	cc: ["c@example.com"],
	bcc: "b@example.com",
	replyTo: "reply@example.com",
	subject: "Re: Hi",
	html: "<p>Hi</p>",
	text: "Hi",
	headers: { "In-Reply-To": "<orig@gmail.com>", References: "<a@gmail.com> <orig@gmail.com>" },
	messageId: "new@example.com",
	attachments: [{ content: "aGk=", filename: "a.txt", type: "text/plain", disposition: "attachment" }, { content: "eA==", filename: "x.png", type: "image/png", disposition: "inline", contentId: "img1" }],
};

test("builds the Resend body with names, lists, threading headers and attachments", () => {
	assert.deepEqual(buildResendRequest(reply), {
		from: "\"Me Boss\" <me@example.com>",
		to: ["you@gmail.com"],
		subject: "Re: Hi",
		html: "<p>Hi</p>",
		text: "Hi",
		cc: ["c@example.com"],
		bcc: ["b@example.com"],
		reply_to: "reply@example.com",
		headers: { "In-Reply-To": "<orig@gmail.com>", References: "<a@gmail.com> <orig@gmail.com>", "Message-ID": "<new@example.com>" },
		attachments: [{ filename: "a.txt", content: "aGk=", content_type: "text/plain" }, { filename: "x.png", content: "eA==", content_type: "image/png", content_id: "img1" }],
	});
	assert.deepEqual(buildResendRequest({ from: "me@example.com", to: "you@gmail.com", subject: "Hi", text: "Hi" }), { from: "me@example.com", to: ["you@gmail.com"], subject: "Hi", text: "Hi" });
});

test("sends through Resend when the key is set", async () => {
	let call;
	globalThis.fetch = async (url, init) => { call = { url, init }; return Response.json({ id: "resend-id" }); };
	const binding = { send: () => assert.fail("binding must not be used") };
	assert.equal(sendProvider({ RESEND_API_KEY: "re_test" }), "resend");
	assert.deepEqual(await sendEmail({ EMAIL: binding, RESEND_API_KEY: "re_test" }, reply), { messageId: "resend-id" });
	assert.equal(call.url, "https://api.resend.com/emails");
	assert.equal(call.init.headers.Authorization, "Bearer re_test");
	assert.equal(JSON.parse(call.init.body).subject, "Re: Hi");
});

test("maps Resend errors to clear messages", async () => {
	globalThis.fetch = async () => Response.json({ name: "validation_error", message: "The example.com domain is not verified." }, { status: 403 });
	await assert.rejects(sendEmail({ EMAIL: {}, RESEND_API_KEY: "re_test" }, reply), /Verify the sending domain in Resend\. The example\.com domain is not verified\./);
	globalThis.fetch = async () => Response.json({ name: "invalid_api_key", message: "API key is invalid" }, { status: 401 });
	await assert.rejects(sendEmail({ EMAIL: {}, RESEND_API_KEY: "bad" }, reply), /Check the RESEND_API_KEY secret/);
	globalThis.fetch = async () => new Response("oops", { status: 500 });
	await assert.rejects(sendEmail({ EMAIL: {}, RESEND_API_KEY: "re_test" }, reply), /Resend failed \(HTTP 500\)/);
});

test("uses the Cloudflare binding when no key is set", async () => {
	globalThis.fetch = () => assert.fail("fetch must not be used");
	let sent;
	const binding = { send: async (message) => { sent = message; return { messageId: "cf-id" }; } };
	assert.equal(sendProvider({}), "cloudflare");
	assert.deepEqual(await sendEmail({ EMAIL: binding }, reply), { messageId: "cf-id" });
	assert.equal(sent.messageId, undefined);
	assert.deepEqual(sent.headers, reply.headers);
	assert.deepEqual(sent.from, reply.from);
});
