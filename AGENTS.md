# Repository Guidelines

## Project Structure & Module Organization

`app/` contains the React Router interface: route files in `app/routes/`, reusable UI in `app/components/`, and client queries and hooks in their named folders. `workers/` contains the Cloudflare Worker entry points, API routes, email handling, AI agent, MCP endpoint, and Durable Object storage; database schema lives in `workers/db/`. Put code shared by the interface and Worker in `shared/`. Static files belong in `public/`. The root `wrangler.jsonc` defines Cloudflare bindings and non-secret settings.

## Build, Test, and Development Commands

- `npm install` installs dependencies from `package-lock.json`.
- `npm run dev` starts the local React Router development server.
- `npm run typecheck` generates Cloudflare and route types, then checks the TypeScript projects.
- `npm run build` creates the production React Router bundle.
- `npm run preview` builds and serves that bundle locally.
- `npm run deploy` builds and deploys the Worker with Wrangler; use it only when deployment is intended.

## Coding Style & Naming Conventions

Use TypeScript and TSX, tabs for indentation, double quotes, and semicolons, matching nearby files. Keep React components in `PascalCase.tsx` files (for example, `EmailPanel.tsx`); use descriptive kebab-case route and utility filenames where existing code does. Import app modules through the `~/` alias when appropriate. There is no configured formatter or linter, so follow the surrounding style and run `npm run typecheck` before proposing changes.

## Testing Guidelines

No automated test framework or coverage threshold is configured yet. For changes to mail routing, storage, authentication, or sending, describe the manual scenario you exercised in the pull request. Run `npm run typecheck` and `npm run build` for code changes. If you add automated tests, document the new command and keep tests close to the feature or in a clearly named test directory.

## Commit & Pull Request Guidelines

Recent commits use short, imperative subjects such as “Clarify Access troubleshooting in README”; follow that pattern and keep each commit focused. Pull requests should explain the behavior changed, list validation performed, and link a related issue when one exists. Include screenshots for visible UI changes and note any required Cloudflare configuration or migration steps.

## Security & Configuration

Keep secrets in local `.dev.vars` or deployed Worker secrets, never in `wrangler.jsonc` or commits. Start from `.dev.vars.example`. Production access depends on Cloudflare Access settings (`POLICY_AUD` and `TEAM_DOMAIN`); review authentication and mailbox scope carefully when changing Worker routes or MCP tools.
