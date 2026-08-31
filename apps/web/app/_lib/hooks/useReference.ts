import { useQuery } from '@tanstack/react-query';
import api from '../api';

export function useStatuses() {
  return useQuery({
    queryKey: ['statuses'],
    queryFn: () => api.get('/api/reference/statuses').then((r) => r.data),
    staleTime: Infinity,
  });
}

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: () => api.get('/api/reference/locations').then((r) => r.data),
    staleTime: Infinity,
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/api/reference/users').then((r) => r.data),
    staleTime: Infinity,
  });
}

export function useCountries() {
  return useQuery({
    queryKey: ['countries'],
    queryFn: () => api.get('/api/reference/countries').then((r) => r.data),
    staleTime: 60_000,
  });
}
