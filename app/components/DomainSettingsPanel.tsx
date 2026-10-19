import { Button, Input } from "@cloudflare/kumo";
import { CheckIcon, GlobeSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { AccountLabel, RoutingDot } from "~/components/AccountMarks";
import { queryKeys } from "~/queries/keys";
import { useAddressStatus } from "~/queries/mailboxes";
import api, { type CatchAllStatus, type RoutingStatus } from "~/services/api";
import type { Mailbox } from "~/types";

export default function DomainSettingsPanel({ domain, mailboxes, sendProvider, onRemoved, onAdded, onNotice }: {
	domain: string;
	sendProvider?: "resend" | "cloudflare";
	mailboxes: Mailbox[];
	onRemoved: () => Promise<void>;
	onAdded: (domain: string) => Promise<void>;
	onNotice: (message: string) => void;
}) {
	const [subdomain, setSubdomain] = useState("");
	const [routing, setRouting] = useState<RoutingStatus | null>(null);
	const [catchAll, setCatchAll] = useState<CatchAllStatus | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [feedback, setFeedback] = useState<string | null>(null);
	const addresses = mailboxes.filter((mailbox) => mailbox.email.endsWith(`@${domain}`));
	const liveAddresses = addresses.filter((mailbox) => !mailbox.retired);
	const addressStatus = useAddressStatus();
	const queryClient = useQueryClient();
	const addAddressUrl = `/settings?section=addresses&account=new&domain=${encodeURIComponent(domain)}`;
	const steps = [
		{ label: "Domain added", done: true },
		{ label: "Email Routing on", done: Boolean(routing?.available && routing.enabled) },
		{ label: "First address created", done: liveAddresses.length > 0 },
	];
	const nextStep = steps.findIndex((step) => !step.done);

	useEffect(() => {
		let active = true;
		setRouting(null);
		setCatchAll(null);
		setError(null);
		setFeedback(null);
		setBusy(true);
		void Promise.allSettled([api.getDomainRouting(domain), api.getCatchAll(domain)]).then(([routingResult, catchAllResult]) => {
			if (!active) return;
			if (routingResult.status === "fulfilled") setRouting(routingResult.value);
			if (catchAllResult.status === "fulfilled") setCatchAll(catchAllResult.value);
			const failed = [routingResult, catchAllResult].find((result) => result.status === "rejected");
			if (failed?.status === "rejected") setError(failed.reason instanceof Error ? failed.reason.message : "Could not check domain settings.");
			setBusy(false);
		});
		return () => { active = false; };
	}, [domain]);

	const act = async (operation: () => Promise<void>) => {
		setBusy(true);
		setError(null);
		setFeedback(null);
		try {
			await operation();
			void queryClient.invalidateQueries({ queryKey: queryKeys.addressStatus(domain) });
		}
		catch (cause) { setError(cause instanceof Error ? cause.message : "The change could not be saved."); }
		finally { setBusy(false); }
	};

	const addSubdomain = (event: FormEvent) => {
		event.preventDefault();
		void act(async () => {
			const prefix = subdomain.trim().toLowerCase();
			if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(prefix)) throw new Error("Enter a valid subdomain, such as mail.");
			const name = `${prefix}.${domain}`;
			await api.addDomain(name);
			await onAdded(name);
			onNotice(`${name} was added. Enable Email Routing, then create accounts ending in @${name}. Existing accounts keep their original addresses.`);
		});
	};

	return <div className="space-y-8">
		<div className="border-b border-kumo-line pb-6"><div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-kumo-subtle"><GlobeSimpleIcon size={15} /> Domain</div><h2 className="break-all text-2xl font-semibold tracking-tight text-kumo-default md:text-3xl">{domain}</h2><p className="mt-2 text-sm text-kumo-subtle">{addresses.length} {addresses.length === 1 ? "account" : "accounts"} ending in @{domain}</p></div>
		{error && <p role="alert" className="rounded-md border border-red-300 p-3 text-sm text-red-600">{error}</p>}
		{feedback && <p role="status" className="rounded-md border border-kumo-line p-3 text-sm text-kumo-default">{feedback}</p>}
		{routing && nextStep !== -1 && <section className="rounded-lg border border-kumo-line bg-kumo-recessed p-5"><h3 className="text-sm font-semibold text-kumo-default">Set up {domain}</h3><ol className="mt-4 space-y-3">{steps.map((step, index) => <li key={step.label} className={`flex flex-wrap items-center gap-3 text-sm ${index === nextStep ? "font-semibold text-kumo-default" : "text-kumo-subtle"}`}><span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs ${step.done ? "border-green-600 bg-green-600 text-white" : index === nextStep ? "border-kumo-default" : "border-kumo-line"}`}>{step.done ? <CheckIcon size={13} weight="bold" /> : index + 1}</span>{step.label}{index === nextStep && index === 1 && <Button size="sm" variant="secondary" onClick={() => document.getElementById("email-routing")?.scrollIntoView({ behavior: "smooth" })}>Go to Email Routing</Button>}{index === nextStep && index === 2 && <Link to={addAddressUrl} className="inline-flex items-center gap-1 rounded-md border border-kumo-line bg-kumo-base px-2.5 py-1 text-sm font-normal text-kumo-default hover:bg-kumo-tint"><PlusIcon size={14} /> Add address</Link>}</li>)}</ol></section>}
		<section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-lg font-semibold text-kumo-default">Addresses</h3><p className="mt-1 text-sm text-kumo-subtle">Accounts that receive mail at @{domain}.</p></div><Link to={addAddressUrl} className="inline-flex items-center gap-1 rounded-md border border-kumo-line px-3 py-1.5 text-sm text-kumo-default hover:bg-kumo-tint"><PlusIcon size={15} /> Add address</Link></div>{liveAddresses.length ? <ul className="divide-y divide-kumo-line rounded-lg border border-kumo-line">{liveAddresses.map((mailbox) => <li key={mailbox.id}><Link to={`/settings?section=addresses&account=${encodeURIComponent(mailbox.id)}`} className="flex items-center gap-3 px-4 py-3 text-sm text-kumo-default hover:bg-kumo-tint"><AccountLabel email={mailbox.email} /><span className="ml-auto"><RoutingDot status={addressStatus(mailbox.email)} withLabel /></span></Link></li>)}</ul> : <p className="text-sm text-kumo-subtle">No addresses on this domain yet.</p>}</section>
		{(!routing?.zoneName || routing.zoneName === domain) && <section className="space-y-4"><div><h3 className="text-lg font-semibold text-kumo-default">Add a subdomain</h3><p className="mt-1 text-sm text-kumo-subtle">Optional: use this only for addresses such as hello@mail.{domain}. For hello@{domain}, enable Email Routing below.</p></div><form onSubmit={addSubdomain} className="space-y-4 rounded-lg border border-kumo-line bg-kumo-recessed p-5"><Input label="Subdomain" placeholder="mail" value={subdomain} onChange={(event) => setSubdomain(event.target.value)} required disabled={busy} /><p className="break-all text-sm text-kumo-subtle">New address suffix: @{subdomain.trim().toLowerCase() || "mail"}.{domain}</p><Button type="submit" variant="secondary" disabled={busy || !subdomain.trim()}>Add subdomain</Button></form></section>}
		<section id="email-routing" className="scroll-mt-6 space-y-4"><div><h3 className="text-lg font-semibold text-kumo-default">Email Routing</h3><p className="mt-1 text-sm text-kumo-subtle">Connect this domain to the inbox and keep its address rules in sync.</p></div><div className="rounded-lg border border-kumo-line bg-kumo-recessed p-5">
			<div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-medium text-kumo-default">Routing status</p><p className="mt-1 text-sm text-kumo-subtle">{busy && !routing ? "Checking Cloudflare…" : routing?.available ? routing.enabled ? "Ready to receive" : routing.status && routing.status !== "unconfigured" ? "Setup incomplete" : "Not enabled" : routing?.reason ?? "Unavailable"}</p></div>{routing?.available && routing.enabled && <span className="rounded-full border border-kumo-line bg-kumo-base px-2.5 py-1 text-xs font-medium text-kumo-default">Connected</span>}</div>
			{routing?.available && !routing.enabled && <p className="mt-4 text-sm text-kumo-subtle">Mail to @{domain} cannot arrive until this domain’s DNS setup is complete. Accounts on a subdomain use a different address suffix.</p>}
			{routing?.mxRecords?.length ? <p className="mt-4 text-xs text-kumo-subtle">MX: {routing.mxRecords.map((record) => `${record.content} (${record.priority ?? "—"})`).join(", ")}</p> : null}
			{routing?.spfRecords?.length ? <p className="mt-2 text-xs text-kumo-subtle">SPF: {routing.spfRecords.join(", ")}</p> : null}
			{routing?.available && !routing.enabled && !routing.canEnable && <p className="mt-4 text-sm text-kumo-subtle">Existing mail records need review in Cloudflare before this app can enable routing.</p>}
			<div className="mt-5 flex flex-wrap gap-2">{routing?.available && !routing.enabled && routing.canEnable && <Button variant="primary" disabled={busy} onClick={() => void act(async () => { const status = await api.enableDomainRouting(domain); setRouting(status); if (!status.enabled) { setFeedback("Cloudflare has saved the DNS setup. Routing is not ready yet; check again after the records propagate."); return; } const { results } = await api.syncDomainRules(domain); setFeedback(results.length ? `Email Routing is ready. ${results.filter((result) => result.routing === "active").length} of ${results.length} account rules are active.` : `Email Routing is ready. Create an account ending in @${domain} to receive mail.`); })}>{routing.status && routing.status !== "unconfigured" ? "Complete Email Routing setup" : "Enable Email Routing"}</Button>}{routing?.available && routing.enabled && <Button variant="secondary" disabled={busy} onClick={() => void act(async () => { const { results } = await api.syncDomainRules(domain); setFeedback(results.length ? `${results.filter((result) => result.routing === "active").length} of ${results.length} address rules are active.` : "No account rules to sync yet."); })}>Sync address rules</Button>}</div>
		</div></section>
		{sendProvider && <section className="space-y-4"><div><h3 className="text-lg font-semibold text-kumo-default">Sending</h3><p className="mt-1 text-sm text-kumo-subtle">Outgoing mail for all domains. Set by the RESEND_API_KEY Worker secret.</p></div><div className="rounded-lg border border-kumo-line bg-kumo-recessed p-5"><p className="text-sm font-medium text-kumo-default">{sendProvider === "resend" ? "Resend" : "Cloudflare Email Sending"}</p><p className="mt-1 text-sm text-kumo-subtle">{sendProvider === "resend" ? `Verify ${domain} in Resend before you send from it.` : "Add a RESEND_API_KEY secret to send through Resend instead."}</p></div></section>}
		<section className="space-y-4"><div><h3 className="text-lg font-semibold text-kumo-default">Catch-all</h3><p className="mt-1 text-sm text-kumo-subtle">See whether unlisted addresses are accepted and turn catch-all off.</p></div><div className="rounded-lg border border-kumo-line bg-kumo-recessed p-5"><div className="flex flex-wrap items-center justify-between gap-4"><p className="text-sm font-medium text-kumo-default">{catchAll?.available ? catchAll.enabled ? "On" : "Off" : catchAll?.reason ?? "Checking Cloudflare…"}</p>{catchAll?.available && catchAll.enabled && <Button variant="secondary" disabled={busy} onClick={() => void act(async () => { setCatchAll(await api.disableCatchAll(domain)); setFeedback("Catch-all is off. Only addresses with their own rules can receive mail."); })}>Turn off catch-all</Button>}</div></div></section>
		<section className="border-t border-kumo-line pt-7"><h3 className="text-lg font-semibold text-kumo-default">Remove domain from app</h3><p className="mt-1 max-w-xl text-sm text-kumo-subtle">Remove all accounts on this domain first. Removing it here does not change Cloudflare DNS or Email Routing.</p><Button className="mt-4" variant="secondary" disabled={busy || addresses.length > 0} onClick={() => void act(async () => { await api.removeDomain(domain); await onRemoved(); onNotice(`${domain} was removed from the app.`); })}>Remove domain</Button>{addresses.length > 0 && <p className="mt-2 text-xs text-kumo-subtle">{addresses.length} {addresses.length === 1 ? "account must" : "accounts must"} be removed first.</p>}</section>
	</div>;
}
