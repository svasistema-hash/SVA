// Orquestador del motor de formato legal guatemalteco.
// Re-exporta utilidades de los módulos pequeños y expone funciones de alto
// nivel que arman frases completas para usar dentro del motor de contratos.

const {
  numeroALetras, enteroALetras, dineroALetras, porcentajeALetras, formatoLegal,
} = require('./numero-a-letras');
const { dpiALetras, normalizeDpi } = require('./dpi-a-letras');
const { fechaALetras, fechaCortaALetras, fechaEnContratoCompleta, diaALetras } = require('./fecha-a-letras');
const {
  normGenero, gentilicio, estadoCivil, articuloPersona, rolPersona, pronombrePosesivo,
  GENTILICIOS, ESTADOS_CIVILES, ROLES,
} = require('./concordancia');
const { nombreEnMayusculas, nombrePropio } = require('./nombre-formato');

// ─── Helpers ─────────────────────────────────────────────────

// Calcula edad en años a partir de YYYY-MM-DD.
function computeEdad(fecha_nac) {
  if (!fecha_nac || !/^\d{4}-\d{2}-\d{2}/.test(fecha_nac)) return null;
  const birth = new Date(String(fecha_nac).substring(0, 10) + 'T00:00:00');
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) years--;
  return years >= 0 && years < 130 ? years : null;
}

const TIPOS_SOCIEDAD_COMPLETO = {
  'S.A.':                'SOCIEDAD ANÓNIMA',
  'S.R.L.':              'SOCIEDAD DE RESPONSABILIDAD LIMITADA',
  'Sociedad Civil':      'SOCIEDAD CIVIL',
  'E.M.I.':              'EMPRESA MERCANTIL INDIVIDUAL',
  'Cooperativa':         'COOPERATIVA',
  'Asociación/Fundación':'ASOCIACIÓN O FUNDACIÓN',
  'Otra':                'OTRA',
};

function tipoSociedadCompleto(tipo) {
  return TIPOS_SOCIEDAD_COMPLETO[tipo] || (tipo ? String(tipo).toLocaleUpperCase('es') : '');
}

// ─── Frases de alto nivel ────────────────────────────────────

/**
 * Genera la frase completa de comparecencia para un cliente individual.
 * Devuelve string sin punto final.
 *
 * cliente: {
 *   nombre,           // string (cualquier capitalización)
 *   dpi,              // string 13 dígitos (con o sin espacios)
 *   genero,           // 'M' | 'F' | algo que normGenero entienda
 *   edad,             // number, opcional. Si falta, se calcula desde fecha_nac
 *   fecha_nac,        // 'YYYY-MM-DD', opcional para edad
 *   estado_civil,     // 'casado'/'soltera'/etc.
 *   profesion,        // texto libre, e.g. "Abogado y Notario"
 *   pais,             // default 'guatemala'
 *   domicilio_local,  // bool. Si true → "de este domicilio"
 *   domicilio,        // si no es local, se usa este texto
 * }
 */
function renderClienteCompareciente(cliente) {
  const c = cliente || {};
  const g = normGenero(c.genero);
  const articulo   = g === 'F' ? 'la' : 'el';
  const tratamiento = g === 'F' ? 'señora' : 'señor';
  const nombre = nombreEnMayusculas(c.nombre || '');

  const edad = c.edad != null && c.edad !== ''
    ? Number(c.edad)
    : computeEdad(c.fecha_nac);
  const edadFrase = edad != null
    ? formatoLegal(edad, { tipo: 'edad' })
    : '[EDAD]';

  const estCivil = estadoCivil(c.estado_civil || '', g);
  const gent     = gentilicio(c.pais || 'guatemala', g);
  const profesion = (c.profesion || '').trim();
  const domicilio = c.domicilio_local !== false
    ? 'de este domicilio'
    : (c.domicilio || 'de este domicilio');

  const dpiFrase = c.dpi
    ? dpiALetras(c.dpi)
    : '[DPI]';

  const partes = [
    `${articulo} ${tratamiento} ${nombre || '[NOMBRE]'}`,
    `de ${edadFrase}`,
    estCivil || null,
    gent || null,
    profesion || null,
    domicilio,
    `quien se identifica con el Documento Personal de Identificación con código único de identificación ${dpiFrase} extendido por el Registro Nacional de las Personas de la República de Guatemala`,
  ].filter(Boolean);

  return partes.join(', ');
}

