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

// F1 C4
export const fetchConteoEstados = (instSlug) =>
  client.get(`/contratos/conteo-estados?institucion=${encodeURIComponent(instSlug)}`).then((r) => r.data);
export const fetchAuditLog = (id) =>
  client.get(`/contratos/${id}/audit-log`).then((r) => r.data);
export const generarTokenCliente = (id) =>
  client.post(`/contratos/${id}/token-cliente`).then((r) => r.data);
export const avanzarContrato = (id) =>
  client.post(`/contratos/${id}/avanzar`).then((r) => r.data);
export const regresarContrato = (id, motivo) =>
  client.post(`/contratos/${id}/regresar`, { motivo }).then((r) => r.data);
export const anularContrato = (id, motivo) =>
  client.post(`/contratos/${id}/anular`, { motivo }).then((r) => r.data);
export const reenviarLink = (id) =>
  client.post(`/contratos/${id}/reenviar-link`).then((r) => r.data);

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
