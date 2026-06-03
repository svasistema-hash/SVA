// Sprint LexDocs Legal Fase 2 CP5 — Tests + Reporte de minutas para
// sign-off notarial.
//
// Ejecutar: npm run test:fase2-sa-cp5
//
// Crea 5 escenarios representativos de constitución de S.A., los compila
// con el motor F7 (sociedad-engine.js), valida las 4 reglas de formato
// (R1-R4) que ya pasaban en CP5 de Fase 1, y genera el archivo
// docs/sprint-legal-fase2-sa-cp5-minutas.md con los textos verbatim de
// las 9 cláusulas de cada minuta. Este archivo es el insumo para el
// sign-off del notario senior (bloqueador P0-2 de producción).
//
// 5 escenarios:
//   E1 S.A. con 1 accionista (mínimo legal: 1 persona individual, 100%).
//   E2 S.A. con 2 accionistas (50/50).
//   E3 S.A. con 3 accionistas distribución pareto (60/25/15).
//   E4 S.A. con representante único (Administrador Único).
//   E5 S.A. con 3 representantes (Presidente / Vicepresidente / Secretario).

const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';

const db = require('../db');
const { encrypt, hashFor } = require('../encryption');
const { compilarSociedad, freezeSociedad } = require('../sociedad-engine');

let pass = 0, fail = 0;
const failures = [];

function ok(name) { pass++; console.log(`    PASS  ${name}`); }
function nope(name, expected, actual) {
  fail++; failures.push(name);
  console.log(`    FAIL  ${name}`);
  console.log(`          esperado: ${JSON.stringify(expected)}`);
  console.log(`          actual:   ${JSON.stringify(actual)}`);
}
function tt(name, cond, info = '') { if (cond) ok(name); else nope(name, true, info || cond); }

// ─────────────────────────────────────────────────────────────────
// Reglas R1-R4 del motor F7 (mismo análisis que CP5 de Fase 1).
// R1 Sin variables sin resolver ({{var}}).
// R2 Cero números en cifra sola fuera del formato legal "(N)".
// R3 Días/fechas en formato legal ("día N").
// R4 Sin __MISSING__ ni [VAR] visibles.
// ─────────────────────────────────────────────────────────────────
function validarReglas(textoCompleto) {
  const vars = [];
  const reVars = /\{\{(\w+)\}\}/g; let mm;
  while ((mm = reVars.exec(textoCompleto)) !== null) vars.push(mm[1]);

  // R2: limpiar paréntesis legales, IDs, placas, direcciones, años
  let limpio = textoCompleto;
  let prev = null;
  while (prev !== limpio) { prev = limpio; limpio = limpio.replace(/\([^()]*\)/g, '[OK]'); }
  limpio = limpio.replace(/\b[A-Z]{2,}-[A-Z0-9-]+/g, '[ID]');           // SA-LXL-2026-0001
  limpio = limpio.replace(/\b\d+(?:-\d+)+\b/g, '[CTA]');
  limpio = limpio.replace(/\b[A-Z]+-\d+(?:-[A-Z]+)?\b/g, '[PLACA]');
  limpio = limpio.replace(/\b\d+\s+(calle|avenida|av\.)/gi, '[DIR]');
  limpio = limpio.replace(/\bzona\s+\d+/gi, '[DIR]');
  limpio = limpio.replace(/\b(19|20)\d{2}\b/g, '[AÑO]');
  const numeros = [];
  const reNums = /\b(\d+)(?:[.,]\d+)?\b/g; let nm;
  while ((nm = reNums.exec(limpio)) !== null) numeros.push(nm[1]);

  const tieneFormatoLegalDia = /día [a-záéíóú]+/i.test(textoCompleto);

  const tieneMissing = /__MISSING__/.test(textoCompleto);
  const brackets = [...textoCompleto.matchAll(/\[([A-Z_]+)\]/g)].map((m) => m[1]);

  return {
    R1: { ok: vars.length === 0, vars },
    R2: { ok: numeros.length === 0, numeros },
    R3: { ok: tieneFormatoLegalDia },
    R4: { ok: !tieneMissing && brackets.length === 0, missing: tieneMissing, brackets: [...new Set(brackets)] },
  };
}

