const path = require('path');
const fs = require('fs');
const db = require('./db');
const { PDFS_PATH } = require('./config');
const { decrypt } = require('./encryption');
const { formatQuetzal } = require('./utils/money');
const legalFormat = require('./utils/legal-format/legal-format');
const {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGIN_TOP,
  MARGIN_RIGHT,
  MARGIN_BOTTOM,
  MARGIN_LEFT,
  getCSSOficio,
} = require('./shared/legal/formato-oficio');
const CLAUSULAS_BASE = require('./shared/legal/clausulas-base.json');

// Variables que SIEMPRE se renderizan como moneda formateada (ej. "Q18,500.00").
// Si se agrega una variable monetaria futura, sumarla acá.
const MONETARY_VARS = new Set([
  'monto',
  'cuota_mensual',
  'seguro_inmueble',
  'valor_bien',
  'ingresos',
  'valor_garantia',
]);

function safeDecrypt(value, label) {
  if (value === null || value === undefined || value === '') return null;
  try {
    return decrypt(value);
  } catch (e) {
    console.error(`[engine decrypt failed] ${label}: ${e.message}`);
    return null;
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function interpolate(text, vars) {
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const raw = vars[k];
    if (MONETARY_VARS.has(k)) {
      const formatted = formatQuetzal(raw);
      return formatted !== null ? formatted : `__MISSING__${k}__`;
    }
    return raw !== undefined && raw !== null && raw !== '' ? String(raw) : `__MISSING__${k}__`;
  });
}

function renderClausulaHTML(texto) {
  return escapeHtml(texto).replace(/__MISSING__(\w+)__/g, (_, k) => `[${k.toUpperCase()}]`);
}

function buildRepEscritura(rep) {
  if (!rep) return '';
  const partes = [];
  if (rep.escritura_no) partes.push(`número ${rep.escritura_no}`);
  if (rep.escritura_fecha) partes.push(`de fecha ${rep.escritura_fecha}`);
  if (rep.notario_escritura) partes.push(`autorizada por ${rep.notario_escritura}`);
  return partes.join(' ');
}

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function fechaLarga(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return iso || '';
  const [y, m, d] = String(iso).split('-');
  return `${parseInt(d, 10)} de ${MESES_ES[parseInt(m, 10) - 1]} de ${y}`;
}

