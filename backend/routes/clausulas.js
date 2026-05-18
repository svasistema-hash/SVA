const express = require('express');
const db = require('../db');
const CLAUSULAS_BASE = require('../../shared/legal/clausulas-base.json');

const router = express.Router();

router.get('/biblioteca', (req, res, next) => {
  try {
    const target = req.user.institucion_id
      ? req.user.institucion_id
      : req.query.institucion_id
      ? db.prepare(
          'SELECT id FROM instituciones WHERE id = ? OR slug = ?'
        ).get(parseInt(req.query.institucion_id, 10) || -1, String(req.query.institucion_id))?.id
      : null;

    const base = (CLAUSULAS_BASE.clausulas || []).map((c) => ({
      origen: 'base',
      codigo: c.codigo,
      titulo: c.titulo,
      texto_base: c.texto_base,
      variables: c.variables,
      obligatoria: c.obligatoria ? 1 : 0,
    }));

    const byCodigo = new Map();
    base.forEach((c) => byCodigo.set(c.codigo, c));

    if (target) {
      const tenantCl = db
        .prepare(
          `SELECT c.* FROM clausulas c
           JOIN modelos m ON c.modelo_id = m.id
           WHERE m.institucion_id = ?`
        )
        .all(target);

      for (const c of tenantCl) {
        const item = {
          origen: 'tenant',
          codigo: c.codigo,
          titulo: c.titulo,
          texto_base: c.texto_base,
          variables: c.variables ? JSON.parse(c.variables) : [],
          obligatoria: c.obligatoria,
        };
        const existing = byCodigo.get(c.codigo);
        if (!existing || existing.texto_base !== c.texto_base) {
          byCodigo.set(c.codigo, item);
        }
      }
    }

    res.json(Array.from(byCodigo.values()));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const cl = db.prepare('SELECT * FROM clausulas WHERE id = ?').get(req.params.id);
    if (!cl) return res.status(404).json({ error: 'Cláusula no encontrada', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== cl.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso a esta cláusula', code: 403 });
    }
    const allowed = ['titulo', 'texto_base', 'orden', 'obligatoria'];
    const updates = [];
    const params = [];
    for (const k of allowed) {
      if (req.body && req.body[k] !== undefined) {
        updates.push(`${k} = ?`);
        params.push(req.body[k]);
      }
    }
    if (Array.isArray(req.body?.variables)) {
      updates.push('variables = ?');
      params.push(JSON.stringify(req.body.variables));
    } else if (req.body?.texto_base !== undefined) {
      const detected = Array.from(
        new Set((req.body.texto_base.match(/\{\{(\w+)\}\}/g) || []).map((m) => m.slice(2, -2)))
      );
      updates.push('variables = ?');
      params.push(JSON.stringify(detected));
    }
    if (!updates.length) return res.status(400).json({ error: 'No hay campos para actualizar', code: 400 });
    params.push(cl.id);
    db.prepare(`UPDATE clausulas SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const updated = db.prepare('SELECT * FROM clausulas WHERE id = ?').get(cl.id);
    res.json({ ...updated, variables: updated.variables ? JSON.parse(updated.variables) : [] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
