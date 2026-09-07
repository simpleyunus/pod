'use client';

import { InboxOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  List,
  Radio,
  Result,
  Row,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import AppShell from '../_components/AppShell';
import {
  useCommitBatch,
  useImportRows,
  useMapColumns,
  useResolveRow,
  useSelectSheet,
  useUploadBatch,
} from '../_lib/hooks/useImport';

const { Title, Text } = Typography;

const SYSTEM_FIELDS = [
  { value: 'clientFullName', label: 'Client Full Name *' },
  { value: 'phoneE164', label: 'Phone (E.164)' },
  { value: 'email', label: 'Email' },
  { value: 'country', label: 'Client Country' },
  { value: 'make', label: 'Vehicle Make *' },
  { value: 'model', label: 'Vehicle Model *' },
  { value: 'year', label: 'Year' },
  { value: 'colour', label: 'Colour' },
  { value: 'vin', label: 'VIN / Chassis' },
  { value: 'registrationNo', label: 'Registration No' },
  { value: 'sellingPrice', label: 'Selling Price' },
  { value: 'sellingCurrency', label: 'Currency' },
  { value: 'destinationCountry', label: 'Destination Country' },
  { value: 'destinationCity', label: 'Destination City' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'expectedDeliveryDate', label: 'Expected Delivery' },
  { value: 'statusName', label: 'Status (name)' },
  { value: 'consultantName', label: 'Consultant (name)' },
];

function fuzzyMatch(header: string, fieldValue: string): boolean {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  const f = fieldValue.toLowerCase().replace(/[^a-z0-9]/g, '');
  const keywords: Record<string, string[]> = {
    clientfullname: ['name', 'client', 'customer', 'fullname'],
    phonee164: ['phone', 'tel', 'mobile', 'whatsapp'],
    email: ['email', 'mail'],
    country: ['country', 'nation'],
    make: ['make', 'brand', 'manufacturer'],
    model: ['model', 'variant'],
    year: ['year', 'manufactured', 'yrmanuf'],
    colour: ['colour', 'color'],
    vin: ['vin', 'chassis'],
    registrationno: ['reg', 'registration', 'plate'],
    sellingprice: ['price', 'asking', 'amount', 'selling'],
    sellingcurrency: ['currency', 'curr'],
    destinationcountry: ['destination', 'country'],
    destinationcity: ['city', 'town'],
    supplier: ['supplier', 'dealer', 'source'],
    expecteddeliverydate: ['delivery', 'expected', 'date'],
    statusname: ['status', 'stage', 'current'],
    consultantname: ['consultant', 'agent', 'rep', 'staff'],
  };
  return (keywords[f] ?? []).some((k) => h.includes(k));
}

export default function ImportPage() {
  const [step, setStep] = useState(0);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [commitResult, setCommitResult] = useState<any>(null);
  const [resolveDrawer, setResolveDrawer] = useState<any>(null);
  const [resolveForm] = Form.useForm();

  const uploadBatch = useUploadBatch();
  const selectSheet = useSelectSheet(batchId ?? '');
  const mapColumns = useMapColumns(batchId ?? '');
  const { data: rowsData, refetch: refetchRows } = useImportRows(batchId, { status: 'NEEDS_REVIEW' });
  const resolveRow = useResolveRow(batchId ?? '');
  const commitBatch = useCommitBatch(batchId ?? '');

  const handleUpload = async (file: File) => {
    const res = await uploadBatch.mutateAsync(file);
    setBatchId(res.batchId);
    setSheets(res.sheets);
    return false;
  };

  const handleSelectSheet = async (sheetName: string) => {
    setSelectedSheet(sheetName);
    const res = await selectSheet.mutateAsync(sheetName);
    setHeaders(res.headers);
    // Auto-fill column map with fuzzy matches
    const autoMap: Record<string, string> = {};
    for (const field of SYSTEM_FIELDS) {
      const match = res.headers.find((h: string) => fuzzyMatch(h, field.value));
      if (match) autoMap[field.value] = match;
    }
    setColumnMap(autoMap);
  };

  const handleMap = async () => {
    await mapColumns.mutateAsync(columnMap);
    setStep(2);
  };

  const handleResolve = async (vals: any) => {
    await resolveRow.mutateAsync({ rowId: resolveDrawer.id, mapped: vals });
    message.success('Row resolved');
    setResolveDrawer(null);
    refetchRows();
  };

  const handleCommit = async () => {
    const res = await commitBatch.mutateAsync();
    setCommitResult(res);
    setStep(3);
  };

  const headerOptions = [
    { label: '— ignore —', value: '__ignore__' },
    ...headers.map((h) => ({ label: h, value: h })),
  ];

  const needsReviewItems: any[] = rowsData?.items ?? [];
  const needsReviewTotal: number = rowsData?.total ?? 0;

  return (
    <AppShell>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0d1b2a' }}>Excel Importer</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Upload a spreadsheet, map columns, fix issues, then commit deals to the platform
          </div>
        </div>

        <Steps
          current={step}
          items={[
            { title: 'Upload' },
            { title: 'Map Columns' },
            { title: 'Review Issues' },
            { title: 'Commit' },
          ]}
        />

        {step === 0 && (
          <Card title={<span style={{ fontWeight: 700, color: '#0d1b2a' }}>Upload Spreadsheet</span>} style={{ borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleUpload(file);
                }}
                style={{
                  border: '2px dashed #d9d9d9',
                  borderRadius: 8,
                  padding: '40px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: '#fafafa',
                }}
                onClick={() => document.getElementById('file-input')?.click()}
              >
                <InboxOutlined style={{ fontSize: 48, color: '#1d4ed8' }} />
                <div style={{ marginTop: 8 }}>
                  <Text>Drop .xlsx / .xls here, or click to select</Text>
                </div>
                <input
                  id="file-input"
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                />
              </div>

              {uploadBatch.isPending && <Text type="secondary">Uploading…</Text>}

              {sheets.length > 0 && (
                <Card size="small" title="Select Sheet">
                  <Radio.Group
                    value={selectedSheet}
                    onChange={(e) => handleSelectSheet(e.target.value)}
                    options={sheets.map((s) => ({ label: s, value: s }))}
                  />
                  {selectSheet.isPending && <Text type="secondary" style={{ marginLeft: 12 }}>Loading headers…</Text>}
                </Card>
              )}

              {headers.length > 0 && (
                <Button type="primary" onClick={() => setStep(1)}>
                  Next: Map Columns →
                </Button>
              )}
            </Space>
          </Card>
        )}

        {step === 1 && (
          <Card
            title="Map Columns"
            extra={
              <Space>
                <Button onClick={() => setStep(0)}>← Back</Button>
                <Button type="primary" loading={mapColumns.isPending} onClick={handleMap}>
                  Normalise & Review →
                </Button>
              </Space>
            }
          >
            <Alert
              message="Map each system field to a spreadsheet column. Required fields are marked *."
              type="info"
              style={{ marginBottom: 16 }}
            />
            <Row gutter={[16, 8]}>
              {SYSTEM_FIELDS.map((field) => (
                <Col xs={24} sm={12} md={8} key={field.value}>
                  <div style={{ marginBottom: 4 }}>
                    <Text strong style={{ fontSize: 12 }}>{field.label}</Text>
                  </div>
                  <Select
                    style={{ width: '100%' }}
                    value={columnMap[field.value] ?? '__ignore__'}
                    onChange={(v) => setColumnMap((m) => ({ ...m, [field.value]: v }))}
                    options={headerOptions}
                    size="small"
                  />
                </Col>
              ))}
            </Row>
          </Card>
        )}

        {step === 2 && (
          <Card
            title={`Review Issues (${needsReviewTotal} rows need attention)`}
            extra={
              <Space>
                <Button onClick={() => setStep(1)}>← Back</Button>
                <Button type="primary" onClick={handleCommit} loading={commitBatch.isPending}>
                  Commit All →
                </Button>
              </Space>
            }
          >
            {needsReviewTotal === 0 ? (
              <Alert message="No issues — all rows are ready to commit." type="success" />
            ) : (
              <Table
                dataSource={needsReviewItems}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 20 }}
                columns={[
                  { title: 'Row', dataIndex: 'rowIndex', render: (v: number) => v + 1, width: 60 },
                  {
                    title: 'Client',
                    render: (_: any, r: any) => (r.mapped as any)?.clientFullName ?? <Tag color="red">missing</Tag>,
                  },
                  {
                    title: 'Vehicle',
                    render: (_: any, r: any) => {
                      const m = r.mapped as any;
                      return [m?.make, m?.model, m?.year].filter(Boolean).join(' ') || <Tag color="red">missing</Tag>;
                    },
                  },
                  {
                    title: 'Issues',
                    render: (_: any, r: any) =>
                      (r.issues as any[])?.map((issue: any, i: number) => (
                        <Tag color="orange" key={i}>{issue.field}: {issue.problem}</Tag>
                      )),
                  },
                  {
                    title: '',
                    render: (_: any, r: any) => (
                      <Button size="small" onClick={() => {
                        setResolveDrawer(r);
                        resolveForm.setFieldsValue(r.mapped ?? {});
                      }}>
                        Edit
                      </Button>
                    ),
                    width: 70,
                  },
                ]}
              />
            )}
          </Card>
        )}

        {step === 3 && commitResult && (
          <Result
            status="success"
            title="Import Complete"
            subTitle={
              <Descriptions column={3}>
                <Descriptions.Item label="Deals created">{commitResult.dealsCreated}</Descriptions.Item>
                <Descriptions.Item label="Clients created">{commitResult.clientsCreated}</Descriptions.Item>
                <Descriptions.Item label="Skipped">{commitResult.skipped}</Descriptions.Item>
              </Descriptions>
            }
            extra={[
              <Link href="/fleet" key="fleet">
                <Button type="primary">View Board</Button>
              </Link>,
              <Button key="again" onClick={() => { setStep(0); setBatchId(null); setSheets([]); setSelectedSheet(null); setHeaders([]); setColumnMap({}); setCommitResult(null); }}>
                Import Another
              </Button>,
            ]}
          />
        )}
      </Space>

      <Drawer
        title="Edit Row"
        open={!!resolveDrawer}
        onClose={() => setResolveDrawer(null)}
        size={420}
        extra={
          <Button type="primary" loading={resolveRow.isPending} onClick={() => resolveForm.submit()}>
            Save & Mark Resolved
          </Button>
        }
      >
        {resolveDrawer && (
          <>
            {(resolveDrawer.issues as any[])?.map((issue: any, i: number) => (
              <Alert key={i} type="warning" message={`${issue.field}: ${issue.problem}`} style={{ marginBottom: 8 }} />
            ))}
            <Form form={resolveForm} layout="vertical" onFinish={handleResolve}>
              <Form.Item name="clientFullName" label="Client Full Name">
                <Input />
              </Form.Item>
              <Form.Item name="phoneE164" label="Phone (E.164)">
                <Input placeholder="+263712345678" />
              </Form.Item>
              <Form.Item name="make" label="Make">
                <Input />
              </Form.Item>
              <Form.Item name="model" label="Model">
                <Input />
              </Form.Item>
              <Form.Item name="year" label="Year">
                <InputNumber style={{ width: '100%' }} min={1980} max={2030} />
              </Form.Item>
              <Form.Item name="sellingPrice" label="Selling Price">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
              <Form.Item name="destinationCountry" label="Destination Country">
                <Input />
              </Form.Item>
              <Form.Item name="expectedDeliveryDate" label="Expected Delivery (YYYY-MM-DD)">
                <Input placeholder="2025-06-30" />
              </Form.Item>
            </Form>
          </>
        )}
      </Drawer>
    </AppShell>
  );
}
