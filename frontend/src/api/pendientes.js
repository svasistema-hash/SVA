// API del bufete (F1 C5).

import client from './client';

function buildQs(params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const fetchPendientes = (filtros = {}) =>
  client.get(`/pendientes${buildQs(filtros)}`).then((r) => r.data);

export const fetchPendientesConteo = () =>
  client.get('/pendientes/conteo').then((r) => r.data);

// Acción del bufete: marca DPI físico como recibido (registra usuario + timestamp + audit).
export const marcarDpiFisicoRecibido = (contratoId) =>
  client.post(`/contratos/${contratoId}/dpi-fisico-recibido`).then((r) => r.data);

// Notarios autorizados del tenant (para asignar antes de generar PDF final).
export const fetchNotariosPorSlug = (slug, soloActivos = true) =>
  client.get(`/instituciones/${slug}/notarios?activo=${soloActivos ? '1' : '0'}`).then((r) => r.data);
