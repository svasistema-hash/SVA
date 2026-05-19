import client from './client';

// Construye querystring sólo con keys con valor no-vacío.
function buildQs(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const listClientesJuridicos = (params = {}) =>
  client.get(`/clientes/juridicos${buildQs(params)}`).then((r) => r.data);

export const getClienteJuridico = (id) =>
  client.get(`/clientes/juridicos/${id}`).then((r) => r.data);

export const createClienteJuridico = (payload) =>
  client.post('/clientes/juridicos', payload).then((r) => r.data);

export const updateClienteJuridico = (id, payload) =>
  client.put(`/clientes/juridicos/${id}`, payload).then((r) => r.data);

export const deleteClienteJuridico = (id) =>
  client.delete(`/clientes/juridicos/${id}`).then((r) => r.data);
