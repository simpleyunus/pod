'use client';

import {
  CheckCircleOutlined, CloseCircleOutlined, PlusOutlined, SafetyOutlined,
  StopOutlined, ThunderboltOutlined, TruckOutlined,
} from '@ant-design/icons';
import {
  Alert, Button, Card, Col, Drawer, Empty, Form, Input, InputNumber, Modal,
  Row, Select, Table, Tabs, Typography, message,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../_lib/api';
import { hasRole } from '../_lib/auth';
import {
  useAssets, useCarriers, useDrivers, useFleetMutation, useMassSummary, useTrips,
} from '../_lib/hooks/useFleet';
import { useDeals } from '../_lib/hooks/useDeals';
import { useLocations } from '../_lib/hooks/useReference';
import RagTag, { KpiCard, PageHeader } from '../_components/RagTag';
import PodCapture from './PodCapture';

const { Text } = Typography;
const fmtDate = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

// The gate result, shown as the reason list an operator can act on rather than
// a single red flag.
function GateChecks({ checks }: { checks: any[] }) {
  if (!checks?.length) return <Text style={{ fontSize: 12, color: '#98A0AC' }}>Gate not yet run.</Text>;
  const failed = checks.filter((c) => !c.passed);
  return (
    <div>
      {failed.length > 0 && (
        <div style={{
          fontSize: 11, fontWeight: 700, color: '#B42318', textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: 8,
        }}>
          {failed.length} check{failed.length === 1 ? '' : 's'} blocking departure
        </div>
      )}
      {[...failed, ...checks.filter((c) => c.passed)].map((c) => (
        <div
          key={c.code}
          style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '5px 0' }}
        >
          {c.passed
            ? <CheckCircleOutlined style={{ color: '#12B76A', fontSize: 14, marginTop: 2, flexShrink: 0 }} />
            : <CloseCircleOutlined style={{ color: '#F04438', fontSize: 14, marginTop: 2, flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <Text style={{ fontSize: 12.5, color: c.passed ? '#616875' : '#171B26', fontWeight: c.passed ? 400 : 600 }}>
              {c.label}
            </Text>
            {c.detail && (
              <div style={{ fontSize: 11.5, color: c.passed ? '#98A0AC' : '#B42318', marginTop: 1 }}>{c.detail}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TripsClient() {
  const { data: trips = [], isLoading } = useTrips();
  const [createOpen, setCreateOpen] = useState(false);
  const [gateTrip, setGateTrip] = useState<any>(null);
  const [podTrip, setPodTrip] = useState<any>(null);
  const [massTrip, setMassTrip] = useState<any>(null);
  const canEdit = hasRole('CONSULTANT');

  const blocked = trips.filter((t: any) => t.gateDecision === 'FAIL').length;
  const overridden = trips.filter((t: any) => t.gateDecision === 'OVERRIDDEN').length;
  const inProgress = trips.filter((t: any) => t.status?.code === 'IN_PROGRESS').length;

  return (
    <>
      <PageHeader
        title="Trips"
        subtitle="Every trip is checked against driver, vehicle, fatigue and load compliance before it may depart"
        extra={
          canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} style={{ borderRadius: 10 }}>
              Plan trip
            </Button>
          )
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
        <Col xs={12} md={6}><KpiCard icon={<TruckOutlined />} label="Trips" value={trips.length} accent="#101828" tint="#F1F2F0" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ThunderboltOutlined />} label="In progress" value={inProgress} accent="#1D4ED8" tint="#E9F0FE" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<StopOutlined />} label="Blocked by gate" value={blocked} accent="#B42318" tint="#FEE4E2" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<SafetyOutlined />} label="Overridden" value={overridden} accent="#5B3FD4" tint="#F1EEFE" /></Col>
      </Row>

      <Tabs
        items={[
          {
            key: 'board', label: 'Assignment board',
            children: (
              <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
                <Table
                  rowKey="id" loading={isLoading} dataSource={trips}
                  pagination={{ pageSize: 20, hideOnSinglePage: true }} scroll={{ x: 'max-content' }}
                  locale={{ emptyText: <Empty description="No trips planned yet" /> }}
                  expandable={{
                    expandedRowRender: (r: any) => (
                      <div style={{ padding: '4px 8px 8px' }}>
                        <GateChecks checks={r.gateChecks} />
                        {r.gateOverrideReason && (
                          <Alert
                            type="warning" showIcon style={{ marginTop: 12, borderRadius: 10 }}
                            message="Gate overridden"
                            description={r.gateOverrideReason}
                          />
                        )}
                      </div>
                    ),
                  }}
                  columns={[
                    { title: 'Trip', dataIndex: 'reference', render: (v) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
                    {
                      title: 'Car', render: (_: any, r: any) => r.deal
                        ? <span>{r.deal.make} {r.deal.model}<div style={{ fontSize: 11, color: '#98A0AC' }}>{r.deal.reference}</div></span>
                        : <Text style={{ color: '#98A0AC' }}>—</Text>,
                    },
                    { title: 'Vehicle', render: (_: any, r: any) => `${r.asset.fleetNo} · ${r.asset.registrationNo}` },
                    { title: 'Driver', render: (_: any, r: any) => `${r.driver.firstName} ${r.driver.surname}` },
                    { title: 'Carrier', dataIndex: ['carrier', 'name'], render: (v) => v ?? 'Own fleet' },
                    { title: 'Departs', dataIndex: 'plannedDepartureAt', render: (v) => fmtDate(v) },
                    {
                      title: 'Load', render: (_: any, r: any) => {
                        const m = r.massRecords?.[0];
                        if (!m) return <Text style={{ color: '#98A0AC' }}>not weighed</Text>;
                        // R3 records mass OR passengers in one column.
                        const label = m.massLoadedKg !== null
                          ? `${(m.massLoadedKg / 1000).toFixed(1)} t`
                          : `${m.passengersLoaded} pax`;
                        return (
                          <span style={{ fontVariantNumeric: 'tabular-nums', color: m.overloaded ? '#B42318' : '#616875', fontWeight: m.overloaded ? 600 : 400 }}>
                            {label}
                            {m.overloaded && <div style={{ fontSize: 10.5 }}>OVERLOADED</div>}
                          </span>
                        );
                      },
                    },
                    { title: 'Status', dataIndex: ['status', 'name'], render: (v, r: any) => <RagTag status={r.status.isTerminal ? 'GREEN' : 'NEUTRAL'} label={v} /> },
                    {
                      title: 'Gate', dataIndex: 'gateDecision',
                      render: (v, r: any) => v
                        ? <RagTag status={v} label={v === 'FAIL' ? `${r.gateFailures} blocking` : v} />
                        : '—',
                    },
                    {
                      title: '', align: 'right' as const,
                      render: (_: any, r: any) => canEdit && (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <Button size="small" style={{ borderRadius: 8 }} onClick={() => setMassTrip(r)}>Weigh</Button>
                          {!r.actualDepartureAt && (
                            <Button size="small" type="primary" style={{ borderRadius: 8 }} onClick={() => setGateTrip(r)}>Start</Button>
                          )}
                          {r.actualDepartureAt && !r.podCapturedAt && (
                            <Button size="small" type="primary" style={{ borderRadius: 8 }} onClick={() => setPodTrip(r)}>POD</Button>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          { key: 'mass', label: 'Load management', children: <MassTab /> },
        ]}
      />

      <CreateTripDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
      <StartTripModal trip={gateTrip} onClose={() => setGateTrip(null)} />
      <MassModal trip={massTrip} onClose={() => setMassTrip(null)} />
      <PodCapture open={!!podTrip} trip={podTrip} onClose={() => setPodTrip(null)} />
    </>
  );
}

// Departure. The gate is re-evaluated when the dialog opens, so the operator
// acts on the current position rather than whatever was cached when the trip
// was planned — a licence can have expired since.
function StartTripModal({ trip, onClose }: { trip: any; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const canOverride = hasRole('ADMIN');

  const { data: gate, isLoading } = useQuery({
    queryKey: ['trip', trip?.id, 'gate'],
    queryFn: () => api.get(`/api/trips/${trip.id}/gate`).then((r) => r.data),
    enabled: !!trip?.id,
    staleTime: 0,
  });

  const start = useFleetMutation((body: any) => api.post(`/api/trips/${trip.id}/start`, body).then((r) => r.data));

  const checks = gate?.checks ?? trip?.gateChecks ?? [];
  const blocked = gate ? !gate.passed : checks.some((c: any) => !c.passed);

  return (
    <Modal
      open={!!trip}
      onCancel={onClose}
      title={`Start ${trip?.reference ?? ''}`}
      width={560}
      footer={[
        <Button key="c" onClick={onClose} style={{ borderRadius: 10 }}>Cancel</Button>,
        <Button
          key="s"
          type="primary"
          danger={blocked}
          loading={start.isPending}
          disabled={isLoading || (blocked && (!canOverride || reason.trim().length < 10))}
          style={{ borderRadius: 10 }}
          onClick={() =>
            start.mutate(blocked ? { overrideReason: reason } : {}, {
              onSuccess: () => { message.success(blocked ? 'Departed under override' : 'Trip started'); setReason(''); onClose(); },
              onError: (e: any) => {
                const d = e.response?.data;
                message.error(d?.message ?? 'Could not start the trip');
              },
            })
          }
        >
          {blocked ? 'Override and depart' : 'Start trip'}
        </Button>,
      ]}
    >
      <div style={{ marginTop: 12 }}>
        {isLoading ? <Text style={{ fontSize: 12, color: '#98A0AC' }}>Running compliance checks…</Text> : <GateChecks checks={checks} />}

        {blocked && (
          <div style={{ marginTop: 16 }}>
            {canOverride ? (
              <>
                <Alert
                  type="error" showIcon style={{ borderRadius: 10, marginBottom: 12 }}
                  message="This trip fails its compliance checks"
                  description="An override is recorded against these exact failures, with your name and reason, and appears in the audit pack."
                />
                <Input.TextArea
                  rows={3}
                  placeholder="Why is this trip going out anyway? (at least 10 characters)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </>
            ) : (
              <Alert
                type="error" showIcon style={{ borderRadius: 10 }}
                message="Departure blocked"
                description="Only an admin can override the compliance gate."
              />
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function MassModal({ trip, onClose }: { trip: any; onClose: () => void }) {
  const [form] = Form.useForm();
  const record = useFleetMutation((body: any) => api.post(`/api/trips/${trip.id}/mass`, body).then((r) => r.data));
  const max = trip?.asset?.maxLoadingMassKg;

  return (
    <Modal
      open={!!trip} onCancel={onClose} onOk={() => form.submit()} confirmLoading={record.isPending}
      title={`Record load — ${trip?.reference ?? ''}`} okText="Record"
    >
      <Form
        form={form} layout="vertical" style={{ marginTop: 16 }}
        onFinish={(values) =>
          record.mutate(values, {
            onSuccess: (r: any) => {
              message[r.overloaded ? 'warning' : 'success'](
                r.overloaded ? 'Recorded — OVERLOADED' : 'Load recorded',
              );
              form.resetFields();
              onClose();
            },
            onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not record the load'),
          })
        }
      >
        {/* R3 has one column, "Mass Loaded/Passengers Loaded" — record either. */}
        <Form.Item
          name="massLoadedKg" label="Mass loaded (kg)"
          extra={max ? `Maximum loading mass for this vehicle is ${(max / 1000).toLocaleString()} tonne.` : undefined}
        >
          <InputNumber style={{ width: '100%' }} min={0} />
        </Form.Item>
        <Form.Item name="passengersLoaded" label="or passengers loaded">
          <InputNumber style={{ width: '100%' }} min={0} />
        </Form.Item>
        <Form.Item name="comments" label="Comments"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  );
}

function CreateTripDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { data: assets = [] } = useAssets();
  const { data: drivers = [] } = useDrivers();
  const { data: carriers = [] } = useCarriers();
  const { data: locations = [] } = useLocations();
  const { data: deals } = useDeals({ pageSize: 100 });
  const create = useFleetMutation((values: any) => api.post('/api/trips', values).then((r) => r.data));

  return (
    <Drawer
      title="Plan trip" open={open} onClose={onClose} size={460}
      extra={<Button type="primary" loading={create.isPending} onClick={() => form.submit()} style={{ borderRadius: 10 }}>Plan</Button>}
    >
      <Form
        form={form} layout="vertical"
        onFinish={(values) =>
          create.mutate(values, {
            onSuccess: (r: any) => {
              message[r.gateDecision === 'PASS' ? 'success' : 'warning'](
                r.gateDecision === 'PASS' ? `${r.reference} planned — gate clear` : `${r.reference} planned — gate is blocking, open the row to see why`,
              );
              form.resetFields();
              onClose();
            },
            onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not plan the trip'),
          })
        }
      >
        <Form.Item name="assetId" label="Vehicle" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label"
            options={assets.map((a: any) => ({ value: a.id, label: `${a.code} · ${a.registrationNo}` }))} />
        </Form.Item>
        <Form.Item name="driverId" label="Driver" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label"
            options={drivers.map((d: any) => ({ value: d.id, label: d.fullName }))} />
        </Form.Item>
        <Form.Item name="dealId" label="Car being moved" extra="Links this trip to a deal on the board.">
          <Select allowClear showSearch optionFilterProp="label"
            options={(deals?.items ?? []).map((d: any) => ({ value: d.id, label: `${d.reference} · ${d.make} ${d.model}` }))} />
        </Form.Item>
        <Form.Item name="carrierId" label="External carrier">
          <Select allowClear options={carriers.map((c: any) => ({ value: c.id, label: c.name }))} />
        </Form.Item>
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="originLocationId" label="From">
              <Select allowClear options={locations?.map((l: any) => ({ value: l.id, label: l.name })) ?? []} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="destinationLocationId" label="To">
              <Select allowClear options={locations?.map((l: any) => ({ value: l.id, label: l.name })) ?? []} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="distanceKm" label="Distance (km)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
      </Form>
    </Drawer>
  );
}

function MassTab() {
  const { data, isLoading } = useMassSummary(12);
  if (isLoading) return <Card loading style={{ borderRadius: 14 }} />;
  const monthly = data?.monthly ?? [];
  const worst = Math.max(1, ...monthly.map((m: any) => m.overloadingPct));

  return (
    <>
      <Card
        size="small"
        title={<Text style={{ fontSize: 10, fontWeight: 700, color: '#98A0AC', textTransform: 'uppercase', letterSpacing: 1.2 }}>Monthly overloading rate</Text>}
        style={{ borderRadius: 14, border: '1px solid #E9E9E4', marginBottom: 12 }}
      >
        {monthly.length ? monthly.map((m: any) => (
          <div key={m.month} style={{ marginBottom: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text style={{ fontSize: 12, color: '#3A4150' }}>{m.month}</Text>
              <Text style={{ fontSize: 12, color: m.overloaded ? '#B42318' : '#616875', fontVariantNumeric: 'tabular-nums' }}>
                {m.overloadingPct}% · {m.overloaded}/{m.total} trips
              </Text>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: '#EFEFEA', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(m.overloadingPct / worst) * 100}%`, borderRadius: 99, background: m.overloaded ? '#F04438' : '#12B76A' }} />
            </div>
          </div>
        )) : <Text style={{ fontSize: 12, color: '#98A0AC' }}>No trips weighed yet.</Text>}
      </Card>

      <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id" dataSource={data?.records ?? []} pagination={{ pageSize: 15, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }} locale={{ emptyText: 'No mass records' }}
          columns={[
            // R3 Trip Mass Record columns.
            { title: 'Date', dataIndex: 'date', render: (v) => new Date(v).toLocaleDateString('en-GB') },
            { title: 'Vehicle reg no', dataIndex: ['asset', 'registrationNo'] },
            {
              title: 'Mass loaded / passengers loaded', align: 'right' as const,
              render: (_: any, r: any) => r.massLoadedKg !== null
                ? `${(r.massLoadedKg / 1000).toFixed(1)} tonne`
                : `${r.passengersLoaded} passengers`,
            },
            { title: 'Overloaded (Yes/No)', dataIndex: 'overloaded', render: (v) => <RagTag status={v ? 'FAIL' : 'PASS'} label={v ? 'Yes' : 'No'} /> },
            { title: 'Trip', dataIndex: ['assignment', 'reference'] },
          ]}
        />
      </Card>
    </>
  );
}
