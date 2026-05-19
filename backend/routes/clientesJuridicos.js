const express = require('express');
const db = require('../db');
const { encrypt, decrypt, hashFor } = require('../encryption');
const { normalizeMoney } = require('../utils/money');
const { clienteJuridicoSchema } = require('../schemas/clienteJuridico');

const router = express.Router();

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function safeDecrypt(value, field, id) {
  if (value === null || value === undefined) return null;
  try {
    return decrypt(value);
  } catch (e) {
    console.error(`[decrypt failed] clientes_juridicos.${field} cliente_id=${id}: ${e.message}`);
    return null;
  }
}

// Convierte JOIN row → objeto API. Descifra todo lo sensible, oculta hashes.
function clienteJuridicoFromRow(row) {
  if (!row) return null;
  const repVig = row.rep_vigencia_vencimiento ? new Date(row.rep_vigencia_vencimiento) : null;
  return {
    // Base (de clientes)
    id: row.id,
    institucion_id: row.institucion_id,
    tipo_persona: row.tipo_persona,
    nombre: row.nombre, // razón social, plaintext
    nit: safeDecrypt(row.nit, 'nit', row.id),
    domicilio: safeDecrypt(row.domicilio, 'domicilio', row.id),
    telefono: row.telefono,
    email: row.email,
    estado: row.estado,
    created_at: row.created_at,

    // Identificación jurídica
    nombre_comercial: row.nombre_comercial,
    tipo_sociedad: row.tipo_sociedad,
    tipo_sociedad_otra: row.tipo_sociedad_otra,
    objeto_social: row.objeto_social,

    // Constitución
    escritura_numero: row.escritura_numero,
    escritura_fecha: row.escritura_fecha,
    escritura_notario: row.escritura_notario,

    registro_mercantil_numero: row.registro_mercantil_numero,
    registro_mercantil_folio: row.registro_mercantil_folio,
    registro_mercantil_libro: row.registro_mercantil_libro,
    registro_mercantil_fecha: row.registro_mercantil_fecha,

    patente_sociedad_numero: row.patente_sociedad_numero,
    patente_sociedad_fecha: row.patente_sociedad_fecha,
    patente_empresa_numero: row.patente_empresa_numero,
    patente_empresa_fecha: row.patente_empresa_fecha,

    // Capital (descifrado, formato canónico "5000000.00")
    capital_autorizado: safeDecrypt(row.capital_autorizado, 'capital_autorizado', row.id),
    capital_suscrito: safeDecrypt(row.capital_suscrito, 'capital_suscrito', row.id),
    capital_pagado: safeDecrypt(row.capital_pagado, 'capital_pagado', row.id),

    // Fiscal
    regimen_tributario: row.regimen_tributario,
    actividad_economica: row.actividad_economica,
    fecha_inicio_actividades: row.fecha_inicio_actividades,

    // Representante (con rep_dpi descifrado; rep_dpi_hash NO se expone)
    rep_nombre_completo: row.rep_nombre_completo,
    rep_dpi: safeDecrypt(row.rep_dpi, 'rep_dpi', row.id),
    rep_profesion: row.rep_profesion,
    rep_cargo: row.rep_cargo,
    rep_acta_numero: row.rep_acta_numero,
    rep_acta_fecha: row.rep_acta_fecha,
    rep_acta_notario: row.rep_acta_notario,
    rep_inscripcion_numero: row.rep_inscripcion_numero,
    rep_inscripcion_folio: row.rep_inscripcion_folio,
    rep_inscripcion_libro: row.rep_inscripcion_libro,
    rep_vigencia_inicio: row.rep_vigencia_inicio,
    rep_vigencia_vencimiento: row.rep_vigencia_vencimiento,
    rep_vigente: repVig ? repVig > new Date() : false,

    updated_at: row.updated_at,
  };
}

