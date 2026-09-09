import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatZAR } from "@/lib/format";
import { quoteTotals } from "@/lib/money";
import { outstandingCents } from "@/lib/invoice";
import { DocumentShell, LineTable, TotalsBlock } from "@/components/DocumentShell";

/**
 * A receipt for one payment.
 *
 * Receipts are per payment, not per invoice: a part-paid invoice produces
 * several, and each has to stand alone as proof that a specific amount was
 * received on a specific date.
 */
export default async function ReceiptDocument({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id, amount, paid_at, method, reference, invoice_id, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!payment) notFound();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, number, customer_id, due_date")
    .eq("id", payment.invoice_id)
    .maybeSingle();

  if (!invoice) notFound();

  const [{ data: items }, { data: allPayments }, { data: customer }, { data: org }] =
    await Promise.all([
      supabase
        .from("invoice_items")
        .select("quantity, unit_price, is_vatable")
        .eq("invoice_id", invoice.id),
      supabase
        .from("payments")
        .select("amount, paid_at, created_at")
        .eq("invoice_id", invoice.id)
        .order("paid_at", { ascending: true }),
      supabase
        .from("customers")
        .select("legal_name, trading_name, address, vat_number")
        .eq("id", invoice.customer_id)
        .maybeSingle(),
      supabase.from("organisations").select("vat_rate, vat_number").maybeSingle(),
    ]);

  const vatRate = Number(org?.vat_rate ?? 15);
  const totals = quoteTotals(
    (items ?? []).map((i) => ({
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      discount_pct: 0,
      is_vatable: i.is_vatable,
    })),
    vatRate
  );

  const paidToDate = (allPayments ?? []).reduce((a, p) => a + Number(p.amount), 0);
  const balance = outstandingCents(totals.total, paidToDate) / 100;

  // Receipt number is derived from the payment's own id rather than stored,
  // since there is no receipts table. Stable for a given payment, which is
  // what matters if a client asks for the same receipt twice.
  const receiptNumber = `REC-${payment.id.slice(0, 8).toUpperCase()}`;

  return (
    <DocumentShell
      title="Receipt"
      reference={receiptNumber}
      meta={[
        { label: "Received", value: String(payment.paid_at).slice(0, 10) },
        { label: "Invoice", value: invoice.number },
        ...(org?.vat_number ? [{ label: "Our VAT no.", value: org.vat_number }] : []),
      ]}
      party={{
        heading: "Received from",
        lines: [
          customer?.legal_name ?? "—",
          customer?.trading_name ? `trading as ${customer.trading_name}` : "",
          customer?.address ?? "",
          customer?.vat_number ? `VAT ${customer.vat_number}` : "",
        ],
      }}
      footer={
        <div>
          This receipt confirms the amount received above. It is not a tax invoice — refer to{" "}
          {invoice.number} for the VAT breakdown.
        </div>
      }
    >
      <LineTable
        columns={["Description", "Method", "Reference", "Amount"]}
        rows={[
          [
            `Payment against invoice ${invoice.number}`,
            payment.method || "—",
            payment.reference || "—",
            formatZAR(Number(payment.amount)),
          ],
        ]}
      />

      <TotalsBlock
        rows={[
          { label: "Amount received", value: formatZAR(Number(payment.amount)), strong: true },
          { label: "Invoice total", value: formatZAR(totals.total) },
          { label: "Paid to date", value: formatZAR(paidToDate) },
          {
            label: balance > 0 ? "Balance still due" : "Balance",
            value: formatZAR(balance),
            strong: balance > 0,
          },
        ]}
      />
    </DocumentShell>
  );
}
