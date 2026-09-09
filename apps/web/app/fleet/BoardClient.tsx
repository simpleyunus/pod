'use client';

import {
  AppstoreOutlined,
  CalendarOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  FilterOutlined,
  PlusOutlined,
  TableOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Col,
  DatePicker,
  Radio,
  Row,
  Segmented,
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

type FleetFilters = DealFilters & { createdFrom?: string; createdTo?: string };
import { useDeals } from '../_lib/hooks/useDeals';
import { useCountries, useLocations, useStatuses, useUsers } from '../_lib/hooks/useReference';
import AddCarDrawer from './AddCarDrawer';

const { Text } = Typography;

// One hue per stage so the pipeline reads at a glance.
const STATUS_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  'Deposit paid':            { dot: '#7C5CFC', bg: '#F1EEFE', text: '#5B3FD4' },
  'Purchased':               { dot: '#98A0AC', bg: '#EDF1F6', text: '#3A4150' },
  'Documents in progress':   { dot: '#F59E0B', bg: '#FCF3E1', text: '#9A6208' },
  'In transit':              { dot: '#3B82F6', bg: '#E9F0FE', text: '#1D4ED8' },
  'At border':               { dot: '#F97316', bg: '#FCEEE4', text: '#C2410C' },
  'Cleared':                 { dot: '#14B8A6', bg: '#E4F7F4', text: '#0F766E' },
  'Ready for delivery':      { dot: '#84CC16', bg: '#F3F9E5', text: '#4D7C0F' },
  'Delivered':               { dot: '#12B76A', bg: '#E6F6EE', text: '#067647' },
};

const FALLBACK_STATUS_COLOR = { dot: '#98A0AC', bg: '#EDF1F6', text: '#3A4150' };

const PAYMENT_PILL: Record<string, { text: string; color: string }> = {
  PAID:    { text: 'Paid',    color: '#067647' },
  PARTIAL: { text: 'Partial', color: '#9A6208' },
  UNPAID:  { text: 'Unpaid',  color: '#B42318' },
};

// Consultant avatars — deterministic color per name
const AVATAR_COLORS = ['#0E1B2A', '#3A5570', '#12805C', '#7C5CFC', '#2563EB', '#0E7490', '#B54708'];
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

