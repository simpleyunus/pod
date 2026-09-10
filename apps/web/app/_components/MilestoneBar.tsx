'use client';

import { CheckOutlined } from '@ant-design/icons';

// The journey strip, in the same language as the traffic lights: green = done,
// navy = happening now, grey = still to come.
//
// "Happening now" is deliberately navy rather than a warm accent — in the RAG
// vocabulary amber and red mean "someone must act", and being at the current
// stage is not a problem. Position, weight and the halo carry the emphasis.
export default function MilestoneBar({
  statuses,
  currentStatusId,
}: {
  statuses: Array<{ id: string; name: string }>;
  currentStatusId?: string | null;
}) {
  if (!statuses?.length) return null;
  const currentIdx = currentStatusId ? statuses.findIndex((s) => s.id === currentStatusId) : -1;

  return (
    <div style={{ display: 'flex', overflowX: 'auto', paddingTop: 4 }}>
      {statuses.map((s, i) => {
        const done = currentIdx >= 0 && i < currentIdx;
        const current = i === currentIdx;
        const lineLeftColor = i === 0 ? 'transparent' : done || current ? '#12B76A' : '#E3E9EF';
        const lineRightColor = i === statuses.length - 1 ? 'transparent' : done ? '#12B76A' : '#E3E9EF';

        return (
          <div key={s.id} style={{ flex: 1, minWidth: 86, textAlign: 'center' }}>
            {/* line – dot – line */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, height: 2, background: lineLeftColor }} />
              {current ? (
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', background: '#0E1B2A',
                  boxShadow: '0 0 0 5px rgba(14,27,42,.10)', flexShrink: 0,
                }} />
              ) : done ? (
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', background: '#12B76A',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <CheckOutlined style={{ fontSize: 8, color: '#fff' }} />
                </div>
              ) : (
                <div style={{
                  width: 14, height: 14, borderRadius: '50%', background: '#fff',
                  border: '2px solid #D3DCE5', flexShrink: 0,
                }} />
              )}
              <div style={{ flex: 1, height: 2, background: lineRightColor }} />
            </div>

            {/* label */}
            <div style={{
              marginTop: 7, fontSize: 10.5, lineHeight: 1.25, padding: '0 4px',
              fontWeight: current ? 700 : done ? 600 : 500,
              color: current ? '#0E1B2A' : done ? '#3A4150' : '#98A0AC',
            }}>
              {s.name}
            </div>
            {current && (
              <div style={{ fontSize: 9, color: '#3A5570', fontWeight: 700, marginTop: 1, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                happening now
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
