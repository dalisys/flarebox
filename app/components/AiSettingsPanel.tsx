import { Button, Loader } from "@cloudflare/kumo";
import { RobotIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import api from "~/services/api";

export default function AiSettingsPanel() {
	const queryClient = useQueryClient();
	const settings = useQuery({ queryKey: ["ai-settings"], queryFn: api.getAiSettings });
	const models = useQuery({ queryKey: ["ai-models"], queryFn: api.getAiModels, staleTime: Infinity });
	const [model, setModel] = useState("");
	const [busy, setBusy] = useState(false);
	const [listOpen, setListOpen] = useState(false);
	const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

	useEffect(() => { if (settings.data) setModel(settings.data.model); }, [settings.data]);

	const save = async (value: string | null) => {
		setBusy(true);
		setMessage(null);
		try {
			const saved = await api.saveAiModel(value);
			queryClient.setQueryData(["ai-settings"], saved);
			setMessage({ text: `Using ${saved.model}.` });
		} catch (cause) { setMessage({ text: cause instanceof Error ? cause.message : "Could not save the model.", error: true }); }
		finally { setBusy(false); }
	};
	const submit = (event: FormEvent) => { event.preventDefault(); void save(model.trim()); };

	if (settings.isPending) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
	if (settings.isError) return <p className="py-12 text-sm text-kumo-subtle">Could not load AI settings.</p>;

	const known = models.data?.find((item) => item.id === model.trim());
	// Every word must match the ID or name, so "claude sonnet" works.
	const words = model.trim().toLowerCase().split(/\s+/).filter(Boolean);
	const matches = listOpen && words.length && !known ? (models.data ?? []).filter((item) => words.every((word) => `${item.id} ${item.name}`.toLowerCase().includes(word))).slice(0, 8) : [];
	const isDefault = settings.data.model === settings.data.defaultModel;

	return <section className="max-w-3xl space-y-6 py-6">
		<div className="border-b border-kumo-line pb-6">
			<div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-kumo-subtle"><RobotIcon size={15} /> AI</div>
			<h2 className="text-2xl font-semibold tracking-tight text-kumo-default md:text-3xl">Model</h2>
			<p className="mt-2 text-sm text-kumo-subtle">The OpenRouter model used by the assistant and automatic drafts in every account. Per-account instructions are on each account's page.</p>
		</div>
		<form onSubmit={submit} className="max-w-xl space-y-4 rounded-lg border border-kumo-line bg-kumo-recessed p-5">
			<label className="block text-sm font-medium text-kumo-default" htmlFor="ai-model">Model ID</label>
			<input
				id="ai-model"
				role="combobox"
				aria-expanded={matches.length > 0}
				aria-controls="ai-model-options"
				value={model}
				onChange={(event) => { setModel(event.target.value); setListOpen(true); }}
				onKeyDown={(event) => { if (event.key === "Escape") setListOpen(false); }}
				placeholder="Search, for example claude sonnet"
				autoComplete="off"
				spellCheck={false}
				required
				className="block w-full rounded-md border border-kumo-line bg-kumo-base px-3 py-2 font-mono text-sm text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring"
			/>
			{matches.length > 0 && <ul id="ai-model-options" role="listbox" aria-label="Matching models" className="divide-y divide-kumo-line overflow-hidden rounded-md border border-kumo-line bg-kumo-base">
				{matches.map((item) => <li key={item.id} role="option" aria-selected={false}>
					<button type="button" onClick={() => { setModel(item.id); setListOpen(false); }} className="block w-full px-3 py-2.5 text-left hover:bg-kumo-tint focus:bg-kumo-tint focus:outline-none">
						<span className="block truncate text-sm text-kumo-default">{item.name}</span>
						<span className="block truncate font-mono text-xs text-kumo-subtle">{item.id}</span>
					</button>
				</li>)}
			</ul>}
			<p className="text-xs text-kumo-subtle">
				{models.isPending ? "Loading OpenRouter models…" : models.isError ? "Could not load the model list. You can still type a model ID." : known ? known.name : `${models.data.length} models available. Type to search, or paste any ID from openrouter.ai/models.`}
			</p>
			<div className="flex flex-wrap items-center gap-2">
				<Button type="submit" variant="primary" disabled={busy || model.trim() === settings.data.model}>Save</Button>
				{!isDefault && <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(null)}>Reset to {settings.data.defaultModel}</Button>}
			</div>
			{message && <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-red-600" : "text-kumo-subtle"}`}>{message.text}</p>}
		</form>
	</section>;
}
