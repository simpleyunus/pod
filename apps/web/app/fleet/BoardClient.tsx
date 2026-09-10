'use client';

import {
  CalendarOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  FilterOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import api from '../_lib/api';
import { hasRole } from '../_lib/auth';
import type { DealFilters } from '../_lib/hooks/useDeals';
import { stageTone } from '../_lib/stageTone';
import { allSignals } from '../_lib/dealSignals';
import RagTag, { KpiCard, RagDot, RagLegend, RAG_TONES } from '../_components/RagTag';

type FleetFilters = DealFilters & { createdFrom?: string; createdTo?: string };
import { useDeals } from '../_lib/hooks/useDeals';
import { useCountries, useLocations, useStatuses, useUsers } from '../_lib/hooks/useReference';
import AddCarDrawer from './AddCarDrawer';

const { Text } = Typography;

// Consultant avatars — deterministic colour per name.
// Identity, not status. They stay inside the same slate family the stage chips
// use, distinguished by lightness rather than hue: a bright blue disc was
// ending up the loudest thing in a row whose actual warnings are the lamps.
const AVATAR_COLORS = ['#0E1B2A', '#2C4E6E', '#3A5570', '#5E7C99', '#4C4A7D'];
function ConsultantAvatar({ name, size = 26 }: { name: string; size?: number }) {
  const idx = (name.charCodeAt(0) + (name.charCodeAt(1) ?? 0)) % AVATAR_COLORS.length;
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: AVATAR_COLORS[idx],
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size < 24 ? 9 : 10, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

// ───────────────────────────── Board ─────────────────────────────

export default function BoardClient() {
  const router = useRouter();
  const [filters, setFilters] = useState<FleetFilters>({ page: 1, pageSize: 25 });
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [bulkConsultant, setBulkConsultant] = useState<string | undefined>();
  const [bulkStatus, setBulkStatus] = useState<string | undefined>();
  const qcBulk = useQueryClient();
  const canWrite = hasRole('CONSULTANT');

  const bulkApply = useMutation({
    mutationFn: () =>
      api.post('/api/deals/bulk', {
        dealIds: selected,
        ...(bulkConsultant !== undefined && { consultantId: bulkConsultant }),
        ...(bulkStatus && { statusId: bulkStatus }),
      }).then((r) => r.data),
    onSuccess: (r) => {
      message.success(`${r.updated} cars updated`);
      setSelected([]);
      setBulkConsultant(undefined);
      setBulkStatus(undefined);
      qcBulk.invalidateQueries({ queryKey: ['deals'] });
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Bulk update failed'),
  });

  const { data, isFetching } = useDeals(filters);
  const { data: statuses } = useStatuses();
  const { data: locations } = useLocations();
  const { data: users } = useUsers();
  const { data: countries } = useCountries();

  const activeFilterCount = [
    filters.statusId,
    filters.locationId,
    filters.consultantId,
    filters.country,
    filters.payment,
    filters.createdFrom || filters.createdTo,
  ].filter(Boolean).length;

  const items: any[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const inTransit = items.filter((d) => d.currentStatus?.name?.toLowerCase().includes('transit')).length;
  const unpaid = items.filter((d) => d.paymentStatus === 'UNPAID').length;
  const paid = items.filter((d) => d.paymentStatus === 'PAID').length;
  const stalled = items.filter((d) => d.isStalled).length;
  const weekAhead = Date.now() + 7 * 86_400_000;
  const arriving = items.filter((d) => {
    if (!d.expectedDeliveryDate || d.currentStatus?.isTerminal) return false;
    const eta = new Date(d.expectedDeliveryDate).getTime();
    return eta >= Date.now() - 86_400_000 && eta <= weekAhead;
  }).length;

  const set = (patch: Partial<FleetFilters>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  const columns = [
    {
      title: 'Reference',
      dataIndex: 'reference',
      key: 'reference',
      width: 148,
      sorter: (a: any, b: any) => (a.reference ?? '').localeCompare(b.reference ?? ''),
      render: (v: string) => (
        <Text style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#0E1B2A', fontWeight: 700, letterSpacing: 0.3 }}>
          {v}
        </Text>
      ),
    },
    {
      title: 'Customer',
      key: 'client',
      sorter: (a: any, b: any) => (a.client?.fullName ?? '').localeCompare(b.client?.fullName ?? ''),
      render: (_: any, r: any) => (
        <div>
          <div style={{ fontWeight: 600, color: '#171B26', fontSize: 13 }}>{r.client?.fullName ?? '—'}</div>
          {r.client?.country && <div style={{ fontSize: 11, color: '#98A0AC' }}>{r.client.country}</div>}
        </div>
      ),
    },
    {
      title: 'Car',
      key: 'vehicle',
      sorter: (a: any, b: any) => `${a.make} ${a.model}`.localeCompare(`${b.make} ${b.model}`),
      render: (_: any, r: any) => (
        <div>
          <div style={{ fontWeight: 500, color: '#171B26', fontSize: 13 }}>{r.make} {r.model}</div>
          {r.year && <div style={{ fontSize: 11, color: '#98A0AC' }}>{r.year}</div>}
        </div>
      ),
    },
    {
      title: 'Stage',
      key: 'status',
      sorter: (a: any, b: any) =>
        (statuses?.findIndex((s: any) => s.id === a.currentStatus?.id) ?? -1) -
        (statuses?.findIndex((s: any) => s.id === b.currentStatus?.id) ?? -1),
      render: (_: any, r: any) => {
        if (!r.currentStatus) return <Text style={{ color: '#C3C9D2', fontSize: 12 }}>—</Text>;
        const idx = statuses?.findIndex((s: any) => s.id === r.currentStatus.id) ?? -1;
        const cfg = stageTone(idx, statuses?.length ?? 0);
        // Two pieces of information, two channels: the chip says WHICH stage
        // (its tone is the pipeline ramp), the lamp says whether it is moving.
        const sig = allSignals(r).stage;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <RagDot rag={sig.rag} title={sig.why} />
            {cfg ? (
              <span style={{
                padding: '3px 9px', borderRadius: 6,
                background: cfg.bg, color: cfg.text,
                fontSize: 11, fontWeight: 600,
              }}>
                {r.currentStatus.name}
              </span>
            ) : (
              <Tag>{r.currentStatus.name}</Tag>
            )}
          </span>
        );
      },
    },
    {
      title: 'Where it is',
      key: 'location',
      render: (_: any, r: any) => {
        const sig = allSignals(r).location;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <RagDot rag={sig.rag} title={sig.why} />
            <Text style={{ fontSize: 12, color: r.currentLocation ? '#616875' : '#98A0AC' }}>
              {r.currentLocation?.name ?? 'Not logged'}
            </Text>
          </span>
        );
      },
    },
    {
      title: 'Payment',
      key: 'payment',
      sorter: (a: any, b: any) => {
        const order: Record<string, number> = { UNPAID: 0, PARTIAL: 1, PAID: 2 };
        return (order[a.paymentStatus] ?? -1) - (order[b.paymentStatus] ?? -1);
      },
      render: (_: any, r: any) => {
        const sig = allSignals(r).payment;
        return <span title={sig.why}><RagTag status={sig.rag} label={sig.label} size="sm" /></span>;
      },
    },
    {
      title: 'Handled by',
      key: 'consultant',
      render: (_: any, r: any) =>
        r.consultant ? (
          <Space size={6}>
            <ConsultantAvatar name={r.consultant.fullName} />
            <Text style={{ fontSize: 12, color: '#3A4150' }}>
              {r.consultant.fullName.split(' ')[0]}
            </Text>
          </Space>
        ) : (
          <Text style={{ color: '#C3C9D2', fontSize: 12 }}>—</Text>
        ),
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 108,
      sorter: (a: any, b: any) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
      defaultSortOrder: 'descend' as const,
      render: (v: string, r: any) => {
        const sig = allSignals(r).updated;
        const tone = RAG_TONES[sig.rag];
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <RagDot rag={sig.rag} title={sig.why} />
            <Text style={{ fontSize: 11, color: '#98A0AC' }}>
              {new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
            </Text>
            {/* The idle count only earns its space once the lamp is off green. */}
            {(sig.rag === 'AMBER' || sig.rag === 'RED') && (
              <span title={sig.why} style={{
                fontSize: 10, fontWeight: 700, borderRadius: 5, padding: '1px 6px',
                color: tone.text, background: tone.bg,
              }}>
                {r.idleDays}d
              </span>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 700, color: '#171B26', letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>Fleet</div>
          <div style={{ fontSize: 12, color: '#98A0AC', marginTop: 2 }}>Vehicle imports & deliveries</div>
        </div>
        <Space size={8}>
          {hasRole('ADMIN') && (
            <Button onClick={() => router.push('/import')} icon={<FileTextOutlined />} size="small">
              Import
            </Button>
          )}
          {canWrite && (
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
              Add car
            </Button>
          )}
        </Space>
      </div>

      {/* KPI row */}
      <Row gutter={[12, 12]}>
        <Col xs={12} md={4}><KpiCard icon={<FileTextOutlined />} label="Total" value={total} accent="#0E1B2A" tint={RAG_TONES.NEUTRAL.bg} /></Col>
        <Col xs={12} md={4}><KpiCard icon={<CarOutlined />} label="In Transit" value={inTransit} accent="#3A4150" tint={RAG_TONES.NEUTRAL.bg} /></Col>
        <Col xs={12} md={4}><KpiCard icon={<CalendarOutlined />} label="Arriving this week" value={arriving} accent={RAG_TONES.AMBER.text} tint={RAG_TONES.AMBER.bg} /></Col>
        <Col xs={12} md={4}><KpiCard icon={<ClockCircleOutlined />} label="Stalled" value={stalled} accent={RAG_TONES.AMBER.text} tint={RAG_TONES.AMBER.bg} /></Col>
        <Col xs={12} md={4}><KpiCard icon={<CloseCircleOutlined />} label="Unpaid" value={unpaid} accent={RAG_TONES.RED.text} tint={RAG_TONES.RED.bg} /></Col>
        <Col xs={12} md={4}><KpiCard icon={<CheckCircleOutlined />} label="Paid" value={paid} accent={RAG_TONES.GREEN.text} tint={RAG_TONES.GREEN.bg} /></Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ borderRadius: 14, border: '1px solid #E3E9EF' }} styles={{ body: { padding: '10px 14px' } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Badge count={activeFilterCount} size="small" color="#0E1B2A" offset={[2, -2]}>
            <FilterOutlined style={{ fontSize: 14, color: activeFilterCount ? '#0E1B2A' : '#98A0AC' }} />
          </Badge>

          <Select allowClear placeholder="Stage" style={{ minWidth: 180 }} value={filters.statusId}
            onChange={(v) => set({ statusId: v })}
            options={statuses?.map((s: any, i: number) => {
              const cfg = stageTone(i, statuses.length);
              return {
                value: s.id,
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
                    {s.name}
                  </span>
                ),
              };
            })} />

          <Select allowClear placeholder="Location" style={{ minWidth: 150 }} value={filters.locationId}
            onChange={(v) => set({ locationId: v })}
            options={locations?.map((l: any) => ({
              value: l.id,
              label: <span>📍 {l.name}</span>,
            }))} />

          <Select allowClear placeholder="Consultant" style={{ minWidth: 160 }} value={filters.consultantId}
            onChange={(v) => set({ consultantId: v })}
            options={users?.map((u: any) => ({
              value: u.id,
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <ConsultantAvatar name={u.fullName} size={18} />
                  {u.fullName}
                </span>
              ),
            }))} />

          <Select allowClear placeholder="Country" style={{ minWidth: 130 }} value={filters.country}
            onChange={(v) => set({ country: v })}
            options={countries?.map((c: string) => ({ value: c, label: c }))} />

          <DatePicker.RangePicker
            allowClear
            style={{ minWidth: 230 }}
            placeholder={['Added from', 'to']}
            value={[
              filters.createdFrom ? dayjs(filters.createdFrom) : null,
              filters.createdTo ? dayjs(filters.createdTo) : null,
            ]}
            presets={[
              { label: 'This week', value: [dayjs().startOf('week'), dayjs().endOf('week')] },
              { label: 'Last 7 days', value: [dayjs().subtract(7, 'day'), dayjs()] },
              { label: 'This month', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
              { label: 'Last 30 days', value: [dayjs().subtract(30, 'day'), dayjs()] },
              { label: 'This quarter', value: [dayjs().startOf('month').subtract(dayjs().month() % 3, 'month'), dayjs()] },
            ]}
            onChange={(range) =>
              set({
                createdFrom: range?.[0] ? range[0].startOf('day').toISOString() : undefined,
                createdTo: range?.[1] ? range[1].endOf('day').toISOString() : undefined,
              })
            }
          />
          <Radio.Group
            value={filters.payment ?? 'ALL'}
            onChange={(e) => set({ payment: e.target.value === 'ALL' ? undefined : e.target.value })}
            optionType="button" size="small"
            options={[
              { label: 'All', value: 'ALL' },
              { label: <span style={{ color: RAG_TONES.RED.text }}>Unpaid</span>, value: 'UNPAID' },
              { label: <span style={{ color: RAG_TONES.AMBER.text }}>Partial</span>, value: 'PARTIAL' },
              { label: <span style={{ color: RAG_TONES.GREEN.text }}>Paid</span>, value: 'PAID' },
            ]}
          />

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            <RagLegend />
            <Text style={{ fontSize: 12, color: '#98A0AC', fontVariantNumeric: 'tabular-nums' }}>
              {isFetching ? '…' : `${total} car${total === 1 ? '' : 's'}`}
            </Text>
            {activeFilterCount > 0 && (
              <Button size="small" type="text" style={{ color: '#3A5570', fontWeight: 600, fontSize: 12 }}
                onClick={() => setFilters({ page: 1, pageSize: 25 })}>
                Clear all
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Bulk action bar */}
      {canWrite && selected.length > 0 && (
        <Card size="small" style={{ borderRadius: 12, border: '1.5px solid #F6C9BE', background: '#FDEDE9' }}
          styles={{ body: { padding: '8px 14px' } }}>
          <Space wrap size={10}>
            <Text style={{ fontSize: 12.5, fontWeight: 700, color: '#C13A26' }}>{selected.length} selected</Text>
            <Select allowClear placeholder="Assign consultant" size="small" style={{ minWidth: 170 }}
              value={bulkConsultant} onChange={setBulkConsultant}
              options={users?.map((u: any) => ({ label: u.fullName, value: u.id }))} />
            <Select allowClear placeholder="Set stage" size="small" style={{ minWidth: 170 }}
              value={bulkStatus} onChange={setBulkStatus}
              options={statuses?.map((st: any) => ({ label: st.name, value: st.id }))} />
            <Button type="primary" size="small" loading={bulkApply.isPending}
              disabled={bulkConsultant === undefined && !bulkStatus}
              onClick={() => bulkApply.mutate()}>
              Apply
            </Button>
            <Button type="text" size="small" style={{ color: '#98A0AC' }} onClick={() => setSelected([])}>
              Cancel
            </Button>
          </Space>
        </Card>
      )}

        {/* Deals table */}
        <Card style={{ borderRadius: 14, border: '1px solid #E3E9EF' }} styles={{ body: { padding: 0 } }}>
          <Table
            dataSource={items}
            columns={columns}
            rowKey="id"
            loading={isFetching}
            rowSelection={canWrite ? { selectedRowKeys: selected, onChange: setSelected } : undefined}
            size="middle"
            onRow={(r) => ({ onClick: () => router.push(`/deals/${r.id}`), style: { cursor: 'pointer' } })}
            pagination={{
              current: filters.page ?? 1,
              pageSize: filters.pageSize ?? 25,
              total,
              showSizeChanger: true,
              showTotal: (t) => <Text style={{ fontSize: 12, color: '#98A0AC' }}>{t} deals</Text>,
              onChange: (page, pageSize) => setFilters((f) => ({ ...f, page, pageSize })),
              style: { padding: '10px 20px' },
            }}
          />
        </Card>

      <AddCarDrawer open={addOpen} onClose={() => setAddOpen(false)} />
    </Space>
  );
}
