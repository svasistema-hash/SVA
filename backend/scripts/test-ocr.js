// Tests del motor OCR de LexDocs (F1 Checkpoint 2).
// Ejecutar: node scripts/test-ocr.js
//
// Cubre:
//   Parser DPI (unit, sin OCR): regex, departamentos, nombre, fechas, lugar.
//   Parser recibo (unit, sin OCR): dirección, compañía.
//   Integración OCR (end-to-end con imágenes sintéticas generadas via sharp):
//     T1 DPI guatemalteco generado → datos correctos
//     T2 imagen sin DPI → confidence/dpi nulo
//     T3 imagen baja resolución → warning
//     T4 consistencia: mismo archivo, 2 pasadas → mismo DPI
//     T5 recibo de servicios generado → extrae dirección

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { parseDPI, extractDPI, DEPARTAMENTOS_VALIDOS } = require('../utils/dpi-parser');
const { parseRecibo } = require('../utils/recibo-parser');
const ocr = require('../utils/ocr');

let pass = 0;
let fail = 0;
const failures = [];

function expect(name, actual, expected, comparator) {
  const ok = comparator ? comparator(actual, expected) : actual === expected;
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push({ name, expected, actual });
    console.log(`  FAIL  ${name}`);
    console.log(`        esperado: ${JSON.stringify(expected)}`);
    console.log(`        actual:   ${JSON.stringify(actual)}`);
  }
}

function expectTruthy(name, actual) {
  if (actual) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push({ name, expected: 'truthy', actual }); console.log(`  FAIL  ${name} (got ${JSON.stringify(actual)})`); }
}

function expectFalsy(name, actual) {
  if (!actual) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push({ name, expected: 'falsy', actual }); console.log(`  FAIL  ${name} (got ${JSON.stringify(actual)})`); }
}

// ───────────────────────────────────────────────────────
// PARSER DPI — unit tests (sin OCR)
// ───────────────────────────────────────────────────────
async function testParserDPI() {
  console.log('\n[1] Parser DPI — unit tests (sin OCR)');

  // Caso 1: DPI bien formado.
  const t1 = parseDPI(`
    REPUBLICA DE GUATEMALA
    DOCUMENTO PERSONAL DE IDENTIFICACION
    PEREZ GARCIA JUAN CARLOS
    CUI 2845 73901 0801
    FECHA DE NACIMIENTO 12/06/1985
    LUGAR DE NACIMIENTO
    Guatemala, Guatemala
  `);
  expect('1.1 DPI formato bien parseado', t1.dpi, '2845 73901 0801');
  expect('1.2 nombre extraído', t1.nombre, 'PEREZ GARCIA JUAN CARLOS');
  expect('1.3 fecha_nac extraída', t1.fecha_nac, '1985-06-12');
  expectTruthy('1.4 lugar_nac no nulo', t1.lugar_nac);
  expect('1.5 departamento extraído (08)', t1.departamento, '08');

  // Caso 2: DPI con separadores raros (guiones).
  const t2 = parseDPI('CUI 1234-56789-0101');
  expect('2.1 DPI con guiones', t2.dpi, '1234 56789 0101');

  // Caso 3: DPI con departamento inválido (99).
  const t3 = parseDPI('algun texto 1234 56789 9999 fin');
  expect('3.1 DPI con depto inválido (99) → null', t3.dpi, null);

  // Caso 4: texto sin DPI.
  const t4 = parseDPI('Esto es un párrafo cualquiera sin números válidos.');
  expect('4.1 sin DPI → null', t4.dpi, null);

  // Caso 5: errores OCR comunes (O→0, I→1).
  const t5 = parseDPI('CUI 2845 7390I 080I'); // I en vez de 1
  expect('5.1 DPI con I→1 corregido por OCR', t5.dpi, '2845 73901 0801');

  // Caso 6: validación departamentos.
  for (let i = 1; i <= 22; i++) {
    const dep = String(i).padStart(2, '0');
    expectTruthy(`6.${i} depto válido ${dep}`, DEPARTAMENTOS_VALIDOS.has(dep));
  }
  expectFalsy('6.23 depto inválido 23', DEPARTAMENTOS_VALIDOS.has('23'));
  expectFalsy('6.99 depto inválido 99', DEPARTAMENTOS_VALIDOS.has('99'));

  // Caso 7: fecha en formato textual.
  const t7 = parseDPI('Nacimiento 15 MAR 1990');
  expect('7.1 fecha textual DD MMM YYYY', t7.fecha_nac, '1990-03-15');
}

// ───────────────────────────────────────────────────────
// PARSER RECIBO — unit tests (sin OCR)
// ───────────────────────────────────────────────────────
async function testParserRecibo() {
  console.log('\n[2] Parser Recibo — unit tests (sin OCR)');

  const t1 = parseRecibo(`
    EEGSA
    EMPRESA ELECTRICA DE GUATEMALA
    Estimado cliente
    Direccion de servicio: 5a calle 3-40 zona 10, Guatemala
    Total a pagar: Q 350.00
  `);
  expectTruthy('1.1 direccion extraída', t1.direccion);
  expect('1.2 compañía detectada', t1.comprobante, 'EEGSA');

  const t2 = parseRecibo(`
    Tigo Hogar
    Servicio en Lote 42, Colonia Vista Hermosa, Mixco, Guatemala
  `);
  expectTruthy('2.1 dirección Tigo extraída', t2.direccion);
  expect('2.2 compañía Tigo', t2.comprobante, 'TIGO');

  const t3 = parseRecibo('texto sin sentido aleatorio');
  expect('3.1 sin info → direccion null', t3.direccion, null);
}

