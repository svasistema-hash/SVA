// F1 Checkpoint 1 — Migración de schema:
//   - Recrear contratos con CHECK ampliado para nuevos estados.
//   - Agregar columnas anulado_motivo/por/at, completado_at, dpi_fisico_*.
//   - Crear tabla audit_log + índices.
// Backup pre-F1 antes de tocar nada.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const Database = require('better-sqlite3');

const BACKEND = path.join(__dirname, '..', '..');
const DB_PATH = path.join(BACKEND, 'lexdocs.db');
const DATE = new Date().toISOString().slice(0, 10);
const BACKUP_BIN = path.join(BACKEND, `lexdocs.db.pre-f1-${DATE}`);
const BACKUP_SQL = path.join(BACKEND, `lexdocs.db.pre-f1-${DATE}.sql`);

// ─── PREP: Backup binario + SQL dump ─────────────────────────
console.log('=== PREP: backup pre-F1 ===');
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
  out.push('-- LexDocs pre-F1 SQL dump');
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
    if (rows.length === 0) { out.push(`-- 0 rows for ${t}`); continue; }
    out.push(`-- ${rows.length} rows for ${t}`);
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

// ─── MIGRACIÓN ────────────────────────────────────────────────
console.log('\n=== Migración ===');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = OFF');

const contratosCols = db.prepare('PRAGMA table_info(contratos)').all().map((c) => c.name);
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);

// Map de estados viejos → nuevos
const ESTADO_MAP_SQL = `
  CASE estado
    WHEN 'firmado'   THEN 'completado'
    WHEN 'revision'  THEN 'revision_tenant'
    WHEN 'borrador'  THEN 'en_curso'
    -- estados nuevos pasan tal cual
    WHEN 'en_curso'              THEN 'en_curso'
    WHEN 'revision_tenant'       THEN 'revision_tenant'
    WHEN 'revision_abogados'     THEN 'revision_abogados'
    WHEN 'completado'            THEN 'completado'
    WHEN 'abandonada_sin_inicio' THEN 'abandonada_sin_inicio'
    WHEN 'abandonada_incompleta' THEN 'abandonada_incompleta'
    WHEN 'anulada'               THEN 'anulada'
    ELSE 'en_curso'
  END
`;

console.log('Recreando contratos (transacción única)...');
db.exec('BEGIN');
try {
  // Estado actual antes de migrar
  console.log('Distribución de estados PRE:');
  console.table(db.prepare("SELECT estado, COUNT(*) AS n FROM contratos GROUP BY estado").all());

  db.exec(`
    CREATE TABLE contratos_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institucion_id INTEGER NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
      modelo_id INTEGER NOT NULL REFERENCES modelos(id),
      no_contrato TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN (
        'en_curso',
        'revision_tenant',
        'revision_abogados',
        'completado',
        'abandonada_sin_inicio',
        'abandonada_incompleta',
        'anulada'
      )),
      datos_cliente TEXT,
      datos_credito TEXT,
      datos_garantia TEXT,
      datos_firmas TEXT,
      pdf_path TEXT,
      pdf_filename TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      -- F1: nuevas columnas
      anulado_motivo TEXT,
      anulado_por INTEGER REFERENCES users(id),
      anulado_at TEXT,
      completado_at TEXT,
      dpi_fisico_recibido INTEGER NOT NULL DEFAULT 0,
      dpi_fisico_recibido_por INTEGER REFERENCES users(id),
      dpi_fisico_recibido_at TEXT,
      UNIQUE (institucion_id, no_contrato)
    );

    INSERT INTO contratos_new (
      id, institucion_id, modelo_id, no_contrato, estado,
      datos_cliente, datos_credito, datos_garantia, datos_firmas,
      pdf_path, pdf_filename, created_at, updated_at, completado_at
    )
    SELECT
      id, institucion_id, modelo_id, no_contrato,
      (${ESTADO_MAP_SQL}) AS estado,
      datos_cliente, datos_credito, datos_garantia, datos_firmas,
      pdf_path, pdf_filename, created_at, updated_at,
      CASE WHEN estado = 'firmado' THEN updated_at ELSE NULL END AS completado_at
    FROM contratos;

    DROP TABLE contratos;
    ALTER TABLE contratos_new RENAME TO contratos;

    CREATE INDEX IF NOT EXISTS idx_contratos_inst ON contratos(institucion_id);
    CREATE INDEX IF NOT EXISTS idx_contratos_estado ON contratos(institucion_id, estado);

    CREATE TRIGGER IF NOT EXISTS trg_contratos_updated
    AFTER UPDATE ON contratos
    FOR EACH ROW
    BEGIN
      UPDATE contratos SET updated_at = datetime('now') WHERE id = OLD.id;
    END;
  `);
  console.log('contratos recreada.');

  // audit_log
  if (!tables.includes('audit_log')) {
    db.exec(`
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        user_id INTEGER REFERENCES users(id),
        user_email TEXT,
        user_role TEXT,
        institucion_id INTEGER,
        accion TEXT NOT NULL,
        entidad_tipo TEXT,
        entidad_id INTEGER,
        detalles TEXT,
        ip TEXT,
        user_agent TEXT
      );
      CREATE INDEX idx_audit_log_entidad ON audit_log(entidad_tipo, entidad_id);
      CREATE INDEX idx_audit_log_user ON audit_log(user_id);
      CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
    `);
    console.log('audit_log creada con 3 índices.');
  } else {
    console.log('audit_log ya existía (skip).');
  }

  db.exec('COMMIT');
  console.log('COMMIT OK.');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('ROLLBACK:', e.message);
  process.exit(2);
}
db.pragma('foreign_keys = ON');

// ─── VERIFICACIONES ───────────────────────────────────────────
console.log('\n=== Verificaciones post ===');

const fkc = db.pragma('foreign_key_check');
console.log('foreign_key_check:', fkc.length === 0 ? 'OK' : `FALLO: ${JSON.stringify(fkc)}`);

console.log('\nDistribución de estados POST:');
console.table(db.prepare("SELECT estado, COUNT(*) AS n FROM contratos GROUP BY estado ORDER BY n DESC").all());

console.log('\nColumnas nuevas en contratos:');
const cols = db.prepare("PRAGMA table_info(contratos)").all();
const nuevas = ['anulado_motivo','anulado_por','anulado_at','completado_at','dpi_fisico_recibido','dpi_fisico_recibido_por','dpi_fisico_recibido_at'];
for (const n of nuevas) {
  const found = cols.find((c) => c.name === n);
  console.log(`  ${found ? '+' : '!'} ${n}: ${found ? found.type : 'NO ENCONTRADA'}`);
}

console.log('\nÍndices y triggers:');
console.table(db.prepare("SELECT type, name, tbl_name FROM sqlite_master WHERE name LIKE 'idx_contratos%' OR name LIKE 'trg_contratos%' OR name LIKE 'idx_audit%' ORDER BY type, name").all());

console.log('\nCOUNT audit_log:', db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n, '(esperado 0)');

console.log('\nCompletado_at poblado donde el estado es completado (los que eran firmado):');
console.table(db.prepare("SELECT id, no_contrato, estado, completado_at FROM contratos WHERE estado='completado'").all());

db.close();
console.log('\n=== Migración F1 Checkpoint 1 completada ===');
