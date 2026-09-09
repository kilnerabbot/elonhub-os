/**
 * First-response targets for support tickets.
 *
 * Deliberately measured in elapsed hours rather than business hours. Business
 * hours need a calendar of South African public holidays and a decision about
 * weekends, and getting that subtly wrong produces an SLA that quietly forgives
 * real breaches. Wall-clock is stricter and honest; swap it for a business
 * calendar when someone actually agrees office hours with a client.
 *
 * ponytail: flat targets per priority, no per-customer contracts. Move to a
 * table on customers if different clients ever buy different response times.
 */

export const RESPONSE_TARGET_HOURS: Record<string, number> = {
  urgent: 2,
  high: 4,
  medium: 8,
  low: 24,
};

const HOUR = 3_600_000;

export type SlaState = {
  /** Hours allowed for a first response at this priority. */
  targetHours: number;
  /** Hours until the target, negative once it has passed. */
  hoursRemaining: number;
  /** No response yet and the target has passed. */
  breached: boolean;
  /** Responded to, and within target. */
  met: boolean;
  /** Under an hour left and still unanswered. */
  atRisk: boolean;
};

/**
 * Evaluate a ticket's first-response SLA.
 *
 * Statuses that are finished — resolved and closed — are never reported as
 * breached. A ticket answered late and then closed is history, and leaving it
 * red forever makes the queue unreadable.
 */
export function evaluateSla(
  priority: string,
  status: string,
  openedAt: string | Date,
  firstResponseAt: string | Date | null,
  now: Date = new Date()
): SlaState {
  const targetHours = RESPONSE_TARGET_HOURS[priority] ?? RESPONSE_TARGET_HOURS.medium;
  const opened = new Date(openedAt).getTime();
  const deadline = opened + targetHours * HOUR;

  if (firstResponseAt) {
    const responded = new Date(firstResponseAt).getTime();
    return {
      targetHours,
      hoursRemaining: (deadline - responded) / HOUR,
      breached: false,
      met: responded <= deadline,
      atRisk: false,
    };
  }

  const finished = status === "resolved" || status === "closed";
  const hoursRemaining = (deadline - now.getTime()) / HOUR;

  return {
    targetHours,
    hoursRemaining,
    breached: !finished && hoursRemaining < 0,
    met: false,
    atRisk: !finished && hoursRemaining >= 0 && hoursRemaining <= 1,
  };
}

/** Short human label for a countdown, e.g. "3h left" or "2h over". */
export function formatSlaRemaining(hoursRemaining: number): string {
  const abs = Math.abs(hoursRemaining);
  const value = abs < 1 ? `${Math.round(abs * 60)}m` : `${Math.floor(abs)}h`;
  return hoursRemaining < 0 ? `${value} over` : `${value} left`;
}
