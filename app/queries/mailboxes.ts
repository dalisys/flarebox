// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { Mailbox } from "~/types";
import { queryKeys } from "./keys";

export function useMailboxes(options?: { retry?: boolean; timeoutMs?: number }) {
	return useQuery<Mailbox[]>({
		queryKey: queryKeys.mailboxes.all,
		queryFn: ({ signal }) => api.listMailboxes(options?.timeoutMs ? AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs)]) : signal) as Promise<Mailbox[]>,
		retry: options?.retry,
	});
}

export function useMailbox(mailboxId: string | undefined, options?: { retry?: boolean; timeoutMs?: number }) {
	return useQuery<Mailbox>({
		queryKey: mailboxId
			? queryKeys.mailboxes.detail(mailboxId)
			: ["mailboxes", "_disabled"],
		queryFn: ({ signal }) => api.getMailbox(mailboxId!, options?.timeoutMs ? AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs)]) : signal) as Promise<Mailbox>,
		enabled: !!mailboxId,
		retry: options?.retry,
		refetchOnReconnect: options?.retry === false ? false : undefined,
	});
}

export function useCreateMailbox() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ email, name }: { email: string; name: string }) =>
			api.createMailbox(email, name),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
		},
	});
}

export function useUpdateMailbox() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			mailboxId,
			settings,
		}: { mailboxId: string; settings: unknown }) =>
			api.updateMailbox(mailboxId, settings),
		onSuccess: (_data, { mailboxId }) => {
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.detail(mailboxId) });
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
		},
	});
}
