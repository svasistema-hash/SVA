// Sprint LexDocs Legal Fase 2 CP3 — Endpoints master cross-tenant.
//
// Solo accesibles con req.scope.es_master === true (firma_id = 1).
// Permite al bufete master (LexDocs Legal) supervisar a los sub-tenants
// sin acceso a PII por defecto. La PII se obtiene solo mediante override
// explícito con motivo auditado.

const express = require('express');
const db = require('../db');
const { audit } = require('../utils/audit');
const { requireMasterFirma } = require('../middleware/firmaScope');
const { compilarSociedad } = require('../sociedad-engine');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────
// GET /api/master/sociedades — Bandeja cross-tenant.
// Devuelve metadata (NO descifra PII). Para PII usar override-compliance.
// ─────────────────────────────────────────────────────────────────
router.get('/sociedades', requireMasterFirma, (req, res, next) => {
  try {
    const { estado, firma_id, desde, hasta, q } = req.query;
    const wh = []; const params = [];
    if (estado) { wh.push('s.estado = ?'); params.push(estado); }
    if (firma_id) { wh.push('s.firma_id = ?'); params.push(parseInt(firma_id, 10)); }
    if (desde) { wh.push('s.created_at >= ?'); params.push(desde); }
    if (hasta) { wh.push('s.created_at <= ?'); params.push(hasta + ' 23:59:59'); }
    if (q) { wh.push('(s.denominacion LIKE ? OR s.correlativo LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    const whereSql = wh.length > 0 ? `WHERE ${wh.join(' AND ')}` : '';

    const rows = db.prepare(`
      SELECT
        s.id, s.correlativo, s.firma_id, s.tipo_sociedad, s.estado,
        s.denominacion, s.moneda, s.capital_social,
        s.created_at, s.updated_at, s.aprobado_at, s.listo_para_rm_at,
        s.enviado_rm_at, s.rm_folio, s.rm_libro, s.rm_fecha_inscripcion,
        s.anulado_motivo, s.anulado_at,
        f.slug AS firma_slug, f.nombre AS firma_nombre, f.tipo AS firma_tipo,
        (SELECT COUNT(*) FROM accionistas a WHERE a.sociedad_id = s.id) AS accionistas_count,
        (SELECT COUNT(*) FROM representantes_sa r WHERE r.sociedad_id = s.id) AS representantes_count
      FROM sociedades s
      JOIN firmas f ON f.id = s.firma_id
      ${whereSql}
      ORDER BY s.created_at DESC LIMIT 500
    `).all(...params);

    audit(req, 'MASTER_LISTED_SOCIEDADES', 'master', null, {
      filtros_aplicados: { estado, firma_id, desde, hasta, q },
      resultados_count: rows.length,
      tenant_tipo: 'firma', tenant_id: 1,
    });

    res.json(rows);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/master/metricas — Volumen y tiempos por firma.
// ─────────────────────────────────────────────────────────────────
router.get('/metricas', requireMasterFirma, (req, res, next) => {
  try {
    const porFirma = db.prepare(`
      SELECT
        f.id, f.slug, f.nombre, f.tipo, f.activo,
        COUNT(s.id) AS sociedades_total,
        SUM(CASE WHEN s.estado = 'inscrito_RM' THEN 1 ELSE 0 END) AS inscritas,
        SUM(CASE WHEN s.estado = 'anulada' THEN 1 ELSE 0 END) AS anuladas,
        SUM(CASE WHEN s.estado IN ('en_curso','revision_abogado','correcciones_cliente','listo_para_RM','enviado_RM') THEN 1 ELSE 0 END) AS en_proceso
      FROM firmas f
      LEFT JOIN sociedades s ON s.firma_id = f.id
      GROUP BY f.id
      ORDER BY (CASE WHEN f.id = 1 THEN 0 ELSE 1 END), f.nombre
    `).all();

    const conteoGlobal = db.prepare(`
      SELECT estado, COUNT(*) AS n FROM sociedades GROUP BY estado
    `).all().reduce((acc, r) => { acc[r.estado] = r.n; return acc; }, {});

    res.json({ por_firma: porFirma, conteo_global: conteoGlobal });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/master/sociedades/:id/override-compliance
// Acceso master a PII descifrada de un caso de otra firma. Requiere motivo.
// Audit fuerte con motivo en clear, IP, user-agent.
// ─────────────────────────────────────────────────────────────────
router.post('/sociedades/:id/override-compliance', requireMasterFirma, (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const motivo = (req.body?.motivo || '').trim();
    if (!motivo || motivo.length < 10) {
      return res.status(400).json({ error: 'motivo requerido (mínimo 10 caracteres)', code: 400 });
    }
    const sociedad = db.prepare('SELECT * FROM sociedades WHERE id = ?').get(id);
    if (!sociedad) return res.status(404).json({ error: 'Sociedad no encontrada', code: 404 });

    const compilado = compilarSociedad(id, { notario: { nombre: req.user.email } });

    audit(req, 'MASTER_OVERRIDE_COMPLIANCE', 'sociedad', id, {
      motivo, master_user_email: req.user.email,
      sociedad_firma_id: sociedad.firma_id,
      tenant_tipo: 'firma', tenant_id: 1,
    });

    res.json(compilado);
  } catch (err) { next(err); }
});

module.exports = router;
