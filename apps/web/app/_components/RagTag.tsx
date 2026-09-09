'use client';

// One vocabulary for status colour across every RTMS screen, matching the
// board's existing pill treatment (tinted background, deep text, no borders).
const TONES: Record<string, { bg: string; text: string; dot: string }> = {
  GREEN:    { bg: '#E6F6EE', text: '#067647', dot: '#12B76A' },
  AMBER:    { bg: '#FCF3E1', text: '#9A6208', dot: '#F59E0B' },
  RED:      { bg: '#FEE4E2', text: '#B42318', dot: '#F04438' },
  VALID:    { bg: '#E6F6EE', text: '#067647', dot: '#12B76A' },
  DUE_SOON: { bg: '#FCF3E1', text: '#9A6208', dot: '#F59E0B' },
  EXPIRED:  { bg: '#FEE4E2', text: '#B42318', dot: '#F04438' },
  PASS:     { bg: '#E6F6EE', text: '#067647', dot: '#12B76A' },
  FAIL:     { bg: '#FEE4E2', text: '#B42318', dot: '#F04438' },
  OVERRIDDEN: { bg: '#F1EEFE', text: '#5B3FD4', dot: '#7C5CFC' },
  NEUTRAL:  { bg: '#EDF1F6', text: '#3A4150', dot: '#98A0AC' },
};

export function ragOf(status?: string | null) {
  if (status === 'EXPIRED' || status === 'RED' || status === 'FAIL') return 'RED';
  if (status === 'DUE_SOON' || status === 'AMBER') return 'AMBER';
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
  const tone = TONES[status ?? 'NEUTRAL'] ?? TONES.NEUTRAL;
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
