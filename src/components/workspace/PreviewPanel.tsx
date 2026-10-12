"use client";

import { useState } from "react";
import type { RefObject } from "react";
import { Monitor, Loader2, Archive } from "lucide-react";
import { BuildingLoader } from "@/components/workspace/BuildingLoader";

interface PreviewPanelProps {
  previewUrl: string | null;
  onRefresh: () => void;
  loading?: boolean;
  mobilePreview?: boolean;
  iframePath?: string;
  cached?: boolean;
  /**
   * ═══⭐⭐ THE SAME-ORIGIN PREVIEW, AND WHY IT EXISTS ═══════════════════════
   *
   * ⚠️ THE VISUAL EDITOR CANNOT WORK ON A CROSS-ORIGIN FRAME. It selects elements,
   * reads computed styles and applies live text edits by SCRIPTING the previewed
   * document, and the browser forbids all of that across origins — no amount of
   * `sandbox` flags changes it. `/api/preview/{projectId}` re-serves the project
   * through this app, so the document becomes same-origin and scriptable.
   *
   * ⚠️ IT IS USED ONLY WHILE THE EDITOR IS OPEN. Normal viewing keeps the direct
   * URL: the proxy costs a round trip per asset and rewrites the HTML, and neither
   * is worth paying for a preview nobody is editing.
   */
  proxiedSrc?: string | null;
  /** The editor needs the element to `postMessage` to its injected agent. */
  frameRef?: RefObject<HTMLIFrameElement | null>;
  /** The run's stage in words (new engine), shown under the building loader. */
  buildStage?: string | null;
}

export function PreviewPanel({ previewUrl, onRefresh, loading, mobilePreview = false, iframePath = "/", cached = false, proxiedSrc, frameRef, buildStage }: PreviewPanelProps) {
  const [iframeLoading, setIframeLoading] = useState(true);
  /** ⚠️ The proxy wins when present — see `proxiedSrc`. */
  const base = (proxiedSrc || previewUrl || "").replace(/\/$/, "");
  const fullIframeUrl = base ? `${base}${iframePath === "/" ? "" : iframePath}` : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* iframe - no URL bar here, it's in the header now */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-surface-base">
        {/* Cached snapshot indicator: shown when the dev server is not active and
            we're displaying the cachedDevelopmentUrl static snapshot */}
        {previewUrl && cached && (
          <div className="absolute top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-warning-subtle px-2.5 py-1 text-[11px] font-medium text-warning-subtle-foreground shadow-sm">
            <Archive className="w-3 h-3" />
            <span>Cached snapshot · server sleeping</span>
          </div>
        )}
        {!previewUrl ? (
          loading ? <BuildingLoader stage={buildStage} /> : (
            <div className="flex flex-col items-center justify-center text-center px-8">
              <Monitor className="mb-4 size-10 text-ink-4" />
              <p className="mb-1 text-sm font-medium text-ink-2">No preview yet</p>
              <p className="text-xs text-ink-3">Send a prompt to start building</p>
            </div>
          )
        ) : (
          <div className={`bg-white transition-all duration-300 relative ${
            mobilePreview ? "w-[375px] h-[667px] rounded-[2.25rem] border-[8px] border-ink overflow-hidden shadow-floating" : "w-full h-full"
          }`}>
            {iframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                <Loader2 className="size-6 animate-spin text-ink-4" />
              </div>
            )}
            <iframe
              /* ⚠️ REMOUNT WHEN THE ORIGIN CHANGES. Swapping the `src` between the direct
                 URL and the proxy without a new element leaves the old document (and its
                 injected agent, or lack of one) in place. */
              key={proxiedSrc ? "proxy" : "direct"}
              ref={frameRef}
              src={fullIframeUrl || undefined}
              className="w-full h-full border-0"
              title="Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
              onLoad={() => setIframeLoading(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
