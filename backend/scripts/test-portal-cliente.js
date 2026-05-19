// F1 Checkpoint 3 — tests de integración del portal público del cliente.
//
// Ejecutar: node scripts/test-portal-cliente.js
//
// Cubre:
//   T1 Link válido → formulario carga (institución, contrato, modelo, expires_at).
//   T2 Link vencido → status 410 token_vencido.
//   T3 Token + DPI sintético → OCR + parsea + guarda en uploads.
//   T4 Borrador → cerrar (close fetch) → volver → retoma datos guardados.
//   T5 Confirmar → estado pasa a revision_tenant, token marcado usado.
//   T6 Link ya usado → status 410 token_usado.
//
// NO arranca el server completo. Usa supertest contra app de Express.

const http = require('http');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';

const db = require('../db');
const app = require('../server');
const ocr = require('../utils/ocr');

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
function tt(name, cond, info = '') {
  if (cond) ok(name); else nope(name, true, info || cond);
}

// Levanta server temporal.
function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

// HTTP helpers (sin axios, evitar dep en tests).
function request(port, method, urlPath, { body, headers, formData } = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1', port, path: urlPath, method,
      headers: { ...(headers || {}) },
    };
    let bodyBuf = null;
    if (formData) {
      const boundary = '----' + crypto.randomBytes(8).toString('hex');
      const chunks = [];
      for (const [field, val] of Object.entries(formData)) {
        if (val.path) {
          // archivo
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

// Crea contrato de prueba (sin usar endpoint, directo en BD).
function crearContratoTest(institucionId) {
  const modelo = db.prepare('SELECT id FROM modelos WHERE institucion_id = ? LIMIT 1').get(institucionId);
  if (!modelo) throw new Error('Necesita al menos 1 modelo en institución ' + institucionId);
  const noContrato = `TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const info = db.prepare(
    `INSERT INTO contratos (institucion_id, modelo_id, no_contrato, estado) VALUES (?, ?, ?, 'en_curso')`
  ).run(institucionId, modelo.id, noContrato);
  return info.lastInsertRowid;
}

function crearToken(contratoId, opts = {}) {
  const token = crypto.randomUUID();
  const expires = opts.vencido
    ? new Date(Date.now() - 60 * 1000).toISOString()
    : new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO contratos_tokens (contrato_id, token, expires_at, usado) VALUES (?, ?, ?, ?)`
  ).run(contratoId, token, expires, opts.usado ? 1 : 0);
  return token;
}

function limpiar(contratoId) {
  db.prepare('DELETE FROM contratos_tokens WHERE contrato_id = ?').run(contratoId);
  db.prepare('DELETE FROM contratos WHERE id = ?').run(contratoId);
}

async function generarDpiSintetico(outPath) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">
      <rect width="100%" height="100%" fill="white"/>
      <text x="40" y="60" font-family="Arial" font-size="22" fill="black">REPUBLICA DE GUATEMALA</text>
      <text x="40" y="92" font-family="Arial" font-size="22" fill="black">DOCUMENTO PERSONAL DE IDENTIFICACION</text>
      <text x="40" y="160" font-family="Arial" font-size="26" fill="black">PEREZ GARCIA JUAN CARLOS</text>
      <text x="40" y="220" font-family="Arial" font-size="22" fill="black">CUI 2845 73901 0801</text>
      <text x="40" y="260" font-family="Arial" font-size="22" fill="black">FECHA DE NACIMIENTO 12/06/1985</text>
    </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outPath);
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' F1 Checkpoint 3 — Tests Portal Cliente');
  console.log('═══════════════════════════════════════════');

  const { server, port } = await startServer();
  console.log(`  test server escuchando en :${port}`);

  // Espera a que tesseract esté listo (warmUp del server lo dispara).
  await ocr.warmUp();

  // Necesitamos una institución existente. Tomamos la primera de la BD.
  const inst = db.prepare('SELECT id, slug, nombre FROM instituciones LIMIT 1').get();
  if (!inst) {
    console.log('  ERROR: no hay instituciones en BD. Corra seed.js primero.');
    server.close(); db.close(); ocr.terminate(); process.exit(1);
  }
  console.log(`  Institución de prueba: ${inst.slug} (${inst.nombre})`);

  let contratoT1, tokenT1, contratoT2, tokenT2, contratoT3, tokenT3;
  let contratoT4, tokenT4, contratoT5, tokenT5, contratoT6, tokenT6;

  try {
    // ───── T1: Link válido → formulario carga ─────
    console.log('\n  T1: link válido → datos del formulario');
    contratoT1 = crearContratoTest(inst.id);
    tokenT1 = crearToken(contratoT1);
    const r1 = await request(port, 'GET', `/api/public/solicitud/${tokenT1}`);
    eq('T1.1 status 200', r1.status, 200);
    eq('T1.2 institucion.nombre', r1.data?.institucion?.nombre, inst.nombre);
    eq('T1.3 contrato.id', r1.data?.contrato?.id, contratoT1);
    tt('T1.4 modelo presente', !!r1.data?.modelo, r1.data?.modelo);
    tt('T1.5 expires_at presente', !!r1.data?.expires_at, r1.data?.expires_at);

    // ───── T2: Link vencido ─────
    console.log('\n  T2: link vencido → 410 token_vencido');
    contratoT2 = crearContratoTest(inst.id);
    tokenT2 = crearToken(contratoT2, { vencido: true });
    const r2 = await request(port, 'GET', `/api/public/solicitud/${tokenT2}`);
    eq('T2.1 status 410', r2.status, 410);
    eq('T2.2 code token_vencido', r2.data?.code, 'token_vencido');

    // ───── T3: subir DPI sintético, OCR responde con datos ─────
    console.log('\n  T3: subir DPI → OCR pre-rellena datos');
    contratoT3 = crearContratoTest(inst.id);
    tokenT3 = crearToken(contratoT3);
    const tmpDir = path.join(__dirname, '..', '..', '.tmp-c3-test');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const dpiPath = path.join(tmpDir, 'dpi-test.png');
    await generarDpiSintetico(dpiPath);
    const r3 = await request(port, 'POST', `/api/public/solicitud/${tokenT3}/dpi`, {
      formData: { imagen: { path: dpiPath, contentType: 'image/png' } },
    });
    eq('T3.1 status 200', r3.status, 200);
    eq('T3.2 dpi parseado', r3.data?.dpi, '2845 73901 0801');
    tt('T3.3 confidence > 50', r3.data?.confidence > 50, r3.data?.confidence);
    tt('T3.4 nombre extraído', /PEREZ/.test(r3.data?.nombre || ''), r3.data?.nombre);
    tt('T3.5 dpi_scan_path presente', !!r3.data?.dpi_scan_path, r3.data?.dpi_scan_path);

    // ───── T4: guardado borrador + retoma ─────
    console.log('\n  T4: guardar borrador → reabrir → retoma');
    contratoT4 = crearContratoTest(inst.id);
    tokenT4 = crearToken(contratoT4);
    const borrador = {
      paso_actual: 3,
      autorizo_tratamiento: true,
      nombre: 'PEDRO MARTINEZ',
      dpi: '1111 22222 0101',
      fecha_nac: '1990-01-15',
      genero: 'masculino',
      estado_civil: 'soltero',
      fiadores: [{ nombre: 'Juan Fiador', dpi: '3333 44444 0101' }],
    };
    const rPut = await request(port, 'PUT', `/api/public/solicitud/${tokenT4}/datos`, { body: borrador });
    eq('T4.1 PUT datos status 200', rPut.status, 200);
    eq('T4.2 ok = true', rPut.data?.ok, true);
    const rGet = await request(port, 'GET', `/api/public/solicitud/${tokenT4}`);
    eq('T4.3 reabrir status 200', rGet.status, 200);
    eq('T4.4 paso_actual persisted', rGet.data?.borrador?.paso_actual, 3);
    eq('T4.5 nombre persisted', rGet.data?.borrador?.nombre, 'PEDRO MARTINEZ');
    eq('T4.6 fiadores persisted', rGet.data?.borrador?.fiadores?.length, 1);

    // ───── T5: confirmar → estado revision_tenant ─────
    console.log('\n  T5: confirmar → revision_tenant + token usado');
    contratoT5 = crearContratoTest(inst.id);
    tokenT5 = crearToken(contratoT5);
    const rConf = await request(port, 'POST', `/api/public/solicitud/${tokenT5}/confirmar`, {
      body: { nombre: 'TEST FINAL', datos_veridicos: true, autorizo_referencias: true },
    });
    eq('T5.1 status 200', rConf.status, 200);
    eq('T5.2 estado revision_tenant', rConf.data?.estado, 'revision_tenant');
    eq('T5.3 contrato_id correcto', rConf.data?.contrato_id, contratoT5);
    // Verificar en BD
    const contratoBD = db.prepare('SELECT estado FROM contratos WHERE id = ?').get(contratoT5);
    eq('T5.4 estado en BD', contratoBD.estado, 'revision_tenant');
    const tokenBD = db.prepare('SELECT usado FROM contratos_tokens WHERE token = ?').get(tokenT5);
    eq('T5.5 token marcado usado', tokenBD.usado, 1);
    const audit = db.prepare("SELECT * FROM audit_log WHERE accion = 'cliente_confirmo_solicitud' AND entidad_id = ?").get(contratoT5);
    tt('T5.6 audit_log registrado', !!audit, audit);

    // ───── T6: link ya usado ─────
    console.log('\n  T6: link ya usado → 410 token_usado');
    contratoT6 = crearContratoTest(inst.id);
    tokenT6 = crearToken(contratoT6, { usado: true });
    const r6 = await request(port, 'GET', `/api/public/solicitud/${tokenT6}`);
    eq('T6.1 status 410', r6.status, 410);
    eq('T6.2 code token_usado', r6.data?.code, 'token_usado');

    // Limpieza
    try { fs.rmSync(path.join(__dirname, '..', '..', '.tmp-c3-test'), { recursive: true, force: true }); } catch (_) {}
  } finally {
    // Cleanup BD
    [contratoT1, contratoT2, contratoT3, contratoT4, contratoT5, contratoT6].filter(Boolean).forEach(limpiar);
    server.close();
    await ocr.terminate();
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(` Resultados: ${pass} PASS  /  ${fail} FAIL`);
  console.log('═══════════════════════════════════════════');
  if (fail > 0) {
    console.log('\nFallas:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Error fatal en tests:', err);
  process.exit(1);
});
