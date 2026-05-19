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

module.exports = { authRouter, publicRouter };
