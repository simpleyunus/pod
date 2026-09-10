'use client';

import { KeyOutlined, PlusOutlined, UserAddOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Typography,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import AppShell from '../_components/AppShell';
import { RagDot, RAG_TONES } from '../_components/RagTag';
import api from '../_lib/api';
import { getUser, hasRole } from '../_lib/auth';

const { Text } = Typography;

const ROLE_OPTIONS = [
  { value: 'VIEWER', label: 'Viewer — read-only' },
  { value: 'CONSULTANT', label: 'Consultant — update deals & clients' },
  { value: 'ADMIN', label: 'Admin — imports & team management' },
  { value: 'OWNER', label: 'Owner — everything' },
];

// Role is a rank, not a health state, so it reads as one slate ramp — darkest
// at the top. It used to be red for OWNER and green for CONSULTANT, which
// borrowed the traffic-light hues to say something they do not mean.
const ROLE_PILL: Record<string, { bg: string; text: string }> = {
  OWNER:      { bg: '#C9D6E2', text: '#17293C' },
  ADMIN:      { bg: '#DAE3EC', text: '#22344A' },
  CONSULTANT: { bg: '#E7EDF3', text: '#33495F' },
  VIEWER:     { bg: '#F2F5F8', text: '#3A4150' },
};

export default function TeamPage() {
  const qc = useQueryClient();
  const me = getUser();
  const isOwner = hasRole('OWNER', me);

  const { data: users, isLoading } = useQuery({
    queryKey: ['team-users'],
    queryFn: () => api.get('/api/users').then((r) => r.data),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [resetting, setResetting] = useState<any | null>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [resetForm] = Form.useForm();

  const invalidate = () => qc.invalidateQueries({ queryKey: ['team-users'] });

  const createUser = useMutation({
    mutationFn: (data: any) => api.post('/api/users', data).then((r) => r.data),
    onSuccess: () => {
      message.success('User created');
      setCreateOpen(false);
      createForm.resetFields();
      invalidate();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not create user'),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.patch(`/api/users/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      message.success('User updated');
      setEditing(null);
      invalidate();
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not update user'),
  });

  // Nobody can e-mail a reset link from POD, so a "forgot password" click ends
  // up here: the people who can actually fix it, on the page where the fix is.
  const { data: resetRequests } = useQuery<any[]>({
    queryKey: ['reset-requests'],
    queryFn: () => api.get('/api/users/reset-requests').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const dismissRequest = useMutation({
    mutationFn: (userId: string) =>
      api.post(`/api/users/${userId}/dismiss-reset-request`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reset-requests'] }),
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not dismiss'),
  });

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post(`/api/users/${id}/reset-password`, { password }).then((r) => r.data),
    onSuccess: () => {
      message.success('Password reset');
      setResetting(null);
      resetForm.resetFields();
      qc.invalidateQueries({ queryKey: ['reset-requests'] });
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not reset password'),
  });

  // Admins can't touch accounts at or above their own rank; owners can touch everyone.
  const canManage = (target: any) =>
    isOwner || (['VIEWER', 'CONSULTANT'].includes(target.role) && target.id !== me?.id);

  const roleChoices = ROLE_OPTIONS.filter((o) =>
    isOwner ? true : ['VIEWER', 'CONSULTANT'].includes(o.value),
  );

  const columns = [
    {
      title: 'Name',
      key: 'name',
      render: (_: any, r: any) => (
        <div>
          <div style={{ fontWeight: 600, color: '#171B26', fontSize: 13 }}>
            {r.fullName}
            {r.id === me?.id && <Text style={{ fontSize: 11, color: '#98A0AC', marginLeft: 6 }}>(you)</Text>}
          </div>
          <div style={{ fontSize: 11, color: '#98A0AC' }}>@{r.username ?? '—'}{r.email ? ` · ${r.email}` : ''}</div>
        </div>
      ),
    },
    {
      title: 'Role',
      key: 'role',
      width: 130,
      render: (_: any, r: any) => {
        const p = ROLE_PILL[r.role];
        return (
          <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: p.bg, color: p.text }}>
            {r.role}
          </span>
        );
      },
    },
    {
      title: 'Deals',
      key: 'deals',
      width: 80,
      render: (_: any, r: any) => (
        <Text style={{ fontSize: 12, color: '#616875' }}>{r._count?.dealsResponsible ?? 0}</Text>
      ),
    },
    {
      title: 'Active',
      key: 'active',
      width: 90,
      render: (_: any, r: any) => (
        <Switch
          size="small"
          checked={r.active}
          disabled={!canManage(r)}
          onChange={(v) => updateUser.mutate({ id: r.id, data: { active: v } })}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 190,
      render: (_: any, r: any) =>
        canManage(r) ? (
          <Space size={4}>
            <Button size="small" type="text" style={{ fontSize: 12, color: '#0E1B2A' }}
              onClick={() => {
                setEditing(r);
                editForm.setFieldsValue({ fullName: r.fullName, email: r.email, role: r.role });
              }}>
              Edit
            </Button>
            <Button size="small" type="text" icon={<KeyOutlined />} style={{ fontSize: 12, color: '#3A5570' }}
              onClick={() => setResetting(r)}>
              Reset password
            </Button>
          </Space>
        ) : null,
    },
  ];

  return (
    <AppShell>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 700, color: '#171B26', letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>Team</div>
            <div style={{ fontSize: 12, color: '#98A0AC', marginTop: 2 }}>Accounts, roles & access</div>
          </div>
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setCreateOpen(true)}>
            Add user
          </Button>
        </div>

        {(resetRequests?.length ?? 0) > 0 && (
          <Card
            size="small"
            style={{ borderRadius: 12, border: `1px solid ${RAG_TONES.AMBER.dot}55`, background: RAG_TONES.AMBER.bg }}
            styles={{ body: { padding: '11px 14px' } }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <RagDot rag="AMBER" title="Waiting on you" size={8} />
              <Text style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: RAG_TONES.AMBER.text }}>
                Password reset requested
              </Text>
            </div>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {resetRequests!.map((r) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 12.5, color: '#171B26' }}>
                    <strong>{r.user.fullName}</strong>
                    <span style={{ color: '#98A0AC' }}> @{r.user.username} · {new Date(r.requestedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </Text>
                  <Space size={4} style={{ marginLeft: 'auto' }}>
                    <Button
                      size="small"
                      type="primary"
                      icon={<KeyOutlined />}
                      disabled={!canManage(r.user)}
                      title={canManage(r.user) ? undefined : 'Only an owner can reset this account'}
                      onClick={() => setResetting(r.user)}
                    >
                      Set new password
                    </Button>
                    <Button
                      size="small"
                      type="text"
                      style={{ color: '#98A0AC', fontSize: 12 }}
                      loading={dismissRequest.isPending}
                      onClick={() => dismissRequest.mutate(r.user.id)}
                    >
                      Dismiss
                    </Button>
                  </Space>
                </div>
              ))}
            </Space>
          </Card>
        )}

        <Card style={{ borderRadius: 14, border: '1px solid #E3E9EF' }} styles={{ body: { padding: 0 } }}>
          <Table
            dataSource={users ?? []}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            size="middle"
            pagination={false}
          />
        </Card>
      </Space>

      {/* Create user */}
      <Modal
        title="Add user"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createUser.isPending}
        okText="Create"
        okButtonProps={{ icon: <PlusOutlined /> }}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}
          onFinish={(vals) => createUser.mutate(vals)}>
          <Form.Item name="fullName" label="Full name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="username" label="Username" rules={[{ required: true, min: 3 }]}
            extra="Lowercase; letters, numbers, dots and dashes">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email (optional)" rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]} initialValue="CONSULTANT">
            <Select options={roleChoices} />
          </Form.Item>
          <Form.Item name="password" label="Initial password" rules={[{ required: true, min: 8 }]}
            extra="At least 8 characters — they can change it after signing in">
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit user */}
      <Modal
        title={`Edit ${editing?.fullName ?? ''}`}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
        confirmLoading={updateUser.isPending}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}
          onFinish={(vals) => updateUser.mutate({ id: editing.id, data: vals })}>
          <Form.Item name="fullName" label="Full name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={roleChoices} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Reset password */}
      <Modal
        title={`Reset password — ${resetting?.fullName ?? ''}`}
        open={!!resetting}
        onCancel={() => { setResetting(null); resetForm.resetFields(); }}
        onOk={() => resetForm.submit()}
        confirmLoading={resetPassword.isPending}
        okText="Reset"
      >
        <Form form={resetForm} layout="vertical" style={{ marginTop: 16 }}
          onFinish={(vals) => resetPassword.mutate({ id: resetting.id, password: vals.password })}>
          <Form.Item name="password" label="New password" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </AppShell>
  );
}
