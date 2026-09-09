"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageInvoices } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { nextReference } from "@/lib/domain";
import { quoteTotals, toCents } from "@/lib/money";
import { toInvoiceLines } from "@/lib/quoteToInvoice";
import { deriveStatus, isEditable, outstandingCents } from "@/lib/invoice";
import { Validator, describeDbError, field, type ActionResult } from "@/lib/validate";

const DENIED: ActionResult = {
  ok: false,
  errors: {},
  message: "Only finance and super admins can work with invoices.",
};

const LOCKED: ActionResult = {
  ok: false,
  errors: {},
  message: "This invoice has been issued and can no longer be edited. Void it and raise a new one.",
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Recompute stored totals and derive the status from recorded payments.
 *
 * Both are caches over invoice_items and payments. Recomputed from scratch on
 * every write so a half-failed operation self-corrects rather than leaving an
 * invoice that disagrees with its own lines or its own payment history.
 */
async function reconcile(invoiceId: string): Promise<string | null> {
  const supabase = await createClient();

  const [{ data: invoice }, { data: items }, { data: payments }, { data: org }] =
    await Promise.all([
      supabase.from("invoices").select("status, due_date").eq("id", invoiceId).maybeSingle(),
      supabase
        .from("invoice_items")
        .select("quantity, unit_price, is_vatable")
        .eq("invoice_id", invoiceId),
      supabase.from("payments").select("amount").eq("invoice_id", invoiceId),
      supabase.from("organisations").select("vat_rate").maybeSingle(),
    ]);

  if (!invoice) return "Invoice not found.";

  const totals = quoteTotals(
    (items ?? []).map((i) => ({
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      // invoice_items has no discount column — discounts are folded into the
      // unit price when a quote is converted, so there is nothing to apply.
      discount_pct: 0,
      is_vatable: i.is_vatable,
    })),
    Number(org?.vat_rate ?? 15)
  );

  const paid = (payments ?? []).reduce((a, p) => a + Number(p.amount), 0);
  const status = deriveStatus(invoice.status, totals.total, paid, invoice.due_date, today());

  const { error } = await supabase
    .from("invoices")
    .update({ ...totals, status })
    .eq("id", invoiceId);

  return error ? describeDbError(error, "reconcile.updateInvoice") : null;
}

export async function createInvoice(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageInvoices(session.role)) return DENIED;

  const v = new Validator(form);
  let customerId = v.required("customer_id", "Customer", 40);
  const dueDate = v.optionalDate("due_date", "Due date");
  if (!v.ok) return v.fail();

  const quoteId = field(form, "quote_id");
  const supabase = await createClient();

  // When a quote is chosen it is the authority on who is being billed. The
  // form previously let the two disagree and merely warned about it, which
  // would have invoiced one customer for another's quoted work.
  if (quoteId) {
    const { data: quote } = await supabase
      .from("quotes")
      .select("customer_id")
      .eq("id", quoteId)
      .maybeSingle();
    if (!quote) return { ok: false, errors: {}, message: "That quote could not be found." };
    customerId = quote.customer_id;
  }

  const year = new Date().getFullYear();

  let invoiceId: string | null = null;

  for (let attempt = 0; attempt < 2 && invoiceId === null; attempt++) {
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${year}-01-01`);

    const number = nextReference("INV", year, (count ?? 0) + attempt);

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        org_id: session.orgId,
        customer_id: customerId,
        quote_id: quoteId || null,
        number,
        status: "draft",
        due_date: dueDate,
      })
      .select("id")
      .single();

    if (!error) {
      invoiceId = data.id;
      break;
    }
    if (error.code !== "23505") {
      return { ok: false, errors: {}, message: describeDbError(error, "createInvoice.insertInvoice") };
    }
  }

  if (invoiceId === null) {
    return { ok: false, errors: {}, message: "Could not allocate an invoice number. Try again." };
  }

  // Copy the quote's lines across, if this invoice came from one.
  if (quoteId) {
    const { data: quoteItems } = await supabase
      .from("quote_items")
      .select("description, quantity, unit_price, discount_pct, is_vatable, sort_order")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: true });

    const rows = toInvoiceLines(
      (quoteItems ?? []).map((q) => ({
        description: q.description,
        quantity: Number(q.quantity),
        unit_price: Number(q.unit_price),
        discount_pct: Number(q.discount_pct),
        is_vatable: q.is_vatable,
        sort_order: q.sort_order,
      }))
    ).map((line) => ({ ...line, invoice_id: invoiceId }));

    if (rows.length > 0) {
      const { error } = await supabase.from("invoice_items").insert(rows);
      if (error) return { ok: false, errors: {}, message: describeDbError(error, "createInvoice.insertItems") };
    }
  }

  const reconcileError = await reconcile(invoiceId);
  if (reconcileError) return { ok: false, errors: {}, message: reconcileError };

  revalidatePath("/dashboard/invoices");
  redirect(`/dashboard/invoices/${invoiceId}`);
}

export async function addInvoiceItem(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageInvoices(session.role)) return DENIED;

  const invoiceId = field(form, "invoice_id");
  if (!invoiceId) return { ok: false, errors: {}, message: "Missing invoice." };

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", invoiceId)
    .maybeSingle();

  // §10: an issued invoice is immutable. RLS cannot express "only while
  // draft", so the rule lives here and must be checked on every write path.
  if (!invoice || !isEditable(invoice.status)) return LOCKED;

  const v = new Validator(form);
  const values = {
    description: v.required("description", "Description", 500),
    quantity: v.money("quantity", "Quantity"),
    unit_price: v.money("unit_price", "Unit price"),
    is_vatable: field(form, "is_vatable") === "on",
  };
  if (values.quantity <= 0) v.errors.quantity = "Quantity must be greater than zero.";
  if (!v.ok) return v.fail();

  const { error } = await supabase
    .from("invoice_items")
    .insert({ ...values, invoice_id: invoiceId });

  if (error) return { ok: false, errors: {}, message: describeDbError(error, "addInvoiceItem.insert") };

  const reconcileError = await reconcile(invoiceId);
  if (reconcileError) return { ok: false, errors: {}, message: reconcileError };

  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  return { ok: true };
}

export async function removeInvoiceItem(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageInvoices(session.role)) return;

  const invoiceId = field(formData, "invoice_id");
  const itemId = field(formData, "item_id");
  if (!invoiceId || !itemId) return;

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!invoice || !isEditable(invoice.status)) return;

  await supabase.from("invoice_items").delete().eq("id", itemId);
  await reconcile(invoiceId);

  revalidatePath(`/dashboard/invoices/${invoiceId}`);
}

export async function issueInvoice(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageInvoices(session.role)) return DENIED;

  const invoiceId = field(form, "invoice_id");
  if (!invoiceId) return { ok: false, errors: {}, message: "Missing invoice." };

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("status, total")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) return { ok: false, errors: {}, message: "Invoice not found." };
  if (!isEditable(invoice.status)) {
    return { ok: false, errors: {}, message: "This invoice has already been issued." };
  }

  const { count } = await supabase
    .from("invoice_items")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);

  // Issuing an empty invoice is always a mistake, and it locks immediately —
  // leaving a permanently uneditable R0 document in the books.
  if ((count ?? 0) === 0) {
    return { ok: false, errors: {}, message: "Add at least one line before issuing." };
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "sent" })
    .eq("id", invoiceId);

  if (error) return { ok: false, errors: {}, message: describeDbError(error, "issueInvoice.update") };

  await reconcile(invoiceId);
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  revalidatePath("/dashboard/invoices");
  return { ok: true };
}

export async function voidInvoice(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageInvoices(session.role)) return DENIED;

  const invoiceId = field(form, "invoice_id");
  if (!invoiceId) return { ok: false, errors: {}, message: "Missing invoice." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);

  // Voiding an invoice that has taken money would orphan those payments.
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      errors: {},
      message: "This invoice has payments against it and cannot be voided. Issue a credit instead.",
    };
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "void" })
    .eq("id", invoiceId);

  if (error) return { ok: false, errors: {}, message: describeDbError(error, "voidInvoice.update") };

  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  revalidatePath("/dashboard/invoices");
  return { ok: true };
}

export async function recordPayment(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageInvoices(session.role)) return DENIED;

  const invoiceId = field(form, "invoice_id");
  if (!invoiceId) return { ok: false, errors: {}, message: "Missing invoice." };

  const v = new Validator(form);
  const amount = v.money("amount", "Amount");
  const paidAt = v.optionalDate("paid_at", "Date");
  const method = v.optional("method", "Method", 60);
  const reference = v.optional("reference", "Reference", 100);
  if (amount <= 0) v.errors.amount = "Amount must be greater than zero.";
  if (!v.ok) return v.fail();

  const supabase = await createClient();
  const [{ data: invoice }, { data: payments }] = await Promise.all([
    supabase.from("invoices").select("status, total").eq("id", invoiceId).maybeSingle(),
    supabase.from("payments").select("amount").eq("invoice_id", invoiceId),
  ]);

  if (!invoice) return { ok: false, errors: {}, message: "Invoice not found." };
  if (invoice.status === "draft") {
    return { ok: false, errors: {}, message: "Issue the invoice before recording a payment." };
  }
  if (invoice.status === "void") {
    return { ok: false, errors: {}, message: "This invoice has been voided." };
  }

  const alreadyPaid = (payments ?? []).reduce((a, p) => a + Number(p.amount), 0);
  const outstanding = outstandingCents(Number(invoice.total), alreadyPaid);

  // Reject overpayment rather than silently booking a negative balance the
  // books have no way to represent.
  if (toCents(amount) > outstanding) {
    return {
      ok: false,
      errors: {
        amount: `That is more than the ${(outstanding / 100).toFixed(2)} still outstanding.`,
      },
    };
  }

  const { error } = await supabase.from("payments").insert({
    org_id: session.orgId,
    invoice_id: invoiceId,
    amount,
    paid_at: paidAt ?? today(),
    method,
    reference,
  });

  if (error) return { ok: false, errors: {}, message: describeDbError(error, "recordPayment.insert") };

  const reconcileError = await reconcile(invoiceId);
  if (reconcileError) return { ok: false, errors: {}, message: reconcileError };

  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Raise an invoice from a quote in one step.
 *
 * The same work as createInvoice with a quote selected, but reached from the
 * quote itself, where the decision is actually made. It also refuses to invoice
 * the same quote twice — double-billing a client is the kind of error that
 * costs a relationship, and nothing in the schema prevents it.
 */
export async function convertQuoteToInvoice(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageInvoices(session.role)) return DENIED;

  const quoteId = field(form, "quote_id");
  if (!quoteId) return { ok: false, errors: {}, message: "Missing quote." };

  const v = new Validator(form);
  const dueDate = v.optionalDate("due_date", "Due date");
  if (!v.ok) return v.fail();

  const supabase = await createClient();

  const [{ data: quote }, { data: existing }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, number, status, customer_id, payment_terms")
      .eq("id", quoteId)
      .maybeSingle(),
    supabase.from("invoices").select("id, number").eq("quote_id", quoteId).limit(1),
  ]);

  if (!quote) return { ok: false, errors: {}, message: "That quote could not be found." };

  if ((existing ?? []).length > 0) {
    return {
      ok: false,
      errors: {},
      message: `Invoice ${existing![0].number} was already raised from this quote.`,
    };
  }

  // A rejected quote was not agreed to. Invoicing it would bill work the client
  // declined; re-quote instead.
  if (quote.status === "rejected") {
    return {
      ok: false,
      errors: {},
      message: "This quote was rejected. Raise a new quote rather than invoicing this one.",
    };
  }

  const { data: quoteItems } = await supabase
    .from("quote_items")
    .select("description, quantity, unit_price, discount_pct, is_vatable, sort_order")
    .eq("quote_id", quoteId)
    .order("sort_order", { ascending: true });

  if ((quoteItems ?? []).length === 0) {
    return { ok: false, errors: {}, message: "This quote has no line items to invoice." };
  }

  const year = new Date().getFullYear();
  let invoiceId: string | null = null;

  for (let attempt = 0; attempt < 2 && invoiceId === null; attempt++) {
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${year}-01-01`);

    const number = nextReference("INV", year, (count ?? 0) + attempt);

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        org_id: session.orgId,
        customer_id: quote.customer_id,
        quote_id: quote.id,
        number,
        status: "draft",
        due_date: dueDate,
      })
      .select("id")
      .single();

    if (!error) {
      invoiceId = data.id;
      break;
    }
    if (error.code !== "23505") {
      return { ok: false, errors: {}, message: describeDbError(error, "convertQuote.insertInvoice") };
    }
  }

  if (invoiceId === null) {
    return { ok: false, errors: {}, message: "Could not allocate an invoice number. Try again." };
  }

  const rows = toInvoiceLines(
    (quoteItems ?? []).map((q) => ({
      description: q.description,
      quantity: Number(q.quantity),
      unit_price: Number(q.unit_price),
      discount_pct: Number(q.discount_pct),
      is_vatable: q.is_vatable,
      sort_order: q.sort_order,
    }))
  ).map((line) => ({ ...line, invoice_id: invoiceId }));

  const { error: itemsError } = await supabase.from("invoice_items").insert(rows);
  if (itemsError) return { ok: false, errors: {}, message: describeDbError(itemsError, "convertQuote.insertItems") };

  // Invoicing a quote implies the client agreed to it. Only advance quotes that
  // are still in play — an already-accepted quote keeps its status.
  if (["draft", "sent", "viewed", "expired"].includes(quote.status)) {
    await supabase.from("quotes").update({ status: "accepted" }).eq("id", quote.id);
  }

  const reconcileError = await reconcile(invoiceId);
  if (reconcileError) return { ok: false, errors: {}, message: reconcileError };

  revalidatePath("/dashboard/invoices");
  revalidatePath(`/dashboard/quotes/${quote.id}`);
  redirect(`/dashboard/invoices/${invoiceId}`);
}
