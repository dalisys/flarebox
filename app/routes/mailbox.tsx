// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useRef } from "react";
import { Outlet, useParams } from "react-router";
import AgentSheet from "~/components/AgentSheet";
import ComposeEmail from "~/components/ComposeEmail";
import Header from "~/components/Header";
import MailNavigation from "~/components/MailNavigation";
import { useMailbox } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";

export default function MailboxRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	// Prefetch mailbox data for child components
	useMailbox(mailboxId);
	const prevMailboxIdRef = useRef<string | undefined>(undefined);
	const {
		closeSidebar,
		selectedEmailId,
		isComposing,
		closePanel,
		closeComposeModal,
	} = useUIStore();

	useEffect(() => {
		if (
			prevMailboxIdRef.current &&
			mailboxId &&
			prevMailboxIdRef.current !== mailboxId
		) {
			closePanel();
			closeComposeModal();
			closeSidebar();
		}

		prevMailboxIdRef.current = mailboxId;
	}, [mailboxId, closeComposeModal, closePanel, closeSidebar]);

	return (
		<div className="mail-shell flex h-dvh overflow-hidden">
			<MailNavigation />

			{/* Main content */}
			<div className="flex-1 flex flex-col min-h-0 min-w-0">
				<div className={selectedEmailId || isComposing ? "hidden md:block" : ""}><Header /></div>
				<main className="mail-workspace relative min-h-0 flex-1 overflow-hidden">
					<Outlet />
				</main>
			</div>

			<AgentSheet mailboxId={mailboxId} />

			<ComposeEmail />
		</div>
	);
}
