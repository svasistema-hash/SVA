// Sprint pendientes-4-7 Parte 7 — tests de integración del endpoint
// POST /api/modelos/:id/clonar.
//
// Ejecutar: node scripts/test-clonar-modelo.js
//
// Verifica:
//   T1 Clonar un modelo crea uno nuevo con activo=0.
//   T2 Todas las cláusulas se copian con orden/codigo/titulo/texto_base.
//   T3 El modelo original no se modifica (clausulas + activo intactos).
//   T4 Audit log registra MODELO_CLONADO con metadatos completos.
//   T5 Nombre por defecto = "<original> (copia)" cuando body.nombre falta.
//   T6 Constraint UNIQUE devuelve 409 cuando se intenta clonar con nombre repetido.

const http = require('http');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';

const db = require('../db');
const app = require('../server');
const { JWT_SECRET } = require('../config');

let pass = 0, fail = 0;
const failures = [];

function ok(name) { pass++; console.log(`  PASS  ${name}`); }
function nope(name, expected, actual) { fail++; failures.push(name); console.log(`  FAIL  ${name}`); console.log(`        esperado: ${JSON.stringify(expected)}`); console.log(`        actual:   ${JSON.stringify(actual)}`); }
function eq(name, actual, expected) { if (JSON.stringify(actual) === JSON.stringify(expected)) ok(name); else nope(name, expected, actual); }
function tt(name, cond, info = '') { if (cond) ok(name); else nope(name, true, info || cond); }

function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

