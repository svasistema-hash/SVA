const db = require('./db');

const SLUG = 'banco-rsg';
const MODELO_NOMBRE = 'Crédito Personal';
const PREFIJO = 'BI';

const CLAUSULAS = [
  {
    codigo: 'comparecencia',
    orden: 1,
    obligatoria: 1,
    titulo: 'COMPARECENCIA',
    texto_base:
      'En la ciudad de {{ciudad}}, el {{fecha}}, entre BANCO RSG, S.A., representado en este acto por {{rep_nombre}}, {{rep_cargo}}, quien se identifica con DPI número {{rep_dpi}} y actúa conforme a escritura de mandato {{rep_escritura}}, en adelante «EL BANCO»; y {{cl_nombre}}, guatemalteco/a, {{cl_estado_civil}}, de profesión {{cl_profesion}}, con domicilio en {{cl_domicilio}}, quien se identifica con DPI número {{cl_dpi}}, NIT {{cl_nit}}, en adelante «EL DEUDOR».',
    variables: ['ciudad','fecha','rep_nombre','rep_cargo','rep_dpi','rep_escritura','cl_nombre','cl_estado_civil','cl_profesion','cl_domicilio','cl_dpi','cl_nit'],
  },
  {
    codigo: 'primera-monto',
    orden: 2,
    obligatoria: 1,
    titulo: 'Cláusula Primera — Monto y Objeto',
    texto_base:
      'El Banco concede a El Deudor un crédito por la suma de {{moneda}} {{monto}} ({{monto_letras}}), destinado a: {{destino}}. Los fondos serán entregados mediante {{forma_desembolso}}.',
    variables: ['moneda','monto','monto_letras','destino','forma_desembolso'],
  },
  {
    codigo: 'segunda-plazo',
    orden: 3,
    obligatoria: 1,
    titulo: 'Cláusula Segunda — Plazo',
    texto_base:
      'El crédito otorgado será cancelado en un plazo de {{plazo_meses}} meses, contados a partir del {{fecha_inicio}}, venciendo el {{fecha_vencimiento}}.',
    variables: ['plazo_meses','fecha_inicio','fecha_vencimiento'],
  },
  {
    codigo: 'tercera-pago',
    orden: 4,
    obligatoria: 1,
    titulo: 'Cláusula Tercera — Forma de Pago',
    texto_base:
      'El Deudor se obliga a pagar mediante {{sistema_amort}}, cuotas de {{moneda}} {{cuota_mensual}}, pagadero entre el día {{dia_pago_inicio}} y el día {{dia_pago_fin}} de cada mes, mediante {{tipo_pago}}{{cuenta_clause}}.',
    variables: ['sistema_amort','cuota_mensual','dia_pago_inicio','dia_pago_fin','tipo_pago','cuenta_clause','moneda'],
  },
  {
    codigo: 'cuarta-intereses',
    orden: 5,
    obligatoria: 1,
    titulo: 'Cláusula Cuarta — Intereses',
    texto_base:
      'El Deudor pagará intereses ordinarios a una tasa del {{tasa_ordinaria}}% anual, calculados sobre base de {{base_calculo}} días sobre saldo insoluto. En caso de mora, se aplicará una tasa del {{tasa_moratoria}}% anual.',
    variables: ['tasa_ordinaria','base_calculo','tasa_moratoria'],
  },
  {
    codigo: 'quinta-garantias',
    orden: 6,
    obligatoria: 1,
    titulo: 'Cláusula Quinta — Garantías',
    texto_base:
      'El cumplimiento de las obligaciones queda garantizado mediante: {{garantias}}.',
    variables: ['garantias'],
  },
  {
    codigo: 'sexta-gastos',
    orden: 7,
    obligatoria: 1,
    titulo: 'Cláusula Sexta — Gastos y Costas',
    texto_base:
      'Todos los gastos notariales, timbres fiscales, impuestos, honorarios y costas judiciales que se generen por el otorgamiento, formalización o ejecución del presente contrato serán a cargo exclusivo de El Deudor.',
    variables: [],
  },
  {
    codigo: 'septima-incumplimiento',
    orden: 8,
    obligatoria: 1,
    titulo: 'Cláusula Séptima — Incumplimiento y Vencimiento Anticipado',
    texto_base:
      'El Banco podrá dar por vencido el plazo y exigir el pago inmediato del saldo total adeudado si El Deudor incumpliere el pago de {{cuotas_incumplimiento}} cuotas consecutivas, o incurriere en cualquiera de las siguientes causales: {{causales_vencimiento}}. El cobro se realizará por la vía {{via_cobro}}.',
    variables: ['cuotas_incumplimiento','causales_vencimiento','via_cobro'],
  },
  {
    codigo: 'octava-disposiciones',
    orden: 9,
    obligatoria: 1,
    titulo: 'Cláusula Octava — Disposiciones Generales',
    texto_base:
      'Las partes se someten expresamente a los Tribunales de Justicia de la República de Guatemala, siendo aplicable el Código de Comercio, Decreto 2-70 del Congreso de la República, y demás leyes aplicables.',
    variables: [],
  },
];

function run() {
  const institucion = db.prepare('SELECT id FROM instituciones WHERE slug = ?').get(SLUG);
  if (!institucion) throw new Error(`Institución ${SLUG} no encontrada. Corré primero: node seed.js`);

  const modelo = db
    .prepare('SELECT id FROM modelos WHERE institucion_id = ? AND nombre = ?')
    .get(institucion.id, MODELO_NOMBRE);
  if (!modelo) throw new Error(`Modelo "${MODELO_NOMBRE}" no encontrado. Corré primero: node seed.js`);

  const tx = db.transaction(() => {
    db.prepare("UPDATE instituciones SET correlativo_prefijo = ? WHERE id = ? AND (correlativo_prefijo IS NULL OR correlativo_prefijo = '')").run(PREFIJO, institucion.id);

    db.prepare('DELETE FROM clausulas WHERE modelo_id = ?').run(modelo.id);

    const codigos = CLAUSULAS.map((c) => c.codigo);
    db.prepare('UPDATE modelos SET clausulas = ? WHERE id = ?').run(JSON.stringify(codigos), modelo.id);

    const stmt = db.prepare(
      `INSERT INTO clausulas (institucion_id, modelo_id, orden, codigo, titulo, texto_base, variables, obligatoria)
       VALUES (@institucion_id, @modelo_id, @orden, @codigo, @titulo, @texto_base, @variables, @obligatoria)`
    );
    for (const c of CLAUSULAS) {
      stmt.run({
        institucion_id: institucion.id,
        modelo_id: modelo.id,
        orden: c.orden,
        codigo: c.codigo,
        titulo: c.titulo,
        texto_base: c.texto_base,
        variables: JSON.stringify(c.variables),
        obligatoria: c.obligatoria,
      });
    }
  });

  tx();

  console.log('Cláusulas actualizadas:');
  CLAUSULAS.forEach((c) => console.log(`  ${c.orden}. [${c.codigo}] ${c.titulo} (vars: ${c.variables.length})`));
  console.log(`Prefijo correlativo: ${PREFIJO}`);
}

try {
  run();
} catch (err) {
  console.error('seed-clausulas FAILED:', err.message);
  process.exit(1);
}
