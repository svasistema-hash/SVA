// Re-hashea nit_hash usando normalizeNit (strip verifier). Idempotente:
// si el nit_hash ya coincide con el nuevo cálculo, no se actualiza.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const { decrypt, hashFor, isEncrypted } = require('../encryption');

const db = new Database(path.join(__dirname, '..', 'lexdocs.db'));

const rows = db.prepare("SELECT id, nit, nit_hash FROM clientes WHERE nit IS NOT NULL").all();
console.log(`Filas con nit: ${rows.length}`);

let updated = 0, skipped = 0, errors = 0;
db.exec('BEGIN');
try {
  const upd = db.prepare('UPDATE clientes SET nit_hash = ? WHERE id = ?');
  for (const r of rows) {
    if (!isEncrypted(r.nit)) { skipped++; continue; }
    try {
      const plain = decrypt(r.nit);
      const newHash = hashFor('nit', plain);
      if (newHash !== r.nit_hash) {
        upd.run(newHash, r.id);
        updated++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.error(`error id=${r.id}: ${e.message}`);
      errors++;
    }
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('ROLLBACK:', e.message);
  process.exit(1);
}
console.log(`Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