/**
 * Genera la frase completa para un representante de cliente jurídico.
 * Incluye la frase personal + sociedad + tipo + inscripción.
 *
 * juridico: forma del backend GET /api/clientes/juridicos/:id (descifrado).
 */
function renderRepresentanteJuridico(juridico) {
  if (!juridico) return '';

  const repCliente = {
    nombre: juridico.rep_nombre_completo,
    dpi: juridico.rep_dpi,
    genero: juridico.rep_genero || 'M',
    edad: juridico.rep_edad,
    estado_civil: juridico.rep_estado_civil,
    profesion: juridico.rep_profesion,
    domicilio_local: true,
  };
  const repFrase = renderClienteCompareciente(repCliente);

  const sociedad = nombreEnMayusculas(juridico.nombre || '');
  const tipoSoc  = tipoSociedadCompleto(juridico.tipo_sociedad);
  const cargoTxt = (juridico.rep_cargo || 'REPRESENTANTE LEGAL').toLocaleUpperCase('es');

  // Inscripción de la sociedad en RM (no la del rep — esa es la otra)
  const regNum   = juridico.registro_mercantil_numero;
  const regFolio = juridico.registro_mercantil_folio;
  const regLibro = juridico.registro_mercantil_libro;
  const inscripcionSociedad = regNum
    ? `inscrita en registro número ${formatoLegal(regNum, { tipo: 'entero' })}, folio ${formatoLegal(regFolio || 0, { tipo: 'entero' })}, libro ${formatoLegal(regLibro || 0, { tipo: 'entero' })} de Sociedades Mercantiles del Registro Mercantil General de la República`
    : '';

  // Inscripción del nombramiento del rep (Auxiliares de Comercio)
  const insRepNum   = juridico.rep_inscripcion_numero;
  const insRepFolio = juridico.rep_inscripcion_folio;
  const insRepLibro = juridico.rep_inscripcion_libro;
  const inscripcionRep = insRepNum
    ? `cuyo nombramiento consta en registro número ${formatoLegal(insRepNum, { tipo: 'entero' })}${insRepFolio ? ', folio ' + formatoLegal(insRepFolio, { tipo: 'entero' }) : ''}${insRepLibro ? ', libro ' + formatoLegal(insRepLibro, { tipo: 'entero' }) : ''} de Auxiliares de Comercio del Registro Mercantil General de la República`
    : '';

  const tail = [
    `actúa en su calidad de ${cargoTxt} de la entidad ${sociedad}, ${tipoSoc}${inscripcionSociedad ? ', ' + inscripcionSociedad : ''}`,
    inscripcionRep,
  ].filter(Boolean).join('; ');

  return `${repFrase}; ${tail}`;
}

/**
 * Frase de apertura del contrato:
 * "En la ciudad de Guatemala el día veinticuatro de octubre del año dos mil veintiséis,"
 */
function renderFechaContrato(fechaIso, ciudad = 'Guatemala') {
  if (!fechaIso) return `En la ciudad de ${ciudad},`;
  return `En la ciudad de ${ciudad} ${fechaEnContratoCompleta(fechaIso)},`;
}

/**
 * Frase de comparecencia del banco (institución acreditante) por su representante.
 *
 * institucion: { nombre, tipo, nit }
 * representante: { nombre, cargo, dpi, escritura_no, escritura_fecha, notario_escritura }
 *
 * Devuelve algo como:
 * "la entidad BANCO RSG, SOCIEDAD ANÓNIMA, debidamente representada por
 *  el señor JUAN PÉREZ, mayor de edad, ..., quien acredita su representación
 *  mediante mandato número N de fecha X autorizado por el notario Z"
 */
