// F1 C5 — Panel del bufete: contratos en 'revision_abogados' cross-tenant.
//
// Acceso: usuarios admin sin institucion_id (rol bufete). En F8 se separará en
// 'abogado_bufete'; por ahora cualquier admin de LexDocs ve la lista global.
//
// Endpoints:
//   GET /api/pendientes              → lista cross-tenant (con filtros opcionales)
//   GET /api/pendientes/conteo       → { n } para sidebar
//   GET /api/pendientes/:id          → detalle (igual a /contratos/:id pero sin tenant lock)

const express = require('express');
const db = require('../db');
const { decrypt } = require('../encryption');

const router = express.Router();

function requireBufete(req, res, next) {
  // Bufete = admin sin institucion_id. Cualquier otro perfil → 403.
  if (req.user?.role !== 'admin' || req.user?.institucion_id) {
    return res.status(403).json({ error: 'Acceso restringido al equipo del bufete', code: 403 });
  }
  next();
}

function decryptJsonSafe(value, label) {
  if (!value) return null;
  try { return JSON.parse(decrypt(value)); }
  catch (e) { console.error(`[pendientes decrypt failed] ${label}: ${e.message}`); return null; }
}

function parsePlain(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

// GET /api/pendientes — lista global de contratos en revision_abogados.
//   Query opcionales: institucion_slug, dpi_fisico ('si'|'no'), dias_min, dias_max.
router.get('/', requireBufete, (req, res, next) => {
  try {
    const { institucion_slug, dpi_fisico, dias_min, dias_max } = req.query;
    let sql = `
      SELECT c.id, c.no_contrato, c.estado, c.created_at, c.updated_at,
             c.dpi_fisico_recibido, c.dpi_fisico_recibido_at,
             c.datos_cliente, c.datos_credito,
             i.slug AS institucion_slug, i.nombre AS institucion_nombre, i.tipo AS institucion_tipo,
             m.nombre AS modelo_nombre, m.tipo_garantia
      FROM contratos c
      JOIN instituciones i ON c.institucion_id = i.id
      JOIN modelos m ON c.modelo_id = m.id
      WHERE c.estado = 'revision_abogados'
    `;
    const params = [];
    if (institucion_slug) { sql += ' AND i.slug = ?'; params.push(institucion_slug); }
    if (dpi_fisico === 'si') sql += ' AND c.dpi_fisico_recibido = 1';
    if (dpi_fisico === 'no') sql += ' AND c.dpi_fisico_recibido = 0';
    sql += ' ORDER BY c.updated_at ASC'; // los más viejos primero (más urgentes)

    const filas = db.prepare(sql).all(...params).map((row) => {
      const datosCliente = decryptJsonSafe(row.datos_cliente, `contrato ${row.id} datos_cliente`);
      const datosCredito = parsePlain(row.datos_credito);
      const dias = Math.floor((Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: row.id,
        no_contrato: row.no_contrato,
        estado: row.estado,
        created_at: row.created_at,
        updated_at: row.updated_at,
        dias_esperando: dias,
        dpi_fisico_recibido: !!row.dpi_fisico_recibido,
        dpi_fisico_recibido_at: row.dpi_fisico_recibido_at,
        institucion: {
          slug: row.institucion_slug,
          nombre: row.institucion_nombre,
          tipo: row.institucion_tipo,
        },
        modelo: { nombre: row.modelo_nombre, tipo_garantia: row.tipo_garantia },
        cliente: datosCliente ? {
          nombre: datosCliente.nombre || null,
          dpi: datosCliente.dpi || null,
          tipo_persona: datosCliente.tipo_persona || null,
        } : null,
        credito: datosCredito ? {
          monto: datosCredito.monto || null,
          moneda: datosCredito.moneda || 'Q',
          plazo_meses: datosCredito.plazo_meses || null,
        } : null,
      };
    });

    // Filtros que requieren campo derivado (dias_esperando) se aplican en JS.
    let filtradas = filas;
    if (dias_min) filtradas = filtradas.filter((f) => f.dias_esperando >= Number(dias_min));
    if (dias_max) filtradas = filtradas.filter((f) => f.dias_esperando <= Number(dias_max));

    res.json(filtradas);
  } catch (err) { next(err); }
});

// GET /api/pendientes/conteo — total para sidebar.
router.get('/conteo', requireBufete, (req, res, next) => {
  try {
    const r = db.prepare("SELECT COUNT(*) AS n FROM contratos WHERE estado = 'revision_abogados'").get();
    res.json({ n: r.n });
  } catch (err) { next(err); }
});

module.exports = router;
