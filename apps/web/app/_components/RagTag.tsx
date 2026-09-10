'use client';

// One vocabulary for status colour across every RTMS screen, matching the
// board's existing pill treatment (tinted background, deep text, no borders).
export const RAG_TONES: Record<string, { bg: string; text: string; dot: string }> = {
  GREEN:    { bg: '#E6F6EE', text: '#067647', dot: '#12B76A' },
  AMBER:    { bg: '#FCF3E1', text: '#9A6208', dot: '#F59E0B' },
  RED:      { bg: '#FEE4E2', text: '#B42318', dot: '#F04438' },
  VALID:    { bg: '#E6F6EE', text: '#067647', dot: '#12B76A' },
  DUE_SOON: { bg: '#FCF3E1', text: '#9A6208', dot: '#F59E0B' },
  EXPIRED:  { bg: '#FEE4E2', text: '#B42318', dot: '#F04438' },
  PASS:     { bg: '#E6F6EE', text: '#067647', dot: '#12B76A' },
  FAIL:     { bg: '#FEE4E2', text: '#B42318', dot: '#F04438' },
  // A gate that passed on an unanswered question rather than a satisfied one
  // — an unweighed load. Amber, because it is neither a clean pass nor a
  // bypassed failure; without a tone of its own it rendered as neutral grey,
  // which is exactly the silence the load rules exist to remove.
  WARN:     { bg: '#FCF3E1', text: '#9A6208', dot: '#F59E0B' },
  OVERRIDDEN: { bg: '#F1EEFE', text: '#5B3FD4', dot: '#7C5CFC' },
  NEUTRAL:  { bg: '#EDF1F6', text: '#3A4150', dot: '#98A0AC' },
};

export function ragOf(status?: string | null) {
  if (status === 'EXPIRED' || status === 'RED' || status === 'FAIL') return 'RED';
  if (status === 'DUE_SOON' || status === 'AMBER' || status === 'WARN') return 'AMBER';
  if (status === 'VALID' || status === 'GREEN' || status === 'PASS') return 'GREEN';
  return 'NEUTRAL';
}

export default function RagTag({
  status,
  label,
  dot = true,
  size = 'md',
}: {
  status?: string | null;
  label?: string;
  dot?: boolean;
  size?: 'sm' | 'md';
}) {
  const tone = RAG_TONES[status ?? 'NEUTRAL'] ?? RAG_TONES.NEUTRAL;
  const text = label ?? (status ?? '—').replace(/_/g, ' ');
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: tone.bg,
        color: tone.text,
        borderRadius: 999,
        padding: size === 'sm' ? '1px 8px' : '3px 10px',
        fontSize: size === 'sm' ? 10.5 : 11.5,
        fontWeight: 600,
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
      }}
    >
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone.dot, flexShrink: 0 }} />
      )}
      {text}
    </span>
  );
}

/**
 * A single traffic-light lamp, for places where a full pill would crowd the
 * row — a table cell that already carries text, a header strip.
 *
 * The tinted halo is what makes it read as a lamp rather than a stray dot at
 * 8px. `title` is required in spirit: colour on its own carries no meaning for
 * a colour-blind or screen-reader user, so every lamp states its reason.
 */
export function RagDot({
  rag, title, size = 8,
}: { rag?: string | null; title: string; size?: number }) {
  const tone = RAG_TONES[rag ?? 'NEUTRAL'] ?? RAG_TONES.NEUTRAL;
  return (
    <span
      title={title}
      role="img"
      aria-label={title}
      style={{
        display: 'inline-block', flexShrink: 0,
        width: size, height: size, borderRadius: '50%',
        background: tone.dot, boxShadow: `0 0 0 2.5px ${tone.bg}`,
      }}
    />
  );
}

/** Teaches the dots. Cheap to render, and it stops the colours being folklore. */
export function RagLegend({ items }: { items?: [string, string][] }) {
  const rows: [string, string][] = items ?? [
    ['GREEN', 'On track'],
    ['AMBER', 'Needs a look'],
    ['RED', 'Overdue'],
  ];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {rows.map(([rag, label]) => (
        <span key={rag} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <RagDot rag={rag} title={label} size={7} />
          <span style={{ fontSize: 10.5, color: '#98A0AC', fontWeight: 600 }}>{label}</span>
        </span>
      ))}
    </span>
  );
}

export function KpiCard({
  icon, label, value, accent, tint, hint,
}: {
  icon: React.ReactNode; label: string; value: React.ReactNode;
  accent: string; tint: string; hint?: string;
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E3E9EF', borderRadius: 14,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 13,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 11, background: tint, color: accent,
        fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 25, fontWeight: 700, color: '#171B26', lineHeight: 1,
          fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em',
        }}>{value}</div>
        <div style={{
          fontSize: 9.5, color: '#98A0AC', marginTop: 4, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>{label}{hint ? ` · ${hint}` : ''}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, extra }: { title: string; subtitle?: string; extra?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 16, flexWrap: 'wrap', margin: '12px 0 18px',
    }}>
      <div>
        <h1 style={{
          margin: 0, fontSize: 23, fontWeight: 700, color: '#171B26',
          letterSpacing: '-0.02em', fontFamily: 'var(--font-display)',
        }}>{title}</h1>
        {subtitle && (
          <div style={{ fontSize: 12.5, color: '#98A0AC', marginTop: 3 }}>{subtitle}</div>
        )}
      </div>
      {extra}
    </div>
  );
}
