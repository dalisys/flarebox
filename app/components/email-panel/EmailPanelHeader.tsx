import { StarIcon } from "@phosphor-icons/react";

export default function EmailPanelHeader({ subject, messageCount, showThreadCount, starred, onToggleStar, isSavingStar }: { subject: string; messageCount: number; showThreadCount: boolean; starred: boolean; onToggleStar: () => void; isSavingStar: boolean }) {
	return <div className="mail-reader-subject">
		<div className="min-w-0 flex-1"><h1 className="break-words text-xl font-normal leading-snug text-kumo-default md:text-2xl">{subject || "(no subject)"}</h1>{showThreadCount && <span className="mt-1 block text-xs text-kumo-subtle">{messageCount} messages</span>}</div>
		<button type="button" className="mail-icon-button" aria-label={starred ? "Unstar" : "Star"} aria-pressed={starred} disabled={isSavingStar} onClick={onToggleStar}><StarIcon size={24} weight={starred ? "fill" : "regular"} className={starred ? "text-kumo-warning" : "text-kumo-subtle"} /></button>
	</div>;
}
