"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Field, FormError, SelectField, Submit } from "@/components/Field";
import { TASK_PRIORITIES, TICKET_CHANNELS, TICKET_STATUSES } from "@/lib/domain";
import type { ActionResult } from "@/lib/validate";
import { addTicketMessage, createTicket, updateTicket } from "./actions";

type Option = { id: string; label: string };

export function NewTicketForm({
  customers,
  projects,
  people,
}: {
  customers: Option[];
  projects: Option[];
  people: Option[];
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(createTicket, null);
  const [open, setOpen] = useState(false);
  const errors = state && !state.ok ? state.errors : {};

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-gold-bright px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-gold"
      >
        Log a ticket
      </button>
    );
  }

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4">
      <FormError message={state && !state.ok ? state.message : undefined} />

      <Field name="subject" label="Subject" required error={errors.subject} />
      <Field name="description" label="What is the problem?" textarea error={errors.description} />

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          name="priority"
          label="Priority"
          options={TASK_PRIORITIES}
          defaultValue="medium"
          error={errors.priority}
        />
        <SelectField
          name="channel"
          label="Came in via"
          options={TICKET_CHANNELS}
          defaultValue="whatsapp"
          error={errors.channel}
        />
        <Picker name="assignee_id" label="Assign to" options={people} emptyLabel="Me" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Picker
          name="customer_id"
          label="Customer"
          options={customers}
          emptyLabel="Not a customer yet"
        />
        <Picker name="project_id" label="Project" options={projects} emptyLabel="None" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="requester_name" label="Reported by" error={errors.requester_name} />
        <Field name="requester_email" label="Email" type="email" error={errors.requester_email} />
        <Field name="requester_phone" label="Phone" type="tel" error={errors.requester_phone} />
      </div>

      <div className="flex items-center gap-3">
        <Submit>Log ticket</Submit>
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

export function ReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(addTicketMessage, null);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <FormError message={state && !state.ok ? state.message : undefined} />
      <input type="hidden" name="ticket_id" value={ticketId} />

      <Field name="body" label="Reply" textarea required error={errors.body} />

      <label className="flex items-center gap-2 text-[13px] text-text-dim">
        <input type="checkbox" name="is_internal" className="size-4 accent-[var(--color-accent)]" />
        Internal note — not shown to the client, and does not stop the SLA clock
      </label>

      <div>
        <Submit>Add reply</Submit>
      </div>
    </form>
  );
}

export function TicketControls({
  ticketId,
  status,
  priority,
  assigneeId,
  people,
}: {
  ticketId: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  people: Option[];
}) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    updateTicket,
    null
  );
  const failed = state && !state.ok;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="ticket_id" value={ticketId} />

      <SelectField
        name="status"
        label="Status"
        options={TICKET_STATUSES}
        defaultValue={status}
      />
      <SelectField
        name="priority"
        label="Priority"
        options={TASK_PRIORITIES}
        defaultValue={priority}
      />
      <Picker
        name="assignee_id"
        label="Assigned to"
        options={people}
        emptyLabel="Unassigned"
        defaultValue={assigneeId ?? ""}
      />

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-gold-bright px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-gold disabled:opacity-60"
      >
        {pending ? "Saving…" : "Update ticket"}
      </button>

      {failed && (
        <span role="alert" className="text-[11px] text-danger">
          {state.message}
        </span>
      )}
      {state?.ok && <span className="text-[11px] text-good">Saved</span>}
    </form>
  );
}

/** Select whose value and label differ, with an explicit empty option. */
function Picker({
  name,
  label,
  options,
  emptyLabel,
  defaultValue = "",
}: {
  name: string;
  label: string;
  options: Option[];
  emptyLabel: string;
  defaultValue?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-text-dim">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-border-strong"
      >
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
