'use client';

import { CameraOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, Drawer, Form, Input, Typography, Upload, message } from 'antd';
import { useRef, useState } from 'react';
import api from '../_lib/api';
import { useFleetMutation } from '../_lib/hooks/useFleet';

const { Text } = Typography;

// Signature capture: a plain canvas rather than a library, because the only
// requirement is a legible mark from a finger on a phone.
function SignaturePad({ onChange }: { onChange: (blob: Blob | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#101828';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    setHasInk(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    canvasRef.current!.toBlob((b) => onChange(b), 'image/png');
  };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={480}
        height={170}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        style={{
          width: '100%', height: 170, background: '#fff', borderRadius: 12,
          border: '1px dashed #D6D6CF', touchAction: 'none', display: 'block',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={{ fontSize: 11, color: '#98A0AC' }}>
          {hasInk ? 'Signature captured' : 'Sign here with a finger or stylus'}
        </Text>
        <Button size="small" type="text" icon={<DeleteOutlined />} onClick={clear} style={{ fontSize: 11 }}>
          Clear
        </Button>
      </div>
    </div>
  );
}

export default function PodCapture({
  open, onClose, trip,
}: {
  open: boolean; onClose: () => void; trip: any;
}) {
  const [form] = Form.useForm();
  const [signature, setSignature] = useState<Blob | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const capture = useFleetMutation((body: any) => api.post(`/api/trips/${trip?.id}/pod`, body).then((r) => r.data));

  // Every file goes through the same MinIO + ClamAV path as deal paperwork.
  const uploadFile = async (file: File | Blob, kind: string, filename: string) => {
    const fd = new FormData();
    fd.append('file', file, filename);
    fd.append('kind', kind);
    const res = await api.post('/api/fleet/files', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data.id as string;
  };

  const submit = async (values: any) => {
    setBusy(true);
    try {
      const signatureFileId = signature ? await uploadFile(signature, 'POD_SIGNATURE', 'signature.png') : null;
      const photoFileIds: string[] = [];
      for (const p of photos) {
        if (p.originFileObj) photoFileIds.push(await uploadFile(p.originFileObj, 'POD_PHOTO', p.name));
      }
      await capture.mutateAsync({ ...values, signatureFileId, photoFileIds });
      message.success('Proof of delivery captured');
      form.resetFields();
      setSignature(null);
      setPhotos([]);
      onClose();
    } catch (e: any) {
      message.error(e.response?.data?.message ?? 'Could not capture the POD');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={`Proof of delivery — ${trip?.reference ?? ''}`}
      open={open}
      onClose={onClose}
      width="100%"
      styles={{ wrapper: { maxWidth: 520 } }}
      footer={
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '10px 4px' }}>
          <Button onClick={onClose} style={{ borderRadius: 10 }}>Cancel</Button>
          <Button type="primary" loading={busy} onClick={() => form.submit()} style={{ borderRadius: 10, minWidth: 110 }}>
            Complete delivery
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical" size="large" onFinish={submit}>
        <Form.Item name="receivedByName" label="Received by" rules={[{ required: true, message: 'Who signed for it?' }]}>
          <Input placeholder="Full name" />
        </Form.Item>

        <Form.Item label="Signature">
          <SignaturePad onChange={setSignature} />
        </Form.Item>

        <Form.Item label="Photos">
          <Upload
            listType="picture-card"
            fileList={photos}
            beforeUpload={() => false}
            onChange={({ fileList }) => setPhotos(fileList)}
            accept="image/*"
            multiple
          >
            {photos.length < 8 && (
              <div>
                <CameraOutlined style={{ fontSize: 18, color: '#98A0AC' }} />
                <div style={{ fontSize: 11, marginTop: 4, color: '#98A0AC' }}>Add</div>
              </div>
            )}
          </Upload>
        </Form.Item>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={3} placeholder="Condition on arrival, anything the customer raised…" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
