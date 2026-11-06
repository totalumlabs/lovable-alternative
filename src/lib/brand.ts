/**
 * ═══ THE ONE PLACE THE PRODUCT IS NAMED ═══════════════════════════════════════
 *
 * Every user-facing mention of the product, the meta title, the storage key prefix and
 * the outbound links read from here, so rebranding this edition is an edit to this
 * file plus `src/app/icon.svg` and `src/components/brand/Logo.tsx`.
 *
 * ⚠️ "Lovable" is somebody else's trademark. This project is an ALTERNATIVE to it; the
 * word must never become the product name, the wordmark or the favicon.
 */
export const BRAND = {
  /** The product name, as shown in the header, titles and dialogs. */
  name: "Creable",
  /** The hero heading on the home page. Keep it short: it is set at 48px. */
  tagline: "Build something you own",
  /** Placeholder of the main prompt box. */
  promptPlaceholder: "Ask Creable to create a landing page for my…",
  /** `<title>` and `og:title`. */
  metaTitle: "Creable — Open Source Lovable Alternative",
  /** Search snippet: keep under ~160 characters. */
  metaDescription:
    "Creable is an open source, self-hosted Lovable alternative. Describe an app, watch the AI build a full-stack Next.js app live, edit it visually, publish with one click.",
  repoUrl: "https://github.com/totalumlabs/lovable-alternative",
  docsUrl: "https://www.totalum.app/docs",
  apiKeyUrl: "https://www.totalum.app/api",
} as const;

/** Prefix of every localStorage / sessionStorage key this app writes. */
export const STORAGE_PREFIX = "creable";
