'use client';

import { CheckSquareOutlined, PlusOutlined, ToolOutlined, WarningOutlined } from '@ant-design/icons';
import {
  Button, Card, Col, Drawer, Empty, Form, Input, InputNumber, Row, Select,
  Spin, Table, Tabs, Typography, message,
} from 'antd';
import { useState } from 'react';
import api from '../_lib/api';
import { hasRole } from '../_lib/auth';
import {
  useAssets, useFleetMutation, useInspections, useMaintenanceOverview, useWorkOrders,
} from '../_lib/hooks/useFleet';
import RagTag, { KpiCard, PageHeader } from '../_components/RagTag';
import InspectionForm from './InspectionForm';

const { Text } = Typography;
const fmtDate = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

const NEXT_STATUS: Record<string, { code: string; label: string }[]> = {
  REQUESTED: [{ code: 'APPROVED', label: 'Approve' }],
  APPROVED: [{ code: 'IN_PROGRESS', label: 'Start work' }],
  IN_PROGRESS: [{ code: 'AWAITING_PARTS', label: 'Awaiting parts' }, { code: 'DONE', label: 'Mark done' }],
  AWAITING_PARTS: [{ code: 'IN_PROGRESS', label: 'Resume' }, { code: 'DONE', label: 'Mark done' }],
  DONE: [{ code: 'CLOSED', label: 'Close' }],
};

