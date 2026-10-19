// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Tooltip } from "@cloudflare/kumo";
import { ListIcon, MagnifyingGlassIcon, RobotIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import AdvancedSearch from "~/components/AdvancedSearch";
import AccountSwitcher from "~/components/AccountSwitcher";
import { useUIStore } from "~/hooks/useUIStore";
import { useAiEnabled } from "~/queries/mailboxes";

export default function Header() {
	const [searchQuery, setSearchQuery] = useState("");
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const aiEnabled = useAiEnabled();
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams, setSearchParams] = useSearchParams();
	const { toggleSidebar, isSidebarOpen, toggleDesktopSidebar, isDesktopSidebarCollapsed, toggleAgentPanel, isAgentPanelOpen } = useUIStore();
	const urlQuery = searchParams.get("q") || "";

	useEffect(() => { setSearchQuery(urlQuery); }, [urlQuery, location.pathname]);

	const performSearch = (query: string) => {
		setSearchQuery(query);
		if (mailboxId) {
			navigate(`/mailbox/${encodeURIComponent(mailboxId)}/search?q=${encodeURIComponent(query)}`);
		} else {
			setSearchParams((params) => { params.set("q", query); return params; });
		}
	};
	const clearSearch = () => {
		setSearchQuery("");
		if (mailboxId && location.pathname.includes("/search")) {
			navigate(`/mailbox/${encodeURIComponent(mailboxId)}/emails/inbox`);
		} else if (!mailboxId) {
			setSearchParams((params) => { params.delete("q"); params.delete("sort"); return params; });
		}
	};

	return (
		<header className="mail-header">
			<Button variant="ghost" shape="square" icon={<ListIcon size={24} />} onClick={toggleSidebar} aria-label="Open navigation" aria-expanded={isSidebarOpen} aria-controls="mail-navigation" className="mail-icon-button md:hidden" />
			<Button variant="ghost" shape="square" icon={<ListIcon size={24} />} onClick={toggleDesktopSidebar} aria-label={isDesktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!isDesktopSidebarCollapsed} className="mail-icon-button hidden md:inline-flex" />
			<div className="mail-search">
				<form role="search" className="flex min-w-0 flex-1 items-center" onSubmit={(event) => { event.preventDefault(); if (searchQuery.trim()) performSearch(searchQuery.trim()); }}>
					<button type="submit" className="mail-icon-button hidden sm:inline-flex" aria-label="Search"><MagnifyingGlassIcon size={22} /></button>
					<input type="search" enterKeyHint="search" aria-label={mailboxId ? "Search emails" : "Search all accounts"} placeholder="Search in emails" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); clearSearch(); event.currentTarget.blur(); } }} className="mail-search-input" />
					{searchQuery && <button type="button" className="mail-icon-button" onClick={clearSearch} aria-label="Clear search"><XIcon size={20} /></button>}
				</form>
				<AdvancedSearch compact mailboxId={mailboxId} query={searchQuery} onApply={performSearch} />
			</div>
			<div className="mail-header-actions">
				{mailboxId && aiEnabled && <Tooltip content={isAgentPanelOpen ? "Hide assistant" : "Show assistant"} side="bottom" asChild><Button variant={isAgentPanelOpen ? "secondary" : "ghost"} shape="square" icon={<RobotIcon size={22} />} onClick={toggleAgentPanel} aria-label="Toggle agent panel" className="mail-icon-button" /></Tooltip>}
				<AccountSwitcher />
			</div>
		</header>
	);
}
