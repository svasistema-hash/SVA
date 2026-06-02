// Sprint LexDocs Legal Fase 2 CP3 — Motor F7 extendido para Sociedad Anónima.
//
// Análogo a backend/contrato-engine.js de Fase 1, pero para constitución de S.A.
// Reusa al 100% los helpers de utils/legal-format/* (números a letras, fechas
// a letras, género, DPI, etc.) y agrega:
//
//   - 16+ variables F7 nuevas específicas de S.A.
//   - 9 cláusulas siguiendo Cód. Comercio art. 86 GT.
//   - Regla snapshot vs vivo según estado:
//       listo_para_RM / enviado_RM / inscrito_RM → snapshot inmutable.
//       otros → carga viva desde sociedades + accionistas + representantes + direcciones.
//
// IMPORTANTE: el TEXTO EXACTO de cada cláusula es PROVISORIO y debe ser
// validado por un notario senior antes de habilitar PDFs reales en producción
// (bloqueador P0-2 del sprint, ver docs/sprint-legal-fase2-sa-diseno.md §3.8).

const db = require('./db');
const { decrypt, encrypt } = require('./encryption');
const { formatQuetzal } = require('./utils/money');
const legalFormat = require('./utils/legal-format/legal-format');

// ─────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────

function safeDecrypt(value, label) {
  if (value === null || value === undefined || value === '') return null;
  try { return decrypt(value); }
  catch (e) { console.error(`[sociedad-engine decrypt failed] ${label}: ${e.message}`); return null; }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function interpolate(text, vars) {
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return v !== undefined && v !== null && v !== '' ? String(v) : `__MISSING__${k}__`;
  });
}

// Estados donde se lee snapshot inmutable.
const ESTADOS_CONGELADOS = new Set(['listo_para_RM', 'enviado_RM', 'inscrito_RM']);

// ─────────────────────────────────────────────────────────────────
// Carga de datos
// ─────────────────────────────────────────────────────────────────

function loadSociedad(sociedad_id) {
  const row = db.prepare('SELECT * FROM sociedades WHERE id = ?').get(sociedad_id);
  if (!row) throw Object.assign(new Error('Sociedad no encontrada'), { status: 404 });
  return row;
}

function loadAccionistasVivos(sociedad_id) {
  return db.prepare(`
    SELECT * FROM accionistas WHERE sociedad_id = ? ORDER BY orden
  `).all(sociedad_id).map(descifrarAccionista);
}

function loadRepresentantesVivos(sociedad_id) {
  return db.prepare(`
    SELECT * FROM representantes_sa WHERE sociedad_id = ? ORDER BY orden
  `).all(sociedad_id).map(descifrarRepresentante);
}

function loadDireccionesVivas(sociedad_id) {
  return db.prepare('SELECT * FROM direcciones_sa WHERE sociedad_id = ?').all(sociedad_id);
}

function descifrarAccionista(row) {
  return {
    ...row,
    nombre: safeDecrypt(row.nombre, `accionista.nombre id=${row.id}`),
    dpi_o_nit: safeDecrypt(row.dpi_o_nit, `accionista.dpi id=${row.id}`),
    profesion: safeDecrypt(row.profesion, `accionista.profesion id=${row.id}`),
    estado_civil: safeDecrypt(row.estado_civil, `accionista.estado_civil id=${row.id}`),
    domicilio: safeDecrypt(row.domicilio, `accionista.domicilio id=${row.id}`),
  };
}

function descifrarRepresentante(row) {
  return {
    ...row,
    nombre: safeDecrypt(row.nombre, `rep.nombre id=${row.id}`),
    dpi: safeDecrypt(row.dpi, `rep.dpi id=${row.id}`),
    profesion: safeDecrypt(row.profesion, `rep.profesion id=${row.id}`),
    estado_civil: safeDecrypt(row.estado_civil, `rep.estado_civil id=${row.id}`),
    domicilio: safeDecrypt(row.domicilio, `rep.domicilio id=${row.id}`),
  };
}

// ─────────────────────────────────────────────────────────────────
// Construcción de frases legales
// ─────────────────────────────────────────────────────────────────

