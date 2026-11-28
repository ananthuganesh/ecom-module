"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "@/components/icons";
import { shouldBlockNavigation } from "@/lib/navGuard";
import { useProductSaveBarStore } from "@/store/useProductSaveBarStore";

/**
 * Black "Unsaved changes · Discard · Save" pill, shown while a page has
 * pending edits.
 *
 * `floating`: always mounted, overlaid on the page (takes no layout space) and
 * slides down in / up out, so content never jumps. Otherwise it renders in
 * place only while active (the header slot, which has a fixed height).
 */
export default function AdminSaveBar({ floating = false }) {
  const saveBar = useProductSaveBarStore();
  const [shaking, setShaking] = useState(false);

  // Shake whenever a navigation is refused.
  useEffect(() => {
    if (!saveBar.nudge) return undefined;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 500);
    return () => clearTimeout(t);
  }, [saveBar.nudge]);

  if (!floating && !saveBar.active) return null;
  const hidden = floating && !saveBar.active;

  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      aria-hidden={hidden || undefined}
      inert={hidden}
      className={`flex w-fit max-w-full items-center gap-1 rounded-full bg-[#0a0a0a] p-1 pl-4 shadow-[0_8px_24px_rgba(0,0,0,0.16),0_2px_6px_rgba(0,0,0,0.1)] ${
        floating
          ? `absolute top-3 left-1/2 -translate-x-1/2 transition-[translate,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0,1)] motion-reduce:transition-none ${
              hidden ? "pointer-events-none -translate-y-[calc(100%+1.5rem)] opacity-0" : "translate-y-0 opacity-100"
            }`
          : "mx-auto"
      } ${shaking ? "admin-save-bar-shake" : ""}`}
    >
      <p className="m-0 mr-3 truncate text-[13px] font-medium text-white/90">Unsaved changes</p>
      <button
        type="button"
        disabled={saveBar.saving}
        onClick={() => saveBar.onDiscard?.()}
        className="h-7 shrink-0 cursor-pointer rounded-full bg-[#2b2b2b] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[#3a3a3a] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Discard
      </button>
      <button
        type="button"
        disabled={saveBar.saving}
        onClick={() => saveBar.onSave?.()}
        className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#ececec] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {saveBar.saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        {saveBar.saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

/**
 * While the save bar is showing, keep the admin on the current page: in-app
 * link clicks are swallowed (and the bar shakes), and closing or reloading the
 * tab asks for confirmation. Mount once, in the admin shell.
 */
export function useSaveBarNavigationGuard() {
  const active = useProductSaveBarStore((s) => s.active);
  const blockNavigation = useProductSaveBarStore((s) => s.blockNavigation);

  useEffect(() => {
    if (!active) return undefined;

    const onClick = (e) => {
      if (e.defaultPrevented) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a || a.closest('[aria-label="Unsaved changes"]')) return;
      const block = shouldBlockNavigation(
        { href: a.href, target: a.target, hasDownload: a.hasAttribute("download") },
        e,
        window.location.href
      );
      if (!block) return;
      // Capture phase on document runs before Next's <Link> handler.
      e.preventDefault();
      e.stopPropagation();
      blockNavigation();
    };

    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active, blockNavigation]);
}
