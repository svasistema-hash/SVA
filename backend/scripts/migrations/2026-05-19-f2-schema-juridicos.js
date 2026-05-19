// F2 Fase 1 — Schema para clientes jurídicos.
// - clientes.tipo_persona (discriminador, 'individual' default)
// - clientes_juridicos (1:1 con clientes, FK CASCADE)
// - Trigger updated_at + índices
// IDEMPOTENTE: cada paso chequea si ya existe.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const Database = require('better-sqlite3');

const BACKEND = path.join(__dirname, '..', '..');
const DB_PATH = path.join(BACKEND, 'lexdocs.db');
const DATE = new Date().toISOString().slice(0, 10);
const BACKUP_BIN = path.join(BACKEND, `lexdocs.db.pre-f2-${DATE}`);
const BACKUP_SQL = path.join(BACKEND, `lexdocs.db.pre-f2-${DATE}.sql`);

// ─── PREP: backup binario + dump SQL ──────────────────────────
console.log('=== PREP: backup pre-F2 ===');
fs.copyFileSync(DB_PATH, BACKUP_BIN);
console.log(`Binario: ${BACKUP_BIN} (${fs.statSync(BACKUP_BIN).size} bytes)`);

function escSql(v) {
  if (v === null || v === undefined) return 'NULL';
  if (Buffer.isBuffer(v)) return "X'" + v.toString('hex') + "'";
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return v.toString();
  return "'" + String(v).replace(/'/g, "''") + "'";
}

{
  const db = new Database(DB_PATH, { readonly: true });
  const out = [];
  out.push('-- LexDocs pre-F2 SQL dump');
  out.push(`-- Source: ${DB_PATH}`);
  out.push(`-- Generated: ${new Date().toISOString()}`);
  out.push('PRAGMA foreign_keys=OFF;');
  out.push('BEGIN TRANSACTION;');
  const objects = db.prepare(
    "SELECT type, name, sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 ELSE 3 END, name"
  ).all();
  const tables = objects.filter((o) => o.type === 'table').map((o) => o.name);
  for (const obj of objects) if (obj.sql) out.push(obj.sql + ';');
  let totalRows = 0;
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name);
    const rows = db.prepare(`SELECT * FROM "${t}"`).all();
    out.push(rows.length ? `-- ${rows.length} rows for ${t}` : `-- 0 rows for ${t}`);
    totalRows += rows.length;
    for (const r of rows) {
      const colList = cols.map((c) => `"${c}"`).join(', ');
      const vals = cols.map((c) => escSql(r[c])).join(', ');
      out.push(`INSERT INTO "${t}" (${colList}) VALUES (${vals});`);
    }
  }
  out.push('COMMIT;');
  out.push('PRAGMA foreign_keys=ON;');
  fs.writeFileSync(BACKUP_SQL, out.join('\n') + '\n', 'utf8');
  console.log(`SQL dump:  ${BACKUP_SQL} (${fs.statSync(BACKUP_SQL).size} bytes, ${totalRows} filas)`);
  db.close();
}

console.log('\n=== Migración (transacción única) ===');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = OFF');

const clientesCols = db.prepare('PRAGMA table_info(clientes)').all().map((c) => c.name);
const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map((t) => t.name);

