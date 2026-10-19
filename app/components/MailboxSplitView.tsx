// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { ReactNode } from "react";
import ComposePanel from "~/components/ComposePanel";
import EmailPanel from "~/components/EmailPanel";
import FloatingCompose from "~/components/FloatingCompose";
import { useBackToClose } from "~/hooks/useBackToClose";
import { useUIStore } from "~/hooks/useUIStore";
import { useMailbox } from "~/queries/mailboxes";
import { useParams } from "react-router";

interface MailboxSplitViewProps {
	selectedEmailId: string | null;
	isComposing: boolean;
	onNavigate?: (direction: "next" | "previous") => void;
	children: ReactNode;
}

export default function MailboxSplitView({
	selectedEmailId,
	isComposing,
	children,
	onNavigate,
}: MailboxSplitViewProps) {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const { data: mailbox } = useMailbox(mailboxId);
	const startCompose = useUIStore((state) => state.startCompose);
	const isPanelOpen = selectedEmailId !== null || isComposing;
	useBackToClose((selectedEmailId ? 1 : 0) + (isComposing ? 1 : 0), () => {
		const state = useUIStore.getState();
		if (state.isComposing) state.closeCompose();
		else state.closePanel();
	});

	return (
		<div className="relative flex h-full">
			<div
				className={`flex flex-col min-w-0 shrink-0 ${
					isPanelOpen
						? "hidden md:flex md:w-[380px] md:border-r md:border-kumo-line"
						: "w-full"
				}`}
			>
				{children}
			</div>
			{!isPanelOpen && mailbox && !mailbox.retired && <FloatingCompose onClick={() => startCompose()} />}
			{isPanelOpen && (
				<div className="flex-1 flex flex-col min-w-0 overflow-hidden w-full md:w-auto">
					{isComposing && !selectedEmailId ? (
						<ComposePanel />
					) : isComposing && selectedEmailId ? (
						<div className="flex flex-col h-full overflow-y-auto">
							{/* Phones show only the composer; the quoted message is already in the editor. */}
							<div className="flex flex-col h-full md:h-auto md:min-h-[520px] md:shrink-0">
								<ComposePanel />
							</div>
							<div className="hidden md:block border-t border-kumo-line">
								<EmailPanel key={selectedEmailId} emailId={selectedEmailId} onNavigate={onNavigate} />
							</div>
						</div>
					) : selectedEmailId ? (
						<EmailPanel key={selectedEmailId} emailId={selectedEmailId} onNavigate={onNavigate} />
					) : null}
				</div>
			)}
		</div>
	);
}
