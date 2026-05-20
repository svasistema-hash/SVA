// hotfix(f1-qa) Fix 3: agregar a la tabla instituciones todos los datos legales
// que una persona jurídica (sociedad) tiene en su escritura de constitución,
// inscripción en RM, patentes, capital social, régimen tributario, etc.
//
// Espejo (parcial) del schema de clientes_juridicos, adaptado al rol de
// institución acreedora.
//
// Idempotente: cada ALTER se condiciona a que la columna no exista todavía.

const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const DB_PATH = path.resolve(__dirname, '..', '..', process.env.DB_PATH || './lexdocs.db');
const db = new Database(DB_PATH);

const cols = db.prepare('PRAGMA table_info(instituciones)').all().map((c) => c.name);
const add = (col, def) => {
  if (cols.includes(col)) {
    console.log(`  SKIP instituciones.${col} (ya existe)`);
    return;
  }
  db.exec(`ALTER TABLE instituciones ADD COLUMN ${col} ${def}`);
  console.log(`  ADD  instituciones.${col}`);
};

console.log('[2026-05-20 instituciones completas] DB:', DB_PATH);

// Identificación adicional
add('razon_social',     'TEXT');
add('tipo_sociedad',    'TEXT'); // 'S.A.' / 'S.R.L.' / 'Sociedad Civil' / etc.
add('objeto_social',    'TEXT');
add('direccion_fiscal', 'TEXT');

// Escritura de constitución
add('escritura_numero',  'TEXT');
add('escritura_fecha',   'TEXT');
add('escritura_notario', 'TEXT');

// Inscripción en Registro Mercantil (estructurado, en adición al campo libre existente)
add('rm_numero', 'TEXT');
add('rm_folio',  'TEXT');
add('rm_libro',  'TEXT');
add('rm_fecha',  'TEXT');

// Patentes
add('patente_sociedad_numero', 'TEXT');
add('patente_sociedad_fecha',  'TEXT');
add('patente_empresa_numero',  'TEXT');
add('patente_empresa_fecha',   'TEXT');

// Capital social (ENCRIPTADO con AES-GCM como en clientes_juridicos)
add('capital_autorizado', 'TEXT');
add('capital_suscrito',   'TEXT');
add('capital_pagado',     'TEXT');

// Operación
add('regimen_tributario',       'TEXT');
add('actividad_economica',      'TEXT');
add('fecha_inicio_actividades', 'TEXT');

console.log('[2026-05-20 instituciones completas] OK');
db.close();
