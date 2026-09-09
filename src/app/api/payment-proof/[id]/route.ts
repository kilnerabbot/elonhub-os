import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canViewPayments } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * Serve a payment's proof via a short-lived signed URL.
 *
 * The bucket is private, so there is no public URL to link to. This checks the
 * session and role, confirms RLS lets this caller see the payment, then mints a
 * URL valid for a minute and redirects to it. A leaked link therefore expires
 * rather than exposing a bank document indefinitely.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  }
  if (!canViewPayments(session.role)) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const supabase = await createClient();
  // RLS decides visibility. An id the caller cannot see returns no row, and
  // therefore 404 — indistinguishable from one that does not exist.
  const { data: payment } = await supabase
    .from("payments")
    .select("proof_path")
    .eq("id", id)
    .maybeSingle();

  if (!payment?.proof_path) {
    return NextResponse.json({ error: "No proof on file." }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(payment.proof_path, 60);

  if (error || !data) {
    console.error("[storage] signed url", error);
    return NextResponse.json({ error: "Could not open that file." }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
