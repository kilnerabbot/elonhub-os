"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Field, FormError, SelectField, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import { TASK_PRIORITIES, TASK_STATUSES, createTask } from "../projects/actions";

/**
 * Create a task without opening a project first.
 *
 * Only projects the user manages are offered: tasks_write requires
 * manages_project(), so listing every visible project would present options
 * that fail on submit.
 */
export function NewTaskForm({
  projects,
  people,
}: {
  projects: { id: string; label: string }[];
  people: { id: string; full_name: string }[];
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(createTask, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  if (projects.length === 0) {
    return (
      <p className="text-[13px] text-text-dim">
        Tasks belong to a project you manage. Create a project first, or ask its manager to add
        the task.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-gold-bright px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-gold"
      >
        New task
      </button>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex max-w-xl flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="project_id" className="text-[12px] font-medium text-text-dim">
          Project<span className="ml-0.5 text-danger">*</span>
        </label>
        <select
          id="project_id"
          name="project_id"
          required
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-border-strong"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <Field name="name" label="Task" required error={errors.name} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="assignee_id" className="text-[12px] font-medium text-text-dim">
            Assignee
          </label>
          <select
            id="assignee_id"
            name="assignee_id"
            defaultValue=""
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-border-strong"
          >
            <option value="">Unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
        <Field name="due_date" label="Due date" type="date" error={errors.due_date} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          name="priority"
          label="Priority"
          options={TASK_PRIORITIES}
          defaultValue="medium"
          error={errors.priority}
        />
        <SelectField
          name="status"
          label="Status"
          options={TASK_STATUSES}
          defaultValue="todo"
          error={errors.status}
        />
        <Field
          name="estimated_hours"
          label="Est. hours"
          type="number"
          placeholder="0"
          error={errors.estimated_hours}
        />
      </div>

      <Field name="description" label="Description" textarea error={errors.description} />

      <div className="flex items-center gap-3">
        <Submit>Add task</Submit>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[13px] text-text-dim hover:text-text"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
