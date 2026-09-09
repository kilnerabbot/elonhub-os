"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { moveTask } from "./actions";
import { TASK_STATUSES } from "../projects/actions";

export type BoardTask = {
  id: string;
  name: string;
  status: string;
  priority: string;
  due_date: string | null;
  project_id: string;
  projectLabel: string;
  assignee: string;
  canMove: boolean;
};

const COLUMN_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

const PRIORITY_STYLE: Record<string, string> = {
  low: "bg-surface-2 text-text-faint",
  medium: "bg-surface-2 text-text-dim",
  high: "bg-accent-soft text-accent",
  urgent: "bg-danger-soft text-danger",
};

export function TaskBoard({ tasks, today }: { tasks: BoardTask[]; today: string }) {
  const [, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The card moves column immediately; the server confirms afterwards. Without
  // this the card sits in its old column until the round trip finishes, which
  // reads as a failed drag and invites a second attempt.
  const [board, moveOptimistic] = useOptimistic(
    tasks,
    (current: BoardTask[], move: { id: string; status: string }) =>
      current.map((t) => (t.id === move.id ? { ...t, status: move.status } : t))
  );

  function drop(taskId: string, status: string) {
    setDragOver(null);
    const task = board.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    if (!task.canMove) {
      setError("You can only move tasks assigned to you, or on a project you manage.");
      return;
    }
    setError(null);

    startTransition(async () => {
      moveOptimistic({ id: taskId, status });
      const result = await moveTask(taskId, task.project_id, status);
      // On failure the optimistic state is discarded automatically when the
      // transition ends and the server data is re-read.
      if (!result.ok) setError(result.message ?? "That move was rejected.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] text-danger"
        >
          {error}
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((status) => {
          const column = board.filter((t) => t.status === status);
          return (
            <section
              key={status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                drop(e.dataTransfer.getData("text/plain"), status);
              }}
              className={`min-h-[8rem] rounded-2xl border p-3 transition-colors ${
                dragOver === status
                  ? "border-accent bg-accent-soft/40"
                  : "border-border bg-surface-2"
              }`}
            >
              <header className="mb-3 flex items-baseline justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-dim">
                  {COLUMN_LABEL[status] ?? status}
                </h2>
                <span className="text-[11px] tabular-nums text-text-faint">{column.length}</span>
              </header>

              <div className="flex flex-col gap-2">
                {column.length === 0 && (
                  <p className="text-[11px] text-text-faint">Drop a task here</p>
                )}
                {column.map((task) => {
                  const overdue =
                    task.status !== "done" && task.due_date !== null && task.due_date < today;
                  return (
                    <article
                      key={task.id}
                      draggable={task.canMove}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
                      className={`rounded-xl border border-border bg-surface p-2.5 ${
                        task.canMove ? "cursor-grab active:cursor-grabbing" : "opacity-80"
                      }`}
                    >
                      <h3 className="text-[13px] font-medium text-text">{task.name}</h3>
                      <p className="mt-0.5 truncate text-[11px] text-text-faint">
                        <Link
                          href={`/dashboard/projects/${task.project_id}`}
                          className="hover:text-text-dim"
                        >
                          {task.projectLabel}
                        </Link>
                        {" · "}
                        {task.assignee}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] ${
                            PRIORITY_STYLE[task.priority] ?? "bg-surface-2 text-text-dim"
                          }`}
                        >
                          {task.priority}
                        </span>
                        {task.due_date && (
                          <span
                            className={`text-[10px] ${overdue ? "font-medium text-danger" : "text-text-faint"}`}
                          >
                            {overdue ? "overdue " : "due "}
                            {task.due_date}
                          </span>
                        )}
                      </div>

                      {/* Dragging is a pointer-only affordance. This select is
                          the accessible equivalent and the only way to move a
                          task on a touch screen. */}
                      {task.canMove && (
                        <label className="mt-2 block">
                          <span className="sr-only">Move {task.name} to</span>
                          <select
                            value={task.status}
                            onChange={(e) => drop(task.id, e.currentTarget.value)}
                            className="w-full rounded border border-border bg-surface-2 px-1.5 py-1 text-[11px] capitalize text-text-dim"
                          >
                            {TASK_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {COLUMN_LABEL[s] ?? s}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