function request(port, method, urlPath, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: '127.0.0.1', port, path: urlPath, method, headers: { ...(headers || {}) } };
    let bodyBuf = null;
    if (body) {
      bodyBuf = Buffer.from(JSON.stringify(body));
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = bodyBuf.length;
    }
    const req = http.request(opts, (res) => {
      const bufs = [];
      res.on('data', (c) => bufs.push(c));
      res.on('end', () => {
        const text = Buffer.concat(bufs).toString('utf-8');
        let data = null;
        try { data = JSON.parse(text); } catch { data = text; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

function createTokenFor(user) {
  return jwt.sign({
    userId: user.id, email: user.email, role: user.role, institucion_id: user.institucion_id,
  }, JWT_SECRET, { expiresIn: '1h' });
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' Sprint pendientes-4-7 Parte 7 — Clonar Modelo');
  console.log('═══════════════════════════════════════════');

  const { server, port } = await startServer();

  const inst = db.prepare('SELECT id, slug, nombre FROM instituciones LIMIT 1').get();
  if (!inst) { console.log('  ERROR: no hay instituciones. Corra seed.js'); server.close(); process.exit(1); }
  const modeloOrigen = db.prepare('SELECT * FROM modelos WHERE institucion_id = ? LIMIT 1').get(inst.id);
  if (!modeloOrigen) { console.log('  ERROR: no hay modelo en la institución. Corra seed.js'); server.close(); process.exit(1); }
  const user = db.prepare("SELECT id, email, role, institucion_id FROM users WHERE institucion_id = ? AND activo = 1 LIMIT 1").get(inst.id);
  if (!user) { console.log('  ERROR: no hay usuario en la institución. Corra seed.js'); server.close(); process.exit(1); }
  console.log(`  Institución: ${inst.slug} · Modelo origen: ${modeloOrigen.nombre} (id ${modeloOrigen.id})`);

  const token = createTokenFor(user);
  const auth = { Authorization: `Bearer ${token}` };

  const clonesCreados = [];

  try {
    const clausulasOriginales = db
      .prepare('SELECT id, orden, codigo, titulo, texto_base FROM clausulas WHERE modelo_id = ? ORDER BY orden')
      .all(modeloOrigen.id);
    tt('PRE: modelo origen tiene cláusulas', clausulasOriginales.length > 0, `count=${clausulasOriginales.length}`);

    // ───── T1: clonar con nombre custom, verifica activo=0 ─────
    console.log('\n  T1: clonar con nombre custom → activo=0');
    const nombreT1 = `Clon Test ${Date.now()}`;
    const r1 = await request(port, 'POST', `/api/modelos/${modeloOrigen.id}/clonar`, {
      headers: auth,
      body: { nombre: nombreT1 },
    });
    eq('T1.1 status 201', r1.status, 201);
    eq('T1.2 nombre asignado', r1.data?.nombre, nombreT1);
    eq('T1.3 activo=0', r1.data?.activo, 0);
    eq('T1.4 institucion_id heredada', r1.data?.institucion_id, modeloOrigen.institucion_id);
    eq('T1.5 tipo_garantia heredado', r1.data?.tipo_garantia, modeloOrigen.tipo_garantia);
    eq('T1.6 clonado_de = origen', r1.data?.clonado_de, modeloOrigen.id);
    eq('T1.7 clausulas_copiadas coincide', r1.data?.clausulas_copiadas, clausulasOriginales.length);
    tt('T1.8 nuevo id != origen', r1.data?.id !== modeloOrigen.id, `nuevo=${r1.data?.id} origen=${modeloOrigen.id}`);
    const cloneId = r1.data.id;
    clonesCreados.push(cloneId);

    // ───── T2: cláusulas copiadas con orden/codigo/titulo/texto_base ─────
    console.log('\n  T2: cláusulas copiadas íntegramente');
    const clausulasClone = db
      .prepare('SELECT orden, codigo, titulo, texto_base FROM clausulas WHERE modelo_id = ? ORDER BY orden')
      .all(cloneId);
    eq('T2.1 misma cantidad de cláusulas', clausulasClone.length, clausulasOriginales.length);
    const originalSlim = clausulasOriginales.map((c) => ({ orden: c.orden, codigo: c.codigo, titulo: c.titulo, texto_base: c.texto_base }));
    eq('T2.2 contenido idéntico (orden/codigo/titulo/texto_base)', clausulasClone, originalSlim);
    const clauseIdsOrig = clausulasOriginales.map((c) => c.id);
    const clauseIdsClone = db.prepare('SELECT id FROM clausulas WHERE modelo_id = ?').all(cloneId).map((c) => c.id);
    tt('T2.3 ids de cláusulas son nuevos (no compartidas)', clauseIdsClone.every((id) => !clauseIdsOrig.includes(id)), { orig: clauseIdsOrig, clone: clauseIdsClone });

    // ───── T3: modelo origen intacto ─────
    console.log('\n  T3: modelo origen no se modificó');
    const origenDespues = db.prepare('SELECT * FROM modelos WHERE id = ?').get(modeloOrigen.id);
    eq('T3.1 nombre origen intacto', origenDespues.nombre, modeloOrigen.nombre);
    eq('T3.2 activo origen intacto', origenDespues.activo, modeloOrigen.activo);
    eq('T3.3 clausulas JSON origen intacto', origenDespues.clausulas, modeloOrigen.clausulas);
    const origenClausulasDespues = db
      .prepare('SELECT id, orden, codigo, titulo, texto_base FROM clausulas WHERE modelo_id = ? ORDER BY orden')
      .all(modeloOrigen.id);
    eq('T3.4 cláusulas origen intactas (incluso ids)', origenClausulasDespues, clausulasOriginales);

    // ───── T4: audit_log MODELO_CLONADO ─────
    console.log('\n  T4: audit_log registra MODELO_CLONADO');
    const audit = db
      .prepare("SELECT * FROM audit_log WHERE accion = 'MODELO_CLONADO' AND entidad_id = ? ORDER BY id DESC LIMIT 1")
      .get(cloneId);
    tt('T4.1 entry existe', !!audit, audit);
    if (audit) {
      eq('T4.2 entidad_tipo', audit.entidad_tipo, 'modelo');
      const det = JSON.parse(audit.detalles || '{}');
      eq('T4.3 detalles.origen_id', det.origen_id, modeloOrigen.id);
      eq('T4.4 detalles.origen_nombre', det.origen_nombre, modeloOrigen.nombre);
      eq('T4.5 detalles.nombre_nuevo', det.nombre_nuevo, nombreT1);
      eq('T4.6 detalles.clausulas_copiadas', det.clausulas_copiadas, clausulasOriginales.length);
    }

    // ───── T5: nombre por defecto "(copia)" ─────
    console.log('\n  T5: sin body.nombre → "<original> (copia)"');
    // Primero borramos cualquier modelo previo con ese nombre para evitar UNIQUE
    const nombreDefault = `${modeloOrigen.nombre} (copia)`;
    const prev = db.prepare('SELECT id FROM modelos WHERE institucion_id = ? AND nombre = ?').get(modeloOrigen.institucion_id, nombreDefault);
    if (prev) {
      db.prepare('DELETE FROM clausulas WHERE modelo_id = ?').run(prev.id);
      db.prepare('DELETE FROM modelos WHERE id = ?').run(prev.id);
    }
    const r5 = await request(port, 'POST', `/api/modelos/${modeloOrigen.id}/clonar`, { headers: auth, body: {} });
    eq('T5.1 status 201', r5.status, 201);
    eq('T5.2 nombre default = "<origen> (copia)"', r5.data?.nombre, nombreDefault);
    if (r5.data?.id) clonesCreados.push(r5.data.id);

    // ───── T6: UNIQUE constraint → 409 ─────
    console.log('\n  T6: clonar 2 veces con mismo nombre → 409');
    const r6 = await request(port, 'POST', `/api/modelos/${modeloOrigen.id}/clonar`, { headers: auth, body: { nombre: nombreT1 } });
    eq('T6.1 status 409', r6.status, 409);
    tt('T6.2 mensaje "ya existe"', /ya existe/i.test(r6.data?.error || ''), r6.data);
  } finally {
    // Limpieza
    for (const id of clonesCreados) {
      try {
        db.prepare('DELETE FROM clausulas WHERE modelo_id = ?').run(id);
        db.prepare('DELETE FROM modelos WHERE id = ?').run(id);
        db.prepare("DELETE FROM audit_log WHERE accion = 'MODELO_CLONADO' AND entidad_id = ?").run(id);
      } catch (e) { /* noop */ }
    }
    server.close();
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(` Resultado: ${pass} PASS · ${fail} FAIL`);
  if (fail > 0) {
    console.log(' FAILS:'); failures.forEach((f) => console.log(`   - ${f}`));
  }
  console.log('═══════════════════════════════════════════');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('ERROR no controlado:', e); process.exit(2); });
