// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Outgoing email. Uses Resend (https://resend.com/docs/api-reference/emails/send-email)
 * when the RESEND_API_KEY secret is set, otherwise the Cloudflare `send_email`
 * binding (`env.EMAIL.send()`).
 *
 * See: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
 */

export interface SendEmailParams {
	to: string | string[];
	from: string | { email: string; name: string };
	subject: string;
	html?: string;
	text?: string;
	cc?: string | string[];
	bcc?: string | string[];
	replyTo?: string | { email: string; name: string };
	attachments?: {
		content: string; // base64 encoded
		filename: string;
		type: string;
		disposition: "attachment" | "inline";
		contentId?: string;
	}[];
	headers?: Record<string, string>;
	/** Message-ID (without angle brackets) saved on the Sent copy. Only Resend sends it. */
	messageId?: string;
}

export interface SendEnv {
	EMAIL: SendEmail;
	RESEND_API_KEY?: string;
}

export const sendProvider = (env: { RESEND_API_KEY?: string }) => (env.RESEND_API_KEY ? "resend" : "cloudflare");

const list = (value?: string | string[]) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]);
const address = (value: string | { email: string; name: string }) => (typeof value === "string" ? value : value.name ? `"${value.name.replace(/["\\\r\n]/g, "")}" <${value.email}>` : value.email);

/** Build the JSON body for POST https://api.resend.com/emails. */
export function buildResendRequest(params: SendEmailParams): Record<string, unknown> {
	const headers = { ...params.headers, ...(params.messageId ? { "Message-ID": `<${params.messageId}>` } : {}) };
	return {
		from: address(params.from),
		to: list(params.to),
		subject: params.subject,
		...(params.html ? { html: params.html } : {}),
		...(params.text ? { text: params.text } : {}),
		...(params.cc ? { cc: list(params.cc) } : {}),
		...(params.bcc ? { bcc: list(params.bcc) } : {}),
		...(params.replyTo ? { reply_to: address(params.replyTo) } : {}),
		...(Object.keys(headers).length > 0 ? { headers } : {}),
		...(params.attachments?.length ? {
			attachments: params.attachments.map((att) => ({
				filename: att.filename,
				content: att.content,
				content_type: att.type,
				...(att.contentId ? { content_id: att.contentId } : {}),
			})),
		} : {}),
	};
}

/** Turn a failed Resend response into a message a person can act on. */
export function resendErrorMessage(status: number, body: { message?: string; name?: string } | null): string {
	const detail = body?.message ? ` ${body.message}` : "";
	if (status === 401 || body?.name === "missing_api_key" || body?.name === "invalid_api_key") return "Resend rejected the API key. Check the RESEND_API_KEY secret.";
	if (status === 403) return `Resend refused to send. Verify the sending domain in Resend.${detail}`;
	if (status === 429) return `Resend sending limit reached. Try again later.${detail}`;
	if (status === 422 || status === 400) return `Resend could not accept this email.${detail}`;
	return `Resend failed (HTTP ${status}).${detail}`;
}

async function sendWithResend(apiKey: string, params: SendEmailParams): Promise<{ messageId: string }> {
	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify(buildResendRequest(params)),
	});
	const body = (await response.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;
	if (!response.ok) throw new Error(resendErrorMessage(response.status, body));
	return { messageId: body?.id ?? "" };
}

/**
 * Send an email through Resend or the Cloudflare Email Service binding.
 *
 * @param env      - Worker env with the `EMAIL` binding and optional RESEND_API_KEY
 * @param params   - Email parameters (to, from, subject, body, etc.)
 * @returns The send result with messageId
 * @throws On validation or delivery errors
 */
export async function sendEmail(
	env: SendEnv,
	params: SendEmailParams,
): Promise<{ messageId: string }> {
	if (env.RESEND_API_KEY) return sendWithResend(env.RESEND_API_KEY, params);

	const message: Record<string, unknown> = {
		to: params.to,
		from: params.from,
		subject: params.subject,
	};

	if (params.html) message.html = params.html;
	if (params.text) message.text = params.text;
	if (params.cc) message.cc = params.cc;
	if (params.bcc) message.bcc = params.bcc;
	if (params.replyTo) message.replyTo = params.replyTo;

	if (params.headers && Object.keys(params.headers).length > 0) {
		message.headers = params.headers;
	}

	if (params.attachments && params.attachments.length > 0) {
		message.attachments = params.attachments.map((att) => ({
			content: att.content,
			filename: att.filename,
			type: att.type,
			disposition: att.disposition,
			...(att.contentId ? { contentId: att.contentId } : {}),
		}));
	}

	const result = await env.EMAIL.send(message as any);
	return { messageId: result.messageId };
}
