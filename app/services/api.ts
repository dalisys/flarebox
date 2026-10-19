// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { Email, Folder, Mailbox } from "~/types";

export type BulkAction = "archive" | "read" | "unread" | "delete" | "snooze" | "unsnooze";

const REQUEST_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
	status: number;
	body: Record<string, unknown>;

	constructor(status: number, body: Record<string, unknown>) {
		super((body.error as string) || `Request failed: ${status}`);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
	}
}

async function request<T>(
	url: string,
	options: RequestInit = {},
): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	// Combine caller signal (e.g. TanStack Query abort) with our timeout signal
	const signal = options.signal
		? AbortSignal.any([options.signal, controller.signal])
		: controller.signal;

	try {
		const res = await fetch(url, {
			...options,
			signal,
			headers: {
				"Content-Type": "application/json",
				...(options.headers as Record<string, string>),
			},
		});

		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new ApiError(res.status, body as Record<string, unknown>);
		}

		if (res.status === 204) return undefined as T;

		const contentType = res.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			return res.json() as Promise<T>;
		}
		return res.blob() as unknown as T;
	} finally {
		clearTimeout(timeout);
	}
}

function get<T>(url: string, opts?: { params?: Record<string, string>; responseType?: string; signal?: AbortSignal }) {
	const query = opts?.params ? `?${new URLSearchParams(opts.params)}` : "";
	return request<T>(`${url}${query}`, {
		method: "GET",
		signal: opts?.signal,
		...(opts?.responseType === "blob" ? { headers: { Accept: "*/*" } } : {}),
	});
}

function post<T>(url: string, body?: unknown, opts?: { signal?: AbortSignal }) {
	return request<T>(url, {
		method: "POST",
		signal: opts?.signal,
		body: body != null ? JSON.stringify(body) : undefined,
	});
}

function put<T>(url: string, body?: unknown) {
	return request<T>(url, {
		method: "PUT",
		body: body != null ? JSON.stringify(body) : undefined,
	});
}

function del<T>(url: string) {
	return request<T>(url, { method: "DELETE" });
}

// ---------- Typed response shapes ----------

interface EmailListResponse {
	emails: Email[];
	totalCount: number;
}

export interface RoutingStatus {
	zoneName?: string;
	available: boolean;
	reason?: string;
	enabled?: boolean;
	status?: string;
	mxRecords?: { content: string; priority?: number }[];
	spfRecords?: string[];
	canEnable?: boolean;
}

export interface CatchAllStatus {
	zoneName?: string;
	available: boolean;
	enabled?: boolean;
	name?: string;
	reason?: string;
}

// ---------- API client ----------

type NotificationSettings = { skipForwarded: boolean; forwardTo: string | null };
type AiSettings = { model: string; defaultModel: string };

