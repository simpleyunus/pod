import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export function useChangeStatus(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { statusId: string; note?: string }) =>
      api.post(`/api/deals/${dealId}/status`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal', dealId] });
      qc.invalidateQueries({ queryKey: ['deals'] });
    },
  });
}

export function useChangeLocation(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { locationId: string; note?: string }) =>
      api.post(`/api/deals/${dealId}/location`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deal', dealId] });
      qc.invalidateQueries({ queryKey: ['deals'] });
    },
  });
}

export function useAddPayment(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      api.post(`/api/deals/${dealId}/payments`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deal', dealId] }),
  });
}

export function useAddNote(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { note: string; clientVisible?: boolean }) =>
      api.post(`/api/deals/${dealId}/notes`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deal', dealId] }),
  });
}

export function useUpdateDocument(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, data }: { docId: string; data: any }) =>
      api.patch(`/api/deals/${dealId}/documents/${docId}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deal', dealId] }),
  });
}

export function useAddDocument(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) =>
      api.post(`/api/deals/${dealId}/documents`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deal', dealId] }),
  });
}

export function useUploadMedia(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/api/deals/${dealId}/media`, fd).then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deal', dealId] }),
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/api/deals', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  });
}

export function useUpdateClient(dealId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, data }: { clientId: string; data: any }) =>
      api.patch(`/api/clients/${clientId}`, data).then((r) => r.data),
    onSuccess: () => {
      if (dealId) qc.invalidateQueries({ queryKey: ['deal', dealId] });
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useUploadDocumentFile(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ docId, file }: { docId: string; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/api/deals/${dealId}/documents/${docId}/file`, fd).then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deal', dealId] }),
  });
}
