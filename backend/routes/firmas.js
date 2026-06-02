// Sprint LexDocs Legal Fase 2 CP3 — Endpoints CRUD de firmas.
//
// Las firmas son los tenants jerárquicos de Fase 2:
//   - id=1: firma master LexDocs Legal (creada por la migración).
//   - id>1 con parent_id=1: sub-tenants (bufetes/notarías/contadores).
//
// Permisos:
//   - POST /api/firmas (crear sub-tenant)        → solo master.
//   - GET /api/firmas (listar)                   → master ve todas; sub-tenant solo la suya.
//   - GET /api/firmas/:id                        → master ve cualquiera; sub-tenant solo la suya.
//   - PUT /api/firmas/:id                        → master ve cualquiera; sub-tenant solo edita su propia (campos limitados).
//   - POST /api/firmas/:id/suspender             → solo master, no se permite sobre master.
//   - POST /api/firmas/:id/reactivar             → solo master.
//
// Audit log granular en cada operación.

const express = require('express');
const db = require('../db');
const { audit } = require('../utils/audit');
const { requireFirmaScope, requireMasterFirma, MASTER_FIRMA_ID } = require('../middleware/firmaScope');
const { hashFor } = require('../encryption');

const router = express.Router();

// Acción de auditoría: extender audit para usar tenant_tipo polimórfico.
function auditFirma(req, accion, firma_id, detalles = {}) {
  // Reuso de audit() existente; agregamos tenant_tipo+tenant_id explícitamente.
  // (audit() escribe institucion_id desde req.user; aquí pasamos también
  // tenant_tipo/tenant_id por el detalles JSON para no romper compat.)
  audit(req, accion, 'firma', firma_id, {
    ...detalles,
    tenant_tipo: 'firma',
    tenant_id: firma_id,
  });
}

// Validación de tipo
const TIPOS_VALIDOS = new Set(['bufete', 'notaria', 'contador', 'corredor_legal']);
const SLUG_RE = /^[a-z0-9-]+$/;

function descifrarFirma(row) {
  // Las firmas no tienen PII cifrada (datos son públicos). Devolver tal cual.
  // Aplicamos un filtro defensivo de campos sensibles que no exponemos: ninguno por ahora.
  return row;
}

