const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authenticate } = require('../middleware/auth');
const { encrypt, hashFor } = require('../encryption');
const { normalizeMoney } = require('../utils/money');

const authRouter = express.Router();
const publicRouter = express.Router();

const FAKE_DPI = [
  { nombre: 'Juan Carlos Pérez García', dpi: '1234 56789 0101', fecha_nac: '1985-03-15', lugar_nac: 'Guatemala' },
  { nombre: 'María Fernanda López Soto', dpi: '5678 12345 0102', fecha_nac: '1990-11-22', lugar_nac: 'Quetzaltenango' },
  { nombre: 'José Antonio Méndez Ramírez', dpi: '8765 43210 0103', fecha_nac: '1978-07-04', lugar_nac: 'Antigua Guatemala' },
];
const FAKE_DOMICILIO = [
  '5a calle 4-50 zona 10, Ciudad de Guatemala',
  '12 avenida 3-21 zona 1, Quetzaltenango',
  'Lote 42, Colonia Vista Hermosa, Mixco',
];

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

publicRouter.get('/solicitud/:slug', (req, res, next) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'token requerido', code: 400 });
    const inst = db.prepare('SELECT id, slug, nombre, tipo FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    const t = db.prepare('SELECT * FROM solicitudes_tokens WHERE token = ? AND institucion_id = ?').get(token, inst.id);
    if (!t) return res.status(404).json({ error: 'Token inválido', code: 404 });
    if (t.usado) return res.status(410).json({ error: 'Token ya utilizado', code: 410 });
    if (new Date(t.expires_at).getTime() < Date.now())
      return res.status(410).json({ error: 'Token expirado', code: 410 });
    res.json({ institucion: inst, expires_at: t.expires_at });
  } catch (err) {
    next(err);
  }
});

publicRouter.post('/solicitud/:slug', (req, res, next) => {
  try {
    const token = req.query.token || req.body?.token;
    if (!token) return res.status(400).json({ error: 'token requerido', code: 400 });
    const inst = db.prepare('SELECT id FROM instituciones WHERE slug = ?').get(req.params.slug);
    if (!inst) return res.status(404).json({ error: 'Institución no encontrada', code: 404 });
    const t = db.prepare('SELECT * FROM solicitudes_tokens WHERE token = ? AND institucion_id = ?').get(token, inst.id);
    if (!t) return res.status(404).json({ error: 'Token inválido', code: 404 });
    if (t.usado) return res.status(410).json({ error: 'Token ya utilizado', code: 410 });
    if (new Date(t.expires_at).getTime() < Date.now())
      return res.status(410).json({ error: 'Token expirado', code: 410 });

    const b = req.body || {};
    if (!b.nombre || !b.dpi) return res.status(400).json({ error: 'Nombre y DPI requeridos', code: 400 });

    const autorizaciones = JSON.stringify({
      datos_veridicos: !!b.confirmaDatos,
      verificacion_referencias: !!b.autorizaReferencias,
      timestamp: new Date().toISOString(),
    });

    const tx = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO clientes
           (institucion_id, nombre, dpi, dpi_hash, dpi_scan_path, fecha_nac, lugar_nac,
            profesion, estado_civil, nit, nit_hash, telefono, email, domicilio, recibo_path,
            ingresos, empleo, estado, autorizaciones)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pendiente', ?)`
        )
        .run(
          inst.id,
          b.nombre,
          encrypt(b.dpi), hashFor('dpi', b.dpi),
          b.dpi_scan_path || null,
          b.fecha_nac || null, b.lugar_nac || null,
          b.profesion || null, b.estado_civil || null,
          encrypt(b.nit), hashFor('nit', b.nit),
          b.telefono || null, b.email || null,
          encrypt(b.domicilio),
          b.recibo_path || null,
          encrypt(normalizeMoney(b.ingresos)),
          b.empleo || null,
          autorizaciones
        );
      db.prepare('UPDATE solicitudes_tokens SET usado = 1, cliente_id = ? WHERE id = ?').run(info.lastInsertRowid, t.id);
      return info.lastInsertRowid;
    });

    const clienteId = tx();
    res.status(201).json({
      ok: true,
      cliente_id: clienteId,
      solicitud_no: `S-${String(clienteId).padStart(5, '0')}`,
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'Ya existe un cliente con ese DPI en esta institución', code: 409 });
    next(err);
  }
});

publicRouter.post('/scan-dpi', (req, res) => {
  const pick = FAKE_DPI[Math.floor(Math.random() * FAKE_DPI.length)];
  res.json({ ...pick, dpi_scan_path: null });
});

publicRouter.post('/scan-recibo', (req, res) => {
  const domicilio = FAKE_DOMICILIO[Math.floor(Math.random() * FAKE_DOMICILIO.length)];
  res.json({ domicilio, recibo_path: null });
});

module.exports = { authRouter, publicRouter };
