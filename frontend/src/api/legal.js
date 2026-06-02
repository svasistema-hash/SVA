// Sprint LexDocs Legal Fase 2 CP4 — API client del producto Legal (S.A.).
//
// Agrupado en un solo módulo para minimizar archivos en el sprint inicial.
// Si crece, refactor en {sociedades, firmas, master, publicSociedades}.js.

import client from './client';
import axios from 'axios';

// ──────────────────────────────────────────────────────────────
// FIRMAS — Multi-tenant jerárquico
// ──────────────────────────────────────────────────────────────

export const fetchFirmas = () =>
  client.get('/firmas').then((r) => r.data);

export const fetchFirma = (id) =>
  client.get(`/firmas/${id}`).then((r) => r.data);

export const createFirma = (data) =>
  client.post('/firmas', data).then((r) => r.data);

export const updateFirma = (id, data) =>
  client.put(`/firmas/${id}`, data).then((r) => r.data);

export const suspenderFirma = (id, motivo) =>
  client.post(`/firmas/${id}/suspender`, { motivo }).then((r) => r.data);

export const reactivarFirma = (id) =>
  client.post(`/firmas/${id}/reactivar`).then((r) => r.data);

// ──────────────────────────────────────────────────────────────
// SOCIEDADES — Entidad principal del sub-tenant
// ──────────────────────────────────────────────────────────────

export const fetchSociedades = (filtros = {}) => {
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(filtros).filter(([, v]) => v != null && v !== ''))
  );
  const qs = params.toString();
  return client.get(`/sociedades${qs ? `?${qs}` : ''}`).then((r) => r.data);
};

export const fetchConteoEstadosSociedades = () =>
  client.get('/sociedades/conteo-estados').then((r) => r.data);

export const fetchSociedad = (id) =>
  client.get(`/sociedades/${id}`).then((r) => r.data);

export const createSociedad = (data) =>
  client.post('/sociedades', data).then((r) => r.data);

export const updateSociedad = (id, data) =>
  client.put(`/sociedades/${id}`, data).then((r) => r.data);

export const compilarSociedad = (id) =>
  client.get(`/sociedades/${id}/compilar`).then((r) => r.data);

export const fetchAuditLogSociedad = (id) =>
  client.get(`/sociedades/${id}/audit-log`).then((r) => r.data);

// Transiciones
export const avanzarSociedad = (id) =>
  client.post(`/sociedades/${id}/avanzar`).then((r) => r.data);

export const regresarSociedad = (id, motivo) =>
  client.post(`/sociedades/${id}/regresar`, { motivo }).then((r) => r.data);

export const anularSociedad = (id, motivo) =>
  client.post(`/sociedades/${id}/anular`, { motivo }).then((r) => r.data);

export const marcarInscritoRM = (id, datos) =>
  client.post(`/sociedades/${id}/marcar-inscrito-rm`, datos).then((r) => r.data);

export const solicitarCorrecciones = (id, campos_a_corregir, comentario) =>
  client.post(`/sociedades/${id}/correcciones`, { campos_a_corregir, comentario }).then((r) => r.data);

// Sub-entidades
export const fetchAccionistas = (sociedadId) =>
  client.get(`/sociedades/${sociedadId}/accionistas`).then((r) => r.data);

export const createAccionista = (sociedadId, data) =>
  client.post(`/sociedades/${sociedadId}/accionistas`, data).then((r) => r.data);

export const updateAccionista = (sociedadId, accId, data) =>
  client.put(`/sociedades/${sociedadId}/accionistas/${accId}`, data).then((r) => r.data);

export const deleteAccionista = (sociedadId, accId) =>
  client.delete(`/sociedades/${sociedadId}/accionistas/${accId}`).then((r) => r.data);

export const fetchRepresentantes = (sociedadId) =>
  client.get(`/sociedades/${sociedadId}/representantes`).then((r) => r.data);

export const createRepresentante = (sociedadId, data) =>
  client.post(`/sociedades/${sociedadId}/representantes`, data).then((r) => r.data);

export const deleteRepresentante = (sociedadId, repId) =>
  client.delete(`/sociedades/${sociedadId}/representantes/${repId}`).then((r) => r.data);

export const fetchDirecciones = (sociedadId) =>
  client.get(`/sociedades/${sociedadId}/direcciones`).then((r) => r.data);

