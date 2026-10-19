# Accounts and domains

Domains and addresses you add in **Settings** are saved in R2. You do not need to redeploy.

`DOMAINS` and `EMAIL_ADDRESSES` in `wrangler.jsonc` stay as defaults.

Automatic routing needs the [Cloudflare API token](setup.md#3-cloudflare-api-token-optional). Without it, create each rule yourself: **Send to a Worker → flarebox**.

## Addresses

### Add an address

1. Open **Settings → Accounts → Add account**.
2. Enter the address.
3. With the API token and Email Routing on, the app creates the routing rule.

Each account has its own preferences on its Settings page.

### Change an address

1. Select the account in **Settings → Accounts**.
2. Choose **Change to a new address** and enter the new address.

The app creates the new account, moves all messages, folders, and attachments, then removes the old address.

- If the new address still needs a routing rule, the old address stays active until you add it.
- If the move stops, open the same account page to resume it.

### Merge into another account

Choose **Move into an existing account**. It moves everything the same way. The destination keeps its own settings.

### Export and remove an address

1. On the account page, select **Download archive and remove**.
2. Prepare the export and download the `.tar` file.
3. Confirm that you saved it.
4. The app deletes the mailbox and its data.

A partial download does not unlock deletion.

The archive contains:

| Path | Content |
| --- | --- |
| `manifest.json` | Account settings and folders |
| `emails/<id>.json` | Full messages |
| `attachments/<email-id>/<attachment-id>` | Attachment files |

After removal:

- If routing is not automatic, delete the old rule yourself.
- If a catch-all is on for the domain, the old address still receives mail. Turn the catch-all off to stop it.

## Domains

### Add a domain

1. Open **Settings → Domains → Add domain**.
2. With the API token, the app can turn on Email Routing. Cloudflare adds its MX and SPF records.
   - This only works if the domain has no MX or SPF records yet.
   - If another mail service uses the domain, move it off by hand first.
3. Add addresses in **Settings → Accounts → Add account**.

**Sync address rules** creates rules for mailboxes made before routing was on.

### Add a subdomain

1. Select the parent domain in **Settings → Domains**.
2. Under **Add a subdomain**, enter a prefix such as `mail`, and save.
3. Turn on Email Routing for `mail.example.com`.
4. Add addresses such as `hello@mail.example.com`.

Notes:

- You can also type the full subdomain in **Add domain**.
- The API token needs access to the parent zone.
- Catch-all works only on the main domain. Subdomain addresses need their own rules.
- Adding a subdomain does not change existing accounts.

### Remove a domain

1. Remove all its mailboxes first.
2. Open **Settings → Domains → Remove domain**.

This only removes it from the app. Cloudflare DNS and Email Routing stay as they are.

## Catch-all

To receive every address on a domain in one mailbox:

1. Add the mailbox to `EMAIL_ADDRESSES`.
2. Map the domain to it in `CATCH_ALL_MAILBOXES`.
3. Create the mailbox (open the app).
4. In Cloudflare, turn on the catch-all rule: **Send to a Worker → flarebox**.

- Routing uses the SMTP envelope recipient, so Bcc mail arrives too.
- Each message keeps its original `To` header.
- Replies go out from the catch-all address.

## Forwarding

Copy incoming non-junk mail to another address. Mail also stays in Flarebox.

1. In Cloudflare, add and verify the address in **Email Routing → Destination Addresses**.
2. Save it as a secret:

   ```bash
   npx wrangler secret put FORWARD_TO_EMAIL --name flarebox
   ```

3. Send a test message. Check both inboxes.

- Forwarding applies to every mailbox, including catch-all mailboxes.
- Junk mail is not forwarded.
- Forwarded mail sends no push notification, since you get it at the other address. Change this in **Settings → Notifications → Skip forwarded mail** (on by default).
- Do not forward to an address that routes back into this Worker. That makes a loop.
- If forwarding fails, the Worker logs an error. The inbox copy is still saved.
- To stop, delete the `FORWARD_TO_EMAIL` secret.

## Signature and automatic reply

Open the account, then **Settings**.

- **Signature**: turn on **Add signature** and write the text. It is added to new emails, replies, and forwards from this address. Drafts keep the signature they already have.
- **Automatic reply**: turn on **Send automatic reply** and write a message. The subject is optional. Empty means `Re: <original subject>`. The signature is added below the message.

The automatic reply needs [Rspamd](spam-filtering.md#rspamd). It is sent only when Rspamd says DMARC passed for the sender. This stops replies to forged senders.

The automatic reply is not sent:

- to mail in Junk,
- to addresses on your own domains,
- to `noreply`, `mailer-daemon`, `postmaster`, and bounce addresses,
- to mail with `Auto-Submitted`, `List-Id`, `List-Unsubscribe`, or `Precedence: bulk/list/junk` headers,
- to the same sender more than one time in 4 days,
- more than 5 times per hour for one account.

The reply has the `Auto-Submitted: auto-replied` header, so other auto-responders do not answer it. A copy goes to **Sent**. It counts toward the send limit (20 per hour). If sending fails, the Worker logs an error. The received email is still saved.

## Tests

- `npm run test:mailbox` checks the archive format.
- `node --test tests/cloudflare-routing.test.mjs` checks domain activation, subdomains, and mail-record protection with mocked Cloudflare responses.
- `node --experimental-strip-types --test tests/auto-reply.test.mjs` checks when an automatic reply is sent.
