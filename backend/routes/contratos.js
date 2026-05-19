const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const { generatePdf } = require('../utils/pdfGenerator');
const { nextCorrelativo, compilarContrato } = require('../contrato-engine');
const { PDFS_PATH } = require('../config');
const { encrypt, decrypt } = require('../encryption');
const { puedeTransitar, siguienteForward, siguienteBackward, estadosPosibles } = require('../utils/contrato-transiciones');
const { audit } = require('../utils/audit');

const router = express.Router();

// datos_cliente y datos_garantia se guardan como JSON encriptado (AES-GCM);
// datos_credito y datos_firmas en JSON plaintext. Estos helpers manejan ambas variantes.
function decryptJson(value, label) {
  if (value === null || value === undefined || value === '') return null;
  try {
    return JSON.parse(decrypt(value));
  } catch (e) {
    console.error(`[contratos decrypt+parse failed] ${label}: ${e.message}`);
    return null;
  }
}
function parsePlainJson(value) {
  if (value === null || value === undefined || value === '') return null;
  try { return JSON.parse(value); } catch { return null; }
}

function parseJsonFields(row) {
  if (!row) return row;
  return {
    ...row,
    datos_cliente: decryptJson(row.datos_cliente, `contrato ${row.id} datos_cliente`),
    datos_credito: parsePlainJson(row.datos_credito),
    datos_garantia: decryptJson(row.datos_garantia, `contrato ${row.id} datos_garantia`),
    datos_firmas: parsePlainJson(row.datos_firmas),
  };
}

router.get('/', (req, res, next) => {
  try {
    const { institucion, estado } = req.query;
    let sql = `
      SELECT c.*, i.slug AS institucion_slug, i.nombre AS institucion_nombre,
             m.nombre AS modelo_nombre, m.tipo_garantia
      FROM contratos c
      JOIN instituciones i ON c.institucion_id = i.id
      JOIN modelos m ON c.modelo_id = m.id
      WHERE 1=1`;
    const params = [];
    if (req.user.institucion_id) {
      sql += ' AND c.institucion_id = ?';
      params.push(req.user.institucion_id);
    }
    if (institucion) {
      sql += ' AND i.slug = ?';
      params.push(institucion);
    }
    if (estado) {
      sql += ' AND c.estado = ?';
      params.push(estado);
    }
    sql += ' ORDER BY c.updated_at DESC';
    res.json(db.prepare(sql).all(...params).map(parseJsonFields));
  } catch (err) {
    next(err);
  }
});

router.get('/next-correlativo', (req, res, next) => {
  try {
    const institucion_id = parseInt(req.query.institucion_id, 10);
    if (!institucion_id) return res.status(400).json({ error: 'institucion_id requerido', code: 400 });
    if (req.user.institucion_id && req.user.institucion_id !== institucion_id) {
      return res.status(403).json({ error: 'Sin acceso a esa institución', code: 403 });
    }
    const year = new Date().getFullYear();
    res.json({ correlativo: nextCorrelativo(institucion_id, year) });
  } catch (err) {
    next(err);
  }
});

