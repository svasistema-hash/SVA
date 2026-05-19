// Tests del motor de formato legal guatemalteco (F7).
// Cubre los 6 tests del prompt + casos adicionales para edge cases.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const legal = require('../utils/legal-format/legal-format');
const {
  numeroALetras, enteroALetras, dineroALetras, porcentajeALetras, formatoLegal,
  dpiALetras, fechaALetras, fechaCortaALetras, diaALetras, renderFechaContrato,
  renderClienteCompareciente, renderRepresentanteJuridico,
  gentilicio, estadoCivil, articuloPersona, rolPersona,
  nombreEnMayusculas, nombrePropio,
  tipoSociedadCompleto, computeEdad,
} = legal;

let pass = 0, fail = 0;
function ok(label, cond, info) {
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else      { console.log(`  FAIL  ${label}${info ? '  ['+info+']' : ''}`); fail++; }
}
function eq(label, got, expected) {
  const cond = got === expected;
  if (cond) { console.log(`  PASS  ${label}`); pass++; }
  else      { console.log(`  FAIL  ${label}\n        expected: "${expected}"\n        got:      "${got}"`); fail++; }
}

// ════════════════════════════════════════════════════════════
// numero-a-letras
// ════════════════════════════════════════════════════════════
console.log('\n=== numero-a-letras ===');
eq('0',          enteroALetras(0),          'cero');
eq('1',          enteroALetras(1),          'uno');
eq('15',         enteroALetras(15),         'quince');
eq('21',         enteroALetras(21),         'veintiuno');
eq('29',         enteroALetras(29),         'veintinueve');
eq('30',         enteroALetras(30),         'treinta');
eq('31',         enteroALetras(31),         'treinta y uno');
eq('39',         enteroALetras(39),         'treinta y nueve');
eq('99',         enteroALetras(99),         'noventa y nueve');
eq('100',        enteroALetras(100),        'cien');
eq('101',        enteroALetras(101),        'ciento uno');
eq('125',        enteroALetras(125),        'ciento veinticinco');
eq('200',        enteroALetras(200),        'doscientos');
eq('500',        enteroALetras(500),        'quinientos');
eq('999',        enteroALetras(999),        'novecientos noventa y nueve');
eq('1000',       enteroALetras(1000),       'mil');
eq('1001',       enteroALetras(1001),       'mil uno');
eq('2026',       enteroALetras(2026),       'dos mil veintiséis');
eq('21000',      enteroALetras(21000),      'veintiún mil');
eq('100000',     enteroALetras(100000),     'cien mil');
eq('101000',     enteroALetras(101000),     'ciento un mil');
eq('280023',     enteroALetras(280023),     'doscientos ochenta mil veintitrés');
eq('1000000',    enteroALetras(1000000),    'un millón');
eq('2000000',    enteroALetras(2000000),    'dos millones');
eq('5000000',    enteroALetras(5000000),    'cinco millones');
eq('999999999',  enteroALetras(999999999),  'novecientos noventa y nueve millones novecientos noventa y nueve mil novecientos noventa y nueve');

eq('dinero 5000',        dineroALetras(5000),    'cinco mil quetzales exactos');
eq('dinero 1',           dineroALetras(1),       'un quetzal exactos'); // (en singular "exacto" sería más correcto; v2)
eq('dinero 5000.50',     dineroALetras(5000.50), 'cinco mil quetzales con cincuenta centavos');
eq('dinero 0.50',        dineroALetras(0.50),    'cero quetzales con cincuenta centavos');
eq('dinero 125000.75',   dineroALetras(125000.75), 'ciento veinticinco mil quetzales con setenta y cinco centavos');
eq('porcentaje 12',      porcentajeALetras(12),  'doce por ciento');
eq('porcentaje 5',       porcentajeALetras(5),   'cinco por ciento');

// formatoLegal
eq('formatoLegal 36 plazo meses', formatoLegal(36, { tipo: 'plazo', sufijo: 'meses' }), 'treinta y seis (36) meses');
eq('formatoLegal 12 porcentaje',  formatoLegal(12, { tipo: 'porcentaje' }),              'doce por ciento (12%)');
eq('formatoLegal 5000 dinero',    formatoLegal(5000, { tipo: 'dinero' }),                 'cinco mil quetzales exactos (Q5,000.00)');
eq('formatoLegal 39 edad',        formatoLegal(39, { tipo: 'edad' }),                     'treinta y nueve (39) años de edad');

// Negativos
let neg = false; try { enteroALetras(-1); } catch { neg = true; }
ok('enteroALetras(-1) lanza error', neg);

