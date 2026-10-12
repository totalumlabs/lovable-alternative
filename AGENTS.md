# AGENTS.md — Creable (lovable-alternative)

Creable is an open source (MIT) Lovable alternative: a user types a prompt, an AI agent
builds a full-stack Next.js app, the user previews it live, edits it visually or in code,
and publishes it. **This repo is only the builder UI.** Everything heavy (the coding agent,
sandboxes, hosting, database, deploys, custom domains, GitHub sync) is done by the
**Totalum API** behind one API key.

**What the generated apps are:** full-stack **Next.js** projects (server-rendered pages,
API routes, per-page metadata, sitemaps) with an **integrated database**, auth, file
storage and secrets, hosted with HTTPS and custom domains. That server-rendered output is
the reason this README claims better SEO than Lovable, whose default output is a
client-rendered React single-page app. Keep the claim honest: never describe the output
as "React front end" or "static site".

**This is a product you can resell.** The AI app-builder capabilities (agent, sandboxes,
hosting, databases, deploys, domains, GitHub, Figma, logs) are all served by the Totalum
API and work multi-tenant, so an operator can (a) add sign-up + login + billing and sell
this under their own brand, or (b) embed the capability inside an existing SaaS or
software product behind their own login. When writing copy or docs about this, link to
the white-label program: https://www.totalum.app/whitelabel (pricing, reseller terms).
The concrete steps are in "Boilerplate mode" and "Adding an AI app builder to an existing
product" below.

**Relationship to `totalumlabs/ai-app-builder-open`:** same engine, different edition.
That repo is the neutral white-label starter; this one is themed after the Lovable layout
and palette and its README targets people switching from Lovable. Logic fixes should be
ported between the two. Theme, branding and copy are allowed to diverge; the API client,
the proxy routes and the workspace behaviour should not.

> **NO AUTH BY DESIGN.** Every route is public and the app acts on one API key, so anyone
> who can reach the URL can spend that key's credits. Before this goes online, make the
> guards in `src/app/api/vcaas/_shared.ts` real and protect the pages in `src/proxy.ts`
> (see "Boilerplate mode"). Local or private-network use without a login is fine.

**Totalum API reference (read before touching `src/lib/vcaas*` or `src/app/api/`):**
https://www.totalum.app/totalum-api.md — the whole core API in one Markdown file, with
links to the optional areas. Do not vendor a copy into this repo; link to it.

## Commands

```bash
npm install                      # Node 20+ (see .nvmrc)
cp .env.example .env.local       # then set TOTALUM_VCAAS_API_KEY=tlm_sk_...
npm run dev                      # http://localhost:3000
npm run typecheck                # tsc --noEmit, the fast correctness gate
npx tsc --noEmit --noUnusedLocals --noUnusedParameters   # import hygiene
npm run build && npm start       # production build, run before any PR
```

CI runs `tsc --noEmit` on every push and pull request (`.github/workflows/typecheck.yml`). There is no test suite. Verification = typecheck + build + open the changed screen in a
browser with a real key. The key hits real projects and spends real credits: click through
the UI, but do not fire publish / restore / pull / delete unless the task requires it.

**Local test key.** On the maintainers' machines this repo is checked out next to
`ai-app-builder-open`, and both use the same test key: copy
`../ai-app-builder-open/.env.local` to `./.env.local` and you are set. `.env.local` is
gitignored. Never paste a `tlm_sk_` value into a tracked file, an issue or a PR.

## Brand and theme (what makes this edition different)

- `src/lib/brand.ts` — product name, tagline, meta title/description, repo and docs URLs.
  Every user-facing mention of the product reads from here. Rebranding = editing this file
  plus `src/app/icon.svg`.
- `src/components/brand/Logo.tsx` — the mark and the wordmark. The mark is our own shape;
  do not replace it with a heart or any Lovable asset (trademark, see README).
- `src/app/globals.css` — the theme tokens. Light, warm off-white surfaces, near-black
  text, one warm accent for primary actions, generous radii (`--radius` 0.75rem), soft
  shadows. Dark tokens exist for parity but the UI ships light-only, as Lovable does.
- The README names the product from `brand.ts` by hand (`Creable`). Renaming the product means updating both, plus `package.json` and the GIF.
- Layout conventions kept on purpose: home = centered prompt box with a suggestion row and
  the project gallery below; workspace = chat column left (~440px), preview right, header
  with project name, Preview/More/Code toggle, address bar and Publish.

