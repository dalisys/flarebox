import { useKumoToastManager } from "@cloudflare/kumo";
import { StarIcon } from "@phosphor-icons/react";
import { useIsMutating } from "@tanstack/react-query";
import { useUpdateEmail } from "~/queries/emails";

export default function EmailStarButton({ mailboxId, id, starred }: { mailboxId: string; id: string; starred: boolean }) {
	const updateEmail = useUpdateEmail();
	const toast = useKumoToastManager();
	const pending = useIsMutating({ mutationKey: ["update-email"], predicate: (mutation) => {
		const variables = mutation.state.variables as { mailboxId?: string; id?: string };
		return variables?.mailboxId === mailboxId && variables?.id === id;
	} });
	return <button type="button" className="mail-message-star mail-icon-button" aria-label={starred ? "Unstar" : "Star"} aria-pressed={starred} disabled={pending > 0} onClick={(event) => {
		event.stopPropagation();
		updateEmail.mutate({ mailboxId, id, data: { starred: !starred } }, { onError: () => toast.add({ title: "Could not save the star. Please try again.", variant: "error" }) });
	}}><StarIcon size={22} weight={starred ? "fill" : "regular"} className={starred ? "text-kumo-warning" : "text-kumo-subtle"} /></button>;
}
