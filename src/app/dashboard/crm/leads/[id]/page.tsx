import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canCreateOpportunity, canCreateQuote } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { label } from "@/lib/domain";
import { ConvertForm } from "../ConvertForm";
import { QuoteFromLeadForm } from "../QuoteFromLeadForm";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("customers")
    .select("id, legal_name")
    .order("legal_name")
    .limit(200);
  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, reference, company_name, contact_name, email, phone, source, industry, location, score, status, notes, converted_opportunity_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (!lead) notFound();

  const converted = lead.status === "converted" || lead.converted_opportunity_id !== null;
  const canConvert = canCreateOpportunity(session.role) && !converted;
  const canQuote = canCreateQuote(session.role);

  return (
    <div className="max-w-4xl p-6">
      <Link href="/dashboard/crm/leads" className="text-[13px] text-text-dim hover:text-text">
        ← Leads
      </Link>

      <h2 className="mt-3 text-xl font-semibold tracking-tight text-text">{lead.company_name}</h2>
      <p className="text-sm text-text-dim">
        {lead.reference} · <span className="capitalize">{label(lead.status)}</span>
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Lead details">
          <dl className="flex flex-col gap-2 text-[13px]">
            <Detail label="Contact" value={lead.contact_name} />
            <Detail label="Email" value={lead.email} href={lead.email ? `mailto:${lead.email}` : null} />
            <Detail label="Phone" value={lead.phone} href={lead.phone ? `tel:${lead.phone}` : null} />
            <Detail label="Source" value={label(lead.source)} />
            <Detail label="Industry" value={lead.industry} />
            <Detail label="Location" value={lead.location} />
            <Detail label="Score" value={String(lead.score)} />
          </dl>
        </Card>

        <Card title="Notes">
          <p className="whitespace-pre-wrap text-[13px] text-text-dim">
            {lead.notes || "No notes recorded."}
          </p>
        </Card>
      </div>

      <div className="mt-4">
        {converted ? (
          <Card title="Converted">
            <p className="text-[13px] text-text-dim">
              This lead has already become an opportunity.{" "}
              <Link href="/dashboard/pipeline" className="text-gold-bright hover:underline">
                View the pipeline
              </Link>
              .
            </p>
          </Card>
        ) : canConvert ? (
          <Card title="Convert to opportunity">
            <ConvertForm leadId={lead.id} defaultName={lead.company_name} />
          </Card>
        ) : (
          <Card title="Convert to opportunity">
            <p className="text-[13px] text-text-dim">
              Converting needs the sales manager or salesperson role.
            </p>
          </Card>
        )}
      </div>

      {canQuote && (
        <div className="mt-4">
          <Card title="Create a quote">
            <QuoteFromLeadForm
              leadId={lead.id}
              companyName={lead.company_name}
              customers={customers ?? []}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function Detail({
  label: name,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string | null;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="flex-none text-text-dim">{name}</dt>
      <dd className="min-w-0 truncate text-right capitalize text-text">
        {value && href ? (
          <a href={href} className="text-gold-bright hover:underline">
            {value}
          </a>
        ) : (
          value ?? "—"
        )}
      </dd>
    </div>
  );
}
