import { Button } from "@cloudflare/kumo";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { splitMbox } from "shared/mbox";

const BATCH_MESSAGES = 50;
const BATCH_BYTES = 5 * 1024 * 1024;
const MAX_MESSAGE_BYTES = 35 * 1024 * 1024; // the server takes 40 MB per request

type Counts = { imported: number; skipped: number; failed: number };

const readSaved = (key: string) => { try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; } };
const writeSaved = (key: string, value: number | null) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, String(value)); } catch { /* Resume still works: the server skips stored messages. */ } };

async function sendBatch(mailboxId: string, batch: Uint8Array[], signal: AbortSignal): Promise<Counts> {
	for (let attempt = 1; ; attempt++) {
		const form = new FormData();
		for (const raw of batch) form.append("message", new Blob([raw as BlobPart], { type: "message/rfc822" }), "message.eml");
		try {
			const response = await fetch(`/api/v1/mailboxes/${encodeURIComponent(mailboxId)}/import`, { method: "POST", body: form, signal });
			if (response.ok) return response.json();
			const body = await response.json().catch(() => ({})) as { error?: string };
			if (response.status < 500 || attempt === 3) throw new Error(body.error || `Import failed: ${response.status}`);
		} catch (error) {
			if (signal.aborted || attempt === 3) throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
	}
}

export default function MailImportPanel({ mailboxId }: { mailboxId: string }) {
	const queryClient = useQueryClient();
	const [file, setFile] = useState<File | null>(null);
	const [running, setRunning] = useState(false);
	const [counts, setCounts] = useState<Counts | null>(null);
	const [progress, setProgress] = useState(0);
	const [status, setStatus] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const start = async () => {
		if (!file) return;
		const abort = new AbortController();
		abortRef.current = abort;
		const saveKey = `flarebox-import:${mailboxId}:${file.name}:${file.size}:${file.lastModified}`;
		const resumeAfter = readSaved(saveKey);
		const total: Counts = { imported: 0, skipped: 0, failed: 0 };
		let read = 0;
		let index = 0;
		let batch: Uint8Array[] = [];
		let batchBytes = 0;
		const flush = async () => {
			if (!batch.length) return;
			const result = await sendBatch(mailboxId, batch, abort.signal);
			total.imported += result.imported;
			total.skipped += result.skipped;
			total.failed += result.failed;
			batch = [];
			batchBytes = 0;
			writeSaved(saveKey, index);
			setCounts({ ...total });
		};
		setRunning(true);
		setCounts({ ...total });
		setStatus(resumeAfter ? `Resuming after message ${resumeAfter}.` : null);
		try {
			const counted = file.stream().pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
				read += chunk.length;
				setProgress(read / file.size);
				controller.enqueue(chunk);
			} }));
			for await (const raw of splitMbox(counted)) {
				if (abort.signal.aborted) break;
				index++;
				if (index <= resumeAfter) { total.skipped++; continue; }
				if (raw.length > MAX_MESSAGE_BYTES) { total.failed++; continue; }
				if (batch.length && batchBytes + raw.length > BATCH_BYTES) await flush();
				batch.push(raw);
				batchBytes += raw.length;
				if (batch.length >= BATCH_MESSAGES) await flush();
			}
			if (!abort.signal.aborted) {
				await flush();
				writeSaved(saveKey, null);
				setProgress(1);
				setStatus(index ? "Import finished." : "No messages found. Choose an .mbox file from Google Takeout.");
			}
		} catch (error) {
			setStatus(abort.signal.aborted ? null : `${error instanceof Error ? error.message : "Import stopped."} Choose the same file and start again to resume.`);
		} finally {
			if (abort.signal.aborted) setStatus("Import canceled. Start again with the same file to resume.");
			setCounts({ ...total });
			setRunning(false);
			abortRef.current = null;
			void queryClient.invalidateQueries();
		}
	};

	return <section className="max-w-2xl rounded-lg border border-kumo-line bg-kumo-base">
		<div className="border-b border-kumo-line px-5 py-4">
			<h3 className="text-sm font-semibold text-kumo-default">Import mail</h3>
			<p className="mt-0.5 text-xs text-kumo-subtle">Add mail from a Gmail export. In Google Takeout, choose Mail and download the .mbox file. Spam checks, auto-drafts, and notifications do not run on imported mail.</p>
		</div>
		<div className="space-y-4 px-5 py-4">
			<p className="text-xs text-kumo-subtle md:hidden">Use a computer for large imports.</p>
			<input type="file" accept=".mbox,application/mbox" disabled={running} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setCounts(null); setStatus(null); setProgress(0); }}
				className="block min-h-11 w-full text-sm text-kumo-default file:mr-3 file:min-h-11 file:rounded-md file:border file:border-kumo-line file:bg-kumo-base file:px-3 file:text-sm file:text-kumo-default" />
			{counts && <div className="space-y-2">
				<div className="h-2 overflow-hidden rounded-full bg-kumo-recessed" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
					<div className="h-full bg-kumo-brand transition-[width]" style={{ width: `${progress * 100}%` }} />
				</div>
				<p className="text-sm text-kumo-default" aria-live="polite">{counts.imported} imported · {counts.skipped} skipped · {counts.failed} failed</p>
			</div>}
			{status && <p role="status" className="text-sm text-kumo-subtle">{status}</p>}
			<div className="flex gap-3">
				{running
					? <Button variant="secondary" className="min-h-11" onClick={() => abortRef.current?.abort()}>Cancel</Button>
					: <Button variant="primary" className="min-h-11" disabled={!file} onClick={start}>Start import</Button>}
			</div>
		</div>
	</section>;
}
