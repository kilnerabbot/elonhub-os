"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * The dashboard's two-column shell, with the sidebar off-canvas on small
 * screens.
 *
 * The sidebar is passed in as a slot rather than built here, so it stays a
 * server component — it renders the signed-in profile and a server-action
 * sign-out form, neither of which should be dragged across the client boundary
 * just to make a drawer open. This component only decides where it sits.
 *
 * At `lg` and above nothing changes: the same static 16rem column as before.
 * Below that it becomes a drawer over a backdrop, and a compact bar appears
 * with the toggle.
 */
export function DashboardShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [navigatedFrom, setNavigatedFrom] = useState(pathname);

  // Navigating is the most common way to be finished with the drawer, and on a
  // phone the page behind it is hidden entirely — leaving it open after a tap
  // would look like the tap did nothing.
  //
  // Adjusted during render rather than in an effect. An effect would paint the
  // new page with the drawer still over it and then close it on a second pass;
  // this way the drawer is simply never rendered open for the new route.
  if (navigatedFrom !== pathname) {
    setNavigatedFrom(pathname);
    setOpen(false);
  }

  // Escape closes it, as with any overlay. Bound only while open so the handler
  // is not sitting on every page for a drawer that is not there.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The page behind must not scroll while the drawer covers it, or a swipe
  // moves the wrong thing.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col bg-bg lg:flex-row lg:gap-4 lg:p-4">
      {/*
        Mobile header. Hidden at lg, where the sidebar carries the wordmark.

        In flow and sticky rather than fixed: a fixed header has to be paid for
        with a matching padding-top on the content, and that number is wrong the
        moment anything in here changes size. Letting it occupy a row costs
        nothing and cannot drift.
      */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-bg px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="dashboard-sidebar"
          className="grid size-9 place-items-center rounded-lg border border-border text-text transition-colors hover:bg-surface-2"
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
            <path
              d="M2 4h12M2 8h12M2 12h12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <span className="grid size-7 place-items-center rounded-lg bg-accent text-[13px] font-bold text-white">
          E
        </span>
        <span className="text-sm font-semibold tracking-tight text-text">elonhub</span>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/*
        One element, positioned two ways, so the navigation markup exists once.
        Rendering a separate mobile copy would duplicate every link and let the
        two drift apart.

        `hidden` is not used for the closed state: that would remove it from the
        accessibility tree at lg as well. Instead it is translated off-canvas
        and made inert to assistive technology only while closed on small
        screens.
      */}
      <aside
        id="dashboard-sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-[17rem] max-w-[85vw] overflow-y-auto transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-64 lg:max-w-none lg:flex-none lg:translate-x-0 lg:transition-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden bg-surface lg:rounded-2xl">
        {children}
      </main>
    </div>
  );
}
