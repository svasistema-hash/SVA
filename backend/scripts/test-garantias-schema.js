// Sprint garantías-desacopladas CP2 — tests de schema de las 4 tablas nuevas.
//
// Ejecutar: npm run test:garantias-schema
//
// Verifica:
//   T1  INSERT comparecientes con todos los campos cifrados; recuperar por dpi_hash.
//   T2  UNIQUE (institucion_id, dpi_hash) en comparecientes (rechaza duplicado).
//   T3  INSERT garantías tipo='fiduciaria' con solidaria=0 y solidaria=1, datos=NULL,
//       aportante_* NULL — debe PASS.
//   T4  Rechaza fiduciaria con datos no NULL (CHECK constraint).
//   T5  Rechaza fiduciaria con aportante_tipo='cliente' (CHECK constraint).
//   T6  INSERT garantía tipo='hipotecaria' con aportante=cliente — PASS.
//   T7  INSERT garantía tipo='hipotecaria' con aportante=compareciente — PASS.
//   T8  Rechaza hipotecaria con aportante_tipo NULL (CHECK constraint).
//   T9  Rechaza hipotecaria con ambos FK de aportante poblados.
//   T10 Rechaza hipotecaria con solidaria=1 (CHECK constraint).
//   T11 INSERT contrato_comparecientes con rol='fiador' y 'tercero_garante'.
//   T12 Rechaza rol fuera del enum.
//   T13 Rechaza agregado_por_actor fuera del enum.
//   T14 INSERT contrato_garantias vinculando una garantía existente — PASS.
//   T15 Cifrado PII: el campo dpi en la tabla NO es plaintext (no contiene el DPI legible).
//   T16 PRAGMA foreign_key_check sin violaciones al final.

const path = require('path');
process.env.NODE_ENV = 'test';

const db = require('../db');
const { encrypt, decrypt, hashFor } = require('../encryption');

let pass = 0, fail = 0;
const failures = [];

function ok(name) { pass++; console.log(`  PASS  ${name}`); }
function nope(name, expected, actual) {
  fail++;
  failures.push(name);
  console.log(`  FAIL  ${name}`);
  console.log(`        esperado: ${JSON.stringify(expected)}`);
  console.log(`        actual:   ${JSON.stringify(actual)}`);
}
function eq(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(name);
  else nope(name, expected, actual);
}
function tt(name, cond, info = '') { if (cond) ok(name); else nope(name, true, info || cond); }

function expectThrows(name, fn, mustMatch) {
  try {
    fn();
    nope(name, `throws matching ${mustMatch}`, 'did not throw');
  } catch (e) {
    const msg = String(e.message || e);
    if (!mustMatch || new RegExp(mustMatch, 'i').test(msg)) ok(name);
    else nope(name, `throws matching ${mustMatch}`, msg);
  }
}

// ─────────────────────────────────────────────────────────────────
// SETUP: insertar una institución y un cliente de prueba para FKs
// ─────────────────────────────────────────────────────────────────

const SUFFIX = `t${Date.now()}`;
const idsParaLimpiar = {
  comparecientes: [],
  garantias: [],
  contratos: [],
  clientes: [],
  instituciones: [],
};

function setup() {
  const inst = db.prepare(
    `INSERT INTO instituciones (slug, tipo, nombre) VALUES (?, ?, ?)`
  ).run(`test-${SUFFIX}`, 'banco', `Test ${SUFFIX}`);
  const instId = inst.lastInsertRowid;
  idsParaLimpiar.instituciones.push(instId);

  const cli = db.prepare(
    `INSERT INTO clientes (institucion_id, nombre) VALUES (?, ?)`
  ).run(instId, 'CLIENTE TEST');
  const cliId = cli.lastInsertRowid;
  idsParaLimpiar.clientes.push(cliId);

  // Modelo + contrato fake
  const mod = db.prepare(
    `INSERT INTO modelos (institucion_id, nombre, tipo_garantia) VALUES (?, ?, ?)`
  ).run(instId, `Modelo Test ${SUFFIX}`, 'hipotecaria');
  const modId = mod.lastInsertRowid;

  const cto = db.prepare(
    `INSERT INTO contratos (institucion_id, modelo_id, no_contrato) VALUES (?, ?, ?)`
  ).run(instId, modId, `CT-TEST-${SUFFIX}`);
  const ctoId = cto.lastInsertRowid;
  idsParaLimpiar.contratos.push(ctoId);

  return { instId, cliId, ctoId, modId };
}

