import client from './client';

export const crearToken = (slug) => client.post(`/instituciones/${slug}/solicitudes/token`).then((r) => r.data);
export const listarTokens = (slug) => client.get(`/instituciones/${slug}/solicitudes/tokens`).then((r) => r.data);

export const validarToken = (slug, token) => client.get(`/public/solicitud/${slug}?token=${encodeURIComponent(token)}`).then((r) => r.data);
export const enviarSolicitud = (slug, token, datos) => client.post(`/public/solicitud/${slug}?token=${encodeURIComponent(token)}`, datos).then((r) => r.data);
export const scanDpiPublico = (file) => {
  const fd = new FormData();
  fd.append('imagen', file);
  return client.post('/public/scan-dpi', fd).then((r) => r.data);
};
export const scanReciboPublico = (file) => {
  const fd = new FormData();
  fd.append('imagen', file);
  return client.post('/public/scan-recibo', fd).then((r) => r.data);
};
