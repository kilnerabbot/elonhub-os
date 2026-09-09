import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canEditQuote } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatZAR } from "@/lib/format";
import { num } from "@/lib/metrics";
import { lineNet, quoteTotals } from "@/lib/money";
import { Card } from "@/components/ui";
import { AddItemForm, StatusForm } from "../QuoteForms";
import { removeQuoteItem } from "../actions";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, number, status, subtotal, vat_amount, total, payment_terms, valid_until, customer_id, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (!quote) notFound();

  const [{ data: items }, { data: customer }, { data: services }, { data: org }] =
    await Promise.all([
      supabase
        .from("quote_items")
        .select("id, description, quantity, unit_price, discount_pct, is_vatable, sort_order")
        .eq("quote_id", id)
        .order("sort_order", { ascending: true }),
      supabase.from("customers").select("legal_name").eq("id", quote.customer_id).maybeSingle(),
      supabase.from("services").select("id, sku, name, sell_price, is_vatable").order("sku").limit(200),
      supabase.from("organisations").select("vat_rate").maybeSingle(),
    ]);

  const lines = (items ?? []).map((i) => ({
    quantity: Number(i.quantity),
    unit_price: Number(i.unit_price),
    discount_pct: Number(i.discount_pct),
    is_vatable: i.is_vatable,
  }));

  // Recompute from the lines and compare against what is stored on the quote.
  // The stored figures are a cache; if a write ever failed halfway, the quote
  // would quietly disagree with its own line items, and that is exactly the
  // discrepancy a client finds first.
  const computed = quoteTotals(lines, Number(org?.vat_rate ?? 15));
  const stale = Math.abs(computed.total - num(quote.total)) >= 0.01;

  const editable = canEditQuote(session.role, quote.owner_id, session.userId);

  return (
    <div className="max-w-4xl p-6">
      <Link href="/dashboard/quotes" className="text-[13px] text-text-dim hover:text-text">
        ← Quotes
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-text">{quote.number}</h2>
          <p className="text-sm text-text-dim">
            {customer?.legal_name ?? "Unknown customer"}
            {quote.valid_until ? ` · valid to ${quote.valid_until}` : ""}
          </p>
          {quote.payment_terms && (
            <p className="mt-1 text-[13px] text-text-faint">{quote.payment_terms}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/documents/quote/${quote.id}`}
            target="_blank"
            rel="noopener"
            className="rounded-lg border border-border-strong px-3.5 py-2 text-[13px] text-text transition-colors hover:bg-surface-2"
          >
            Download PDF
          </a>
          {editable && <StatusForm quoteId={quote.id} status={quote.status} />}
        </div>
      </div>

      {stale && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          The stored total ({formatZAR(num(quote.total))}) does not match the line items
          ({formatZAR(computed.total)}). Add or remove a line to force a recalculation.
        </p>
      )}

      <div className="mt-4">
        <Card title={`Line items (${lines.length})`}>
          {lines.length === 0 ? (
            <p className="text-[13px] text-text-dim">No lines yet. The quote totals zero.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-faint">
                    Description
                  </th>
                  <th className="pb-2 text-right text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-faint">
                    Qty
                  </th>
                  <th className="pb-2 text-right text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-faint">
                    Unit
                  </th>
                  <th className="pb-2 text-right text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-faint">
                    Disc
                  </th>
                  <th className="pb-2 text-right text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-faint">
                    Net
                  </th>
                  {editable && <th className="pb-2" />}
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((item, index) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="py-2.5">
                      {item.description}
                      {!item.is_vatable && (
                        <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-text-faint">
                          No VAT
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{Number(item.quantity)}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatZAR(Number(item.unit_price))}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-text-dim">
                      {Number(item.discount_pct)}%
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatZAR(lineNet(lines[index]))}
                    </td>
                    {editable && (
                      <td className="py-2.5 pl-3 text-right">
                        <form action={removeQuoteItem}>
                          <input type="hidden" name="quote_id" value={quote.id} />
                          <input type="hidden" name="item_id" value={item.id} />
                          <button
                            type="submit"
                            aria-label={`Remove ${item.description}`}
                            className="text-[11px] text-text-faint transition-colors hover:text-danger"
                          >
                            Remove
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <dl className="mt-4 flex flex-col gap-1.5 border-t border-border pt-4 text-sm">
            <Total label="Subtotal" value={formatZAR(computed.subtotal)} />
            <Total
              label={`VAT (${Number(org?.vat_rate ?? 15)}%)`}
              value={formatZAR(computed.vat_amount)}
            />
            <Total label="Total" value={formatZAR(computed.total)} strong />
          </dl>
        </Card>
      </div>

      {editable && (
        <div className="mt-4">
          <Card title="Add a line">
            <AddItemForm
              quoteId={quote.id}
              services={(services ?? []).map((s) => ({
                id: s.id,
                sku: s.sku,
                name: s.name,
                sell_price: Number(s.sell_price),
                is_vatable: s.is_vatable,
              }))}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={strong ? "font-semibold text-text" : "text-text-dim"}>{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-semibold text-text" : "text-text"}`}>
        {value}
      </dd>
    </div>
  );
}
