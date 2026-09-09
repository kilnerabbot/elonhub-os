"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateLead, canCreateOpportunity } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  PIPELINE_STAGES,
  STAGE_PROBABILITY,
  nextReference,
  type PipelineStageValue,
} from "@/lib/domain";
import { Validator, describeDbError, field, type ActionResult } from "@/lib/validate";

const DENIED: ActionResult = {
  ok: false,
  errors: {},
  message: "Your role does not allow that. Ask an administrator if you need access.",
};

export async function createLead(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateLead(session.role)) return DENIED;

  const v = new Validator(form);
  const values = {
    company_name: v.required("company_name", "Company name"),
    contact_name: v.optional("contact_name", "Contact name"),
    email: v.optionalEmail("email", "Email"),
    phone: v.optional("phone", "Phone", 40),
    source: v.choice("source", "Source", LEAD_SOURCES, "manual"),
    status: v.choice("status", "Status", LEAD_STATUSES, "new"),
    industry: v.optional("industry", "Industry", 100),
    location: v.optional("location", "Location", 100),
    score: v.integer("score", "Score", 0, 100, 0),
    notes: v.optional("notes", "Notes", 2000),
  };
  if (!v.ok) return v.fail();

  const supabase = await createClient();
  const year = new Date().getFullYear();

  // Two attempts: the reference is derived from a row count, so a concurrent
  // create can take the same number and trip the (org_id, reference) unique
  // constraint. Recounting once resolves the realistic case.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${year}-01-01`);

    const reference = nextReference("LEAD", year, (count ?? 0) + attempt);

    const { data, error } = await supabase
      .from("leads")
      .insert({
        ...values,
        reference,
        org_id: session.orgId,
        owner_id: session.userId,
      })
      .select("id")
      .single();

    if (!error) {
      revalidatePath("/dashboard/crm/leads");
      redirect(`/dashboard/crm/leads/${data.id}`);
    }
    if (error.code !== "23505") {
      return { ok: false, errors: {}, message: describeDbError(error) };
    }
  }

  return {
    ok: false,
    errors: {},
    message: "Could not allocate a lead reference. Please try again.",
  };
}

/**
 * Convert a lead into an opportunity.
 *
 * ponytail: two writes, not one transaction. The Supabase JS client cannot
 * open a transaction, so if the second write fails the opportunity exists
 * while the lead still reads as unconverted. That direction is the safe one —
 * no data is lost and the lead can be converted again — but the fix is a
 * SECURITY INVOKER postgres function called via .rpc() if this ever matters.
 */
export async function convertLead(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateOpportunity(session.role)) return DENIED;

  const leadId = field(form, "lead_id");
  if (!leadId) return { ok: false, errors: {}, message: "Missing lead." };

  const v = new Validator(form);
  const name = v.required("name", "Opportunity name");
  const stage = v.choice<PipelineStageValue>("stage", "Stage", PIPELINE_STAGES, "qualified");
  const value = v.money("value", "Value");
  const probability = v.integer("probability", "Probability", 0, 100, STAGE_PROBABILITY[stage]);
  const expectedClose = v.optionalDate("expected_close_date", "Expected close date");
  if (!v.ok) return v.fail();

  const supabase = await createClient();

  const { data: opportunity, error: oppError } = await supabase
    .from("opportunities")
    .insert({
      org_id: session.orgId,
      lead_id: leadId,
      name,
      stage,
      value,
      probability,
      expected_close_date: expectedClose,
      owner_id: session.userId,
    })
    .select("id")
    .single();

  if (oppError) return { ok: false, errors: {}, message: describeDbError(oppError) };

  const { error: leadError } = await supabase
    .from("leads")
    .update({ status: "converted", converted_opportunity_id: opportunity.id })
    .eq("id", leadId);

  if (leadError) {
    return {
      ok: false,
      errors: {},
      message:
        "The opportunity was created, but the lead could not be marked as converted. Update it manually.",
    };
  }

  revalidatePath("/dashboard/crm/leads");
  revalidatePath("/dashboard/pipeline");
  redirect("/dashboard/pipeline");
}
