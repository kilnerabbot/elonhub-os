"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/supabase/types";

export async function updateRole(formData: FormData) {
  const userId = formData.get("user_id") as string;
  const role = formData.get("role") as AppRole;

  const supabase = await createClient();
  // RLS (guard_role_change trigger) enforces that only a super_admin's
  // update actually takes effect — this call is a no-op for anyone else.
  await supabase.from("profiles").update({ role }).eq("id", userId);

  revalidatePath("/dashboard/team");
}
