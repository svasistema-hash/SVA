// Paso 3.4 — Migración de datos a AES-256-GCM + HMAC.
//
// IDEMPOTENTE: si re-corre, isEncrypted() filtra filas ya migradas.
//
// Cubre:
//   clientes:     dpi, nit, conyuge_dpi → encrypt + hash(purpose)
//                 ingresos              → normalizeMoney + encrypt
//                 domicilio             → encrypt (sin hash)
//   fiadores:     dpi                   → encrypt + hash 'dpi' (tabla vacía hoy)
//   representantes: dpi                 → encrypt (sin hash)
//   contratos:    datos_cliente         → JSON.parse → JSON.stringify → encrypt
//                 datos_garantia        → idem

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const Database = require('better-sqlite3');
const { encrypt, decrypt, hashFor, isEncrypted } = require('../../encryption');
const { normalizeMoney } = require('../../utils/money');

const BACKEND = path.join(__dirname, '..', '..');
const DB_PATH = path.join(BACKEND, 'lexdocs.db');
const BACKUP_BIN = path.join(BACKEND, 'lexdocs.db.pre-encryption-2026-05-18');
const BACKUP_SQL = path.join(BACKEND, 'lexdocs.db.pre-encryption-2026-05-18.sql');

// ─── Phase 1: Pre-checks ───────────────────────────────────────
for (const f of [BACKUP_BIN, BACKUP_SQL]) {
  if (!fs.existsSync(f)) { console.error(`ABORT: backup no encontrado: ${f}`); process.exit(1); }
  if (fs.statSync(f).size === 0) { console.error(`ABORT: backup vacío: ${f}`); process.exit(1); }
}
console.log('Pre-check: backups en disco OK.');
if (!process.env.ENCRYPTION_KEY || !/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY)) {
  console.error('ABORT: ENCRYPTION_KEY inválida.'); process.exit(1);
}
console.log('Pre-check: ENCRYPTION_KEY OK (64 hex chars).');

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// ─── Phase 2: Snapshot de plaintext en memoria (para verificación) ───
console.log('\nCargando snapshot de valores originales (plaintext) para verificación post...');
const snap = {
  clientes: db.prepare('SELECT id, dpi, nit, conyuge_dpi, ingresos, domicilio FROM clientes').all(),
  fiadores: db.prepare('SELECT id, dpi FROM fiadores').all(),
  representantes: db.prepare('SELECT id, dpi FROM representantes').all(),
  contratos: db.prepare('SELECT id, datos_cliente, datos_garantia FROM contratos').all(),
};

