'use client';

import { useState } from 'react';

// The real POD mark is a custom lockup — heavy slanted letterforms with the
// orange square set into the O — which cannot be reproduced faithfully in a
// webfont. So this renders the artwork when it is present and falls back to a
// typographic stand-in when it is not.
//
// To use the real logo, drop the files into apps/web/public/:
//   pod-logo.png   full wordmark, white on transparent (sits on the navy)
//   pod-mark.png   square crop for the collapsed rail
// Both were extracted from the supplied navy lockup by keying out its
// background, because the supplied wordmark had a transparency checkerboard
// baked into its pixels and would have rendered as grey squares on the rail.
const WORDMARK = '/pod-logo.png';
const MARK = '/pod-mark.png';

export default function PodLogo({ collapsed }: { collapsed: boolean }) {
  const [noWordmark, setNoWordmark] = useState(false);
  const [noMark, setNoMark] = useState(false);

  if (collapsed) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '22px 0' }}>
        {!noMark ? (
          <img
            src={MARK}
            alt="POD"
            onError={() => setNoMark(true)}
            style={{ width: 34, height: 34, objectFit: 'contain', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: 34, height: 34, borderRadius: 9, background: 'var(--signal)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(232,80,58,.35)',
            }}
          >
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>P</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 22px 20px' }}>
      {!noWordmark ? (
        <img
          src={WORDMARK}
          alt="POD"
          onError={() => setNoWordmark(true)}
          // Capped so a wide export cannot push the rail out of shape.
          style={{ height: 26, width: 'auto', maxWidth: 150, objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span
            style={{
              color: '#ffffff', fontWeight: 700, fontSize: 21,
              letterSpacing: '-0.02em', lineHeight: 1, fontFamily: 'var(--font-display)',
            }}
          >
            POD
          </span>
          <span style={{ width: 8, height: 8, borderRadius: 2.5, background: 'var(--signal)', flexShrink: 0 }} />
        </div>
      )}
      <div
        style={{
          color: 'rgba(255,255,255,0.32)', fontSize: 9, letterSpacing: '0.28em',
          marginTop: 8, textTransform: 'uppercase', fontWeight: 600,
        }}
      >
        Vehicle Tracking
      </div>
    </div>
  );
}
