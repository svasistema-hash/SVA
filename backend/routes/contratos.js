const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { generatePdf } = require('../utils/pdfGenerator');
const { nextCorrelativo, compilarContrato } = require('../contrato-engine');
const { PDFS_PATH } = require('../config');

const router = express.Router();

function parseJsonFields(row) {
  if (!row) return row;
  return {
    ...row,
    datos_cliente: row.datos_cliente ? JSON.parse(row.datos_cliente) : null,
    datos_credito: row.datos_credito ? JSON.parse(row.datos_credito) : null,
    datos_garantia: row.datos_garantia ? JSON.parse(row.datos_garantia) : null,
    datos_firmas: row.datos_firmas ? JSON.parse(row.datos_firmas) : null,
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
         VALUES (?, ?, ?, 'borrador', ?, ?, ?, ?)`
      )
      .run(
        institucion_id,
        modelo_id,
        noContrato,
        datos_cliente ? JSON.stringify(datos_cliente) : null,
        datos_credito ? JSON.stringify(datos_credito) : null,
        datos_garantia ? JSON.stringify(datos_garantia) : null,
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
      datos_cliente: row.datos_cliente ? JSON.parse(row.datos_cliente) : {},
      datos_credito: row.datos_credito ? JSON.parse(row.datos_credito) : {},
      datos_garantia: row.datos_garantia ? JSON.parse(row.datos_garantia) : {},
      datos_firmas: row.datos_firmas ? JSON.parse(row.datos_firmas) : {},
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
      .map((f) => ({
        ...f,
        datos_garantia: f.datos_garantia ? JSON.parse(f.datos_garantia) : null,
      }));
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
    const map = {
      estado: (v) => v,
      datos_cliente: (v) => JSON.stringify(v),
      datos_credito: (v) => JSON.stringify(v),
      datos_garantia: (v) => JSON.stringify(v),
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

module.exports = router;
