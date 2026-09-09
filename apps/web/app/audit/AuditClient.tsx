'use client';

import {
  AuditOutlined, CheckCircleOutlined, PlusOutlined, ReadOutlined, WarningOutlined,
} from '@ant-design/icons';
import {
  Button, Card, Col, DatePicker, Empty, Form, Input, Modal, Row, Select,
  Table, Tabs, Typography, message,
} from 'antd';
import { useState } from 'react';
import api from '../_lib/api';
import { hasRole } from '../_lib/auth';
import {
  useAudits, useCorrectiveActions, useFleetMutation, useReviews,
  useTrainingCourses, useTrainingRecords, useDrivers,
} from '../_lib/hooks/useFleet';
import { useUsers } from '../_lib/hooks/useReference';
import RagTag, { KpiCard, PageHeader } from '../_components/RagTag';

const { Text } = Typography;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

const CONFORMITY: Record<string, { label: string; rag: string }> = {
  CONFORMS: { label: 'Conforms', rag: 'GREEN' },
  OBSERVATION: { label: 'Observation', rag: 'NEUTRAL' },
  MINOR_NON_CONFORMANCE: { label: 'Minor non-conformance', rag: 'AMBER' },
  MAJOR_NON_CONFORMANCE: { label: 'Major non-conformance', rag: 'RED' },
};

const ELEMENTS = [
  'MANAGEMENT_COMMITMENT', 'RISK_MANAGEMENT', 'VEHICLE_FITNESS', 'DRIVER_WELLNESS',
  'LOAD_MANAGEMENT', 'JOURNEY_MANAGEMENT', 'INCIDENT_MANAGEMENT', 'MONITORING_REVIEW',
].map((e, i) => ({ value: e, label: `${i + 1}. ${e.replace(/_/g, ' ').toLowerCase()}` }));

// RTMS element 8: the internal audit, the management review it feeds, and the
// corrective actions both raise. The manual calls the register R9.
export default function AuditClient() {
  const { data: actions = [] } = useCorrectiveActions();
  const { data: audits = [] } = useAudits();
  const overdue = actions.filter(
    (a: any) => a.dueDate && new Date(a.dueDate) < new Date() && (a.status === 'OPEN' || a.status === 'IN_PROGRESS'),
  );
  const open = actions.filter((a: any) => a.status === 'OPEN' || a.status === 'IN_PROGRESS');
  const findings = audits.flatMap((a: any) => a.findings ?? []);
  const majors = findings.filter((f: any) => f.conformity === 'MAJOR_NON_CONFORMANCE').length;

  return (
    <>
      <PageHeader
        title="Audit and review"
        subtitle="RTMS element 8 — internal audit, management review, and the corrective action register (R9)"
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 18 }}>
        <Col xs={12} md={6}><KpiCard icon={<AuditOutlined />} label="Audits" value={audits.length} accent="#0E1B2A" tint="#EDF1F6" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Major non-conformances" value={majors} accent="#B42318" tint="#FEE4E2" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<CheckCircleOutlined />} label="Actions open" value={open.length} accent="#9A6208" tint="#FCF3E1" /></Col>
        <Col xs={12} md={6}><KpiCard icon={<WarningOutlined />} label="Actions overdue" value={overdue.length} accent="#B42318" tint="#FEE4E2" /></Col>
      </Row>

      <Tabs
        items={[
          { key: 'actions', label: `Corrective actions (R9) — ${actions.length}`, children: <ActionsTab /> },
          { key: 'audits', label: `Internal audits (${audits.length})`, children: <AuditsTab /> },
          { key: 'training', label: 'Driver training', children: <TrainingTab /> },
          { key: 'reviews', label: 'Management reviews', children: <ReviewsTab /> },
        ]}
      />
    </>
  );
}

