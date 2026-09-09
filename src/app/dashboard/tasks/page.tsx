import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageProject, canUpdateTask } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { TaskBoard, type BoardTask } from "./TaskBoard";
import { NewTaskForm } from "./NewTaskForm";

const SCOPES = ["all", "mine", "overdue"] as const;
type Scope = (typeof SCOPES)[number];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope: rawScope } = await searchParams;
  const scope: Scope = SCOPES.find((s) => s === rawScope) ?? "all";

  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  // tasks_select already limits rows to tasks assigned to the caller or on
  // projects they manage, so there is no assignee filter in the query.
  const [{ data: tasks }, { data: projects }, { data: people }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, name, status, priority, due_date, assignee_id, project_id")
      .limit(300),
    supabase.from("projects").select("id, name, code, manager_id").limit(300),
    supabase.from("profiles").select("id, full_name").order("full_name").limit(200),
  ]);

  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const today = new Date().toISOString().slice(0, 10);

  const isOverdue = (t: { status: string; due_date: string | null }) =>
    t.status !== "done" && t.due_date !== null && t.due_date < today;

  const all = tasks ?? [];
  const visible = all.filter((t) => {
    if (scope === "mine") return t.assignee_id === session.userId;
    if (scope === "overdue") return isOverdue(t);
    return true;
  });

  const board: BoardTask[] = visible.map((t) => {
    const project = projectById.get(t.project_id);
    return {
      id: t.id,
      name: t.name,
      status: t.status,
      priority: t.priority,
      due_date: t.due_date,
      project_id: t.project_id,
      projectLabel: project ? `${project.code} · ${project.name}` : "—",
      assignee: nameById.get(t.assignee_id ?? "") ?? "Unassigned",
      canMove: canUpdateTask(
        session.role,
        t.assignee_id,
        project?.manager_id ?? null,
        session.userId
      ),
    };
  });

  // Only projects this user manages, because tasks_write keys off
  // manages_project() — offering the rest would fail on submit.
  const manageable = (projects ?? [])
    .filter((p) => canManageProject(session.role, p.manager_id, session.userId))
    .map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }));

  const counts = {
    all: all.length,
    mine: all.filter((t) => t.assignee_id === session.userId).length,
    overdue: all.filter(isOverdue).length,
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
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
        <NewTaskForm projects={manageable} people={people ?? []} />
      </div>

      {all.length === 0 ? (
        <Card>
          <p className="text-[13px] text-text-dim">
            No tasks yet. Create one above, or from inside a project.
          </p>
        </Card>
      ) : (
        <TaskBoard tasks={board} today={today} />
      )}

      <p className="mt-4 text-[11px] text-text-faint">
        Drag a card between columns to change its status, or use the dropdown on the card. Cards
        you cannot move are shown faded.
      </p>
    </div>
  );
}
