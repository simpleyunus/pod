'use client';

import {
  ArrowLeftOutlined,
  CopyOutlined,
  DollarOutlined,
  DownloadOutlined,
  PaperClipOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FileOutlined,
  InboxOutlined,
  LinkOutlined,
  MessageOutlined,
  PictureOutlined,
  SwapOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import AppShell from '../../_components/AppShell';
import MilestoneBar from '../../_components/MilestoneBar';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../_lib/api';
import { stageToneById, FALLBACK_STAGE_TONE } from '../../_lib/stageTone';
import { hasRole } from '../../_lib/auth';
import { useDeal } from '../../_lib/hooks/useDeals';
import {
  useAddDocument,
  useAddNote,
  useAddPayment,
  useChangeLocation,
  useChangeStatus,
  useUpdateClient,
  useUpdateDocument,
  useUploadDocumentFile,
  useUploadMedia,
} from '../../_lib/hooks/useMutations';
import { useLocations, useStatuses, useUsers } from '../../_lib/hooks/useReference';
import {
  useCreateTrackingLink,
  useDealNotifications,
  useNotifyWhatsApp,
  useTrackingLink,
  useUpdateTrackingLink,
} from '../../_lib/hooks/useTracking';

const { Text, Title } = Typography;

const PAYMENT_PILL: Record<string, { color: string; bg: string }> = {
  PAID:    { color: '#067647', bg: '#E6F6EE' },
  PARTIAL: { color: '#9A6208', bg: '#FCF3E1' },
  UNPAID:  { color: '#B42318', bg: '#FEECEB' },
};

// The icons already tell these apart, so colour is free to say something
// else: weight. A slate ramp runs from the most consequential event to the
// least, and money coming in is the one entry that earns a hue of its own.
const EVENT_ICON: Record<string, { icon: React.ReactNode; color: string }> = {
  STATUS_CHANGE:   { icon: <SwapOutlined />,        color: '#2C4255' },
  LOCATION_CHANGE: { icon: <EnvironmentOutlined />, color: '#3A5570' },
  PAYMENT:         { icon: <DollarOutlined />,      color: '#12B76A' },
  DOCUMENT:        { icon: <FileOutlined />,        color: '#5A6876' },
  MEDIA:           { icon: <PictureOutlined />,     color: '#7089A0' },
  NOTE:            { icon: <MessageOutlined />,     color: '#93A0AD' },
  SYSTEM:          { icon: <SwapOutlined />,        color: '#C3C9D2' },
};

const DOC_TYPES = [
  'NATIS','POLICE_CLEARANCE','ITAC','CBCA','SAD500',
  'BILL_OF_LADING','SUPPLIER_INVOICE','SALES_INVOICE','OTHER',
];

function fmt(amount: number | null | undefined, currency?: string | null) {
  if (amount == null) return '—';
  return `${currency ?? ''} ${Number(amount).toLocaleString()}`.trim();
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid #EDF1F6' }}>
      <Text style={{ fontSize: 10, color: '#98A0AC', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.7 }}>{label}</Text>
      <Text style={{ fontSize: 13, color: '#171B26', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value ?? '—'}</Text>
    </div>
  );
}

const cardStyle: React.CSSProperties = { borderRadius: 14, border: '1px solid #E3E9EF' };

// Actions wear the signal accent; structure stays ink and paper.
const actionBtn: React.CSSProperties = {
  color: '#C13A26',
  background: '#FDEDE9',
  borderColor: '#F6C9BE',
  fontWeight: 600,
};

function SectionTitle({ label, count }: { label: string; count?: number }) {
  return (
    <Text style={{ fontSize: 10, fontWeight: 700, color: '#98A0AC', textTransform: 'uppercase', letterSpacing: 1.2 }}>
      {label}
      {typeof count === 'number' && (
        <span style={{ marginLeft: 6, color: '#98A0AC', fontWeight: 600 }}>{count}</span>
      )}
    </Text>
  );
}

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: deal, isLoading } = useDeal(id);
  const { data: statuses } = useStatuses();
  const { data: locations } = useLocations();
  const { data: users } = useUsers();
  const qc = useQueryClient();

  const changeStatus = useChangeStatus(id);
  const changeLocation = useChangeLocation(id);
  const addPayment = useAddPayment(id);
  const addNote = useAddNote(id);
  const addDocument = useAddDocument(id);
  const updateDocument = useUpdateDocument(id);
  const uploadMedia = useUploadMedia(id);
  const uploadDocFile = useUploadDocumentFile(id);
  const updateClient = useUpdateClient(id);

  const { data: trackingLink } = useTrackingLink(id);
  const createTrackingLink = useCreateTrackingLink(id);
  const updateTrackingLink = useUpdateTrackingLink(id);
  const notifyWhatsApp = useNotifyWhatsApp(id);
  const { data: dealNotifications } = useDealNotifications(id);

  const canWrite = hasRole('CONSULTANT');

  const updateDeal = useMutation({
    mutationFn: (data: any) => api.patch(`/api/deals/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal', id] });
      qc.invalidateQueries({ queryKey: ['deals'] });
      message.success('Deal updated');
      setEditDrawer(false);
    },
    onError: (e: any) => message.error(e.response?.data?.message ?? 'Could not update the deal'),
  });

  const [statusModal, setStatusModal] = useState(false);
  const [locationModal, setLocationModal] = useState(false);
  const [paymentDrawer, setPaymentDrawer] = useState(false);
  const [noteModal, setNoteModal] = useState(false);
  const [clientModal, setClientModal] = useState(false);
  const [editDrawer, setEditDrawer] = useState(false);
  const [editForm] = Form.useForm();
  const [statusForm] = Form.useForm();
  const [locationForm] = Form.useForm();
  const [paymentForm] = Form.useForm();
  const [noteForm] = Form.useForm();
  const [clientForm] = Form.useForm();

  if (isLoading)
    return <AppShell><div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spin /></div></AppShell>;
  if (!deal)
    return <AppShell><Text type="secondary">Deal not found.</Text></AppShell>;

  const paid = deal.payments?.reduce((s: number, p: any) => s + Number(p.amount), 0) ?? 0;
  const balance = deal.sellingPrice ? Number(deal.sellingPrice) - paid : null;
  const payStatus = paid <= 0 ? 'UNPAID' : balance !== null && balance <= 0 ? 'PAID' : 'PARTIAL';
  const payCfg = PAYMENT_PILL[payStatus];
  const statusCfg = deal.currentStatus ? stageToneById(deal.currentStatus.id, statuses) : null;
  const paidPct = deal.sellingPrice ? Math.min(100, Math.round((paid / Number(deal.sellingPrice)) * 100)) : 0;

  const handleChangeStatus = async (vals: any) => {
    await changeStatus.mutateAsync(vals);
    message.success('Status updated');
    setStatusModal(false);
    statusForm.resetFields();
  };
  const handleChangeLocation = async (vals: any) => {
    await changeLocation.mutateAsync(vals);
    message.success('Location updated');
    setLocationModal(false);
    locationForm.resetFields();
  };
  const handleAddPayment = async (vals: any) => {
    await addPayment.mutateAsync({ ...vals, paidAt: vals.paidAt?.toISOString() ?? new Date().toISOString() });
    message.success('Payment recorded');
    setPaymentDrawer(false);
    paymentForm.resetFields();
  };
  const handleAddNote = async (vals: any) => {
    await addNote.mutateAsync({ note: vals.note, clientVisible: vals.clientVisible });
    message.success('Note added');
    setNoteModal(false);
    noteForm.resetFields();
  };
  const handleUpdateClient = async (vals: any) => {
    await updateClient.mutateAsync({ clientId: deal.client.id, data: vals });
    message.success('Client details updated');
    setClientModal(false);
  };
  const openClientModal = () => {
    clientForm.setFieldsValue({
      fullName: deal.client?.fullName,
      phoneE164: deal.client?.phoneE164,
      email: deal.client?.email,
      country: deal.client?.country,
      city: deal.client?.city,
    });
    setClientModal(true);
  };

  const openDocument = async (docId: string) => {
    const res = await api.get(`/api/deals/${id}/documents/${docId}/url`).then((r) => r.data);
    if (res.url) window.open(res.url, '_blank');
    else message.warning(`File not available (scan: ${res.scanStatus})`);
  };
  const attachDocFile = (docId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      await uploadDocFile.mutateAsync({ docId, file: f });
      message.success('File attached — scanning…');
    };
    input.click();
  };

  const clientDocs = deal.documents?.filter((d: any) => d.fromClient) ?? [];

  const openEditDrawer = () => {
    editForm.setFieldsValue({
      make: deal.make,
      model: deal.model,
      year: deal.year,
      colour: deal.colour,
      registrationNo: deal.registrationNo,
      vin: deal.vin,
      mileageKm: deal.mileageKm,
      supplier: deal.supplier,
      sourceCountry: deal.sourceCountry,
      destinationCountry: deal.destinationCountry,
      destinationCity: deal.destinationCity,
      sellingPrice: deal.sellingPrice ? Number(deal.sellingPrice) : null,
      sellingCurrency: deal.sellingCurrency ?? 'ZAR',
      expectedDeliveryDate: deal.expectedDeliveryDate ? dayjs(deal.expectedDeliveryDate) : null,
      consultantId: deal.consultantId,
    });
    setEditDrawer(true);
  };
  const handleEditDeal = (vals: any) => {
    updateDeal.mutate({
      ...vals,
      sellingPrice: vals.sellingPrice ?? null,
      expectedDeliveryDate: vals.expectedDeliveryDate ? vals.expectedDeliveryDate.toISOString() : null,
      consultantId: vals.consultantId ?? null,
    });
  };

  const trackUrl = trackingLink ? `${window.location.origin}/track/${trackingLink.token}` : null;
  const copyTrackUrl = async () => {
    if (!trackUrl) return;
    await navigator.clipboard.writeText(trackUrl);
    message.success('Customer link copied');
  };
  const sendWhatsApp = async () => {
    const n = await notifyWhatsApp.mutateAsync();
    if (n.status === 'SENT') message.success('WhatsApp update sent');
    else if (n.status === 'LOGGED') message.info('Update recorded — log mode, no WhatsApp account connected yet');
    else message.warning(`Not sent: ${n.error ?? n.status}`);
  };
  const waMeHref = deal.client?.phoneE164 && trackUrl
    ? `https://wa.me/${deal.client.phoneE164.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Hi ${deal.client.fullName.split(' ')[0]} 👋 You can follow your ${deal.make} ${deal.model} live here: ${trackUrl}`,
      )}`
    : null;
  const lastNotification = dealNotifications?.[0];

  return (
    <AppShell>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* Back link */}
        <Link href="/fleet" style={{ fontSize: 12, color: '#3A5570', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <ArrowLeftOutlined /> Fleet
        </Link>

        {/* Deal header */}
        <Card style={{ borderRadius: 16, border: '1px solid #E3E9EF' }} styles={{ body: { padding: '20px 24px' } }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <Text style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#0E1B2A', fontWeight: 700, letterSpacing: 0.5 }}>
                  {deal.reference}
                </Text>
                {statusCfg ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 6, background: statusCfg.bg, color: statusCfg.text, fontSize: 11, fontWeight: 600 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusCfg.dot }} />
                    {deal.currentStatus.name}
                  </span>
                ) : null}
                {deal.currentLocation && (
                  <Text style={{ fontSize: 11, color: '#98A0AC' }}>📍 {deal.currentLocation.name}</Text>
                )}
              </div>

              <Title level={4} style={{ margin: '0 0 4px', color: '#171B26', fontWeight: 700, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>
                {deal.make} {deal.model}{deal.year ? ` · ${deal.year}` : ''}
              </Title>

              <Space size={16} wrap>
                <Text style={{ fontSize: 12, color: '#616875' }}>
                  <UserOutlined style={{ marginRight: 4 }} />{deal.client?.fullName}
                </Text>
                {deal.consultant && (
                  <Text style={{ fontSize: 12, color: '#98A0AC' }}>via {deal.consultant.fullName}</Text>
                )}
                {deal.sellingPrice && (
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: payCfg?.bg, color: payCfg?.color }}>
                    {fmt(deal.sellingPrice, deal.sellingCurrency)} · {payStatus}
                  </span>
                )}
              </Space>
            </div>

            {canWrite && (
              <Space>
                <Button size="small" style={actionBtn} icon={<SwapOutlined />} onClick={() => setStatusModal(true)}>Status</Button>
                <Button size="small" style={actionBtn} icon={<EnvironmentOutlined />} onClick={() => setLocationModal(true)}>Location</Button>
                <Button size="small" style={actionBtn} icon={<EditOutlined />} onClick={openEditDrawer}>Edit</Button>
              </Space>
            )}
          </div>

          {/* The journey of every car — milestone strip from the concept doc */}
          {statuses?.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #EDF1F6' }}>
              <MilestoneBar statuses={statuses} currentStatusId={deal.currentStatusId} />
            </div>
          )}
        </Card>

        {/* Everything about one car, on one page */}
        <Row gutter={[16, 16]} align="stretch">
          {/* ── Left column: the car ── */}
          <Col xs={24} lg={7}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card size="small" title={<SectionTitle label="Vehicle" />} style={cardStyle}>
                <MetaRow label="Make" value={deal.make} />
                <MetaRow label="Model" value={deal.model} />
                <MetaRow label="Year" value={deal.year} />
                <MetaRow label="Colour" value={deal.colour} />
                <MetaRow label="VIN" value={deal.vin ? <Text code style={{ fontSize: 11 }}>{deal.vin}</Text> : null} />
                <MetaRow label="Reg" value={deal.registrationNo} />
                <MetaRow label="Mileage" value={deal.mileageKm ? `${deal.mileageKm.toLocaleString()} km` : null} />
              </Card>

              <Card size="small" title={<SectionTitle label="Route" />} style={cardStyle}>
                <MetaRow label="Supplier" value={deal.supplier} />
                <MetaRow label="From" value={deal.sourceCountry} />
                <MetaRow label="Destination" value={[deal.destinationCity, deal.destinationCountry].filter(Boolean).join(', ')} />
                <MetaRow label="Est. delivery" value={deal.expectedDeliveryDate ? new Date(deal.expectedDeliveryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null} />
              </Card>

              <Card size="small" title={<SectionTitle label="Photos" count={deal.media?.length ?? 0} />} style={cardStyle}>
                {canWrite && (
                  <div
                    onClick={() => document.getElementById('media-input')?.click()}
                    style={{ border: '1.5px dashed #E3E9EF', borderRadius: 10, padding: '16px 12px', textAlign: 'center', cursor: 'pointer', background: '#FAFAF7', marginBottom: deal.media?.length ? 10 : 0 }}
                  >
                    <InboxOutlined style={{ fontSize: 22, color: '#C3C9D2' }} />
                    <div style={{ marginTop: 4 }}>
                      <Text style={{ fontSize: 12, color: '#98A0AC' }}>Drop photo or video, or click</Text>
                    </div>
                    <Text style={{ fontSize: 10, color: '#C3C9D2' }}>Scanned by ClamAV · PNG, JPG, MP4</Text>
                    <input id="media-input" type="file" accept="image/*,video/*" style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) { uploadMedia.mutate(f); message.info('Uploading…'); }
                      }} />
                  </div>
                )}
                {!deal.media?.length && !canWrite && (
                  <Text style={{ fontSize: 12, color: '#98A0AC' }}>No photos yet.</Text>
                )}
                <Row gutter={[8, 8]}>
                  {deal.media?.map((asset: any) => (
                    <Col key={asset.id} xs={12}>
                      <div style={{ borderRadius: 8, border: '1px solid #E3E9EF', background: '#fff', overflow: 'hidden' }}>
                        <div style={{ height: 58, background: '#F2F5F8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#C3C9D2' }}>
                          {asset.kind === 'VIDEO' ? '🎬' : '🖼'}
                        </div>
                        <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          {asset.scanStatus === 'CLEAN' ? (
                            <Button type="link" size="small" style={{ padding: 0, fontSize: 11, height: 'auto', color: '#3A5570', fontWeight: 600 }}
                              onClick={async () => {
                                const res = await api.get(`/api/media/${asset.id}/url`).then((r) => r.data);
                                if (res.url) window.open(res.url, '_blank');
                              }}>View ↗</Button>
                          ) : (
                            <Tag color={asset.scanStatus === 'INFECTED' ? 'red' : 'orange'} style={{ fontSize: 9, lineHeight: '14px', margin: 0 }}>
                              {asset.scanStatus}
                            </Tag>
                          )}
                          <Text style={{ fontSize: 9, color: '#C3C9D2' }}>{(asset.sizeBytes / 1024).toFixed(0)} KB</Text>
                        </div>
                      </div>
                    </Col>
                  ))}
                </Row>
              </Card>
            </Space>
          </Col>

          {/* ── Middle column: the journey ── */}
          <Col xs={24} lg={10}>
            <Card
              size="small"
              title={<SectionTitle label="Journey so far" count={deal.timeline?.length ?? 0} />}
              style={{ ...cardStyle, height: '100%' }}
              extra={canWrite && (
                <Button size="small" icon={<MessageOutlined />} style={{ ...actionBtn, fontSize: 12 }}
                  onClick={() => setNoteModal(true)}>
                  Add note
                </Button>
              )}
            >
              {deal.timeline?.length ? (
                <Timeline
                  style={{ marginTop: 8 }}
                  items={deal.timeline?.map((ev: any) => {
                    const cfg = EVENT_ICON[ev.type] ?? EVENT_ICON['SYSTEM'];
                    return {
                      dot: (
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#F2F5F8', border: '1.5px solid #E3E9EF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: cfg.color }}>
                          {cfg.icon}
                        </div>
                      ),
                      children: (
                        <div style={{ background: '#fff', border: '1px solid #EDF1F6', borderRadius: 8, padding: '8px 12px', marginBottom: 2 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 12, fontWeight: 600, color: '#0E1B2A', textTransform: 'capitalize' }}>
                              {ev.type.replace(/_/g, ' ').toLowerCase()}
                            </Text>
                            {ev.status && (() => {
                              const sc = stageToneById(ev.status.id, statuses) ?? FALLBACK_STAGE_TONE;
                              return sc ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 5, background: sc.bg, color: sc.text, fontSize: 11, fontWeight: 600 }}>
                                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc.dot }} />
                                  {ev.status.name}
                                </span>
                              ) : <Tag>{ev.status.name}</Tag>;
                            })()}
                            {ev.location && <Tag style={{ fontSize: 11 }}>{ev.location.name}</Tag>}
                          </div>
                          {ev.note && <Text style={{ fontSize: 11, color: '#616875', display: 'block', marginTop: 3 }}>{ev.note}</Text>}
                          <Text style={{ fontSize: 10, color: '#98A0AC', display: 'block', marginTop: 4 }}>
                            {new Date(ev.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            {ev.createdBy && ` · ${ev.createdBy.fullName}`}
                          </Text>
                        </div>
                      ),
                    };
                  })}
                />
              ) : (
                <Text style={{ fontSize: 12, color: '#98A0AC' }}>Nothing recorded yet.</Text>
              )}
            </Card>
          </Col>

          {/* ── Right column: the people & the money ── */}
          <Col xs={24} lg={7}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card
                size="small"
                title={<SectionTitle label="Customer" />}
                style={cardStyle}
                extra={canWrite && (
                  <Button size="small" icon={<EditOutlined />} style={{ ...actionBtn, fontSize: 12 }}
                    onClick={openClientModal}>
                    Edit
                  </Button>
                )}
              >
                <MetaRow label="Name" value={deal.client?.fullName} />
                <MetaRow label="Phone" value={deal.client?.phoneE164} />
                <MetaRow label="Email" value={deal.client?.email} />
                <MetaRow label="Country" value={deal.client?.country} />
                <MetaRow label="City" value={deal.client?.city} />
              </Card>

              {/* Customer tracking link + WhatsApp — Stage 2 of the concept doc */}
              <Card size="small" title={<SectionTitle label="Customer link" />} style={cardStyle}>
                {!trackingLink ? (
                  <>
                    <Text style={{ fontSize: 12, color: '#616875', display: 'block', marginBottom: 10 }}>
                      Give {deal.client?.fullName?.split(' ')[0]} a private page to follow this car.
                    </Text>
                    {canWrite && (
                      <Button block icon={<LinkOutlined />} style={actionBtn}
                        loading={createTrackingLink.isPending}
                        onClick={() => createTrackingLink.mutate()}>
                        Create customer link
                      </Button>
                    )}
                  </>
                ) : (
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Input readOnly value={trackUrl ?? ''} size="small"
                        style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#616875' }} />
                      <Button size="small" icon={<CopyOutlined />} style={actionBtn} onClick={copyTrackUrl} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, color: '#616875' }}>Customer sees prices</Text>
                      <Switch size="small" checked={trackingLink.showPrices} disabled={!canWrite}
                        onChange={(v) => updateTrackingLink.mutate({ linkId: trackingLink.id, data: { showPrices: v } })} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, color: '#616875' }}>Auto WhatsApp updates</Text>
                      <Switch size="small" checked={deal.client?.whatsappOptIn} disabled={!canWrite}
                        onChange={(v) => updateClient.mutate({ clientId: deal.client.id, data: { whatsappOptIn: v } })} />
                    </div>

                    {canWrite && (
                      <Space.Compact block>
                        <Button size="small" block icon={<WhatsAppOutlined />} style={actionBtn}
                          loading={notifyWhatsApp.isPending} onClick={sendWhatsApp}>
                          Send update
                        </Button>
                        {waMeHref && (
                          <Button size="small" icon={<WhatsAppOutlined />} style={{ ...actionBtn, flexShrink: 0 }}
                            href={waMeHref} target="_blank" title="Open chat in your own WhatsApp">
                            Chat
                          </Button>
                        )}
                      </Space.Compact>
                    )}

                    {lastNotification && (
                      <Text style={{ fontSize: 10, color: '#98A0AC' }}>
                        Last: {lastNotification.status.toLowerCase()} ·{' '}
                        {new Date(lastNotification.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}

                    {canWrite && (
                      <Button size="small" type="text" style={{ color: '#B42318', fontSize: 11, padding: 0, height: 'auto' }}
                        onClick={() => updateTrackingLink.mutate({ linkId: trackingLink.id, data: { revoke: true } })}>
                        Revoke link
                      </Button>
                    )}
                  </Space>
                )}
              </Card>

              <Card
                size="small"
                title={<SectionTitle label="Payment" count={deal.payments?.length ?? 0} />}
                style={cardStyle}
                extra={canWrite && (
                  <Button size="small" icon={<DollarOutlined />} style={{ ...actionBtn, fontSize: 12 }}
                    onClick={() => setPaymentDrawer(true)}>
                    Record
                  </Button>
                )}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ color: '#98A0AC', fontSize: 12 }}>Selling price</Text>
                  <Text style={{ fontWeight: 600, color: '#171B26', fontVariantNumeric: 'tabular-nums' }}>{fmt(deal.sellingPrice, deal.sellingCurrency)}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ color: '#98A0AC', fontSize: 12 }}>Paid so far</Text>
                  <Text style={{ fontWeight: 600, color: '#067647', fontVariantNumeric: 'tabular-nums' }}>{fmt(paid, deal.sellingCurrency)}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: '#98A0AC', fontSize: 12 }}>Balance</Text>
                  <Text style={{ fontWeight: 700, color: balance && balance > 0 ? '#B42318' : '#067647', fontVariantNumeric: 'tabular-nums' }}>{fmt(balance, deal.sellingCurrency)}</Text>
                </div>

                {/* progress bar, like the concept doc */}
                {deal.sellingPrice && (
                  <div style={{ height: 5, borderRadius: 99, background: '#EDF1F6', overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${paidPct}%`, borderRadius: 99, background: paidPct >= 100 ? '#12B76A' : '#3A5570', transition: 'width .3s' }} />
                  </div>
                )}
                <span style={{ padding: '2px 9px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: payCfg?.bg, color: payCfg?.color }}>
                  {payStatus}
                </span>

                {deal.payments?.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #EDF1F6' }}>
                    {deal.payments.map((p: any) => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid #EDF1F6' }}>
                        <div>
                          <Text style={{ fontSize: 12, fontWeight: 700, color: '#067647', fontVariantNumeric: 'tabular-nums', display: 'block' }}>
                            {fmt(p.amount, p.currency)}
                          </Text>
                          <Text style={{ fontSize: 10, color: '#98A0AC' }}>
                            {new Date(p.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {p.method ? ` · ${p.method}` : ''}
                          </Text>
                        </div>
                        {p.reference && <Text code style={{ fontSize: 10 }}>{p.reference}</Text>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card size="small" title={<SectionTitle label="Paperwork" count={deal.documents?.filter((d: any) => d.received).length ?? 0} />} style={cardStyle}>
                <List
                  size="small"
                  dataSource={DOC_TYPES}
                  renderItem={(type) => {
                    const doc = deal.documents?.find((d: any) => d.type === type);
                    const received = doc?.received ?? false;
                    return (
                      <List.Item
                        style={{ padding: '7px 0', borderBottom: '1px solid #EDF1F6' }}
                        actions={
                          canWrite
                            ? [
                                doc ? (
                                  <Space size={4} key="acts">
                                    <Button size="small" type="text" icon={<PaperClipOutlined />} title="Attach file"
                                      style={{ color: doc.objectKey ? '#93A0AD' : '#3A5570' }}
                                      onClick={() => attachDocFile(doc.id)} />
                                    {doc.objectKey && (
                                      <Switch size="small" checked={doc.visibleToClient}
                                        checkedChildren="👁" unCheckedChildren="👁" title="Visible to customer"
                                        onChange={(v) => updateDocument.mutate({ docId: doc.id, data: { visibleToClient: v } })} />
                                    )}
                                    <Switch size="small" checked={received} title="Received"
                                      onChange={(v) => updateDocument.mutate({ docId: doc.id, data: { received: v } })} />
                                  </Space>
                                ) : (
                                  <Button size="small" type="text" style={{ color: '#3A5570', fontSize: 11, fontWeight: 600 }}
                                    onClick={() => addDocument.mutate({ type, received: false })}>
                                    + Add
                                  </Button>
                                ),
                              ]
                            : []
                        }
                      >
                        <Space size={8}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: received ? '#12B76A' : '#E3E9EF', flexShrink: 0 }} />
                          <div>
                            <Text style={{ fontSize: 12, fontWeight: 500, color: received ? '#067647' : '#171B26' }}>
                              {type.replace(/_/g, ' ')}
                            </Text>
                            {doc?.objectKey && (
                              <Button type="link" size="small"
                                style={{ padding: 0, height: 'auto', fontSize: 10.5, color: doc.scanStatus === 'CLEAN' ? '#C13A26' : '#98A0AC', display: 'block' }}
                                onClick={() => openDocument(doc.id)}>
                                <DownloadOutlined /> {doc.filename ?? 'file'}{doc.scanStatus !== 'CLEAN' ? ` · ${doc.scanStatus.toLowerCase()}` : ''}
                              </Button>
                            )}
                            {doc?.note && <Text style={{ fontSize: 10, color: '#98A0AC', display: 'block' }}>{doc.note}</Text>}
                          </div>
                        </Space>
                      </List.Item>
                    );
                  }}
                />

                {clientDocs.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #E3E9EF' }}>
                    <Text style={{ fontSize: 10, fontWeight: 700, color: '#5B3FD4', textTransform: 'uppercase', letterSpacing: 1 }}>
                      From customer
                    </Text>
                    {clientDocs.map((d: any) => (
                      <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                        <Button type="link" size="small"
                          style={{ padding: 0, height: 'auto', fontSize: 11.5, color: d.scanStatus === 'CLEAN' ? '#C13A26' : '#98A0AC' }}
                          onClick={() => openDocument(d.id)}>
                          <DownloadOutlined /> {d.label ?? d.filename}
                        </Button>
                        <Text style={{ fontSize: 9.5, color: '#98A0AC' }}>
                          {d.scanStatus !== 'CLEAN' ? d.scanStatus.toLowerCase() : new Date(d.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        </Text>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </Space>
          </Col>
        </Row>
      </Space>

      <Modal title="Change Status" open={statusModal} onCancel={() => setStatusModal(false)} onOk={() => statusForm.submit()} confirmLoading={changeStatus.isPending}>
        <Form form={statusForm} layout="vertical" onFinish={handleChangeStatus} style={{ marginTop: 16 }}>
          <Form.Item name="statusId" label="New status" rules={[{ required: true }]}>
            <Select options={statuses?.map((s: any) => ({ label: s.name, value: s.id }))} />
          </Form.Item>
          <Form.Item name="note" label="Note (optional)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Change Location" open={locationModal} onCancel={() => setLocationModal(false)} onOk={() => locationForm.submit()} confirmLoading={changeLocation.isPending}>
        <Form form={locationForm} layout="vertical" onFinish={handleChangeLocation} style={{ marginTop: 16 }}>
          <Form.Item name="locationId" label="New location" rules={[{ required: true }]}>
            <Select options={locations?.map((l: any) => ({ label: l.name, value: l.id }))} />
          </Form.Item>
          <Form.Item name="note" label="Note (optional)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="Record Payment" open={paymentDrawer} onClose={() => setPaymentDrawer(false)} size={360}
        extra={<Button type="primary" loading={addPayment.isPending} onClick={() => paymentForm.submit()}>Save</Button>}>
        <Form form={paymentForm} layout="vertical" onFinish={handleAddPayment}>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="currency" label="Currency" initialValue="ZAR" rules={[{ required: true }]}>
            <Select options={[{ label: 'ZAR', value: 'ZAR' }, { label: 'USD', value: 'USD' }, { label: 'ZWL', value: 'ZWL' }]} />
          </Form.Item>
          <Form.Item name="paidAt" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="method" label="Method">
            <Input placeholder="Bank transfer, Cash, EcoCash…" />
          </Form.Item>
          <Form.Item name="reference" label="Reference">
            <Input />
          </Form.Item>
          <Form.Item name="note" label="Note">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title="Edit Client Details"
        open={clientModal}
        onCancel={() => setClientModal(false)}
        onOk={() => clientForm.submit()}
        confirmLoading={updateClient.isPending}
        okText="Save"
      >
        <Form form={clientForm} layout="vertical" onFinish={handleUpdateClient} style={{ marginTop: 16 }}>
          <Form.Item name="fullName" label="Full name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phoneE164" label="Phone (international format)"
            extra="e.g. +263771234567 — used for WhatsApp later">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Not a valid email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="country" label="Country">
            <Input />
          </Form.Item>
          <Form.Item name="city" label="City">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="Edit deal" open={editDrawer} onClose={() => setEditDrawer(false)} size={440}
        extra={<Button type="primary" loading={updateDeal.isPending} onClick={() => editForm.submit()}>Save</Button>}>
        <Form form={editForm} layout="vertical" onFinish={handleEditDeal}>
          <Row gutter={10}>
            <Col span={12}><Form.Item name="make" label="Make" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="model" label="Model" rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
          <Row gutter={10}>
            <Col span={8}><Form.Item name="year" label="Year"><InputNumber style={{ width: '100%' }} min={1980} max={2035} /></Form.Item></Col>
            <Col span={8}><Form.Item name="colour" label="Colour"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="mileageKm" label="Mileage (km)"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
          </Row>
          <Row gutter={10}>
            <Col span={12}><Form.Item name="registrationNo" label="Registration"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="vin" label="VIN"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={10}>
            <Col span={12}><Form.Item name="supplier" label="Supplier"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="sourceCountry" label="From"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={10}>
            <Col span={12}><Form.Item name="destinationCountry" label="Destination country"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="destinationCity" label="City"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={10}>
            <Col span={10}><Form.Item name="sellingPrice" label="Selling price"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
            <Col span={6}><Form.Item name="sellingCurrency" label="Currency">
              <Select options={['ZAR','USD','BWP','MWK','MZN','ZMW','ZWL'].map(c => ({ label: c, value: c }))} />
            </Form.Item></Col>
            <Col span={8}><Form.Item name="expectedDeliveryDate" label="Est. delivery"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="consultantId" label="Handled by">
            <Select allowClear placeholder="Assign a consultant"
              options={users?.map((u: any) => ({ label: u.fullName, value: u.id }))} />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal title="Add Note" open={noteModal} onCancel={() => setNoteModal(false)} onOk={() => noteForm.submit()} confirmLoading={addNote.isPending}>
        <Form form={noteForm} layout="vertical" onFinish={handleAddNote} style={{ marginTop: 16 }}>
          <Form.Item name="note" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="What happened?" />
          </Form.Item>
          <Form.Item name="clientVisible" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>
              <Text style={{ fontSize: 12.5 }}>Show to the customer on their tracking page</Text>
            </Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </AppShell>
  );
}
