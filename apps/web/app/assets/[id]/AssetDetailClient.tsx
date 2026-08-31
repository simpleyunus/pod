'use client';

import { ArrowLeftOutlined, DashboardOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button, Card, Col, Descriptions, Empty, Form, InputNumber, Modal, Row, Spin,
  Table, Tabs, Timeline, Typography, message,
} from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import api from '../../_lib/api';
import { hasRole } from '../../_lib/auth';
import { useAsset, useFleetMutation } from '../../_lib/hooks/useFleet';
import RagTag, { PageHeader } from '../../_components/RagTag';

const { Text } = Typography;
const fmtDate = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

export default function AssetDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { data: asset, isLoading } = useAsset(id);
  const [odoOpen, setOdoOpen] = useState(false);
  const [form] = Form.useForm();
  const canEdit = hasRole('CONSULTANT');

  const recordOdo = useFleetMutation((values: any) =>
    api.post(`/api/fleet/assets/${id}/odometer`, values).then((r) => r.data),
  );

  if (isLoading) return <div style={{ padding: 60, textAlign: 'center' }}><Spin /></div>;
  if (!asset) return <Empty description="Vehicle not found" />;

  return (
    <>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/assets')} style={{ marginTop: 8, paddingLeft: 0, color: '#98A0AC' }}>
        Fleet assets
      </Button>

      <PageHeader
        title={`${asset.code} · ${asset.registrationNo}`}
        subtitle={[asset.type?.name, asset.make, asset.model, asset.year].filter(Boolean).join(' · ')}
        extra={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <RagTag status={asset.complianceStatus} />
            {canEdit && (
              <Button icon={<DashboardOutlined />} onClick={() => setOdoOpen(true)} style={{ borderRadius: 10 }}>
                Record odometer
              </Button>
            )}
          </div>
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
        <Col xs={24} lg={10}>
          <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4', height: '100%' }}>
            <Descriptions column={1} size="small" labelStyle={{ color: '#98A0AC', fontSize: 12 }}>
              <Descriptions.Item label="VIN">{asset.vin ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Tare mass">{asset.tareMassKg ? `${asset.tareMassKg.toLocaleString()} kg` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Permissible maximum">
                <Text strong>{asset.maxMassKg.toLocaleString()} kg</Text>
                <Text style={{ fontSize: 11, color: '#98A0AC', marginLeft: 6 }}>every load is checked against this</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Combination max">{asset.maxCombinationMassKg ? `${asset.maxCombinationMassKg.toLocaleString()} kg` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Odometer">{asset.odometerKm.toLocaleString()} km</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            title={<Text style={{ fontSize: 10, fontWeight: 700, color: '#98A0AC', textTransform: 'uppercase', letterSpacing: 1.2 }}>Compliance documents</Text>}
            style={{ borderRadius: 14, border: '1px solid #E9E9E4', height: '100%' }}
            styles={{ body: { padding: 0 } }}
          >
            <Table
              rowKey="id" size="small" pagination={false} dataSource={asset.complianceItems}
              locale={{ emptyText: 'No documents recorded' }}
              columns={[
                { title: 'Document', dataIndex: ['kind', 'name'] },
                { title: 'Reference', dataIndex: 'reference', render: (v) => v ?? '—' },
                { title: 'Expires', dataIndex: 'expiresOn', render: (v) => fmtDate(v) },
                { title: 'Status', dataIndex: 'status', render: (v) => <RagTag status={v} size="sm" /> },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Tabs
        items={[
          {
            key: 'maintenance', label: `Maintenance (${asset.workOrders?.length ?? 0})`,
            children: (
              <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
                <Table
                  rowKey="id" dataSource={asset.workOrders} pagination={false} scroll={{ x: 'max-content' }}
                  locale={{ emptyText: 'No work orders' }}
                  columns={[
                    { title: 'Job no', dataIndex: 'number' },
                    { title: 'Title', dataIndex: 'title' },
                    { title: 'Raised', dataIndex: 'requestedAt', render: (v) => fmtDate(v) },
                    { title: 'Status', dataIndex: ['status', 'name'] },
                    {
                      title: 'Cost', align: 'right' as const,
                      render: (_: any, r: any) => {
                        const total = Number(r.partsCost ?? 0) + Number(r.labourCost ?? 0);
                        return total ? `${r.currency} ${total.toLocaleString()}` : '—';
                      },
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'inspections', label: `Inspections (${asset.inspections?.length ?? 0})`,
            children: (
              <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
                <Table
                  rowKey="id" dataSource={asset.inspections} pagination={false} scroll={{ x: 'max-content' }}
                  locale={{ emptyText: 'No inspections' }}
                  columns={[
                    { title: 'Performed', dataIndex: 'performedAt', render: (v) => new Date(v).toLocaleString('en-GB') },
                    { title: 'Odometer', dataIndex: 'odometerKm', align: 'right' as const, render: (v) => v ? `${v.toLocaleString()} km` : '—' },
                    { title: 'Result', dataIndex: 'passed', render: (v) => <RagTag status={v ? 'PASS' : 'FAIL'} /> },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'tyres', label: `Tyres (${asset.tyreRecords?.length ?? 0})`,
            children: (
              <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
                <Table
                  rowKey="id" dataSource={asset.tyreRecords} pagination={false} scroll={{ x: 'max-content' }}
                  locale={{ emptyText: 'No tyre records' }}
                  columns={[
                    { title: 'Position', dataIndex: 'position' },
                    { title: 'Action', dataIndex: 'action' },
                    { title: 'Brand / size', render: (_: any, r: any) => [r.brand, r.size].filter(Boolean).join(' ') || '—' },
                    { title: 'Tread', dataIndex: 'treadDepthMm', align: 'right' as const, render: (v) => v ? `${v} mm` : '—' },
                    { title: 'Fitted', dataIndex: 'fittedOn', render: (v) => fmtDate(v) },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'trips', label: `Trips (${asset.assignments?.length ?? 0})`,
            children: (
              <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
                <Table
                  rowKey="id" dataSource={asset.assignments} pagination={false} scroll={{ x: 'max-content' }}
                  locale={{ emptyText: 'No trips' }}
                  columns={[
                    { title: 'Trip', dataIndex: 'reference' },
                    { title: 'Driver', dataIndex: ['driver', 'fullName'] },
                    { title: 'Departed', dataIndex: 'actualDepartureAt', render: (v) => fmtDate(v) },
                    { title: 'Status', dataIndex: ['status', 'name'] },
                    { title: 'Gate', dataIndex: 'gateDecision', render: (v) => v ? <RagTag status={v} size="sm" /> : '—' },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'history', label: 'History',
            children: (
              <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }}>
                {asset.events?.length ? (
                  <Timeline
                    items={asset.events.map((e: any) => ({
                      color: e.type === 'GATE_OVERRIDE' ? 'purple' : e.type === 'COMPLIANCE_CHANGE' ? 'orange' : 'gray',
                      children: (
                        <div>
                          <Text style={{ fontSize: 12.5 }}>{e.note}</Text>
                          <div style={{ fontSize: 11, color: '#98A0AC', marginTop: 2 }}>
                            {new Date(e.createdAt).toLocaleString('en-GB')}
                            {e.createdBy ? ` · ${e.createdBy.fullName}` : ''}
                          </div>
                        </div>
                      ),
                    }))}
                  />
                ) : <Empty description="No history yet" />}
              </Card>
            ),
          },
        ]}
      />

      <Modal
        title="Record odometer reading"
        open={odoOpen}
        onCancel={() => setOdoOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={recordOdo.isPending}
        okText="Record"
      >
        <Form
          form={form} layout="vertical" style={{ marginTop: 16 }}
          onFinish={(values) =>
            recordOdo.mutate(values, {
              onSuccess: () => { message.success('Odometer recorded'); setOdoOpen(false); form.resetFields(); },
              onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not record the reading'),
            })
          }
        >
          <Form.Item
            name="odometerKm"
            label={`Current reading (last recorded ${asset.odometerKm.toLocaleString()} km)`}
            rules={[{ required: true }]}
            extra="Drives km-based service intervals — a reading may not go backwards."
          >
            <InputNumber style={{ width: '100%' }} min={asset.odometerKm} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
