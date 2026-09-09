import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageServices } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatZAR } from "@/lib/format";
import { num } from "@/lib/metrics";
import { Card } from "@/components/ui";
import { label } from "@/lib/domain";
import { ServiceForm } from "./ServiceForm";

export default async function ServicesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, sku, name, category, cost, sell_price, kind, is_vatable")
    .order("sku", { ascending: true })
    .limit(200);

  const canManage = canManageServices(session.role);
  const rows = services ?? [];

  return (
    <div className="max-w-4xl p-6">
      <p className="mb-6 text-sm text-text-dim">
        The priced services a quote can draw from.{" "}
        {!canManage && "Your role can read prices but not change them."}
      </p>

      {rows.length === 0 ? (
        <div className="mb-4 rounded-2xl border border-border bg-surface-2 px-5 py-8 text-center">
          <p className="text-sm font-medium text-text">Catalogue is empty</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-text-dim">
            Quotes pull their line items from here. Add your standard offerings first.
          </p>
        </div>
      ) : (
        <div className="mb-4 overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-left">
                <Th>SKU</Th>
                <Th>Service</Th>
                <Th>Kind</Th>
                <Th align="right">Cost</Th>
                <Th align="right">Sell</Th>
                <Th align="right">Margin</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const cost = num(s.cost);
                const sell = num(s.sell_price);
                // Guard the divide: a zero sell price is legitimate (a bundled
                // or free item) and must not render NaN%.
                const margin = sell > 0 ? ((sell - cost) / sell) * 100 : null;
                return (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <Td className="font-mono text-xs">{s.sku}</Td>
                    <Td>
                      {s.name}
                      {!s.is_vatable && (
                        <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-text-faint">
                          No VAT
                        </span>
                      )}
                      {s.category && (
                        <span className="block text-xs text-text-faint">{s.category}</span>
                      )}
                    </Td>
                    <Td className="capitalize text-text-dim">{label(s.kind)}</Td>
                    <Td align="right" className="tabular-nums">{formatZAR(cost)}</Td>
                    <Td align="right" className="tabular-nums">{formatZAR(sell)}</Td>
                    <Td align="right" className="tabular-nums text-text-dim">
                      {margin === null ? "—" : `${margin.toFixed(0)}%`}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <Card title="Add a service">
          <ServiceForm />
        </Card>
      )}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={`px-4 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-faint ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  className = "",
}: {
  children: React.ReactNode;
  align?: "right";
  className?: string;
}) {
  return (
    <td className={`px-4 py-3 ${align === "right" ? "text-right" : ""} ${className}`}>
      {children}
    </td>
  );
}
