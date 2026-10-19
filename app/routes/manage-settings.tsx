// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Loader } from "@cloudflare/kumo";
import { ArrowLeftIcon, GearSixIcon, GlobeSimpleIcon, ListIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AccountLabel, RoutingDot } from "~/components/AccountMarks";
import AccountSettingsPanel from "~/components/AccountSettingsPanel";
import AiSettingsPanel from "~/components/AiSettingsPanel";
import NotificationSettingsPanel from "~/components/NotificationSettingsPanel";
import DomainSettingsPanel from "~/components/DomainSettingsPanel";
import Sidebar from "~/components/Sidebar";
import PushToggle from "~/components/PushToggle";
import ThemeToggle from "~/components/ThemeToggle";
import { useUIStore } from "~/hooks/useUIStore";
import { queryKeys } from "~/queries/keys";
import { useAddressStatus, useMailboxes } from "~/queries/mailboxes";
import api from "~/services/api";
import type { Mailbox } from "~/types";

export function meta() { return [{ title: "Settings · Flarebox" }]; }

export default function ManageSettingsRoute() {
	const { data: mailboxes = [], isPending: mailboxesPending, isError: mailboxesError, refetch: retryMailboxes } = useMailboxes({ retry: false, timeoutMs: 10_000 });
	const { data: config, isPending: configPending, isError: configError, refetch: retryConfig } = useQuery({ queryKey: queryKeys.config, queryFn: ({ signal }) => api.getConfig(AbortSignal.any([signal, AbortSignal.timeout(10_000)])), staleTime: Infinity, retry: false });
	const queryClient = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();
	const [newLocal, setNewLocal] = useState("");
	const [newName, setNewName] = useState("");
	const [newDomain, setNewDomain] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const { isSidebarOpen, closeSidebar, toggleSidebar, isDesktopSidebarCollapsed, toggleDesktopSidebar } = useUIStore();
	const addressStatus = useAddressStatus();
	const domains = config?.domains ?? [];
	const sectionParam = searchParams.get("section");
	// Old "accounts" and "domains" links land on the merged Addresses tab.
	const section = sectionParam === "notifications" ? "notifications" : sectionParam === "ai" && config?.aiEnabled ? "ai" : "addresses";
	const accountParam = searchParams.get("account");
	const domainParam = searchParams.get("domain");
	const domainOf = (email: string) => email.split("@")[1];
	const active = mailboxes.filter((item) => !item.retired);
	const retired = mailboxes.filter((item) => item.retired);
	const treeDomains = [...new Set([...domains, ...active.map((item) => domainOf(item.email))])];
	const addingAccount = accountParam === "new";
	const addingDomain = !accountParam && domainParam === "new";
	const newAccountDomain = domains.find((item) => item === domainParam) ?? domains[0] ?? "";
	const account = addingAccount ? undefined : mailboxes.find((item) => item.id === accountParam) ?? (!accountParam && !domainParam ? mailboxes[0] : undefined);
	const domain = accountParam || addingDomain ? undefined : treeDomains.find((item) => item === domainParam) ?? (!domainParam && !mailboxes.length ? treeDomains[0] : undefined);
	const selectedKey = addingAccount ? `new:${newAccountDomain}` : account ? `account:${account.id}` : addingDomain ? "new-domain" : domain ? `domain:${domain}` : "";

	const go = (next: Record<string, string>) => {
		setError(null);
		setNotice(null);
		setSearchParams(next);
	};

	const refresh = async (nextAccount?: string) => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes.all }),
			queryClient.invalidateQueries({ queryKey: queryKeys.config }),
			queryClient.invalidateQueries({ queryKey: ["address-status"] }),
		]);
		if (nextAccount) setSearchParams({ section: "addresses", account: nextAccount });
		else if (accountParam) setSearchParams({ section: "addresses" });
	};

	const addAccount = async (event: FormEvent) => {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const local = newLocal.trim().toLowerCase();
			if (!local || /[@\s]/.test(local)) throw new Error("Enter the part before the @, such as hello.");
			const email = `${local}@${newAccountDomain}`;
			const created = await api.createMailbox(email, newName.trim() || local);
			await refresh(email);
			setNewLocal("");
			setNewName("");
			setNotice(created.routing === "active" ? `${email} was created and its routing rule is active.` : `${email} was created. Set up its Cloudflare Email Routing rule before using it.`);
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the account."); }
		finally { setBusy(false); }
	};

	const addDomain = async (event: FormEvent) => {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const value = newDomain.trim().toLowerCase();
			await api.addDomain(value);
			await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.config }), queryClient.invalidateQueries({ queryKey: ["address-status"] })]);
			setSearchParams({ section: "addresses", domain: value });
			setNewDomain("");
			setNotice(`${value} was added. Review its Email Routing status below.`);
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add the domain."); }
		finally { setBusy(false); }
	};

	const rowClass = (selected: boolean, extra = "") => `flex w-full min-w-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${extra} ${selected ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`;
	const accountRow = (item: Mailbox, extra = "") => <button key={item.id} type="button" onClick={() => go({ section: "addresses", account: item.id })} className={rowClass(account?.id === item.id, extra)}><AccountLabel email={item.email} />{!item.retired && <span className="ml-auto"><RoutingDot status={addressStatus(item.email)} /></span>}</button>;

	return <div className="flex h-dvh overflow-hidden bg-kumo-base">
		{isSidebarOpen && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={closeSidebar} role="presentation" />}
		<div className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform md:relative md:z-0 ${isDesktopSidebarCollapsed ? "md:hidden" : "md:translate-x-0"} ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}><Sidebar /></div>
		<div className="flex min-w-0 flex-1 flex-col">
			<header className="flex items-center gap-3 border-b border-kumo-line px-4 py-2.5 md:px-6"><Button variant="ghost" shape="square" size="sm" icon={<ListIcon size={20} />} onClick={toggleSidebar} aria-label="Toggle sidebar" className="md:hidden" /><Button variant="ghost" shape="square" size="sm" icon={<ListIcon size={20} />} onClick={toggleDesktopSidebar} aria-label={isDesktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="hidden md:inline-flex" /><GearSixIcon size={18} className="hidden text-kumo-subtle md:block" /><span className="text-sm font-semibold text-kumo-default">Settings</span><div className="ml-auto flex items-center gap-2"><PushToggle /><ThemeToggle /><Link to="/" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-kumo-default hover:bg-kumo-tint"><ArrowLeftIcon size={16} /> Inbox</Link></div></header>
			<main className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-10">
				<div className="border-b border-kumo-line pb-5 md:pb-7"><h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-kumo-default">Settings</h1><p className="mt-2 text-sm text-kumo-subtle">Manage addresses, domains, AI, and notifications.</p></div>
				<div className="mt-5 flex gap-6 overflow-x-auto whitespace-nowrap border-b border-kumo-line" role="tablist" aria-label="Settings sections"><button type="button" role="tab" aria-selected={section === "addresses"} onClick={() => go({ section: "addresses" })} className={`border-b-2 px-1 pb-3 text-sm font-medium ${section === "addresses" ? "border-kumo-default text-kumo-default" : "border-transparent text-kumo-subtle hover:text-kumo-default"}`}>Addresses <span className="ml-1 text-xs text-kumo-subtle">{active.length}</span></button>{config?.aiEnabled && <button type="button" role="tab" aria-selected={section === "ai"} onClick={() => go({ section: "ai" })} className={`border-b-2 px-1 pb-3 text-sm font-medium ${section === "ai" ? "border-kumo-default text-kumo-default" : "border-transparent text-kumo-subtle hover:text-kumo-default"}`}>AI</button>}<button type="button" role="tab" aria-selected={section === "notifications"} onClick={() => go({ section: "notifications" })} className={`border-b-2 px-1 pb-3 text-sm font-medium ${section === "notifications" ? "border-kumo-default text-kumo-default" : "border-transparent text-kumo-subtle hover:text-kumo-default"}`}>Notifications</button></div>
				{notice && <p role="status" className="mt-5 rounded-md border border-kumo-line bg-kumo-recessed p-3 text-sm text-kumo-default">{notice}</p>}
				{error && <p role="alert" className="mt-5 rounded-md border border-red-300 p-3 text-sm text-red-600">{error}</p>}
				{mailboxesError || configError ? <div className="flex flex-col items-center gap-3 py-20 text-sm text-kumo-subtle"><p>Could not load Settings.</p><Button variant="secondary" size="sm" onClick={() => { if (mailboxesError) void retryMailboxes(); if (configError) void retryConfig(); }}>Try again</Button></div> : mailboxesPending || configPending ? <div className="flex justify-center py-20"><Loader size="lg" /></div> : section === "ai" ? <AiSettingsPanel /> : section === "notifications" ? <NotificationSettingsPanel /> : <div className="grid gap-6 py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
					<aside aria-label="Addresses" className="min-w-0"><h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-kumo-subtle">Your addresses</h2>
						<select aria-label="Choose address or domain" className="block w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2.5 text-sm text-kumo-default lg:hidden" value={selectedKey} onChange={(event) => { const [kind, value = ""] = event.target.value.split(":"); go(kind === "account" ? { section: "addresses", account: value } : kind === "new" ? { section: "addresses", account: "new", domain: value } : { section: "addresses", domain: kind === "domain" ? value : "new" }); }}>
							{!selectedKey && <option value="">Choose…</option>}
							{treeDomains.map((item) => <optgroup key={item} label={item}><option value={`domain:${item}`}>{item} settings</option>{active.filter((mailbox) => domainOf(mailbox.email) === item).map((mailbox) => <option key={mailbox.id} value={`account:${mailbox.id}`}>{mailbox.email}</option>)}{domains.includes(item) && <option value={`new:${item}`}>+ Add address</option>}</optgroup>)}
							{retired.length > 0 && <optgroup label="Retired">{retired.map((mailbox) => <option key={mailbox.id} value={`account:${mailbox.id}`}>{mailbox.email}</option>)}</optgroup>}
							<option value="new-domain">+ Add domain</option>
						</select>
						<div className="hidden space-y-3 lg:block">
							{treeDomains.map((item) => <div key={item} className="space-y-0.5"><button type="button" onClick={() => go({ section: "addresses", domain: item })} className={rowClass(domain === item)} title={item}><GlobeSimpleIcon size={14} className="shrink-0 text-kumo-subtle" /><span className="truncate">{item}</span></button>{active.filter((mailbox) => domainOf(mailbox.email) === item).map((mailbox) => accountRow(mailbox, "pl-8"))}{domains.includes(item) && <button type="button" onClick={() => go({ section: "addresses", account: "new", domain: item })} className={rowClass(addingAccount && newAccountDomain === item, "pl-8")}>+ Add address</button>}</div>)}
							<button type="button" onClick={() => go({ section: "addresses", domain: "new" })} className={rowClass(addingDomain)}>+ Add domain</button>
							{retired.length > 0 && <details open={Boolean(account?.retired)} className="border-t border-kumo-line pt-2"><summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-kumo-subtle">Retired <span className="ml-1 font-normal">{retired.length}</span></summary><div className="space-y-0.5">{retired.map((mailbox) => accountRow(mailbox))}</div></details>}
						</div></aside>
					<div className="min-w-0 max-w-3xl">
						{addingAccount && <section className="space-y-6"><div className="border-b border-kumo-line pb-6"><div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-kumo-subtle"><PlusIcon size={15} /> Address</div><h2 className="text-2xl font-semibold tracking-tight text-kumo-default md:text-3xl">Add an address</h2><p className="mt-2 text-sm text-kumo-subtle">Create a mailbox for an address on one of your domains.</p></div><form onSubmit={addAccount} className="max-w-xl space-y-5 rounded-lg border border-kumo-line bg-kumo-recessed p-5"><div><label htmlFor="new-address-local" className="block text-sm font-medium text-kumo-default">Email address</label><div className="mt-2 flex items-center gap-2"><input id="new-address-local" className="min-w-0 flex-1 rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default" placeholder="hello" autoComplete="off" value={newLocal} onChange={(event) => setNewLocal(event.target.value)} required /><span className="text-sm text-kumo-subtle">@</span><select aria-label="Domain" className="min-w-0 max-w-[55%] rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default" value={newAccountDomain} onChange={(event) => go(event.target.value === "new" ? { section: "addresses", domain: "new" } : { section: "addresses", account: "new", domain: event.target.value })}>{!domains.length && <option value="">No domains yet</option>}{domains.map((item) => <option key={item} value={item}>{item}</option>)}<option value="new">+ Add domain…</option></select></div></div><Input label="Sender name" placeholder="Your name or team" value={newName} onChange={(event) => setNewName(event.target.value)} /><Button type="submit" variant="primary" disabled={busy || !newAccountDomain}>Create address</Button></form></section>}
						{account && <AccountSettingsPanel key={account.id} mailbox={account} mailboxes={mailboxes} domains={domains} onChanged={refresh} onNotice={setNotice} />}
						{addingDomain && <section className="space-y-6"><div className="border-b border-kumo-line pb-6"><div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-kumo-subtle"><GlobeSimpleIcon size={15} /> Domain</div><h2 className="text-2xl font-semibold tracking-tight text-kumo-default md:text-3xl">Add a domain</h2><p className="mt-2 text-sm text-kumo-subtle">Add a domain or subdomain before creating its email addresses.</p></div><form onSubmit={addDomain} className="max-w-xl space-y-5 rounded-lg border border-kumo-line bg-kumo-recessed p-5"><Input label="Domain or subdomain" placeholder="example.com or mail.example.com" value={newDomain} onChange={(event) => setNewDomain(event.target.value)} required /><Button type="submit" variant="primary" disabled={busy}>Add domain</Button></form></section>}
						{domain && <DomainSettingsPanel key={domain} domain={domain} mailboxes={mailboxes} sendProvider={config?.sendProvider} onAdded={async (name) => { await queryClient.invalidateQueries({ queryKey: queryKeys.config }); setSearchParams({ section: "addresses", domain: name }); }} onRemoved={async () => { await queryClient.invalidateQueries({ queryKey: queryKeys.config }); setSearchParams({ section: "addresses" }); }} onNotice={setNotice} />}
						{!addingAccount && !account && !addingDomain && !domain && <div className="py-12 text-sm text-kumo-subtle">{treeDomains.length ? "Choose an address or domain." : "No domains yet. Add a domain to get started."}</div>}
					</div>
				</div>}
			</div></main>
		</div>
	</div>;
}
