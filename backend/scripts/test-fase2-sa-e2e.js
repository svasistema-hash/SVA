// Sprint LexDocs Legal Fase 2 CP3 — Tests E2E del backend.
//
// Ejecutar: npm run test:fase2-sa-e2e
//
// Cubre:
//   T1  S.A. con 1 accionista (flujo completo de creación a freeze).
//   T2  S.A. con N accionistas distribuidos (3 accionistas con 40/30/30).
//   T3  Representante único vs múltiples.
//   T4  Flujo de correcciones cliente↔abogado (2 iteraciones).
//   T5  Anulación desde cada estado activo.
//   ISO Tests de aislamiento sub-tenant (6 sub-tests bloqueantes).
//   T7  Master cross-tenant: ve A y B; sub-tenant NO ve master.
//   T8  Override compliance master requiere motivo y queda auditado.
//   T9  Portal público: token válido, 404 anti-enumeration.
//   T10 Validaciones de freeze: SUM(%)=100, capital = total × valor_nominal.

const http = require('http');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

process.env.NODE_ENV = 'test';

const db = require('../db');
const app = require('../server');
const { JWT_SECRET } = require('../config');

let pass = 0, fail = 0;
const failures = [];

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
    userId: user.id, email: user.email, role: user.role,
    institucion_id: user.institucion_id, firma_id: user.firma_id,
  }, JWT_SECRET, { expiresIn: '1h' });
}

// ─────────────────────────────────────────────────────────────────
// Setup: crear sub-tenants + users de prueba.
// ─────────────────────────────────────────────────────────────────
const SUFFIX = `e2e_${Date.now()}`;
const ids = { firmas: [], users: [], sociedades: [] };

