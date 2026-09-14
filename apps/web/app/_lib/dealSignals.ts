// The traffic light, defined once.
//
// Colour on the board used to be decorative: the stage chip's hue said which
// stage, payment was three hard-coded hex values, and "updated" was a grey
// date with a red badge bolted on. Nothing told you which of forty cars
// actually needed you today.
//
// So every signal in the sales half of the app now answers the same question —
// "does this need attention?" — and answers it with the same three colours the
// RTMS half already uses (see RagTag):
//
//   GREEN  on track, nothing to do
//   AMBER  worth a look this week
//   RED    overdue, someone must act
//   NEUTRAL not applicable — no price set, no ETA, deal closed
//
// Keeping the rules here rather than in the render means the board, the deal
// page and the customer tracking link cannot drift apart, and the thresholds
// are visible in one place instead of buried in three JSX ternaries.

export type Rag = 'GREEN' | 'AMBER' | 'RED' | 'NEUTRAL';

export type Signal = {
  rag: Rag;
  /** Short caption, for pills. */
  label: string;
  /** Full sentence, for the dot's tooltip — colour alone is not accessible. */
  why: string;
};

/**
 * Last-resort thresholds, used only when a deal arrives from an endpoint that
 * does not send the API's assessment. The real thresholds are per stage and
 * live in DealStatus.stalledAfterDays — do not duplicate that rule here.
 */
export const IDLE_WATCH_DAYS = 7;
export const IDLE_STOP_DAYS = 14;
/** A delivery inside this window is worth watching, not yet a problem. */
export const ETA_WATCH_DAYS = 7;

const DAY = 86_400_000;

export type DealLike = {
  currentStatus?: { name?: string; isTerminal?: boolean } | null;
  currentLocation?: { name?: string } | null;
  paymentStatus?: string | null;
  amountPaid?: number | null;
  sellingPrice?: number | string | null;
  expectedDeliveryDate?: string | Date | null;
  updatedAt?: string | Date | null;
  lastProgressAt?: string | Date | null;
  createdAt?: string | Date | null;
  idleDays?: number | null;
  isStalled?: boolean | null;
  /** The API's verdict, which knows the stage patience and the promised date. */
  movementState?: 'MOVING' | 'SLOWING' | 'STALLED' | null;
  stalledAfter?: number | null;
  stalledReason?: string | null;
};

const NEUTRAL = (label: string, why: string): Signal => ({ rag: 'NEUTRAL', label, why });

const daysSince = (d: DealLike) => {
  // The board's list endpoint sends idleDays; the single-deal endpoint does
  // not, so fall back to the movement timestamp both of them carry. Never
  // updatedAt — correcting a phone number is not the car moving.
  if (typeof d.idleDays === 'number') return d.idleDays;
  const since = d.lastProgressAt ?? d.createdAt;
  if (!since) return null;
  return Math.floor((Date.now() - new Date(since).getTime()) / DAY);
};

const daysToEta = (d: DealLike) =>
  d.expectedDeliveryDate
    ? Math.ceil((new Date(d.expectedDeliveryDate).getTime() - Date.now()) / DAY)
    : null;

const plural = (n: number) => (n === 1 ? 'day' : 'days');

/**
 * DELIVERY — the promise made to the customer.
 */
export function deliverySignal(d: DealLike): Signal {
  if (d.currentStatus?.isTerminal) return { rag: 'GREEN', label: 'Delivered', why: 'Delivered.' };
  const eta = daysToEta(d);
  if (eta === null) return NEUTRAL('No ETA', 'No estimated delivery date set.');
  if (eta < 0) return { rag: 'RED', label: `${-eta}d late`, why: `${-eta} ${plural(-eta)} past the estimated delivery date.` };
  if (eta <= ETA_WATCH_DAYS)
    return { rag: 'AMBER', label: eta === 0 ? 'Due today' : `${eta}d`, why: eta === 0 ? 'Due today.' : `Due in ${eta} ${plural(eta)}.` };
  return { rag: 'GREEN', label: `${eta}d`, why: `Due in ${eta} ${plural(eta)}.` };
}

/**
 * STAGE — not "how far along" but "will it land when we said it would?".
 *
 * Deliberately not a progress ramp: a deal that has only just been captured is
 * healthy, so red for an early stage would be wrong and would train people to
 * ignore the colour. The stage chip keeps its own tone for identity (see
 * stageTone); this lamp sits beside it and reports schedule.
 *
 * Equally deliberately NOT the idle clock — that is what the Updated lamp
 * measures, and two lamps in the same row saying the same thing is one lamp
 * too many.
 */
