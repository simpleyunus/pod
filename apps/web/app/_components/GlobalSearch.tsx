'use client';

import { SearchOutlined } from '@ant-design/icons';
import { AutoComplete, Input, Spin } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import type { InputRef } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import api from '../_lib/api';

interface FleetHit {
  type: string;
  id: string;
  href: string;
  title: string;
  subtitle?: string;
}

interface Hit {
  id: string;
  reference: string;
  make: string;
  model: string;
  year?: number;
  clientName: string;
  registrationNo?: string;
}

export default function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<InputRef>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [value, setValue] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  // Fleet records — vehicles, drivers, trips, incidents — which Meilisearch
  // does not index.
  const [fleetHits, setFleetHits] = useState<FleetHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [kbdHint, setKbdHint] = useState('');

  // ⌘K / Ctrl+K focuses the search from anywhere
  useEffect(() => {
    setKbdHint(/mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl K');
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onSearch = (q: string) => {
    setValue(q);
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setHits([]); setFleetHits([]); setBusy(false); return; }
    setBusy(true);
    timer.current = setTimeout(async () => {
      try {
        // Two sources: Meilisearch for deals, and a direct query for the
        // fleet records it does not index. Settled independently so a
        // Meilisearch outage still lets you find a vehicle.
        const [deals, fleet] = await Promise.allSettled([
          api.get('/api/search', { params: { q } }),
          api.get('/api/fleet/quick-find', { params: { q } }),
        ]);
        setHits(deals.status === 'fulfilled' ? deals.value.data.hits ?? [] : []);
        setFleetHits(fleet.status === 'fulfilled' ? fleet.value.data ?? [] : []);
      } catch {
        setHits([]);
        setFleetHits([]);
      } finally {
        setBusy(false);
      }
    }, 220);
  };

  const dealOptions = hits.map((h) => ({
    value: `deal:${h.id}`,
    label: (
      <div style={{ padding: '5px 2px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#171B26', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {h.clientName || '—'}
          </span>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, fontWeight: 700, color: '#C13A26', background: '#FDEDE9', borderRadius: 5, padding: '1px 7px', flexShrink: 0 }}>
            {h.reference}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginTop: 2 }}>
          <span style={{ fontSize: 11.5, color: '#616875', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {h.make} {h.model}{h.year ? ` · ${h.year}` : ''}
          </span>
          {h.registrationNo && (
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#98A0AC', flexShrink: 0 }}>
              {h.registrationNo}
            </span>
          )}
        </div>
      </div>
    ),
  }));

  // Vehicles, drivers, trips and incidents — the half of the app Meilisearch
  // does not index.
  const fleetOptions = fleetHits.map((h) => ({
    value: `go:${h.href}`,
    label: (
      <div style={{ padding: '5px 2px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#171B26' }}>{h.title}</span>
          {h.subtitle && (
            <span style={{ fontSize: 11.5, color: '#616875', marginLeft: 8 }}>{h.subtitle}</span>
          )}
        </span>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
          color: '#3A4150', background: '#EDF1F6', borderRadius: 5, padding: '2px 7px', flexShrink: 0,
        }}>
          {h.type}
        </span>
      </div>
    ),
  }));

  const groupHeading = (text: string) => (
    <span style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: '.1em',
      textTransform: 'uppercase', color: '#98A0AC',
    }}>{text}</span>
  );

  // Only show headings when both kinds are present; a single group needs no label.
  // Typed explicitly: antd's options prop accepts either a flat list or
  // groups, and TypeScript will not infer the union on its own.
  const options: DefaultOptionType[] =
    dealOptions.length && fleetOptions.length
      ? [
          { label: groupHeading('Deals'), options: dealOptions },
          { label: groupHeading('Fleet & compliance'), options: fleetOptions },
        ]
      : [...dealOptions, ...fleetOptions];

  return (
    <>
      <style>{`
        .pod-gsearch.ant-input-affix-wrapper {
          border-radius: 999px;
          background: #FFFFFF;
          border: 1px solid #E3E9EF;
          box-shadow: 0 1px 2px rgba(16,24,40,.05);
          padding: 1px 16px;
          height: 45px;
          line-height: normal; /* the antd Header sets line-height: 64px */
          transition: border-color .15s, box-shadow .15s;
        }
        .pod-gsearch.ant-input-affix-wrapper:hover { border-color: #D3DCE5; }
        .pod-gsearch.ant-input-affix-wrapper-focused {
          border-color: #E8503A;
          box-shadow: 0 0 0 3px rgba(232,80,58,.12), 0 1px 2px rgba(16,24,40,.05);
        }
        .pod-gsearch .ant-input { background: transparent; font-size: 13px; }
        .pod-gsearch .ant-input::placeholder { color: #98A0AC; }
        .pod-gsearch-kbd {
          font-size: 10px; font-weight: 600; color: #98A0AC;
          background: #F2F5F8; border: 1px solid #E3E9EF; border-radius: 6px;
          padding: 2px 7px; line-height: 14px; white-space: nowrap;
        }
        .pod-gsearch.ant-input-affix-wrapper-focused .pod-gsearch-kbd { display: none; }
        .pod-gsearch-pop .ant-select-item { border-radius: 10px; }
        .pod-gsearch-pop .ant-select-item-option-active { background: #F2F5F8 !important; }
      `}</style>
      <AutoComplete
        value={value}
        options={options}
        onSearch={onSearch}
        onSelect={(key: string) => {
          setValue('');
          setHits([]);
          setFleetHits([]);
          // "go:<href>" for fleet records, "deal:<id>" for deals.
          router.push(key.startsWith('go:') ? key.slice(3) : `/deals/${key.slice(5)}`);
        }}
        style={{ width: '100%', maxWidth: 480 }}
        popupMatchSelectWidth={480}
        classNames={{ popup: { root: 'pod-gsearch-pop' } }}
        notFoundContent={
          value.trim() && !busy
            ? <div style={{ padding: '10px 6px', fontSize: 12, color: '#98A0AC', textAlign: 'center' }}>Nothing matches “{value}”</div>
            : null
        }
      >
        <Input
          ref={inputRef}
          className="pod-gsearch"
          prefix={<SearchOutlined style={{ color: '#98A0AC', fontSize: 14, marginRight: 4 }} />}
          suffix={busy ? <Spin size="small" /> : kbdHint ? <span className="pod-gsearch-kbd">{kbdHint}</span> : null}
          placeholder="Search deals, vehicles, drivers, trips…"
          allowClear
        />
      </AutoComplete>
    </>
  );
}