function addMonthsISO(iso, months) {
  const m = parseInt(months, 10);
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso)) || !m) return '';
  const d = new Date(String(iso) + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  const r = new Date(d);
  r.setMonth(r.getMonth() + m);
  const y = r.getFullYear();
  const mo = String(r.getMonth() + 1).padStart(2, '0');
  const day = String(r.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function frasePersona(f) {
  const partes = [f.nombre || '________', 'mayor de edad'];
  if (f.estado_civil) partes.push(f.estado_civil);
  if (f.profesion) partes.push('de profesión ' + f.profesion);
  if (f.domicilio) partes.push('con domicilio en ' + f.domicilio);
  partes.push(`con DPI número ${f.dpi || '________'}`);
  if (f.nit) partes.push('NIT ' + f.nit);
  return partes.join(', ');
}

function fraseFiador(f) {
  const tipo = f.tipo_garantia || f.tipo || 'personal';
  if (tipo === 'hipotecaria') {
    const h = f.hipoteca || {};
    const area = h.area ? `, con un área de ${h.area} metros cuadrados` : '';
    const ubicacion = h.direccion ? `, ubicado en ${h.direccion}` : '';
    return `hipoteca de primer grado sobre la finca número ${h.finca || '____'}, folio ${h.folio || '____'}, libro ${h.libro || '____'} del ${h.registro || 'Registro General de la Propiedad'}${ubicacion}${area}, aportada por ${frasePersona(f)}`;
  }
  if (tipo === 'prendaria') {
    const p = f.prenda || {};
    return `prenda sin desplazamiento sobre ${p.tipo_bien || 'vehículo automotor'} marca ${p.marca || '____'}${p.modelo ? ', modelo ' + p.modelo : ''}, serie ${p.serie || '____'}, placa ${p.placa || '____'}, aportada por ${frasePersona(f)}`;
  }
  return `fianza solidaria, mancomunada y de pago otorgada por ${frasePersona(f)}`;
}

function buildGarantiasText(datos_garantia) {
  if (!datos_garantia) return '';
  const tipos = Array.isArray(datos_garantia.tipos) ? datos_garantia.tipos : [];
  const fiadores = Array.isArray(datos_garantia.fiadores) ? datos_garantia.fiadores.filter((f) => f && (f.nombre || f.dpi)) : [];
  const parts = [];

  for (const f of fiadores) parts.push(fraseFiador(f));

  if (tipos.includes('hipoteca') && datos_garantia.hipoteca && !fiadores.some((f) => (f.tipo_garantia || f.tipo) === 'hipotecaria')) {
    const h = datos_garantia.hipoteca;
    const ubicacion = h.direccion ? `, ubicada en ${h.direccion}` : '';
    parts.push(
      `hipoteca de primer grado sobre la finca número ${h.finca || '____'}, folio ${h.folio || '____'}, libro ${h.libro || '____'} del Registro ${h.registro || 'General de la Propiedad'}${ubicacion}`
    );
  }

  if (tipos.includes('prenda') && datos_garantia.prenda && !fiadores.some((f) => (f.tipo_garantia || f.tipo) === 'prendaria')) {
    const p = datos_garantia.prenda;
    parts.push(
      `prenda sin desplazamiento sobre ${p.tipo || 'vehículo automotor'} marca ${p.marca || '____'}, serie ${p.serie || '____'}, placa ${p.placa || '____'}`
    );
  }

  if (tipos.includes('ninguna') && parts.length === 0) parts.push('garantía personal del Deudor sin afectación de bien específico');

  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join('; ') + '; e ' + parts[parts.length - 1];
}

const TIPO_PAGO_LABEL = {
  debito_automatico: 'débito automático',
  deposito_cuenta: 'depósito en cuenta',
  ventanilla: 'pago en ventanilla',
};

function buildCuentaClause(tipoPago, cuenta) {
  if (tipoPago === 'ventanilla') return ' en cualquier ventanilla del Banco';
  if (cuenta) return ` a la cuenta número ${cuenta} del Banco`;
  return '';
}

// ─────────────────────────────────────────────────────────────────
// Sprint garantías-desacopladas CP2.5 — lectura del modelo nuevo
// ─────────────────────────────────────────────────────────────────
//
// Estas funciones leen contrato_garantias + garantias + contrato_comparecientes
// + comparecientes (modelo nuevo). En CP3 se completarán con el freeze trigger
// y la resolución snapshot-vs-vivo según estado del contrato. Para CP2.5 solo
// se usan en estado borrador (vivo).

// Sprint CP3 — regla snapshot vs vivo:
//   - contrato.estado IN ('completado','firmado') → lee snapshot_* (inmutable).
//   - Cualquier otro estado → lee tablas vivas con JOIN.
// Si congelado_en de alguna fila es NULL aunque el estado sea congelable
// (caso patológico), fallback a vivo para esa fila.

function contratoEstaCongelado(contrato_id) {
  const r = db.prepare('SELECT estado FROM contratos WHERE id = ?').get(contrato_id);
  return r && ['completado', 'firmado'].includes(r.estado);
}

function loadGarantiasDelContrato(contrato_id) {
  if (!contrato_id) return [];
  const congelado = contratoEstaCongelado(contrato_id);
  if (congelado) {
    // Snapshot-first; si la fila no tiene snapshot (congelado_en NULL) recae a JOIN vivo.
    return db.prepare(`
      SELECT cg.garantia_id AS id,
             COALESCE(cg.snapshot_tipo,                          g.tipo)                          AS tipo,
             COALESCE(cg.snapshot_solidaria,                     g.solidaria)                     AS solidaria,
             COALESCE(cg.snapshot_datos,                         g.datos)                         AS datos,
             COALESCE(cg.snapshot_aportante_tipo,                g.aportante_tipo)                AS aportante_tipo,
             COALESCE(cg.snapshot_aportante_cliente_id,          g.aportante_cliente_id)          AS aportante_cliente_id,
             COALESCE(cg.snapshot_aportante_compareciente_id,    g.aportante_compareciente_id)    AS aportante_compareciente_id,
             cg.orden, cg.congelado_en
      FROM contrato_garantias cg
      JOIN garantias g ON g.id = cg.garantia_id
      WHERE cg.contrato_id = ?
      ORDER BY cg.orden
    `).all(contrato_id);
  }
  return db.prepare(`
    SELECT g.id, g.tipo, g.solidaria, g.datos,
           g.aportante_tipo, g.aportante_cliente_id, g.aportante_compareciente_id,
           cg.orden, NULL AS congelado_en
    FROM contrato_garantias cg
    JOIN garantias g ON g.id = cg.garantia_id
    WHERE cg.contrato_id = ?
    ORDER BY cg.orden
  `).all(contrato_id);
}

function loadComparecientesDelContrato(contrato_id) {
  if (!contrato_id) return [];
  const congelado = contratoEstaCongelado(contrato_id);
  if (congelado) {
    return db.prepare(`
      SELECT cc.compareciente_id AS id,
             COALESCE(cc.snapshot_nombre,       c.nombre)       AS nombre,
             COALESCE(cc.snapshot_dpi,          c.dpi)          AS dpi,
             COALESCE(cc.snapshot_profesion,    c.profesion)    AS profesion,
             COALESCE(cc.snapshot_estado_civil, c.estado_civil) AS estado_civil,
             COALESCE(cc.snapshot_domicilio,    c.domicilio)    AS domicilio,
             COALESCE(cc.snapshot_rol,          cc.rol)         AS rol,
             cc.orden, cc.agregado_por_actor, cc.congelado_en
      FROM contrato_comparecientes cc
      JOIN comparecientes c ON c.id = cc.compareciente_id
      WHERE cc.contrato_id = ?
      ORDER BY cc.orden
    `).all(contrato_id);
  }
  // Sprint CP5 — incluir fecha_nac y genero (plaintext, agregados al schema
  // en CP5) para que el motor F7 pueda calcular edad + concordancia.
  return db.prepare(`
    SELECT c.id, c.nombre, c.dpi, c.profesion, c.estado_civil, c.domicilio,
           c.fecha_nac, c.genero,
           cc.rol, cc.orden, cc.agregado_por_actor, NULL AS congelado_en
    FROM contrato_comparecientes cc
    JOIN comparecientes c ON c.id = cc.compareciente_id
    WHERE cc.contrato_id = ?
    ORDER BY cc.orden
  `).all(contrato_id);
}

function descifrarCompareciente(row) {
  return {
    id: row.id,
    rol: row.rol,
    orden: row.orden,
    nombre: safeDecrypt(row.nombre, `compareciente.nombre id=${row.id}`),
    dpi: safeDecrypt(row.dpi, `compareciente.dpi id=${row.id}`),
    profesion: safeDecrypt(row.profesion, `compareciente.profesion id=${row.id}`),
    estado_civil: safeDecrypt(row.estado_civil, `compareciente.estado_civil id=${row.id}`),
    domicilio: safeDecrypt(row.domicilio, `compareciente.domicilio id=${row.id}`),
    // Sprint CP5 — fecha_nac y genero son plaintext, pasarlos sin descifrar.
    fecha_nac: row.fecha_nac || null,
    genero: row.genero || null,
    agregado_por_actor: row.agregado_por_actor || null,
    congelado_en: row.congelado_en || null,
  };
}

function descifrarGarantia(row) {
  let datos = null;
  if (row.datos) {
    try { datos = JSON.parse(safeDecrypt(row.datos, `garantia.datos id=${row.id}`)); }
    catch (e) { console.error(`[garantia.datos parse failed] id=${row.id}: ${e.message}`); }
  }
  return {
    id: row.id,
    tipo: row.tipo,
    solidaria: row.solidaria,
    orden: row.orden,
    datos,
    aportante_tipo: row.aportante_tipo,
    aportante_cliente_id: row.aportante_cliente_id,
    aportante_compareciente_id: row.aportante_compareciente_id,
  };
}

// Devuelve el nombre del aportante de la garantía como string.
// Si aportante es cliente, usa cliente.nombre del datos compilados.
// Si es compareciente, busca por id en la lista de comparecientes descifrados.
function nombreAportante(g, { cliente, comparecientes }) {
  if (g.aportante_tipo === 'cliente') {
    return (cliente?.nombre ? legalFormat.nombreEnMayusculas(cliente.nombre) : '[APORTANTE]');
  }
  if (g.aportante_tipo === 'compareciente') {
    const c = comparecientes.find((x) => x.id === g.aportante_compareciente_id);
    return c?.nombre ? legalFormat.nombreEnMayusculas(c.nombre) : '[APORTANTE]';
  }
  return '';
}

// Formatea un entero como "doce mil trescientos cuarenta y cinco (12,345)".
// Útil para finca/folio/libro/serie y cualquier identificador numérico.
function enteroLegal(n) {
  if (n === null || n === undefined || n === '') return '[NÚMERO]';
  try {
    return legalFormat.formatoLegal(parseInt(n, 10), { tipo: 'entero' });
  } catch { return '[NÚMERO]'; }
}

function diaLegal(n) {
  if (n === null || n === undefined || n === '') return '[DÍA]';
  const num = parseInt(n, 10);
  if (!Number.isFinite(num) || num < 1 || num > 31) return '[DÍA]';
  return `${legalFormat.diaALetras(num)} (${num})`;
}

// Construye el texto legal completo del bloque de garantías a partir del
// modelo nuevo. Cero números sueltos. Aportante visible en cada garantía
// real (hipotecaria/prendaria).
function buildGarantiasLegalText({ garantias, comparecientes, cliente }) {
  if (!Array.isArray(garantias) || garantias.length === 0) {
    return 'garantía personal del Deudor sin afectación de bien específico';
  }
  const partes = garantias.map((g) => {
    if (g.tipo === 'fiduciaria') {
      const solidaria = g.solidaria
        ? 'fianza solidaria, mancomunada y de pago'
        : 'fianza simple';
      const fiadores = comparecientes.filter((c) => c.rol === 'fiador');
      if (fiadores.length === 0) return `${solidaria} a constituirse por los fiadores designados`;
      const nombres = fiadores.map((f) => legalFormat.nombreEnMayusculas(f.nombre || '[FIADOR]'));
      const lista = nombres.length === 1
        ? nombres[0]
        : nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
      return `${solidaria} otorgada por ${lista}`;
    }
    if (g.tipo === 'hipotecaria') {
      const d = g.datos || {};
      const ubicacion = d.direccion ? `, ubicado en ${d.direccion}` : '';
      const area = d.area ? `, con un área de ${d.area}` : '';
      const registro = d.registro || 'Registro General de la Propiedad';
      return `hipoteca de primer grado sobre el inmueble inscrito al número de finca ${enteroLegal(d.finca)}, folio ${enteroLegal(d.folio)}, libro ${enteroLegal(d.libro)} del ${registro}${ubicacion}${area}, aportada por ${nombreAportante(g, { cliente, comparecientes })}`;
    }
    if (g.tipo === 'prendaria') {
      const d = g.datos || {};
      const tipoBien = d.tipo_bien || 'vehículo automotor';
      const marca = d.marca ? `, marca ${d.marca}` : '';
      const modelo = d.modelo ? `, modelo ${d.modelo}` : '';
      const serie = d.serie ? `, serie ${d.serie}` : '';
      const placa = d.placa ? `, placa ${d.placa}` : '';
      return `prenda sin desplazamiento sobre ${tipoBien}${marca}${modelo}${serie}${placa}, aportada por ${nombreAportante(g, { cliente, comparecientes })}`;
    }
    return '';
  }).filter(Boolean);

  if (partes.length === 1) return partes[0];
  return partes.slice(0, -1).join('; ') + '; e ' + partes[partes.length - 1];
}

// Comparecencia super-variable: cliente + comparecientes + banco, todo
// junto en una sola frase de apertura del contrato. Reemplaza el bloque
// inline que usaba {{cliente_compareciente}} + {{banco_compareciente}}.
function buildComparecenciaText({ fecha_contrato_apertura, cliente_compareciente, banco_compareciente, comparecientes, cliente_articulo, cliente_rol_deudor }) {
  const partes = [];
  partes.push(`${fecha_contrato_apertura || 'En la ciudad de Guatemala'} comparecen, por una parte, ${banco_compareciente || '[BANCO]'} a quien en lo sucesivo se denominará «EL ACREEDOR»`);
  partes.push(`y por la otra parte, ${cliente_compareciente || '[CLIENTE]'} a quien en lo sucesivo se denominará «${cliente_articulo || 'EL'} ${cliente_rol_deudor || 'DEUDOR'}»`);
  if (Array.isArray(comparecientes) && comparecientes.length > 0) {
    const frases = comparecientes.map((c) => {
      const rolTxt = c.rol === 'fiador' ? 'en calidad de FIADOR' : 'en calidad de TERCERO GARANTE';
      const persona = legalFormat.renderClienteCompareciente({
        nombre: c.nombre,
        dpi: c.dpi,
        genero: c.genero || 'M',
        // Sprint CP5 — fecha_nac se agregó a comparecientes para que
        // renderClienteCompareciente calcule la edad. Sin este, el motor
        // renderiza '[EDAD]' y el contrato queda inválido para firma.
        fecha_nac: c.fecha_nac,
        estado_civil: c.estado_civil,
        profesion: c.profesion,
        domicilio: c.domicilio,
        domicilio_local: !c.domicilio,
      });
      return `${persona}, ${rolTxt}`;
    });
    partes.push('y como comparecientes adicionales: ' + frases.join('; '));
  }
  return partes.join('; ') + '. Ambas partes celebran el presente contrato conforme a las cláusulas siguientes.';
}

function buildVars({ representante, institucion, cliente, credito, garantia, firmas }) {
  const tipoKey = credito?.tipo_pago || 'debito_automatico';
  const fechaInicioISO = credito?.fecha_inicio || '';
  const plazoMeses = credito?.plazo_meses || '';
  const fechaVencimientoISO = addMonthsISO(fechaInicioISO, plazoMeses);
  return {
    ciudad: firmas?.ciudad || '',
    fecha: fechaLarga(firmas?.fecha) || firmas?.fecha || '',
    rep_nombre: representante?.nombre || '',
    rep_cargo: representante?.cargo || '',
    rep_dpi: representante?.dpi || '',
    rep_escritura: buildRepEscritura(representante),
    cl_nombre: cliente?.nombre || '',
    cl_estado_civil: cliente?.estado_civil || '',
    cl_profesion: cliente?.profesion || '',
    cl_domicilio: cliente?.domicilio || '',
    cl_dpi: cliente?.dpi || '',
    cl_nit: cliente?.nit || '',
    /** @deprecated `{{moneda}}` ya no se usa en templates oficiales; formatQuetzal
     *  inyecta "Q" en variables monetarias (MONETARY_VARS). Se conserva por
     *  compatibilidad con templates legacy de tenants. */
    moneda: credito?.moneda || 'Q',
    monto: credito?.monto || '',
    monto_letras: credito?.monto_letras || '',
    destino: credito?.destino || '',
    forma_desembolso: credito?.forma_desembolso || '',
    plazo_meses: plazoMeses,
    fecha_inicio: fechaLarga(fechaInicioISO) || fechaInicioISO,
    fecha_vencimiento: fechaLarga(fechaVencimientoISO) || fechaVencimientoISO,
    sistema_amort: credito?.sistema_amort || '',
    cuota_mensual: credito?.cuota_mensual || '',
    dia_pago_inicio: credito?.dia_pago_inicio || '',
    dia_pago_fin: credito?.dia_pago_fin || '',
    cuenta_banco: credito?.cuenta_banco || '',
    tipo_pago: TIPO_PAGO_LABEL[tipoKey] || 'débito automático',
    cuenta_clause: buildCuentaClause(tipoKey, credito?.cuenta_banco),
    tasa_ordinaria: credito?.tasa_ordinaria || '',
    base_calculo: credito?.base_calculo || '',
    tasa_moratoria: credito?.tasa_moratoria || '',
    garantias: buildGarantiasText(garantia),
    cuotas_incumplimiento: credito?.cuotas_incumplimiento || '',
    causales_vencimiento: credito?.causales_vencimiento || '',
    via_cobro: credito?.via_cobro || '',
    // Variables monetarias futuras (registradas en MONETARY_VARS):
    seguro_inmueble: garantia?.hipoteca?.seguro_inmueble || '',
    valor_bien: garantia?.prenda?.valor_bien || '',
    valor_garantia: garantia?.valor_garantia || '',
    ingresos: cliente?.ingresos || '',
    // ─── Variables del motor de formato legal (F7) ──────────────
    // Coexisten con las anteriores; las plantillas viejas siguen funcionando.
    ...buildLegalVars({ cliente, credito, firmas, garantia, representante, institucion, fechaInicioISO, plazoMeses, fechaVencimientoISO }),
  };
}

// Variables computadas con frases legales completas según protocolo notarial GT.
// Si falta un dato, se renderiza como '[VAR]' (placeholder visible en el PDF).
function buildLegalVars({ cliente, credito, firmas, garantia, representante, institucion, fechaInicioISO, plazoMeses, fechaVencimientoISO }) {
  const generoCliente = cliente?.genero || 'M';
  // Frase de comparecencia del cliente individual (deudor).
  const cliente_compareciente = legalFormat.renderClienteCompareciente({
    nombre: cliente?.nombre,
    dpi: cliente?.dpi,
    genero: generoCliente,
    edad: cliente?.edad,
    fecha_nac: cliente?.fecha_nac,
    estado_civil: cliente?.estado_civil,
    profesion: cliente?.profesion,
    pais: cliente?.pais || 'guatemala',
    domicilio_local: cliente?.domicilio_local !== false,
    domicilio: cliente?.domicilio,
  });

  // Fechas en letras.
  let fecha_contrato_letras = '';
  let fecha_contrato_apertura = '';
  if (firmas?.fecha) {
    try {
      fecha_contrato_letras   = legalFormat.fechaALetras(firmas.fecha);
      fecha_contrato_apertura = legalFormat.renderFechaContrato(firmas.fecha, firmas?.ciudad || 'Guatemala');
    } catch { /* ignore */ }
  }

  // Montos y plazos en formato "[letras] (número)".
  const fl = legalFormat.formatoLegal;
  const safe = (fn) => { try { return fn(); } catch { return ''; } };

  const monto_legal           = credito?.monto           ? safe(() => fl(credito.monto, { tipo: 'dinero' }))           : '';
  const cuota_mensual_legal   = credito?.cuota_mensual   ? safe(() => fl(credito.cuota_mensual, { tipo: 'dinero' }))   : '';
  const plazo_legal           = plazoMeses               ? safe(() => fl(parseInt(plazoMeses, 10), { tipo: 'plazo', sufijo: 'meses' })) : '';
  const tasa_ordinaria_legal  = credito?.tasa_ordinaria  ? safe(() => fl(parseFloat(credito.tasa_ordinaria), { tipo: 'porcentaje' }))   : '';
  const tasa_moratoria_legal  = credito?.tasa_moratoria  ? safe(() => fl(parseFloat(credito.tasa_moratoria), { tipo: 'porcentaje' }))   : '';
  const base_calculo_legal    = credito?.base_calculo    ? safe(() => fl(parseInt(credito.base_calculo, 10), { tipo: 'plazo', sufijo: 'días' })) : '';
  const ingresos_legal        = cliente?.ingresos        ? safe(() => fl(cliente.ingresos, { tipo: 'dinero' }))        : '';
  const seguro_inmueble_legal = garantia?.hipoteca?.seguro_inmueble ? safe(() => fl(garantia.hipoteca.seguro_inmueble, { tipo: 'dinero' })) : '';
  const valor_bien_legal      = garantia?.prenda?.valor_bien ? safe(() => fl(garantia.prenda.valor_bien, { tipo: 'dinero' })) : '';

  // Concordancia para títulos del cliente.
  const cliente_articulo      = legalFormat.articuloPersona(generoCliente);                  // 'EL' | 'LA'
  const cliente_rol_deudor    = legalFormat.rolPersona('deudor', generoCliente);             // 'DEUDOR' | 'DEUDORA'
  const cliente_rol_acreedor  = 'EL ACREEDOR'; // institución (banco), siempre invariable como "EL ACREEDOR" o "EL BANCO"
  const cliente_nombre_upper  = cliente?.nombre ? legalFormat.nombreEnMayusculas(cliente.nombre) : '';
  const cliente_dpi_letras    = cliente?.dpi ? safe(() => legalFormat.dpiALetras(cliente.dpi)) : '';

  // Fechas concretas en letras (hotfix bloque 5).
  const fecha_inicio_letras       = fechaInicioISO       ? safe(() => legalFormat.fechaALetras(fechaInicioISO))       : '';
  const fecha_vencimiento_letras  = fechaVencimientoISO  ? safe(() => legalFormat.fechaALetras(fechaVencimientoISO))  : '';

  // Frase completa de forma de pago según tipo + cuenta. Reemplaza la lógica
  // legacy de {{tipo_pago}}{{cuenta_clause}} que dejaba "__MISSING__cuenta_clause__".
  const forma_pago_legal = safe(() =>
    legalFormat.renderFormaPago(credito?.tipo_pago, credito?.cuenta_banco)
  );

  // Comparecencia del banco (institución acreditante por su representante).
  const banco_compareciente = (institucion && representante)
    ? safe(() => legalFormat.renderRepresentanteBanco(institucion, representante))
    : '';

  // Sprint garantías-desacopladas CP2.5 — días en formato legal.
  const dia_pago_inicio_legal = credito?.dia_pago_inicio ? diaLegal(credito.dia_pago_inicio) : '';
  const dia_pago_fin_legal    = credito?.dia_pago_fin    ? diaLegal(credito.dia_pago_fin)    : '';
  // {{dia_pago_legal}} alias para clausulas que tienen un único día.
  const dia_pago_legal = credito?.dia_pago ? diaLegal(credito.dia_pago) : '';
  // {{cuotas_incumplimiento_legal}} para mora — el número de cuotas en mora
  // que dispara el vencimiento anticipado.
  const cuotas_incumplimiento_legal = credito?.cuotas_incumplimiento
    ? (() => { try { return legalFormat.formatoLegal(parseInt(credito.cuotas_incumplimiento, 10), { tipo: 'plazo', sufijo: 'cuotas' }); } catch { return ''; } })()
    : '';

  return {
    cliente_compareciente,
    banco_compareciente,
    fecha_contrato_letras,
    fecha_contrato_apertura,
    fecha_inicio_letras,
    fecha_vencimiento_letras,
    monto_legal,
    cuota_mensual_legal,
    plazo_legal,
    tasa_ordinaria_legal,
    tasa_moratoria_legal,
    base_calculo_legal,
    ingresos_legal,
    seguro_inmueble_legal,
    valor_bien_legal,
    forma_pago_legal,
    cliente_articulo,
    cliente_rol_deudor,
    cliente_rol_acreedor,
    cliente_nombre_upper,
    cliente_dpi_letras,
    dia_pago_inicio_legal,
    dia_pago_fin_legal,
    dia_pago_legal,
    cuotas_incumplimiento_legal,
  };
}

function compilarContrato(modelo_id, datos, opts = {}) {
  const modelo = db.prepare('SELECT * FROM modelos WHERE id = ?').get(modelo_id);
  if (!modelo) throw Object.assign(new Error('Modelo no encontrado'), { status: 404 });

  const institucion = db.prepare('SELECT * FROM instituciones WHERE id = ?').get(modelo.institucion_id);
  const representante = db
    .prepare('SELECT * FROM representantes WHERE institucion_id = ? AND activo = 1 LIMIT 1')
    .get(institucion.id);
  // representantes.dpi está encriptado en DB; descifrarlo antes de armar el contexto.
  if (representante) {
    representante.dpi = safeDecrypt(representante.dpi, `representante.dpi id=${representante.id}`);
  }
  const clausulasRaw = db
    .prepare('SELECT * FROM clausulas WHERE modelo_id = ? ORDER BY orden')
    .all(modelo_id);

  const cliente = datos?.datos_cliente || {};
  const credito = datos?.datos_credito || {};
  const garantia = datos?.datos_garantia || {};
  const firmas = datos?.datos_firmas || {};

  const vars = buildVars({ representante, institucion, cliente, credito, garantia, firmas });

  // Sprint garantías-desacopladas CP2.5 — overlay con datos del modelo nuevo.
  // Si opts.contrato_id está presente, leemos garantias + comparecientes de las
  // tablas nuevas y producimos {{garantias_legal}}, {{comparecencia}},
  // {{aportante_garantia_1}}, {{aportante_garantia_2}}, ...
  if (opts.contrato_id) {
    const garantiasInfladas = loadGarantiasDelContrato(opts.contrato_id).map(descifrarGarantia);
    const comparecientesInflados = loadComparecientesDelContrato(opts.contrato_id).map(descifrarCompareciente);

    vars.garantias_legal = buildGarantiasLegalText({
      garantias: garantiasInfladas,
      comparecientes: comparecientesInflados,
      cliente,
    });

    vars.comparecencia = buildComparecenciaText({
      fecha_contrato_apertura: vars.fecha_contrato_apertura,
      cliente_compareciente: vars.cliente_compareciente,
      banco_compareciente: vars.banco_compareciente,
      comparecientes: comparecientesInflados,
      cliente_articulo: vars.cliente_articulo,
      cliente_rol_deudor: vars.cliente_rol_deudor,
    });

    // Aportantes indexados (1-based).
    garantiasInfladas.forEach((g, i) => {
      vars[`aportante_garantia_${i + 1}`] = nombreAportante(g, { cliente, comparecientes: comparecientesInflados });
    });
  }

  const clausulas = clausulasRaw.map((c) => ({
    codigo: c.codigo,
    titulo: c.titulo,
    orden: c.orden,
    texto: interpolate(c.texto_base, vars),
  }));

  const metadata = {
    institucion: {
      id: institucion.id,
      slug: institucion.slug,
      nombre: institucion.nombre,
      nit: institucion.nit,
      registro_mercantil: institucion.registro_mercantil,
      correlativo_prefijo: institucion.correlativo_prefijo || 'CT',
    },
    modelo: { id: modelo.id, nombre: modelo.nombre, tipo_garantia: modelo.tipo_garantia },
    representante: representante
      ? { nombre: representante.nombre, cargo: representante.cargo, dpi: representante.dpi }
      : null,
    cliente: { nombre: cliente.nombre || '', dpi: cliente.dpi || '' },
    fiadores: Array.isArray(garantia.fiadores) ? garantia.fiadores : [],
    firmas: {
      notario: firmas.notario || '',
      colegiado: firmas.colegiado || '',
      ciudad: firmas.ciudad || '',
      fecha: firmas.fecha || '',
      correlativo: firmas.correlativo || datos?.no_contrato || '',
      folio_protocolo: firmas.folio_protocolo || '',
    },
  };

  return { clausulas, metadata, vars };
}

function generarHTML(contrato) {
  const { clausulas, metadata } = contrato;
  const inst = metadata.institucion;
  const rep = metadata.representante;
  const cli = metadata.cliente;
  const firmas = metadata.firmas;
  const fiadores = metadata.fiadores || [];

  // P3 hotfix v2: TODO el contrato como un solo párrafo continuo (notarial GT real).
  // No hay <p> separados por cláusula — el texto fluye sin saltos. Las cláusulas
  // se distinguen solo por sus títulos en MAYÚSCULAS inline.
  const cuerpo = clausulas
    .map((c) => {
      const esComparecencia = c.codigo === 'comparecencia';
      if (esComparecencia) {
        return renderClausulaHTML(c.texto);
      }
      const titulo = c.titulo.toUpperCase().replace(/^CLÁUSULA\s+/i, 'CLÁUSULA ');
      // Espacio + título inline en mayúsculas + texto. El espacio antes del título
      // y el punto final del título dan el respiro visual sin romper línea.
      return ` <span class="cl-titulo">${escapeHtml(titulo)}.</span> ${renderClausulaHTML(c.texto)}`;
    })
    .join('');

  const fiadoresValidos = fiadores.filter((f) => f && (f.nombre || f.dpi));
  const fiadoresHTML = fiadoresValidos.length
    ? `<div class="firmas-bloque">${fiadoresValidos
        .map(
          (f, i) => `
        <div class="firma firma-fiador">
          <div class="espacio-firma"></div>
          <div class="linea-firma"></div>
          <div class="firma-nombre">${escapeHtml(f.nombre || '')}</div>
          <div class="firma-cargo">Fiador${fiadoresValidos.length > 1 ? ' ' + (i + 1) : ''}</div>
          ${f.dpi ? `<div class="firma-dpi">DPI ${escapeHtml(f.dpi)}</div>` : ''}
        </div>`
        )
        .join('')}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(firmas.correlativo || metadata.modelo.nombre)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=DM+Mono:wght@400&display=swap" rel="stylesheet">
  <style>${getCSSOficio()}</style>
</head>
<body>
  <header class="doc-head">
    <div class="banco">${escapeHtml(inst.nombre)}</div>
    ${firmas.correlativo ? `<div class="correlativo">CONTRATO No. ${escapeHtml(firmas.correlativo)}</div>` : ''}
  </header>

  <div class="contrato-body">
    <p>${cuerpo}</p>
  </div>

  <div class="firmas-bloque firmas-principales">
    <div class="firma">
      <div class="espacio-firma"></div>
      <div class="linea-firma"></div>
      <div class="firma-nombre">${escapeHtml(rep?.nombre || '')}</div>
      <div class="firma-cargo">${escapeHtml(rep?.cargo || 'Representante legal')}</div>
      ${rep?.dpi ? `<div class="firma-dpi">DPI ${escapeHtml(rep.dpi)}</div>` : ''}
    </div>
    <div class="firma">
      <div class="espacio-firma"></div>
      <div class="linea-firma"></div>
      <div class="firma-nombre">${escapeHtml(cli.nombre || '')}</div>
      <div class="firma-cargo">El Deudor</div>
      ${cli.dpi ? `<div class="firma-dpi">DPI ${escapeHtml(cli.dpi)}</div>` : ''}
    </div>
  </div>
  ${fiadoresHTML}

  <hr class="firmas-separador" />

  <section class="legalizacion">
    <div class="title">LEGALIZACIÓN DE FIRMAS</div>
    <p>En la ciudad de ${escapeHtml(firmas.ciudad || '________')}, el ${escapeHtml(firmas.fecha || '________')}, como Notario doy fe que las firmas que anteceden son auténticas, por haber sido puestas en mi presencia hoy por los señores ${escapeHtml(rep?.nombre || '________')} y ${escapeHtml(cli.nombre || '________')}, personas de mi conocimiento, quienes firmaron junto conmigo. Este acto queda registrado en mi protocolo bajo el folio ${escapeHtml(firmas.folio_protocolo || '____')}.</p>
    <div class="sello">
      <div class="sello-caja">Sello del Notario</div>
      <div class="firma-notario">
        <div class="espacio-firma"></div>
        <div class="linea-firma"></div>
        <div class="firma-nombre">${escapeHtml(firmas.notario || '________')}</div>
        <div class="firma-colegiado">Colegiado No. ${escapeHtml(firmas.colegiado || '____')}</div>
      </div>
    </div>
  </section>
</body>
</html>`;
}

async function generarPDF(html, filename) {
  const puppeteer = require('puppeteer');
  if (!fs.existsSync(PDFS_PATH)) fs.mkdirSync(PDFS_PATH, { recursive: true });
  const safe = String(filename).replace(/[^A-Za-z0-9._-]/g, '_');
  const finalName = safe.endsWith('.pdf') ? safe : `${safe}.pdf`;
  const absPath = path.join(PDFS_PATH, finalName);

  // En Railway (Linux): PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium del nix.
  // Localmente: puppeteer.launch usa el Chromium que viene con el paquete.
  const launchOpts = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: absPath,
      width: `${PAGE_WIDTH}mm`,
      height: `${PAGE_HEIGHT}mm`,
      printBackground: true,
      margin: {
        top: `${MARGIN_TOP}mm`,
        right: `${MARGIN_RIGHT}mm`,
        bottom: `${MARGIN_BOTTOM}mm`,
        left: `${MARGIN_LEFT}mm`,
      },
    });
    return { filename: finalName, path: absPath, url: `/pdfs/${finalName}` };
  } finally {
    await browser.close();
  }
}

