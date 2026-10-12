"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { vcaasApi } from "@/lib/vcaas";
import { STORAGE_PREFIX } from "@/lib/brand";
import {
  CloneProjectDialog,
  ExportProjectDialog,
  ImportProjectDialog,
} from "@/components/workspace/ProjectTransferDialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FigmaModal } from "@/components/workspace/FigmaModal";
import { FigmaPromptButton } from "@/components/prompt/FigmaPromptButton";
import { AttachmentPreviews } from "@/components/workspace/AttachmentPreview";
import { filesFromClipboard } from "@/lib/attachments";
import { t } from "@/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Loader2, Trash2, X, ArrowRight, ArrowUp, Copy, Upload, Download, Github,
  Search, LayoutGrid, Table as TableIcon, ArrowUpDown, ChevronLeft, ChevronRight,
  AlertCircle, MoreHorizontal, AlertTriangle, LayoutDashboard, ShoppingBag, CalendarDays,
  Globe, KanbanSquare, BookOpen,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { toast } from "sonner";
import { uploadFilesToProjectDetailed, splitBySize, MAX_UPLOAD_MB, TOO_LARGE_ADVICE } from "@/lib/upload";
import { SetupBanners } from "@/components/SetupBanners";
import type { VcaasProjectSummary } from "@/lib/vcaas-types";

type ViewMode = "cards" | "table";
type SortKey = "date-desc" | "date-asc" | "name-asc" | "name-desc";

const PAGE_SIZE = 20;
const VIEW_MODE_KEY = `${STORAGE_PREFIX}:dashboard-view`;

/** What the empty prompt box types out, one idea after another. */
const PROMPT_IDEAS = [
  `Ask ${BRAND.name} to create a landing page for my…`,
  `Ask ${BRAND.name} to create a CRM with kanban boards…`,
  `Ask ${BRAND.name} to create an internal tool that…`,
  `Ask ${BRAND.name} to create a booking app for…`,
];

/** The suggestion chips under the box. Clicking one fills the prompt. */
const SUGGESTIONS = [
  { label: "SaaS dashboard", icon: LayoutDashboard, prompt: "A SaaS dashboard with user accounts, a projects table, usage charts and a settings page." },
  { label: "Online store", icon: ShoppingBag, prompt: "An online store with a product catalogue, cart, checkout with Stripe and an admin panel to manage products and orders." },
  { label: "Booking app", icon: CalendarDays, prompt: "A booking app for a small clinic: services, available slots per practitioner, customer bookings with email confirmation and an admin calendar." },
  { label: "Landing page", icon: Globe, prompt: "A landing page for a productivity app with a hero, features, pricing, testimonials, FAQ and a waitlist form saved to the database." },
  { label: "Kanban CRM", icon: KanbanSquare, prompt: "A CRM with a kanban pipeline for deals, contacts, notes and a dashboard with monthly revenue." },
  { label: "Blog", icon: BookOpen, prompt: "A blog with markdown posts, tags, an author page and an admin editor behind a login." },
];

/** "3d ago", "2h ago", "just now": the gallery's date, short enough for a card. */
function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/**
 * ⭐ THE TYPING PLACEHOLDER. Types one idea, pauses, deletes it, types the next. With
 * reduced motion it shows the first idea and stays still. It sits in an overlay so the
 * real `placeholder` is a single space and never fights the animation.
 */
function TypewriterPlaceholder({ phrases }: { phrases: string[] }) {
  const [text, setText] = useState(phrases[0] ?? "");
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setAnimate(true);
    let phrase = 0, pos = phrases[0]?.length ?? 0, deleting = false, timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const full = phrases[phrase];
      if (!deleting) {
        pos = Math.min(full.length, pos + 1);
        setText(full.slice(0, pos));
        if (pos === full.length) { deleting = true; timer = setTimeout(step, 2200); return; }
        timer = setTimeout(step, 38 + Math.random() * 40);
      } else {
        pos = Math.max(0, pos - 1);
        setText(full.slice(0, pos));
        if (pos === 0) { deleting = false; phrase = (phrase + 1) % phrases.length; timer = setTimeout(step, 350); return; }
        timer = setTimeout(step, 18);
      }
    };
    timer = setTimeout(step, 2200);
    return () => clearTimeout(timer);
  }, [phrases]);

  return <span className={animate ? "bb-caret" : undefined}>{text}</span>;
}

