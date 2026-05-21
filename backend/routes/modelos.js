const express = require('express');
const db = require('../db');
const { audit } = require('../utils/audit');

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

// Sprint pendientes-4-7 Parte 7 — clonar modelo (con todas sus cláusulas).
//
// POST /api/modelos/:id/clonar
//   Body opcional: { nombre } — si falta, autogenera "<original> (copia)".
//
// Comportamiento:
//   - Mismo institucion_id que el origen.
//   - estado activo = 0 (inactivo). El usuario lo activa manualmente cuando
//     termina de editarlo. Distinto del endpoint /duplicar previo que dejaba
//     activo=1; este es el comportamiento correcto según spec.
//   - Copia todas las cláusulas con su orden, código, título, texto_base,
//     variables y obligatoria.
//   - Registra en audit_log: MODELO_CLONADO con origen + nuevo + count cláusulas.
router.post('/:id/clonar', (req, res, next) => {
  try {
    const origen = loadModeloOrDeny(req, res);
    if (!origen) return;

    const nombreNuevo = (req.body?.nombre || '').trim() || `${origen.nombre} (copia)`;

    const tx = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO modelos (institucion_id, nombre, tipo_garantia, clausulas, activo)
           VALUES (?, ?, ?, ?, 0)`
        )
        .run(origen.institucion_id, nombreNuevo, origen.tipo_garantia, origen.clausulas);
      const nuevoId = info.lastInsertRowid;

      const clausulasOrigen = db
        .prepare('SELECT * FROM clausulas WHERE modelo_id = ? ORDER BY orden')
        .all(origen.id);
      const ins = db.prepare(
        `INSERT INTO clausulas (institucion_id, modelo_id, orden, codigo, titulo, texto_base, variables, obligatoria)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const c of clausulasOrigen) {
        ins.run(origen.institucion_id, nuevoId, c.orden, c.codigo, c.titulo, c.texto_base, c.variables, c.obligatoria);
      }

      audit(req, 'MODELO_CLONADO', 'modelo', nuevoId, {
        origen_id: origen.id,
        origen_nombre: origen.nombre,
        nombre_nuevo: nombreNuevo,
        clausulas_copiadas: clausulasOrigen.length,
      });

      return { nuevoId, clausulasCopiadas: clausulasOrigen.length };
    });

    const { nuevoId, clausulasCopiadas } = tx();
    const row = db.prepare('SELECT * FROM modelos WHERE id = ?').get(nuevoId);
    res.status(201).json({
      ...row,
      clausulas: JSON.parse(row.clausulas),
      clausulas_copiadas: clausulasCopiadas,
      clonado_de: origen.id,
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'Ya existe un modelo con ese nombre', code: 409 });
    next(err);
  }
});

module.exports = router;
