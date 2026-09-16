"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

type NavDrawer = { open: boolean; toggle: () => void };

const NavDrawerContext = createContext<NavDrawer | null>(null);

/**
 * The toggle, for whichever bar wants to host it.
 *
 * Exposed through context rather than rendered here so the shell does not need
 * a header of its own. A second bar just for a hamburger costs about 50px of a
 * 667px phone viewport and duplicates the wordmark that is already in the
 * sidebar; TopBar is on screen anyway, so the button belongs there.
 */
export function NavDrawerToggle() {
  const drawer = useContext(NavDrawerContext);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = drawer?.open ?? false;

  // Focus return, and it belongs here rather than in the shell: the element to
  // focus is this button, and keeping the ref local means nothing ref-shaped
  // travels through context.
  //
  // When the drawer shuts, whatever was focused inside it becomes
  // visibility:hidden and the browser drops focus to <body> — the user loses
  // their place with no visible caret anywhere.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) buttonRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (!drawer) return null;

  return (
    <button
      type="button"
      onClick={drawer.toggle}
      ref={buttonRef}
      aria-label={open ? "Close navigation" : "Open navigation"}
      aria-expanded={open}
      aria-controls="dashboard-sidebar"
      className="grid size-10 flex-none place-items-center rounded-lg border border-border text-text transition-colors hover:bg-surface-2 lg:hidden"
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
  );
}

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

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    // Crossing into lg turns the drawer back into a static column and hides the
    // backdrop, but `open` would stay true and the scroll lock below with it —
    // an iPad rotated from portrait to landscape would be left unable to
    // scroll, with no visible control to release it.
    const wide = window.matchMedia("(min-width: 64rem)");
    const onWide = () => {
      if (wide.matches) setOpen(false);
    };
    onWide();

    // The page behind must not scroll while the drawer covers it, or a swipe
    // moves the wrong thing.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <NavDrawerContext.Provider
      value={{ open, toggle: () => setOpen((o) => !o) }}
    >
      <div className="flex min-h-screen flex-col bg-bg lg:flex-row lg:gap-4 lg:p-4">
        {open && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}

        {/*
          One element, positioned two ways, so the navigation markup exists
          once. Rendering a separate mobile copy would duplicate every link and
          let the two drift apart.

          `invisible` matters as much as the translate. Moving the panel
          off-canvas only moves paint: on a phone with the drawer shut, every
          link in here would still be in the tab order and still announced by a
          screen reader, so tabbing off the toggle would land on something
          invisible and unscrollable-to. `visibility: hidden` takes the subtree
          out of both, still animates, and `lg:visible` leaves the desktop
          column exactly as it was.
        */}
        <aside
          id="dashboard-sidebar"
          // Any tap on a link inside closes it, which the pathname check above
          // cannot cover: tapping the route you are already on, or a
          // query-only change, leaves the pathname identical and the drawer
          // sitting open over the page looking unresponsive.
          onClick={() => setOpen(false)}
          className={`fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] overflow-y-auto transition-transform duration-200 ease-out motion-reduce:transition-none lg:static lg:z-auto lg:w-64 lg:max-w-none lg:flex-none lg:translate-x-0 lg:overflow-visible lg:transition-none lg:visible ${
            open ? "translate-x-0" : "invisible -translate-x-full"
          }`}
        >
          {sidebar}
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden bg-surface lg:rounded-2xl">
          {children}
        </main>
      </div>
    </NavDrawerContext.Provider>
  );
}