// F1 C3: genera token público para que el cliente complete sus datos vía portal.
// Token vive 48h. Se puede regenerar (anula los anteriores no usados del mismo contrato).
router.post('/:id/token-cliente', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const contrato = db.prepare('SELECT id, institucion_id, estado FROM contratos WHERE id = ?').get(id);
    if (!contrato) return res.status(404).json({ error: 'Contrato no encontrado', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== contrato.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso a este contrato', code: 403 });
    }
    if (contrato.estado !== 'en_curso') {
      return res.status(409).json({
        error: `No se puede generar link de cliente cuando el contrato está en estado '${contrato.estado}'`,
        code: 409,
      });
    }
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO contratos_tokens (contrato_id, token, expires_at, created_by) VALUES (?, ?, ?, ?)`
    ).run(contrato.id, token, expires, req.user.userId || null);
    audit(req, 'generar_token_cliente', 'contrato', contrato.id, { expires_at: expires });
    res.status(201).json({ token, expires_at: expires, url_path: `/solicitud/${token}` });
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const { institucion_id, modelo_id, datos_cliente, datos_credito, datos_garantia, datos_firmas, no_contrato } =
      req.body || {};
    if (!institucion_id || !modelo_id) {
      return res.status(400).json({ error: 'institucion_id y modelo_id requeridos', code: 400 });
    }
    if (req.user.institucion_id && req.user.institucion_id !== institucion_id) {
      return res.status(403).json({ error: 'Sin acceso a esa institución', code: 403 });
    }
    const modelo = db
      .prepare('SELECT id FROM modelos WHERE id = ? AND institucion_id = ?')
      .get(modelo_id, institucion_id);
    if (!modelo)
      return res.status(400).json({ error: 'modelo_id no pertenece a la institución', code: 400 });

    const year = new Date().getFullYear();
    const noContrato = no_contrato || datos_firmas?.correlativo || nextCorrelativo(institucion_id, year);
    const info = db
      .prepare(
        `INSERT INTO contratos
         (institucion_id, modelo_id, no_contrato, estado, datos_cliente, datos_credito, datos_garantia, datos_firmas)
         VALUES (?, ?, ?, 'en_curso', ?, ?, ?, ?)`
      )
      .run(
        institucion_id,
        modelo_id,
        noContrato,
        datos_cliente ? encrypt(JSON.stringify(datos_cliente)) : null,
        datos_credito ? JSON.stringify(datos_credito) : null,
        datos_garantia ? encrypt(JSON.stringify(datos_garantia)) : null,
        datos_firmas ? JSON.stringify(datos_firmas) : null
      );
    const row = db.prepare('SELECT * FROM contratos WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(parseJsonFields(row));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'no_contrato ya existe', code: 409 });
    next(err);
  }
});

router.post('/:id/compilar', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Contrato no encontrado', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== row.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso', code: 403 });
    }
    const datos = {
      datos_cliente: decryptJson(row.datos_cliente, `contrato ${row.id} datos_cliente`) || {},
      datos_credito: parsePlainJson(row.datos_credito) || {},
      datos_garantia: decryptJson(row.datos_garantia, `contrato ${row.id} datos_garantia`) || {},
      datos_firmas: parsePlainJson(row.datos_firmas) || {},
      no_contrato: row.no_contrato,
    };
    const compilado = compilarContrato(row.modelo_id, datos);
    res.json(compilado);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const row = db
      .prepare(
        `SELECT c.*, i.slug AS institucion_slug, i.nombre AS institucion_nombre, i.nit AS institucion_nit,
                m.nombre AS modelo_nombre, m.tipo_garantia
         FROM contratos c
         JOIN instituciones i ON c.institucion_id = i.id
         JOIN modelos m ON c.modelo_id = m.id
         WHERE c.id = ?`
      )
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Contrato no encontrado', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== row.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso a este contrato', code: 403 });
    }
    const fiadores = db
      .prepare('SELECT * FROM fiadores WHERE contrato_id = ?')
      .all(row.id)
      .map((f) => {
        let dpi = null;
        if (f.dpi) {
          try { dpi = decrypt(f.dpi); }
          catch (e) { console.error(`[fiador dpi decrypt failed] id=${f.id}: ${e.message}`); }
        }
        // No exponer dpi_hash en la respuesta
        const { dpi_hash, ...rest } = f;
        return {
          ...rest,
          dpi,
          datos_garantia: f.datos_garantia ? JSON.parse(f.datos_garantia) : null,
        };
      });
    res.json({ ...parseJsonFields(row), fiadores });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Contrato no encontrado', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== existing.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso a este contrato', code: 403 });
    }
    const updates = [];
    const params = [];
    // datos_cliente y datos_garantia van encriptados; el resto en plaintext.
    // estado NO se modifica vía PUT: usar /avanzar, /regresar, /anular, /reenviar-link.
    const map = {
      datos_cliente: (v) => encrypt(JSON.stringify(v)),
      datos_credito: (v) => JSON.stringify(v),
      datos_garantia: (v) => encrypt(JSON.stringify(v)),
      datos_firmas: (v) => JSON.stringify(v),
    };
    for (const [k, transform] of Object.entries(map)) {
      if (req.body && req.body[k] !== undefined) {
        updates.push(`${k} = ?`);
        params.push(transform(req.body[k]));
      }
    }
    if (!updates.length)
      return res.status(400).json({ error: 'No hay campos para actualizar', code: 400 });
    params.push(existing.id);
    db.prepare(`UPDATE contratos SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const row = db.prepare('SELECT * FROM contratos WHERE id = ?').get(existing.id);
    res.json(parseJsonFields(row));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/pdf', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.prepare('SELECT institucion_id, no_contrato FROM contratos WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Contrato no encontrado', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== existing.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso a este contrato', code: 403 });
    }
    const { filename } = await generatePdf(id);
    const legibleName = `${String(existing.no_contrato || `contrato-${id}`).replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
    db.prepare('UPDATE contratos SET pdf_filename = ?, pdf_path = ? WHERE id = ?').run(filename, legibleName, id);
    res.json({ url: `/api/contratos/${id}/pdf` });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/pdf', (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'id inválido', code: 400 });
    const row = db
      .prepare('SELECT institucion_id, no_contrato, pdf_filename FROM contratos WHERE id = ?')
      .get(id);
    if (!row) return res.status(404).json({ error: 'Contrato no encontrado', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== row.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso a este contrato', code: 403 });
    }
    if (!row.pdf_filename) return res.status(404).json({ error: 'PDF aún no generado', code: 404 });

    const safeName = String(row.pdf_filename).replace(/[^A-Za-z0-9._-]/g, '');
    if (safeName !== row.pdf_filename) return res.status(400).json({ error: 'pdf_filename inválido', code: 400 });

    const absPath = path.join(PDFS_PATH, safeName);
    if (path.dirname(absPath) !== PDFS_PATH) return res.status(400).json({ error: 'Ruta inválida', code: 400 });
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Archivo no encontrado', code: 404 });

    const displayName = `${String(row.no_contrato || 'contrato').replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${displayName}"`);
    res.sendFile(absPath);
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════════
// F1: Transiciones de estado + acciones derivadas
// ════════════════════════════════════════════════════════════

// Helper que carga el contrato y verifica tenant. Retorna { row } o
// envía respuesta de error y retorna null.
function loadContratoOrEnd(req, res) {
  const row = db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
  if (!row) { res.status(404).json({ error: 'Contrato no encontrado', code: 404 }); return null; }
  if (req.user.institucion_id && req.user.institucion_id !== row.institucion_id) {
    res.status(403).json({ error: 'Sin acceso a este contrato', code: 403 });
    return null;
  }
  return row;
}

// Aplica una transición y registra audit. Asume que ya se verificaron permisos.
function aplicarTransicion(req, row, nuevoEstado, extraSets = {}, detalles = {}) {
  if (!puedeTransitar(row.estado, nuevoEstado)) {
    return { error: `Transición no permitida: '${row.estado}' → '${nuevoEstado}'. Estados válidos: ${estadosPosibles(row.estado).join(', ') || '(terminal)'}`, code: 400 };
  }
  const sets = ['estado = ?', ...Object.keys(extraSets).map((k) => `${k} = ?`)];
  const vals = [nuevoEstado, ...Object.values(extraSets), row.id];
  const tx = db.transaction(() => {
    db.prepare(`UPDATE contratos SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    audit(req, 'CONTRATO_TRANSICION', 'contrato', row.id, {
      de: row.estado, a: nuevoEstado, ...detalles,
    });
  });
  tx();
  return { ok: true };
}

// POST /api/contratos/:id/avanzar
router.post('/:id/avanzar', (req, res, next) => {
  try {
    const row = loadContratoOrEnd(req, res); if (!row) return;
    const nuevo = siguienteForward(row.estado);
    if (!nuevo) return res.status(400).json({ error: `Sin transición forward desde '${row.estado}'`, code: 400 });
    const extra = nuevo === 'completado' ? { completado_at: "datetime('now')" } : {};
    // 'completado' requiere setear completado_at via expresión SQL — usamos raw bind.
    let result;
    if (nuevo === 'completado') {
      if (!puedeTransitar(row.estado, nuevo)) {
        return res.status(400).json({ error: `Transición no permitida: '${row.estado}' → '${nuevo}'`, code: 400 });
      }
      const tx = db.transaction(() => {
        db.prepare("UPDATE contratos SET estado = ?, completado_at = datetime('now') WHERE id = ?").run(nuevo, row.id);
        audit(req, 'CONTRATO_TRANSICION', 'contrato', row.id, { de: row.estado, a: nuevo });
      });
      tx();
      result = { ok: true };
    } else {
      result = aplicarTransicion(req, row, nuevo);
    }
    if (result.error) return res.status(result.code).json({ error: result.error, code: result.code });
    res.json(db.prepare('SELECT id, estado, completado_at FROM contratos WHERE id = ?').get(row.id));
  } catch (err) { next(err); }
});

// POST /api/contratos/:id/regresar
router.post('/:id/regresar', (req, res, next) => {
  try {
    const row = loadContratoOrEnd(req, res); if (!row) return;
    const nuevo = siguienteBackward(row.estado);
    if (!nuevo) return res.status(400).json({ error: `Sin transición backward desde '${row.estado}'`, code: 400 });
    const result = aplicarTransicion(req, row, nuevo, {}, { motivo: req.body?.motivo || null });
    if (result.error) return res.status(result.code).json({ error: result.error, code: result.code });
    res.json(db.prepare('SELECT id, estado FROM contratos WHERE id = ?').get(row.id));
  } catch (err) { next(err); }
});

// POST /api/contratos/:id/anular { motivo }
router.post('/:id/anular', (req, res, next) => {
  try {
    const row = loadContratoOrEnd(req, res); if (!row) return;
    const motivo = (req.body?.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'motivo requerido', code: 400 });
    if (!puedeTransitar(row.estado, 'anulada')) {
      return res.status(400).json({ error: `No se puede anular desde '${row.estado}'`, code: 400 });
    }
    const tx = db.transaction(() => {
      db.prepare(
        "UPDATE contratos SET estado = 'anulada', anulado_motivo = ?, anulado_por = ?, anulado_at = datetime('now') WHERE id = ?"
      ).run(motivo, req.user.userId || null, row.id);
      audit(req, 'CONTRATO_ANULADO', 'contrato', row.id, { de: row.estado, motivo });
    });
    tx();
    res.json(db.prepare('SELECT id, estado, anulado_motivo, anulado_at FROM contratos WHERE id = ?').get(row.id));
  } catch (err) { next(err); }
});

// POST /api/contratos/:id/reenviar-link
// Crea token nuevo de 48h y mueve abandonada_* → en_curso.
router.post('/:id/reenviar-link', (req, res, next) => {
  try {
    const row = loadContratoOrEnd(req, res); if (!row) return;
    const elegibles = ['abandonada_sin_inicio', 'abandonada_incompleta', 'en_curso'];
    if (!elegibles.includes(row.estado)) {
      return res.status(400).json({ error: `No se puede reenviar link desde '${row.estado}'`, code: 400 });
    }
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const tx = db.transaction(() => {
      db.prepare(
        'INSERT INTO solicitudes_tokens (institucion_id, token, expires_at) VALUES (?, ?, ?)'
      ).run(row.institucion_id, token, expires);
      if (row.estado !== 'en_curso') {
        db.prepare("UPDATE contratos SET estado = 'en_curso' WHERE id = ?").run(row.id);
        audit(req, 'CONTRATO_TRANSICION', 'contrato', row.id, { de: row.estado, a: 'en_curso', via: 'reenviar-link' });
      }
      audit(req, 'TOKEN_GENERADO', 'contrato', row.id, { token_prefix: token.slice(0, 8), expires_at: expires });
    });
    tx();
    res.json({ token, expires_at: expires, estado: 'en_curso' });
  } catch (err) { next(err); }
});

// POST /api/contratos/:id/dpi-fisico-recibido
router.post('/:id/dpi-fisico-recibido', (req, res, next) => {
  try {
    const row = loadContratoOrEnd(req, res); if (!row) return;
    // (En F8 esta acción será solo para abogado_bufete; hoy abierto.)
    const tx = db.transaction(() => {
      db.prepare(
        "UPDATE contratos SET dpi_fisico_recibido = 1, dpi_fisico_recibido_por = ?, dpi_fisico_recibido_at = datetime('now') WHERE id = ?"
      ).run(req.user.userId || null, row.id);
      audit(req, 'DPI_FISICO_RECIBIDO', 'contrato', row.id, {});
    });
    tx();
    res.json(db.prepare(
      'SELECT id, dpi_fisico_recibido, dpi_fisico_recibido_por, dpi_fisico_recibido_at FROM contratos WHERE id = ?'
    ).get(row.id));
  } catch (err) { next(err); }
});

// GET /api/contratos/:id/audit-log
router.get('/:id/audit-log', (req, res, next) => {
  try {
    const row = loadContratoOrEnd(req, res); if (!row) return;
    const entries = db.prepare(
      "SELECT id, timestamp, user_email, user_role, accion, detalles, ip FROM audit_log WHERE entidad_tipo = 'contrato' AND entidad_id = ? ORDER BY timestamp ASC, id ASC"
    ).all(row.id).map((e) => ({
      ...e,
      detalles: e.detalles ? JSON.parse(e.detalles) : null,
    }));
    res.json(entries);
  } catch (err) { next(err); }
});

module.exports = router;
