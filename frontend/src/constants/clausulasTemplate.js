export const CLAUSULAS_TEMPLATE = {
  comparecencia: {
    titulo: 'COMPARECENCIA',
    texto:
      'En la ciudad de {{ciudad}}, el {{fecha}}, entre BANCO RSG, S.A., representado en este acto por {{rep_nombre}}, {{rep_cargo}}, quien se identifica con DPI número {{rep_dpi}} y actúa conforme a escritura de mandato {{rep_escritura}}, en adelante «EL BANCO»; y {{cl_nombre}}, guatemalteco/a, {{cl_estado_civil}}, de profesión {{cl_profesion}}, con domicilio en {{cl_domicilio}}, quien se identifica con DPI número {{cl_dpi}}, NIT {{cl_nit}}, en adelante «EL DEUDOR».',
  },
  'primera-monto': {
    titulo: 'Cláusula Primera — Monto y Objeto',
    texto:
      'El Banco concede a El Deudor un crédito por la suma de {{moneda}} {{monto}} ({{monto_letras}}), destinado a: {{destino}}. Los fondos serán entregados mediante {{forma_desembolso}}.',
  },
  'segunda-plazo': {
    titulo: 'Cláusula Segunda — Plazo',
    texto:
      'El crédito otorgado será cancelado en un plazo de {{plazo_meses}} meses, contados a partir del {{fecha_inicio}}, venciendo el {{fecha_vencimiento}}.',
  },
  'tercera-pago': {
    titulo: 'Cláusula Tercera — Forma de Pago',
    texto:
      'El Deudor se obliga a pagar mediante {{sistema_amort}}, cuotas de {{moneda}} {{cuota_mensual}}, pagadero entre el día {{dia_pago_inicio}} y el día {{dia_pago_fin}} de cada mes, mediante {{tipo_pago}}{{cuenta_clause}}.',
  },
  'cuarta-intereses': {
    titulo: 'Cláusula Cuarta — Intereses',
    texto:
      'El Deudor pagará intereses ordinarios a una tasa del {{tasa_ordinaria}}% anual, calculados sobre base de {{base_calculo}} días sobre saldo insoluto. En caso de mora, se aplicará una tasa del {{tasa_moratoria}}% anual.',
  },
  'quinta-garantias': {
    titulo: 'Cláusula Quinta — Garantías',
    texto: 'El cumplimiento de las obligaciones queda garantizado mediante: {{garantias}}.',
  },
  'sexta-gastos': {
    titulo: 'Cláusula Sexta — Gastos y Costas',
    texto:
      'Todos los gastos notariales, timbres fiscales, impuestos, honorarios y costas judiciales que se generen por el otorgamiento, formalización o ejecución del presente contrato serán a cargo exclusivo de El Deudor.',
  },
  'septima-incumplimiento': {
    titulo: 'Cláusula Séptima — Incumplimiento y Vencimiento Anticipado',
    texto:
      'El Banco podrá dar por vencido el plazo y exigir el pago inmediato del saldo total adeudado si El Deudor incumpliere el pago de {{cuotas_incumplimiento}} cuotas consecutivas, o incurriere en cualquiera de las siguientes causales: {{causales_vencimiento}}. El cobro se realizará por la vía {{via_cobro}}.',
  },
  'octava-disposiciones': {
    titulo: 'Cláusula Octava — Disposiciones Generales',
    texto:
      'Las partes se someten expresamente a los Tribunales de Justicia de la República de Guatemala, siendo aplicable el Código de Comercio, Decreto 2-70 del Congreso de la República, y demás leyes aplicables.',
  },
};

export function buildRepEscritura(rep) {
  if (!rep) return '';
  const partes = [];
  if (rep.escritura_no) partes.push(`número ${rep.escritura_no}`);
  if (rep.escritura_fecha) partes.push(`de fecha ${rep.escritura_fecha}`);
  if (rep.notario_escritura) partes.push(`autorizada por ${rep.notario_escritura}`);
  return partes.join(' ');
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
    const ub = h.direccion ? `, ubicado en ${h.direccion}` : '';
    return `hipoteca de primer grado sobre la finca número ${h.finca || '____'}, folio ${h.folio || '____'}, libro ${h.libro || '____'} del ${h.registro || 'Registro General de la Propiedad'}${ub}${area}, aportada por ${frasePersona(f)}`;
  }
  if (tipo === 'prendaria') {
    const p = f.prenda || {};
    return `prenda sin desplazamiento sobre ${p.tipo_bien || 'vehículo automotor'} marca ${p.marca || '____'}${p.modelo ? ', modelo ' + p.modelo : ''}, serie ${p.serie || '____'}, placa ${p.placa || '____'}, aportada por ${frasePersona(f)}`;
  }
  return `fianza solidaria, mancomunada y de pago otorgada por ${frasePersona(f)}`;
}