function frasePersonaCompareciente(persona) {
  return legalFormat.renderClienteCompareciente({
    nombre: persona.nombre,
    dpi: persona.dpi_o_nit || persona.dpi,
    genero: persona.genero || 'M',
    fecha_nac: persona.fecha_nac,
    estado_civil: persona.estado_civil,
    profesion: persona.profesion,
    domicilio: persona.domicilio,
    domicilio_local: !persona.domicilio,
    pais: persona.nacionalidad?.toLowerCase() || 'guatemala',
  });
}

function buildComparecencia({ fecha, ciudad, accionistas, notario }) {
  const fechaFrase = fecha ? legalFormat.renderFechaContrato(fecha, ciudad || 'Guatemala') : `En la ciudad de ${ciudad || 'Guatemala'}`;
  const notarioFrase = notario?.nombre
    ? `ante mí, ${legalFormat.nombreEnMayusculas(notario.nombre)}${notario.colegiado ? `, Notario Colegiado N° ${notario.colegiado}` : ', Notario'}`
    : 'ante mí, el infrascrito notario';
  const acc = accionistas.length > 0
    ? 'comparecen los señores: ' + accionistas.map(frasePersonaCompareciente).join('; ')
    : 'comparece';
  return `${fechaFrase} ${notarioFrase}, ${acc}, quienes me solicitan la protocolización del presente instrumento mediante el cual constituyen una Sociedad Anónima conforme a las disposiciones del Código de Comercio de la República de Guatemala.`;
}

function buildDistribucionAccionistas(accionistas) {
  if (accionistas.length === 0) return '[SIN ACCIONISTAS]';
  const partes = accionistas.map((a) => {
    const titulo = a.genero === 'F' ? 'La señora' : 'El señor';
    const nombreUpper = legalFormat.nombreEnMayusculas(a.nombre || '[ACCIONISTA]');
    const accionesLegal = legalFormat.formatoLegal(a.acciones_cantidad, { tipo: 'entero' });
    const porcentajeLegal = legalFormat.formatoLegal(a.porcentaje, { tipo: 'porcentaje' });
    return `${titulo} ${nombreUpper} suscribe y paga ${accionesLegal} acciones, equivalentes al ${porcentajeLegal} del capital social`;
  });
  if (partes.length === 1) return partes[0] + '.';
  return partes.slice(0, -1).join('; ') + '; y ' + partes[partes.length - 1] + '.';
}

function buildRepresentantesCompareciente(representantes) {
  if (representantes.length === 0) return '[SIN REPRESENTANTES]';
  const partes = representantes.map((r) => {
    const titulo = r.genero === 'F' ? 'la señora' : 'el señor';
    const cargoUpper = r.cargo.toLocaleUpperCase('es');
    const nombreUpper = legalFormat.nombreEnMayusculas(r.nombre || '[REPRESENTANTE]');
    const facultades = r.facultades ? `, con las siguientes facultades: ${r.facultades}` : ', con las facultades inherentes al cargo conforme a los estatutos y al Código de Comercio';
    const vigencia = r.vigencia_vencimiento
      ? `, con vigencia desde el ${legalFormat.fechaALetras(r.vigencia_inicio)} hasta el ${legalFormat.fechaALetras(r.vigencia_vencimiento)}`
      : `, con vigencia desde el ${legalFormat.fechaALetras(r.vigencia_inicio)} por tiempo indefinido`;
    return `El cargo de ${cargoUpper} recae en ${titulo} ${nombreUpper}${vigencia}${facultades}`;
  });
  return partes.join('. ') + '.';
}

function buildDomicilioLegal(direccionFiscal) {
  if (!direccionFiscal) return 'el municipio y departamento de Guatemala, República de Guatemala';
  const { municipio, departamento, pais } = direccionFiscal;
  return `el municipio de ${municipio} del departamento de ${departamento}, ${pais || 'República de Guatemala'}`;
}

function buildPlazoLegal(plazo_anios) {
  if (plazo_anios === null || plazo_anios === undefined) return 'tiempo indefinido';
  try {
    return legalFormat.formatoLegal(parseInt(plazo_anios, 10), { tipo: 'plazo', sufijo: 'años' });
  } catch { return 'tiempo indefinido'; }
}

