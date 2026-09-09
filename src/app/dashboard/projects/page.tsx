import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateProject } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatZAR } from "@/lib/format";
import { num } from "@/lib/metrics";
import { Card } from "@/components/ui";
import { label } from "@/lib/domain";
import { CreateProjectForm } from "./ProjectForms";

export default async function ProjectsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const [{ data: projects }, { data: customers }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, code, stage, budget_amount, end_date, customer_id")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("customers").select("id, legal_name").order("legal_name").limit(200),
  ]);

  const rows = projects ?? [];
  const nameById = new Map((customers ?? []).map((c) => [c.id, c.legal_name]));
  const canCreate = canCreateProject(session.role);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-4xl p-6">
      <p className="mb-6 text-sm text-text-dim">
        Projects you manage or are assigned work on.{" "}
        {!canCreate && "Only project managers can open a new one."}
      </p>

      {rows.length === 0 ? (
        <div className="mb-4 rounded-2xl border border-border bg-surface-2 px-5 py-8 text-center">
          <p className="text-sm font-medium text-text">No projects yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-text-dim">
            Projects drive the active-project and overdue-task figures on the dashboard.
          </p>
        </div>
      ) : (
        <ul className="mb-4 overflow-hidden rounded-2xl border border-border">
          {rows.map((p) => {
            // Anything past its end date and not yet handed over is late.
            const late =
              p.end_date !== null &&
              p.end_date < today &&
              p.stage !== "handover" &&
              p.stage !== "support";
            return (
              <li key={p.id} className="border-b border-border last:border-0">
                <Link
                  href={`/dashboard/projects/${p.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text">{p.name}</span>
                    <span className="block truncate text-xs text-text-faint">
                      {p.code} · {nameById.get(p.customer_id) ?? "Unknown customer"}
                    </span>
                  </span>
                  {late && (
                    <span className="flex-none rounded bg-danger-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-danger">
                      Late
                    </span>
                  )}
                  <span className="flex-none text-xs tabular-nums text-text-dim">
                    {formatZAR(num(p.budget_amount))}
                  </span>
                  <span className="flex-none rounded bg-surface-2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] capitalize text-text-dim">
                    {label(p.stage)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {canCreate && (
        <Card title="New project">
          <CreateProjectForm customers={customers ?? []} />
        </Card>
      )}
    </div>
  );
}
