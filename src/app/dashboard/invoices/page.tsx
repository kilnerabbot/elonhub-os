import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageInvoices } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatZAR } from "@/lib/format";
import { num } from "@/lib/metrics";
import { Card } from "@/components/ui";
import { label } from "@/lib/domain";
import { CreateInvoiceForm } from "./InvoiceForms";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-surface-2 text-text-dim",
  sent: "bg-violet-soft text-violet",
  partially_paid: "bg-accent-soft text-accent",
  paid: "bg-good-soft text-good",
  overdue: "bg-danger-soft text-danger",
  void: "bg-surface-2 text-text-faint",
};

export default async function InvoicesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const [{ data: invoices }, { data: customers }, { data: quotes }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, number, status, total, due_date, customer_id")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("customers").select("id, legal_name").order("legal_name").limit(200),
    supabase
      .from("quotes")
      .select("id, number, customer_id")
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const rows = invoices ?? [];
  const nameById = new Map((customers ?? []).map((c) => [c.id, c.legal_name]));
  const canManage = canManageInvoices(session.role);

  const outstanding = rows
    .filter((i) => ["sent", "partially_paid", "overdue"].includes(i.status))
    .reduce((a, i) => a + num(i.total), 0);
  const overdueCount = rows.filter((i) => i.status === "overdue").length;

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-6 flex flex-wrap gap-6">
        <Stat label="Outstanding" value={formatZAR(outstanding)} />
        <Stat label="Overdue invoices" value={String(overdueCount)} tone={overdueCount > 0 ? "danger" : undefined} />
        <Stat label="Invoices" value={String(rows.length)} />
      </div>

      {!canManage && (
        <p className="mb-4 text-sm text-text-dim">
          Your role can read invoices but not raise or change them.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="mb-4 rounded-2xl border border-border bg-surface-2 px-5 py-8 text-center">
          <p className="text-sm font-medium text-text">No invoices yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-text-dim">
            Raise one from an accepted quote, or start from an empty draft.
          </p>
        </div>
      ) : (
        <ul className="mb-4 overflow-hidden rounded-2xl border border-border">
          {rows.map((i) => (
            <li key={i.id} className="border-b border-border last:border-0">
              <Link
                href={`/dashboard/invoices/${i.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">
                    {nameById.get(i.customer_id) ?? "Unknown customer"}
                  </span>
                  <span className="block truncate text-xs text-text-faint">
                    {i.number}
                    {i.due_date ? ` · due ${i.due_date}` : ""}
                  </span>
                </span>
                <span className="flex-none text-sm tabular-nums text-text">
                  {formatZAR(num(i.total))}
                </span>
                <span
                  className={`flex-none rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${
                    STATUS_STYLE[i.status] ?? "bg-surface-2 text-text-dim"
                  }`}
                >
                  {label(i.status)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <Card title="New invoice">
          <CreateInvoiceForm customers={customers ?? []} quotes={quotes ?? []} />
        </Card>
      )}
    </div>
  );
}

function Stat({ label: name, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
        {name}
      </div>
      <div
        className={`mt-0.5 text-xl font-semibold tabular-nums tracking-tight ${
          tone === "danger" ? "text-danger" : "text-text"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