export const createDireccion = (sociedadId, data) =>
  client.post(`/sociedades/${sociedadId}/direcciones`, data).then((r) => r.data);

export const deleteDireccion = (sociedadId, dirId) =>
  client.delete(`/sociedades/${sociedadId}/direcciones/${dirId}`).then((r) => r.data);

// ──────────────────────────────────────────────────────────────
// MASTER — Cross-tenant (solo firma_id=1)
// ──────────────────────────────────────────────────────────────

export const fetchMasterSociedades = (filtros = {}) => {
  const params = new URLSearchParams(
    Object.fromEntries(Object.entries(filtros).filter(([, v]) => v != null && v !== ''))
  );
  const qs = params.toString();
  return client.get(`/master/sociedades${qs ? `?${qs}` : ''}`).then((r) => r.data);
};

export const fetchMasterMetricas = () =>
  client.get('/master/metricas').then((r) => r.data);

export const overrideCompliance = (id, motivo) =>
  client.post(`/master/sociedades/${id}/override-compliance`, { motivo }).then((r) => r.data);

// ──────────────────────────────────────────────────────────────
// PORTAL PÚBLICO (sin login, con token)
// ──────────────────────────────────────────────────────────────
// Cliente axios separado para no enviar Authorization automáticamente
// ni dispararse el interceptor de logout 401.

const publicClient = axios.create({ baseURL: client.defaults.baseURL });

export const publicFetchSociedad = (token) =>
  publicClient.get(`/public/sociedades/${token}`).then((r) => r.data);

export const publicUpdateDatos = (token, body) =>
  publicClient.put(`/public/sociedades/${token}/datos`, body).then((r) => r.data);

export const publicCreateAccionista = (token, data) =>
  publicClient.post(`/public/sociedades/${token}/accionistas`, data).then((r) => r.data);

export const publicDeleteAccionista = (token, accId) =>
  publicClient.delete(`/public/sociedades/${token}/accionistas/${accId}`).then((r) => r.data);

export const publicCreateRepresentante = (token, data) =>
  publicClient.post(`/public/sociedades/${token}/representantes`, data).then((r) => r.data);

export const publicDeleteRepresentante = (token, repId) =>
  publicClient.delete(`/public/sociedades/${token}/representantes/${repId}`).then((r) => r.data);

export const publicCreateDireccion = (token, data) =>
  publicClient.post(`/public/sociedades/${token}/direcciones`, data).then((r) => r.data);

export const publicDeleteDireccion = (token, dirId) =>
  publicClient.delete(`/public/sociedades/${token}/direcciones/${dirId}`).then((r) => r.data);

export const publicConfirmar = (token) =>
  publicClient.post(`/public/sociedades/${token}/confirmar`, {}).then((r) => r.data);

// ──────────────────────────────────────────────────────────────
// Constantes y helpers
// ──────────────────────────────────────────────────────────────

export const ESTADOS_SOCIEDAD = [
  { value: 'en_curso', label: 'En curso del cliente', color: 'azul' },
  { value: 'revision_abogado', label: 'En revisión del abogado', color: 'oro' },
  { value: 'correcciones_cliente', label: 'Correcciones del cliente', color: 'naranja' },
  { value: 'listo_para_RM', label: 'Listo para protocolización notarial', color: 'verde' },
  { value: 'enviado_RM', label: 'Enviado al Registro Mercantil', color: 'verde-claro' },
  { value: 'inscrito_RM', label: 'Inscrito en el Registro Mercantil', color: 'verde-oscuro' },
  { value: 'anulada', label: 'Anulada', color: 'gris' },
];

export const labelEstado = (estado) =>
  ESTADOS_SOCIEDAD.find((e) => e.value === estado)?.label || estado;

export const CARGOS_REPRESENTANTE = [
  'Administrador Único', 'Presidente', 'Vicepresidente',
  'Secretario', 'Tesorero', 'Vocal', 'Gerente General', 'Apoderado',
];

export const TIPOS_FIRMA = [
  { value: 'bufete', label: 'Bufete' },
  { value: 'notaria', label: 'Notaría' },
  { value: 'contador', label: 'Contaduría' },
  { value: 'corredor_legal', label: 'Corredor legal' },
];

export const TIPOS_DIRECCION = [
  { value: 'fiscal', label: 'Fiscal' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'notificaciones', label: 'Para notificaciones' },
];
