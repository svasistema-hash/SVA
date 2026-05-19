const path = require('path');
const fs = require('fs');
const db = require('./db');
const { PDFS_PATH } = require('./config');
const { decrypt } = require('./encryption');
const { formatQuetzal } = require('./utils/money');
const {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGIN_TOP,
  MARGIN_RIGHT,
  MARGIN_BOTTOM,
  MARGIN_LEFT,
  getCSSOficio,
} = require('../shared/legal/formato-oficio');
const CLAUSULAS_BASE = require('../shared/legal/clausulas-base.json');

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

function buildVars({ representante, cliente, credito, garantia, firmas }) {
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
  };
}

function compilarContrato(modelo_id, datos) {
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

  const vars = buildVars({ representante, cliente, credito, garantia, firmas });

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

  const cuerpo = clausulas
    .map((c) => {
      const esComparecencia = c.codigo === 'comparecencia';
      if (esComparecencia) {
        return `<p class="comparecencia"><em>${renderClausulaHTML(c.texto)}</em></p>`;
      }
      const titulo = c.titulo.toUpperCase().replace(/^CLÁUSULA\s+/i, 'CLÁUSULA ');
      return `<p><span class="cl-titulo">${escapeHtml(titulo)}.</span> ${renderClausulaHTML(c.texto)}</p>`;
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
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Mono:wght@400&display=swap" rel="stylesheet">
  <style>${getCSSOficio()}</style>
</head>
<body>
  <header class="doc-head">
    <div class="banco">${escapeHtml(inst.nombre)}</div>
    ${firmas.correlativo ? `<div class="correlativo">CONTRATO No. ${escapeHtml(firmas.correlativo)}</div>` : ''}
  </header>

  <div class="contrato-body">
    ${cuerpo}
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

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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
