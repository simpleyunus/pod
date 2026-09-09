'use client';

import { IdcardOutlined, PlusOutlined, TeamOutlined, WarningOutlined } from '@ant-design/icons';
import {
  Button, Card, Col, Drawer, Empty, Form, Input, Modal, Row, Table, Tabs, Typography, message,
} from 'antd';
import { useEffect, useState } from 'react';
import api from '../_lib/api';
import { hasRole } from '../_lib/auth';
import { useDriver, useDrivers, useFleetMutation } from '../_lib/hooks/useFleet';
import RagTag, { KpiCard, PageHeader } from '../_components/RagTag';

const { Text } = Typography;
const fmtDate = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

export default function DriversClient() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // Deep link: /drivers?id=<driverId> opens that driver straight away, so a
  // driver name in the trips or incidents table is a real jump rather than a
  // dump on the list. Read from window rather than useSearchParams, which
  // would need a Suspense boundary around a page that is otherwise static.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (id) setSelected(id);
  }, []);
  const [form] = Form.useForm();
  const { data: drivers = [], isLoading } = useDrivers(q ? { q } : {});
  const canEdit = hasRole('CONSULTANT');

  const create = useFleetMutation((values: any) => api.post('/api/fleet/drivers', values).then((r) => r.data));

  const red = drivers.filter((d: any) => d.complianceStatus === 'EXPIRED').length;
  const amber = drivers.filter((d: any) => d.complianceStatus === 'DUE_SOON').length;

  return (
    <>
      <PageHeader
        title="Drivers"
        subtitle="Licences, PrDPs and medicals are compliance items — the gate reads them before every trip"
        extra={
          canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)} style={{ borderRadius: 10 }}>
              Add driver
            </Button>
          )
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
        <Col xs={8}><KpiCard icon={<TeamOutlined />} label="Active drivers" value={drivers.length} accent="#101828" tint="#F1F2F0" /></Col>
        <Col xs={8}><KpiCard icon={<IdcardOutlined />} label="Documents due soon" value={amber} accent="#9A6208" tint="#FCF3E1" /></Col>
        <Col xs={8}><KpiCard icon={<WarningOutlined />} label="Expired documents" value={red} accent="#B42318" tint="#FEE4E2" /></Col>
      </Row>

      <Input.Search placeholder="Search name or driver number…" allowClear onSearch={setQ} style={{ maxWidth: 320, marginBottom: 14 }} />

      <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id" loading={isLoading} dataSource={drivers} pagination={{ pageSize: 20, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
          onRow={(r: any) => ({ onClick: () => setSelected(r.id), style: { cursor: 'pointer' } })}
          columns={[
            // R15/R16 key on the employee number and split the name.
            { title: 'Employee no', dataIndex: 'employeeNo' },
            { title: 'Surname', dataIndex: 'surname', render: (v) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
            { title: 'Name', dataIndex: 'firstName' },
            { title: 'Chronic condition', dataIndex: 'chronicCondition', render: (v) => v ?? '—' },
            { title: 'Phone', dataIndex: 'phoneE164', render: (v) => v ?? '—' },
            {
              title: 'Compliance', dataIndex: 'complianceStatus',
              render: (v, r: any) => (
                <span>
                  <RagTag status={v} />
                  {r.blockingItems?.length > 0 && (
                    <div style={{ fontSize: 10.5, color: '#B42318', marginTop: 3 }}>blocks trips: {r.blockingItems.join(', ')}</div>
                  )}
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title="Add driver" open={open} onClose={() => setOpen(false)} size={420}
        extra={<Button type="primary" loading={create.isPending} onClick={() => form.submit()} style={{ borderRadius: 10 }}>Save</Button>}
      >
        <Form
          form={form} layout="vertical"
          onFinish={(values) =>
            create.mutate(values, {
              onSuccess: () => { message.success('Driver added'); setOpen(false); form.resetFields(); },
              onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not add the driver'),
            })
          }
        >
          <Form.Item name="employeeNo" label="Employee no." rules={[{ required: true }]}><Input placeholder="2" /></Form.Item>
          <Form.Item name="surname" label="Surname" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="firstName" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="chronicCondition" label="Chronic condition" extra="R15 tracks this so the medical schedule can manage it.">
            <Input />
          </Form.Item>
          <Form.Item
            name="phoneE164" label="Phone (E.164)"
            rules={[{ pattern: /^\+[1-9]\d{6,14}$/, message: 'Use international format, e.g. +27821234567' }]}
            extra="Expiry reminders go to this number on WhatsApp."
          >
            <Input placeholder="+27821234567" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="comments" label="Comments"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Drawer>

      <DriverDetail
        id={selected}
        onClose={() => {
          setSelected(null);
          if (new URLSearchParams(window.location.search).get('id')) {
            window.history.replaceState({}, '', '/drivers');
          }
        }}
      />
    </>
  );
}

function DriverDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: driver, isLoading } = useDriver(id ?? '');

  return (
    <Modal open={!!id} onCancel={onClose} footer={null} width={780} title={driver ? `${driver.firstName} ${driver.surname}` : 'Driver'}>
      {isLoading || !driver ? (
        <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>
      ) : (
        <Tabs
          items={[
            {
              key: 'docs', label: 'Documents',
              children: (
                <Table
                  rowKey="id" size="small" pagination={false} dataSource={driver.complianceItems}
                  locale={{ emptyText: 'No documents recorded' }}
                  columns={[
                    { title: 'Document', dataIndex: ['kind', 'name'] },
                    { title: 'Reference', dataIndex: 'reference', render: (v) => v ?? '—' },
                    { title: 'Expires', dataIndex: 'expiresOn', render: (v) => fmtDate(v) },
                    { title: 'Status', dataIndex: 'status', render: (v) => <RagTag status={v} size="sm" /> },
                  ]}
                />
              ),
            },
            {
              key: 'duty', label: 'Duty hours',
              children: (
                <Table
                  rowKey="id" size="small" pagination={false} dataSource={driver.dutyRecords}
                  locale={{ emptyText: 'No duty records — fatigue checks pass by default until hours are logged' }}
                  columns={[
                    { title: 'On duty', dataIndex: 'onDutyAt', render: (v) => new Date(v).toLocaleString('en-GB') },
                    { title: 'Off duty', dataIndex: 'offDutyAt', render: (v) => v ? new Date(v).toLocaleString('en-GB') : 'open' },
                    { title: 'Driving (min)', dataIndex: 'drivingMinutes', align: 'right' as const },
                    { title: 'Breaks (min)', dataIndex: 'breakMinutes', align: 'right' as const },
                  ]}
                />
              ),
            },
            {
              key: 'trips', label: 'Trips',
              children: (
                <Table
                  rowKey="id" size="small" pagination={false} dataSource={driver.assignments}
                  locale={{ emptyText: 'No trips' }}
                  columns={[
                    { title: 'Trip', dataIndex: 'reference' },
                    { title: 'Vehicle', dataIndex: ['asset', 'fleetNo'] },
                    { title: 'Status', dataIndex: ['status', 'name'] },
                    { title: 'Gate', dataIndex: 'gateDecision', render: (v) => v ? <RagTag status={v} size="sm" /> : '—' },
                  ]}
                />
              ),
            },
            {
              key: 'acks', label: 'Acknowledgements',
              children: (
                <>
                  <Text style={{ fontSize: 11, color: '#98A0AC' }}>ROUTE BRIEFINGS</Text>
                  <Table
                    rowKey="id" size="small" pagination={false} dataSource={driver.routeAcks} style={{ marginBottom: 16 }}
                    locale={{ emptyText: 'None' }}
                    columns={[
                      { title: 'Route', dataIndex: ['route', 'name'] },
                      { title: 'Version acknowledged', dataIndex: 'version', align: 'right' as const },
                      { title: 'Current version', dataIndex: ['route', 'version'], align: 'right' as const },
                      { title: 'When', dataIndex: 'acknowledgedAt', render: (v) => fmtDate(v) },
                    ]}
                  />
                  <Text style={{ fontSize: 11, color: '#98A0AC' }}>POLICIES</Text>
                  <Table
                    rowKey="id" size="small" pagination={false} dataSource={driver.policyAcks}
                    locale={{ emptyText: 'None' }}
                    columns={[
                      { title: 'Policy', dataIndex: ['policy', 'title'] },
                      { title: 'Version', dataIndex: ['policy', 'version'], align: 'right' as const },
                      { title: 'When', dataIndex: 'acknowledgedAt', render: (v) => fmtDate(v) },
                    ]}
                  />
                </>
              ),
            },
          ]}
        />
      )}
    </Modal>
  );
}
