// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Env extends Cloudflare.Env {
	POLICY_AUD: string;
	TEAM_DOMAIN: string;
	CLOUDFLARE_API_TOKEN: string;
	CLOUDFLARE_EMAIL_WORKER?: string;
	CATCH_ALL_MAILBOXES?: Record<string, string>;
	FORWARD_TO_EMAIL?: string;
	OPENROUTER_API_KEY?: string;
	RESEND_API_KEY?: string;
	RSPAMD_CHECK_URL: string;
	RSPAMD_API_KEY: string;
	RSPAMD_BEARER_TOKEN?: string;
	RSPAMD_ACCESS_CLIENT_ID?: string;
	RSPAMD_ACCESS_CLIENT_SECRET?: string;
}
