"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  canCreateCustomer,
  canCreateLead,
  canCreateOpportunity,
  canCreateQuote,
} from "@/lib/permissions";
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
      return { ok: false, errors: {}, message: describeDbError(error, "createLead.insert") };
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

  if (oppError) return { ok: false, errors: {}, message: describeDbError(oppError, "convertLead.insertOpportunity") };

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

/**
 * Raise a quote for a lead.
 *
 * quotes.customer_id is NOT NULL and references customers, so a lead cannot be
 * quoted directly — quoting one necessarily promotes it to a customer. Rather
 * than add a nullable lead_id column and leave two half-populated paths on
 * every quote query, the promotion is made explicit here: pick an existing
 * customer, or let this create one from the lead's own details.
 */
export async function createQuoteForLead(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateQuote(session.role)) return DENIED;

  const leadId = field(form, "lead_id");
  if (!leadId) return { ok: false, errors: {}, message: "Missing lead." };

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, company_name, contact_name, email, phone, industry, location, converted_opportunity_id")
    .eq("id", leadId)
    .maybeSingle();

  if (!lead) return { ok: false, errors: {}, message: "Lead not found." };

  let customerId = field(form, "customer_id");

  if (!customerId) {
    // Creating the customer needs customers_write, which is a different role
    // list to quotes_write — finance can quote but cannot create a customer.
    // Say so plainly rather than letting the insert fail on an RLS violation.
    if (!canCreateCustomer(session.role)) {
      return {
        ok: false,
        errors: {},
        message:
          "Your role can raise quotes but not create customers. Pick an existing customer instead.",
      };
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({
        org_id: session.orgId,
        legal_name: lead.company_name,
        industry: lead.industry,
        address: lead.location,
        owner_id: session.userId,
      })
      .select("id")
      .single();

    if (customerError) {
      return { ok: false, errors: {}, message: describeDbError(customerError, "quoteForLead.insertCustomer") };
    }
    customerId = customer.id;

    // Carry the lead's person across as a contact. A failure here is not worth
    // blocking the quote — the customer and quote are the valuable records,
    // and the contact can be re-entered.
    if (lead.contact_name) {
      await supabase.from("contacts").insert({
        org_id: session.orgId,
        customer_id: customerId,
        full_name: lead.contact_name,
        email: lead.email,
        phone: lead.phone,
        is_primary: true,
      });
    }
  }

  const v = new Validator(form);
  const paymentTerms = v.optional("payment_terms", "Payment terms", 200);
  const validUntil = v.optionalDate("valid_until", "Valid until");
  if (!v.ok) return v.fail();

  const year = new Date().getFullYear();

  // ponytail: fourth copy of this allocate-with-one-retry loop (leads, quotes,
  // projects, invoices). Worth extracting once the reference formats stop
  // differing; not worth touching four money-adjacent call sites right now.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { count } = await supabase
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${year}-01-01`);

    const number = nextReference("QUO", year, (count ?? 0) + attempt);

    const { data, error } = await supabase
      .from("quotes")
      .insert({
        org_id: session.orgId,
        customer_id: customerId,
        // Link the quote to the lead's opportunity when one exists, so a
        // converted lead keeps a single thread through the pipeline.
        opportunity_id: lead.converted_opportunity_id,
        number,
        status: "draft",
        payment_terms: paymentTerms,
        valid_until: validUntil,
        owner_id: session.userId,
      })
      .select("id")
      .single();

    if (!error) {
      revalidatePath("/dashboard/quotes");
      revalidatePath(`/dashboard/crm/leads/${leadId}`);
      redirect(`/dashboard/quotes/${data.id}`);
    }
    if (error.code !== "23505") {
      return { ok: false, errors: {}, message: describeDbError(error, "quoteForLead.insertQuote") };
    }
  }

  return { ok: false, errors: {}, message: "Could not allocate a quote number. Try again." };
}
