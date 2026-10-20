import { useSyncExternalStore, type CSSProperties } from "react";
import AgentSidebar from "~/components/AgentSidebar";
import { useBackToClose } from "~/hooks/useBackToClose";
import { useResizableWidth } from "~/hooks/useResizableWidth";
import { useUIStore } from "~/hooks/useUIStore";
import { useAiEnabled } from "~/queries/mailboxes";

// Below lg the agent opens as a full-screen sheet instead of a side panel.
const NARROW = "(max-width: 1023px)";
const subscribeNarrow = (onChange: () => void) => {
	const query = window.matchMedia(NARROW);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
};

export default function AgentSheet({ mailboxId, onMailboxChange }: { mailboxId?: string; onMailboxChange?: (id: string) => void }) {
	const aiEnabled = useAiEnabled();
	const { isAgentPanelOpen, isComposing, toggleAgentPanel } = useUIStore();
	const isNarrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
	const [width, resizeHandle] = useResizableWidth("flarebox-agent-width", 380, 300, 720, "left", "Resize assistant");
	const open = aiEnabled && isAgentPanelOpen && Boolean(mailboxId);
	// On phones the sheet is a layer: Back closes it. A draft opened from the chat sits above it.
	useBackToClose(isNarrow && open ? 1 : 0, () => { if (useUIStore.getState().isAgentPanelOpen) toggleAgentPanel(); });
	if (!open || !mailboxId) return null;
	return (
		<div className={`agent-sheet fixed inset-0 z-40 flex-col overflow-hidden bg-kumo-base lg:relative lg:z-auto lg:flex lg:w-[var(--agent-width)] lg:shrink-0 lg:border-l lg:border-kumo-line ${isComposing ? "hidden" : "flex"}`} style={{ "--agent-width": `${width}px` } as CSSProperties}>
			{resizeHandle}
			<AgentSidebar mailboxId={mailboxId} onClose={toggleAgentPanel} onMailboxChange={onMailboxChange} />
		</div>
	);
}
