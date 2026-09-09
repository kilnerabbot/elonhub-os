"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PIPELINE_STAGES, STAGE_PROBABILITY, type PipelineStageValue } from "@/lib/domain";
import { Validator, describeDbError, field, type ActionResult } from "@/lib/validate";

export async function moveOpportunity(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");

  const id = field(form, "opportunity_id");
  if (!id) return { ok: false, errors: {}, message: "Missing opportunity." };

  const v = new Validator(form);
  const stage = v.choice<PipelineStageValue>("stage", "Stage", PIPELINE_STAGES, "new");
  if (!v.ok) return v.fail();

  const supabase = await createClient();

  // Probability tracks the stage. Without this the weighted forecast on the
  // dashboard keeps using the old stage's odds after a deal moves, and quietly
  // reports a number nobody entered.
  const { error, count } = await supabase
    .from("opportunities")
    .update({ stage, probability: STAGE_PROBABILITY[stage] }, { count: "exact" })
    .eq("id", id);

  if (error) return { ok: false, errors: {}, message: describeDbError(error, "moveOpportunity.update") };
  if (count === 0) {
    return {
      ok: false,
      errors: {},
      message: "That move was rejected — you can only move opportunities you own.",
    };
  }

  revalidatePath("/dashboard/pipeline");
  revalidatePath("/dashboard");
  return { ok: true };
}