function buildMonedaLegal(moneda) {
  if (moneda === 'USD') return 'dólares de los Estados Unidos de América';
  return 'quetzales';
}

// ─────────────────────────────────────────────────────────────────
// Cláusulas de constitución (siguiendo Cód. Comercio art. 86 GT)
// PROVISORIAS — pendientes de sign-off notarial.
// ─────────────────────────────────────────────────────────────────

const CLAUSULAS_BASE = [
  { codigo: 'comparecencia', titulo: 'COMPARECENCIA', orden: 1,
    texto: '{{comparecencia}}' },
  { codigo: 'denominacion-y-forma', titulo: 'PRIMERA — Denominación y Forma', orden: 2,
    texto: 'Se constituye una sociedad mercantil bajo la denominación social {{denominacion_legal}}, la cual se regirá por las disposiciones del Código de Comercio de la República de Guatemala, las contenidas en la presente escritura y los estatutos sociales que en este acto se aprueban.' },
  { codigo: 'objeto', titulo: 'SEGUNDA — Objeto Social', orden: 3,
    texto: 'El objeto social de la sociedad será: {{objeto_social_legal}}. La sociedad podrá realizar todas las actividades conexas, complementarias y accesorias que resulten necesarias para el cumplimiento de su objeto social, incluyendo la celebración de toda clase de contratos lícitos y la realización de cualquier otra actividad mercantil no prohibida por las leyes de la República de Guatemala.' },
  { codigo: 'plazo', titulo: 'TERCERA — Plazo', orden: 4,
    texto: 'El plazo de duración de la sociedad será de {{plazo_legal}}, contados a partir del {{fecha_constitucion_legal}}, prorrogable por acuerdo de la Asamblea General Extraordinaria de Accionistas conforme a los estatutos.' },
  { codigo: 'domicilio', titulo: 'CUARTA — Domicilio', orden: 5,
    texto: 'El domicilio legal de la sociedad será {{domicilio_legal}}, sin perjuicio de poder establecer agencias, sucursales o representaciones en cualquier otro lugar del territorio nacional o del extranjero mediante acuerdo del órgano de administración competente.' },
  { codigo: 'capital-y-acciones', titulo: 'QUINTA — Capital Social y Acciones', orden: 6,
    texto: 'El capital social de la sociedad asciende a la suma de {{capital_social_legal}}, dividido y representado por {{total_acciones_legal}} acciones nominativas con un valor nominal de {{valor_nominal_accion_legal}} cada una. El capital social se encuentra íntegramente suscrito y pagado por los accionistas en la siguiente forma: {{distribucion_accionistas_legal}}' },
  { codigo: 'administracion', titulo: 'SEXTA — Administración', orden: 7,
    texto: 'La administración, dirección y representación legal de la sociedad estará a cargo del órgano de administración designado en este acto. {{representantes_compareciente_legal}}' },
  { codigo: 'disposiciones-generales', titulo: 'SÉPTIMA — Disposiciones Generales', orden: 8,
    texto: 'Las asambleas generales de accionistas, ordinarias y extraordinarias, se regirán por lo dispuesto en el Código de Comercio y los estatutos sociales. El ejercicio social comenzará el primero de enero y concluirá el treinta y uno de diciembre de cada año. Las utilidades líquidas y las pérdidas se distribuirán entre los accionistas en proporción a sus aportaciones. La disolución y liquidación de la sociedad se sujetarán a las causales y procedimientos establecidos en el Código de Comercio.' },
  { codigo: 'aceptacion-y-firma', titulo: 'OCTAVA — Aceptación y Firma', orden: 9,
    texto: 'Los comparecientes manifiestan que han leído íntegramente el presente instrumento, que conocen y aceptan sus efectos jurídicos, y en señal de conformidad firman junto al notario autorizante en el lugar y fecha indicados en la comparecencia.' },
];

// ─────────────────────────────────────────────────────────────────
// Construcción de variables F7
// ─────────────────────────────────────────────────────────────────

