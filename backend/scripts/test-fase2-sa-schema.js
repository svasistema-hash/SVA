// Sprint LexDocs Legal Fase 2 CP2 — Tests de schema.
//
// Ejecutar: npm run test:fase2-sa-schema
//
// Cubre:
//   T1 Existencia de las 7 tablas + columnas nuevas en users/audit_log.
//   T2 Firma master 'lexdocs-legal' (id=1) existe tras la migración.
//   T3 INSERT válido en firmas (sub-tenant con parent_id=1).
//   T4 CHECK firmas.tipo IN (...) rechaza valores inválidos.
//   T5 CHECK firmas.parent_id != id (una firma no puede ser su propio padre).
//   T6 INSERT válido en sociedades (S.A. mínima).
//   T7 CHECK capital_social >= 5000 rechaza capital menor.
//   T8 CHECK total_acciones > 0 y valor_nominal_accion > 0.
//   T9 CHECK capital_social = total_acciones * valor_nominal_accion (consistencia).
//   T10 CHECK estado IN (lista válida).
//   T11 UNIQUE (firma_id, correlativo) en sociedades.
//   T12 INSERT válido en accionistas con suma % = 100 (en transición a freeze sería validado por app).
//   T13 CHECK acciones_cantidad > 0 y porcentaje 0-100.
//   T14 UNIQUE (sociedad_id, dpi_o_nit_hash) en accionistas.
//   T15 INSERT válido en representantes_sa.
//   T16 CHECK cargo IN (...) en representantes_sa.
//   T17 INSERT válido en direcciones_sa.
//   T18 CHECK tipo IN ('fiscal','comercial','notificaciones') + UNIQUE (sociedad_id, tipo).
//   T19 INSERT válido en sociedades_tokens.
//   T20 INSERT válido en correcciones_sa.
//   T21 CASCADE DELETE: borrar una sociedad borra accionistas/representantes/direcciones/tokens/correcciones.
//   T22 RESTRICT DELETE en firmas → no se permite borrar firma si tiene sociedades.
//   T23 FOREIGN KEY check post-tests sin violaciones.

process.env.NODE_ENV = 'test';

const db = require('../db');

let pass = 0, fail = 0;
const failures = [];

function ok(name) { pass++; console.log(`  PASS  ${name}`); }
function nope(name, expected, actual) {
  fail++; failures.push(name);
  console.log(`  FAIL  ${name}`);
  console.log(`        esperado: ${JSON.stringify(expected)}`);
  console.log(`        actual:   ${JSON.stringify(actual)}`);
}
function eq(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) ok(name);
  else nope(name, expected, actual);
}
function tt(name, cond, info = '') { if (cond) ok(name); else nope(name, true, info || cond); }
function deberiaFallar(name, fn, mensajeEsperado) {
  try { fn(); nope(name, `error con: ${mensajeEsperado}`, 'sin error'); }
  catch (e) {
    if (!mensajeEsperado || (e.message || '').includes(mensajeEsperado)) ok(name);
    else nope(name, `error con: ${mensajeEsperado}`, e.message);
  }
}

// Cleanup previo: borrar datos de pruebas anteriores
function cleanup() {
  const idsFirmas = db.prepare("SELECT id FROM firmas WHERE slug LIKE 'test-cp2-%'").all().map((r) => r.id);
  for (const fid of idsFirmas) {
    db.prepare('DELETE FROM sociedades WHERE firma_id = ?').run(fid);
    db.prepare('DELETE FROM firmas WHERE id = ?').run(fid);
  }
}
cleanup();

console.log('═══════════════════════════════════════════════════════════════════');
console.log(' Sprint LexDocs Legal Fase 2 CP2 — Tests de schema');
console.log('═══════════════════════════════════════════════════════════════════\n');

const idsCreados = { firmas: [], sociedades: [], accionistas: [], representantes: [], direcciones: [], tokens: [], correcciones: [] };

