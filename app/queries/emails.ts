// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import api, { type BulkAction } from "~/services/api";
import { mapCachedEmail, restoreEmailFields } from "~/lib/email-cache";
import type { Email } from "~/types";
import { queryKeys } from "./keys";

// ---------- Types ----------

interface EmailListResponse {
	emails: Email[];
	totalCount: number;
}

// ---------- Queries ----------

function emailListQuery(mailboxId: string | undefined, params: Record<string, string>) {
	const queryParams = params.folder && params.folder !== "activity"
		? { ...params, threaded: "true" }
		: params;

	return {
		queryKey: mailboxId
			? queryKeys.emails.list(mailboxId, queryParams)
			: ["emails", "_disabled"],
		queryFn: async (): Promise<EmailListResponse> => {
			const data = await api.listEmails(mailboxId!, queryParams) as
				| EmailListResponse
				| Email[];
			if (data && typeof data === "object" && "emails" in data) {
				return {
					emails: (data as EmailListResponse).emails ?? [],
					totalCount: (data as EmailListResponse).totalCount ?? 0,
				};
			}
			const arr = Array.isArray(data) ? data : [];
			return { emails: arr, totalCount: arr.length };
		},
	};
}

export function useEmails(
	mailboxId: string | undefined,
	params: Record<string, string>,
	options?: { enabled?: boolean; refetchInterval?: number },
) {
	return useQuery<EmailListResponse>({
		...emailListQuery(mailboxId, params),
		enabled: !!mailboxId && (options?.enabled ?? true),
		refetchInterval: options?.refetchInterval,
	});
}

/** Pages 1..pageCount of a folder as one list, for loading more on scroll. */
export function useEmailPages(
	mailboxId: string | undefined,
	folder: string,
	pageCount: number,
	pageSize: number,
	options?: { refetchInterval?: number },
) {
	const results = useQueries({
		queries: Array.from({ length: pageCount }, (_, index) => ({
			...emailListQuery(mailboxId, { folder, page: String(index + 1), limit: String(pageSize) }),
			enabled: !!mailboxId,
			refetchInterval: options?.refetchInterval,
		})),
	});
	// New mail shifts later pages by a few rows, so one email can appear on two pages.
	const seen = new Set<string>();
	const emails = results.flatMap((result) => result.data?.emails ?? []).filter((email) => !seen.has(email.id) && Boolean(seen.add(email.id)));
	return {
		emails,
		totalCount: results[0]?.data?.totalCount ?? 0,
		isFetching: results.some((result) => result.isFetching),
		isLoadingMore: pageCount > 1 && results[pageCount - 1]?.isPending,
	};
}

export function useEmail(
	mailboxId: string | undefined,
	emailId: string | undefined,
) {
	return useQuery<Email>({
		queryKey: mailboxId && emailId
			? queryKeys.emails.detail(mailboxId, emailId)
			: ["emails", "_disabled_detail"],
		queryFn: () => api.getEmail(mailboxId!, emailId!) as Promise<Email>,
		enabled: !!mailboxId && !!emailId,
	});
}

export function useThreadReplies(
	mailboxId: string | undefined,
	threadId: string | undefined | null,
) {
	const qc = useQueryClient();

	return useQuery<Email[]>({
		queryKey: mailboxId && threadId
			? queryKeys.emails.thread(mailboxId, threadId)
			: ["emails", "_disabled_thread"],
		queryFn: async ({ signal }) => {
			// Single request returns all thread emails with full bodies +
			// attachments. Eliminates the previous N+1 pattern that fired
			// a separate getEmail call per thread message.
			const emails = await api.getThread(mailboxId!, threadId!, { signal }) as Email[];

			// Populate individual email detail caches so clicking a thread
			// message in the panel doesn't re-fetch.
			for (const email of emails) {
				qc.setQueryData(
					queryKeys.emails.detail(mailboxId!, email.id),
					email,
				);
			}

			return emails;
		},
		enabled: !!mailboxId && !!threadId,
	});
}

// ---------- Mutations ----------

/** Invalidate both the email list and folder counts after any email mutation. */
function useInvalidateEmailData() {
	const qc = useQueryClient();
	return (mailboxId: string) => {
		qc.invalidateQueries({ queryKey: ["emails", mailboxId] });
		qc.invalidateQueries({ queryKey: ["combined-mail", mailboxId] });
		qc.invalidateQueries({
			queryKey: queryKeys.folders.list(mailboxId),
		});
	};
}

export function useSendEmail() {
	const invalidate = useInvalidateEmailData();
	return useMutation({
		mutationFn: ({
			mailboxId,
			email,
		}: { mailboxId: string; email: unknown }) =>
			api.sendEmail(mailboxId, email),
		onSuccess: (_data, { mailboxId }) => invalidate(mailboxId),
	});
}

export function useUpdateEmail() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: ["update-email"],
		mutationFn: ({ mailboxId, id, data }: { mailboxId: string; id: string; data: Partial<Pick<Email, "read" | "starred">> }) => api.updateEmail(mailboxId, id, data),
		onMutate: async ({ mailboxId, id, data }) => {
			const filters = { predicate: (query: { queryKey: readonly unknown[] }) => query.queryKey[1] === mailboxId && ["emails", "combined-mail", "search"].includes(String(query.queryKey[0])) };
			await qc.cancelQueries(filters);
			const previous = qc.getQueriesData(filters);
			for (const [key, cached] of previous) {
				qc.setQueryData(key, mapCachedEmail(cached, id, (email) => ({ ...email, ...data })));
			}
			return { previous };
		},
		onError: (_err, { id, data }, context) => {
			for (const [key, cached] of context?.previous ?? []) {
				qc.setQueryData(key, (current: unknown) => restoreEmailFields(current, cached, id, data));
			}
		},
		onSettled: (_data, _err, { mailboxId }) => {
			// The last pending save reconciles the account, so an earlier save's
			// refetch cannot overwrite another row's optimistic star.
			if (qc.isMutating({ mutationKey: ["update-email"], predicate: (mutation) => (mutation.state.variables as { mailboxId?: string })?.mailboxId === mailboxId }) > 1) return;
			qc.invalidateQueries({ queryKey: ["emails", mailboxId] });
			qc.invalidateQueries({ queryKey: ["combined-mail", mailboxId] });
			qc.invalidateQueries({ queryKey: ["search", mailboxId] });
			qc.invalidateQueries({ queryKey: queryKeys.folders.list(mailboxId) });
		},
	});
}

