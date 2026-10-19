// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Outlet, useParams } from "react-router";
import AgentSidebar from "~/components/AgentSidebar";
import ComposeEmail from "~/components/ComposeEmail";
import Header from "~/components/Header";
import MailNavigation from "~/components/MailNavigation";
import { useAiEnabled, useMailbox } from "~/queries/mailboxes";
import { useBackToClose } from "~/hooks/useBackToClose";
import { useUIStore } from "~/hooks/useUIStore";

// Below lg the agent opens as a full-screen sheet instead of a side panel.
const NARROW = "(max-width: 1023px)";
const subscribeNarrow = (onChange: () => void) => {
	const query = window.matchMedia(NARROW);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
};

export default function MailboxRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	// Prefetch mailbox data for child components
	useMailbox(mailboxId);
	const aiEnabled = useAiEnabled();
	const prevMailboxIdRef = useRef<string | undefined>(undefined);
	const {
		closeSidebar,
		selectedEmailId,
		isComposing,
		isAgentPanelOpen,
		toggleAgentPanel,
		closePanel,
		closeComposeModal,
	} = useUIStore();
	const isNarrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
	const showAgent = aiEnabled && isAgentPanelOpen;
	// On phones the sheet is a layer: Back closes it. A draft opened from the chat sits above it.
	useBackToClose(isNarrow && showAgent ? 1 : 0, () => { if (useUIStore.getState().isAgentPanelOpen) toggleAgentPanel(); });

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

			{/* Agent + MCP: side panel on desktop, full-screen sheet on phones (hidden while composing a draft from it) */}
			{showAgent && (
				<div className={`agent-sheet fixed inset-0 z-40 flex-col overflow-hidden bg-kumo-base lg:static lg:z-auto lg:flex lg:w-[380px] lg:shrink-0 lg:border-l lg:border-kumo-line ${isComposing ? "hidden" : "flex"}`}>
					<AgentSidebar onClose={toggleAgentPanel} />
				</div>
			)}

			<ComposeEmail />
		</div>
	);
}