// --- Deterministic gradient + initials for the placeholder thumbnail ---
const GRADIENTS: [string, string][] = [
  ["#6366f1", "#a855f7"], ["#0ea5e9", "#22d3ee"], ["#f43f5e", "#f97316"],
  ["#10b981", "#22d3ee"], ["#8b5cf6", "#ec4899"], ["#f59e0b", "#ef4444"],
  ["#3b82f6", "#8b5cf6"], ["#14b8a6", "#10b981"],
];
function gradientFor(id: string): [string, string] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}
/**
 * ═══⭐⭐⭐ THE PROJECT TILE — A SCREENSHOT, NOT A LIVE APP ═══════════════════
 *
 * ⚠️⚠️ THIS USED TO BE AN `<iframe>` PER PROJECT, scaled down to thumbnail size, plus a
 * `GET /projects/{id}` per tile to decide whether to render it. On a dashboard with
 * twenty projects that is twenty extra API calls and twenty third-party documents booted
 * in the background — each one running its own JavaScript, fonts and network requests —
 * to produce a picture. It also showed nothing at all for any project that had never been
 * published, because an unpublished project has no production URL to frame.
 *
 * ⭐ THE LIST ALREADY CARRIES THE PICTURE. `GET /projects` returns `previewImageUrl` on
 * every item: a screenshot of the project's home page that upstream retakes whenever a
 * prompt finishes. One request, already made, and it reflects the DEVELOPMENT state — so
 * a project that has never been published still shows what it looks like.
 *
 * ⚠️ IT IS ABSENT UNTIL THE FIRST PROMPT COMPLETES, and that is the fallback below: the
 * project's own name on a coloured plate. Not initials — the name, because on a dashboard
 * the thing you are looking for is what you called it.
 *
 * ⚠️ LOADING IS CONFIRMED WITH `decode()`, NOT WITH `onLoad`. In React 19 an `<img>` that
 * is already in the browser cache can commit with the load event long since fired, and
 * the handler never runs — the tile would sit on its placeholder for ever. `decode()`
 * resolves either way and rejects on a broken image, which is exactly the question here.
 */
