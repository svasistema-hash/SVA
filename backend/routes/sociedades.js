// Sprint LexDocs Legal Fase 2 CP3 — Endpoints de sociedades (S.A.).
//
// Estructura:
//   - router: CRUD principal + transiciones de estado + sub-routers anidados.
//   - publicRouter: portal cliente sin login (token 7 días).
//
// Scope: TODOS los endpoints autenticados aplican WHERE firma_id = req.scope.firma_id.
// Las respuestas 404 son anti-enumeration (no distinguen entre "no existe" y "otra firma").

const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { audit, auditAnonimo } = require('../utils/audit');
const { encrypt, decrypt, hashFor } = require('../encryption');
const { requireFirmaScope } = require('../middleware/firmaScope');
const {
  compilarSociedad, freezeSociedad,
  loadAccionistasVivos, loadRepresentantesVivos, loadDireccionesVivas,
} = require('../sociedad-engine');

const router = express.Router();
const publicRouter = express.Router();

const ESTADOS_TERMINALES = new Set(['inscrito_RM', 'anulada']);
const ESTADOS_BLOQUEADOS_EDICION = new Set(['listo_para_RM', 'enviado_RM', 'inscrito_RM', 'anulada']);
const TOKEN_TTL_DIAS = 7;

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function scopedSociedad(req, sociedad_id) {
  // Cualquier user — incluyendo master — accede a /api/sociedades/* siempre
  // con WHERE firma_id = req.scope.firma_id. Master accede a cross-tenant
  // exclusivamente vía /api/master/*.
  return db.prepare(
    'SELECT * FROM sociedades WHERE id = ? AND firma_id = ?'
  ).get(sociedad_id, req.scope.firma_id);
}

function next404(res) {
  return res.status(404).json({ error: 'Sociedad no encontrada', code: 404 });
}

function nextCorrelativoFirma(firma_id) {
  const firma = db.prepare('SELECT correlativo_prefijo, correlativo_actual FROM firmas WHERE id = ?').get(firma_id);
  if (!firma) throw new Error('Firma no encontrada');
  const year = new Date().toISOString().slice(0, 4);
  const nuevo = (firma.correlativo_actual || 0) + 1;
  // Actualizar contador
  db.prepare('UPDATE firmas SET correlativo_actual = ? WHERE id = ?').run(nuevo, firma_id);
  return `${firma.correlativo_prefijo}-${year}-${String(nuevo).padStart(4, '0')}`;
}

function generarToken() {
  return crypto.randomBytes(32).toString('hex'); // 256 bits
}

function descifrarSociedadParaSalida(row) {
  // sociedades no tiene PII cifrada (denominación, objeto y capital son públicos).
  // PII de accionistas/representantes/direcciones se descifra al cargarlos.
  return row;
}

