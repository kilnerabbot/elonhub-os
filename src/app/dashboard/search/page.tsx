import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatZAR } from "@/lib/format";
import { num } from "@/lib/metrics";
import { MIN_QUERY_LENGTH, likePattern, sanitizeQuery } from "@/lib/search";

const PER_GROUP = 5;

type Hit = { id: string; title: string; meta: string; href?: string };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const clean = sanitizeQuery(q);

  if (!clean) {
    return (
      <Empty
        heading="Search the workspace"
        body={`Customers, contacts, leads, opportunities, projects, invoices and teammates. Enter at least ${MIN_QUERY_LENGTH} characters.`}
      />
    );
  }

  const supabase = await createClient();
  const p = likePattern(clean);

  // One .ilike() per column. Never .or() with an interpolated string — that
  // builds a PostgREST filter expression out of user input.
  const [
    custByLegal,
    custByTrading,
    contactByName,
    contactByEmail,
    leadByCompany,
    leadByEmail,
    opps,
    projByName,
    projByCode,
    invoices,
    people,
  ] = await Promise.all([
    supabase.from("customers").select("id, legal_name, trading_name, industry").ilike("legal_name", p).limit(PER_GROUP),
    supabase.from("customers").select("id, legal_name, trading_name, industry").ilike("trading_name", p).limit(PER_GROUP),
    supabase.from("contacts").select("id, full_name, email, role_title").ilike("full_name", p).limit(PER_GROUP),
    supabase.from("contacts").select("id, full_name, email, role_title").ilike("email", p).limit(PER_GROUP),
    supabase.from("leads").select("id, company_name, contact_name, status, reference").ilike("company_name", p).limit(PER_GROUP),
    supabase.from("leads").select("id, company_name, contact_name, status, reference").ilike("email", p).limit(PER_GROUP),
    supabase.from("opportunities").select("id, name, stage, value").ilike("name", p).limit(PER_GROUP),
    supabase.from("projects").select("id, name, code, stage").ilike("name", p).limit(PER_GROUP),
    supabase.from("projects").select("id, name, code, stage").ilike("code", p).limit(PER_GROUP),
    supabase.from("invoices").select("id, number, status, total").ilike("number", p).limit(PER_GROUP),
    supabase.from("profiles").select("id, full_name, role").ilike("full_name", p).limit(PER_GROUP),
  ]);

  const groups: { label: string; hits: Hit[] }[] = [
    {
      label: "Customers",
      hits: merge([custByLegal.data, custByTrading.data], (r) => ({
        id: r.id,
        title: r.legal_name,
        meta: [r.trading_name, r.industry].filter(Boolean).join(" · ") || "—",
      })),
    },
    {
      label: "Contacts",
      hits: merge([contactByName.data, contactByEmail.data], (r) => ({
        id: r.id,
        title: r.full_name,
        meta: [r.role_title, r.email].filter(Boolean).join(" · ") || "—",
      })),
    },
    {
      label: "Leads",
      hits: merge([leadByCompany.data, leadByEmail.data], (r) => ({
        id: r.id,
        title: r.company_name,
        meta: [r.reference, r.contact_name, r.status].filter(Boolean).join(" · "),
      })),
    },
    {
      label: "Opportunities",
      hits: merge([opps.data], (r) => ({
        id: r.id,
        title: r.name,
        meta: `${r.stage} · ${formatZAR(num(r.value))}`,
      })),
    },
    {
      label: "Projects",
      hits: merge([projByName.data, projByCode.data], (r) => ({
        id: r.id,
        title: r.name,
        meta: `${r.code} · ${r.stage}`,
      })),
    },
    {
      label: "Invoices",
      hits: merge([invoices.data], (r) => ({
        id: r.id,
        title: r.number,
        meta: `${r.status} · ${formatZAR(num(r.total))}`,
      })),
    },
    {
      label: "Team",
      hits: merge([people.data], (r) => ({
        id: r.id,
        title: r.full_name,
        meta: String(r.role).replace(/_/g, " "),
        href: "/dashboard/team",
      })),
    },
  ].filter((g) => g.hits.length > 0);

  const total = groups.reduce((a, g) => a + g.hits.length, 0);

  if (total === 0) {
    return (
      <Empty
        heading={`No matches for “${clean}”`}
        body="Nothing in customers, contacts, leads, opportunities, projects, invoices or team matches that. Results are also limited to what your role is allowed to see."
      />
    );
  }

  return (
    <div className="max-w-3xl p-6">
      <p className="mb-6 text-sm text-text-dim">
        {total} {total === 1 ? "match" : "matches"} for{" "}
        <span className="font-medium text-text">“{clean}”</span>. Limited to what your role can
        see.
      </p>

      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-faint">
              {group.label}
            </h2>
            <ul className="overflow-hidden rounded-2xl border border-border">
              {group.hits.map((hit) => (
                <li key={hit.id} className="border-b border-border last:border-0">
                  <Row hit={hit} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-6 text-xs text-text-faint">
        Showing up to {PER_GROUP} results per category. Detail pages arrive with the Phase 2
        modules.
      </p>
    </div>
  );
}

function Row({ hit }: { hit: Hit }) {
  const body = (
    <>
      <span className="truncate text-sm text-text">{hit.title}</span>
      <span className="truncate text-xs capitalize text-text-dim">{hit.meta}</span>
    </>
  );

  if (hit.href) {
    return (
      <Link
        href={hit.href}
        className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
      >
        {body}
      </Link>
    );
  }
  return <div className="flex items-center justify-between gap-4 px-4 py-3">{body}</div>;
}

function Empty({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="max-w-xl p-6">
      <h2 className="text-lg font-semibold tracking-tight text-text">{heading}</h2>
      <p className="mt-2 text-sm text-text-dim">{body}</p>
    </div>
  );
}

/** Flattens result sets from several column queries and drops duplicate rows. */
function merge<T extends { id: string }>(
  sets: (T[] | null)[],
  toHit: (row: T) => Hit
): Hit[] {
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const set of sets) {
    for (const row of set ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(toHit(row));
    }
  }
  return out.slice(0, PER_GROUP);
}
