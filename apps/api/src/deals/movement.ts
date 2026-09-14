/**
 * Whether a deal is actually moving.
 *
 * Three signals, in descending order of authority:
 *
 *  1. A promised delivery date that has already passed. No amount of recent
 *     activity outranks a broken promise — the customer in Harare is counting
 *     days, not edits.
 *  2. Deadline pressure. The same three days of silence mean something
 *     different when the car is due next week than when it is due in two
 *     months, so a stage grows impatient once the ETA falls inside its own
 *     patience window.
 *  3. Stage patience. Customs takes weeks; a handover should take days. Each
 *     stage carries its own number in DealStatus.stalledAfterDays, tunable in
 *     the database rather than through an environment variable and a redeploy.
 *
 * Returns three tiers rather than a boolean, mirroring ComplianceStatus
 * (VALID / DUE_SOON / EXPIRED) so the board reuses the existing RAG tones and
 * someone sees amber before anything is actually late.
 *
 * Deliberately NOT learned from historical dwell times. That is the right
 * destination, but it needs a trustworthy transition history to learn from,
 * and today the timeline is incomplete — deals.update() changes a stage
 * without writing a STATUS_CHANGE event. Fit thresholds to that and you get
 * confident nonsense. Revisit once the timeline is the truth it claims to be.
 */

const DAY = 86_400_000;

/** What a stage inherits until someone tunes it. Matches the column default. */
export const DEFAULT_PATIENCE_DAYS = 10;

export type MovementState = 'MOVING' | 'SLOWING' | 'STALLED';

export interface MovementInput {
  lastProgressAt?: Date | string | null;
  createdAt: Date | string;
  expectedDeliveryDate?: Date | string | null;
  currentStatus?: { isTerminal: boolean; stalledAfterDays: number } | null;
}

export interface Movement {
  state: MovementState;
  idleDays: number;
  /** The threshold actually applied, after any deadline tightening. */
  stalledAfter: number;
  /** Plain language, safe to put straight into a nudge or a tooltip. */
  reason: string;
}

export function assessMovement(deal: MovementInput, now: number = Date.now()): Movement {
  const status = deal.currentStatus;
  const patience = status?.stalledAfterDays ?? DEFAULT_PATIENCE_DAYS;

  // Idle means no movement — a stage or location change — not "no edits".
  // A deal that has never moved is measured from when it was created.
  const since = new Date(deal.lastProgressAt ?? deal.createdAt).getTime();
  const idleDays = Math.max(0, Math.floor((now - since) / DAY));

  // Delivered is finished. Finished things do not stall.
  if (status?.isTerminal) {
    return { state: 'MOVING', idleDays, stalledAfter: patience, reason: 'complete' };
  }

  const eta = deal.expectedDeliveryDate ? new Date(deal.expectedDeliveryDate).getTime() : null;

  // 1. The promise is already broken.
  if (eta !== null && eta < now) {
    const overdue = Math.max(1, Math.floor((now - eta) / DAY));
    return {
      state: 'STALLED',
      idleDays,
      stalledAfter: patience,
      reason: `${overdue} day${overdue === 1 ? '' : 's'} past the promised delivery date`,
    };
  }

  // 2. The promise is close. Whatever is left will not fit, so grow impatient.
  const daysToEta = eta !== null ? Math.ceil((eta - now) / DAY) : null;
  const pressured = daysToEta !== null && daysToEta <= patience;
  const stalledAfter = pressured ? Math.max(2, Math.floor(patience / 2)) : patience;

  // 3. Stage patience.
  if (idleDays >= stalledAfter) {
    return {
      state: 'STALLED',
      idleDays,
      stalledAfter,
      reason: pressured
        ? `no movement in ${idleDays} days, delivery due in ${daysToEta}`
        : `no movement in ${idleDays} days`,
    };
  }

  // Amber well before red, so a nudge lands while it is still cheap to act.
  if (idleDays >= Math.ceil(stalledAfter * 0.6)) {
    return { state: 'SLOWING', idleDays, stalledAfter, reason: `quiet for ${idleDays} days` };
  }

  return { state: 'MOVING', idleDays, stalledAfter, reason: 'moving' };
}
