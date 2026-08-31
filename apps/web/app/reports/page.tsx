'use client';

import {
  ApiOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CloudSyncOutlined,
  DownloadOutlined,
  PercentageOutlined,
  PlusCircleOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Row, Select, Space, Spin, Table, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AppShell from '../_components/AppShell';
import api from '../_lib/api';
import { hasRole } from '../_lib/auth';

const { Text } = Typography;

// Series palette validated (lightness band, chroma, CVD ΔE 96.9, ≥3:1 contrast)
const SERIES = {
  newCars: { label: 'New cars', color: '#2563EB' },
  delivered: { label: 'Delivered', color: '#0E9F62' },
};

function fmtMoney(byCurrency: Record<string, number>) {
  const entries = Object.entries(byCurrency ?? {});
  if (!entries.length) return '—';
  return entries.map(([c, a]) => `${c} ${Math.round(a).toLocaleString()}`).join(' · ');
}

function Tile({ icon, label, value, accent, tint, hint }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; accent: string; tint: string; hint?: string;
}) {
  return (
    <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: '14px 16px' } }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: tint, color: accent, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#171B26', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>{value}</div>
          <div style={{ fontSize: 9.5, color: '#98A0AC', marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {label}{hint ? ` · ${hint}` : ''}
          </div>
        </div>
      </div>
    </Card>
  );
}