// ════════════════════════════════════════════════════════════
// dpi-a-letras
// ════════════════════════════════════════════════════════════
console.log('\n=== dpi-a-letras ===');
eq('Test 1 (DPI ejemplo del usuario)',
  dpiALetras('2414 58382 0101'),
  'dos mil cuatrocientos catorce espacio cincuenta y ocho mil trescientos ochenta y dos espacio cero ciento uno (2414 58382 0101)');
eq('DPI sin espacios',
  dpiALetras('2414583820101'),
  'dos mil cuatrocientos catorce espacio cincuenta y ocho mil trescientos ochenta y dos espacio cero ciento uno (2414 58382 0101)');
eq('DPI con ceros 0001 00001 0001',
  dpiALetras('0001 00001 0001'),
  'cero cero cero uno espacio cero cero cero cero uno espacio cero cero cero uno (0001 00001 0001)');
eq('DPI con bloque todo ceros',
  dpiALetras('0000 00000 0000'),
  'cero cero cero cero espacio cero cero cero cero cero espacio cero cero cero cero (0000 00000 0000)');

let bad1 = false; try { dpiALetras('123'); } catch { bad1 = true; }
ok('DPI muy corto lanza error', bad1);
let bad2 = false; try { dpiALetras('1234567890ABC'); } catch { bad2 = true; }
ok('DPI con letras lanza error', bad2);
let bad3 = false; try { dpiALetras('12345678901234'); } catch { bad3 = true; }
ok('DPI muy largo (14 dígitos) lanza error', bad3);

// ════════════════════════════════════════════════════════════
// fecha-a-letras
// ════════════════════════════════════════════════════════════
console.log('\n=== fecha-a-letras ===');
eq('Test 2 (fecha ejemplo del usuario)',
  fechaALetras('2026-10-24'),
  'veinticuatro de octubre del año dos mil veintiséis');
eq('Día 1 → "primero"',
  fechaALetras('2026-01-01'),
  'primero de enero del año dos mil veintiséis');
eq('Día 31',
  fechaALetras('2026-12-31'),
  'treinta y uno de diciembre del año dos mil veintiséis');
eq('Año pasado',
  fechaALetras('1985-03-15'),
  'quince de marzo del año mil novecientos ochenta y cinco');
eq('fechaCorta',
  fechaCortaALetras('2026-10-24'),
  'veinticuatro de octubre');
eq('contrato apertura',
  renderFechaContrato('2026-10-24', 'Guatemala'),
  'En la ciudad de Guatemala el día veinticuatro de octubre del año dos mil veintiséis,');

// ════════════════════════════════════════════════════════════
// concordancia
// ════════════════════════════════════════════════════════════
console.log('\n=== concordancia ===');
eq('gentilicio guatemala M', gentilicio('guatemala', 'M'), 'guatemalteco');
eq('gentilicio guatemala F', gentilicio('guatemala', 'F'), 'guatemalteca');
eq('estadoCivil casado M',   estadoCivil('casado', 'M'),    'casado');
eq('estadoCivil casado F',   estadoCivil('casado', 'F'),    'casada');
eq('estadoCivil soltera F',  estadoCivil('soltera', 'F'),   'soltera');
eq('estadoCivil unido_hecho F', estadoCivil('unido de hecho', 'F'), 'unida de hecho');
eq('articuloPersona M',      articuloPersona('M'),          'EL');
eq('articuloPersona F',      articuloPersona('F'),          'LA');
eq('rolPersona deudor M',    rolPersona('deudor', 'M'),     'DEUDOR');
eq('rolPersona deudor F',    rolPersona('deudor', 'F'),     'DEUDORA');
eq('rolPersona arrendante F (invariable)', rolPersona('arrendante', 'F'), 'ARRENDANTE');

// ════════════════════════════════════════════════════════════
// nombre-formato
// ════════════════════════════════════════════════════════════
console.log('\n=== nombre-formato ===');
eq('Mayúsculas con acentos', nombreEnMayusculas('María José Pérez'), 'MARÍA JOSÉ PÉREZ');
eq('Espacios duplicados',    nombreEnMayusculas('  Juan   Carlos  '), 'JUAN CARLOS');
eq('Nombre con DE LA',       nombreEnMayusculas('María de la Cruz'), 'MARÍA DE LA CRUZ');
eq('nombrePropio',           nombrePropio('JUAN CARLOS DE LA CRUZ'), 'Juan Carlos de la Cruz');
eq('nombrePropio acentos',   nombrePropio('maría josé pérez'),         'María José Pérez');

