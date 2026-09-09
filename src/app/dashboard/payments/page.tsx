import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageInvoices, canViewPayments } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatZAR } from "@/lib/format";
import { num } from "@/lib/metrics";
import { outstandingCents } from "@/lib/invoice";
import { Card } from "@/components/ui";
import { PaymentEntryForm, type PayableInvoice } from "./PaymentEntryForm";

export default async function PaymentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // payments_select would simply return nothing for other roles. Saying so is
  // better than an empty page that looks like no money has ever come in.
  if (!canViewPayments(session.role)) {
    return (
      <div className="max-w-xl p-6">
        <h2 className="text-lg font-semibold tracking-tight text-text">Not available</h2>
        <p className="mt-2 text-sm text-text-dim">
          The payments ledger is limited to finance and company leadership. Yours is{" "}
          <span className="capitalize">{session.role.replace(/_/g, " ")}</span>.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const yearStart = `${now.getFullYear()}-01-01`;

  const [{ data: payments }, { data: invoices }, { data: customers }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, amount, paid_at, method, reference, invoice_id")
      .order("paid_at", { ascending: false })
      .limit(200),
    supabase
      .from("invoices")
      .select("id, number, status, total, customer_id")
      .not("status", "in", "(draft,void)")
      .limit(300),
    supabase.from("customers").select("id, legal_name").limit(300),
  ]);

  const paymentRows = payments ?? [];
  const invoiceRows = invoices ?? [];
  const customerName = new Map((customers ?? []).map((c) => [c.id, c.legal_name]));
  const invoiceById = new Map(invoiceRows.map((i) => [i.id, i]));

  const receivedThisMonth = paymentRows
    .filter((p) => String(p.paid_at) >= monthStart)
    .reduce((a, p) => a + num(p.amount), 0);
  const receivedYtd = paymentRows
    .filter((p) => String(p.paid_at) >= yearStart)
    .reduce((a, p) => a + num(p.amount), 0);

  // Outstanding per invoice, from the payments actually recorded against it.
  const paidByInvoice = new Map<string, number>();
  for (const p of paymentRows) {
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + num(p.amount));
  }

  const payable: PayableInvoice[] = invoiceRows
    .map((i) => ({
      id: i.id,
      number: i.number,
      customer: customerName.get(i.customer_id) ?? "Unknown customer",
      outstanding: outstandingCents(num(i.total), paidByInvoice.get(i.id) ?? 0) / 100,
    }))
    .filter((i) => i.outstanding > 0)
    .sort((a, b) => a.number.localeCompare(b.number));

  const totalOutstanding = payable.reduce((a, i) => a + i.outstanding, 0);
  const canRecord = canManageInvoices(session.role);

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-6 flex flex-wrap gap-6">
        <Stat label="Received this month" value={formatZAR(receivedThisMonth)} />
        <Stat label="Received YTD" value={formatZAR(receivedYtd)} />
        <Stat
          label="Still outstanding"
          value={formatZAR(totalOutstanding)}
          tone={totalOutstanding > 0 ? "danger" : undefined}
        />
        <Stat label="Payments" value={String(paymentRows.length)} />
      </div>

      {canRecord && (
        <div className="mb-4">
          <Card title="Record a payment">
            <PaymentEntryForm invoices={payable} />
          </Card>
        </div>
      )}

      <Card title={`Recent payments (${paymentRows.length})`}>
        {paymentRows.length === 0 ? (
          <p className="text-[13px] text-text-dim">Nothing received yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th>Invoice</Th>
                <Th>Method</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Receipt</Th>
              </tr>
            </thead>
            <tbody>
              {paymentRows.map((p) => {
                const invoice = invoiceById.get(p.invoice_id);
                return (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 tabular-nums text-text-dim">{p.paid_at}</td>
                    <td className="py-2.5">
                      {invoice ? customerName.get(invoice.customer_id) ?? "—" : "—"}
                    </td>
                    <td className="py-2.5">
                      {invoice ? (
                        <Link
                          href={`/dashboard/invoices/${invoice.id}`}
                          className="text-gold-bright hover:underline"
                        >
                          {invoice.number}
                        </Link>
                      ) : (
                        // The invoice query excludes drafts and voids, so a
                        // payment can outlive its invoice in this view.
                        <span className="text-text-faint">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-text-dim">
                      {p.method || "—"}
                      {p.reference && (
                        <span className="block text-[11px] text-text-faint">{p.reference}</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{formatZAR(num(p.amount))}</td>
                    <td className="py-2.5 text-right">
                      <a
                        href={`/documents/receipt/${p.id}`}
                        target="_blank"
                        rel="noopener"
                        className="text-[11px] text-gold-bright hover:underline"
                      >
                        PDF
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
        {label}
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
