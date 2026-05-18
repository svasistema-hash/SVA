const express = require('express');
const db = require('../db');
const CLAUSULAS_BASE = require('../../shared/legal/clausulas-base.json');

const router = express.Router();

function clausulasParaTipo(tipoGarantia) {
  return (CLAUSULAS_BASE.clausulas || [])
    .filter((c) => !c.tipos || c.tipos.includes(tipoGarantia))
    .sort((a, b) => a.orden - b.orden);
}

function canAccess(user, institucionId) {
  if (user.role === 'admin' && !user.institucion_id) return true;
  return user.institucion_id === institucionId;
}

function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'admin' || req.user.institucion_id) {
    return res.status(403).json({ error: 'Solo super admin', code: 403 });
  }
  next();
}

router.get('/', (req, res, next) => {
  try {
    let rows;
    if (req.user.institucion_id) {
      rows = db
        .prepare('SELECT * FROM instituciones WHERE activo = 1 AND id = ?')
        .all(req.user.institucion_id);
    } else {
      rows = db.prepare('SELECT * FROM instituciones WHERE activo = 1 ORDER BY nombre').all();
    }
    const repStmt = db.prepare(
      'SELECT * FROM representantes WHERE institucion_id = ? AND activo = 1 LIMIT 1'
    );
    res.json(rows.map((r) => ({ ...r, representante: repStmt.get(r.id) || null })));
  } catch (err) {
    next(err);
  }
});

