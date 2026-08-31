import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export function useTrackingLink(dealId: string) {
  return useQuery({
    queryKey: ['tracking-link', dealId],
    queryFn: () => api.get(`/api/deals/${dealId}/tracking-link`).then((r) => r.data),
    enabled: !!dealId,
  });
}

export function useCreateTrackingLink(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/api/deals/${dealId}/tracking-link`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-link', dealId] }),
  });
}

export function useUpdateTrackingLink(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ linkId, data }: { linkId: string; data: { showPrices?: boolean; revoke?: boolean } }) =>
      api.patch(`/api/tracking-links/${linkId}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-link', dealId] }),
  });
}

export function useNotifyWhatsApp(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/api/deals/${dealId}/notify`, { force: true }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deal-notifications', dealId] }),
  });
}

export function useDealNotifications(dealId: string) {
  return useQuery({
    queryKey: ['deal-notifications', dealId],
    queryFn: () => api.get(`/api/deals/${dealId}/notifications`).then((r) => r.data),
    enabled: !!dealId,
  });
}
