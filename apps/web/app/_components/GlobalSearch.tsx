'use client';

import { SearchOutlined } from '@ant-design/icons';
import { AutoComplete, Input, Spin } from 'antd';
import type { InputRef } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import api from '../_lib/api';

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
    if (!q.trim()) { setHits([]); setBusy(false); return; }
    setBusy(true);
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/api/search', { params: { q } });
        setHits(data.hits ?? []);
      } catch {
        setHits([]);
      } finally {
        setBusy(false);
      }
    }, 220);
  };

  const options = hits.map((h) => ({
    value: h.id,
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

  return (
    <>
      <style>{`
        .pod-gsearch.ant-input-affix-wrapper {
          border-radius: 999px;
          background: #FFFFFF;
          border: 1px solid #E9E9E4;
          box-shadow: 0 1px 2px rgba(16,24,40,.05);
          padding: 1px 16px;
          height: 45px;
          line-height: normal; /* the antd Header sets line-height: 64px */
          transition: border-color .15s, box-shadow .15s;
        }
        .pod-gsearch.ant-input-affix-wrapper:hover { border-color: #DDDDD6; }
        .pod-gsearch.ant-input-affix-wrapper-focused {
          border-color: #E8503A;
          box-shadow: 0 0 0 3px rgba(232,80,58,.12), 0 1px 2px rgba(16,24,40,.05);
        }
        .pod-gsearch .ant-input { background: transparent; font-size: 13px; }
        .pod-gsearch .ant-input::placeholder { color: #98A0AC; }
        .pod-gsearch-kbd {
          font-size: 10px; font-weight: 600; color: #98A0AC;
          background: #F6F6F3; border: 1px solid #E9E9E4; border-radius: 6px;
          padding: 2px 7px; line-height: 14px; white-space: nowrap;
        }
        .pod-gsearch.ant-input-affix-wrapper-focused .pod-gsearch-kbd { display: none; }
        .pod-gsearch-pop .ant-select-item { border-radius: 10px; }
        .pod-gsearch-pop .ant-select-item-option-active { background: #F6F6F3 !important; }
      `}</style>
      <AutoComplete
        value={value}
        options={options}
        onSearch={onSearch}
        onSelect={(id) => {
          setValue('');
          setHits([]);
          router.push(`/deals/${id}`);
        }}
        style={{ width: '100%', maxWidth: 480 }}
        popupMatchSelectWidth={480}
        popupClassName="pod-gsearch-pop"
        notFoundContent={
          value.trim() && !busy
            ? <div style={{ padding: '10px 6px', fontSize: 12, color: '#98A0AC', textAlign: 'center' }}>No cars match “{value}”</div>
            : null
        }
      >
        <Input
          ref={inputRef}
          className="pod-gsearch"
          prefix={<SearchOutlined style={{ color: '#98A0AC', fontSize: 14, marginRight: 4 }} />}
          suffix={busy ? <Spin size="small" /> : kbdHint ? <span className="pod-gsearch-kbd">{kbdHint}</span> : null}
          placeholder="Search by name, car or plate…"
          allowClear
        />
      </AutoComplete>
    </>
  );
}