router.post('/', requireSuperAdmin, (req, res, next) => {
  try {
    const { slug, tipo, nombre, nit, registro_mercantil, autorizacion } = req.body || {};
    if (!slug || !tipo || !nombre) {
      return res.status(400).json({ error: 'slug, tipo y nombre requeridos', code: 400 });
    }
    const info = db
      .prepare(
        `INSERT INTO instituciones (slug, tipo, nombre, nit, registro_mercantil, autorizacion_sib)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(slug, tipo, nombre, nit || null, registro_mercantil || null, autorizacion || null);
    res
      .status(201)
      .json(db.prepare('SELECT * FROM instituciones WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'slug ya existe', code: 409 });
    next(err);
  }
});

router.get('/:slug', (req, res, next) => {
  try {
    const inst = db.prepare('SELECT * FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    if (!canAccess(req.user, inst.id))
      return res.status(403).json({ error: 'Sin acceso a esta institución', code: 403 });
    const representante = db
      .prepare('SELECT * FROM representantes WHERE institucion_id = ? AND activo = 1')
      .get(inst.id);
    const modelos = db
      .prepare('SELECT * FROM modelos WHERE institucion_id = ? AND activo = 1 ORDER BY nombre')
      .all(inst.id)
      .map((m) => ({ ...m, clausulas: JSON.parse(m.clausulas) }));
    res.json({ ...inst, representante: representante || null, modelos });
  } catch (err) {
    next(err);
  }
});

router.put('/:slug', (req, res, next) => {
  try {
    const inst = db.prepare('SELECT * FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    if (!canAccess(req.user, inst.id))
      return res.status(403).json({ error: 'Sin acceso a esta institución', code: 403 });
    const allowed = ['nombre', 'nit', 'registro_mercantil', 'autorizacion_sib', 'tipo', 'activo', 'cuenta_cobro'];
    const updates = Object.entries(req.body || {}).filter(([k]) => allowed.includes(k));
    if (!updates.length)
      return res.status(400).json({ error: 'No hay campos válidos para actualizar', code: 400 });
    const sets = updates.map(([k]) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE instituciones SET ${sets} WHERE id = ?`).run(
      ...updates.map(([, v]) => v),
      inst.id
    );
    res.json(db.prepare('SELECT * FROM instituciones WHERE id = ?').get(inst.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:slug/modelos', (req, res, next) => {
  try {
    const inst = db.prepare('SELECT id FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    if (!canAccess(req.user, inst.id))
      return res.status(403).json({ error: 'Sin acceso a esta institución', code: 403 });
    const modelos = db
      .prepare('SELECT * FROM modelos WHERE institucion_id = ? ORDER BY nombre')
      .all(inst.id)
      .map((m) => ({ ...m, clausulas: JSON.parse(m.clausulas) }));
    res.json(modelos);
  } catch (err) {
    next(err);
  }
});

router.get('/:slug/modelos/:id', (req, res, next) => {
  try {
    const inst = db.prepare('SELECT id FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    if (!canAccess(req.user, inst.id))
      return res.status(403).json({ error: 'Sin acceso', code: 403 });
    const modelo = db
      .prepare('SELECT * FROM modelos WHERE id = ? AND institucion_id = ?')
      .get(req.params.id, inst.id);
    if (!modelo) return res.status(404).json({ error: 'Modelo no encontrado', code: 404 });
    const clausulas = db
      .prepare('SELECT * FROM clausulas WHERE modelo_id = ? ORDER BY orden')
      .all(modelo.id)
      .map((c) => ({ ...c, variables: c.variables ? JSON.parse(c.variables) : [] }));
    res.json({ ...modelo, clausulas: JSON.parse(modelo.clausulas), clausulas_full: clausulas });
  } catch (err) {
    next(err);
  }
});

router.put('/:slug/modelos/:id', (req, res, next) => {
  try {
    const inst = db.prepare('SELECT id FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    if (!canAccess(req.user, inst.id))
      return res.status(403).json({ error: 'Sin acceso', code: 403 });
    const modelo = db
      .prepare('SELECT id FROM modelos WHERE id = ? AND institucion_id = ?')
      .get(req.params.id, inst.id);
    if (!modelo) return res.status(404).json({ error: 'Modelo no encontrado', code: 404 });

    const allowed = ['nombre', 'tipo_garantia', 'activo'];
    const updates = [];
    const params = [];
    for (const k of allowed) {
      if (req.body && req.body[k] !== undefined) {
        updates.push(`${k} = ?`);
        params.push(req.body[k]);
      }
    }
    if (Array.isArray(req.body?.clausulas_order)) {
      updates.push('clausulas = ?');
      params.push(JSON.stringify(req.body.clausulas_order));
      const upd = db.prepare('UPDATE clausulas SET orden = ? WHERE modelo_id = ? AND codigo = ?');
      req.body.clausulas_order.forEach((codigo, i) => upd.run(i + 1, modelo.id, codigo));
    }
    if (updates.length) {
      params.push(modelo.id);
      db.prepare(`UPDATE modelos SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    res.json(db.prepare('SELECT * FROM modelos WHERE id = ?').get(modelo.id));
  } catch (err) {
    next(err);
  }
});

router.put('/:slug/clausulas/:id', (req, res, next) => {
  try {
    const inst = db.prepare('SELECT id FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    if (!canAccess(req.user, inst.id))
      return res.status(403).json({ error: 'Sin acceso', code: 403 });
    const cl = db.prepare('SELECT * FROM clausulas WHERE id = ?').get(req.params.id);
    if (!cl) return res.status(404).json({ error: 'Cláusula no encontrada', code: 404 });
    const modelo = db.prepare('SELECT institucion_id FROM modelos WHERE id = ?').get(cl.modelo_id);
    if (!modelo || modelo.institucion_id !== inst.id)
      return res.status(403).json({ error: 'Sin acceso a esta cláusula', code: 403 });

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
      const detected = Array.from(new Set((req.body.texto_base.match(/\{\{(\w+)\}\}/g) || []).map((m) => m.slice(2, -2))));
      updates.push('variables = ?');
      params.push(JSON.stringify(detected));
    }
    if (!updates.length)
      return res.status(400).json({ error: 'No hay campos para actualizar', code: 400 });
    params.push(cl.id);
    db.prepare(`UPDATE clausulas SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const updated = db.prepare('SELECT * FROM clausulas WHERE id = ?').get(cl.id);
    res.json({ ...updated, variables: updated.variables ? JSON.parse(updated.variables) : [] });
  } catch (err) {
    next(err);
  }
});

router.post('/:slug/modelos', (req, res, next) => {
  try {
    const inst = db.prepare('SELECT id FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    if (!canAccess(req.user, inst.id))
      return res.status(403).json({ error: 'Sin acceso a esta institución', code: 403 });
    const { nombre, tipo_garantia, clausulas, autoseed = true } = req.body || {};
    if (!nombre || !tipo_garantia) {
      return res.status(400).json({ error: 'nombre y tipo_garantia requeridos', code: 400 });
    }

    const tx = db.transaction(() => {
      const baseClausulas = autoseed ? clausulasParaTipo(tipo_garantia) : [];
      const codigosOrdenados = clausulas && clausulas.length
        ? clausulas
        : baseClausulas.map((c) => c.codigo);

      const info = db
        .prepare(
          `INSERT INTO modelos (institucion_id, nombre, tipo_garantia, clausulas)
           VALUES (?, ?, ?, ?)`
        )
        .run(inst.id, nombre, tipo_garantia, JSON.stringify(codigosOrdenados));
      const modeloId = info.lastInsertRowid;

      if (autoseed && baseClausulas.length) {
        const ins = db.prepare(
          `INSERT INTO clausulas (institucion_id, modelo_id, orden, codigo, titulo, texto_base, variables, obligatoria)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        baseClausulas.forEach((c, i) => {
          ins.run(
            inst.id,
            modeloId,
            i + 1,
            c.codigo,
            c.titulo,
            c.texto_base,
            JSON.stringify(c.variables || []),
            c.obligatoria ? 1 : 0
          );
        });
      }
      return modeloId;
    });

    const id = tx();
    const row = db.prepare('SELECT * FROM modelos WHERE id = ?').get(id);
    res.status(201).json({ ...row, clausulas: JSON.parse(row.clausulas) });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'Modelo con ese nombre ya existe', code: 409 });
    next(err);
  }
});

router.get('/:slug/notarios', (req, res, next) => {
  try {
    const inst = db.prepare('SELECT id FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    if (!canAccess(req.user, inst.id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });
    const onlyActive = req.query.activo !== '0';
    const sql = onlyActive
      ? 'SELECT * FROM notarios WHERE institucion_id = ? AND activo = 1 ORDER BY nombre'
      : 'SELECT * FROM notarios WHERE institucion_id = ? ORDER BY activo DESC, nombre';
    res.json(db.prepare(sql).all(inst.id));
  } catch (err) {
    next(err);
  }
});

router.post('/:slug/notarios', (req, res, next) => {
  try {
    const inst = db.prepare('SELECT id FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    if (!canAccess(req.user, inst.id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });
    const { nombre, colegiado, telefono, email } = req.body || {};
    if (!nombre) return res.status(400).json({ error: 'nombre requerido', code: 400 });
    const info = db
      .prepare(
        'INSERT INTO notarios (institucion_id, nombre, colegiado, telefono, email) VALUES (?, ?, ?, ?, ?)'
      )
      .run(inst.id, nombre, colegiado || null, telefono || null, email || null);
    res.status(201).json(db.prepare('SELECT * FROM notarios WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'Ya existe un notario con ese colegiado', code: 409 });
    next(err);
  }
});

router.put('/:slug/notarios/:id', (req, res, next) => {
  try {
    const inst = db.prepare('SELECT id FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    if (!canAccess(req.user, inst.id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });
    const not = db
      .prepare('SELECT * FROM notarios WHERE id = ? AND institucion_id = ?')
      .get(req.params.id, inst.id);
    if (!not) return res.status(404).json({ error: 'Notario no encontrado', code: 404 });
    const allowed = ['nombre', 'colegiado', 'telefono', 'email', 'activo'];
    const updates = [];
    const params = [];
    for (const k of allowed) {
      if (req.body && req.body[k] !== undefined) {
        updates.push(`${k} = ?`);
        params.push(req.body[k]);
      }
    }
    if (!updates.length)
      return res.status(400).json({ error: 'No hay campos para actualizar', code: 400 });
    params.push(not.id);
    db.prepare(`UPDATE notarios SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json(db.prepare('SELECT * FROM notarios WHERE id = ?').get(not.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
