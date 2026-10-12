# Changelog

All notable changes to Creable are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- The Totalum API host is `builder-api.totalum.app` (`TOTALUM_API_URL` overrides it), and the builder follows the current engine's API: agent tiers instead of model/effort, publish with `confirmDestructive`, the new deployment status fields.
- The workspace's "Database" tab is now "More": database, analytics, usage and limits, project API keys and `.env`, scheduled jobs, secrets, mobile apps, payments, custom domain, logs and project settings. New-engine projects only.

### Removed
- The legacy database browser (`tables-structure`/`query`), replaced by the new SQL database explorer.

### Added
- Buy a custom domain from the builder, and manage a bought domain's DNS records, auto-renew, forwarding and transfer.
- Pick where a bought domain's site answers (`www.`, `app.`, any prefix, or the bare domain) when buying or attaching it, and move it to another prefix later at no extra fee. Each address of the custom domain shows its own status; the bare domain's redirect is shown as coming soon.
- Contribution guide, security policy, code of conduct, issue and PR templates, CI typecheck.
- JSDoc on every exported helper under `src/lib`.
- First public edition: the ai-app-builder-open engine restyled after the Lovable layout and palette.
- `src/lib/brand.ts` as the single place the product is named.
- README aimed at people looking for an open source Lovable alternative.
