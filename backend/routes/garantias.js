// Sprint garantías-desacopladas CP3 — Endpoints CRUD garantías (auth).
//
// Catálogo de garantías por institución. Tipos: fiduciaria, hipotecaria,
// prendaria. Flag solidaria solo aplica a fiduciaria. Hipotecaria/prendaria
// tienen aportante (cliente o compareciente) y datos JSON cifrado.
//
// Pivote contrato_garantias: vincula al contrato con orden.
//
// VALIDACIÓN CRÍTICA al vincular: si la garantía tiene aportante
// compareciente Z, Z debe estar en contrato_comparecientes del contrato.
// Si no, 409 con mensaje claro.
//
// Límite banco/bufete: máximo 5 garantías por contrato.
// Cuando el contrato está congelado se rechaza con 409.

const express = require('express');
const db = require('../db');
const { encrypt, decrypt } = require('../encryption');
const { audit } = require('../utils/audit');

const router = express.Router();
const linkRouter = express.Router({ mergeParams: true });

const TIPOS = new Set(['fiduciaria', 'hipotecaria', 'prendaria']);
const MAX_GARANTIAS_POR_CONTRATO = 5;

function safeDecrypt(v) {
  if (v === null || v === undefined || v === '') return null;
  try { return decrypt(v); } catch (_) { return null; }
}

function descifrarGarantia(row) {
  if (!row) return null;
  let datos = null;
  if (row.datos) {
    try { datos = JSON.parse(safeDecrypt(row.datos)); } catch (_) { datos = null; }
  }
  return { ...row, datos };
}

function canAccessInst(user, instId) {
  if (user.role === 'admin' && !user.institucion_id) return true;
  return user.institucion_id === instId;
}

// Valida coherencia tipo / solidaria / datos / aportante.
function validarInputGarantia(body) {
  const tipo = body?.tipo;
  if (!TIPOS.has(tipo)) return `tipo IN ('fiduciaria','hipotecaria','prendaria')`;
  const solidaria = body?.solidaria ? 1 : 0;

  if (tipo === 'fiduciaria') {
    if (body?.datos) return 'fiduciaria no debe traer datos';
    if (body?.aportante_tipo) return 'fiduciaria no admite aportante';
    return null;
  }
  // hipotecaria | prendaria
  if (solidaria) return 'solidaria solo aplica a fiduciaria';
  if (!body?.datos || typeof body.datos !== 'object') return 'datos (objeto) requerido para hipotecaria/prendaria';
  const apt = body?.aportante_tipo;
  if (!['cliente', 'compareciente'].includes(apt))
    return "aportante_tipo IN ('cliente','compareciente') requerido";
  if (apt === 'cliente' && !body?.aportante_cliente_id) return 'aportante_cliente_id requerido';
  if (apt === 'compareciente' && !body?.aportante_compareciente_id) return 'aportante_compareciente_id requerido';
  return null;
}