function renderRepresentanteBanco(institucion, representante) {
  if (!institucion) return '';
  const nombreInst = nombreEnMayusculas(institucion.nombre || '');
  const tipoInst = TIPOS_INSTITUCION[institucion.tipo] || '';
  const baseInst = tipoInst
    ? `la entidad ${nombreInst}, ${tipoInst}`
    : `la entidad ${nombreInst}`;

  if (!representante) return baseInst;

  const repFrase = renderClienteCompareciente({
    nombre: representante.nombre,
    dpi: representante.dpi,
    genero: representante.genero || 'M',
    edad: representante.edad,
    fecha_nac: representante.fecha_nac,
    estado_civil: representante.estado_civil,
    profesion: representante.profesion,
    domicilio_local: true,
  });
  const cargoTxt = (representante.cargo || 'Representante Legal').toLocaleLowerCase('es');

  // Sprint garantías-desacopladas CP2.5 — escritura_no en formato legal si es numérico.
  // Limpia el prefijo "No." que algunos seeds históricos guardan.
  function escrituraNoLegal(raw) {
    if (!raw) return '';
    const limpio = String(raw).replace(/^\s*No\.?\s*/i, '').trim();
    const n = parseInt(limpio, 10);
    if (Number.isFinite(n) && /^\d+$/.test(limpio)) {
      try { return formatoLegal(n, { tipo: 'entero' }); } catch { return limpio; }
    }
    return limpio;
  }

  const mandato = [];
  if (representante.escritura_no) mandato.push(`mediante escritura pública de mandato número ${escrituraNoLegal(representante.escritura_no)}`);
  if (representante.escritura_fecha) mandato.push(`de fecha ${fechaALetras(representante.escritura_fecha)}`);
  if (representante.notario_escritura) mandato.push(`autorizada por el notario ${representante.notario_escritura}`);
  const mandatoFrase = mandato.length ? `, lo que acredita ${mandato.join(' ')}` : '';

  return `${baseInst}, debidamente representada por ${repFrase}, quien actúa en su calidad de ${cargoTxt}${mandatoFrase}`;
}

const TIPOS_INSTITUCION = {
  banco: 'SOCIEDAD ANÓNIMA',
  financiera: 'SOCIEDAD FINANCIERA PRIVADA',
  desarrolladora: 'SOCIEDAD ANÓNIMA',
  prestamista: '',
};

/**
 * Frase completa de la forma de pago: combina la modalidad (débito/depósito/ventanilla)
 * con la cuenta receptora cuando aplica. Resuelve el caso de `cuenta_clause` vacío.
 *
 * tipoPago: 'debito_automatico' | 'deposito_cuenta' | 'ventanilla'
 * cuentaBanco: string
 */
function renderFormaPago(tipoPago, cuentaBanco) {
  const t = tipoPago || 'debito_automatico';
  if (t === 'ventanilla') return 'pago en ventanilla de cualquier agencia del Banco';
  if (cuentaBanco && cuentaBanco.trim()) {
    const modalidad = t === 'deposito_cuenta' ? 'depósito' : 'débito automático';
    return `${modalidad} en la cuenta número ${cuentaBanco.trim()} del Banco`;
  }
  return t === 'deposito_cuenta'
    ? 'depósito en la cuenta del Banco que se indique al Deudor'
    : 'débito automático en la cuenta del Banco que el Deudor designe';
}

module.exports = {
  // re-exports atómicos
  numeroALetras, enteroALetras, dineroALetras, porcentajeALetras, formatoLegal,
  dpiALetras, normalizeDpi,
  fechaALetras, fechaCortaALetras, fechaEnContratoCompleta, diaALetras,
  normGenero, gentilicio, estadoCivil, articuloPersona, rolPersona, pronombrePosesivo,
  nombreEnMayusculas, nombrePropio,
  GENTILICIOS, ESTADOS_CIVILES, ROLES, TIPOS_SOCIEDAD_COMPLETO,
  // helpers
  computeEdad,
  tipoSociedadCompleto,
  // frases de alto nivel
  renderClienteCompareciente,
  renderRepresentanteJuridico,
  renderFechaContrato,
  renderRepresentanteBanco,
  renderFormaPago,
};
