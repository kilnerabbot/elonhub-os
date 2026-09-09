"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { describeDbError, type ActionResult } from "@/lib/validate";
import { TASK_STATUSES } from "@/lib/domain";

/**
 * Move a task to a status.
 *
 * Takes plain arguments rather than FormData because the Kanban board calls it
 * from a drop handler, where there is no form. The form-based path on the
 * project page still uses setTaskStatus; both rely on tasks_update in the
 * database for the actual authorisation.
 */
export async function moveTask(
  taskId: string,
  projectId: string,
  status: string
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!taskId) return { ok: false, errors: {}, message: "Missing task." };
  const valid = TASK_STATUSES.find((s) => s === status);
  if (!valid) return { ok: false, errors: {}, message: "Unknown status." };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("tasks")
    .update({ status: valid }, { count: "exact" })
    .eq("id", taskId);

  if (error) return { ok: false, errors: {}, message: describeDbError(error, "moveTask.update") };
  if (count === 0) {
    return {
      ok: false,
      errors: {},
      message: "That move was rejected — you can only move tasks assigned to you, or on a project you manage.",
    };
  }

  revalidatePath("/dashboard/tasks");
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
