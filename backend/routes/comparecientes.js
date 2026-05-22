// Sprint garantías-desacopladas CP3 — Endpoints CRUD comparecientes (auth).
//
// Catálogo de personas que comparecen en contratos como fiadores o terceros
// garantes. PII cifrada AES-GCM (nombre/dpi/profesion/estado_civil/domicilio),
// con HMAC en nombre_hash y dpi_hash para búsqueda exacta.
//
// Pivote contrato_comparecientes: vincula a un contrato con rol y orden.
// El rol vive en la pivote (no en el catálogo): una misma persona puede
// ser fiador en un contrato y tercero garante en otro.
//
// Audit log: COMPARECIENTE_AGREGADO / EDITADO / QUITADO / ROL_CAMBIADO.
//
// Reglas:
//   - Banco/bufete (autenticados) no tienen tope práctico de fiadores; pueden
//     vincular cualquier número al contrato.
//   - El portal público (token cliente) sí tiene cap 1+1 (ver routes/solicitudes.js).
//   - UNIQUE (institucion_id, dpi_hash): si el banco intenta crear un
//     compareciente con DPI existente, devolvemos 409 con el id del existente
//     para que el frontend lo reuse.

const express = require('express');
const db = require('../db');
const { encrypt, decrypt, hashFor } = require('../encryption');
const { audit } = require('../utils/audit');

// Dos routers: el catálogo (mount /api/comparecientes) y la vinculación
// con contratos (mount /api/contratos/:contratoId/comparecientes).
const router = express.Router();
const linkRouter = express.Router({ mergeParams: true });

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function safeDecrypt(v) {
  if (v === null || v === undefined || v === '') return null;
  try { return decrypt(v); } catch (_) { return null; }
}

function descifrar(row) {
  if (!row) return null;
  const { nombre_hash, dpi_hash, ...rest } = row;
  return {
    ...rest,
    nombre: safeDecrypt(row.nombre),
    dpi: safeDecrypt(row.dpi),
    profesion: safeDecrypt(row.profesion),
    estado_civil: safeDecrypt(row.estado_civil),
    domicilio: safeDecrypt(row.domicilio),
  };
}

function canAccessInst(user, instId) {
  if (user.role === 'admin' && !user.institucion_id) return true;
  return user.institucion_id === instId;
}

function inferActor(user) {
  // Heurística mínima: si el user no tiene institucion_id es bufete (admin
  // global); con institucion_id es banco. En CP4 el frontend pasará el actor
  // explícitamente cuando haga falta distinguir (p.e. abogado dentro del
  // bufete vs analista bancario).
  if (user.role === 'admin' && !user.institucion_id) return 'bufete';
  return 'banco';
}

const REQUIRED_FIELDS = ['nombre', 'dpi'];