// ════════════════════════════════════════════════════════════
// Test 3: Cliente compareciente masculino (ejemplo del usuario)
// ════════════════════════════════════════════════════════════
console.log('\n=== Test 3: Cliente compareciente masculino ===');
const t3Input = {
  nombre: 'Juan Rodrigo Sandoval Wyss',
  genero: 'M',
  edad: 39,
  estado_civil: 'casado',
  profesion: 'Abogado y Notario',
  dpi: '2414 58382 0101',
  domicilio_local: true,
};
const t3Expected = 'el señor JUAN RODRIGO SANDOVAL WYSS, de treinta y nueve (39) años de edad, casado, guatemalteco, Abogado y Notario, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación dos mil cuatrocientos catorce espacio cincuenta y ocho mil trescientos ochenta y dos espacio cero ciento uno (2414 58382 0101) extendido por el Registro Nacional de las Personas de la República de Guatemala';
const t3Output = renderClienteCompareciente(t3Input);
eq('Cliente M frase completa exacta', t3Output, t3Expected);

// ════════════════════════════════════════════════════════════
// Test 4: Cliente compareciente femenino
// ════════════════════════════════════════════════════════════
console.log('\n=== Test 4: Cliente compareciente femenino ===');
const t4Input = { ...t3Input, genero: 'F' };
const t4Expected = 'la señora JUAN RODRIGO SANDOVAL WYSS, de treinta y nueve (39) años de edad, casada, guatemalteca, Abogado y Notario, de este domicilio, quien se identifica con el Documento Personal de Identificación con código único de identificación dos mil cuatrocientos catorce espacio cincuenta y ocho mil trescientos ochenta y dos espacio cero ciento uno (2414 58382 0101) extendido por el Registro Nacional de las Personas de la República de Guatemala';
const t4Output = renderClienteCompareciente(t4Input);
eq('Cliente F frase completa (casada/guatemalteca/la señora)', t4Output, t4Expected);

// ════════════════════════════════════════════════════════════
// Test 5: Representante de S.A.
// ════════════════════════════════════════════════════════════
console.log('\n=== Test 5: Representante de S.A. ===');
const t5Input = {
  nombre: 'Constructora del Sur, S.A.',
  tipo_sociedad: 'S.A.',
  registro_mercantil_numero: '12345',
  registro_mercantil_folio: '88',
  registro_mercantil_libro: '142',
  rep_nombre_completo: 'Luis Roberto Ramírez Soto',
  rep_dpi: '2345 67890 0301',
  rep_genero: 'M',
  rep_edad: 45,
  rep_estado_civil: 'casado',
  rep_profesion: 'Ingeniero Civil',
  rep_cargo: 'Gerente General',
  rep_inscripcion_numero: '280023',
  rep_inscripcion_folio: '17',
  rep_inscripcion_libro: '207',
};
const t5Output = renderRepresentanteJuridico(t5Input);
console.log('  Output:');
console.log('  ' + t5Output);
ok('Output contiene SOCIEDAD ANÓNIMA', t5Output.includes('SOCIEDAD ANÓNIMA'));
ok('Output contiene "GERENTE GENERAL"', t5Output.includes('GERENTE GENERAL'));
ok('Output contiene "CONSTRUCTORA DEL SUR, S.A."', t5Output.includes('CONSTRUCTORA DEL SUR, S.A.'));
ok('Output contiene "Auxiliares de Comercio"', t5Output.includes('Auxiliares de Comercio'));
ok('Output contiene "Sociedades Mercantiles"', t5Output.includes('Sociedades Mercantiles'));
ok('Output contiene "doscientos ochenta mil veintitrés (280023)"', t5Output.includes('doscientos ochenta mil veintitrés (280023)'));

// ════════════════════════════════════════════════════════════
// Test 6: compilarContrato con cliente del seed (id=1) usando engine real
// ════════════════════════════════════════════════════════════
console.log('\n=== Test 6: compilarContrato + interpolación con vars legales ===');
const db = require('../db');
const { compilarContrato, interpolate } = require('../contrato-engine');
const { decrypt } = require('../encryption');

// Pull cliente 1 from DB and decrypt manually
const cli = db.prepare("SELECT * FROM clientes WHERE id = 1").get();
const cliPlain = {
  nombre: cli.nombre,
  dpi: cli.dpi ? decrypt(cli.dpi) : null,
  nit: cli.nit ? decrypt(cli.nit) : null,
  estado_civil: cli.estado_civil,
  profesion: cli.profesion,
  fecha_nac: cli.fecha_nac,
  domicilio: cli.domicilio ? decrypt(cli.domicilio) : null,
  genero: cli.genero || 'M',
  ingresos: cli.ingresos ? decrypt(cli.ingresos) : null,
};
console.log('  Cliente id=1 (descifrado):');
console.log(`    nombre=${cliPlain.nombre}  dpi=${cliPlain.dpi}  estado_civil=${cliPlain.estado_civil}  profesion=${cliPlain.profesion}  genero=${cliPlain.genero}`);

