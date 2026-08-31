import { useQuery } from '@tanstack/react-query';
import api from '../api';

export interface DealFilters {
  statusId?: string;
  locationId?: string;
  consultantId?: string;
  country?: string;
  payment?: 'UNPAID' | 'PARTIAL' | 'PAID';
  q?: string;
  page?: number;
  pageSize?: number;
}

export function useDeals(filters: DealFilters = {}) {
  return useQuery({
    queryKey: ['deals', filters],
    queryFn: () => api.get('/api/deals', { params: filters }).then((r) => r.data),
    staleTime: 15_000,
  });
}

export function useDeal(id: string) {
  return useQuery({
    queryKey: ['deal', id],
    queryFn: () => api.get(`/api/deals/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}
