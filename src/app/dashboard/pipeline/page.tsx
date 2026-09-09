import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canMoveOpportunity } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatZAR } from "@/lib/format";
import { num } from "@/lib/metrics";
import { OPEN_STAGES, label } from "@/lib/domain";
import { StageSelect } from "./StageSelect";

export default async function PipelinePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select("id, name, stage, value, probability, expected_close_date, owner_id")
    .order("value", { ascending: false })
    .limit(300);

  const rows = opportunities ?? [];
  const open = rows.filter((o) => o.stage !== "won" && o.stage !== "lost");

  const pipelineValue = open.reduce((a, o) => a + num(o.value), 0);
  const weighted = open.reduce((a, o) => a + num(o.value) * (num(o.probability) / 100), 0);
  const wonValue = rows
    .filter((o) => o.stage === "won")
    .reduce((a, o) => a + num(o.value), 0);

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap gap-6">
        <Summary label="Open pipeline" value={formatZAR(pipelineValue)} />
        <Summary label="Weighted forecast" value={formatZAR(weighted)} />
        <Summary label="Won" value={formatZAR(wonValue)} />
        <Summary label="Open deals" value={String(open.length)} />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
          Could not load the pipeline.
        </p>
      )}

      {!error && rows.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface-2 px-5 py-8 text-center">
          <p className="text-sm font-medium text-text">Nothing in the pipeline</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-text-dim">
            Convert a qualified lead and it will appear here.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {OPEN_STAGES.map((stage) => {
            const inStage = open.filter((o) => o.stage === stage);
            const stageValue = inStage.reduce((a, o) => a + num(o.value), 0);

            return (
              <section key={stage} className="rounded-2xl border border-border bg-surface-2 p-3">
                <header className="mb-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-dim">
                    {label(stage)}
                  </h2>
                  <p className="text-[11px] tabular-nums text-text-faint">
                    {inStage.length} · {formatZAR(stageValue)}
                  </p>
                </header>

                <div className="flex flex-col gap-2">
                  {inStage.length === 0 && (
                    <p className="text-[11px] text-text-faint">Empty</p>
                  )}
                  {inStage.map((o) => (
                    <article key={o.id} className="rounded-xl border border-border bg-surface p-2.5">
                      <h3 className="truncate text-[13px] font-medium text-text">{o.name}</h3>
                      <p className="mt-0.5 text-[11px] tabular-nums text-text-dim">
                        {formatZAR(num(o.value))} · {o.probability}%
                      </p>
                      {o.expected_close_date && (
                        <p className="text-[10px] text-text-faint">
                          closes {o.expected_close_date}
                        </p>
                      )}
                      <div className="mt-2">
                        <StageSelect
                          opportunityId={o.id}
                          stage={o.stage}
                          disabled={!canMoveOpportunity(session.role, o.owner_id, session.userId)}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Summary({ label: name, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
        {name}
      </div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight text-text">
        {value}
      </div>
    </div>
  );
}
