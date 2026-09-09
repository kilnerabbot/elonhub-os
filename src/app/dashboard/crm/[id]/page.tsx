import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateContact } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { ContactForm } from "../ContactForm";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();

  // RLS turns "not allowed to see this customer" into "no rows", which is the
  // behaviour we want: an unauthorised id is indistinguishable from a missing
  // one, so this page cannot be used to probe which customers exist.
  const { data: customer } = await supabase
    .from("customers")
    .select("id, legal_name, trading_name, registration_number, vat_number, industry, website, address, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (!customer) notFound();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, full_name, role_title, email, phone, is_primary")
    .eq("customer_id", id)
    .order("is_primary", { ascending: false })
    .order("full_name", { ascending: true });

  const canAddContact = canCreateContact(session.role);

  return (
    <div className="max-w-4xl p-6">
      <Link href="/dashboard/crm" className="text-[13px] text-text-dim hover:text-text">
        ← Customers
      </Link>

      <h2 className="mt-3 text-xl font-semibold tracking-tight text-text">
        {customer.legal_name}
      </h2>
      {customer.trading_name && (
        <p className="text-sm text-text-dim">trading as {customer.trading_name}</p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Details">
          <dl className="flex flex-col gap-2 text-[13px]">
            <Detail label="Industry" value={customer.industry} />
            <Detail label="Registration number" value={customer.registration_number} />
            <Detail label="VAT number" value={customer.vat_number} />
            <Detail label="Website" value={customer.website} href={customer.website} />
            <Detail label="Address" value={customer.address} />
          </dl>
        </Card>

        <Card title={`Contacts (${(contacts ?? []).length})`}>
          {(contacts ?? []).length === 0 ? (
            <p className="text-[13px] text-text-dim">No contacts recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {(contacts ?? []).map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-text">
                      {c.full_name}
                      {c.is_primary && (
                        <span className="ml-2 rounded bg-good-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-good">
                          Primary
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-text-dim">
                      {[c.role_title, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {canAddContact && (
        <div className="mt-4">
          <Card title="Add a contact">
            <ContactForm customerId={customer.id} />
          </Card>
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string | null;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="flex-none text-text-dim">{label}</dt>
      <dd className="min-w-0 truncate text-right text-text">
        {value && href ? (
          // rel="noreferrer" matters: href is customer-supplied, so the
          // destination should not receive this app's URL as a referrer.
          <a
            href={href.startsWith("http") ? href : `https://${href}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold-bright hover:underline"
          >
            {value}
          </a>
        ) : (
          value ?? "—"
        )}
      </dd>
    </div>
  );
}
