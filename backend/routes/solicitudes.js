const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { encrypt, hashFor } = require('../encryption');
const { normalizeMoney } = require('../utils/money');
const { UPLOADS_PATH } = require('../config');
const ocr = require('../utils/ocr');
const { parseDPI } = require('../utils/dpi-parser');
const { parseRecibo } = require('../utils/recibo-parser');
const { audit, auditAnonimo } = require('../utils/audit');

const authRouter = express.Router();
const publicRouter = express.Router();

// ──────────────────────────────────────────────────────────────
// AUTH (legacy): tokens por institución para portal de "registro de cliente
// suelto". Se mantienen funcionales para la página tenant/Solicitudes.jsx.
// El flujo nuevo (F1 C3) usa contratos_tokens, no estos.
// ──────────────────────────────────────────────────────────────

function canAccessInst(user, instId) {
  if (user.role === 'admin' && !user.institucion_id) return true;
  return user.institucion_id === instId;
}

authRouter.post('/api/instituciones/:slug/solicitudes/token', authenticate, (req, res, next) => {
  try {
    const inst = db.prepare('SELECT id FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    if (!canAccessInst(req.user, inst.id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    db.prepare(
      'INSERT INTO solicitudes_tokens (institucion_id, token, expires_at) VALUES (?, ?, ?)'
    ).run(inst.id, token, expires);
    res.status(201).json({ token, expires_at: expires });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/api/instituciones/:slug/solicitudes/tokens', authenticate, (req, res, next) => {
  try {
    const inst = db.prepare('SELECT id FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    if (!canAccessInst(req.user, inst.id)) return res.status(403).json({ error: 'Sin acceso', code: 403 });
    res.json(
      db.prepare(
        'SELECT * FROM solicitudes_tokens WHERE institucion_id = ? ORDER BY created_at DESC LIMIT 50'
      ).all(inst.id)
    );
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// PUBLIC (F1 C3): portal del cliente vinculado a un contrato.
//
// Flujo:
//   GET  /solicitud/:token            → valida token, devuelve estado + borrador
//   PUT  /solicitud/:token/datos      → guarda datos_borrador (silencioso)
//   POST /solicitud/:token/dpi        → sube DPI + OCR
//   POST /solicitud/:token/recibo     → sube recibo + OCR
//   POST /solicitud/:token/confirmar  → marca token usado, contrato → revision_tenant
//
// Validación común:
//   token existe, no usado, no vencido, contrato en estado 'en_curso'.
// ──────────────────────────────────────────────────────────────

// Multer storage (mismo patrón que en clientes.js, ya hay carpeta uploads creada).
if (!fs.existsSync(UPLOADS_PATH)) fs.mkdirSync(UPLOADS_PATH, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_PATH),
  filename: (req, file, cb) => {
    const hash = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    cb(null, `${Date.now()}-${hash}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/'))
      return cb(Object.assign(new Error('Solo se permiten imágenes'), { status: 400 }));
    cb(null, true);
  },
});

// Resuelve token → { token_row, contrato, institucion } o devuelve respuesta de error.
// status: 'ok' | 'no-existe' | 'vencido' | 'usado' | 'contrato-no-abierto'
function resolverToken(token) {
  const t = db.prepare('SELECT * FROM contratos_tokens WHERE token = ?').get(token);
  if (!t) return { status: 'no-existe' };
  if (t.usado) return { status: 'usado' };
  if (new Date(t.expires_at).getTime() < Date.now()) return { status: 'vencido' };

  const contrato = db.prepare('SELECT * FROM contratos WHERE id = ?').get(t.contrato_id);
  if (!contrato) return { status: 'no-existe' };
  if (contrato.estado !== 'en_curso') return { status: 'contrato-no-abierto', estado: contrato.estado };

  const inst = db
    .prepare('SELECT id, slug, nombre, tipo FROM instituciones WHERE id = ?')
    .get(contrato.institucion_id);
  const modelo = db
    .prepare('SELECT id, nombre, tipo_garantia FROM modelos WHERE id = ?')
    .get(contrato.modelo_id);
  return { status: 'ok', token_row: t, contrato, institucion: inst, modelo };
}

function jsonError(res, status, code, mensaje) {
  return res.status(status).json({ error: mensaje, code });
}

function manejarErrorToken(res, r) {
  if (r.status === 'no-existe') return jsonError(res, 404, 'token_no_existe', 'Link no válido');
  if (r.status === 'vencido') return jsonError(res, 410, 'token_vencido', 'Link vencido');
  if (r.status === 'usado') return jsonError(res, 410, 'token_usado', 'Solicitud ya enviada');
  if (r.status === 'contrato-no-abierto')
    return jsonError(res, 409, 'contrato_no_abierto', `El contrato está en estado '${r.estado}'`);
}

// GET /solicitud/:token — valida y devuelve estado actual + borrador.
publicRouter.get('/solicitud/:token', (req, res, next) => {
  try {
    const r = resolverToken(req.params.token);
    if (r.status !== 'ok') return manejarErrorToken(res, r);
    let borrador = null;
    if (r.contrato.datos_borrador) {
      try { borrador = JSON.parse(r.contrato.datos_borrador); } catch (_) { borrador = null; }
    }
    res.json({
      institucion: {
        nombre: r.institucion.nombre,
        tipo: r.institucion.tipo,
      },
      contrato: {
        id: r.contrato.id,
        no_contrato: r.contrato.no_contrato,
        estado: r.contrato.estado,
      },
      modelo: r.modelo ? {
        nombre: r.modelo.nombre,
        tipo_garantia: r.modelo.tipo_garantia,
      } : null,
      expires_at: r.token_row.expires_at,
      borrador,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /solicitud/:token/datos — guarda borrador (silencioso).
publicRouter.put('/solicitud/:token/datos', (req, res, next) => {
  try {
    const r = resolverToken(req.params.token);
    if (r.status !== 'ok') return manejarErrorToken(res, r);
    const datos = req.body || {};
    // Sanity: tamaño máximo del JSON (evita abuse). 200KB es generoso para 7 pasos.
    const serializado = JSON.stringify(datos);
    if (serializado.length > 200 * 1024) {
      return jsonError(res, 413, 'datos_demasiado_grandes', 'Datos exceden el tamaño máximo permitido');
    }
    db.prepare('UPDATE contratos SET datos_borrador = ? WHERE id = ?').run(serializado, r.contrato.id);
    res.json({ ok: true, guardado_en: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

// POST /solicitud/:token/dpi — sube DPI, corre OCR.
publicRouter.post('/solicitud/:token/dpi', upload.single('imagen'), async (req, res, next) => {
  try {
    const r = resolverToken(req.params.token);
    if (r.status !== 'ok') {
      if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
      return manejarErrorToken(res, r);
    }
    if (!req.file) return jsonError(res, 400, 'archivo_requerido', 'Archivo requerido (campo "imagen")');

    const filename = path.basename(req.file.path);
    const { text, confidence } = await ocr.recognize(req.file.path);
    const parsed = parseDPI(text);

    let warning = null;
    if (confidence < 30) {
      warning = 'La foto no se ve clara. Intente con mejor luz o sin reflejos.';
    } else if (confidence < 50 || !parsed.dpi) {
      warning = 'Verifique que los datos extraídos estén correctos.';
    }

    res.json({
      confidence,
      dpi: parsed.dpi,
      nombre: parsed.nombre,
      fecha_nac: parsed.fecha_nac,
      lugar_nac: parsed.lugar_nac,
      raw_text: text,
      dpi_scan_path: filename,
      warning,
    });
  } catch (err) {
    next(err);
  }
});

// POST /solicitud/:token/recibo — sube recibo de servicios, OCR para dirección.
publicRouter.post('/solicitud/:token/recibo', upload.single('imagen'), async (req, res, next) => {
  try {
    const r = resolverToken(req.params.token);
    if (r.status !== 'ok') {
      if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
      return manejarErrorToken(res, r);
    }
    if (!req.file) return jsonError(res, 400, 'archivo_requerido', 'Archivo requerido (campo "imagen")');

    const filename = path.basename(req.file.path);
    const { text, confidence } = await ocr.recognize(req.file.path);
    const parsed = parseRecibo(text);

    let warning = null;
    if (confidence < 30) {
      warning = 'La foto no se ve clara. Intente con mejor luz o sin reflejos.';
    } else if (confidence < 50 || !parsed.direccion) {
      warning = 'Verifique que la dirección extraída esté correcta.';
    }

    res.json({
      confidence,
      domicilio: parsed.direccion,
      comprobante: parsed.comprobante,
      raw_text: text,
      recibo_path: filename,
      warning,
    });
  } catch (err) {
    next(err);
  }
});

// POST /solicitud/:token/confirmar — marca token usado, contrato → revision_tenant.
publicRouter.post('/solicitud/:token/confirmar', (req, res, next) => {
  try {
    const r = resolverToken(req.params.token);
    if (r.status !== 'ok') return manejarErrorToken(res, r);

    // Guarda último estado del borrador si viene en el body.
    const datos = req.body || {};
    const serializado = JSON.stringify(datos);
    if (serializado.length > 200 * 1024) {
      return jsonError(res, 413, 'datos_demasiado_grandes', 'Datos exceden el tamaño máximo permitido');
    }

    const tx = db.transaction(() => {
      db.prepare('UPDATE contratos SET datos_borrador = ?, estado = ? WHERE id = ?')
        .run(serializado, 'revision_tenant', r.contrato.id);
      db.prepare('UPDATE contratos_tokens SET usado = 1 WHERE id = ?').run(r.token_row.id);
    });
    tx();

    auditAnonimo('cliente_confirmo_solicitud', 'contrato', r.contrato.id, {
      token_id: r.token_row.id,
    }, {
      institucion_id: r.contrato.institucion_id,
      ip: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json({
      ok: true,
      contrato_id: r.contrato.id,
      no_contrato: r.contrato.no_contrato,
      estado: 'revision_tenant',
      institucion_nombre: r.institucion.nombre,
    });
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// Sprint garantías-desacopladas CP3 — Endpoints públicos del portal
// cliente (C6) para gestionar comparecientes y garantías propias.
//
// Cap estricto: máximo 1 compareciente y máximo 1 garantía aportada
// por el cliente desde el portal público. Ambos opcionales.
//
// El cliente solo puede:
//   - Listar/crear/editar/quitar comparecientes (siempre con
//     agregado_por_actor='cliente').
//   - Ver las garantías que el banco/bufete ingresó (read-only de
//     todas las garantías del contrato).
//   - Crear/editar/quitar 1 garantía propia con aportante_tipo='cliente'
//     apuntando al cliente del contrato.
// ──────────────────────────────────────────────────────────────

const MAX_COMPS_CLIENTE = 1;
const MAX_GARS_CLIENTE = 1;

function publicSafeDecrypt(v) {
  if (v === null || v === undefined || v === '') return null;
  try { return decrypt(v); } catch { return null; }
}

function publicDescifrarCompareciente(row) {
  if (!row) return null;
  const { nombre_hash, dpi_hash, ...rest } = row;
  return {
    ...rest,
    nombre: publicSafeDecrypt(row.nombre),
    dpi: publicSafeDecrypt(row.dpi),
    profesion: publicSafeDecrypt(row.profesion),
    estado_civil: publicSafeDecrypt(row.estado_civil),
    domicilio: publicSafeDecrypt(row.domicilio),
  };
}

function publicDescifrarGarantia(row) {
  if (!row) return null;
  let datos = null;
  if (row.datos) {
    try { datos = JSON.parse(publicSafeDecrypt(row.datos)); } catch { datos = null; }
  }
  return { ...row, datos };
}

// Cuántos comparecientes/garantías agregó el cliente para este contrato.
function countAgregadosPorCliente(contratoId) {
  const comps = db.prepare(`
    SELECT COUNT(*) AS n FROM contrato_comparecientes
    WHERE contrato_id = ? AND agregado_por_actor = 'cliente'
  `).get(contratoId).n;
  // Las garantías no tienen "agregado_por_actor" propio; usamos como proxy
  // las garantías cuyo aportante es el cliente Y vinculadas al contrato Y
  // creadas por user NULL (heurística: el cliente público no tiene user_id).
  // En la práctica, sumamos cuántas garantías-aportadas-por-cliente hay
  // ligadas al contrato y la limitamos a 1 desde el portal.
  const cliId = db.prepare('SELECT id FROM clientes WHERE institucion_id = (SELECT institucion_id FROM contratos WHERE id = ?) LIMIT 1').get(contratoId)?.id;
  const gars = db.prepare(`
    SELECT COUNT(*) AS n FROM contrato_garantias cg
    JOIN garantias g ON g.id = cg.garantia_id
    WHERE cg.contrato_id = ? AND g.aportante_tipo = 'cliente'
  `).get(contratoId).n;
  return { comps, gars };
}

// GET /api/public/contratos/:token/comparecientes
publicRouter.get('/contratos/:token/comparecientes', (req, res) => {
  const r = resolverToken(req.params.token);
  if (r.status !== 'ok') return manejarErrorToken(res, r);
  const rows = db.prepare(`
    SELECT cc.contrato_id, cc.compareciente_id, cc.rol, cc.orden, cc.agregado_por_actor,
           c.nombre, c.dpi, c.profesion, c.estado_civil, c.domicilio, c.institucion_id
    FROM contrato_comparecientes cc
    JOIN comparecientes c ON c.id = cc.compareciente_id
    WHERE cc.contrato_id = ?
    ORDER BY cc.orden
  `).all(r.contrato.id);
  res.json(rows.map(publicDescifrarCompareciente));
});

// POST /api/public/contratos/:token/comparecientes
// Body: { nombre, dpi, profesion?, estado_civil?, domicilio?, rol }
publicRouter.post('/contratos/:token/comparecientes', (req, res, next) => {
  try {
    const r = resolverToken(req.params.token);
    if (r.status !== 'ok') return manejarErrorToken(res, r);

    const { comps } = countAgregadosPorCliente(r.contrato.id);
    if (comps >= MAX_COMPS_CLIENTE) {
      return jsonError(res, 409, 'cap_excedido', `Máximo ${MAX_COMPS_CLIENTE} compareciente desde el portal`);
    }

    const { nombre, dpi, profesion, estado_civil, domicilio, fecha_nac, genero, rol } = req.body || {};
    if (!nombre || !dpi) return jsonError(res, 400, 'campos_requeridos', 'nombre y dpi requeridos');
    if (!['fiador', 'tercero_garante'].includes(rol)) {
      return jsonError(res, 400, 'rol_invalido', "rol IN ('fiador','tercero_garante')");
    }

    const instId = r.contrato.institucion_id;
    const dpiH = hashFor('dpi', dpi);

    // Idempotente: si ya hay un compareciente con ese DPI en la institución, lo reuso.
    let comp = db.prepare(
      'SELECT id FROM comparecientes WHERE institucion_id = ? AND dpi_hash = ?'
    ).get(instId, dpiH);
    let compId;
    if (comp) {
      compId = comp.id;
    } else {
      const info = db.prepare(`
        INSERT INTO comparecientes (
          institucion_id, nombre, nombre_hash, dpi, dpi_hash,
          profesion, estado_civil, domicilio, fecha_nac, genero, creado_por_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(
        instId,
        encrypt(nombre), hashFor('nombre', nombre),
        encrypt(dpi), dpiH,
        profesion ? encrypt(profesion) : null,
        estado_civil ? encrypt(estado_civil) : null,
        domicilio ? encrypt(domicilio) : null,
        fecha_nac || null,
        genero || null,
      );
      compId = info.lastInsertRowid;
    }

    // Vincular al contrato si no estaba.
    const ya = db.prepare(
      'SELECT 1 FROM contrato_comparecientes WHERE contrato_id = ? AND compareciente_id = ?'
    ).get(r.contrato.id, compId);
    if (ya) return jsonError(res, 409, 'ya_vinculado', 'Compareciente ya vinculado al contrato');

    const orden = (db.prepare('SELECT COALESCE(MAX(orden), 0) AS m FROM contrato_comparecientes WHERE contrato_id = ?').get(r.contrato.id).m) + 1;
    db.prepare(`
      INSERT INTO contrato_comparecientes
      (contrato_id, compareciente_id, rol, orden, agregado_por_actor, agregado_por_user_id)
      VALUES (?, ?, ?, ?, 'cliente', NULL)
    `).run(r.contrato.id, compId, rol, orden);

    auditAnonimo('COMPARECIENTE_AGREGADO', 'contrato', r.contrato.id, {
      compareciente_id: compId, rol, orden, actor: 'cliente', via: 'portal_publico',
    }, {
      institucion_id: instId,
      ip: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.status(201).json({ contrato_id: r.contrato.id, compareciente_id: compId, rol, orden });
  } catch (err) { next(err); }
});

// DELETE /api/public/contratos/:token/comparecientes/:compId
publicRouter.delete('/contratos/:token/comparecientes/:compId', (req, res, next) => {
  try {
    const r = resolverToken(req.params.token);
    if (r.status !== 'ok') return manejarErrorToken(res, r);
    const compId = parseInt(req.params.compId, 10);

    // Solo puede borrar si el vínculo lo agregó el cliente.
    const link = db.prepare(
      "SELECT * FROM contrato_comparecientes WHERE contrato_id = ? AND compareciente_id = ? AND agregado_por_actor = 'cliente'"
    ).get(r.contrato.id, compId);
    if (!link) return jsonError(res, 404, 'no_encontrado', 'Vínculo no encontrado o no fue agregado por el cliente');

    // ¿Lo apunta una garantía como aportante?
    const usada = db.prepare(`
      SELECT g.id FROM contrato_garantias cg
      JOIN garantias g ON g.id = cg.garantia_id
      WHERE cg.contrato_id = ? AND g.aportante_tipo = 'compareciente' AND g.aportante_compareciente_id = ?
      LIMIT 1
    `).get(r.contrato.id, compId);
    if (usada) return jsonError(res, 409, 'compareciente_en_uso', 'Está siendo usado como aportante en una garantía');

    db.prepare(
      'DELETE FROM contrato_comparecientes WHERE contrato_id = ? AND compareciente_id = ?'
    ).run(r.contrato.id, compId);

    auditAnonimo('COMPARECIENTE_QUITADO', 'contrato', r.contrato.id, {
      compareciente_id: compId, via: 'portal_publico',
    }, {
      institucion_id: r.contrato.institucion_id,
      ip: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/public/contratos/:token/garantias — read-only de TODAS las garantías del contrato.
publicRouter.get('/contratos/:token/garantias', (req, res) => {
  const r = resolverToken(req.params.token);
  if (r.status !== 'ok') return manejarErrorToken(res, r);
  const rows = db.prepare(`
    SELECT g.* , cg.orden, cg.congelado_en
    FROM contrato_garantias cg
    JOIN garantias g ON g.id = cg.garantia_id
    WHERE cg.contrato_id = ?
    ORDER BY cg.orden
  `).all(r.contrato.id);
  res.json(rows.map(publicDescifrarGarantia));
});

// POST /api/public/contratos/:token/garantias  { tipo, datos } — solo aportante=cliente.
publicRouter.post('/contratos/:token/garantias', (req, res, next) => {
  try {
    const r = resolverToken(req.params.token);
    if (r.status !== 'ok') return manejarErrorToken(res, r);

    const { gars } = countAgregadosPorCliente(r.contrato.id);
    if (gars >= MAX_GARS_CLIENTE) {
      return jsonError(res, 409, 'cap_excedido', `Máximo ${MAX_GARS_CLIENTE} garantía aportada por el cliente desde el portal`);
    }

    const { tipo, datos } = req.body || {};
    if (!['hipotecaria', 'prendaria'].includes(tipo)) {
      return jsonError(res, 400, 'tipo_invalido', "tipo IN ('hipotecaria','prendaria') desde portal");
    }
    if (!datos || typeof datos !== 'object') {
      return jsonError(res, 400, 'datos_requeridos', 'datos (objeto) requerido');
    }

    // Aportante = cliente del contrato. Buscamos un cliente del contrato (por
    // datos_cliente.dpi_hash). Si no hay match exacto, devolvemos error claro:
    // el portal espera que el banco haya creado el cliente antes.
    const datosCli = (() => {
      try { return JSON.parse(decrypt(r.contrato.datos_cliente || '')); } catch { return null; }
    })();
    if (!datosCli?.dpi) return jsonError(res, 409, 'cliente_no_existe', 'No se puede asociar aportante: el contrato no tiene cliente identificado');
    const cliente = db.prepare(
      'SELECT id FROM clientes WHERE institucion_id = ? AND dpi_hash = ?'
    ).get(r.contrato.institucion_id, hashFor('dpi', datosCli.dpi));
    if (!cliente) return jsonError(res, 409, 'cliente_no_existe', 'Cliente del contrato no encontrado en catálogo');

    const garInfo = db.prepare(`
      INSERT INTO garantias (
        institucion_id, tipo, solidaria, datos, aportante_tipo, aportante_cliente_id, creado_por_user_id
      ) VALUES (?, ?, 0, ?, 'cliente', ?, NULL)
    `).run(r.contrato.institucion_id, tipo, encrypt(JSON.stringify(datos)), cliente.id);
    const garId = garInfo.lastInsertRowid;

    const orden = (db.prepare('SELECT COALESCE(MAX(orden), 0) AS m FROM contrato_garantias WHERE contrato_id = ?').get(r.contrato.id).m) + 1;
    db.prepare('INSERT INTO contrato_garantias (contrato_id, garantia_id, orden) VALUES (?, ?, ?)')
      .run(r.contrato.id, garId, orden);

    auditAnonimo('GARANTIA_AGREGADA', 'contrato', r.contrato.id, {
      garantia_id: garId, tipo, orden, actor: 'cliente', via: 'portal_publico',
    }, {
      institucion_id: r.contrato.institucion_id,
      ip: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.status(201).json({ contrato_id: r.contrato.id, garantia_id: garId, tipo, orden });
  } catch (err) { next(err); }
});

// DELETE /api/public/contratos/:token/garantias/:garantiaId — solo si la creó el cliente.
publicRouter.delete('/contratos/:token/garantias/:garantiaId', (req, res, next) => {
  try {
    const r = resolverToken(req.params.token);
    if (r.status !== 'ok') return manejarErrorToken(res, r);
    const garantiaId = parseInt(req.params.garantiaId, 10);
    const gar = db.prepare('SELECT * FROM garantias WHERE id = ?').get(garantiaId);
    if (!gar) return jsonError(res, 404, 'no_encontrado', 'Garantía no encontrada');
    // Heurística: solo el cliente puede borrar garantías que creó el cliente (creado_por_user_id NULL + aportante cliente).
    if (gar.creado_por_user_id !== null || gar.aportante_tipo !== 'cliente') {
      return jsonError(res, 403, 'no_autorizado', 'Esta garantía no fue agregada por el cliente; solicítele al banco que la modifique');
    }
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM contrato_garantias WHERE contrato_id = ? AND garantia_id = ?').run(r.contrato.id, garantiaId);
      db.prepare('DELETE FROM garantias WHERE id = ?').run(garantiaId);
    });
    tx();

    auditAnonimo('GARANTIA_QUITADA', 'contrato', r.contrato.id, {
      garantia_id: garantiaId, via: 'portal_publico',
    }, {
      institucion_id: r.contrato.institucion_id,
      ip: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { authRouter, publicRouter };
