'use client';

import { CarOutlined, PlusOutlined, SafetyCertificateOutlined, ToolOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Card, Col, Drawer, Form, Input, InputNumber, Row, Select, Table, Typography, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import api from '../_lib/api';
import { hasRole } from '../_lib/auth';
import { useAssets, useFleetLookups, useFleetMutation } from '../_lib/hooks/useFleet';
import RagTag, { KpiCard, PageHeader } from '../_components/RagTag';

const { Text } = Typography;

// POD's own vehicles — deliberately separate from the deals board at /fleet,
// which tracks customers' cars being imported.
export default function AssetsClient() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const { data: assets = [], isLoading } = useAssets(q ? { q } : {});
  const { data: lookups } = useFleetLookups();
  const canEdit = hasRole('CONSULTANT');

  const create = useFleetMutation((values: any) => api.post('/api/fleet/assets', values).then((r) => r.data));

  const red = assets.filter((a: any) => a.complianceStatus === 'EXPIRED').length;
  const amber = assets.filter((a: any) => a.complianceStatus === 'DUE_SOON').length;

  return (
    <>
      <PageHeader
        title="Fleet assets"
        subtitle="Vehicles and trailers POD owns and operates"
        extra={
          canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)} style={{ borderRadius: 10 }}>
              Add vehicle
            </Button>
          )
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
        <Col xs={12} md={6}><KpiCard icon={<CarOutlined />} label="Active vehicles" value={assets.length} accent="#101828" tint="#F1F2F0" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<SafetyCertificateOutlined />} label="Fully compliant" value={assets.length - red - amber} accent="#067647" tint="#E6F6EE" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ToolOutlined />} label="Documents due soon" value={amber} accent="#9A6208" tint="#FCF3E1" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Expired documents" value={red} accent="#B42318" tint="#FEE4E2" /></Col>
      </Row>

      <Input.Search
        placeholder="Search fleet number, registration, VIN…"
        allowClear
        onSearch={setQ}
        style={{ maxWidth: 340, marginBottom: 14 }}
      />

      <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={assets}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
          onRow={(r: any) => ({ onClick: () => router.push(`/assets/${r.id}`), style: { cursor: 'pointer' } })}
          columns={[
            // R1 Fleet List columns, in R1's order.
            { title: 'No', dataIndex: 'fleetNo', render: (v) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
            { title: 'Year model', dataIndex: 'yearModel', render: (v) => v ?? '—' },
            { title: 'Make / manufacturer', dataIndex: 'makeManufacturer', render: (v) => v ?? '—' },
            { title: 'Registration', dataIndex: 'registrationNo' },
            { title: 'VIN', dataIndex: 'vin', render: (v) => v ?? '—' },
            { title: 'Type', dataIndex: ['type', 'name'] },
            { title: 'Max loading mass', dataIndex: 'maxLoadingMassKg', align: 'right' as const, render: (v) => `${(v / 1000).toLocaleString()} t` },
            { title: 'Max passengers', dataIndex: 'maxPassengers', align: 'right' as const, render: (v) => v ?? 'N/A' },
            { title: 'Odometer', dataIndex: 'odometerKm', align: 'right' as const, render: (v) => `${v.toLocaleString()} km` },
            {
              title: 'Compliance', dataIndex: 'complianceStatus',
              render: (v, r: any) => (
                <span>
                  <RagTag status={v} />
                  {r.blockingItems?.length > 0 && (
                    <div style={{ fontSize: 10.5, color: '#B42318', marginTop: 3 }}>
                      blocks trips: {r.blockingItems.join(', ')}
                    </div>
                  )}
                </span>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        title="Add vehicle"
        open={open}
        onClose={() => setOpen(false)}
        width={460}
        extra={
          <Button
            type="primary"
            loading={create.isPending}
            onClick={() => form.submit()}
            style={{ borderRadius: 10 }}
          >
            Save
          </Button>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            create.mutate(values, {
              onSuccess: () => { message.success('Vehicle added'); setOpen(false); form.resetFields(); },
              onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not add the vehicle'),
            })
          }
        >
          <Form.Item name="fleetNo" label="No (fleet number)" rules={[{ required: true }]}>
            <Input placeholder="3" />
          </Form.Item>
          <Form.Item name="registrationNo" label="Vehicle registration number" rules={[{ required: true }]}>
            <Input placeholder="MX87GSGP" />
          </Form.Item>
          <Form.Item name="typeId" label="Type" rules={[{ required: true }]}>
            <Select
              placeholder="Select a type"
              options={(lookups?.assetTypes ?? []).map((t: any) => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
          <Form.Item name="vin" label="VIN"><Input /></Form.Item>
          <Form.Item name="makeManufacturer" label="Make / manufacturer"><Input placeholder="UD TRUCKS" /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="yearModel" label="Year model"><InputNumber style={{ width: '100%' }} min={1970} max={2100} /></Form.Item></Col>
            <Col span={12}><Form.Item name="odometerKm" label="Odometer (km)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="maxLoadingMassKg"
                label="Maximum loading mass (kg)"
                rules={[{ required: true, message: 'Every load is checked against this' }]}
                extra="R1 shows this in tonnes; enter kilograms."
              >
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="maxPassengers" label="Maximum passengers" extra="Leave blank for N/A.">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="comments" label="Comments"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