function nextCorrelativo(institucion_id, year) {
  const inst = db.prepare('SELECT correlativo_prefijo FROM instituciones WHERE id = ?').get(institucion_id);
  const prefijo = inst?.correlativo_prefijo || 'CT';
  const pattern = `${prefijo}-${year}-%`;
  const rows = db
    .prepare('SELECT no_contrato FROM contratos WHERE institucion_id = ? AND no_contrato LIKE ?')
    .all(institucion_id, pattern);
  const re = new RegExp(`^${prefijo}-${year}-(\\d+)$`);
  let max = 0;
  for (const r of rows) {
    const m = r.no_contrato.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefijo}-${year}-${String(max + 1).padStart(4, '0')}`;
}

module.exports = {
  compilarContrato,
  generarHTML,
  generarPDF,
  nextCorrelativo,
  buildVars,
  buildGarantiasText,
  buildRepEscritura,
  interpolate,
  CLAUSULAS_BASE,
  // Sprint garantías-desacopladas CP3 — utilidades expuestas para reuso
  // por tests y endpoints.
  loadGarantiasDelContrato,
  loadComparecientesDelContrato,
  descifrarGarantia,
  descifrarCompareciente,
  buildGarantiasLegalText,
  buildComparecenciaText,
  contratoEstaCongelado,
};

if (require.main === module) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  contrato-engine.js · self-test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const modelo = db.prepare('SELECT id, nombre, institucion_id FROM modelos WHERE nombre = ?').get('Crédito Personal');
  if (!modelo) {
    console.error('✗ Modelo "Crédito Personal" no existe. Corré primero: node seed.js && node seed-clausulas.js');
    process.exit(1);
  }
  console.log(`✓ Modelo encontrado: ${modelo.nombre} (id=${modelo.id})`);

  const datosPrueba = {
    no_contrato: 'BI-2026-TEST',
    datos_cliente: {
      nombre: 'Ana Lucía Hernández Morales',
      dpi: '2468 13579 0104',
      nit: '7654321',
      estado_civil: 'soltera',
      profesion: 'Arquitecta',
      domicilio: '3a avenida 10-25 zona 14, Ciudad de Guatemala',
    },
    datos_credito: {
      moneda: 'GTQ',
      monto: '125000.00',
      monto_letras: 'ciento veinticinco mil',
      destino: 'Compra de vivienda',
      forma_desembolso: 'acreditación en cuenta',
      plazo_meses: '60',
      fecha_inicio: '2026-06-01',
      fecha_vencimiento: '2031-06-01',
      sistema_amort: 'Cuotas niveladas',
      cuota_mensual: '3175.50',
      dia_pago: '5',
      cuenta_banco: '01-2345-6789',
      tasa_ordinaria: '14.5',
      base_calculo: '365',
      tasa_moratoria: '5',
      tea: '15.49',
      cuotas_incumplimiento: '3',
      causales_vencimiento: 'declaración de quiebra o falsedad en los datos proporcionados',
      via_cobro: 'ejecutiva',
    },
    datos_garantia: {
      tipos: ['hipoteca'],
      hipoteca: {
        finca: '54321',
        folio: '127',
        libro: '88',
        registro: 'General de la Propiedad de la Zona Central',
        direccion: '3a avenida 10-25 zona 14, Ciudad de Guatemala',
      },
    },
    datos_firmas: {
      notario: 'Lic. Roberto Castillo Aldana',
      colegiado: '8765',
      ciudad: 'Ciudad de Guatemala',
      fecha: new Date().toISOString().slice(0, 10),
      correlativo: 'BI-2026-TEST',
      folio_protocolo: '142',
    },
  };

  console.log('\n→ compilarContrato(...)');
  const compilado = compilarContrato(modelo.id, datosPrueba);
  console.log(`  Cláusulas compiladas: ${compilado.clausulas.length}`);
  console.log(`  Institución: ${compilado.metadata.institucion.nombre}`);
  console.log(`  Cliente:     ${compilado.metadata.cliente.nombre} · DPI ${compilado.metadata.cliente.dpi}`);
  console.log(`  Notario:     ${compilado.metadata.firmas.notario} (col. ${compilado.metadata.firmas.colegiado})`);
  console.log(`  Correlativo: ${compilado.metadata.firmas.correlativo}`);

  console.log('\n→ Primera cláusula renderizada (comparecencia):');
  console.log('  ' + compilado.clausulas[0].texto.slice(0, 280) + '...');

  console.log('\n→ Quinta cláusula (garantías construida dinámicamente):');
  console.log('  ' + compilado.clausulas[5].texto);

  console.log('\n→ generarHTML(...)');
  const html = generarHTML(compilado);
  console.log(`  HTML generado: ${html.length} chars`);
  console.log(`  Incluye Cormorant Garamond: ${/Cormorant Garamond/.test(html) ? '✓' : '✗'}`);
  console.log(`  Incluye sello del notario:  ${/Sello del/.test(html) ? '✓' : '✗'}`);
  console.log(`  Incluye legalización:       ${/Legalización Notarial/.test(html) ? '✓' : '✗'}`);

  const datosVacios = { datos_cliente: {}, datos_credito: {}, datos_garantia: {}, datos_firmas: {} };
  const compiladoVacio = compilarContrato(modelo.id, datosVacios);
  const htmlVacio = generarHTML(compiladoVacio);
  const camposFaltantes = (htmlVacio.match(/class="blank-empty"/g) || []).length;
  console.log(`  Contrato vacío marca ${camposFaltantes} variables faltantes en rojo: ✓`);

  console.log('\n✓ Self-test completado sin errores.\n');
}
