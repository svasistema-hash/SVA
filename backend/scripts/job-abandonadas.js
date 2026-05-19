// F1 — Job de abandonadas.
//
// Recorre contratos en 'en_curso' que no avanzaron en 48h y los mueve a
// 'abandonada_sin_inicio' o 'abandonada_incompleta' según si el cliente
// llegó a cargar datos.
//
// Ejecución manual:
//   node backend/scripts/job-abandonadas.js
//
// En producción se agendará con cron. Cada corrida es idempotente: sólo
// procesa contratos que aún están en 'en_curso' y cuya última actividad
// es > 48h.
//
// "Tiene datos" se determina por la presencia de datos_cliente.dpi o
// datos_cliente.nombre (después de decrypt+parse del JSON encriptado).

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const { decrypt } = require('../encryption');

// Por default 48h. Override via env HOURS=N (útil en tests: HOURS=0).
const HORAS_LIMITE = process.env.HOURS != null ? parseInt(process.env.HOURS, 10) : 48;

const db = new Database(path.join(__dirname, '..', 'lexdocs.db'));

console.log(`=== Job abandonadas — límite ${HORAS_LIMITE}h ===`);

// Contratos en_curso con updated_at más antiguo que el límite.
const cutoff = new Date(Date.now() - HORAS_LIMITE * 60 * 60 * 1000)
  .toISOString().replace('T', ' ').substring(0, 19);
console.log(`Cutoff: ${cutoff} (UTC)`);

const candidatos = db.prepare(
  "SELECT id, no_contrato, institucion_id, estado, datos_cliente, updated_at FROM contratos WHERE estado = 'en_curso' AND updated_at < ?"
).all(cutoff);

console.log(`Candidatos: ${candidatos.length}`);

function tieneDatos(datos_cliente_encrypted) {
  if (!datos_cliente_encrypted) return false;
  try {
    const obj = JSON.parse(decrypt(datos_cliente_encrypted));
    return Boolean(obj && (obj.nombre || obj.dpi));
  } catch {
    return false;
  }
}

// Tanto el UPDATE como el INSERT en audit_log corren en la MISMA conexión
// para evitar deadlock con el lock de escritura de SQLite.
const upd = db.prepare("UPDATE contratos SET estado = ? WHERE id = ?");
const insAudit = db.prepare(`
  INSERT INTO audit_log
    (user_id, user_email, user_role, institucion_id, accion, entidad_tipo, entidad_id, detalles, ip, user_agent)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let movidos_sin_inicio = 0, movidos_incompleta = 0, errores = 0;
db.exec('BEGIN');
try {
  for (const c of candidatos) {
    try {
      const nuevo = tieneDatos(c.datos_cliente) ? 'abandonada_incompleta' : 'abandonada_sin_inicio';
      upd.run(nuevo, c.id);
      insAudit.run(
        null, 'system:job-abandonadas', 'system', c.institucion_id,
        'AUTO_ABANDONADA', 'contrato', c.id,
        JSON.stringify({ de: 'en_curso', a: nuevo, cutoff, updated_at: c.updated_at }),
        null, null
      );
      if (nuevo === 'abandonada_sin_inicio') movidos_sin_inicio++;
      else movidos_incompleta++;
      console.log(`  id=${c.id} ${c.no_contrato}: en_curso → ${nuevo}`);
    } catch (e) {
      errores++;
      console.error(`  id=${c.id}: ERROR ${e.message}`);
    }
  }
  db.exec('COMMIT');
  console.log('COMMIT OK');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('ROLLBACK:', e.message);
  process.exit(1);
}

console.log(`\nResumen: sin_inicio=${movidos_sin_inicio}, incompleta=${movidos_incompleta}, errores=${errores}`);
db.close();
