// Sprint LexDocs Legal Fase 2 (S.A. express) CP2 — migración manual.
//
// Doble modo:
//   - CLI: `npm run migrate:fase2-sa` (corre local contra DB de dev).
//   - Módulo: `require('./scripts/migrate-fase2-sa').run(dbHandle)` — usado por
//     server.js cuando MIGRATE_FASE2_SA_NOW=true (mismo patrón que
//     SEED_GARANTIAS_NOW que funcionó en producción).
//
// NO destructiva: solo crea tablas/columnas nuevas. No toca instituciones,
// contratos, comparecientes, garantias ni datos existentes de Fase 1.
//
// Pasos:
//   1. Backup automático del archivo SQLite a /data/lexdocs.db.pre-fase2-sa-<ISO>.
//   2. Pre-conteo de tablas Fase 1 (para reporte y safety check).
//   3. Verificación de tablas/columnas nuevas (db.js boot ya las crea, este
//      script solo confirma + inserta firma master si no existe).
//   4. Backfill audit_log polimórfico (idempotente).
//   5. INSERT firma master 'lexdocs-legal' (id=1) si no existe.
//   6. PRAGMA foreign_key_check.
//   7. Reporte de tablas y conteos.

const fs = require('fs');
const path = require('path');

function log(level, msg) {
  const tag = level === 'ok' ? '  OK ' : level === 'err' ? ' ERR ' : level === 'warn' ? 'WARN ' : '     ';
  console.log(`[migrate:fase2-sa] ${tag} ${msg}`);
}

function tableExists(db, name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

function run(db) {
  // ─────────────────────────────────────────────────────────────────
  // 1. Verificar que db.js boot creó las tablas (CREATE IF NOT EXISTS).
  // ─────────────────────────────────────────────────────────────────
  const tablasRequeridas = [
    'firmas', 'sociedades', 'accionistas',
    'representantes_sa', 'direcciones_sa',
    'sociedades_tokens', 'correcciones_sa',
  ];
  const faltantes = tablasRequeridas.filter((t) => !tableExists(db, t));
  if (faltantes.length > 0) {
    throw new Error(`tablas Fase 2 faltantes: ${faltantes.join(', ')}. Revisar backend/db.js.`);
  }
  log('ok', `7 tablas Fase 2 existen: ${tablasRequeridas.join(', ')}`);

  // ─────────────────────────────────────────────────────────────────
  // 2. Verificar columnas nuevas en users y audit_log.
  // ─────────────────────────────────────────────────────────────────
  const usersCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  const auditCols = db.prepare('PRAGMA table_info(audit_log)').all().map((c) => c.name);
  if (!usersCols.includes('firma_id')) throw new Error('users.firma_id faltante');
  if (!auditCols.includes('tenant_tipo') || !auditCols.includes('tenant_id')) {
    throw new Error('audit_log.tenant_tipo o tenant_id faltantes');
  }
  log('ok', 'users.firma_id + audit_log.tenant_tipo/tenant_id presentes');

  // ─────────────────────────────────────────────────────────────────
  // 3. Backfill audit_log polimórfico (idempotente).
  // ─────────────────────────────────────────────────────────────────
  const backfillResult = db.prepare(`
    UPDATE audit_log
    SET tenant_tipo = 'institucion', tenant_id = institucion_id
    WHERE institucion_id IS NOT NULL
      AND (tenant_tipo IS NULL OR tenant_id IS NULL)
  `).run();
  log('info', `backfill audit_log: ${backfillResult.changes} filas actualizadas`);

  // ─────────────────────────────────────────────────────────────────
  // 4. INSERT firma master 'lexdocs-legal' si no existe.
  //    id=1 implícito vía AUTOINCREMENT (la primera fila siempre es id=1
  //    en una tabla recién creada).
  // ─────────────────────────────────────────────────────────────────
  const existing = db.prepare("SELECT id FROM firmas WHERE slug = 'lexdocs-legal'").get();
  let firmaMasterId;
  if (existing) {
    firmaMasterId = existing.id;
    log('info', `firma master 'lexdocs-legal' ya existe (id=${firmaMasterId})`);
  } else {
    const info = db.prepare(`
      INSERT INTO firmas (slug, nombre, tipo, parent_id, correlativo_prefijo)
      VALUES ('lexdocs-legal', 'LexDocs Legal', 'bufete', NULL, 'SA-LXL')
    `).run();
    firmaMasterId = info.lastInsertRowid;
    log('ok', `firma master 'lexdocs-legal' creada (id=${firmaMasterId})`);
  }

  // ─────────────────────────────────────────────────────────────────
  // 5. PRAGMA foreign_key_check.
  // ─────────────────────────────────────────────────────────────────
  const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
  if (fkViolations.length > 0) {
    log('err', `PRAGMA foreign_key_check reportó ${fkViolations.length} violaciones:`);
    for (const v of fkViolations) console.log('    ', v);
    throw new Error('integridad referencial rota');
  }
  log('ok', 'PRAGMA foreign_key_check: sin violaciones');

  // ─────────────────────────────────────────────────────────────────
  // 6. Reporte de conteos.
  // ─────────────────────────────────────────────────────────────────
  console.log('\n=== ESTADO POST-MIGRACIÓN FASE 2 ===');
  const tablasInteres = [
    'instituciones','contratos','comparecientes','garantias',   // Fase 1 (no debe haber cambios)
    'firmas','sociedades','accionistas','representantes_sa',
    'direcciones_sa','sociedades_tokens','correcciones_sa',     // Fase 2
    'users','audit_log',
  ];
  for (const t of tablasInteres) {
    if (!tableExists(db, t)) { console.log(`  ${t.padEnd(28)} N/A`); continue; }
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    console.log(`  ${t.padEnd(28)} ${n}`);
  }

  console.log('\n[migrate:fase2-sa] DONE');
  return {
    firma_master_id: firmaMasterId,
    audit_backfill_filas: backfillResult.changes,
  };
}

module.exports = { run };

// ─────────────────────────────────────────────────────────────────
// Modo CLI: `node scripts/migrate-fase2-sa.js`
// (mantiene el comportamiento previo — abre la DB, hace backup, corre, cierra).
// ─────────────────────────────────────────────────────────────────
if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
  const { DB_PATH } = require('../config');

  // Backup pre-migración (solo en CLI; el modo módulo asume que el caller
  // backupea por separado o que no es necesario porque el schema ya está
  // en producción por db.js boot).
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[migrate:fase2-sa] ERR No existe DB en ${DB_PATH}. Nada que migrar.`);
    process.exit(1);
  }
  const fechaTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `${DB_PATH}.pre-fase2-sa-${fechaTag}`;
  fs.copyFileSync(DB_PATH, backupPath);
  log('ok', `backup creado: ${path.basename(backupPath)}`);

  const db = require('../db');
  try {
    const result = run(db);
    console.log(`\nFirma master: id=${result.firma_master_id}`);
    console.log(`Backfill audit_log: ${result.audit_backfill_filas} filas`);
    console.log(`Backup: ${backupPath}`);
    db.close();
    process.exit(0);
  } catch (e) {
    log('err', `MIGRACIÓN ABORTADA: ${e.message}`);
    log('err', `La DB no fue modificada destructivamente. Revisar backup: ${backupPath}`);
    db.close();
    process.exit(1);
  }
}