export function useMarkThreadRead() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			mailboxId,
			threadId,
		}: { mailboxId: string; threadId: string }) =>
			api.markThreadRead(mailboxId, threadId),
		onSuccess: (_data, { mailboxId }) => {
			qc.invalidateQueries({ queryKey: ["emails", mailboxId] });
			qc.invalidateQueries({ queryKey: ["combined-mail", mailboxId] });
			qc.invalidateQueries({
				queryKey: queryKeys.folders.list(mailboxId),
			});
		},
	});
}

export function useDeleteEmail() {
	const invalidate = useInvalidateEmailData();
	return useMutation({
		mutationFn: ({
			mailboxId,
			id,
		}: { mailboxId: string; id: string }) =>
			api.deleteEmail(mailboxId, id),
		onSuccess: (_data, { mailboxId }) => invalidate(mailboxId),
	});
}

export function useBulkEmails() {
	const invalidate = useInvalidateEmailData();
	return useMutation({
		mutationFn: async ({ mailboxId, action, folder, ids, expandThreads = true, until }: { mailboxId: string; action: BulkAction; folder: string; ids: string[]; expandThreads?: boolean; until?: string }) => {
			let count = 0;
			for (let i = 0; i < ids.length; i += 100) count += (await api.bulkEmails(mailboxId, action, folder, ids.slice(i, i + 100), expandThreads, until)).count;
			return count;
		},
		onSettled: (_data, _error, { mailboxId }) => invalidate(mailboxId),
	});
}

export function useEmptyJunk() {
	const invalidate = useInvalidateEmailData();
	return useMutation({
		mutationFn: (mailboxId: string) => api.emptyJunk(mailboxId),
		onSettled: (_data, _error, mailboxId) => invalidate(mailboxId),
	});
}

export function useMoveEmail() {
	const invalidate = useInvalidateEmailData();
	return useMutation({
		mutationFn: ({
			mailboxId,
			id,
			folderId,
		}: { mailboxId: string; id: string; folderId: string }) =>
			api.moveEmail(mailboxId, id, folderId),
		onSuccess: (_data, { mailboxId }) => invalidate(mailboxId),
	});
}

export function useMarkSpam() {
	const invalidate = useInvalidateEmailData();
	return useMutation({
		mutationFn: ({ mailboxId, id }: { mailboxId: string; id: string }) => api.markSpam(mailboxId, id),
		onSuccess: (_data, { mailboxId }) => invalidate(mailboxId),
	});
}

export function useMarkNotSpam() {
	const invalidate = useInvalidateEmailData();
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ mailboxId, id }: { mailboxId: string; id: string }) => api.markNotSpam(mailboxId, id),
		onSuccess: (_data, { mailboxId }) => {
			invalidate(mailboxId);
			qc.invalidateQueries({ queryKey: ["trusted-senders", mailboxId] });
		},
	});
}

export function useSaveDraft() {
	const invalidate = useInvalidateEmailData();
	return useMutation({
		mutationFn: ({
			mailboxId,
			draft,
		}: {
			mailboxId: string;
			draft: {
				to?: string;
				cc?: string;
				bcc?: string;
				subject?: string;
				body: string;
				in_reply_to?: string;
				thread_id?: string;
				draft_id?: string;
			};
		}) => api.saveDraft(mailboxId, draft),
		onSuccess: (_data, { mailboxId }) => invalidate(mailboxId),
	});
}

export function useReplyToEmail() {
	const invalidate = useInvalidateEmailData();
	return useMutation({
		mutationFn: ({
			mailboxId,
			emailId,
			email,
		}: { mailboxId: string; emailId: string; email: unknown }) =>
			api.replyToEmail(mailboxId, emailId, email),
		onSuccess: (_data, { mailboxId }) => invalidate(mailboxId),
	});
}

export function useForwardEmail() {
	const invalidate = useInvalidateEmailData();
	return useMutation({
		mutationFn: ({
			mailboxId,
			emailId,
			email,
		}: { mailboxId: string; emailId: string; email: unknown }) =>
			api.forwardEmail(mailboxId, emailId, email),
		onSuccess: (_data, { mailboxId }) => invalidate(mailboxId),
	});
}

export function useScheduledAction() {
	const invalidate = useInvalidateEmailData();
	return useMutation({
		mutationFn: ({ mailboxId, id, action }: { mailboxId: string; id: string; action: "cancel" | "send" }) =>
			action === "cancel" ? api.cancelScheduled(mailboxId, id) : api.sendScheduledNow(mailboxId, id),
		onSettled: (_data, _error, { mailboxId }) => invalidate(mailboxId),
	});
}

export function useScheduleEmail() {
	const invalidate = useInvalidateEmailData();
	return useMutation({
		mutationFn: ({ mailboxId, data }: { mailboxId: string; data: Parameters<typeof api.scheduleEmail>[1] }) => api.scheduleEmail(mailboxId, data),
		onSettled: (_data, _error, { mailboxId }) => invalidate(mailboxId),
	});
}
