import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api';

// RTMS Fleet & Compliance queries. Lookups are cached hard (they change only
// when an admin edits them); operational data stays short-lived.

export function useFleetLookups() {
  return useQuery({
    queryKey: ['fleet', 'lookups'],
    queryFn: () => api.get('/api/fleet/lookups').then((r) => r.data),
    staleTime: Infinity,
  });
}

export function useAssets(params: { q?: string; typeId?: string } = {}) {
  return useQuery({
    queryKey: ['fleet', 'assets', params],
    queryFn: () => api.get('/api/fleet/assets', { params }).then((r) => r.data),
    staleTime: 15_000,
  });
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: ['fleet', 'asset', id],
    queryFn: () => api.get(`/api/fleet/assets/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useDrivers(params: { q?: string } = {}) {
  return useQuery({
    queryKey: ['fleet', 'drivers', params],
    queryFn: () => api.get('/api/fleet/drivers', { params }).then((r) => r.data),
    staleTime: 15_000,
  });
}

export function useDriver(id: string) {
  return useQuery({
    queryKey: ['fleet', 'driver', id],
    queryFn: () => api.get(`/api/fleet/drivers/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCarriers() {
  return useQuery({
    queryKey: ['fleet', 'carriers'],
    queryFn: () => api.get('/api/fleet/carriers').then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useComplianceDashboard() {
  return useQuery({
    queryKey: ['compliance', 'dashboard'],
    queryFn: () => api.get('/api/compliance/dashboard').then((r) => r.data),
    staleTime: 15_000,
  });
}

export function useComplianceItems(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['compliance', 'items', params],
    queryFn: () => api.get('/api/compliance/items', { params }).then((r) => r.data),
    staleTime: 15_000,
  });
}

export function useMaintenanceOverview() {
  return useQuery({
    queryKey: ['maintenance', 'overview'],
    queryFn: () => api.get('/api/maintenance/overview').then((r) => r.data),
    staleTime: 15_000,
  });
}

export function useWorkOrders(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['maintenance', 'work-orders', params],
    queryFn: () => api.get('/api/maintenance/work-orders', { params }).then((r) => r.data),
    staleTime: 15_000,
  });
}

export function useInspections(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['maintenance', 'inspections', params],
    queryFn: () => api.get('/api/maintenance/inspections', { params }).then((r) => r.data),
    staleTime: 15_000,
  });
}

export function useTrips(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['trips', params],
    queryFn: () => api.get('/api/trips', { params }).then((r) => r.data),
    staleTime: 10_000,
  });
}

export function useTrip(id: string) {
  return useQuery({
    queryKey: ['trip', id],
    queryFn: () => api.get(`/api/trips/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useMassSummary(months = 12) {
  return useQuery({
    queryKey: ['trips', 'mass-summary', months],
    queryFn: () => api.get('/api/trips/mass-summary', { params: { months } }).then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useIncidents(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['incidents', params],
    queryFn: () => api.get('/api/incidents', { params }).then((r) => r.data),
    staleTime: 15_000,
  });
}

export function useIncident(id: string | null) {
  return useQuery({
    queryKey: ['incident', id],
    queryFn: () => api.get(`/api/incidents/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

export function useFines(params: Record<string, any> = {}) {
  return useQuery({
    queryKey: ['fines', params],
    queryFn: () => api.get('/api/fines', { params }).then((r) => r.data),
    staleTime: 30_000,
  });
}

export function useAuditPacks() {
  return useQuery({
    queryKey: ['compliance', 'audit-packs'],
    queryFn: () => api.get('/api/compliance/audit-packs').then((r) => r.data),
    refetchInterval: (q) =>
      // Poll only while a pack is actually building.
      (q.state.data as any[])?.some((p) => p.status === 'PENDING' || p.status === 'BUILDING') ? 3000 : false,
  });
}

export function usePolicies() {
  return useQuery({
    queryKey: ['compliance', 'policies'],
    queryFn: () => api.get('/api/compliance/policies').then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useRoutes() {
  return useQuery({
    queryKey: ['compliance', 'routes'],
    queryFn: () => api.get('/api/compliance/routes').then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useRiskAssessments() {
  return useQuery({
    queryKey: ['compliance', 'risk'],
    queryFn: () => api.get('/api/compliance/risk-assessments').then((r) => r.data),
    staleTime: 60_000,
  });
}

// Invalidate broadly: a gate override, a renewal or a work order all move
// numbers on several screens at once.
export function useFleetMutation<T = any>(fn: (vars: T) => Promise<any>, keys: string[][] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const k of keys.length ? keys : [['fleet'], ['compliance'], ['trips'], ['maintenance'], ['incidents']]) {
        qc.invalidateQueries({ queryKey: k });
      }
    },
  });
}
