import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageInvoices } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatZAR } from "@/lib/format";
import { num } from "@/lib/metrics";
import { lineNet, quoteTotals } from "@/lib/money";
import { isEditable, outstandingCents } from "@/lib/invoice";
import { Card } from "@/components/ui";
import { label } from "@/lib/domain";
import {
  AddInvoiceItemForm,
  IssueButton,
  PaymentForm,
  VoidButton,
} from "../InvoiceForms";
import { removeInvoiceItem } from "../actions";

export default async function InvoiceDetailPage({
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
    .select("id, number, status, subtotal, vat_amount, total, due_date, customer_id, quote_id")
    .eq("id", id)
    .maybeSingle();

  if (!invoice) notFound();

  const [{ data: items }, { data: payments }, { data: customer }, { data: org }] =
    await Promise.all([
      supabase
        .from("invoice_items")
        .select("id, description, quantity, unit_price, is_vatable, sort_order")
        .eq("invoice_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("payments")
        .select("id, amount, paid_at, method, reference")
        .eq("invoice_id", id)
        .order("paid_at", { ascending: false }),
      supabase.from("customers").select("legal_name").eq("id", invoice.customer_id).maybeSingle(),
      supabase.from("organisations").select("vat_rate").maybeSingle(),
    ]);

  const itemRows = items ?? [];
  const paymentRows = payments ?? [];
  const vatRate = Number(org?.vat_rate ?? 15);

  const lines = itemRows.map((i) => ({
    quantity: Number(i.quantity),
    unit_price: Number(i.unit_price),
    discount_pct: 0,
    is_vatable: i.is_vatable,
  }));

  // Recomputed from the lines, same as quotes: the stored figures are a cache
  // and a half-failed write would leave them disagreeing with the document.
  const computed = quoteTotals(lines, vatRate);
  const stale = Math.abs(computed.total - num(invoice.total)) >= 0.01;

  const paid = paymentRows.reduce((a, p) => a + num(p.amount), 0);
  const outstanding = outstandingCents(computed.total, paid) / 100;

  const canManage = canManageInvoices(session.role);
  const editable = canManage && isEditable(invoice.status);
  const canTakePayment =
    canManage && !isEditable(invoice.status) && invoice.status !== "void" && outstanding > 0;

  return (
    <div className="max-w-4xl p-6">
      <Link href="/dashboard/invoices" className="text-[13px] text-text-dim hover:text-text">
        ← Invoices
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-text">{invoice.number}</h2>
          <p className="text-sm capitalize text-text-dim">
            {customer?.legal_name ?? "Unknown customer"} · {label(invoice.status)}
            {invoice.due_date ? ` · due ${invoice.due_date}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/documents/invoice/${invoice.id}`}
            target="_blank"
            rel="noopener"
            className="rounded-lg border border-border-strong px-3.5 py-2 text-[13px] text-text transition-colors hover:bg-surface-2"
          >
            Download PDF
          </a>
          {canManage && (
            <>
            {isEditable(invoice.status) && <IssueButton invoiceId={invoice.id} />}
            {invoice.status !== "void" && paymentRows.length === 0 && (
              <VoidButton invoiceId={invoice.id} />
            )}
            </>
          )}
        </div>
      </div>

      {stale && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          The stored total ({formatZAR(num(invoice.total))}) does not match the line items
          ({formatZAR(computed.total)}).
        </p>
      )}

      {!isEditable(invoice.status) && invoice.status !== "void" && (
        <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-text-dim">
          This invoice has been issued, so its lines are locked. Corrections require a credit or a
          new invoice.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-6">
        <Stat label="Total" value={formatZAR(computed.total)} />
        <Stat label="Paid" value={formatZAR(paid)} />
        <Stat
          label="Outstanding"
          value={formatZAR(outstanding)}
          tone={outstanding > 0 && invoice.status === "overdue" ? "danger" : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4">
        <Card title={`Line items (${itemRows.length})`}>
          {itemRows.length === 0 ? (
            <p className="text-[13px] text-text-dim">No lines yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <Th>Description</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Unit</Th>
                  <Th align="right">Net</Th>
                  {editable && <th className="pb-2" />}
                </tr>
              </thead>
              <tbody>
                {itemRows.map((item, index) => (
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
                    <td className="py-2.5 text-right tabular-nums">
                      {formatZAR(lineNet(lines[index]))}
                    </td>
                    {editable && (
                      <td className="py-2.5 pl-3 text-right">
                        <form action={removeInvoiceItem}>
                          <input type="hidden" name="invoice_id" value={invoice.id} />
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
            <Total label={`VAT (${vatRate}%)`} value={formatZAR(computed.vat_amount)} />
            <Total label="Total" value={formatZAR(computed.total)} strong />
          </dl>
        </Card>

        {editable && (
          <Card title="Add a line">
            <AddInvoiceItemForm invoiceId={invoice.id} />
          </Card>
        )}

        <Card title={`Payments (${paymentRows.length})`}>
          {paymentRows.length === 0 ? (
            <p className="text-[13px] text-text-dim">Nothing received yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-[13px]">
              {paymentRows.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-text-dim">
                    {p.paid_at}
                    {p.method ? ` · ${p.method}` : ""}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </span>
                  <span className="flex flex-none items-center gap-3">
                    <span className="tabular-nums text-text">{formatZAR(num(p.amount))}</span>
                    <a
                      href={`/documents/receipt/${p.id}`}
                      target="_blank"
                      rel="noopener"
                      className="text-[11px] text-gold-bright hover:underline"
                    >
                      Receipt
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {canTakePayment && (
          <Card title="Record a payment">
            <PaymentForm invoiceId={invoice.id} outstanding={formatZAR(outstanding)} />
          </Card>
        )}
      </div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`pb-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-faint ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
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

function Stat({ label: name, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
        {name}
      </div>
      <div
        className={`mt-0.5 text-xl font-semibold tabular-nums tracking-tight ${
          tone === "danger" ? "text-danger" : "text-text"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