// ─────────────────────────────────────────────────────────────────
// POST /api/sociedades — Crear caso + emitir token público de 7 días.
// ─────────────────────────────────────────────────────────────────
router.post('/', requireFirmaScope, (req, res, next) => {
  try {
    const {
      denominacion, objeto_social, plazo_anios,
      moneda, capital_social, valor_nominal_accion, total_acciones,
    } = req.body || {};

    if (!denominacion || !objeto_social) {
      return res.status(400).json({ error: 'denominacion y objeto_social requeridos', code: 400 });
    }
    if (objeto_social.length < 50) {
      return res.status(400).json({ error: 'objeto_social debe tener al menos 50 caracteres', code: 400 });
    }
    if (!capital_social || Number(capital_social) < 5000) {
      return res.status(400).json({ error: 'capital_social >= Q5,000 (mínimo Cód. Comercio art. 86)', code: 400 });
    }
    if (!valor_nominal_accion || Number(valor_nominal_accion) <= 0) {
      return res.status(400).json({ error: 'valor_nominal_accion > 0 requerido', code: 400 });
    }
    if (!total_acciones || Number(total_acciones) <= 0) {
      return res.status(400).json({ error: 'total_acciones > 0 requerido', code: 400 });
    }
    const productoCapital = Math.round(Number(total_acciones) * Number(valor_nominal_accion) * 100) / 100;
    if (Math.abs(productoCapital - Number(capital_social)) > 0.01) {
      return res.status(400).json({
        error: `capital_social (${capital_social}) debe ser igual a total_acciones × valor_nominal_accion (${productoCapital})`,
        code: 400,
      });
    }

    let correlativo;
    let sociedadId;
    let token;
    const expires_at = new Date(Date.now() + TOKEN_TTL_DIAS * 24 * 3600 * 1000).toISOString();

    const tx = db.transaction(() => {
      correlativo = nextCorrelativoFirma(req.scope.firma_id);
      const info = db.prepare(`
        INSERT INTO sociedades (
          firma_id, correlativo, tipo_sociedad, denominacion, objeto_social,
          plazo_anios, moneda, capital_social, valor_nominal_accion, total_acciones,
          created_by_user_id
        ) VALUES (?, ?, 'sa', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.scope.firma_id, correlativo, denominacion, objeto_social,
        plazo_anios || null, moneda || 'GTQ',
        Number(capital_social), Number(valor_nominal_accion), parseInt(total_acciones, 10),
        req.user.userId || null,
      );
      sociedadId = info.lastInsertRowid;

      token = generarToken();
      db.prepare(`
        INSERT INTO sociedades_tokens (sociedad_id, token, expires_at, iteracion, created_by)
        VALUES (?, ?, ?, 1, ?)
      `).run(sociedadId, token, expires_at, req.user.userId || null);

      audit(req, 'SOCIEDAD_CREADA', 'sociedad', sociedadId, {
        correlativo, firma_id: req.scope.firma_id, tipo_sociedad: 'sa',
        tenant_tipo: 'firma', tenant_id: req.scope.firma_id,
      });
      audit(req, 'TOKEN_GENERADO', 'sociedad', sociedadId, {
        iteracion: 1, token_prefix_8: token.slice(0, 8), expires_at,
        tenant_tipo: 'firma', tenant_id: req.scope.firma_id,
      });
    });
    tx();

    const row = db.prepare('SELECT * FROM sociedades WHERE id = ?').get(sociedadId);
    res.status(201).json({
      ...descifrarSociedadParaSalida(row),
      token: { token, expires_at, iteracion: 1 },
    });
  } catch (err) {
    if (String(err.message || '').includes('CHECK constraint failed')) {
      return res.status(400).json({ error: 'Validación de schema fallida: ' + err.message, code: 400 });
    }
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sociedades — Lista filtrada por scope.firma_id.
// ─────────────────────────────────────────────────────────────────
router.get('/', requireFirmaScope, (req, res, next) => {
  try {
    const { estado, desde, hasta, q } = req.query;
    const wh = ['firma_id = ?'];
    const params = [req.scope.firma_id];
    if (estado) { wh.push('estado = ?'); params.push(estado); }
    if (desde) { wh.push('created_at >= ?'); params.push(desde); }
    if (hasta) { wh.push('created_at <= ?'); params.push(hasta + ' 23:59:59'); }
    if (q) { wh.push('(denominacion LIKE ? OR correlativo LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    const rows = db.prepare(`
      SELECT * FROM sociedades WHERE ${wh.join(' AND ')}
      ORDER BY created_at DESC LIMIT 500
    `).all(...params);
    res.json(rows.map(descifrarSociedadParaSalida));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sociedades/conteo-estados — Conteo por estado (para dashboard).
// ─────────────────────────────────────────────────────────────────
router.get('/conteo-estados', requireFirmaScope, (req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT estado, COUNT(*) AS n FROM sociedades
      WHERE firma_id = ? GROUP BY estado
    `).all(req.scope.firma_id);
    const conteo = {
      en_curso: 0, revision_abogado: 0, correcciones_cliente: 0,
      listo_para_RM: 0, enviado_RM: 0, inscrito_RM: 0, anulada: 0,
    };
    for (const r of rows) conteo[r.estado] = r.n;
    res.json(conteo);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sociedades/:id — Detalle + sub-entidades + token + correcciones.
// ─────────────────────────────────────────────────────────────────
router.get('/:id', requireFirmaScope, (req, res, next) => {
  try {
    const row = scopedSociedad(req, parseInt(req.params.id, 10));
    if (!row) return next404(res);

    const accionistas = loadAccionistasVivos(row.id);
    const representantes = loadRepresentantesVivos(row.id);
    const direcciones = loadDireccionesVivas(row.id);
    const tokens = db.prepare(`
      SELECT token, expires_at, usado, iteracion, created_at FROM sociedades_tokens
      WHERE sociedad_id = ? ORDER BY iteracion DESC
    `).all(row.id);
    const correcciones = db.prepare(`
      SELECT * FROM correcciones_sa WHERE sociedad_id = ? ORDER BY solicitado_at DESC
    `).all(row.id);

    audit(req, 'SOCIEDAD_VIEWED', 'sociedad', row.id, { acceso: 'detail', tenant_tipo: 'firma', tenant_id: req.scope.firma_id });

    res.json({
      ...descifrarSociedadParaSalida(row),
      accionistas, representantes, direcciones, tokens, correcciones,
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/sociedades/:id — Editar datos base.
// Bloqueado en estados terminales y listos para RM.
// ─────────────────────────────────────────────────────────────────
router.put('/:id', requireFirmaScope, (req, res, next) => {
  try {
    const row = scopedSociedad(req, parseInt(req.params.id, 10));
    if (!row) return next404(res);
    if (ESTADOS_BLOQUEADOS_EDICION.has(row.estado)) {
      return res.status(409).json({ error: `Sociedad en estado '${row.estado}' no admite edición`, code: 409 });
    }

    const editables = ['denominacion', 'objeto_social', 'plazo_anios', 'moneda', 'capital_social', 'valor_nominal_accion', 'total_acciones'];
    const sets = []; const params = []; const cambios = {};
    for (const k of editables) {
      if (k in (req.body || {})) {
        sets.push(`${k} = ?`); params.push(req.body[k]); cambios[k] = true;
      }
    }
    if (sets.length === 0) return res.json(descifrarSociedadParaSalida(row));
    params.push(row.id);
    try {
      db.prepare(`UPDATE sociedades SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    } catch (e) {
      if (String(e.message || '').includes('CHECK constraint failed')) {
        return res.status(400).json({ error: 'Validación de schema fallida: ' + e.message, code: 400 });
      }
      throw e;
    }
    audit(req, 'SOCIEDAD_EDITADA', 'sociedad', row.id, { campos: Object.keys(cambios), tenant_tipo: 'firma', tenant_id: req.scope.firma_id });
    res.json(descifrarSociedadParaSalida(db.prepare('SELECT * FROM sociedades WHERE id = ?').get(row.id)));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sociedades/:id/compilar — Texto compilado por motor F7.
// ─────────────────────────────────────────────────────────────────
router.get('/:id/compilar', requireFirmaScope, (req, res, next) => {
  try {
    const row = scopedSociedad(req, parseInt(req.params.id, 10));
    if (!row) return next404(res);
    const compilado = compilarSociedad(row.id, { notario: { nombre: req.user.email, colegiado: null } });
    audit(req, 'SOCIEDAD_VIEWED', 'sociedad', row.id, { acceso: 'compile', tenant_tipo: 'firma', tenant_id: req.scope.firma_id });
    res.json(compilado);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/sociedades/:id/audit-log
// ─────────────────────────────────────────────────────────────────
router.get('/:id/audit-log', requireFirmaScope, (req, res, next) => {
  try {
    const row = scopedSociedad(req, parseInt(req.params.id, 10));
    if (!row) return next404(res);
    const log = db.prepare(`
      SELECT id, timestamp, user_email, user_role, accion, entidad_tipo, entidad_id, detalles, ip
      FROM audit_log
      WHERE entidad_tipo = 'sociedad' AND entidad_id = ?
      ORDER BY id DESC LIMIT 500
    `).all(row.id).map((r) => ({ ...r, detalles: r.detalles ? JSON.parse(r.detalles) : null }));
    res.json(log);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// Sub-router: /api/sociedades/:sociedadId/accionistas
// ─────────────────────────────────────────────────────────────────
const accionistasRouter = express.Router({ mergeParams: true });

accionistasRouter.get('/', requireFirmaScope, (req, res, next) => {
  try {
    const soc = scopedSociedad(req, parseInt(req.params.sociedadId, 10));
    if (!soc) return next404(res);
    res.json(loadAccionistasVivos(soc.id));
  } catch (err) { next(err); }
});

accionistasRouter.post('/', requireFirmaScope, (req, res, next) => {
  try {
    const soc = scopedSociedad(req, parseInt(req.params.sociedadId, 10));
    if (!soc) return next404(res);
    if (ESTADOS_BLOQUEADOS_EDICION.has(soc.estado)) {
      return res.status(409).json({ error: `Sociedad en estado '${soc.estado}' no admite cambios`, code: 409 });
    }
    const a = req.body || {};
    if (!a.nombre || !a.dpi_o_nit || !a.tipo_persona) {
      return res.status(400).json({ error: 'nombre, dpi_o_nit y tipo_persona requeridos', code: 400 });
    }
    if (!['individual', 'juridico'].includes(a.tipo_persona)) {
      return res.status(400).json({ error: "tipo_persona IN ('individual','juridico')", code: 400 });
    }
    if (!a.acciones_cantidad || !a.porcentaje) {
      return res.status(400).json({ error: 'acciones_cantidad y porcentaje requeridos', code: 400 });
    }
    const orden = parseInt(a.orden, 10) || (db.prepare('SELECT COALESCE(MAX(orden),0)+1 AS n FROM accionistas WHERE sociedad_id = ?').get(soc.id).n);
    try {
      const info = db.prepare(`
        INSERT INTO accionistas (
          sociedad_id, orden, tipo_persona, nombre, nombre_hash, dpi_o_nit, dpi_o_nit_hash,
          profesion, estado_civil, fecha_nac, genero, nacionalidad, domicilio,
          acciones_cantidad, porcentaje
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        soc.id, orden, a.tipo_persona,
        encrypt(a.nombre), hashFor('nombre', a.nombre),
        encrypt(a.dpi_o_nit), hashFor(a.tipo_persona === 'juridico' ? 'nit' : 'dpi', a.dpi_o_nit),
        a.profesion ? encrypt(a.profesion) : null,
        a.estado_civil ? encrypt(a.estado_civil) : null,
        a.fecha_nac || null,
        a.genero || null,
        a.nacionalidad || null,
        a.domicilio ? encrypt(a.domicilio) : null,
        parseInt(a.acciones_cantidad, 10), Number(a.porcentaje),
      );
      audit(req, 'ACCIONISTA_AGREGADO', 'sociedad', soc.id, {
        accionista_id: info.lastInsertRowid, orden,
        tenant_tipo: 'firma', tenant_id: req.scope.firma_id,
      });
      res.status(201).json({ id: info.lastInsertRowid, orden });
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Ese DPI/NIT ya está registrado como accionista', code: 409 });
      }
      if (String(e.message || '').includes('CHECK constraint failed')) {
        return res.status(400).json({ error: 'Validación: ' + e.message, code: 400 });
      }
      throw e;
    }
  } catch (err) { next(err); }
});

accionistasRouter.put('/:accId', requireFirmaScope, (req, res, next) => {
  try {
    const soc = scopedSociedad(req, parseInt(req.params.sociedadId, 10));
    if (!soc) return next404(res);
    if (ESTADOS_BLOQUEADOS_EDICION.has(soc.estado)) {
      return res.status(409).json({ error: `Sociedad en estado '${soc.estado}' no admite cambios`, code: 409 });
    }
    const accId = parseInt(req.params.accId, 10);
    const existing = db.prepare('SELECT * FROM accionistas WHERE id = ? AND sociedad_id = ?').get(accId, soc.id);
    if (!existing) return res.status(404).json({ error: 'Accionista no encontrado', code: 404 });

    const a = req.body || {};
    const sets = []; const params = [];
    const cifradoMap = { nombre: 'nombre_hash:nombre', dpi_o_nit: 'dpi_o_nit_hash:dpi', profesion: null, estado_civil: null, domicilio: null };
    const plainMap = { fecha_nac: 1, genero: 1, nacionalidad: 1, orden: 1, acciones_cantidad: 1, porcentaje: 1, tipo_persona: 1 };
    for (const [k, hashSpec] of Object.entries(cifradoMap)) {
      if (k in a) {
        sets.push(`${k} = ?`); params.push(a[k] ? encrypt(a[k]) : null);
        if (hashSpec) {
          const [hashCol, purpose] = hashSpec.split(':');
          // Para dpi_o_nit, purpose depende de tipo_persona
          const realPurpose = (k === 'dpi_o_nit') ? (a.tipo_persona === 'juridico' ? 'nit' : (existing.tipo_persona === 'juridico' ? 'nit' : 'dpi')) : purpose;
          sets.push(`${hashCol} = ?`); params.push(a[k] ? hashFor(realPurpose, a[k]) : null);
        }
      }
    }
    for (const k of Object.keys(plainMap)) {
      if (k in a) { sets.push(`${k} = ?`); params.push(a[k]); }
    }
    if (sets.length === 0) return res.json({ ok: true });
    params.push(accId);
    try {
      db.prepare(`UPDATE accionistas SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    } catch (e) {
      if (String(e.message || '').includes('CHECK constraint failed')) {
        return res.status(400).json({ error: 'Validación: ' + e.message, code: 400 });
      }
      throw e;
    }
    audit(req, 'ACCIONISTA_EDITADO', 'sociedad', soc.id, { accionista_id: accId, tenant_tipo: 'firma', tenant_id: req.scope.firma_id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

accionistasRouter.delete('/:accId', requireFirmaScope, (req, res, next) => {
  try {
    const soc = scopedSociedad(req, parseInt(req.params.sociedadId, 10));
    if (!soc) return next404(res);
    if (ESTADOS_BLOQUEADOS_EDICION.has(soc.estado)) {
      return res.status(409).json({ error: `Sociedad en estado '${soc.estado}' no admite cambios`, code: 409 });
    }
    const accId = parseInt(req.params.accId, 10);
    const info = db.prepare('DELETE FROM accionistas WHERE id = ? AND sociedad_id = ?').run(accId, soc.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Accionista no encontrado', code: 404 });
    audit(req, 'ACCIONISTA_QUITADO', 'sociedad', soc.id, { accionista_id: accId, tenant_tipo: 'firma', tenant_id: req.scope.firma_id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// Sub-router: /api/sociedades/:sociedadId/representantes
// ─────────────────────────────────────────────────────────────────
const representantesRouter = express.Router({ mergeParams: true });

representantesRouter.get('/', requireFirmaScope, (req, res, next) => {
  try {
    const soc = scopedSociedad(req, parseInt(req.params.sociedadId, 10));
    if (!soc) return next404(res);
    res.json(loadRepresentantesVivos(soc.id));
  } catch (err) { next(err); }
});

representantesRouter.post('/', requireFirmaScope, (req, res, next) => {
  try {
    const soc = scopedSociedad(req, parseInt(req.params.sociedadId, 10));
    if (!soc) return next404(res);
    if (ESTADOS_BLOQUEADOS_EDICION.has(soc.estado)) {
      return res.status(409).json({ error: `Sociedad en estado '${soc.estado}' no admite cambios`, code: 409 });
    }
    const r = req.body || {};
    if (!r.nombre || !r.dpi || !r.cargo || !r.vigencia_inicio) {
      return res.status(400).json({ error: 'nombre, dpi, cargo y vigencia_inicio requeridos', code: 400 });
    }
    const orden = parseInt(r.orden, 10) || (db.prepare('SELECT COALESCE(MAX(orden),0)+1 AS n FROM representantes_sa WHERE sociedad_id = ?').get(soc.id).n);
    try {
      const info = db.prepare(`
        INSERT INTO representantes_sa (
          sociedad_id, orden, nombre, nombre_hash, dpi, dpi_hash,
          profesion, estado_civil, fecha_nac, genero, nacionalidad, domicilio,
          cargo, vigencia_inicio, vigencia_vencimiento, facultades
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        soc.id, orden,
        encrypt(r.nombre), hashFor('nombre', r.nombre),
        encrypt(r.dpi), hashFor('dpi', r.dpi),
        r.profesion ? encrypt(r.profesion) : null,
        r.estado_civil ? encrypt(r.estado_civil) : null,
        r.fecha_nac || null,
        r.genero || null,
        r.nacionalidad || 'guatemalteca',
        r.domicilio ? encrypt(r.domicilio) : null,
        r.cargo, r.vigencia_inicio, r.vigencia_vencimiento || null, r.facultades || null,
      );
      audit(req, 'REPRESENTANTE_SA_AGREGADO', 'sociedad', soc.id, {
        representante_id: info.lastInsertRowid, cargo: r.cargo, orden,
        tenant_tipo: 'firma', tenant_id: req.scope.firma_id,
      });
      res.status(201).json({ id: info.lastInsertRowid, orden });
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Ese DPI ya tiene asignado ese cargo en esta sociedad', code: 409 });
      }
      if (String(e.message || '').includes('CHECK constraint failed')) {
        return res.status(400).json({ error: 'Cargo inválido. Permitidos: Administrador Único, Presidente, Vicepresidente, Secretario, Tesorero, Vocal, Gerente General, Apoderado', code: 400 });
      }
      throw e;
    }
  } catch (err) { next(err); }
});

representantesRouter.delete('/:repId', requireFirmaScope, (req, res, next) => {
  try {
    const soc = scopedSociedad(req, parseInt(req.params.sociedadId, 10));
    if (!soc) return next404(res);
    if (ESTADOS_BLOQUEADOS_EDICION.has(soc.estado)) {
      return res.status(409).json({ error: `Sociedad en estado '${soc.estado}' no admite cambios`, code: 409 });
    }
    const repId = parseInt(req.params.repId, 10);
    const info = db.prepare('DELETE FROM representantes_sa WHERE id = ? AND sociedad_id = ?').run(repId, soc.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Representante no encontrado', code: 404 });
    audit(req, 'REPRESENTANTE_SA_QUITADO', 'sociedad', soc.id, { representante_id: repId, tenant_tipo: 'firma', tenant_id: req.scope.firma_id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// Sub-router: /api/sociedades/:sociedadId/direcciones
// ─────────────────────────────────────────────────────────────────
const direccionesRouter = express.Router({ mergeParams: true });

direccionesRouter.get('/', requireFirmaScope, (req, res, next) => {
  try {
    const soc = scopedSociedad(req, parseInt(req.params.sociedadId, 10));
    if (!soc) return next404(res);
    res.json(loadDireccionesVivas(soc.id));
  } catch (err) { next(err); }
});

direccionesRouter.post('/', requireFirmaScope, (req, res, next) => {
  try {
    const soc = scopedSociedad(req, parseInt(req.params.sociedadId, 10));
    if (!soc) return next404(res);
    if (ESTADOS_BLOQUEADOS_EDICION.has(soc.estado)) {
      return res.status(409).json({ error: `Sociedad en estado '${soc.estado}' no admite cambios`, code: 409 });
    }
    const d = req.body || {};
    if (!d.tipo || !d.direccion || !d.municipio || !d.departamento) {
      return res.status(400).json({ error: 'tipo, direccion, municipio y departamento requeridos', code: 400 });
    }
    try {
      const info = db.prepare(`
        INSERT INTO direcciones_sa (sociedad_id, tipo, direccion, municipio, departamento, pais, codigo_postal)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(soc.id, d.tipo, d.direccion, d.municipio, d.departamento, d.pais || 'Guatemala', d.codigo_postal || null);
      audit(req, 'DIRECCION_SA_AGREGADA', 'sociedad', soc.id, { direccion_id: info.lastInsertRowid, tipo: d.tipo, tenant_tipo: 'firma', tenant_id: req.scope.firma_id });
      res.status(201).json({ id: info.lastInsertRowid });
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: `Ya existe una dirección de tipo '${d.tipo}' para esta sociedad`, code: 409 });
      }
      if (String(e.message || '').includes('CHECK constraint failed')) {
        return res.status(400).json({ error: "tipo IN ('fiscal','comercial','notificaciones')", code: 400 });
      }
      throw e;
    }
  } catch (err) { next(err); }
});

direccionesRouter.delete('/:dirId', requireFirmaScope, (req, res, next) => {
  try {
    const soc = scopedSociedad(req, parseInt(req.params.sociedadId, 10));
    if (!soc) return next404(res);
    if (ESTADOS_BLOQUEADOS_EDICION.has(soc.estado)) {
      return res.status(409).json({ error: `Sociedad en estado '${soc.estado}' no admite cambios`, code: 409 });
    }
    const dirId = parseInt(req.params.dirId, 10);
    const info = db.prepare('DELETE FROM direcciones_sa WHERE id = ? AND sociedad_id = ?').run(dirId, soc.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Dirección no encontrada', code: 404 });
    audit(req, 'DIRECCION_SA_QUITADA', 'sociedad', soc.id, { direccion_id: dirId, tenant_tipo: 'firma', tenant_id: req.scope.firma_id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// Transiciones de estado
// ─────────────────────────────────────────────────────────────────

const TRANSICIONES_FORWARD = {
  en_curso: 'revision_abogado',
  correcciones_cliente: 'revision_abogado',
  revision_abogado: 'listo_para_RM',
  listo_para_RM: 'enviado_RM',
  enviado_RM: 'inscrito_RM',
};

const TRANSICIONES_BACKWARD = {
  revision_abogado: 'en_curso',
  listo_para_RM: 'revision_abogado',
};

router.post('/:id/avanzar', requireFirmaScope, (req, res, next) => {
  try {
    const row = scopedSociedad(req, parseInt(req.params.id, 10));
    if (!row) return next404(res);
    const nuevo = TRANSICIONES_FORWARD[row.estado];
    if (!nuevo) {
      return res.status(400).json({ error: `Sin transición forward desde '${row.estado}'`, code: 400 });
    }

    if (nuevo === 'listo_para_RM') {
      // FREEZE: validaciones críticas + snapshot inmutable.
      try {
        const tx = db.transaction(() => {
          const freezeRes = freezeSociedad(row.id, db);
          db.prepare(`
            UPDATE sociedades
            SET estado = 'listo_para_RM',
                aprobado_por_user_id = ?,
                aprobado_at = datetime('now'),
                listo_para_rm_at = datetime('now')
            WHERE id = ?
          `).run(req.user.userId || null, row.id);
          audit(req, 'SOCIEDAD_TRANSICION', 'sociedad', row.id, {
            de: row.estado, a: 'listo_para_RM',
            tenant_tipo: 'firma', tenant_id: req.scope.firma_id,
          });
          audit(req, 'SOCIEDAD_CONGELADA', 'sociedad', row.id, {
            ...freezeRes, tenant_tipo: 'firma', tenant_id: req.scope.firma_id,
          });
        });
        tx();
      } catch (e) {
        return res.status(400).json({ error: `No se puede congelar: ${e.message}`, code: 400 });
      }
    } else {
      const extras = {};
      if (nuevo === 'enviado_RM') {
        extras.enviado_rm_por = req.user.userId;
        extras.enviado_rm_at = 'datetime("now")';
      }
      let sql = `UPDATE sociedades SET estado = ?`;
      const params = [nuevo];
      if (nuevo === 'enviado_RM') {
        sql += `, enviado_rm_por = ?, enviado_rm_at = datetime('now')`;
        params.push(req.user.userId || null);
      }
      sql += ' WHERE id = ?';
      params.push(row.id);
      db.prepare(sql).run(...params);
      audit(req, 'SOCIEDAD_TRANSICION', 'sociedad', row.id, {
        de: row.estado, a: nuevo,
        tenant_tipo: 'firma', tenant_id: req.scope.firma_id,
      });
    }

    res.json(db.prepare('SELECT * FROM sociedades WHERE id = ?').get(row.id));
  } catch (err) { next(err); }
});

router.post('/:id/marcar-inscrito-rm', requireFirmaScope, (req, res, next) => {
  try {
    const row = scopedSociedad(req, parseInt(req.params.id, 10));
    if (!row) return next404(res);
    if (row.estado !== 'enviado_RM') {
      return res.status(400).json({ error: `Estado debe ser 'enviado_RM', actual: '${row.estado}'`, code: 400 });
    }
    const { folio, libro, fecha } = req.body || {};
    if (!folio || !libro || !fecha) {
      return res.status(400).json({ error: 'folio, libro y fecha requeridos', code: 400 });
    }
    db.prepare(`
      UPDATE sociedades
      SET estado = 'inscrito_RM',
          rm_folio = ?, rm_libro = ?, rm_fecha_inscripcion = ?,
          inscrito_rm_por = ?
      WHERE id = ?
    `).run(folio, libro, fecha, req.user.userId || null, row.id);
    audit(req, 'SOCIEDAD_INSCRITA_RM', 'sociedad', row.id, {
      folio, libro, fecha, tenant_tipo: 'firma', tenant_id: req.scope.firma_id,
    });
    res.json(db.prepare('SELECT * FROM sociedades WHERE id = ?').get(row.id));
  } catch (err) { next(err); }
});

router.post('/:id/regresar', requireFirmaScope, (req, res, next) => {
  try {
    const row = scopedSociedad(req, parseInt(req.params.id, 10));
    if (!row) return next404(res);
    const nuevo = TRANSICIONES_BACKWARD[row.estado];
    if (!nuevo) {
      return res.status(400).json({ error: `Sin transición backward desde '${row.estado}'`, code: 400 });
    }
    db.prepare('UPDATE sociedades SET estado = ? WHERE id = ?').run(nuevo, row.id);
    audit(req, 'SOCIEDAD_TRANSICION', 'sociedad', row.id, {
      de: row.estado, a: nuevo, motivo: req.body?.motivo || null,
      tenant_tipo: 'firma', tenant_id: req.scope.firma_id,
    });
    res.json(db.prepare('SELECT * FROM sociedades WHERE id = ?').get(row.id));
  } catch (err) { next(err); }
});

router.post('/:id/anular', requireFirmaScope, (req, res, next) => {
  try {
    const row = scopedSociedad(req, parseInt(req.params.id, 10));
    if (!row) return next404(res);
    if (ESTADOS_TERMINALES.has(row.estado)) {
      return res.status(400).json({ error: `Sociedad ya está en estado terminal '${row.estado}'`, code: 400 });
    }
    const motivo = (req.body?.motivo || '').trim();
    if (!motivo) return res.status(400).json({ error: 'motivo requerido', code: 400 });

    db.prepare(`
      UPDATE sociedades
      SET estado = 'anulada', anulado_motivo = ?, anulado_por = ?, anulado_at = datetime('now')
      WHERE id = ?
    `).run(motivo, req.user.userId || null, row.id);
    audit(req, 'SOCIEDAD_ANULADA', 'sociedad', row.id, {
      motivo, estado_previo: row.estado,
      tenant_tipo: 'firma', tenant_id: req.scope.firma_id,
    });
    res.json(db.prepare('SELECT * FROM sociedades WHERE id = ?').get(row.id));
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────
// Correcciones — abogado solicita, cliente resuelve
// ─────────────────────────────────────────────────────────────────

router.post('/:id/correcciones', requireFirmaScope, (req, res, next) => {
  try {
    const row = scopedSociedad(req, parseInt(req.params.id, 10));
    if (!row) return next404(res);
    if (row.estado !== 'revision_abogado') {
      return res.status(400).json({ error: `Estado debe ser 'revision_abogado', actual: '${row.estado}'`, code: 400 });
    }
    const { campos_a_corregir, comentario } = req.body || {};
    if (!Array.isArray(campos_a_corregir) || campos_a_corregir.length === 0) {
      return res.status(400).json({ error: 'campos_a_corregir[] requerido y no vacío', code: 400 });
    }
    if (!comentario || comentario.trim().length === 0) {
      return res.status(400).json({ error: 'comentario requerido', code: 400 });
    }

    // Sumar 1 a iteracion actual
    const ultimaIter = db.prepare('SELECT MAX(iteracion) AS n FROM sociedades_tokens WHERE sociedad_id = ?').get(row.id).n || 1;
    const nuevaIter = ultimaIter + 1;
    const token = generarToken();
    const expires_at = new Date(Date.now() + TOKEN_TTL_DIAS * 24 * 3600 * 1000).toISOString();

    const tx = db.transaction(() => {
      // Marcar token anterior como usado para revocar el link viejo
      db.prepare('UPDATE sociedades_tokens SET usado = 1 WHERE sociedad_id = ?').run(row.id);
      // Insertar nuevo token con iteración siguiente
      db.prepare(`
        INSERT INTO sociedades_tokens (sociedad_id, token, expires_at, iteracion, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(row.id, token, expires_at, nuevaIter, req.user.userId || null);
      // Insertar corrección
      db.prepare(`
        INSERT INTO correcciones_sa (sociedad_id, iteracion, campos_a_corregir, comentario, solicitado_por_user_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(row.id, nuevaIter, JSON.stringify(campos_a_corregir), comentario.trim(), req.user.userId || null);
      // Transicionar estado
      db.prepare("UPDATE sociedades SET estado = 'correcciones_cliente' WHERE id = ?").run(row.id);

      audit(req, 'CORRECCIONES_SOLICITADAS', 'sociedad', row.id, {
        iteracion: nuevaIter, campos_count: campos_a_corregir.length,
        hash_comentario_8: hashFor('comentario', comentario).slice(0, 8),
        tenant_tipo: 'firma', tenant_id: req.scope.firma_id,
      });
      audit(req, 'SOCIEDAD_TRANSICION', 'sociedad', row.id, {
        de: 'revision_abogado', a: 'correcciones_cliente',
        tenant_tipo: 'firma', tenant_id: req.scope.firma_id,
      });
      audit(req, 'TOKEN_GENERADO', 'sociedad', row.id, {
        iteracion: nuevaIter, token_prefix_8: token.slice(0, 8), expires_at,
        tenant_tipo: 'firma', tenant_id: req.scope.firma_id,
      });
    });
    tx();

    res.status(201).json({
      sociedad_id: row.id, iteracion: nuevaIter,
      token: { token, expires_at, iteracion: nuevaIter },
    });
  } catch (err) { next(err); }
});

// Endpoint master de correcciones: marcar resueltas (cuando el cliente reenvía)
// no necesario — se hace automáticamente al confirmar reenvío en publicRouter.

// ─────────────────────────────────────────────────────────────────
// Montar sub-routers
// ─────────────────────────────────────────────────────────────────
router.use('/:sociedadId/accionistas', accionistasRouter);
router.use('/:sociedadId/representantes', representantesRouter);
router.use('/:sociedadId/direcciones', direccionesRouter);

// ─────────────────────────────────────────────────────────────────
// publicRouter — Portal cliente sin login (token 7 días)
// ─────────────────────────────────────────────────────────────────

function resolverTokenSociedad(token) {
  const t = db.prepare('SELECT * FROM sociedades_tokens WHERE token = ?').get(token);
  if (!t) return { ok: false, code: 404, error: 'Link no válido o expirado' };
  if (t.usado) return { ok: false, code: 404, error: 'Link no válido o expirado' };
  if (new Date(t.expires_at).getTime() < Date.now()) return { ok: false, code: 404, error: 'Link no válido o expirado' };
  const soc = db.prepare('SELECT * FROM sociedades WHERE id = ?').get(t.sociedad_id);
  if (!soc) return { ok: false, code: 404, error: 'Link no válido o expirado' };
  if (!['en_curso', 'correcciones_cliente'].includes(soc.estado)) {
    return { ok: false, code: 404, error: 'Link no válido o expirado' };
  }
  return { ok: true, token_row: t, sociedad: soc };
}

publicRouter.get('/:token', (req, res) => {
  const r = resolverTokenSociedad(req.params.token);
  if (!r.ok) return res.status(r.code).json({ error: r.error, code: r.code });
  // Cargar sub-entidades (vivos siempre en estados editables)
  const accionistas = loadAccionistasVivos(r.sociedad.id);
  const representantes = loadRepresentantesVivos(r.sociedad.id);
  const direcciones = loadDireccionesVivas(r.sociedad.id);
  const correccionesPendientes = db.prepare(`
    SELECT id, iteracion, campos_a_corregir, comentario, solicitado_at
    FROM correcciones_sa WHERE sociedad_id = ? AND status = 'pendiente'
    ORDER BY solicitado_at DESC
  `).all(r.sociedad.id).map((c) => ({ ...c, campos_a_corregir: JSON.parse(c.campos_a_corregir) }));

  res.json({
    sociedad: {
      id: r.sociedad.id, correlativo: r.sociedad.correlativo, estado: r.sociedad.estado,
      denominacion: r.sociedad.denominacion, objeto_social: r.sociedad.objeto_social,
      plazo_anios: r.sociedad.plazo_anios, moneda: r.sociedad.moneda,
      capital_social: r.sociedad.capital_social,
      valor_nominal_accion: r.sociedad.valor_nominal_accion,
      total_acciones: r.sociedad.total_acciones,
      datos_borrador: r.sociedad.datos_borrador ? (() => { try { return JSON.parse(r.sociedad.datos_borrador); } catch { return null; } })() : null,
    },
    accionistas, representantes, direcciones,
    correcciones_pendientes: correccionesPendientes,
    expires_at: r.token_row.expires_at,
    iteracion: r.token_row.iteracion,
  });
});

publicRouter.put('/:token/datos', (req, res) => {
  const r = resolverTokenSociedad(req.params.token);
  if (!r.ok) return res.status(r.code).json({ error: r.error, code: r.code });

  // Permitir editar datos base de la sociedad (denominacion, objeto, etc.) y guardar borrador
  const updates = []; const params = [];
  const editables = ['denominacion', 'objeto_social', 'plazo_anios', 'moneda', 'capital_social', 'valor_nominal_accion', 'total_acciones'];
  for (const k of editables) {
    if (k in (req.body || {})) { updates.push(`${k} = ?`); params.push(req.body[k]); }
  }
  if (req.body?.borrador) {
    const ser = JSON.stringify(req.body.borrador);
    if (ser.length > 200 * 1024) return res.status(413).json({ error: 'borrador demasiado grande', code: 413 });
    updates.push('datos_borrador = ?'); params.push(ser);
  }
  if (updates.length === 0) return res.json({ ok: true });
  params.push(r.sociedad.id);
  try {
    db.prepare(`UPDATE sociedades SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  } catch (e) {
    if (String(e.message || '').includes('CHECK constraint failed')) {
      return res.status(400).json({ error: 'Validación: ' + e.message, code: 400 });
    }
    throw e;
  }
});

// CRUD accionistas público
publicRouter.post('/:token/accionistas', (req, res) => {
  const r = resolverTokenSociedad(req.params.token);
  if (!r.ok) return res.status(r.code).json({ error: r.error, code: r.code });
  const a = req.body || {};
  if (!a.nombre || !a.dpi_o_nit || !a.tipo_persona || !a.acciones_cantidad || !a.porcentaje) {
    return res.status(400).json({ error: 'campos requeridos faltantes', code: 400 });
  }
  const orden = parseInt(a.orden, 10) || (db.prepare('SELECT COALESCE(MAX(orden),0)+1 AS n FROM accionistas WHERE sociedad_id = ?').get(r.sociedad.id).n);
  try {
    const info = db.prepare(`
      INSERT INTO accionistas (
        sociedad_id, orden, tipo_persona, nombre, nombre_hash, dpi_o_nit, dpi_o_nit_hash,
        profesion, estado_civil, fecha_nac, genero, nacionalidad, domicilio,
        acciones_cantidad, porcentaje
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      r.sociedad.id, orden, a.tipo_persona,
      encrypt(a.nombre), hashFor('nombre', a.nombre),
      encrypt(a.dpi_o_nit), hashFor(a.tipo_persona === 'juridico' ? 'nit' : 'dpi', a.dpi_o_nit),
      a.profesion ? encrypt(a.profesion) : null,
      a.estado_civil ? encrypt(a.estado_civil) : null,
      a.fecha_nac || null, a.genero || null, a.nacionalidad || 'guatemalteca',
      a.domicilio ? encrypt(a.domicilio) : null,
      parseInt(a.acciones_cantidad, 10), Number(a.porcentaje),
    );
    auditAnonimo('ACCIONISTA_AGREGADO', 'sociedad', r.sociedad.id, {
      accionista_id: info.lastInsertRowid, via: 'portal_publico',
      tenant_tipo: 'firma', tenant_id: r.sociedad.firma_id,
    }, { institucion_id: null, ip: req.ip, user_agent: req.get('user-agent') });
    res.status(201).json({ id: info.lastInsertRowid, orden });
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Ese DPI/NIT ya está registrado como accionista', code: 409 });
    }
    if (String(e.message || '').includes('CHECK constraint failed')) {
      return res.status(400).json({ error: 'Validación: ' + e.message, code: 400 });
    }
    throw e;
  }
});

publicRouter.delete('/:token/accionistas/:accId', (req, res) => {
  const r = resolverTokenSociedad(req.params.token);
  if (!r.ok) return res.status(r.code).json({ error: r.error, code: r.code });
  const info = db.prepare('DELETE FROM accionistas WHERE id = ? AND sociedad_id = ?').run(parseInt(req.params.accId, 10), r.sociedad.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Accionista no encontrado', code: 404 });
  auditAnonimo('ACCIONISTA_QUITADO', 'sociedad', r.sociedad.id, { accionista_id: req.params.accId, via: 'portal_publico', tenant_tipo: 'firma', tenant_id: r.sociedad.firma_id }, { ip: req.ip, user_agent: req.get('user-agent') });
  res.json({ ok: true });
});

// Mismo pattern para representantes y direcciones (compactado por brevedad)
publicRouter.post('/:token/representantes', (req, res) => {
  const r = resolverTokenSociedad(req.params.token);
  if (!r.ok) return res.status(r.code).json({ error: r.error, code: r.code });
  const re = req.body || {};
  if (!re.nombre || !re.dpi || !re.cargo || !re.vigencia_inicio) {
    return res.status(400).json({ error: 'nombre, dpi, cargo y vigencia_inicio requeridos', code: 400 });
  }
  const orden = parseInt(re.orden, 10) || (db.prepare('SELECT COALESCE(MAX(orden),0)+1 AS n FROM representantes_sa WHERE sociedad_id = ?').get(r.sociedad.id).n);
  try {
    const info = db.prepare(`
      INSERT INTO representantes_sa (
        sociedad_id, orden, nombre, nombre_hash, dpi, dpi_hash,
        profesion, estado_civil, fecha_nac, genero, nacionalidad, domicilio,
        cargo, vigencia_inicio, vigencia_vencimiento, facultades
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      r.sociedad.id, orden,
      encrypt(re.nombre), hashFor('nombre', re.nombre),
      encrypt(re.dpi), hashFor('dpi', re.dpi),
      re.profesion ? encrypt(re.profesion) : null,
      re.estado_civil ? encrypt(re.estado_civil) : null,
      re.fecha_nac || null, re.genero || null, re.nacionalidad || 'guatemalteca',
      re.domicilio ? encrypt(re.domicilio) : null,
      re.cargo, re.vigencia_inicio, re.vigencia_vencimiento || null, re.facultades || null,
    );
    auditAnonimo('REPRESENTANTE_SA_AGREGADO', 'sociedad', r.sociedad.id, { representante_id: info.lastInsertRowid, via: 'portal_publico', tenant_tipo: 'firma', tenant_id: r.sociedad.firma_id }, { ip: req.ip, user_agent: req.get('user-agent') });
    res.status(201).json({ id: info.lastInsertRowid, orden });
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Ese DPI ya tiene asignado ese cargo', code: 409 });
    }
    if (String(e.message || '').includes('CHECK constraint failed')) {
      return res.status(400).json({ error: 'Cargo inválido', code: 400 });
    }
    throw e;
  }
});

publicRouter.delete('/:token/representantes/:repId', (req, res) => {
  const r = resolverTokenSociedad(req.params.token);
  if (!r.ok) return res.status(r.code).json({ error: r.error, code: r.code });
  const info = db.prepare('DELETE FROM representantes_sa WHERE id = ? AND sociedad_id = ?').run(parseInt(req.params.repId, 10), r.sociedad.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Representante no encontrado', code: 404 });
  auditAnonimo('REPRESENTANTE_SA_QUITADO', 'sociedad', r.sociedad.id, { representante_id: req.params.repId, via: 'portal_publico', tenant_tipo: 'firma', tenant_id: r.sociedad.firma_id }, { ip: req.ip, user_agent: req.get('user-agent') });
  res.json({ ok: true });
});

publicRouter.post('/:token/direcciones', (req, res) => {
  const r = resolverTokenSociedad(req.params.token);
  if (!r.ok) return res.status(r.code).json({ error: r.error, code: r.code });
  const d = req.body || {};
  if (!d.tipo || !d.direccion || !d.municipio || !d.departamento) {
    return res.status(400).json({ error: 'tipo, direccion, municipio y departamento requeridos', code: 400 });
  }
  try {
    const info = db.prepare(`
      INSERT INTO direcciones_sa (sociedad_id, tipo, direccion, municipio, departamento, pais, codigo_postal)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(r.sociedad.id, d.tipo, d.direccion, d.municipio, d.departamento, d.pais || 'Guatemala', d.codigo_postal || null);
    auditAnonimo('DIRECCION_SA_AGREGADA', 'sociedad', r.sociedad.id, { direccion_id: info.lastInsertRowid, tipo: d.tipo, via: 'portal_publico', tenant_tipo: 'firma', tenant_id: r.sociedad.firma_id }, { ip: req.ip, user_agent: req.get('user-agent') });
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: `Ya existe dirección tipo '${d.tipo}'`, code: 409 });
    }
    if (String(e.message || '').includes('CHECK constraint failed')) {
      return res.status(400).json({ error: 'tipo inválido', code: 400 });
    }
    throw e;
  }
});

publicRouter.delete('/:token/direcciones/:dirId', (req, res) => {
  const r = resolverTokenSociedad(req.params.token);
  if (!r.ok) return res.status(r.code).json({ error: r.error, code: r.code });
  const info = db.prepare('DELETE FROM direcciones_sa WHERE id = ? AND sociedad_id = ?').run(parseInt(req.params.dirId, 10), r.sociedad.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Dirección no encontrada', code: 404 });
  auditAnonimo('DIRECCION_SA_QUITADA', 'sociedad', r.sociedad.id, { direccion_id: req.params.dirId, via: 'portal_publico', tenant_tipo: 'firma', tenant_id: r.sociedad.firma_id }, { ip: req.ip, user_agent: req.get('user-agent') });
  res.json({ ok: true });
});

publicRouter.post('/:token/confirmar', (req, res) => {
  const r = resolverTokenSociedad(req.params.token);
  if (!r.ok) return res.status(r.code).json({ error: r.error, code: r.code });

  const tx = db.transaction(() => {
    // Marcar correcciones pendientes como resueltas si estamos en correcciones_cliente
    if (r.sociedad.estado === 'correcciones_cliente') {
      db.prepare(`
        UPDATE correcciones_sa SET status = 'resuelto', resuelto_at = datetime('now')
        WHERE sociedad_id = ? AND status = 'pendiente'
      `).run(r.sociedad.id);
    }
    // Transicionar a revision_abogado
    db.prepare(`UPDATE sociedades SET estado = 'revision_abogado' WHERE id = ?`).run(r.sociedad.id);
    // Marcar token como usado
    db.prepare(`UPDATE sociedades_tokens SET usado = 1 WHERE id = ?`).run(r.token_row.id);

    auditAnonimo(
      r.sociedad.estado === 'correcciones_cliente' ? 'CASO_SA_REENVIADO' : 'CASO_SA_ENVIADO_REVISION',
      'sociedad', r.sociedad.id,
      { via: 'portal_publico', tenant_tipo: 'firma', tenant_id: r.sociedad.firma_id },
      { institucion_id: null, ip: req.ip, user_agent: req.get('user-agent') },
    );
    auditAnonimo('TOKEN_USADO', 'sociedad', r.sociedad.id,
      { token_prefix_8: req.params.token.slice(0, 8), tenant_tipo: 'firma', tenant_id: r.sociedad.firma_id },
      { ip: req.ip, user_agent: req.get('user-agent') },
    );
  });
  tx();

  res.json({ ok: true, estado: 'revision_abogado' });
});

module.exports = { router, publicRouter };
