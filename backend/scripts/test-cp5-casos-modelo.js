// Sprint garantías-desacopladas CP5 — Tests E2E del modelo real.
//
// Ejecutar: npm run test:cp5
//
// Cubre los 5 casos del cuadro 3.2 del diseño:
//   T1: Solo fiador (sin bienes).
//   T2: Solo cliente hipoteca, sin fiadores.
//   T3: Fiador + cliente hipoteca.
//   T4: Fiador que además hipoteca (mismo compareciente).
//   T5: Tercero hipoteca sin ser fiador.
//
// Por cada caso:
//   a) Crea contrato + comparecientes + garantías con las APIs CP3.
//   b) Compila con el motor F7.
//   c) Verifica 4 reglas: R1 (cero vars sin resolver), R2 (cero números
//      en cifra sola fuera de formato legal), R3 (días/fechas en formato
//      legal), R4 (sin __MISSING__ ni [VAR]).
//   d) Verifica el aportante visible en el texto generado.
//   e) Vuelca el bloque "comparecencia" + "garantías" a un reporte
//      docs/sprint-garantias-cp5-casos.md para validación legal.

const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';

const db = require('../db');
const app = require('../server');
const { JWT_SECRET } = require('../config');
const { encrypt, hashFor } = require('../encryption');
const { compilarContrato } = require('../contrato-engine');

let pass = 0, fail = 0;
const failures = [];
const reportes = []; // capturas por caso para el reporte legal