function buildVars({ sociedad, accionistas, representantes, direcciones, notario, fecha_constitucion }) {
  const direccionFiscal = direcciones.find((d) => d.tipo === 'fiscal') || direcciones[0] || null;
  const fechaConstitucion = fecha_constitucion || sociedad.aprobado_at || sociedad.created_at;
  const fechaIso = fechaConstitucion ? String(fechaConstitucion).slice(0, 10) : null;
  const ciudad = direccionFiscal?.municipio || 'Guatemala';

  const safe = (fn) => { try { return fn(); } catch { return ''; } };

  const denominacionUpper = (sociedad.denominacion || '').toLocaleUpperCase('es');
  const denominacionLegal = `${denominacionUpper}, SOCIEDAD ANÓNIMA`;

  const capitalSocialLegal = safe(() => legalFormat.formatoLegal(sociedad.capital_social, { tipo: 'dinero' }));
  const valorNominalAccionLegal = safe(() => legalFormat.formatoLegal(sociedad.valor_nominal_accion, { tipo: 'dinero' }));
  const totalAccionesLegal = safe(() => legalFormat.formatoLegal(parseInt(sociedad.total_acciones, 10), { tipo: 'entero' }));

  const vars = {
    denominacion: sociedad.denominacion || '',
    denominacion_legal: denominacionLegal,
    objeto_social_legal: sociedad.objeto_social || '[OBJETO_SOCIAL]',
    plazo_legal: buildPlazoLegal(sociedad.plazo_anios),
    domicilio_legal: buildDomicilioLegal(direccionFiscal),
    moneda_legal: buildMonedaLegal(sociedad.moneda),
    capital_social_legal: capitalSocialLegal,
    valor_nominal_accion_legal: valorNominalAccionLegal,
    total_acciones_legal: totalAccionesLegal,
    distribucion_accionistas_legal: buildDistribucionAccionistas(accionistas),
    representantes_compareciente_legal: buildRepresentantesCompareciente(representantes),
    fecha_constitucion_legal: fechaIso ? safe(() => legalFormat.fechaALetras(fechaIso)) : '[FECHA_CONSTITUCION]',
    ciudad_constitucion: ciudad,
    notario_compareciente: notario?.nombre
      ? `el suscrito notario ${legalFormat.nombreEnMayusculas(notario.nombre)}${notario.colegiado ? `, Colegiado N° ${notario.colegiado}` : ''}`
      : 'el suscrito notario',
    comparecencia: buildComparecencia({ fecha: fechaIso, ciudad, accionistas, notario }),
  };

  // {{accionista_N_compareciente}} variables indexadas (1-based)
  accionistas.forEach((a, i) => {
    vars[`accionista_${i + 1}_compareciente`] = frasePersonaCompareciente(a);
  });

  return vars;
}

// ─────────────────────────────────────────────────────────────────
// Compilar (entry point)
// ─────────────────────────────────────────────────────────────────

function compilarSociedad(sociedad_id, opts = {}) {
  const sociedad = loadSociedad(sociedad_id);
  const congelado = ESTADOS_CONGELADOS.has(sociedad.estado);

  let accionistas, representantes, direcciones;
  if (congelado && sociedad.snapshot_datos) {
    // Lectura del snapshot inmutable
    let snap;
    try { snap = JSON.parse(decrypt(sociedad.snapshot_datos)); }
    catch (e) { console.error('[sociedad-engine] snapshot parse fallido:', e.message); snap = null; }
    if (snap) {
      accionistas = snap.accionistas || [];
      representantes = snap.representantes || [];
      direcciones = snap.direcciones || [];
    } else {
      // Fallback a vivo si snapshot ilegible (no debería pasar)
      accionistas = loadAccionistasVivos(sociedad_id);
      representantes = loadRepresentantesVivos(sociedad_id);
      direcciones = loadDireccionesVivas(sociedad_id);
    }
  } else {
    // Lectura viva
    accionistas = loadAccionistasVivos(sociedad_id);
    representantes = loadRepresentantesVivos(sociedad_id);
    direcciones = loadDireccionesVivas(sociedad_id);
  }

  const vars = buildVars({
    sociedad, accionistas, representantes, direcciones,
    notario: opts.notario || null,
    fecha_constitucion: opts.fecha_constitucion || sociedad.aprobado_at || sociedad.created_at,
  });

  const clausulas = CLAUSULAS_BASE.map((c) => ({
    codigo: c.codigo,
    titulo: c.titulo,
    orden: c.orden,
    texto: interpolate(c.texto, vars),
  }));

  return {
    sociedad: {
      id: sociedad.id,
      correlativo: sociedad.correlativo,
      denominacion: sociedad.denominacion,
      estado: sociedad.estado,
      tipo_sociedad: sociedad.tipo_sociedad,
      congelado,
    },
    accionistas,
    representantes,
    direcciones,
    clausulas,
    vars,
  };
}

