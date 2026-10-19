// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Loader } from "@cloudflare/kumo";
import { ArrowLeftIcon, GearSixIcon, GlobeSimpleIcon, ListIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import AccountSettingsPanel from "~/components/AccountSettingsPanel";
import DomainSettingsPanel from "~/components/DomainSettingsPanel";
import Sidebar from "~/components/Sidebar";
import PushToggle from "~/components/PushToggle";
import ThemeToggle from "~/components/ThemeToggle";
import { useUIStore } from "~/hooks/useUIStore";
import { queryKeys } from "~/queries/keys";
import { useMailboxes } from "~/queries/mailboxes";
import api from "~/services/api";

export function meta() { return [{ title: "Settings · Flarebox" }]; }

export default function ManageSettingsRoute() {
	const { data: mailboxes = [], isPending: mailboxesPending, isError: mailboxesError, refetch: retryMailboxes } = useMailboxes({ retry: false, timeoutMs: 10_000 });
	const { data: config, isPending: configPending, isError: configError, refetch: retryConfig } = useQuery({ queryKey: queryKeys.config, queryFn: ({ signal }) => api.getConfig(AbortSignal.any([signal, AbortSignal.timeout(10_000)])), staleTime: Infinity, retry: false });
	const queryClient = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();
	const [newEmail, setNewEmail] = useState("");
	const [newName, setNewName] = useState("");
	const [newDomain, setNewDomain] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const { isSidebarOpen, closeSidebar, toggleSidebar, isDesktopSidebarCollapsed, toggleDesktopSidebar } = useUIStore();
	const domains = config?.domains ?? [];
	const section = searchParams.get("section") === "domains" ? "domains" : "accounts";
	const accountParam = searchParams.get("account");
	const domainParam = searchParams.get("domain");
	const account = accountParam === "new" ? undefined : mailboxes.find((item) => item.id === accountParam) ?? (!accountParam ? mailboxes[0] : undefined);
	const domain = domainParam === "new" ? undefined : domains.find((item) => item === domainParam) ?? (!domainParam ? domains[0] : undefined);

	const go = (next: Record<string, string>) => {
		setError(null);
		setNotice(null);
		setSearchParams(next);
	};

	const refresh = async (nextAccount?: string) => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.mailboxes.all }),
			queryClient.invalidateQueries({ queryKey: queryKeys.config }),
		]);
		if (nextAccount) setSearchParams({ section: "accounts", account: nextAccount });
		else if (accountParam) setSearchParams({ section: "accounts" });
	};

	const addAccount = async (event: FormEvent) => {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const email = newEmail.trim().toLowerCase();
			if (!domains.includes(email.split("@")[1])) throw new Error("Add this domain before creating an account.");
			const created = await api.createMailbox(email, newName.trim() || email.split("@")[0]);
			await refresh(email);
			setNewEmail("");
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
			await queryClient.invalidateQueries({ queryKey: queryKeys.config });
			setSearchParams({ section: "domains", domain: value });
			setNewDomain("");
			setNotice(`${value} was added. Review its Email Routing status below.`);
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add the domain."); }
		finally { setBusy(false); }
	};

	return <div className="flex h-dvh overflow-hidden bg-kumo-base">
		{isSidebarOpen && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={closeSidebar} role="presentation" />}
		<div className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform md:relative md:z-0 ${isDesktopSidebarCollapsed ? "md:hidden" : "md:translate-x-0"} ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}><Sidebar /></div>
		<div className="flex min-w-0 flex-1 flex-col">
			<header className="flex items-center gap-3 border-b border-kumo-line px-4 py-2.5 md:px-6"><Button variant="ghost" shape="square" size="sm" icon={<ListIcon size={20} />} onClick={toggleSidebar} aria-label="Toggle sidebar" className="md:hidden" /><Button variant="ghost" shape="square" size="sm" icon={<ListIcon size={20} />} onClick={toggleDesktopSidebar} aria-label={isDesktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="hidden md:inline-flex" /><GearSixIcon size={18} className="hidden text-kumo-subtle md:block" /><span className="text-sm font-semibold text-kumo-default">Settings</span><div className="ml-auto flex items-center gap-2"><PushToggle /><ThemeToggle /><Link to="/" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-kumo-default hover:bg-kumo-tint"><ArrowLeftIcon size={16} /> Inbox</Link></div></header>
			<main className="min-h-0 flex-1 overflow-y-auto"><div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-10">
				<div className="border-b border-kumo-line pb-5 md:pb-7"><h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-kumo-default">Settings</h1><p className="mt-2 text-sm text-kumo-subtle">Manage email addresses, domains, and mailbox preferences.</p></div>
				<div className="mt-5 flex gap-6 border-b border-kumo-line" role="tablist" aria-label="Settings sections"><button type="button" role="tab" aria-selected={section === "accounts"} onClick={() => go({ section: "accounts" })} className={`border-b-2 px-1 pb-3 text-sm font-medium ${section === "accounts" ? "border-kumo-default text-kumo-default" : "border-transparent text-kumo-subtle hover:text-kumo-default"}`}>Accounts <span className="ml-1 text-xs text-kumo-subtle">{mailboxes.length}</span></button><button type="button" role="tab" aria-selected={section === "domains"} onClick={() => go({ section: "domains" })} className={`border-b-2 px-1 pb-3 text-sm font-medium ${section === "domains" ? "border-kumo-default text-kumo-default" : "border-transparent text-kumo-subtle hover:text-kumo-default"}`}>Domains <span className="ml-1 text-xs text-kumo-subtle">{domains.length}</span></button></div>
				{notice && <p role="status" className="mt-5 rounded-md border border-kumo-line bg-kumo-recessed p-3 text-sm text-kumo-default">{notice}</p>}
				{error && <p role="alert" className="mt-5 rounded-md border border-red-300 p-3 text-sm text-red-600">{error}</p>}
				{mailboxesError || configError ? <div className="flex flex-col items-center gap-3 py-20 text-sm text-kumo-subtle"><p>Could not load Settings.</p><Button variant="secondary" size="sm" onClick={() => { if (mailboxesError) void retryMailboxes(); if (configError) void retryConfig(); }}>Try again</Button></div> : mailboxesPending || configPending ? <div className="flex justify-center py-20"><Loader size="lg" /></div> : <div className="grid gap-6 py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
					<aside aria-label={section === "accounts" ? "Accounts" : "Domains"} className="min-w-0"><h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-kumo-subtle">{section === "accounts" ? "Your accounts" : "Your domains"}</h2>
							<select aria-label={section === "accounts" ? "Choose account" : "Choose domain"} className="block w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2.5 text-sm text-kumo-default lg:hidden" value={section === "accounts" ? (accountParam === "new" ? "new" : account?.id ?? "") : (domainParam === "new" ? "new" : domain ?? "")} onChange={(event) => go(section === "accounts" ? { section, account: event.target.value } : { section, domain: event.target.value })}>
								{section === "accounts" ? mailboxes.map((item) => <option key={item.id} value={item.id}>{item.email}{item.retired ? " (Retired)" : ""}</option>) : domains.map((item) => <option key={item} value={item}>{item}</option>)}
								<option value="new">{section === "accounts" ? "+ Add account" : "+ Add domain"}</option>
							</select>
							<div className="hidden lg:block lg:space-y-1">
						{section === "accounts" ? <>{mailboxes.map((item) => <button key={item.id} type="button" onClick={() => go({ section, account: item.id })} className={`w-full min-w-44 truncate rounded-md px-3 py-2.5 text-left text-sm lg:min-w-0 ${account?.id === item.id && accountParam !== "new" ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`} title={item.email}>{item.email}{item.retired && <span className="ml-2 text-xs text-kumo-subtle">Retired</span>}</button>)}<button type="button" onClick={() => go({ section, account: "new" })} className={`w-full min-w-36 rounded-md px-3 py-2.5 text-left text-sm ${accountParam === "new" ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}>+ Add account</button></> : <>{domains.map((item) => <button key={item} type="button" onClick={() => go({ section, domain: item })} className={`w-full min-w-36 truncate rounded-md px-3 py-2.5 text-left text-sm lg:min-w-0 ${domain === item && domainParam !== "new" ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}>{item}</button>)}<button type="button" onClick={() => go({ section, domain: "new" })} className={`w-full min-w-36 rounded-md px-3 py-2.5 text-left text-sm ${domainParam === "new" ? "bg-kumo-fill font-semibold text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}>+ Add domain</button></>}
					</div></aside>
					<div className="min-w-0 max-w-3xl">
						{section === "accounts" && accountParam === "new" && <section className="space-y-6"><div className="border-b border-kumo-line pb-6"><div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-kumo-subtle"><PlusIcon size={15} /> Account</div><h2 className="text-2xl font-semibold tracking-tight text-kumo-default md:text-3xl">Add an account</h2><p className="mt-2 text-sm text-kumo-subtle">Create a mailbox for an address on one of your domains.</p></div><form onSubmit={addAccount} className="max-w-xl space-y-5 rounded-lg border border-kumo-line bg-kumo-recessed p-5"><Input label="Email address" type="email" placeholder="hello@example.com" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required /><Input label="Sender name" placeholder="Your name or team" value={newName} onChange={(event) => setNewName(event.target.value)} /><p className="text-xs text-kumo-subtle">Available domains: {domains.length ? domains.join(", ") : "Add a domain first"}</p><Button type="submit" variant="primary" disabled={busy || !domains.length}>Create account</Button></form></section>}
						{section === "accounts" && account && accountParam !== "new" && <AccountSettingsPanel key={account.id} mailbox={account} mailboxes={mailboxes} domains={domains} onChanged={refresh} onNotice={setNotice} />}
						{section === "accounts" && !account && accountParam !== "new" && <div className="py-12 text-sm text-kumo-subtle">No accounts yet. Add one to get started.</div>}
						{section === "domains" && domainParam === "new" && <section className="space-y-6"><div className="border-b border-kumo-line pb-6"><div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-kumo-subtle"><GlobeSimpleIcon size={15} /> Domain</div><h2 className="text-2xl font-semibold tracking-tight text-kumo-default md:text-3xl">Add a domain</h2><p className="mt-2 text-sm text-kumo-subtle">Add a domain or subdomain before creating its email addresses.</p></div><form onSubmit={addDomain} className="max-w-xl space-y-5 rounded-lg border border-kumo-line bg-kumo-recessed p-5"><Input label="Domain or subdomain" placeholder="example.com or mail.example.com" value={newDomain} onChange={(event) => setNewDomain(event.target.value)} required /><Button type="submit" variant="primary" disabled={busy}>Add domain</Button></form></section>}
						{section === "domains" && domain && domainParam !== "new" && <DomainSettingsPanel key={domain} domain={domain} mailboxes={mailboxes} onAdded={async (name) => { await queryClient.invalidateQueries({ queryKey: queryKeys.config }); setSearchParams({ section: "domains", domain: name }); }} onRemoved={async () => { await queryClient.invalidateQueries({ queryKey: queryKeys.config }); setSearchParams({ section: "domains" }); }} onNotice={setNotice} />}
						{section === "domains" && !domain && domainParam !== "new" && <div className="py-12 text-sm text-kumo-subtle">No domains yet. Add one to get started.</div>}
					</div>
				</div>}
			</div></main>
		</div>
	</div>;
}