function validarBody(body) {
  for (const f of REQUIRED_FIELDS) {
    const v = body?.[f];
    if (typeof v !== 'string' || v.trim() === '') return `Campo '${f}' requerido`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// GET /api/comparecientes?institucion_id=&q=
// Lista catálogo. q busca por nombre_hash o dpi_hash (exacto).
// ─────────────────────────────────────────────────────────────────
router.get('/', (req, res, next) => {
  try {
    const instId = parseInt(req.query.institucion_id, 10);
    if (!instId) return res.status(400).json({ error: 'institucion_id requerido', code: 400 });
    if (!canAccessInst(req.user, instId)) return res.status(403).json({ error: 'Sin acceso', code: 403 });
    const q = String(req.query.q || '').trim();

    let rows;
    if (q) {
      const nombreH = hashFor('nombre', q);
      const dpiH = hashFor('dpi', q);
      rows = db.prepare(`
        SELECT * FROM comparecientes
        WHERE institucion_id = ? AND (nombre_hash = ? OR dpi_hash = ?)
        ORDER BY creado_en DESC
      `).all(instId, nombreH, dpiH);
    } else {
      rows = db.prepare(
        'SELECT * FROM comparecientes WHERE institucion_id = ? ORDER BY creado_en DESC LIMIT 200'
      ).all(instId);
    }
    res.json(rows.map(descifrar));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/comparecientes
// Crea un compareciente. Idempotente por (institucion_id, dpi_hash).
// Si ya existe → 409 con { existing_id } para que el frontend reuse.
// ─────────────────────────────────────────────────────────────────
router.post('/', (req, res, next) => {
  try {
    const err = validarBody(req.body);
    if (err) return res.status(400).json({ error: err, code: 400 });
    const instId = parseInt(req.body.institucion_id, 10);
    if (!instId) return res.status(400).json({ error: 'institucion_id requerido', code: 400 });
    if (!canAccessInst(req.user, instId)) return res.status(403).json({ error: 'Sin acceso', code: 403 });

    const { nombre, dpi, profesion, estado_civil, domicilio, fecha_nac, genero } = req.body;
    const dpiH = hashFor('dpi', dpi);
    const existing = db.prepare(
      'SELECT id FROM comparecientes WHERE institucion_id = ? AND dpi_hash = ?'
    ).get(instId, dpiH);
    if (existing) {
      return res.status(409).json({
        error: 'Ya existe un compareciente con ese DPI en la institución',
        code: 409,
        existing_id: existing.id,
      });
    }

    const info = db.prepare(`
      INSERT INTO comparecientes (
        institucion_id, nombre, nombre_hash, dpi, dpi_hash,
        profesion, estado_civil, domicilio, fecha_nac, genero, creado_por_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      instId,
      encrypt(nombre), hashFor('nombre', nombre),
      encrypt(dpi), dpiH,
      profesion ? encrypt(profesion) : null,
      estado_civil ? encrypt(estado_civil) : null,
      domicilio ? encrypt(domicilio) : null,
      fecha_nac || null,
      genero || null,
      req.user.userId || null,
    );

    audit(req, 'COMPARECIENTE_AGREGADO', 'compareciente', info.lastInsertRowid, {
      nombre_hash_preview: hashFor('nombre', nombre).slice(0, 8),
      dpi_hash_preview: dpiH.slice(0, 8),
    });

    const row = db.prepare('SELECT * FROM comparecientes WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(descifrar(row));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Ya existe un compareciente con ese DPI', code: 409 });
    }
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/comparecientes/:id
// ─────────────────────────────────────────────────────────────────
router.get('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM comparecientes WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Compareciente no encontrado', code: 404 });
    if (!canAccessInst(req.user, row.institucion_id))
      return res.status(403).json({ error: 'Sin acceso', code: 403 });
    res.json(descifrar(row));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/comparecientes/:id
// Edita PII. Si se cambia dpi se recalcula dpi_hash (verifica UNIQUE).
// La edición no afecta los snapshots de contratos ya firmados.
// ─────────────────────────────────────────────────────────────────
router.put('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM comparecientes WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Compareciente no encontrado', code: 404 });
    if (!canAccessInst(req.user, row.institucion_id))
      return res.status(403).json({ error: 'Sin acceso', code: 403 });

    const updates = [];
    const params = [];
    const cambios = {};
    const map = {
      nombre: (v) => { updates.push('nombre = ?', 'nombre_hash = ?'); params.push(encrypt(v), hashFor('nombre', v)); cambios.nombre = true; },
      dpi: (v) => {
        const newH = hashFor('dpi', v);
        const otro = db.prepare(
          'SELECT id FROM comparecientes WHERE institucion_id = ? AND dpi_hash = ? AND id <> ?'
        ).get(row.institucion_id, newH, row.id);
        if (otro) throw Object.assign(new Error('Ya existe otro compareciente con ese DPI'), { status: 409 });
        updates.push('dpi = ?', 'dpi_hash = ?'); params.push(encrypt(v), newH); cambios.dpi = true;
      },
      profesion: (v) => { updates.push('profesion = ?'); params.push(v ? encrypt(v) : null); cambios.profesion = true; },
      estado_civil: (v) => { updates.push('estado_civil = ?'); params.push(v ? encrypt(v) : null); cambios.estado_civil = true; },
      domicilio: (v) => { updates.push('domicilio = ?'); params.push(v ? encrypt(v) : null); cambios.domicilio = true; },
      fecha_nac: (v) => { updates.push('fecha_nac = ?'); params.push(v || null); cambios.fecha_nac = true; },
      genero: (v) => { updates.push('genero = ?'); params.push(v || null); cambios.genero = true; },
    };
    for (const [k, fn] of Object.entries(map)) {
      if (k in req.body) fn(req.body[k]);
    }
    if (!updates.length) return res.json(descifrar(row));

    updates.push("actualizado_en = datetime('now')");
    params.push(row.id);
    db.prepare(`UPDATE comparecientes SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    audit(req, 'COMPARECIENTE_EDITADO', 'compareciente', row.id, { campos: Object.keys(cambios) });

    res.json(descifrar(db.prepare('SELECT * FROM comparecientes WHERE id = ?').get(row.id)));
  } catch (err) {
    if (err.status === 409) return res.status(409).json({ error: err.message, code: 409 });
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/contratos/:id/comparecientes  { compareciente_id, rol, orden? }
// Vincula un compareciente a un contrato con un rol.
// Rechaza si el contrato está congelado o si el rol es inválido.
// ─────────────────────────────────────────────────────────────────
linkRouter.post('/', (req, res, next) => {
  try {
    const contratoId = parseInt(req.params.contratoId, 10);
    const compId = parseInt(req.body?.compareciente_id, 10);
    const rol = String(req.body?.rol || '').trim();
    if (!compId || !['fiador', 'tercero_garante'].includes(rol)) {
      return res.status(400).json({ error: "compareciente_id requerido y rol IN ('fiador','tercero_garante')", code: 400 });
    }
    const cto = db.prepare('SELECT id, institucion_id, estado FROM contratos WHERE id = ?').get(contratoId);
    if (!cto) return res.status(404).json({ error: 'Contrato no encontrado', code: 404 });
    if (!canAccessInst(req.user, cto.institucion_id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });
    if (['completado', 'firmado'].includes(cto.estado))
      return res.status(409).json({ error: `Contrato en estado '${cto.estado}' no admite cambios`, code: 409 });

    const comp = db.prepare('SELECT id, institucion_id FROM comparecientes WHERE id = ?').get(compId);
    if (!comp) return res.status(404).json({ error: 'Compareciente no encontrado', code: 404 });
    if (comp.institucion_id !== cto.institucion_id)
      return res.status(409).json({ error: 'Compareciente pertenece a otra institución', code: 409 });

    const ya = db.prepare(
      'SELECT 1 FROM contrato_comparecientes WHERE contrato_id = ? AND compareciente_id = ?'
    ).get(contratoId, compId);
    if (ya) return res.status(409).json({ error: 'Compareciente ya vinculado al contrato', code: 409 });

    const orden = parseInt(req.body?.orden, 10) || (
      db.prepare('SELECT COALESCE(MAX(orden), 0) AS m FROM contrato_comparecientes WHERE contrato_id = ?')
        .get(contratoId).m + 1
    );
    const actor = inferActor(req.user);

    db.prepare(`
      INSERT INTO contrato_comparecientes
      (contrato_id, compareciente_id, rol, orden, agregado_por_actor, agregado_por_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(contratoId, compId, rol, orden, actor, req.user.userId || null);

    audit(req, 'COMPARECIENTE_AGREGADO', 'contrato', contratoId, {
      compareciente_id: compId, rol, orden, actor,
    });

    res.status(201).json({ contrato_id: contratoId, compareciente_id: compId, rol, orden, agregado_por_actor: actor });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/contratos/:id/comparecientes/:compId  { rol?, orden? }
// ─────────────────────────────────────────────────────────────────
linkRouter.put('/:compId', (req, res, next) => {
  try {
    const contratoId = parseInt(req.params.contratoId, 10);
    const compId = parseInt(req.params.compId, 10);
    const cto = db.prepare('SELECT id, institucion_id, estado FROM contratos WHERE id = ?').get(contratoId);
    if (!cto) return res.status(404).json({ error: 'Contrato no encontrado', code: 404 });
    if (!canAccessInst(req.user, cto.institucion_id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });
    if (['completado', 'firmado'].includes(cto.estado))
      return res.status(409).json({ error: `Contrato en estado '${cto.estado}' no admite cambios`, code: 409 });

    const link = db.prepare(
      'SELECT * FROM contrato_comparecientes WHERE contrato_id = ? AND compareciente_id = ?'
    ).get(contratoId, compId);
    if (!link) return res.status(404).json({ error: 'Vínculo no encontrado', code: 404 });

    const sets = [];
    const params = [];
    const cambios = {};
    if (req.body?.rol) {
      if (!['fiador', 'tercero_garante'].includes(req.body.rol)) {
        return res.status(400).json({ error: "rol IN ('fiador','tercero_garante')", code: 400 });
      }
      sets.push('rol = ?'); params.push(req.body.rol); cambios.rol = { de: link.rol, a: req.body.rol };
    }
    if (req.body?.orden != null) {
      sets.push('orden = ?'); params.push(parseInt(req.body.orden, 10)); cambios.orden = { de: link.orden, a: parseInt(req.body.orden, 10) };
    }
    if (sets.length === 0) return res.json(link);

    params.push(contratoId, compId);
    db.prepare(`UPDATE contrato_comparecientes SET ${sets.join(', ')} WHERE contrato_id = ? AND compareciente_id = ?`).run(...params);

    if (cambios.rol) audit(req, 'COMPARECIENTE_ROL_CAMBIADO', 'contrato', contratoId, { compareciente_id: compId, ...cambios.rol });
    audit(req, 'COMPARECIENTE_EDITADO', 'contrato', contratoId, { compareciente_id: compId, cambios });

    res.json(db.prepare(
      'SELECT * FROM contrato_comparecientes WHERE contrato_id = ? AND compareciente_id = ?'
    ).get(contratoId, compId));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/contratos/:id/comparecientes/:compId
// Desvincula. Verifica que ninguna garantía del contrato lo apunte como
// aportante; si la hay, 409.
// ─────────────────────────────────────────────────────────────────
linkRouter.delete('/:compId', (req, res, next) => {
  try {
    const contratoId = parseInt(req.params.contratoId, 10);
    const compId = parseInt(req.params.compId, 10);
    const cto = db.prepare('SELECT id, institucion_id, estado FROM contratos WHERE id = ?').get(contratoId);
    if (!cto) return res.status(404).json({ error: 'Contrato no encontrado', code: 404 });
    if (!canAccessInst(req.user, cto.institucion_id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });
    if (['completado', 'firmado'].includes(cto.estado))
      return res.status(409).json({ error: `Contrato en estado '${cto.estado}' no admite cambios`, code: 409 });

    // Si alguna garantía vinculada apunta a este compareciente como aportante, rechazo.
    const usada = db.prepare(`
      SELECT g.id FROM contrato_garantias cg
      JOIN garantias g ON g.id = cg.garantia_id
      WHERE cg.contrato_id = ? AND g.aportante_tipo = 'compareciente' AND g.aportante_compareciente_id = ?
      LIMIT 1
    `).get(contratoId, compId);
    if (usada) {
      return res.status(409).json({
        error: 'Compareciente está siendo usado como aportante en una garantía. Quite primero la garantía o cambie su aportante.',
        code: 409,
        garantia_id: usada.id,
      });
    }

    const info = db.prepare(
      'DELETE FROM contrato_comparecientes WHERE contrato_id = ? AND compareciente_id = ?'
    ).run(contratoId, compId);
    if (info.changes === 0) return res.status(404).json({ error: 'Vínculo no encontrado', code: 404 });

    audit(req, 'COMPARECIENTE_QUITADO', 'contrato', contratoId, { compareciente_id: compId });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/contratos/:id/comparecientes
// Lista los comparecientes vinculados a un contrato (con PII descifrada).
// Si el contrato está congelado, devuelve los datos del snapshot.
// ─────────────────────────────────────────────────────────────────
linkRouter.get('/', (req, res, next) => {
  try {
    const contratoId = parseInt(req.params.contratoId, 10);
    const cto = db.prepare('SELECT id, institucion_id, estado FROM contratos WHERE id = ?').get(contratoId);
    if (!cto) return res.status(404).json({ error: 'Contrato no encontrado', code: 404 });
    if (!canAccessInst(req.user, cto.institucion_id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });

    const { loadComparecientesDelContrato, descifrarCompareciente } = require('../contrato-engine');
    const raw = loadComparecientesDelContrato(contratoId);
    res.json(raw.map(descifrarCompareciente));
  } catch (err) { next(err); }
});

module.exports = { router, linkRouter };
