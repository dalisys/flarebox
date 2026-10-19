// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import EmailAttachmentList from "~/components/EmailAttachmentList";
import EmailIframe from "~/components/EmailIframe";
import SenderAvatar, { senderName } from "~/components/SenderAvatar";
import { formatDetailDate, formatShortDate, rewriteInlineImages } from "~/lib/utils";
import type { Email } from "~/types";

interface SingleMessageViewProps {
	email: Email;
	mailboxId?: string;
	onPreviewImage: (url: string, filename: string) => void;
}

export default function SingleMessageView({
	email,
	mailboxId,
	onPreviewImage,
}: SingleMessageViewProps) {
	return (
		<div className="mail-message-card">
			<div className="mail-sender-heading">
				<SenderAvatar sender={email.sender} />
				<div className="min-w-0 flex-1"><div className="flex items-baseline gap-2"><span className="truncate text-sm font-medium">{senderName(email.sender)}</span><time className="shrink-0 text-xs text-kumo-subtle" dateTime={email.date}>{formatShortDate(email.date)}</time></div>
				<details className="mail-sender-details"><summary>to {email.recipient.split("@")[0]}</summary><div><p>From: {email.sender}</p><p>To: {email.recipient}</p>{email.cc && <p>Cc: {email.cc}</p>}<p>{formatDetailDate(email.date)}</p></div></details></div>
			</div>

			<div className="flex-1 min-h-0">
				<EmailIframe
					autoSize
					body={rewriteInlineImages(
						email.body || "",
						mailboxId || "",
						email.id,
						email.attachments,
					)}
				/>
			</div>

			<EmailAttachmentList
				mailboxId={mailboxId}
				emailId={email.id}
				attachments={email.attachments}
				onPreviewImage={onPreviewImage}
				className="px-4 py-3 border-t border-kumo-line shrink-0 md:px-6"
				showHeading
			/>
		</div>
	);
}
