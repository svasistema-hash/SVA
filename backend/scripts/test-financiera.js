// F1 Checkpoint 4 — tests de integración del módulo Financiera.
//
// Ejecutar: node scripts/test-financiera.js
//
// Cubre el flujo del usuario banco:
//   T1 Crear contrato → estado 'en_curso' + generar token cliente.
//   T2 GET /conteo-estados refleja el nuevo contrato.
//   T3 PUT /:id modificando datos_credito → audit_log registra
//      CONTRATO_DATOS_MODIFICADOS con secciones=['datos_credito'].
//   T4 POST /:id/avanzar desde revision_tenant → revision_abogados.
//   T5 POST /:id/anular { motivo } desde en_curso → anulada.

const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';

const db = require('../db');
const app = require('../server');
const ocr = require('../utils/ocr');
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
  console.log(' F1 Checkpoint 4 — Tests Financiera');
  console.log('═══════════════════════════════════════════');

  const { server, port } = await startServer();

  const inst = db.prepare('SELECT id, slug, nombre FROM instituciones LIMIT 1').get();
  if (!inst) { console.log('  ERROR: no hay instituciones. Corra seed.js'); server.close(); process.exit(1); }
  const modelo = db.prepare('SELECT id FROM modelos WHERE institucion_id = ? LIMIT 1').get(inst.id);
  if (!modelo) { console.log('  ERROR: no hay modelo en la institución. Corra seed.js'); server.close(); process.exit(1); }
  let user = db.prepare("SELECT id, email, role, institucion_id FROM users WHERE institucion_id = ? AND activo = 1 LIMIT 1").get(inst.id);
  if (!user) { console.log('  ERROR: no hay usuario en la institución. Corra seed.js'); server.close(); process.exit(1); }
  console.log(`  Institución: ${inst.slug} (${inst.nombre}) · Usuario: ${user.email}`);

  const token = createTokenFor(user);
  const auth = { Authorization: `Bearer ${token}` };

  const contratosCreados = [];

  try {
    // ───── T1: Crear contrato + token cliente ─────
    console.log('\n  T1: crear contrato → en_curso + token cliente');
    const noContrato = `TEST-C4-${Date.now()}`;
    const r1 = await request(port, 'POST', '/api/contratos', {
      headers: auth,
      body: {
        institucion_id: inst.id,
        modelo_id: modelo.id,
        no_contrato: noContrato,
        datos_cliente: { nombre: 'CLIENTE TEST C4' },
        datos_credito: { monto: '50000.00', moneda: 'Q', plazo_meses: '36' },
      },
    });
    eq('T1.1 status 201', r1.status, 201);
    eq('T1.2 estado en_curso', r1.data?.estado, 'en_curso');
    tt('T1.3 contrato id presente', !!r1.data?.id, r1.data?.id);
    const contratoId = r1.data.id;
    contratosCreados.push(contratoId);

    const rTok = await request(port, 'POST', `/api/contratos/${contratoId}/token-cliente`, { headers: auth });
    eq('T1.4 status 201 token-cliente', rTok.status, 201);
    tt('T1.5 token presente', !!rTok.data?.token, rTok.data?.token);
    tt('T1.6 url_path presente', !!rTok.data?.url_path && rTok.data.url_path.includes(rTok.data.token), rTok.data?.url_path);

    // ───── T2: GET /conteo-estados ─────
    console.log('\n  T2: conteo-estados refleja contrato creado');
    const r2 = await request(port, 'GET', `/api/contratos/conteo-estados?institucion=${inst.slug}`, { headers: auth });
    eq('T2.1 status 200', r2.status, 200);
    tt('T2.2 conteo.en_curso >= 1', r2.data?.en_curso >= 1, r2.data?.en_curso);
    tt('T2.3 keys completas',
      r2.data && ['en_curso','revision_tenant','revision_abogados','completado','abandonada_sin_inicio','abandonada_incompleta','anulada'].every((k) => k in r2.data),
      Object.keys(r2.data || {}));

    // ───── T3: PUT /:id datos_credito → audit_log ─────
    console.log('\n  T3: modificar datos_credito → audit_log');
    const r3 = await request(port, 'PUT', `/api/contratos/${contratoId}`, {
      headers: auth,
      body: { datos_credito: { monto: '75000.00', moneda: 'Q', plazo_meses: '60', cuota_mensual: '1850.00' } },
    });
    eq('T3.1 status 200', r3.status, 200);
    const r3audit = await request(port, 'GET', `/api/contratos/${contratoId}/audit-log`, { headers: auth });
    eq('T3.2 audit-log status 200', r3audit.status, 200);
    const modEntry = (r3audit.data || []).find((e) => e.accion === 'CONTRATO_DATOS_MODIFICADOS');
    tt('T3.3 hay entry CONTRATO_DATOS_MODIFICADOS', !!modEntry, r3audit.data?.map((e) => e.accion));
    eq('T3.4 secciones=["datos_credito"]', modEntry?.detalles?.secciones, ['datos_credito']);

    // ───── T4: avanzar revision_tenant → revision_abogados ─────
    console.log('\n  T4: avanzar a revision_abogados desde revision_tenant');
    // Forzamos contrato a revision_tenant directamente para el test.
    db.prepare("UPDATE contratos SET estado = 'revision_tenant' WHERE id = ?").run(contratoId);
    const r4 = await request(port, 'POST', `/api/contratos/${contratoId}/avanzar`, { headers: auth });
    eq('T4.1 status 200', r4.status, 200);
    eq('T4.2 nuevo estado revision_abogados', r4.data?.estado, 'revision_abogados');
    const estadoBD = db.prepare('SELECT estado FROM contratos WHERE id = ?').get(contratoId);
    eq('T4.3 estado en BD', estadoBD.estado, 'revision_abogados');

    // ───── T5: anular desde en_curso ─────
    console.log('\n  T5: anular desde en_curso → anulada');
    const noContrato2 = `TEST-C4B-${Date.now()}`;
    const rCreate = await request(port, 'POST', '/api/contratos', {
      headers: auth,
      body: { institucion_id: inst.id, modelo_id: modelo.id, no_contrato: noContrato2 },
    });
    const contrato2Id = rCreate.data.id;
    contratosCreados.push(contrato2Id);
    const r5 = await request(port, 'POST', `/api/contratos/${contrato2Id}/anular`, {
      headers: auth,
      body: { motivo: 'Cliente desistió' },
    });
    eq('T5.1 status 200', r5.status, 200);
    eq('T5.2 estado anulada', r5.data?.estado, 'anulada');
    tt('T5.3 motivo presente', r5.data?.anulado_motivo === 'Cliente desistió', r5.data?.anulado_motivo);
    const r5audit = await request(port, 'GET', `/api/contratos/${contrato2Id}/audit-log`, { headers: auth });
    const anulEntry = (r5audit.data || []).find((e) => e.accion === 'CONTRATO_ANULADO');
    tt('T5.4 audit_log CONTRATO_ANULADO', !!anulEntry, anulEntry);
    eq('T5.5 audit motivo', anulEntry?.detalles?.motivo, 'Cliente desistió');

  } finally {
    contratosCreados.forEach((id) => {
      db.prepare('DELETE FROM contratos_tokens WHERE contrato_id = ?').run(id);
      db.prepare("DELETE FROM audit_log WHERE entidad_tipo = 'contrato' AND entidad_id = ?").run(id);
      db.prepare('DELETE FROM contratos WHERE id = ?').run(id);
    });
    server.close();
    await ocr.terminate();
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(` Resultados: ${pass} PASS  /  ${fail} FAIL`);
  console.log('═══════════════════════════════════════════');
  if (fail > 0) {
    console.log('\nFallas:'); failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => { console.error('Error fatal:', err); process.exit(1); });