function cleanup() {
  for (const ctoId of idsParaLimpiar.contratos) {
    db.prepare('DELETE FROM contrato_comparecientes WHERE contrato_id = ?').run(ctoId);
    db.prepare('DELETE FROM contrato_garantias WHERE contrato_id = ?').run(ctoId);
    db.prepare('DELETE FROM contratos WHERE id = ?').run(ctoId);
  }
  for (const id of idsParaLimpiar.garantias) {
    db.prepare('DELETE FROM garantias WHERE id = ?').run(id);
  }
  for (const id of idsParaLimpiar.comparecientes) {
    db.prepare('DELETE FROM comparecientes WHERE id = ?').run(id);
  }
  for (const id of idsParaLimpiar.clientes) {
    db.prepare('DELETE FROM clientes WHERE id = ?').run(id);
  }
  for (const id of idsParaLimpiar.instituciones) {
    // Modelos cascadan vía instituciones; clausulas vía modelos
    db.prepare('DELETE FROM modelos WHERE institucion_id = ?').run(id);
    db.prepare('DELETE FROM instituciones WHERE id = ?').run(id);
  }
}

function insertCompareciente({ instId, dpi, nombre = 'PEDRO PERALTA' }) {
  const info = db.prepare(`
    INSERT INTO comparecientes (
      institucion_id, nombre, nombre_hash, dpi, dpi_hash, profesion, estado_civil, domicilio
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    instId,
    encrypt(nombre),
    hashFor('nombre', nombre),
    encrypt(dpi),
    hashFor('dpi', dpi),
    encrypt('INGENIERO'),
    encrypt('CASADO'),
    encrypt('5a. Avenida 10-20 zona 1'),
  );
  idsParaLimpiar.comparecientes.push(info.lastInsertRowid);
  return info.lastInsertRowid;
}

// ─────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════');
console.log(' Sprint garantías-desacopladas CP2 — Schema');
console.log('═══════════════════════════════════════════');

let ctx;
try {
  ctx = setup();
  console.log(`  Setup: inst=${ctx.instId} cli=${ctx.cliId} cto=${ctx.ctoId}`);

  // ───── T1: INSERT compareciente con cifrado ─────
  console.log('\n  T1: INSERT compareciente con PII cifrada');
  const dpi1 = '1234567890101';
  const compId = insertCompareciente({ instId: ctx.instId, dpi: dpi1, nombre: 'JUAN GARCIA' });
  tt('T1.1 compareciente creado (id > 0)', compId > 0, `id=${compId}`);
  const row1 = db.prepare('SELECT * FROM comparecientes WHERE id = ?').get(compId);
  tt('T1.2 dpi_hash determinístico', row1.dpi_hash === hashFor('dpi', dpi1), { tabla: row1.dpi_hash, calculado: hashFor('dpi', dpi1) });
  eq('T1.3 nombre descifrable', decrypt(row1.nombre), 'JUAN GARCIA');
  eq('T1.4 dpi descifrable', decrypt(row1.dpi), dpi1);
  eq('T1.5 profesion descifrable', decrypt(row1.profesion), 'INGENIERO');
  eq('T1.6 estado_civil descifrable', decrypt(row1.estado_civil), 'CASADO');
  eq('T1.7 domicilio descifrable', decrypt(row1.domicilio), '5a. Avenida 10-20 zona 1');

  // ───── T2: UNIQUE (institucion_id, dpi_hash) ─────
  console.log('\n  T2: UNIQUE (institucion_id, dpi_hash) en comparecientes');
  expectThrows('T2.1 segundo INSERT con mismo dpi en la institución → UNIQUE',
    () => insertCompareciente({ instId: ctx.instId, dpi: dpi1, nombre: 'JUAN GARCIA' }),
    'UNIQUE');

  // ───── T3: garantía fiduciaria ─────
  console.log('\n  T3: garantía tipo=fiduciaria (con y sin solidaria)');
  const fidNoSolidaria = db.prepare(`
    INSERT INTO garantias (institucion_id, tipo, solidaria, datos) VALUES (?, 'fiduciaria', 0, NULL)
  `).run(ctx.instId);
  idsParaLimpiar.garantias.push(fidNoSolidaria.lastInsertRowid);
  tt('T3.1 fiduciaria solidaria=0 creada', fidNoSolidaria.lastInsertRowid > 0);

  const fidSolidaria = db.prepare(`
    INSERT INTO garantias (institucion_id, tipo, solidaria, datos) VALUES (?, 'fiduciaria', 1, NULL)
  `).run(ctx.instId);
  idsParaLimpiar.garantias.push(fidSolidaria.lastInsertRowid);
  tt('T3.2 fiduciaria solidaria=1 creada', fidSolidaria.lastInsertRowid > 0);

  // ───── T4: rechazar fiduciaria con datos no NULL ─────
  console.log('\n  T4: rechazar fiduciaria con datos no NULL');
  expectThrows('T4.1 fiduciaria con datos!=NULL → CHECK',
    () => db.prepare(`
      INSERT INTO garantias (institucion_id, tipo, solidaria, datos) VALUES (?, 'fiduciaria', 0, ?)
    `).run(ctx.instId, encrypt('{"foo":"bar"}')),
    'CHECK');

  // ───── T5: rechazar fiduciaria con aportante ─────
  console.log('\n  T5: rechazar fiduciaria con aportante seteado');
  expectThrows('T5.1 fiduciaria con aportante_tipo=cliente → CHECK',
    () => db.prepare(`
      INSERT INTO garantias (institucion_id, tipo, solidaria, datos, aportante_tipo, aportante_cliente_id)
      VALUES (?, 'fiduciaria', 0, NULL, 'cliente', ?)
    `).run(ctx.instId, ctx.cliId),
    'CHECK');

  // ───── T6: hipotecaria con aportante=cliente ─────
  console.log('\n  T6: hipotecaria con aportante=cliente');
  const datosHip = encrypt(JSON.stringify({ finca: '1234', folio: '56', libro: '78', area: '300 m2' }));
  const hipCli = db.prepare(`
    INSERT INTO garantias (institucion_id, tipo, datos, aportante_tipo, aportante_cliente_id)
    VALUES (?, 'hipotecaria', ?, 'cliente', ?)
  `).run(ctx.instId, datosHip, ctx.cliId);
  idsParaLimpiar.garantias.push(hipCli.lastInsertRowid);
  tt('T6.1 creada con aportante_cliente_id', hipCli.lastInsertRowid > 0);
  const hipCliRow = db.prepare('SELECT * FROM garantias WHERE id = ?').get(hipCli.lastInsertRowid);
  eq('T6.2 aportante_tipo=cliente', hipCliRow.aportante_tipo, 'cliente');
  eq('T6.3 aportante_cliente_id', hipCliRow.aportante_cliente_id, ctx.cliId);
  eq('T6.4 aportante_compareciente_id NULL', hipCliRow.aportante_compareciente_id, null);
  eq('T6.5 datos descifrable', JSON.parse(decrypt(hipCliRow.datos)).finca, '1234');

  // ───── T7: hipotecaria con aportante=compareciente ─────
  console.log('\n  T7: hipotecaria con aportante=compareciente');
  const hipComp = db.prepare(`
    INSERT INTO garantias (institucion_id, tipo, datos, aportante_tipo, aportante_compareciente_id)
    VALUES (?, 'hipotecaria', ?, 'compareciente', ?)
  `).run(ctx.instId, datosHip, compId);
  idsParaLimpiar.garantias.push(hipComp.lastInsertRowid);
  tt('T7.1 creada con aportante_compareciente_id', hipComp.lastInsertRowid > 0);

  // ───── T8: rechazar hipotecaria con aportante_tipo NULL ─────
  console.log('\n  T8: rechazar hipotecaria sin aportante');
  expectThrows('T8.1 hipotecaria sin aportante_tipo → CHECK',
    () => db.prepare(`
      INSERT INTO garantias (institucion_id, tipo, datos) VALUES (?, 'hipotecaria', ?)
    `).run(ctx.instId, datosHip),
    'CHECK');

  // ───── T9: rechazar hipotecaria con ambos FK aportante ─────
  console.log('\n  T9: rechazar hipotecaria con ambos FK de aportante');
  expectThrows('T9.1 ambos FK de aportante → CHECK',
    () => db.prepare(`
      INSERT INTO garantias (institucion_id, tipo, datos, aportante_tipo, aportante_cliente_id, aportante_compareciente_id)
      VALUES (?, 'hipotecaria', ?, 'cliente', ?, ?)
    `).run(ctx.instId, datosHip, ctx.cliId, compId),
    'CHECK');

  // ───── T10: rechazar hipotecaria con solidaria=1 ─────
  console.log('\n  T10: rechazar hipotecaria con solidaria=1');
  expectThrows('T10.1 hipotecaria solidaria=1 → CHECK',
    () => db.prepare(`
      INSERT INTO garantias (institucion_id, tipo, solidaria, datos, aportante_tipo, aportante_cliente_id)
      VALUES (?, 'hipotecaria', 1, ?, 'cliente', ?)
    `).run(ctx.instId, datosHip, ctx.cliId),
    'CHECK');

  // ───── T11: contrato_comparecientes con rol fiador y tercero_garante ─────
  console.log('\n  T11: contrato_comparecientes con rol');
  // Necesitamos un segundo compareciente para no chocar con UNIQUE
  const compId2 = insertCompareciente({ instId: ctx.instId, dpi: '9876543210123', nombre: 'MARÍA LÓPEZ' });
  db.prepare(`
    INSERT INTO contrato_comparecientes
    (contrato_id, compareciente_id, rol, orden, agregado_por_actor)
    VALUES (?, ?, 'fiador', 1, 'banco')
  `).run(ctx.ctoId, compId);
  ok('T11.1 INSERT con rol=fiador');
  db.prepare(`
    INSERT INTO contrato_comparecientes
    (contrato_id, compareciente_id, rol, orden, agregado_por_actor)
    VALUES (?, ?, 'tercero_garante', 2, 'cliente')
  `).run(ctx.ctoId, compId2);
  ok('T11.2 INSERT con rol=tercero_garante');

  // ───── T12: rechazar rol fuera del enum ─────
  console.log('\n  T12: rechazar rol inválido');
  const compId3 = insertCompareciente({ instId: ctx.instId, dpi: '5555666677788', nombre: 'CARLOS RUIZ' });
  expectThrows('T12.1 rol=invalido → CHECK',
    () => db.prepare(`
      INSERT INTO contrato_comparecientes
      (contrato_id, compareciente_id, rol, orden, agregado_por_actor)
      VALUES (?, ?, 'invalido', 99, 'banco')
    `).run(ctx.ctoId, compId3),
    'CHECK');

  // ───── T13: rechazar agregado_por_actor fuera del enum ─────
  console.log('\n  T13: rechazar agregado_por_actor inválido');
  expectThrows('T13.1 agregado_por_actor=admin → CHECK',
    () => db.prepare(`
      INSERT INTO contrato_comparecientes
      (contrato_id, compareciente_id, rol, orden, agregado_por_actor)
      VALUES (?, ?, 'fiador', 99, 'admin')
    `).run(ctx.ctoId, compId3),
    'CHECK');

  // ───── T14: contrato_garantias vinculación ─────
  console.log('\n  T14: contrato_garantias vinculación');
  db.prepare(`
    INSERT INTO contrato_garantias (contrato_id, garantia_id, orden) VALUES (?, ?, 1)
  `).run(ctx.ctoId, hipCli.lastInsertRowid);
  ok('T14.1 vincular hipotecaria-cliente al contrato');
  db.prepare(`
    INSERT INTO contrato_garantias (contrato_id, garantia_id, orden) VALUES (?, ?, 2)
  `).run(ctx.ctoId, fidSolidaria.lastInsertRowid);
  ok('T14.2 vincular fiduciaria solidaria al contrato');
  const cgRows = db.prepare('SELECT * FROM contrato_garantias WHERE contrato_id = ? ORDER BY orden').all(ctx.ctoId);
  eq('T14.3 cantidad de vínculos', cgRows.length, 2);
  eq('T14.4 congelado_en NULL en garantías vivas', cgRows.every((r) => r.congelado_en === null), true);

  // ───── T15: cifrado (sanity check, no plaintext) ─────
  console.log('\n  T15: PII cifrada en disco (no plaintext)');
  const raw = db.prepare('SELECT dpi FROM comparecientes WHERE id = ?').get(compId);
  tt('T15.1 dpi en BD no contiene el DPI plaintext',
    !String(raw.dpi).includes(dpi1),
    `dpi raw=${raw.dpi}, plain=${dpi1}`);
  tt('T15.2 dpi en BD es base64 (formato AES-GCM)', /^[A-Za-z0-9+/]+={0,2}$/.test(raw.dpi), raw.dpi);

  // ───── T16: PRAGMA foreign_key_check final ─────
  console.log('\n  T16: PRAGMA foreign_key_check final');
  const fkv = db.prepare('PRAGMA foreign_key_check').all();
  eq('T16.1 0 violaciones', fkv.length, 0);
  if (fkv.length > 0) console.log('    violaciones:', fkv);

} finally {
  cleanup();
}

console.log('\n═══════════════════════════════════════════');
console.log(` Resultado: ${pass} PASS · ${fail} FAIL`);
if (fail > 0) {
  console.log(' FAILS:');
  failures.forEach((f) => console.log(`   - ${f}`));
}
console.log('═══════════════════════════════════════════');
process.exit(fail > 0 ? 1 : 0);
