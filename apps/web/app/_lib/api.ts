import axios from 'axios';
import { clearSession, getToken } from './auth';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// Expired/invalid token → back to login (except when already logging in).
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (
      error.response?.status === 401 &&
      typeof window !== 'undefined' &&
      !error.config?.url?.includes('/auth/login') &&
      window.location.pathname !== '/login'
    ) {
      clearSession();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;
