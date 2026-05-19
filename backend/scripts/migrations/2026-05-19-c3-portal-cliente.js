// F1 Checkpoint 3 — Portal público del cliente.
//
// Cambios:
//  1. ALTER TABLE contratos ADD COLUMN datos_borrador TEXT
//     Guarda JSON con el estado actual del wizard cliente. PUT silencioso en
//     cada cambio de sub-paso permite que el cliente cierre y vuelva.
//  2. CREATE TABLE contratos_tokens
//     Token público de 48h por contrato. Distinto de solicitudes_tokens (que era
//     por institución, legacy). Un contrato puede tener varios tokens (regenerar
//     link), solo el último no usado y no expirado es válido.
//
// Idempotente.

const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'lexdocs.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('[C3 portal cliente] DB:', DB_PATH);

// 1. ALTER TABLE contratos
const contratosCols = db.prepare('PRAGMA table_info(contratos)').all().map((c) => c.name);
if (!contratosCols.includes('datos_borrador')) {
  db.exec('ALTER TABLE contratos ADD COLUMN datos_borrador TEXT');
  console.log('  ADDED contratos.datos_borrador');
} else {
  console.log('  SKIP contratos.datos_borrador (ya existe)');
}

// 2. CREATE TABLE contratos_tokens
db.exec(`
  CREATE TABLE IF NOT EXISTS contratos_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    usado INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by INTEGER REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_contratos_tokens_token ON contratos_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_contratos_tokens_contrato ON contratos_tokens(contrato_id);
`);
console.log('  ENSURED contratos_tokens (+ indexes)');

console.log('[C3 portal cliente] OK');
db.close();
