import type { AddressStatus } from "~/queries/mailboxes";

const accountColors = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#dc2626", "#65a30d"];

// Stable color per account, so the same account looks the same everywhere.
export function accountColor(email: string) {
	let hash = 0;
	for (const char of email.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) | 0;
	return accountColors[Math.abs(hash) % accountColors.length];
}

export function AccountColorDot({ email, className = "" }: { email: string; className?: string }) {
	return <span aria-hidden="true" className={`inline-block size-2 shrink-0 rounded-full ${className}`} style={{ backgroundColor: accountColor(email) }} />;
}

// Short label: "hello@" plus the domain in a subtle color.
export function AccountLabel({ email }: { email: string }) {
	const [local, domain] = email.split("@");
	return <span className="min-w-0 truncate" title={email}>{local}@<span className="text-kumo-subtle">{domain}</span></span>;
}

const statusText = { active: "Receiving", inactive: "Setup needed", unknown: "Status unknown" } as const;

// Green when mail can arrive, amber when the address needs routing setup. Hidden when unknown.
export function RoutingDot({ status, withLabel = false }: { status: AddressStatus; withLabel?: boolean }) {
	if (status === "unknown" && !withLabel) return null;
	const color = status === "active" ? "bg-green-500" : status === "inactive" ? "bg-amber-500" : "bg-kumo-line";
	return <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-kumo-subtle" title={statusText[status]}>
		<span aria-hidden="true" className={`inline-block size-2 rounded-full ${color}`} />
		{withLabel ? statusText[status] : <span className="sr-only">{statusText[status]}</span>}
	</span>;
}
