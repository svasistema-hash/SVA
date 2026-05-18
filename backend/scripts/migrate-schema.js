// Paso 3.3 — Migración de schema para encriptación.
// - clientes: ingresos REAL → TEXT, +3 columnas hash con índices,
//             UNIQUE (institucion_id, dpi_hash) reemplaza UNIQUE (institucion_id, dpi).
// - fiadores: +dpi_hash + índice.
// NO migra contenido (eso es 3.4).
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const { normalize } = require('../encryption');

const db = new Database(path.join(__dirname, '..', 'lexdocs.db'));

// ───────────────────────────────────────────────────────────────
// PRE-CHECK: duplicados (institucion_id, normalize(dpi))
// ───────────────────────────────────────────────────────────────
console.log('=== Pre-check: duplicados (institucion_id, normalize(dpi)) ===');
const filas = db.prepare('SELECT id, institucion_id, dpi FROM clientes WHERE dpi IS NOT NULL').all();
console.log(`Filas con dpi non-null: ${filas.length}`);
const seen = new Map();
const dupes = [];
for (const row of filas) {
  const norm = normalize(row.dpi);
  const key = `${row.institucion_id}|${norm}`;
  if (seen.has(key)) {
    dupes.push({ existing: seen.get(key), duplicate: row.id, dpi: row.dpi, institucion_id: row.institucion_id });
  } else {
    seen.set(key, row.id);
  }
}
if (dupes.length > 0) {
  console.error('DUPLICADOS detectados, abortando:');
  console.error(JSON.stringify(dupes, null, 2));
  process.exit(1);
}
console.log('Pre-check OK: 0 duplicados en (institucion_id, normalize(dpi))');

// ───────────────────────────────────────────────────────────────
// PRE-SNAPSHOT
// ───────────────────────────────────────────────────────────────
console.log('\n=== Pre-migration state (3 muestras) ===');
console.table(
  db.prepare("SELECT id, nombre, dpi, ingresos, typeof(ingresos) AS ingresos_type FROM clientes ORDER BY id LIMIT 3").all()
);

// ───────────────────────────────────────────────────────────────
// MIGRACIÓN
// ───────────────────────────────────────────────────────────────
console.log('\n=== Aplicando migración de schema ===');
db.pragma('foreign_keys = OFF');
const migrate = db.transaction(() => {
  db.exec(`
    CREATE TABLE clientes_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institucion_id INTEGER NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL,
      dpi TEXT,
      dpi_scan_path TEXT,
      fecha_nac TEXT,
      lugar_nac TEXT,
      profesion TEXT,
      estado_civil TEXT,
      nit TEXT,
      telefono TEXT,
      email TEXT,
      domicilio TEXT,
      recibo_path TEXT,
      ingresos TEXT,
      empleo TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      estado TEXT NOT NULL DEFAULT 'activo',
      autorizaciones TEXT,
      genero TEXT,
      conyuge_nombre TEXT,
      conyuge_dpi TEXT,
      ingresos_rango TEXT,
      dpi_hash TEXT,
      nit_hash TEXT,
      conyuge_dpi_hash TEXT
    );

    INSERT INTO clientes_new (
      id, institucion_id, nombre, dpi, dpi_scan_path, fecha_nac, lugar_nac,
      profesion, estado_civil, nit, telefono, email, domicilio, recibo_path,
      ingresos, empleo, created_at, estado, autorizaciones, genero,
      conyuge_nombre, conyuge_dpi, ingresos_rango
    )
    SELECT
      id, institucion_id, nombre, dpi, dpi_scan_path, fecha_nac, lugar_nac,
      profesion, estado_civil, nit, telefono, email, domicilio, recibo_path,
      CAST(ingresos AS TEXT), empleo, created_at, estado, autorizaciones, genero,
      conyuge_nombre, conyuge_dpi, ingresos_rango
    FROM clientes;

    DROP TABLE clientes;
    ALTER TABLE clientes_new RENAME TO clientes;

    CREATE INDEX idx_clientes_inst ON clientes(institucion_id);
    CREATE UNIQUE INDEX uq_clientes_inst_dpi_hash
        ON clientes(institucion_id, dpi_hash)
        WHERE dpi_hash IS NOT NULL;
    CREATE INDEX idx_clientes_dpi_hash         ON clientes(dpi_hash);
    CREATE INDEX idx_clientes_nit_hash         ON clientes(nit_hash);
    CREATE INDEX idx_clientes_conyuge_dpi_hash ON clientes(conyuge_dpi_hash);

    ALTER TABLE fiadores ADD COLUMN dpi_hash TEXT;
    CREATE INDEX idx_fiadores_dpi_hash ON fiadores(dpi_hash);
  `);
});

