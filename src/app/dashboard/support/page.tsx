import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateTicket, canViewSupport } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { label } from "@/lib/domain";
import { evaluateSla, formatSlaRemaining } from "@/lib/sla";
import { NewTicketForm } from "./TicketForms";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-violet-soft text-violet",
  pending: "bg-accent-soft text-accent",
  on_hold: "bg-surface-2 text-text-dim",
  resolved: "bg-good-soft text-good",
  closed: "bg-surface-2 text-text-faint",
};

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-surface-2 text-text-faint",
  medium: "bg-surface-2 text-text-dim",
  high: "bg-accent-soft text-accent",
  urgent: "bg-danger-soft text-danger",
};

const SCOPES = ["open", "mine", "breached", "all"] as const;
type Scope = (typeof SCOPES)[number];

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope: rawScope } = await searchParams;
  const scope: Scope = SCOPES.find((s) => s === rawScope) ?? "open";

  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const [{ data: tickets }, { data: customers }, { data: projects }, { data: people }] =
    await Promise.all([
      supabase
        .from("tickets")
        .select(
          "id, number, subject, status, priority, channel, customer_id, assignee_id, opened_at, first_response_at"
        )
        .order("opened_at", { ascending: false })
        .limit(200),
      supabase.from("customers").select("id, legal_name").order("legal_name").limit(200),
      supabase.from("projects").select("id, name, code").limit(200),
      supabase.from("profiles").select("id, full_name").order("full_name").limit(200),
    ]);

  const rows = tickets ?? [];
  const customerName = new Map((customers ?? []).map((c) => [c.id, c.legal_name]));
  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const now = new Date();

  const withSla = rows.map((t) => ({
    ...t,
    sla: evaluateSla(t.priority, t.status, t.opened_at, t.first_response_at, now),
  }));

  const visible = withSla.filter((t) => {
    if (scope === "all") return true;
    if (scope === "mine") return t.assignee_id === session.userId;
    if (scope === "breached") return t.sla.breached;
    return t.status !== "closed" && t.status !== "resolved";
  });

  // Breaches first, then whatever is closest to its deadline.
  const sorted = [...visible].sort((a, b) => {
    if (a.sla.breached !== b.sla.breached) return a.sla.breached ? -1 : 1;
    return a.sla.hoursRemaining - b.sla.hoursRemaining;
  });

  const counts = {
    open: withSla.filter((t) => t.status !== "closed" && t.status !== "resolved").length,
    mine: withSla.filter((t) => t.assignee_id === session.userId).length,
    breached: withSla.filter((t) => t.sla.breached).length,
    all: withSla.length,
  };

  return (
    <div className="max-w-4xl p-6">
      {!canViewSupport(session.role) && (
        <p className="mb-4 text-sm text-text-dim">
          You are seeing only the tickets assigned to you.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <Link
              key={s}
              href={`/dashboard/support?scope=${s}`}
              aria-current={s === scope ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-[13px] capitalize transition-colors ${
                s === scope
                  ? "bg-rail text-rail-text"
                  : "border border-border text-text-dim hover:bg-surface-2"
              } ${s === "breached" && counts.breached > 0 ? "text-danger" : ""}`}
            >
              {s} <span className="tabular-nums opacity-70">{counts[s]}</span>
            </Link>
          ))}
        </div>

        {canCreateTicket(session.role) && (
          <NewTicketForm
            customers={(customers ?? []).map((c) => ({ id: c.id, label: c.legal_name }))}
            projects={(projects ?? []).map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
            people={(people ?? []).map((p) => ({ id: p.id, label: p.full_name }))}
          />
        )}
      </div>

      <Card title={`${sorted.length} ${sorted.length === 1 ? "ticket" : "tickets"}`}>
        {sorted.length === 0 ? (
          <p className="text-[13px] text-text-dim">
            {scope === "breached"
              ? "Nothing has missed its first-response target."
              : "Nothing here. Log a ticket when a client gets in touch."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((t) => (
              <li key={t.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
                <Link
                  href={`/dashboard/support/${t.id}`}
                  className="flex items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-text">{t.subject}</span>
                    <span className="block truncate text-[11px] text-text-faint">
                      {t.number}
                      {t.customer_id ? ` · ${customerName.get(t.customer_id) ?? "—"}` : ""}
                      {" · "}
                      {personName.get(t.assignee_id ?? "") ?? "Unassigned"}
                      {" · "}
                      {label(t.channel)}
                    </span>
                  </span>

                  {/* Only meaningful while a first reply is still owed. */}
                  {!t.first_response_at && (t.sla.breached || t.sla.atRisk) && (
                    <span
                      className={`flex-none rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${
                        t.sla.breached ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"
                      }`}
                    >
                      {formatSlaRemaining(t.sla.hoursRemaining)}
                    </span>
                  )}
                  <span
                    className={`flex-none rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${
                      PRIORITY_STYLE[t.priority] ?? "bg-surface-2 text-text-dim"
                    }`}
                  >
                    {t.priority}
                  </span>
                  <span
                    className={`flex-none rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${
                      STATUS_STYLE[t.status] ?? "bg-surface-2 text-text-dim"
                    }`}
                  >
                    {label(t.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
