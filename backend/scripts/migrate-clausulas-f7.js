// hotfix/f1-qa bloque 2 — Reescribe las 9 cláusulas del modelo "Crédito Personal"
// (modelo_id=1, institución Banco RSG) para usar variables del motor F7:
//   cliente_compareciente, banco_compareciente, fecha_contrato_apertura,
//   monto_legal, plazo_legal, cuota_mensual_legal, tasa_*_legal, base_calculo_legal,
//   fecha_inicio_letras, fecha_vencimiento_letras, forma_pago_legal,
//   cliente_articulo, cliente_rol_deudor.
//
// Idempotente: el UPDATE corre siempre con el nuevo texto. No depende del texto previo.

// Permite invocación como módulo (server.js al boot) o como script directo
// (node scripts/migrate-clausulas-f7.js).
const path = require('path');

const MODELO_ID = 1; // Crédito Personal de Banco RSG

const CLAUSULAS_F7 = [
  {
    codigo: 'comparecencia',
    titulo: 'COMPARECENCIA',
    orden: 1,
    obligatoria: 1,
    variables: ['fecha_contrato_apertura', 'banco_compareciente', 'cliente_compareciente', 'cliente_articulo', 'cliente_rol_deudor'],
    texto_base: '{{fecha_contrato_apertura}} comparecen, por una parte, {{banco_compareciente}}, en lo sucesivo denominado «EL ACREEDOR»; y por la otra parte, {{cliente_compareciente}}, en lo sucesivo denominado «{{cliente_articulo}} {{cliente_rol_deudor}}». Ambas partes celebran el presente contrato de mutuo con interés conforme a las cláusulas siguientes.',
  },
  {
    codigo: 'primera-monto',
    titulo: 'Cláusula Primera — Monto y Objeto',
    orden: 2,
    obligatoria: 1,
    variables: ['monto_legal', 'destino', 'forma_desembolso'],
    texto_base: 'EL ACREEDOR otorga a EL DEUDOR un crédito por la cantidad de {{monto_legal}}, destinado a {{destino}}, suma que será entregada mediante {{forma_desembolso}}.',
  },
  {
    codigo: 'segunda-plazo',
    titulo: 'Cláusula Segunda — Plazo',
    orden: 3,
    obligatoria: 1,
    variables: ['plazo_legal', 'fecha_inicio_letras', 'fecha_vencimiento_letras'],
    texto_base: 'El plazo del presente crédito es de {{plazo_legal}}, contados a partir del {{fecha_inicio_letras}} y venciendo el {{fecha_vencimiento_letras}}.',
  },
  {
    codigo: 'tercera-pago',
    titulo: 'Cláusula Tercera — Forma de Pago',
    orden: 4,
    obligatoria: 1,
    variables: ['sistema_amort', 'cuota_mensual_legal', 'dia_pago_inicio', 'dia_pago_fin', 'forma_pago_legal'],
    texto_base: 'EL DEUDOR se obliga a pagar el capital e intereses mediante {{sistema_amort}}, en cuotas mensuales de {{cuota_mensual_legal}}, pagaderas entre el día {{dia_pago_inicio}} y el día {{dia_pago_fin}} de cada mes, mediante {{forma_pago_legal}}.',
  },
  {
    codigo: 'cuarta-intereses',
    titulo: 'Cláusula Cuarta — Intereses',
    orden: 5,
    obligatoria: 1,
    variables: ['tasa_ordinaria_legal', 'base_calculo_legal', 'tasa_moratoria_legal'],
    texto_base: 'EL DEUDOR pagará intereses ordinarios a la tasa del {{tasa_ordinaria_legal}} anual sobre saldos insolutos, calculada sobre base de {{base_calculo_legal}}. En caso de mora se aplicará adicionalmente una tasa moratoria del {{tasa_moratoria_legal}} anual, sin perjuicio del cobro judicial correspondiente.',
  },
  {
    codigo: 'quinta-garantias',
    titulo: 'Cláusula Quinta — Garantías',
    orden: 6,
    obligatoria: 1,
    variables: ['garantias'],
    texto_base: 'Para garantizar el cumplimiento de las obligaciones aquí contraídas, EL DEUDOR constituye a favor de EL ACREEDOR la siguiente garantía: {{garantias}}.',
  },
  {
    codigo: 'sexta-gastos',
    titulo: 'Cláusula Sexta — Gastos y Costas',
    orden: 7,
    obligatoria: 1,
    variables: [],
    texto_base: 'Todos los gastos notariales, timbres fiscales, impuestos, honorarios y costas judiciales que se generen por el otorgamiento, formalización o ejecución del presente contrato serán a cargo exclusivo de EL DEUDOR.',
  },
  {
    codigo: 'septima-incumplimiento',
    titulo: 'Cláusula Séptima — Incumplimiento y Vencimiento Anticipado',
    orden: 8,
    obligatoria: 1,
    variables: ['cuotas_incumplimiento', 'causales_vencimiento', 'via_cobro'],
    texto_base: 'EL ACREEDOR podrá dar por vencido el plazo y exigir el pago inmediato del saldo total adeudado si EL DEUDOR incumpliere el pago de {{cuotas_incumplimiento}} cuotas consecutivas, o incurriere en cualquiera de las siguientes causales: {{causales_vencimiento}}. El cobro se realizará por la vía {{via_cobro}}.',
  },
  {
    codigo: 'octava-disposiciones',
    titulo: 'Cláusula Octava — Disposiciones Generales',
    orden: 9,
    obligatoria: 1,
    variables: [],
    texto_base: 'Las partes se someten expresamente a los Tribunales de Justicia de la República de Guatemala, siendo aplicable el Código de Comercio, Decreto 2-70 del Congreso de la República, y demás leyes aplicables. En fe de lo cual, leído íntegramente el presente contrato, las partes lo aceptan, ratifican y firman.',
  },
];

