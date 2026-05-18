import client from './client';

export const searchClientes = (q, institucion_id) => {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (institucion_id) params.set('institucion_id', institucion_id);
  const qs = params.toString();
  return client.get(`/clientes${qs ? `?${qs}` : ''}`).then((r) => r.data);
};

export const fetchCliente = (id) => client.get(`/clientes/${id}`).then((r) => r.data);
export const createCliente = (data) => client.post('/clientes', data).then((r) => r.data);

export const nextCorrelativo = (institucion_id) =>
  client.get(`/contratos/next-correlativo?institucion_id=${institucion_id}`).then((r) => r.data);
