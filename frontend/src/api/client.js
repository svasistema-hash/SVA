import axios from 'axios';
import { useStore } from '../store/useStore';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = useStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const path = window.location.pathname;
      useStore.getState().logout();
      if (path !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default client;
