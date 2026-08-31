'use client';

import {
  CheckCircleOutlined, ClockCircleOutlined, ExportOutlined,
  FilePdfOutlined, SafetyCertificateOutlined, WarningOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Empty, Row, Segmented, Spin, Table, Tabs, Typography, message } from 'antd';
import { useState } from 'react';
import api from '../_lib/api';
import { hasRole } from '../_lib/auth';
import {
  useAuditPacks, useComplianceDashboard, useComplianceItems, useFleetMutation,
  usePolicies, useRiskAssessments, useRoutes,
} from '../_lib/hooks/useFleet';
import RagTag, { KpiCard, PageHeader } from '../_components/RagTag';

const { Text } = Typography;

const RAG_BORDER: Record<string, string> = { GREEN: '#12B76A', AMBER: '#F59E0B', RED: '#F04438' };

const fmtDate = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

// One card per RTMS element — the auditor's mental model, so the dashboard is
// laid out the way the standard is written rather than by our table names.
function ElementCard({ el }: { el: any }) {
  return (
    <Card
      size="small"
      style={{
        borderRadius: 14,
        border: '1px solid #E9E9E4',
        borderLeft: `3px solid ${RAG_BORDER[el.rag] ?? '#E9E9E4'}`,
        height: '100%',
      }}
      styles={{ body: { padding: '13px 15px' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9.5, color: '#98A0AC', fontWeight: 700, letterSpacing: '0.08em' }}>
            ELEMENT {el.number}
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#171B26', marginTop: 2 }}>{el.label}</div>
        </div>
        <RagTag status={el.rag} />
      </div>

      {el.counts.total > 0 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 11, color: '#616875' }}>
          <span>{el.counts.VALID} valid</span>
          {el.counts.DUE_SOON > 0 && <span style={{ color: '#9A6208' }}>{el.counts.DUE_SOON} due soon</span>}
          {el.counts.EXPIRED > 0 && <span style={{ color: '#B42318', fontWeight: 600 }}>{el.counts.EXPIRED} expired</span>}
        </div>
      )}

      {el.findings.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid #F1F1EC', paddingTop: 8 }}>
          {el.findings.map((f: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0' }}>
              <a
                href={f.link ?? '#'}
                style={{ fontSize: 11.5, color: f.rag === 'GREEN' ? '#616875' : '#171B26', textDecoration: 'none' }}
              >
                {f.label}
              </a>
              <RagTag status={f.rag} label={String(f.count)} dot={false} size="sm" />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function ComplianceClient() {
  const [tab, setTab] = useState('overview');
  const { data, isLoading } = useComplianceDashboard();
  const canExport = hasRole('CONSULTANT');

  const exportPack = useFleetMutation(
    () => api.post('/api/compliance/audit-packs', {}).then((r) => r.data),
    [['compliance', 'audit-packs']],
  );

  if (isLoading) {
    return <div style={{ padding: 60, textAlign: 'center' }}><Spin /></div>;
  }
  if (!data) return <Empty description="Compliance data unavailable" />;

  return (
    <>
      <PageHeader
        title="Compliance"
        subtitle={`RTMS · SANS 1395 · eight elements · generated ${new Date(data.generatedAt).toLocaleString('en-GB')}`}
        extra={
          canExport && (
            <Button
              type="primary"
              icon={<ExportOutlined />}
              loading={exportPack.isPending}
              onClick={() =>
                exportPack.mutate(undefined as any, {
                  onSuccess: () => {
                    message.success('Audit pack requested — it will appear under Audit packs when ready');
                    setTab('packs');
                  },
                  onError: () => message.error('Could not start the audit pack'),
                })
              }
              style={{ borderRadius: 10 }}
            >
              Export audit pack
            </Button>
          )
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
        <Col xs={12} md={6}>
          <KpiCard
            icon={<SafetyCertificateOutlined />}
            label="Overall position"
            value={<RagTag status={data.overall} />}
            accent={data.overall === 'RED' ? '#B42318' : data.overall === 'AMBER' ? '#9A6208' : '#067647'}
            tint={data.overall === 'RED' ? '#FEE4E2' : data.overall === 'AMBER' ? '#FCF3E1' : '#E6F6EE'}
          />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard icon={<CheckCircleOutlined />} label="Items valid" value={`${data.compliancePct}%`} accent="#067647" tint="#E6F6EE" hint={`${data.totals.VALID}/${data.totals.total}`} />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard icon={<ClockCircleOutlined />} label="Due soon" value={data.totals.DUE_SOON} accent="#9A6208" tint="#FCF3E1" />
        </Col>
        <Col xs={12} md={6}>
          <KpiCard icon={<WarningOutlined />} label="Expired" value={data.totals.EXPIRED} accent="#B42318" tint="#FEE4E2" />
        </Col>
      </Row>

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'overview',
            label: 'By RTMS element',
            children: (
              <Row gutter={[12, 12]}>
                {data.elements.map((el: any) => (
                  <Col xs={24} sm={12} lg={6} key={el.element}>
                    <ElementCard el={el} />
                  </Col>
                ))}
              </Row>
            ),
          },
          { key: 'items', label: `Expiring (${data.totals.DUE_SOON + data.totals.EXPIRED})`, children: <ItemsTab /> },
          { key: 'policies', label: 'Policies', children: <PoliciesTab /> },
          { key: 'risk', label: 'Risk', children: <RiskTab /> },
          { key: 'routes', label: 'Routes', children: <RoutesTab /> },
          { key: 'packs', label: 'Audit packs', children: <PacksTab /> },
        ]}
      />
    </>
  );
}

function ItemsTab() {
  const [filter, setFilter] = useState<string>('ATTENTION');
  const { data = [], isLoading } = useComplianceItems(
    filter === 'ALL' || filter === 'ATTENTION' ? {} : { status: filter },
  );
  const rows = filter === 'ATTENTION' ? data.filter((i: any) => i.status !== 'VALID') : data;

  return (
    <>
      <Segmented
        value={filter}
        onChange={(v) => setFilter(v as string)}
        options={[
          { label: 'Needs attention', value: 'ATTENTION' },
          { label: 'Expired', value: 'EXPIRED' },
          { label: 'Due soon', value: 'DUE_SOON' },
          { label: 'All', value: 'ALL' },
        ]}
        style={{ marginBottom: 14 }}
      />
      <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={rows}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
          columns={[
            {
              title: 'Document', dataIndex: ['kind', 'name'],
              render: (v, r: any) => (
                <span>
                  <Text strong style={{ fontSize: 13 }}>{v}</Text>
                  {r.kind?.requiredForOperation && (
                    <span style={{ marginLeft: 8 }}><RagTag status="NEUTRAL" label="blocks trips" dot={false} size="sm" /></span>
                  )}
                </span>
              ),
            },
            { title: 'Belongs to', render: (_: any, r: any) => r.asset ? `${r.asset.code} · ${r.asset.registrationNo}` : r.driver?.fullName ?? '—' },
            { title: 'Reference', dataIndex: 'reference', render: (v) => v ?? '—' },
            { title: 'Expires', dataIndex: 'expiresOn', render: (v) => fmtDate(v) },
            {
              title: 'Days', dataIndex: 'daysUntilExpiry', align: 'right' as const,
              render: (v: number | null) => v === null ? '—' : (
                <Text style={{ fontVariantNumeric: 'tabular-nums', color: v < 0 ? '#B42318' : v < 30 ? '#9A6208' : '#616875' }}>{v}</Text>
              ),
            },
            { title: 'Status', dataIndex: 'status', render: (v) => <RagTag status={v} /> },
          ]}
        />
      </Card>
    </>
  );
}

function PoliciesTab() {
  const { data = [], isLoading } = usePolicies();
  return (
    <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="id" loading={isLoading} dataSource={data} pagination={false} scroll={{ x: 'max-content' }}
        expandable={{ expandedRowRender: (r: any) => <Text style={{ fontSize: 12.5, color: '#3A4150' }}>{r.body}</Text> }}
        columns={[
          { title: 'Policy', dataIndex: 'title', render: (v) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
          { title: 'Code', dataIndex: 'code' },
          { title: 'Version', dataIndex: 'version', align: 'right' as const, render: (v) => `v${v}` },
          { title: 'Effective from', dataIndex: 'effectiveFrom', render: (v) => fmtDate(v) },
          { title: 'Acknowledgements', align: 'right' as const, render: (_: any, r: any) => r._count?.acknowledgements ?? 0 },
        ]}
      />
    </Card>
  );
}

function RiskTab() {
  const { data = [], isLoading } = useRiskAssessments();
  if (!isLoading && !data.length) {
    return <Empty description="No risk assessments on file — element 2 stays red until at least one exists" />;
  }
  return (
    <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="id" loading={isLoading} dataSource={data} pagination={false} scroll={{ x: 'max-content' }}
        expandable={{
          expandedRowRender: (r: any) => (
            <Table
              rowKey="id" size="small" pagination={false} dataSource={r.hazards}
              columns={[
                { title: 'Hazard', dataIndex: 'description' },
                { title: 'L', dataIndex: 'likelihood', align: 'right' as const },
                { title: 'S', dataIndex: 'severity', align: 'right' as const },
                { title: 'Rating', dataIndex: 'riskRating', align: 'right' as const },
                { title: 'Controls', dataIndex: 'controls' },
                { title: 'Residual', dataIndex: 'residualRating', align: 'right' as const, render: (v) => v ?? '—' },
              ]}
            />
          ),
        }}
        columns={[
          { title: 'Assessment', dataIndex: 'title', render: (v) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
          { title: 'Assessed', dataIndex: 'assessedOn', render: (v) => fmtDate(v) },
          { title: 'Review due', dataIndex: 'reviewDueOn', render: (v) => fmtDate(v) },
          { title: 'Hazards', align: 'right' as const, render: (_: any, r: any) => r.hazards?.length ?? 0 },
        ]}
      />
    </Card>
  );
}

function RoutesTab() {
  const { data = [], isLoading } = useRoutes();
  if (!isLoading && !data.length) return <Empty description="No route risk assessments yet" />;
  return (
    <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="id" loading={isLoading} dataSource={data} pagination={false} scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Route', dataIndex: 'name', render: (v) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
          { title: 'Version', dataIndex: 'version', align: 'right' as const, render: (v) => `v${v}` },
          { title: 'Distance', dataIndex: 'distanceKm', align: 'right' as const, render: (v) => v ? `${v.toLocaleString()} km` : '—' },
          { title: 'Review due', dataIndex: 'reviewDueOn', render: (v) => fmtDate(v) },
          {
            title: 'Acknowledged (current version)',
            render: (_: any, r: any) => {
              const current = (r.acknowledgements ?? []).filter((a: any) => a.version === r.version);
              return current.length
                ? current.map((a: any) => a.driver.fullName).join(', ')
                : <RagTag status="AMBER" label="none" />;
            },
          },
        ]}
      />
    </Card>
  );
}

function PacksTab() {
  const { data = [], isLoading } = useAuditPacks();
  const open = async (id: string) => {
    const pack = await api.get(`/api/compliance/audit-packs/${id}`).then((r) => r.data);
    if (pack.file?.url) window.open(pack.file.url, '_blank');
    else message.info(`Pack is ${String(pack.status).toLowerCase()}`);
  };

  return (
    <>
      <Text style={{ fontSize: 12, color: '#98A0AC', display: 'block', marginBottom: 12 }}>
        Each pack renders the RTMS report set (R1–R17) through Gotenberg and merges it into one PDF.
      </Text>
      <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id" loading={isLoading} dataSource={data} pagination={false} scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="No audit packs yet — use Export audit pack" /> }}
          columns={[
            { title: 'Requested', dataIndex: 'requestedAt', render: (v) => new Date(v).toLocaleString('en-GB') },
            { title: 'Period', render: (_: any, r: any) => `${fmtDate(r.periodStart)} → ${fmtDate(r.periodEnd)}` },
            {
              title: 'Status', dataIndex: 'status',
              render: (v: string) => <RagTag status={v === 'READY' ? 'GREEN' : v === 'FAILED' ? 'RED' : 'AMBER'} label={v} />,
            },
            { title: 'Reports', align: 'right' as const, render: (_: any, r: any) => (r.reports ?? []).length || '—' },
            {
              title: '', align: 'right' as const,
              render: (_: any, r: any) => r.status === 'READY' ? (
                <Button size="small" icon={<FilePdfOutlined />} onClick={() => open(r.id)} style={{ borderRadius: 8 }}>
                  Open
                </Button>
              ) : r.status === 'FAILED' ? <Text type="danger" style={{ fontSize: 11 }}>{r.error}</Text> : <Spin size="small" />,
            },
          ]}
        />
      </Card>
    </>
  );
}
