import { Loader, Switch } from "@cloudflare/kumo";
import { BellIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "~/services/api";

export default function NotificationSettingsPanel() {
	const queryClient = useQueryClient();
	const settings = useQuery({ queryKey: ["notification-settings"], queryFn: api.getNotificationSettings });
	const [error, setError] = useState("");

	const setSkipForwarded = async (skipForwarded: boolean) => {
		setError("");
		try {
			queryClient.setQueryData(["notification-settings"], await api.saveNotificationSettings({ skipForwarded }));
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the setting."); }
	};

	if (settings.isPending) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
	if (settings.isError) return <p className="py-12 text-sm text-kumo-subtle">Could not load notification settings.</p>;
	const { skipForwarded, forwardTo } = settings.data;

	return <section className="max-w-3xl space-y-6 py-6">
		<div className="border-b border-kumo-line pb-6">
			<div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-kumo-subtle"><BellIcon size={15} /> Notifications</div>
			<h2 className="text-2xl font-semibold tracking-tight text-kumo-default md:text-3xl">Notifications</h2>
			<p className="mt-2 text-sm text-kumo-subtle">Turn notifications on or off for this device with the bell at the top of this page. Junk mail never notifies.</p>
		</div>
		<div className="max-w-xl rounded-lg border border-kumo-line bg-kumo-recessed">
			<div className="flex items-start justify-between gap-4 px-5 py-4">
				<div className="min-w-0">
					<p className="text-sm text-kumo-default">Skip forwarded mail</p>
					<p className="mt-0.5 break-words text-xs text-kumo-subtle">
						{forwardTo ? <>Don't notify for emails also forwarded to {forwardTo}. You already get them there.</> : "Forwarding is not set up, so this has no effect. Set the FORWARD_TO_EMAIL secret to forward mail."}
					</p>
				</div>
				<Switch aria-label="Skip forwarded mail" checked={skipForwarded} disabled={!forwardTo} onCheckedChange={(value) => void setSkipForwarded(value)} />
			</div>
			{error && <p role="alert" className="px-5 pb-4 text-sm text-red-600">{error}</p>}
		</div>
	</section>;
}