export function buildGarantiasText(g) {
  if (!g) return '';
  const tipos = Array.isArray(g.tipos) ? g.tipos : [];
  const fiadores = Array.isArray(g.fiadores) ? g.fiadores.filter((f) => f && (f.nombre || f.dpi)) : [];
  const parts = [];

  for (const f of fiadores) parts.push(fraseFiador(f));

  if (tipos.includes('hipoteca') && g.hipoteca && !fiadores.some((f) => (f.tipo_garantia || f.tipo) === 'hipotecaria')) {
    const h = g.hipoteca;
    const ub = h.direccion ? `, ubicada en ${h.direccion}` : '';
    parts.push(`hipoteca de primer grado sobre la finca número ${h.finca || '____'}, folio ${h.folio || '____'}, libro ${h.libro || '____'} del Registro ${h.registro || 'General de la Propiedad'}${ub}`);
  }
  if (tipos.includes('prenda') && g.prenda && !fiadores.some((f) => (f.tipo_garantia || f.tipo) === 'prendaria')) {
    const p = g.prenda;
    parts.push(`prenda sin desplazamiento sobre ${p.tipo || 'vehículo automotor'} marca ${p.marca || '____'}, serie ${p.serie || '____'}, placa ${p.placa || '____'}`);
  }
  if (tipos.includes('ninguna') && parts.length === 0) parts.push('garantía personal del Deudor sin afectación de bien específico');

  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join('; ') + '; e ' + parts[parts.length - 1];
}

import { fechaLarga, addMonthsISO } from '../utils/fechas';

const TIPO_PAGO_LABEL = {
  debito_automatico: 'débito automático',
  deposito_cuenta: 'depósito en cuenta',
  ventanilla: 'pago en ventanilla',
};

function buildCuentaClause(tipoKey, cuenta) {
  if (tipoKey === 'ventanilla') return ' en cualquier ventanilla del Banco';
  if (cuenta) return ` a la cuenta número ${cuenta} del Banco`;
  return '';
}

export function computeMissingByClausula(contrato, institucion, codigos) {
  const vars = buildVars(contrato, institucion);
  const out = [];
  const list = codigos && codigos.length ? codigos : Object.keys(CLAUSULAS_TEMPLATE);
  for (const code of list) {
    const tpl = CLAUSULAS_TEMPLATE[code];
    if (!tpl) continue;
    const matches = tpl.texto.match(/\{\{(\w+)\}\}/g) || [];
    const missing = Array.from(new Set(matches.map((m) => m.slice(2, -2)))).filter(
      (v) => !vars[v] && v !== 'cuenta_clause'
    );
    if (missing.length) out.push({ codigo: code, titulo: tpl.titulo, missing });
  }
  return out;
}

export function buildVars(contrato, institucion) {
  const c = contrato || {};
  const cli = c.datos_cliente || {};
  const cr = c.datos_credito || {};
  const g = c.datos_garantia || {};
  const f = c.datos_firmas || {};
  const rep = institucion?.representante || {};
  const tipoKey = cr.tipo_pago || 'debito_automatico';
  const fechaInicioISO = cr.fecha_inicio || '';
  const fechaVencISO = addMonthsISO(fechaInicioISO, cr.plazo_meses);
  return {
    ciudad: f.ciudad || '',
    fecha: fechaLarga(f.fecha) || f.fecha || '',
    rep_nombre: rep.nombre || '',
    rep_cargo: rep.cargo || '',
    rep_dpi: rep.dpi || '',
    rep_escritura: buildRepEscritura(rep),
    cl_nombre: cli.nombre || '',
    cl_estado_civil: cli.estado_civil || '',
    cl_profesion: cli.profesion || '',
    cl_domicilio: cli.domicilio || '',
    cl_dpi: cli.dpi || '',
    cl_nit: cli.nit || '',
    moneda: cr.moneda || '',
    monto: cr.monto || '',
    monto_letras: cr.monto_letras || '',
    destino: cr.destino || '',
    forma_desembolso: cr.forma_desembolso || '',
    plazo_meses: cr.plazo_meses || '',
    fecha_inicio: fechaLarga(fechaInicioISO) || fechaInicioISO,
    fecha_vencimiento: fechaLarga(fechaVencISO) || fechaVencISO,
    sistema_amort: cr.sistema_amort || '',
    cuota_mensual: cr.cuota_mensual || '',
    dia_pago_inicio: cr.dia_pago_inicio || '',
    dia_pago_fin: cr.dia_pago_fin || '',
    cuenta_banco: cr.cuenta_banco || '',
    tipo_pago: TIPO_PAGO_LABEL[tipoKey] || 'débito automático',
    cuenta_clause: buildCuentaClause(tipoKey, cr.cuenta_banco),
    tasa_ordinaria: cr.tasa_ordinaria || '',
    base_calculo: cr.base_calculo || '',
    tasa_moratoria: cr.tasa_moratoria || '',
    garantias: buildGarantiasText(g),
    cuotas_incumplimiento: cr.cuotas_incumplimiento || '',
    causales_vencimiento: cr.causales_vencimiento || '',
    via_cobro: cr.via_cobro || '',
  };
}