const api = {
	// Config
	getConfig: (signal?: AbortSignal) =>
		get<{ domains: string[]; emailAddresses: string[]; aiEnabled: boolean }>("/api/v1/config", { signal }),
	getNotificationSettings: () => get<NotificationSettings>("/api/v1/notifications/settings"),
	saveNotificationSettings: (settings: { skipForwarded: boolean }) => put<NotificationSettings>("/api/v1/notifications/settings", settings),
	getAiSettings: () => get<AiSettings>("/api/v1/ai/settings"),
	saveAiModel: (model: string | null) => put<AiSettings>("/api/v1/ai/settings", { model }),
	getAiModels: () => get<{ id: string; name: string }[]>("/api/v1/ai/models"),
	addDomain: (domain: string) => post<{ config: { domains: string[]; emailAddresses: string[] } }>("/api/v1/domains", { domain }),
	removeDomain: (domain: string) => del<void>(`/api/v1/domains/${encodeURIComponent(domain)}`),
	getDomainRouting: (domain: string) => get<RoutingStatus>(`/api/v1/domains/${encodeURIComponent(domain)}/routing`),
	enableDomainRouting: (domain: string) => post<RoutingStatus>(`/api/v1/domains/${encodeURIComponent(domain)}/routing`),
	syncDomainRules: (domain: string) => post<{ results: { address: string; routing: "active" | "manual" }[] }>(`/api/v1/domains/${encodeURIComponent(domain)}/rules`),
	getCatchAll: (domain: string) => get<CatchAllStatus>(`/api/v1/domains/${encodeURIComponent(domain)}/catch-all`),
	disableCatchAll: (domain: string) => post<CatchAllStatus>(`/api/v1/domains/${encodeURIComponent(domain)}/catch-all/disable`),

	// Mailboxes
	listMailboxes: (signal?: AbortSignal) => get<Mailbox[]>("/api/v1/mailboxes", { signal }),
	createMailbox: (email: string, name: string, settings?: unknown) =>
		post<Mailbox & { routing: "active" | "manual" }>("/api/v1/mailboxes", { email, name, settings }),
	getMailbox: (mailboxId: string, signal?: AbortSignal) =>
		get<Mailbox>(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}`, { signal }),
	updateMailbox: (mailboxId: string, settings: unknown) =>
		put<Mailbox>(`/api/v1/mailboxes/${mailboxId}`, { settings }),
	getTrustedSenders: (mailboxId: string, signal?: AbortSignal) =>
		get<{ senders: string[] }>(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/trusted-senders`, { signal }),
	removeTrustedSender: (mailboxId: string, address: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/trusted-senders/${encodeURIComponent(address)}`),
	retireMailbox: (mailboxId: string, operation: { mode: "export" } | { mode: "move"; target: string }) =>
		post<{ retired: boolean; ruleCleanup: "removed" | "manual" }>(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/retire`, operation),
	moveMailbox: (mailboxId: string, target: string, cursor?: string) => post<{ done: boolean; cursor?: string; copied: number }>(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/move`, { target, cursor }),
	mailboxExportUrl: (mailboxId: string) => `/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/export`,
	finalizeMailboxDelete: (mailboxId: string) => post<void>(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/finalize-delete`),

	// Emails
	listEmails: (mailboxId: string, params: Record<string, string>, opts?: { signal?: AbortSignal }) =>
		get<EmailListResponse | Email[]>(`/api/v1/mailboxes/${mailboxId}/emails`, { params, signal: opts?.signal }),
	sendEmail: (mailboxId: string, email: unknown) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails`, email),
	getEmail: (mailboxId: string, id: string, opts?: { signal?: AbortSignal }) =>
		get<Email>(`/api/v1/mailboxes/${mailboxId}/emails/${id}`, { signal: opts?.signal }),
	updateEmail: (mailboxId: string, id: string, data: unknown) =>
		put<Email>(`/api/v1/mailboxes/${mailboxId}/emails/${id}`, data),
	deleteEmail: (mailboxId: string, id: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/emails/${id}`),
	bulkEmails: (mailboxId: string, action: BulkAction, folder: string, ids: string[], expandThreads = true, until?: string) =>
		post<{ count: number }>(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/emails/bulk`, { action, folder, ids, expandThreads, until }),
	emptyJunk: (mailboxId: string) =>
		post<{ count: number }>(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/junk/empty`),
	moveEmail: (mailboxId: string, id: string, folderId: string) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${id}/move`, { folderId }),
	markSpam: (mailboxId: string, id: string) =>
		post<{ status: string; domain: string }>(`/api/v1/mailboxes/${mailboxId}/emails/${id}/spam`),
	markNotSpam: (mailboxId: string, id: string) =>
		post<{ status: string; sender: string }>(`/api/v1/mailboxes/${mailboxId}/emails/${id}/not-spam`),
	getThread: (mailboxId: string, threadId: string, opts?: { signal?: AbortSignal }) =>
		get<Email[]>(`/api/v1/mailboxes/${mailboxId}/threads/${threadId}`, { signal: opts?.signal }),
	markThreadRead: (mailboxId: string, threadId: string) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/threads/${threadId}/read`),
	getAttachment: (mailboxId: string, emailId: string, attachmentId: string) =>
		get<Blob>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/attachments/${attachmentId}`, { responseType: "blob" }),
	saveDraft: (
		mailboxId: string,
		draft: {
			to?: string;
			cc?: string;
			bcc?: string;
			subject?: string;
			body: string;
			in_reply_to?: string;
			thread_id?: string;
			draft_id?: string;
		},
	) => post<{ draft_id: string }>(`/api/v1/mailboxes/${mailboxId}/drafts`, draft),
	scheduleEmail: (mailboxId: string, data: { mode: "new" | "reply" | "forward"; originalId?: string; draftId?: string; sendAt: string; email: unknown }) =>
		post<{ id: string; sendAt: string }>(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/scheduled`, data),
	cancelScheduled: (mailboxId: string, id: string) =>
		post<{ status: string }>(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/scheduled/${encodeURIComponent(id)}/cancel`),
	sendScheduledNow: (mailboxId: string, id: string) =>
		post<{ status: string }>(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/scheduled/${encodeURIComponent(id)}/send`),
	replyToEmail: (mailboxId: string, emailId: string, email: unknown) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/reply`, email),
	forwardEmail: (mailboxId: string, emailId: string, email: unknown) =>
		post<void>(`/api/v1/mailboxes/${mailboxId}/emails/${emailId}/forward`, email),
	aiWrite: (mailboxId: string, input: { instructions: string; mode: string; emailId?: string; to?: string; subject?: string; fromName?: string }) =>
		post<{ subject: string; body: string }>(`/api/v1/mailboxes/${mailboxId}/ai/write`, input),

	// Folders
	listFolders: (mailboxId: string) =>
		get<Folder[]>(`/api/v1/mailboxes/${mailboxId}/folders`),
	createFolder: (mailboxId: string, name: string) =>
		post<Folder>(`/api/v1/mailboxes/${mailboxId}/folders`, { name }),
	updateFolder: (mailboxId: string, id: string, name: string) =>
		put<Folder>(`/api/v1/mailboxes/${mailboxId}/folders/${id}`, { name }),
	deleteFolder: (mailboxId: string, id: string) =>
		del<void>(`/api/v1/mailboxes/${mailboxId}/folders/${id}`),

	// Search
	searchEmails: (mailboxId: string, params: Record<string, string>) =>
		get<EmailListResponse | Email[]>(`/api/v1/mailboxes/${mailboxId}/search`, { params }),
};

export default api;
