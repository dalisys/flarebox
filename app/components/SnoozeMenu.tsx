import { useState } from "react";
import { formatDetailDate } from "shared/dates";
import { snoozePresets, toLocalInputValue } from "shared/snooze";

/** Snooze choices. Calls onPick with the wake time as a UTC ISO string. */
export default function SnoozeMenu({ onPick, disabled = false, className = "" }: { onPick: (until: string) => void; disabled?: boolean; className?: string }) {
	const [custom, setCustom] = useState("");
	const [error, setError] = useState("");
	const now = new Date();
	return <div className={`mail-snooze-menu ${className}`} role="group" aria-label="Snooze until">
		{snoozePresets(now).map((preset) => <button key={preset.id} type="button" disabled={disabled} onClick={() => onPick(preset.date.toISOString())}>
			<span>{preset.label}</span><span className="ml-auto text-xs text-kumo-subtle">{formatDetailDate(preset.date.toISOString())}</span>
		</button>)}
		<form className="flex flex-wrap items-end gap-2 px-3 py-2" onSubmit={(event) => {
			event.preventDefault();
			// datetime-local has no zone; new Date() reads it as local time.
			const date = new Date(custom);
			if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) { setError("Choose a time in the future."); return; }
			setError("");
			onPick(date.toISOString());
		}}>
			<label className="min-w-0 flex-1 text-xs text-kumo-subtle">Pick date and time
				<input type="datetime-local" required value={custom} min={toLocalInputValue(now)} onChange={(event) => setCustom(event.target.value)} className="mt-1 block min-h-11 w-full min-w-0 rounded border border-kumo-line bg-kumo-base px-2 text-base text-kumo-default sm:text-sm" />
			</label>
			<button type="submit" disabled={disabled} className="min-h-11 rounded-full bg-kumo-brand px-4 text-sm font-medium text-kumo-inverse">Snooze</button>
			{error && <p role="alert" className="basis-full text-xs text-kumo-destructive">{error}</p>}
		</form>
	</div>;
}
