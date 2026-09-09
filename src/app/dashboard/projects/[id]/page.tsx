import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageProject, canUpdateTask } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatZAR } from "@/lib/format";
import { num } from "@/lib/metrics";
import { Card } from "@/components/ui";
import { label } from "@/lib/domain";
import { StageForm, TaskForm, TaskStatusSelect, TimeForm } from "../ProjectForms";

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-surface-2 text-text-faint",
  medium: "bg-surface-2 text-text-dim",
  high: "bg-accent-soft text-accent",
  urgent: "bg-danger-soft text-danger",
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, code, stage, budget_amount, estimated_hours, start_date, end_date, customer_id, manager_id")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  const [{ data: tasks }, { data: entries }, { data: customer }, { data: people }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id, name, status, priority, due_date, assignee_id, estimated_hours")
        .eq("project_id", id)
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("time_entries")
        .select("id, entry_date, hours, billable, note, user_id, task_id")
        .eq("project_id", id)
        .order("entry_date", { ascending: false })
        .limit(50),
      supabase.from("customers").select("legal_name").eq("id", project.customer_id).maybeSingle(),
      supabase.from("profiles").select("id, full_name").order("full_name").limit(200),
    ]);

  const taskRows = tasks ?? [];
  const entryRows = entries ?? [];
  const peopleRows = people ?? [];
  const nameById = new Map(peopleRows.map((p) => [p.id, p.full_name]));

  const manages = canManageProject(session.role, project.manager_id, session.userId);
  const today = new Date().toISOString().slice(0, 10);

  const loggedHours = entryRows.reduce((a, e) => a + num(e.hours), 0);
  const billableHours = entryRows.reduce((a, e) => a + (e.billable ? num(e.hours) : 0), 0);
  const estimated = num(project.estimated_hours);
  const openTasks = taskRows.filter((t) => t.status !== "done").length;
  const overdue = taskRows.filter(
    (t) => t.status !== "done" && t.due_date !== null && t.due_date < today
  ).length;

  return (
    <div className="max-w-4xl p-6">
      <Link href="/dashboard/projects" className="text-[13px] text-text-dim hover:text-text">
        ← Projects
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-text">{project.name}</h2>
          <p className="text-sm text-text-dim">
            {project.code} · {customer?.legal_name ?? "Unknown customer"}
            {project.manager_id && ` · managed by ${nameById.get(project.manager_id) ?? "—"}`}
          </p>
        </div>
        {manages ? (
          <StageForm projectId={project.id} stage={project.stage} />
        ) : (
          <span className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs capitalize text-text-dim">
            {label(project.stage)}
          </span>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-6">
        <Stat label="Budget" value={formatZAR(num(project.budget_amount))} />
        <Stat
          label="Hours logged"
          value={estimated > 0 ? `${loggedHours} / ${estimated}` : String(loggedHours)}
        />
        <Stat label="Billable hours" value={String(billableHours)} />
        <Stat label="Open tasks" value={String(openTasks)} />
        <Stat label="Overdue" value={String(overdue)} tone={overdue > 0 ? "danger" : undefined} />
      </div>

      <div className="mt-4 grid gap-4">
        <Card title={`Tasks (${taskRows.length})`}>
          {taskRows.length === 0 ? (
            <p className="text-[13px] text-text-dim">No tasks yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {taskRows.map((t) => {
                const isOverdue =
                  t.status !== "done" && t.due_date !== null && t.due_date < today;
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-text">{t.name}</span>
                      <span className="block truncate text-[11px] text-text-faint">
                        {nameById.get(t.assignee_id ?? "") ?? "Unassigned"}
                        {t.due_date ? ` · due ${t.due_date}` : ""}
                      </span>
                    </span>
                    {isOverdue && (
                      <span className="flex-none rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-medium uppercase text-danger">
                        Overdue
                      </span>
                    )}
                    <span
                      className={`flex-none rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${
                        PRIORITY_STYLE[t.priority] ?? "bg-surface-2 text-text-dim"
                      }`}
                    >
                      {t.priority}
                    </span>
                    <span className="w-28 flex-none">
                      <TaskStatusSelect
                        taskId={t.id}
                        projectId={project.id}
                        status={t.status}
                        disabled={
                          !canUpdateTask(
                            session.role,
                            t.assignee_id,
                            project.manager_id,
                            session.userId
                          )
                        }
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {manages && (
          <Card title="Add a task">
            <TaskForm projectId={project.id} people={peopleRows} />
          </Card>
        )}

        <Card title={`Time entries (${entryRows.length})`}>
          {entryRows.length === 0 ? (
            <p className="text-[13px] text-text-dim">Nothing logged yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {entryRows.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-text-dim">
                    {e.entry_date} · {nameById.get(e.user_id) ?? "—"}
                    {e.note ? ` · ${e.note}` : ""}
                  </span>
                  <span className="flex-none tabular-nums text-text">
                    {num(e.hours)}h
                    {!e.billable && (
                      <span className="ml-1.5 text-[10px] uppercase text-text-faint">
                        non-billable
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Log time">
          <TimeForm
            projectId={project.id}
            tasks={taskRows.map((t) => ({ id: t.id, name: t.name }))}
          />
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label: name,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
        {name}
      </div>
      <div
        className={`mt-0.5 text-lg font-semibold tabular-nums tracking-tight ${
          tone === "danger" ? "text-danger" : "text-text"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