// ───────────────────────────────────────────────────────
// Genera imagen sintética con texto via SVG → PNG (sharp).
// ───────────────────────────────────────────────────────
async function generarImagenTexto(texto, outPath, opts = {}) {
  const { width = 800, height = 500, fontSize = 24, blur = 0 } = opts;
  const lineas = String(texto).split('\n');
  const svgLineas = lineas
    .map((l, i) => `<text x="40" y="${60 + i * (fontSize + 8)}" font-family="Arial" font-size="${fontSize}" fill="black">${escapeXml(l)}</text>`)
    .join('\n');
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="white"/>
      ${svgLineas}
    </svg>`;
  let img = sharp(Buffer.from(svg));
  if (blur > 0) img = img.blur(blur);
  await img.png().toFile(outPath);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ───────────────────────────────────────────────────────
// INTEGRACIÓN OCR — end-to-end
// ───────────────────────────────────────────────────────
async function testOCREndToEnd() {
  console.log('\n[3] Integración OCR (end-to-end con imágenes sintéticas)');
  console.log('  Inicializando worker tesseract (puede tomar unos segundos)...');

  const tmpDir = path.join(__dirname, '..', '..', '.tmp-ocr-test');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  // T1: DPI guatemalteco simulado.
  console.log('\n  T1: DPI guatemalteco sintético');
  const t1Path = path.join(tmpDir, 't1-dpi.png');
  await generarImagenTexto(
    'REPUBLICA DE GUATEMALA\nDOCUMENTO PERSONAL DE IDENTIFICACION\nPEREZ GARCIA JUAN CARLOS\nCUI 2845 73901 0801\nFECHA DE NACIMIENTO 12/06/1985',
    t1Path,
    { fontSize: 28 }
  );
  const r1 = await ocr.recognize(t1Path);
  const p1 = parseDPI(r1.text);
  console.log(`    confidence=${r1.confidence}  dpi=${p1.dpi}  nombre=${p1.nombre}`);
  expectTruthy('T1.1 confidence > 50', r1.confidence > 50);
  expect('T1.2 DPI parseado correctamente', p1.dpi, '2845 73901 0801');
  expectTruthy('T1.3 nombre parseado', p1.nombre && p1.nombre.includes('PEREZ'));

  // T2: imagen sin DPI.
  console.log('\n  T2: imagen sin DPI');
  const t2Path = path.join(tmpDir, 't2-no-dpi.png');
  await generarImagenTexto('Lorem ipsum dolor sit amet\nNada que ver con un documento', t2Path);
  const r2 = await ocr.recognize(t2Path);
  const p2 = parseDPI(r2.text);
  console.log(`    confidence=${r2.confidence}  dpi=${p2.dpi}`);
  expect('T2.1 DPI null cuando no hay DPI', p2.dpi, null);

  // T3: imagen DPI baja resolución (blur + tamaño chico).
  console.log('\n  T3: DPI baja resolución (blur 3, font 14)');
  const t3Path = path.join(tmpDir, 't3-baja-res.png');
  await generarImagenTexto(
    'CUI 5678 12345 0102\nLOPEZ SOTO MARIA',
    t3Path,
    { width: 400, height: 200, fontSize: 14, blur: 3 }
  );
  const r3 = await ocr.recognize(t3Path);
  console.log(`    confidence=${r3.confidence}`);
  expectTruthy('T3.1 confidence baja con blur (< 80)', r3.confidence < 80);

  // T4: consistencia — misma imagen dos veces.
  console.log('\n  T4: consistencia (mismo input → mismo DPI)');
  const r4a = await ocr.recognize(t1Path);
  const p4a = parseDPI(r4a.text);
  const r4b = await ocr.recognize(t1Path);
  const p4b = parseDPI(r4b.text);
  console.log(`    pasada A: dpi=${p4a.dpi} confidence=${r4a.confidence}`);
  console.log(`    pasada B: dpi=${p4b.dpi} confidence=${r4b.confidence}`);
  expect('T4.1 mismo DPI en ambas pasadas', p4a.dpi, p4b.dpi);

  // T5: recibo con dirección.
  console.log('\n  T5: recibo de servicios');
  const t5Path = path.join(tmpDir, 't5-recibo.png');
  await generarImagenTexto(
    'EEGSA\nEMPRESA ELECTRICA DE GUATEMALA\nDIRECCION DE SERVICIO\n5a calle 3-40 zona 10\nGuatemala\nTotal a pagar Q 350.00',
    t5Path,
    { fontSize: 28 }
  );
  const r5 = await ocr.recognize(t5Path);
  const p5 = parseRecibo(r5.text);
  console.log(`    confidence=${r5.confidence}  direccion=${p5.direccion}  comprobante=${p5.comprobante}`);
  expectTruthy('T5.1 confidence > 40', r5.confidence > 40);
  expectTruthy('T5.2 dirección no nula', p5.direccion);
  expectTruthy('T5.3 contiene "zona"', p5.direccion && /zona/i.test(p5.direccion));

  // Limpieza.
  await ocr.terminate();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' F1 Checkpoint 2 — Tests OCR');
  console.log('═══════════════════════════════════════════');

  await testParserDPI();
  await testParserRecibo();
  await testOCREndToEnd();

  console.log('\n═══════════════════════════════════════════');
  console.log(` Resultados: ${pass} PASS  /  ${fail} FAIL`);
  console.log('═══════════════════════════════════════════');
  if (fail > 0) {
    console.log('\nFallas:');
    failures.forEach((f) => console.log(`  - ${f.name}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error fatal en tests:', err);
  process.exit(1);
});
