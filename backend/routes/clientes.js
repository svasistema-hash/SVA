const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { UPLOADS_PATH } = require('../config');
const { encrypt, decrypt, hashFor } = require('../encryption');
const { normalizeMoney } = require('../utils/money');

const router = express.Router();

// ──────────────────────────────────────────────────────────────
// Helpers de encriptación
// ──────────────────────────────────────────────────────────────

function safeDecrypt(value, fieldName, rowId) {
  if (value === null || value === undefined) return null;
  try {
    return decrypt(value);
  } catch (e) {
    console.error(`[decrypt failed] table=clientes field=${fieldName} id=${rowId}: ${e.message}`);
    return null;
  }
}

// Convierte fila cruda de DB → objeto API (descifra columnas sensibles, oculta hashes).
function clienteFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    institucion_id: row.institucion_id,
    tipo_persona: row.tipo_persona || 'individual',
    nombre: row.nombre,
    dpi: safeDecrypt(row.dpi, 'dpi', row.id),
    dpi_scan_path: row.dpi_scan_path,
    fecha_nac: row.fecha_nac,
    lugar_nac: row.lugar_nac,
    profesion: row.profesion,
    estado_civil: row.estado_civil,
    nit: safeDecrypt(row.nit, 'nit', row.id),
    telefono: row.telefono,
    email: row.email,
    domicilio: safeDecrypt(row.domicilio, 'domicilio', row.id),
    recibo_path: row.recibo_path,
    ingresos: safeDecrypt(row.ingresos, 'ingresos', row.id), // string canónico "18500.00"
    empleo: row.empleo,
    created_at: row.created_at,
    estado: row.estado,
    autorizaciones: row.autorizaciones,
    genero: row.genero,
    conyuge_nombre: row.conyuge_nombre,
    conyuge_dpi: safeDecrypt(row.conyuge_dpi, 'conyuge_dpi', row.id),
    ingresos_rango: row.ingresos_rango,
    // Campos extra que vienen del LEFT JOIN con clientes_juridicos (NULL para individuales)
    tipo_sociedad: row.tipo_sociedad || null,
    nombre_comercial: row.nombre_comercial || null,
    // NUNCA retornar: dpi_hash, nit_hash, conyuge_dpi_hash
  };
}

// ──────────────────────────────────────────────────────────────
// GET /api/clientes — listar (con búsqueda por nombre, dpi o nit)
// ──────────────────────────────────────────────────────────────

