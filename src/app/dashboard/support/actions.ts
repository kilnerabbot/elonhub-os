"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateTicket } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  TASK_PRIORITIES,
  TICKET_CHANNELS,
  TICKET_STATUSES,
  nextReference,
} from "@/lib/domain";
import { Validator, describeDbError, field, type ActionResult } from "@/lib/validate";

const DENIED: ActionResult = {
  ok: false,
  errors: {},
  message: "Logging and working tickets needs the support agent role.",
};

export async function createTicket(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateTicket(session.role)) return DENIED;

  const v = new Validator(form);
  const values = {
    subject: v.required("subject", "Subject", 200),
    description: v.optional("description", "Description", 4000),
    priority: v.choice("priority", "Priority", TASK_PRIORITIES, "medium"),
    channel: v.choice("channel", "Channel", TICKET_CHANNELS, "whatsapp"),
    requester_name: v.optional("requester_name", "Reported by", 120),
    requester_email: v.optionalEmail("requester_email", "Email"),
    requester_phone: v.optional("requester_phone", "Phone", 40),
  };
  if (!v.ok) return v.fail();

  const supabase = await createClient();
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 2; attempt++) {
    const { count } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${year}-01-01`);

    const number = nextReference("SUP", year, (count ?? 0) + attempt);

    const { data, error } = await supabase
      .from("tickets")
      .insert({
        ...values,
        org_id: session.orgId,
        number,
        // Optional links: a ticket can arrive before the company exists as a
        // customer record, and most are not about a specific project.
        customer_id: field(form, "customer_id") || null,
        project_id: field(form, "project_id") || null,
        // Whoever logs it owns it until reassigned. An unassigned ticket is
        // how a queue quietly stops being anyone's problem.
        assignee_id: field(form, "assignee_id") || session.userId,
        status: "open",
      })
      .select("id")
      .single();

    if (!error) {
      revalidatePath("/dashboard/support");
      redirect(`/dashboard/support/${data.id}`);
    }
    if (error.code !== "23505") {
      return { ok: false, errors: {}, message: describeDbError(error, "createTicket.insert") };
    }
  }

  return { ok: false, errors: {}, message: "Could not allocate a ticket number. Try again." };
}

export async function addTicketMessage(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");

  const ticketId = field(form, "ticket_id");
  if (!ticketId) return { ok: false, errors: {}, message: "Missing ticket." };

  const v = new Validator(form);
  const body = v.required("body", "Message", 4000);
  if (!v.ok) return v.fail();

  const isInternal = field(form, "is_internal") === "on";

  const supabase = await createClient();
  const { error } = await supabase.from("ticket_messages").insert({
    ticket_id: ticketId,
    author_id: session.userId,
    body,
    is_internal: isInternal,
  });

  if (error) {
    return { ok: false, errors: {}, message: describeDbError(error, "addTicketMessage.insert") };
  }

  // The SLA clock stops on the first reply the client can actually see. An
  // internal note is the team talking to itself and must not stop it.
  if (!isInternal) {
    const { data: ticket } = await supabase
      .from("tickets")
      .select("first_response_at")
      .eq("id", ticketId)
      .maybeSingle();

    if (ticket && ticket.first_response_at === null) {
      await supabase
        .from("tickets")
        .update({ first_response_at: new Date().toISOString() })
        .eq("id", ticketId);
    }
  }

  revalidatePath(`/dashboard/support/${ticketId}`);
  revalidatePath("/dashboard/support");
  return { ok: true };
}

export async function updateTicket(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");

  const ticketId = field(form, "ticket_id");
  if (!ticketId) return { ok: false, errors: {}, message: "Missing ticket." };

  const v = new Validator(form);
  const status = v.choice("status", "Status", TICKET_STATUSES, "open");
  const priority = v.choice("priority", "Priority", TASK_PRIORITIES, "medium");
  if (!v.ok) return v.fail();

  const assigneeId = field(form, "assignee_id");
  const now = new Date().toISOString();

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("tickets")
    .select("status, resolved_at, closed_at")
    .eq("id", ticketId)
    .maybeSingle();

  if (!current) return { ok: false, errors: {}, message: "That ticket could not be found." };

  // Stamp the lifecycle timestamps once, on the transition into each state.
  // Re-stamping on every save would make "resolved 3 days ago" reset to now
  // whenever anyone touched the priority.
  const resolvedAt =
    status === "resolved" || status === "closed"
      ? (current.resolved_at ?? now)
      : null;
  const closedAt = status === "closed" ? (current.closed_at ?? now) : null;

  const { error, count } = await supabase
    .from("tickets")
    .update(
      {
        status,
        priority,
        assignee_id: assigneeId || null,
        resolved_at: resolvedAt,
        closed_at: closedAt,
      },
      { count: "exact" }
    )
    .eq("id", ticketId);

  if (error) {
    return { ok: false, errors: {}, message: describeDbError(error, "updateTicket.update") };
  }
  if (count === 0) {
    return {
      ok: false,
      errors: {},
      message: "That change was rejected — you can only work tickets assigned to you.",
    };
  }

  revalidatePath(`/dashboard/support/${ticketId}`);
  revalidatePath("/dashboard/support");
  return { ok: true };
}