function ActionsTab() {
  const { data = [], isLoading } = useCorrectiveActions();
  const { data: users = [] } = useUsers();
  const canEdit = hasRole('CONSULTANT');
  const update = useFleetMutation(({ actionId, ...body }: any) =>
    api.patch(`/api/incidents/actions/${actionId}`, body).then((r) => r.data),
  );

  return (
    <>
      <Text style={{ fontSize: 12, color: '#98A0AC', display: 'block', marginBottom: 12 }}>
        One register for every corrective action, whatever raised it — an incident, an audit finding,
        a traffic fine, or a breach of the fatigue policy.
      </Text>
      <Card size="small" style={{ borderRadius: 14, border: '1px solid #E3E9EF' }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id" loading={isLoading} dataSource={data} scroll={{ x: 'max-content' }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: <Empty description="No corrective actions raised" /> }}
          columns={[
            { title: 'Raised', dataIndex: 'createdAt', render: (v) => fmtDate(v) },
            {
              title: 'Source', dataIndex: 'sourceType',
              render: (v: string) => <RagTag status="NEUTRAL" label={v.replace(/_/g, ' ').toLowerCase()} dot={false} size="sm" />,
            },
            {
              title: 'Raised by',
              render: (_: any, r: any) =>
                r.incident?.reference ??
                r.fine?.noticeNumber ??
                r.auditFinding?.description?.slice(0, 40) ??
                (r.driver ? `${r.driver.firstName} ${r.driver.surname}` : '—'),
            },
            { title: 'Corrective action', dataIndex: 'description' },
            { title: 'Owner', dataIndex: 'ownerUserId', render: (v) => users.find((u: any) => u.id === v)?.fullName ?? '—' },
            {
              title: 'Due', dataIndex: 'dueDate',
              render: (v: string | null, r: any) => {
                if (!v) return '—';
                const late = new Date(v) < new Date() && (r.status === 'OPEN' || r.status === 'IN_PROGRESS');
                return <Text style={{ color: late ? '#B42318' : '#616875', fontWeight: late ? 600 : 400 }}>{fmtDate(v)}</Text>;
              },
            },
            {
              title: 'Status', dataIndex: 'status',
              render: (v, r: any) => canEdit ? (
                <Select
                  size="small" value={v} style={{ width: 130 }}
                  onChange={(status) => update.mutate({ actionId: r.id, status }, {
                    onSuccess: () => message.success('Action updated'),
                    onError: () => message.error('Could not update the action'),
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
      </Card>
    </>
  );
}

function AuditsTab() {
  const { data = [], isLoading } = useAudits();
  const [open, setOpen] = useState(false);
  const [findingFor, setFindingFor] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [findingForm] = Form.useForm();
  const canEdit = hasRole('ADMIN');

  const create = useFleetMutation((v: any) => api.post('/api/compliance/audits', v).then((r) => r.data), [['compliance', 'audits']]);
  const addFinding = useFleetMutation(({ auditId, ...v }: any) =>
    api.post(`/api/compliance/audits/${auditId}/findings`, v).then((r) => r.data), [['compliance', 'audits']]);

  return (
    <>
      {canEdit && (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)} style={{ borderRadius: 10, marginBottom: 12 }}>
          Schedule audit
        </Button>
      )}
      <Card size="small" style={{ borderRadius: 14, border: '1px solid #E3E9EF' }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id" loading={isLoading} dataSource={data} pagination={false} scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="No internal audits scheduled" /> }}
          expandable={{
            expandedRowRender: (r: any) => (
              <>
                <Table
                  rowKey="id" size="small" pagination={false} dataSource={r.findings}
                  locale={{ emptyText: 'No findings recorded' }}
                  columns={[
                    { title: 'Element', dataIndex: 'rtmsElement', render: (v: string) => v.replace(/_/g, ' ').toLowerCase() },
                    {
                      title: 'Conformity', dataIndex: 'conformity',
                      render: (v: string) => <RagTag status={CONFORMITY[v]?.rag} label={CONFORMITY[v]?.label ?? v} size="sm" />,
                    },
                    { title: 'Finding', dataIndex: 'description' },
                    { title: 'Evidence', dataIndex: 'evidence', render: (v) => v ?? '—' },
                    { title: 'Actions', render: (_: any, f: any) => (f.correctiveActions ?? []).length },
                  ]}
                />
                {canEdit && (
                  <Button size="small" style={{ borderRadius: 8, marginTop: 10 }} onClick={() => setFindingFor(r.id)}>
                    Add finding
                  </Button>
                )}
              </>
            ),
          }}
          columns={[
            { title: 'Reference', dataIndex: 'reference', render: (v) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
            { title: 'Scheduled', dataIndex: 'scheduledFor', render: (v) => fmtDate(v) },
            { title: 'Conducted', dataIndex: 'conductedOn', render: (v) => fmtDate(v) },
            { title: 'Auditor', dataIndex: 'auditorName', render: (v) => v ?? '—' },
            { title: 'Scope', dataIndex: 'scope', render: (v) => v ?? '—' },
            { title: 'Findings', render: (_: any, r: any) => (r.findings ?? []).length, align: 'right' as const },
          ]}
        />
      </Card>

      <Modal title="Schedule internal audit" open={open} onCancel={() => setOpen(false)}
        onOk={() => form.submit()} confirmLoading={create.isPending} okText="Schedule">
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}
          onFinish={(v) => create.mutate(
            { ...v, scheduledFor: v.scheduledFor.toISOString(), conductedOn: v.conductedOn?.toISOString() ?? null },
            { onSuccess: () => { message.success('Audit scheduled'); setOpen(false); form.resetFields(); },
              onError: () => message.error('Could not schedule the audit') },
          )}>
          <Form.Item name="scheduledFor" label="Scheduled for" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="conductedOn" label="Conducted on"><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="auditorName" label="Auditor"><Input /></Form.Item>
          <Form.Item name="scope" label="Scope"><Input.TextArea rows={3} placeholder="Which RTMS elements this audit covers" /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Add finding" open={!!findingFor} onCancel={() => setFindingFor(null)}
        onOk={() => findingForm.submit()} confirmLoading={addFinding.isPending} okText="Add">
        <Form form={findingForm} layout="vertical" style={{ marginTop: 16 }}
          onFinish={(v) => addFinding.mutate({ auditId: findingFor, ...v }, {
            onSuccess: () => { message.success('Finding recorded'); setFindingFor(null); findingForm.resetFields(); },
            onError: () => message.error('Could not record the finding'),
          })}>
          <Form.Item name="rtmsElement" label="RTMS element" rules={[{ required: true }]}>
            <Select options={ELEMENTS} />
          </Form.Item>
          <Form.Item name="conformity" label="Conformity" rules={[{ required: true }]}>
            <Select options={Object.entries(CONFORMITY).map(([value, c]) => ({ value, label: c.label }))} />
          </Form.Item>
          <Form.Item name="description" label="Finding" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="evidence" label="Evidence"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function TrainingTab() {
  const { data: records = [], isLoading } = useTrainingRecords();
  const { data: courses = [] } = useTrainingCourses();
  const { data: drivers = [] } = useDrivers();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const canEdit = hasRole('CONSULTANT');
  const record = useFleetMutation((v: any) => api.post('/api/compliance/training/records', v).then((r) => r.data));

  return (
    <>
      <Text style={{ fontSize: 12, color: '#98A0AC', display: 'block', marginBottom: 12 }}>
        The manual commits POD to defensive driver training on a bi-annual basis using module M1.
        A completed course sets a refresher due date, which appears on the compliance dashboard
        alongside licences and medicals.
      </Text>
      {canEdit && (
        <Button type="primary" icon={<ReadOutlined />} onClick={() => setOpen(true)} style={{ borderRadius: 10, marginBottom: 12 }}>
          Record training
        </Button>
      )}
      <Card size="small" style={{ borderRadius: 14, border: '1px solid #E3E9EF' }} styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id" loading={isLoading} dataSource={records} pagination={false} scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="No training recorded" /> }}
          columns={[
            { title: 'Driver', render: (_: any, r: any) => `${r.driver.firstName} ${r.driver.surname}` },
            { title: 'Employee no', dataIndex: ['driver', 'employeeNo'] },
            { title: 'Course', dataIndex: ['course', 'name'] },
            { title: 'Completed', dataIndex: 'completedOn', render: (v) => fmtDate(v) },
            { title: 'Refresher due', dataIndex: 'expiresOn', render: (v) => fmtDate(v) },
            { title: 'Trainer', dataIndex: 'trainerName', render: (v) => v ?? '—' },
            { title: 'Outcome', dataIndex: 'outcome', render: (v) => v ?? '—' },
          ]}
        />
      </Card>

      <Modal title="Record driver training" open={open} onCancel={() => setOpen(false)}
        onOk={() => form.submit()} confirmLoading={record.isPending} okText="Record">
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}
          onFinish={(v) => record.mutate({ ...v, completedOn: v.completedOn.toISOString() }, {
            onSuccess: () => { message.success('Training recorded'); setOpen(false); form.resetFields(); },
            onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not record the training'),
          })}>
          <Form.Item name="driverId" label="Driver" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label"
              options={drivers.map((d: any) => ({ value: d.id, label: `${d.firstName} ${d.surname}` }))} />
          </Form.Item>
          <Form.Item name="courseId" label="Course" rules={[{ required: true }]}>
            <Select options={courses.map((c: any) => ({ value: c.id, label: `${c.code} — ${c.name}` }))} />
          </Form.Item>
          <Form.Item name="completedOn" label="Completed on" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="trainerName" label="Trainer"><Input /></Form.Item>
          <Form.Item name="outcome" label="Outcome"><Input placeholder="Pass / score / competency note" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function ReviewsTab() {
  const { data = [], isLoading } = useReviews();
  return (
    <Card size="small" style={{ borderRadius: 14, border: '1px solid #E3E9EF' }} styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="id" loading={isLoading} dataSource={data} pagination={false} scroll={{ x: 'max-content' }}
        locale={{ emptyText: <Empty description="No management review generated yet — one is produced automatically on the 1st of each month" /> }}
        columns={[
          { title: 'Period', dataIndex: 'periodMonth', render: (v) => <Text strong style={{ fontSize: 13 }}>{v}</Text> },
          { title: 'Generated', dataIndex: 'generatedAt', render: (v) => fmtDate(v) },
          // The six R17 columns, straight from the stored snapshot.
          { title: 'Accidents', render: (_: any, r: any) => r.metrics?.r17?.accidentsIncidents ?? '—', align: 'right' as const },
          { title: 'Speed violations', render: (_: any, r: any) => r.metrics?.r17?.speedViolations ?? '—', align: 'right' as const },
          { title: 'Traffic fines', render: (_: any, r: any) => r.metrics?.r17?.trafficFines ?? '—', align: 'right' as const },
          { title: 'Excessive hours', render: (_: any, r: any) => r.metrics?.r17?.excessiveHours ?? '—', align: 'right' as const },
          { title: 'Service overruns', render: (_: any, r: any) => r.metrics?.r17?.serviceOverruns ?? '—', align: 'right' as const },
          { title: 'Overloads', render: (_: any, r: any) => r.metrics?.r17?.overloads ?? '—', align: 'right' as const },
          { title: 'Reviewed', dataIndex: 'reviewedAt', render: (v) => v ? fmtDate(v) : <RagTag status="AMBER" label="not reviewed" size="sm" /> },
        ]}
      />
    </Card>
  );
}