Do not "modernise" the look toward a generic dark SaaS theme. The whole point of this
edition is that a Lovable user feels at home.

## Architecture in one screen

```
browser ── vcaasApi (src/lib/vcaas.ts, one function per endpoint, no secrets)
   │  same-origin fetch
   ▼
/api/vcaas/[...path]  (src/app/api/vcaas/*) ── adds `api-key` header ── vcaas-server.ts
   │                                                                     (server-only)
   ▼
https://builder-api.totalum.app/api/v1/vcaas    ← documented at totalum.app/totalum-api.md
                                                  (TOTALUM_API_URL overrides the host)
```

- `src/lib/vcaas.ts` — the client catalog. Every UI call goes through here; never hardcode an `/api/vcaas/...` path in a component.
- `src/lib/vcaas-server.ts` — the only module that reads `TOTALUM_VCAAS_API_KEY`. `server-only`. Never import it from a client component.
- `src/lib/vcaas-types.ts` — response types. `src/lib/vcaas-errors.ts` — error-code → copy mapping.
- `src/app/api/vcaas/_shared.ts` — auth/ownership guards. **Deliberate no-ops**: one operator key, so "who is asking?" is always "you". This is the file to change before real users log in.
- `src/app/api/preview/[projectId]/` — same-origin proxy of a project's dev server; required by the visual editor.
- `src/app/api/visual-edit/[projectId]/apply` — turns visual-editor changes into real source edits (`src/lib/visual-edit*.ts`).
- `src/proxy.ts` — CORS/CSP boundary (Next "proxy", formerly middleware).
- `src/i18n/` — English-only `useT()` over `en.ts`, a copy of totalum-platform's dictionary with a few local values. Same key space, so platform components compile unchanged.

## Feature → where it lives