// ─────────────────────────────────────────────────────────────────
// Freeze: snapshot inmutable al pasar a listo_para_RM
// ─────────────────────────────────────────────────────────────────

function freezeSociedad(sociedad_id, dbHandle = db) {
  // Validaciones críticas Cód. Comercio
  const sociedad = dbHandle.prepare('SELECT * FROM sociedades WHERE id = ?').get(sociedad_id);
  if (!sociedad) throw new Error(`Sociedad ${sociedad_id} no encontrada`);

  // Datos a snapshotear (con ciphertext tal cual, NO descifrar para mantener
  // bytes inmutables y consistencia con el resto del sistema)
  const accionistasRaw = dbHandle.prepare(`
    SELECT * FROM accionistas WHERE sociedad_id = ? ORDER BY orden
  `).all(sociedad_id);
  const representantesRaw = dbHandle.prepare(`
    SELECT * FROM representantes_sa WHERE sociedad_id = ? ORDER BY orden
  `).all(sociedad_id);
  const direccionesRaw = dbHandle.prepare(`
    SELECT * FROM direcciones_sa WHERE sociedad_id = ?
  `).all(sociedad_id);

  // Validaciones Cód. Comercio
  if (accionistasRaw.length === 0) throw new Error('Al menos 1 accionista requerido');
  const sumaPct = accionistasRaw.reduce((s, a) => s + Number(a.porcentaje), 0);
  if (Math.abs(sumaPct - 100) > 0.01) {
    throw new Error(`Suma de % accionistas debe ser 100 (actual: ${sumaPct})`);
  }
  if (representantesRaw.length === 0) {
    throw new Error('Al menos 1 representante legal requerido');
  }
  if (!direccionesRaw.find((d) => d.tipo === 'fiscal')) {
    throw new Error('Dirección fiscal requerida');
  }
  // Re-validar capital = total_acciones * valor_nominal_accion (idempotencia)
  const productoCapital = Math.round(sociedad.total_acciones * sociedad.valor_nominal_accion * 100) / 100;
  if (Math.abs(productoCapital - Number(sociedad.capital_social)) > 0.01) {
    throw new Error(`Capital social inconsistente con total_acciones × valor_nominal`);
  }

  // Cifrar el snapshot completo
  const snapshot = {
    sociedad: { ...sociedad },
    accionistas: accionistasRaw.map(descifrarAccionista),
    representantes: representantesRaw.map(descifrarRepresentante),
    direcciones: direccionesRaw,
    snapshot_at: new Date().toISOString(),
  };
  const cifrado = encrypt(JSON.stringify(snapshot));

  dbHandle.prepare(`
    UPDATE sociedades
    SET snapshot_datos = ?, snapshot_at = datetime('now')
    WHERE id = ?
  `).run(cifrado, sociedad_id);

  return {
    accionistas_count: accionistasRaw.length,
    representantes_count: representantesRaw.length,
    direcciones_count: direccionesRaw.length,
    suma_porcentaje: sumaPct,
  };
}

module.exports = {
  compilarSociedad,
  freezeSociedad,
  ESTADOS_CONGELADOS,
  CLAUSULAS_BASE,
  // Para uso directo en endpoints
  loadAccionistasVivos,
  loadRepresentantesVivos,
  loadDireccionesVivas,
  buildVars,
};