function run(db) {
  console.log(`[migrate-clausulas-f7] modelo_id=${MODELO_ID}`);
  const existing = db.prepare('SELECT id, codigo FROM clausulas WHERE modelo_id = ?').all(MODELO_ID);

  let updates = 0;
  let inserts = 0;
  const tx = db.transaction(() => {
    for (const c of CLAUSULAS_F7) {
      const prev = existing.find((e) => e.codigo === c.codigo);
      if (prev) {
        db.prepare(`
          UPDATE clausulas
          SET titulo = ?, orden = ?, obligatoria = ?, variables = ?, texto_base = ?
          WHERE id = ?
        `).run(c.titulo, c.orden, c.obligatoria, JSON.stringify(c.variables), c.texto_base, prev.id);
        updates++;
      } else {
        db.prepare(`
          INSERT INTO clausulas (institucion_id, modelo_id, codigo, titulo, orden, obligatoria, variables, texto_base)
          SELECT institucion_id, ?, ?, ?, ?, ?, ?, ?
          FROM modelos WHERE id = ?
        `).run(MODELO_ID, c.codigo, c.titulo, c.orden, c.obligatoria, JSON.stringify(c.variables), c.texto_base, MODELO_ID);
        inserts++;
      }
    }
  });
  tx();

  console.log(`[migrate-clausulas-f7] UPDATE=${updates} INSERT=${inserts}`);
  return { updates, inserts };
}

module.exports = { run };

// Si se invoca directamente con `node scripts/migrate-clausulas-f7.js`,
// abre su propia conexión a la BD.
if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
  const Database = require('better-sqlite3');
  const DB_PATH = path.resolve(__dirname, '..', process.env.DB_PATH || './lexdocs.db');
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  run(db);
  console.log('\n=== Cláusulas finales del modelo ===');
  const finales = db.prepare('SELECT codigo, orden, substr(texto_base, 1, 120) as preview FROM clausulas WHERE modelo_id = ? ORDER BY orden').all(MODELO_ID);
  finales.forEach(f => console.log(`  ${f.orden}. ${f.codigo}: ${f.preview}...`));
  console.log('\n[migrate-clausulas-f7] OK');
  db.close();
}