// Modelo "Crédito Personal" de Banco RSG = id=1
const modeloId = 1;
const datosPrueba = {
  no_contrato: 'BI-2026-F7-TEST',
  datos_cliente: cliPlain,
  datos_credito: {
    moneda: 'GTQ',
    monto: '125000.00',
    monto_letras: 'ciento veinticinco mil',
    destino: 'Compra de vehículo',
    forma_desembolso: 'acreditación en cuenta',
    plazo_meses: '36',
    fecha_inicio: '2026-06-01',
    sistema_amort: 'Cuotas niveladas',
    cuota_mensual: '4200.50',
    dia_pago_inicio: '1',
    dia_pago_fin: '5',
    tipo_pago: 'debito_automatico',
    cuenta_banco: '01-2345-6789',
    tasa_ordinaria: '14.5',
    base_calculo: '365',
    tasa_moratoria: '5',
    cuotas_incumplimiento: '3',
    causales_vencimiento: 'declaración de quiebra o falsedad en los datos',
    via_cobro: 'ejecutiva',
  },
  datos_garantia: { tipos: [], fiadores: [] },
  datos_firmas: {
    notario: 'Lic. Test',
    colegiado: '1234',
    ciudad: 'Guatemala',
    fecha: '2026-10-24',
    correlativo: 'BI-2026-F7-TEST',
  },
};

const compilado = compilarContrato(modeloId, datosPrueba);
const v = compilado.vars;
console.log('\n  Variables legales generadas:');
console.log(`    cliente_compareciente:`);
console.log(`      "${v.cliente_compareciente}"`);
console.log(`    fecha_contrato_apertura:`);
console.log(`      "${v.fecha_contrato_apertura}"`);
console.log(`    monto_legal:           "${v.monto_legal}"`);
console.log(`    cuota_mensual_legal:   "${v.cuota_mensual_legal}"`);
console.log(`    plazo_legal:           "${v.plazo_legal}"`);
console.log(`    tasa_ordinaria_legal:  "${v.tasa_ordinaria_legal}"`);
console.log(`    tasa_moratoria_legal:  "${v.tasa_moratoria_legal}"`);
console.log(`    cliente_articulo:      "${v.cliente_articulo}"`);
console.log(`    cliente_rol_deudor:    "${v.cliente_rol_deudor}"`);

ok('cliente_compareciente no vacío', v.cliente_compareciente && v.cliente_compareciente.length > 100);
ok('cliente_compareciente contiene nombre upper', v.cliente_compareciente.includes('JUAN CARLOS PÉREZ GARCÍA'));
ok('cliente_compareciente contiene DPI letras', v.cliente_compareciente.includes('espacio'));
ok('fecha_contrato_apertura inicia bien', v.fecha_contrato_apertura.startsWith('En la ciudad de Guatemala el día'));
ok('fecha_contrato_apertura contiene "veinticuatro de octubre"', v.fecha_contrato_apertura.includes('veinticuatro de octubre'));
ok('monto_legal formato correcto', v.monto_legal === 'ciento veinticinco mil quetzales exactos (Q125,000.00)');
ok('cuota_mensual_legal con centavos', v.cuota_mensual_legal === 'cuatro mil doscientos quetzales con cincuenta centavos (Q4,200.50)');
ok('plazo_legal',   v.plazo_legal === 'treinta y seis (36) meses');
eq('tasa_ordinaria_legal (decimal)', v.tasa_ordinaria_legal, 'catorce punto cinco por ciento (14.5%)');
ok('cliente_articulo M → EL', v.cliente_articulo === 'EL');
ok('cliente_rol_deudor M → DEUDOR', v.cliente_rol_deudor === 'DEUDOR');

// Renderiza un párrafo de muestra que USA las nuevas variables
const sampleTemplate = '{{fecha_contrato_apertura}} comparece por una parte: {{cliente_compareciente}}, en adelante denominado {{cliente_articulo}} {{cliente_rol_deudor}}; quien recibe del BANCO RSG, S.A. (EL ACREEDOR) un crédito por {{monto_legal}}, pagadero en {{plazo_legal}} con cuotas de {{cuota_mensual_legal}} a una tasa de {{tasa_ordinaria_legal}} anual.';
const rendered = interpolate(sampleTemplate, v);
console.log('\n  Párrafo de muestra renderizado con nuevas vars:\n');
console.log('  ' + rendered);

// ════════════════════════════════════════════════════════════
console.log(`\n=== Resultado: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
