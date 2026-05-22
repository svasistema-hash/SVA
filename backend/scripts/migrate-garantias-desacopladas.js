// Sprint garantías-desacopladas CP2 — migración manual.
//
// Ejecutar: npm run migrate:garantias
//
// Pasos (en orden):
//   1. Backup automático del archivo SQLite (patrón F1 cleanup).
//   2. Cleanup de residuales de prueba (contratos / clausulas / modelos /
//      clientes / clientes_juridicos / contratos_tokens + audit relacionado).
//      Pre-condición confirmada por el usuario: todos los contratos y
//      modelos actuales son de prueba y descartables. No hay legacy real.
//   3. DROP TABLE fiadores (verificando antes que esté vacía).
//   4. Verificar que las 4 tablas nuevas existen (las creó db.js al require).
//   5. PRAGMA foreign_key_check post-migración.
//   6. Reset de correlativo_actual en instituciones (no lo es: solo existe
//      correlativo_prefijo; los números arrancan de 0 implícitamente).
//
// El script es defensivo: en cualquier fallo intermedio aborta antes de
// hacer cambios destructivos.

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { DB_PATH } = require('../config');

function log(level, msg) {
  const tag = level === 'ok' ? '  OK ' : level === 'err' ? ' ERR ' : level === 'warn' ? 'WARN ' : '     ';
  console.log(`[migrate:garantias] ${tag} ${msg}`);
}

