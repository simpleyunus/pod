'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import api from '../../_lib/api';

const NAVY = '#0A1420';
const ORANGE = '#E8503A';

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#f4f6f8', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: '#98A0AC', fontWeight: 700, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: '#171B26', fontWeight: 600, lineHeight: 1.35 }}>{children}</div>
    </div>
  );
}

export default function TrackPage() {
  const { token } = useParams<{ token: string }>();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedMsg, setUploadedMsg] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['track', token],
    queryFn: () => api.get(`/api/track/${token}`).then((r) => r.data),
    retry: false,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, letterSpacing: '.2em', textTransform: 'uppercase' }}>
          Loading your car…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: NAVY, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 18 }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 30, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>POD</span>
          <span style={{ width: 10, height: 10, borderRadius: 2.5, background: ORANGE }} />
        </div>
        <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>This link is no longer active</div>
        <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 13, marginTop: 8, maxWidth: 300 }}>
          Please contact your POD consultant for a new tracking link.
        </div>
      </div>
    );
  }

  const currentIdx: number = data.currentStageIndex;

  return (
    <div style={{ minHeight: '100vh', background: NAVY, padding: '28px 16px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 430 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>POD</span>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: ORANGE }} />
          </div>
          <span style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)' }}>
            Live tracking
          </span>
        </div>

        {/* Car title */}
        <div style={{ fontSize: 10, letterSpacing: '.24em', textTransform: 'uppercase', color: ORANGE, fontWeight: 700, marginBottom: 6 }}>
          Your car
        </div>
        <h1 style={{ color: '#fff', fontSize: 27, fontWeight: 700, margin: '0 0 2px', letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>
          {data.car.make} {data.car.model}
        </h1>
        <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 13, marginBottom: 22 }}>
          {[data.car.year, data.car.colour, data.reference].filter(Boolean).join(' · ')}
        </div>

        {/* Progress card */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 18px', marginBottom: 14 }}>
          {data.stages.map((stage: string, i: number) => {
            const done = currentIdx >= 0 && i < currentIdx;
            const current = i === currentIdx;
            const last = i === data.stages.length - 1;
            return (
              <div key={stage} style={{ display: 'flex', gap: 14 }}>
                {/* dot + connector */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {current ? (
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: ORANGE, boxShadow: `0 0 0 5px rgba(231,76,56,.15)`, flexShrink: 0 }} />
                  ) : done ? (
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#12B76A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="9" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.8 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></svg>
                    </div>
                  ) : (
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2.5px solid #E2E5E1', flexShrink: 0, marginTop: 1 }} />
                  )}
                  {!last && (
                    <div style={{ width: 2.5, flex: 1, minHeight: 20, background: done ? '#12B76A' : '#EDEEEA', margin: '3px 0' }} />
                  )}
                </div>
                {/* label */}
                <div style={{ paddingBottom: last ? 0 : 16 }}>
                  <div style={{ fontSize: 14, fontWeight: current ? 800 : done ? 700 : 500, color: current ? '#C13A26' : done ? '#171B26' : '#98A0AC', lineHeight: '18px' }}>
                    {stage}
                  </div>
                  <div style={{ fontSize: 10.5, color: current ? ORANGE : done ? '#12B76A' : '#C3C9D2', fontWeight: 600, marginTop: 1 }}>
                    {current ? 'happening now' : done ? 'done' : ' '}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Info boxes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {data.whereItIs && <Box label="Where it is now">{data.whereItIs}</Box>}
          {data.destination && <Box label="Delivering to">{data.destination}</Box>}
          {data.expectedDelivery && (
            <Box label="Expected delivery">
              Around {new Date(data.expectedDelivery).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
            </Box>
          )}
          {data.consultant && <Box label="Your contact">{data.consultant} · POD</Box>}
          {data.prices && (
            <Box label="Payment">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500, fontSize: 13 }}>
                <span style={{ color: '#98A0AC' }}>Price</span>
                <span>{data.prices.currency} {Number(data.prices.sellingPrice).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500, fontSize: 13, marginTop: 3 }}>
                <span style={{ color: '#98A0AC' }}>Paid so far</span>
                <span style={{ color: '#12B76A' }}>{data.prices.currency} {Number(data.prices.paid).toLocaleString()}</span>
              </div>
              {data.prices.balance !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13, marginTop: 3 }}>
                  <span style={{ color: '#98A0AC' }}>Balance</span>
                  <span style={{ color: data.prices.balance > 0 ? '#C13A26' : '#12B76A' }}>
                    {data.prices.currency} {Number(data.prices.balance).toLocaleString()}
                  </span>
                </div>
              )}
            </Box>
          )}
        </div>

        {/* Photos */}
        {data.photos?.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: '#98A0AC', fontWeight: 700, marginBottom: 10 }}>
              Photos · {data.photos.length}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {data.photos.map((p: any, i: number) =>
                p.kind === 'VIDEO' ? (
                  <video key={i} src={p.url} controls style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, background: '#0a1722' }} />
                ) : (
                  <a key={i} href={p.url} target="_blank" rel="noreferrer">
                    <img src={p.url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, display: 'block', background: '#f4f6f8' }} />
                  </a>
                ),
              )}
            </div>
          </div>
        )}

        {/* Documents to download */}
        {data.documents?.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: '#98A0AC', fontWeight: 700, marginBottom: 8 }}>
              Your documents
            </div>
            {data.documents.map((d: any, i: number) => (
              <a key={i} href={d.url} target="_blank" rel="noreferrer"
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px', borderRadius: 10, background: '#f4f6f8',
                  textDecoration: 'none', marginBottom: 6,
                }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#171B26' }}>📄 {d.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE }}>Download ↓</span>
              </a>
            ))}
          </div>
        )}

        {/* Notes from POD */}
        {data.notes?.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: '#98A0AC', fontWeight: 700, marginBottom: 8 }}>
              Notes from POD
            </div>
            {data.notes.map((n: any, i: number) => (
              <div key={i} style={{ padding: '8px 12px', borderRadius: 10, background: '#FDF6EC', marginBottom: 6 }}>
                <div style={{ fontSize: 13, color: '#171B26', lineHeight: 1.45 }}>{n.text}</div>
                <div style={{ fontSize: 10, color: '#98A0AC', marginTop: 3 }}>
                  {new Date(n.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Send us a document */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: '#98A0AC', fontWeight: 700, marginBottom: 6 }}>
            Send us a document
          </div>
          <div style={{ fontSize: 12, color: '#616875', marginBottom: 10 }}>
            Proof of payment, ID copy or anything your consultant asked for — PDF or photo, up to 15&nbsp;MB.
          </div>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setUploading(true);
              setUploadedMsg(null);
              try {
                const fd = new FormData();
                fd.append('file', f);
                fd.append('label', f.name);
                await api.post(`/api/track/${token}/upload`, fd);
                setUploadedMsg(`✓ ${f.name} received — thank you! POD will review it.`);
                qc.invalidateQueries({ queryKey: ['track', token] });
              } catch (err: any) {
                setUploadedMsg(err.response?.data?.message ?? 'Upload failed — please try again.');
              } finally {
                setUploading(false);
                if (fileRef.current) fileRef.current.value = '';
              }
            }} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
              background: ORANGE, color: '#fff', fontSize: 13, fontWeight: 700,
              letterSpacing: '.06em', cursor: uploading ? 'wait' : 'pointer',
              fontFamily: 'inherit', opacity: uploading ? 0.7 : 1,
            }}>
            {uploading ? 'Sending…' : 'Choose a file'}
          </button>
          {uploadedMsg && (
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: uploadedMsg.startsWith('✓') ? '#12B76A' : '#C13A26' }}>
              {uploadedMsg}
            </div>
          )}
        </div>

        {/* Recent updates */}
        {data.updates?.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: '16px 18px' }}>
            <div style={{ fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,.35)', fontWeight: 700, marginBottom: 10 }}>
              Recent updates
            </div>
            {data.updates.map((u: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: i < data.updates.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
                <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,.85)', fontWeight: 500 }}>{u.text}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', flexShrink: 0 }}>
                  {new Date(u.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 10.5, color: 'rgba(255,255,255,.28)', letterSpacing: '.06em' }}>
          Private link for {data.clientFirstName} — only you can see this
        </div>
      </div>
    </div>
  );
}
