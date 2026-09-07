'use client';

import { AlertOutlined, CameraOutlined, PlusOutlined, ToolOutlined, WarningOutlined } from '@ant-design/icons';
import {
  Button, Card, Col, DatePicker, Drawer, Empty, Form, Input, InputNumber, Modal,
  Row, Select, Switch, Table, Tabs, Timeline, Typography, Upload, message,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import api from '../_lib/api';
import { hasRole } from '../_lib/auth';
import {
  useAssets, useDrivers, useFines, useFleetLookups, useFleetMutation, useIncident, useIncidents, useTrips,
} from '../_lib/hooks/useFleet';
import { useUsers } from '../_lib/hooks/useReference';
import RagTag, { KpiCard, PageHeader } from '../_components/RagTag';

const { Text } = Typography;
const fmtDate = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

export default function IncidentsClient() {
  const { data: incidents = [], isLoading } = useIncidents();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const canEdit = hasRole('CONSULTANT');

  const open = incidents.filter((i: any) => !i.status?.isTerminal).length;
  const overdueActions = incidents.flatMap((i: any) => i.actions ?? [])
    .filter((a: any) => a.dueDate && new Date(a.dueDate) < new Date() && a.status !== 'DONE' && a.status !== 'VERIFIED').length;
  const injuries = incidents.reduce((s: number, i: any) => s + (i.injuries ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Incidents"
        subtitle="Root cause is captured in three layers — immediate, underlying and systemic"
        extra={
          canEdit && (
            <Button type="primary" danger icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} style={{ borderRadius: 10 }}>
              Report incident
            </Button>
          )
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
        <Col xs={12} md={6}><KpiCard icon={<AlertOutlined />} label="Total incidents" value={incidents.length} accent="#101828" tint="#F1F2F0" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Open" value={open} accent="#9A6208" tint="#FCF3E1" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<ToolOutlined />} label="Actions overdue" value={overdueActions} accent="#B42318" tint="#FEE4E2" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<AlertOutlined />} label="Injuries" value={injuries} accent="#B42318" tint="#FEE4E2" /></Col>
      </Row>

      <Tabs
        items={[
          {
            key: 'incidents', label: `Incidents (${incidents.length})`,
            children: (
              <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
                <Table
                  rowKey="id" loading={isLoading} dataSource={incidents}
                  pagination={{ pageSize: 20, hideOnSinglePage: true }} scroll={{ x: 'max-content' }}
                  locale={{ emptyText: <Empty description="No incidents recorded" /> }}
                  onRow={(r: any) => ({ onClick: () => setSelected(r.id), style: { cursor: 'pointer' } })}
                  columns={[
                    // R8 Accident Investigation Register columns.
                    { title: 'Ref', dataIndex: 'reference', render: (v) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
                    { title: 'Date', dataIndex: 'date', render: (v) => new Date(v).toLocaleString('en-GB') },
                    { title: 'Vehicle reg no', dataIndex: ['asset', 'registrationNo'], render: (v) => v ?? '—' },
                    { title: 'Driver name', render: (_: any, r: any) => r.driver ? `${r.driver.firstName} ${r.driver.surname}` : '—' },
                    { title: 'Description', dataIndex: 'description', render: (v: string) => v.length > 70 ? `${v.slice(0, 70)}…` : v },
                    { title: 'Cause', render: (_: any, r: any) => r.systemicCause ?? r.underlyingCause ?? r.cause ?? '—' },
                    { title: 'Fault', dataIndex: 'faultCategory', render: (v) => v ? String(v).replace(/_/g, ' ').toLowerCase() : '—' },
                    { title: 'Severity', dataIndex: ['severity', 'name'], render: (v) => v ?? '—' },
                    {
                      title: 'Actions', align: 'right' as const,
                      render: (_: any, r: any) => {
                        const openA = (r.actions ?? []).filter((a: any) => a.status !== 'DONE' && a.status !== 'VERIFIED').length;
                        return openA ? <RagTag status="AMBER" label={`${openA} open`} size="sm" /> : <Text style={{ color: '#98A0AC' }}>—</Text>;
                      },
                    },
                    {
                      title: 'Status', dataIndex: ['status', 'name'],
                      render: (v, r: any) => <RagTag status={r.status?.isTerminal ? 'GREEN' : 'AMBER'} label={v} />,
                    },
                  ]}
                />
              </Card>
            ),
          },
          { key: 'fines', label: 'Traffic fines', children: <FinesTab /> },
        ]}
      />

      <ReportIncidentDrawer open={createOpen} onClose={() => setCreateOpen(false)} />
      <IncidentDetail id={selected} onClose={() => setSelected(null)} />
    </>
  );
}

// Mobile-first: this is filled in at the roadside.
function ReportIncidentDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const [photos, setPhotos] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const { data: lookups } = useFleetLookups();
  const { data: assets = [] } = useAssets();
  const { data: drivers = [] } = useDrivers();
  const { data: trips = [] } = useTrips({ openOnly: 'true' });

  const create = useFleetMutation((body: any) => api.post('/api/incidents', body).then((r) => r.data));

  const submit = async (values: any) => {
    setBusy(true);
    try {
      const photoFileIds: string[] = [];
      for (const p of photos) {
        if (!p.originFileObj) continue;
        const fd = new FormData();
        fd.append('file', p.originFileObj, p.name);
        fd.append('kind', 'INCIDENT_PHOTO');
        const res = await api.post('/api/fleet/files', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        photoFileIds.push(res.data.id);
      }
      await create.mutateAsync({
        ...values,
        date: values.date.toISOString(),
        photoFileIds,
      });
      message.success('Incident reported');
      form.resetFields();
      setPhotos([]);
      onClose();
    } catch (e: any) {
      message.error(e.response?.data?.message ?? 'Could not report the incident');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title="Report incident" open={open} onClose={onClose} size="100%"
      styles={{ wrapper: { maxWidth: 520 } }}
      footer={
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '10px 4px' }}>
          <Button onClick={onClose} style={{ borderRadius: 10 }}>Cancel</Button>
          <Button type="primary" danger loading={busy} onClick={() => form.submit()} style={{ borderRadius: 10, minWidth: 110 }}>
            Report
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" size="large" onFinish={submit} initialValues={{ date: dayjs(), injuries: 0 }}>
        <Form.Item name="date" label="When" rules={[{ required: true }]}>
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="categoryId" label="What happened">
          <Select allowClear placeholder="Category"
            options={(lookups?.incidentCategories ?? []).map((c: any) => ({ value: c.id, label: c.name }))} />
        </Form.Item>
        {/* P3: categorised by severity and by fault. */}
        <Form.Item name="severityId" label="Severity">
          <Select allowClear
            options={(lookups?.incidentSeverities ?? []).map((c: any) => ({ value: c.id, label: c.name }))} />
        </Form.Item>
        <Form.Item name="faultCategory" label="Fault">
          <Select allowClear options={[
            { value: 'DRIVER_FAULT', label: 'Driver fault' },
            { value: 'THIRD_PARTY_FAULT', label: 'Third party fault' },
            { value: 'SHARED', label: 'Shared' },
            { value: 'UNDETERMINED', label: 'Undetermined' },
          ]} />
        </Form.Item>
        <Form.Item name="isNearMiss" label="Near miss" valuePropName="checked"
          extra="The manual asks drivers to report near misses so they can be used as learning.">
          <Switch />
        </Form.Item>
        <Form.Item name="sapsReportNumber" label="SAPS accident report number"
          extra="P3: report to the nearest SAPS station within 24 hours and obtain a number.">
          <Input />
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ required: true }]}>
          <Input.TextArea rows={4} placeholder="What happened, in the reporter's own words" />
        </Form.Item>
        <Form.Item name="locationText" label="Where"><Input placeholder="N1 northbound, 12km past Polokwane" /></Form.Item>
        <Form.Item name="assetId" label="Vehicle">
          <Select allowClear showSearch optionFilterProp="label"
            options={assets.map((a: any) => ({ value: a.id, label: `${a.code} · ${a.registrationNo}` }))} />
        </Form.Item>
        <Form.Item name="driverId" label="Driver">
          <Select allowClear showSearch optionFilterProp="label"
            options={drivers.map((d: any) => ({ value: d.id, label: d.fullName }))} />
        </Form.Item>
        <Form.Item name="assignmentId" label="Trip">
          <Select allowClear options={trips.map((t: any) => ({ value: t.id, label: t.reference }))} />
        </Form.Item>
        <Row gutter={12}>
          <Col span={8}><Form.Item name="injuries" label="Injuries"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          <Col span={8}><Form.Item name="vehicleDamage" label="Damage" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={8}><Form.Item name="thirdPartyInvolved" label="3rd party" valuePropName="checked"><Switch /></Form.Item></Col>
        </Row>
        <Form.Item label="Photos">
          <Upload
            listType="picture-card" fileList={photos} beforeUpload={() => false}
            onChange={({ fileList }) => setPhotos(fileList)} accept="image/*" multiple
          >
            {photos.length < 10 && (
              <div>
                <CameraOutlined style={{ fontSize: 18, color: '#98A0AC' }} />
                <div style={{ fontSize: 11, marginTop: 4, color: '#98A0AC' }}>Add</div>
              </div>
            )}
          </Upload>
        </Form.Item>
      </Form>
    </Drawer>
  );
}

function IncidentDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [form] = Form.useForm();
  const [actionForm] = Form.useForm();
  const { data: users = [] } = useUsers();
  const canEdit = hasRole('CONSULTANT');

  const { data: incident } = useIncident(id);

  const investigate = useFleetMutation((body: any) => api.post(`/api/incidents/${id}/investigation`, body).then((r) => r.data));
  const addAction = useFleetMutation((body: any) => api.post(`/api/incidents/${id}/actions`, body).then((r) => r.data));
  const updateAction = useFleetMutation(({ actionId, ...body }: any) =>
    api.patch(`/api/incidents/actions/${actionId}`, body).then((r) => r.data));

  return (
    <Modal open={!!id} onCancel={onClose} footer={null} width={840} title={incident?.reference ?? 'Incident'}>
      {!incident ? <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div> : (
        <Tabs
          items={[
            {
              key: 'detail', label: 'Detail',
              children: (
                <>
                  <Text style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>{incident.description}</Text>
                  <Row gutter={12} style={{ fontSize: 12, color: '#616875' }}>
                    <Col span={8}>Date: {new Date(incident.date).toLocaleString('en-GB')}</Col>
                    <Col span={8}>Vehicle: {incident.asset?.registrationNo ?? '—'}</Col>
                    <Col span={8}>Driver: {incident.driver ? `${incident.driver.firstName} ${incident.driver.surname}` : '—'}</Col>
                  </Row>
                </>
              ),
            },
            {
              key: 'rootcause', label: 'Root cause',
              children: (
                <Form
                  form={form} layout="vertical"
                  initialValues={{
                    immediateCause: incident.immediateCause,
                    underlyingCause: incident.underlyingCause,
                    systemicCause: incident.systemicCause,
                    statusCode: incident.status?.code,
                  }}
                  onFinish={(v) => investigate.mutate(v, {
                    onSuccess: () => message.success('Investigation updated'),
                    onError: () => message.error('Could not save'),
                  })}
                >
                  <Form.Item name="immediateCause" label="Immediate cause" extra="What directly caused it.">
                    <Input.TextArea rows={2} disabled={!canEdit} />
                  </Form.Item>
                  <Form.Item name="underlyingCause" label="Underlying cause" extra="What allowed the immediate cause to happen.">
                    <Input.TextArea rows={2} disabled={!canEdit} />
                  </Form.Item>
                  <Form.Item name="systemicCause" label="Systemic cause" extra="What in the system needs to change so it cannot recur.">
                    <Input.TextArea rows={2} disabled={!canEdit} />
                  </Form.Item>
                  <Form.Item name="statusCode" label="Status">
                    <Select
                      disabled={!canEdit}
                      options={[
                        { value: 'REPORTED', label: 'Reported' },
                        { value: 'INVESTIGATING', label: 'Investigating' },
                        { value: 'ACTIONS_OPEN', label: 'Actions outstanding' },
                        { value: 'CLOSED', label: 'Closed' },
                      ]}
                    />
                  </Form.Item>
                  {canEdit && (
                    <Button type="primary" onClick={() => form.submit()} loading={investigate.isPending} style={{ borderRadius: 10 }}>
                      Save investigation
                    </Button>
                  )}
                </Form>
              ),
            },
            {
              key: 'actions', label: `Corrective actions (${incident.actions?.length ?? 0})`,
              children: (
                <>
                  <Table
                    rowKey="id" size="small" pagination={false} dataSource={incident.actions}
                    locale={{ emptyText: 'No corrective actions yet' }} style={{ marginBottom: 16 }}
                    columns={[
                      { title: 'Action', dataIndex: 'description' },
                      { title: 'Owner', dataIndex: 'ownerUserId', render: (v) => users.find((u: any) => u.id === v)?.fullName ?? '—' },
                      { title: 'Due', dataIndex: 'dueDate', render: (v) => fmtDate(v) },
                      {
                        title: 'Status', dataIndex: 'status',
                        render: (v, r: any) => canEdit ? (
                          <Select
                            size="small" value={v} style={{ width: 130 }}
                            onChange={(status) => updateAction.mutate({ actionId: r.id, status }, {
                              onSuccess: () => message.success('Action updated'),
                            })}
                            options={[
                              { value: 'OPEN', label: 'Open' },
                              { value: 'IN_PROGRESS', label: 'In progress' },
                              { value: 'DONE', label: 'Done' },
                              { value: 'VERIFIED', label: 'Verified' },
                            ]}
                          />
                        ) : v,
                      },
                    ]}
                  />
                  {canEdit && (
                    <Form
                      form={actionForm} layout="vertical"
                      onFinish={(v) => addAction.mutate(
                        { ...v, dueDate: v.dueDate ? v.dueDate.toISOString() : null },
                        { onSuccess: () => { message.success('Action added'); actionForm.resetFields(); } },
                      )}
                    >
                      <Row gutter={12}>
                        <Col span={10}>
                          <Form.Item name="description" label="New action" rules={[{ required: true }]}>
                            <Input placeholder="What must change" />
                          </Form.Item>
                        </Col>
                        <Col span={7}>
                          <Form.Item name="ownerUserId" label="Owner">
                            <Select allowClear options={users.map((u: any) => ({ value: u.id, label: u.fullName }))} />
                          </Form.Item>
                        </Col>
                        <Col span={5}>
                          <Form.Item name="dueDate" label="Due"><DatePicker style={{ width: '100%' }} /></Form.Item>
                        </Col>
                        <Col span={2}>
                          <Form.Item label=" ">
                            <Button type="primary" onClick={() => actionForm.submit()} style={{ borderRadius: 10 }}>Add</Button>
                          </Form.Item>
                        </Col>
                      </Row>
                    </Form>
                  )}
                </>
              ),
            },
            {
              key: 'trail', label: 'Investigation trail',
              children: incident.events?.length ? (
                <Timeline
                  items={incident.events.map((e: any) => ({
                    color: e.type === 'INVESTIGATION' ? 'blue' : e.type === 'CORRECTIVE_ACTION' ? 'green' : 'gray',
                    children: (
                      <div>
                        <Text style={{ fontSize: 12.5 }}>{e.note}</Text>
                        <div style={{ fontSize: 11, color: '#98A0AC', marginTop: 2 }}>
                          {new Date(e.createdAt).toLocaleString('en-GB')}{e.createdBy ? ` · ${e.createdBy.fullName}` : ''}
                        </div>
                      </div>
                    ),
                  }))}
                />
              ) : <Empty description="No trail yet" />,
            },
          ]}
        />
      )}
    </Modal>
  );
}

function FinesTab() {
  const { data = [], isLoading } = useFines();
  return (
    <Card size="small" style={{ borderRadius: 14, border: '1px solid #E9E9E4' }} styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="id" loading={isLoading} dataSource={data} pagination={{ pageSize: 20, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }} locale={{ emptyText: 'No traffic fines recorded' }}
        columns={[
          // R10 Traffic Fine Register columns — the form carries no amount.
          { title: 'Date', dataIndex: 'date', render: (v) => fmtDate(v) },
          { title: 'Vehicle reg no', dataIndex: ['asset', 'registrationNo'], render: (v) => v ?? '—' },
          { title: 'Driver name', render: (_: any, r: any) => r.driver ? `${r.driver.firstName} ${r.driver.surname}` : '—' },
          { title: 'Reason for the traffic fine', dataIndex: 'reason' },
          {
            title: 'Corrective actions taken', dataIndex: 'correctiveActionsTaken',
            render: (v) => v ?? <RagTag status="AMBER" label="none recorded" size="sm" />,
          },
          { title: 'Notice', dataIndex: 'noticeNumber', render: (v) => v ?? '—' },
        ]}
      />
    </Card>
  );
}
