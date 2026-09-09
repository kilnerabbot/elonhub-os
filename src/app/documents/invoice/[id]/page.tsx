import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatZAR } from "@/lib/format";
import { lineNet, quoteTotals } from "@/lib/money";
import { outstandingCents } from "@/lib/invoice";
import { BANKING } from "@/lib/company";
import { DocumentShell, LineTable, TotalsBlock } from "@/components/DocumentShell";

export default async function InvoiceDocument({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, number, status, due_date, created_at, customer_id")
    .eq("id", id)
    .maybeSingle();

  if (!invoice) notFound();

  const [{ data: items }, { data: payments }, { data: customer }, { data: org }] =
    await Promise.all([
      supabase
        .from("invoice_items")
        .select("description, quantity, unit_price, is_vatable, sort_order")
        .eq("invoice_id", id)
        .order("sort_order", { ascending: true }),
      supabase.from("payments").select("amount, paid_at").eq("invoice_id", id),
      supabase
        .from("customers")
        .select("legal_name, trading_name, address, vat_number")
        .eq("id", invoice.customer_id)
        .maybeSingle(),
      supabase.from("organisations").select("vat_rate, vat_number").maybeSingle(),
    ]);

  const rows = items ?? [];
  const lines = rows.map((i) => ({
    quantity: Number(i.quantity),
    unit_price: Number(i.unit_price),
    discount_pct: 0,
    is_vatable: i.is_vatable,
  }));
  const vatRate = Number(org?.vat_rate ?? 15);
  const totals = quoteTotals(lines, vatRate);

  const paid = (payments ?? []).reduce((a, p) => a + Number(p.amount), 0);
  const outstanding = outstandingCents(totals.total, paid) / 100;

  return (
    <DocumentShell
      title={invoice.status === "void" ? "Invoice (void)" : "Tax Invoice"}
      reference={invoice.number}
      meta={[
        { label: "Date", value: String(invoice.created_at).slice(0, 10) },
        ...(invoice.due_date ? [{ label: "Due", value: invoice.due_date }] : []),
        ...(org?.vat_number ? [{ label: "Our VAT no.", value: org.vat_number }] : []),
      ]}
      party={{
        heading: "Billed to",
        lines: [
          customer?.legal_name ?? "—",
          customer?.trading_name ? `trading as ${customer.trading_name}` : "",
          customer?.address ?? "",
          customer?.vat_number ? `VAT ${customer.vat_number}` : "",
        ],
      }}
      footer={
        <>
          <div className="font-medium">Banking details</div>
          <div>
            {BANKING.accountName} · {BANKING.bank} · {BANKING.accountType}
          </div>
          <div>
            Account {BANKING.accountNumber} · Branch {BANKING.branchCode}
          </div>
          <div className="mt-1">
            Please use {invoice.number} as your payment reference.
          </div>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="text-[12px] text-[#6b675e]">This invoice has no line items.</p>
      ) : (
        <LineTable
          columns={["Description", "Qty", "Unit", "Amount"]}
          rows={rows.map((item, index) => [
            <span key="d">
              {item.description}
              {!item.is_vatable && (
                <span className="ml-2 text-[10px] uppercase text-[#9a958a]">no VAT</span>
              )}
            </span>,
            Number(item.quantity),
            formatZAR(Number(item.unit_price)),
            formatZAR(lineNet(lines[index])),
          ])}
        />
      )}

      <TotalsBlock
        rows={[
          { label: "Subtotal", value: formatZAR(totals.subtotal) },
          { label: `VAT (${vatRate}%)`, value: formatZAR(totals.vat_amount) },
          { label: "Total", value: formatZAR(totals.total), strong: true },
          // Only shown once money has moved, so a fresh invoice is not
          // cluttered with two zero rows.
          ...(paid > 0
            ? [
                { label: "Paid", value: `-${formatZAR(paid)}` },
                { label: "Balance due", value: formatZAR(outstanding), strong: true },
              ]
            : []),
        ]}
      />
    </DocumentShell>
  );
}