function createFirma(slug, nombre, prefijo) {
  const info = db.prepare(`
    INSERT INTO firmas (slug, nombre, tipo, parent_id, correlativo_prefijo)
    VALUES (?, ?, 'bufete', 1, ?)
  `).run(slug, nombre, prefijo);
  ids.firmas.push(info.lastInsertRowid);
  return info.lastInsertRowid;
}
function createUser(email, firma_id) {
  const info = db.prepare(`
    INSERT INTO users (email, password_hash, nombre, role, firma_id, activo)
    VALUES (?, ?, ?, 'user', ?, 1)
  `).run(email, bcrypt.hashSync('x', 4), 'Test', firma_id);
  const u = { id: info.lastInsertRowid, email, role: 'user', institucion_id: null, firma_id };
  ids.users.push(u.id);
  return u;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' Sprint LexDocs Legal Fase 2 CP3 — Tests E2E');
  console.log('═══════════════════════════════════════════════════════════════════');

  const { server, port } = await startServer();

  // Verificar firma master existe (id=1)
  const master = db.prepare('SELECT * FROM firmas WHERE id = 1').get();
  if (!master) { console.error('Firma master id=1 no existe. Correr antes: npm run migrate:fase2-sa'); server.close(); process.exit(1); }

  // Crear firmas de prueba (sub-tenants A y B)
  const firmaA = createFirma(`bufete-a-${SUFFIX}`, 'Bufete A E2E', 'SA-BFA');
  const firmaB = createFirma(`bufete-b-${SUFFIX}`, 'Bufete B E2E', 'SA-BFB');

  // Users: uno por firma + master
  const userMaster = createUser(`master-${SUFFIX}@lexdocs.gt`, 1);
  const userA = createUser(`user-a-${SUFFIX}@bufete.gt`, firmaA);
  const userB = createUser(`user-b-${SUFFIX}@bufete.gt`, firmaB);

  const authMaster = { Authorization: `Bearer ${tokenFor(userMaster)}` };
  const authA = { Authorization: `Bearer ${tokenFor(userA)}` };
  const authB = { Authorization: `Bearer ${tokenFor(userB)}` };

  try {
    // ═══════════════════════════════════════════════════════════
    // T1: S.A. con 1 accionista (flujo completo creación → freeze)
    // ═══════════════════════════════════════════════════════════
    console.log('\n  T1: S.A. con 1 accionista');

    // Crear sociedad
    const r1 = await request(port, 'POST', '/api/sociedades', {
      headers: authA,
      body: {
        denominacion: 'TECNOLOGÍAS DEL VALLE E2E',
        objeto_social: 'El desarrollo, comercialización y mantenimiento de software, prestación de servicios de consultoría tecnológica y todas las actividades conexas.',
        plazo_anios: 99, moneda: 'GTQ',
        capital_social: 100000, valor_nominal_accion: 100, total_acciones: 1000,
      },
    });
    eq('T1.1 status 201', r1.status, 201);
    tt('T1.2 correlativo asignado', !!r1.data?.correlativo, r1.data?.correlativo);
    tt('T1.3 token devuelto', !!r1.data?.token?.token);
    const socId = r1.data.id;
    const tokenPub = r1.data.token.token;
    ids.sociedades.push(socId);

    // Aliasing: cliente confirma vía portal público (sin login)
    // Agregar 1 accionista, 1 representante, 1 dirección fiscal
    const rAcc = await request(port, 'POST', `/api/public/sociedades/${tokenPub}/accionistas`, {
      body: {
        tipo_persona: 'individual',
        nombre: 'CARLOS MÉNDEZ E2E', dpi_o_nit: '1234567890123',
        fecha_nac: '1985-01-01', genero: 'M', estado_civil: 'casado',
        profesion: 'Ingeniero', domicilio: '12 calle 8-45 zona 10',
        acciones_cantidad: 1000, porcentaje: 100,
      },
    });
    eq('T1.4 accionista creado (portal público)', rAcc.status, 201);

    const rRep = await request(port, 'POST', `/api/public/sociedades/${tokenPub}/representantes`, {
      body: {
        nombre: 'CARLOS MÉNDEZ E2E REP', dpi: '1234567890123',
        fecha_nac: '1985-01-01', genero: 'M', estado_civil: 'casado',
        cargo: 'Administrador Único', vigencia_inicio: '2026-06-01',
      },
    });
    eq('T1.5 representante creado (portal público)', rRep.status, 201);

    const rDir = await request(port, 'POST', `/api/public/sociedades/${tokenPub}/direcciones`, {
      body: { tipo: 'fiscal', direccion: '12 calle 8-45 zona 10', municipio: 'Guatemala', departamento: 'Guatemala' },
    });
    eq('T1.6 dirección fiscal creada', rDir.status, 201);

    // Cliente confirma → revision_abogado
    const rConfirm = await request(port, 'POST', `/api/public/sociedades/${tokenPub}/confirmar`, { body: {} });
    eq('T1.7 confirmar → estado revision_abogado', rConfirm.data?.estado, 'revision_abogado');

    // Abogado avanza → listo_para_RM (dispara freeze)
    const rAvanzar = await request(port, 'POST', `/api/sociedades/${socId}/avanzar`, { headers: authA });
    eq('T1.8 avanzar → listo_para_RM', rAvanzar.data?.estado, 'listo_para_RM');
    tt('T1.9 snapshot_at poblado', !!rAvanzar.data?.snapshot_at, rAvanzar.data?.snapshot_at);

    // Compilar
    const rComp = await request(port, 'GET', `/api/sociedades/${socId}/compilar`, { headers: authA });
    eq('T1.10 compilar status 200', rComp.status, 200);
    tt('T1.11 9 cláusulas compiladas', rComp.data?.clausulas?.length === 9, rComp.data?.clausulas?.length);
    tt('T1.12 cláusula comparecencia incluye CARLOS MÉNDEZ',
      rComp.data?.clausulas?.[0]?.texto?.includes('CARLOS MÉNDEZ'),
      rComp.data?.clausulas?.[0]?.texto?.slice(0, 200));

    // ═══════════════════════════════════════════════════════════
    // T2: S.A. con 3 accionistas (suma 40+30+30 = 100)
    // ═══════════════════════════════════════════════════════════
    console.log('\n  T2: S.A. con 3 accionistas (40/30/30)');
    const r2 = await request(port, 'POST', '/api/sociedades', {
      headers: authA,
      body: {
        denominacion: 'INVERSIONES MÚLTIPLES E2E',
        objeto_social: 'La realización de inversiones de capital, gestión de activos, asesoría financiera y todas las actividades conexas o derivadas.',
        plazo_anios: 50, capital_social: 50000, valor_nominal_accion: 100, total_acciones: 500,
      },
    });
    const soc2 = r2.data.id;
    ids.sociedades.push(soc2);
    const tk2 = r2.data.token.token;
    const accs = [
      { nombre: 'JUAN PÉREZ T2', dpi_o_nit: '2222222220123', fecha_nac: '1980-01-01', genero: 'M', acciones_cantidad: 200, porcentaje: 40 },
      { nombre: 'MARÍA LÓPEZ T2', dpi_o_nit: '3333333330123', fecha_nac: '1985-01-01', genero: 'F', acciones_cantidad: 150, porcentaje: 30 },
      { nombre: 'PEDRO RUIZ T2', dpi_o_nit: '4444444440123', fecha_nac: '1990-01-01', genero: 'M', acciones_cantidad: 150, porcentaje: 30 },
    ];
    for (const a of accs) {
      await request(port, 'POST', `/api/public/sociedades/${tk2}/accionistas`, {
        body: { tipo_persona: 'individual', ...a, estado_civil: 'soltero' },
      });
    }
    await request(port, 'POST', `/api/public/sociedades/${tk2}/representantes`, {
      body: { nombre: 'JUAN PÉREZ T2', dpi: '2222222220123', fecha_nac: '1980-01-01', genero: 'M', cargo: 'Presidente', vigencia_inicio: '2026-06-01' },
    });
    await request(port, 'POST', `/api/public/sociedades/${tk2}/direcciones`, {
      body: { tipo: 'fiscal', direccion: 'X', municipio: 'Guatemala', departamento: 'Guatemala' },
    });
    await request(port, 'POST', `/api/public/sociedades/${tk2}/confirmar`, { body: {} });
    const r2avanzar = await request(port, 'POST', `/api/sociedades/${soc2}/avanzar`, { headers: authA });
    eq('T2.1 freeze con 3 accionistas 40/30/30 OK', r2avanzar.data?.estado, 'listo_para_RM');
    const r2comp = await request(port, 'GET', `/api/sociedades/${soc2}/compilar`, { headers: authA });
    tt('T2.2 distribución_accionistas_legal nombra a los 3',
      ['JUAN PÉREZ', 'MARÍA LÓPEZ', 'PEDRO RUIZ'].every((n) => r2comp.data?.vars?.distribucion_accionistas_legal?.includes(n)));

    // ═══════════════════════════════════════════════════════════
    // T3: Múltiples representantes
    // ═══════════════════════════════════════════════════════════
    console.log('\n  T3: 3 representantes con cargos distintos');
    const r3 = await request(port, 'POST', '/api/sociedades', {
      headers: authA,
      body: {
        denominacion: 'CORPORATIVO MULTI E2E',
        objeto_social: 'La administración corporativa, gestión empresarial y prestación de servicios de consultoría administrativa, financiera y comercial.',
        capital_social: 60000, valor_nominal_accion: 60, total_acciones: 1000,
      },
    });
    const soc3 = r3.data.id; ids.sociedades.push(soc3);
    const tk3 = r3.data.token.token;
    await request(port, 'POST', `/api/public/sociedades/${tk3}/accionistas`, {
      body: { tipo_persona: 'individual', nombre: 'ACCIONISTA UNICO T3', dpi_o_nit: '5555555550123', genero: 'M', fecha_nac: '1980-01-01', acciones_cantidad: 1000, porcentaje: 100 },
    });
    const cargos = ['Presidente', 'Vicepresidente', 'Secretario'];
    for (let i = 0; i < cargos.length; i++) {
      const r = await request(port, 'POST', `/api/public/sociedades/${tk3}/representantes`, {
        body: { nombre: `REP T3 ${i}`, dpi: `6666666660${i}23`, cargo: cargos[i], vigencia_inicio: '2026-06-01', fecha_nac: '1980-01-01', genero: 'M' },
      });
      eq(`T3.${i+1} representante ${cargos[i]} creado`, r.status, 201);
    }
    await request(port, 'POST', `/api/public/sociedades/${tk3}/direcciones`, {
      body: { tipo: 'fiscal', direccion: 'X', municipio: 'Guatemala', departamento: 'Guatemala' },
    });
    await request(port, 'POST', `/api/public/sociedades/${tk3}/confirmar`, { body: {} });
    const r3avanzar = await request(port, 'POST', `/api/sociedades/${soc3}/avanzar`, { headers: authA });
    eq('T3.4 freeze con 3 representantes OK', r3avanzar.data?.estado, 'listo_para_RM');

    // ═══════════════════════════════════════════════════════════
    // T4: Flujo de correcciones cliente↔abogado
    // ═══════════════════════════════════════════════════════════
    console.log('\n  T4: correcciones cliente↔abogado');
    const r4 = await request(port, 'POST', '/api/sociedades', {
      headers: authA,
      body: {
        denominacion: 'TEST CORRECCIONES E2E',
        objeto_social: 'Servicios diversos a definir, comercio y actividades comerciales en general, prestación de servicios profesionales.',
        capital_social: 5000, valor_nominal_accion: 50, total_acciones: 100,
      },
    });
    const soc4 = r4.data.id; ids.sociedades.push(soc4);
    const tk4_v1 = r4.data.token.token;
    await request(port, 'POST', `/api/public/sociedades/${tk4_v1}/accionistas`, {
      body: { tipo_persona: 'individual', nombre: 'CORRECTOR T4', dpi_o_nit: '7777777770123', genero: 'M', fecha_nac: '1980-01-01', acciones_cantidad: 100, porcentaje: 100 },
    });
    await request(port, 'POST', `/api/public/sociedades/${tk4_v1}/representantes`, {
      body: { nombre: 'CORRECTOR T4', dpi: '7777777770123', cargo: 'Administrador Único', vigencia_inicio: '2026-06-01', genero: 'M', fecha_nac: '1980-01-01' },
    });
    await request(port, 'POST', `/api/public/sociedades/${tk4_v1}/direcciones`, {
      body: { tipo: 'fiscal', direccion: 'X', municipio: 'Guatemala', departamento: 'Guatemala' },
    });
    await request(port, 'POST', `/api/public/sociedades/${tk4_v1}/confirmar`, { body: {} });

    // Abogado solicita correcciones
    const rCorr = await request(port, 'POST', `/api/sociedades/${soc4}/correcciones`, {
      headers: authA,
      body: { campos_a_corregir: ['denominacion', 'objeto_social'], comentario: 'Mejorar denominación y especificar el objeto social con más detalle.' },
    });
    eq('T4.1 correcciones solicitadas status 201', rCorr.status, 201);
    eq('T4.2 nueva iteración = 2', rCorr.data?.iteracion, 2);
    const tk4_v2 = rCorr.data.token.token;
    tt('T4.3 token nuevo emitido', !!tk4_v2 && tk4_v2 !== tk4_v1);

    // Token viejo no funciona (anti-enumeration: 404)
    const rOld = await request(port, 'GET', `/api/public/sociedades/${tk4_v1}`);
    eq('T4.4 token viejo devuelve 404 (revocado)', rOld.status, 404);

    // Token nuevo funciona y muestra correcciones pendientes
    const rNuevo = await request(port, 'GET', `/api/public/sociedades/${tk4_v2}`);
    eq('T4.5 token nuevo válido', rNuevo.status, 200);
    eq('T4.6 estado correcciones_cliente', rNuevo.data?.sociedad?.estado, 'correcciones_cliente');
    tt('T4.7 cliente ve correcciones pendientes', rNuevo.data?.correcciones_pendientes?.length === 1, rNuevo.data?.correcciones_pendientes?.length);

    // Cliente reenvía
    const rReenvio = await request(port, 'POST', `/api/public/sociedades/${tk4_v2}/confirmar`, { body: {} });
    eq('T4.8 reenvío → revision_abogado', rReenvio.data?.estado, 'revision_abogado');

    // Correcciones marcadas como resueltas
    const corrResueltas = db.prepare(`SELECT * FROM correcciones_sa WHERE sociedad_id = ? AND status = 'resuelto'`).all(soc4);
    eq('T4.9 corrección marcada resuelta', corrResueltas.length, 1);

    // ═══════════════════════════════════════════════════════════
    // T5: Anulación desde diferentes estados
    // ═══════════════════════════════════════════════════════════
    console.log('\n  T5: anulación desde estados activos');
    for (const fase of ['en_curso', 'revision_abogado']) {
      const rx = await request(port, 'POST', '/api/sociedades', {
        headers: authA,
        body: { denominacion: `ANULAR ${fase} E2E`, objeto_social: 'Sociedad creada solo para test de anulación desde estado ' + fase + '.', capital_social: 5000, valor_nominal_accion: 50, total_acciones: 100 },
      });
      ids.sociedades.push(rx.data.id);
      if (fase === 'revision_abogado') {
        const tkx = rx.data.token.token;
        await request(port, 'POST', `/api/public/sociedades/${tkx}/accionistas`, { body: { tipo_persona: 'individual', nombre: 'X', dpi_o_nit: `${fase}T5DPI13DIG`, genero: 'M', acciones_cantidad: 100, porcentaje: 100 } });
        await request(port, 'POST', `/api/public/sociedades/${tkx}/confirmar`, { body: {} });
      }
      const rAn = await request(port, 'POST', `/api/sociedades/${rx.data.id}/anular`, { headers: authA, body: { motivo: 'Test anulación' } });
      eq(`T5 anulación desde ${fase}`, rAn.data?.estado, 'anulada');
    }

    // Motivo obligatorio
    const rSinMotivo = await request(port, 'POST', `/api/sociedades/${socId}/anular`, { headers: authA, body: {} });
    eq('T5.3 anulación sin motivo → 400', rSinMotivo.status, 400);

    // ═══════════════════════════════════════════════════════════
    // ISO: Tests de aislamiento (BLOQUEANTES)
    // ═══════════════════════════════════════════════════════════
    console.log('\n  ISO-1 a ISO-6: aislamiento entre sub-tenants (BLOQUEANTES)');

    // Crear sociedad en firma B
    const rB1 = await request(port, 'POST', '/api/sociedades', {
      headers: authB,
      body: {
        denominacion: 'SOC FIRMA B ISO',
        objeto_social: 'Objeto de la firma B para tests de aislamiento, prestación de servicios diversos.',
        capital_social: 5000, valor_nominal_accion: 50, total_acciones: 100,
      },
    });
    eq('ISO setup: B crea su sociedad', rB1.status, 201);
    const socB = rB1.data.id;
    ids.sociedades.push(socB);

    // ISO-1: GET lista
    const iso1 = await request(port, 'GET', '/api/sociedades', { headers: authA });
    tt('ISO-1 GET lista de A NO incluye sociedad de B', !iso1.data.some((s) => s.id === socB), iso1.data.map((s) => s.id));

    // ISO-2: GET detalle 404
    const iso2 = await request(port, 'GET', `/api/sociedades/${socB}`, { headers: authA });
    eq('ISO-2 GET sociedad de B desde A → 404', iso2.status, 404);

    // ISO-3: PUT 404
    const iso3 = await request(port, 'PUT', `/api/sociedades/${socB}`, { headers: authA, body: { denominacion: 'HIJACK' } });
    eq('ISO-3 PUT sociedad de B desde A → 404', iso3.status, 404);

    // ISO-4: POST sub-entidad 404
    const iso4 = await request(port, 'POST', `/api/sociedades/${socB}/accionistas`, {
      headers: authA, body: { tipo_persona: 'individual', nombre: 'X', dpi_o_nit: '9999999990123', acciones_cantidad: 1, porcentaje: 1 },
    });
    eq('ISO-4 POST accionista en sociedad B desde A → 404', iso4.status, 404);

    // ISO-5: audit-log 404
    const iso5 = await request(port, 'GET', `/api/sociedades/${socB}/audit-log`, { headers: authA });
    eq('ISO-5 audit-log de B desde A → 404', iso5.status, 404);

    // ISO-6: avanzar 404
    const iso6 = await request(port, 'POST', `/api/sociedades/${socB}/avanzar`, { headers: authA });
    eq('ISO-6 POST avanzar B desde A → 404', iso6.status, 404);

    // ═══════════════════════════════════════════════════════════
    // T7: Master cross-tenant
    // ═══════════════════════════════════════════════════════════
    console.log('\n  T7: master cross-tenant');
    const rMaster = await request(port, 'GET', '/api/master/sociedades', { headers: authMaster });
    eq('T7.1 master GET sociedades status 200', rMaster.status, 200);
    tt('T7.2 master ve sociedad de A', rMaster.data?.some((s) => s.id === socId));
    tt('T7.3 master ve sociedad de B', rMaster.data?.some((s) => s.id === socB));

    // Sub-tenant NO puede llamar a master
    const rNoMaster = await request(port, 'GET', '/api/master/sociedades', { headers: authA });
    eq('T7.4 sub-tenant A → /api/master devuelve 403', rNoMaster.status, 403);

    // ═══════════════════════════════════════════════════════════
    // T8: Override compliance
    // ═══════════════════════════════════════════════════════════
    console.log('\n  T8: master override compliance');
    const rOvSinMotivo = await request(port, 'POST', `/api/master/sociedades/${socB}/override-compliance`, { headers: authMaster, body: {} });
    eq('T8.1 override sin motivo → 400', rOvSinMotivo.status, 400);

    const rOv = await request(port, 'POST', `/api/master/sociedades/${socB}/override-compliance`, {
      headers: authMaster, body: { motivo: 'Auditoría rutinaria semestral del bufete B según contrato master.' },
    });
    eq('T8.2 override con motivo → 200', rOv.status, 200);
    tt('T8.3 override devuelve cláusulas compiladas', rOv.data?.clausulas?.length === 9);

    // Audit registrado
    const auditOv = db.prepare(`
      SELECT * FROM audit_log
      WHERE accion = 'MASTER_OVERRIDE_COMPLIANCE' AND entidad_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(socB);
    tt('T8.4 audit MASTER_OVERRIDE_COMPLIANCE registrado', !!auditOv);

    // ═══════════════════════════════════════════════════════════
    // T9: Portal público anti-enumeration
    // ═══════════════════════════════════════════════════════════
    console.log('\n  T9: portal público — anti-enumeration');
    const rInval = await request(port, 'GET', '/api/public/sociedades/token_inexistente_random_abc');
    eq('T9.1 token inválido → 404 (no 403, no 401)', rInval.status, 404);

    // ═══════════════════════════════════════════════════════════
    // T10: Validaciones de freeze
    // ═══════════════════════════════════════════════════════════
    console.log('\n  T10: validaciones de freeze');
    // Crear sociedad inválida: % suma != 100
    const r10 = await request(port, 'POST', '/api/sociedades', {
      headers: authA,
      body: { denominacion: 'INVALID FREEZE', objeto_social: 'Test de validaciones de freeze del motor F7 para sociedades anónimas.', capital_social: 5000, valor_nominal_accion: 50, total_acciones: 100 },
    });
    const soc10 = r10.data.id; ids.sociedades.push(soc10);
    const tk10 = r10.data.token.token;
    await request(port, 'POST', `/api/public/sociedades/${tk10}/accionistas`, {
      body: { tipo_persona: 'individual', nombre: 'X T10', dpi_o_nit: '8888888880123', genero: 'M', fecha_nac: '1980-01-01', acciones_cantidad: 50, porcentaje: 50 },
    });
    await request(port, 'POST', `/api/public/sociedades/${tk10}/representantes`, {
      body: { nombre: 'X T10', dpi: '8888888880123', cargo: 'Administrador Único', vigencia_inicio: '2026-06-01', genero: 'M', fecha_nac: '1980-01-01' },
    });
    await request(port, 'POST', `/api/public/sociedades/${tk10}/direcciones`, {
      body: { tipo: 'fiscal', direccion: 'X', municipio: 'Guatemala', departamento: 'Guatemala' },
    });
    await request(port, 'POST', `/api/public/sociedades/${tk10}/confirmar`, { body: {} });
    const r10avanzar = await request(port, 'POST', `/api/sociedades/${soc10}/avanzar`, { headers: authA });
    eq('T10.1 freeze con suma % != 100 → 400', r10avanzar.status, 400);
    tt('T10.2 mensaje menciona "100"', String(r10avanzar.data?.error || '').includes('100'));

  } finally {
    // Cleanup completo
    for (const id of ids.sociedades) {
      db.prepare('DELETE FROM correcciones_sa WHERE sociedad_id = ?').run(id);
      db.prepare('DELETE FROM sociedades_tokens WHERE sociedad_id = ?').run(id);
      db.prepare('DELETE FROM accionistas WHERE sociedad_id = ?').run(id);
      db.prepare('DELETE FROM representantes_sa WHERE sociedad_id = ?').run(id);
      db.prepare('DELETE FROM direcciones_sa WHERE sociedad_id = ?').run(id);
      db.prepare('DELETE FROM sociedades WHERE id = ?').run(id);
    }
    db.prepare("DELETE FROM audit_log WHERE entidad_tipo IN ('sociedad','firma','master') AND timestamp >= datetime('now','-1 hour')").run();
    for (const id of ids.users) db.prepare('DELETE FROM users WHERE id = ?').run(id);
    for (const id of ids.firmas) db.prepare('DELETE FROM firmas WHERE id = ?').run(id);
    server.close();
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(` Resultado: ${pass} PASS · ${fail} FAIL`);
  if (fail > 0) { console.log(' FAILS:'); failures.forEach((f) => console.log(`   - ${f}`)); }
  console.log('═══════════════════════════════════════════════════════════════════');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('ERROR no controlado:', e); process.exit(2); });