// ─────────────────────────────────────────────────────────────────
// GET /api/garantias?institucion_id=&tipo=&aportante_cliente_id=&aportante_compareciente_id=
// ─────────────────────────────────────────────────────────────────
router.get('/', (req, res, next) => {
  try {
    const instId = parseInt(req.query.institucion_id, 10);
    if (!instId) return res.status(400).json({ error: 'institucion_id requerido', code: 400 });
    if (!canAccessInst(req.user, instId)) return res.status(403).json({ error: 'Sin acceso', code: 403 });

    const wh = ['institucion_id = ?'];
    const params = [instId];
    if (req.query.tipo && TIPOS.has(req.query.tipo)) { wh.push('tipo = ?'); params.push(req.query.tipo); }
    if (req.query.aportante_cliente_id) { wh.push('aportante_cliente_id = ?'); params.push(parseInt(req.query.aportante_cliente_id, 10)); }
    if (req.query.aportante_compareciente_id) { wh.push('aportante_compareciente_id = ?'); params.push(parseInt(req.query.aportante_compareciente_id, 10)); }
    const rows = db.prepare(`SELECT * FROM garantias WHERE ${wh.join(' AND ')} ORDER BY creado_en DESC LIMIT 200`).all(...params);
    res.json(rows.map(descifrarGarantia));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/garantias
// Body: { institucion_id, tipo, solidaria?, datos?, aportante_tipo?,
//         aportante_cliente_id?, aportante_compareciente_id? }
// ─────────────────────────────────────────────────────────────────
router.post('/', (req, res, next) => {
  try {
    const instId = parseInt(req.body?.institucion_id, 10);
    if (!instId) return res.status(400).json({ error: 'institucion_id requerido', code: 400 });
    if (!canAccessInst(req.user, instId)) return res.status(403).json({ error: 'Sin acceso', code: 403 });

    const err = validarInputGarantia(req.body);
    if (err) return res.status(400).json({ error: err, code: 400 });

    const tipo = req.body.tipo;
    const solidaria = req.body.solidaria ? 1 : 0;
    const datosCipher = req.body.datos ? encrypt(JSON.stringify(req.body.datos)) : null;
    const aportante_tipo = req.body.aportante_tipo || null;
    const aportante_cliente_id = req.body.aportante_cliente_id ? parseInt(req.body.aportante_cliente_id, 10) : null;
    const aportante_compareciente_id = req.body.aportante_compareciente_id ? parseInt(req.body.aportante_compareciente_id, 10) : null;

    // Verificar que el aportante exista y pertenezca a la institución.
    if (aportante_cliente_id) {
      const cli = db.prepare('SELECT id, institucion_id FROM clientes WHERE id = ?').get(aportante_cliente_id);
      if (!cli || cli.institucion_id !== instId) {
        return res.status(409).json({ error: 'aportante cliente no existe o pertenece a otra institución', code: 409 });
      }
    }
    if (aportante_compareciente_id) {
      const c = db.prepare('SELECT id, institucion_id FROM comparecientes WHERE id = ?').get(aportante_compareciente_id);
      if (!c || c.institucion_id !== instId) {
        return res.status(409).json({ error: 'aportante compareciente no existe o pertenece a otra institución', code: 409 });
      }
    }

    const info = db.prepare(`
      INSERT INTO garantias (
        institucion_id, tipo, solidaria, datos,
        aportante_tipo, aportante_cliente_id, aportante_compareciente_id,
        creado_por_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      instId, tipo, solidaria, datosCipher,
      aportante_tipo, aportante_cliente_id, aportante_compareciente_id,
      req.user.userId || null,
    );

    audit(req, 'GARANTIA_AGREGADA', 'garantia', info.lastInsertRowid, { tipo, solidaria, aportante_tipo });

    const row = db.prepare('SELECT * FROM garantias WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(descifrarGarantia(row));
  } catch (err) {
    if (String(err.message || '').includes('CHECK constraint failed')) {
      return res.status(400).json({ error: 'CHECK constraint: combinación inválida de tipo/solidaria/datos/aportante', code: 400 });
    }
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM garantias WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Garantía no encontrada', code: 404 });
    if (!canAccessInst(req.user, row.institucion_id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });
    res.json(descifrarGarantia(row));
  } catch (err) { next(err); }
});

// PUT /api/garantias/:id — edita campos. La edición no afecta snapshots.
router.put('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM garantias WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Garantía no encontrada', code: 404 });
    if (!canAccessInst(req.user, row.institucion_id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });

    // Solo permitimos editar datos + aportante. tipo y solidaria son inmutables
    // (cambiar tipo implicaría romper validaciones; mejor crear nueva garantía).
    const sets = [];
    const params = [];
    const cambios = {};
    if ('datos' in req.body) {
      if (req.body.datos === null && row.tipo !== 'fiduciaria') {
        return res.status(400).json({ error: 'no se puede dejar datos NULL en garantía real', code: 400 });
      }
      sets.push('datos = ?');
      params.push(req.body.datos ? encrypt(JSON.stringify(req.body.datos)) : null);
      cambios.datos = true;
    }
    if ('aportante_tipo' in req.body) {
      if (row.tipo === 'fiduciaria') return res.status(400).json({ error: 'fiduciaria no admite aportante', code: 400 });
      if (!['cliente', 'compareciente'].includes(req.body.aportante_tipo))
        return res.status(400).json({ error: "aportante_tipo IN ('cliente','compareciente')", code: 400 });
      sets.push('aportante_tipo = ?'); params.push(req.body.aportante_tipo); cambios.aportante_tipo = req.body.aportante_tipo;
    }
    if ('aportante_cliente_id' in req.body) {
      sets.push('aportante_cliente_id = ?'); params.push(req.body.aportante_cliente_id || null);
    }
    if ('aportante_compareciente_id' in req.body) {
      sets.push('aportante_compareciente_id = ?'); params.push(req.body.aportante_compareciente_id || null);
    }
    if (sets.length === 0) return res.json(descifrarGarantia(row));

    sets.push("actualizado_en = datetime('now')");
    params.push(row.id);
    try {
      db.prepare(`UPDATE garantias SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    } catch (e) {
      if (String(e.message || '').includes('CHECK constraint failed')) {
        return res.status(400).json({ error: 'CHECK constraint: combinación inválida', code: 400 });
      }
      throw e;
    }

    if (cambios.aportante_tipo) {
      audit(req, 'GARANTIA_APORTANTE_CAMBIADO', 'garantia', row.id, { de: row.aportante_tipo, a: cambios.aportante_tipo });
    }
    audit(req, 'GARANTIA_EDITADA', 'garantia', row.id, { campos: Object.keys(cambios) });

    res.json(descifrarGarantia(db.prepare('SELECT * FROM garantias WHERE id = ?').get(row.id)));
  } catch (err) { next(err); }
});

// DELETE /api/garantias/:id — solo si no está vinculada a contratos no congelados.
router.delete('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM garantias WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Garantía no encontrada', code: 404 });
    if (!canAccessInst(req.user, row.institucion_id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });

    const usos = db.prepare(`
      SELECT c.id, c.estado FROM contrato_garantias cg
      JOIN contratos c ON c.id = cg.contrato_id
      WHERE cg.garantia_id = ?
    `).all(row.id);
    const vivos = usos.filter((u) => !['completado', 'firmado'].includes(u.estado));
    if (vivos.length > 0) {
      return res.status(409).json({
        error: 'Garantía está vinculada a contratos vivos. Desvincúlela primero.',
        code: 409,
        contratos: vivos.map((u) => u.id),
      });
    }
    // Si solo está en contratos congelados, eliminar el catálogo "vivo" pero
    // los snapshots en contrato_garantias quedan intactos (FK no es cascade).
    db.prepare('DELETE FROM garantias WHERE id = ?').run(row.id);
    audit(req, 'GARANTIA_QUITADA', 'garantia', row.id, { contratos_congelados_afectados: usos.length });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/contratos/:id/garantias  { garantia_id, orden? }
// Vincula garantía al contrato.
// VALIDACIÓN CRÍTICA: si la garantía tiene aportante compareciente, ese
// compareciente debe estar en contrato_comparecientes del contrato.
// ─────────────────────────────────────────────────────────────────
linkRouter.post('/', (req, res, next) => {
  try {
    const contratoId = parseInt(req.params.contratoId, 10);
    const garantiaId = parseInt(req.body?.garantia_id, 10);
    if (!garantiaId) return res.status(400).json({ error: 'garantia_id requerido', code: 400 });

    const cto = db.prepare('SELECT id, institucion_id, estado FROM contratos WHERE id = ?').get(contratoId);
    if (!cto) return res.status(404).json({ error: 'Contrato no encontrado', code: 404 });
    if (!canAccessInst(req.user, cto.institucion_id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });
    if (['completado', 'firmado'].includes(cto.estado))
      return res.status(409).json({ error: `Contrato en estado '${cto.estado}' no admite cambios`, code: 409 });

    const gar = db.prepare('SELECT * FROM garantias WHERE id = ?').get(garantiaId);
    if (!gar) return res.status(404).json({ error: 'Garantía no encontrada', code: 404 });
    if (gar.institucion_id !== cto.institucion_id)
      return res.status(409).json({ error: 'Garantía pertenece a otra institución', code: 409 });

    // Validación crítica del aportante.
    if (gar.aportante_tipo === 'compareciente') {
      const enContrato = db.prepare(`
        SELECT 1 FROM contrato_comparecientes
        WHERE contrato_id = ? AND compareciente_id = ?
      `).get(contratoId, gar.aportante_compareciente_id);
      if (!enContrato) {
        return res.status(409).json({
          error: 'El aportante de esta garantía no está vinculado al contrato. Agregue primero al compareciente.',
          code: 409,
          falta_compareciente_id: gar.aportante_compareciente_id,
        });
      }
    } else if (gar.aportante_tipo === 'cliente') {
      // No imponemos chequeo: el cliente del contrato es el de datos_cliente,
      // y para CP3 confiamos que el banco no pone aportante_cliente_id != cliente del contrato.
      // En CP4/CP5 se cierra el loop con UI que selecciona el cliente del contrato.
    }

    const ya = db.prepare(
      'SELECT 1 FROM contrato_garantias WHERE contrato_id = ? AND garantia_id = ?'
    ).get(contratoId, garantiaId);
    if (ya) return res.status(409).json({ error: 'Garantía ya vinculada al contrato', code: 409 });

    const count = db.prepare('SELECT COUNT(*) AS n FROM contrato_garantias WHERE contrato_id = ?').get(contratoId).n;
    if (count >= MAX_GARANTIAS_POR_CONTRATO) {
      return res.status(409).json({ error: `Máximo ${MAX_GARANTIAS_POR_CONTRATO} garantías por contrato`, code: 409 });
    }

    const orden = parseInt(req.body?.orden, 10) || (count + 1);
    db.prepare('INSERT INTO contrato_garantias (contrato_id, garantia_id, orden) VALUES (?, ?, ?)')
      .run(contratoId, garantiaId, orden);

    audit(req, 'GARANTIA_AGREGADA', 'contrato', contratoId, { garantia_id: garantiaId, orden, tipo: gar.tipo });

    res.status(201).json({ contrato_id: contratoId, garantia_id: garantiaId, orden });
  } catch (err) { next(err); }
});

// DELETE /api/contratos/:id/garantias/:garantiaId
linkRouter.delete('/:garantiaId', (req, res, next) => {
  try {
    const contratoId = parseInt(req.params.contratoId, 10);
    const garantiaId = parseInt(req.params.garantiaId, 10);
    const cto = db.prepare('SELECT id, institucion_id, estado FROM contratos WHERE id = ?').get(contratoId);
    if (!cto) return res.status(404).json({ error: 'Contrato no encontrado', code: 404 });
    if (!canAccessInst(req.user, cto.institucion_id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });
    if (['completado', 'firmado'].includes(cto.estado))
      return res.status(409).json({ error: `Contrato en estado '${cto.estado}' no admite cambios`, code: 409 });

    const info = db.prepare(
      'DELETE FROM contrato_garantias WHERE contrato_id = ? AND garantia_id = ?'
    ).run(contratoId, garantiaId);
    if (info.changes === 0) return res.status(404).json({ error: 'Vínculo no encontrado', code: 404 });

    audit(req, 'GARANTIA_QUITADA', 'contrato', contratoId, { garantia_id: garantiaId });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/contratos/:id/garantias — usa la regla snapshot vs vivo del motor.
linkRouter.get('/', (req, res, next) => {
  try {
    const contratoId = parseInt(req.params.contratoId, 10);
    const cto = db.prepare('SELECT id, institucion_id, estado FROM contratos WHERE id = ?').get(contratoId);
    if (!cto) return res.status(404).json({ error: 'Contrato no encontrado', code: 404 });
    if (!canAccessInst(req.user, cto.institucion_id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });

    const { loadGarantiasDelContrato, descifrarGarantia: dec } = require('../contrato-engine');
    const rows = loadGarantiasDelContrato(contratoId).map(dec);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = { router, linkRouter };
