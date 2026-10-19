# Spam filtering

## Built-in junk filter

Each incoming email gets a score from several warning signs. If the score reaches the mailbox's level, the email goes to Junk.

- The default level is **Balanced**.
- Junk mail is kept for review.
- Junk mail does not trigger automatic drafts or forwarding.
- Sender-provided `X-Spam-*` headers are ignored.

This is a simple local filter, not a full spam service. Check Junk from time to time.

### Settings per account

On each account's **Settings** page you can:

- Turn filtering off.
- Change the sensitivity.
- Block a sender or a whole `@domain`.
- See and remove trusted senders.

### Not spam

Open a Junk message and choose **Not spam**:

- The message moves to Inbox.
- That exact sender address becomes trusted for this account.
- Later mail from that sender usually goes to Inbox.

Sender addresses can be faked. Trust only people you know.

## Rspamd

You can send incoming mail to your own [Rspamd](https://rspamd.com/) server. When set, Rspamd decides:

| Rspamd result | Folder |
| --- | --- |
| `no action` | Inbox |
| Any other action | Junk |
| Server down, skipped, or bad reply | Junk (no forwarding, no draft) |

- Your block rules still apply.
- Without an Rspamd URL, the built-in filter is used.
- **Enable junk filtering** off turns off both filters for that mailbox.
- Trusted senders skip normal Junk, but serious Rspamd threats and scanner outages still go to Junk.

### Connect Rspamd

1. Expose **only** Rspamd's `/checkv2` endpoint over HTTPS (usually port 11333, behind a reverse proxy or Cloudflare Tunnel).
   - Require authentication.
   - Never expose the Rspamd controller or an open scanner to the internet.
2. Save the URL:

   ```bash
   npx wrangler secret put RSPAMD_CHECK_URL --name flarebox
   ```

3. Pick **one** way to log in:

   | Method | Secrets |
   | --- | --- |
   | Basic auth (username `worker`) | `RSPAMD_API_KEY` |
   | Cloudflare Access service token | `RSPAMD_ACCESS_CLIENT_ID`, `RSPAMD_ACCESS_CLIENT_SECRET` |
   | Bearer token on a reverse proxy | `RSPAMD_BEARER_TOKEN` |

   ```bash
   npx wrangler secret put RSPAMD_API_KEY --name flarebox
   ```

4. Test it:
   - For local tests, add the same names to `.dev.vars`.
   - Run `npm run test:spam`, `npm run typecheck`, and `npm run build`.
   - Send one clean and one spam test email. Check their folders and the Worker logs.

### Limits

- The Worker sends the envelope sender and recipient, but not the original sender IP. IP-based checks get less data.
- Set actions and scores on the Rspamd server.
- **Not spam** does not train Rspamd's Bayes filter.
