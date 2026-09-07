'use client';

import {
  AlertOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  IdcardOutlined,
  ImportOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ToolOutlined,
  TruckOutlined,
} from '@ant-design/icons';
import { Dropdown, Form, Input, Layout, Menu, Modal, Typography, message } from 'antd';
import api from '../_lib/api';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SessionUser, clearSession, getUser, hasRole } from '../_lib/auth';
import GlobalSearch from './GlobalSearch';
import PodLogo from './PodLogo';

const { Header, Sider, Content } = Layout;

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  CONSULTANT: 'Consultant',
  VIEWER: 'Viewer',
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwForm] = Form.useForm();

  const changePassword = async (vals: any) => {
    setPwBusy(true);
    try {
      await api.post('/api/auth/change-password', { current: vals.current, next: vals.next });
      message.success('Password changed');
      setPwOpen(false);
      pwForm.resetFields();
    } catch (e: any) {
      message.error(e.response?.data?.message ?? 'Could not change password');
    } finally {
      setPwBusy(false);
    }
  };

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setUser(u);
    setChecked(true);
  }, [router]);

  const logout = () => {
    clearSession();
    router.replace('/login');
  };

  const menuItems = [
    { key: '/fleet', icon: <AppstoreOutlined />, label: 'Fleet' },
    { key: '/reports', icon: <BarChartOutlined />, label: 'Reports' },
    ...(hasRole('ADMIN', user)
      ? [
          { key: '/import', icon: <ImportOutlined />, label: 'Import' },
          { key: '/team', icon: <TeamOutlined />, label: 'Team' },
        ]
      : []),
    // RTMS Fleet & Compliance. Grouped so the deals board above stays the
    // primary surface — these are POD's own trucks, not customers' cars.
    { type: 'divider' as const, key: 'rtms-divider', style: { margin: '10px 14px', background: 'rgba(255,255,255,0.07)' } },
    { key: '/compliance', icon: <SafetyCertificateOutlined />, label: 'Compliance' },
    { key: '/assets', icon: <TruckOutlined />, label: 'Assets' },
    { key: '/drivers', icon: <IdcardOutlined />, label: 'Drivers' },
    { key: '/maintenance', icon: <ToolOutlined />, label: 'Maintenance' },
    { key: '/trips', icon: <AppstoreOutlined />, label: 'Trips' },
    { key: '/incidents', icon: <AlertOutlined />, label: 'Incidents' },
    { key: '/audit', icon: <AuditOutlined />, label: 'Audit' },
  ];

  // Longest match wins, so /fleet does not swallow other routes.
  const selectedKey =
    menuItems
      .filter((m): m is { key: string; icon: any; label: string } => 'label' in m)
      .filter((m) => pathname === m.key || pathname.startsWith(m.key + '/'))
      .sort((a, b) => b.key.length - a.key.length)[0]?.key ?? '/fleet';

  if (!checked) return <div style={{ minHeight: '100vh', background: '#F6F6F3' }} />;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        className="pod-sider"
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={222}
        style={{
          background: 'linear-gradient(180deg, #0D1729 0%, #0B1220 100%)',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'auto',
        }}
      >
        <PodLogo collapsed={collapsed} />

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
          style={{ background: 'transparent', border: 'none', padding: '4px 8px', fontWeight: 500 }}
        />

        <div style={{ position: 'absolute', bottom: 18, left: 0, right: 0, padding: '0 22px' }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 12 }} />
          <Typography.Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, letterSpacing: '0.12em' }}>
            {collapsed ? '0.1' : 'v0.1 · PILOT'}
          </Typography.Text>
        </div>
      </Sider>

      <Layout>
        {/* Header melts into the canvas — the search pill and user chip float */}
        <Header
          style={{
            background: '#F6F6F3',
            padding: '0 28px',
            height: 68,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            border: 'none',
          }}
        >
          <div
            onClick={() => setCollapsed(!collapsed)}
            style={{
              cursor: 'pointer',
              fontSize: 15,
              color: '#98A0AC',
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              flexShrink: 0,
            }}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>

          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0 12px', lineHeight: 'normal' }}>
            <GlobalSearch />
          </div>

          {user && (
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'signed-in',
                    label: (
                      <div style={{ padding: '2px 0' }}>
                        <div style={{ fontWeight: 600, color: '#171B26' }}>{user.fullName}</div>
                        <div style={{ fontSize: 11, color: '#98A0AC' }}>
                          @{user.username} · {ROLE_LABEL[user.role]}
                        </div>
                      </div>
                    ),
                    disabled: true,
                  },
                  { type: 'divider' },
                  {
                    key: 'password',
                    icon: <KeyOutlined />,
                    label: 'Change password',
                    onClick: () => setPwOpen(true),
                  },
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: 'Sign out',
                    onClick: logout,
                  },
                ],
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  background: '#FFFFFF',
                  border: '1px solid #E9E9E4',
                  borderRadius: 999,
                  padding: '5px 14px 5px 6px',
                  boxShadow: '0 1px 2px rgba(16,24,40,.05)',
                  lineHeight: 'normal',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: '#101828',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                  }}
                >
                  {user.fullName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#171B26' }}>{user.fullName}</div>
                  <div style={{ fontSize: 9.5, color: '#98A0AC', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {ROLE_LABEL[user.role]}
                  </div>
                </div>
              </div>
            </Dropdown>
          )}
        </Header>

        <Content style={{ padding: '8px 28px 32px', background: '#F6F6F3', minHeight: 'calc(100vh - 68px)' }}>
          {children}
        </Content>
      </Layout>

      <Modal title="Change password" open={pwOpen} onCancel={() => setPwOpen(false)}
        onOk={() => pwForm.submit()} confirmLoading={pwBusy} okText="Change">
        <Form form={pwForm} layout="vertical" onFinish={changePassword} style={{ marginTop: 16 }}>
          <Form.Item name="current" label="Current password" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="next" label="New password" rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="confirm" label="Confirm new password" dependencies={['next']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator: (_, v) =>
                  v === getFieldValue('next') ? Promise.resolve() : Promise.reject(new Error('Passwords do not match')),
              }),
            ]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
