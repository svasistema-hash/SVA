import client from './client';

export const fetchNotarios = (slug, { soloActivos = true } = {}) =>
  client
    .get(`/instituciones/${slug}/notarios${soloActivos ? '' : '?activo=0'}`)
    .then((r) => r.data);

export const createNotario = (slug, data) =>
  client.post(`/instituciones/${slug}/notarios`, data).then((r) => r.data);

export const updateNotario = (slug, id, data) =>
  client.put(`/instituciones/${slug}/notarios/${id}`, data).then((r) => r.data);
