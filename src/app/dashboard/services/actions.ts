"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageServices } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { Validator, describeDbError, field, type ActionResult } from "@/lib/validate";

const KINDS = ["once_off", "recurring"] as const;

export async function createService(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageServices(session.role)) {
    return {
      ok: false,
      errors: {},
      message: "Only sales and finance leadership can change the catalogue.",
    };
  }

  const v = new Validator(form);
  const values = {
    sku: v.required("sku", "SKU", 40),
    name: v.required("name", "Name"),
    description: v.optional("description", "Description", 1000),
    category: v.optional("category", "Category", 100),
    cost: v.money("cost", "Cost"),
    sell_price: v.money("sell_price", "Sell price"),
    kind: v.choice("kind", "Kind", KINDS, "once_off"),
    is_vatable: field(form, "is_vatable") === "on",
  };
  if (!v.ok) return v.fail();

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .insert({ ...values, org_id: session.orgId });

  if (error) {
    // (org_id, sku) is unique — surface that as a field error rather than a
    // banner, since the SKU is the thing the user has to change.
    if (error.code === "23505") {
      return { ok: false, errors: { sku: "That SKU is already in the catalogue." } };
    }
    return { ok: false, errors: {}, message: describeDbError(error, "createService.insert") };
  }

  revalidatePath("/dashboard/services");
  return { ok: true };
}
