'use client';

import { CheckOutlined } from '@ant-design/icons';

// The journey strip: green = done, signal orange = happening now, grey = to come.
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
                  width: 18, height: 18, borderRadius: '50%', background: '#E8503A',
                  boxShadow: '0 0 0 5px rgba(232,80,58,.14)', flexShrink: 0,
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
              color: current ? '#C13A26' : done ? '#3A4150' : '#98A0AC',
            }}>
              {s.name}
            </div>
            {current && (
              <div style={{ fontSize: 9, color: '#E8503A', fontWeight: 700, marginTop: 1, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                happening now
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
