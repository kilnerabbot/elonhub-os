"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateQuote } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { nextReference } from "@/lib/domain";
import { quoteTotals } from "@/lib/money";
import { Validator, describeDbError, field, type ActionResult } from "@/lib/validate";

const QUOTE_STATUSES = ["draft", "sent", "viewed", "accepted", "rejected", "expired"] as const;

const DENIED: ActionResult = {
  ok: false,
  errors: {},
  message: "Your role does not allow that. Ask an administrator if you need access.",
};

/**
 * Recompute and persist a quote's stored totals from its line items.
 *
 * Totals live on the quote row so lists and the dashboard can read them
 * without joining every line. That means they are a cache, and every write to
 * quote_items must call this — otherwise the quote silently disagrees with its
 * own lines. Recomputed from scratch rather than adjusted incrementally, so a
 * missed update self-corrects on the next change.
 */
async function recomputeTotals(quoteId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: org } = await supabase.from("organisations").select("vat_rate").maybeSingle();
  const { data: items, error } = await supabase
    .from("quote_items")
    .select("quantity, unit_price, discount_pct, is_vatable")
    .eq("quote_id", quoteId);

  if (error) return describeDbError(error);

  const totals = quoteTotals(
    (items ?? []).map((i) => ({
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      discount_pct: Number(i.discount_pct),
      is_vatable: i.is_vatable,
    })),
    // Falls back to South Africa's standard rate only if the org row is
    // unreadable; the seeded organisation sets it explicitly.
    Number(org?.vat_rate ?? 15)
  );

  const { error: updateError } = await supabase
    .from("quotes")
    .update(totals)
    .eq("id", quoteId);

  return updateError ? describeDbError(updateError) : null;
}

export async function createQuote(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateQuote(session.role)) return DENIED;

  const v = new Validator(form);
  const customerId = v.required("customer_id", "Customer", 40);
  const paymentTerms = v.optional("payment_terms", "Payment terms", 200);
  const validUntil = v.optionalDate("valid_until", "Valid until");
  if (!v.ok) return v.fail();

  const supabase = await createClient();
  const year = new Date().getFullYear();

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
      redirect(`/dashboard/quotes/${data.id}`);
    }
    if (error.code !== "23505") {
      return { ok: false, errors: {}, message: describeDbError(error) };
    }
  }

  return { ok: false, errors: {}, message: "Could not allocate a quote number. Try again." };
}

export async function addQuoteItem(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");

  const quoteId = field(form, "quote_id");
  if (!quoteId) return { ok: false, errors: {}, message: "Missing quote." };

  const v = new Validator(form);
  const values = {
    description: v.required("description", "Description", 500),
    quantity: v.money("quantity", "Quantity"),
    unit_price: v.money("unit_price", "Unit price"),
    discount_pct: v.integer("discount_pct", "Discount %", 0, 100, 0),
    is_vatable: field(form, "is_vatable") === "on",
  };
  if (values.quantity <= 0) {
    v.errors.quantity = "Quantity must be greater than zero.";
  }
  if (!v.ok) return v.fail();

  const supabase = await createClient();
  const { error } = await supabase.from("quote_items").insert({
    ...values,
    quote_id: quoteId,
    service_id: field(form, "service_id") || null,
  });

  if (error) return { ok: false, errors: {}, message: describeDbError(error) };

  const totalsError = await recomputeTotals(quoteId);
  if (totalsError) return { ok: false, errors: {}, message: totalsError };

  revalidatePath(`/dashboard/quotes/${quoteId}`);
  return { ok: true };
}

export async function removeQuoteItem(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const quoteId = field(formData, "quote_id");
  const itemId = field(formData, "item_id");
  if (!quoteId || !itemId) return;

  const supabase = await createClient();
  await supabase.from("quote_items").delete().eq("id", itemId);
  await recomputeTotals(quoteId);

  revalidatePath(`/dashboard/quotes/${quoteId}`);
}

export async function setQuoteStatus(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");

  const quoteId = field(form, "quote_id");
  if (!quoteId) return { ok: false, errors: {}, message: "Missing quote." };

  const v = new Validator(form);
  const status = v.choice("status", "Status", QUOTE_STATUSES, "draft");
  if (!v.ok) return v.fail();

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("quotes")
    .update({ status }, { count: "exact" })
    .eq("id", quoteId);

  if (error) return { ok: false, errors: {}, message: describeDbError(error) };
  if (count === 0) {
    return { ok: false, errors: {}, message: "That change was rejected — you do not own this quote." };
  }

  revalidatePath(`/dashboard/quotes/${quoteId}`);
  revalidatePath("/dashboard/quotes");
  return { ok: true };
}
