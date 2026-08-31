export default function PodLogo({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '22px 0' }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: '#E8503A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(232,80,58,.35)',
          }}
        >
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>P</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 22px 20px' }}>
      {/* Wordmark + signal dot, straight from the brand concept */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
        <span
          style={{
            color: '#ffffff',
            fontWeight: 700,
            fontSize: 21,
            letterSpacing: '-0.02em',
            lineHeight: 1,
            fontFamily: 'var(--font-display)',
          }}
        >
          POD
        </span>
        <span style={{ width: 8, height: 8, borderRadius: 2.5, background: '#E8503A', flexShrink: 0 }} />
      </div>
      <div
        style={{
          color: 'rgba(255,255,255,0.32)',
          fontSize: 9,
          letterSpacing: '0.28em',
          marginTop: 6,
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        Vehicle Tracking
      </div>
    </div>
  );
}
