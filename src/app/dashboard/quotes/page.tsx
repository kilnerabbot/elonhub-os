import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateQuote } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatZAR } from "@/lib/format";
import { num } from "@/lib/metrics";
import { Card } from "@/components/ui";
import { CreateQuoteForm } from "./QuoteForms";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-surface-2 text-text-dim",
  sent: "bg-violet-soft text-violet",
  viewed: "bg-violet-soft text-violet",
  accepted: "bg-good-soft text-good",
  rejected: "bg-danger-soft text-danger",
  expired: "bg-danger-soft text-danger",
};

export default async function QuotesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const [{ data: quotes }, { data: customers }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, number, status, total, valid_until, created_at, customer_id")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("customers").select("id, legal_name").order("legal_name").limit(200),
  ]);

  const canCreate = canCreateQuote(session.role);
  const rows = quotes ?? [];
  const nameById = new Map((customers ?? []).map((c) => [c.id, c.legal_name]));

  return (
    <div className="max-w-4xl p-6">
      <p className="mb-6 text-sm text-text-dim">
        Quotes your role can see. Totals are calculated from the line items.
      </p>

      {rows.length === 0 ? (
        <div className="mb-4 rounded-2xl border border-border bg-surface-2 px-5 py-8 text-center">
          <p className="text-sm font-medium text-text">No quotes yet</p>
        </div>
      ) : (
        <ul className="mb-4 overflow-hidden rounded-2xl border border-border">
          {rows.map((q) => (
            <li key={q.id} className="border-b border-border last:border-0">
              <Link
                href={`/dashboard/quotes/${q.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">
                    {nameById.get(q.customer_id) ?? "Unknown customer"}
                  </span>
                  <span className="block truncate text-xs text-text-faint">
                    {q.number}
                    {q.valid_until ? ` · valid to ${q.valid_until}` : ""}
                  </span>
                </span>
                <span className="flex-none text-sm tabular-nums text-text">
                  {formatZAR(num(q.total))}
                </span>
                <span
                  className={`flex-none rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${
                    STATUS_STYLE[q.status] ?? "bg-surface-2 text-text-dim"
                  }`}
                >
                  {q.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canCreate && (
        <Card title="New quote">
          <CreateQuoteForm customers={customers ?? []} />
        </Card>
      )}
    </div>
  );
}
