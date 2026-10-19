// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import CombinedInbox from "~/components/CombinedInbox";
import ComposePanel from "~/components/ComposePanel";
import EmailPanel from "~/components/EmailPanel";
import Header from "~/components/Header";
import MailNavigation from "~/components/MailNavigation";
import FloatingCompose from "~/components/FloatingCompose";
import { useUIStore } from "~/hooks/useUIStore";
import { queryKeys } from "~/queries/keys";
import { useMailboxes } from "~/queries/mailboxes";
import api from "~/services/api";

export function meta() { return [{ title: "Mail · Flarebox" }]; }

export default function HomeRoute() {
	const { data: mailboxes = [], refetch, isFetched } = useMailboxes();
	const { data: config } = useQuery({ queryKey: queryKeys.config, queryFn: ({ signal }) => api.getConfig(signal), staleTime: Infinity });
	const { isComposing, startCompose, closeCompose, closePanel } = useUIStore();
	const [selectedEmail, setSelectedEmail] = useState<{ id: string; mailboxId: string; folder: string } | null>(null);
	const [messageOrder, setMessageOrder] = useState<{ id: string; mailboxId: string; folder: string }[]>([]);
	const [searchParams] = useSearchParams();
	const autoCreateDone = useRef(false);
	const folder = searchParams.get("folder") || "inbox";
	const searchQuery = searchParams.get("q");
	const composeMailbox = mailboxes.find((mailbox) => !mailbox.retired);
	useEffect(() => { setSelectedEmail(null); closeCompose(); }, [folder, searchQuery, closeCompose]);

	useEffect(() => {
		if (autoCreateDone.current || !isFetched || !config?.emailAddresses?.length) return;
		autoCreateDone.current = true;
		const existing = new Set(mailboxes.map((mailbox) => mailbox.email.toLowerCase()));
		const missing = config.emailAddresses.filter((email) => !existing.has(email.toLowerCase()));
		if (missing.length) Promise.all(missing.map((email) => api.createMailbox(email, email.split("@")[0]).catch(() => null))).then(() => refetch());
	}, [config, isFetched, mailboxes, refetch]);

	return <div className="mail-shell flex h-dvh overflow-hidden">
		<MailNavigation />
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div className={selectedEmail || isComposing ? "hidden md:block" : ""}><Header /></div>
			<main className="mail-workspace relative flex min-h-0 flex-1">
				<div className={`min-w-0 ${selectedEmail || isComposing ? "hidden md:block md:w-[380px] md:shrink-0 md:border-r md:border-kumo-line" : "w-full"}`}><CombinedInbox mailboxes={mailboxes} folder={folder} onSelect={(email, messages) => { closeCompose(); setMessageOrder(messages); setSelectedEmail(email); }} /></div>
				{(selectedEmail || isComposing) && <div className="min-w-0 flex-1 overflow-hidden">{isComposing ? <ComposePanel mailboxId={selectedEmail?.mailboxId} /> : selectedEmail && <div className="flex h-full flex-col"><EmailPanel key={`${selectedEmail.mailboxId}/${selectedEmail.id}`} onNavigate={(direction) => {
					const index = messageOrder.findIndex((item) => item.id === selectedEmail.id && item.mailboxId === selectedEmail.mailboxId);
					const next = messageOrder[index + (direction === "next" ? 1 : -1)];
					if (index >= 0 && next) setSelectedEmail(next);
				}} emailId={selectedEmail.id} mailboxId={selectedEmail.mailboxId} folder={selectedEmail.folder} onClose={() => { setSelectedEmail(null); closePanel(); }} /></div>}</div>}
				{composeMailbox && !selectedEmail && !isComposing && <FloatingCompose onClick={() => startCompose()} />}
			</main>
		</div>
	</div>;
}