try {
  // ═══════════════════════════════════════════════════════════
  // T1: Existencia de 7 tablas + columnas
  // ═══════════════════════════════════════════════════════════
  console.log('  T1: existencia de tablas y columnas nuevas');
  const tablas = ['firmas','sociedades','accionistas','representantes_sa','direcciones_sa','sociedades_tokens','correcciones_sa'];
  for (const t of tablas) {
    const exists = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(t);
    tt(`T1 tabla "${t}" existe`, exists);
  }
  const usersCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  tt('T1 users.firma_id existe', usersCols.includes('firma_id'));
  const auditCols = db.prepare('PRAGMA table_info(audit_log)').all().map((c) => c.name);
  tt('T1 audit_log.tenant_tipo existe', auditCols.includes('tenant_tipo'));
  tt('T1 audit_log.tenant_id existe', auditCols.includes('tenant_id'));

  // ═══════════════════════════════════════════════════════════
  // T2: Firma master existe
  // ═══════════════════════════════════════════════════════════
  console.log('\n  T2: firma master lexdocs-legal');
  const master = db.prepare("SELECT id, nombre, tipo, parent_id FROM firmas WHERE slug = 'lexdocs-legal'").get();
  tt('T2.1 firma master existe', !!master);
  eq('T2.2 firma master tipo bufete', master?.tipo, 'bufete');
  eq('T2.3 firma master parent_id NULL', master?.parent_id, null);

  // ═══════════════════════════════════════════════════════════
  // T3: INSERT válido sub-tenant
  // ═══════════════════════════════════════════════════════════
  console.log('\n  T3-T5: firmas — INSERT válido + CHECK constraints');
  const subTenantInfo = db.prepare(`
    INSERT INTO firmas (slug, nombre, tipo, parent_id, correlativo_prefijo)
    VALUES ('test-cp2-sub-a', 'Bufete Castillo CP2', 'bufete', 1, 'SA-BCA')
  `).run();
  idsCreados.firmas.push(subTenantInfo.lastInsertRowid);
  tt('T3 sub-tenant INSERT OK', subTenantInfo.changes === 1);

  // T4: CHECK tipo inválido
  deberiaFallar('T4 CHECK firmas.tipo rechaza valor inválido',
    () => db.prepare(`
      INSERT INTO firmas (slug, nombre, tipo, correlativo_prefijo)
      VALUES ('test-cp2-invalid', 'X', 'tipo_inexistente', 'X')
    `).run(),
    'CHECK constraint failed');

  // T5: parent_id == id (self-reference) — solo se puede testear post-INSERT (con UPDATE)
  // El CHECK se evalúa en INSERT con valores literales: no es posible referenciar id durante INSERT.
  // El test concreto es vía UPDATE.
  const subTenantA = idsCreados.firmas[0];
  deberiaFallar('T5 CHECK firmas.parent_id != id (self-reference rechazada)',
    () => db.prepare('UPDATE firmas SET parent_id = ? WHERE id = ?').run(subTenantA, subTenantA),
    'CHECK constraint failed');

  // ═══════════════════════════════════════════════════════════
  // T6-T11: sociedades
  // ═══════════════════════════════════════════════════════════
  console.log('\n  T6-T11: sociedades — INSERT + CHECK constraints');
  const socInfo = db.prepare(`
    INSERT INTO sociedades (
      firma_id, correlativo, tipo_sociedad, denominacion, objeto_social,
      plazo_anios, moneda, capital_social, valor_nominal_accion, total_acciones
    ) VALUES (
      ?, 'SA-BCA-2026-0001', 'sa', 'TECNOLOGÍAS DEL VALLE',
      'El desarrollo, comercialización y mantenimiento de software, así como la prestación de servicios de consultoría tecnológica.',
      99, 'GTQ', 100000.00, 100.00, 1000
    )
  `).run(subTenantA);
  idsCreados.sociedades.push(socInfo.lastInsertRowid);
  tt('T6 sociedad mínima INSERT OK', socInfo.changes === 1);

  deberiaFallar('T7 CHECK capital_social >= 5000 rechaza Q4000',
    () => db.prepare(`
      INSERT INTO sociedades (firma_id, correlativo, tipo_sociedad, denominacion, objeto_social, capital_social, valor_nominal_accion, total_acciones)
      VALUES (?, 'SA-BCA-2026-0002', 'sa', 'X', 'objeto x', 4000, 10, 400)
    `).run(subTenantA),
    'CHECK constraint failed');

  deberiaFallar('T8a CHECK total_acciones > 0',
    () => db.prepare(`
      INSERT INTO sociedades (firma_id, correlativo, tipo_sociedad, denominacion, objeto_social, capital_social, valor_nominal_accion, total_acciones)
      VALUES (?, 'SA-BCA-2026-0003', 'sa', 'X', 'objeto x', 5000, 5000, 0)
    `).run(subTenantA),
    'CHECK constraint failed');

  deberiaFallar('T8b CHECK valor_nominal_accion > 0',
    () => db.prepare(`
      INSERT INTO sociedades (firma_id, correlativo, tipo_sociedad, denominacion, objeto_social, capital_social, valor_nominal_accion, total_acciones)
      VALUES (?, 'SA-BCA-2026-0004', 'sa', 'X', 'objeto x', 5000, 0, 1000)
    `).run(subTenantA),
    'CHECK constraint failed');

  deberiaFallar('T9 CHECK capital = total_acciones * valor_nominal',
    () => db.prepare(`
      INSERT INTO sociedades (firma_id, correlativo, tipo_sociedad, denominacion, objeto_social, capital_social, valor_nominal_accion, total_acciones)
      VALUES (?, 'SA-BCA-2026-0005', 'sa', 'X', 'objeto x', 5000, 10, 100)
    `).run(subTenantA),
    'CHECK constraint failed');

  deberiaFallar('T10 CHECK estado IN (...) rechaza estado inválido',
    () => db.prepare(`
      UPDATE sociedades SET estado = 'estado_inexistente' WHERE id = ?
    `).run(idsCreados.sociedades[0]),
    'CHECK constraint failed');

  deberiaFallar('T11 UNIQUE (firma_id, correlativo) rechaza duplicado',
    () => db.prepare(`
      INSERT INTO sociedades (firma_id, correlativo, tipo_sociedad, denominacion, objeto_social, capital_social, valor_nominal_accion, total_acciones)
      VALUES (?, 'SA-BCA-2026-0001', 'sa', 'OTRA SA', 'otro objeto largo aceptable para test de unique constraint', 5000, 50, 100)
    `).run(subTenantA),
    'UNIQUE constraint failed');

  // ═══════════════════════════════════════════════════════════
  // T12-T14: accionistas
  // ═══════════════════════════════════════════════════════════
  console.log('\n  T12-T14: accionistas');
  const socId = idsCreados.sociedades[0];
  const accInfo = db.prepare(`
    INSERT INTO accionistas (sociedad_id, orden, tipo_persona, nombre, nombre_hash, dpi_o_nit, dpi_o_nit_hash, acciones_cantidad, porcentaje)
    VALUES (?, 1, 'individual', 'CIPHERTEXT_NOMBRE', 'HMAC_NOMBRE_TEST', 'CIPHERTEXT_DPI', 'HMAC_DPI_TEST_1', 1000, 100)
  `).run(socId);
  idsCreados.accionistas.push(accInfo.lastInsertRowid);
  tt('T12 accionista 100% INSERT OK', accInfo.changes === 1);

  deberiaFallar('T13a CHECK acciones_cantidad > 0',
    () => db.prepare(`
      INSERT INTO accionistas (sociedad_id, orden, tipo_persona, nombre, nombre_hash, dpi_o_nit, dpi_o_nit_hash, acciones_cantidad, porcentaje)
      VALUES (?, 2, 'individual', 'X', 'Y', 'Z', 'HMAC_DPI_TEST_2', 0, 0)
    `).run(socId),
    'CHECK constraint failed');

  deberiaFallar('T13b CHECK porcentaje > 100',
    () => db.prepare(`
      INSERT INTO accionistas (sociedad_id, orden, tipo_persona, nombre, nombre_hash, dpi_o_nit, dpi_o_nit_hash, acciones_cantidad, porcentaje)
      VALUES (?, 3, 'individual', 'X', 'Y', 'Z', 'HMAC_DPI_TEST_3', 100, 101)
    `).run(socId),
    'CHECK constraint failed');

  deberiaFallar('T14 UNIQUE (sociedad_id, dpi_o_nit_hash)',
    () => db.prepare(`
      INSERT INTO accionistas (sociedad_id, orden, tipo_persona, nombre, nombre_hash, dpi_o_nit, dpi_o_nit_hash, acciones_cantidad, porcentaje)
      VALUES (?, 4, 'individual', 'X', 'Y', 'Z', 'HMAC_DPI_TEST_1', 100, 10)
    `).run(socId),
    'UNIQUE constraint failed');

  // ═══════════════════════════════════════════════════════════
  // T15-T16: representantes_sa
  // ═══════════════════════════════════════════════════════════
  console.log('\n  T15-T16: representantes_sa');
  const repInfo = db.prepare(`
    INSERT INTO representantes_sa (sociedad_id, orden, nombre, nombre_hash, dpi, dpi_hash, cargo, vigencia_inicio)
    VALUES (?, 1, 'CIPHERTEXT_REP', 'HMAC_REP_NOMBRE_T15', 'CIPHERTEXT_DPI_REP', 'HMAC_REP_DPI_T15', 'Administrador Único', '2026-06-01')
  `).run(socId);
  idsCreados.representantes.push(repInfo.lastInsertRowid);
  tt('T15 representante INSERT OK', repInfo.changes === 1);

  deberiaFallar('T16 CHECK cargo IN (...) rechaza cargo inválido',
    () => db.prepare(`
      INSERT INTO representantes_sa (sociedad_id, orden, nombre, nombre_hash, dpi, dpi_hash, cargo, vigencia_inicio)
      VALUES (?, 2, 'X', 'Y', 'Z', 'HMAC_T16', 'Director Supremo Galáctico', '2026-06-01')
    `).run(socId),
    'CHECK constraint failed');

  // ═══════════════════════════════════════════════════════════
  // T17-T18: direcciones_sa
  // ═══════════════════════════════════════════════════════════
  console.log('\n  T17-T18: direcciones_sa');
  const dirInfo = db.prepare(`
    INSERT INTO direcciones_sa (sociedad_id, tipo, direccion, municipio, departamento)
    VALUES (?, 'fiscal', '12 calle 8-45 zona 10', 'Guatemala', 'Guatemala')
  `).run(socId);
  idsCreados.direcciones.push(dirInfo.lastInsertRowid);
  tt('T17 dirección fiscal INSERT OK', dirInfo.changes === 1);

  deberiaFallar('T18a CHECK tipo IN (...) rechaza tipo inválido',
    () => db.prepare(`
      INSERT INTO direcciones_sa (sociedad_id, tipo, direccion, municipio, departamento)
      VALUES (?, 'oficinas', 'X', 'Y', 'Z')
    `).run(socId),
    'CHECK constraint failed');

  deberiaFallar('T18b UNIQUE (sociedad_id, tipo) — no dos fiscales',
    () => db.prepare(`
      INSERT INTO direcciones_sa (sociedad_id, tipo, direccion, municipio, departamento)
      VALUES (?, 'fiscal', 'OTRA', 'Y', 'Z')
    `).run(socId),
    'UNIQUE constraint failed');

  // ═══════════════════════════════════════════════════════════
  // T19: sociedades_tokens
  // ═══════════════════════════════════════════════════════════
  console.log('\n  T19: sociedades_tokens');
  const tokInfo = db.prepare(`
    INSERT INTO sociedades_tokens (sociedad_id, token, expires_at, iteracion)
    VALUES (?, 'token_test_cp2_random_hex_for_uniqueness_aaaa', datetime('now', '+7 days'), 1)
  `).run(socId);
  idsCreados.tokens.push(tokInfo.lastInsertRowid);
  tt('T19 token INSERT OK', tokInfo.changes === 1);

  // ═══════════════════════════════════════════════════════════
  // T20: correcciones_sa
  // ═══════════════════════════════════════════════════════════
  console.log('\n  T20: correcciones_sa');
  const corrInfo = db.prepare(`
    INSERT INTO correcciones_sa (sociedad_id, iteracion, campos_a_corregir, comentario)
    VALUES (?, 1, '["denominacion","objeto_social"]', 'Necesita aclarar el objeto comercial.')
  `).run(socId);
  idsCreados.correcciones.push(corrInfo.lastInsertRowid);
  tt('T20 corrección INSERT OK', corrInfo.changes === 1);

  // ═══════════════════════════════════════════════════════════
  // T21: CASCADE DELETE
  // ═══════════════════════════════════════════════════════════
  console.log('\n  T21: CASCADE DELETE de sociedad → sub-tablas');
  // Crear segunda sociedad solo para borrarla
  const soc2 = db.prepare(`
    INSERT INTO sociedades (firma_id, correlativo, tipo_sociedad, denominacion, objeto_social, capital_social, valor_nominal_accion, total_acciones)
    VALUES (?, 'SA-BCA-2026-DEL', 'sa', 'A BORRAR', 'objeto a borrar para test cascade delete suficientemente largo', 50000, 100, 500)
  `).run(subTenantA).lastInsertRowid;
  db.prepare(`
    INSERT INTO accionistas (sociedad_id, orden, tipo_persona, nombre, nombre_hash, dpi_o_nit, dpi_o_nit_hash, acciones_cantidad, porcentaje)
    VALUES (?, 1, 'individual', 'X', 'Y_T21', 'Z', 'HMAC_T21_DPI', 500, 100)
  `).run(soc2);
  db.prepare(`
    INSERT INTO representantes_sa (sociedad_id, orden, nombre, nombre_hash, dpi, dpi_hash, cargo, vigencia_inicio)
    VALUES (?, 1, 'X', 'Y_T21_REP', 'Z', 'HMAC_T21_REP_DPI', 'Presidente', '2026-06-01')
  `).run(soc2);
  db.prepare(`DELETE FROM sociedades WHERE id = ?`).run(soc2);

  const accRestantes = db.prepare('SELECT COUNT(*) AS n FROM accionistas WHERE sociedad_id = ?').get(soc2).n;
  const repRestantes = db.prepare('SELECT COUNT(*) AS n FROM representantes_sa WHERE sociedad_id = ?').get(soc2).n;
  eq('T21a accionistas cascade-borrados', accRestantes, 0);
  eq('T21b representantes cascade-borrados', repRestantes, 0);

  // ═══════════════════════════════════════════════════════════
  // T22: RESTRICT DELETE en firmas
  // ═══════════════════════════════════════════════════════════
  console.log('\n  T22: RESTRICT DELETE firma con sociedades');
  deberiaFallar('T22 DELETE firma con sociedades vivas rechazado',
    () => db.prepare('DELETE FROM firmas WHERE id = ?').run(subTenantA),
    'FOREIGN KEY constraint failed');

  // ═══════════════════════════════════════════════════════════
  // T23: PRAGMA foreign_key_check
  // ═══════════════════════════════════════════════════════════
  console.log('\n  T23: PRAGMA foreign_key_check');
  const fkV = db.prepare('PRAGMA foreign_key_check').all();
  eq('T23 0 violaciones', fkV.length, 0);

} finally {
  // Cleanup completo
  for (const id of idsCreados.correcciones) db.prepare('DELETE FROM correcciones_sa WHERE id = ?').run(id);
  for (const id of idsCreados.tokens) db.prepare('DELETE FROM sociedades_tokens WHERE id = ?').run(id);
  for (const id of idsCreados.direcciones) db.prepare('DELETE FROM direcciones_sa WHERE id = ?').run(id);
  for (const id of idsCreados.representantes) db.prepare('DELETE FROM representantes_sa WHERE id = ?').run(id);
  for (const id of idsCreados.accionistas) db.prepare('DELETE FROM accionistas WHERE id = ?').run(id);
  for (const id of idsCreados.sociedades) db.prepare('DELETE FROM sociedades WHERE id = ?').run(id);
  for (const id of idsCreados.firmas) db.prepare('DELETE FROM firmas WHERE id = ?').run(id);
}

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log(` Resultado: ${pass} PASS · ${fail} FAIL`);
if (fail > 0) { console.log(' FAILS:'); failures.forEach((f) => console.log(`   - ${f}`)); }
console.log('═══════════════════════════════════════════════════════════════════');
process.exit(fail > 0 ? 1 : 0);
