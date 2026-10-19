// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Dialog, Input } from "@cloudflare/kumo";
import {
	ArchiveIcon, CaretDownIcon, CaretRightIcon, FileIcon, FolderIcon,
	GearSixIcon, PaperPlaneTiltIcon, PencilSimpleIcon, PlusIcon, ShieldWarningIcon,
	TrashIcon, TrayIcon, ClockCounterClockwiseIcon, EnvelopeSimpleIcon, XIcon, CaretLeftIcon, RobotIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Folders } from "shared/folders";
import { useCreateFolder, useFolders } from "~/queries/folders";
import { useAiEnabled, useMailboxes } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";
import { queryKeys } from "~/queries/keys";
import api from "~/services/api";
import type { Folder, Mailbox } from "~/types";
import ThemeToggle from "~/components/ThemeToggle";

const primaryFolders = [
	{ id: Folders.INBOX, label: "Inbox", icon: TrayIcon },
	{ id: Folders.DRAFT, label: "Drafts", icon: FileIcon },
	{ id: Folders.SENT, label: "Sent", icon: PaperPlaneTiltIcon },
	{ id: Folders.ARCHIVE, label: "Archive", icon: ArchiveIcon },
	{ id: Folders.TRASH, label: "Deleted", icon: TrashIcon },
	{ id: Folders.SPAM, label: "Junk", icon: ShieldWarningIcon },
	{ id: "activity", label: "Activity", icon: ClockCounterClockwiseIcon },
];
const systemIds = new Set(primaryFolders.map((folder) => folder.id));

function FolderItem({ to, label, icon: Icon, count, inset = false }: {
	to: string; label: string; icon: typeof TrayIcon; count?: number; inset?: boolean;
}) {
	const { closeSidebar } = useUIStore();
	const location = useLocation();
	const target = to.split("?")[0];
	const targetParams = new URLSearchParams(to.split("?")[1]);
	const currentParams = new URLSearchParams(location.search);
	const selected = target === "/" ? location.pathname === "/" && (currentParams.get("folder") || "inbox") === targetParams.get("folder") : location.pathname === target;
	return <Link to={to} onClick={closeSidebar} aria-current={selected ? "page" : undefined}
		className={`mail-folder ${inset ? "mail-folder--inset" : ""} ${selected ? "is-active" : ""}`}>
		<Icon size={22} weight={selected ? "fill" : "regular"} className="shrink-0" />
		<span className="min-w-0 flex-1 truncate">{label}</span>
		{Boolean(count) && <span className="mail-folder-count">{count}</span>}
	</Link>;
}

function AccountGroup({ mailbox, initiallyOpen, loadFolders }: { mailbox: Mailbox; initiallyOpen: boolean; loadFolders: boolean }) {
	const [open, setOpen] = useState(initiallyOpen);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newFolder, setNewFolder] = useState("");
	const { data: folders = [] } = useFolders(mailbox.id, loadFolders);
	const createFolder = useCreateFolder();
	useEffect(() => { if (initiallyOpen) setOpen(true); }, [initiallyOpen]);
	const base = `/mailbox/${encodeURIComponent(mailbox.id)}`;
	return <div className="mt-1">
		<button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}
			className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold text-kumo-default hover:bg-kumo-tint">
			{open ? <CaretDownIcon size={14} /> : <CaretRightIcon size={14} />}
			<span className="min-w-0 flex-1 truncate" title={mailbox.email}>{mailbox.email}</span>{mailbox.retired && <span className="text-[10px] font-normal text-kumo-subtle">Retired</span>}
		</button>
		{open && <div className="space-y-0.5">
			{primaryFolders.map(({ id, label, icon }) => <FolderItem key={id} to={`${base}/emails/${id}`} label={label} icon={icon} count={folders.find((folder) => folder.id === id)?.unreadCount} inset />)}
			{folders.filter((folder) => !systemIds.has(folder.id)).map((folder) => <FolderItem key={folder.id} to={`${base}/emails/${encodeURIComponent(folder.id)}`} label={folder.name} icon={FolderIcon} count={folder.unreadCount} inset />)}
			<button type="button" onClick={() => setIsCreateOpen(true)} className="ml-6 flex items-center gap-2 px-3 py-1.5 text-xs text-kumo-subtle hover:text-kumo-default"><PlusIcon size={14} />New folder</button>
			<FolderItem to={`/settings?section=accounts&account=${encodeURIComponent(mailbox.id)}`} label="Preferences" icon={GearSixIcon} inset />
		</div>}
		<Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}><Dialog size="sm" className="p-6"><Dialog.Title className="mb-4 text-base font-semibold">New folder for {mailbox.email}</Dialog.Title><form onSubmit={(event) => { event.preventDefault(); if (!newFolder.trim()) return; createFolder.mutate({ mailboxId: mailbox.id, name: newFolder.trim() }); setNewFolder(""); setIsCreateOpen(false); }} className="space-y-4"><Input label="Folder name" value={newFolder} onChange={(event) => setNewFolder(event.target.value)} required /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setIsCreateOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={!newFolder.trim()}>Create</Button></div></form></Dialog></Dialog.Root>
	</div>;
}

