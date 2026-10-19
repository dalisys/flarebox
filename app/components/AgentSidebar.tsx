// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Loader } from "@cloudflare/kumo";
import { ArrowLeftIcon, PlugsIcon, RobotIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useMailbox, useMailboxes } from "~/queries/mailboxes";
import MCPPanel from "./MCPPanel";

function LazyAgentPanel({ mailboxId }: { mailboxId: string }) {
	const [AgentChat, setAgentChat] = useState<React.ComponentType<{ mailboxId: string }> | null>(
		null,
	);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		import("~/components/AgentPanel").then((mod) => {
			setAgentChat(() => mod.default);
		}).catch((err) => {
			console.error("Failed to load AgentPanel:", err);
			setLoadError("Failed to load agent panel");
		});
	}, []);

	if (loadError) {
		return (
			<div className="flex items-center justify-center h-full">
				<span className="text-xs text-kumo-error">{loadError}</span>
			</div>
		);
	}
	if (!AgentChat) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-2">
				<Loader size="base" />
				<span className="text-xs text-kumo-subtle">Loading agent...</span>
			</div>
		);
	}
	return <AgentChat mailboxId={mailboxId} />;
}

export default function AgentSidebar({ mailboxId, onClose, onMailboxChange }: {
	mailboxId: string;
	onClose?: () => void;
	/** Set in All inboxes: shows an account picker. */
	onMailboxChange?: (id: string) => void;
}) {
	const [activeTab, setActiveTab] = useState<"agent" | "mcp">("agent");
	const { data: mailbox } = useMailbox(mailboxId);
	const { data: mailboxes = [] } = useMailboxes();

	return (
		<div className="flex flex-col h-full">
			{/* Tab bar */}
			<div className="agent-sheet-tabs flex items-center border-b border-kumo-line shrink-0">
				{onClose && <button type="button" onClick={onClose} aria-label="Close assistant" className="mail-icon-button ml-1 lg:hidden"><ArrowLeftIcon size={24} /></button>}
				<button
					type="button"
					onClick={() => setActiveTab("agent")}
					className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 bg-transparent cursor-pointer ${
						activeTab === "agent"
							? "border-kumo-brand text-kumo-default"
							: "border-transparent text-kumo-subtle hover:text-kumo-default"
					}`}
				>
					<RobotIcon size={14} weight={activeTab === "agent" ? "fill" : "regular"} />
					Agent
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("mcp")}
					className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 bg-transparent cursor-pointer ${
						activeTab === "mcp"
							? "border-kumo-brand text-kumo-default"
							: "border-transparent text-kumo-subtle hover:text-kumo-default"
					}`}
				>
					<PlugsIcon size={14} weight={activeTab === "mcp" ? "fill" : "regular"} />
					MCP
				</button>
			</div>

			{onMailboxChange && mailboxes.length > 1 && <label className="agent-account flex shrink-0 items-center gap-2 border-b border-kumo-line px-3 py-2 text-xs text-kumo-subtle">
				<span className="shrink-0">Account</span>
				<select aria-label="Account for the assistant" value={mailboxId} onChange={(event) => onMailboxChange(event.target.value)} className="min-w-0 flex-1 truncate rounded-md border border-kumo-line bg-kumo-base px-2 py-1.5 text-sm text-kumo-default">
					{mailboxes.filter((item) => !item.retired).map((item) => <option key={item.id} value={item.id}>{item.email}</option>)}
				</select>
			</label>}

			{/* Tab content — keep agent mounted so chat isn't lost */}
			<div className="agent-sheet-body flex-1 min-h-0 overflow-hidden">
				<div className={activeTab === "agent" ? "h-full" : "hidden"}>
					{mailbox?.settings?.agentEnabled === false ? (
						<div className="p-5 text-sm text-kumo-subtle">AI assistant is off for this mailbox. You can turn it back on in Settings.</div>
					) : mailbox ? <LazyAgentPanel mailboxId={mailboxId} /> : <Loader size="base" />}
				</div>
				{activeTab === "mcp" && <MCPPanel />}
			</div>
		</div>
	);
}