function ProjectThumbnail({
  project, variant = "card",
}: {
  project: { projectId: string; label?: string; previewImageUrl?: string | null };
  variant?: "card" | "row";
}) {
  const { projectId, previewImageUrl } = project;
  const name = project.label || projectId;
  const [state, setState] = useState<"idle" | "ready" | "failed">("idle");
  const [c1, c2] = gradientFor(projectId);
  const isRow = variant === "row";

  useEffect(() => {
    setState("idle");
    if (!previewImageUrl) return;
    let cancelled = false;
    const img = new Image();
    img.src = previewImageUrl;
    img
      .decode()
      .then(() => { if (!cancelled) setState("ready"); })
      .catch(() => { if (!cancelled) setState("failed"); });
    return () => { cancelled = true; };
  }, [previewImageUrl]);

  const placeholder = (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-surface-base px-3">
      <div className={`flex items-center gap-2 ${isRow ? "" : "rounded-xl bg-surface-2 px-3 py-2 shadow-card"}`}>
        <span className="size-2 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }} />
        <span
          className={`text-center font-medium leading-tight tracking-tight text-ink-2 break-words ${isRow ? "text-[9px] line-clamp-1" : "text-xs line-clamp-2"}`}
          title={name}
        >
          {name}
        </span>
      </div>
      {!isRow && <LogoMark size={40} className="absolute -bottom-2 -right-2 opacity-[0.12]" />}
    </div>
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-base">
      {previewImageUrl && state !== "failed" ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewImageUrl}
            alt={name}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover object-top transition-opacity duration-300 ${state === "ready" ? "opacity-100" : "opacity-0"}`}
          />
          {/* Until the bytes are decoded the plate stands in, so the tile never flashes empty. */}
          {state !== "ready" && <div className="absolute inset-0">{placeholder}</div>}
        </>
      ) : (
        placeholder
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<VcaasProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // First-prompt "Build" flow
  const [firstPrompt, setFirstPrompt] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; imageDescription: string; file: File }[]>([]);
  const [uploading, setUploading] = useState(false);
  const heroTextareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * ═══⭐ "NEW PROJECT" FOCUSES THE BOX — IT DOES NOT OPEN A FORM ═══════════════
   *
   * The hero composer IS the create form: what you type there becomes the project's
   * first prompt, and the name is asked for on submit. A second "Create project" dialog
   * with an id and a description field made an empty project that then sat there with
   * nothing happening inside it. So the button does what the platform's "New project"
   * tile does: puts the caret in the textarea and scrolls it into view.
   */
  const focusComposer = useCallback(() => {
    const el = heroTextareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
  }, []);

  /**
   * ═══⭐ FIGMA BEFORE THE PROJECT EXISTS — "PENDING MODE" ═══════════════════════
   *
   * The Figma button sits in the hero's tool tray, exactly as in totalum-platform, but
   * there is no project to store a token on yet. So `FigmaModal` (with no `projectId`)
   * only asks Figma whether the token is good and hands it back; it is held HERE, in
   * memory, and connected the moment the project exists — before the first prompt runs,
   * because a design link in that prompt would otherwise be read by an agent that cannot
   * reach Figma.
   *
   * ⚠️ A LIVE CREDENTIAL IN COMPONENT STATE. Used once, then dropped: never a store, never
   * a cookie, never a log. "Forgetting" it is the only disconnect there can be at this
   * point, and that is what the popover's disconnect does.
   */
  const [figmaToken, setFigmaToken] = useState<string | null>(null);
  const [figmaModalOpen, setFigmaModalOpen] = useState(false);

  /** A Figma link from the popover lands in the box, appended to whatever is there. */
  const appendToPrompt = useCallback((text: string) => {
    setFirstPrompt((current) => {
      const separator = current.length === 0 || /\s$/.test(current) ? "" : " ";
      return current + separator + text;
    });
    requestAnimationFrame(() => {
      const el = heroTextareaRef.current;
      if (el) { el.focus(); const len = el.value.length; el.setSelectionRange(len, len); }
    });
  }, []);

  // Name modal (opened after clicking Build)
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [buildName, setBuildName] = useState("");
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildCreating, setBuildCreating] = useState(false);

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // List controls
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date-desc");
  const [viewMode, setViewMode] = useState<ViewMode | null>(null);
  const [page, setPage] = useState(1);

  // Whether the Totalum VCaaS API key is configured (null = still checking).
  // When false we show the setup banners instead of nagging with API errors.
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    api.get<{ configured: boolean }>("/api/config").then((r) => {
      setKeyConfigured(r.ok && r.data ? r.data.configured : false);
    });
  }, []);

  /*
    ⚠️ THE PER-TILE `GET /projects/{id}` CACHE THAT LIVED HERE IS GONE. It existed only to
    ask "has this been published?" before framing its production URL — a question the
    dashboard no longer needs to ask, because `GET /projects` already returns
    `previewImageUrl` for every project. One list request now does what one list request
    plus N detail requests used to.
  */

  /**
   * ═══⭐⭐ MOVING A PROJECT AROUND — EXPORT · IMPORT · DUPLICATE ════════════
   *
   * The three dialogs are totalum-platform's, copied whole, and so is the model behind
   * them (`src/lib/project-transfer.ts`):
   *
   *  · EXPORT packages the database and a source reference into a secret `importCode`.
   *    The code never expires — but it dies with its source project, because what it
   *    points at is that project's files.
   *  · IMPORT restores a code INTO a project, and is DESTRUCTIVE: whatever is in the
   *    target is dropped first, and upstream refuses a target that is not nearly empty.
   *    So the dialog creates a fresh project and imports into that.
   *  · DUPLICATE is those two behind one button — export, create, import — which is why
   *    it shows three steps and costs the sum of both.
   *
   * ⚠️ THEY COST CREDITS AND ARE RATE-LIMITED (1 per minute, 5 per hour, per account).
   * A retry loop without a backoff turns one failure into an hour of them.
   */
  const [exportTarget, setExportTarget] = useState<string | null>(null);
  const [cloneTarget, setCloneTarget] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  /** The availability check the dialogs run before creating: names already in use here. */
  const takenNames = useMemo(
    () => new Set(projects.map((p) => p.projectId)),
    [projects]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await vcaasApi.projects.list();
    if (res.ok && res.data) {
      const list = Array.isArray(res.data) ? res.data : [];
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setProjects(list);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Load persisted view mode once on mount.
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(VIEW_MODE_KEY) : null;
    if (stored === "cards" || stored === "table") setViewMode(stored);
  }, []);

  // If the user hasn't chosen a view yet, default to table when there are many
  // projects (>20), otherwise cards.
  useEffect(() => {
    if (loading || viewMode !== null) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem(VIEW_MODE_KEY) : null;
    if (stored === "cards" || stored === "table") { setViewMode(stored); return; }
    setViewMode(projects.length > 20 ? "table" : "cards");
  }, [loading, viewMode, projects.length]);

  const chooseView = (mode: ViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* ignore */ }
  };

  // Reset to first page whenever filters/sort change.
  useEffect(() => { setPage(1); }, [search, sortKey, viewMode]);

  // --- Derived: filtered → sorted → paginated ---
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = projects;
    if (q) list = projects.filter((p) =>
      p.projectId.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q)
    );
    const sorted = [...list].sort((a, b) => {
      switch (sortKey) {
        case "date-asc": return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "name-asc": return a.projectId.localeCompare(b.projectId);
        case "name-desc": return b.projectId.localeCompare(a.projectId);
        case "date-desc":
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    return sorted;
  }, [projects, search, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const resolvedView: ViewMode = viewMode ?? (projects.length > 20 ? "table" : "cards");

  // --- Create helpers ---
  const normalizeId = (raw: string) =>
    raw.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]/, "a").slice(0, 35);

  const suggestName = (prompt: string) => {
    const words = prompt.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean).slice(0, 4).join("-");
    const base = words.length >= 3 ? words : `app-${words}`;
    return normalizeId(base) || "my-app";
  };

  // Step 1 of the Build flow: open the name modal so the user picks a project name.
  const openBuildModal = () => {
    if (!firstPrompt.trim() && attachedFiles.length === 0) return;
    setBuildName(suggestName(firstPrompt));
    setBuildError(null);
    setNameModalOpen(true);
  };

  // Step 2: create the project with the chosen name, then carry the prompt over
  // to the workspace where it is auto-submitted to the chat.
  const confirmBuild = async () => {
    const id = normalizeId(buildName);
    if (id.length < 3) { setBuildError("Project name must be at least 3 characters (lowercase, hyphens allowed)."); return; }
    setBuildCreating(true);
    setBuildError(null);

    /**
     * ═══⭐⭐⭐ ONE CALL: CREATE THE PROJECT AND START BUILDING ═════════════════
     *
     * `POST /projects/launch` does what this flow used to do in three steps — create,
     * navigate, auto-submit the prompt from `sessionStorage` — and closes the window in
     * which a project existed with nothing happening inside it.
     *
     * ⚠️ A TAKEN NAME IS NO LONGER AN ERROR. Upstream resolves it (`my-app` → `my-app-x7`)
     * and tells us which id it actually used, so the old "this name is probably already
     * taken, choose another" dead end is gone. We navigate to `data.projectId`, never to
     * the slug we asked for.
     *
     * ⚠️ ATTACHMENTS STILL TAKE THE LONG ROAD, and they have to: `launch` accepts files by
     * URL, and a `blob:` URL from this browser means nothing to the agent. Uploading needs
     * a project to exist, so with attachments we create first, upload, and let the
     * workspace send the prompt — the path this flow always used.
     */
    if (attachedFiles.length === 0) {
      /**
       * ⭐ FIGMA RIDES ALONG. `launch` connects the account BEFORE the first prompt runs,
       * which is the whole point of holding the token until now. A failed connect does
       * not fail the launch — it comes back as a `figma` warning, surfaced below.
       */
      const launched = await vcaasApi.projects.launch({
        projectId: id,
        // Every project this app creates is on the new Totalum engine, whatever the account.
        engineVersion: "v2",
        prompt: firstPrompt.trim(),
        description: firstPrompt.trim().slice(0, 200),
        ...(figmaToken ? { figma: { token: figmaToken } } : {}),
      });
      // Used once, then gone — see the note on the state.
      setFigmaToken(null);

      if (!launched.ok || !launched.data) {
        setBuildError(launched.error || `Could not create "${id}". Please try a different name.`);
        setBuildCreating(false);
        return;
      }

      const created = launched.data.projectId;
      if (launched.data.requestedProjectId && launched.data.requestedProjectId !== created) {
        toast.info(`"${launched.data.requestedProjectId}" was taken — your project is "${created}".`);
      }
      /**
       * ⚠️ THE PROJECT CAN EXIST WITHOUT THE RUN HAVING STARTED — that is what
       * `agent.started === false` and the `warnings` array are for. Stashing the prompt
       * then lets the workspace send it on arrival, so the user still ends up where they
       * expected instead of in an empty project with no explanation.
       */
      if (!launched.data.agent?.started) {
        launched.data.warnings?.forEach(w => {
          const message = w?.errorMessage || w?.message;
          if (w?.step !== "figma" && message) toast.warning(message);
        });
        try {
          sessionStorage.setItem(`${STORAGE_PREFIX}:pendingPrompt:${created}`, firstPrompt.trim());
        } catch { /* ignore */ }
      }
      if (launched.data.warnings?.some(w => w?.step === "figma")) {
        toast.warning(t("workspace.figma.pendingConnectFailed"));
      }
      router.push(`/project/${created}`);
      return;
    }

    const res = await vcaasApi.projects.create({
      projectId: id,
      description: firstPrompt.trim().slice(0, 200),
      engineVersion: "v2",
    });
    if (!res.ok) {
      setBuildError(res.error || `Could not create "${id}".`);
      setBuildCreating(false);
      return;
    }
    /**
     * ⚠️ THE CREATED ID, NOT THE REQUESTED ONE. A taken name is no longer an error:
     * the API creates `my-app-k7` and says so, and every call from here on — Figma,
     * the uploads, the stash, the navigation — must go to the project that exists.
     */
    const requested = id;
    const id2 = res.data?.projectId || requested;
    if (id2 !== requested) toast.info(`"${requested}" was taken — your project is "${id2}".`);
    /**
     * ⭐ CONNECT FIGMA NOW THAT THERE IS A PROJECT — before the prompt is stashed, since
     * the workspace runs it on arrival. A failure here does not fail the creation: the
     * project exists and has been paid for, so say Figma did not connect and move on.
     */
    if (figmaToken) {
      const figma = await vcaasApi.figma.connect(id2, { token: figmaToken });
      setFigmaToken(null);
      if (!figma.ok) toast.warning(t("workspace.figma.pendingConnectFailed"), { description: figma.error || undefined });
    }
    // Upload the attachments so the agent gets real, publicly-fetchable URLs (blob URLs
    // from the browser can't be read by the agent and don't survive navigation). The
    // upload endpoint needs the project to exist first, which is why this runs after
    // creation.
    let uploadedFiles: { name: string; url: string; imageDescription: string }[] = [];
    setUploading(true);
    // Retries built in — a just-created project's storage can need a moment.
    const upload = await uploadFilesToProjectDetailed(id2, attachedFiles.map((f) => f.file));
    uploadedFiles = upload.uploaded;
    setUploading(false);
    // ⚠️ NAME THE FILE AND THE REASON. "Some attachments could not be uploaded" left the
    // user guessing which of four photos the agent will never see, and why.
    for (const failure of upload.failed) {
      toast.error(`${failure.name}: ${failure.reason}`, { description: "The agent will not see this file." });
    }
    // Stash the first prompt (and uploaded files, with real URLs) so the workspace auto-submits it.
    try {
      sessionStorage.setItem(`${STORAGE_PREFIX}:pendingPrompt:${id2}`, firstPrompt.trim());
      if (uploadedFiles.length > 0) sessionStorage.setItem(`${STORAGE_PREFIX}:pendingFiles:${id2}`, JSON.stringify(uploadedFiles));
    } catch { /* ignore */ }
    router.push(`/project/${id2}`);
  };

  // Keep the raw File objects around — we can't upload here because the project
  // doesn't exist yet, and blob URLs die on navigation. The real upload happens in
  // confirmBuild once the project is created (see uploadFilesToProject).
  /**
   * ⭐ THE SIZE IS CHECKED AT ATTACH TIME, NOT AT BUILD TIME. Nothing is uploaded from
   * this screen — the project does not exist yet — so an oversized file would otherwise
   * sit in the tray looking fine and be dropped minutes later, after the project was
   * created and the user had walked away.
   */
  const attachLocalFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const { allowed, tooLarge } = splitBySize(files);
    if (tooLarge.length === 1) {
      toast.error(t("prompt.attachments.tooLarge", { name: tooLarge[0].name, size: MAX_UPLOAD_MB }), { description: TOO_LARGE_ADVICE });
    } else if (tooLarge.length > 1) {
      toast.error(t("prompt.attachments.tooLargeMany", { count: tooLarge.length, size: MAX_UPLOAD_MB }), { description: TOO_LARGE_ADVICE });
    }
    if (allowed.length === 0) return;
    setAttachedFiles((prev) => [...prev, ...allowed.map((file) => ({ name: file.name, imageDescription: file.name, file }))]);
  }, [t]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    attachLocalFiles(files);
    e.target.value = "";
  };

  /**
   * ⭐ ⌘/Ctrl+V ATTACHES WHAT IS ON THE CLIPBOARD — a screenshot, or a file copied in
   * the file manager. Same rule as the workspace chat: `filesFromClipboard` refuses when
   * the clipboard carries real text, so a Word or Excel paste stays text.
   */
  const handleHeroPaste = useCallback((event: React.ClipboardEvent) => {
    const pasted = filesFromClipboard(event.clipboardData);
    if (!pasted.length) return;
    event.preventDefault();
    attachLocalFiles(pasted);
  }, [attachLocalFiles]);

  // Perform the actual deletion once the user confirms in the modal.
  const confirmDelete = async () => {
    const projectId = deleteTarget;
    if (!projectId) return;
    setDeleting(true);
    const res = await vcaasApi.projects.remove(projectId);
    if (res.ok) {
      toast.success("Project deleted");
      setProjects((prev) => prev.filter((p) => p.projectId !== projectId));
      setDeleteTarget(null);
    } else {
      toast.error(res.error || "Failed to delete project");
    }
    setDeleting(false);
  };

  const hasProjects = projects.length > 0;

  return (
    <div className="min-h-screen bg-surface-1 text-ink">
      {/*
        ═══ THE HOME: A PROMPT BOX ON THE WASH, PROJECTS ON A SHEET BELOW ══════════
        The layout people switching from Lovable already know: a transparent nav, one
        heading, one big rounded prompt box centred on the brand-gradient wash, a row of
        suggestion chips, and the project gallery on a white sheet that rises over the
        bottom of the gradient. Nothing else competes with the box.
      */}
      <div className="bb-hero-wash">
        <header className="h-16">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
            <Logo />
            <nav className="flex items-center gap-1">
              <a href={BRAND.docsUrl} target="_blank" rel="noopener noreferrer" className="hidden h-8 items-center rounded-lg px-2.5 text-sm text-ink-2 transition-colors hover:bg-black/5 sm:inline-flex">Docs</a>
              <a href={BRAND.repoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-ink-2 transition-colors hover:bg-black/5">
                <Github className="size-4" /> <span className="hidden sm:inline">GitHub</span>
              </a>
              <a href={BRAND.apiKeyUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm text-primary-foreground transition-opacity hover:opacity-90">Get API key</a>
            </nav>
          </div>
        </header>

        <section className={`flex flex-col items-center px-5 text-center sm:px-8 ${hasProjects ? "pt-14 pb-16 sm:pt-20 sm:pb-20" : "min-h-[calc(100dvh-4rem)] justify-center pb-24"}`}>
          {!loading && (
            <div className="w-full max-w-[820px]">
              <h1 className="text-balance text-[32px]/[1.1] font-semibold tracking-display text-ink sm:text-5xl/[1.1]">
                {BRAND.tagline}
              </h1>
              <p className="mt-2 text-base text-ink-2 sm:text-lg">
                Describe an app. The AI builds it, hosts it and publishes it. You keep the code.
              </p>

              {/* ── The prompt box ── */}
              <div className="mt-8 rounded-[28px] bg-surface-2 p-3 text-left shadow-card ring-1 ring-black/[0.04] transition-[box-shadow] duration-500 ease-out focus-within:ring-black/[0.16]">
                <div className="relative">
                  <textarea
                    ref={heroTextareaRef}
                    value={firstPrompt}
                    onChange={(e) => setFirstPrompt(e.target.value)}
                    placeholder=" "
                    aria-label="Describe the app you want to build"
                    className="peer block max-h-[35svh] min-h-[44px] w-full resize-none bg-transparent p-2 text-base leading-snug text-ink outline-none"
                    rows={2}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); openBuildModal(); } }}
                    onPaste={handleHeroPaste}
                  />
                  {firstPrompt.length === 0 && (
                    <div className="pointer-events-none absolute inset-x-0 top-0 p-2 text-base leading-snug text-ink-4 peer-focus:text-ink-4/70">
                      <TypewriterPlaceholder phrases={PROMPT_IDEAS} />
                    </div>
                  )}
                </div>
                <AttachmentPreviews
                  className="px-2 pb-1"
                  items={attachedFiles.map((f) => ({ name: f.name, file: f.file, type: f.file.type, size: f.file.size }))}
                  onRemove={(index) => setAttachedFiles((prev) => prev.filter((_, j) => j !== index))}
                />
                <div className="mt-1 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <label
                      className="bb-hairline inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:bg-muted"
                      title="Attach images or files"
                    >
                      <input type="file" multiple className="hidden" onChange={handleFileSelect} accept="image/*,.pdf,.svg" />
                      {uploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                      <span className="sr-only">Attach</span>
                    </label>
                    {/* ⭐ Figma in the hero tray — pending mode, see `figmaToken`. */}
                    <FigmaPromptButton
                      onAdd={appendToPrompt}
                      hasText={firstPrompt.trim().length > 0}
                      onConnect={() => setFigmaModalOpen(true)}
                      connected={!!figmaToken}
                      onDisconnect={() => {
                        setFigmaToken(null);
                        toast.success(t("workspace.figma.pendingForgotten"));
                      }}
                      disconnectConfirm={t("workspace.figma.disconnectPendingConfirm")}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden text-xs text-ink-4 sm:inline">Enter to build · Shift+Enter for a new line</span>
                    <button
                      onClick={openBuildModal}
                      disabled={!firstPrompt.trim() && attachedFiles.length === 0}
                      aria-label="Build"
                      className={`inline-flex size-8 items-center justify-center rounded-full text-white transition-colors ${firstPrompt.trim() || attachedFiles.length > 0 ? "bg-primary hover:opacity-90" : "bg-ink-4"}`}
                    >
                      <ArrowUp className="size-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Suggestions ── */}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => { setFirstPrompt(s.prompt); requestAnimationFrame(() => heroTextareaRef.current?.focus()); }}
                    className="bb-hairline inline-flex h-8 items-center gap-1.5 rounded-full bg-white/60 px-3 text-sm text-ink-2 backdrop-blur-sm transition-colors hover:bg-white"
                  >
                    <s.icon className="size-3.5 text-ink-3" />
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Setup guidance, right under the prompt, only when the key is missing */}
              {keyConfigured === false && <div className="text-left"><SetupBanners /></div>}
            </div>
          )}
          {loading && (
            <div className="w-full max-w-[820px]">
              <Skeleton className="mx-auto h-12 w-2/3 rounded-xl bg-white/40" />
              <Skeleton className="mt-8 h-32 w-full rounded-[28px] bg-white/50" />
            </div>
          )}
        </section>

      {/* ═══ THE PROJECTS SHEET, rising over the bottom of the wash ═══ */}
      {(hasProjects || loading) && (
        <section className="relative z-10 mx-3 min-h-[45vh] rounded-t-[28px] bg-surface-2 px-4 pt-5 pb-16 shadow-card sm:mx-6 sm:px-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Segmented tabs, the reference's "My projects" pill */}
            <div className="inline-flex h-11 items-center gap-1 self-start rounded-full bg-muted/60 p-1">
              <span className="bb-hairline inline-flex h-9 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm text-ink">
                My projects
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs text-ink-3" data-tabular>{filtered.length}</span>
              </span>
            </div>

            <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
              <div className="relative min-w-[160px] flex-1 sm:w-56 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects"
                  className="bb-hairline h-9 w-full rounded-full bg-surface-2 pl-9 pr-8 text-sm text-ink outline-none placeholder:text-ink-4 focus:ring-2 focus:ring-brand/30"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-2" aria-label="Clear search">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <div className="relative">
                <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="bb-hairline h-9 cursor-pointer appearance-none rounded-full bg-surface-2 pl-9 pr-7 text-sm text-ink-2 outline-none focus:ring-2 focus:ring-brand/30"
                  aria-label="Sort projects"
                >
                  <option value="date-desc">Newest first</option>
                  <option value="date-asc">Oldest first</option>
                  <option value="name-asc">Name A–Z</option>
                  <option value="name-desc">Name Z–A</option>
                </select>
              </div>

              <div className="bb-hairline flex h-9 items-center rounded-full bg-surface-2 p-1" role="group" aria-label="View">
                <button onClick={() => chooseView("cards")} title="Grid" aria-pressed={resolvedView === "cards"}
                  className={`flex size-7 items-center justify-center rounded-full transition-colors ${resolvedView === "cards" ? "bg-muted text-ink" : "text-ink-4 hover:text-ink-2"}`}>
                  <LayoutGrid className="size-3.5" />
                </button>
                <button onClick={() => chooseView("table")} title="List" aria-pressed={resolvedView === "table"}
                  className={`flex size-7 items-center justify-center rounded-full transition-colors ${resolvedView === "table" ? "bg-muted text-ink" : "text-ink-4 hover:text-ink-2"}`}>
                  <TableIcon className="size-3.5" />
                </button>
              </div>

              {/* ⭐ IMPORT: creates a fresh project and restores a code INTO it. */}
              <button onClick={() => setImportOpen(true)} title="Import a project from a code"
                className="bb-hairline inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm text-ink-2 transition-colors hover:bg-muted">
                <Download className="size-3.5" /> <span className="hidden sm:inline">Import</span>
              </button>

              {/* ⭐ New project = focus the composer. See `focusComposer`. */}
              <button onClick={focusComposer} title="New project"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm text-primary-foreground transition-opacity hover:opacity-90">
                <Plus className="size-3.5" /> <span>New</span>
              </button>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="aspect-[16/10] rounded-2xl bg-muted/60" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-ink-3">
              <Search className="mx-auto mb-2 size-8 text-ink-4" />
              <p className="text-sm">No projects match &ldquo;{search}&rdquo;</p>
            </div>
          ) : resolvedView === "cards" ? (
            /* ── GRID ── */
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pageItems.map((p) => (
                <Link key={p.projectId} href={`/project/${p.projectId}`} className="group block">
                  <div className="bb-hairline relative aspect-[16/10] overflow-hidden rounded-2xl bg-surface-base transition-shadow group-hover:shadow-card">
                    <ProjectThumbnail project={p} />
                    <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            title="Options"
                            aria-label={`Options for ${p.label || p.projectId}`}
                            className="bb-hairline flex size-8 items-center justify-center rounded-full bg-white/90 text-ink-2 backdrop-blur-sm transition-colors hover:bg-white"
                          >
                            <MoreHorizontal className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-2xl" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem className="cursor-pointer" onSelect={(e) => { e.preventDefault(); setCloneTarget(p.projectId); }}>
                            <Copy className="mr-2 size-3.5" /> Remix
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onSelect={(e) => { e.preventDefault(); setExportTarget(p.projectId); }}>
                            <Upload className="mr-2 size-3.5" /> Export…
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onSelect={(e) => { e.preventDefault(); setDeleteTarget(p.projectId); }}>
                            <Trash2 className="mr-2 size-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="mt-3 px-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-[15px] font-medium text-ink">{p.label || p.projectId}</h3>
                      <span className="shrink-0 text-xs text-ink-4" data-tabular>{formatRelative(p.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-3">{p.description || p.projectId}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            /* ── LIST ── */
            <div className="bb-hairline overflow-hidden rounded-2xl bg-surface-2">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-hairline text-xs text-ink-3">
                      <th className="w-20 px-4 py-2.5 font-normal">Preview</th>
                      <th className="px-2 py-2.5 font-normal">Project</th>
                      <th className="hidden px-2 py-2.5 font-normal md:table-cell">Description</th>
                      <th className="whitespace-nowrap px-2 py-2.5 font-normal">Created</th>
                      <th className="w-10 px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((p) => (
                      <tr key={p.projectId} onClick={() => router.push(`/project/${p.projectId}`)}
                        className="group cursor-pointer border-b border-hairline transition-colors last:border-0 hover:bg-muted/50">
                        <td className="px-4 py-2">
                          <div className="bb-hairline h-9 w-14 overflow-hidden rounded-lg bg-surface-base">
                            <ProjectThumbnail project={p} variant="row" />
                          </div>
                        </td>
                        <td className="px-2 py-2"><span className="text-sm font-medium text-ink">{p.label || p.projectId}</span></td>
                        <td className="hidden px-2 py-2 md:table-cell"><span className="line-clamp-1 max-w-[320px] text-sm text-ink-3">{p.description || "No description"}</span></td>
                        <td className="whitespace-nowrap px-2 py-2"><span className="text-sm text-ink-3" data-tabular>{new Date(p.createdAt).toLocaleDateString()}</span></td>
                        <td className="px-4 py-2 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} title="Options"
                                className="inline-flex size-8 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-muted hover:text-ink">
                                <MoreHorizontal className="size-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 rounded-2xl" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem className="cursor-pointer" onSelect={(e) => { e.preventDefault(); setCloneTarget(p.projectId); }}>
                                <Copy className="mr-2 size-3.5" /> Remix
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer" onSelect={(e) => { e.preventDefault(); setExportTarget(p.projectId); }}>
                                <Upload className="mr-2 size-3.5" /> Export…
                              </DropdownMenuItem>
                              <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onSelect={(e) => { e.preventDefault(); setDeleteTarget(p.projectId); }}>
                                <Trash2 className="mr-2 size-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {filtered.length > PAGE_SIZE && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page"
                className="bb-hairline flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
                <ChevronLeft className="size-4" />
              </button>
              <span className="px-2 text-sm text-ink-3" data-tabular>Page {safePage} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} aria-label="Next page"
                className="bb-hairline flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </section>
      )}
      </div>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-xs text-ink-4 sm:flex-row">
        <span>{BRAND.name} is open source under MIT. Not affiliated with Lovable Labs.</span>
        <span className="flex items-center gap-3">
          <a href={BRAND.repoUrl} target="_blank" rel="noopener noreferrer" className="hover:text-ink-2">Source</a>
          <a href={BRAND.docsUrl} target="_blank" rel="noopener noreferrer" className="hover:text-ink-2">API docs</a>
        </span>
      </footer>

      {/* Name modal for the Build flow */}
      <Dialog open={nameModalOpen} onOpenChange={(o) => { if (!buildCreating) setNameModalOpen(o); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Name your project</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-ink-3">Choose a name for your project. It becomes part of its URL.</p>
            <div>
              <Label>Project name</Label>
              <Input
                autoFocus
                placeholder="my-awesome-app"
                value={buildName}
                onChange={(e) => { setBuildName(e.target.value); if (buildError) setBuildError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !buildCreating) confirmBuild(); }}
                className="mt-1.5"
              />
              <p className="text-xs text-ink-4 mt-1">3-35 chars, lowercase, hyphens allowed. Final id: <span className="font-mono text-ink-3">{normalizeId(buildName) || "…"}</span></p>
            </div>
            {buildError && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{buildError}</span>
              </div>
            )}
            <Button className="w-full" onClick={confirmBuild} disabled={buildCreating || normalizeId(buildName).length < 3}>
              {buildCreating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating...</> : <><ArrowRight className="w-4 h-4 mr-2" /> Create & Build</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Beautiful destructive confirmation modal */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md overflow-hidden p-0 gap-0">
          {/* Red accent header */}
          <div className="relative bg-destructive/10 px-6 pt-7 pb-6 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-surface-2 shadow-card">
              <AlertTriangle className="size-7 text-destructive" />
            </div>
            <DialogHeader className="mt-4">
              <DialogTitle className="text-center text-lg font-semibold text-ink">Delete this project?</DialogTitle>
            </DialogHeader>
          </div>

          <div className="px-6 py-5 space-y-4">
            <p className="text-center text-sm leading-relaxed text-ink-2">
              You&rsquo;re about to permanently delete{" "}
              <span className="break-all font-mono font-semibold text-ink">{deleteTarget}</span>.
            </p>
            <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>This action is <strong>irreversible</strong>. Once deleted, the project and all its data cannot be recovered.</span>
            </div>

            <div className="flex gap-2.5 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive" className="flex-1"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting...</>
                ) : (
                  <><Trash2 className="w-4 h-4 mr-2" /> Delete forever</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/*
        ⭐ FIGMA, PENDING MODE — no `projectId`. The modal validates the token against Figma
        and hands it back; nothing is stored until `confirmBuild` connects it to the project
        it just made. Reusing the modal is deliberate: the how-to steps, the scopes and the
        security note are the reason people trust pasting a token.
      */}
      <FigmaModal
        open={figmaModalOpen}
        onOpenChange={setFigmaModalOpen}
        onStatusChange={() => { /* no project yet — `figmaToken` drives the tint */ }}
        onPendingToken={token => setFigmaToken(token)}
      />

      {/* ═══ EXPORT · IMPORT · DUPLICATE — totalum-platform's dialogs, unchanged ═══ */}
      <ExportProjectDialog
        open={exportTarget !== null}
        onOpenChange={open => {
          if (!open) setExportTarget(null);
        }}
        projectId={exportTarget ?? ""}
      />
      <ImportProjectDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        takenNames={takenNames}
        onImported={fetchData}
      />
      <CloneProjectDialog
        open={cloneTarget !== null}
        onOpenChange={open => {
          if (!open) setCloneTarget(null);
        }}
        projectId={cloneTarget ?? ""}
        takenNames={takenNames}
        onCloned={fetchData}
      />
    </div>
  );
}
