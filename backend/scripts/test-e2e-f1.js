// F1 — Tests E2E end-to-end (después de Checkpoint 5).
//
// Simula el flujo completo desde la creación de la solicitud por el banco
// hasta la generación del PDF final por el bufete.
//
// Ejecutar: node scripts/test-e2e-f1.js
//
// Pre-requisitos en BD: al menos 1 institución con 1 modelo y 1 notario activo,
// 1 usuario admin del bufete (sin institucion_id) y 1 usuario del tenant.

const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
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

function request(port, method, urlPath, { body, headers, formData } = {}) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: '127.0.0.1', port, path: urlPath, method, headers: { ...(headers || {}) } };
    let bodyBuf = null;
    if (formData) {
      const boundary = '----' + crypto.randomBytes(8).toString('hex');
      const chunks = [];
      for (const [field, val] of Object.entries(formData)) {
        if (val.path) {
          chunks.push(Buffer.from(`--${boundary}\r\n`));
          chunks.push(Buffer.from(`Content-Disposition: form-data; name="${field}"; filename="${path.basename(val.path)}"\r\n`));
          chunks.push(Buffer.from(`Content-Type: ${val.contentType || 'image/png'}\r\n\r\n`));
          chunks.push(fs.readFileSync(val.path));
          chunks.push(Buffer.from('\r\n'));
        } else {
          chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"\r\n\r\n${val}\r\n`));
        }
      }
      chunks.push(Buffer.from(`--${boundary}--\r\n`));
      bodyBuf = Buffer.concat(chunks);
      opts.headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
      opts.headers['Content-Length'] = bodyBuf.length;
    } else if (body) {
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

function tokenFor(user) {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role, institucion_id: user.institucion_id }, JWT_SECRET, { expiresIn: '1h' });
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' F1 — Tests E2E (Checkpoints 1-5)');
  console.log('═══════════════════════════════════════════');

  const { server, port } = await startServer();

  // ────────── Setup ──────────
  const inst = db.prepare('SELECT id, slug, nombre FROM instituciones LIMIT 1').get();
  const modelo = db.prepare('SELECT id, tipo_garantia FROM modelos WHERE institucion_id = ? LIMIT 1').get(inst.id);
  let bancoUser = db.prepare("SELECT id, email, role, institucion_id FROM users WHERE institucion_id = ? AND activo = 1 LIMIT 1").get(inst.id);
  let bufeteUser = db.prepare("SELECT id, email, role, institucion_id FROM users WHERE role = 'admin' AND institucion_id IS NULL AND activo = 1 LIMIT 1").get();
  let notario = db.prepare("SELECT id, nombre, colegiado FROM notarios WHERE institucion_id = ? AND activo = 1 LIMIT 1").get(inst.id);

  if (!notario) {
    // Crear uno temporal solo para el test.
    const info = db.prepare("INSERT INTO notarios (institucion_id, nombre, colegiado, activo) VALUES (?, 'Lic. Test E2E', 'TEST-001', 1)").run(inst.id);
    notario = { id: info.lastInsertRowid, nombre: 'Lic. Test E2E', colegiado: 'TEST-001', __creado_por_test: true };
  }
  if (!bufeteUser) {
    console.log('  ERROR: no hay usuario admin del bufete (role=admin sin institucion_id). Corra seed.js.');
    server.close(); process.exit(1);
  }
  console.log(`  Banco: ${inst.slug} (${inst.nombre}) · Usuario banco: ${bancoUser.email}`);
  console.log(`  Bufete: ${bufeteUser.email} · Notario: ${notario.nombre}`);

  const authBanco = { Authorization: `Bearer ${tokenFor(bancoUser)}` };
  const authBufete = { Authorization: `Bearer ${tokenFor(bufeteUser)}` };

  const tmpDir = path.join(__dirname, '..', '..', '.tmp-e2e-test');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  await ocr.warmUp();

  let contratoId = null;
  let tokenCliente = null;
  let notarioCreadoPorTest = notario.__creado_por_test ? notario.id : null;

  try {
    // ────────── T1: Banco crea solicitud ──────────
    console.log('\n  T1: usuario banco crea solicitud → en_curso');
    const noContrato = `E2E-${Date.now()}`;
    const r1 = await request(port, 'POST', '/api/contratos', {
      headers: authBanco,
      body: {
        institucion_id: inst.id,
        modelo_id: modelo.id,
        no_contrato: noContrato,
        datos_cliente: { nombre: 'PEDRO MARTINEZ E2E' },
        datos_credito: { monto: '50000.00', moneda: 'Q', plazo_meses: '36' },
      },
    });
    eq('T1.1 status 201', r1.status, 201);
    eq('T1.2 estado en_curso', r1.data?.estado, 'en_curso');
    contratoId = r1.data.id;
    const rTok = await request(port, 'POST', `/api/contratos/${contratoId}/token-cliente`, { headers: authBanco });
    tokenCliente = rTok.data.token;
    tt('T1.3 token cliente generado', !!tokenCliente, tokenCliente);

    // ────────── T2: Cliente abre link y completa wizard ──────────
    console.log('\n  T2: cliente abre link → completa wizard cliente');
    const r2get = await request(port, 'GET', `/api/public/solicitud/${tokenCliente}`);
    eq('T2.1 portal carga (200)', r2get.status, 200);
    eq('T2.2 institución correcta', r2get.data?.institucion?.nombre, inst.nombre);
    // OCR de DPI sintético
    const dpiPath = path.join(tmpDir, 'dpi.png');
    await sharp(Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">
        <rect width="100%" height="100%" fill="white"/>
        <text x="40" y="80" font-family="Arial" font-size="26" fill="black">MARTINEZ LOPEZ PEDRO</text>
        <text x="40" y="140" font-family="Arial" font-size="24" fill="black">CUI 2845 73901 0801</text>
        <text x="40" y="200" font-family="Arial" font-size="22" fill="black">FECHA NACIMIENTO 15/03/1990</text>
      </svg>`)).png().toFile(dpiPath);
    const r2dpi = await request(port, 'POST', `/api/public/solicitud/${tokenCliente}/dpi`, {
      formData: { imagen: { path: dpiPath } },
    });
    eq('T2.3 OCR DPI status 200', r2dpi.status, 200);
    tt('T2.4 DPI parseado', !!r2dpi.data?.dpi, r2dpi.data?.dpi);
    // Guardar borrador con todos los datos
    const datosCliente = {
      paso_actual: 7,
      autorizo_tratamiento: true,
      nombre: 'PEDRO MARTINEZ LOPEZ', dpi: '2845 73901 0801', fecha_nac: '1990-03-15',
      lugar_nac: 'Guatemala', genero: 'masculino', estado_civil: 'soltero',
      profesion: 'Ingeniero', telefono: '5555-1234', email: 'pedro@test.com',
      ingresos: '15000', empleo: 'Empresa Test, S.A.',
      domicilio: '5a calle 3-40 zona 10, Guatemala',
      datos_veridicos: true, autorizo_referencias: true,
    };
    const r2put = await request(port, 'PUT', `/api/public/solicitud/${tokenCliente}/datos`, { body: datosCliente });
    eq('T2.5 borrador guardado', r2put.data?.ok, true);

    // ────────── T3: Cliente envía → revision_tenant ──────────
    console.log('\n  T3: cliente confirma → estado revision_tenant');
    const r3 = await request(port, 'POST', `/api/public/solicitud/${tokenCliente}/confirmar`, { body: datosCliente });
    eq('T3.1 confirmar status 200', r3.status, 200);
    eq('T3.2 nuevo estado', r3.data?.estado, 'revision_tenant');

    // ────────── T4: Banco modifica un dato del cliente → audit log ──────────
    console.log('\n  T4: banco modifica datos → audit_log');
    // El backend ya guardó los datos del cliente en borrador, pero datos_cliente del contrato
    // sigue siendo el original. Lo actualizamos primero copiando del borrador.
    await request(port, 'PUT', `/api/contratos/${contratoId}`, {
      headers: authBanco,
      body: { datos_cliente: { nombre: datosCliente.nombre, dpi: datosCliente.dpi, fecha_nac: datosCliente.fecha_nac, telefono: datosCliente.telefono, domicilio: datosCliente.domicilio, ingresos: datosCliente.ingresos } },
    });
    // Ahora modificamos un campo
    const r4 = await request(port, 'PUT', `/api/contratos/${contratoId}`, {
      headers: authBanco,
      body: { datos_cliente: { nombre: datosCliente.nombre, dpi: datosCliente.dpi, fecha_nac: datosCliente.fecha_nac, telefono: '5555-9999', domicilio: datosCliente.domicilio, ingresos: '16000' }, motivo: 'Cliente actualizó teléfono e ingresos' },
    });
    eq('T4.1 PUT status 200', r4.status, 200);
    const rAudit = await request(port, 'GET', `/api/contratos/${contratoId}/audit-log`, { headers: authBanco });
    const modEntry = rAudit.data.find((e) => e.accion === 'CONTRATO_DATOS_MODIFICADOS' && e.detalles?.motivo);
    tt('T4.2 audit_log con motivo registrado', !!modEntry, modEntry);

    // ────────── T5: Banco marca listo → revision_abogados ──────────
    console.log('\n  T5: banco marca listo → revision_abogados');
    const r5 = await request(port, 'POST', `/api/contratos/${contratoId}/avanzar`, { headers: authBanco });
    eq('T5.1 status 200', r5.status, 200);
    eq('T5.2 nuevo estado', r5.data?.estado, 'revision_abogados');

    // ────────── T6: Bufete ve el contrato en /pendientes ──────────
    console.log('\n  T6: bufete entra a /pendientes → ve el contrato');
    const r6 = await request(port, 'GET', '/api/pendientes', { headers: authBufete });
    eq('T6.1 status 200', r6.status, 200);
    const enLista = r6.data.find((p) => p.id === contratoId);
    tt('T6.2 contrato aparece en pendientes', !!enLista, r6.data?.length);
    eq('T6.3 institución correcta en lista', enLista?.institucion?.slug, inst.slug);
    eq('T6.4 dpi_fisico_recibido inicial false', enLista?.dpi_fisico_recibido, false);

    // ────────── T7: Bufete marca DPI físico recibido ──────────
    console.log('\n  T7: bufete marca DPI físico recibido');
    const r7 = await request(port, 'POST', `/api/contratos/${contratoId}/dpi-fisico-recibido`, { headers: authBufete });
    eq('T7.1 status 200', r7.status, 200);
    eq('T7.2 dpi_fisico_recibido=1', r7.data?.dpi_fisico_recibido, 1);
    tt('T7.3 dpi_fisico_recibido_at presente', !!r7.data?.dpi_fisico_recibido_at, r7.data?.dpi_fisico_recibido_at);

    // ────────── T8: Bufete completa wizard, asigna notario, genera PDF y completa ──────────
    console.log('\n  T8: bufete asigna notario + genera PDF + completa');
    // Asignar notario (vía PUT datos_firmas)
    await request(port, 'PUT', `/api/contratos/${contratoId}`, {
      headers: authBufete,
      body: { datos_firmas: { notario_id: notario.id, notario_nombre: notario.nombre, notario_colegiado: notario.colegiado } },
    });
    // Generar PDF
    const r8pdf = await request(port, 'POST', `/api/contratos/${contratoId}/pdf`, { headers: authBufete });
    eq('T8.1 PDF generado status 200', r8pdf.status, 200);
    tt('T8.2 url devuelta', !!r8pdf.data?.url, r8pdf.data);
    // Avanzar a completado
    const r8av = await request(port, 'POST', `/api/contratos/${contratoId}/avanzar`, { headers: authBufete });
    eq('T8.3 avanzar status 200', r8av.status, 200);
    eq('T8.4 estado final completado', r8av.data?.estado, 'completado');
    tt('T8.5 completado_at presente', !!r8av.data?.completado_at, r8av.data);

    // ────────── T9: Audit log tiene >= 7 entradas ──────────
    console.log('\n  T9: audit log tiene 7+ entradas');
    const r9 = await request(port, 'GET', `/api/contratos/${contratoId}/audit-log`, { headers: authBufete });
    tt(`T9.1 audit_log >= 7 entradas (obtenidas ${r9.data?.length})`, r9.data?.length >= 7, r9.data?.length);

    // Verificación de contenido del log
    const acciones = (r9.data || []).map((e) => e.accion);
    tt('T9.2 incluye generar_token_cliente', acciones.includes('generar_token_cliente'));
    tt('T9.3 incluye cliente_confirmo_solicitud', acciones.includes('cliente_confirmo_solicitud'));
    tt('T9.4 incluye CONTRATO_DATOS_MODIFICADOS', acciones.includes('CONTRATO_DATOS_MODIFICADOS'));
    tt('T9.5 incluye DPI_FISICO_RECIBIDO', acciones.includes('DPI_FISICO_RECIBIDO'));
    // Hay 2 transiciones registradas como CONTRATO_TRANSICION (revision_tenant→revision_abogados
     // y revision_abogados→completado). La primera (en_curso→revision_tenant) va como
     // cliente_confirmo_solicitud, no como CONTRATO_TRANSICION genérico.
    tt('T9.6 incluye CONTRATO_TRANSICION (≥2 veces)', acciones.filter((a) => a === 'CONTRATO_TRANSICION').length >= 2, acciones);

    // ────────── T10: PDF generado tiene formato legal F7 aplicado ──────────
    console.log('\n  T10: contrato compilado contiene formato legal F7');
    const r10 = await request(port, 'POST', `/api/contratos/${contratoId}/compilar`, { headers: authBufete });
    eq('T10.1 status 200', r10.status, 200);
    const compilado = r10.data;
    tt('T10.2 vars del motor legal presentes', !!compilado?.vars, Object.keys(compilado || {}));
    // F7 genera variables como monto_legal con la forma "cincuenta mil (50000.00) quetzales".
    const vars = compilado?.vars || {};
    const claveLegal = ['monto_legal', 'cuota_mensual_legal', 'plazo_legal'].find((k) => typeof vars[k] === 'string' && /\([0-9]/.test(vars[k]));
    tt('T10.3 al menos una variable legal con formato "letras (numero)"', !!claveLegal, { monto_legal: vars.monto_legal, plazo_legal: vars.plazo_legal });
    const valor = claveLegal ? vars[claveLegal] : '';
    tt('T10.4 valor contiene palabras de número en letras (mil/cien/cuarenta/etc.)', /(treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|mil|millon|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)/i.test(valor), valor);

  } finally {
    // Cleanup
    if (contratoId) {
      db.prepare('DELETE FROM contratos_tokens WHERE contrato_id = ?').run(contratoId);
      db.prepare("DELETE FROM audit_log WHERE entidad_tipo = 'contrato' AND entidad_id = ?").run(contratoId);
      db.prepare('DELETE FROM contratos WHERE id = ?').run(contratoId);
    }
    if (notarioCreadoPorTest) {
      db.prepare('DELETE FROM notarios WHERE id = ?').run(notarioCreadoPorTest);
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    server.close();
    await ocr.terminate();
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(` Resultados E2E: ${pass} PASS  /  ${fail} FAIL`);
  console.log('═══════════════════════════════════════════');
  if (fail > 0) {
    console.log('\nFallas:'); failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => { console.error('Error fatal:', err); process.exit(1); });
