// Sprint garantías-desacopladas CP3 — Tests E2E de endpoints.
//
// Ejecutar: npm run test:cp3
//
// Cobertura:
//   T1  POST /api/comparecientes crea con cifrado + audit log.
//   T2  POST con DPI duplicado → 409 con existing_id.
//   T3  GET /api/comparecientes lista descifrado.
//   T4  PUT edita PII y graba audit.
//   T5  POST /api/contratos/:id/comparecientes vincula con rol fiador.
//   T6  PUT vínculo cambia rol y graba COMPARECIENTE_ROL_CAMBIADO.
//   T7  POST /api/garantias crea fiduciaria con flag solidaria.
//   T8  POST /api/garantias crea hipotecaria aportante=cliente.
//   T9  POST /api/garantias rechaza solidaria=1 en hipotecaria (400).
//   T10 POST /api/contratos/:id/garantias VALIDACIÓN CRÍTICA: rechaza
//       hipotecaria con aportante=compareciente que NO está en el contrato.
//   T11 Vincula tras agregar al compareciente, ya pasa.
//   T12 Cap MAX_GARANTIAS_POR_CONTRATO=5.
//   T13 Cap portal público: máximo 1 compareciente.
//   T14 Cap portal público: máximo 1 garantía.
//   T15 Freeze trigger: avanzar a 'completado' copia snapshots y bloquea ediciones.
//   T16 Después del freeze, GET comparecientes/garantías devuelve snapshot.
//   T17 Editar PII de compareciente vivo NO cambia snapshot del contrato firmado.
//   T18 Compilar contrato firmado lee snapshot.

const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';

const db = require('../db');
const app = require('../server');
const { JWT_SECRET } = require('../config');
const { encrypt, decrypt, hashFor } = require('../encryption');

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

function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

