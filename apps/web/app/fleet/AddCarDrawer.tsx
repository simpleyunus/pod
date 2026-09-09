'use client';

import {
  Button,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import api from '../_lib/api';
import { useStatuses, useUsers } from '../_lib/hooks/useReference';

const { Text } = Typography;

const CURRENCIES = ['ZAR', 'USD', 'BWP', 'MWK', 'MZN', 'ZMW', 'ZWL'].map((c) => ({ label: c, value: c }));

function Section({ label }: { label: string }) {
  return (
    <Text style={{ fontSize: 10, fontWeight: 700, color: '#0E1B2A', textTransform: 'uppercase', letterSpacing: 1, display: 'block', margin: '14px 0 10px' }}>
      {label}
    </Text>
  );
}

export default function AddCarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [clientMode, setClientMode] = useState<'new' | 'existing'>('new');
  const [clientSearch, setClientSearch] = useState('');

  const { data: statuses } = useStatuses();
  const { data: users } = useUsers();
  const { data: clientResults } = useQuery({
    queryKey: ['clients', clientSearch],
    queryFn: () => api.get('/api/clients', { params: { q: clientSearch || undefined, pageSize: 20 } }).then((r) => r.data),
    enabled: open && clientMode === 'existing',
  });

  const createCar = useMutation({
    mutationFn: async (vals: any) => {
      // New customer typed in by hand → create the client first
      let clientId: string = vals.clientId;
      if (clientMode === 'new') {
        const client = await api
          .post('/api/clients', {
            fullName: vals.clientName,
            phoneE164: vals.clientPhone || null,
            email: vals.clientEmail || null,
            country: vals.clientCountry || null,
            city: vals.clientCity || null,
          })
          .then((r) => r.data);
        clientId = client.id;
      }
      return api
        .post('/api/deals', {
          clientId,
          make: vals.make,
          model: vals.model,
          year: vals.year ?? undefined,
          colour: vals.colour || undefined,
          registrationNo: vals.registrationNo || undefined,
          vin: vals.vin || undefined,
          mileageKm: vals.mileageKm ?? undefined,
          supplier: vals.supplier || undefined,
          sourceCountry: vals.sourceCountry || undefined,
          destinationCountry: vals.destinationCountry || undefined,
          destinationCity: vals.destinationCity || undefined,
          sellingPrice: vals.sellingPrice ?? undefined,
          sellingCurrency: vals.sellingPrice ? vals.sellingCurrency : undefined,
          expectedDeliveryDate: vals.expectedDeliveryDate?.toISOString(),
          consultantId: vals.consultantId || undefined,
          currentStatusId: vals.currentStatusId || undefined,
        })
        .then((r) => r.data);
    },
    onSuccess: (deal) => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      message.success(`${deal.reference} created`);
      form.resetFields();
      onClose();
      router.push(`/deals/${deal.id}`);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not create the car'),
  });

  return (
    <Drawer
      title="Add a car"
      open={open}
      onClose={onClose}
      size={480}
      extra={
        <Button type="primary" loading={createCar.isPending} onClick={() => form.submit()}>
          Create
        </Button>
      }
    >
      <Form form={form} layout="vertical" size="middle" onFinish={(vals) => createCar.mutate(vals)}
        initialValues={{ sellingCurrency: 'ZAR', sourceCountry: 'South Africa' }}>

        <Section label="Customer" />
        <Radio.Group
          value={clientMode}
          onChange={(e) => setClientMode(e.target.value)}
          optionType="button"
          size="small"
          style={{ marginBottom: 12 }}
          options={[
            { label: 'New customer', value: 'new' },
            { label: 'Existing customer', value: 'existing' },
          ]}
        />

        {clientMode === 'existing' ? (
          <Form.Item name="clientId" rules={[{ required: true, message: 'Pick a customer' }]}>
            <Select
              showSearch
              placeholder="Search by name, phone or email…"
              filterOption={false}
              onSearch={setClientSearch}
              options={clientResults?.items?.map((c: any) => ({
                value: c.id,
                label: (
                  <span>
                    <b>{c.fullName}</b>
                    <span style={{ color: '#98A0AC', fontSize: 11, marginLeft: 8 }}>
                      {[c.phoneE164, c.country].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                ),
              }))}
            />
          </Form.Item>
        ) : (
          <>
            <Form.Item name="clientName" label="Full name" rules={[{ required: true, message: 'Customer name is required' }]}>
              <Input placeholder="e.g. Taurai Gwatidzo" />
            </Form.Item>
            <Row gutter={10}>
              <Col span={12}>
                <Form.Item name="clientPhone" label="Phone" extra="International format for WhatsApp">
                  <Input placeholder="+263 77 123 4567" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="clientEmail" label="Email" rules={[{ type: 'email', message: 'Not a valid email' }]}>
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={10}>
              <Col span={12}>
                <Form.Item name="clientCountry" label="Country">
                  <Input placeholder="Zimbabwe" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="clientCity" label="City">
                  <Input placeholder="Harare" />
                </Form.Item>
              </Col>
            </Row>
          </>
        )}

        <Section label="Vehicle" />
        <Row gutter={10}>
          <Col span={12}>
            <Form.Item name="make" label="Make" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="Toyota" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="model" label="Model" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="RAV4" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={10}>
          <Col span={8}>
            <Form.Item name="year" label="Year">
              <InputNumber style={{ width: '100%' }} min={1980} max={2030} placeholder="2019" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="colour" label="Colour">
              <Input />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="mileageKm" label="Mileage (km)">
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={10}>
          <Col span={12}>
            <Form.Item name="registrationNo" label="Registration / plate">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="vin" label="VIN">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <Section label="Route" />
        <Row gutter={10}>
          <Col span={12}>
            <Form.Item name="supplier" label="Supplier">
              <Input placeholder="We Buy Cars · JHB" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="sourceCountry" label="From">
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={10}>
          <Col span={8}>
            <Form.Item name="destinationCountry" label="Destination country">
              <Input placeholder="Zimbabwe" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="destinationCity" label="City">
              <Input placeholder="Harare" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="expectedDeliveryDate" label="Est. delivery">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Section label="Deal" />
        <Row gutter={10}>
          <Col span={10}>
            <Form.Item name="sellingPrice" label="Selling price">
              <InputNumber style={{ width: '100%' }} min={0} placeholder="207150" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="sellingCurrency" label="Currency">
              <Select options={CURRENCIES} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="currentStatusId" label="Starting stage">
              <Select allowClear placeholder="Optional"
                options={statuses?.map((s: any) => ({ label: s.name, value: s.id }))} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="consultantId" label="Handled by">
          <Select allowClear placeholder="Assign a consultant"
            options={users?.map((u: any) => ({ label: u.fullName, value: u.id }))} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