function KpiCard({ icon, label, value, accent, tint }: { icon: React.ReactNode; label: string; value: number; accent: string; tint: string }) {
  return (
    <Card size="small" style={{ borderRadius: 14, border: '1px solid #E3E9EF' }} styles={{ body: { padding: '14px 16px' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: tint, color: accent, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 25, fontWeight: 700, color: '#171B26', lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>{value}</div>
          <div style={{ fontSize: 9.5, color: '#98A0AC', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
        </div>
      </div>
    </Card>
  );
}

// ───────────────────────────── Kanban ─────────────────────────────

function KanbanCard({ deal, canDrag, onOpen, onDragStart }: {
  deal: any;
  canDrag: boolean;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const pay = PAYMENT_PILL[deal.paymentStatus];
  return (
    <div
      draggable={canDrag}
      onDragStart={onDragStart}
      onClick={onOpen}
      className="pod-kanban-card"
      style={{
        background: '#fff',
        border: '1px solid #E3E9EF',
        borderRadius: 12,
        padding: '10px 12px',
        boxShadow: '0 1px 2px rgba(16,24,40,.04)',
        cursor: canDrag ? 'grab' : 'pointer',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <Text style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: '#0E1B2A', fontWeight: 700, letterSpacing: 0.3 }}>
          {deal.reference}
        </Text>
        {pay && <Text style={{ fontSize: 10, fontWeight: 700, color: pay.color }}>{pay.text}</Text>}
      </div>
      <div style={{ fontWeight: 600, color: '#171B26', fontSize: 12.5, lineHeight: 1.25 }}>
        {deal.client?.fullName ?? '—'}
      </div>
      <div style={{ fontSize: 11, color: '#616875', marginTop: 1 }}>
        {deal.make} {deal.model}{deal.year ? ` · ${deal.year}` : ''}
      </div>
      {deal.currentLocation && (
        <div style={{ fontSize: 10, color: '#98A0AC', marginTop: 3 }}>📍 {deal.currentLocation.name}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }}>
        {deal.consultant ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <ConsultantAvatar name={deal.consultant.fullName} size={20} />
            <Text style={{ fontSize: 10, color: '#616875' }}>{deal.consultant.fullName.split(' ')[0]}</Text>
          </div>
        ) : <span />}
        {deal.isStalled ? (
          <span title={`No movement in ${deal.idleDays} days`} style={{ fontSize: 9, fontWeight: 700, color: '#C13A26', background: '#FDEDE9', borderRadius: 5, padding: '1px 6px' }}>
            ⏱ {deal.idleDays}d
          </span>
        ) : (
          <Text style={{ fontSize: 10, color: '#98A0AC' }}>
            {new Date(deal.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          </Text>
        )}
      </div>
    </div>
  );
}

function KanbanView({ deals, statuses, canWrite }: { deals: any[]; statuses: any[]; canWrite: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const moveDeal = useMutation({
    mutationFn: ({ dealId, statusId }: { dealId: string; statusId: string }) =>
      api.post(`/api/deals/${dealId}/status`, { statusId, note: 'Moved on the board' }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      message.success('Stage updated');
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not update stage'),
  });

  const byStatus: Record<string, any[]> = {};
  for (const d of deals) {
    const key = d.currentStatus?.id ?? 'none';
    (byStatus[key] ??= []).push(d);
  }

  const columns: Array<{ id: string; name: string }> = [
    ...(byStatus['none']?.length ? [{ id: 'none', name: 'No stage' }] : []),
    ...statuses.map((s: any) => ({ id: s.id, name: s.name })),
  ];

  const handleDrop = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverCol(null);
    if (colId === 'none') return;
    const dealId = e.dataTransfer.getData('text/pod-deal');
    if (!dealId) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.currentStatus?.id === colId) return;
    moveDeal.mutate({ dealId, statusId: colId });
  };

  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
      <style>{`
        .pod-kanban-card { transition: box-shadow .12s, transform .12s; }
        .pod-kanban-card:hover { box-shadow: 0 3px 10px rgba(26,99,115,.14); transform: translateY(-1px); }
        .pod-kanban-card:active { cursor: grabbing; }
      `}</style>
      {columns.map((col) => {
        const items = byStatus[col.id] ?? [];
        const cfg = STATUS_COLORS[col.name] ?? FALLBACK_STATUS_COLOR;
        const isOver = dragOverCol === col.id;
        return (
          <div
            key={col.id}
            onDragOver={(e) => { e.preventDefault(); if (canWrite) setDragOverCol(col.id); }}
            onDragLeave={() => setDragOverCol((c) => (c === col.id ? null : c))}
            onDrop={(e) => canWrite && handleDrop(e, col.id)}
            style={{
              flex: '0 0 250px',
              width: 250,
              background: isOver ? '#FDEDE9' : '#E9EEF3',
              border: `1.5px solid ${isOver ? '#F6C9BE' : 'transparent'}`,
              borderRadius: 14,
              transition: 'background .12s, border-color .12s',
            }}
          >
            {/* Column header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 12px 8px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
              <Text style={{ fontSize: 11, fontWeight: 700, color: '#0E1B2A', textTransform: 'uppercase', letterSpacing: 0.6, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {col.name}
              </Text>
              <span style={{ fontSize: 10, fontWeight: 700, color: cfg.text, background: cfg.bg === '#E9EEF3' ? '#fff' : cfg.bg, border: '1px solid rgba(0,0,0,.04)', borderRadius: 99, padding: '1px 8px' }}>
                {items.length}
              </span>
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 8px 10px', maxHeight: 'calc(100vh - 380px)', minHeight: 60, overflowY: 'auto' }}>
              {items.map((d) => (
                <KanbanCard
                  key={d.id}
                  deal={d}
                  canDrag={canWrite}
                  onOpen={() => router.push(`/deals/${d.id}`)}
                  onDragStart={(e) => e.dataTransfer.setData('text/pod-deal', d.id)}
                />
              ))}
              {!items.length && (
                <div style={{ textAlign: 'center', padding: '18px 0', fontSize: 11, color: '#C3C9D2' }}>
                  {isOver ? 'Drop here' : 'No cars'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────── Board ─────────────────────────────

export default function BoardClient() {
  const router = useRouter();
  const [filters, setFilters] = useState<FleetFilters>({ page: 1, pageSize: 25 });
  const [view, setView] = useState<'table' | 'kanban'>(
    () => (typeof window !== 'undefined' && localStorage.getItem('pod.boardView') === 'kanban' ? 'kanban' : 'table'),
  );
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

  // Kanban needs the whole picture, not a page of it.
  const effectiveFilters = view === 'kanban' ? { ...filters, page: 1, pageSize: 200 } : filters;
  const { data, isFetching } = useDeals(effectiveFilters);
  const { data: statuses } = useStatuses();
  const { data: locations } = useLocations();
  const { data: users } = useUsers();
  const { data: countries } = useCountries();

  const activeFilterCount = [
    view === 'table' ? filters.statusId : undefined,
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
  const changeView = (v: 'table' | 'kanban') => {
    setView(v);
    localStorage.setItem('pod.boardView', v);
  };

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
        const cfg = STATUS_COLORS[r.currentStatus.name];
        return cfg ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 6,
            background: cfg.bg, color: cfg.text,
            fontSize: 11, fontWeight: 600,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            {r.currentStatus.name}
          </span>
        ) : (
          <Tag>{r.currentStatus.name}</Tag>
        );
      },
    },
    {
      title: 'Where it is',
      key: 'location',
      render: (_: any, r: any) => (
        <Text style={{ fontSize: 12, color: '#616875' }}>{r.currentLocation?.name ?? '—'}</Text>
      ),
    },
    {
      title: 'Payment',
      key: 'payment',
      sorter: (a: any, b: any) => {
        const order: Record<string, number> = { UNPAID: 0, PARTIAL: 1, PAID: 2 };
        return (order[a.paymentStatus] ?? -1) - (order[b.paymentStatus] ?? -1);
      },
      render: (_: any, r: any) => {
        const p = PAYMENT_PILL[r.paymentStatus];
        if (!p) return null;
        return (
          <Text style={{ fontSize: 11, fontWeight: 700, color: p.color }}>{p.text}</Text>
        );
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
      render: (v: string, r: any) => (
        <Space size={5}>
          <Text style={{ fontSize: 11, color: '#98A0AC' }}>
            {new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          </Text>
          {r.isStalled && (
            <span title={`No movement in ${r.idleDays} days`} style={{ fontSize: 10, fontWeight: 700, color: '#C13A26', background: '#FDEDE9', borderRadius: 5, padding: '1px 6px' }}>
              ⏱ {r.idleDays}d
            </span>
          )}
        </Space>
      ),
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
          <Segmented
            value={view}
            onChange={(v) => changeView(v as 'table' | 'kanban')}
            options={[
              { value: 'table', icon: <TableOutlined />, label: 'Table' },
              { value: 'kanban', icon: <AppstoreOutlined />, label: 'Kanban' },
            ]}
          />
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
        <Col xs={12} md={4}><KpiCard icon={<FileTextOutlined />} label="Total" value={total} accent="#0E1B2A" tint="#EDF1F6" /></Col>
        <Col xs={12} md={4}><KpiCard icon={<CalendarOutlined />} label="Arriving this week" value={arriving} accent="#5B3FD4" tint="#F1EEFE" /></Col>
        <Col xs={12} md={4}><KpiCard icon={<CarOutlined />} label="In Transit" value={inTransit} accent="#1D4ED8" tint="#E9F0FE" /></Col>
        <Col xs={12} md={4}><KpiCard icon={<CloseCircleOutlined />} label="Unpaid" value={unpaid} accent="#B42318" tint="#FEECEB" /></Col>
        <Col xs={12} md={4}><KpiCard icon={<CheckCircleOutlined />} label="Paid" value={paid} accent="#067647" tint="#E6F6EE" /></Col>
        <Col xs={12} md={4}><KpiCard icon={<ClockCircleOutlined />} label="Stalled" value={stalled} accent="#C2410C" tint="#FCEEE4" /></Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ borderRadius: 14, border: '1px solid #E3E9EF' }} styles={{ body: { padding: '10px 14px' } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Badge count={activeFilterCount} size="small" color="#0E1B2A" offset={[2, -2]}>
            <FilterOutlined style={{ fontSize: 14, color: activeFilterCount ? '#0E1B2A' : '#98A0AC' }} />
          </Badge>

          {view === 'table' && (
            <Select allowClear placeholder="Stage" style={{ minWidth: 180 }} value={filters.statusId}
              onChange={(v) => set({ statusId: v })}
              options={statuses?.map((s: any) => {
                const cfg = STATUS_COLORS[s.name] ?? FALLBACK_STATUS_COLOR;
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
          )}

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
              { label: <span style={{ color: '#B42318' }}>Unpaid</span>, value: 'UNPAID' },
              { label: <span style={{ color: '#C13A26' }}>Partial</span>, value: 'PARTIAL' },
              { label: <span style={{ color: '#067647' }}>Paid</span>, value: 'PAID' },
            ]}
          />

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
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

      {/* Table or Kanban */}
      {view === 'table' ? (
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
      ) : (
        <KanbanView deals={items} statuses={statuses ?? []} canWrite={canWrite} />
      )}

      <AddCarDrawer open={addOpen} onClose={() => setAddOpen(false)} />
    </Space>
  );
}
