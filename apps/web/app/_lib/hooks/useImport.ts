import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export function useImportBatch(batchId: string | null) {
  return useQuery({
    queryKey: ['importBatch', batchId],
    queryFn: () => api.get(`/api/import/${batchId}`).then((r) => r.data),
    enabled: !!batchId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'COMMITTED' || status === 'ABANDONED' ? false : 5000;
    },
  });
}

export function useImportRows(batchId: string | null, filters: { status?: string; page?: number } = {}) {
  return useQuery({
    queryKey: ['importRows', batchId, filters],
    queryFn: () => api.get(`/api/import/${batchId}/rows`, { params: filters }).then((r) => r.data),
    enabled: !!batchId,
  });
}

export function useUploadBatch() {
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/api/import', fd).then((r) => r.data);
    },
  });
}

export function useSelectSheet(batchId: string) {
  return useMutation({
    mutationFn: (sheetName: string) =>
      api.post(`/api/import/${batchId}/select-sheet`, { sheetName }).then((r) => r.data),
  });
}

export function useMapColumns(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (columnMap: Record<string, string>) =>
      api.post(`/api/import/${batchId}/map`, { columnMap }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['importBatch', batchId] }),
  });
}

export function useResolveRow(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rowId, mapped }: { rowId: string; mapped: Record<string, unknown> }) =>
      api.patch(`/api/import/${batchId}/rows/${rowId}`, { mapped }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['importRows', batchId] }),
  });
}

export function useCommitBatch(batchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/api/import/${batchId}/commit`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['importBatch', batchId] });
      qc.invalidateQueries({ queryKey: ['deals'] });
    },
  });
}
