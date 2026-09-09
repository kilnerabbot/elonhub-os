import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canWorkTicket } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { label } from "@/lib/domain";
import { evaluateSla, formatSlaRemaining } from "@/lib/sla";
import { ReplyForm, TicketControls } from "../TicketForms";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: ticket } = await supabase
    .from("tickets")
    .select(
      "id, number, subject, description, status, priority, channel, customer_id, project_id, requester_name, requester_email, requester_phone, assignee_id, opened_at, first_response_at, resolved_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (!ticket) notFound();

  const [{ data: messages }, { data: customer }, { data: people }] = await Promise.all([
    supabase
      .from("ticket_messages")
      .select("id, body, is_internal, author_id, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
    ticket.customer_id
      ? supabase.from("customers").select("legal_name").eq("id", ticket.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("profiles").select("id, full_name").order("full_name").limit(200),
  ]);

  const personName = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const thread = messages ?? [];
  const sla = evaluateSla(
    ticket.priority,
    ticket.status,
    ticket.opened_at,
    ticket.first_response_at
  );
  const canWork = canWorkTicket(session.role, ticket.assignee_id, session.userId);

  return (
    <div className="max-w-4xl p-6">
      <Link href="/dashboard/support" className="text-[13px] text-text-dim hover:text-text">
        ← Support
      </Link>

      <h2 className="mt-3 text-xl font-semibold tracking-tight text-text">{ticket.subject}</h2>
      <p className="text-sm capitalize text-text-dim">
        {ticket.number} · {label(ticket.status)} · {ticket.priority} · via{" "}
        {label(ticket.channel)}
        {customer?.legal_name ? ` · ${customer.legal_name}` : ""}
      </p>

      {!ticket.first_response_at && sla.breached && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          No first response yet — {formatSlaRemaining(sla.hoursRemaining)} past the{" "}
          {sla.targetHours}-hour target for a {ticket.priority} ticket.
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {ticket.description && (
            <Card title="Reported">
              <p className="whitespace-pre-wrap text-[13px] text-text-dim">
                {ticket.description}
              </p>
            </Card>
          )}

          <Card title={`Thread (${thread.length})`}>
            {thread.length === 0 ? (
              <p className="text-[13px] text-text-dim">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {thread.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-xl border p-3 ${
                      m.is_internal
                        ? "border-border bg-surface-2"
                        : "border-border bg-surface"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-[11px] font-medium text-text-dim">
                        {personName.get(m.author_id ?? "") ?? "Unknown"}
                      </span>
                      <span className="flex items-center gap-2">
                        {m.is_internal && (
                          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.06em] text-accent">
                            Internal
                          </span>
                        )}
                        <span className="text-[10px] text-text-faint">
                          {String(m.created_at).slice(0, 16).replace("T", " ")}
                        </span>
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] text-text">{m.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canWork ? (
            <Card title="Reply">
              <ReplyForm ticketId={ticket.id} />
            </Card>
          ) : (
            <Card>
              <p className="text-[13px] text-text-dim">
                Only the assignee or a support agent can reply to this ticket.
              </p>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {canWork && (
            <Card title="Manage">
              <TicketControls
                ticketId={ticket.id}
                status={ticket.status}
                priority={ticket.priority}
                assigneeId={ticket.assignee_id}
                people={(people ?? []).map((p) => ({ id: p.id, label: p.full_name }))}
              />
            </Card>
          )}

          <Card title="Requester">
            <dl className="flex flex-col gap-2 text-[13px]">
              <Detail label="Name" value={ticket.requester_name} />
              <Detail
                label="Email"
                value={ticket.requester_email}
                href={ticket.requester_email ? `mailto:${ticket.requester_email}` : null}
              />
              <Detail
                label="Phone"
                value={ticket.requester_phone}
                href={ticket.requester_phone ? `tel:${ticket.requester_phone}` : null}
              />
              <Detail
                label="Opened"
                value={String(ticket.opened_at).slice(0, 16).replace("T", " ")}
              />
              <Detail
                label="First reply"
                value={
                  ticket.first_response_at
                    ? String(ticket.first_response_at).slice(0, 16).replace("T", " ")
                    : null
                }
              />
              <Detail label="Target" value={`${sla.targetHours}h`} />
            </dl>
          </Card>
        </div>
      </div>
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
      <dd className="min-w-0 truncate text-right text-text">
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