// SQL base para JOIN clientes ⋈ clientes_juridicos.
const BASE_SELECT = `
  SELECT
    c.id, c.institucion_id, c.nombre, c.nit, c.domicilio, c.telefono, c.email,
    c.estado, c.created_at, c.tipo_persona,
    cj.nombre_comercial, cj.tipo_sociedad, cj.tipo_sociedad_otra, cj.objeto_social,
    cj.escritura_numero, cj.escritura_fecha, cj.escritura_notario,
    cj.registro_mercantil_numero, cj.registro_mercantil_folio,
    cj.registro_mercantil_libro, cj.registro_mercantil_fecha,
    cj.patente_sociedad_numero, cj.patente_sociedad_fecha,
    cj.patente_empresa_numero, cj.patente_empresa_fecha,
    cj.capital_autorizado, cj.capital_suscrito, cj.capital_pagado,
    cj.regimen_tributario, cj.actividad_economica, cj.fecha_inicio_actividades,
    cj.rep_nombre_completo, cj.rep_dpi, cj.rep_profesion, cj.rep_cargo,
    cj.rep_acta_numero, cj.rep_acta_fecha, cj.rep_acta_notario,
    cj.rep_inscripcion_numero, cj.rep_inscripcion_folio, cj.rep_inscripcion_libro,
    cj.rep_vigencia_inicio, cj.rep_vigencia_vencimiento,
    cj.updated_at
  FROM clientes c
  INNER JOIN clientes_juridicos cj ON cj.cliente_id = c.id
`;

// ──────────────────────────────────────────────────────────────
// GET /api/clientes/juridicos — lista con filtros
// ──────────────────────────────────────────────────────────────

