import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canUpdateTask } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { TaskStatusSelect } from "../projects/ProjectForms";

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-surface-2 text-text-faint",
  medium: "bg-surface-2 text-text-dim",
  high: "bg-accent-soft text-accent",
  urgent: "bg-danger-soft text-danger",
};

const SCOPES = ["open", "mine", "overdue", "all"] as const;
type Scope = (typeof SCOPES)[number];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope: rawScope } = await searchParams;
  const scope: Scope = SCOPES.find((s) => s === rawScope) ?? "open";

  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  // No filtering by assignee here — tasks_select already limits rows to tasks
  // you are assigned or projects you manage. Re-filtering in the query would
  // duplicate the policy and drift from it.
  const [{ data: tasks }, { data: projects }, { data: people }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, name, status, priority, due_date, assignee_id, project_id")
      .limit(300),
    supabase.from("projects").select("id, name, code, manager_id").limit(300),
    supabase.from("profiles").select("id, full_name").limit(200),
  ]);

  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const today = new Date().toISOString().slice(0, 10);

  const isOverdue = (t: { status: string; due_date: string | null }) =>
    t.status !== "done" && t.due_date !== null && t.due_date < today;

  const all = tasks ?? [];
  const filtered = all.filter((t) => {
    if (scope === "all") return true;
    if (scope === "mine") return t.assignee_id === session.userId;
    if (scope === "overdue") return isOverdue(t);
    return t.status !== "done";
  });

  // Overdue first, then by due date, then undated last. An undated task is not
  // urgent but should not vanish below a hundred dated ones either.
  const sorted = [...filtered].sort((a, b) => {
    const ao = isOverdue(a) ? 0 : 1;
    const bo = isOverdue(b) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return a.name.localeCompare(b.name);
  });

  const counts = {
    open: all.filter((t) => t.status !== "done").length,
    mine: all.filter((t) => t.assignee_id === session.userId).length,
    overdue: all.filter(isOverdue).length,
    all: all.length,
  };

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap gap-2">
        {SCOPES.map((s) => (
          <Link
            key={s}
            href={`/dashboard/tasks?scope=${s}`}
            aria-current={s === scope ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-[13px] capitalize transition-colors ${
              s === scope
                ? "bg-rail text-rail-text"
                : "border border-border text-text-dim hover:bg-surface-2"
            }`}
          >
            {s} <span className="tabular-nums opacity-70">{counts[s]}</span>
          </Link>
        ))}
      </div>

      <Card title={`${sorted.length} ${sorted.length === 1 ? "task" : "tasks"}`}>
        {sorted.length === 0 ? (
          <p className="text-[13px] text-text-dim">
            {scope === "overdue"
              ? "Nothing is overdue."
              : scope === "mine"
                ? "Nothing is assigned to you."
                : "No tasks yet. They are created inside a project."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((t) => {
              const project = projectById.get(t.project_id);
              const overdue = isOverdue(t);
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 border-b border-border pb-2 last:border-0 last:pb-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-text">{t.name}</span>
                    <span className="block truncate text-[11px] text-text-faint">
                      {project ? (
                        <Link
                          href={`/dashboard/projects/${project.id}`}
                          className="hover:text-text-dim"
                        >
                          {project.code} · {project.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {" · "}
                      {nameById.get(t.assignee_id ?? "") ?? "Unassigned"}
                      {t.due_date ? ` · due ${t.due_date}` : ""}
                    </span>
                  </span>

                  {overdue && (
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
                      projectId={t.project_id}
                      status={t.status}
                      disabled={
                        !canUpdateTask(
                          session.role,
                          t.assignee_id,
                          project?.manager_id ?? null,
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
    </div>
  );
}
