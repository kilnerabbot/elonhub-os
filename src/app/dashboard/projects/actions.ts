"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateProject } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  PROJECT_STAGES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  nextReference,
} from "@/lib/domain";
import { Validator, describeDbError, field, type ActionResult } from "@/lib/validate";

const DENIED: ActionResult = {
  ok: false,
  errors: {},
  message: "Your role does not allow that. Ask an administrator if you need access.",
};

export async function createProject(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateProject(session.role)) return DENIED;

  const v = new Validator(form);
  const customerId = v.required("customer_id", "Customer", 40);
  const name = v.required("name", "Project name");
  const stage = v.choice("stage", "Stage", PROJECT_STAGES, "discovery");
  const startDate = v.optionalDate("start_date", "Start date");
  const endDate = v.optionalDate("end_date", "End date");
  const budget = v.money("budget_amount", "Budget");
  const estimatedHours = v.money("estimated_hours", "Estimated hours");

  // Cross-field check: the individual dates are both valid, but the pair is
  // not. Catching it here keeps a nonsensical schedule out of the database.
  if (startDate && endDate && endDate < startDate) {
    v.errors.end_date = "End date cannot be before the start date.";
  }
  if (!v.ok) return v.fail();

  const supabase = await createClient();
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 2; attempt++) {
    const { count } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${year}-01-01`);

    const code = nextReference("PRJ", year, (count ?? 0) + attempt);

    const { data, error } = await supabase
      .from("projects")
      .insert({
        org_id: session.orgId,
        customer_id: customerId,
        name,
        code,
        stage,
        start_date: startDate,
        end_date: endDate,
        budget_amount: budget,
        estimated_hours: estimatedHours,
        // The creator manages it by default. projects_update and tasks_write
        // both key off manager_id, so leaving it null would lock the project.
        manager_id: session.userId,
      })
      .select("id")
      .single();

    if (!error) {
      revalidatePath("/dashboard/projects");
      redirect(`/dashboard/projects/${data.id}`);
    }
    if (error.code !== "23505") {
      return { ok: false, errors: {}, message: describeDbError(error, "createProject.insert") };
    }
  }

  return { ok: false, errors: {}, message: "Could not allocate a project code. Try again." };
}

export async function setProjectStage(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");

  const projectId = field(form, "project_id");
  if (!projectId) return { ok: false, errors: {}, message: "Missing project." };

  const v = new Validator(form);
  const stage = v.choice("stage", "Stage", PROJECT_STAGES, "discovery");
  if (!v.ok) return v.fail();

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("projects")
    .update({ stage }, { count: "exact" })
    .eq("id", projectId);

  if (error) return { ok: false, errors: {}, message: describeDbError(error, "setProjectStage.update") };
  // Not `count === 0`: supabase-js types count as `number | null`, and a null
  // would fall through and report a rejected write as a successful one.
  if (count !== 1) {
    return { ok: false, errors: {}, message: "Rejected — only the project manager can do that." };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createTask(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");

  const projectId = field(form, "project_id");
  if (!projectId) return { ok: false, errors: {}, message: "Missing project." };

  const v = new Validator(form);
  const values = {
    name: v.required("name", "Task name"),
    description: v.optional("description", "Description", 2000),
    priority: v.choice("priority", "Priority", TASK_PRIORITIES, "medium"),
    status: v.choice("status", "Status", TASK_STATUSES, "todo"),
    due_date: v.optionalDate("due_date", "Due date"),
    estimated_hours: v.money("estimated_hours", "Estimated hours"),
  };
  if (!v.ok) return v.fail();

  const assigneeId = field(form, "assignee_id");

  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert({
    ...values,
    project_id: projectId,
    org_id: session.orgId,
    assignee_id: assigneeId || null,
  });

  if (error) return { ok: false, errors: {}, message: describeDbError(error, "createTask.insert") };

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setTaskStatus(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");

  const taskId = field(form, "task_id");
  const projectId = field(form, "project_id");
  if (!taskId) return { ok: false, errors: {}, message: "Missing task." };

  const v = new Validator(form);
  const status = v.choice("status", "Status", TASK_STATUSES, "todo");
  if (!v.ok) return v.fail();

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("tasks")
    .update({ status }, { count: "exact" })
    .eq("id", taskId);

  if (error) return { ok: false, errors: {}, message: describeDbError(error, "setTaskStatus.update") };
  // Not `count === 0`: supabase-js types count as `number | null`, and a null
  // would fall through and report a rejected write as a successful one.
  if (count !== 1) {
    return {
      ok: false,
      errors: {},
      message: "Rejected — you can only move tasks assigned to you, or on a project you manage.",
    };
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function logTime(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");

  const projectId = field(form, "project_id");
  if (!projectId) return { ok: false, errors: {}, message: "Missing project." };

  const v = new Validator(form);
  const hours = v.money("hours", "Hours");
  const entryDate = v.optionalDate("entry_date", "Date");
  const note = v.optional("note", "Note", 500);

  if (hours <= 0) v.errors.hours = "Hours must be greater than zero.";
  // A day has 24 hours; anything above it is a typo, and it would quietly
  // distort every utilisation figure built on this table later.
  if (hours > 24) v.errors.hours = "That is more than a day. Split it across entries.";
  if (!v.ok) return v.fail();

  const taskId = field(form, "task_id");

  const supabase = await createClient();
  const { error } = await supabase.from("time_entries").insert({
    org_id: session.orgId,
    project_id: projectId,
    task_id: taskId || null,
    // time_entries_write only permits user_id = auth.uid(), so time is always
    // logged against the person logging it. No "on behalf of" path exists.
    user_id: session.userId,
    entry_date: entryDate ?? new Date().toISOString().slice(0, 10),
    hours,
    billable: field(form, "billable") === "on",
    note,
  });

  if (error) return { ok: false, errors: {}, message: describeDbError(error, "logTime.insert") };

  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