router.get('/', (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const tipoSociedad = (req.query.tipo_sociedad || '').trim();

    let sql = BASE_SELECT + ' WHERE c.estado != ?';
    const params = ['inactivo'];
    if (req.user.institucion_id) {
      sql += ' AND c.institucion_id = ?';
      params.push(req.user.institucion_id);
    }
    if (search) {
      // Heurística: si parece NIT, hash search; si parece DPI, hash search en rep_dpi;
      // si no, LIKE en nombre o nombre_comercial.
      const cleaned = search.replace(/[\s-]/g, '');
      const looksLikeDpi = /^\d{13}$/.test(cleaned);
      const looksLikeNit = /^\d+[\dKk]?$/.test(cleaned) && cleaned.length >= 4 && cleaned.length <= 12;
      if (looksLikeDpi) {
        sql += ' AND cj.rep_dpi_hash = ?';
        params.push(hashFor('dpi', search));
      } else if (looksLikeNit) {
        sql += ' AND c.nit_hash = ?';
        params.push(hashFor('nit', search));
      } else {
        sql += ' AND (c.nombre LIKE ? OR cj.nombre_comercial LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }
    }
    if (tipoSociedad) {
      sql += ' AND cj.tipo_sociedad = ?';
      params.push(tipoSociedad);
    }
    sql += ' ORDER BY c.created_at DESC LIMIT 200';
    const rows = db.prepare(sql).all(...params);
    res.json(rows.map(clienteJuridicoFromRow));
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/clientes/juridicos/:id
// ──────────────────────────────────────────────────────────────

router.get('/:id', (req, res, next) => {
  try {
    const row = db.prepare(BASE_SELECT + ' WHERE c.id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Cliente jurídico no encontrado', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== row.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso', code: 403 });
    }
    res.json(clienteJuridicoFromRow(row));
  } catch (err) {
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/clientes/juridicos — crear
// ──────────────────────────────────────────────────────────────

router.post('/', (req, res, next) => {
  try {
    const parsed = clienteJuridicoSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validación fallida',
        code: 400,
        issues: parsed.error.issues.map((i) => ({ path: (i.path || []).join('.'), message: i.message })),
      });
    }
    const d = parsed.data;
    const institucion_id = req.user.institucion_id || req.body.institucion_id;
    if (!institucion_id) return res.status(400).json({ error: 'institucion_id requerido', code: 400 });
    if (req.user.institucion_id && req.user.institucion_id !== institucion_id) {
      return res.status(403).json({ error: 'Sin acceso a esa institución', code: 403 });
    }

    // Normalización y encriptación
    const capAut = encrypt(normalizeMoney(d.capital_autorizado));
    const capSus = encrypt(normalizeMoney(d.capital_suscrito));
    const capPag = encrypt(normalizeMoney(d.capital_pagado));
    const repDpiEnc = encrypt(d.rep_dpi);
    const repDpiHash = hashFor('dpi', d.rep_dpi);
    const nitEnc = encrypt(d.nit);
    const nitHash = hashFor('nit', d.nit);
    const domicilioEnc = encrypt(d.domicilio);

    const tx = db.transaction(() => {
      const info = db.prepare(
        `INSERT INTO clientes
         (institucion_id, nombre, nit, nit_hash, domicilio, telefono, email,
          tipo_persona, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'juridica', 'activo')`
      ).run(institucion_id, d.nombre, nitEnc, nitHash, domicilioEnc,
            d.telefono || null, d.email || null);
      const clienteId = info.lastInsertRowid;

      db.prepare(
        `INSERT INTO clientes_juridicos
         (cliente_id, nombre_comercial, tipo_sociedad, tipo_sociedad_otra, objeto_social,
          escritura_numero, escritura_fecha, escritura_notario,
          registro_mercantil_numero, registro_mercantil_folio,
          registro_mercantil_libro, registro_mercantil_fecha,
          patente_sociedad_numero, patente_sociedad_fecha,
          patente_empresa_numero, patente_empresa_fecha,
          capital_autorizado, capital_suscrito, capital_pagado,
          regimen_tributario, actividad_economica, fecha_inicio_actividades,
          rep_nombre_completo, rep_dpi, rep_dpi_hash, rep_profesion, rep_cargo,
          rep_acta_numero, rep_acta_fecha, rep_acta_notario,
          rep_inscripcion_numero, rep_inscripcion_folio, rep_inscripcion_libro,
          rep_vigencia_inicio, rep_vigencia_vencimiento)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        clienteId,
        d.nombre_comercial || null,
        d.tipo_sociedad, d.tipo_sociedad_otra || null, d.objeto_social,
        d.escritura_numero, d.escritura_fecha, d.escritura_notario,
        d.registro_mercantil_numero, d.registro_mercantil_folio,
        d.registro_mercantil_libro, d.registro_mercantil_fecha,
        d.patente_sociedad_numero, d.patente_sociedad_fecha,
        d.patente_empresa_numero, d.patente_empresa_fecha,
        capAut, capSus, capPag,
        d.regimen_tributario || null,
        d.actividad_economica || null,
        d.fecha_inicio_actividades || null,
        d.rep_nombre_completo, repDpiEnc, repDpiHash, d.rep_profesion || null, d.rep_cargo,
        d.rep_acta_numero, d.rep_acta_fecha, d.rep_acta_notario,
        d.rep_inscripcion_numero, d.rep_inscripcion_folio || null, d.rep_inscripcion_libro || null,
        d.rep_vigencia_inicio, d.rep_vigencia_vencimiento
      );

      return clienteId;
    });

    const id = tx();
    const row = db.prepare(BASE_SELECT + ' WHERE c.id = ?').get(id);
    res.status(201).json(clienteJuridicoFromRow(row));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'Ya existe un cliente con ese NIT en esta institución', code: 409 });
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// PUT /api/clientes/juridicos/:id — actualizar
// ──────────────────────────────────────────────────────────────

router.put('/:id', (req, res, next) => {
  try {
    const existing = db.prepare(BASE_SELECT + ' WHERE c.id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Cliente jurídico no encontrado', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== existing.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso', code: 403 });
    }

    const b = req.body || {};
    const clienteUpdates = [];
    const clienteParams = [];
    const jurUpdates = [];
    const jurParams = [];

    // ─── clientes (base) ─────────────────────
    if (b.nombre !== undefined)    { clienteUpdates.push('nombre = ?');    clienteParams.push(b.nombre); }
    if (b.telefono !== undefined)  { clienteUpdates.push('telefono = ?');  clienteParams.push(b.telefono || null); }
    if (b.email !== undefined)     { clienteUpdates.push('email = ?');     clienteParams.push(b.email || null); }
    if (b.estado !== undefined)    { clienteUpdates.push('estado = ?');    clienteParams.push(b.estado); }
    if (b.nit !== undefined) {
      clienteUpdates.push('nit = ?', 'nit_hash = ?');
      clienteParams.push(encrypt(b.nit), hashFor('nit', b.nit));
    }
    if (b.domicilio !== undefined) {
      clienteUpdates.push('domicilio = ?');
      clienteParams.push(encrypt(b.domicilio));
    }

    // ─── clientes_juridicos ──────────────────
    const jurFieldsPlain = [
      'nombre_comercial', 'tipo_sociedad', 'tipo_sociedad_otra', 'objeto_social',
      'escritura_numero', 'escritura_fecha', 'escritura_notario',
      'registro_mercantil_numero', 'registro_mercantil_folio',
      'registro_mercantil_libro', 'registro_mercantil_fecha',
      'patente_sociedad_numero', 'patente_sociedad_fecha',
      'patente_empresa_numero', 'patente_empresa_fecha',
      'regimen_tributario', 'actividad_economica', 'fecha_inicio_actividades',
      'rep_nombre_completo', 'rep_profesion', 'rep_cargo',
      'rep_acta_numero', 'rep_acta_fecha', 'rep_acta_notario',
      'rep_inscripcion_numero', 'rep_inscripcion_folio', 'rep_inscripcion_libro',
      'rep_vigencia_inicio', 'rep_vigencia_vencimiento',
    ];
    for (const k of jurFieldsPlain) {
      if (b[k] !== undefined) {
        jurUpdates.push(`${k} = ?`);
        jurParams.push(b[k] === '' ? null : b[k]);
      }
    }
    // Sensibles
    if (b.rep_dpi !== undefined) {
      jurUpdates.push('rep_dpi = ?', 'rep_dpi_hash = ?');
      jurParams.push(encrypt(b.rep_dpi), hashFor('dpi', b.rep_dpi));
    }
    for (const cap of ['capital_autorizado', 'capital_suscrito', 'capital_pagado']) {
      if (b[cap] !== undefined) {
        jurUpdates.push(`${cap} = ?`);
        jurParams.push(encrypt(normalizeMoney(b[cap])));
      }
    }

    if (!clienteUpdates.length && !jurUpdates.length) {
      return res.status(400).json({ error: 'No hay campos para actualizar', code: 400 });
    }

    const tx = db.transaction(() => {
      if (clienteUpdates.length) {
        clienteParams.push(existing.id);
        db.prepare(`UPDATE clientes SET ${clienteUpdates.join(', ')} WHERE id = ?`).run(...clienteParams);
      }
      if (jurUpdates.length) {
        jurParams.push(existing.id);
        db.prepare(`UPDATE clientes_juridicos SET ${jurUpdates.join(', ')} WHERE cliente_id = ?`).run(...jurParams);
      }
    });
    tx();

    const row = db.prepare(BASE_SELECT + ' WHERE c.id = ?').get(existing.id);
    res.json(clienteJuridicoFromRow(row));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      return res.status(409).json({ error: 'Ya existe un cliente con ese NIT en esta institución', code: 409 });
    next(err);
  }
});

// ──────────────────────────────────────────────────────────────
// DELETE /api/clientes/juridicos/:id — soft delete
// ──────────────────────────────────────────────────────────────

router.delete('/:id', (req, res, next) => {
  try {
    const existing = db.prepare('SELECT id, institucion_id FROM clientes WHERE id = ? AND tipo_persona = ?').get(req.params.id, 'juridica');
    if (!existing) return res.status(404).json({ error: 'Cliente jurídico no encontrado', code: 404 });
    if (req.user.institucion_id && req.user.institucion_id !== existing.institucion_id) {
      return res.status(403).json({ error: 'Sin acceso', code: 403 });
    }
    // Verificar contratos activos antes de inactivar
    const conContratos = db.prepare(
      "SELECT COUNT(*) AS n FROM contratos WHERE institucion_id = ? AND estado != 'firmado'"
    ).get(existing.institucion_id).n;
    // (chequeo amplio, no por cliente_id — refinar cuando contratos referencien clientes formalmente)

    db.prepare("UPDATE clientes SET estado = 'inactivo' WHERE id = ?").run(existing.id);
    res.json({ ok: true, soft_deleted: true, contratos_activos_en_institucion: conContratos });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