function ok(name) { pass++; console.log(`    PASS  ${name}`); }
function nope(name, expected, actual) {
  fail++; failures.push(name);
  console.log(`    FAIL  ${name}`);
  console.log(`          esperado: ${JSON.stringify(expected)}`);
  console.log(`          actual:   ${JSON.stringify(actual)}`);
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
        let data = null; try { data = JSON.parse(text); } catch { data = text; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}
function tokenFor(user) {
  return jwt.sign({
    userId: user.id, email: user.email, role: user.role, institucion_id: user.institucion_id,
  }, JWT_SECRET, { expiresIn: '1h' });
}

// ───────────────────────────────────────────────────────────────
// Validación de las 4 reglas de formato (misma heurística que
// scripts/compile-and-print.js).
// ───────────────────────────────────────────────────────────────
function validarReglas(textoCompleto) {
  // R1: variables {{*}} sin resolver
  const vars = [];
  const reVars = /\{\{(\w+)\}\}/g; let mm;
  while ((mm = reVars.exec(textoCompleto)) !== null) vars.push(mm[1]);

  // R2: números en cifra sola fuera de paréntesis / direcciones / IDs
  let limpio = textoCompleto;
  let prev = null;
  while (prev !== limpio) { prev = limpio; limpio = limpio.replace(/\([^()]*\)/g, '[OK]'); }
  limpio = limpio.replace(/\b[A-Z]{2,}-[A-Z0-9-]+/g, '[ID]');
  limpio = limpio.replace(/\b\d+(?:-\d+)+\b/g, '[CTA]');
  // Placas vehiculares formato P-987-XYZ o similar (letra-num-letra con guiones).
  limpio = limpio.replace(/\b[A-Z]+-\d+(?:-[A-Z]+)?\b/g, '[PLACA]');
  limpio = limpio.replace(/\b\d+\s+(calle|avenida|av\.)/gi, '[DIR]');
  limpio = limpio.replace(/\bzona\s+\d+/gi, '[DIR]');
  limpio = limpio.replace(/\b(19|20)\d{2}\b/g, '[AÑO]');
  const numeros = [];
  const reNums = /\b(\d+)(?:[.,]\d+)?\b/g; let nm;
  while ((nm = reNums.exec(limpio)) !== null) numeros.push(nm[1]);

  // R3: hay alguna fecha/día en formato legal
  const tieneFormatoLegal = /día [a-záéíóú]+/i.test(textoCompleto);

  // R4: sin __MISSING__ ni [VAR]
  const tieneMissing = /__MISSING__/.test(textoCompleto);
  const brackets = [...textoCompleto.matchAll(/\[([A-Z_]+)\]/g)].map((m) => m[1]);

  return {
    R1: { ok: vars.length === 0, vars },
    R2: { ok: numeros.length === 0, numeros },
    R3: { ok: tieneFormatoLegal },
    R4: { ok: !tieneMissing && brackets.length === 0, missing: tieneMissing, brackets: [...new Set(brackets)] },
  };
}

// ───────────────────────────────────────────────────────────────
// Setup compartido: institución + cliente + modelo + datos crédito/firmas.
// ───────────────────────────────────────────────────────────────
const SUFFIX = `cp5_${Date.now()}`;
const ids = { inst: null, cli: null, mod: null, port: null, banco: null, comparecientes: [], garantias: [], contratos: [] };

function findInst() {
  return db.prepare("SELECT id, slug FROM instituciones WHERE slug = 'banco-rsg'").get();
}
function findBancoUser(instId) {
  return db.prepare("SELECT id, email, role, institucion_id FROM users WHERE institucion_id = ?").get(instId);
}
function findClienteOTransitorio(instId, dpi) {
  const dpiH = hashFor('dpi', dpi);
  let row = db.prepare('SELECT id FROM clientes WHERE institucion_id = ? AND dpi_hash = ?').get(instId, dpiH);
  if (row) return row.id;
  const info = db.prepare(`
    INSERT INTO clientes (institucion_id, nombre, dpi, dpi_hash, genero, tipo_persona, estado, profesion, estado_civil, fecha_nac, domicilio)
    VALUES (?, ?, ?, ?, 'M', 'individual', 'activo', 'Ingeniero', 'casado', '1987-03-15', ?)
  `).run(instId, 'CARLOS EDUARDO MENDEZ SOTO CP5', encrypt(dpi), dpiH, encrypt('12 calle 8-45 zona 10'));
  return info.lastInsertRowid;
}
function findModelo(instId) {
  return db.prepare("SELECT id FROM modelos WHERE institucion_id = ? AND nombre = 'Crédito Personal F7' LIMIT 1").get(instId);
}

function crearContrato(instId, modId, noContrato, datosClienteObj) {
  const info = db.prepare(`
    INSERT INTO contratos (institucion_id, modelo_id, no_contrato, estado, datos_cliente, datos_credito, datos_firmas)
    VALUES (?, ?, ?, 'en_curso', ?, ?, ?)
  `).run(
    instId, modId, noContrato,
    encrypt(JSON.stringify(datosClienteObj)),
    JSON.stringify({
      moneda: 'GTQ', monto: '150000.00', destino: 'remodelación de vivienda',
      forma_desembolso: 'acreditación en cuenta de ahorros',
      plazo_meses: '60', fecha_inicio: '2026-06-01', sistema_amort: 'cuotas niveladas',
      cuota_mensual: '3525.40', dia_pago_inicio: '5', dia_pago_fin: '10',
      cuenta_banco: '01-2345-6789', tipo_pago: 'debito_automatico',
      tasa_ordinaria: '14.5', base_calculo: '365', tasa_moratoria: '5', cuotas_incumplimiento: '3',
    }),
    JSON.stringify({
      notario: 'Lic. Roberto Castillo Aldana', colegiado: '8765',
      ciudad: 'Ciudad de Guatemala', fecha: '2026-06-01',
      correlativo: noContrato, folio_protocolo: '142',
    }),
  );
  ids.contratos.push(info.lastInsertRowid);
  return info.lastInsertRowid;
}

// ───────────────────────────────────────────────────────────────
// Validación de un caso completo: arma contrato + escenario + compila +
// valida reglas + extrae bloque comparecencia y garantías.
// ───────────────────────────────────────────────────────────────
function validarCaso(label, contratoId, datosClienteObj, aportantesEsperados = []) {
  console.log(`\n  ─── ${label} (contrato ${contratoId}) ───`);
  const datos = {
    no_contrato: 'TEST-' + contratoId,
    datos_cliente: datosClienteObj,
    datos_credito: JSON.parse(db.prepare('SELECT datos_credito FROM contratos WHERE id = ?').get(contratoId).datos_credito),
    datos_garantia: {},
    datos_firmas: JSON.parse(db.prepare('SELECT datos_firmas FROM contratos WHERE id = ?').get(contratoId).datos_firmas),
  };
  let compilado;
  try {
    compilado = compilarContrato(
      db.prepare('SELECT modelo_id FROM contratos WHERE id = ?').get(contratoId).modelo_id,
      datos,
      { contrato_id: contratoId },
    );
  } catch (e) {
    nope(`${label} compila`, 'success', `Excepción: ${e.message}`);
    return null;
  }
  ok(`${label} compila`);

  const texto = compilado.clausulas.map((c) => c.texto).join('\n');
  const reglas = validarReglas(texto);

  tt(`${label} R1 sin {{var}} sin resolver`, reglas.R1.ok, reglas.R1.vars.join(','));
  tt(`${label} R2 cero números en cifra sola`, reglas.R2.ok, reglas.R2.numeros.join(','));
  tt(`${label} R3 días/fechas en formato legal`, reglas.R3.ok);
  tt(`${label} R4 sin __MISSING__ ni [VAR]`, reglas.R4.ok, JSON.stringify({ missing: reglas.R4.missing, brackets: reglas.R4.brackets }));

  // Aportantes esperados: cada string debe aparecer en el texto
  for (const ap of aportantesEsperados) {
    tt(`${label} aportante "${ap}" aparece en texto`, texto.includes(ap), `no encontrado en: ...${texto.slice(0, 100)}...`);
  }

  // Bloques específicos
  const compr = compilado.clausulas.find((c) => c.codigo === 'comparecencia');
  const gar = compilado.clausulas.find((c) => c.codigo === 'quinta-garantias');

  reportes.push({
    label,
    contratoId,
    comparecencia: compr?.texto || '(no comparecencia)',
    garantias: gar?.texto || '(no garantías)',
    reglas,
  });

  return compilado;
}

// ───────────────────────────────────────────────────────────────
// MAIN
// ───────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' Sprint garantías-desacopladas CP5 — Tests E2E del modelo real');
  console.log('═══════════════════════════════════════════════════════════════════');

  const { server, port } = await startServer();
  const inst = findInst();
  if (!inst) { console.error('falta institución banco-rsg'); server.close(); process.exit(1); }
  const banco = findBancoUser(inst.id);
  const adminUser = db.prepare("SELECT id, email, role, institucion_id FROM users WHERE role = 'admin' AND institucion_id IS NULL").get();
  if (!banco || !adminUser) { console.error('falta usuarios'); server.close(); process.exit(1); }
  const authBanco = { Authorization: `Bearer ${tokenFor(banco)}` };
  const modelo = findModelo(inst.id);
  if (!modelo) {
    console.error('falta modelo "Crédito Personal F7". Corra antes: npm run seed:garantias-cp25');
    server.close(); process.exit(1);
  }
  ids.inst = inst.id;
  ids.mod = modelo.id;
  ids.banco = banco.id;

  const dpiCliente = '1234567890123';
  const cliId = findClienteOTransitorio(inst.id, dpiCliente);

  // Helpers ergonómicos sobre los endpoints CP3
  const crearComp = async (datos) => {
    const r = await request(port, 'POST', '/api/comparecientes', { headers: authBanco, body: { institucion_id: inst.id, ...datos } });
    if (r.status !== 201) throw new Error(`crear comp falló (${r.status}): ${JSON.stringify(r.data)}`);
    ids.comparecientes.push(r.data.id);
    return r.data.id;
  };
  const vincularComp = async (cto, compId, rol) => {
    const r = await request(port, 'POST', `/api/contratos/${cto}/comparecientes`, { headers: authBanco, body: { compareciente_id: compId, rol } });
    if (r.status !== 201) throw new Error(`vincular comp falló (${r.status}): ${JSON.stringify(r.data)}`);
  };
  const crearGar = async (body) => {
    const r = await request(port, 'POST', '/api/garantias', { headers: authBanco, body: { institucion_id: inst.id, ...body } });
    if (r.status !== 201) throw new Error(`crear garantía falló (${r.status}): ${JSON.stringify(r.data)}`);
    ids.garantias.push(r.data.id);
    return r.data.id;
  };
  const vincularGar = async (cto, garId) => {
    const r = await request(port, 'POST', `/api/contratos/${cto}/garantias`, { headers: authBanco, body: { garantia_id: garId } });
    if (r.status !== 201) throw new Error(`vincular garantía falló (${r.status}): ${JSON.stringify(r.data)}`);
  };

  const datosCliente = {
    nombre: 'CARLOS EDUARDO MENDEZ SOTO CP5',
    dpi: dpiCliente,
    estado_civil: 'casado',
    profesion: 'Ingeniero',
    domicilio: '12 calle 8-45 zona 10',
    genero: 'M',
    fecha_nac: '1987-03-15',
  };

  try {
    // ═══════════════════════════════════════════════════════════
    // T1 — Solo fiador (sin bienes)
    // ═══════════════════════════════════════════════════════════
    const ctoT1 = crearContrato(inst.id, modelo.id, `CT-CP5-T1-${Date.now()}`, datosCliente);
    const fiador1Id = await crearComp({ nombre: 'PEDRO PERALTA T1', dpi: '7777111122223', profesion: 'Comerciante', estado_civil: 'casado', domicilio: '5a 6-78 zona 2', fecha_nac: '1980-05-10', genero: 'M' });
    await vincularComp(ctoT1, fiador1Id, 'fiador');
    const garFid = await crearGar({ tipo: 'fiduciaria', solidaria: 1 });
    await vincularGar(ctoT1, garFid);
    validarCaso('T1 · solo fiador (fiduciaria solidaria)', ctoT1, datosCliente, ['PEDRO PERALTA T1']);

    // ═══════════════════════════════════════════════════════════
    // T2 — Solo cliente hipoteca, sin fiadores
    // ═══════════════════════════════════════════════════════════
    const ctoT2 = crearContrato(inst.id, modelo.id, `CT-CP5-T2-${Date.now()}`, datosCliente);
    const hipCliId = await crearGar({
      tipo: 'hipotecaria', datos: { finca: 12345, folio: 67, libro: 8, registro: 'General de la Propiedad', direccion: '12 calle 8-45 zona 10' },
      aportante_tipo: 'cliente', aportante_cliente_id: cliId,
    });
    await vincularGar(ctoT2, hipCliId);
    validarCaso('T2 · cliente hipoteca (sin fiador)', ctoT2, datosCliente, ['CARLOS EDUARDO MENDEZ']);

    // ═══════════════════════════════════════════════════════════
    // T3 — Fiador + cliente hipoteca
    // ═══════════════════════════════════════════════════════════
    const ctoT3 = crearContrato(inst.id, modelo.id, `CT-CP5-T3-${Date.now()}`, datosCliente);
    const fiador3Id = await crearComp({ nombre: 'JUAN GARCIA T3', dpi: '8888222233334', profesion: 'Médico', estado_civil: 'soltero', domicilio: '3a 4-50 zona 14', fecha_nac: '1985-09-22', genero: 'M' });
    await vincularComp(ctoT3, fiador3Id, 'fiador');
    const garFid3 = await crearGar({ tipo: 'fiduciaria', solidaria: 1 });
    await vincularGar(ctoT3, garFid3);
    const hipCli3 = await crearGar({
      tipo: 'hipotecaria', datos: { finca: 555, folio: 12, libro: 3, registro: 'General de la Propiedad', direccion: '12 calle 8-45 zona 10' },
      aportante_tipo: 'cliente', aportante_cliente_id: cliId,
    });
    await vincularGar(ctoT3, hipCli3);
    validarCaso('T3 · fiador + hipoteca cliente', ctoT3, datosCliente, ['JUAN GARCIA T3', 'CARLOS EDUARDO MENDEZ']);

    // ═══════════════════════════════════════════════════════════
    // T4 — Fiador que además hipoteca (mismo compareciente)
    // ═══════════════════════════════════════════════════════════
    const ctoT4 = crearContrato(inst.id, modelo.id, `CT-CP5-T4-${Date.now()}`, datosCliente);
    const fiador4Id = await crearComp({ nombre: 'MARIA LOPEZ T4', dpi: '9999333344445', profesion: 'Arquitecta', estado_civil: 'casada', domicilio: '6a 7-89 zona 9', fecha_nac: '1990-12-03', genero: 'F' });
    await vincularComp(ctoT4, fiador4Id, 'fiador');
    const garFid4 = await crearGar({ tipo: 'fiduciaria', solidaria: 1 });
    await vincularGar(ctoT4, garFid4);
    const hipFiador = await crearGar({
      tipo: 'hipotecaria', datos: { finca: 888, folio: 22, libro: 4, registro: 'General de la Propiedad', direccion: '6a avenida 7-89 zona 9' },
      aportante_tipo: 'compareciente', aportante_compareciente_id: fiador4Id,
    });
    await vincularGar(ctoT4, hipFiador);
    validarCaso('T4 · fiador-que-hipoteca', ctoT4, datosCliente, ['MARIA LOPEZ T4']);

    // ═══════════════════════════════════════════════════════════
    // T5 — Tercero hipoteca sin ser fiador
    // ═══════════════════════════════════════════════════════════
    const ctoT5 = crearContrato(inst.id, modelo.id, `CT-CP5-T5-${Date.now()}`, datosCliente);
    const terceroId = await crearComp({ nombre: 'ROBERTO MENDOZA T5', dpi: '1010444455556', profesion: 'Empresario', estado_civil: 'casado', domicilio: '8a 9-10 zona 4', fecha_nac: '1970-02-14', genero: 'M' });
    await vincularComp(ctoT5, terceroId, 'tercero_garante');
    const hipTercero = await crearGar({
      tipo: 'hipotecaria', datos: { finca: 999, folio: 33, libro: 5, registro: 'General de la Propiedad', direccion: '8a avenida 9-10 zona 4' },
      aportante_tipo: 'compareciente', aportante_compareciente_id: terceroId,
    });
    await vincularGar(ctoT5, hipTercero);
    validarCaso('T5 · tercero garante hipoteca (sin fiador)', ctoT5, datosCliente, ['ROBERTO MENDOZA T5']);

    // ═══════════════════════════════════════════════════════════
    // T6 (bonus) — Combinación: 2 fiadores + hipoteca cliente + prenda tercero
    // ═══════════════════════════════════════════════════════════
    const ctoT6 = crearContrato(inst.id, modelo.id, `CT-CP5-T6-${Date.now()}`, datosCliente);
    const fiadorA = await crearComp({ nombre: 'ANDRES SOLIS T6A', dpi: '1111555566667', profesion: 'Contador', estado_civil: 'soltero', domicilio: '1a 2-3 zona 1', fecha_nac: '1988-07-19', genero: 'M' });
    const fiadorB = await crearComp({ nombre: 'BEATRIZ TORRES T6B', dpi: '2222666677778', profesion: 'Abogada', estado_civil: 'casada', domicilio: '2a 3-4 zona 1', fecha_nac: '1982-04-11', genero: 'F' });
    const terceroC = await crearComp({ nombre: 'CESAR DIAZ T6C', dpi: '3333777788889', profesion: 'Empresario', estado_civil: 'casado', domicilio: '3a 4-5 zona 1', fecha_nac: '1975-11-30', genero: 'M' });
    await vincularComp(ctoT6, fiadorA, 'fiador');
    await vincularComp(ctoT6, fiadorB, 'fiador');
    await vincularComp(ctoT6, terceroC, 'tercero_garante');
    const garFid6 = await crearGar({ tipo: 'fiduciaria', solidaria: 1 });
    await vincularGar(ctoT6, garFid6);
    const hipCli6 = await crearGar({
      tipo: 'hipotecaria', datos: { finca: 1100, folio: 44, libro: 6, registro: 'General de la Propiedad', direccion: '12 calle 8-45 zona 10' },
      aportante_tipo: 'cliente', aportante_cliente_id: cliId,
    });
    await vincularGar(ctoT6, hipCli6);
    const prendaTer = await crearGar({
      tipo: 'prendaria', datos: { tipo_bien: 'vehículo automotor', marca: 'Toyota', modelo: 'Hilux 2024', serie: 'ABC123XYZ456', placa: 'P-987-XYZ' },
      aportante_tipo: 'compareciente', aportante_compareciente_id: terceroC,
    });
    await vincularGar(ctoT6, prendaTer);
    validarCaso('T6 · mixta (2 fiadores + hipoteca cliente + prenda tercero)',
      ctoT6, datosCliente,
      ['ANDRES SOLIS', 'BEATRIZ TORRES', 'CARLOS EDUARDO MENDEZ', 'CESAR DIAZ']);

    // ═══════════════════════════════════════════════════════════
    // Generar reporte de validación legal
    // ═══════════════════════════════════════════════════════════
    const reportePath = path.resolve(__dirname, '..', '..', 'docs', 'sprint-garantias-cp5-casos.md');
    const md = generarMarkdown(reportes);
    fs.mkdirSync(path.dirname(reportePath), { recursive: true });
    fs.writeFileSync(reportePath, md, 'utf-8');
    console.log(`\n  📄 Reporte de validación legal guardado en: docs/sprint-garantias-cp5-casos.md`);

  } finally {
    // Cleanup
    for (const id of ids.contratos) {
      db.prepare('DELETE FROM contrato_comparecientes WHERE contrato_id = ?').run(id);
      db.prepare('DELETE FROM contrato_garantias WHERE contrato_id = ?').run(id);
      db.prepare('DELETE FROM contratos WHERE id = ?').run(id);
    }
    for (const id of ids.garantias) db.prepare('DELETE FROM garantias WHERE id = ?').run(id);
    for (const id of ids.comparecientes) db.prepare('DELETE FROM comparecientes WHERE id = ?').run(id);
    db.prepare("DELETE FROM audit_log WHERE accion IN ('COMPARECIENTE_AGREGADO','COMPARECIENTE_EDITADO','COMPARECIENTE_QUITADO','COMPARECIENTE_ROL_CAMBIADO','GARANTIA_AGREGADA','GARANTIA_EDITADA','GARANTIA_QUITADA','GARANTIA_APORTANTE_CAMBIADO') AND timestamp >= datetime('now', '-1 hour')").run();
    server.close();
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(` Resultado: ${pass} PASS · ${fail} FAIL`);
  if (fail > 0) { console.log(' FAILS:'); failures.forEach((f) => console.log(`   - ${f}`)); }
  console.log('═══════════════════════════════════════════════════════════════════');
  process.exit(fail > 0 ? 1 : 0);
}

function generarMarkdown(reportes) {
  const lines = [];
  lines.push('# Sprint garantías-desacopladas CP5 — Casos del modelo real');
  lines.push('');
  lines.push('Validación de la compilación del motor F7 para los 5 casos del cuadro 3.2');
  lines.push('del diseño aprobado + 1 caso mixto. **Este documento debe ser revisado por');
  lines.push('un abogado del bufete antes de habilitar la generación de PDFs reales con');
  lines.push('comparecientes y garantías del modelo nuevo.**');
  lines.push('');
  lines.push('Cada caso muestra:');
  lines.push('1. Bloque de comparecencia generado.');
  lines.push('2. Cláusula de garantías generada.');
  lines.push('3. Verificación de las 4 reglas de formato (R1-R4).');
  lines.push('');
  lines.push(`Generado por \`backend/scripts/test-cp5-casos-modelo.js\` el ${new Date().toISOString().slice(0, 10)}.`);
  lines.push('');
  lines.push('---');
  lines.push('');
  for (const r of reportes) {
    lines.push(`## ${r.label}`);
    lines.push('');
    lines.push(`### Comparecencia`);
    lines.push('');
    lines.push('> ' + r.comparecencia.replace(/\n/g, '\n> '));
    lines.push('');
    lines.push(`### Cláusula de Garantías`);
    lines.push('');
    lines.push('> ' + r.garantias.replace(/\n/g, '\n> '));
    lines.push('');
    lines.push(`### Verificación de reglas`);
    lines.push('');
    lines.push(`- **R1** (sin \`{{var}}\` sin resolver): ${r.reglas.R1.ok ? '✓ OK' : `✗ vars: ${r.reglas.R1.vars.join(', ')}`}`);
    lines.push(`- **R2** (cero números en cifra sola): ${r.reglas.R2.ok ? '✓ OK' : `✗ números: ${r.reglas.R2.numeros.join(', ')}`}`);
    lines.push(`- **R3** (fechas/días en formato legal): ${r.reglas.R3.ok ? '✓ OK' : '✗ FAIL'}`);
    lines.push(`- **R4** (sin \`__MISSING__\` ni \`[VAR]\`): ${r.reglas.R4.ok ? '✓ OK' : `✗ brackets: ${r.reglas.R4.brackets.join(', ')}`}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  lines.push('## Pendiente de validación legal');
  lines.push('');
  lines.push('Para que el motor F7 con el modelo nuevo (comparecientes + aportantes')
  lines.push('separados) sea apto para producción, un abogado del bufete debe confirmar:');
  lines.push('');
  lines.push('1. **Frase del tercero garante**: el texto generado cuando un compareciente');
  lines.push('   con rol `tercero_garante` aporta una hipoteca/prenda — ¿es legalmente');
  lines.push('   correcto en Guatemala? (ver T5 y T6 arriba).');
  lines.push('2. **Frase del fiador que además hipoteca**: el caso T4 donde una sola');
  lines.push('   persona figura como fiador Y como aportante de una hipoteca propia.');
  lines.push('3. **Comparecencia con múltiples comparecientes**: el texto del bloque');
  lines.push('   `{{comparecencia}}` con N comparecientes (ver T6) — ¿la enumeración');
  lines.push('   y los participios (FIADOR / TERCERO GARANTE) están bien?');
  lines.push('4. **Compatibilidad con tipos de modelo legacy**: hoy el motor genera el');
  lines.push('   mismo bloque para cualquier `modelos.tipo_garantia` (personal/');
  lines.push('   hipotecaria/prendaria/mixta) — ¿corresponde adaptar el texto a cada');
  lines.push('   tipo?');
  lines.push('');
  return lines.join('\n');
}

main().catch((e) => { console.error('ERROR no controlado:', e); process.exit(2); });
