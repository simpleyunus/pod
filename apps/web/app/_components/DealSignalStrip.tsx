'use client';

import { allSignals, type DealLike } from '../_lib/dealSignals';
import { RagDot, RAG_TONES } from './RagTag';

// The four questions a consultant is actually asked about a car, answered in
// one glance and in exactly the same four columns — and the same colour
// language — as the board's table: which stage and is it on schedule, where it
// physically is, whether the money is in, and whether anyone is still touching
// the record.
//
// One row, four lamps — no pills, no icons. A pill for each would give the
// header four competing tinted rectangles, which is exactly the "too many
// colours" the board was rescued from.

function Cell({
  label, value, rag, why, sub,
}: { label: string; value: string; rag: string; why: string; sub?: string }) {
  const tone = RAG_TONES[rag] ?? RAG_TONES.NEUTRAL;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }} title={why}>
      <span style={{ marginTop: 4 }}><RagDot rag={rag} title={why} size={9} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
          color: '#98A0AC', marginBottom: 2,
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 12.5, fontWeight: 600, lineHeight: 1.25,
          // Neutral facts stay ink-coloured; only a live warning takes tone.
          color: rag === 'AMBER' || rag === 'RED' ? tone.text : '#171B26',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 10.5, color: '#98A0AC', marginTop: 2, whiteSpace: 'nowrap' }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

export default function DealSignalStrip({ deal }: { deal: DealLike }) {
  const s = allSignals(deal);
  return (
    <div style={{
      display: 'grid', gap: 16,
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    }}>
      <Cell label="Stage"       value={s.stage.label}    rag={s.stage.rag}    why={s.stage.why} sub={s.delivery.why} />
      <Cell label="Where it is" value={s.location.label} rag={s.location.rag} why={s.location.why} />
      <Cell label="Payment"     value={s.payment.label}  rag={s.payment.rag}  why={s.payment.why} />
      <Cell label="Updated"     value={s.updated.label}  rag={s.updated.rag}  why={s.updated.why} />
    </div>
  );
}