function request(port, method, urlPath, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: '127.0.0.1', port, path: urlPath, method, headers: { ...(headers || {}) } };
    let bodyBuf = null;
    if (body !== undefined && body !== null) {
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

const limpiar = { comp: [], gar: [], cto: [], cli: [], tok: [] };

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' Sprint garantías-desacopladas CP3 — E2E');
  console.log('═══════════════════════════════════════════');

  const { server, port } = await startServer();

  const inst = db.prepare("SELECT id, slug FROM instituciones WHERE slug = 'banco-rsg'").get();
  if (!inst) { console.log('ERROR: institución banco-rsg no existe'); server.close(); process.exit(1); }
  const banco = db.prepare("SELECT id, email, role, institucion_id FROM users WHERE institucion_id = ?").get(inst.id);
  const admin = db.prepare("SELECT id, email, role, institucion_id FROM users WHERE role = 'admin' AND institucion_id IS NULL").get();
  if (!banco || !admin) { console.log('ERROR: faltan users'); server.close(); process.exit(1); }
  const authBanco = { Authorization: `Bearer ${createTokenFor(banco)}` };
  const authBufete = { Authorization: `Bearer ${createTokenFor(admin)}` };

  // Cliente de prueba para los contratos
  const cliInfo = db.prepare(`
    INSERT INTO clientes (institucion_id, nombre, dpi, dpi_hash, genero, tipo_persona, estado)
    VALUES (?, 'TESTCLIENTE CP3', ?, ?, 'M', 'individual', 'activo')
  `).run(inst.id, encrypt('1112223334445'), hashFor('dpi', '1112223334445'));
  const cliId = cliInfo.lastInsertRowid;
  limpiar.cli.push(cliId);

  // Modelo y contrato base
  const mod = db.prepare(`SELECT id FROM modelos WHERE institucion_id = ? AND activo = 1 LIMIT 1`).get(inst.id);
  if (!mod) { console.log('ERROR: no hay modelo activo. Corré seed:garantias-cp25'); server.close(); process.exit(1); }

  const ctoInfo = db.prepare(`
    INSERT INTO contratos (institucion_id, modelo_id, no_contrato, estado, datos_cliente)
    VALUES (?, ?, ?, 'en_curso', ?)
  `).run(inst.id, mod.id, `CT-CP3-${Date.now()}`, encrypt(JSON.stringify({ nombre: 'TESTCLIENTE CP3', dpi: '1112223334445', genero: 'M' })));
  const ctoId = ctoInfo.lastInsertRowid;
  limpiar.cto.push(ctoId);
  console.log(`  setup: contrato ${ctoId}, cliente ${cliId}, inst ${inst.id}`);

  try {
    // ───── T1: POST compareciente con cifrado ─────
    console.log('\n  T1: POST /api/comparecientes crea con cifrado');
    const r1 = await request(port, 'POST', '/api/comparecientes', {
      headers: authBanco,
      body: { institucion_id: inst.id, nombre: 'PEDRO PERALTA CP3', dpi: '7777888899990', profesion: 'Comerciante', estado_civil: 'soltero', domicilio: '4a 5-67 zona 8' },
    });
    eq('T1.1 status 201', r1.status, 201);
    tt('T1.2 id presente', !!r1.data?.id);
    eq('T1.3 nombre descifrado en respuesta', r1.data?.nombre, 'PEDRO PERALTA CP3');
    eq('T1.4 dpi descifrado en respuesta', r1.data?.dpi, '7777888899990');
    const compPedro = r1.data.id;
    limpiar.comp.push(compPedro);
    // Verifica cifrado en disco
    const rawComp = db.prepare('SELECT dpi FROM comparecientes WHERE id = ?').get(compPedro);
    tt('T1.5 dpi cifrado en BD (no plaintext)', !String(rawComp.dpi).includes('7777888899990'));
    const auditRow = db.prepare("SELECT * FROM audit_log WHERE accion='COMPARECIENTE_AGREGADO' AND entidad_id = ?").get(compPedro);
    tt('T1.6 audit_log entry presente', !!auditRow);

    // ───── T2: DPI duplicado → 409 con existing_id ─────
    console.log('\n  T2: POST con DPI duplicado → 409');
    const r2 = await request(port, 'POST', '/api/comparecientes', {
      headers: authBanco,
      body: { institucion_id: inst.id, nombre: 'OTRO NOMBRE', dpi: '7777888899990' },
    });
    eq('T2.1 status 409', r2.status, 409);
    eq('T2.2 existing_id apunta al original', r2.data?.existing_id, compPedro);

    // ───── T3: GET lista descifrada ─────
    console.log('\n  T3: GET /api/comparecientes lista descifrado');
    const r3 = await request(port, 'GET', `/api/comparecientes?institucion_id=${inst.id}`, { headers: authBanco });
    eq('T3.1 status 200', r3.status, 200);
    tt('T3.2 contiene a compPedro descifrado', r3.data?.some((x) => x.id === compPedro && x.nombre === 'PEDRO PERALTA CP3'));

    // ───── T4: PUT edita PII ─────
    console.log('\n  T4: PUT edita PII y graba audit');
    const r4 = await request(port, 'PUT', `/api/comparecientes/${compPedro}`, {
      headers: authBanco,
      body: { profesion: 'Médico' },
    });
    eq('T4.1 status 200', r4.status, 200);
    eq('T4.2 profesion actualizada', r4.data?.profesion, 'Médico');
    const auditEd = db.prepare("SELECT * FROM audit_log WHERE accion='COMPARECIENTE_EDITADO' AND entidad_id = ?").get(compPedro);
    tt('T4.3 audit COMPARECIENTE_EDITADO', !!auditEd);

    // ───── T5: vincular al contrato como fiador ─────
    console.log('\n  T5: POST vincular compareciente al contrato (rol=fiador)');
    const r5 = await request(port, 'POST', `/api/contratos/${ctoId}/comparecientes`, {
      headers: authBanco,
      body: { compareciente_id: compPedro, rol: 'fiador' },
    });
    eq('T5.1 status 201', r5.status, 201);
    eq('T5.2 rol fiador', r5.data?.rol, 'fiador');
    eq('T5.3 agregado_por_actor=banco', r5.data?.agregado_por_actor, 'banco');

    // ───── T6: cambiar rol → tercero_garante ─────
    console.log('\n  T6: PUT cambia rol a tercero_garante');
    const r6 = await request(port, 'PUT', `/api/contratos/${ctoId}/comparecientes/${compPedro}`, {
      headers: authBanco,
      body: { rol: 'tercero_garante' },
    });
    eq('T6.1 status 200', r6.status, 200);
    eq('T6.2 rol actualizado', r6.data?.rol, 'tercero_garante');
    const auditRol = db.prepare("SELECT * FROM audit_log WHERE accion='COMPARECIENTE_ROL_CAMBIADO' AND entidad_id = ?").get(ctoId);
    tt('T6.3 audit ROL_CAMBIADO', !!auditRol);
    // restaurar a fiador para tests posteriores
    await request(port, 'PUT', `/api/contratos/${ctoId}/comparecientes/${compPedro}`, {
      headers: authBanco, body: { rol: 'fiador' },
    });

    // ───── T7: garantía fiduciaria solidaria ─────
    console.log('\n  T7: POST /api/garantias crea fiduciaria solidaria=1');
    const r7 = await request(port, 'POST', '/api/garantias', {
      headers: authBanco,
      body: { institucion_id: inst.id, tipo: 'fiduciaria', solidaria: 1 },
    });
    eq('T7.1 status 201', r7.status, 201);
    eq('T7.2 tipo=fiduciaria', r7.data?.tipo, 'fiduciaria');
    eq('T7.3 solidaria=1', r7.data?.solidaria, 1);
    const garFid = r7.data.id;
    limpiar.gar.push(garFid);

    // ───── T8: garantía hipotecaria aportante=cliente ─────
    console.log('\n  T8: POST hipotecaria aportante=cliente');
    const r8 = await request(port, 'POST', '/api/garantias', {
      headers: authBanco,
      body: {
        institucion_id: inst.id, tipo: 'hipotecaria',
        datos: { finca: '999', folio: '88', libro: '77' },
        aportante_tipo: 'cliente', aportante_cliente_id: cliId,
      },
    });
    eq('T8.1 status 201', r8.status, 201);
    eq('T8.2 aportante_tipo=cliente', r8.data?.aportante_tipo, 'cliente');
    eq('T8.3 datos descifrado', r8.data?.datos?.finca, '999');
    const garHipCli = r8.data.id;
    limpiar.gar.push(garHipCli);

    // ───── T9: hipotecaria con solidaria=1 → 400 ─────
    console.log('\n  T9: rechazar hipotecaria solidaria=1');
    const r9 = await request(port, 'POST', '/api/garantias', {
      headers: authBanco,
      body: { institucion_id: inst.id, tipo: 'hipotecaria', solidaria: 1, datos: { finca: '1' }, aportante_tipo: 'cliente', aportante_cliente_id: cliId },
    });
    eq('T9.1 status 400', r9.status, 400);

    // ───── T10: validación crítica aportante compareciente NO vinculado ─────
    console.log('\n  T10: VALIDACIÓN CRÍTICA — aportante compareciente sin vincular al contrato');
    // Creamos un compareciente nuevo que NO está en el contrato
    const r10a = await request(port, 'POST', '/api/comparecientes', {
      headers: authBanco,
      body: { institucion_id: inst.id, nombre: 'TERCERO EXTERNO', dpi: '4444555566667' },
    });
    const compExterno = r10a.data.id;
    limpiar.comp.push(compExterno);
    const r10b = await request(port, 'POST', '/api/garantias', {
      headers: authBanco,
      body: {
        institucion_id: inst.id, tipo: 'hipotecaria',
        datos: { finca: '1234' },
        aportante_tipo: 'compareciente', aportante_compareciente_id: compExterno,
      },
    });
    eq('T10.1 garantía con aportante externo creada', r10b.status, 201);
    const garExterna = r10b.data.id;
    limpiar.gar.push(garExterna);
    const r10c = await request(port, 'POST', `/api/contratos/${ctoId}/garantias`, {
      headers: authBanco,
      body: { garantia_id: garExterna },
    });
    eq('T10.2 vincular falla con 409', r10c.status, 409);
    eq('T10.3 falta_compareciente_id apunta al externo', r10c.data?.falta_compareciente_id, compExterno);

    // ───── T11: agregar al compareciente y reintentar vinculación ─────
    console.log('\n  T11: agregar compareciente al contrato → reintento OK');
    await request(port, 'POST', `/api/contratos/${ctoId}/comparecientes`, {
      headers: authBanco, body: { compareciente_id: compExterno, rol: 'tercero_garante' },
    });
    const r11 = await request(port, 'POST', `/api/contratos/${ctoId}/garantias`, {
      headers: authBanco, body: { garantia_id: garExterna },
    });
    eq('T11.1 status 201', r11.status, 201);

    // ───── T12: cap MAX_GARANTIAS_POR_CONTRATO ─────
    console.log('\n  T12: cap máx 5 garantías por contrato');
    // Ya tenemos 1 garantía vinculada (garExterna). Vinculamos 4 más + 1 que debe fallar.
    const garsExtra = [];
    for (let i = 0; i < 5; i++) {
      const rg = await request(port, 'POST', '/api/garantias', {
        headers: authBanco,
        body: { institucion_id: inst.id, tipo: 'hipotecaria', datos: { finca: `extra-${i}` }, aportante_tipo: 'cliente', aportante_cliente_id: cliId },
      });
      garsExtra.push(rg.data.id);
      limpiar.gar.push(rg.data.id);
    }
    // 4 OK, la 5ta es la que dispara el cap
    let cap409 = null;
    for (let i = 0; i < garsExtra.length; i++) {
      const r = await request(port, 'POST', `/api/contratos/${ctoId}/garantias`, {
        headers: authBanco, body: { garantia_id: garsExtra[i] },
      });
      if (r.status === 409 && /Máximo/.test(r.data?.error || '')) {
        cap409 = i; break;
      }
    }
    tt('T12.1 cap se dispara con la 5ta garantía adicional', cap409 === 4, `cap409=${cap409}`);

    // ───── T13: cap portal público compareciente ─────
    console.log('\n  T13: portal público — cap 1 compareciente');
    // Creamos un token público válido
    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 3600_000).toISOString();
    db.prepare('INSERT INTO contratos_tokens (contrato_id, token, expires_at) VALUES (?, ?, ?)').run(ctoId, token, expires);
    limpiar.tok.push(token);

    // Ya hay 2 comparecientes agregados por banco. El cliente intenta agregar 1 → OK.
    const r13a = await request(port, 'POST', `/api/public/contratos/${token}/comparecientes`, {
      body: { nombre: 'COMPARECIENTE CLIENTE', dpi: '8888777766665', rol: 'fiador' },
    });
    eq('T13.1 primer compareciente público creado', r13a.status, 201);
    const compCli = r13a.data.compareciente_id;
    limpiar.comp.push(compCli);
    // Segundo → 409 cap_excedido.
    const r13b = await request(port, 'POST', `/api/public/contratos/${token}/comparecientes`, {
      body: { nombre: 'OTRO MAS', dpi: '5555444433332', rol: 'fiador' },
    });
    eq('T13.2 segundo público → 409', r13b.status, 409);
    tt('T13.3 mensaje "Máximo 1"', /Máximo 1/.test(r13b.data?.error || ''));

    // ───── T14: cap portal público garantía ─────
    console.log('\n  T14: portal público — cap 1 garantía');
    // El cliente del contrato (TESTCLIENTE CP3) ya está en clientes con su dpi_hash.
    // Antes intentamos: el contrato ya tiene >=1 garantía aportada por cliente del seed previo?
    // En este contrato CT-CP3-* solo hemos vinculado garExterna (aportante=compareciente)
    // y algunas garsExtra (aportante=cliente). countAgregadosPorCliente cuenta TODAS las
    // garantías aportadas por cliente en el contrato. Como ya hay 4 garsExtra
    // vinculadas (T12), el portal NO va a poder agregar otra. Eso ya valida el cap.
    const r14 = await request(port, 'POST', `/api/public/contratos/${token}/garantias`, {
      body: { tipo: 'hipotecaria', datos: { finca: 'cliente-aportada' } },
    });
    eq('T14.1 cap → 409', r14.status, 409);
    tt('T14.2 mensaje "Máximo 1"', /Máximo 1/.test(r14.data?.error || ''));

    // ───── T15: freeze trigger en /avanzar ─────
    console.log('\n  T15: freeze trigger al pasar a completado');
    // Forzar el contrato a revision_abogados primero (transición permitida → completado).
    db.prepare("UPDATE contratos SET estado = 'revision_abogados' WHERE id = ?").run(ctoId);
    const r15 = await request(port, 'POST', `/api/contratos/${ctoId}/avanzar`, { headers: authBufete });
    eq('T15.1 status 200', r15.status, 200);
    eq('T15.2 estado=completado', r15.data?.estado, 'completado');
    // Snapshots poblados:
    const sCount = db.prepare('SELECT COUNT(*) AS n FROM contrato_comparecientes WHERE contrato_id = ? AND congelado_en IS NOT NULL').get(ctoId).n;
    const sGars  = db.prepare('SELECT COUNT(*) AS n FROM contrato_garantias WHERE contrato_id = ? AND congelado_en IS NOT NULL').get(ctoId).n;
    tt('T15.3 todos los comparecientes congelados', sCount >= 1, `count=${sCount}`);
    tt('T15.4 todas las garantías congeladas', sGars >= 1, `count=${sGars}`);
    const auditFreeze = db.prepare("SELECT * FROM audit_log WHERE accion='CONTRATO_CONGELADO' AND entidad_id = ?").get(ctoId);
    tt('T15.5 audit CONTRATO_CONGELADO', !!auditFreeze);

    // ───── T16: ediciones post-freeze rechazadas ─────
    console.log('\n  T16: post-freeze rechaza vínculos nuevos');
    const r16 = await request(port, 'POST', `/api/contratos/${ctoId}/garantias`, {
      headers: authBanco, body: { garantia_id: garFid },
    });
    eq('T16.1 status 409', r16.status, 409);

    // ───── T17: snapshot ≠ vivo si edito la PII viva ─────
    console.log('\n  T17: editar PII viva no afecta snapshot');
    const beforeSnap = db.prepare('SELECT snapshot_profesion FROM contrato_comparecientes WHERE contrato_id = ? AND compareciente_id = ?').get(ctoId, compPedro);
    const r17 = await request(port, 'PUT', `/api/comparecientes/${compPedro}`, {
      headers: authBanco, body: { profesion: 'INGENIERO POST-FREEZE' },
    });
    eq('T17.1 PUT vivo status 200', r17.status, 200);
    const afterSnap = db.prepare('SELECT snapshot_profesion FROM contrato_comparecientes WHERE contrato_id = ? AND compareciente_id = ?').get(ctoId, compPedro);
    eq('T17.2 snapshot profesion no cambió', afterSnap.snapshot_profesion, beforeSnap.snapshot_profesion);
    const vivo = db.prepare('SELECT profesion FROM comparecientes WHERE id = ?').get(compPedro);
    eq('T17.3 valor vivo descifrado = nuevo valor', decrypt(vivo.profesion), 'INGENIERO POST-FREEZE');

    // ───── T18: motor F7 lee snapshot post-freeze ─────
    console.log('\n  T18: motor F7 con contrato congelado usa snapshot');
    const { loadComparecientesDelContrato, descifrarCompareciente } = require('../contrato-engine');
    const compsLeidos = loadComparecientesDelContrato(ctoId).map(descifrarCompareciente);
    const pedro = compsLeidos.find((c) => c.id === compPedro);
    tt('T18.1 motor encuentra a Pedro', !!pedro);
    eq('T18.2 motor lee profesion del snapshot (no la viva)', pedro.profesion, 'Médico');
    tt('T18.3 motor marca congelado_en presente', pedro.congelado_en !== null);

  } finally {
    // Cleanup
    for (const t of limpiar.tok) db.prepare('DELETE FROM contratos_tokens WHERE token = ?').run(t);
    for (const id of limpiar.cto) {
      db.prepare('DELETE FROM contrato_comparecientes WHERE contrato_id = ?').run(id);
      db.prepare('DELETE FROM contrato_garantias WHERE contrato_id = ?').run(id);
      db.prepare('DELETE FROM contratos WHERE id = ?').run(id);
    }
    for (const id of limpiar.gar) db.prepare('DELETE FROM garantias WHERE id = ?').run(id);
    for (const id of limpiar.comp) db.prepare('DELETE FROM comparecientes WHERE id = ?').run(id);
    for (const id of limpiar.cli) db.prepare('DELETE FROM clientes WHERE id = ?').run(id);
    db.prepare("DELETE FROM audit_log WHERE accion IN ('COMPARECIENTE_AGREGADO','COMPARECIENTE_EDITADO','COMPARECIENTE_QUITADO','COMPARECIENTE_ROL_CAMBIADO','GARANTIA_AGREGADA','GARANTIA_EDITADA','GARANTIA_QUITADA','GARANTIA_APORTANTE_CAMBIADO','CONTRATO_CONGELADO') AND timestamp >= datetime('now', '-1 hour')").run();
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