| Feature | Entry point | Notes |
|---|---|---|
| Home, hero prompt, project gallery | `src/app/page.tsx` | Submit → name dialog → `projects.launch` (create + first prompt in one call). "New" focuses the textarea; there is no empty-project form. |
| Figma in the hero (pending mode) | `page.tsx` + `FigmaModal` without `projectId` | Token validated by Figma, held in memory, sent as `figma.token` on `launch`, then dropped. |
| Workspace shell | `src/app/project/[projectId]/page.tsx` | Owns polling, the operation slot, all modals, the visual editor toggle. |
| Chat + composer tool tray | `components/workspace/ChatPanel.tsx` | Tray order: attach · Figma · GitHub · run options · edit visually. Run options (model / effort / fast mode) are per-project, per-tab and sent only when chosen. |
| Attachments | `components/workspace/AttachmentPreview.tsx`, `lib/attachments.ts`, `lib/composer-attachments.ts` | Image thumbnail or per-kind plate. ⌘/Ctrl+V attaches clipboard files. Previews confirmed with `decode()`, never `onError` (React 19). Workspace attachments are page state persisted per project; the hero's are raw `File`s and deliberately are not. History attachments come from the API's `files` field, URLs entity-decoded (see `decodeAttachments`). |
| Upload limits | `lib/upload.ts` (`MAX_UPLOAD_BYTES`), `api/vcaas/upload/[projectId]/route.ts` | **8 MB per file**, checked in the browser and again by the API. Keep the client constant ≤ the server's. |
| Stopping a run | `ChatPanel.tsx` → `ConfirmDialog` | Confirms first. The run is paid for and cannot be resumed. |
| Preview address bar | `components/workspace/PathPicker.tsx`, `lib/project-routes.ts`, `lib/source-archive-cache.ts` | Lists the project's own pages with type-ahead from `GET …/files/tree` (free, never the charged source download). `peekArchive` is a shim that always misses here, by design. |
| Waking a sleeping server | workspace page (`markWorkspaceTouched`, `autoStartedFor`) | An `Archived` sandbox is started when the user **touches** the project, not on page load. Header clicks (`[data-workspace-header]`) do not count. A refused action claims the wake instead of erroring: publish, pull, restore and the composer (`SERVER_NOT_READY` → the prompt and attachments go back in the box). |
| Wake / blocked UI | `PreviewPanel`, `use-server-wake.ts`, `ServerWakeNotice`, `ServerBlockedDialog` | `SERVER_NOT_READY` → wait strip, never a silent failure. |
| Code editor + rebuild | `CodePanel.tsx` | Monaco; save = `files.write`, then rebuild. |
| More tab | `components/workspace/v2/WorkspaceMore.tsx` → `MoreView.tsx` | The platform's "More" view: an aside of sections, the chosen one in place. Each section is the platform's own dialog rendered inline (`<InlineModals>` in `primitives/Modal`). Sections: Database, Analytics, Usage & limits, API keys (+ `.env`), Scheduled jobs, Secrets, Mobile, Payments, Custom domain, Logs, Settings. **New-engine projects only** (`isV2Project`); a legacy project gets a notice. |
| Database explorer | `components/workspace/database-v2/*`, `lib/{db-v2-form,sql-statement,db-backups,db-move}.ts` | The platform's v2 explorer: Dev/Live switch, tables, paged rows with search/sort, create/edit/delete rows, raw SQL and plain-language questions, schema, migrations, backups/restore, database settings. Calls `database/schema`, `database/rows`, `database/records`, `database/sql`, `database/ask`, `database/backups`… The legacy `tables-structure`/`query` explorer was removed. |
| Custom domain | `v2/ProjectDomainPanel.tsx` (More) and `DomainModal.tsx` (+ `DomainBuyPanel`, `DomainConnectGuide`, `settings/DomainManager`, `settings/DomainContactForm`) | Buy (`/domains/search`, `/domains/purchase` with `projectId`) or connect (`PUT …/domain`); bought domains: auto-renew, DNS records, forwarding, renew, transfer code, detach, attach a free one. **Prefix** (`canonicalHost`, `lib/domain-prefix.ts`, `DomainPrefixField`): `www` (default), `app`, any DNS label, or `apex`, picked on buy and attach; changing it = attaching the same domain to the same project again with another prefix (no second fee). The project's `customDomain` (same view as `GET …/projects/:id/domain`) carries `canonicalHost`, `hostnames[]` (each with its status, shown by `DomainHostnames`) and `accountDomainId`. The bare domain (role `alias`) 301s to `https://<prefix>.<domain>` through Totalum's redirect service; its row reads "Redirects to https://<site>" with its own status (active once it answers the 301). Its records (`A`/`AAAA` on the bare domain + `TXT _totalum-redirect.<domain>` = `<prefix>.<domain>`) come in `dnsRecordsToAdd` and render like any other record; `ApexRedirectNote` explains them (no ALIAS/ANAME wording). |
| New-engine banner | `v2/V2Banner.tsx` (+ `RunawayNotice`, `DeployErrorCard`) | Paused project (Resume), emergency stop, database move, last publish failed ("Ask the AI to fix", "Publish anyway" = `confirmDestructive`). |
| Run options | `RunOptionsMenu.tsx`, `lib/run-options.ts` | Legacy: model/effort/fast mode. New engine: the agent tier (Auto/Cheap/Normal/Expensive) only, via `optionsForEngine`. Also "Clear agent context". |
| Visual editor | `components/workspace/visual-editor/*` | Desktop only; refused until the live dev server is ready. |
| Versions, Secrets, Domain, GitHub, Figma, Logs | `*Modal.tsx`, `LogsPanel.tsx` (in a `Modal`) | Errands, not tabs. One `openModal` string in the page → never two at once. |
| Publish | `DeployControl.tsx` → `PublishedModal.tsx` | Dialog explains public URL, ~3 min, 1 credit; links to the domain modal. |
| Long operations banner | `use-project-operation.ts`, `OperationBanner.tsx`, `lib/project-operation.ts` | publish / rebuild / githubPull / restoreVersion / restartServer. One slot, persisted. |
| Export / import / duplicate | `ProjectTransferDialogs.tsx`, `lib/project-transfer.ts` | Import is destructive and rate-limited upstream. |
| Diff viewer | `DiffViewer.tsx`, `lib/diff-parse.ts` | Tries the stored patch first, then rebuilds from the commit. |

## Rules that are not obvious from the code

