// Sprint garantías-desacopladas CP4-B — API client.
// Wrappers de los endpoints CP3 (comparecientes + garantías, autenticados +
// públicos del portal cliente).

import client from './client';
import axios from 'axios';

// ──────────────────────────────────────────────────────────────
// AUTH — Catálogo de comparecientes (banco/bufete)
// ──────────────────────────────────────────────────────────────

export const fetchComparecientes = (institucionId, q) => {
  const qs = new URLSearchParams({ institucion_id: institucionId, ...(q ? { q } : {}) }).toString();
  return client.get(`/comparecientes?${qs}`).then((r) => r.data);
};

export const fetchCompareciente = (id) =>
  client.get(`/comparecientes/${id}`).then((r) => r.data);

export const createCompareciente = (data) =>
  client.post('/comparecientes', data).then((r) => r.data);

export const updateCompareciente = (id, data) =>
  client.put(`/comparecientes/${id}`, data).then((r) => r.data);

// ──────────────────────────────────────────────────────────────
// AUTH — Catálogo de garantías (banco/bufete)
// ──────────────────────────────────────────────────────────────

export const fetchGarantias = (filters = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ''))
  ).toString();
  return client.get(`/garantias${qs ? `?${qs}` : ''}`).then((r) => r.data);
};

export const fetchGarantia = (id) =>
  client.get(`/garantias/${id}`).then((r) => r.data);

export const createGarantia = (data) =>
  client.post('/garantias', data).then((r) => r.data);

export const updateGarantia = (id, data) =>
  client.put(`/garantias/${id}`, data).then((r) => r.data);

export const deleteGarantia = (id) =>
  client.delete(`/garantias/${id}`).then((r) => r.data);

// ──────────────────────────────────────────────────────────────
// AUTH — Vinculación con contratos
// ──────────────────────────────────────────────────────────────

export const listComparecientesDelContrato = (contratoId) =>
  client.get(`/contratos/${contratoId}/comparecientes`).then((r) => r.data);

export const vincularCompareciente = (contratoId, payload) =>
  client.post(`/contratos/${contratoId}/comparecientes`, payload).then((r) => r.data);

export const editarVinculoCompareciente = (contratoId, compId, payload) =>
  client.put(`/contratos/${contratoId}/comparecientes/${compId}`, payload).then((r) => r.data);

export const desvincularCompareciente = (contratoId, compId) =>
  client.delete(`/contratos/${contratoId}/comparecientes/${compId}`).then((r) => r.data);

export const listGarantiasDelContrato = (contratoId) =>
  client.get(`/contratos/${contratoId}/garantias`).then((r) => r.data);

export const vincularGarantia = (contratoId, garantiaId, orden) =>
  client.post(`/contratos/${contratoId}/garantias`, { garantia_id: garantiaId, ...(orden ? { orden } : {}) }).then((r) => r.data);

export const desvincularGarantia = (contratoId, garantiaId) =>
  client.delete(`/contratos/${contratoId}/garantias/${garantiaId}`).then((r) => r.data);

// ──────────────────────────────────────────────────────────────
// PORTAL PÚBLICO (sin JWT, con token de contrato)
// ──────────────────────────────────────────────────────────────
// Usa axios directo (no `client`) porque las rutas /api/public/* no llevan
// Authorization header. El interceptor de client podría agregarlo y romper
// la validación del portal.

const publicClient = axios.create({
  baseURL: client.defaults.baseURL,
});

export const publicListComparecientes = (token) =>
  publicClient.get(`/public/contratos/${token}/comparecientes`).then((r) => r.data);

export const publicCreateCompareciente = (token, data) =>
  publicClient.post(`/public/contratos/${token}/comparecientes`, data).then((r) => r.data);

export const publicDeleteCompareciente = (token, compId) =>
  publicClient.delete(`/public/contratos/${token}/comparecientes/${compId}`).then((r) => r.data);

export const publicListGarantias = (token) =>
  publicClient.get(`/public/contratos/${token}/garantias`).then((r) => r.data);

export const publicCreateGarantia = (token, data) =>
  publicClient.post(`/public/contratos/${token}/garantias`, data).then((r) => r.data);

export const publicDeleteGarantia = (token, garantiaId) =>
  publicClient.delete(`/public/contratos/${token}/garantias/${garantiaId}`).then((r) => r.data);

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

export const ROLES = [
  { value: 'fiador', label: 'Fiador', desc: 'Responde solidariamente del crédito' },
  { value: 'tercero_garante', label: 'Tercero garante', desc: 'Solo aporta un bien, no responde con su patrimonio' },
];

export const TIPOS_GARANTIA = [
  { value: 'fiduciaria',  label: 'Fiduciaria',  desc: 'Garantía personal (uno o más fiadores)' },
  { value: 'hipotecaria', label: 'Hipotecaria', desc: 'Bien inmueble' },
  { value: 'prendaria',   label: 'Prendaria',   desc: 'Bien mueble (vehículo u otro)' },
];

export function nombreAportante(garantia, comparecientes, datosCliente) {
  if (!garantia || !garantia.aportante_tipo) return null;
  if (garantia.aportante_tipo === 'cliente') {
    return datosCliente?.nombre || 'Cliente del contrato';
  }
  if (garantia.aportante_tipo === 'compareciente') {
    const c = (comparecientes || []).find((x) => x.compareciente_id === garantia.aportante_compareciente_id || x.id === garantia.aportante_compareciente_id);
    return c?.nombre || `Compareciente #${garantia.aportante_compareciente_id}`;
  }
  return null;
}
