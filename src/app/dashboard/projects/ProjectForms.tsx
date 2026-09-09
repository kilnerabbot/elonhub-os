"use client";

import { useActionState, useEffect, useRef } from "react";
import { Field, FormError, SelectField, Submit } from "@/components/Field";
import type { ActionResult } from "@/lib/validate";
import { PROJECT_STAGES, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain";
import {
  createProject,
  createTask,
  logTime,
  setProjectStage,
  setTaskStatus,
} from "./actions";

type Person = { id: string; full_name: string };

export function CreateProjectForm({
  customers,
}: {
  customers: { id: string; legal_name: string }[];
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(createProject, null);
  const errors = state && !state.ok ? state.errors : {};

  if (customers.length === 0) {
    return (
      <p className="text-[13px] text-text-dim">
        A project belongs to a customer. Add one under Customers first.
      </p>
    );
  }

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />

      <Select
        name="customer_id"
        label="Customer"
        required
        options={customers.map((c) => ({ value: c.id, label: c.legal_name }))}
        error={errors.customer_id}
      />

      <Field name="name" label="Project name" required error={errors.name} />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="stage"
          label="Stage"
          options={PROJECT_STAGES}
          defaultValue="discovery"
          error={errors.stage}
        />
        <Field
          name="budget_amount"
          label="Budget (ZAR)"
          type="number"
          placeholder="0.00"
          error={errors.budget_amount}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="start_date" label="Start" type="date" error={errors.start_date} />
        <Field name="end_date" label="End" type="date" error={errors.end_date} />
        <Field
          name="estimated_hours"
          label="Estimated hours"
          type="number"
          placeholder="0"
          error={errors.estimated_hours}
        />
      </div>

      <div>
        <Submit>Create project</Submit>
      </div>
    </form>
  );
}

export function StageForm({ projectId, stage }: { projectId: string; stage: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    setProjectStage,
    null
  );
  const failed = state && !state.ok;

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="project_id" value={projectId} />
      <select
        name="stage"
        defaultValue={stage}
        disabled={pending}
        aria-label="Project stage"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`rounded-lg border bg-surface-2 px-2.5 py-1.5 text-xs capitalize text-text disabled:opacity-60 ${
          failed ? "border-danger" : "border-border-strong"
        }`}
      >
        {PROJECT_STAGES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      {failed && (
        <span role="alert" className="text-[11px] text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}

export function TaskForm({
  projectId,
  people,
}: {
  projectId: string;
  people: Person[];
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(createTask, null);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />
      <input type="hidden" name="project_id" value={projectId} />

      <Field name="name" label="Task" required error={errors.name} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          name="assignee_id"
          label="Assignee"
          options={[
            { value: "", label: "Unassigned" },
            ...people.map((p) => ({ value: p.id, label: p.full_name })),
          ]}
          error={errors.assignee_id}
        />
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

      <div>
        <Submit>Add task</Submit>
      </div>
    </form>
  );
}

export function TaskStatusSelect({
  taskId,
  projectId,
  status,
  disabled,
}: {
  taskId: string;
  projectId: string;
  status: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    setTaskStatus,
    null
  );
  const failed = state && !state.ok;

  if (disabled) {
    return (
      <span className="text-[11px] capitalize text-text-faint">{status.replace(/_/g, " ")}</span>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-0.5">
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="project_id" value={projectId} />
      <select
        name="status"
        defaultValue={status}
        disabled={pending}
        aria-label="Task status"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`rounded border bg-surface px-1.5 py-1 text-[11px] capitalize text-text disabled:opacity-60 ${
          failed ? "border-danger" : "border-border"
        }`}
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      {failed && (
        <span role="alert" className="text-[10px] text-danger">
          {state.message}
        </span>
      )}
    </form>
  );
}

export function TimeForm({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(logTime, null);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />
      <input type="hidden" name="project_id" value={projectId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="hours" label="Hours" type="number" placeholder="0.0" error={errors.hours} />
        <Field
          name="entry_date"
          label="Date"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          error={errors.entry_date}
        />
        <Select
          name="task_id"
          label="Task"
          options={[
            { value: "", label: "Project-level" },
            ...tasks.map((t) => ({ value: t.id, label: t.name })),
          ]}
          error={errors.task_id}
        />
      </div>

      <Field name="note" label="Note" error={errors.note} />

      <label className="flex items-center gap-2 text-[13px] text-text-dim">
        <input
          type="checkbox"
          name="billable"
          defaultChecked
          className="size-4 accent-[var(--color-accent)]"
        />
        Billable
      </label>

      <div>
        <Submit>Log time</Submit>
      </div>
    </form>
  );
}

/** Local select for options whose value and label differ (ids vs names). */
function Select({
  name,
  label,
  options,
  error,
  required,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  error?: string;
  required?: boolean;
}) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-text-dim">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-border-strong ${
          error ? "border-danger" : "border-border"
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}