// ─────────────────────────────────────────────────────────────────
// Helpers para crear datos test
// ─────────────────────────────────────────────────────────────────
const SUFFIX = `cp5_${Date.now()}`;
const ids = { firmas: [], sociedades: [], reportes: [] };

function asegurarFirmaTest() {
  let firma = db.prepare("SELECT id FROM firmas WHERE slug = ?").get(`bufete-cp5-${SUFFIX}`);
  if (!firma) {
    const info = db.prepare(`
      INSERT INTO firmas (slug, nombre, tipo, parent_id, correlativo_prefijo)
      VALUES (?, 'Bufete CP5 Test', 'bufete', 1, 'SA-CP5')
    `).run(`bufete-cp5-${SUFFIX}`);
    firma = { id: info.lastInsertRowid };
    ids.firmas.push(firma.id);
  }
  return firma.id;
}

let counter = 0;
function crearSociedadConDatos({ denominacion, objeto_social, capital_social, total_acciones, valor_nominal_accion, accionistas, representantes, direccion_fiscal }) {
  const firmaId = asegurarFirmaTest();
  counter++;
  const correlativo = `SA-CP5-2026-${String(counter).padStart(4, '0')}`;

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO sociedades (
        firma_id, correlativo, tipo_sociedad, denominacion, objeto_social,
        plazo_anios, moneda, capital_social, valor_nominal_accion, total_acciones,
        estado
      ) VALUES (?, ?, 'sa', ?, ?, 99, 'GTQ', ?, ?, ?, 'revision_abogado')
    `).run(firmaId, correlativo, denominacion, objeto_social, capital_social, valor_nominal_accion, total_acciones);
    const socId = info.lastInsertRowid;

    accionistas.forEach((a, i) => {
      db.prepare(`
        INSERT INTO accionistas (
          sociedad_id, orden, tipo_persona, nombre, nombre_hash, dpi_o_nit, dpi_o_nit_hash,
          profesion, estado_civil, fecha_nac, genero, nacionalidad, domicilio,
          acciones_cantidad, porcentaje
        ) VALUES (?, ?, 'individual', ?, ?, ?, ?, ?, ?, ?, ?, 'guatemalteca', ?, ?, ?)
      `).run(
        socId, i + 1,
        encrypt(a.nombre), hashFor('nombre', a.nombre),
        encrypt(a.dpi), hashFor('dpi', a.dpi),
        a.profesion ? encrypt(a.profesion) : null,
        a.estado_civil ? encrypt(a.estado_civil) : null,
        a.fecha_nac, a.genero,
        a.domicilio ? encrypt(a.domicilio) : null,
        a.acciones, a.porcentaje,
      );
    });

    representantes.forEach((r, i) => {
      db.prepare(`
        INSERT INTO representantes_sa (
          sociedad_id, orden, nombre, nombre_hash, dpi, dpi_hash,
          profesion, estado_civil, fecha_nac, genero, nacionalidad, domicilio,
          cargo, vigencia_inicio, facultades
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'guatemalteca', ?, ?, '2026-06-01', ?)
      `).run(
        socId, i + 1,
        encrypt(r.nombre), hashFor('nombre', r.nombre),
        encrypt(r.dpi), hashFor('dpi', r.dpi),
        r.profesion ? encrypt(r.profesion) : null,
        r.estado_civil ? encrypt(r.estado_civil) : null,
        r.fecha_nac, r.genero,
        r.domicilio ? encrypt(r.domicilio) : null,
        r.cargo, r.facultades || null,
      );
    });

    db.prepare(`
      INSERT INTO direcciones_sa (sociedad_id, tipo, direccion, municipio, departamento)
      VALUES (?, 'fiscal', ?, ?, ?)
    `).run(socId, direccion_fiscal.direccion, direccion_fiscal.municipio, direccion_fiscal.departamento);

    // Freeze para que el compilado use snapshot inmutable
    freezeSociedad(socId, db);
    db.prepare(`
      UPDATE sociedades
      SET estado = 'listo_para_RM',
          aprobado_at = datetime('now'),
          listo_para_rm_at = datetime('now')
      WHERE id = ?
    `).run(socId);

    return socId;
  });
  const socId = tx();
  ids.sociedades.push(socId);
  return socId;
}

function reportarCaso(label, socId) {
  console.log(`\n  ─── ${label} (sociedad ${socId}) ───`);
  let compilado;
  try {
    compilado = compilarSociedad(socId, {
      notario: { nombre: 'LIC. ROBERTO CASTILLO ALDANA', colegiado: '8765' },
      fecha_constitucion: '2026-06-01',
    });
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

  // Verificar que la denominación + accionistas + representantes aparezcan en el texto
  const sociedad = compilado.sociedad;
  const accionistas = compilado.accionistas || [];
  const representantes = compilado.representantes || [];
  tt(`${label} denominación aparece`, texto.includes(sociedad.denominacion?.toLocaleUpperCase('es') || sociedad.denominacion || ''));
  for (const a of accionistas) {
    const nombreUpper = (a.nombre || '').toLocaleUpperCase('es');
    tt(`${label} accionista "${a.nombre}" aparece`, texto.includes(nombreUpper.split(' ')[0]));
  }
  for (const r of representantes) {
    const nombreUpper = (r.nombre || '').toLocaleUpperCase('es');
    tt(`${label} representante "${r.nombre}" aparece`, texto.includes(nombreUpper.split(' ')[0]));
  }

  ids.reportes.push({ label, compilado, reglas });
  return compilado;
}

// ─────────────────────────────────────────────────────────────────
// Generación del reporte markdown
// ─────────────────────────────────────────────────────────────────
function generarMarkdown(reportes) {
  const lines = [];
  lines.push('# Sprint LexDocs Legal Fase 2 — CP5 Reporte de minutas');
  lines.push('');
  lines.push('Compilación verbatim del motor F7 (sociedad-engine.js) para los 5 escenarios');
  lines.push('representativos de constitución de Sociedad Anónima. **Este documento debe ser');
  lines.push('revisado por un notario senior antes de habilitar la generación de PDFs reales en');
  lines.push('producción** (bloqueador P0-2 de la sección 3.8 del CP1).');
  lines.push('');
  lines.push('Cada escenario muestra:');
  lines.push('1. Datos de entrada del caso.');
  lines.push('2. Las 9 cláusulas compiladas verbatim por el motor.');
  lines.push('3. Verificación de las 4 reglas de formato (R1-R4) del motor F7.');
  lines.push('');
  lines.push(`Generado por \`backend/scripts/test-fase2-sa-cp5-minutas.js\` el ${new Date().toISOString().slice(0, 10)}.`);
  lines.push('');
  lines.push('---');
  lines.push('');
  for (const r of reportes) {
    lines.push(`## ${r.label}`);
    lines.push('');
    lines.push('### Datos de entrada');
    lines.push('');
    const soc = r.compilado.sociedad;
    lines.push(`- **Denominación**: ${soc.denominacion}, Sociedad Anónima`);
    lines.push(`- **Estado al compilar**: ${soc.estado} (snapshot inmutable)`);
    lines.push(`- **Correlativo**: ${soc.correlativo}`);
    lines.push(`- **Accionistas (${r.compilado.accionistas.length})**:`);
    for (const a of r.compilado.accionistas) {
      lines.push(`  - ${a.nombre} — ${a.acciones_cantidad} acciones (${a.porcentaje}%)`);
    }
    lines.push(`- **Representantes (${r.compilado.representantes.length})**:`);
    for (const rep of r.compilado.representantes) {
      lines.push(`  - ${rep.nombre} — ${rep.cargo}`);
    }
    lines.push('');
    lines.push('### Minuta compilada (9 cláusulas)');
    lines.push('');
    for (const c of r.compilado.clausulas) {
      lines.push(`#### ${c.titulo}`);
      lines.push('');
      lines.push('> ' + c.texto.replace(/\n/g, '\n> '));
      lines.push('');
    }
    lines.push('### Verificación de reglas de formato');
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
  lines.push('Para que el motor F7 con el modelo de Sociedad Anónima sea apto para producción,');
  lines.push('un notario senior debe confirmar:');
  lines.push('');
  lines.push('1. **Frase de comparecencia** (cláusula 1): el formato notarial con la enumeración');
  lines.push('   de accionistas comparecientes, el notario autorizante, fecha y ciudad.');
  lines.push('2. **Denominación y forma** (cláusula 2): el agregado "Sociedad Anónima" al final');
  lines.push('   y el lenguaje de regencia por el Código de Comercio.');
  lines.push('3. **Objeto social** (cláusula 3): el preámbulo legal y la mención de actividades');
  lines.push('   conexas, complementarias y accesorias.');
  lines.push('4. **Plazo** (cláusula 4): la fórmula con prorroga por Asamblea Extraordinaria.');
  lines.push('5. **Domicilio** (cláusula 5): la mención de poder establecer agencias o sucursales.');
  lines.push('6. **Capital y acciones** (cláusula 6): la frase de "íntegramente suscrito y pagado"');
  lines.push('   y la descripción de la distribución entre los accionistas.');
  lines.push('7. **Administración** (cláusula 7): la mención de "facultades inherentes al cargo');
  lines.push('   conforme a los estatutos y al Código de Comercio".');
  lines.push('8. **Disposiciones generales** (cláusula 8): la mención del ejercicio social del');
  lines.push('   primero de enero al treinta y uno de diciembre, distribución proporcional de');
  lines.push('   utilidades y referencia genérica al Código de Comercio para disolución.');
  lines.push('9. **Aceptación y firma** (cláusula 9): la fórmula final de lectura y aceptación.');
  lines.push('');
  lines.push('Cualquier modificación al texto generado debe codificarse en');
  lines.push('`backend/sociedad-engine.js` (constante `CLAUSULAS_BASE`) y validarse nuevamente');
  lines.push('corriendo `npm run test:fase2-sa-cp5`.');
  lines.push('');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────
function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(' Sprint LexDocs Legal Fase 2 CP5 — Tests + Minutas para sign-off');
  console.log('═══════════════════════════════════════════════════════════════════');

  try {
    // ═══════════════════════════════════════════════════════════
    // E1: S.A. con 1 accionista (mínimo viable)
    // ═══════════════════════════════════════════════════════════
    const e1 = crearSociedadConDatos({
      denominacion: 'TECNOLOGÍAS DEL VALLE',
      objeto_social: 'El desarrollo, comercialización y mantenimiento de software, así como la prestación de servicios de consultoría tecnológica.',
      capital_social: 5000.00, total_acciones: 100, valor_nominal_accion: 50.00,
      accionistas: [
        { nombre: 'CARLOS EDUARDO MÉNDEZ SOTO', dpi: '1234567890123', fecha_nac: '1987-03-15', genero: 'M', estado_civil: 'casado', profesion: 'Ingeniero', domicilio: '12 calle 8-45 zona 10', acciones: 100, porcentaje: 100 },
      ],
      representantes: [
        { nombre: 'CARLOS EDUARDO MÉNDEZ SOTO', dpi: '1234567890123', fecha_nac: '1987-03-15', genero: 'M', estado_civil: 'casado', profesion: 'Ingeniero', cargo: 'Administrador Único' },
      ],
      direccion_fiscal: { direccion: '12 calle 8-45 zona 10', municipio: 'Guatemala', departamento: 'Guatemala' },
    });
    reportarCaso('E1 · 1 accionista (mínimo legal)', e1);

    // ═══════════════════════════════════════════════════════════
    // E2: S.A. con 2 accionistas (50/50)
    // ═══════════════════════════════════════════════════════════
    const e2 = crearSociedadConDatos({
      denominacion: 'CONSULTORÍA JURÍDICA INTEGRAL',
      objeto_social: 'La prestación de servicios profesionales en materia de asesoría legal corporativa, registro mercantil, propiedad intelectual y cumplimiento normativo.',
      capital_social: 20000.00, total_acciones: 200, valor_nominal_accion: 100.00,
      accionistas: [
        { nombre: 'JUAN PÉREZ GONZÁLEZ', dpi: '2222222220123', fecha_nac: '1980-01-15', genero: 'M', estado_civil: 'casado', profesion: 'Abogado', acciones: 100, porcentaje: 50 },
        { nombre: 'ANA MARÍA LÓPEZ CASTILLO', dpi: '3333333330123', fecha_nac: '1985-05-22', genero: 'F', estado_civil: 'soltera', profesion: 'Abogada y Notaria', acciones: 100, porcentaje: 50 },
      ],
      representantes: [
        { nombre: 'JUAN PÉREZ GONZÁLEZ', dpi: '2222222220123', fecha_nac: '1980-01-15', genero: 'M', estado_civil: 'casado', profesion: 'Abogado', cargo: 'Presidente' },
        { nombre: 'ANA MARÍA LÓPEZ CASTILLO', dpi: '3333333330123', fecha_nac: '1985-05-22', genero: 'F', estado_civil: 'soltera', profesion: 'Abogada', cargo: 'Vicepresidente' },
      ],
      direccion_fiscal: { direccion: '3a avenida 10-25 zona 14', municipio: 'Guatemala', departamento: 'Guatemala' },
    });
    reportarCaso('E2 · 2 accionistas 50/50 + 2 representantes', e2);

    // ═══════════════════════════════════════════════════════════
    // E3: S.A. con 3 accionistas (60/25/15)
    // ═══════════════════════════════════════════════════════════
    const e3 = crearSociedadConDatos({
      denominacion: 'INVERSIONES PARETO',
      objeto_social: 'La realización de inversiones de capital, gestión de carteras, asesoría financiera estratégica y administración de activos para clientes corporativos e individuales.',
      capital_social: 100000.00, total_acciones: 1000, valor_nominal_accion: 100.00,
      accionistas: [
        { nombre: 'ROBERTO ALEJANDRO RAMÍREZ TORRES', dpi: '4444444440123', fecha_nac: '1975-08-10', genero: 'M', estado_civil: 'casado', profesion: 'Empresario', acciones: 600, porcentaje: 60 },
        { nombre: 'PATRICIA ELENA MORALES SANDOVAL', dpi: '5555555550123', fecha_nac: '1982-11-03', genero: 'F', estado_civil: 'casada', profesion: 'Administradora de Empresas', acciones: 250, porcentaje: 25 },
        { nombre: 'JOSÉ FERNANDO CASTAÑEDA RUIZ', dpi: '6666666660123', fecha_nac: '1990-04-18', genero: 'M', estado_civil: 'soltero', profesion: 'Contador Público', acciones: 150, porcentaje: 15 },
      ],
      representantes: [
        { nombre: 'ROBERTO ALEJANDRO RAMÍREZ TORRES', dpi: '4444444440123', fecha_nac: '1975-08-10', genero: 'M', estado_civil: 'casado', profesion: 'Empresario', cargo: 'Gerente General' },
      ],
      direccion_fiscal: { direccion: '4a calle 5-78 zona 9', municipio: 'Guatemala', departamento: 'Guatemala' },
    });
    reportarCaso('E3 · 3 accionistas 60/25/15 + Gerente General único', e3);

    // ═══════════════════════════════════════════════════════════
    // E4: S.A. con representante único (Administrador Único)
    // ═══════════════════════════════════════════════════════════
    const e4 = crearSociedadConDatos({
      denominacion: 'COMERCIALIZADORA DEL NORTE',
      objeto_social: 'La importación, distribución y comercialización al por mayor y al por menor de productos de consumo masivo, materia prima y bienes terminados en el mercado nacional.',
      capital_social: 15000.00, total_acciones: 300, valor_nominal_accion: 50.00,
      accionistas: [
        { nombre: 'MARÍA FERNANDA SOLÍS HERRERA', dpi: '7777777770123', fecha_nac: '1988-02-14', genero: 'F', estado_civil: 'casada', profesion: 'Comerciante', acciones: 300, porcentaje: 100 },
      ],
      representantes: [
        { nombre: 'MARÍA FERNANDA SOLÍS HERRERA', dpi: '7777777770123', fecha_nac: '1988-02-14', genero: 'F', estado_civil: 'casada', profesion: 'Comerciante', cargo: 'Administrador Único', facultades: 'Las amplias facultades del mandatario general con representación judicial y administrativa, incluyendo las que requieren cláusula especial conforme al artículo mil seiscientos noventa y dos del Código Civil' },
      ],
      direccion_fiscal: { direccion: '1a avenida 12-34 zona 1', municipio: 'Quetzaltenango', departamento: 'Quetzaltenango' },
    });
    reportarCaso('E4 · accionista único + Administrador Único con facultades amplias', e4);

    // ═══════════════════════════════════════════════════════════
    // E5: S.A. con 3 representantes (Presidente/Vicepresidente/Secretario)
    // ═══════════════════════════════════════════════════════════
    const e5 = crearSociedadConDatos({
      denominacion: 'CORPORATIVO MULTI SECTOR',
      objeto_social: 'La administración corporativa de empresas en diversos sectores económicos, prestación de servicios de consultoría administrativa, financiera, comercial y operativa.',
      capital_social: 50000.00, total_acciones: 500, valor_nominal_accion: 100.00,
      // Accionistas individuales. Persona jurídica como accionista queda pendiente
      // para sprint 2 (requiere extensión del motor F7 con frasePersonaJuridica).
      accionistas: [
        { nombre: 'DIEGO ARMANDO SANDOVAL PÉREZ', dpi: '8888888880123', fecha_nac: '1970-07-04', genero: 'M', estado_civil: 'casado', profesion: 'Administrador de Empresas', acciones: 300, porcentaje: 60 },
        { nombre: 'LAURA CRISTINA AGUILAR VÁSQUEZ', dpi: '9999999990123', fecha_nac: '1978-12-09', genero: 'F', estado_civil: 'casada', profesion: 'Abogada', acciones: 200, porcentaje: 40 },
      ],
      representantes: [
        { nombre: 'DIEGO ARMANDO SANDOVAL PÉREZ', dpi: '8888888880123', fecha_nac: '1970-07-04', genero: 'M', estado_civil: 'casado', profesion: 'Administrador de Empresas', cargo: 'Presidente' },
        { nombre: 'LAURA CRISTINA AGUILAR VÁSQUEZ', dpi: '9999999990123', fecha_nac: '1978-12-09', genero: 'F', estado_civil: 'casada', profesion: 'Abogada', cargo: 'Vicepresidente' },
        { nombre: 'FERNANDO ESTEBAN ROMERO LÓPEZ', dpi: '1010101010123', fecha_nac: '1985-06-21', genero: 'M', estado_civil: 'soltero', profesion: 'Contador Público', cargo: 'Secretario' },
      ],
      direccion_fiscal: { direccion: '6a avenida 15-22 zona 13', municipio: 'Guatemala', departamento: 'Guatemala' },
    });
    reportarCaso('E5 · 3 representantes Presidente / Vicepresidente / Secretario', e5);

    // ─────────────────────────────────────────────────────────────────
    // Generar el reporte markdown
    // ─────────────────────────────────────────────────────────────────
    const reportePath = path.resolve(__dirname, '..', '..', 'docs', 'sprint-legal-fase2-sa-cp5-minutas.md');
    const md = generarMarkdown(ids.reportes);
    fs.mkdirSync(path.dirname(reportePath), { recursive: true });
    fs.writeFileSync(reportePath, md, 'utf-8');
    console.log(`\n  📄 Reporte para sign-off notarial: docs/sprint-legal-fase2-sa-cp5-minutas.md`);

  } finally {
    // Cleanup
    for (const id of ids.sociedades) {
      db.prepare('DELETE FROM correcciones_sa WHERE sociedad_id = ?').run(id);
      db.prepare('DELETE FROM sociedades_tokens WHERE sociedad_id = ?').run(id);
      db.prepare('DELETE FROM accionistas WHERE sociedad_id = ?').run(id);
      db.prepare('DELETE FROM representantes_sa WHERE sociedad_id = ?').run(id);
      db.prepare('DELETE FROM direcciones_sa WHERE sociedad_id = ?').run(id);
      db.prepare('DELETE FROM sociedades WHERE id = ?').run(id);
    }
    for (const id of ids.firmas) db.prepare('DELETE FROM firmas WHERE id = ?').run(id);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(` Resultado: ${pass} PASS · ${fail} FAIL`);
  if (fail > 0) { console.log(' FAILS:'); failures.forEach((f) => console.log(`   - ${f}`)); }
  console.log('═══════════════════════════════════════════════════════════════════');
  process.exit(fail > 0 ? 1 : 0);
}

main();