// ─────────────────────────────────────────────────────────────────
// POST /api/firmas — Crear sub-tenant. Solo master.
// ─────────────────────────────────────────────────────────────────
router.post('/', requireMasterFirma, (req, res, next) => {
  try {
    const { slug, nombre, tipo, nit, direccion, telefono, email, correlativo_prefijo } = req.body || {};
    if (!slug || !nombre || !tipo || !correlativo_prefijo) {
      return res.status(400).json({ error: 'slug, nombre, tipo y correlativo_prefijo requeridos', code: 400 });
    }
    if (!SLUG_RE.test(slug)) {
      return res.status(400).json({ error: 'slug debe contener solo a-z, 0-9 y guiones', code: 400 });
    }
    if (!TIPOS_VALIDOS.has(tipo)) {
      return res.status(400).json({ error: `tipo IN ('${[...TIPOS_VALIDOS].join("','")}')`, code: 400 });
    }
    const existe = db.prepare('SELECT id FROM firmas WHERE slug = ?').get(slug);
    if (existe) return res.status(409).json({ error: 'Ya existe una firma con ese slug', code: 409 });

    const info = db.prepare(`
      INSERT INTO firmas (slug, nombre, tipo, parent_id, nit, nit_hash, direccion, telefono, email, correlativo_prefijo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      slug, nombre, tipo, MASTER_FIRMA_ID,
      nit || null,
      nit ? hashFor('nit', nit) : null,
      direccion || null, telefono || null, email || null,
      correlativo_prefijo,
    );

    auditFirma(req, 'FIRMA_CREADA', info.lastInsertRowid, { slug, tipo, nombre });

    const row = db.prepare('SELECT * FROM firmas WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(descifrarFirma(row));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/firmas — Listar. Master ve todas; sub-tenant solo la suya.
// ─────────────────────────────────────────────────────────────────
router.get('/', requireFirmaScope, (req, res, next) => {
  try {
    let rows;
    if (req.scope.es_master) {
      rows = db.prepare(`
        SELECT * FROM firmas
        ORDER BY (CASE WHEN id = 1 THEN 0 ELSE 1 END), nombre ASC
      `).all();
    } else {
      rows = db.prepare('SELECT * FROM firmas WHERE id = ?').all(req.scope.firma_id);
    }
    res.json(rows.map(descifrarFirma));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/firmas/:id — Detalle.
// ─────────────────────────────────────────────────────────────────
router.get('/:id', requireFirmaScope, (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!req.scope.es_master && req.scope.firma_id !== id) {
      return res.status(404).json({ error: 'Firma no encontrada', code: 404 }); // anti-enumeration
    }
    const row = db.prepare('SELECT * FROM firmas WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Firma no encontrada', code: 404 });
    res.json(descifrarFirma(row));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/firmas/:id — Editar.
// Master: edita cualquier firma, todos los campos editables.
// Sub-tenant: solo edita su propia firma. Solo campos no estructurales
// (nombre, direccion, telefono, email). NO puede cambiar slug, tipo, parent_id.
// ─────────────────────────────────────────────────────────────────
router.put('/:id', requireFirmaScope, (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = db.prepare('SELECT * FROM firmas WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Firma no encontrada', code: 404 });
    if (!req.scope.es_master && req.scope.firma_id !== id) {
      return res.status(404).json({ error: 'Firma no encontrada', code: 404 });
    }

    const setsPermitidos = req.scope.es_master
      ? ['nombre', 'nit', 'direccion', 'telefono', 'email', 'correlativo_prefijo']
      : ['nombre', 'direccion', 'telefono', 'email'];

    const sets = [];
    const params = [];
    const cambios = {};
    for (const k of setsPermitidos) {
      if (k in (req.body || {})) {
        sets.push(`${k} = ?`);
        params.push(req.body[k]);
        cambios[k] = true;
        if (k === 'nit') {
          sets.push('nit_hash = ?');
          params.push(req.body.nit ? hashFor('nit', req.body.nit) : null);
        }
      }
    }
    if (sets.length === 0) return res.json(descifrarFirma(row));

    params.push(id);
    db.prepare(`UPDATE firmas SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    auditFirma(req, 'FIRMA_EDITADA', id, { campos: Object.keys(cambios) });

    const updated = db.prepare('SELECT * FROM firmas WHERE id = ?').get(id);
    res.json(descifrarFirma(updated));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/firmas/:id/suspender — Solo master. No se permite sobre master.
// ─────────────────────────────────────────────────────────────────
router.post('/:id/suspender', requireMasterFirma, (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === MASTER_FIRMA_ID) {
      return res.status(400).json({ error: 'No se permite suspender el master tenant', code: 400 });
    }
    const motivo = (req.body?.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'motivo requerido', code: 400 });

    const row = db.prepare('SELECT * FROM firmas WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Firma no encontrada', code: 404 });

    db.prepare(`
      UPDATE firmas SET activo = 0, suspendido_motivo = ?, suspendido_at = datetime('now')
      WHERE id = ?
    `).run(motivo, id);
    auditFirma(req, 'FIRMA_SUSPENDIDA', id, { motivo, suspendido_por_user_id: req.user.userId });

    res.json(descifrarFirma(db.prepare('SELECT * FROM firmas WHERE id = ?').get(id)));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/firmas/:id/reactivar — Solo master.
// ─────────────────────────────────────────────────────────────────
router.post('/:id/reactivar', requireMasterFirma, (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const row = db.prepare('SELECT * FROM firmas WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Firma no encontrada', code: 404 });

    db.prepare(`
      UPDATE firmas SET activo = 1, suspendido_motivo = NULL, suspendido_at = NULL
      WHERE id = ?
    `).run(id);
    auditFirma(req, 'FIRMA_REACTIVADA', id, {});

    res.json(descifrarFirma(db.prepare('SELECT * FROM firmas WHERE id = ?').get(id)));
  } catch (err) { next(err); }
});

module.exports = router;
