'use client';

import { CameraOutlined, CheckOutlined, CloseOutlined, MinusOutlined } from '@ant-design/icons';
import { Button, Drawer, Form, Input, InputNumber, Select, Switch, Typography, message } from 'antd';
import { useMemo, useState } from 'react';
import api from '../_lib/api';
import { useAssets, useDrivers, useFleetLookups, useFleetMutation } from '../_lib/hooks/useFleet';

const { Text } = Typography;

type Outcome = 'PASS' | 'FAIL' | 'NA';

// Mobile-first: the driver does this on a phone at the depot gate at 5am, so
// the controls are thumb-sized and the whole checklist is one scroll with no
// horizontal movement and no modal nesting.
function OutcomeToggle({ value, onChange }: { value: Outcome; onChange: (v: Outcome) => void }) {
  const opts: { key: Outcome; icon: React.ReactNode; on: string; bg: string }[] = [
    { key: 'PASS', icon: <CheckOutlined />, on: '#067647', bg: '#E6F6EE' },
    { key: 'FAIL', icon: <CloseOutlined />, on: '#B42318', bg: '#FEE4E2' },
    { key: 'NA', icon: <MinusOutlined />, on: '#616875', bg: '#F1F2F0' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      {opts.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-label={o.key}
            style={{
              width: 44, height: 44, borderRadius: 11, cursor: 'pointer',
              border: active ? `1.5px solid ${o.on}` : '1px solid #E9E9E4',
              background: active ? o.bg : '#fff',
              color: active ? o.on : '#C4C8CE',
              fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all .12s',
            }}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}

export default function InspectionForm({
  open, onClose, assignmentId, presetAssetId,
}: {
  open: boolean;
  onClose: () => void;
  assignmentId?: string;
  presetAssetId?: string;
}) {
  const { data: lookups } = useFleetLookups();
  const { data: assets = [] } = useAssets();
  const { data: drivers = [] } = useDrivers();
  const [assetId, setAssetId] = useState<string | undefined>(presetAssetId);
  const [driverId, setDriverId] = useState<string>();
  const [odometerKm, setOdometerKm] = useState<number>();
  const [notes, setNotes] = useState('');
  const [results, setResults] = useState<Record<string, { outcome: Outcome; note?: string; raiseWorkOrder?: boolean }>>({});

  const items = lookups?.inspectionItems ?? [];

  const submit = useFleetMutation((body: any) => api.post('/api/maintenance/inspections', body).then((r) => r.data));

  // Grouped the way the walk-round actually happens, not alphabetically.
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const i of items) {
      const key = i.category ?? 'Other';
      map.set(key, [...(map.get(key) ?? []), i]);
    }
    return [...map.entries()];
  }, [items]);

  const answered = Object.keys(results).length;
  const failures = Object.values(results).filter((r) => r.outcome === 'FAIL').length;

  const handleSubmit = () => {
    if (!assetId) return message.warning('Choose a vehicle');
    if (!answered) return message.warning('Check at least one item');
    submit.mutate(
      {
        assetId,
        driverId: driverId ?? null,
        assignmentId: assignmentId ?? null,
        odometerKm: odometerKm ?? null,
        notes: notes || null,
        results: Object.entries(results).map(([itemId, r]) => ({
          itemId, outcome: r.outcome, note: r.note || null, raiseWorkOrder: !!r.raiseWorkOrder,
        })),
      },
      {
        onSuccess: (res: any) => {
          message.success(res.passed ? 'Inspection passed' : `Inspection recorded — ${failures} failure(s)`);
          setResults({}); setNotes(''); setOdometerKm(undefined);
          onClose();
        },
        onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not save the inspection'),
      },
    );
  };

  return (
    <Drawer
      title="Pre-trip inspection"
      open={open}
      onClose={onClose}
      width="100%"
      styles={{ wrapper: { maxWidth: 560 }, body: { padding: '16px 18px 90px' } }}
      footer={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 4px' }}>
          <div style={{ flex: 1, fontSize: 12, color: '#616875' }}>
            {answered}/{items.length} checked
            {failures > 0 && <span style={{ color: '#B42318', fontWeight: 600 }}> · {failures} failed</span>}
          </div>
          <Button onClick={onClose} style={{ borderRadius: 10 }}>Cancel</Button>
          <Button type="primary" loading={submit.isPending} onClick={handleSubmit} style={{ borderRadius: 10, minWidth: 110 }}>
            Submit
          </Button>
        </div>
      }
    >
      <Form layout="vertical" size="large">
        <Form.Item label="Vehicle" required>
          <Select
            value={assetId} onChange={setAssetId} placeholder="Select vehicle" showSearch optionFilterProp="label"
            options={assets.map((a: any) => ({ value: a.id, label: `${a.code} · ${a.registrationNo}` }))}
          />
        </Form.Item>
        <Form.Item label="Driver">
          <Select
            value={driverId} onChange={setDriverId} placeholder="Select driver" allowClear showSearch optionFilterProp="label"
            options={drivers.map((d: any) => ({ value: d.id, label: d.fullName }))}
          />
        </Form.Item>
        <Form.Item label="Odometer (km)">
          <InputNumber value={odometerKm} onChange={(v) => setOdometerKm(v ?? undefined)} style={{ width: '100%' }} min={0} />
        </Form.Item>
      </Form>

      {grouped.map(([category, list]) => (
        <div key={category} style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#98A0AC', textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: 8,
          }}>
            {category}
          </div>
          {list.map((item: any) => {
            const r = results[item.id];
            return (
              <div
                key={item.id}
                style={{
                  background: '#fff', border: '1px solid #E9E9E4', borderRadius: 12,
                  padding: '12px 14px', marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <Text style={{ fontSize: 14, color: '#171B26' }}>{item.label}</Text>
                    {item.critical && (
                      <div style={{ fontSize: 10, color: '#B42318', fontWeight: 600, marginTop: 2 }}>
                        CRITICAL — a failure blocks departure
                      </div>
                    )}
                  </div>
                  <OutcomeToggle
                    value={r?.outcome ?? ('' as Outcome)}
                    onChange={(outcome) => setResults((prev) => ({ ...prev, [item.id]: { ...prev[item.id], outcome } }))}
                  />
                </div>

                {r?.outcome === 'FAIL' && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #F1F1EC', paddingTop: 10 }}>
                    <Input.TextArea
                      rows={2} placeholder="What is wrong?"
                      value={r.note}
                      onChange={(e) => setResults((prev) => ({ ...prev, [item.id]: { ...prev[item.id], note: e.target.value } }))}
                      style={{ marginBottom: 10 }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Switch
                        size="small"
                        checked={r.raiseWorkOrder ?? true}
                        onChange={(v) => setResults((prev) => ({ ...prev, [item.id]: { ...prev[item.id], raiseWorkOrder: v } }))}
                      />
                      <Text style={{ fontSize: 12, color: '#616875' }}>Raise a work order</Text>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <Form layout="vertical">
        <Form.Item label="Notes">
          <Input.TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
