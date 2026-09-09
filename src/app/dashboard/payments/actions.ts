"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageInvoices } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { checkUpload, proofPath } from "@/lib/upload";
import { describeDbError, field, type ActionResult } from "@/lib/validate";

const BUCKET = "payment-proofs";

export async function uploadProof(
  _prev: ActionResult | null,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManageInvoices(session.role)) {
    return {
      ok: false,
      errors: {},
      message: "Only finance and super admins can attach a proof of payment.",
    };
  }

  const paymentId = field(form, "payment_id");
  if (!paymentId) return { ok: false, errors: {}, message: "Missing payment." };

  const file = form.get("proof");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, errors: { proof: "Choose a file to upload." } };
  }

  // Read the whole file once: the header is needed for the magic-byte check
  // and the body for the upload, and a File can only be consumed once.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkUpload(file.name, bytes.byteLength, bytes.subarray(0, 8));
  if (!check.ok) return { ok: false, errors: { proof: check.error } };

  const supabase = await createClient();

  // Confirm the payment is visible to this caller before writing anything.
  // Without it, an arbitrary id would create an orphaned object in the bucket.
  const { data: payment } = await supabase
    .from("payments")
    .select("id")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return { ok: false, errors: {}, message: "That payment could not be found." };

  const path = proofPath(paymentId, check.extension);
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: check.mime,
    // Replacing a proof is legitimate — the first upload is often the wrong
    // page of a bank statement.
    upsert: true,
  });

  if (uploadError) {
    console.error("[storage] uploadProof", uploadError);
    return {
      ok: false,
      errors: {},
      message: "The file could not be stored. Check that migration 0006 has been applied.",
    };
  }

  const { error } = await supabase
    .from("payments")
    .update({ proof_path: path })
    .eq("id", paymentId);

  if (error) {
    return { ok: false, errors: {}, message: describeDbError(error, "uploadProof.update") };
  }

  revalidatePath("/dashboard/payments");
  return { ok: true };
}
