"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { MAX_QUERY_LENGTH } from "@/lib/search";

const TITLES: Record<string, string> = {
  "/dashboard": "Analytical Board",
  "/dashboard/team": "Team",
  "/dashboard/account": "Your account",
  "/dashboard/search": "Search",
  "/dashboard/crm": "Customers",
  "/dashboard/crm/leads": "Leads",
  "/dashboard/crm/leads/new": "New lead",
  "/dashboard/pipeline": "Pipeline",
  "/dashboard/quotes": "Quotes",
  "/dashboard/services": "Service catalogue",
  "/dashboard/crm/new": "New customer",
  "/dashboard/projects": "Projects",
  "/dashboard/invoices": "Invoices",
  "/dashboard/payments": "Payments",
  "/dashboard/tasks": "Tasks",
  "/dashboard/support": "Support",
};

export function TopBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const title = TITLES[pathname] ?? "ElonHub OS";

  return (
    <header className="flex items-center gap-4 border-b border-border px-6 py-4">
      <div className="flex items-center gap-2.5">
        <svg viewBox="0 0 16 16" className="size-4 text-text" aria-hidden="true">
          <rect x="1" y="7" width="3" height="8" fill="currentColor" />
          <rect x="6.5" y="3" width="3" height="12" fill="currentColor" />
          <rect x="12" y="9" width="3" height="6" fill="currentColor" />
        </svg>
        <h1 className="text-[17px] font-semibold tracking-tight text-text">{title}</h1>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden rounded-lg bg-sage px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-text sm:inline">
          All modules
        </span>
        {/* Plain GET form: works with JavaScript disabled, and the query stays
            in the URL so a search is shareable and back-button friendly. */}
        <form action="/dashboard/search" method="get" role="search" className="relative hidden md:block">
          <svg
            viewBox="0 0 16 16"
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-text-faint"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5 L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            key={searchParams.get("q") ?? ""}
            type="search"
            name="q"
            defaultValue={searchParams.get("q") ?? ""}
            placeholder="Search customers, leads, invoices…"
            aria-label="Search the workspace"
            maxLength={MAX_QUERY_LENGTH}
            autoComplete="off"
            className="w-72 rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-text outline-none transition-colors placeholder:text-text-faint focus:border-border-strong"
          />
        </form>
        <span className="rounded-lg border border-border px-3 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-text-dim">
          ZAR
        </span>
      </div>
    </header>
  );
}
