<div align="center">
  <h1>Flarebox</h1>
  <p><em>A self-hosted email client with an AI agent, running entirely on Cloudflare Workers</em></p>
</div>

> Flarebox started as a fork of Cloudflare's [Agentic Inbox](https://github.com/cloudflare/agentic-inbox) and is released under the same Apache 2.0 license.

Flarebox lets you send, receive, and manage emails through a modern web interface -- all powered by your own Cloudflare account. Incoming emails arrive via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/), each mailbox is isolated in its own [Durable Object](https://developers.cloudflare.com/durable-objects/) with a SQLite database, and attachments are stored in [R2](https://developers.cloudflare.com/r2/).

An **AI-powered Email Agent** can read your inbox, search conversations, and draft replies -- built with the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) and any model on [OpenRouter](https://openrouter.ai/).

![Flarebox screenshot](./demo_app.png)


Read the blog post to learn more about Cloudflare Email Service and how to use it with the Agents SDK, MCP, and from the Wrangler CLI: [Email for Agents](https://blog.cloudflare.com/email-for-agents/).

## How to setup

**Important**: Clicking the 'Deploy to Cloudflare' button is only one part of the setup. You must follow the **After deploying** steps as well. For a full step-by-step guide with screenshots, refer to this comment: 
https://github.com/cloudflare/agentic-inbox/issues/4#issuecomment-4269118513

### To set up

1. Deploy to Cloudflare. The deploy flow will automatically provision R2 and Durable Objects. You'll be prompted for **DOMAINS**, which is the domain (yourdomain.com) you want to receive emails for (email@yourdomain.com).

     [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dalisys/flarebox)

2. **Configure Cloudflare Access** -- Create a [hostname-based Access application](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#protect-a-specific-hostname-custom-domain-or-path) for the inbox web hostname in Zero Trust > Access > Applications. This app uses WebSockets, which Worker-level Access currently blocks. Set the Access application's audience tag as the `POLICY_AUD` Worker secret and your Access team URL (for example `https://your-team.cloudflareaccess.com`) as the `TEAM_DOMAIN` Worker secret. The Worker remains closed until both are set.
3. **Set up Email Routing** -- Configure the scoped Cloudflare API token below to manage domains and address rules from the inbox UI. You can also set up Email Routing manually in the Cloudflare dashboard.
4. **Enable Email Service** -- The worker needs the `send_email` binding to send outbound emails. See [Email Service docs](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/)
5. **Create a mailbox** -- Visit the deployed inbox home page. It automatically creates mailboxes listed in `EMAIL_ADDRESSES` that do not exist yet.

### Use multiple domains

#### Create the Cloudflare API token

1. In the [Cloudflare dashboard](https://dash.cloudflare.com/profile/api-tokens), open **My Profile → API Tokens → Create Token → Create Custom Token**. Name it `Flarebox routing`.
2. Add these **Zone** permissions. Cloudflare's token editor calls write access **Edit**:

   | Permission | Access |
   | --- | --- |
   | Zone | Read |
   | DNS | Edit |
   | Zone Settings | Edit |
   | Email Routing Rules | Edit |

   ![Cloudflare custom token with the four required permissions and All zones selected](docs/images/cloudflare-routing-token.png)

   The screenshot shows **All zones** so the app can manage domains added later. For a narrower token, select only the zones you intend to use.

3. Under **Zone Resources**, choose **Include → Specific zone** for each domain the app should manage. **All zones** also works, but grants the token access to every current and future zone in the account. Leave **Client IP Address Filtering** empty unless you have a verified fixed source IP for the Worker. Set a TTL only if you plan to rotate the token before it expires.
4. Select **Continue to summary → Create Token**, then copy the secret. Cloudflare shows it only once. Do not add it to `wrangler.jsonc`, commit it, or paste it into an issue or chat. See [Cloudflare's token guide](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) for the current dashboard flow.
5. From this repository, set the deployed Worker secret. Wrangler prompts for the value:

   ```bash
   npx wrangler secret put CLOUDFLARE_API_TOKEN --name flarebox
   ```

For local development only, put `CLOUDFLARE_API_TOKEN=...` in `.dev.vars`. Set `CLOUDFLARE_EMAIL_WORKER` only if the deployed email Worker script is not named `flarebox`. Everyone admitted by this app's Cloudflare Access policy can use its domain controls, so scope that policy and token to the intended administrators. Without the token, the UI still creates domains and mailboxes locally and shows that Cloudflare routing requires manual setup.

The inbox website hostname and the email domains are configured separately.

- Open **Settings → Accounts** to add addresses and manage existing accounts. The mailbox and inbound allowlist are saved in R2, so no redeploy is needed. With a Cloudflare API token configured and Email Routing enabled, the app creates the address-specific rule automatically. Otherwise, create the rule manually with **Send to a Worker → flarebox**. Each account also has its mailbox preferences in Settings.
- To change an address, select its account in **Settings → Accounts**, choose **Change to a new address**, and enter the replacement address. The app creates the new account, moves its messages, folders, and attachments, then removes the old address. If the new address still needs a Cloudflare rule, the old address stays active while you configure it. **Move into an existing account** uses the same transfer without creating an address. An interrupted transfer can be resumed from the same account page. The destination keeps its own account settings.
- To remove an address while keeping an offline copy, select **Download archive and remove** on its account page. Prepare the export, download the `.tar` archive, confirm you saved it, then delete the mailbox and its stored data. The archive contains `manifest.json` with account settings and folders, `emails/<id>.json` files with complete messages, and `attachments/<email-id>/<attachment-id>` files. A partial download does not authorize deletion. If Cloudflare routing is unavailable, remove the old address rule manually. Either route requires the Cloudflare catch-all to be off if the old address should stop receiving mail.
- To open the web app on another hostname such as `inbox.example.com`, add it as a [Worker Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) in **Worker > Settings > Domains & Routes**. Add that hostname as another destination in the existing hostname-based Cloudflare Access application so all web hostnames use the same audience ID (`POLICY_AUD`). Worker-level Access does not support this app's WebSocket connections.
- To receive mail for another domain, use **Settings → Domains → Add domain**. The domain is saved in R2. When a Cloudflare API token is configured, the page can enable Email Routing if the domain has no existing MX or SPF records; Cloudflare adds its required MX and SPF records. If another mail service already uses the domain's mail records, review that service and migrate it manually. Then use **Settings → Accounts → Add account** to create each address. **Sync address rules** provisions rules for mailboxes created before routing was enabled. Existing `DOMAINS` and `EMAIL_ADDRESSES` values remain defaults, and newly added values persist independently of deployments.
- To receive mail on a subdomain, select its parent in **Settings → Domains**, enter a prefix such as `mail` under **Add a subdomain**, and save it. The app opens `mail.example.com`; enable Email Routing there before adding addresses such as `hello@mail.example.com`. You can also enter the full subdomain in **Add domain**. The Cloudflare token needs access to the parent zone. Catch-all applies only to the apex domain; subdomain addresses need individual routing rules. Adding a subdomain does not move existing accounts or change their email addresses. Completing Email Routing setup also syncs the existing account rules. Run `node --test tests/cloudflare-routing.test.mjs` to check root-domain activation, parent-zone lookup, subdomain routing, and existing mail-record protection with mocked Cloudflare responses.
- To remove a domain from the app, remove all its mailboxes first, then use **Settings → Domains → Remove domain**. This removes the domain from the app's list, including domains originally supplied by `DOMAINS`. It does not change Cloudflare DNS or disable Email Routing for that zone; manage those separately if the domain no longer needs mail service.

Run `npm run test:mailbox` to check the mailbox archive format. It exercises settings, full message data, attachment bytes, and the completion marker used before deletion.
- To collect every address at a domain in one mailbox, add that mailbox to `EMAIL_ADDRESSES` and map the domain to it in `CATCH_ALL_MAILBOXES`. Create the mailbox before enabling a Cloudflare Email Routing catch-all rule with **Send to a Worker → flarebox**. The Worker routes by the SMTP envelope recipient, so messages with hidden recipients are included. Each message retains its original `To` header; replies sent from the catch-all mailbox use the catch-all address.
- To send from an address on a domain, [onboard that domain to Email Sending](https://developers.cloudflare.com/email-service/get-started/) as well. Create a mailbox for the address in the app after Access is configured.

Set the Access values as Worker secrets from this directory (each command prompts for its value):

```bash
npx wrangler secret put POLICY_AUD --name flarebox
npx wrangler secret put TEAM_DOMAIN --name flarebox
```

### Combined inbox and forwarding

The mail workspace has one folder tree with **All accounts** and an expandable section for each address. Choose Inbox, Sent, Drafts, Archive, Deleted, Junk, or Activity across all accounts, or the same folder under one account. Activity shows messages from every folder. The combined list loads 50 messages per account at a time; **Load older messages** fetches the next page. Selecting a message opens it in that account's reading pane. The list refreshes every 30 seconds. Search queries the full mailbox history across accounts in the selected folder. Press Enter to search, or open **Filters** to choose sender, recipients (including Cc/Bcc), subject, folder, date range, read status, stars, attachments, and attachment filename. Choose **All folders** to search across folders; results can be sorted by date, sender, or subject. Search URLs can be bookmarked. The same filters are available in each account’s search bar. Dates use UTC and include the selected start and end days. Typed operators include `from:name`, `to:address`, `subject:"monthly report"`, `in:inbox`, `in:activity` (all folders), `is:unread`, `is:unstarred`, `has:attachment`, `has:noattachment`, `filename:pdf`, `after:2026-01-01`, and `before:2026-01-31`. All selected filters must match.

### Junk filtering

Incoming mail is scored for several suspicious signals and moved to Junk when it reaches the mailbox's sensitivity threshold. The default is **Balanced**. Junk messages are retained for review; they do not trigger automatic drafts or forwarding. Open a Junk message and choose **Not spam** to move it to Inbox and trust that exact sender address for that account. Future messages from trusted senders normally go to Inbox; serious Rspamd threat actions and scanner outages still go to Junk. Settings shows the trusted sender list and lets you remove an address. Each account's Settings page can disable filtering, change sensitivity, and set sender or `@domain` block rules. The filter does not use sender-provided `X-Spam-*` headers as trusted evidence. It is a basic local heuristic, not a full spam detection service, so review Junk periodically. Sender addresses can be forged, so trust only known contacts.

#### Connect Rspamd

The Worker can send the original incoming MIME message to Rspamd's `POST /checkv2` API before storing it. Rspamd's action is authoritative when configured: `no action` goes to Inbox; every other action goes to reviewable Junk. An unreachable, skipped, or invalid scan also goes to Junk, with no forwarding or automatic draft. Explicit mailbox block rules still apply. If no Rspamd URL is configured, the built-in filter remains in use. The mailbox's **Enable junk filtering** switch disables both scanners for that mailbox.

1. Expose **only** Rspamd's normal worker `/checkv2` endpoint (usually port 11333 behind a reverse proxy or Cloudflare Tunnel) over HTTPS. Protect it with authentication. Do not expose the Rspamd controller or an unauthenticated scanner to the Internet.
2. Save the exact URL as a Worker secret: `npx wrangler secret put RSPAMD_CHECK_URL --name flarebox`.
3. This endpoint uses HTTP Basic authentication with the fixed username `worker`. Save its API key with `npx wrangler secret put RSPAMD_API_KEY --name flarebox` and enter the key only at the terminal prompt. The Worker sends `Authorization: Basic base64(worker:key)` and `Content-Type: message/rfc822`. Alternatively, use a Cloudflare Access Service Auth policy with `RSPAMD_ACCESS_CLIENT_ID` and `RSPAMD_ACCESS_CLIENT_SECRET`, or a bearer-token reverse proxy with `RSPAMD_BEARER_TOKEN`. Configure exactly one authentication method.
4. Add the same names to local `.dev.vars` when testing locally. Run `npm run test:spam`, `npm run typecheck`, and `npm run build`, then send a known clean and a known spam test message through the Email Routing rule. Confirm their folders and check Worker logs for scanner errors before relying on the filter.

The Worker provides the envelope sender and recipient to Rspamd but does not have the original SMTP peer IP; IP-based Rspamd checks will have less context than when Rspamd sits directly in the SMTP path. Rspamd actions and scores are configured on the Rspamd server. **Not spam** updates this account's trusted sender list; it does not train Rspamd's Bayes classifier. Training would need raw MIME retention and a separately protected learning endpoint.

To copy accepted, non-junk incoming messages to another email address while keeping them in this inbox:

1. Add and verify the address under **Email Routing > Destination Addresses** in Cloudflare. Forwarding cannot start until Cloudflare marks it verified.
2. Set the destination as a Worker secret: `npx wrangler secret put FORWARD_TO_EMAIL --name flarebox`.
3. Send a test message to a configured mailbox and check both the inbox and the forwarding destination. The original sender, message, and attachments are forwarded by Cloudflare Email Routing. The Worker logs a forwarding error if the inbox copy saves but the forwarded copy fails.

The destination must not be another address routed back into this Worker, which would create a forwarding loop. To stop forwarding, delete the `FORWARD_TO_EMAIL` Worker secret. The setting forwards non-junk mail from every configured mailbox, including catch-all mailboxes.

`DOMAINS` is a non-secret value in `wrangler.jsonc`. `.dev.vars` is only for local development; it does not configure the deployed Worker.

### AI settings and OpenRouter

Open a mailbox's **Settings** page to control its AI assistant. **Create drafts when mail arrives** is off by default, including for mailboxes created before this setting was added. You can still ask the assistant to draft replies in chat. **Enable AI assistant** turns off both chat and automatic drafts for that mailbox. Each switch saves immediately.

To use OpenRouter for the agent, prompt-injection scanner, and draft verifier, add your key as a Worker secret:

```bash
npx wrangler secret put OPENROUTER_API_KEY --name flarebox
```

The command prompts for the key without putting it in source code. The model is controlled by `OPENROUTER_MODEL` in `wrangler.jsonc` (currently `openai/gpt-4.1-mini`). Set the key in `.dev.vars` as well if you use local development. AI features require this key. Do not put an API key in mailbox settings or `wrangler.jsonc`.

### Troubleshooting Access

1. If you see `Invalid or expired Access token`, that usually means `POLICY_AUD` or `TEAM_DOMAIN` secrets are incorrect.
   * Resolution: check the Access application's audience tag and team URL, then update the Worker secrets to match.
2. If you see `Cloudflare Access must be configured in production`, this application is intentionally enforcing Cloudflare Access so your inbox is not exposed to anyone on the internet.
   * Resolution: create a hostname-based [Cloudflare Access application](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#protect-a-specific-hostname-custom-domain-or-path), then set the `POLICY_AUD` and `TEAM_DOMAIN` Worker secrets from that application.

## Features

### From the original Agentic Inbox

- **Email client on Workers** — Send and receive through Cloudflare Email Routing, with a rich text composer, reply/forward threading, folders, search, and attachments
- **Per-mailbox isolation** — Each mailbox runs in its own Durable Object with SQLite storage and R2 for attachments
- **Built-in AI agent** — Side panel with email tools for reading, searching, and drafting, with persistent chat and custom system prompts per mailbox
- **MCP server** — External AI tools (Claude Code, Cursor, etc.) can work with your mailboxes at `/mcp`

### Added in Flarebox

**Daily use**
- **Combined inbox** — One folder tree with **All accounts** plus each address; Inbox, Sent, Drafts, Archive, Deleted, Junk, and Activity across all accounts
- **Advanced search** — Full-history search across accounts and folders, a filter panel, Gmail-style operators (`from:`, `in:`, `has:attachment`, `after:`, ...), sorting, and bookmarkable URLs
- **Bulk actions** — Select many messages to archive, delete, or mark read/unread; empty Junk in one click
- **Mobile-first UI** — Installable PWA with offline page, swipe between emails, mobile compose, and light/dark theme
- **Push notifications** — Web Push for new non-spam mail, per device, with no third-party push service (VAPID keys live in R2)

**Accounts and domains, from the UI**
- **Add domains, subdomains, and addresses without redeploying** — Saved in R2; with a scoped Cloudflare API token the app enables Email Routing and creates address rules for you
- **Catch-all mailboxes** — Collect every address on a domain in one mailbox
- **Change, merge, or retire an address** — Move all messages, folders, and attachments to a new or existing account; resumable if interrupted
- **Export before delete** — Download a full `.tar` archive (messages, attachments, settings) before removing a mailbox
- **Forwarding** — Copy accepted mail to another verified address, with loop protection

**Spam protection**
- **Built-in junk filter** — Per-mailbox sensitivity, sender and `@domain` block rules, and a **Not spam** button that trusts the sender
- **Optional Rspamd** — Send incoming mail to your own Rspamd server; it fails safe to Junk if the scanner is down

**AI controls**
- **OpenRouter** — Use any OpenRouter model for the agent, prompt-injection scanner, and draft verifier
- **Per-mailbox switches** — Turn the assistant off, or turn automatic drafts on (off by default)

## Stack

- **Frontend:** React 19, React Router v7, Tailwind CSS, Zustand, TipTap, `@cloudflare/kumo`
- **Backend:** Hono, Cloudflare Workers, Durable Objects (SQLite), R2, Email Routing
- **AI Agent:** Cloudflare Agents SDK (`AIChatAgent`), AI SDK v6, OpenRouter, `react-markdown` + `remark-gfm`
- **Auth:** Cloudflare Access JWT validation (required outside local development)

## Getting Started

```bash
npm install
npm run dev
```

### Configuration

1. Set your domain in `wrangler.jsonc`
2. Create an R2 bucket named `flarebox`: `wrangler r2 bucket create flarebox`

### Tests

Node.js 22.13+ is required. Run all checks with `npm run test:spam`, or one area:

- `npm run test:search` — search parser and filters
- `npm run test:email-cache` — optimistic stars and rollback across inbox, search, thread, and detail views
- `npm run test:mailbox` — mailbox archive format
- `npm run test:push` — Web Push encryption and allowed push hosts

### Deploy

```bash
npm run deploy
```

## Prerequisites

- Cloudflare account with a domain
- [Email Routing](https://developers.cloudflare.com/email-routing/) enabled for receiving
- [Email Service](https://developers.cloudflare.com/email-service/) enabled for sending
- [OpenRouter](https://openrouter.ai/) API key (for AI features)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) configured for deployed/shared environments (required in production)

Any user who passes the shared Cloudflare Access policy can access all mailboxes in this app by design. This includes the MCP server at `/mcp` -- external AI tools (Claude Code, Cursor, etc.) connected via MCP can operate on any mailbox by passing a `mailboxId` parameter. There is no per-mailbox authorization; the Cloudflare Access policy is the single trust boundary.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────>│  Hono Worker     │────>│  MailboxDO      │
│  React SPA   │     │  (API + SSR)     │     │  (SQLite + R2)  │
│  Agent Panel │     │                  │     └─────────────────┘
└──────┬───────┘     │  /agents/* ──────┼────>┌─────────────────┐
       │             │                  │     │  EmailAgent DO  │
       │ WebSocket   │                  │     │  (AIChatAgent)  │
       └─────────────┤                  │     │  email tools    │
                     │                  │────>│  OpenRouter     │
                     └──────────────────┘     └─────────────────┘
```

## License

Apache 2.0 -- see [LICENSE](LICENSE).
