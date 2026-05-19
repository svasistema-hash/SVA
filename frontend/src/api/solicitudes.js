// API del portal público del cliente (F1 C3) + endpoints internos
// (generar token, lista de tokens viejos).
//
// IMPORTANTE: para endpoints públicos usamos publicClient (sin interceptor de auth)
// porque el cliente final NO está logueado y un 401 ahí no debe redirigir a /login.

import axios from 'axios';
import client from './client';

const publicClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// ──────────────────────────────────────────────────────────────
// Internos (autenticados)
// ──────────────────────────────────────────────────────────────

// Genera un token público para que el cliente complete el contrato vía portal.
export const generarTokenCliente = (contratoId) =>
  client.post(`/contratos/${contratoId}/token-cliente`).then((r) => r.data);

// Legacy: tokens de institución (no usado por portal C3, pero página tenant/Solicitudes lo usa).
export const crearTokenInstitucion = (slug) =>
  client.post(`/instituciones/${slug}/solicitudes/token`).then((r) => r.data);
export const listarTokensInstitucion = (slug) =>
  client.get(`/instituciones/${slug}/solicitudes/tokens`).then((r) => r.data);

// ──────────────────────────────────────────────────────────────
// Públicos (cliente sin login, /solicitud/:token)
// ──────────────────────────────────────────────────────────────

export const validarTokenContrato = (token) =>
  publicClient.get(`/public/solicitud/${token}`).then((r) => r.data);

export const guardarBorrador = (token, datos) =>
  publicClient.put(`/public/solicitud/${token}/datos`, datos).then((r) => r.data);

export const subirDpiCliente = (token, file) => {
  const fd = new FormData();
  fd.append('imagen', file);
  return publicClient
    .post(`/public/solicitud/${token}/dpi`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
};

export const subirReciboCliente = (token, file) => {
  const fd = new FormData();
  fd.append('imagen', file);
  return publicClient
    .post(`/public/solicitud/${token}/recibo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
};

export const confirmarSolicitud = (token, datos) =>
  publicClient.post(`/public/solicitud/${token}/confirmar`, datos).then((r) => r.data);
