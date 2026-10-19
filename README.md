<div align="center">
  <h1>Flarebox</h1>
  <p><em>A self-hosted email client with an AI agent, running entirely on Cloudflare Workers</em></p>
</div>

> Flarebox started as a fork of Cloudflare's [Agentic Inbox](https://github.com/cloudflare/agentic-inbox). It uses the same Apache 2.0 license.

Send, receive, and manage email from your own Cloudflare account. No server to run, no IMAP.

- Mail arrives through [Email Routing](https://developers.cloudflare.com/email-routing/).
- Each mailbox lives in its own [Durable Object](https://developers.cloudflare.com/durable-objects/) with SQLite.
- Attachments are stored in [R2](https://developers.cloudflare.com/r2/).
- An AI agent reads, searches, and drafts replies, using any model on [OpenRouter](https://openrouter.ai/).

![Flarebox screenshot](./demo_app.png)

## Features

### From the original Agentic Inbox

- **Email client on Workers** — Rich text composer, reply/forward threading, folders, search, and attachments
- **Per-mailbox isolation** — One Durable Object with SQLite per mailbox, attachments in R2
- **Built-in AI agent** — Side panel that reads, searches, and drafts, with chat history and a custom prompt per mailbox
- **MCP server** — Connect Claude Code, Cursor, and other AI tools at `/mcp`

### Added in Flarebox

**Daily use**
- **Combined inbox** — All addresses in one folder tree, plus each address on its own
- **Advanced search** — Gmail-style operators (`from:`, `in:`, `has:attachment`, `after:`), a filter panel, and bookmarkable URLs
- **Bulk actions** — Archive, delete, or mark read/unread many messages; empty Junk in one click
- **Mobile-first** — Installable PWA, swipe between emails, mobile compose, light and dark theme
- **Push notifications** — Web Push for new mail, per device, with no third-party push service

**Accounts and domains, from the UI**
- **No redeploy** — Add domains, subdomains, and addresses in Settings; the app can create Email Routing rules for you
- **Catch-all mailboxes** — Collect every address on a domain in one mailbox
- **Change, merge, or retire an address** — Moves all messages and attachments; resumes if interrupted
- **Export before delete** — Download a full `.tar` archive of a mailbox
- **Forwarding** — Copy incoming mail to another address, with loop protection

**Spam protection**
- **Built-in junk filter** — Sensitivity levels, block rules, and a **Not spam** button
- **Optional Rspamd** — Use your own Rspamd server; mail goes to Junk if the scanner is down

**AI controls**
- **OpenRouter** — Pick any model for the agent, the prompt-injection scanner, and the draft verifier
- **Per-mailbox switches** — Turn the assistant off, or turn automatic drafts on (off by default)

## Quick start

You need a Cloudflare account with a domain and an [OpenRouter](https://openrouter.ai/) API key.

1. **Deploy.** You will be asked for `DOMAINS`, the domain you receive mail on.

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dalisys/flarebox)

2. **Protect it with Cloudflare Access.** The Worker stays closed until you do this. See [Setup → Cloudflare Access](docs/setup.md#1-cloudflare-access).
3. **Add your secrets:**

   ```bash
   npx wrangler secret put POLICY_AUD --name flarebox
   npx wrangler secret put TEAM_DOMAIN --name flarebox
   npx wrangler secret put OPENROUTER_API_KEY --name flarebox
   ```

4. **Turn on Email Routing and Email Sending** for your domain. See [Setup](docs/setup.md).
5. **Open the app.** It creates the mailboxes listed in `EMAIL_ADDRESSES`.

## Documentation

| Page | What is in it |
| --- | --- |
| [Setup](docs/setup.md) | Cloudflare Access, API token, sending, AI, custom hostname, troubleshooting |
| [Accounts and domains](docs/accounts-and-domains.md) | Add, change, export, and remove addresses; domains, subdomains, catch-all, forwarding |
| [Inbox and search](docs/inbox-and-search.md) | Combined inbox, search operators, filters, push notifications |
| [Spam filtering](docs/spam-filtering.md) | Built-in junk filter and Rspamd |

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

- Put your own domain and addresses in `wrangler.local.jsonc` (copy `wrangler.jsonc`). Git ignores it, and builds use it when it exists.
- Create the R2 bucket once: `npx wrangler r2 bucket create flarebox`
- Deploy with `npm run deploy`.

**Tests** (Node.js 22.13+). Run all with `npm run test:spam`, or one area:

| Command | Checks |
| --- | --- |
| `npm run test:search` | Search parser and filters |
| `npm run test:email-cache` | Optimistic stars and rollback |
| `npm run test:mailbox` | Mailbox archive format |
| `npm run test:push` | Web Push encryption and allowed push hosts |

## Security

- Cloudflare Access is the only login. It is required outside local development.
- Everyone who passes your Access policy can open **all** mailboxes, use the domain controls, and use the MCP server at `/mcp`. There is no per-mailbox permission.
- Keep secrets in Worker secrets or `.dev.vars`. Never put them in `wrangler.jsonc`.

## Stack

- **Frontend:** React 19, React Router v7, Tailwind CSS, Zustand, TipTap, `@cloudflare/kumo`
- **Backend:** Hono, Cloudflare Workers, Durable Objects (SQLite), R2, Email Routing
- **AI:** Cloudflare Agents SDK (`AIChatAgent`), AI SDK v6, OpenRouter

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

Apache 2.0 — see [LICENSE](LICENSE).
