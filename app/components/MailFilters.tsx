// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Loader, Switch, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowUpIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useFolders } from "~/queries/folders";
import api from "~/services/api";
import type { FilterRule } from "~/types";

const CONDITIONS = [["from", "From contains"], ["to", "To contains"], ["subject", "Subject contains"], ["body", "Body contains"]] as const;
const selectClass = "mt-1.5 block min-h-11 w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-base sm:text-sm text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-ring";
const checkClass = "flex min-h-11 items-center gap-2 text-sm text-kumo-default";
const emptyRule = (): FilterRule => ({ id: crypto.randomUUID(), enabled: true, conditions: {}, actions: {} });

export default function MailFilters({ mailboxId }: { mailboxId: string }) {
	const toastManager = useKumoToastManager();
	const queryClient = useQueryClient();
	const queryKey = ["filters", mailboxId];
	const { data: rules, isError, refetch } = useQuery({ queryKey, queryFn: async () => (await api.getFilters(mailboxId)).rules, retry: false });
	const { data: folders = [] } = useFolders(mailboxId);
	const [editing, setEditing] = useState<FilterRule | null>(null);
	const [busy, setBusy] = useState(false);
	// The app calls the spam folder Junk.
	const folderName = (id: string) => (id === "spam" ? "Junk" : folders.find((f) => f.id === id)?.name) || (folders.length ? `${id} (missing folder, mail stays in Inbox)` : id);
	// Mail cannot be filtered into Sent or Drafts; Inbox is where it already goes.
	const targetFolders = folders.filter((f) => !["inbox", "sent", "draft", "snoozed", "scheduled"].includes(f.id));

	const save = async (next: FilterRule[], message: string) => {
		setBusy(true);
		try {
			queryClient.setQueryData(queryKey, (await api.saveFilters(mailboxId, next)).rules);
			toastManager.add({ title: message });
			return true;
		} catch (error) {
			toastManager.add({ title: (error as Error).message || "Could not save filters", variant: "error" });
			return false;
		} finally {
			setBusy(false);
		}
	};

	const applyNow = async (rule: FilterRule) => {
		if (!window.confirm("Run this filter on all mail in Inbox now?")) return;
		setBusy(true);
		try {
			const { matched } = await api.applyFilter(mailboxId, rule);
			await Promise.all([queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] }), queryClient.invalidateQueries({ queryKey: ["folders", mailboxId] })]);
			toastManager.add({ title: matched === 1 ? "1 message changed" : `${matched} messages changed` });
		} catch (error) {
			toastManager.add({ title: (error as Error).message || "Could not run filter", variant: "error" });
		} finally {
			setBusy(false);
		}
	};

	if (isError) return <div className="flex items-center gap-2 px-5 py-4"><p className="text-xs text-kumo-subtle">Could not load filters.</p><Button variant="ghost" size="sm" className="min-h-11" onClick={() => void refetch()}>Try again</Button></div>;
	if (!rules) return <div className="flex justify-center px-5 py-4"><Loader /></div>;

	if (editing) {
		const isNew = !rules.some((r) => r.id === editing.id);
		const setCondition = (key: keyof FilterRule["conditions"], value: string) => setEditing({ ...editing, conditions: { ...editing.conditions, [key]: value } });
		const setAction = (patch: Partial<FilterRule["actions"]>) => setEditing({ ...editing, actions: { ...editing.actions, ...patch } });
		const submit = async () => {
			const conditions = Object.fromEntries(Object.entries(editing.conditions).map(([k, v]) => [k, v?.trim()]).filter(([, v]) => v));
			const rule = { ...editing, conditions, actions: { folder: editing.actions.folder || undefined, markRead: editing.actions.markRead || undefined, star: editing.actions.star || undefined } };
			if (await save(isNew ? [...rules, rule] : rules.map((r) => (r.id === rule.id ? rule : r)), isNew ? "Filter added" : "Filter saved")) setEditing(null);
		};
		return <form className="space-y-4 px-5 py-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
			<div>
				<p className="text-sm font-medium text-kumo-default">When a new email matches all of these</p>
				<p className="mt-0.5 text-xs text-kumo-subtle">Leave a field empty to skip it. Case does not matter.</p>
			</div>
			{CONDITIONS.map(([key, label]) => <Input key={key} label={label} aria-label={label} className="min-h-11 text-base sm:text-sm" value={editing.conditions[key] || ""} maxLength={200} onChange={(e) => setCondition(key, e.target.value)} />)}
			<p className="text-sm font-medium text-kumo-default">Do this</p>
			<label className="block text-sm text-kumo-default">Move to folder
				<select className={selectClass} value={editing.actions.folder || ""} onChange={(e) => setAction({ folder: e.target.value })}>
					<option value="">Keep in Inbox</option>
					{targetFolders.map((f) => <option key={f.id} value={f.id}>{folderName(f.id)}</option>)}
				</select>
			</label>
			<label className={checkClass}><input type="checkbox" className="size-5" checked={!!editing.actions.markRead} onChange={(e) => setAction({ markRead: e.target.checked })} />Mark as read</label>
			<label className={checkClass}><input type="checkbox" className="size-5" checked={!!editing.actions.star} onChange={(e) => setAction({ star: e.target.checked })} />Star</label>
			<div className="flex flex-wrap justify-end gap-2">
				<Button className="min-h-11" variant="ghost" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button>
				<Button className="min-h-11" variant="primary" type="submit" loading={busy}>{isNew ? "Add filter" : "Save filter"}</Button>
			</div>
		</form>;
	}

	const describe = (rule: FilterRule) => {
		const when = CONDITIONS.filter(([key]) => rule.conditions[key]).map(([key, label]) => `${label.replace(" contains", "")} contains “${rule.conditions[key]}”`).join(" and ");
		const then = [rule.actions.folder && `move to ${folderName(rule.actions.folder)}`, rule.actions.markRead && "mark as read", rule.actions.star && "star"].filter(Boolean).join(", ");
		return { when, then };
	};
	const move = (index: number) => save(rules.map((r, i) => (i === index - 1 ? rules[index] : i === index ? rules[index - 1] : r)), "Filter order saved");

	return <div className="px-5 py-4">
		{rules.length === 0 ? <p className="text-xs text-kumo-subtle">No filters yet.</p> : (
			<ul className="divide-y divide-kumo-line rounded-md border border-kumo-line">
				{rules.map((rule, index) => {
					const { when, then } = describe(rule);
					return <li key={rule.id} className="space-y-2 px-3 py-3">
						<div className="flex items-start justify-between gap-3">
							<p className={`min-w-0 break-words text-sm ${rule.enabled ? "text-kumo-default" : "text-kumo-subtle"}`}>
								<span className="text-kumo-subtle">{index + 1}. If </span>{when}<span className="text-kumo-subtle"> then </span>{then}
							</p>
							<Switch aria-label="Filter on" checked={rule.enabled} disabled={busy} onCheckedChange={(enabled) => void save(rules.map((r) => (r.id === rule.id ? { ...r, enabled } : r)), enabled ? "Filter on" : "Filter off")} />
						</div>
						<div className="flex flex-wrap gap-1">
							<Button variant="ghost" size="sm" className="min-h-11" disabled={busy} onClick={() => setEditing(rule)}>Edit</Button>
							<Button variant="ghost" size="sm" className="min-h-11" disabled={busy} onClick={() => void applyNow(rule)}>Run on Inbox</Button>
							{index > 0 && <Button variant="ghost" size="sm" className="min-h-11" aria-label="Move up" icon={<ArrowUpIcon size={14} />} disabled={busy} onClick={() => void move(index)} />}
							<Button variant="ghost" size="sm" className="min-h-11" disabled={busy} onClick={() => { if (window.confirm("Delete this filter?")) void save(rules.filter((r) => r.id !== rule.id), "Filter deleted"); }}>Delete</Button>
						</div>
					</li>;
				})}
			</ul>
		)}
		<Button className="mt-3 min-h-11" variant="secondary" size="sm" disabled={busy || rules.length >= 100} onClick={() => setEditing(emptyRule())}>Add filter</Button>
	</div>;
}