0. **Shims for copied platform code.** `components/credits/CreditsProvider.tsx` (`usePrice` from `GET /credit-costs`), `lib/usage.ts` (chart colours), and `i18n/en-more.ts` (the platform keys the More view needs, merged into `en` by `en.ts`; a local value always wins). Platform-internal routes are never called: the `.env` download has its own proxy route (`api/vcaas/env/[projectId]`, the upstream answers plain text).
   New storage keys use `STORAGE_PREFIX` from `brand.ts` (the database explorer's Dev/Live choice and SQL history).
1. **Files copied from totalum-platform stay verbatim in logic.** Most of `components/workspace/*`, `components/prompt/*`, `components/primitives/*`, `lib/{format,logs,domain-status,env-parse,diff-parse,github-repo}.ts` and `i18n/en.ts` came from totalum-platform via `ai-app-builder-open`. Fix logic bugs upstream first, then re-copy. Styling changes for this edition go through theme tokens and `brand.ts` wherever possible, so a re-copy does not undo them.
2. **Long operations belong to the page, not the modal or popover** that started them. Start with `operation.begin(kind)`; the page's bounded watcher ends it.
3. **Preview URL rule:** after every finished prompt, refetch the project and pick the URL named by `developmentUrlFieldToUse`; default to `temporalDevelopmentProjectUrl`. Never cache it.
4. **Agent runs and deploys are async.** Poll `agent/status` / `deployments/status` every 10–15 s; never assume completion from the start response.
5. **New endpoint?** Add the typed function in `vcaas.ts`, the type in `vcaas-types.ts`, and let the catch-all proxy carry it. Only add a dedicated route under `src/app/api/vcaas/` when the request is not plain JSON.
6. **New user-facing string?** Add the key to `en.ts`. Never re-copy `en.ts` wholesale from another repo: it carries deliberate local values. Copy individual keys, or diff afterwards and restore them.
7. **Mobile and desktop layouts are both mounted** in the workspace page (hidden by CSS). Only the desktop `PreviewPanel` gets `frameRef`; only the desktop `ChatPanel` gets the visual-editor pencil. Anything the composer *holds* must be page state passed down, never `useState` inside `ChatPanel`.
8. **The proxy holds an account-wide key and the app has no login.** Two load-bearing rules:
   - **Every proxied path must stay inside `/api/v1/vcaas/`.** `resolveVcaasUrl` in `vcaas-server.ts` refuses anything that escapes. Never build an upstream URL any other way.
   - **Any server route that fetches a client-supplied URL must call `publicUrlRejectionReason`** (async, resolves DNS) from `lib/safe-url.ts`, with `redirect: "error"` and a timeout. It covers IPv4-mapped IPv6 and every private range; a host allowlist does not.
9. **Brand strings come from `brand.ts`.** No literal product name in components, metadata or storage keys. Storage keys use the `STORAGE_PREFIX` exported there.
10. **Projects are always created on the new Totalum engine.** Every `projects.create` / `projects.launch` sends `engineVersion: "v2"` (any account, platform or API-only); never drop it. The import/duplicate create sends no engine: it follows its export code's engine, so a legacy `.zip` code makes a legacy project, and the import dialog says so (`transfer.import.legacyCode`).

## Dependencies & security

- **This UI ships no auth / payment / AI SDK.** It is a thin client in front of one key; those belong in boilerplate mode, added by the operator. Before adding a dependency, confirm it is actually imported.
- **Runtime deps** are UI/utility only: Next 16, React 19, Tailwind 4, Radix UI, `lucide-react`, `sonner`, `cmdk`, `next-themes`, cva/clsx/tailwind-merge, `@monaco-editor/react`, `react-hook-form`, `react-day-picker`, `fflate`.
- **Keep `npm audit` at zero.** A `dompurify` override pins the copy Monaco pulls in.

## Common next steps

- **Put real users behind it:** "Boilerplate mode" below; the guards live in `src/app/api/vcaas/_shared.ts`.
- **Rebrand:** `src/lib/brand.ts`, `src/components/brand/Logo.tsx`, `src/app/icon.svg`, tokens in `globals.css`. Remove `InsufficientCreditsModal`'s billing link before selling to customers; it points at the operator's account.
- **Add a workspace capability:** endpoint in the API reference → `vcaas.ts` + types → a `*Modal.tsx` (use `components/primitives/Modal`) → mount it in the workspace page under `openModal`.
- **Add a language:** replace the frozen `useLocale()` in `i18n/index.ts` with a provider and add `es.ts`.

## Adding an AI app builder to an existing product (any stack)

This repo is the reference implementation of the Totalum white-label offer
(https://www.totalum.app/whitelabel).

**A. Run it as-is beside your product.** Deploy on a subdomain (`builder.yourapp.com`), put your login in front, link to `/project/<id>`. Rebrand via `brand.ts`. Nothing else needs to change.

**B. Port the flow into your own stack.** The UI is optional; the contract is not. Mirror three things:
1. **A key-holding proxy** = `src/lib/vcaas-server.ts` + `src/app/api/vcaas/[...path]/route.ts`: forward method, path, query and body to `https://builder-api.totalum.app/api/v1/vcaas/<path>`, add `api-key: <your key>`, return the `{ errors, data }` envelope unchanged.
2. **The minimum flow:** `POST /projects/launch` → poll `GET /projects/:id/agent/status` every 10–15 s until `done` → `GET /projects/:id` and show the URL named by `developmentUrlFieldToUse` in an iframe → follow-ups with `POST /projects/:id/agent/start` → `POST /projects/:id/deployments/deploy` → poll `deployments/status`.
3. **Tenancy** = one project per customer. Store `projectId ↔ tenant`, check it on every proxied `/projects/<id>/` path, filter `GET /projects` by your own table.

## Boilerplate mode: login with Supabase, payments with Stripe

This is the "sell it under your brand" path: sign-up and login, a credit balance per
user, Stripe to top it up, and every project tied to the user who created it. Once
these steps are done the app is a resellable AI app builder with your name on it; the
platform side (hosting, databases, agent, domains) is already handled by the Totalum API.
See https://www.totalum.app/whitelabel for the program and pricing.

**Login and database**
1. `npm i @supabase/supabase-js @supabase/ssr`. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only).
2. Tables (RLS on): `profiles(user_id uuid pk, credits integer default 0)`, `projects(project_id text pk, user_id uuid, created_at)`.
3. `src/lib/supabase/server.ts`: `createServerClient` reading request cookies. A `/login` page with magic link or OAuth.
4. `_shared.ts`: `resolveVcaasContext()` reads the user from cookies and returns `401` when absent; `enforceProjectScope(team, method, path)` returns `403` when `path[0] === "projects" && path[1]` and the project is not the user's. Insert the returned `projectId` after `POST /projects` or `/projects/launch`.
5. **Wire the guards into every route.** Only `/api/preview/*` and `/api/visual-edit/*` call them today; the catch-all, `upload`, `source-code` and `git-diff` do not.
6. Filter the home page: intersect `vcaasApi.projects.list()` with the user's rows in the catch-all route for `GET /projects`.
7. Protect pages in `src/proxy.ts`: redirect `/` and `/project/*` to `/login` without a session.

**Payments**
1. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_*`.
2. `POST /api/billing/checkout`: Checkout Session with `client_reference_id = user.id`.
3. `POST /api/billing/webhook`: verify the signature; on `checkout.session.completed` / `invoice.paid`, `profiles.credits += pack_size`. Idempotent on the event id.
4. Gate spending in the catch-all before forwarding: on spend-shaped paths (`agent/start`, `projects/launch`, `deployments/deploy`, `versions/*/recover`, `agent/server/start-or-restart`, `domain`, `files/*`, `rebuild`) with `profiles.credits <= 0`, return `{ ok: false, code: "INSUFFICIENT_CREDITS" }` with 402. The UI opens `InsufficientCreditsModal`; point its URL at your checkout.
5. Meter per prompt when `agent/status` reports `done` (`creditsSpent` is on the response), or use Totalum's webhooks. Reconcile against `GET /api/v1/credits/spending-analytics?projectId=`.

## Boundaries

- ✅ Edit anything under `src/`, `README.md`, `AGENTS.md`, `.env.example`.
- ⚠️ Ask before: changing `_shared.ts` semantics, renaming `TOTALUM_VCAAS_API_KEY`, adding dependencies, replacing the theme with a dark one.
- 🚫 Never: commit `.env*` files or any `tlm_sk_` key; expose the key via `NEXT_PUBLIC_*`; call the Totalum API (`builder-api.totalum.app`) from client code; vendor the API docs; use Lovable's name as the product name, or its logo or screenshots; run publish/restore/delete against real projects to "test".

## Git

Human contributors read `CONTRIBUTING.md`; issues and PRs use the templates under `.github/`.

Small, single-purpose commits. User-visible changes get a line in `CHANGELOG.md` under Unreleased. Run `npm run build` before opening a PR. PR description: what changed, why, and how it was verified in the browser.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