function BarList({ title, items }: { title: string; items: Array<{ name: string; count: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }}
      title={<Text style={{ fontSize: 10, fontWeight: 700, color: '#98A0AC', textTransform: 'uppercase', letterSpacing: 1.2 }}>{title}</Text>}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {items.map((i) => (
          <div key={i.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={{ fontSize: 12, color: '#3A4150', fontWeight: 500 }}>{i.name}</Text>
              <Text style={{ fontSize: 12, color: '#616875', fontVariantNumeric: 'tabular-nums' }}>{i.count}</Text>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: '#EFEFEA', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(i.count / max) * 100}%`, borderRadius: 99, background: '#101828' }} />
            </div>
          </div>
        ))}
        {!items.length && <Text style={{ fontSize: 12, color: '#98A0AC' }}>No data yet.</Text>}
      </Space>
    </Card>
  );
}

// ── Month-on-month grouped bars ──────────────────────────────────────
function MonthChart({ monthly }: { monthly: Array<{ month: string; newCars: number; delivered: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...monthly.flatMap((m) => [m.newCars, m.delivered]));
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  const H = 180;
  const y = (v: number) => (v / top) * H;
  const maxNewIdx = monthly.reduce((bi, m, i) => (m.newCars > monthly[bi].newCars ? i : bi), 0);

  const monthLabel = (key: string) =>
    new Date(key + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

  return (
    <div>
      {/* legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
        {Object.values(SERIES).map((s) => (
          <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#616875', fontWeight: 500 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 0 }}>
        {/* y axis */}
        <div style={{ position: 'relative', width: 26, height: H, flexShrink: 0 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} style={{ position: 'absolute', right: 6, bottom: y(i * step) - 6, fontSize: 9.5, color: '#98A0AC', fontVariantNumeric: 'tabular-nums' }}>
              {i * step}
            </span>
          ))}
        </div>

        {/* plot */}
        <div style={{ position: 'relative', flex: 1, height: H }}>
          {/* recessive gridlines */}
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ position: 'absolute', left: 0, right: 0, bottom: y(i * step), height: 1, background: '#F1F1EC' }} />
          ))}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: '#DDDDD6' }} />

          {/* bars */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end' }}>
            {monthly.map((m, i) => (
              <div
                key={m.month}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                style={{
                  flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                  gap: 2, position: 'relative', cursor: 'default',
                  background: hover === i ? 'rgba(16,24,40,.03)' : 'transparent', borderRadius: 8,
                }}
              >
                {/* selective direct label on the peak month */}
                {(i === maxNewIdx || hover === i) && m.newCars > 0 && (
                  <span style={{
                    position: 'absolute', bottom: y(Math.max(m.newCars, m.delivered)) + 4,
                    fontSize: 10, fontWeight: 600, color: '#3A4150', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                  }}>
                    {m.newCars}{m.delivered ? ` / ${m.delivered}` : ''}
                  </span>
                )}
                <div style={{ width: 12, height: Math.max(m.newCars ? 3 : 0, y(m.newCars)), background: SERIES.newCars.color, borderRadius: '4px 4px 0 0' }} />
                <div style={{ width: 12, height: Math.max(m.delivered ? 3 : 0, y(m.delivered)), background: SERIES.delivered.color, borderRadius: '4px 4px 0 0' }} />

                {/* tooltip */}
                {hover === i && (
                  <div style={{
                    position: 'absolute', bottom: H + 6, left: '50%', transform: 'translateX(-50%)',
                    background: '#fff', border: '1px solid #E9E9E4', borderRadius: 10,
                    boxShadow: '0 4px 14px rgba(16,24,40,.10)', padding: '8px 11px', zIndex: 5, whiteSpace: 'nowrap',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#171B26', marginBottom: 3 }}>
                      {new Date(m.month + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
                    </div>
                    <div style={{ fontSize: 11, color: '#616875' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SERIES.newCars.color, marginRight: 5 }} />
                      New cars <b style={{ color: '#171B26' }}>{m.newCars}</b>
                    </div>
                    <div style={{ fontSize: 11, color: '#616875' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SERIES.delivered.color, marginRight: 5 }} />
                      Delivered <b style={{ color: '#171B26' }}>{m.delivered}</b>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* x labels */}
      <div style={{ display: 'flex', marginLeft: 26, marginTop: 6 }}>
        {monthly.map((m, i) => (
          <span key={m.month} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: '#98A0AC' }}>
            {monthly.length > 14 && i % 2 === 1 ? '' : monthLabel(m.month)}
          </span>
        ))}
      </div>
    </div>
  );
}

async function downloadCsv(path: string, filename: string) {
  try {
    const res = await api.get(path, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    message.error('Export failed — admin role required');
  }
}

function SagePanel() {
  const qc = useQueryClient();
  const { data: sage } = useQuery({
    queryKey: ['sage-status'],
    queryFn: () => api.get('/api/accounting/status').then((r) => r.data),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('sage') === 'connected') {
      message.success('Sage connected');
      qc.invalidateQueries({ queryKey: ['sage-status'] });
      window.history.replaceState(null, '', '/reports');
    } else if (params.get('sage') === 'error') {
      message.error(`Sage: ${params.get('message') ?? 'connection failed'}`);
      window.history.replaceState(null, '', '/reports');
    }
  }, [qc]);

  const connect = useMutation({
    mutationFn: () => api.get('/api/accounting/sage/connect').then((r) => r.data),
    onSuccess: (d) => { window.location.href = d.url; },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Sage is not configured yet'),
  });

  const sync = useMutation({
    mutationFn: () => api.post('/api/accounting/sage/sync').then((r) => r.data),
    onSuccess: (r) => {
      message.success(`Pushed ${r.invoicesPushed} invoices, ${r.paymentsPushed} payments${r.errors.length ? ` — ${r.errors.length} errors` : ''}`);
      if (r.errors.length) r.errors.forEach((e: string) => message.warning(e, 6));
      qc.invalidateQueries({ queryKey: ['sage-status'] });
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Sync failed'),
  });

  if (!sage) return null;
  const stateColor = sage.connected ? '#067647' : sage.configured ? '#C13A26' : '#98A0AC';
  const stateLabel = sage.connected
    ? `Connected${sage.businessName ? ` — ${sage.businessName}` : ''}`
    : sage.configured ? 'Configured, not connected' : 'Not configured';

  return (
    <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }}
      title={<Text style={{ fontSize: 10, fontWeight: 700, color: '#98A0AC', textTransform: 'uppercase', letterSpacing: 1.2 }}><ApiOutlined /> Sage accounting</Text>}
      extra={
        <Space size={6}>
          {!sage.connected && (
            <Button size="small" icon={<ApiOutlined />} loading={connect.isPending}
              style={{ color: '#C13A26', background: '#FDEDE9', borderColor: '#F6C9BE', fontWeight: 600 }}
              onClick={() => connect.mutate()}>
              Connect Sage
            </Button>
          )}
          {sage.connected && (
            <Button size="small" icon={<CloudSyncOutlined />} loading={sync.isPending}
              style={{ color: '#C13A26', background: '#FDEDE9', borderColor: '#F6C9BE', fontWeight: 600 }}
              onClick={() => sync.mutate()}>
              Sync now
            </Button>
          )}
        </Space>
      }>
      <Space direction="vertical" size={4}>
        <Text style={{ fontSize: 13, fontWeight: 700, color: stateColor }}>● {stateLabel}</Text>
        <Text style={{ fontSize: 12, color: '#616875' }}>
          Waiting to push: {sage.unsyncedInvoices} invoice{sage.unsyncedInvoices === 1 ? '' : 's'}, {sage.unsyncedPayments} payment{sage.unsyncedPayments === 1 ? '' : 's'}
        </Text>
        <Text style={{ fontSize: 11, color: '#98A0AC' }}>{sage.note}</Text>
      </Space>
    </Card>
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const [months, setMonths] = useState(12);
  const { data, isLoading } = useQuery({
    queryKey: ['reports-summary', months],
    queryFn: () => api.get('/api/reports/summary', { params: { months } }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  if (isLoading || !data)
    return <AppShell><div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spin /></div></AppShell>;

  const currencies = Object.entries(data.money ?? {}) as Array<[string, { invoiced: number; received: number; balance: number }]>;

  return (
    <AppShell>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 700, color: '#171B26', letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>Reports</div>
            <div style={{ fontSize: 12, color: '#98A0AC', marginTop: 2 }}>Month-on-month performance overview</div>
          </div>
          <Space size={8}>
            <Select
              value={months}
              onChange={setMonths}
              style={{ width: 150 }}
              options={[
                { value: 3, label: 'Last 3 months' },
                { value: 6, label: 'Last 6 months' },
                { value: 12, label: 'Last 12 months' },
                { value: 24, label: 'Last 24 months' },
              ]}
            />
            <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadCsv('/api/accounting/invoices.csv', 'pod-invoices.csv')}>
              Invoices CSV
            </Button>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadCsv('/api/accounting/payments.csv', 'pod-payments.csv')}>
              Payments CSV
            </Button>
          </Space>
        </div>

        {/* Funnel tiles */}
        <Row gutter={[12, 12]}>
          <Col xs={12} md={5}><Tile icon={<PlusCircleOutlined />} label="New cars" value={data.funnel.newCars} accent="#1D4ED8" tint="#E9F0FE" hint="in period" /></Col>
          <Col xs={12} md={5}><Tile icon={<CheckCircleOutlined />} label="Delivered" value={data.funnel.delivered} accent="#067647" tint="#E6F6EE" hint="in period" /></Col>
          <Col xs={12} md={5}><Tile icon={<CarOutlined />} label="In progress" value={data.funnel.inProgress} accent="#101828" tint="#F1F2F0" /></Col>
          <Col xs={12} md={4}><Tile icon={<CloseCircleOutlined />} label="Lost" value={data.funnel.lost} accent="#B42318" tint="#FEECEB" /></Col>
          <Col xs={12} md={5}>
            <Tile icon={<PercentageOutlined />} label="Conversion" accent="#5B3FD4" tint="#F1EEFE"
              value={data.funnel.conversionRate === null ? '—' : `${data.funnel.conversionRate}%`}
              hint="new → delivered" />
          </Col>
        </Row>

        {/* Month-on-month chart */}
        <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: '18px 20px 14px' } }}
          title={<Text style={{ fontSize: 10, fontWeight: 700, color: '#98A0AC', textTransform: 'uppercase', letterSpacing: 1.2 }}>Month-on-month breakdown</Text>}>
          <MonthChart monthly={data.monthly} />
        </Card>

        {/* Monthly detail */}
        <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }}
          title={<Text style={{ fontSize: 10, fontWeight: 700, color: '#98A0AC', textTransform: 'uppercase', letterSpacing: 1.2 }}>Monthly detail</Text>}>
          <Table
            size="small"
            pagination={false}
            rowKey="month"
            dataSource={[...data.monthly].reverse().filter((m: any) => m.newCars || m.delivered || Object.keys(m.received).length)}
            columns={[
              { title: 'Month', dataIndex: 'month', render: (v: string) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{new Date(v + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</Text> },
              { title: 'New cars', dataIndex: 'newCars', align: 'right' as const, render: (v: number) => <Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{v}</Text> },
              { title: 'Delivered', dataIndex: 'delivered', align: 'right' as const, render: (v: number) => <Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#067647', fontWeight: 600 }}>{v}</Text> },
              { title: 'Invoiced', dataIndex: 'invoiced', align: 'right' as const, render: (v: any) => <Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(v)}</Text> },
              { title: 'Received', dataIndex: 'received', align: 'right' as const, render: (v: any) => <Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#067647', fontWeight: 600 }}>{fmtMoney(v)}</Text> },
            ]}
          />
        </Card>

        {/* Team performance */}
        <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }}
          title={<Text style={{ fontSize: 10, fontWeight: 700, color: '#98A0AC', textTransform: 'uppercase', letterSpacing: 1.2 }}>Team performance · per consultant</Text>}>
          <Table
            size="small"
            pagination={false}
            rowKey="name"
            dataSource={data.teamPerformance}
            columns={[
              { title: 'Consultant', dataIndex: 'name', render: (v: string) => <Text style={{ fontSize: 12.5, fontWeight: 600, color: v === 'Unassigned' ? '#98A0AC' : '#171B26' }}>{v}</Text> },
              { title: 'Cars', dataIndex: 'cars', align: 'right' as const, render: (v: number) => <Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{v}</Text> },
              { title: 'Delivered', dataIndex: 'delivered', align: 'right' as const, render: (v: number) => <Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#067647', fontWeight: 600 }}>{v}</Text> },
              { title: 'Invoiced', dataIndex: 'invoiced', align: 'right' as const, render: (v: any) => <Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(v)}</Text> },
              { title: 'Received', dataIndex: 'received', align: 'right' as const, render: (v: any) => <Text style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: '#067647', fontWeight: 600 }}>{fmtMoney(v)}</Text> },
            ]}
          />
        </Card>

        {hasRole('ADMIN') && <SagePanel />}

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}><BarList title="Cars by stage" items={data.byStage} /></Col>
          <Col xs={24} md={12}><BarList title="By destination" items={data.byCountry} /></Col>
        </Row>

        {/* Money per currency */}
        <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }}
          title={<Text style={{ fontSize: 10, fontWeight: 700, color: '#98A0AC', textTransform: 'uppercase', letterSpacing: 1.2 }}>Money by currency · all time</Text>}>
          <Table
            size="small"
            pagination={false}
            rowKey={(r: any) => r.ccy}
            dataSource={currencies.map(([ccy, m]) => ({ ccy, ...m }))}
            columns={[
              { title: 'Currency', dataIndex: 'ccy', render: (v: string) => <Text style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#171B26', fontSize: 12 }}>{v}</Text> },
              { title: 'Invoiced', dataIndex: 'invoiced', align: 'right' as const, render: (v: number) => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{v.toLocaleString()}</Text> },
              { title: 'Received', dataIndex: 'received', align: 'right' as const, render: (v: number) => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: '#067647', fontWeight: 600 }}>{v.toLocaleString()}</Text> },
              { title: 'Balance', dataIndex: 'balance', align: 'right' as const, render: (v: number) => <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: v > 0 ? '#B42318' : '#067647', fontWeight: 700 }}>{v.toLocaleString()}</Text> },
            ]}
          />
        </Card>

        {/* Stalled deals */}
        <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }}
          title={<Text style={{ fontSize: 10, fontWeight: 700, color: '#C13A26', textTransform: 'uppercase', letterSpacing: 1.2 }}>⏱ Stalled — no movement in {data.totals.stalledDays}+ days</Text>}>
          {data.stalled.length ? (
            <Table
              size="small"
              pagination={false}
              rowKey="id"
              dataSource={data.stalled}
              onRow={(r: any) => ({ onClick: () => router.push(`/deals/${r.id}`), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'Reference', dataIndex: 'reference', render: (v: string) => <Text style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#171B26', fontWeight: 700 }}>{v}</Text> },
                { title: 'Customer', dataIndex: 'client', render: (v: string) => <Text style={{ fontSize: 12, fontWeight: 600 }}>{v}</Text> },
                { title: 'Stage', dataIndex: 'stage', render: (v: string) => <Text style={{ fontSize: 12, color: '#616875' }}>{v}</Text> },
                { title: 'Idle', dataIndex: 'days', align: 'right' as const, render: (v: number) => <Text style={{ fontSize: 12, color: '#C13A26', fontWeight: 700 }}>{v} days</Text> },
              ]}
            />
          ) : (
            <Text style={{ fontSize: 12, color: '#067647', fontWeight: 500 }}>✓ Nothing stalled — every car has moved recently.</Text>
          )}
        </Card>
      </Space>
    </AppShell>
  );
}