export default function Sidebar() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const location = useLocation();
	const loadFolders = location.pathname !== "/settings";
	const { data: mailboxes = [] } = useMailboxes();
	const composeMailbox = mailboxId ? mailboxes.find((mailbox) => mailbox.id === mailboxId && !mailbox.retired) : mailboxes.find((mailbox) => !mailbox.retired);
	const folderQueries = useQueries({ queries: mailboxes.map((mailbox) => ({ queryKey: queryKeys.folders.list(mailbox.id), queryFn: () => api.listFolders(mailbox.id) as Promise<Folder[]>, enabled: loadFolders, refetchInterval: loadFolders ? 30_000 : false })) });
	const allUnread = new Map<string, number>();
	for (const query of folderQueries) for (const folder of query.data ?? []) allUnread.set(folder.id, (allUnread.get(folder.id) ?? 0) + folder.unreadCount);
	const navigate = useNavigate();
	const { closeSidebar, isDesktopSidebarCollapsed, toggleDesktopSidebar, openAgentPanel } = useUIStore();
	const aiEnabled = useAiEnabled();
	const openAssistant = () => {
		openAgentPanel();
		// Settings has no assistant; open it over All inboxes.
		if (!mailboxId && location.pathname !== "/") navigate("/");
	};
	return <aside className="mail-sidebar flex h-full w-full shrink-0 flex-col">
		<div className="flex min-h-20 items-center gap-3 px-6">
			<EnvelopeSimpleIcon size={30} className="text-kumo-link" />
			<button type="button" onClick={() => { navigate("/"); closeSidebar(); }} className="text-left text-2xl font-medium tracking-tight text-kumo-default">Mail</button>
			<button type="button" onClick={closeSidebar} className="mail-icon-button ml-auto md:hidden" aria-label="Close navigation"><XIcon size={22} /></button>
			<button type="button" onClick={toggleDesktopSidebar} className="mail-icon-button ml-auto hidden md:inline-flex" aria-label={isDesktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}><CaretLeftIcon size={20} /></button>
		</div>
		<div className="hidden px-4 pb-5 pt-1 md:block">
			<Button variant="ghost" icon={<PencilSimpleIcon size={24} />} className="mail-compose" disabled={!composeMailbox} onClick={() => {
				if (mailboxId && composeMailbox) useUIStore.getState().startCompose();
				else if (composeMailbox && location.pathname === "/") useUIStore.getState().startCompose();
				else if (composeMailbox) navigate(`/mailbox/${encodeURIComponent(composeMailbox.id)}/emails/inbox?compose=true`);
			}}>Compose</Button>
		</div>
		<nav className="flex-1 overflow-y-auto px-2 pb-5" aria-label="Mail folders">
			{aiEnabled && <button type="button" onClick={openAssistant} className="mail-folder w-full text-left"><RobotIcon size={22} className="shrink-0" /><span className="min-w-0 flex-1 truncate">AI Assistant</span></button>}
			<div className="mb-3 border-b border-kumo-line pb-3"><FolderItem to="/" label="All inboxes" icon={EnvelopeSimpleIcon} count={allUnread.get(Folders.INBOX)} /></div>
			{primaryFolders.map(({ id, label, icon }) => <FolderItem key={id} to={`/?folder=${id}`} label={label} icon={icon} count={allUnread.get(id)} />)}
			<div className="my-3 border-t border-kumo-line" />
			<div className="px-5 py-3 text-xs font-medium text-kumo-subtle">Accounts</div>
			{mailboxes.map((mailbox) => <AccountGroup key={mailbox.id} mailbox={mailbox} initiallyOpen={mailbox.id === (mailboxId || mailboxes[0]?.id)} loadFolders={loadFolders} />)}
		</nav>
		<div className="flex items-center gap-1 border-t border-kumo-line px-2 py-3"><div className="min-w-0 flex-1"><FolderItem to="/settings" label="Settings" icon={GearSixIcon} /></div><ThemeToggle /></div>
	</aside>;
}
