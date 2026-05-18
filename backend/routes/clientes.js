const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { UPLOADS_PATH } = require('../config');

const router = express.Router();

function scopeWhere(req, alias = 'c') {
  if (req.user.institucion_id) return { sql: ` AND ${alias}.institucion_id = ?`, params: [req.user.institucion_id] };
  return { sql: '', params: [] };
}

router.get('/', (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const estado = req.query.estado;
    const institucion_id = req.query.institucion_id ? parseInt(req.query.institucion_id, 10) : null;
    let sql = 'SELECT * FROM clientes WHERE 1=1';
    const params = [];
    if (req.user.institucion_id) {
      sql += ' AND institucion_id = ?';
      params.push(req.user.institucion_id);
    } else if (institucion_id) {
      sql += ' AND institucion_id = ?';
      params.push(institucion_id);
    }
    if (estado === 'pendiente' || estado === 'activo' || estado === 'inactivo') {
      sql += ' AND estado = ?';
      params.push(estado);
    } else if (!estado) {
      sql += " AND estado != 'inactivo'";
    }
    if (q) {
      sql += ' AND (nombre LIKE ? OR dpi LIKE ? OR nit LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    res.json(db.prepare(sql).all(...params));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Cliente no encontrado', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== row.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso', code: 403 });
    }
    const allowed = ['nombre','dpi','nit','estado_civil','profesion','domicilio','telefono','email','ingresos','empleo','estado','fecha_nac','lugar_nac','dpi_scan_path','recibo_path','genero','conyuge_nombre','conyuge_dpi','ingresos_rango'];
    const updates = [];
    const params = [];
    for (const k of allowed) {
      if (req.body && req.body[k] !== undefined) {
        updates.push(`${k} = ?`);
        params.push(k === 'ingresos' && req.body[k] !== null && req.body[k] !== '' ? Number(req.body[k]) : req.body[k]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No hay campos para actualizar', code: 400 });
    params.push(row.id);
    db.prepare(`UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(row.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Cliente no encontrado', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== row.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso', code: 403 });
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const b = req.body || {};
    const institucion_id = req.user.institucion_id || b.institucion_id;
    if (!institucion_id) return res.status(400).json({ error: 'institucion_id requerido', code: 400 });
    if (req.user.institucion_id && req.user.institucion_id !== institucion_id) {
      return res.status(403).json({ error: 'Sin acceso a esa institución', code: 403 });
    }
    if (!b.nombre) return res.status(400).json({ error: 'nombre requerido', code: 400 });

    const info = db
      .prepare(
        `INSERT INTO clientes
         (institucion_id, nombre, dpi, dpi_scan_path, fecha_nac, lugar_nac, profesion, estado_civil, nit,
          telefono, email, domicilio, recibo_path, ingresos, empleo,
          genero, conyuge_nombre, conyuge_dpi, ingresos_rango, estado)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        institucion_id,
        b.nombre,
        b.dpi || null,
        b.dpi_scan_path || null,
        b.fecha_nac || null,
        b.lugar_nac || null,
        b.profesion || null,
        b.estado_civil || null,
        b.nit || null,
        b.telefono || null,
        b.email || null,
        b.domicilio || null,
        b.recibo_path || null,
        b.ingresos != null && b.ingresos !== '' ? Number(b.ingresos) : null,
        b.empleo || null,
        b.genero || null,
        b.conyuge_nombre || null,
        b.conyuge_dpi || null,
        b.ingresos_rango || null,
        b.estado || 'activo'
      );
    res.status(201).json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'Ya existe un cliente con ese DPI', code: 409 });
    next(err);
  }
});

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

const FAKE_DPI = [
  { nombre: 'Juan Carlos Pérez García', dpi: '2845 73901 0801', fecha_nac: '1985-06-12', lugar_nac: 'Guatemala, Guatemala', genero: 'Masculino' },
  { nombre: 'María Fernanda López Soto', dpi: '5678 12345 0102', fecha_nac: '1990-11-22', lugar_nac: 'Quetzaltenango, Quetzaltenango', genero: 'Femenino' },
  { nombre: 'José Antonio Méndez Ramírez', dpi: '8765 43210 0103', fecha_nac: '1978-07-04', lugar_nac: 'Antigua Guatemala, Sacatepéquez', genero: 'Masculino' },
];

const FAKE_DOMICILIO = [
  { domicilio: '5a. Calle 3-40, Zona 10, Santa Catarina Pinula, Guatemala', comprobante: 'Energuate · Marzo 2026' },
  { domicilio: '12 avenida 3-21 zona 1, Quetzaltenango', comprobante: 'EEGSA · Febrero 2026' },
  { domicilio: 'Lote 42, Colonia Vista Hermosa, Mixco', comprobante: 'Tigo Hogar · Marzo 2026' },
];

router.post('/scan-dpi', upload.single('imagen'), (req, res, next) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: 'Archivo requerido (campo "imagen")', code: 400 });
    const pick = FAKE_DPI[Math.floor(Math.random() * FAKE_DPI.length)];
    res.json({ ...pick, dpi_scan_path: path.basename(req.file.path) });
  } catch (err) {
    next(err);
  }
});

router.post('/scan-recibo', upload.single('imagen'), (req, res, next) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: 'Archivo requerido (campo "imagen")', code: 400 });
    const pick = FAKE_DOMICILIO[Math.floor(Math.random() * FAKE_DOMICILIO.length)];
    res.json({ ...pick, recibo_path: path.basename(req.file.path) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