db.exec('BEGIN');
try {
  if (!clientesCols.includes('tipo_persona')) {
    db.exec(`
      ALTER TABLE clientes ADD COLUMN tipo_persona TEXT NOT NULL
        DEFAULT 'individual' CHECK (tipo_persona IN ('individual','juridica'))
    `);
    console.log('  + clientes.tipo_persona agregada');
  } else {
    console.log('  · clientes.tipo_persona ya existía (skip)');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_clientes_tipo_persona ON clientes(tipo_persona)');
  console.log('  + idx_clientes_tipo_persona (IF NOT EXISTS)');

  if (!tablas.includes('clientes_juridicos')) {
    db.exec(`
      CREATE TABLE clientes_juridicos (
        cliente_id INTEGER PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,

        nombre_comercial TEXT,
        tipo_sociedad TEXT NOT NULL CHECK (tipo_sociedad IN
          ('S.A.','S.R.L.','Sociedad Civil','E.M.I.',
           'Cooperativa','Asociación/Fundación','Otra')),
        tipo_sociedad_otra TEXT,
        objeto_social TEXT NOT NULL,

        escritura_numero TEXT NOT NULL,
        escritura_fecha TEXT NOT NULL,
        escritura_notario TEXT NOT NULL,

        registro_mercantil_numero TEXT NOT NULL,
        registro_mercantil_folio TEXT NOT NULL,
        registro_mercantil_libro TEXT NOT NULL,
        registro_mercantil_fecha TEXT NOT NULL,

        patente_sociedad_numero TEXT NOT NULL,
        patente_sociedad_fecha TEXT NOT NULL,
        patente_empresa_numero TEXT NOT NULL,
        patente_empresa_fecha TEXT NOT NULL,

        capital_autorizado TEXT NOT NULL,
        capital_suscrito TEXT NOT NULL,
        capital_pagado TEXT NOT NULL,

        regimen_tributario TEXT,
        actividad_economica TEXT,
        fecha_inicio_actividades TEXT,

        rep_nombre_completo TEXT NOT NULL,
        rep_dpi TEXT NOT NULL,
        rep_dpi_hash TEXT NOT NULL,
        rep_profesion TEXT,
        rep_cargo TEXT NOT NULL CHECK (rep_cargo IN
          ('Administrador Único','Presidente','Gerente General',
           'Representante Legal designado','Apoderado')),
        rep_acta_numero TEXT NOT NULL,
        rep_acta_fecha TEXT NOT NULL,
        rep_acta_notario TEXT NOT NULL,
        rep_inscripcion_numero TEXT NOT NULL,
        rep_inscripcion_folio TEXT,
        rep_inscripcion_libro TEXT,
        rep_vigencia_inicio TEXT NOT NULL,
        rep_vigencia_vencimiento TEXT NOT NULL,

        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    console.log('  + tabla clientes_juridicos creada');
  } else {
    console.log('  · clientes_juridicos ya existía (skip)');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_clientes_juridicos_rep_dpi_hash ON clientes_juridicos(rep_dpi_hash)');
  console.log('  + idx_clientes_juridicos_rep_dpi_hash');

  if (!triggers.includes('trg_clientes_juridicos_updated')) {
    db.exec(`
      CREATE TRIGGER trg_clientes_juridicos_updated
      AFTER UPDATE ON clientes_juridicos
      FOR EACH ROW
      BEGIN
        UPDATE clientes_juridicos SET updated_at = datetime('now')
          WHERE cliente_id = OLD.cliente_id;
      END
    `);
    console.log('  + trigger trg_clientes_juridicos_updated creado');
  } else {
    console.log('  · trigger trg_clientes_juridicos_updated ya existía (skip)');
  }

  db.exec('COMMIT');
  console.log('COMMIT OK.');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('ROLLBACK:', e.message);
  console.error(e);
  process.exit(2);
}
db.pragma('foreign_keys = ON');

console.log('\n=== Verificaciones post ===');

const fkc = db.pragma('foreign_key_check');
console.log('PRAGMA foreign_key_check:', fkc.length === 0 ? 'OK (0 violaciones)' : `FALLO: ${JSON.stringify(fkc)}`);

const countClientes = db.prepare('SELECT COUNT(*) AS n FROM clientes').get().n;
console.log(`COUNT(*) FROM clientes: ${countClientes} (esperado 6)`);

const tiposCount = db.prepare(
  "SELECT tipo_persona, COUNT(*) AS n FROM clientes GROUP BY tipo_persona ORDER BY tipo_persona"
).all();
console.table(tiposCount);

console.log('\nSchema clientes (columnas nuevas):');
const colsClientes = db.prepare("PRAGMA table_info(clientes)").all().filter((c) => c.name === 'tipo_persona');
console.table(colsClientes.map((c) => ({ name: c.name, type: c.type, notnull: c.notnull, dflt: c.dflt_value })));

console.log('\nSchema clientes_juridicos (resumen):');
const colsJur = db.prepare("PRAGMA table_info(clientes_juridicos)").all();
console.log(`  ${colsJur.length} columnas. NOT NULL: ${colsJur.filter((c) => c.notnull).length}`);

console.log('\nÍndices sobre clientes y clientes_juridicos:');
console.table(
  db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND tbl_name IN ('clientes','clientes_juridicos') ORDER BY tbl_name, name").all()
);

console.log('\nTriggers:');
console.table(db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='trigger' ORDER BY name").all());

console.log('\nCOUNT clientes_juridicos:', db.prepare('SELECT COUNT(*) AS n FROM clientes_juridicos').get().n, '(esperado 0)');

db.close();
console.log('\n=== F2 Fase 1 — migración de schema completada ===');
