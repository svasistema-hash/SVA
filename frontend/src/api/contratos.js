import client from './client';

export const fetchContratos = (filters = {}) => {
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ''))
  );
  const qs = params.toString();
  return client.get(`/contratos${qs ? `?${qs}` : ''}`).then((r) => r.data);
};

export const fetchContrato = (id) => client.get(`/contratos/${id}`).then((r) => r.data);
export const createContrato = (data) => client.post('/contratos', data).then((r) => r.data);
export const updateContrato = (id, data) => client.put(`/contratos/${id}`, data).then((r) => r.data);
export const generatePdf = (id) => client.post(`/contratos/${id}/pdf`).then((r) => r.data);

export const openPdf = async (id) => {
  const res = await client.get(`/contratos/${id}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

export const scanDpi = (file) => {
  const fd = new FormData();
  fd.append('imagen', file);
  return client
    .post('/clientes/scan-dpi', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
};

export const scanRecibo = (file) => {
  const fd = new FormData();
  fd.append('imagen', file);
  return client
    .post('/clientes/scan-recibo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
};

export const login = (email, password) =>
  client.post('/auth/login', { email, password }).then((r) => r.data);
