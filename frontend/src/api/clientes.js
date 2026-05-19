import client from './client';

function buildQs(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

// Versión nueva con objeto-params: acepta q, dpi, nit, estado,
// institucion_id, tipo_persona. La respuesta del backend ahora incluye
// tipo_persona, tipo_sociedad, nombre_comercial (este último solo para juridicos).
export const listClientes = (params = {}) =>
  client.get(`/clientes${buildQs(params)}`).then((r) => r.data);

// Backward-compat: firma vieja searchClientes(q, institucion_id).
export const searchClientes = (q, institucion_id) =>
  listClientes({ q, institucion_id });

export const fetchCliente = (id) => client.get(`/clientes/${id}`).then((r) => r.data);
export const createCliente = (data) => client.post('/clientes', data).then((r) => r.data);

export const nextCorrelativo = (institucion_id) =>
  client.get(`/contratos/next-correlativo?institucion_id=${institucion_id}`).then((r) => r.data);
