// Paso 3.5 (preparación) — limpia duplicación de currency en templates.
// Reemplaza '{{moneda}} {{X}}', 'Q{{X}}' y 'Q {{X}}' por '{{X}}' para
// las variables monetarias. formatQuetzal en el engine ya inyecta "Q".
// IDEMPOTENTE: REPLACE no rompe si el patrón ya no existe.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', '..', 'lexdocs.db'));

const VARS = ['monto', 'cuota_mensual', 'seguro_inmueble', 'valor_bien'];

const patterns = [];
for (const v of VARS) {
  patterns.push({ find: `{{moneda}} {{${v}}}`, replace: `{{${v}}}` });
  patterns.push({ find: `Q {{${v}}}`,           replace: `{{${v}}}` });
  patterns.push({ find: `Q{{${v}}}`,            replace: `{{${v}}}` });
}

console.log('=== Pre-counts (filas con el patrón en texto_base) ===');
const preCounts = patterns.map((p) => {
  const n = db.prepare("SELECT COUNT(*) AS n FROM clausulas WHERE texto_base LIKE '%' || ? || '%'").get(p.find).n;
  return { patrón: p.find, filas_con_patrón: n };
});
console.table(preCounts);

console.log('\n=== Aplicando UPDATEs (transacción única) ===');
const stmt = db.prepare(`UPDATE clausulas SET texto_base = REPLACE(texto_base, ?, ?)`);
const stats = [];
db.exec('BEGIN');
try {
  for (const p of patterns) {
    const r = stmt.run(p.find, p.replace);
    stats.push({ patrón: p.find, filas_afectadas: r.changes });
  }
  db.exec('COMMIT');
  console.log('COMMIT OK');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('ROLLBACK:', e.message);
  process.exit(1);
}
console.table(stats);

console.log('\n=== Post: filas que aún contienen el patrón ===');
const postCounts = patterns.map((p) => {
  const n = db.prepare("SELECT COUNT(*) AS n FROM clausulas WHERE texto_base LIKE '%' || ? || '%'").get(p.find).n;
  return { patrón: p.find, filas_remaining: n };
});
console.table(postCounts);

console.log('\n=== Spot-check: texto_base de cláusulas con variables monetarias ===');
const samples = db.prepare(`
  SELECT id, modelo_id, codigo, substr(texto_base, 1, 240) AS texto_base_preview
  FROM clausulas
  WHERE codigo IN ('primera-monto','tercera-pago','conservacion-inmueble','descripcion-bien')
  ORDER BY modelo_id, orden
`).all();
for (const r of samples) console.log(`  modelo=${r.modelo_id} id=${r.id} [${r.codigo}]\n    ${r.texto_base_preview}\n`);

db.close();
console.log('=== Templates limpiados ===');
