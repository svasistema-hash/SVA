import client from './client';

export const fetchInstituciones = () => client.get('/instituciones').then((r) => r.data);
export const fetchInstitucion = (slug) => client.get(`/instituciones/${slug}`).then((r) => r.data);
export const fetchModelos = (slug) => client.get(`/instituciones/${slug}/modelos`).then((r) => r.data);
export const createInstitucion = (data) => client.post('/instituciones', data).then((r) => r.data);
export const updateInstitucion = (slug, data) => client.put(`/instituciones/${slug}`, data).then((r) => r.data);
export const createModelo = (slug, data) => client.post(`/instituciones/${slug}/modelos`, data).then((r) => r.data);
export const duplicarModelo = (slug, id, nombre) => client.post(`/instituciones/${slug}/modelos/${id}/duplicar`, nombre ? { nombre } : {}).then((r) => r.data);
export const clonarModelo = (id, nombre) => client.post(`/modelos/${id}/clonar`, nombre ? { nombre } : {}).then((r) => r.data);
export const fetchModelo = (slug, id) => client.get(`/instituciones/${slug}/modelos/${id}`).then((r) => r.data);
export const updateModelo = (slug, id, data) => client.put(`/instituciones/${slug}/modelos/${id}`, data).then((r) => r.data);
export const updateClausula = (slug, id, data) => client.put(`/instituciones/${slug}/clausulas/${id}`, data).then((r) => r.data);

export const fetchClausulasDeModelo = (modeloId) => client.get(`/modelos/${modeloId}/clausulas`).then((r) => r.data);
export const agregarClausulasAlModelo = (modeloId, clausulas) => client.post(`/modelos/${modeloId}/clausulas`, { clausulas }).then((r) => r.data);
export const quitarClausulaDelModelo = (modeloId, clausulaId) => client.delete(`/modelos/${modeloId}/clausulas/${clausulaId}`).then((r) => r.data);
export const reordenarClausulasDelModelo = (modeloId, orden) => client.put(`/modelos/${modeloId}/clausulas/orden`, { orden }).then((r) => r.data);
export const fetchBibliotecaClausulas = (slug) => client.get(`/clausulas/biblioteca?institucion_id=${slug}`).then((r) => r.data);
export const updateClausulaById = (id, data) => client.put(`/clausulas/${id}`, data).then((r) => r.data);
