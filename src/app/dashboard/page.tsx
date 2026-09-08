import { createClient } from "@/lib/supabase/server";
import { StatRow, StatTile } from "@/components/StatTile";
import { formatPct, formatZAR } from "@/lib/format";

export default async function DashboardPage() {
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

  const [
    paymentsMonth,
    paymentsYtd,
    outstandingInvoices,
    newLeads,
    qualifiedOpps,
    openOpps,
    wonThisMonth,
    lostThisMonth,
    activeProjects,
    overdueTasks,
    newCustomers,
    activeCustomers,
  ] = await Promise.all([
    supabase.from("payments").select("amount").gte("paid_at", monthStart),
    supabase.from("payments").select("amount").gte("paid_at", yearStart),
    supabase.from("invoices").select("total").in("status", ["sent", "partially_paid", "overdue"]),
    supabase.from("leads").select("id", { count: "exact", head: true }).gte("created_at", sevenDaysAgo),
    supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .in("stage", ["qualified", "discovery", "proposal", "negotiation"]),
    supabase.from("opportunities").select("value, probability").not("stage", "in", "(won,lost)"),
    supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("stage", "won")
      .gte("updated_at", monthStart),
    supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("stage", "lost")
      .gte("updated_at", monthStart),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .not("stage", "in", "(handover,support)"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .lt("due_date", now.toISOString().slice(0, 10))
      .neq("status", "done"),
    supabase.from("customers").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
    supabase.from("customers").select("id", { count: "exact", head: true }),
  ]);

  const revenueMonth = sum(paymentsMonth.data, "amount");
  const revenueYtd = sum(paymentsYtd.data, "amount");
  const outstanding = sum(outstandingInvoices.data, "total");
  const pipelineValue = (openOpps.data ?? []).reduce((acc, o) => acc + (o.value ?? 0), 0);
  const forecastRevenue = (openOpps.data ?? []).reduce(
    (acc, o) => acc + (o.value ?? 0) * ((o.probability ?? 0) / 100),
    0
  );
  const won = wonThisMonth.count ?? 0;
  const lost = lostThisMonth.count ?? 0;
  const conversionRate = won + lost > 0 ? (won / (won + lost)) * 100 : 0;

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-text">Dashboard</h1>
      <p className="mb-8 text-sm text-text-dim">
        Live from the database — figures read 0 until leads, quotes and invoices start flowing
        through the system.
      </p>

      <div className="flex flex-col gap-8">
        <StatRow title="Financial">
          <StatTile label="Revenue this month" value={formatZAR(revenueMonth)} />
          <StatTile label="Revenue YTD" value={formatZAR(revenueYtd)} />
          <StatTile label="Outstanding invoices" value={formatZAR(outstanding)} />
        </StatRow>

        <StatRow title="Sales">
          <StatTile label="New leads (7d)" value={String(newLeads.count ?? 0)} />
          <StatTile label="Qualified opportunities" value={String(qualifiedOpps.count ?? 0)} />
          <StatTile label="Pipeline value" value={formatZAR(pipelineValue)} />
          <StatTile label="Won / lost this month" value={`${won} / ${lost}`} />
          <StatTile label="Conversion rate" value={formatPct(conversionRate)} />
          <StatTile label="Forecast revenue" value={formatZAR(forecastRevenue)} />
        </StatRow>

        <StatRow title="Projects">
          <StatTile label="Active projects" value={String(activeProjects.count ?? 0)} />
          <StatTile label="Overdue tasks" value={String(overdueTasks.count ?? 0)} />
        </StatRow>

        <StatRow title="Customers">
          <StatTile label="New customers (30d)" value={String(newCustomers.count ?? 0)} />
          <StatTile label="Active customers" value={String(activeCustomers.count ?? 0)} />
        </StatRow>
      </div>
    </div>
  );
}

function sum(rows: { amount?: number; total?: number }[] | null, key: "amount" | "total") {
  return (rows ?? []).reduce((acc, r) => acc + (r[key] ?? 0), 0);
}