try {
  migrate();
  console.log('Transacción COMMIT OK');
} catch (e) {
  console.error('Transacción ROLLBACK:', e.message);
  console.error(e);
  process.exit(2);
}
db.pragma('foreign_keys = ON');

// ───────────────────────────────────────────────────────────────
// VERIFICACIONES POST
// ───────────────────────────────────────────────────────────────
console.log('\n=== Post: PRAGMA foreign_key_check ===');
const fkc = db.pragma('foreign_key_check');
console.log(fkc.length === 0 ? 'OK: 0 violaciones de FK' : `FALLO: ${JSON.stringify(fkc, null, 2)}`);

console.log('\n=== (a) COUNT(*) FROM clientes ===');
const count = db.prepare('SELECT COUNT(*) AS n FROM clientes').get().n;
console.log(`Filas: ${count} (esperado: 6)`);

console.log('\n=== (b) PRAGMA table_info(clientes) ===');
const cols = db.prepare('PRAGMA table_info(clientes)').all();
console.table(cols.map((c) => ({ name: c.name, type: c.type, notnull: c.notnull })));
console.log('Tipo de ingresos:', cols.find((c) => c.name === 'ingresos')?.type);
console.log('Tiene dpi_hash       :', cols.some((c) => c.name === 'dpi_hash'));
console.log('Tiene nit_hash       :', cols.some((c) => c.name === 'nit_hash'));
console.log('Tiene conyuge_dpi_hash:', cols.some((c) => c.name === 'conyuge_dpi_hash'));

console.log('\n=== (c) Índices de clientes ===');
const idx = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='clientes' ORDER BY name").all();
console.table(idx.map((r) => ({ name: r.name })));
const expected = ['idx_clientes_conyuge_dpi_hash', 'idx_clientes_dpi_hash', 'idx_clientes_inst', 'idx_clientes_nit_hash', 'uq_clientes_inst_dpi_hash'];
const have = idx.map((r) => r.name).filter((n) => !n.startsWith('sqlite_'));
const missing = expected.filter((n) => !have.includes(n));
console.log(missing.length === 0 ? 'OK: todos los índices esperados presentes' : `FALTAN: ${missing.join(', ')}`);
console.log('SQL del UNIQUE parcial:', idx.find((r) => r.name === 'uq_clientes_inst_dpi_hash')?.sql);

console.log('\n=== (d) Spot-check clientes (plaintext aún, ingresos como TEXT) ===');
console.table(
  db.prepare("SELECT id, nombre, dpi, ingresos, typeof(ingresos) AS ingresos_type FROM clientes ORDER BY id LIMIT 3").all()
);

console.log('\n=== (e.1) PRAGMA table_info(fiadores) ===');
const colsF = db.prepare('PRAGMA table_info(fiadores)').all();
console.table(colsF.map((c) => ({ name: c.name, type: c.type })));
console.log('Tiene dpi_hash:', colsF.some((c) => c.name === 'dpi_hash'));

console.log('\n=== (e.2) Índices de fiadores ===');
const idxF = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='fiadores' ORDER BY name").all();
console.table(idxF);

db.close();
console.log('\n=== Migración de schema 3.3 completada ===');