function abort(msg) {
  log('err', msg);
  log('err', 'MIGRACIÓN ABORTADA. La DB no fue modificada (o se modificó parcialmente — revisar backup).');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────
// 1. BACKUP PRE-MIGRACIÓN
// ─────────────────────────────────────────────────────────────────

if (!fs.existsSync(DB_PATH)) {
  abort(`No existe DB en ${DB_PATH}. Nada que migrar.`);
}

const fechaTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = `${DB_PATH}.pre-garantias-${fechaTag}`;
fs.copyFileSync(DB_PATH, backupPath);
log('ok', `backup creado: ${path.basename(backupPath)}`);

// Carga db.js DESPUÉS del backup (db.js abre la DB en modo WAL y, al hacer
// require, ya ejecuta los CREATE TABLE IF NOT EXISTS — incluyendo las 4
// tablas nuevas de la migración).
const db = require('../db');

// Helper: existencia de tabla
function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

// ─────────────────────────────────────────────────────────────────
// 2. CLEANUP DE RESIDUALES DE PRUEBA
// ─────────────────────────────────────────────────────────────────

log('info', 'verificando estado de la DB...');
const conteoPre = {
  contratos: db.prepare('SELECT COUNT(*) AS n FROM contratos').get().n,
  modelos: db.prepare('SELECT COUNT(*) AS n FROM modelos').get().n,
  clausulas: db.prepare('SELECT COUNT(*) AS n FROM clausulas').get().n,
  clientes: db.prepare('SELECT COUNT(*) AS n FROM clientes').get().n,
  audit_log: db.prepare('SELECT COUNT(*) AS n FROM audit_log').get().n,
  fiadores_viejo: tableExists('fiadores')
    ? db.prepare('SELECT COUNT(*) AS n FROM fiadores').get().n
    : null,
};
console.log('     conteo pre-cleanup:', conteoPre);

if (conteoPre.fiadores_viejo !== null && conteoPre.fiadores_viejo > 0) {
  abort(`tabla 'fiadores' tiene ${conteoPre.fiadores_viejo} filas — la pre-condición "vacía" no se cumple. ` +
        `Revisar el contenido antes de DROP. La migración no continúa.`);
}

const cleanupTx = db.transaction(() => {
  // 2.1 Audit relacionado a entidades que vamos a borrar.
  db.prepare(`
    DELETE FROM audit_log
    WHERE entidad_tipo IN ('contrato','modelo','clausula','cliente','cliente_juridico')
  `).run();

  // 2.2 Tokens públicos de contratos (FK cascade a contratos los limpiaría,
  // pero somos explícitos para que el orden sea claro).
  db.prepare('DELETE FROM contratos_tokens').run();

  // 2.3 Tokens de solicitud al cliente.
  db.prepare('DELETE FROM solicitudes_tokens').run();

  // 2.4 Contratos (cascade limpia clausulas-de-contrato si las hubiera).
  db.prepare('DELETE FROM contratos').run();

  // 2.5 Cláusulas (sueltas sin contrato, asociadas a modelos).
  db.prepare('DELETE FROM clausulas').run();

  // 2.6 Modelos.
  db.prepare('DELETE FROM modelos').run();

  // 2.7 Clientes y datos jurídicos.
  db.prepare('DELETE FROM clientes_juridicos').run();
  db.prepare('DELETE FROM clientes').run();

  // 2.8 Reset de los AUTOINCREMENT counters para esas tablas, así los
  // próximos seeds arrancan en id=1 limpio.
  db.prepare(`
    DELETE FROM sqlite_sequence
    WHERE name IN ('contratos','modelos','clausulas','clientes','clientes_juridicos','contratos_tokens','solicitudes_tokens')
  `).run();
});

cleanupTx();
log('ok', 'cleanup de residuales completado en transacción');

// ─────────────────────────────────────────────────────────────────
// 3. DROP DE TABLA fiadores VIEJA (vacía verificada arriba)
// ─────────────────────────────────────────────────────────────────

if (tableExists('fiadores')) {
  // Doble verificación in-line (paranoia: el cleanup no debería haber
  // tocado fiadores, pero por las dudas):
  const n = db.prepare('SELECT COUNT(*) AS n FROM fiadores').get().n;
  if (n > 0) {
    abort(`tabla 'fiadores' tiene ${n} filas justo antes del DROP. ABORT (estado inesperado).`);
  }
  db.exec('DROP TABLE fiadores');
  log('ok', 'DROP TABLE fiadores (vacía verificada)');
} else {
  log('info', 'tabla fiadores no existe — saltando DROP');
}

// ─────────────────────────────────────────────────────────────────
// 4. VERIFICAR LAS 4 TABLAS NUEVAS
// ─────────────────────────────────────────────────────────────────

const tablasNuevasRequeridas = ['comparecientes', 'garantias', 'contrato_comparecientes', 'contrato_garantias'];
const faltantes = tablasNuevasRequeridas.filter((t) => !tableExists(t));
if (faltantes.length > 0) {
  abort(`tablas nuevas faltantes después de require('../db'): ${faltantes.join(', ')}. ` +
        `Revisar backend/db.js.`);
}
log('ok', 'las 4 tablas nuevas existen: ' + tablasNuevasRequeridas.join(', '));

// ─────────────────────────────────────────────────────────────────
// 5. PRAGMA foreign_key_check
// ─────────────────────────────────────────────────────────────────

const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
if (fkViolations.length > 0) {
  log('err', `PRAGMA foreign_key_check reportó ${fkViolations.length} violaciones:`);
  for (const v of fkViolations) console.log('    ', v);
  abort('integridad referencial rota después del cleanup. Restaurar desde backup.');
}
log('ok', 'PRAGMA foreign_key_check: sin violaciones');

// ─────────────────────────────────────────────────────────────────
// 6. REPORTE FINAL
// ─────────────────────────────────────────────────────────────────

console.log('\n=== ESTADO POST-MIGRACIÓN ===');
const tablasInteres = [
  'instituciones','representantes','users','notarios',
  'modelos','clausulas','clientes','clientes_juridicos','contratos',
  'comparecientes','garantias','contrato_comparecientes','contrato_garantias',
  'audit_log',
];
for (const t of tablasInteres) {
  const n = tableExists(t) ? db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n : 'N/A';
  console.log(`  ${t.padEnd(28)} ${n}`);
}

console.log(`\nBackup: ${backupPath}`);
console.log('Para revertir: copiar el backup sobre el archivo de DB (con el server parado).');
console.log('\n[migrate:garantias] DONE');

db.close();
