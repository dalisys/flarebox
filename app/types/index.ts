// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface SignatureSettings {
	enabled: boolean;
	text: string;
	html?: string;
}

export interface MailboxSettings {
	spamFiltering?: { enabled?: boolean; threshold?: number; blocklist?: string[] };
	fromName?: string;
	/** Copy incoming mail to FORWARD_TO_EMAIL. Missing means on. */
	forwardIncoming?: boolean;
	/** Where this address forwards to. Missing means FORWARD_TO_EMAIL. */
	forwardTo?: string;
	signature?: SignatureSettings;
	autoReply?: { enabled: boolean; subject: string; message: string };
	agentSystemPrompt?: string;
	agentEnabled?: boolean;
	autoDraftEnabled?: boolean;
}

export interface FilterRule {
	id: string;
	name?: string;
	enabled: boolean;
	conditions: { from?: string; to?: string; subject?: string; body?: string };
	actions: { folder?: string; markRead?: boolean; star?: boolean };
}

export interface Mailbox {
	id: string;
	email: string;
	name: string;
	retired?: boolean;
	operation?: { mode: "export" } | { mode: "move"; target: string } | null;
	settings?: MailboxSettings;
}

export interface Email {
	id: string;
	thread_id?: string | null;
	folder_id?: string | null;
	subject: string;
	sender: string;
	recipient: string;
	cc?: string;
	bcc?: string;
	date: string;
	read: boolean;
	starred: boolean;
	body?: string | null;
	in_reply_to?: string | null;
	email_references?: string | null;
	message_id?: string | null;
	raw_headers?: string | null;
	attachments?: Attachment[];
	snippet?: string | null;
	// Thread aggregate fields (only present in threaded list view)
	thread_count?: number;
	thread_unread_count?: number;
	participants?: string;
	needs_reply?: boolean;
	has_draft?: boolean;
	snoozed_until?: string | null;
	send_at?: string | null;
	send_error?: string | null;
	send_attempts?: number;
	sort_date?: string;
}

export interface Attachment {
	id: string;
	filename: string;
	mimetype: string;
	size: number;
	content_id?: string;
	disposition?: string;
}

export interface Folder {
	id: string;
	name: string;
	unreadCount: number;
}