router.get('/', (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const dpiQuery = (req.query.dpi || '').trim();
    const nitQuery = (req.query.nit || '').trim();
    const estado = req.query.estado;
    const tipoPersona = req.query.tipo_persona;
    const institucion_id = req.query.institucion_id ? parseInt(req.query.institucion_id, 10) : null;

    // LEFT JOIN con clientes_juridicos para exponer tipo_sociedad / nombre_comercial
    // y para que la búsqueda por DPI también capture representantes legales jurídicos.
    let sql = `
      SELECT c.*, cj.tipo_sociedad, cj.nombre_comercial
      FROM clientes c
      LEFT JOIN clientes_juridicos cj ON cj.cliente_id = c.id
      WHERE 1=1
    `;
    const params = [];
    if (req.user.institucion_id) {
      sql += ' AND c.institucion_id = ?';
      params.push(req.user.institucion_id);
    } else if (institucion_id) {
      sql += ' AND c.institucion_id = ?';
      params.push(institucion_id);
    }
    if (estado === 'pendiente' || estado === 'activo' || estado === 'inactivo') {
      sql += ' AND c.estado = ?';
      params.push(estado);
    } else if (!estado) {
      sql += " AND c.estado != 'inactivo'";
    }
    if (tipoPersona === 'individual' || tipoPersona === 'juridica') {
      sql += ' AND c.tipo_persona = ?';
      params.push(tipoPersona);
    }
    // Búsqueda por nombre (plaintext, LIKE en clientes.nombre o juridico.nombre_comercial)
    if (q) {
      sql += ' AND (c.nombre LIKE ? OR cj.nombre_comercial LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    // DPI: matchea cliente individual (c.dpi_hash) o representante legal jurídico (cj.rep_dpi_hash).
    if (dpiQuery) {
      const h = hashFor('dpi', dpiQuery);
      if (h) {
        sql += ' AND (c.dpi_hash = ? OR cj.rep_dpi_hash = ?)';
        params.push(h, h);
      }
    }
    // NIT: busca en clientes.nit_hash (tanto individuales como jurídicos lo poblan).
    if (nitQuery) {
      const h = hashFor('nit', nitQuery);
      if (h) {
        sql += ' AND c.nit_hash = ?';
        params.push(h);
      }
    }
    sql += ' ORDER BY c.created_at DESC LIMIT 100';
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map(clienteFromRow));
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// PUT /api/clientes/:id — actualizar
// ──────────────────────────────────────────────────────────────

router.put('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Cliente no encontrado', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== row.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso', code: 403 });
    }

    const b = req.body || {};
    const updates = [];
    const params = [];

    // Campos sensibles (encrypt + hash o solo encrypt)
    if (b.dpi !== undefined) {
      updates.push('dpi = ?', 'dpi_hash = ?');
      params.push(encrypt(b.dpi), hashFor('dpi', b.dpi));
    }
    if (b.nit !== undefined) {
      updates.push('nit = ?', 'nit_hash = ?');
      params.push(encrypt(b.nit), hashFor('nit', b.nit));
    }
    if (b.conyuge_dpi !== undefined) {
      updates.push('conyuge_dpi = ?', 'conyuge_dpi_hash = ?');
      params.push(encrypt(b.conyuge_dpi), hashFor('dpi', b.conyuge_dpi));
    }
    if (b.domicilio !== undefined) {
      updates.push('domicilio = ?');
      params.push(encrypt(b.domicilio));
    }
    if (b.ingresos !== undefined) {
      const norm = normalizeMoney(b.ingresos);
      updates.push('ingresos = ?');
      params.push(encrypt(norm));
    }

    // Campos no sensibles (plaintext directo)
    const plain = ['nombre', 'estado_civil', 'profesion', 'telefono', 'email', 'empleo',
                   'estado', 'fecha_nac', 'lugar_nac', 'dpi_scan_path', 'recibo_path',
                   'genero', 'conyuge_nombre', 'ingresos_rango'];
    for (const k of plain) {
      if (b[k] !== undefined) {
        updates.push(`${k} = ?`);
        params.push(b[k]);
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'No hay campos para actualizar', code: 400 });
    params.push(row.id);
    db.prepare(`UPDATE clientes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    const updated = db.prepare('SELECT * FROM clientes WHERE id = ?').get(row.id);
    res.json(clienteFromRow(updated));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'Ya existe un cliente con ese DPI en esta institución', code: 409 });
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/clientes/:id — leer uno
// ──────────────────────────────────────────────────────────────

router.get('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Cliente no encontrado', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== row.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso', code: 403 });
    }
    res.json(clienteFromRow(row));
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/clientes — crear
// ──────────────────────────────────────────────────────────────

router.post('/', (req, res, next) => {
  try {
    const b = req.body || {};
    const institucion_id = req.user.institucion_id || b.institucion_id;
    if (!institucion_id) return res.status(400).json({ error: 'institucion_id requerido', code: 400 });
    if (req.user.institucion_id && req.user.institucion_id !== institucion_id) {
      return res.status(403).json({ error: 'Sin acceso a esa institución', code: 403 });
    }
    if (!b.nombre) return res.status(400).json({ error: 'nombre requerido', code: 400 });

    const dpiEnc = encrypt(b.dpi);
    const dpiH = hashFor('dpi', b.dpi);
    const nitEnc = encrypt(b.nit);
    const nitH = hashFor('nit', b.nit);
    const conyDpiEnc = encrypt(b.conyuge_dpi);
    const conyDpiH = hashFor('dpi', b.conyuge_dpi);
    const domicilioEnc = encrypt(b.domicilio);
    const ingresosEnc = encrypt(normalizeMoney(b.ingresos));

    const info = db.prepare(
      `INSERT INTO clientes
       (institucion_id, nombre, dpi, dpi_hash, dpi_scan_path, fecha_nac, lugar_nac,
        profesion, estado_civil, nit, nit_hash, telefono, email, domicilio, recibo_path,
        ingresos, empleo, genero, conyuge_nombre, conyuge_dpi, conyuge_dpi_hash,
        ingresos_rango, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      institucion_id,
      b.nombre,
      dpiEnc, dpiH,
      b.dpi_scan_path || null,
      b.fecha_nac || null,
      b.lugar_nac || null,
      b.profesion || null,
      b.estado_civil || null,
      nitEnc, nitH,
      b.telefono || null,
      b.email || null,
      domicilioEnc,
      b.recibo_path || null,
      ingresosEnc,
      b.empleo || null,
      b.genero || null,
      b.conyuge_nombre || null,
      conyDpiEnc, conyDpiH,
      b.ingresos_rango || null,
      b.estado || 'activo'
    );
    const created = db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(clienteFromRow(created));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'Ya existe un cliente con ese DPI en esta institución', code: 409 });
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// Uploads (scan-dpi / scan-recibo) — FAKE OCR, sin cambios estructurales.
// La imagen sube real con nombre UUID; los datos retornados son ficticios.
// ──────────────────────────────────────────────────────────────

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
