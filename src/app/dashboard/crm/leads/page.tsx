import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateLead } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { label } from "@/lib/domain";

const STATUS_STYLE: Record<string, string> = {
  new: "bg-violet-soft text-violet",
  contacted: "bg-surface-2 text-text-dim",
  qualified: "bg-good-soft text-good",
  disqualified: "bg-danger-soft text-danger",
  converted: "bg-accent-soft text-accent",
};

export default async function LeadsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, reference, company_name, contact_name, status, score, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const canCreate = canCreateLead(session.role);

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <p className="text-sm text-text-dim">
          Inbound and manually captured leads. {!canCreate && "Your role is read-only here."}
        </p>
        {canCreate && (
          <Link
            href="/dashboard/crm/leads/new"
            className="flex-none rounded-lg bg-gold-bright px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-gold"
          >
            New lead
          </Link>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
          Could not load leads.
        </p>
      )}

      {!error && (leads ?? []).length === 0 && (
        <div className="rounded-2xl border border-border bg-surface-2 px-5 py-8 text-center">
          <p className="text-sm font-medium text-text">No leads yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-text-dim">
            {canCreate
              ? "Capture the first one — WhatsApp enquiries are the usual source."
              : "Nothing captured yet, or none are assigned to you."}
          </p>
        </div>
      )}

      {(leads ?? []).length > 0 && (
        <ul className="overflow-hidden rounded-2xl border border-border">
          {(leads ?? []).map((l) => (
            <li key={l.id} className="border-b border-border last:border-0">
              <Link
                href={`/dashboard/crm/leads/${l.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">{l.company_name}</span>
                  <span className="block truncate text-xs text-text-faint">
                    {l.reference}
                    {l.contact_name ? ` · ${l.contact_name}` : ""}
                  </span>
                </span>
                <span className="flex-none text-xs tabular-nums text-text-dim">{l.score}</span>
                <span
                  className={`flex-none rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${
                    STATUS_STYLE[l.status] ?? "bg-surface-2 text-text-dim"
                  }`}
                >
                  {label(l.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
