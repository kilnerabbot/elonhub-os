import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatZAR } from "@/lib/format";
import { lineNet, quoteTotals } from "@/lib/money";
import { DocumentShell, LineTable, TotalsBlock } from "@/components/DocumentShell";

export default async function QuoteDocument({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  // RLS scopes this exactly as the dashboard does, so a document URL cannot be
  // used to read a quote the signed-in user could not otherwise open.
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, number, status, payment_terms, valid_until, created_at, customer_id")
    .eq("id", id)
    .maybeSingle();

  if (!quote) notFound();

  const [{ data: items }, { data: customer }, { data: org }] = await Promise.all([
    supabase
      .from("quote_items")
      .select("description, quantity, unit_price, discount_pct, is_vatable, sort_order")
      .eq("quote_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("customers")
      .select("legal_name, trading_name, address, vat_number")
      .eq("id", quote.customer_id)
      .maybeSingle(),
    supabase.from("organisations").select("vat_rate, vat_number").maybeSingle(),
  ]);

  const rows = items ?? [];
  const lines = rows.map((i) => ({
    quantity: Number(i.quantity),
    unit_price: Number(i.unit_price),
    discount_pct: Number(i.discount_pct),
    is_vatable: i.is_vatable,
  }));
  const vatRate = Number(org?.vat_rate ?? 15);
  // Recomputed from the lines rather than read from the stored cache, so the
  // printed document can never disagree with its own line items.
  const totals = quoteTotals(lines, vatRate);

  return (
    <DocumentShell
      title="Quotation"
      reference={quote.number}
      meta={[
        { label: "Date", value: String(quote.created_at).slice(0, 10) },
        ...(quote.valid_until ? [{ label: "Valid until", value: quote.valid_until }] : []),
        ...(org?.vat_number ? [{ label: "Our VAT no.", value: org.vat_number }] : []),
      ]}
      party={{
        heading: "Prepared for",
        lines: [
          customer?.legal_name ?? "—",
          customer?.trading_name ? `trading as ${customer.trading_name}` : "",
          customer?.address ?? "",
          customer?.vat_number ? `VAT ${customer.vat_number}` : "",
        ],
      }}
      footer={
        <>
          {quote.payment_terms && (
            <div>
              <span className="font-medium">Payment terms:</span> {quote.payment_terms}
            </div>
          )}
          <div>
            Accepted by signature or written confirmation. Prices exclude VAT unless a line is
            marked otherwise.
          </div>
        </>
      }
    >
      {rows.length === 0 ? (
        <p className="text-[12px] text-[#6b675e]">This quote has no line items.</p>
      ) : (
        <LineTable
          columns={["Description", "Qty", "Unit", "Disc", "Amount"]}
          rows={rows.map((item, index) => [
            <span key="d">
              {item.description}
              {!item.is_vatable && (
                <span className="ml-2 text-[10px] uppercase text-[#9a958a]">no VAT</span>
              )}
            </span>,
            Number(item.quantity),
            formatZAR(Number(item.unit_price)),
            `${Number(item.discount_pct)}%`,
            formatZAR(lineNet(lines[index])),
          ])}
        />
      )}

      <TotalsBlock
        rows={[
          { label: "Subtotal", value: formatZAR(totals.subtotal) },
          { label: `VAT (${vatRate}%)`, value: formatZAR(totals.vat_amount) },
          { label: "Total", value: formatZAR(totals.total), strong: true },
        ]}
      />
    </DocumentShell>
  );
}
