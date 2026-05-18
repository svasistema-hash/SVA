const express = require('express');
const db = require('../db');

const router = express.Router();

function loadModeloOrDeny(req, res) {
  const modelo = db.prepare('SELECT * FROM modelos WHERE id = ?').get(req.params.id);
  if (!modelo) {
    res.status(404).json({ error: 'Modelo no encontrado', code: 404 });
    return null;
  }
  if (req.user.institucion_id && req.user.institucion_id !== modelo.institucion_id) {
    res.status(403).json({ error: 'Sin acceso a este modelo', code: 403 });
    return null;
  }
  return modelo;
}

function refreshModeloOrder(modelo_id) {
  const codigos = db
    .prepare('SELECT codigo FROM clausulas WHERE modelo_id = ? ORDER BY orden')
    .all(modelo_id)
    .map((r) => r.codigo);
  db.prepare('UPDATE modelos SET clausulas = ? WHERE id = ?').run(JSON.stringify(codigos), modelo_id);
  return codigos;
}

router.get('/:id/clausulas', (req, res, next) => {
  try {
    const modelo = loadModeloOrDeny(req, res);
    if (!modelo) return;
    const rows = db
      .prepare('SELECT * FROM clausulas WHERE modelo_id = ? ORDER BY orden')
      .all(modelo.id)
      .map((c) => ({ ...c, variables: c.variables ? JSON.parse(c.variables) : [] }));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/clausulas', (req, res, next) => {
  try {
    const modelo = loadModeloOrDeny(req, res);
    if (!modelo) return;
    const items = Array.isArray(req.body?.clausulas) ? req.body.clausulas : null;
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'clausulas[] requerido', code: 400 });
    }

    const maxOrden =
      db.prepare('SELECT COALESCE(MAX(orden), 0) AS m FROM clausulas WHERE modelo_id = ?').get(modelo.id).m;
    const ins = db.prepare(
      `INSERT INTO clausulas (institucion_id, modelo_id, orden, codigo, titulo, texto_base, variables, obligatoria)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = db.transaction(() => {
      let orden = maxOrden;
      const insertedIds = [];
      for (const c of items) {
        if (!c || !c.codigo || !c.titulo || !c.texto_base) continue;
        const exists = db
          .prepare('SELECT id FROM clausulas WHERE modelo_id = ? AND codigo = ?')
          .get(modelo.id, c.codigo);
        if (exists) continue;
        orden++;
        const vars = Array.isArray(c.variables)
          ? c.variables
          : Array.from(new Set((c.texto_base.match(/\{\{(\w+)\}\}/g) || []).map((m) => m.slice(2, -2))));
        const info = ins.run(
          modelo.institucion_id,
          modelo.id,
          orden,
          c.codigo,
          c.titulo,
          c.texto_base,
          JSON.stringify(vars),
          c.obligatoria ? 1 : 0
        );
        insertedIds.push(info.lastInsertRowid);
      }
      refreshModeloOrder(modelo.id);
      return insertedIds;
    });

    const inserted = tx();
    const rows = db
      .prepare('SELECT * FROM clausulas WHERE modelo_id = ? ORDER BY orden')
      .all(modelo.id)
      .map((c) => ({ ...c, variables: c.variables ? JSON.parse(c.variables) : [] }));
    res.status(201).json({ inserted_ids: inserted, clausulas: rows });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/clausulas/:clausulaId', (req, res, next) => {
  try {
    const modelo = loadModeloOrDeny(req, res);
    if (!modelo) return;
    const info = db
      .prepare('DELETE FROM clausulas WHERE id = ? AND modelo_id = ?')
      .run(req.params.clausulaId, modelo.id);
    if (info.changes === 0)
      return res.status(404).json({ error: 'Cláusula no pertenece al modelo', code: 404 });
    refreshModeloOrder(modelo.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/clausulas/orden', (req, res, next) => {
  try {
    const modelo = loadModeloOrDeny(req, res);
    if (!modelo) return;
    const list = Array.isArray(req.body?.orden) ? req.body.orden : null;
    if (!list) return res.status(400).json({ error: 'orden[] requerido', code: 400 });
    const upd = db.prepare('UPDATE clausulas SET orden = ? WHERE id = ? AND modelo_id = ?');
    const tx = db.transaction(() => {
      list.forEach((entry, idx) => {
        if (entry && entry.id) upd.run(idx + 1, entry.id, modelo.id);
      });
      refreshModeloOrder(modelo.id);
    });
    tx();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