export default function MaintenanceClient() {
  const { data, isLoading } = useMaintenanceOverview();
  const [inspectOpen, setInspectOpen] = useState(false);
  const [woOpen, setWoOpen] = useState(false);
  const canEdit = hasRole('CONSULTANT');

  if (isLoading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin /></div>;
  if (!data) return <Empty description="Maintenance data unavailable" />;

  return (
    <>
      <PageHeader
        title="Maintenance"
        subtitle="Service intervals run on km or months, whichever falls first"
        extra={
          canEdit && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<CheckSquareOutlined />} onClick={() => setInspectOpen(true)} style={{ borderRadius: 10 }}>
                Pre-trip inspection
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setWoOpen(true)} style={{ borderRadius: 10 }}>
                Raise work order
              </Button>
            </div>
          )
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Services overdue" value={data.overdueCount} accent="#B42318" tint="#FEE4E2" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ToolOutlined />} label="Open work orders" value={data.openWorkOrders.length} accent="#9A6208" tint="#FCF3E1" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckSquareOutlined />} label="Inspections (30 days)" value={data.inspectionsLast30Days} accent="#101828" tint="#F1F2F0" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Failed inspections" value={data.failedInspections.length} accent="#B42318" tint="#FEE4E2" /></Col>
      </Row>

      <Tabs
        items={[
          {
            key: 'due', label: `Service schedule (${data.servicesDue.length})`,
            children: (
              <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
                <Table
                  rowKey="planId" dataSource={data.servicesDue} pagination={false} scroll={{ x: 'max-content' }}
                  locale={{ emptyText: 'No maintenance plans configured' }}
                  columns={[
                    { title: 'Vehicle', render: (_: any, r: any) => <Text strong style={{ fontSize: 13 }}>{r.assetCode}</Text> },
                    { title: 'Registration', dataIndex: 'registrationNo' },
                    { title: 'Plan', dataIndex: 'name' },
                    { title: 'Odometer', dataIndex: 'odometerKm', align: 'right' as const, render: (v) => `${v.toLocaleString()} km` },
                    { title: 'Due at', dataIndex: 'nextDueOdoKm', align: 'right' as const, render: (v) => v ? `${v.toLocaleString()} km` : '—' },
                    {
                      title: 'km left', dataIndex: 'kmRemaining', align: 'right' as const,
                      render: (v: number | null) => v === null ? '—' : (
                        <Text style={{ fontVariantNumeric: 'tabular-nums', color: v <= 0 ? '#B42318' : v < 2500 ? '#9A6208' : '#616875' }}>
                          {v.toLocaleString()}
                        </Text>
                      ),
                    },
                    { title: 'Due date', dataIndex: 'nextDueDate', render: (v) => fmtDate(v) },
                    {
                      title: 'Status',
                      render: (_: any, r: any) => (
                        <RagTag status={r.overdue ? 'RED' : (r.kmRemaining !== null && r.kmRemaining < 2500) || (r.daysRemaining !== null && r.daysRemaining < 14) ? 'AMBER' : 'GREEN'}
                          label={r.overdue ? 'OVERDUE' : 'OK'} />
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          { key: 'wo', label: 'Work orders', children: <WorkOrdersTab /> },
          { key: 'insp', label: 'Inspections', children: <InspectionsTab /> },
        ]}
      />

      <InspectionForm open={inspectOpen} onClose={() => setInspectOpen(false)} />
      <WorkOrderDrawer open={woOpen} onClose={() => setWoOpen(false)} />
    </>
  );
}

function WorkOrdersTab() {
  const { data = [], isLoading } = useWorkOrders();
  const canEdit = hasRole('CONSULTANT');
  const transition = useFleetMutation(({ id, statusCode }: any) =>
    api.post(`/api/maintenance/work-orders/${id}/transition`, { statusCode }).then((r) => r.data),
  );

  return (
    <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="id" loading={isLoading} dataSource={data} pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'No work orders yet' }}
        columns={[
          { title: 'Job no', dataIndex: 'number', render: (v) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
          { title: 'Vehicle', dataIndex: ['asset', 'code'] },
          { title: 'Title', dataIndex: 'title' },
          { title: 'Raised', dataIndex: 'requestedAt', render: (v) => fmtDate(v) },
          {
            title: 'Cost', align: 'right' as const,
            render: (_: any, r: any) => {
              const total = Number(r.partsCost ?? 0) + Number(r.labourCost ?? 0);
              return total ? `${r.currency} ${total.toLocaleString()}` : '—';
            },
          },
          {
            title: 'Status', dataIndex: ['status', 'name'],
            render: (v, r: any) => <RagTag status={r.status.isTerminal ? 'GREEN' : 'AMBER'} label={v} />,
          },
          {
            title: '', align: 'right' as const,
            render: (_: any, r: any) =>
              canEdit && (NEXT_STATUS[r.status.code] ?? []).map((n) => (
                <Button
                  key={n.code} size="small" style={{ borderRadius: 8, marginLeft: 6 }}
                  loading={transition.isPending}
                  onClick={() =>
                    transition.mutate({ id: r.id, statusCode: n.code }, {
                      onSuccess: () => message.success(`${r.number} → ${n.label}`),
                      onError: (e: any) => message.error(e.response?.data?.message ?? 'Transition failed'),
                    })
                  }
                >
                  {n.label}
                </Button>
              )),
          },
        ]}
      />
    </Card>
  );
}

function InspectionsTab() {
  const { data = [], isLoading } = useInspections();
  return (
    <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="id" loading={isLoading} dataSource={data} pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'No inspections recorded' }}
        expandable={{
          expandedRowRender: (r: any) => (
            <Table
              rowKey="id" size="small" pagination={false}
              dataSource={r.results.filter((x: any) => x.outcome !== 'PASS')}
              locale={{ emptyText: 'All items passed' }}
              columns={[
                { title: 'Item', dataIndex: ['item', 'label'] },
                { title: 'Critical', dataIndex: ['item', 'critical'], render: (v) => v ? <RagTag status="RED" label="critical" size="sm" /> : '—' },
                { title: 'Outcome', dataIndex: 'outcome', render: (v) => <RagTag status={v === 'FAIL' ? 'FAIL' : 'NEUTRAL'} label={v} size="sm" /> },
                { title: 'Note', dataIndex: 'note', render: (v) => v ?? '—' },
                { title: 'Work order', dataIndex: 'workOrderId', render: (v) => v ? 'raised' : '—' },
              ]}
            />
          ),
        }}
        columns={[
          { title: 'Performed', dataIndex: 'performedAt', render: (v) => new Date(v).toLocaleString('en-GB') },
          { title: 'Vehicle', dataIndex: ['asset', 'code'] },
          { title: 'Driver', dataIndex: ['driver', 'fullName'], render: (v) => v ?? '—' },
          { title: 'Odometer', dataIndex: 'odometerKm', align: 'right' as const, render: (v) => v ? `${v.toLocaleString()} km` : '—' },
          { title: 'Result', dataIndex: 'passed', render: (v) => <RagTag status={v ? 'PASS' : 'FAIL'} /> },
        ]}
      />
    </Card>
  );
}

function WorkOrderDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { data: assets = [] } = useAssets();
  const create = useFleetMutation((values: any) => api.post('/api/maintenance/work-orders', values).then((r) => r.data));

  return (
    <Drawer
      title="Raise work order" open={open} onClose={onClose} width={440}
      extra={<Button type="primary" loading={create.isPending} onClick={() => form.submit()} style={{ borderRadius: 10 }}>Raise</Button>}
    >
      <Form
        form={form} layout="vertical"
        onFinish={(values) =>
          create.mutate(values, {
            onSuccess: (r: any) => { message.success(`${r.number} raised`); onClose(); form.resetFields(); },
            onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not raise the work order'),
          })
        }
      >
        <Form.Item name="assetId" label="Vehicle" rules={[{ required: true }]}>
          <Select
            showSearch optionFilterProp="label"
            options={assets.map((a: any) => ({ value: a.id, label: `${a.code} · ${a.registrationNo}` }))}
          />
        </Form.Item>
        <Form.Item name="title" label="Title" rules={[{ required: true }]}>
          <Input placeholder="Replace nearside drive tyre" />
        </Form.Item>
        <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>
        <Form.Item name="odometerKm" label="Odometer (km)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
        <Form.Item name="supplier" label="Supplier"><Input /></Form.Item>
        <Row gutter={12}>
          <Col span={12}><Form.Item name="partsCost" label="Parts cost"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          <Col span={12}><Form.Item name="labourCost" label="Labour cost"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
        </Row>
      </Form>
    </Drawer>
  );
}
