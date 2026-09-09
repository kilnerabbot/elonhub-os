"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateContact, canCreateCustomer } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { Validator, describeDbError, field, type ActionResult } from "@/lib/validate";

const DENIED: ActionResult = {
  ok: false,
  errors: {},
  message: "Your role does not allow that. Ask an administrator if you need access.",
};

export async function createCustomer(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateCustomer(session.role)) return DENIED;

  const v = new Validator(form);
  const values = {
    legal_name: v.required("legal_name", "Legal name"),
    trading_name: v.optional("trading_name", "Trading name"),
    registration_number: v.optional("registration_number", "Registration number", 50),
    vat_number: v.optional("vat_number", "VAT number", 50),
    industry: v.optional("industry", "Industry", 100),
    website: v.optional("website", "Website", 255),
    address: v.optional("address", "Address", 500),
  };
  if (!v.ok) return v.fail();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    // org_id comes from the caller's own profile, never from the form —
    // otherwise a crafted post could try to write into another org. RLS would
    // reject it anyway, but the value should never be client-controlled.
    .insert({ ...values, org_id: session.orgId, owner_id: session.userId })
    .select("id")
    .single();

  if (error) return { ok: false, errors: {}, message: describeDbError(error, "createCustomer.insert") };

  revalidatePath("/dashboard/crm");
  redirect(`/dashboard/crm/${data.id}`);
}

export async function createContact(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canCreateContact(session.role)) return DENIED;

  const customerId = field(form, "customer_id");
  if (!customerId) return { ok: false, errors: {}, message: "Missing customer." };

  const v = new Validator(form);
  const values = {
    full_name: v.required("full_name", "Full name"),
    role_title: v.optional("role_title", "Job title", 100),
    email: v.optionalEmail("email", "Email"),
    phone: v.optional("phone", "Phone", 40),
    is_primary: field(form, "is_primary") === "on",
  };
  if (!v.ok) return v.fail();

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .insert({ ...values, customer_id: customerId, org_id: session.orgId });

  if (error) return { ok: false, errors: {}, message: describeDbError(error, "createContact.insert") };

  revalidatePath(`/dashboard/crm/${customerId}`);
  return { ok: true };
}
