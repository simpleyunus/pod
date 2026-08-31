import { ComplianceStatus } from '@prisma/client';

export const DAY_MS = 86_400_000;

/**
 * The single rule the whole module turns on.
 *
 * Because every expiring fact is a ComplianceItem, this one function decides
 * the RAG colour of a driver, an asset, an RTMS element and the dashboard as a
 * whole. `leadDays` comes from the item's ComplianceKind, so admins retune
 * amber without a deploy.
 *
 * Items with no expiry (an induction that never lapses) are VALID by
 * definition — they are tracked for evidence, not for expiry.
 */
export function deriveStatus(
  expiresOn: Date | null | undefined,
  leadDays: number,
  now: Date = new Date(),
): ComplianceStatus {
  if (!expiresOn) return 'VALID';
  if (expiresOn.getTime() < now.getTime()) return 'EXPIRED';
  if (expiresOn.getTime() <= now.getTime() + leadDays * DAY_MS) return 'DUE_SOON';
  return 'VALID';
}

const RANK: Record<ComplianceStatus, number> = { VALID: 0, DUE_SOON: 1, EXPIRED: 2 };

/** Worst-of rollup: one expired item makes the whole group red. */
export function worstOf(statuses: ComplianceStatus[]): ComplianceStatus {
  return statuses.reduce<ComplianceStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), 'VALID');
}

export type Rag = 'GREEN' | 'AMBER' | 'RED';

export const ragOf = (status: ComplianceStatus): Rag =>
  status === 'EXPIRED' ? 'RED' : status === 'DUE_SOON' ? 'AMBER' : 'GREEN';

export const worstRag = (rags: Rag[]): Rag =>
  rags.includes('RED') ? 'RED' : rags.includes('AMBER') ? 'AMBER' : 'GREEN';

export const daysUntil = (d: Date | null | undefined, now = new Date()) =>
  d ? Math.floor((d.getTime() - now.getTime()) / DAY_MS) : null;
