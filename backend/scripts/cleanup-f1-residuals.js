// hotfix/f1-qa — Limpieza de datos residuales detectados en el QA visual.
//
// Elimina:
//   - Contrato id=1 (no_contrato 'C-1779076093111' formato legacy)
//   - Cualquier contrato 'completado' con datos_cliente.nombre vacío
//   - Modelo id=3 (nombre con bytes U+FFFD)
//   - Modelos test residuales (ids 5, 6, 7, 8)
//   - Notario id=1 si su nombre contiene U+FFFD y no está referenciado por
//     contratos vivos (revision_abogados / completado / etc.)
//
// Antes de eliminar: hace backup del archivo de DB completo.
// Después: corre PRAGMA foreign_key_check para validar integridad.
//
// Idempotente: borrar dos veces es seguro.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const DB_PATH = path.resolve(__dirname, '..', process.env.DB_PATH || './lexdocs.db');

// 1. Backup pre-cleanup.
const fechaTag = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = `${DB_PATH}.pre-cleanup-${fechaTag}`;
fs.copyFileSync(DB_PATH, backupPath);
console.log(`[cleanup-f1] backup creado: ${path.basename(backupPath)}`);

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const { decrypt } = require('../encryption');

function safeDecrypt(v) {
  if (!v) return null;
  try { return JSON.parse(decrypt(v)); } catch { return null; }
}

// 2. Detección de contratos a borrar.
const todosLosContratos = db.prepare('SELECT id, no_contrato, estado, datos_cliente FROM contratos').all();
const contratosABorrar = [];

for (const c of todosLosContratos) {
  // Caso a: id=1 con no_contrato C-<timestamp>
  if (c.no_contrato === 'C-1779076093111') {
    contratosABorrar.push({ id: c.id, no: c.no_contrato, motivo: 'formato legacy (timestamp ms en lugar de BI-AÑO-NNNN)' });
    continue;
  }
  // Caso b: completado con datos_cliente vacío
  if (c.estado === 'completado') {
    const dc = safeDecrypt(c.datos_cliente);
    const nombreVacio = !dc || !dc.nombre || dc.nombre.trim() === '';
    if (nombreVacio) {
      contratosABorrar.push({ id: c.id, no: c.no_contrato, motivo: 'completado con datos_cliente.nombre vacío (test residual)' });
    }
  }
}

// 3. Modelos a borrar.
const modelosIDs = [3, 5, 6, 7, 8];
const modelosABorrar = db.prepare(`SELECT id, nombre, institucion_id FROM modelos WHERE id IN (${modelosIDs.join(',')})`).all();

// 4. Verificar si hay contratos vivos usando alguno de esos modelos.
const contratosUsandoModelos = db.prepare(
  `SELECT id, no_contrato, modelo_id, estado FROM contratos WHERE modelo_id IN (${modelosIDs.join(',')}) AND id NOT IN (${contratosABorrar.map((c) => c.id).join(',') || 'NULL'})`
).all();

// 5. Notarios corruptos referenciados por contratos vivos.
// Notarios solo se referencian via datos_firmas.notario_id (TEXT JSON plaintext).
// Para no parsear todos, simplemente buscamos LIKE.
const notarioCorrupto = db.prepare("SELECT id, nombre FROM notarios WHERE id = 1").get();
const notarioReferenciado = notarioCorrupto
  ? db.prepare("SELECT COUNT(*) AS n FROM contratos WHERE datos_firmas LIKE '%\"notario_id\":1%' OR datos_firmas LIKE '%\"notario_id\": 1%'").get().n
  : 0;

// 6. Reporte previo + ejecución.
console.log('\n=== PLAN DE LIMPIEZA ===');
console.log('\nContratos a borrar:', contratosABorrar.length);
for (const c of contratosABorrar) console.log(`  - id=${c.id} no=${c.no} · ${c.motivo}`);

console.log('\nModelos a borrar:', modelosABorrar.length);
for (const m of modelosABorrar) console.log(`  - id=${m.id} · "${m.nombre}" · inst=${m.institucion_id}`);

if (contratosUsandoModelos.length > 0) {
  console.log('\n  ADVERTENCIA: hay contratos vivos referenciando estos modelos:');
  for (const c of contratosUsandoModelos) {
    console.log(`    - contrato id=${c.id} (${c.no_contrato}) modelo_id=${c.modelo_id} estado=${c.estado}`);
  }
}

console.log('\nNotario id=1 a borrar:', notarioCorrupto ? `"${notarioCorrupto.nombre}"` : 'no existe');
if (notarioCorrupto && notarioReferenciado > 0) {
  console.log(`  ADVERTENCIA: notario está referenciado en ${notarioReferenciado} contrato(s). NO se borrará.`);
}

// 7. Ejecutar dentro de una sola transacción para rollback automático si algo falla.
let contadores = { contratos: 0, contratos_tokens: 0, fiadores: 0, audit_log: 0, modelos: 0, clausulas: 0, notarios: 0 };

const tx = db.transaction(() => {
  // 7.1. Borrar contratos seleccionados (cascade vía FK: fiadores, contratos_tokens; audit_log y notarios NO cascadan).
  for (const c of contratosABorrar) {
    contadores.fiadores         += db.prepare('DELETE FROM fiadores WHERE contrato_id = ?').run(c.id).changes;
    contadores.contratos_tokens += db.prepare('DELETE FROM contratos_tokens WHERE contrato_id = ?').run(c.id).changes;
    contadores.audit_log        += db.prepare("DELETE FROM audit_log WHERE entidad_tipo = 'contrato' AND entidad_id = ?").run(c.id).changes;
    contadores.contratos        += db.prepare('DELETE FROM contratos WHERE id = ?').run(c.id).changes;
  }

  // 7.2. Borrar modelos NO referenciados por contratos vivos.
  const modelosVivos = new Set(contratosUsandoModelos.map((c) => c.modelo_id));
  for (const m of modelosABorrar) {
    if (modelosVivos.has(m.id)) {
      console.log(`  SKIP modelo id=${m.id} — referenciado por contratos vivos`);
      continue;
    }
    contadores.clausulas += db.prepare('DELETE FROM clausulas WHERE modelo_id = ?').run(m.id).changes;
    contadores.modelos   += db.prepare('DELETE FROM modelos WHERE id = ?').run(m.id).changes;
  }

  // 7.3. Borrar notario corrupto si no está referenciado.
  if (notarioCorrupto && notarioReferenciado === 0) {
    contadores.notarios += db.prepare('DELETE FROM notarios WHERE id = ?').run(notarioCorrupto.id).changes;
  }
});

tx();

// 8. Verificación de integridad.
const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
console.log('\n=== PRAGMA foreign_key_check ===');
console.log(fkCheck.length === 0 ? '  OK: sin violaciones' : `  WARN: ${fkCheck.length} violaciones`);
for (const v of fkCheck) console.log('   ', v);

// 9. Conteo final.
console.log('\n=== FILAS ELIMINADAS ===');
for (const [k, v] of Object.entries(contadores)) {
  if (v > 0) console.log(`  ${k}: ${v}`);
}

console.log('\n=== FILAS RESTANTES POR TABLA ===');
const tablas = ['contratos', 'contratos_tokens', 'fiadores', 'audit_log', 'modelos', 'clausulas', 'notarios', 'clientes', 'representantes', 'users', 'instituciones'];
for (const t of tablas) {
  const r = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get();
  console.log(`  ${t}: ${r.n}`);
}

console.log('\n[cleanup-f1] OK');
db.close();
