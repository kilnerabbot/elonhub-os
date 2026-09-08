import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavLink } from "@/components/NavLink";
import { signOut } from "./actions";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/crm", label: "CRM", disabled: true },
  { href: "/dashboard/projects", label: "Projects", disabled: true },
  { href: "/dashboard/finance", label: "Finance", disabled: true },
  { href: "/dashboard/support", label: "Support", disabled: true },
  { href: "/dashboard/team", label: "Team" },
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

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="flex w-60 flex-none flex-col border-r border-border px-4 py-5">
        <div className="mb-6 px-2 font-mono text-xs uppercase tracking-[0.16em] text-gold">
          ElonHub OS
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href} disabled={item.disabled}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-border pt-4">
          <div className="px-2">
            <div className="truncate text-sm text-text">{profile?.full_name ?? user.email}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-faint">
              {profile?.role?.replace("_", " ") ?? "—"}
            </div>
          </div>
          <form action={signOut} className="mt-3 px-2">
            <button
              type="submit"
              className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-faint transition-colors hover:text-text"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