export function stageSignal(d: DealLike): Signal {
  const name = d.currentStatus?.name ?? 'No stage';
  if (!d.currentStatus) return NEUTRAL('No stage', 'No stage set yet.');
  const eta = deliverySignal(d);
  return { rag: eta.rag, label: name, why: `${name} — ${eta.why.toLowerCase()}` };
}

/**
 * WHERE IT IS — do we actually know?
 *
 * Only two lit states, because that is the honest answer available: the record
 * either names a location or it does not. Lateness belongs to the stage lamp.
 */
export function locationSignal(d: DealLike): Signal {
  const where = d.currentLocation?.name;
  if (!where) return { rag: 'AMBER', label: 'Not logged', why: 'No location recorded for this car.' };
  if (d.currentStatus?.isTerminal) return { rag: 'GREEN', label: where, why: `Delivered — last at ${where}.` };
  return { rag: 'GREEN', label: where, why: `At ${where}.` };
}

/**
 * PAYMENT — the one signal that was already a traffic light in spirit.
 */
export function paymentSignal(d: DealLike): Signal {
  const price = d.sellingPrice != null ? Number(d.sellingPrice) : null;
  const paid = d.amountPaid != null ? Number(d.amountPaid) : null;
  const pct = price && paid !== null && price > 0 ? Math.min(100, Math.round((paid / price) * 100)) : null;

  switch (d.paymentStatus) {
    case 'PAID':
      return { rag: 'GREEN', label: 'Paid', why: 'Paid in full.' };
    case 'PARTIAL':
      return {
        rag: 'AMBER',
        label: 'Partial',
        why: pct !== null ? `${pct}% received — a balance is outstanding.` : 'Part-paid — a balance is outstanding.',
      };
    case 'UNPAID':
      return { rag: 'RED', label: 'Unpaid', why: 'Nothing received against this deal.' };
    default:
      return NEUTRAL('—', 'No payment status.');
  }
}

/**
 * MOVEMENT — how long since the car actually moved.
 *
 * The API owns this judgement: it knows each stage's patience and whether the
 * promised delivery date has passed. This function renders that verdict and
 * only falls back to fixed thresholds for payloads that lack it. Reads NEUTRAL
 * once the deal is closed, so a finished job does not sit red forever.
 */
export function updatedSignal(d: DealLike): Signal {
  const idle = daysSince(d);
  if (idle === null) return NEUTRAL('—', 'Never moved.');
  const ago = idle === 0 ? 'today' : `${idle} ${plural(idle)} ago`;
  if (d.currentStatus?.isTerminal) return NEUTRAL(ago, `Closed — last moved ${ago}.`);

  const sentence = (fallback: string) => {
    const r = d.stalledReason;
    return r ? `${r.charAt(0).toUpperCase()}${r.slice(1)}.` : fallback;
  };

  if (d.movementState) {
    if (d.movementState === 'STALLED')
      return { rag: 'RED', label: ago, why: sentence(`No movement in ${idle} ${plural(idle)}.`) };
    if (d.movementState === 'SLOWING')
      return { rag: 'AMBER', label: ago, why: sentence(`Quiet for ${idle} ${plural(idle)}.`) };
    return { rag: 'GREEN', label: ago, why: `Moved ${ago}.` };
  }

  const stop = d.stalledAfter ?? IDLE_STOP_DAYS;
  const watch = Math.max(1, Math.ceil(stop * 0.6));
  if (idle >= stop) return { rag: 'RED', label: ago, why: `No movement in ${idle} ${plural(idle)}.` };
  if (idle >= watch) return { rag: 'AMBER', label: ago, why: `No movement in ${idle} ${plural(idle)}.` };
  return { rag: 'GREEN', label: ago, why: `Moved ${ago}.` };
}

const RANK: Record<Rag, number> = { NEUTRAL: 0, GREEN: 1, AMBER: 2, RED: 3 };

/** Worst-of across signals — one red anywhere makes the deal red. */
export function worstRag(rags: Rag[]): Rag {
  return rags.reduce<Rag>((w, r) => (RANK[r] > RANK[w] ? r : w), 'NEUTRAL');
}

export const allSignals = (d: DealLike) => ({
  stage: stageSignal(d),
  location: locationSignal(d),
  payment: paymentSignal(d),
  updated: updatedSignal(d),
  delivery: deliverySignal(d),
});

/** Does this deal need a human today? Drives the board's attention count. */
export function overallRag(d: DealLike): Rag {
  const s = allSignals(d);
  return worstRag([s.stage.rag, s.location.rag, s.payment.rag, s.updated.rag, s.delivery.rag]);
}
