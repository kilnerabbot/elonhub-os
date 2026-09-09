import { createClient } from "@/lib/supabase/server";
import { formatPct, formatZAR } from "@/lib/format";
import { bucketSum, num, pctDelta, ratePct } from "@/lib/metrics";
import {
  Card,
  DeltaPill,
  Donut,
  EmptyNote,
  GroupedBars,
  Label,
  LegendDot,
  Sparkline,
} from "@/components/ui";

const DAY = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export default async function DashboardPage() {
  const supabase = await createClient();

  const now = new Date();
  const monthStart = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const prevMonthStart = isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const yearStart = isoDate(new Date(now.getFullYear(), 0, 1));
  const sixMonthsAgo = isoDate(new Date(now.getFullYear(), now.getMonth() - 5, 1));
  const sevenDaysAgo = isoDate(new Date(now.getTime() - 6 * DAY));
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY).toISOString();
  const sevenDaysAgoTs = new Date(now.getTime() - 7 * DAY).toISOString();

  const [
    paymentsMonth,
    paymentsPrevMonth,
    paymentsYtd,
    paymentsWeek,
    paymentsHalfYear,
    invoicesHalfYear,
    outstandingInvoices,
    newLeads,
    qualifiedOpps,
    openOpps,
    stageRows,
    wonThisMonth,
    lostThisMonth,
    activeProjects,
    overdueTasks,
    newCustomers,
    activeCustomers,
  ] = await Promise.all([
    supabase.from("payments").select("amount").gte("paid_at", monthStart),
    supabase
      .from("payments")
      .select("amount")
      .gte("paid_at", prevMonthStart)
      .lt("paid_at", monthStart),
    supabase.from("payments").select("amount").gte("paid_at", yearStart),
    supabase.from("payments").select("amount, paid_at").gte("paid_at", sevenDaysAgo),
    supabase.from("payments").select("amount, paid_at").gte("paid_at", sixMonthsAgo),
    supabase.from("invoices").select("total, created_at").gte("created_at", sixMonthsAgo),
    supabase.from("invoices").select("total").in("status", ["sent", "partially_paid", "overdue"]),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgoTs),
    supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .in("stage", ["qualified", "discovery", "proposal", "negotiation"]),
    supabase.from("opportunities").select("value, probability").not("stage", "in", "(won,lost)"),
    supabase.from("opportunities").select("stage"),
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
      .lt("due_date", isoDate(now))
      .neq("status", "done"),
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo),
    supabase.from("customers").select("id", { count: "exact", head: true }),
  ]);

  const revenueMonth = sum(paymentsMonth.data, "amount");
  const revenuePrevMonth = sum(paymentsPrevMonth.data, "amount");
  const revenueYtd = sum(paymentsYtd.data, "amount");
  const outstanding = sum(outstandingInvoices.data, "total");
  const pipelineValue = (openOpps.data ?? []).reduce((a, o) => a + num(o.value), 0);
  const forecastRevenue = (openOpps.data ?? []).reduce(
    (a, o) => a + num(o.value) * (num(o.probability) / 100),
    0
  );
  const won = wonThisMonth.count ?? 0;
  const lost = lostThisMonth.count ?? 0;
  const conversionRate = ratePct(won, won + lost);
  const revenueDelta = pctDelta(revenueMonth, revenuePrevMonth);

  const billed = revenueYtd + outstanding;
  const collectionRate = ratePct(revenueYtd, billed);

  // Daily payment totals for the last 7 days, zero-filled so gaps stay visible.
  const days = Array.from({ length: 7 }, (_, i) =>
    isoDate(new Date(now.getTime() - (6 - i) * DAY))
  );
  const dailyTotals = bucketSum(
    paymentsWeek.data,
    days,
    (r) => String(r.paid_at).slice(0, 10),
    (r) => num(r.amount)
  );

  // Last 6 calendar months: invoices raised vs payments received.
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { key: isoDate(d).slice(0, 7), label: d.toLocaleString("en-ZA", { month: "short" }) };
  });
  const monthKeys = months.map((m) => m.key);
  const raised = bucketSum(
    invoicesHalfYear.data,
    monthKeys,
    (r) => String(r.created_at).slice(0, 7),
    (r) => num(r.total)
  );
  const received = bucketSum(
    paymentsHalfYear.data,
    monthKeys,
    (r) => String(r.paid_at).slice(0, 7),
    (r) => num(r.amount)
  );
  const bars = months.map((m, i) => ({ label: m.label, a: raised[i], b: received[i] }));

  const stages = ["new", "qualified", "discovery", "proposal", "negotiation"];
  const stageColors = [
    "var(--color-accent)",
    "var(--color-violet)",
    "var(--color-sage)",
    "var(--color-good)",
    "var(--color-amber)",
  ];
  const stageSegments = stages.map((s, i) => ({
    label: s,
    value: (stageRows.data ?? []).filter((r) => r.stage === s).length,
    color: stageColors[i],
  }));
  const totalOpps = (stageRows.data ?? []).length;

  const hasData = revenueYtd > 0 || outstanding > 0 || totalOpps > 0;

  return (
    <div className="grid gap-4 p-6 xl:grid-cols-[260px_minmax(0,1fr)]">
      {/* ---------- left metric rail ---------- */}
      <div className="flex flex-col gap-5">
        <div>
          <Label>Collection rate</Label>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight text-text">
              {formatPct(collectionRate)}
            </span>
            <DeltaPill value={revenueDelta} />
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.min(100, collectionRate)}%` }}
            />
          </div>
        </div>

        <div>
          <Label>Pipeline value</Label>
          <div className="mt-1 text-xl font-semibold tabular-nums text-text">
            {formatZAR(pipelineValue)}
          </div>
        </div>

        <div>
          <Label>Weighted forecast</Label>
          <div className="mt-1 text-xl font-semibold tabular-nums text-text">
            {formatZAR(forecastRevenue)}
          </div>
        </div>

        <dl className="flex flex-col gap-1.5 border-t border-border pt-4 text-[12px]">
          <Row label="Active customers" value={String(activeCustomers.count ?? 0)} />
          <Row label="New customers (30d)" value={String(newCustomers.count ?? 0)} />
          <Row label="New leads (7d)" value={String(newLeads.count ?? 0)} />
          <Row label="Qualified opportunities" value={String(qualifiedOpps.count ?? 0)} />
          <Row label="Active projects" value={String(activeProjects.count ?? 0)} />
          <Row label="Overdue tasks" value={String(overdueTasks.count ?? 0)} />
          <Row label="Conversion rate" value={formatPct(conversionRate)} />
          <Row label="Won / lost this month" value={`${won} / ${lost}`} />
        </dl>
      </div>

      {/* ---------- main board ---------- */}
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card title="Revenue movement">
            <div className="grid grid-cols-3 gap-4">
              <Metric label="This month" value={formatZAR(revenueMonth)} />
              <Metric label="Last month" value={formatZAR(revenuePrevMonth)} />
              <Metric label="Year to date" value={formatZAR(revenueYtd)} />
            </div>
            <div className="mt-4 flex items-center gap-4">
              <LegendDot color="var(--color-accent)">Payments received</LegendDot>
              <LegendDot color="var(--color-violet)">Invoices raised</LegendDot>
            </div>
          </Card>

          <Card>
            <Label>Outstanding</Label>
            <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-text">
              {formatZAR(outstanding)}
            </div>
            <p className="mt-1 text-xs text-text-dim">
              Sent, partially paid and overdue invoices.
            </p>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card
            title="Payment dynamics"
            action={<span className="text-[11px] text-text-dim">Last 7 days</span>}
          >
            <Sparkline series={dailyTotals} />
            <div className="mt-2 flex justify-between text-[10px] text-text-faint">
              {days.map((d) => (
                <span key={d}>{d.slice(8)}</span>
              ))}
            </div>
            {dailyTotals.every((v) => v === 0) && (
              <EmptyNote>No payments recorded in the last 7 days.</EmptyNote>
            )}
          </Card>

          <Card title="Pipeline mix">
            <Donut
              segments={stageSegments}
              centerValue={String(totalOpps)}
              centerLabel="opportunities"
            />
            <div className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
              {stageSegments.map((s) => (
                <LegendDot key={s.label} color={s.color}>
                  {s.label}
                </LegendDot>
              ))}
            </div>
          </Card>
        </div>

        <Card
          title="Invoices raised vs payments received"
          action={
            <div className="flex gap-3">
              <LegendDot color="var(--color-accent)">Raised</LegendDot>
              <LegendDot color="var(--color-violet)">Received</LegendDot>
            </div>
          }
        >
          <GroupedBars groups={bars} />
          {bars.every((b) => b.a === 0 && b.b === 0) && (
            <EmptyNote>No invoicing activity in the last 6 months.</EmptyNote>
          )}
        </Card>

        {!hasData && (
          <p className="text-xs text-text-faint">
            Every figure above reads live from the database. They stay at zero until leads,
            quotes and invoices start flowing through the system.
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-text">
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-text-dim">{label}</dt>
      <dd className="font-medium tabular-nums text-text">{value}</dd>
    </div>
  );
}

function sum(rows: { amount?: number; total?: number }[] | null, key: "amount" | "total") {
  return (rows ?? []).reduce((acc, r) => acc + num(r[key]), 0);
}
