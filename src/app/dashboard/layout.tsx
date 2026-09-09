import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavLink } from "@/components/NavLink";
import { TopBar } from "@/components/TopBar";
import { signOut } from "./actions";

const ICONS = {
  grid: (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" fill="currentColor" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" fill="currentColor" opacity=".5" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" fill="currentColor" opacity=".5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="currentColor" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
      <circle cx="6" cy="5" r="2.5" fill="currentColor" />
      <path d="M1.5 14c0-2.5 2-4.2 4.5-4.2S10.5 11.5 10.5 14z" fill="currentColor" />
      <circle cx="12" cy="6" r="2" fill="currentColor" opacity=".55" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
      <path d="M1.5 4a1 1 0 0 1 1-1h3l1.2 1.5h6.8a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="currentColor" />
    </svg>
  ),
  coins: (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
      <ellipse cx="8" cy="4.5" rx="5.5" ry="2.5" fill="currentColor" />
      <path d="M2.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7c0 1.4-2.5 2.5-5.5 2.5S2.5 8.4 2.5 7" fill="currentColor" opacity=".55" />
    </svg>
  ),
  life: (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8" cy="8" r="2.4" fill="currentColor" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
      <path d="M8 1.5 13.5 4v4.2c0 3.3-2.3 5.6-5.5 6.5-3.2-.9-5.5-3.2-5.5-6.5V4z" fill="currentColor" />
    </svg>
  ),
};

const SECTIONS = [
  {
    heading: "Boards",
    items: [
      { href: "/dashboard", label: "Analytics", icon: ICONS.grid },
      { href: "/dashboard/crm", label: "Customers", icon: ICONS.users },
      { href: "/dashboard/crm/leads", label: "Leads", icon: ICONS.life },
      { href: "/dashboard/pipeline", label: "Pipeline", icon: ICONS.coins },
      { href: "/dashboard/quotes", label: "Quotes", icon: ICONS.folder },
      { href: "/dashboard/services", label: "Catalogue", icon: ICONS.shield },
      { href: "/dashboard/projects", label: "Projects", icon: ICONS.folder },
    ],
  },
  {
    heading: "Operations",
    items: [
      { href: "/dashboard/invoices", label: "Invoices", icon: ICONS.coins },
      { href: "/dashboard/support", label: "Support", icon: ICONS.life, disabled: true },
      { href: "/dashboard/team", label: "Team", icon: ICONS.shield },
    ],
  },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const name = profile?.full_name ?? user.email ?? "Account";
  const role = profile?.role?.replace(/_/g, " ") ?? "—";
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-screen gap-4 bg-bg p-4">
      <aside className="flex w-64 flex-none flex-col rounded-2xl bg-rail px-3 py-5 text-rail-text">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-white">
            E
          </span>
          <span className="text-sm font-semibold leading-tight">
            elonhub
            <span className="block text-[10px] font-normal text-rail-dim">operating system</span>
          </span>
        </div>

        <div className="mb-6 flex items-center gap-2.5 rounded-xl bg-rail-2 px-2.5 py-2.5">
          <span className="grid size-9 flex-none place-items-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
            {initials || "—"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-[11px] capitalize text-rail-dim">{role}</span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-5">
          {SECTIONS.map((section) => (
            <div key={section.heading}>
              <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-rail-dim">
                {section.heading}
              </div>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    disabled={item.disabled}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-6 rounded-xl bg-rail-2 p-4">
          <div className="text-[13px] font-semibold leading-snug">Phase 2 modules</div>
          <p className="mt-1 text-[11px] leading-relaxed text-rail-dim">
            CRM, Projects, Finance and Support screens are next. The database behind them is
            already live.
          </p>
          <form action={signOut} className="mt-3">
            <button
              type="submit"
              className="rounded-lg bg-rail px-3 py-1.5 text-[11px] font-medium text-rail-text transition-colors hover:bg-accent"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden rounded-2xl bg-surface">
        <Suspense fallback={<div className="h-[57px] border-b border-border" />}>
          <TopBar />
        </Suspense>
        <div className="overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