// ─── Phase 3: Pre-counts ───────────────────────────────────────
function countNonNull(table, col) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE "${col}" IS NOT NULL AND "${col}" != ''`).get().n;
}
const preCounts = {
  'clientes.dpi':             countNonNull('clientes', 'dpi'),
  'clientes.nit':             countNonNull('clientes', 'nit'),
  'clientes.conyuge_dpi':     countNonNull('clientes', 'conyuge_dpi'),
  'clientes.ingresos':        countNonNull('clientes', 'ingresos'),
  'clientes.domicilio':       countNonNull('clientes', 'domicilio'),
  'fiadores.dpi':             countNonNull('fiadores', 'dpi'),
  'representantes.dpi':       countNonNull('representantes', 'dpi'),
  'contratos.datos_cliente':  countNonNull('contratos', 'datos_cliente'),
  'contratos.datos_garantia': countNonNull('contratos', 'datos_garantia'),
};

const stats = {};
for (const k of Object.keys(preCounts)) stats[k] = { procesadas: 0, skipped: 0, errores: [] };
function K(t, c) { return `${t}.${c}`; }

// ─── Phase 4: Migración en transacción única ──────────────────
console.log('\nIniciando migración (transacción única)...');
db.exec('BEGIN');
try {
  // 4.1) Campos buscables en clientes: (col, hashCol, purpose)
  for (const [col, hashCol, purpose] of [
    ['dpi',         'dpi_hash',         'dpi'],
    ['nit',         'nit_hash',         'nit'],
    ['conyuge_dpi', 'conyuge_dpi_hash', 'dpi'],
  ]) {
    const k = K('clientes', col);
    const rows = db.prepare(`SELECT id, "${col}" AS v FROM clientes WHERE "${col}" IS NOT NULL AND "${col}" != ''`).all();
    const upd = db.prepare(`UPDATE clientes SET "${col}" = ?, "${hashCol}" = ? WHERE id = ?`);
    for (const r of rows) {
      try {
        if (isEncrypted(r.v)) { stats[k].skipped++; continue; }
        upd.run(encrypt(r.v), hashFor(purpose, r.v), r.id);
        stats[k].procesadas++;
      } catch (e) {
        stats[k].errores.push({ id: r.id, msg: e.message });
      }
    }
  }

  // 4.2) clientes.ingresos
  {
    const k = K('clientes', 'ingresos');
    const rows = db.prepare(`SELECT id, ingresos AS v FROM clientes WHERE ingresos IS NOT NULL AND ingresos != ''`).all();
    const upd = db.prepare(`UPDATE clientes SET ingresos = ? WHERE id = ?`);
    for (const r of rows) {
      try {
        if (isEncrypted(r.v)) { stats[k].skipped++; continue; }
        const norm = normalizeMoney(r.v);
        if (norm === null) { stats[k].errores.push({ id: r.id, msg: 'normalizeMoney → null (valor inválido: ' + JSON.stringify(r.v) + ')' }); continue; }
        upd.run(encrypt(norm), r.id);
        stats[k].procesadas++;
      } catch (e) {
        stats[k].errores.push({ id: r.id, msg: e.message });
      }
    }
  }

  // 4.3) clientes.domicilio
  {
    const k = K('clientes', 'domicilio');
    const rows = db.prepare(`SELECT id, domicilio AS v FROM clientes WHERE domicilio IS NOT NULL AND domicilio != ''`).all();
    const upd = db.prepare(`UPDATE clientes SET domicilio = ? WHERE id = ?`);
    for (const r of rows) {
      try {
        if (isEncrypted(r.v)) { stats[k].skipped++; continue; }
        upd.run(encrypt(r.v), r.id);
        stats[k].procesadas++;
      } catch (e) {
        stats[k].errores.push({ id: r.id, msg: e.message });
      }
    }
  }

  // 4.4) fiadores.dpi
  {
    const k = K('fiadores', 'dpi');
    const rows = db.prepare(`SELECT id, dpi AS v FROM fiadores WHERE dpi IS NOT NULL AND dpi != ''`).all();
    const upd = db.prepare(`UPDATE fiadores SET dpi = ?, dpi_hash = ? WHERE id = ?`);
    for (const r of rows) {
      try {
        if (isEncrypted(r.v)) { stats[k].skipped++; continue; }
        upd.run(encrypt(r.v), hashFor('dpi', r.v), r.id);
        stats[k].procesadas++;
      } catch (e) {
        stats[k].errores.push({ id: r.id, msg: e.message });
      }
    }
  }

  // 4.5) representantes.dpi
  {
    const k = K('representantes', 'dpi');
    const rows = db.prepare(`SELECT id, dpi AS v FROM representantes WHERE dpi IS NOT NULL AND dpi != ''`).all();
    const upd = db.prepare(`UPDATE representantes SET dpi = ? WHERE id = ?`);
    for (const r of rows) {
      try {
        if (isEncrypted(r.v)) { stats[k].skipped++; continue; }
        upd.run(encrypt(r.v), r.id);
        stats[k].procesadas++;
      } catch (e) {
        stats[k].errores.push({ id: r.id, msg: e.message });
      }
    }
  }

  // 4.6) contratos.datos_cliente y datos_garantia
  for (const col of ['datos_cliente', 'datos_garantia']) {
    const k = K('contratos', col);
    const rows = db.prepare(`SELECT id, "${col}" AS v FROM contratos WHERE "${col}" IS NOT NULL AND "${col}" != ''`).all();
    const upd = db.prepare(`UPDATE contratos SET "${col}" = ? WHERE id = ?`);
    for (const r of rows) {
      try {
        if (isEncrypted(r.v)) { stats[k].skipped++; continue; }
        let parsed;
        try { parsed = JSON.parse(r.v); }
        catch (e) { stats[k].errores.push({ id: r.id, msg: 'JSON.parse: ' + e.message }); continue; }
        upd.run(encrypt(JSON.stringify(parsed)), r.id);
        stats[k].procesadas++;
      } catch (e) {
        stats[k].errores.push({ id: r.id, msg: e.message });
      }
    }
  }

  const hardErrors = Object.entries(stats).flatMap(([k, s]) => s.errores.map((e) => ({ campo: k, ...e })));
  if (hardErrors.length > 0) {
    console.error('Errores durante migración:', JSON.stringify(hardErrors, null, 2));
    throw new Error(`hard_errors: ${hardErrors.length}`);
  }

  db.exec('COMMIT');
  console.log('Transacción COMMIT OK.');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('ROLLBACK ejecutado por error:', e.message);
  process.exit(2);
}

// ─── Phase 5: Verificación post-commit ────────────────────────
console.log('\n=== Verificación post-commit ===');

function countLooksEncrypted(table, col) {
  const rows = db.prepare(`SELECT "${col}" AS v FROM ${table} WHERE "${col}" IS NOT NULL AND "${col}" != ''`).all();
  return rows.filter((r) => isEncrypted(r.v)).length;
}
const verA = {};
for (const k of Object.keys(preCounts)) {
  const [t, c] = k.split('.');
  verA[k] = { pre_nonnull: preCounts[k], post_encrypted: countLooksEncrypted(t, c) };
}

const totalProcesadas = Object.values(stats).reduce((s, x) => s + x.procesadas, 0);
const spotChecks = [];
if (totalProcesadas === 0) {
  console.log('\n(Re-ejecución idempotente: 0 filas procesadas, spot-checks no aplican.)');
} else {

{
  const pre = snap.clientes.find((r) => r.id === 1);
  const now = db.prepare('SELECT * FROM clientes WHERE id = ?').get(1);
  const dec = {
    dpi: decrypt(now.dpi), nit: decrypt(now.nit),
    ingresos: decrypt(now.ingresos), domicilio: decrypt(now.domicilio),
  };
  spotChecks.push({
    tabla: 'clientes', id: 1,
    original: { dpi: pre.dpi, nit: pre.nit, ingresos: pre.ingresos, domicilio: pre.domicilio },
    ciphertext_sample: { dpi: now.dpi?.slice(0, 44) + '…', nit: now.nit?.slice(0, 44) + '…' },
    hashes: { dpi_hash: now.dpi_hash, nit_hash: now.nit_hash },
    decrypt: dec,
    roundtrip: {
      dpi: dec.dpi === pre.dpi,
      nit: dec.nit === pre.nit,
      ingresos_normalized: dec.ingresos === normalizeMoney(pre.ingresos),
      domicilio: dec.domicilio === pre.domicilio,
    },
    hash_check: {
      dpi: now.dpi_hash === hashFor('dpi', pre.dpi),
      nit: now.nit_hash === hashFor('nit', pre.nit),
    },
  });
}

{
  const pre = snap.clientes.find((r) => r.id === 6);
  if (pre && pre.conyuge_dpi) {
    const now = db.prepare('SELECT * FROM clientes WHERE id = ?').get(6);
    const decC = decrypt(now.conyuge_dpi);
    spotChecks.push({
      tabla: 'clientes', id: 6, campo: 'conyuge_dpi',
      original: pre.conyuge_dpi,
      ciphertext_sample: now.conyuge_dpi?.slice(0, 44) + '…',
      conyuge_dpi_hash: now.conyuge_dpi_hash,
      decrypt: decC,
      roundtrip: decC === pre.conyuge_dpi,
      hash_check: now.conyuge_dpi_hash === hashFor('dpi', pre.conyuge_dpi),
    });
  }
}

{
  const pre = snap.representantes.find((r) => r.id === 1);
  if (pre) {
    const now = db.prepare('SELECT * FROM representantes WHERE id = ?').get(1);
    spotChecks.push({
      tabla: 'representantes', id: 1,
      original: { dpi: pre.dpi },
      ciphertext_sample: { dpi: now.dpi?.slice(0, 44) + '…' },
      decrypt: { dpi: decrypt(now.dpi) },
      roundtrip: { dpi: decrypt(now.dpi) === pre.dpi },
    });
  }
}

{
  const pre = snap.contratos.find((r) => r.id === 2);
  if (pre) {
    const now = db.prepare('SELECT * FROM contratos WHERE id = ?').get(2);
    const dc = JSON.parse(decrypt(now.datos_cliente));
    const dg = JSON.parse(decrypt(now.datos_garantia));
    const dcPre = JSON.parse(pre.datos_cliente);
    const dgPre = JSON.parse(pre.datos_garantia);
    spotChecks.push({
      tabla: 'contratos', id: 2,
      ciphertext_sample: {
        datos_cliente: now.datos_cliente?.slice(0, 44) + '…',
        datos_garantia: now.datos_garantia?.slice(0, 44) + '…',
      },
      decrypted_keys: { datos_cliente: Object.keys(dc), datos_garantia: Object.keys(dg) },
      sample_decrypted: { dpi: dc.dpi, nit: dc.nit, fiador_dpi: dg.fiadores?.[0]?.dpi },
      roundtrip_json_equal: {
        datos_cliente: JSON.stringify(dc) === JSON.stringify(dcPre),
        datos_garantia: JSON.stringify(dg) === JSON.stringify(dgPre),
      },
    });
  }
}

}

// ─── Phase 6: Reporte ─────────────────────────────────────────
console.log('\n=== Tabla resumen ===');
const tableRows = [];
const tot = { pre: 0, proc: 0, skip: 0, err: 0 };
for (const [k, s] of Object.entries(stats)) {
  const [tbl, col] = k.split('.');
  const pre = preCounts[k];
  tableRows.push({ Tabla: tbl, Columna: col, Pre: pre, Procesadas: s.procesadas, Skipped: s.skipped, Errores: s.errores.length });
  tot.pre += pre; tot.proc += s.procesadas; tot.skip += s.skipped; tot.err += s.errores.length;
}
console.table(tableRows);
console.log(`Totales → Pre=${tot.pre}, Procesadas=${tot.proc}, Skipped=${tot.skip}, Errores=${tot.err}`);

console.log('\n=== Verificación (a) counts looks-encrypted ===');
console.table(
  Object.entries(verA).map(([k, v]) => ({
    Tabla_Columna: k,
    Pre_NonNull: v.pre_nonnull,
    Post_Encrypted: v.post_encrypted,
    OK: v.pre_nonnull === v.post_encrypted ? 'OK' : 'FALLA',
  }))
);

if (spotChecks.length > 0) {
  console.log('\n=== Verificación (b/c/d) Spot-checks (roundtrip + hash) ===');
  for (const s of spotChecks) {
    console.log(`\n— ${s.tabla} id=${s.id}${s.campo ? ' campo=' + s.campo : ''}`);
    console.log(JSON.stringify(s, null, 2));
  }
}

db.close();
console.log('\n=== Migración de datos 3.4 completada ===');
