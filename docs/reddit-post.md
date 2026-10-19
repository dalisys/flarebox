# Reddit post draft

Subreddits: r/selfhosted, r/CloudFlare (post separately, adjust the first line).

## Title

I turned Cloudflare's Agentic Inbox demo into a daily-driver email client (Flarebox, open source)

## Body

A few months ago Cloudflare released [Agentic Inbox](https://github.com/cloudflare/agentic-inbox): a self-hosted email client with an AI agent, running only on Workers, Durable Objects, R2, and Email Routing. No server to run and no IMAP.

I liked the idea, but it was a demo. I wanted to move my real mail onto it. So I forked it and kept going. The result is **Flarebox**.

**What I added:**

- **Combined inbox** for all addresses and domains, with one folder tree
- **Gmail-style search**: `from:`, `in:`, `has:attachment`, `after:`, a filter panel, bookmarkable URLs
- **Bulk actions** and one-click "Empty Junk"
- **Installable PWA**: works well on mobile, swipe between emails, dark mode
- **Web Push notifications** for new mail, with no third-party push service
- **Manage domains, subdomains, and addresses from the UI**: no redeploy; with a scoped API token it sets up Email Routing rules for you
- **Catch-all mailboxes** and forwarding to another address
- **Rename, merge, or retire an address**: moves all mail and attachments; export a full `.tar` archive before you delete
- **Spam filter**: built-in scoring, block rules, a "Not spam" button, and optional **Rspamd** integration
- **OpenRouter** for the AI agent, so you choose the model. Auto-drafts are off by default and can be turned on per mailbox

Login stays behind Cloudflare Access, so nobody reaches the app without passing your Access policy first.

Repo: https://github.com/dalisys/flarebox (Apache 2.0)

Feedback and PRs welcome. I'm most interested in what is missing for you to use it as your main inbox.
